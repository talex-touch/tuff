# Integrate screenshot OCR QR and color tools

## Goal

把现有本地 OCR、二维码识别和像素取色能力接入截图 overlay、结果动作与 image pin，同时保持离线优先、权限隔离和敏感数据卫生。

## Requirements

- OCR 复用现有 native OCR facade，不从 screenshot Rust crate 复制 OCR engine；选区 OCR 可复制文本并返回稳定 engine/language/confidence metadata。
- QR detection 使用经过验证的库/现有依赖，支持显示内容、复制和经过 URL policy 校验后打开浏览器。
- QR 自动检测可配置和快捷切换；大图/长图检测必须有尺寸、数量和耗时预算。
- 放大镜显示指针附近像素与网格；取色输出 RGB/HEX，并提供 HSV/HSL 标准转换。
- Screenshot overlay 与 image pin 共享 color/OCR/QR typed service，不各自解析 raw payload。
- OCR 文本、QR 内容和像素上下文不得进入日志、遥测、历史摘要或普通配置。
- 会员表格/公式识别、多语言 OCR 选择、工业条码和翻译不进入本任务。

## Acceptance Criteria

- [ ] 静态选区与 image pin 可完成 OCR，并复制准确文本。
- [ ] QR 可检测、展示、复制；危险/非允许 URL 不直接打开。
- [ ] 取色在 Retina、缩放和多显示器下对应真实捕获像素，格式转换正确。
- [ ] OCR/QR cancel、timeout、空结果、无权限和 invalid image 返回稳定结果。
- [ ] 大图预算、敏感日志扫描、typed service 和端到端 UI tests 通过。

## Dependencies

- `07-29-screenshot-tool-workflow` 提供 overlay/action integration。
- `07-29-macos-screenshot-capture-core` 提供像素与区域资源。
- 可复用现有 OCR addon；不依赖 OCR Rust 重写。

## Out of Scope

- 表格/公式/工业条码、翻译、云 OCR 和后台持续屏幕 OCR。
