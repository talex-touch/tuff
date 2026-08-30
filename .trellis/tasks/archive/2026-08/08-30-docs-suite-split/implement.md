# 执行计划 — docs-suite-split（父任务，含三子任务顺序）

前置：`git status` 确认目标文件未被并发会话占用；基线跑一次 `pnpm -C apps/nexus test`（记录哪些用例本来就红，避免背锅）。

## 阶段 A：suite-taxonomy（子任务 08-30-suite-taxonomy）

- [ ] A1 重写 `apps/nexus/scripts/recategorize-component-docs.py` 的 TAXONOMY 为 prd 归属总表；脚本对「表里有但文件不存在 / 文件存在但表里没有」要报错退出（已有则沿用）。
- [ ] A2 跑脚本；`git diff --stat` 确认只有 `category:` 行变化；抽查 3 个迁移组件（如 chat、thinking-orb、command-palette）。
- [ ] A3 重组 `content/docs/dev/components/index.{zh,en}.mdc` 为三套件章节；用脚本/grep 校验链接集合与改前一致（零丢失）。
- [ ] A4 微调 `ai-suite.{zh,en}.mdc` 落地页口径。
- [ ] A5 验证：`pnpm -C apps/nexus test`（coverage 用例绿）+ `check:mdc-fences`。

## 阶段 B：sidebar-suite-tabs（子任务 08-30-sidebar-suite-tabs）

- [ ] B1 `DocsSidebar.vue`：一级 tab 下划线化（模板 + scoped 样式，亮/暗）。
- [ ] B2 `SUITES` 常量 + `CATEGORY_SUITE_MAP` + `selectedSuite/activeSuite/suiteOfRoute` 逻辑 + 二级切换渲染；`COMPONENT_CATEGORY_ORDER`、`COMPONENT_STANDALONE_PAGES` 并入 SUITES 结构；`SECTION_ORDER['/docs/dev/components']` 更新组内顺序（与新 TAXONOMY 顺序一致）。
- [ ] B3 i18n：`i18n/locales/{zh,en}.ts` 增 `docsSidebar.suites.*` 与新 categories 键。
- [ ] B4 验证：`pnpm -C apps/nexus run typecheck`；`pnpm -C apps/nexus test`；dev server + CDP 截图（亮/暗 × 组件/扩展 × 三套件，含直接进入 AI 组件 URL 的套件自动定位）；hydration 无警告。
- [ ] B5 「其他」兜底组在三套件下均为空（canary 检查）。

## 阶段 C：tuffex-suite-entries（子任务 08-30-tuffex-suite-entries）

- [ ] C1 确认构建入口发现机制（`packages/script/build/index.ts`）；新增 `packages/components/src/{base,pro,ai}/index.ts` barrel。
- [ ] C2 一致性脚本：base∪pro∪ai == components.ts 导出集、两两不相交。
- [ ] C3 `pnpm -C packages/tuffex run build` → `ls dist/{es,lib}/{base,pro,ai}/`；`audit:exports`、`audit:types`、`audit:readme`、`typecheck`、`vitest run` 全绿。
- [ ] C4 消费端冒烟：node 里 resolve `@talex-touch/tuffex/base`（或 nexus/core-app typecheck 引用一次后撤掉——以最小验证为准）。
- [ ] C5 文档：`getting-started/tuffex-composition.{zh,en}` 或组件 hub 增三入口安装/引入说明（zh/en 对等）。

## 收尾（父任务）

- [ ] D1 全量门：`pnpm -C apps/nexus test`、`pnpm -C apps/nexus run typecheck`、tuffex build+audit+typecheck、`pnpm lint`（只看本次改动文件的 delta）。
- [ ] D2 spec 更新（trellis-update-spec：三套件映射写入 frontend spec 索引若有对应文档）。
- [ ] D3 按文件分组提交（taxonomy / sidebar / tuffex 三个提交），stage+commit 一步完成，不碰他人脏文件（当前 `apps/core-app/src/main/config/default.ts` 有未提交改动，不属于本任务，绝不带入）。

## 回滚点

- A 后可独立回滚（revert category 行 + hub）。
- B 独立单文件（DocsSidebar.vue + locales）revert。
- C 删除三 barrel 目录即回滚，exports 未动无残留。
