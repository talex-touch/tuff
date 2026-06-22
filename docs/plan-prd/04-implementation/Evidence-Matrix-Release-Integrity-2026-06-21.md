# Evidence Matrix: R1 Release Integrity

> 更新时间：2026-06-21
> 定位：R1 GitHub Release ↔ Nexus release metadata / download / artifact signature 的校验矩阵。

## 2026-06-22 真实链路复核

本轮对 `v2.4.12-beta.8` 执行只读远程采样，证据见 `docs/engineering/reports/release-integrity-2026-06-22/`。

- Nexus release metadata / `/api/releases/latest?channel=BETA` / assets / signed download endpoint 可访问，download endpoint 对 `darwin/x64`、`linux/x64`、`win32/x64` 均返回 302 到同 tag GitHub asset。
- GitHub Release 经认证 `gh` 复核存在 `tuff-release-manifest.json`，release 为 `isDraft=false`、`isPrerelease=true`。
- Gate E 仍失败：GitHub Release 未上传 artifact `.sig` / `.asc`；manifest core artifacts 缺 `signature` 字段；Nexus assets 没有 `signatureUrl` / `signatureKey`；signature endpoint 全部 404；`/api/releases/signing-key` 未配置 public key。
- CoreApp / Nexus focused signature tests 通过，说明当前阻塞是 release 资产与生产配置未闭环，不是代码侧 focused matrix 未通过。

## 当前推进

本轮已补齐代码侧断点：

- GitHub provider 保留 artifact `.sig` URL 到 `DownloadAsset.signatureUrl`，不再在 renderer release asset 归一化时丢失。
- Nexus release asset 增加 `signatureKey` / `signatureUrl`，metadata 只暴露真实记录的签名 URL。
- Nexus 上传链路在上传 signature file 后记录 signature endpoint；未上传签名时不再生成会 404 的 `signatureUrl`。
- Nexus GitHub link 链路支持写入 HTTPS `signatureUrl`，用于外部 GitHub Release artifact signature。
- Nexus signature endpoint 改为读取 release asset 记录的 `signatureKey`，不再猜测 `${fileKey}.sig`。

## Focused Matrix

| ID | 链路 | 覆盖 | 验证 |
| --- | --- | --- | --- |
| R1-F01 | GitHub manifest / artifact signature | GitHub release asset + `.sig` asset 归一化后保留 `checksum` 与 `signatureUrl` | `pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/update/GithubUpdateProvider.test.ts"` |
| R1-F02 | Nexus release metadata | 无签名 asset 不暴露 `signatureUrl`；有本地 endpoint 或 GitHub HTTPS signature 时按记录返回 | `pnpm -C "apps/nexus" exec vitest run "server/utils/releaseSignature.test.ts"` |
| R1-F03 | Nexus upload matrix | 上传 signature file 后写入 `signatureKey` / endpoint URL；签名上传失败仍按 signature resource 记录治理事件 | `pnpm -C "apps/nexus" exec vitest run "test/api/releases/assets.post.test.ts"` |
| R1-F04 | Nexus signature endpoint | endpoint 读取记录的 `signatureKey`；无签名记录返回 404 且不读 artifact storage | `pnpm -C "apps/nexus" exec vitest run "test/api/releases/signature.get.test.ts"` |

## 剩余 Gate E

R1 Gate E 仍需要真实环境证据，不能只用 focused tests 关闭：

- 真实 GitHub Release 包含 `tuff-release-manifest.json`、core artifact、artifact `.sig`。
- Nexus release metadata 从同一 tag 导入或链接后，`sha256`、`downloadUrl`、`signatureUrl` 与 GitHub Release asset 一致。
- Nexus `/api/releases/latest`、`/api/releases/:tag/assets`、`/api/releases/:tag/download/:platform/:arch`、`/api/releases/:tag/signature/:platform/:arch` 在同一 release matrix 上可访问。
- CoreApp update download 验证能实际拉取 `signatureUrl` 并通过 release public key 校验。
