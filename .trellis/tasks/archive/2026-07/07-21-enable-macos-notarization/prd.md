# 启用 macOS Developer ID 签名与自动公证

## Goal

让本机和 GitHub Actions 产出的 macOS 分发包默认使用 Developer ID 签名、提交 Apple 公证并附加票据；任何凭据缺失或信任校验失败都必须在上传发布资产前失败。

## Background

- 已提供的 `.cer` 是 `Developer ID Application` 证书，团队 ID 为 `2L5YC85FQ7`，SHA-256 指纹为 `0DB7F625F7B29FCCCECAA0195981023521A5EFAF7F8C2232DF68797D8EF15405`，有效期至 2027-02-01。
- 证书与 CSR 的 RSA 公钥摘要一致；同一证书已导入 login keychain 并与原私钥归并，可作为有效代码签名 identity。
- `.cer` 只含公钥证书。CI 代码签名仍需从本机 identity 导出的 PKCS#12 (`.p12`) 及导出密码。
- Apple 公证还需要独立服务凭据；本次统一采用 App Store Connect API key（`.p8`、Key ID、Issuer ID）。
- 本机已创建并在线验证 `tuff-notarization` keychain profile；GitHub 仓库已配置完整 `CSC_*` / `APPLE_API_*` Secrets。
- 仓库复用既有签名模式解析、Electron Builder 公证和发布信任证据链；CI 的 `waived` 发布路径已退役。

## Requirements

- 本机 `build:beta:mac`、`build:snapshot:mac`、`build:release:mac` 使用钥匙串中的 Developer ID identity，并在安全配置公证凭据后自动签名、公证和 staple；开发启动与非分发 unpack 构建不受影响。
- GitHub Actions 的 macOS 发布 job 使用 PKCS#12 签名凭据和一套完整公证凭据，不在仓库、日志或构建产物中暴露私钥和密码。
- CI 不再把完全缺失的 Apple 凭据解释为可发布的豁免模式；缺失、部分配置、签名失败、公证失败、Gatekeeper 失败或 stapler 校验失败均阻断发布。
- 保留现有单一签名模式解析与发布信任证据链，不另建第二套公证流程。
- 最终配置必须可轮换：证书、PKCS#12 密码和公证凭据均通过本机安全存储或 GitHub Secrets 管理。
- 公证认证统一采用 App Store Connect API key；不使用个人 Apple Account app-specific password。

## Acceptance Criteria

- [x] 本机证书、私钥和公证凭据预检通过；分发构建自动进入 `developer-id` 模式。
- [x] 本机真实 macOS 分发包及 ZIP 解压产物均通过 deep strict codesign 与 stapler；`spctl` 识别为 `Notarized Developer ID`，但本机全局 assessments disabled，按规范保留为 blocked Gatekeeper evidence。
- [x] GitHub 仓库存在完整的签名与公证 Secrets，工作流只在完整 API-key 配置下构建 macOS 发布资产。
- [x] 无凭据、部分凭据和完整 API-key 凭据解析分别得到 `waived`、非零拒绝和 `developer-id`；CI 对非 `developer-id` 结果立即失败。
- [x] Prettier、ESLint、Node syntax、CoreApp node typecheck、11 个聚焦测试、actionlint 和真实本机公证构建通过。

## Out of Scope

- Mac App Store 签名、Developer ID Installer `.pkg` 证书、Windows 代码签名。
- 将任何 Apple 私钥、PKCS#12、app-specific password 或 API key 提交到仓库。
