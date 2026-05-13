---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: GitHub Releases 分离更新方案落地（主进程/渲染进程/扩展包）
complexity: complex
planning_method: builtin
created_at: 2026-02-01T00:20:45+0800
---

# Plan: GitHub Releases 分离更新方案落地

🎯 任务概述
基于现有 UpdateService/UpdateSystem/SettingUpdate 实现，统一更新源到 GitHub Releases（talex-touch/tuff），并建立三条独立发布流（Core App/Renderer/Extensions）。通过主进程编排更新，渲染层负责展示与触发，确保更新链路可控、可追踪、可回滚。

📋 执行计划
1. 对齐更新源与渠道口径：明确 Release/Beta/Snapshot 映射与 tag 前缀规范，形成单一更新源策略。
2. 资产命名与 Manifest 规范：定义 core/renderer/extensions 资产命名、sha256/签名规则，以及 renderer/extension manifest 的字段与兼容策略。
3. 设计 GitHub Actions 三条工作流：分别用于 core/renderer/extensions 的构建、签名、上传与发布（含触发条件与版本策略）。
4. 发布配置对齐：将 `electron-builder.yml` 切换到 GitHub provider，`dev-app-update.yml` 与运行时仓库一致化。
5. UpdateService 改造：收敛更新检查/下载路径，新增 renderer/extensions 检查与下载编排，避免多入口触发。
6. 渲染层与插件管理整合：实现 renderer override 加载逻辑、扩展包安装/启用流程，并调整设置页的更新入口与频率口径。
7. 测试与回归：覆盖跨平台更新、缓存/限频、签名/校验、兼容性与失败回退路径。
8. 预发布与上线：用 pre-release tag 验证全链路，记录观察指标与回滚策略（禁用 renderer/extension 更新或回退到 core-only）。

⚠️ 风险与注意事项
- 更新源与发布配置不一致会导致更新失败或错误下载。
- renderer override 需要严格版本兼容控制，避免与主进程 API 不匹配。
- GitHub API 限频需缓存/退避策略，避免高频检查触发封禁。
- 多入口下载若未收敛，可能造成重复下载或安装冲突。

📎 参考
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/modules/update/GithubUpdateProvider.ts`
- `apps/core-app/electron-builder.yml`
- `apps/core-app/dev-app-update.yml`
- `docs/plan-prd/03-features/download-update/github-auto-update-prd.md`
