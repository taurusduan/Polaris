# 需求文档 - 会话标签页增强功能

## 简介

本文档定义了会话标签页（Session Tabs）功能的增强需求，主要解决四个核心问题：
1. 工作区管理功能缺失 - 标签页缺少工作区相关的增删改查设置功能
2. 消息实时显示问题 - 发送消息后标签页不会实时显示用户消息
3. 发送按钮状态不同步 - 发送按钮不会变红，无法显示中断按钮（架构不一致导致）
4. 输入框没有会话隔离 - 会话切换时输入内容会丢失

这些增强将改善多会话标签页的用户体验，使其更加完整和易用。

## 术语表

- **Session_Tabs**: 会话标签栏组件，显示所有打开的会话标签
- **Session_Tab**: 单个会话标签组件，代表一个独立的对话会话
- **Workspace**: 工作区，包含项目文件和配置的目录
- **Session_Store**: 会话状态存储，管理单个会话的消息、状态和操作
- **Session_Manager**: 会话管理器，管理所有会话的生命周期和切换
- **Chat_Input**: 聊天输入组件，用户输入消息的界面
- **Message**: 消息对象，包含用户或助手的对话内容
- **Input_Draft**: 输入草稿，保存用户正在编辑的消息内容和附件
- **isStreaming**: 流式状态，表示 AI 正在生成响应

## 需求

### 需求 1: 工作区管理功能

**用户故事:** 作为用户，我希望在会话标签页中管理工作区，以便为不同会话设置和切换工作区上下文。

#### 验收标准

1. THE Session_Tabs SHALL 显示工作区管理入口按钮
2. WHEN 用户点击工作区管理按钮, THE Session_Tabs SHALL 显示工作区设置面板
3. THE 工作区设置面板 SHALL 显示当前会话关联的工作区名称
4. THE 工作区设置面板 SHALL 显示所有可用工作区列表
5. WHEN 用户选择一个工作区, THE Session_Manager SHALL 更新当前会话的工作区关联
6. WHEN 用户选择"无工作区"选项, THE Session_Manager SHALL 将当前会话设置为自由会话模式
7. THE 工作区设置面板 SHALL 提供创建新工作区的入口
8. WHEN 用户创建新工作区, THE Session_Manager SHALL 将新工作区关联到当前会话
9. THE Session_Tab SHALL 显示会话关联的工作区名称（如果有）
10. WHEN 会话关联的工作区被删除, THE Session_Manager SHALL 将该会话转换为自由会话模式

### 需求 2: 消息实时显示

**用户故事:** 作为用户，我希望发送消息后立即在当前标签页看到我的消息，而不需要切换标签页。

#### 验收标准

1. WHEN 用户在 Chat_Input 中发送消息, THE Session_Store SHALL 立即将用户消息添加到消息列表
2. THE Session_Store SHALL 在调用后端 API 之前添加用户消息到消息列表
3. THE 用户消息 SHALL 包含唯一标识符、内容、时间戳和发送者角色
4. THE Session_Store SHALL 触发消息列表更新事件
5. WHEN 消息列表更新, THE 聊天界面 SHALL 重新渲染并显示新消息
6. THE 聊天界面 SHALL 自动滚动到最新消息位置
7. WHEN 用户消息包含附件, THE Session_Store SHALL 在消息对象中包含附件引用
8. WHEN 后端 API 返回错误, THE Session_Store SHALL 保留用户消息并显示错误状态

### 需求 3: 发送状态指示

**用户故事:** 作为用户，我希望看到消息发送状态，以便了解消息是否正在发送、已发送或发送失败。

#### 验收标准

1. WHEN 用户点击发送按钮, THE Chat_Input SHALL 显示"发送中"状态
2. THE "发送中"状态 SHALL 禁用发送按钮
3. THE "发送中"状态 SHALL 显示加载动画指示器
4. WHEN 消息成功发送到后端, THE Chat_Input SHALL 清除"发送中"状态
5. WHEN 消息发送失败, THE Chat_Input SHALL 显示错误状态
6. THE 错误状态 SHALL 显示错误提示信息
7. THE 错误状态 SHALL 提供重试发送选项
8. WHEN 用户重试发送, THE Chat_Input SHALL 重新执行发送流程
9. THE Session_Store SHALL 维护消息发送状态（pending、sent、failed）
10. THE 消息列表 SHALL 根据发送状态显示不同的视觉指示器

### 需求 4: 会话状态同步

**用户故事:** 作为用户，我希望会话标签页准确反映会话状态，以便了解哪些会话正在运行、等待或出错。

#### 验收标准

1. WHEN Session_Store 的 isStreaming 状态变为 true, THE Session_Tab SHALL 显示"运行中"状态指示器
2. WHEN Session_Store 的 isStreaming 状态变为 false, THE Session_Tab SHALL 移除"运行中"状态指示器
3. WHEN Session_Store 的 error 状态不为 null, THE Session_Tab SHALL 显示"错误"状态指示器
4. WHEN 会话在后台运行, THE Session_Tab SHALL 显示"后台运行"状态指示器
5. THE 状态指示器 SHALL 使用不同颜色区分不同状态（运行中、等待、错误、空闲）
6. WHEN 用户切换到其他标签页, THE 当前运行的会话 SHALL 自动转为后台运行状态
7. WHEN 后台会话完成, THE Session_Manager SHALL 添加完成通知
8. THE Session_Tabs SHALL 显示未查看的完成通知数量

### 需求 5: 输入框会话隔离

**用户故事:** 作为用户，我希望每个会话标签页保留独立的输入内容和附件，以便在会话间切换时不会丢失正在编辑的消息。

**问题根源:** 当前只有一个 ChatInput 实例，输入内容使用组件内部 useState 管理。会话切换时，输入内容会丢失，用户体验不佳。

#### 验收标准

1. THE Session_Store SHALL 维护会话的输入草稿状态（inputDraft）
2. THE inputDraft SHALL 包含文本内容（text）和附件列表（attachments）
3. WHEN 用户在 Chat_Input 中输入文本, THE Session_Store SHALL 自动保存输入草稿
4. WHEN 用户添加附件, THE Session_Store SHALL 将附件添加到输入草稿
5. WHEN 用户切换会话, THE Chat_Input SHALL 从新会话的 Session_Store 加载输入草稿
6. WHEN 用户发送消息, THE Session_Store SHALL 清空输入草稿
7. THE 输入草稿 SHALL 在浏览器刷新后恢复（使用 sessionStorage）
8. WHEN 用户关闭会话标签, THE Session_Manager SHALL 清除该会话的输入草稿
9. THE Chat_Input SHALL 使用 useActiveSessionInputDraft hook 订阅活跃会话的输入草稿
10. THE 输入草稿更新 SHALL 使用防抖机制，避免频繁更新（300ms 延迟）

### 需求 6: 工作区上下文传递

**用户故事:** 作为用户，我希望发送消息时自动使用当前会话关联的工作区，以便 AI 助手能够访问正确的项目上下文。

#### 验收标准

1. WHEN 用户发送消息, THE Chat_Input SHALL 从 Session_Store 获取当前会话的工作区 ID
2. WHEN 会话关联了工作区, THE Chat_Input SHALL 将工作区目录路径传递给 sendMessage 方法
3. WHEN 会话未关联工作区, THE Chat_Input SHALL 传递 undefined 作为工作区参数
4. THE Session_Store SHALL 在发送消息时包含工作区上下文到后端请求
5. WHEN 工作区路径无效, THE Session_Store SHALL 返回错误并提示用户
6. THE 后端 API SHALL 使用工作区路径作为文件操作的根目录
7. WHEN 用户在消息中使用 @workspace 引用, THE Chat_Input SHALL 解析为当前会话的工作区路径

## 非功能性需求

### 性能

1. THE Session_Store SHALL 在 50 毫秒内完成消息添加操作
2. THE Session_Tabs SHALL 在 100 毫秒内完成会话切换操作
3. THE 工作区设置面板 SHALL 在 200 毫秒内显示

### 可用性

1. THE 工作区管理按钮 SHALL 使用清晰的图标和标签
2. THE 状态指示器 SHALL 使用符合无障碍标准的颜色对比度
3. THE 错误消息 SHALL 使用用户友好的语言描述问题

### 可靠性

1. WHEN 网络请求失败, THE Session_Store SHALL 保留用户消息并允许重试
2. WHEN 会话状态更新失败, THE Session_Manager SHALL 记录错误日志
3. THE Session_Store SHALL 在浏览器刷新后恢复会话状态

## 约束条件

1. 工作区管理功能必须与现有的 workspaceStore 集成
2. 消息实时显示必须保持与现有消息流式传输机制的兼容性
3. 发送状态指示必须支持附件上传进度显示
4. 所有状态更新必须使用 Zustand store 的响应式机制
5. UI 组件必须使用现有的设计系统和样式规范

## 依赖关系

1. 依赖 sessionStoreManager 提供会话管理能力
2. 依赖 workspaceStore 提供工作区数据
3. 依赖 useActiveSession hooks 提供响应式状态订阅
4. 依赖后端 API 支持工作区上下文参数
5. 依赖 EventRouter 进行事件分发和会话隔离
