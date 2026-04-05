# 会话完成通知实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Toast 通知移至 ChatStatusBar 右上方，扩展支持会话完成通知，支持快速切换会话。

**Architecture:** 扩展现有 Toast 系统，新增 `session_complete` 类型和 `action` 字段支持交互按钮；修改位置从全局固定改为相对 ChatStatusBar 定位；在 sessionStoreManager 中触发会话完成通知。

**Tech Stack:** React, Zustand, TypeScript, Tailwind CSS

---

## 文件结构

| 文件 | 职责 |
|-----|------|
| `src/stores/toastStore.ts` | Toast 状态管理，扩展类型、action 字段、最大数量限制 |
| `src/components/Common/Toast.tsx` | Toast 组件，位置调整、交互按钮、session_complete 样式 |
| `src/stores/conversationStore/sessionStoreManager.ts` | 会话管理，会话完成时触发通知 |
| `src/App.tsx` | 布局，ToastContainer 位置调整 |
| `src/index.css` | 动画样式，确认滑入滑出动画存在 |

---

### Task 1: 扩展 toastStore 数据结构

**Files:**
- Modify: `src/stores/toastStore.ts`

- [ ] **Step 1: 扩展 ToastType 和 Toast 接口**

```typescript
// 修改第 7 行
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'session_complete'

// 修改第 9-15 行，扩展 Toast 接口
export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number // 毫秒，0 表示不自动关闭
  // 新增：可交互操作
  action?: {
    label: string
    onClick: () => void
  }
  // 新增：会话 ID（用于 session_complete 类型）
  sessionId?: string
}
```

- [ ] **Step 2: 添加最大数量常量**

在 `let toastId = 0` 之前添加：

```typescript
const MAX_TOASTS = 5
```

- [ ] **Step 3: 修改 addToast 方法添加数量限制**

修改第 38-48 行的 addToast 方法：

```typescript
addToast: (toast) => {
  const id = `toast-${++toastId}`
  const newToast: Toast = {
    id,
    duration: 4000, // 默认 4 秒
    ...toast,
  }

  set((state) => {
    const toasts = [...state.toasts, newToast]
    // 超出限制时移除最旧的
    if (toasts.length > MAX_TOASTS) {
      toasts.shift()
    }
    return { toasts }
  })

  // 自动移除
  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => {
      get().removeToast(id)
    }, newToast.duration)
  }

  return id
},
```

- [ ] **Step 4: 新增 sessionComplete 快捷方法**

在 ToastState 接口（第 18-31 行）中添加方法声明：

```typescript
interface ToastState {
  toasts: Toast[]

  // 添加 Toast
  addToast: (toast: Omit<Toast, 'id'>) => string
  // 移除 Toast
  removeToast: (id: string) => void
  // 清除所有 Toast
  clearAll: () => void
  // 快捷方法
  success: (title: string, message?: string) => string
  error: (title: string, message?: string) => string
  warning: (title: string, message?: string) => string
  info: (title: string, message?: string) => string
  // 新增：会话完成通知
  sessionComplete: (title: string, sessionId: string, onSwitch: () => void) => string
}
```

在 create 函数中（第 85 行之后）添加实现：

```typescript
sessionComplete: (title, sessionId, onSwitch) => {
  return get().addToast({
    type: 'session_complete',
    title: `会话「${title}」已完成`,
    sessionId,
    duration: 120000, // 2 分钟
    action: {
      label: '切换',
      onClick: onSwitch,
    },
  })
},
```

- [ ] **Step 5: 验证类型检查通过**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit src/stores/toastStore.ts`
Expected: 无类型错误

---

### Task 2: 更新 Toast 组件样式和交互

**Files:**
- Modify: `src/components/Common/Toast.tsx`

- [ ] **Step 1: 导入 cn 工具函数**

修改第 3 行，添加 cn 导入：

```typescript
import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useToastStore, ToastType } from '@/stores/toastStore'
```

- [ ] **Step 2: 扩展 iconMap 添加 session_complete**

修改第 9-14 行：

```typescript
const iconMap: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  session_complete: CheckCircle,
}
```

- [ ] **Step 3: 扩展 colorMap 添加 session_complete**

修改第 16-37 行：

```typescript
const colorMap: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: 'text-success',
  },
  error: {
    bg: 'bg-danger/10',
    border: 'border-danger/30',
    icon: 'text-danger',
  },
  warning: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: 'text-warning',
  },
  info: {
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    icon: 'text-primary',
  },
  session_complete: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: 'text-success',
  },
}
```

- [ ] **Step 4: 修改 ToastContainer 位置为相对定位**

修改第 39-51 行的 ToastContainer 函数：

```typescript
export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="absolute right-0 top-0 transform -translate-y-full -translate-y-2 z-50 flex flex-col gap-2 max-w-sm w-max pr-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 更新 ToastItemProps 接口支持 action**

修改第 53-61 行：

```typescript
interface ToastItemProps {
  toast: {
    id: string
    type: ToastType
    title: string
    message?: string
    action?: {
      label: string
      onClick: () => void
    }
  }
  onClose: () => void
}
```

- [ ] **Step 6: 修改 ToastItem 组件支持交互按钮**

修改第 63-93 行的 ToastItem 函数：

```typescript
function ToastItem({ toast, onClose }: ToastItemProps) {
  const { t } = useTranslation('common')
  const Icon = iconMap[toast.type]
  const colors = colorMap[toast.type]

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border shadow-lg',
        colors.bg, colors.border,
        'animate-slide-in-right',
        toast.type === 'session_complete' && 'min-w-[280px]'
      )}
      role="alert"
    >
      <Icon size={18} className={cn('shrink-0 mt-0.5', colors.icon)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-text-secondary mt-0.5 break-all">{toast.message}</div>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick()
            onClose()
          }}
          className="shrink-0 px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onClose}
        className="shrink-0 p-1 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-colors"
        aria-label={t('toast.close')}
      >
        <X size={14} />
      </button>
    </div>
  )
}
```

- [ ] **Step 7: 验证类型检查通过**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit src/components/Common/Toast.tsx`
Expected: 无类型错误

---

### Task 3: 会话完成时触发 Toast 通知

**Files:**
- Modify: `src/stores/conversationStore/sessionStoreManager.ts`

- [ ] **Step 1: 在 dispatchEvent 中添加 Toast 通知触发**

找到 `dispatchEvent` 函数中处理 `session_end` 的代码块（约第 377-394 行），在后台会话完成时添加 Toast 通知：

```typescript
if (event.type === 'session_end') {
  newStatus = 'idle'

  // 如果是后台运行的会话，添加通知
  if (get().backgroundSessionIds.includes(routeSessionId)) {
    get().addToNotifications(routeSessionId)
    get().removeFromBackground(routeSessionId)

    // 新增：触发 Toast 通知
    const sessionMetadata = get().sessionMetadata.get(routeSessionId)
    if (sessionMetadata) {
      // 动态导入 toastStore 避免循环依赖
      import('@/stores/toastStore').then(({ useToastStore }) => {
        useToastStore.getState().sessionComplete(
          sessionMetadata.title,
          routeSessionId,
          () => get().switchSession(routeSessionId)
        )
      })
    }
  }
}
```

- [ ] **Step 2: 验证类型检查通过**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit src/stores/conversationStore/sessionStoreManager.ts`
Expected: 无类型错误

---

### Task 4: 调整 App.tsx 中 ToastContainer 位置

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 找到 RightPanel 内的 ChatStatusBar 并包裹容器**

找到约第 549-550 行的 ChatStatusBar 部分，将其包裹在 relative 容器中：

```tsx
{/* 状态栏容器（带通知） */}
<div className="relative">
  {/* Toast 通知区域 */}
  <ToastContainer />

  {/* 对话状态栏 */}
  <ChatStatusBar />
</div>
```

- [ ] **Step 2: 移除底部的全局 ToastContainer**

找到约第 619 行的全局 ToastContainer 并删除：

```tsx
{/* 全局 Toast 通知 - 已移动到 ChatStatusBar 上方 */}
{/* <ToastContainer /> */}
```

直接删除这一行即可。

- [ ] **Step 3: 验证类型检查通过**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit src/App.tsx`
Expected: 无类型错误

---

### Task 5: 确认 CSS 动画存在

**Files:**
- Verify: `src/index.css`

- [ ] **Step 1: 确认 slide-in-right 动画存在**

Run: `grep -n "slide-in-right" src/index.css`
Expected: 找到 animate-slide-in-right 类定义

如果不存在，在 index.css 末尾添加：

```css
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}
```

---

### Task 6: 集成测试

- [ ] **Step 1: 启动开发服务器**

Run: `cd D:/space/base/Polaris && npm run tauri dev`
Expected: 应用正常启动

- [ ] **Step 2: 测试普通 Toast 通知**

在应用中触发一个普通操作（如保存文件），观察 Toast 通知是否显示在 ChatStatusBar 右上方。

- [ ] **Step 3: 测试会话完成通知**

将一个会话切换到后台运行，等待其完成后观察是否弹出会话完成通知。

- [ ] **Step 4: 测试切换功能**

点击会话完成通知的「切换」按钮，验证是否能正确跳转到对应会话。

- [ ] **Step 5: 测试数量限制**

触发 6 个以上的通知，验证是否只显示最新 5 条，最旧的自动消失。

---

### Task 7: 提交代码

- [ ] **Step 1: 提交所有改动**

```bash
git add src/stores/toastStore.ts src/components/Common/Toast.tsx src/stores/conversationStore/sessionStoreManager.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(toast): 会话完成通知支持快速切换

- Toast 通知位置调整至 ChatStatusBar 右上方
- 新增 session_complete 类型支持会话完成通知
- 新增 action 字段支持交互按钮
- 最多显示 5 条通知，超出时移除最旧的
- 会话完成通知 2 分钟后自动消失

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```