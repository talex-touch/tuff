# Tuff v2.4.11-beta.6 更新说明

## 本次更新

- 收口 UI/兼容债务小切片：新增 retained legacy alias 命中 telemetry，旧 snippets 占位插件退为 hidden/deprecated，并将 Nexus evidence source 分层为 `live` / `d1` / `r2` / `local-only` / `memory` / `open`。
- Dialog 消息渲染改为默认纯文本，可信 HTML 改走显式 `messageHtml`，降低隐式 `v-html` 带来的误用风险。
- 加固 Windows App indexing 与 Everything CLI 探测：验证快捷方式目标、展开注册表环境变量、补充 App Paths 注册表来源，并从注册表 Path 构造 Everything CLI 候选路径。
- CoreBox 阻断 `F1`-`F24` function keys，避免 F11 fullscreen 或插件 UI 侧 function-key 泄漏；IME composition 输入期间自定义 placeholder 也会按原生输入值及时隐藏。
- 手动文件索引完成后增加系统通知，便于用户知道 rebuild 已完成。
- 扩展 TuffEx Drawer / Divider 能力与 Nexus 示例，补齐方向、尺寸、插槽、mask、mobile bottom sheet 与渐变分割线文档。

## 已验证

- GitHub Actions `Build and Release` 三平台矩阵已成功完成，并创建 `v2.4.11-beta.6` GitHub prerelease。
- Nexus release sync 已成功发布，`BETA` latest 指向 `v2.4.11-beta.6`。
- 发布后远端 gate 检查确认 Nexus release metadata、远端中英文 notes、下载端点与 latest channel 可用。

## 已知限制

- 该版本是 `2.4.11` beta 测试包，不代表正式 release gate 全绿。
- Nexus 远端资产仍缺少 sha256 / signatureUrl 与 signature endpoint，Gate D 当前按 warning 记录；正式 Gate E 仍需继续收口。
- Windows/macOS release-blocking 真机 evidence、TuffEx visual smoke 真实截图运行证据与完整 release-cycle legacy alias hit=0 观察仍需后续补齐。
