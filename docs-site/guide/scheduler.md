# 定时任务

自动执行预设操作，支持一次性、定时和间隔任务。

<div class="feature-grid">
  <div class="feature-item">
    <div class="feature-icon">🕐</div>
    <h4>一次性任务</h4>
    <p>指定时间执行一次</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">🔄</div>
    <h4>Cron 定时</h4>
    <p>Cron 表达式灵活调度</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">🔁</div>
    <h4>固定间隔</h4>
    <p>按固定时间间隔循环执行</p>
  </div>
</div>

## 创建任务

<div class="step-card">
  <div class="step-number">1</div>
  <div class="step-content">
    <h4>打开定时任务面板</h4>
    <p>点击 ActivityBar 的 <strong>时钟</strong> 图标</p>
  </div>
</div>

<div class="step-card">
  <div class="step-number">2</div>
  <div class="step-content">
    <h4>填写任务配置</h4>
    <p>设置名称、触发类型、提示词、工作目录等</p>
  </div>
</div>

<div class="step-card">
  <div class="step-number">3</div>
  <div class="step-content">
    <h4>保存并启用</h4>
    <p>保存后任务自动启用，到时间自动执行</p>
  </div>
</div>

## 任务配置说明

<table class="custom-table">
  <thead>
    <tr><th>配置项</th><th>说明</th><th>必填</th></tr>
  </thead>
  <tbody>
    <tr><td>任务名称</td><td>任务的显示名称</td><td><span class="badge red">必填</span></td></tr>
    <tr><td>描述</td><td>任务的补充说明</td><td><span class="badge yellow">可选</span></td></tr>
    <tr><td>触发类型</td><td>一次性 / Cron / 间隔</td><td><span class="badge red">必填</span></td></tr>
    <tr><td>触发值</td><td>Cron 表达式或间隔时间</td><td><span class="badge red">必填</span></td></tr>
    <tr><td>提示词</td><td>执行时发送给 AI 的内容</td><td><span class="badge red">必填</span></td></tr>
    <tr><td>工作目录</td><td>任务执行的工作目录</td><td><span class="badge yellow">可选</span></td></tr>
    <tr><td>AI 引擎</td><td>执行使用的 AI 引擎</td><td><span class="badge yellow">可选</span></td></tr>
  </tbody>
</table>

## 任务管理

<div class="feature-grid">
  <div class="feature-item">
    <div class="feature-icon">▶️</div>
    <h4>手动执行</h4>
    <p>不等待定时，立即运行一次</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">⏸️</div>
    <h4>启用/禁用</h4>
    <p>暂停或恢复任务的自动执行</p>
  </div>
  <div class="feature-item">
    <div class="feature-icon">📜</div>
    <h4>日志追踪</h4>
    <p>查看每次执行的时间、结果和输出</p>
  </div>
</div>
