# 实施计划

1. 在 App Store Connect 创建最小权限 Team API key，记录 Key ID / Issuer ID，下载唯一 `.p8`。
2. 用 `.p8` 创建并在线验证本机 `tuff-notarization` keychain profile；确认 Developer ID identity 仍有效。
3. 调整 `apps/core-app/scripts/build-target.js`：macOS 分发命令本机默认强制签名/公证；无显式公证环境变量时使用固定 keychain profile；保留显式非正式构建逃生口。
4. 调整 `.github/workflows/build-and-release.yml`：`waived` 不再允许发布，只有完整 PKCS#12 + API key 配置才进入构建。
5. 从当前 identity 导出临时 PKCS#12，生成随机导出密码，把 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_API_KEY_CONTENT`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 写入 GitHub Secrets；不输出 Secret 值，清理本次生成的临时 PKCS#12。
6. 运行凭据解析矩阵和工作流 YAML/actionlint 检查；运行一次真实本机 macOS 分发构建。
7. 对产物执行 `codesign --verify --deep --strict`、`spctl --assess --type execute`、`xcrun stapler validate`，确认公证票据已附加。
8. 更新发布验收规范，移除 Apple Developer 已配置后的 `waived` 发布许可；完成 Trellis 质量检查与任务记录。

## 风险点

- App Store Connect `.p8` 只能下载一次；下载后必须先完成 Keychain 和 GitHub Secrets 配置再处理原文件。
- PKCS#12 导出会触发钥匙串授权；只导出指定 Developer ID identity，不导出其他 identity。
- 公证是网络服务，真实构建可能因 Apple 返回业务错误失败；失败时保留 submission ID / 非敏感错误摘要，不绕过校验。
- 证书有效期至 2027-02-01，届时必须轮换 `CSC_LINK` 和密码。

## 验收命令

- `security find-identity -v -p codesigning`
- `xcrun notarytool history --keychain-profile tuff-notarization`
- `node scripts/resolve-macos-release-signing-mode.mjs --format json`（隔离环境矩阵）
- `actionlint .github/workflows/build-and-release.yml`
- `pnpm build:beta:mac`
- `/usr/bin/codesign --verify --deep --strict --verbose=4 <app>`
- `/usr/sbin/spctl --assess --type execute --verbose=4 <app>`
- `/usr/bin/xcrun stapler validate <app>`
