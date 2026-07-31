# Verify screenshot packaging and runtime

## Goal

收口 Rust native protocol 与截图套件的构建、签名、公证、打包产物、真实运行、性能和隐私证据，确保功能不是仅在 workspace 中可用。

## Requirements

- 统一 Rust workspace build/test entry 被 package install、CI matrix 和 CoreApp build-target 调用。
- 主打包前严格验证 protocol-compatible screenshot addon；打包后验证 asar/unpack/resource path、arch 和签名。
- macOS Developer ID/notarization 范围包含 addon，packaged app 在真实 Screen Recording/Accessibility 权限状态下完成完整功能 smoke。
- Windows/Linux 至少完成 build/load/handshake、基础框选 capture 或明确环境受控降级；高级 capability 不得假阳性。
- Evidence manifest 记录 app/addon/protocol/version/platform/arch、命令、结果、artifact digest 和 sanitized runtime metrics。
- 性能证据覆盖主线程响应、静态 capture 延迟、长图内存/增长、annotation 大图 viewport 和资源 cleanup。
- 隐私证据扫描日志、Sentry payload、配置、历史 metadata，确认无截图、OCR/QR、窗口标题或敏感路径。
- 完成后更新 search/cross-platform audit R1 并引用实际 evidence。

## Acceptance Criteria

- [ ] 三平台 CI 构建和 contract gates 通过；产物含正确 screenshot addon。
- [ ] macOS packaged app 完成 handshake、capability、static/window/UI/cursor、long capture、annotation、OCR/QR/color、pin/history 和 export smoke。
- [ ] Windows/Linux 完成基础框选或给出环境与 capability 一致的 blocked evidence。
- [ ] Addon 签名、公证、asar unpack 和 runtime load 通过独立 verifier。
- [ ] 性能、资源清理和隐私预算通过；失败 evidence 不被改写为 pass。
- [ ] Audit R1 被关闭并附 commit/task/evidence 引用。

## Dependencies

- `07-28-rust-native-communication-protocol` 和 `07-28-rust-screenshot-mvp` 所有实现子任务完成 focused verification。

## Out of Scope

- 发布/推送 release、生产遥测请求和未授权的系统配置修改。
