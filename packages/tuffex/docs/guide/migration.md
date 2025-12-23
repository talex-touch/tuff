# 迁移指南

本指南帮助你将现有项目逐步迁移到 TuffEx（`@talex-touch/tuffex`），并统一使用 `--tx-*` 设计令牌。

## 从 core-app 旧组件迁移（推荐）

在 core-app 迁移期，建议：
1. 旧组件继续保留，避免一次性大改导致风险。
2. 新页面/新功能优先直接使用 `Tx*` 组件。
3. 对已有页面按“最常用的基础组件”逐步替换。

### 常见组件映射

| core-app 旧组件 | TuffEx 新组件 | 说明 |
|---|---|---|
| `TButton` | `TxButton` | 基础按钮 |
| `FlatButton` | `TxFlatButton` | 扁平按钮 |
| `FlatInput` | `TxInput` | 输入框（旧版内部可能依赖 UI 框架能力，建议逐页替换） |
| `TBottomDialog` | `TxBottomDialog` | 底部弹窗 |
| `TBlowDialog` | `TxBlowDialog` | 气泡弹窗 |
| `TuffDrawer` | `TxDrawer` | 抽屉 |
| `TTag` | `TxTag` | 标签 |

## 安装与使用

```bash
npm install @talex-touch/tuffex
```

```ts
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

import App from './App.vue'

createApp(App).use(TuffUI).mount('#app')
```

## 主题与 CSS 变量

TuffEx 使用 `--tx-*` 作为设计令牌。

```css
:root {
  --tx-color-primary: #409eff;
  --tx-text-color-primary: #303133;
}
```

如果你的项目里仍存在旧的主题变量，建议统一迁移为 `--tx-*`，避免组件样式出现不一致。

## 版本升级（若你使用过旧命名）

如果历史代码中存在旧前缀或旧变量名，可以按以下原则迁移：

- 组件名：`TouchButton` / `touch-button` → `TxButton` / `<TxButton />`
- CSS 变量：`--touch-*` → `--tx-*`
