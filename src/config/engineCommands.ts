/**
 * 引擎命令配置数据
 *
 * 定义各引擎支持的命令行选项，用于可视化配置界面
 */

import type { EngineCommandsConfig } from '../types/engineCommand'

/**
 * Claude Code 引擎命令配置
 */
export const claudeCodeCommands: EngineCommandsConfig = {
  engineId: 'claude-code',
  engineName: 'Claude Code',
  categories: [
    {
      id: 'model',
      name: '模型设置',
      icon: 'Model',
      description: '配置 AI 模型相关选项',
      options: [
        {
          id: 'model',
          cliFlag: '--model',
          shortFlag: '-m',
          name: '模型选择',
          description: '指定使用的 AI 模型',
          type: 'select',
          options: [
            { value: 'sonnet', label: 'Claude Sonnet 4.6', description: '最新 Sonnet 模型，性能均衡' },
            { value: 'opus', label: 'Claude Opus 4.6', description: '最强推理能力' },
            { value: 'haiku', label: 'Claude Haiku 4.5', description: '快速响应，适合简单任务' },
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (完整ID)', description: '指定完整模型 ID' },
          ],
          placeholder: '选择模型',
        },
        {
          id: 'effort',
          cliFlag: '--effort',
          name: '努力级别',
          description: '控制 AI 的努力程度，影响响应质量和速度',
          type: 'select',
          options: [
            { value: 'low', label: '低', description: '快速响应，适合简单任务' },
            { value: 'medium', label: '中', description: '平衡质量和速度' },
            { value: 'high', label: '高', description: '更深入的思考' },
            { value: 'max', label: '最高', description: '最大化推理能力' },
          ],
        },
        {
          id: 'agent',
          cliFlag: '--agent',
          name: '代理选择',
          description: '指定使用的代理配置',
          type: 'string',
          placeholder: '代理名称或配置',
        },
      ],
    },
    {
      id: 'permission',
      name: '权限控制',
      icon: 'Shield',
      description: '配置工具执行权限',
      options: [
        {
          id: 'permission-mode',
          cliFlag: '--permission-mode',
          name: '权限模式',
          description: '控制工具执行的权限检查方式',
          type: 'select',
          options: [
            { value: 'default', label: '默认', description: '标准权限检查' },
            { value: 'acceptEdits', label: '接受编辑', description: '自动接受文件编辑' },
            { value: 'plan', label: '计划模式', description: '仅规划不执行' },
            { value: 'auto', label: '自动', description: '自动决策' },
            { value: 'dontAsk', label: '不询问', description: '减少确认提示' },
            { value: 'bypassPermissions', label: '绕过权限', description: '跳过所有权限检查（危险）' },
          ],
          dangerous: true,
          dangerWarning: '绕过权限检查可能导致意外操作，请谨慎使用',
        },
        {
          id: 'dangerously-skip-permissions',
          cliFlag: '--dangerously-skip-permissions',
          name: '跳过权限检查',
          description: '绕过所有权限检查（仅限沙箱环境）',
          type: 'boolean',
          dangerous: true,
          dangerWarning: '此选项会跳过所有安全检查，仅建议在无网络访问的沙箱环境中使用',
        },
        {
          id: 'allowedTools',
          cliFlag: '--allowedTools',
          name: '允许的工具',
          description: '指定允许使用的工具列表',
          type: 'string',
          placeholder: 'Bash(git:*) Edit',
        },
        {
          id: 'disallowedTools',
          cliFlag: '--disallowedTools',
          name: '禁止的工具',
          description: '指定禁止使用的工具列表',
          type: 'string',
          placeholder: 'Bash(rm:*)',
        },
      ],
    },
    {
      id: 'tools',
      name: '工具配置',
      icon: 'Tools',
      description: '配置可用工具',
      options: [
        {
          id: 'tools',
          cliFlag: '--tools',
          name: '工具列表',
          description: '指定可用的内置工具',
          type: 'multiselect',
          options: [
            { value: 'default', label: '默认工具', description: '使用所有内置工具' },
            { value: 'Bash', label: 'Bash', description: '执行 Shell 命令' },
            { value: 'Edit', label: 'Edit', description: '编辑文件' },
            { value: 'Read', label: 'Read', description: '读取文件' },
            { value: 'Write', label: 'Write', description: '写入文件' },
            { value: 'Glob', label: 'Glob', description: '文件模式匹配' },
            { value: 'Grep', label: 'Grep', description: '内容搜索' },
          ],
        },
        {
          id: 'mcp-config',
          cliFlag: '--mcp-config',
          name: 'MCP 配置',
          description: '加载 MCP 服务器配置文件',
          type: 'string',
          placeholder: '配置文件路径或 JSON 字符串',
        },
        {
          id: 'chrome',
          cliFlag: '--chrome',
          name: 'Chrome 集成',
          description: '启用 Claude in Chrome 浏览器集成',
          type: 'boolean',
        },
      ],
    },
    {
      id: 'session',
      name: '会话管理',
      icon: 'Session',
      description: '会话恢复和继续选项',
      options: [
        {
          id: 'continue',
          cliFlag: '--continue',
          shortFlag: '-c',
          name: '继续会话',
          description: '继续当前目录的最近会话',
          type: 'boolean',
        },
        {
          id: 'resume',
          cliFlag: '--resume',
          shortFlag: '-r',
          name: '恢复会话',
          description: '按 ID 恢复特定会话',
          type: 'string',
          placeholder: '会话 ID',
        },
        {
          id: 'fork-session',
          cliFlag: '--fork-session',
          name: '分叉会话',
          description: '创建新会话 ID 而非复用原始会话',
          type: 'boolean',
        },
        {
          id: 'from-pr',
          cliFlag: '--from-pr',
          name: '从 PR 恢复',
          description: '从 PR 恢复会话',
          type: 'string',
          placeholder: 'PR 编号或 URL',
        },
      ],
    },
    {
      id: 'worktree',
      name: '工作树',
      icon: 'GitBranch',
      description: 'Git worktree 相关选项',
      options: [
        {
          id: 'worktree',
          cliFlag: '--worktree',
          shortFlag: '-w',
          name: '创建工作树',
          description: '为会话创建新的 git worktree',
          type: 'string',
          placeholder: 'worktree 名称（可选）',
        },
        {
          id: 'tmux',
          cliFlag: '--tmux',
          name: 'Tmux 会话',
          description: '为 worktree 创建 tmux 会话',
          type: 'boolean',
        },
        {
          id: 'add-dir',
          cliFlag: '--add-dir',
          name: '添加目录',
          description: '允许工具访问的额外目录',
          type: 'string',
          placeholder: '目录路径',
        },
      ],
    },
    {
      id: 'output',
      name: '输出控制',
      icon: 'Output',
      description: '控制输出格式和行为',
      options: [
        {
          id: 'print',
          cliFlag: '--print',
          shortFlag: '-p',
          name: '打印模式',
          description: '非交互模式，打印响应后退出',
          type: 'boolean',
        },
        {
          id: 'output-format',
          cliFlag: '--output-format',
          name: '输出格式',
          description: '指定输出格式（需配合 --print）',
          type: 'select',
          options: [
            { value: 'text', label: '文本', description: '纯文本输出' },
            { value: 'json', label: 'JSON', description: '单条 JSON 结果' },
            { value: 'stream-json', label: '流式 JSON', description: '实时流式 JSON 输出' },
          ],
        },
        {
          id: 'verbose',
          cliFlag: '--verbose',
          name: '详细输出',
          description: '显示详细日志信息',
          type: 'boolean',
        },
        {
          id: 'debug',
          cliFlag: '--debug',
          shortFlag: '-d',
          name: '调试模式',
          description: '启用调试日志',
          type: 'boolean',
        },
      ],
    },
    {
      id: 'advanced',
      name: '高级选项',
      icon: 'Settings',
      description: '其他高级配置',
      options: [
        {
          id: 'system-prompt',
          cliFlag: '--system-prompt',
          name: '系统提示词',
          description: '覆盖默认系统提示词',
          type: 'string',
          placeholder: '自定义系统提示词',
        },
        {
          id: 'append-system-prompt',
          cliFlag: '--append-system-prompt',
          name: '追加系统提示词',
          description: '在默认系统提示词后追加内容',
          type: 'string',
          placeholder: '追加的系统提示词',
        },
        {
          id: 'json-schema',
          cliFlag: '--json-schema',
          name: 'JSON Schema',
          description: '结构化输出验证的 JSON Schema',
          type: 'string',
          placeholder: '{"type": "object", ...}',
        },
        {
          id: 'max-budget-usd',
          cliFlag: '--max-budget-usd',
          name: '预算上限',
          description: 'API 调用的最大美元预算',
          type: 'number',
          placeholder: '10.00',
        },
        {
          id: 'ide',
          cliFlag: '--ide',
          name: 'IDE 连接',
          description: '启动时自动连接 IDE',
          type: 'boolean',
        },
      ],
    },
  ],
}

/**
 * Codex 引擎命令配置
 */
export const codexCommands: EngineCommandsConfig = {
  engineId: 'codex',
  engineName: 'Codex',
  categories: [
    {
      id: 'model',
      name: '模型设置',
      icon: 'Model',
      options: [
        {
          id: 'model',
          cliFlag: '--model',
          shortFlag: '-m',
          name: '模型选择',
          description: '指定使用的 AI 模型',
          type: 'select',
          options: [
            { value: 'o3', label: 'O3', description: 'OpenAI O3 模型' },
            { value: 'o4-mini', label: 'O4 Mini', description: 'O4 Mini 模型' },
            { value: 'gpt-4.1', label: 'GPT-4.1', description: 'GPT-4.1 模型' },
          ],
          placeholder: '选择模型',
        },
        {
          id: 'oss',
          cliFlag: '--oss',
          name: '本地模型',
          description: '使用本地开源模型（LM Studio/Ollama）',
          type: 'boolean',
        },
        {
          id: 'local-provider',
          cliFlag: '--local-provider',
          name: '本地提供商',
          description: '指定本地模型提供商',
          type: 'select',
          options: [
            { value: 'lmstudio', label: 'LM Studio' },
            { value: 'ollama', label: 'Ollama' },
          ],
        },
      ],
    },
    {
      id: 'sandbox',
      name: '沙箱安全',
      icon: 'Shield',
      options: [
        {
          id: 'sandbox',
          cliFlag: '--sandbox',
          shortFlag: '-s',
          name: '沙箱模式',
          description: '命令执行的沙箱策略',
          type: 'select',
          options: [
            { value: 'read-only', label: '只读', description: '仅允许读取操作' },
            { value: 'workspace-write', label: '工作区写入', description: '允许在工作区写入' },
            { value: 'danger-full-access', label: '完全访问', description: '完全访问权限（危险）' },
          ],
          dangerous: true,
          dangerWarning: '完全访问模式可能允许执行危险命令',
        },
        {
          id: 'ask-for-approval',
          cliFlag: '--ask-for-approval',
          shortFlag: '-a',
          name: '审批策略',
          description: '控制何时需要用户审批',
          type: 'select',
          options: [
            { value: 'untrusted', label: '仅信任命令', description: '仅运行可信命令' },
            { value: 'on-request', label: '按需审批', description: '模型决定何时请求审批' },
            { value: 'never', label: '从不', description: '从不请求审批（危险）' },
          ],
        },
        {
          id: 'full-auto',
          cliFlag: '--full-auto',
          name: '全自动模式',
          description: '低摩擦自动执行模式',
          type: 'boolean',
        },
        {
          id: 'dangerously-bypass',
          cliFlag: '--dangerously-bypass-approvals-and-sandbox',
          name: '绕过安全',
          description: '跳过所有确认和沙箱（极度危险）',
          type: 'boolean',
          dangerous: true,
          dangerWarning: '此选项会跳过所有安全检查，仅用于外部沙箱环境',
        },
      ],
    },
    {
      id: 'session',
      name: '会话管理',
      icon: 'Session',
      options: [
        {
          id: 'profile',
          cliFlag: '--profile',
          shortFlag: '-p',
          name: '配置文件',
          description: '从配置文件加载默认选项',
          type: 'string',
          placeholder: '配置文件名',
        },
        {
          id: 'search',
          cliFlag: '--search',
          name: '网络搜索',
          description: '启用实时网络搜索功能',
          type: 'boolean',
        },
        {
          id: 'add-dir',
          cliFlag: '--add-dir',
          name: '添加目录',
          description: '添加额外的可写目录',
          type: 'string',
          placeholder: '目录路径',
        },
      ],
    },
    {
      id: 'output',
      name: '输出控制',
      icon: 'Output',
      options: [
        {
          id: 'no-alt-screen',
          cliFlag: '--no-alt-screen',
          name: '禁用备用屏幕',
          description: '在终端复用器中保留滚动历史',
          type: 'boolean',
        },
      ],
    },
  ],
}

/**
 * iFlow 引擎命令配置
 */
export const iflowCommands: EngineCommandsConfig = {
  engineId: 'iflow',
  engineName: 'iFlow',
  categories: [
    {
      id: 'model',
      name: '模型设置',
      icon: 'Model',
      options: [
        {
          id: 'model',
          cliFlag: '--model',
          shortFlag: '-m',
          name: '模型选择',
          description: '指定使用的 AI 模型',
          type: 'string',
          placeholder: '模型名称',
        },
      ],
    },
    {
      id: 'mode',
      name: '运行模式',
      icon: 'Play',
      options: [
        {
          id: 'yolo',
          cliFlag: '--yolo',
          shortFlag: '-y',
          name: 'YOLO 模式',
          description: '自动接受所有操作',
          type: 'boolean',
          dangerous: true,
          dangerWarning: 'YOLO 模式会自动执行所有操作，请确保在安全环境中使用',
        },
        {
          id: 'plan',
          cliFlag: '--plan',
          name: '计划模式',
          description: '仅规划不执行',
          type: 'boolean',
        },
        {
          id: 'thinking',
          cliFlag: '--thinking',
          name: '思考模式',
          description: '启用模型思考功能',
          type: 'boolean',
        },
        {
          id: 'autoEdit',
          cliFlag: '--autoEdit',
          name: '自动编辑模式',
          description: '自动编辑文件',
          type: 'boolean',
        },
        {
          id: 'default',
          cliFlag: '--default',
          name: '默认模式',
          description: '手动审批模式',
          type: 'boolean',
        },
      ],
    },
    {
      id: 'sandbox',
      name: '沙箱设置',
      icon: 'Shield',
      options: [
        {
          id: 'sandbox',
          cliFlag: '--sandbox',
          shortFlag: '-s',
          name: '启用沙箱',
          description: '在沙箱环境中运行',
          type: 'boolean',
        },
        {
          id: 'sandbox-image',
          cliFlag: '--sandbox-image',
          name: '沙箱镜像',
          description: '指定沙箱镜像 URI',
          type: 'string',
          placeholder: '镜像 URI',
        },
      ],
    },
    {
      id: 'session',
      name: '会话管理',
      icon: 'Session',
      options: [
        {
          id: 'continue',
          cliFlag: '--continue',
          shortFlag: '-c',
          name: '继续会话',
          description: '加载最近的会话',
          type: 'boolean',
        },
        {
          id: 'resume',
          cliFlag: '--resume',
          shortFlag: '-r',
          name: '恢复会话',
          description: '从特定会话文件恢复',
          type: 'string',
          placeholder: '会话 ID',
        },
      ],
    },
    {
      id: 'output',
      name: '输出控制',
      icon: 'Output',
      options: [
        {
          id: 'debug',
          cliFlag: '--debug',
          shortFlag: '-d',
          name: '调试模式',
          description: '启用调试日志',
          type: 'boolean',
        },
        {
          id: 'all-files',
          cliFlag: '--all-files',
          shortFlag: '-a',
          name: '包含所有文件',
          description: '在上下文中包含所有文件',
          type: 'boolean',
        },
        {
          id: 'show-memory-usage',
          cliFlag: '--show-memory-usage',
          name: '显示内存',
          description: '在状态栏显示内存使用',
          type: 'boolean',
        },
      ],
    },
    {
      id: 'limits',
      name: '执行限制',
      icon: 'Timer',
      options: [
        {
          id: 'max-turns',
          cliFlag: '--max-turns',
          name: '最大轮次',
          description: '模型调用的最大轮次',
          type: 'number',
          placeholder: '10',
        },
        {
          id: 'max-tokens',
          cliFlag: '--max-tokens',
          name: '最大 Token',
          description: '最大 Token 使用量',
          type: 'number',
          placeholder: '100000',
        },
        {
          id: 'timeout',
          cliFlag: '--timeout',
          name: '超时时间',
          description: '最大执行时间（秒）',
          type: 'number',
          placeholder: '300',
        },
      ],
    },
  ],
}

/**
 * 获取引擎命令配置
 */
export function getEngineCommands(engineId: string): EngineCommandsConfig | null {
  switch (engineId) {
    case 'claude-code':
      return claudeCodeCommands
    case 'codex':
      return codexCommands
    case 'iflow':
      return iflowCommands
    default:
      return null
  }
}

/**
 * 获取所有引擎的命令配置
 */
export function getAllEngineCommands(): EngineCommandsConfig[] {
  return [claudeCodeCommands, codexCommands, iflowCommands]
}

/**
 * 从分类中获取所有选项
 */
export function getAllOptions(config: EngineCommandsConfig) {
  return config.categories.flatMap(cat => cat.options)
}

/**
 * 根据选项 ID 查找选项定义
 */
export function findOptionById(config: EngineCommandsConfig, optionId: string) {
  for (const category of config.categories) {
    const option = category.options.find(opt => opt.id === optionId)
    if (option) return option
  }
  return null
}
