# C2 执行计划 · 内容形态分类器与洞察路由

命令直接调 bin，不走 `pnpm <script>`（见 09-05-layout-shell/implement.md 的环境事故记录）：

```bash
cd plugins/clipboard-history
./node_modules/.bin/vitest run
./node_modules/.bin/vue-tsc --noEmit
```

## 基线

C1 合入后：`vitest run` **49 通过**、`vue-tsc` **0 错误**、`eslint src/` **exit 0**。

## 步骤

### 1 · 分类器 `src/utils/clipboard-shapes.ts`（新文件）

- [ ] `ClipboardShape` 联合类型
- [ ] `SECRET_PATTERNS` 前缀表（13 条，见 design.md §2）
- [ ] `COMMAND_EXECUTABLES` 白名单 + `DANGEROUS_COMMAND_PATTERNS`
- [ ] `extractLinks(content)`、`parseLinkParams(url)`（标出敏感参数）
- [ ] `detectSecret(content)` → `{ service, masked, length, critical } | null`
- [ ] `detectCommand(content)` → `{ program, args, pipe, dangers[] } | null`
- [ ] `classifyClipboardItem(item)` → `ClipboardShape[]`
- [ ] `selectClipboardInsight(item)` → `ClipboardInsightKind`

### 2 · 测试 `src/utils/clipboard-shapes.test.ts`（新文件）

逐条覆盖，**负控制不可省**：

- [ ] 每个凭据前缀各一条，断言 `service` 正确
- [ ] 40 位随机 Base62 **不是** secret
- [ ] SSH 私钥：返回类型与长度，`masked` 里不含正文任一片段
- [ ] JWT：解出 `exp`；非法 JWT 降级不抛
- [ ] `curl -H "Authorization: Bearer x"` → command 且 `dangers` 含「含凭据」
- [ ] `rm -rf ~/x` → command 且 `dangers` 含高危
- [ ] 单链接 / 多链接的 `extractLinks` 长度
- [ ] 路由优先级：密钥 > 命令 > 链接 > 颜色 > 短文本 > 长文本
- [ ] 图片 → `ocr`；文件 → `none`

### 3 · 洞察组件 `src/components/ClipboardInsight.vue`（新文件）

- [ ] 从 `ClipboardDetail.vue` 迁出拆词 / 颜色 / OCR 三块（含样式）
- [ ] 新增链接（单/多两态）、密钥、命令三块
- [ ] 只渲染 `selectClipboardInsight` 选中的一块
- [ ] 拆词标题右侧改操作提示，统计交给摘要条
- [ ] 字符网格保持 3 行折叠（完整网格是 C4 的「更多信息」）
- [ ] 事件：`copyText` 透传；`openLink`、`runCommand` 新增（本任务只发不接）

### 4 · 详情面板 `ClipboardDetail.vue`

- [ ] 删掉三块洞察的模板与样式，改挂 `<ClipboardInsight>`
- [ ] 透传 `copyText`

### 5 · 分类条通电 `ClipboardManagerView.vue`

- [ ] 5 项 `ready: true`
- [ ] 派生分类在客户端过滤已加载项（`type` 三类仍走 `getHistory`）
- [ ] 过滤后条数与总数不一致时，计数显示为「M / N」并加 title 说明

### 6 · 收尾

- [ ] `vue-tsc --noEmit` → 0
- [ ] `vitest run` → ≥ 49 + 新增，且 C1 的断言一条没改
- [ ] `eslint src/` → exit 0
- [ ] `node ./scripts/assert-no-raw-channels.mjs`
- [ ] `node ./scripts/sync-builtin.mjs`

## 不做

- 「在终端运行」的实际执行（需要主进程能力 + 安全评审，与 C5 同级）
- 完整字符网格 / 完整调色板（C4 的折叠区）
- 颜色四格式与对比度（C3）

## 回滚点

第 1+2 步（纯逻辑 + 测试，无 UI）单独提交一次；第 3~5 步（UI）再一次。
