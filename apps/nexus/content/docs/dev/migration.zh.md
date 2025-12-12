---
title: 旧版插件迁移指南
description: 从旧版插件升级到 sdkapi 251212+，接入权限系统与输入体系（acceptedInputTypes / TuffQuery / allowInput）
---

# 旧版插件迁移指南

这篇文档专门给「老插件」用：没声明 `sdkapi`（或版本低）、还把 `query` 当字符串用、Feature 不支持剪贴板图片/文件输入、监听 CoreBox 输入却收不到事件。

迁移目标就一句话：**升级到 `sdkapi: 251212`，按新格式声明权限，并适配新输入体系（`acceptedInputTypes` + `TuffQuery`），需要实时输入时再启用 `allowInput()`**。

## 迁移清单（建议按顺序做）

1. `manifest.json`：补 `sdkapi`
2. `manifest.json`：按新格式声明 `permissions` + `permissionReasons`
3. `manifest.json`：为相关 Feature 增加 `acceptedInputTypes`
4. `index.js` 生命周期：兼容 `query: string | TuffQuery`
5. UI/监听：需要时显式调用 `box.allowInput()`（否则收不到输入事件）

## 1) 声明 sdkapi（开启权限强校验）

`sdkapi` 用来声明插件兼容的 SDK API 版本（格式 `YYMMDD`）。从 `251212` 开始，权限系统会对插件做强校验。

- 未声明或 `< 251212`：为了兼容老插件，会跳过权限强校验，但会提示「旧版 SDK」警告。
- `>= 251212`：启用完整权限校验（推荐）。

在 `manifest.json` 顶层加上：

```json
{
  "sdkapi": 251212
}
```

## 2) 权限：从旧格式迁到新格式（required/optional + reasons）

老格式（兼容但不推荐）：

```json
{
  "permissions": ["clipboard.read", "network.internet"]
}
```

新格式（推荐）：

```json
{
  "permissions": {
    "required": ["clipboard.read", "network.internet"],
    "optional": ["storage.shared"]
  },
  "permissionReasons": {
    "clipboard.read": "读取剪贴板内容用于处理输入",
    "network.internet": "访问外部服务 API",
    "storage.shared": "跨设备/跨插件共享数据（可选）"
  }
}
```

迁移建议：

- `required` 放「不授权就没法用」的核心能力。
- `optional` 放「不授权也能跑，只是少点功能」的增强能力。
- `permissionReasons` 必写清楚，不然用户只会觉得你在要命。

更多细节见：[`Permission 权限系统`](./api/permission.zh.md)。

## 3) 输入：声明 acceptedInputTypes（剪贴板图片/文件/富文本）

### 3.1 acceptedInputTypes 是写在 Feature 里的

要接入新输入体系，关键字段是 **`features[].acceptedInputTypes`**。

支持类型：
- `text`：纯文本
- `image`：图片（data URL）
- `files`：文件路径列表（JSON 字符串）
- `html`：富文本（`rawContent` 为 HTML）

示例（图片 OCR Feature）：

```json
{
  "features": [
    {
      "id": "image-ocr",
      "name": "图片 OCR",
      "acceptedInputTypes": ["image"]
    }
  ]
}
```

### 3.2 为什么你不写就“看不到”？

当查询里带了非文本输入（比如剪贴板是图片/文件）时，搜索会自动过滤掉没声明对应 `acceptedInputTypes` 的 Feature。

你想让 Feature 在「剪贴板是图片/文件」这种场景还能被触发，就老老实实把类型写上。

更多细节见：[`搜索匹配 API（含输入路由）`](./api/search.zh.md)。

## 4) 代码：兼容 query 的两种形态（string / TuffQuery）

新版本下，`onFeatureTriggered(featureId, query, feature)` 的 `query` 可能是：

- `string`：旧版纯文本查询（兼容）
- `TuffQuery`：新对象 `{ text, inputs? }`

建议你统一这么写（JS/TS 都能用）：

```js
async onFeatureTriggered(featureId, query, feature) {
  const queryText = typeof query === 'string' ? query : (query?.text ?? '')
  const inputs = typeof query === 'string' ? [] : (query?.inputs ?? [])

  const imageInput = inputs.find(i => i.type === 'image')
  const filesInput = inputs.find(i => i.type === 'files')
  const htmlInput = inputs.find(i => i.type === 'html')
  const textInput = inputs.find(i => i.type === 'text')

  if (filesInput) {
    let paths = []
    try { paths = JSON.parse(filesInput.content) } catch {}
    // paths: string[]
  }
}
```

## 5) allowInput：输入变更监听现在要显式开启

你以前可能只注册了 `core-box:input-change`，然后发现啥也收不到——这不是你玄学，是现在要先开闸：

```ts
import { useBox, useChannel } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const channel = useChannel()

await box.allowInput()
channel.regChannel('core-box:input-change', ({ data }) => {
  console.log('input:', data.input)
})
```

如果你还需要持续监听剪贴板变化（而不是“触发时带 inputs”），用 `box.allowClipboard()`，见：[`Box SDK`](./api/box.zh.md)。

## 常见踩坑（踩一次就够了）

- **加了 `sdkapi: 251212` 之后 API 突然报 `PERMISSION_DENIED`**：你开启了强校验但没声明/没授权权限；用 `permission.request()` 或让用户在插件详情页授权。
- **剪贴板是图片/文件时你的 Feature 消失了**：没写 `acceptedInputTypes`，或者类型写错。
- **`query.trim is not a function`**：你把 `TuffQuery` 当字符串用了，按第 4 节改。
- **文件输入解析失败**：`files` 的 `content` 是 JSON 字符串，记得 `JSON.parse` + try/catch。

## 相关文档

- [`Manifest 参考`](./manifest.zh.md)
- [`Permission 权限系统`](./api/permission.zh.md)
- [`Box SDK（allowInput / allowClipboard）`](./api/box.zh.md)
- [`搜索匹配 API（acceptedInputTypes / TuffQuery）`](./api/search.zh.md)
- [`Plugin Context（生命周期钩子）`](./api/plugin-context.zh.md)

