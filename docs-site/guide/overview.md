# 界面总览

<div class="ui-preview">
  <div class="ui-preview-bar">
    <div class="ui-dot red"></div>
    <div class="ui-dot yellow"></div>
    <div class="ui-dot green"></div>
    <span style="margin-left: 12px; color: var(--polaris-text-muted); font-size: 12px;">Polaris — 智能桌面助手</span>
  </div>
  <div class="ui-preview-body" style="display: flex; gap: 2px; min-height: 200px;">
    <div style="width: 48px; background: #12131c; border-radius: 6px; display: flex; flex-direction: column; align-items: center; padding: 8px 0; gap: 8px;">
      <div style="width:28px; height:28px; border-radius:6px; background: var(--polaris-accent); display:flex; align-items:center; justify-content:center; font-size:12px;">📁</div>
      <div style="width:28px; height:28px; border-radius:6px; background: transparent; display:flex; align-items:center; justify-content:center; font-size:12px; opacity:0.5;">🔀</div>
      <div style="width:28px; height:28px; border-radius:6px; background: transparent; display:flex; align-items:center; justify-content:center; font-size:12px; opacity:0.5;">✅</div>
      <div style="width:28px; height:28px; border-radius:6px; background: transparent; display:flex; align-items:center; justify-content:center; font-size:12px; opacity:0.5;">🌐</div>
      <div style="width:28px; height:28px; border-radius:6px; background: transparent; display:flex; align-items:center; justify-content:center; font-size:12px; opacity:0.5;">⏰</div>
    </div>
    <div style="flex: 1; background: #141520; border-radius: 6px; padding: 12px; font-size: 12px; color: var(--polaris-text-muted);">
      <div style="color: var(--polaris-text); font-weight: 600; margin-bottom: 8px;">LeftPanel</div>
      <div style="opacity: 0.5;">文件浏览器 / Git / 翻译 ...</div>
    </div>
    <div style="flex: 2; background: #141520; border-radius: 6px; padding: 12px; font-size: 12px; color: var(--polaris-text-muted);">
      <div style="color: var(--polaris-text); font-weight: 600; margin-bottom: 8px;">CenterStage</div>
      <div style="opacity: 0.5;">代码编辑器</div>
    </div>
    <div style="flex: 2; background: #141520; border-radius: 6px; padding: 12px; font-size: 12px; color: var(--polaris-text-muted);">
      <div style="color: var(--polaris-text); font-weight: 600; margin-bottom: 8px;">RightPanel</div>
      <div style="background: #1a1b26; border-radius: 4px; padding: 8px; margin-top: 4px;">
        <div style="color: #8b5cf6; font-size: 11px;">AI: 你好！有什么可以帮你的？</div>
      </div>
    </div>
  </div>
</div>

## 四大区域

<div class="feature-grid">
  <div class="feature-item">
    <div class="feature-icon">📌</div>
    <h4>ActivityBar</h4>
    <p>最左侧图标栏，提供各功能面板的快速切换入口，支持折叠为悬浮扇形菜单</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">📂</div>
    <h4>LeftPanel</h4>
    <p>左侧功能面板（文件、Git、翻译等），宽度 200~600px 可调</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">📝</div>
    <h4>CenterStage</h4>
    <p>中间编辑区，打开文件时显示代码编辑器，多标签页切换</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">🤖</div>
    <h4>RightPanel</h4>
    <p>右侧 AI 对话面板，默认宽度 400px，可折叠</p>
  </div>
</div>

## ActivityBar 功能入口

<table class="custom-table">
  <thead>
    <tr><th>图标</th><th>功能</th><th>说明</th></tr>
  </thead>
  <tbody>
    <tr><td>📁</td><td>文件浏览器</td><td>浏览工作区文件，新建/重命名/删除</td></tr>
    <tr><td>🔀</td><td>Git 版本控制</td><td>查看变更、提交、分支管理</td></tr>
    <tr><td>✅</td><td>待办事项</td><td>创建和管理任务清单</td></tr>
    <tr><td>🌐</td><td>翻译工具</td><td>多语言互译</td></tr>
    <tr><td>⏰</td><td>定时任务</td><td>创建和管理定时/周期任务</td></tr>
    <tr><td>📋</td><td>需求管理</td><td>需求的创建、跟踪和原型管理</td></tr>
    <tr><td>💻</td><td>终端</td><td>内置命令行终端</td></tr>
    <tr><td>🔧</td><td>开发者工具</td><td>MCP 服务器管理等开发工具</td></tr>
    <tr><td>🤖</td><td>平台集成</td><td>QQ 机器人、飞书等平台集成</td></tr>
  </tbody>
</table>

## 小屏模式

当窗口宽度小于 500px 时自动切换：

<div class="info-card warning">
  <div class="card-title">⚡ 小屏模式</div>
  <p>隐藏 ActivityBar（显示悬浮触发器）、左侧面板和编辑区，仅显示 AI 对话面板。</p>
</div>
