# C1 执行计划 · 版式骨架

命令一律**直接调 bin，不走 `pnpm <script>`**——`pnpm test` 会先跑工作区全量 `pnpm install`，本机已复现网络超时失败：

```bash
cd plugins/clipboard-history
./node_modules/.bin/vitest run
./node_modules/.bin/vue-tsc --noEmit
```

## 基线（已测，2026-09-05）

- `vitest run` → **3 文件 / 39 测试全绿**
- `vue-tsc --noEmit` → **0 错误**

收尾时按这两个数字对拍；测试数只能增不能减。

## 步骤

### 1 · 数据层 `src/utils/clipboard-items.ts`

- [ ] 加 `getClipboardSummary`（`ClipboardSummary`：typeLabel / mime / metrics[] / timeLabel）
- [ ] 加 `getClipboardSourceInfo`（displayName / bundleId / icon）
- [ ] 加 `groupFilesByDirectory`（`ClipboardFileGroup[]`，home 路径缩写为 `~`）
- [ ] 删 `getClipboardInfoRows` 与 `ClipboardInfoRow`
- [ ] `getClipboardTitle` 图片分支 → `image/png · 3520×2306`
- [ ] `getClipboardSubtitle` → `类型 · [尺寸] · 时间`，不再取内容文本
- [ ] 补测试：title ≠ subtitle 负控制、summary metrics 形状、文件分组

验证：`./node_modules/.bin/vitest run src/utils/clipboard-items.test.ts`

### 2 · 详情面板 `ClipboardDetail.vue`

- [ ] 高度契约（design.md §3），重点是 `.clipboard-detail` 的 `overflow: auto → hidden`
- [ ] `.preview-surface` 加 `:data-kind="item?.type"`
- [ ] 删 `.detail-heading` 模板与样式
- [ ] 删 `.info-grid` / `.info-row` / `.info-label` / `.info-value` / `.info-value-copy` / `.info-secondary`
- [ ] 加 `.summary-strip`（`.summary-left{min-width:0;overflow:hidden}`，时间 `flex:none`）
- [ ] 加 `.source-row`，标签 chips 并入该行右侧
- [ ] 文件预览换 `.file-tree`（目录头可折叠 + 缩进文件行 + 👁 按钮 `emit('preview', file)`）
- [ ] 洞察区三块（拆词/颜色/OCR）**本任务不动**

### 3 · 列表 `ClipboardSidebar.vue`

- [ ] 缩略图 28px 圆形 → 32px 圆角矩形（`border-radius:7px`）
- [ ] 标题/副标题接第 1 步的新函数
- [ ] 收藏项右侧星标

### 4 · 底栏 `ClipboardActionBar.vue`

- [ ] 收藏 / 删除 → 30×30 `.icon-button`；保留 `<span class="button-text">` + `.sr-only`
- [ ] `data-testid` 与 apply 全称文案不动

验证：`./node_modules/.bin/vitest run src/components/ClipboardActionBar.test.ts` —— 4 条必须全绿且**未改断言**

### 5 · 分类条与底栏 `ClipboardManagerView.vue`

- [ ] 新增 `.category-bar`（10 chip + 右侧计数）
- [ ] 删 `.filter-group`，底栏左侧改 `↑↓ 选择` / `Esc 关闭`
- [ ] 未接分类器的 5 项（链接/视频/颜色/命令/密钥）渲染为 disabled + `title="待 C2 分类器接入"`
- [ ] `ClipboardManagerView.test.ts:353` 的 `.info-value-copy` → `.source-name`（**只改这一处**）
- [ ] 检查 `@media (max-width: 640px)` 分支

### 6 · 收尾

- [ ] `./node_modules/.bin/vue-tsc --noEmit` → 0
- [ ] `./node_modules/.bin/vitest run` → ≥ 39 通过，且被改的断言只有 `.source-name` 那一处
- [ ] 分类条实测宽度 < 700（在真实渲染里量，不信设计稿数字）
- [ ] `node ./scripts/sync-builtin.mjs`
- [ ] `node ./scripts/assert-no-raw-channels.mjs`

## 回滚点

第 1 步（纯数据层，可独立提交）与第 2 步（唯一的视觉风险点）各提交一次。回滚第 2 步只需还原 `ClipboardDetail.vue`。

## 执行记录（2026-09-05）

实现提交：`b887d59fe`，分支 `feature/clipboard-layout-shell`。

| 验证 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | 0 错误 |
| `vitest run` | 49 通过（基线 39，新增 10） |
| `eslint src/` | exit 0，无输出 |
| `scripts/assert-no-raw-channels.mjs` | 通过 |
| `scripts/sync-builtin.mjs` | 已同步 |

改过的既有断言只有两处，都是随 DOM 结构调整选择器、未放宽行为：
`.info-value-copy` → `.source-name` / `.source-bundle`，`.detail-heading h2` → `.text-preview`。

**仍未验证**：分类条 10 项在 720 宽下的实际渲染宽度。jsdom 不做布局，量不了；
需要 `pnpm core:dev` 真机自查。设计稿测得 chips 566 + 计数 38，余量约 76px，但那是 pen 的字体度量。

### 环境事故与修复

`pnpm test` 会先做工作区依赖校验并触发全量 `pnpm install`。该 install 被超时 kill 后，
根 `node_modules/.bin` 与 hoist 链接被删空（`.pnpm` store 完好），导致 pre-commit 的
`check-bin-shims` 直接失败、eslint 无法解析 `@antfu/eslint-config`。

修复：`pnpm install --filter . --prefer-offline --ignore-scripts`（只装根工作区，53s 完成）。
全量 install 三次都卡在少数二进制包的网络下载上。

**本包后续一律直接调 bin**：`./node_modules/.bin/vitest`、`./node_modules/.bin/vue-tsc`。

## 不做

- 洞察路由（C2）、颜色能力（C3）、更多信息折叠区（C4）、文件预览面板（C5）、分享（C6）。
- 👁 按钮只发事件，不实现预览。
