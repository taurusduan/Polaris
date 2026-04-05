# QuickSwitchPanel 设计文档

日期：2026-04-05
状态：待审核

## 概述

新增右侧悬停触发的快速切换面板组件，用于快速切换会话和工作区。该组件独立于现有的 FloatingIsland（悬浮岛）和 ChatNavigator（对话导航），采用玻璃风格设计，通过悬停交互提供便捷的会话/工作区切换体验。

## 设计背景

### 当前问题

1. **FloatingIsland** 位于聊天区域顶部居中，占用视觉空间
2. **ChatNavigator** 位于屏幕右边缘，半圆造型视觉突兀（蓝色背景）
3. 两个组件功能割裂，缺乏统一的交互模式

### 设计目标

- 提供右侧悬停触发的快速切换入口
- 保持会话和工作区的快速切换能力
- 与对话导航位置分离，避免功能混杂
- 采用玻璃风格统一视觉语言
- **保留现有悬浮岛**，两者并存

## 组件设计

### QuickSwitchPanel（快速切换面板）

#### 触发器规格

| 属性 | 值 |
|------|-----|
| 尺寸 | 32 × 44 px |
| 位置 | right: 0, top: ~100px（相对于聊天容器） |
| 圆角 | 12px 0 0 12px（左圆角，贴边设计） |
| 背景 | rgba(255,255,255,0.85) |
| 模糊效果 | backdrop-blur(12px) |
| 边框 | 1px solid rgba(0,0,0,0.06) |
| 阴影 | -2px 0 12px rgba(0,0,0,0.06) |
| 内容 | 状态指示点（6px 绿点） + ⚡ 图标 |

#### 展开面板规格

| 属性 | 值 |
|------|-----|
| 宽度 | 240px |
| 位置 | right: 32px，与触发器顶部对齐（微调 -16px） |
| 圆角 | 16px |
| 背景 | rgba(255,255,255,0.95) |
| 模糊效果 | backdrop-blur(16px) |
| 阴影 | 0 8px 32px rgba(0,0,0,0.12) |
| 入场动画 | fade-in + zoom-in-95, duration: 150ms |

#### 面板内容结构

```
QuickSwitchPanel
├── Header（当前状态头部）
│   ├── 状态指示点（运行中显示绿色脉冲动画）
│   ├── 当前会话名
│   ├── 状态文字（运行中/空闲/等待）
│   └── "切换" 标签
│
├── Sessions（会话列表区）
│   ├── 区块标题 "会话"
│   ├── 会话项列表
│   │   ├── 状态点（运行中=绿色动画，空闲=灰色）
│   │   ├── 会话名称
│   │   ├── 当前项高亮（左侧蓝色边框 + 浅蓝背景）
│   │   └── (可选) "当前" 标记
│   └── "+ 新建会话" 按钮（虚线边框）
│
└── Workspaces（工作区区）
    ├── 区块标题 "工作区"
    └── 当前工作区项
        ├── 工作区名称
        ├── 关联数徽章（+N，蓝色背景）
        └── "主工作区" 标记
```

### 悬停交互机制

| 事件 | 行为 |
|------|------|
| 悬停触发器 | 立即展开面板（无延迟或 50ms 延迟） |
| 鼠标移动到面板 | 保持面板展开状态 |
| 离开触发器或面板 | 150ms 延迟后关闭面板 |
| 面板内点击 | 执行切换操作，面板保持展开（用户可能需要连续切换） |

实现方式：
- 使用 `useRef` 管理悬停状态，避免闭包陷阱
- 触发器和面板分别监听 `onMouseEnter` / `onMouseLeave`
- 通过定时器管理延迟关闭逻辑

### 与其他组件的位置关系

| 组件 | 位置 |
|------|------|
| QuickSwitchPanel 触发器 | right: 0, top: ~100px |
| ChatNavigator 触发器 | right: 0, bottom: ~80px |
| FloatingIsland | 顶部居中（保持不变） |
| 两者间距 | 最小 40px，避免视觉重叠 |

### ChatNavigator 样式同步修改

将对话导航的悬浮球样式改为玻璃风格：

| 原样式 | 新样式 |
|--------|--------|
| 背景色：#3b82f6（蓝色） | rgba(255,255,255,0.85) + backdrop-blur |
| 图标色：白色 | #64748b（灰色） |
| 阴影：蓝色阴影 | -2px 0 8px rgba(0,0,0,0.04) |

## 技术实现

### 文件结构

```
src/components/QuickSwitchPanel/
├── QuickSwitchPanel.tsx      # 主组件
├── QuickSwitchTrigger.tsx    # 触发器子组件
├── QuickSwitchContent.tsx    # 面板内容子组件
├── types.ts                  # 类型定义
├── index.ts                  # 导出入口
```

### 复用逻辑

从 FloatingIsland 复用：
- `useSessionMetadataList()` - 会话列表数据
- `useActiveSessionId()` - 当前活跃会话
- `useSessionManagerActions()` - 会话操作（创建、切换、删除）
- `useWorkspaceStore()` - 工作区数据
- `StatusDot` 组件 - 状态指示器

### 状态管理

内部状态：
- `isPanelVisible: boolean` - 面板可见性
- `isHoveringTrigger: boolean`（ref） - 是否悬停触发器
- `isHoveringPanel: boolean`（ref） - 是否悬停面板
- `hideTimer: number | null`（ref） - 关闭定时器

### 样式实现

使用 Tailwind CSS：

```tsx
// 触发器
className="w-8 h-11 bg-background-elevated/85 backdrop-blur-xl
           border border-border/50 border-r-0
           rounded-l-xl shadow-lg shadow-black/5
           flex flex-col items-center justify-center gap-1"

// 面板
className="w-60 bg-background-elevated/95 backdrop-blur-2xl
           border border-border/50 rounded-2xl
           shadow-xl shadow-black/10
           animate-in fade-in-0 zoom-in-95 duration-150"
```

### 组件集成位置

在 `RightPanel.tsx` 中添加：

```tsx
<div className="relative flex-1 overflow-hidden">
  {/* 聊天内容 */}
  <EnhancedChatMessages ... />

  {/* 快速切换面板 */}
  <QuickSwitchPanel />

  {/* 对话导航 */}
  <ChatNavigator ... />
</div>
```

## 实现步骤

### Phase 1: 基础组件结构

1. 创建 `QuickSwitchPanel` 目录和基础文件
2. 实现触发器组件 `QuickSwitchTrigger`
3. 实现悬停交互逻辑

### Phase 2: 面板内容

4. 实现面板组件 `QuickSwitchContent`
5. 实现会话列表展示
6. 实现工作区信息展示
7. 实现新建会话按钮

### Phase 3: 交互功能

8. 实现会话切换功能
9. 实现新建会话功能
10. 实现面板内悬停保持逻辑

### Phase 4: 样式统一

11. 修改 ChatNavigator 为玻璃风格
12. 调整位置避免重叠
13. 统一动画效果

### Phase 5: 集成与测试

14. 在 RightPanel 中集成
15. 验证与悬浮岛、对话导航的协调
16. 测试悬停交互流畅性

## 验收标准

1. 悬停触发器立即展开面板
2. 鼠标移动到面板内保持展开
3. 离开后 150ms 延迟关闭
4. 会话切换功能正常工作
5. 新建会话功能正常工作
6. 与对话导航位置不重叠
7. 玻璃风格视觉效果统一
8. 保留悬浮岛功能正常

## 备注

- 当前阶段保留悬浮岛，后续可根据使用反馈决定是否移除
- 对话导航样式同步修改为玻璃风格，解决蓝色突兀问题