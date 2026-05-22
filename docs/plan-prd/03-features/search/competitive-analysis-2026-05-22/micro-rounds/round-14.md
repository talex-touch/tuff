# 微审计 14/70

## 审计主题

插件生态安全信任边界：Raycast Store 的审核背书、Alfred `.alfredworkflow` 资产分享、uTools 插件市场，是否应被映射为 Tuff 的 `.tpex` 完整性校验、`tuff validate`、`sdkapi` hard-cut 与 Nexus 版本审核流；以及主文档是否避免把完整性校验误写成“安全 parity”。

本轮只审一个具体映射点：`.tpex` 包内 `_files` / `_signature`、CLI manifest 校验和运行时 SDK gate 能否构成发布链路基础，但是否仍不足以宣称恶意代码扫描或 Raycast Store 级安全审核。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
  - 第 1 节说明 Tuff 已有 `sdkapi` hard-cut、权限、typed SDK、`tuff validate/build/publish --dry-run`、Nexus Store、`.tpex` 包预览、pending/approved/rejected 审核状态和 `_files` / `_signature` 完整性校验。
  - 同节明确 package policy / security scan 仍主要是规划和完整性校验，不能对外宣称 Raycast 式完整审核安全链。
  - 第 3 节把 Package integrity 判断为“已已有完整性校验；不是完整恶意代码 scan”，第 6 节再次强调包完整性不等于安全审核。
  - 第 7 节把 package policy baseline 放在 P0，说明仍需 size、forbidden files、raw secret patterns、high-risk permission summary、dependency manifest 摘要。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 14 条确认 `.tpex` integrity 与 `tuff validate` 存在，但不是完整恶意代码扫描，`08` 没有宣称 Raycast Store security parity。
  - 第 61 条确认当前 `sdkapi` marker 为 `260428`，missing / invalid / outdated / unsupported 都会被阻断。
  - 第 64 条再次确认 `manifest._files`、`_signature`、SHA-256 校验存在，但不覆盖恶意代码。
- `packages/utils/plugin/sdk-version.ts`
  - `CURRENT_SDK_VERSION` 为 `260428`。
  - `SUPPORTED_SDK_VERSIONS` 是插件声明 `sdkapi` 的 canonical allowlist。
  - `checkSdkCompatibility()` 对 missing、invalid、低于 `251212`、unsupported / future marker 都返回 `compatible: false`。
- `apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts`
  - 运行时 gate 明确区分 `missing-sdkapi`、`invalid-sdkapi`、`outdated-sdkapi`、`unsupported-sdkapi`，并给出 `SDKAPI_BLOCKED` 语义。
- `packages/tuff-cli-core/src/validate.ts`
  - `runValidate()` 复用 `checkSdkCompatibility()` 与 `resolveSdkApiVersion()`，并校验 `name`、`version`、`category`、权限 registry。
  - `--strict` 下 warnings 会转成 errors；旧但仍 supported 的 `sdkapi` 会提示推荐升级到 `CURRENT_SDK_VERSION`。
- `apps/nexus/server/utils/tpex.ts`
  - `verifyManifestIntegrity()` 要求 `manifest._files` 和 `manifest._signature` 存在。
  - 实际包内容会按 SHA-256 生成 `sha256-...`，并与 manifest `_files` 对比；文件列表、hash 或 signature 不一致都会返回 invalid reason。
  - 该实现验证包内容与 manifest 描述一致，不执行静态恶意代码扫描、依赖风险分析或权限策略扫描。
- `apps/nexus/server/api/dashboard/plugins/package/preview.post.ts`
  - package preview API 会解析 `.tpex` 并返回 manifest、README、icon preview、hasIcon。
  - 当前返回没有显式暴露 `metadata.integrity`，因此“完整性结果可作为 preview evidence”仍需要后续 UI/API 串联。
- `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
  - 管理员可把版本状态设为 `pending`、`approved`、`rejected`，rejected 时可记录 reason。
  - 审核动作还会记录 governance event 并派发 notification event，说明版本审核流有基础。

## 结论

主文档的安全边界判断成立：Tuff 已经有插件生态信任链的底座，但不能把它包装成 Raycast Store 级安全审核。

当前可确认的真实链路是：

1. manifest 层由 `tuff validate` 校验必填字段、`sdkapi`、category 和权限 registry。
2. runtime 层由 `sdkapi-hard-cut-gate` 阻断缺失、非法、过旧或 unsupported marker。
3. package 层由 `.tpex` 的 `_files` / `_signature` 校验包内容一致性。
4. Nexus 层已有 package preview 和版本 moderation 状态流。

但这四层合起来仍只覆盖“声明合规 + SDK 门控 + 包完整性 + 人工审核状态基础”，不覆盖完整 security scan。尤其 `apps/nexus/server/utils/tpex.ts` 做的是 SHA-256 manifest 对账，不检查恶意脚本、敏感信息、危险依赖或高风险权限组合；`package/preview.post.ts` 当前也没有把 integrity result 返回给前端作为可见 evidence。

因此，`08-plugin-store-sdk-ecosystem.md` 把下一步设为 package policy baseline、Store trust summary、review queue UX，而不是宣称 security parity，是正确且必要的保守口径。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的事实错误。主文档已经明确区分 `.tpex` 完整性校验与完整恶意代码扫描，也没有把 Nexus Store 写成 Raycast Store security parity。

本轮额外发现一个后续实现注意点：`08` 中把 package preview evidence 写到 manifest / README / icon / integrity，但当前 `package/preview.post.ts` 返回值尚未显式带出 `integrity`。这更像待实现的 P0 evidence 串联缺口，而不是主文档事实错误；后续若推进 package preview UI，应把 `metadata.integrity.valid/reason` 一并返回并展示。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-14.md` 并更新 `.codexpotter` 进度记录，未修改业务代码，未执行 git commit / push / branch / reset / checkout。
