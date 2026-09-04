# Tuff v2.4.14-beta.18 更新说明

## 摘要

- **修复 macOS 自动粘贴权限诊断：** 剪贴板写入后按键注入被系统拒绝时，不再误报为目标应用失去焦点。
- **区分辅助功能与自动化权限：** System Events 错误 1002 会指向“辅助功能”，Apple Events 错误 -1743 继续指向“自动化”。
- **同步智能插件恢复提示：** touch-intelligence 替换回答失败时会展示与宿主一致的权限修复路径。

## 变更内容

- 新增类型化错误 `MACOS_ACCESSIBILITY_PERMISSION_DENIED`，并使用真实 `osascript` 1002 错误样本覆盖回归测试。
