/**
 * 文档模式模板类型定义
 *
 * 用于协议模式任务的模板系统，支持内置模板和用户自定义模板
 */

/** 模板类别 */
export type ProtocolTemplateCategory = 'development' | 'optimization' | 'fix' | 'custom' | 'requirement';

/** 模板类别标签 */
export const ProtocolTemplateCategoryLabels: Record<ProtocolTemplateCategory, string> = {
  development: '开发任务',
  optimization: '优化任务',
  fix: '修复任务',
  requirement: '需求管理',
  custom: '自定义',
};

/** 协议模式模板 */
export interface ProtocolTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 模板类别 */
  category: ProtocolTemplateCategory;
  /** 是否为内置模板 */
  builtin: boolean;
  /** 任务目标模板（支持占位符）- 保留向后兼容 */
  missionTemplate: string;
  /** 完整文档模板（支持占位符）- 新增：完整 task.md 内容模板 */
  fullTemplate?: string;
  /** 模板参数定义 - 新增：用于动态生成输入框 */
  templateParams?: TemplateParam[];
  /** 协议文档模板（可选，支持占位符） */
  protocolTemplate?: string;
  /** 默认触发类型 */
  defaultTriggerType?: 'once' | 'cron' | 'interval';
  /** 默认触发值 */
  defaultTriggerValue?: string;
  /** 默认引擎 */
  defaultEngineId?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/** 创建模板参数 */
export interface CreateProtocolTemplateParams {
  name: string;
  description: string;
  category: ProtocolTemplateCategory;
  missionTemplate: string;
  fullTemplate?: string;
  templateParams?: TemplateParam[];
  protocolTemplate?: string;
  defaultTriggerType?: 'once' | 'cron' | 'interval';
  defaultTriggerValue?: string;
  defaultEngineId?: string;
}

/** 内置模板定义 */
export const BUILTIN_PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  {
    id: 'dev-feature',
    name: '功能开发',
    description: '用于持续开发新功能的任务模板，包含需求分析、实现、测试等阶段',
    category: 'development',
    builtin: true,
    missionTemplate: `帮我开发以下功能：

{mission}

请按照以下步骤执行：
1. 分析需求和现有代码结构
2. 设计实现方案
3. 编写代码实现
4. 编写测试用例
5. 进行代码审查和优化

当前时间：{dateTime}`,
    defaultTriggerType: 'interval',
    defaultTriggerValue: '1h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'dev-refactor',
    name: '代码重构',
    description: '用于持续重构和改进代码质量的任务模板',
    category: 'development',
    builtin: true,
    missionTemplate: `帮我重构以下代码：

{mission}

重构目标：
- 提高代码可读性
- 减少重复代码
- 优化性能
- 改善架构设计

当前时间：{dateTime}`,
    defaultTriggerType: 'interval',
    defaultTriggerValue: '2h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'opt-performance',
    name: '性能优化',
    description: '用于持续优化系统性能的任务模板',
    category: 'optimization',
    builtin: true,
    missionTemplate: `帮我优化以下性能问题：

{mission}

优化方向：
- 响应时间优化
- 内存使用优化
- 数据库查询优化
- 缓存策略改进

当前时间：{dateTime}`,
    defaultTriggerType: 'interval',
    defaultTriggerValue: '6h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'opt-code-quality',
    name: '代码质量优化',
    description: '用于持续提升代码质量的任务模板',
    category: 'optimization',
    builtin: true,
    missionTemplate: `帮我提升以下代码的质量：

{mission}

质量提升方向：
- 代码规范检查
- 添加单元测试
- 改善错误处理
- 完善文档注释

当前时间：{dateTime}`,
    defaultTriggerType: 'interval',
    defaultTriggerValue: '12h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'fix-bug',
    name: 'Bug修复',
    description: '用于持续修复Bug的任务模板',
    category: 'fix',
    builtin: true,
    missionTemplate: `帮我修复以下Bug：

{mission}

修复步骤：
1. 定位Bug根源
2. 分析影响范围
3. 编写修复代码
4. 添加回归测试
5. 验证修复效果

当前时间：{dateTime}`,
    defaultTriggerType: 'interval',
    defaultTriggerValue: '30m',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'fix-security',
    name: '安全修复',
    description: '用于修复安全漏洞的任务模板',
    category: 'fix',
    builtin: true,
    missionTemplate: `帮我修复以下安全问题：

{mission}

安全修复要点：
- 分析安全漏洞影响
- 修复漏洞代码
- 添加安全测试
- 更新安全文档

当前时间：{dateTime}`,
    defaultTriggerType: 'once',
    defaultTriggerValue: '',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'protocol-assist',
    name: '协议协助模式',
    description: '完整的协议任务模板，支持任务目标和用户补充内容',
    category: 'development',
    builtin: true,
    missionTemplate: '{task}', // 向后兼容
    fullTemplate: `# 任务协议

> 任务ID: 自动生成
> 创建时间: {dateTime}
> 版本: 1.0.0

---

## 任务目标

{task}

---

## 用户补充

{userSupplement}

---

## 执行规则

每次触发时按以下顺序执行：

### 1. 检查用户补充
- 读取用户补充文件
- 如有新内容，优先处理并归档

### 2. 推进主任务
- 读取记忆索引了解当前进度
- 选择下一个待办事项执行
- 完成后更新记忆

### 3. 记忆更新
- 新成果写入记忆文件
- 待办任务写入任务文件

---

## 成果定义

有价值的工作：
- 完成具体功能实现
- 修复已知问题
- 优化代码质量
- 产出可复用资产

避免：
- 无产出的探索
- 重复性工作
`,
    templateParams: [
      {
        key: 'task',
        label: '任务目标',
        type: 'textarea',
        required: true,
        placeholder: '描述任务目标...',
      },
      // userSupplement 作为独立字段存在于 ScheduledTask 中，不需要在模板参数中定义
      // fullTemplate 中的 {userSupplement} 占位符在渲染时从独立字段获取
    ],
    defaultTriggerType: 'interval',
    defaultTriggerValue: '1h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'req-generate',
    name: '需求生成',
    description: '分析项目代码，自动生成需求并存入需求队列，支持原型 HTML 生成',
    category: 'requirement',
    builtin: true,
    missionTemplate: '分析项目并生成需求到需求队列。\n\n{scope}\n\n{projectContext}',
    fullTemplate: `分析当前工作区项目，识别改进点和新功能机会，将需求写入需求队列等待审核。

## 分析范围

{scope}

{projectContext}

## 操作流程

每次触发执行以下步骤：

### 1. 分析项目
- 阅读项目结构和关键文件
- 理解现有功能模块
- 识别可以改进或新增的功能点

### 2. 生成需求（每次 1~3 条）
基于分析结果生成需求，需包含：
- 清晰的标题
- 详细的描述（包含背景、目标、预期效果）
- 合理的优先级（low / normal / high / urgent）
- 相关标签（用于分类）

### 3. 可选：生成原型
仅当需求涉及 **UI 界面变更** 时才生成原型：
- 原型为单文件 HTML（内联 CSS）
- 文件路径：\`.polaris/requirements/prototypes/{id}.html\`
- 原型应展示目标界面的大致布局和交互

### 4. 写入需求文件
将新需求追加到需求 JSON 文件（不删除已有需求）。

## 需求文件格式

文件路径：\`.polaris/requirements/requirements.json\`（相对于工作区根目录）

\`\`\`json
{
  "version": "1.0.0",
  "updatedAt": "<ISO 8601 时间>",
  "requirements": [
    {
      "id": "<UUID>",
      "title": "<需求标题>",
      "description": "<详细描述>",
      "status": "pending",
      "priority": "<low|normal|high|urgent>",
      "tags": ["<标签1>", "<标签2>"],
      "hasPrototype": false,
      "prototypePath": ".polaris/requirements/prototypes/<id>.html",
      "generatedBy": "ai",
      "generatedAt": <Unix毫秒时间戳>,
      "createdAt": <Unix毫秒时间戳>,
      "updatedAt": <Unix毫秒时间戳>
    }
  ]
}
\`\`\`

### 文件操作规则
1. 先读取现有文件（如不存在则创建空结构）
2. 解析 JSON，向 \`requirements\` 数组末尾追加新需求
3. 更新 \`updatedAt\` 为当前 ISO 时间
4. 写回文件（保持 JSON 格式化，缩进 2 空格）

### 优先级参考
- **low**: 优化建议、代码质量改进
- **normal**: 常规新功能、体验优化
- **high**: 重要功能、用户反馈需求
- **urgent**: 阻塞性问题、安全漏洞

### 注意事项
- 需求状态固定为 \`"pending"\`（待审核），由用户在需求队列面板中审核
- 每次生成前检查现有需求，避免重复
- 标签用于分类，如 \`["UI", "性能", "安全", "重构"]\` 等
- 如需生成原型，先确保 \`.polaris/requirements/prototypes/\` 目录存在`,
    templateParams: [
      {
        key: 'scope',
        label: '分析范围',
        type: 'textarea',
        required: true,
        placeholder: '描述要分析的模块或功能范围，如：分析 src/components 下的组件，提出优化建议',
      },
      {
        key: 'projectContext',
        label: '项目背景（可选）',
        type: 'textarea',
        required: false,
        placeholder: '补充项目背景信息，帮助 AI 更好地理解上下文',
      },
    ],
    defaultTriggerType: 'interval',
    defaultTriggerValue: '24h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'req-execute',
    name: '需求执行（仅分析）',
    description: '从需求队列获取已批准的需求，进行深入分析并记录执行方案（不直接实现）',
    category: 'requirement',
    builtin: true,
    missionTemplate: '从需求队列获取已批准需求并分析。\n\n{focusModule}',
    fullTemplate: `从需求队列中获取已批准（approved）的需求，进行深入分析，记录执行方案。

## 执行范围

{focusModule}

## 操作流程

每次触发执行以下步骤：

### 1. 获取待执行需求
- 读取 \`.polaris/requirements/requirements.json\`
- 筛选 \`status === "approved"\` 的需求
- 按优先级排序：\`urgent > high > normal > low\`
- 如有指定模块，按标签进一步筛选
- 选取优先级最高的一条需求进行分析

### 2. 深入分析需求（仅分析，不实现）
- 阅读相关代码，理解当前实现
- 评估需求的技术方案
- 识别可能的实现路径和影响范围
- 分析潜在风险和依赖关系

### 3. 记录分析结果
将分析结果写入需求的 \`executeLog\` 字段，包含：
- **需求理解**：对需求目标和背景的理解
- **当前状态**：相关代码的现状分析
- **实现方案**：推荐的技术实现路径
- **影响范围**：涉及哪些文件和模块
- **风险评估**：可能的风险和注意事项
- **预估工作量**：大致的实现复杂度

### 4. 更新需求状态
- 将需求 \`status\` 更新为 \`"executing"\`
- 写入 \`executeLog\`
- 更新 \`executedAt\` 为当前时间戳
- 写回 JSON 文件

## 需求文件格式

文件路径：\`.polaris/requirements/requirements.json\`（相对于工作区根目录）

\`\`\`json
{
  "version": "1.0.0",
  "updatedAt": "<ISO 8601 时间>",
  "requirements": [...]
}
\`\`\`

### 文件操作规则
1. 读取 JSON 文件，解析需求列表
2. 找到目标需求，更新其字段
3. 更新 \`updatedAt\` 为当前 ISO 时间
4. 写回文件（保持 JSON 格式化，缩进 2 空格）

### 关键字段说明
- \`status\`: 需求状态，执行时设为 \`"executing"\`
- \`executeLog\`: 分析结果（Markdown 格式字符串）
- \`executedAt\`: 开始执行时间（Unix 毫秒时间戳）
- \`executeError\`: 如分析失败，记录错误信息

### 注意事项
- 每次只分析一条需求，不要贪多
- 分析要深入具体，不要泛泛而谈
- 分析结果要有可操作性，为后续实现提供明确指导
- 如果没有已批准的需求，跳过本次执行并在记忆中记录`,
    templateParams: [
      {
        key: 'focusModule',
        label: '聚焦模块（可选）',
        type: 'text',
        required: false,
        default: '',
        placeholder: '指定要执行的需求模块，留空则按优先级全局选取',
      },
    ],
    defaultTriggerType: 'interval',
    defaultTriggerValue: '2h',
    defaultEngineId: 'claude',
    createdAt: 0,
    updatedAt: 0,
  },
];

/** 模板参数定义 - 用于动态生成输入框 */
export interface TemplateParam {
  /** 参数键，用于占位符匹配，如 "task", "userSupplement" */
  key: string;
  /** 显示标签 */
  label: string;
  /** 输入类型 */
  type: 'text' | 'textarea' | 'select';
  /** 是否必填 */
  required: boolean;
  /** 默认值 */
  default?: string;
  /** 占位提示 */
  placeholder?: string;
  /** select 类型的选项 */
  options?: { value: string; label: string }[];
}

/** 支持的占位符 */
export const TEMPLATE_PLACEHOLDERS = {
  dateTime: '{dateTime}',
  mission: '{mission}',
  date: '{date}',
  time: '{time}',
  task: '{task}',
  userSupplement: '{userSupplement}',
};

/** 格式化日期时间 */
export function formatDateTimeForTemplate(): string {
  const now = new Date();
  return now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 格式化日期 */
export function formatDateForTemplate(): string {
  const now = new Date();
  return now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 格式化时间 */
export function formatTimeForTemplate(): string {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 渲染模板的参数 */
export interface RenderTemplateParams {
  /** 任务目标/描述 (对应 {mission} 和 {task}) */
  mission?: string;
  /** 用户补充内容 (对应 {userSupplement}) */
  userSupplement?: string;
}

/** 渲染模板 */
export function renderProtocolTemplate(
  template: string,
  missionOrParams: string | RenderTemplateParams
): string {
  let result = template;

  // 兼容旧的字符串参数形式
  const params: RenderTemplateParams = typeof missionOrParams === 'string'
    ? { mission: missionOrParams }
    : missionOrParams;

  // 替换基础占位符
  result = result.replace(TEMPLATE_PLACEHOLDERS.dateTime, formatDateTimeForTemplate());
  result = result.replace(TEMPLATE_PLACEHOLDERS.date, formatDateForTemplate());
  result = result.replace(TEMPLATE_PLACEHOLDERS.time, formatTimeForTemplate());

  // 替换任务相关占位符
  result = result.replace(TEMPLATE_PLACEHOLDERS.mission, params.mission || '');
  result = result.replace(TEMPLATE_PLACEHOLDERS.task, params.mission || '');
  result = result.replace(TEMPLATE_PLACEHOLDERS.userSupplement, params.userSupplement || '');

  return result;
}

/** 渲染参数映射类型 */
export interface TemplateParamValues {
  task?: string;
  userSupplement?: string;
  mission?: string;
  [key: string]: string | undefined;
}

/** 渲染完整模板 - 新版，支持所有占位符 */
export function renderFullTemplate(
  template: string,
  params: TemplateParamValues
): string {
  let result = template;

  // 替换系统占位符
  result = result.replace(TEMPLATE_PLACEHOLDERS.dateTime, formatDateTimeForTemplate());
  result = result.replace(TEMPLATE_PLACEHOLDERS.date, formatDateForTemplate());
  result = result.replace(TEMPLATE_PLACEHOLDERS.time, formatTimeForTemplate());

  // 替换用户参数占位符
  Object.entries(params).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    if (result.includes(placeholder)) {
      result = result.split(placeholder).join(value || '');
    }
  });

  return result;
}

/** 从模板中提取占位符列表 */
export function extractPlaceholders(template: string): string[] {
  const regex = /\{(\w+)\}/g;
  const placeholders: string[] = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }
  return placeholders;
}
