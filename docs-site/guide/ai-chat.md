# AI 对话

AI 对话是 Polaris 的核心功能，位于右侧面板。

<div class="feature-grid">
  <div class="feature-item">
    <div class="feature-icon">💬</div>
    <h4>流式对话</h4>
    <p>实时流式输出，完整 Markdown 渲染</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">📑</div>
    <h4>多会话管理</h4>
    <p>独立会话上下文，历史记录持久化</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">🪟</div>
    <h4>多开窗口</h4>
    <p>最多 16 窗口分屏，支持 1~2 行布局</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">⚡</div>
    <h4>快捷片段</h4>
    <p>输入 <span class="shortcut">/</span> 快速插入常用提示词</p>
  </div>
</div>

## 基本使用

<div class="step-card">
  <div class="step-number">1</div>
  <div class="step-content">
    <h4>输入消息</h4>
    <p>在右侧面板底部输入框中输入消息，按 <span class="shortcut">Enter</span> 发送，<span class="shortcut">Shift</span> + <span class="shortcut">Enter</span> 换行</p>
  </div>
</div>

<div class="step-card">
  <div class="step-number">2</div>
  <div class="step-content">
    <h4>查看回复</h4>
    <p>AI 以流式方式返回回复，实时渲染为富文本格式</p>
  </div>
</div>

<div class="step-card">
  <div class="step-number">3</div>
  <div class="step-content">
    <h4>继续对话</h4>
    <p>在同一会话中持续对话，AI 会记住上下文</p>
  </div>
</div>

## 多会话窗口

点击右上角的多窗口按钮进入多会话模式：

<table class="custom-table">
  <thead>
    <tr><th>配置项</th><th>说明</th></tr>
  </thead>
  <tbody>
    <tr><td>最大窗口数</td><td>16 个 <span class="badge blue">最多</span></td></tr>
    <tr><td>布局行数</td><td>1 行 或 2 行</td></tr>
    <tr><td>窗口宽度</td><td>可自定义每个格子宽度</td></tr>
    <tr><td>全屏展开</td><td>双击任意窗口可全屏查看</td></tr>
  </tbody>
</table>

## 支持的内容渲染

<div class="feature-grid">
  <div class="feature-item">
    <div class="feature-icon">📝</div>
    <h4>Markdown</h4>
    <p>标题、列表、表格、引用、链接</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">🖥️</div>
    <h4>代码块</h4>
    <p>自动语法高亮，20+ 语言支持</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">📊</div>
    <h4>Mermaid 图表</h4>
    <p>流程图、时序图、甘特图等</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">🖼️</div>
    <h4>图片</h4>
    <p>支持内嵌图片显示</p>
  </div>
</div>

## System Prompt

可在 **设置 → System Prompt** 中自定义 AI 的系统提示词，为每个工作区设定专属角色和行为风格。

<div class="info-card tip">
  <div class="card-title">💡 提示</div>
  <p>对话过长时，较早的消息会被自动压缩以节省内存，关键信息会保留。</p>
</div>

<div class="info-card warning">
  <div class="card-title">⚠️ 注意</div>
  <p>对话会消耗 AI 模型的 API Token，请注意控制用量。可在 AI 引擎设置中查看用量统计。</p>
</div>
