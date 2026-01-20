# Widget API

## 概述
Widget 用于在 Workspace 或通知中心提供常驻的信息展示与快捷操作。

## 介绍
通过 Manifest 声明 Widget，并在渲染入口挂载 Vue 组件即可启动。

## Widget 类型
| 类型 | 使用场景 |
| --- | --- |
| 面板型 | 固定在 Workspace，展示复杂 UI |
| 浮动型 | 悬浮窗，适合快速操作 |
| 通知中心型 | 以卡片形式展示摘要 |

## 注册
在 Manifest `features` 中声明：
```json
{
  "type": "widget",
  "id": "todo.widget",
  "title": "任务面板",
  "size": { "width": 4, "height": 3 },
  "entry": "src/widget/index.ts"
}
```

## 渲染入口
`src/widget/index.ts`：
```ts
import { createApp } from 'vue'
import Widget from './Widget.vue'

const app = createApp(Widget)
app.mount('#app')
```

## 通信
- 使用 Channel 与主程序同步状态。
- Widget 可以通过 `ctx.widget.send` 与宿主交换尺寸、主题等信息。

## 最佳实践
- UI 与交互遵循系统暗/亮模式。
- 避免复杂动画，确保在 16ms 内完成重绘。
- 提供空状态与错误提示，保持 Apple 式细腻体验。

## 技术原理
- Widget 运行在渲染进程，由宿主窗口托管并负责生命周期管理。
- 与主进程的通信统一走 Channel/Transport 层封装。
