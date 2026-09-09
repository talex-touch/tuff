# C1 技术设计 · 版式骨架

## 1. 文件与改动性质

| 文件 | 改动 |
| --- | --- |
| `src/utils/clipboard-items.ts` | 新增 `getClipboardSummary` / `getClipboardSourceInfo` / `groupFilesByDirectory`；删除 `getClipboardInfoRows`；重写 `getClipboardSubtitle`、调整 `getClipboardTitle` |
| `src/components/ClipboardDetail.vue` | 高度契约、删 heading/info-grid、加 summary-strip/source-row、文件树 |
| `src/components/ClipboardSidebar.vue` | 缩略图 32px 圆角矩形、副标题语义、收藏星标 |
| `src/components/ClipboardActionBar.vue` | 收藏/删除改图标按钮 |
| `src/views/ClipboardManagerView.vue` | 分类条（壳）、底栏键位提示、移除筛选 chips |
| 三个 `*.test.ts` | 跟随契约更新 |

## 2. 数据层契约

```ts
export interface ClipboardSummary {
  typeLabel: string    // 文本 / 富文本 / 图片 / 文件
  mime: string         // text/plain、image/png、x-tuff-files（缩写，全称会与时间戳挤）
  metrics: string[]    // ['84 字符','1 行'] | ['3520 × 2306','7.2 MB'] | ['3 个文件']
  timeLabel: string    // 09/05 03:49
}
export function getClipboardSummary(item: PluginClipboardItem): ClipboardSummary

export interface ClipboardSourceInfo {
  displayName: string
  bundleId: string | null
  icon: string | null
}
export function getClipboardSourceInfo(
  item: PluginClipboardItem,
  app?: ResolvedApplication | null,
): ClipboardSourceInfo

export interface ClipboardFileNode { name: string; path: string; dir: string }
export interface ClipboardFileGroup { dir: string; files: ClipboardFileNode[] }
export function groupFilesByDirectory(content: string | null | undefined): ClipboardFileGroup[]
```

`getClipboardInfoRows` / `ClipboardInfoRow` 删除。

`getClipboardTitle`：图片分支从 `image/png · 3520 × 2306 · 7.2 MB` 改为 `image/png · 3520×2306`（去文件大小、`×` 两侧不留空格）——原串在 264 宽列表里必然折行。

`getClipboardSubtitle`：

```
before: text  -> `${内容第二行或第一行} · ${时间}`   // 与 title 同源，纯文本时完全重复
after:  text  -> `文本 · ${时间}`
        image -> `图片 · ${文件大小} · ${时间}`
        files -> `文件 · ${时间}`
```

`groupFilesByDirectory`：用 `parseFileList` 拿路径数组，按 `path.slice(0, lastIndexOf('/'))` 分组，目录名做 home 缩写（`/Users/x/…` → `~/…`），保持首次出现顺序。

## 3. 高度契约（四个子任务共守）

```css
.clipboard-detail { display:flex; flex-direction:column; overflow:hidden; }
.preview-surface  { flex:0 1 auto; min-height:96px; max-height:45%; overflow:auto; }
.preview-surface[data-kind='image'] { min-height:200px; }
.preview-surface[data-kind='files'] { max-height:60%; }
.info-surface     { flex:1 1 auto; min-height:0; overflow:auto; }
```

`.clipboard-detail` 从 `overflow:auto` 改 `hidden` 是全链路成立的前提——现在整个详情面板可滚动，所以 `.preview-surface` 的 `flex:1` 从未被真正约束过，这就是"预览占半屏、信息被挤到滚动"的根因。

## 4. 详情区结构

```
section.clipboard-detail
├─ .preview-surface[data-kind]     内容本体（唯一一份）
└─ .info-surface
   ├─ .summary-strip   [徽章] mime · metrics…              时间（右对齐）
   ├─ .source-row      图标 + 名称/bundleId                 标签 chips（右对齐）
   ├─ hr
   └─ (洞察容器)        C2 填充；本任务先保留现有拆词/颜色/OCR 三块不动
```

删除 `.detail-heading`（`eyebrow` + `h2`）与 `.info-grid` / `.info-row` / `.info-label` / `.info-value` / `.info-value-copy` / `.info-secondary` 全套。

`.summary-left { min-width:0; overflow:hidden }` + `.summary-time { flex:none }`——否则图片类型的 `image/png · 3520 × 2306 · 7.2 MB` 会和时间戳重叠（pen 稿复现过）。

## 5. 文件树

`.file-list` 的 `<ul>` 换成：

```
.file-tree
├─ .file-dir (button, aria-expanded)   ▾ ~/Downloads              2 项
│  └─ .file-row × n                       [图标|缩略图] 文件名   大小  👁
└─ .file-dir …
```

- 目录默认全展开；折叠状态是组件内 `Set<string>`，不持久化。
- 图片类文件的图标位放缩略图（沿用 `resolveListImageSrc` 的同一套判定）。
- 👁 按钮本任务只渲染 + 触发 `emit('preview', file)`，**不实现预览面板**（C5 负责）；父组件暂时不接这个事件。

## 6. 分类条（壳）

```
.category-bar (38px, bg-subtle, 下边框)
├─ .category-chips   10 个 chip：全部 文本 链接 图片 视频 文件 颜色 命令 密钥 收藏
└─ .record-count     1076 条（右对齐）
```

chip = lucide 图标 + 中文标签，`padding: 0 7px; gap: 4px; height: 26px`。**720 宽实测 chips 566 + 计数 38 + 间距 = 约 624**，留 76px 余量。

本任务的判定先接现有能力：`全部`=无过滤、`文本/图片/文件`=`item.type`、`收藏`=`isFavorite`；`链接/视频/颜色/命令/密钥` 先渲染为 disabled 并加 `title="待 C2 分类器接入"`，C2 合入后替换。**不要为了让它们能点就临时写一套判定**，那会和 C2 的分类器打架。

## 7. 底栏

- 移除 `.filter-group`（上移到分类条），左侧改键位提示：`↑↓ 选择` / `Esc 关闭`。
- `复制` / `粘贴到当前应用` 保留全称 + 快捷键胶囊。
- `收藏` / `删除` 改 30×30 `.icon-button`。

**兼容**：`ClipboardActionBar.test.ts:57-60` 断言四个按钮 pending 文案。图标按钮仍渲染 `<span class="button-text">`，非 pending 态加 `.sr-only`（`position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)`），pending 态去掉该类。`data-testid` 全不变。

## 8. 测试影响

| 断言 | 处理 |
| --- | --- |
| `ClipboardActionBar.test.ts:38` apply 文案含「粘贴到当前应用」 | 迁就，保留全称 |
| `ClipboardActionBar.test.ts:57-60` 四个 pending 文案 | 迁就，见 §7 |
| `ClipboardManagerView.test.ts:123` `.insight-title` 含「拆词」 | 本任务不动洞察区，应保持绿 |
| `ClipboardManagerView.test.ts:353` `.info-value-copy` 含来源应用名 | 该类名随 `.info-grid` 删除 → 改断言 `.source-name`。**只改这一处选择器** |

新增用例（`clipboard-items.test.ts`）：
- 纯文本项 `getClipboardTitle(item) !== getClipboardSubtitle(item)`（R2 的可执行形式）
- `getClipboardSummary` 对三种 type 的 `metrics` 形状
- `groupFilesByDirectory` 分组与 home 缩写

## 9. 风险

| 风险 | 处理 |
| --- | --- |
| `flex:0 1 auto` + `max-height:45%` 在 640 断点下预览只剩 78px | `min-height:96px` 优先级更高，浏览器取 96；详情区被压到 78 并自身滚动，可接受 |
| 分类条 10 项溢出 | 已用真实字号在 pen 稿量过 566px；实现后再量一次真实渲染，超了先砍图标不砍标签 |
| 列表新增计数行挤压 640 断点 | 计数移到分类条，列表不加行，无此风险 |
