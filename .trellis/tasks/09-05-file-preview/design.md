# C5 技术设计 · 文件预览

## 0. 为什么这份文档到此为止

C5 的 PRD 与父任务的集成计划都写了同一句话：**R1 的主进程能力应当独立成 PR、独立安全评审、
先于所有渲染器合入**。摸清接线后这个判断更硬了 —— 它要动 **10 个文件、跨 2 个包**，
并新增一条会出现在用户权限界面里的权限位，正好落在 #914 修过的那条边界上。

当前分支 `feature/clipboard-layout-shell` 已经承载 C1–C4 四个纯渲染层改动。
把一条安全边界能力 + 一个新权限塞进这条分支，等于让 UI 重排的 review 顺带批准了
文件读取能力。**所以本任务停在设计完成，实现另起分支。**

## 1. R1 的完整接线链路（已逐一确认）

沿用 `ClipboardEvents.getImageUrl` 的既有形状：

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `packages/utils/types/clipboard.ts` | `ClipboardPreviewFileRequest` / `ClipboardPreviewFileResponse` |
| 2 | `packages/utils/transport/events/index.ts:2579` 附近 | `previewFile: defineEvent('clipboard').module('history').event('preview-file').define<...>()` |
| 3 | `packages/utils/transport/security/plugin-facing-events.ts:83` 附近 | 加进 ClipboardEvents 白名单（注释里的计数 15 要同步改） |
| 4 | `packages/utils/permission/registry.ts:66` 后 | 新增 `clipboard.preview-file`，`risk: HIGH` |
| 5 | `packages/utils/i18n/message-keys.ts:87` 附近 + 各 locale | 新权限的 name / desc 文案 |
| 6 | `apps/core-app/src/main/modules/clipboard/clipboard-transport-handlers.ts:174` 附近 | `transport.on(ClipboardEvents.previewFile, …)`，`enforcePermission(…, 'clipboard:preview-file', request)` |
| 7 | `apps/core-app/src/main/modules/clipboard/clipboard-transport-handlers.ts:60` 附近 | handler 接口加 `previewFile` |
| 8 | `apps/core-app/src/main/modules/clipboard.ts:1371` 附近 | 把 handler 接到 persistence |
| 9 | `apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts:732` 后 | 实现（见 §2） |
| 10 | `packages/utils/plugin/sdk/clipboard.ts:500` 附近 | SDK 方法 |

测试落点：`clipboard-transport-handlers.test.ts`（已有 `getImageUrl: vi.fn()` 的 mock 桌面）
与 persistence 的新用例。

## 2. 实现约束（安全性全部来自这里）

```ts
previewClipboardFile(recordId: number, fileIndex: number, options?: { maxTextBytes?: number })
```

1. **签名里没有 path。** 主进程用 `recordId` 从自己的库里取该记录的文件列表，
   用 `fileIndex` 取第 N 个路径。渲染进程无法指名任意文件 —— 这是全部安全性所在。
   照抄 `getImageUrl` 的 `getItemById(id)` 前置校验形状。
2. **记录不存在 / 类型不是 files / index 越界 → 直接拒绝，且不触碰文件系统。**
   顺序很重要：先查库、再判越界、最后才 `fs`。
3. **读取上限**：文本头部 256 KB，二进制 20 MB。超限返回 `{ kind: 'too-large' }`，
   **在 stat 阶段就返回，不能读完再判**。
4. **权限位** `clipboard.preview-file`，`risk: HIGH`，与 `clipboard.read` 分开 ——
   能读剪贴板元信息不等于能读磁盘文件。

### 负向测试（缺一不可）

| 输入 | 期望 |
| --- | --- |
| 不存在的 `recordId` | 拒绝，且 `fs.readFile` 未被调用 |
| `fileIndex` 越界（含 -1） | 拒绝，且 `fs.readFile` 未被调用 |
| 记录类型不是 `files` | 拒绝 |
| 20 MB + 1 字节的文件 | `too-large`，且 `fs.readFile` 未被调用（只 stat） |
| 权限位关闭 | `enforcePermission` 抛出，handler 不执行 |

> 用户确实复制过 `~/.ssh/id_rsa` 时**允许**读取——那是用户自己放进剪贴板的。
> 真正的用户侧闸门是第 4 条权限位，所以「权限关闭时被拒」这条测试不能省。

## 3. R2 / R3 渲染层（R1 合入后再做）

- 预览接管：点 👁 → 预览区被接管，顶部返回条（`‹ 文件名` + `类型 · 大小`），
  `Esc` / `←` 退回文件树并保留原滚动位置与选中行。
  👁 按钮与 `previewFile` 事件**已由 C1 落地**，父组件目前没接这个事件。
- 22 类渲染器分批：P0 图片 / 纯文本 / Markdown → P1 代码 / JSON / YAML / CSV →
  P2 PDF / 3D / SVG / 压缩包 → P3 其余。清单见 PRD 的 R3 表。
- 10 个状态每类型都要覆盖，见 PRD 的 R3b。
- 依赖成本：语法高亮与 three.js **必须动态 import**，`vite build` 后对比 chunk 清单确认。

## 4. 与已完成部分的衔接

C1 已经产出：文件树、每行的 👁 按钮、`previewFile` 事件、
`.preview-surface[data-kind='files'] { max-height: 60% }` 的高度契约。
R2 只需接住事件并把预览区切成接管态，不用再动版式。
