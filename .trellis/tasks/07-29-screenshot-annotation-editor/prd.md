# Build screenshot annotation editor

## Goal

建立可撤销、可序列化、可再次编辑的截图标注文档与编辑器，覆盖截图套件的基础标注工具和图像效果。

## Requirements

- 编辑器使用 Electron/Vue renderer；Rust 只负责必要的底层像素处理和有界导出，不创建标注 UI。
- 中央 annotation document 是唯一状态源，记录 original resource identity、canvas、tool nodes、z-order、selection、style、operation history 和 cursor；标注不得覆盖原图。
- Undo/redo operation history 必须可序列化并随历史项持久化；重开后可继续撤销/重做，撤销后新操作截断 redo branch。
- 工具包括矩形/椭圆、直线/折线、箭头、序列号、铅笔、荧光笔、马赛克/模糊、文字、橡皮擦、聚光灯、水印和放大镜。
- 支持 undo/redo、选择、移动、resize、rotation、删除、二次编辑、颜色/透明度、粗细/大小。
- Shape 支持正方形/正圆、圆角、弧/扇形；line/arrow 支持角度约束、端点和连接样式。
- 工具栏采用主/次分区并可重排常用工具；按钮使用现有图标库并提供 tooltip。
- 编辑器工作区可处理普通截图和有界长图 viewport，不一次性把超长位图完整上传 GPU。
- 导出由 original + document 当前 cursor 生成确定性扁平结果；rounding、scale、alpha 和 color space 明确，输出文件不能携带可逆 annotation/original payload。
- 历史不永久复制扁平终稿，必要 thumbnail/cache 可重建且计入资源预算。
- Editor draft 在首次 copy/save/pin/explicit complete 时与 original + operations 原子提交；此前 cancel 必须删除 draft resource/document。
- 不实现智能擦除、箭头评论等 PixPin 会员能力。

## Acceptance Criteria

- [ ] 12 类工具具备创建、选择、编辑、删除和导出回归。
- [ ] Undo/redo 对 mixed tool sequence 可重放且不丢失样式/z-order；持久化历史重开后 cursor 和 redo branch 行为一致。
- [ ] Original bitmap 保持不变，首次完成动作原子提交 original + document；从未完成的 editor cancel 不留下 image history、operation log 或 draft resource。
- [ ] 高 DPI 和缩放 viewport 下命中测试与导出像素一致。
- [ ] 马赛克/模糊的扁平导出不携带可逆原始区域或 annotation document；非破坏性历史仍按用户选择保留独立原图并受清理策略约束。
- [ ] 长图使用分块/viewport rendering，不因大图直接 OOM 或纹理超限。
- [ ] Document serialization、renderer interaction、visual regression 和 export tests 通过。

## Dependencies

- `07-29-screenshot-tool-workflow` 提供截图 session/resource 与编辑入口。

## Out of Scope

- OCR/QR 算法、通用设计画布、协作编辑和会员智能擦除。
