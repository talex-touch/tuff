# macOS Developer ID 与公证调研

## 本机材料核验

- `.cer` 类型：Developer ID Application，Team ID `2L5YC85FQ7`。
- 证书 SHA-256：`0DB7F625F7B29FCCCECAA0195981023521A5EFAF7F8C2232DF68797D8EF15405`。
- 有效期：2026-07-22 01:22:35 UTC 至 2027-02-01 22:12:15 UTC。
- 证书与 CSR 的 RSA modulus SHA-256 均为 `955a399c38117b8dc225f8fc211861b0084f9aa0b7fa106b5d7c7ef48b3c45a4`，两者配对。
- `security find-identity -v -p codesigning` 返回同一 Developer ID identity。证书最初只装在 System、私钥在用户钥匙串；把同一 `.cer` 导入 login keychain 后，两者归并为可导出的 identity。
- App Store Connect Team API key 已通过 `notarytool store-credentials` 在线验证并保存为 `tuff-notarization` keychain profile。

## 结论

1. `.cer` 不足以完成签名或公证。它只有公开证书；签名还需要 CSR 创建时生成并保存在钥匙串中的私钥。当前本机 identity 完整，所以本机代码签名条件已满足。
2. GitHub Actions 不能使用 `.cer` 单独签名。必须把证书和私钥导出为密码保护的 PKCS#12，并分别保存为 `CSC_LINK` 与 `CSC_KEY_PASSWORD` Secrets。
3. 公证是独立的 Apple 服务认证。本次选择 App Store Connect Team API key（`.p8` + Key ID + Issuer ID），本机存入 Keychain profile，CI 分别存入 GitHub Secrets；不使用个人 Apple Account app-specific password。
4. Apple 要求分发包使用 Developer ID、有 Hardened Runtime、secure timestamp 和有效 entitlement；提交后应 staple 票据。仓库当前已经启用 hardened runtime，并有 codesign、Gatekeeper、stapler 的发布验收。
5. `.github/workflows/build-and-release.yml` 现在只接受完整 PKCS#12 + Team API-key 凭据；GitHub Secrets 已配置，缺失、部分配置或非 API-key 方法均在 macOS 构建前失败。

## 参考

- Apple Developer ID certificates: https://developer.apple.com/help/account/certificates/create-developer-id-certificates/
- Apple notarization requirements: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Apple custom `notarytool`/`stapler` workflow: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- Apple app-specific passwords: https://support.apple.com/en-us/102654
- electron-builder macOS signing: https://www.electron.build/docs/features/code-signing/code-signing-mac
- electron-builder notarization: https://www.electron.build/docs/features/code-signing/notarization
