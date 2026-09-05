# C1 · 版式骨架

父任务：`09-05-clipboard-history-detail-relayout`。设计稿：pen 画板 `cdOpX` / `s72Ej9` / `ih3X0`。

## Goal

把管理页从「头部 + 左右分栏 + 混装底栏」改成「头部 + 全宽分类条 + 左右分栏 + 纯动作底栏」，并落定预览区/详情区的高度契约。

## 依赖与顺序

无前置依赖，可与 C2 并行。**C4 依赖本任务**产出的详情区结构（`.summary-strip` / `.source-row` / 洞察容器），所以本任务先合。

## Requirements

### R1 分类条（新增，全宽）

- 位于插件根节点顶部，高 38px，`bg-subtle` + 下边框。
- 9 个分类：全部 / 文本 / 链接 / 图片 / 视频 / 文件 / 颜色 / 密钥 / 收藏；每项 = lucide 图标 + 中文标签，选中态用 accent 描边 + 12% accent 底。
- 右侧对齐显示总条数 `1076 条`。
- **720 宽下不得横向滚动**（实测 9 项 + 计数 ≈ 632px，留 68px 余量）。
- 本任务只做「壳」：分类的判定逻辑由 C2 提供 `classifyClipboardItem`，本任务先接 `type` 三类 + `isFavorite`，其余分类接入 C2 后补。

### R2 高度契约

```css
.clipboard-detail { display:flex; flex-direction:column; overflow:hidden; }  /* was overflow:auto —— 现有 bug 的根因 */
.preview-surface  { flex:1 1 auto; min-height:96px;  max-height:45%; overflow:auto; }
.preview-surface[data-kind='image'] { min-height:200px; }
.preview-surface[data-kind='files'] { max-height:60%; }   /* 文件树本身就是内容 */
.info-surface     { flex:0 1 auto; min-height:0; overflow:auto; }
```

等价于 `预览区 = min( max(内容自然高度, 下限), 上限 )`；剩余空间落在详情区末尾，**不允许出现在预览区与详情区之间**。

### R3 详情区结构

删除 `.detail-heading`（`eyebrow` + `h2`）与整套 `.info-grid` / `.info-row`，改为：

```
.info-surface
├─ .summary-strip   [类型徽章] mime · metrics…            时间（右对齐）
├─ .source-row      应用图标 + 名称/bundleId               标签 chips（右对齐）
├─ hr
└─ (洞察容器)        由 C2 填充
```

`.summary-left { min-width:0; overflow:hidden }`，时间戳 `flex:none`——否则图片类型的 `image/png · 3520 × 2306 · 7.2 MB` 会和时间戳重叠（pen 稿已复现过该碰撞，文件类型的 `application/x-tuff-files` 需缩写为 `x-tuff-files`）。

### R4 列表行

- 图片行缩略图：28px 圆形 → **32px 圆角矩形**（`border-radius:7px`，`object-fit:cover`）。
- 标题 = 内容首行 / `image/png · 3520×2306` / 文件名；**副标题不再复述内容**，改为 `类型 · [尺寸] · 时间`。
- 收藏项右侧挂星标。

### R5 文件预览改树形

`.file-list` 的 `<ul>` 改为按父目录分组的树：目录头（chevron + 路径 + `N 项`，可折叠）+ 缩进的文件行（图标/图片缩略图 + 文件名 + 大小 + 预览按钮）。

### R6 底栏

- 移除筛选（已上移到分类条），左侧改为 `↑↓ 选择` / `Esc 关闭` 键位提示。
- `复制` / `粘贴到当前应用` 保留全称 + 快捷键胶囊；`收藏` / `删除` 收成 30×30 图标按钮。

## 兼容约束

- `ClipboardActionBar.test.ts:38` 断言 `apply-button` 文案含「粘贴到当前应用」→ 保留全称。
- `ClipboardActionBar.test.ts:57-60` 断言四个按钮 pending 文案 → 图标按钮仍需渲染 `<span class="button-text">`，非 pending 态用 `.sr-only` 视觉隐藏。`data-testid` 全部不变。
- `ClipboardManagerView.test.ts:353` 断言 `.info-value-copy` 含来源应用名 → 该类名随 `.info-grid` 一起删除，测试改断言 `.source-name`。

## Acceptance Criteria

- [ ] 720×540 视口下切换文本 / 图片 / 文件三类记录，预览区与摘要条之间无空洞。
- [ ] 短文本（≤2 行）时预览区高度为 96px；图片时 ≥200px；文件树按内容 fit。
- [ ] 任一纯文本列表行的标题与副标题文本不相等。
- [ ] 分类条 9 项 + 计数在 720 宽下不横向滚动；底栏不横向滚动。
- [ ] 图片摘要条内元素与右侧时间戳不重叠。
- [ ] 文件预览按目录分组，目录头可折叠。
- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin test` / `typecheck` 通过，四个测试文件的断言未被放宽。
