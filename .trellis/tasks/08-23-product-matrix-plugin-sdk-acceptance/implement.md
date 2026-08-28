# 实施计划

## 1. 建立矩阵基线

- 从 `plugins/*/manifest.json` 生成官方插件清单，记录 runtime id、SDK marker、features、permissions、package 和 docs 覆盖。
- 从 `apps/nexus/app/data/tuffSdkItems.ts` 与 `apps/nexus/content/docs/dev/api/**` 建立 SDK/能力卡片映射。
- 将缺文档、缺 smoke、旧 SDK baseline、blocked 平台和 unavailable 功能写入 `research/official-plugin-sdk-matrix.md`。

## 2. 补自动化守卫

- 扩展或新增 package-level 测试，保证插件 docs 目录和 manifest 不再沉默漂移。
- 为 `tuffSdkItems` 增加文档/SDK owner 对账，避免公开卡片没有 API 文档或代码入口。
- 继续保留 `touch-intelligence` root provider partial coverage 的显式豁免，直到 manifest 修复。

## 3. 逐插件 SDK 迁移

- 优先处理已经使用新 facade 的插件：`json-formatter`、`touch-intelligence`、`touch-translation`、`clipboard-history`。
- 对旧 `260428` 插件逐个判断是否真正需要 localization、application resolution、tfile scope、Intelligence 或 typed transport 新能力。
- 每个插件迁移时同步 manifest、package、README/docs、build output 和 focused tests；未使用新 API 的插件不升级 marker。

## 4. 官网矩阵收口

- 补 9 个缺失插件的中英文文档目录或明确标为未公开。
- 将 Pricing/Billing、production Sync、real MCP、cross-platform OTA 等缺证据能力在官网或 task matrix 中降级为 `partial/blocked`。
- 确保 Nexus 不展示未实现能力为 `available`。

## 5. 上游 SDK modernization

- 运行 `pnpm outdated -r` 获取当前差距。
- Patch/minor 安全升级可按包独立推进；破坏性迁移另建任务。
- LangChain v1 迁移前先完成 import/API/stream audit/quota/docs 设计，不直接改 lockfile。

## 6. 验证命令

```bash
corepack pnpm plugins:validate
corepack pnpm -C "packages/test" exec vitest run "src/plugins/manifest-boundary.test.ts"
corepack pnpm lint:changed
corepack pnpm quality:release
git diff --check
```

按单插件变更追加：

```bash
corepack pnpm -C "plugins/<plugin>" run lint
corepack pnpm -C "plugins/<plugin>" run build
corepack pnpm -C "packages/test" exec vitest run "src/plugins/<plugin-test>.test.ts"
```

## 7. 完成边界

- 本地矩阵、docs、manifest 和自动化全绿后，本任务最多进入 `partial`。
- 只有 macOS/Windows/Linux 插件 runtime smoke、最新 SDK 迁移证据、官网展示对账和上游 SDK 迁移策略全部闭环后，才能标记完成。
