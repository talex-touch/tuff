# 验证（ego，2026-10-03）

- 复现（:3200，stage + 共享工作区）：从 `/admin/intelligence-overview` 经导航到 `/admin/analytics`，`<main>` 在 0.3 / 1.2 / 3 / 8 s 均为 0 个子节点；从 updates / users / governance / audits / provider-registry / reviews 出发均在 1.2 s 内渲染。强制刷新直接打开 analytics 正常。
- 扫描：67 个页面模板中只有 `intelligence-overview.vue`、`intelligence-audits.vue` 多根（注释 + `<AdminPageShell>`，第 19 行）。
- 修复后（worktree `talex-touch-hotfix`，dev server :3204）：
  - intelligence-overview → analytics（热启动 3 次）：1.1–1.9 s 渲染「Data Overview」，无 console 错误、无 single root 警告；
  - intelligence-audits → analytics、intelligence-overview → audits、intelligence-audits → users：均在 2 s 内渲染。
  - 首次（冷编译 analytics.vue）那一次 5 s 采样时 `<main>` 尚不存在，属于 dev 冷编译，热启动后不复现。
- 守卫：修页面前，新守卫只在「reports no multi-root page templates」失败并点名两个页面第 19 行；修复后 guards 8 files / 55 tests 通过；Nexus 全量 256 files / 1906 tests 通过（tuffex dist 构建后）；改动文件 ESLint 与 `git diff --check` 干净。
