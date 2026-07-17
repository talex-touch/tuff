# Tuff v2.4.13-beta.14 发版测试 Summary

## 结论

- 测试执行：**completed**
- 已发布版本状态：**FAIL**
- 代码修复状态：**implemented-unreleased**
- 结论边界：`v2.4.13-beta.14` 已发布二进制没有被替换；manifest、detached signature 与 macOS Developer ID 修复必须由新构建和新 tag 验证。

## Gate 结果

| Gate | Result |
|---|---|
| Release identity | pass |
| GitHub asset inventory | pass |
| Nexus preferred matrix | pass |
| Nexus signed downloads | pass |
| Host download SHA-256 | pass |
| Manifest validation | **fail** |
| Detached release signatures | **fail** |
| Bundle version / arm64 / executable mode | pass |
| macOS deep strict codesign | **fail** |
| macOS Gatekeeper | **blocked — security assessment disabled** |
| Isolated packaged runtime | pass |

## 已验证

- Root/Core version、GitHub tag、Nexus release 与 BETA latest 均解析到 `v2.4.13-beta.14`。
- GitHub 与 Nexus 均提供 `darwin/arm64`、`linux/x64`、`win32/x64` 三平台首选资产。
- GitHub/Nexus host 下载字节一致，并与 manifest/GitHub SHA-256 相符。
- 三个平台的 Nexus signed download endpoint 均返回有效跳转；host 下载最终取得二进制内容。
- 下载后的 macOS app 版本、arm64 Mach-O、可执行权限与隔离 profile packaged runtime 通过；Settings、File Index diagnostics、详情与审计字段可见。

## 已发布版本阻断项

1. **Manifest**：缺少 core signature 字段；AppImage/deb 重复占用 `linux/x64`；macOS/Windows workflow 文件名不符合当时 validator。
2. **Detached signature**：GitHub 无 `.sig`/`.asc`，Nexus `signatureUrl` 为空，签名端点 404，signing-key 未配置。
3. **macOS native trust**：仅 ad-hoc 签名、无 TeamIdentifier，deep strict codesign 失败。
4. **Gatekeeper evidence**：本机 `spctl` 返回 `override=security disabled`，该结果只能记为 blocked，不能记为 pass。

## 本次仓库修复

- manifest 现在按 `platform/arch` 确定性选一个首选资产：Windows setup、macOS dmg/app ZIP、Linux AppImage。
- 发布前使用 `RELEASE_SIGNING_PRIVATE_KEY` 为全部安装包生成并回验 RSA-SHA256 base64 `.sig`；私钥与固定公钥不匹配即停止。
- Nexus sync 改为只消费已验证 manifest，并把 GitHub sidecar URL 写入 `signatureUrl`；signing-key endpoint 增加固定公钥 fallback。
- macOS workflow 现在有 `waived` / `developer-id` 两种模式：未配置 Apple Developer 时保留 ad-hoc 包并明确记录风险；未来完整配置证书后自动切换严格签名与 notarization 门禁。
- 发布前自动生成 `release-test-summary.json` / `.md`，重新计算 SHA-256、验证全部 sidecar，并合并 macOS codesign/Gatekeeper/notarization evidence。
- 已生成 `update_2.4.13-beta.14.zh.md`、`update_2.4.13-beta.14.en.md` 与对应 GitHub release body。

## 下一次发布前置条件

当前唯一仍缺失的硬门禁 secret 是：

- `RELEASE_SIGNING_PRIVATE_KEY`

Apple Developer **不是当前发布前置条件**。按 owner 的明确决定，在 owner 主动说明已配置之前：

- workflow 使用 `waived`；
- summary 记录 `apple-developer-not-configured` 与 `macosNativeTrust: waived`；
- 不再重复要求购买或配置 Apple Developer；
- detached `.sig`、SHA-256、manifest 与 Nexus `signatureUrl` 仍必须全部通过。

未来 owner 明确配置 Apple Developer 后，完整的 `CSC_*` 与 Apple notarization 凭据会自动启用 `developer-id` 严格门禁；部分配置仍会 fail closed。

## Evidence

源摘要：`.trellis/tasks/archive/2026-07/07-16-downloaded-release-acceptance-flow/evidence/summary.json`。
