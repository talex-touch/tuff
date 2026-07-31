# Build image pin and screenshot history

## Goal

提供截图套件所需的通用图像贴图和有界截图/区域历史，使用户能把截图固定在屏幕上、恢复最近资源并可靠销毁敏感内容。

## Requirements

- Image pin 使用 Electron `BrowserWindow`/Vue surface；Rust 不创建 pin window，只提供图像资源与处理能力。
- Image pin 支持移动、键盘微调、缩放、透明度、锁定、标注、阴影、always-on-top、关闭/恢复、拖拽导出、销毁、鼠标穿透、取色和缩略显示。
- Pin window 使用受控本地资源 URL，不把图片内嵌到 data URL HTML；窗口 sandbox/context isolation 与现有安全默认一致。
- 区分 close（进入可恢复列表）和 destroy（清除专属资源且不可恢复），并提供明确保留期限和数量上限。
- 活动 pin 默认持久化 resource identity、bounds/display、scale、opacity、lock、always-on-top、click-through、shadow 与 annotation identity；正常退出标记 suspended，下一次 screen ready 且资源校验通过后自动恢复。手动 close 的 pin 不自动重开。
- Pin restore 必须校验资源 allowlist/完整性并按当前显示器拓扑 clamp；缺失、损坏或已清理资源按单项 degraded，不阻断其他 pin。
- Screenshot history 默认开启，每条记录保存 original resource + 可序列化 annotation document/operation cursor，不保存重复扁平终稿；original、document 和必要 thumbnail/cache 共同计入 1 GiB。
- 选区确认产生 session draft；第一次 copy/save/pin/explicit complete 时原子提交历史，未完成即 cancel 删除 draft。已提交记录重开后继续 undo/redo。
- History 同时受 100 张、30 天、1 GiB 三重上限约束；任一上限先到即 oldest-first 清理。
- Region history 默认保存最近 20 条 display identity、DIP rect 与 scale context，不保存图像、窗口标题、应用路径或无界副本。
- 支持上一张/下一张截图和最近/反向最近区域恢复；显示器拓扑变化时修复或拒绝失效区域。
- 历史可关闭和清空：关闭只停止新增持久化，不暗中删除既有记录；显式清空删除索引与资源，部分失败必须保留可重试 cleanup evidence，不能 fake success。
- 不实现文本/文件/颜色/LaTeX pin 或跨类型分组管理。

## Acceptance Criteria

- [ ] 截图可直接创建 image pin，所有基础窗口操作和快捷键有效。
- [ ] Close 后可恢复，destroy/clear 后资源、历史引用和窗口均不可恢复。
- [ ] Active pin 状态跨正常退出持久化并在重启后恢复；手动 close 不自动重开，destroy 后不可恢复。
- [ ] Missing/corrupt/已清理资源只跳过对应 pin；显示器变化后恢复窗口保持可见且不映射到错误 display。
- [ ] Image history 默认开启，并分别/组合验证 100 张、30 天和 1 GiB oldest-first eviction；region history 最多保留 20 条 metadata-only 记录。
- [ ] 已提交历史项重开后可从持久化 cursor 继续 undo/redo，且没有重复扁平终稿占用；未完成 cancel 不留下 draft。
- [ ] 关闭后不再采集；显式 clear 后成功删除项不可恢复，部分清理失败可重试且 UI 不报告全量成功。
- [ ] 多屏变化后 pin 和 region 不会完全丢到屏幕外或映射到错误显示器。
- [ ] 拖拽、剪贴板、标注入口和本地资源协议通过真实 Electron 测试。
- [ ] Pin lifecycle、history persistence、privacy cleanup 和 packaged macOS evidence 通过。

## Dependencies

- `07-29-screenshot-tool-workflow` 提供截图资源和 action surface。
- `07-29-screenshot-annotation-editor` 提供 pin annotation 入口；可在该依赖完成前交付不含标注的基础 pin slice。

## Out of Scope

- 非图像 pin 类型、pin 分组、云同步和 PixPin 会员翻译/文本范围选择。
