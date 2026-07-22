# 技术设计

## 边界

复用现有 Electron Builder 签名/公证路径，不新增独立上传器或二次签名：

- `apps/core-app/scripts/build-target.js` 决定 macOS 分发构建是否启用 `forceCodeSigning`、hardened runtime 和 Builder 内置 notarization。
- Electron Builder 从本机钥匙串自动选择 Developer ID identity；CI 从 `CSC_LINK` 导入 PKCS#12。
- Electron Builder 26.15.3 原生支持 `APPLE_KEYCHAIN_PROFILE`，本机使用固定 profile `tuff-notarization`；CI 继续把 App Store Connect `.p8` 落到 runner 临时目录并设置 `APPLE_API_KEY`。
- 现有 `verify-macos-release-signing.mjs` 继续验证 Developer ID、Gatekeeper 和 stapled ticket，发布资产上传逻辑不变。

## 本机数据流

1. App Store Connect Team API key 下载后，用 `xcrun notarytool store-credentials tuff-notarization --key ... --key-id ... --issuer ... --validate` 写入登录钥匙串。
2. `build:beta:mac` / `build:snapshot:mac` / `build:release:mac` 在 macOS 上默认视为需要原生信任的分发构建；显式 `TUFF_OFFICIAL_RELEASE_BUILD=false` 仍可用于非分发诊断，`build:unpack` 不改变。
3. 未显式提供 API key、Apple ID 或其他 keychain profile 时，构建环境自动使用 `APPLE_KEYCHAIN_PROFILE=tuff-notarization`。
4. Electron Builder 使用钥匙串 Developer ID identity 签名，提交 notarytool，staple 后再由现有后处理打 ZIP。

## CI 数据流

1. 本机 Developer ID identity 导出为一次性密码保护的 PKCS#12；仅把 base64 内容和密码写入 GitHub Secrets。
2. API key 内容、Key ID、Issuer ID 分别写入 `APPLE_API_KEY_CONTENT`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`。
3. `Resolve macOS Release Signing Mode` 仍检查凭据完整性，但 `waived` 结果立即失败；只有 `developer-id` 才写入 `TUFF_OFFICIAL_RELEASE_BUILD=true`。
4. runner 临时 `.p8` 权限由 `umask 077` 约束；Job 结束由 ephemeral runner 清理。
5. 构建后现有 codesign / TeamIdentifier / Gatekeeper / stapler 验证必须全部通过，随后才上传构建产物。

## 安全与兼容

- `.cer`、CSR、`.p12`、`.p8`、密码均不提交仓库；日志只输出模式和非敏感标识。
- 本机 API 私钥由 notarytool profile 保管；普通构建脚本只传 profile 名。
- CI 保留现有 API-key 优先逻辑；Apple ID 路径不配置，也不参与本次凭据部署。
- 证书到期或吊销、API key 轮换、Secret 删除都会 fail closed，不回落到 ad-hoc 发布。
- Windows/Linux 构建矩阵不读取 macOS 凭据。

## 回滚

代码回滚只需恢复 macOS 本地默认模式和 CI `waived` 分支；凭据回滚通过删除 GitHub Secrets / 本机 notarytool profile 完成。任何回滚都不得把已失败的原生信任校验标记为通过。
