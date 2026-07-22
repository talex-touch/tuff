# Bug Analysis: macOS 公证产物被符号链接和后处理破坏

### 1. Root Cause Category

- **Category**: D / E — Test Coverage Gap + Implicit Assumption。
- **Specific Cause 1**: `fs.cpSync(..., { dereference: true })` 对 pnpm workspace 包内的嵌套 `node_modules` 仍保留绝对 symlink。`@talex-touch/tuff-native/node_modules/{node-addon-api,node-gyp}` 指向工作区外部路径，`codesign --strict` 以 `invalid destination for symbolic link in bundle` 拒绝。
- **Specific Cause 2**: 本机默认签名只写入 `build-target.js` 的局部 `officialMacReleaseBuild`；`postprocess-mac.js` 独立读取未设置的 `TUFF_OFFICIAL_RELEASE_BUILD`，把已成功 Developer ID 签名和公证的 app 当成本地包再次 ad-hoc 签名，导致 TeamIdentifier 丢失且 stapled ticket 校验失败。

### 2. Why Fixes Failed

1. 仅开启 Electron Builder `forceCodeSigning/notarize`：打包到签名阶段才暴露 workspace 绝对 symlink，配置本身正确但资源边界错误。
2. 排除 workspace 嵌套 `node_modules` 后首次构建成功：构建日志显示 `notarization successful`，但终态独立检查发现 `Signature=adhoc`。只信 Builder 日志会漏掉 postprocess 对签名的后续破坏。

### 3. Prevention Mechanisms

| Priority | Mechanism            | Specific Action                                                                                    | Status    |
| -------- | -------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| P0       | Architecture         | workspace 资源投影排除源包 `node_modules`；运行时依赖只由根级 closure 复制                         | DONE      |
| P0       | Change propagation   | 本机默认 official 模式同步写入 `TUFF_OFFICIAL_RELEASE_BUILD`，Builder 与 postprocess 读取同一状态  | DONE      |
| P0       | Runtime verification | 对最终 app 和解压后的 ZIP 分别执行 codesign、TeamIdentifier/Timestamp、stapler 与 symlink 边界检查 | DONE      |
| P1       | Test coverage        | 扩展 runtime-module/after-pack 测试，固定“无嵌套 workspace node_modules / 不得 ad-hoc 重签”契约    | SPECIFIED |
| P1       | CI policy            | Apple 凭据缺失、部分配置或非 API-key 方法均在 macOS job 预检失败                                   | DONE      |

### 4. Systematic Expansion

- **Similar Issues**: 任何 `@talex-touch/*` workspace 包都可能携带 pnpm 的包内 `node_modules` symlink；资源投影必须统一过滤，而不是只特判 tuff-native 两个链接。
- **Design Improvement**: 原生信任的最终事实是归档前/解压后的产物，不是 Electron Builder 中间日志。所有后处理必须保持签名字节不变。
- **Process Improvement**: macOS 发布 smoke 固定到“构建 → 终态 codesign/stapler → ZIP 解压再验”，避免局部成功冒充可分发成功。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/frontend/release-testing.md`，将 `waived` 政策切换为强制 Developer ID/API-key 公证。
- [x] 更新跨平台审计 R2 进展，保留 Universal/Updater 未完成范围。
- [x] 在任务调研中记录证书、CSR、私钥和 CI PKCS#12 的边界。
