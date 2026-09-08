# 跨子任务技术设计

父任务设计文档。只写**跨子任务的契约与集成边界**；各子任务内部的实现细节写在各自的 `design.md` / `implement.md`。

## 1. 改动边界

全部落在 `plugins/clipboard-history/src/` 内。**不触碰** `@talex-touch/utils` 的 transport 契约、主进程 clipboard 模块、数据库 schema、CoreBox 窗口逻辑。

集成后 `git diff --stat` 不应包含 `apps/core-app/src/main/` 下任何文件（`scripts/sync-builtin.mjs` 同步产生的 `apps/core-app/resources/bundled-plugins/clipboard-history` 除外）。

| 文件 | C1 | C2 | C3 | C4 |
| --- | --- | --- | --- | --- |
| `views/ClipboardManagerView.vue` | 分类条、底栏 | 接分类判定 | — | — |
| `components/ClipboardSidebar.vue` | 行结构、缩略图 | — | — | — |
| `components/ClipboardDetail.vue` | 高度契约、摘要条、来源行、文件树 | 洞察路由 | 色卡 / 主题色条 | 折叠区 |
| `components/ClipboardActionBar.vue` | 图标按钮 | — | — | — |
| `utils/clipboard-items.ts` | summary / source / subtitle | 分类器 + 洞察选择 | 颜色格式与对比度 | — |
| `utils/clipboard-colors.ts`（新） | — | — | 量化与格式转换 | — |

## 2. 跨子任务契约

C1 与 C2 并行开工，靠下面两个类型对齐；先合的一方负责把类型声明落到 `utils/clipboard-items.ts`。

```ts
// C2 提供，C1 的分类条与 C2 的洞察路由共用
export type ClipboardShape =
  | 'text' | 'link' | 'image' | 'video' | 'files' | 'color' | 'secret' | 'favorite'

export function classifyClipboardItem(item: PluginClipboardItem): ClipboardShape[]

// C1 提供，C4 的折叠区按同一份数据决定"哪些下沉"
export interface ClipboardSummary {
  typeLabel: string      // 文本 / 富文本 / 图片 / 文件 / 颜色
  mime: string           // 文件类型缩写为 x-tuff-files，全称会与时间戳重叠
  metrics: string[]      // ['84 字符','1 行'] | ['3520 × 2306','7.2 MB'] | ['3 个文件']
  timeLabel: string      // 摘要条用短格式；完整时间戳归 C4 的折叠区
}
export function getClipboardSummary(item: PluginClipboardItem): ClipboardSummary
```

`getClipboardInfoRows` / `ClipboardInfoRow` 由 C1 删除。`getClipboardSubtitle` 由 C1 改写（不再取内容文本）。C2 不要同时改这两处，避免语义合并冲突——[[semantic-merge-breaks-the-base]]：两个各自全绿的 PR 合并后 base 可能编译不过，双方各加一节时 git 会两个都留。

## 3. 高度契约的唯一真相

四个子任务都会往 `.info-surface` 里塞东西，必须共守 C1 定的这套 flex：

```css
.clipboard-detail { overflow: hidden; }              /* 现有 bug 根因：这里是 auto，preview 的 flex:1 从未被约束过 */
.preview-surface  { flex: 0 1 auto; min-height: 96px; max-height: 45%; overflow: auto; }
.info-surface     { flex: 1 1 auto; min-height: 0;   overflow: auto; }
```

任何子任务都**不得**给 `.info-surface` 的子节点加固定高度或 `overflow: visible`——折叠区展开（C4）与色卡网格（C3）都靠 `.info-surface` 自身滚动兜底。

pen 稿实测落点（容器高 456）：

| 屏 | 详情自然高度 | 预览区 | 详情区 |
| --- | --- | --- | --- |
| S1 链接文本 | 299 | 157 | 299 |
| S2 图片 | 263 | 191 | 263 |
| S3 文件（树） | 121 | 240 | 216 |
| S5 颜色 | 299 | 157 | 299 |

## 4. 集成顺序与回滚

```
C1 版式骨架 ─┬─> C4 更多信息折叠区
             └─> C5 文件预览（单独排期，含主进程能力评审）
C2 分类与洞察 ──> C3 颜色能力
```

- C1、C2 可并行，但**分别单独合**；两个都合完再开 C3 / C4。
- C5 的主进程能力（`previewClipboardFile`）**独立成 PR、独立评审、先于所有预览渲染器合入**——它是本次唯一触碰安全边界的改动。
- 每个子任务独立成 PR，独立可验证（各自的 Acceptance Criteria 不依赖别的子任务完成）。
- 回滚粒度 = 单个子任务的 PR revert。C1 是唯一改动 `.clipboard-detail` 布局根的任务，回滚它会连带影响 C3/C4/C5 的视觉，所以 C1 必须先稳。

## 5. 已核实的事实（不要再凭假设推进）

1. **主进程从未写过图片调色板 meta。** `grep -rn "dominant_color\|palette\|accent_color" apps/core-app/src/main/modules/clipboard/` 无命中，`getClipboardColorTokens` 对图片恒返回空。C3 因此改为渲染进程侧从缩略图提取。
2. **插件读不到 `~/Downloads` 下的文件。** `tfile:` 的可读根由 `local-file-policy.ts` 的 `getAllowedLocalFileRoots()` 决定，只含 `~/Applications`、app-icon 缓存、`userData`、`temp`、`/Applications`、`/System/*`；`~/Downloads` 被 #914 有意排除（原本是整个 home，可读 `~/.ssh/id_rsa`）。插件 SDK 也没有通用文件读接口。**C5 因此是唯一需要改主进程的子任务**，其 API 以「只收 `(recordId, fileIndex)`、不收路径」保证不重开该口子。
3. **插件渲染不到 CoreBox 头部。** 插件 webview 挂在 `COREBOX_HEADER_HEIGHT = 56` 之下（`window.ts:46`），所以总条数只能放在分类条里，不能放窗口标题栏。pen 稿早期版本画错过一次，已修正。
4. **`CloudShareSDK` 存在但全仓无人使用。** `grep -rln "useCloudShareSDK\|CloudShareSDK" plugins/ apps/core-app/src` 无命中。它支持 `visibility: 'unlisted'` 和任意 JSON 的 `contentInline`（够分享文本/链接/颜色），但 `PluginContentPackage` **没有 URL 字段**、也**没有文件上传通路**，且 `getAuthToken` 拿不到 token 会直接抛。C6 因此有一个开工前阻塞项：先和服务端确认分享链接形状。
5. **测试锁住了三处文案/选择器**：`apply-button` 文案含「粘贴到当前应用」、四个按钮的 pending 文案、`.info-value-copy` 选择器。前两条必须迁就，第三条随 `.info-grid` 删除后同步改测试——[[tests-can-encode-the-defect]]，只改这一处选择器，别顺手放宽别的断言。

## 6. 风险

| 风险 | 归属 | 处理 |
| --- | --- | --- |
| 分类条 9 项在 720 宽下溢出 | C1 | pen 稿实测 632px，留 68px 余量；实现后用真实字体再量一次，超了就先砍图标不砍标签 |
| 摘要条与时间戳重叠（图片/文件类型） | C1 | `.summary-left { min-width:0; overflow:hidden }` + 时间戳 `flex:none`；文件 MIME 缩写 |
| 渲染进程提色卡顿 | C3 | 只对缩略图（≤32px 级别的小图）量化；按 item.id 缓存；切换记录时不重算 |
| 折叠区展开撑破面板 | C4 | 依赖 §3 的 `.info-surface` 滚动，不加固定高度 |
| C1/C2 并行改同一个文件 | 集成 | `ClipboardDetail.vue` 两边都动：C1 改结构骨架与样式，C2 只在洞察容器内加组件；先合 C1，C2 rebase |
