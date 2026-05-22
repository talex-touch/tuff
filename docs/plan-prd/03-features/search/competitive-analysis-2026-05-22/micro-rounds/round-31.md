# 微审计 31/70

- 审计主题：uTools 插件市场上架链路映射到 Tuff 当前 Nexus Store / `tuff-cli` 发布审核链路时，是否已经能视为完整生态闭环，还是只能定位为“校验、打包、上传、审核状态已有底座，但仍缺端到端 evidence 与风险摘要”的部分落地能力。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`：把 uTools 插件市场映射为 Nexus Store、`.tpex`、publisher、review、CloudShare 内容包，并要求 `tuff validate --strict`、`tuff publish --dry-run`、权限摘要和平台矩阵可见。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`：明确 Tuff 已有 Manifest / Prelude / Surface、`sdkapi` hard-cut、`tuff validate/build/publish --dry-run`、Nexus Store、`.tpex` 包预览、版本 pending/approved/rejected 审核状态与完整性校验，但不能宣称完整 Raycast/uTools 级安全审核。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`：把 `nexus-plugin-workflow-card-v1` 定为 P1，要求 Store card 展示 input types、permissions、setup required、last validated 与 `.tpex` dry-run evidence。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`：第 32、43、63、64、65 条已记录 Nexus Store / publish dry-run / `.tpex` integrity / version moderation 的边界。
  - `apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc` 与 `apps/nexus/content/docs/dev/tools/tuff-cli.zh.mdc`：开发者文档要求从 Manifest 到 `tuff validate --strict`、`tuff build`、`tuff publish --dry-run`，再发布 `.tpex` 到 Nexus。
  - `packages/tuff-cli-core/src/validate.ts`：CLI 会校验 Manifest JSON、`name`、`version`、`sdkapi` compatibility、`category` 门槛、permission registry；strict 模式把 warning 变 error。
  - `packages/tuff-cli-core/src/publish.ts`：publish 会读取 `manifest.json` / `package.json`、扫描 `dist/build` 和 `dist` 里的 `.tpex`、计算 SHA-256；`--dry-run` 只输出本地摘要不上传；真实 publish 先做 publisher preflight，再提交到 Dashboard version endpoint。
  - `apps/nexus/server/api/dashboard/plugins/package/preview.post.ts`：Dashboard package preview 会解析 `.tpex` 的 manifest、README 与 icon preview。
  - `apps/nexus/server/api/dashboard/plugins/[id]/versions.post.ts` 与 `apps/nexus/server/utils/pluginsStore.ts`：版本发布会校验发布者、版本重复/降级、submission cooldown、上传治理、`.tpex` integrity、icon 必需、package storage，并创建默认 `pending` 版本。
  - `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`：管理员可把版本设为 `pending` / `approved` / `rejected`，rejected 可记录 reason，并触发治理事件和通知。
  - `apps/nexus/server/utils/tpex.ts` 与 `apps/nexus/server/utils/__tests__/tpex-integrity.test.ts`：`.tpex` 校验覆盖 `manifest._files`、SHA-256、`_signature` 与 Windows 反斜杠路径兼容，但这是完整性校验，不是恶意代码扫描。

- 结论：
  - 主文档的边界判断成立。Tuff 当前确实有一条可对照 uTools 插件市场的工程底座：开发者文档给出 Manifest -> validate -> build -> dry-run publish -> publish 的任务流；CLI 能做 `sdkapi`、category 和权限 registry 校验；Nexus 能预览 `.tpex` 元数据、接收 package、生成 pending version，并由管理员 approve/reject。
  - 这条链路还不能被表述为完整生态闭环。关键缺口不是“没有上传接口”，而是缺一条官方示例插件的端到端 release evidence：本地 validate/build、dry-run 输出、Dashboard package preview、pending submit、admin reject/approve、Store card 展示、客户端安装失败 reason 都需要同一条样本串起来。
  - `.tpex` integrity 的作用应保持诚实：它能证明包内容与 manifest `_files` / `_signature` 匹配，也能挡住篡改、缺 manifest、缺 icon 等包结构问题；但它不等价于 package policy、危险 API 静态扫描、恶意行为检测或人工安全审计。
  - 因此，下一步最小方向仍应沿用主文档：不要重做市场 UI，也不要把 uTools 上架体验照搬成上传即发布；优先补 `plugin ecosystem minimum loop v1` 的 evidence 包和 Store capability / trust summary。

- 是否发现需修正的主文档问题：否。`04`、`08`、`10`、`11` 没有把当前 Nexus Store / `tuff-cli` 链路夸大成完整插件市场或完整安全审核；它们把现状写为底座存在、仍缺端到端 evidence、risk badge、package policy/security scan 与 Store card 可见性，和 live 源码一致。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增本文件作为微审计输出，并更新 `.codexpotter` 进度记录；未修改业务代码，未执行 `git commit` / `git push` / 分支 / reset / checkout / 清理工作树操作。
