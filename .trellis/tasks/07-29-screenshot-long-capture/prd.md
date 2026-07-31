# Build bounded scrolling capture

## Goal

基于 protocol stream 和 macOS capture core 实现有界、可取消、可诊断的纵向/横向长截图，并提供实时预览、匹配状态、手动裁剪和标准输出动作。

## Requirements

- 支持纵向/横向 capture session、手动滚动、start/stop/cancel 和方向切换。
- Overlay 在 capture 时允许输入穿透，保持选区可见但不进入截图；停止状态可移动/调整选区。
- Rust stitching engine 对连续帧执行多区域重叠检测、置信度判断、增量拼接和重复帧丢弃。
- 设置 duration、frame count、width/height、pixel count、attachment queue 和 memory hard limits。
- 避免每帧重绘完整累计图像；使用 tile/strip/chunk 或临时 backing store 实现近线性增长。
- 对动态内容、固定元素、重复纹理、滚动过快、多个滚动区、方向变化和匹配失败给出明确状态。
- UI 显示 live thumbnail、当前位置、匹配成功/暂停/失败状态，支持头尾手动裁剪。
- 输出可复制、保存、快速保存、贴图和进入标注；不实现 PixPin 会员自动裁剪。

## Acceptance Criteria

- [ ] 真实网页、聊天、表格/代码场景可完成纵向长截图；横向 fixture 可完成横向拼接。
- [ ] 重复帧不增长结果，低置信帧不污染累计图像，后续可靠帧可恢复。
- [ ] 内存与复制成本随输出近线性增长，超预算受控终止并保留可用结果或明确失败。
- [ ] Cancel/timeout/backpressure/dispose 后无迟到 frame、重复 terminal 或残留 session。
- [ ] 固定元素、动态内容、重复纹理和多滚动区失败有回归 fixture。
- [ ] Rust algorithm tests、stream contract、renderer workflow 和 packaged macOS evidence 通过。

## Dependencies

- `07-28-rust-native-communication-protocol` 的 stream runtime。
- `07-29-macos-screenshot-capture-core` 的连续区域帧。
- `07-29-screenshot-tool-workflow` 的 overlay/session UI。

## Out of Scope

- 自动驱动目标应用滚动。
- Reverse-scroll 自动裁剪等 PixPin 会员行为。
- Windows/Linux 首期长截图。
