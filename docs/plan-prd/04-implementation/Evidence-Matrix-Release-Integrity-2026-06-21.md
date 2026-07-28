# Evidence Matrix: R1 Release Integrity

> 更新时间：2026-07-27
> 定位：R1 GitHub Release ↔ Nexus release metadata / download / artifact signature 的校验矩阵。

## 2026-06-22 真实链路复核

本轮对 `v2.4.12-beta.8` 执行只读远程采样，证据见 `docs/engineering/reports/release-integrity-2026-06-22/`。

- Nexus release metadata / `/api/releases/latest?channel=BETA` / assets / signed download endpoint 可访问，download endpoint 对 `darwin/x64`、`linux/x64`、`win32/x64` 均返回 302 到同 tag GitHub asset。
- GitHub Release 经认证 `gh` 复核存在 `tuff-release-manifest.json`，release 为 `isDraft=false`、`isPrerelease=true`。
- Gate E 仍失败：GitHub Release 未上传 artifact `.sig` / `.asc`；manifest core artifacts 缺 `signature` 字段；Nexus assets 没有 `signatureUrl` / `signatureKey`；signature endpoint 全部 404；`/api/releases/signing-key` 未配置 public key。
- 当时的 CoreApp / Nexus focused signature tests 已通过，说明 beta.8 阻塞来自 release 资产与生产配置未闭环，而不是代码侧 focused matrix。

该结论只属于 `v2.4.12-beta.8` 的 2026-06-22 historical production sampling；后续 tag 的独立验收不会回写或删除这份失败记录。

## 2026-07-22 beta.19 Gate E 生产复核

精确来源为 [已发布版本 Release Gate 契约](../../../.trellis/tasks/07-21-07-20-align-published-release-gates/prd.md)，执行对象是已发布 `v2.4.13-beta.19`，未修改 GitHub Release 或 Nexus 数据。

- 正式 `gate-e --strict` 返回 `result: pass` 且退出码为 `0`。
- 远端中英文 notes、GitHub manifest 的三平台 preferred matrix、完整 GitHub asset inventory、Nexus preferred assets、download URL、SHA-256、rollback 与 channel latest 门禁通过。
- Nexus 每个 preferred asset 的实际 `signatureUrl` 被请求；GitHub 直链 sidecar 返回非空、非 HTML/JSON 的有效签名 payload，未用另行拼接的 endpoint 替代实际配置。
- Linux DEB 与 `.deb.sig` 作为同一已声明 pair 的额外完整格式通过 inventory 校验；它们没有被误写成 manifest 中第二个 preferred artifact。

这关闭的是 `v2.4.13-beta.19` 的精确 Gate E assertions，并取代旧 beta.8 失败作为后续 beta.19 判断。它不证明稳定 `v2.4.13` 已复跑相同 gate，也不证明 CoreApp OTA discovery/download/install/health/recovery 或三平台 host runtime acceptance。

## 代码侧修复

beta.8 historical failure 后已补齐以下代码断点：

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

## 当前状态边界

- `v2.4.13-beta.19` 的 Gate E 已按上方精确来源关闭；稳定 `v2.4.13` 必须对其自身发布资产重新运行同一 strict gate，不能继承 beta.19 的 production pass。
- Gate E 证明发布侧 notes、manifest/inventory、Nexus metadata/download、SHA-256、signature URL/payload、rollback/latest 对齐；它不替代 CoreApp 对真实下载包执行 pinned-key 验签与安装交接。
- OTA lifecycle 仍需精确 N/N-1、官方可信 macOS ready→click→replace→health/recovery、Windows/Linux real-host handoff 与 profile compatibility evidence。static-only、workspace package 或 focused tests 不能关闭这些项。
- 所有未被 exact-version packaged 或 production evidence 直接观察的维度继续保持 open。
