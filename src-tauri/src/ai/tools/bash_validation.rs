/*! Bash 命令验证模块
 *
 * 提供多层安全验证管道，确保 bash 命令执行安全。
 * 参考 claw-code 的 bash_validation.rs 设计。
 */

use std::path::Path;
use super::types::PermissionMode;

/// 验证结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationResult {
    /// 允许执行
    Allow,
    /// 阻止执行
    Block { reason: String },
    /// 警告（需要确认）
    Warn { message: String },
}

impl ValidationResult {
    /// 是否允许执行
    pub fn is_allowed(&self) -> bool {
        matches!(self, Self::Allow)
    }

    /// 是否需要阻止
    pub fn is_blocked(&self) -> bool {
        matches!(self, Self::Block { .. })
    }

    /// 是否需要警告
    pub fn is_warn(&self) -> bool {
        matches!(self, Self::Warn { .. })
    }
}

/// 命令意图分类
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandIntent {
    /// 只读操作（ls, cat, grep, find...）
    ReadOnly,
    /// 写入操作（cp, mv, mkdir, touch...）
    Write,
    /// 破坏性操作（rm -rf, shred, dd...）
    Destructive,
    /// 网络操作（curl, wget, ssh, nc...）
    Network,
    /// 进程管理（kill, pkill...）
    ProcessManagement,
    /// 包管理（apt, npm, pip...）
    PackageManagement,
    /// 系统管理（sudo, mount, systemctl...）
    SystemAdmin,
    /// 未知/其他
    Unknown,
}

impl CommandIntent {
    /// 获取所需的权限级别
    pub fn required_permission(&self) -> PermissionMode {
        match self {
            Self::ReadOnly => PermissionMode::ReadOnly,
            Self::Write => PermissionMode::WorkspaceWrite,
            Self::Destructive | Self::Network | Self::ProcessManagement
            | Self::PackageManagement | Self::SystemAdmin | Self::Unknown => {
                PermissionMode::DangerFullAccess
            }
        }
    }
}

/// ReadOnly 模式允许的命令白名单
const READ_ONLY_COMMANDS: &[&str] = &[
    "ls", "cat", "head", "tail", "less", "more",
    "wc", "sort", "uniq", "grep", "find", "which",
    "file", "stat", "du", "df", "pwd", "tree",
    "diff", "md5sum", "sha256sum", "jq", "yq",
    "echo", "printf", "basename", "dirname",
    "realpath", "readlink", "lsblk", "lscpu",
    "env", "printenv", "whoami", "id", "date",
    "uptime", "uname", "hostname", "pwdx",
];

/// Git 命令白名单（ReadOnly 模式）
const GIT_READ_ONLY_SUBCOMMANDS: &[&str] = &[
    "status", "log", "diff", "show", "branch", "tag",
    "stash", "ls-files", "cat-file", "rev-parse",
    "describe", "for-each-ref", "remote", "config",
];

/// 永久阻止的危险命令模式
const BLOCKED_PATTERNS: &[&str] = &[
    // 根目录删除
    "rm -rf /",
    "rm -rf /*",
    // home 目录删除
    "rm -rf ~",
    "rm -rf ~/",
    "rm -rf $HOME",
    // fork bomb
    ":(){ :|:& };:",
    // 文件系统格式化
    "mkfs",
    "dd if=",
    // 系统关键文件
    "/dev/sda",
    "/dev/nvme",
    // 权限全开
    "chmod -R 777 /",
    "chmod 777 /",
];

/// 需要警告确认的危险模式
const WARN_PATTERNS: &[&str] = &[
    // 当前目录删除
    "rm -rf *",
    "rm -rf .",
    // 数据擦除
    "shred",
    // 系统路径写入
    "/etc/",
    "/usr/",
    "/bin/",
    "/sbin/",
    // 网络下载执行
    "curl | sh",
    "curl | bash",
    "wget | sh",
    "wget | bash",
];

/// 写入操作命令
const WRITE_COMMANDS: &[&str] = &[
    "cp", "mv", "mkdir", "touch", "tee",
    "truncate", "ln", "unlink",
];

/// 破坏性操作命令
const DESTRUCTIVE_COMMANDS: &[&str] = &[
    "rm", "rmdir", "shred", "dd",
];

/// 网络操作命令
const NETWORK_COMMANDS: &[&str] = &[
    "curl", "wget", "ssh", "scp", "rsync",
    "nc", "netcat", "telnet", "ftp",
];

/// 进程管理命令
const PROCESS_COMMANDS: &[&str] = &[
    "kill", "pkill", "killall", "xkill",
];

/// 包管理命令
const PACKAGE_COMMANDS: &[&str] = &[
    "apt", "apt-get", "aptitude", "dpkg",
    "npm", "yarn", "pnpm",
    "pip", "pip3", "conda",
    "cargo", "rustup",
    "brew", "choco",
];

/// 系统管理命令
const SYSTEM_COMMANDS: &[&str] = &[
    "sudo", "su", "doas",
    "mount", "umount",
    "systemctl", "service",
    "iptables", "ufw",
    "useradd", "userdel", "usermod",
    "groupadd", "groupdel",
];

/// 分析命令意图
pub fn analyze_command_intent(command: &str) -> CommandIntent {
    // 获取命令的第一个词（程序名）
    let first_word = command
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("");

    // 处理 git 命令
    if first_word == "git" {
        // 获取子命令
        let subcommand = command
            .trim()
            .split_whitespace()
            .nth(1)
            .unwrap_or("");

        // 检查是否是只读子命令
        if GIT_READ_ONLY_SUBCOMMANDS.contains(&subcommand) {
            return CommandIntent::ReadOnly;
        }

        // git push/commit/checkout 等是写入操作
        return CommandIntent::Write;
    }

    // 检查命令分类
    if READ_ONLY_COMMANDS.contains(&first_word) {
        return CommandIntent::ReadOnly;
    }

    if WRITE_COMMANDS.contains(&first_word) {
        return CommandIntent::Write;
    }

    if DESTRUCTIVE_COMMANDS.contains(&first_word) {
        // rm 不带 -rf 可能只是删除单个文件
        if first_word == "rm" && !command.contains("-rf") && !command.contains("-fr") {
            return CommandIntent::Write;
        }
        return CommandIntent::Destructive;
    }

    if NETWORK_COMMANDS.contains(&first_word) {
        return CommandIntent::Network;
    }

    if PROCESS_COMMANDS.contains(&first_word) {
        return CommandIntent::ProcessManagement;
    }

    if PACKAGE_COMMANDS.contains(&first_word) {
        return CommandIntent::PackageManagement;
    }

    if SYSTEM_COMMANDS.contains(&first_word) {
        return CommandIntent::SystemAdmin;
    }

    CommandIntent::Unknown
}

/// 验证命令是否在权限模式下允许
pub fn validate_mode(command: &str, mode: PermissionMode) -> ValidationResult {
    let intent = analyze_command_intent(command);
    let required = intent.required_permission();

    // DangerFullAccess 模式允许所有命令
    if mode == PermissionMode::DangerFullAccess {
        return ValidationResult::Allow;
    }

    // WorkspaceWrite 模式允许 ReadOnly 和 Write
    if mode == PermissionMode::WorkspaceWrite {
        if intent == CommandIntent::ReadOnly || intent == CommandIntent::Write {
            return ValidationResult::Allow;
        }
        return ValidationResult::Block {
            reason: format!(
                "权限不足: {} 命令需要 {} 权限，当前为 {}",
                command,
                required.display_name(),
                mode.display_name()
            ),
        };
    }

    // ReadOnly 模式只允许 ReadOnly
    if mode == PermissionMode::ReadOnly {
        if intent == CommandIntent::ReadOnly {
            return ValidationResult::Allow;
        }
        return ValidationResult::Block {
            reason: format!(
                "权限不足: {} 命令需要 {} 权限，当前为 {}",
                command,
                required.display_name(),
                mode.display_name()
            ),
        };
    }

    ValidationResult::Allow
}

/// 检查是否是永久阻止的危险命令
pub fn check_destructive(command: &str) -> ValidationResult {
    for pattern in BLOCKED_PATTERNS {
        if command.contains(pattern) {
            return ValidationResult::Block {
                reason: format!("危险命令: {}", pattern),
            };
        }
    }

    // 检查 rm -rf 保护的路径
    if command.contains("rm -rf") || command.contains("rm -fr") {
        // 检查是否删除重要系统路径
        let protected_paths = ["/etc", "/usr", "/bin", "/sbin", "/lib", "/root"];
        for path in protected_paths {
            if command.contains(path) {
                return ValidationResult::Block {
                    reason: format!("禁止删除系统路径: {}", path),
                };
            }
        }
    }

    ValidationResult::Allow
}

/// 检查是否是需要警告的命令
pub fn check_warnings(command: &str) -> ValidationResult {
    for pattern in WARN_PATTERNS {
        if command.contains(pattern) {
            return ValidationResult::Warn {
                message: format!("警告: 命令包含危险模式 '{}'", pattern),
            };
        }
    }

    ValidationResult::Allow
}

/// 验证路径是否在工作区内
pub fn validate_paths(command: &str, work_dir: &Path) -> ValidationResult {
    // 检查目录遍历
    if command.contains("../") {
        return ValidationResult::Warn {
            message: "警告: 命令包含目录遍历模式 '../'，请确认目标在工作区内".to_string(),
        };
    }

    // 检查 home 目录引用
    if command.contains("~/") || command.contains("$HOME") {
        return ValidationResult::Warn {
            message: "警告: 命令引用 home 目录，请确认在工作区范围内".to_string(),
        };
    }

    // 检查系统路径（非 DangerFullAccess 模式）
    let system_paths = ["/etc/", "/usr/", "/bin/", "/sbin/", "/lib/", "/root/"];
    for path in system_paths {
        if command.contains(path) {
            return ValidationResult::Warn {
                message: format!("警告: 命令引用系统路径 '{}'，需要完全访问权限", path),
            };
        }
    }

    ValidationResult::Allow
}

/// 验证特殊命令（如 sed -i）
pub fn validate_special_commands(command: &str) -> ValidationResult {
    // 检查 sed -i（原地修改文件）
    if command.contains("sed") && command.contains("-i") {
        // sed -i 是写入操作，需要 WorkspaceWrite 权限
        return ValidationResult::Warn {
            message: "警告: sed -i 会原地修改文件，请确认目标文件在工作区内".to_string(),
        };
    }

    // 检查重定向到文件
    if command.contains(">") || command.contains(">>") {
        // 检查是否重定向到系统路径
        let parts: Vec<&str> = command.split(|c| c == '>' || c == ' ').collect();
        for part in parts {
            if part.starts_with("/etc/") || part.starts_with("/usr/")
                || part.starts_with("/bin/") || part.starts_with("/sbin/")
            {
                return ValidationResult::Block {
                    reason: format!("禁止写入系统路径: {}", part),
                };
            }
        }
    }

    ValidationResult::Allow
}

/// 完整验证管道
///
/// 按顺序执行所有验证步骤：
/// 1. 模式验证（权限级别）
/// 2. 危险命令检测（永久阻止）
/// 3. 警告检测（需要确认）
/// 4. 路径验证（工作区范围）
/// 5. 特殊命令验证（sed -i 等）
pub fn validate_command(command: &str, mode: PermissionMode, work_dir: &Path) -> ValidationResult {
    // 1. 模式验证
    let result = validate_mode(command, mode);
    if !result.is_allowed() {
        return result;
    }

    // 2. 危险命令检测
    let result = check_destructive(command);
    if !result.is_allowed() {
        return result;
    }

    // 3. 警告检测
    let result = check_warnings(command);
    if !result.is_allowed() {
        return result;
    }

    // 4. 路径验证
    let result = validate_paths(command, work_dir);
    if !result.is_allowed() {
        return result;
    }

    // 5. 特殊命令验证
    let result = validate_special_commands(command);
    if !result.is_allowed() {
        return result;
    }

    ValidationResult::Allow
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_result() {
        assert!(ValidationResult::Allow.is_allowed());
        assert!(!ValidationResult::Allow.is_blocked());
        assert!(!ValidationResult::Allow.is_warn());

        let block = ValidationResult::Block { reason: "test".to_string() };
        assert!(block.is_blocked());
        assert!(!block.is_allowed());

        let warn = ValidationResult::Warn { message: "test".to_string() };
        assert!(warn.is_warn());
        assert!(!warn.is_allowed());
    }

    #[test]
    fn test_analyze_command_intent() {
        // ReadOnly 命令
        assert_eq!(analyze_command_intent("ls -la"), CommandIntent::ReadOnly);
        assert_eq!(analyze_command_intent("cat file.txt"), CommandIntent::ReadOnly);
        assert_eq!(analyze_command_intent("grep pattern file"), CommandIntent::ReadOnly);

        // Git ReadOnly 子命令
        assert_eq!(analyze_command_intent("git status"), CommandIntent::ReadOnly);
        assert_eq!(analyze_command_intent("git log"), CommandIntent::ReadOnly);
        assert_eq!(analyze_command_intent("git diff"), CommandIntent::ReadOnly);

        // Write 命令
        assert_eq!(analyze_command_intent("mkdir dir"), CommandIntent::Write);
        assert_eq!(analyze_command_intent("cp src dest"), CommandIntent::Write);
        assert_eq!(analyze_command_intent("git commit"), CommandIntent::Write);

        // Destructive 命令
        assert_eq!(analyze_command_intent("rm -rf dir"), CommandIntent::Destructive);
        assert_eq!(analyze_command_intent("shred file"), CommandIntent::Destructive);

        // Network 命令
        assert_eq!(analyze_command_intent("curl url"), CommandIntent::Network);
        assert_eq!(analyze_command_intent("wget url"), CommandIntent::Network);

        // Process 命令
        assert_eq!(analyze_command_intent("kill 1234"), CommandIntent::ProcessManagement);

        // Package 命令
        assert_eq!(analyze_command_intent("npm install"), CommandIntent::PackageManagement);

        // System 命令
        assert_eq!(analyze_command_intent("sudo cmd"), CommandIntent::SystemAdmin);
    }

    #[test]
    fn test_validate_mode_read_only() {
        let mode = PermissionMode::ReadOnly;

        // 允许 ReadOnly 命令
        assert!(validate_mode("ls -la", mode).is_allowed());
        assert!(validate_mode("cat file", mode).is_allowed());
        assert!(validate_mode("git status", mode).is_allowed());

        // 阻止 Write 命令
        assert!(validate_mode("mkdir dir", mode).is_blocked());
        assert!(validate_mode("rm file", mode).is_blocked());

        // 阻止 Destructive 命令
        assert!(validate_mode("rm -rf dir", mode).is_blocked());
    }

    #[test]
    fn test_validate_mode_workspace_write() {
        let mode = PermissionMode::WorkspaceWrite;

        // 允许 ReadOnly 命令
        assert!(validate_mode("ls -la", mode).is_allowed());

        // 允许 Write 命令
        assert!(validate_mode("mkdir dir", mode).is_allowed());
        assert!(validate_mode("rm file", mode).is_allowed());

        // 阻止 Destructive 命令（rm -rf）
        assert!(validate_mode("rm -rf dir", mode).is_blocked());

        // 阻止 Network/System 命令
        assert!(validate_mode("curl url", mode).is_blocked());
        assert!(validate_mode("sudo cmd", mode).is_blocked());
    }

    #[test]
    fn test_validate_mode_danger_full_access() {
        let mode = PermissionMode::DangerFullAccess;

        // 允许所有命令（通过模式验证）
        assert!(validate_mode("ls -la", mode).is_allowed());
        assert!(validate_mode("rm -rf dir", mode).is_allowed());
        assert!(validate_mode("curl url", mode).is_allowed());
        assert!(validate_mode("sudo cmd", mode).is_allowed());
    }

    #[test]
    fn test_check_destructive() {
        // 永久阻止的危险命令
        assert!(check_destructive("rm -rf /").is_blocked());
        assert!(check_destructive("rm -rf ~").is_blocked());
        assert!(check_destructive(":(){ :|:& };:").is_blocked());
        assert!(check_destructive("mkfs /dev/sda").is_blocked());

        // 允许普通命令
        assert!(check_destructive("ls -la").is_allowed());
        assert!(check_destructive("rm file").is_allowed());

        // 阻止删除系统路径
        assert!(check_destructive("rm -rf /etc").is_blocked());
        assert!(check_destructive("rm -rf /usr").is_blocked());
    }

    #[test]
    fn test_check_warnings() {
        // 需要警告的命令
        assert!(check_warnings("rm -rf *").is_warn());
        assert!(check_warnings("curl | sh").is_warn());
        assert!(check_warnings("shred file").is_warn());

        // 允许普通命令
        assert!(check_warnings("ls -la").is_allowed());
    }

    #[test]
    fn test_validate_paths() {
        let work_dir = Path::new("/workspace");

        // 警告目录遍历
        assert!(validate_paths("cat ../file", work_dir).is_warn());

        // 警告 home 目录
        assert!(validate_paths("cat ~/file", work_dir).is_warn());
        assert!(validate_paths("cat $HOME/file", work_dir).is_warn());

        // 警告系统路径
        assert!(validate_paths("cat /etc/passwd", work_dir).is_warn());

        // 允许普通路径
        assert!(validate_paths("cat file", work_dir).is_allowed());
    }

    #[test]
    fn test_validate_special_commands() {
        // 警告 sed -i
        assert!(validate_special_commands("sed -i 's/old/new/g' file").is_warn());

        // 阻止重定向到系统路径
        assert!(validate_special_commands("echo data > /etc/file").is_blocked());

        // 允许普通重定向
        assert!(validate_special_commands("echo data > file").is_allowed());
    }

    #[test]
    fn test_validate_command_full_pipeline() {
        let work_dir = Path::new("/workspace");

        // ReadOnly 模式
        let mode = PermissionMode::ReadOnly;

        // 允许：ReadOnly 命令 + 无危险 + 无警告
        assert!(validate_command("ls -la", mode, work_dir).is_allowed());
        assert!(validate_command("git status", mode, work_dir).is_allowed());

        // 阻止：Write 命令
        assert!(validate_command("mkdir dir", mode, work_dir).is_blocked());

        // 阻止：危险命令
        assert!(validate_command("rm -rf /", mode, work_dir).is_blocked());

        // DangerFullAccess 模式
        let full_mode = PermissionMode::DangerFullAccess;

        // 允许所有（通过模式验证），但危险命令仍被阻止
        assert!(validate_command("ls -la", full_mode, work_dir).is_allowed());
        assert!(validate_command("rm -rf /", full_mode, work_dir).is_blocked());
    }
}