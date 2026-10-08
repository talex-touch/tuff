# 快捷键录制

## 主键来源

`FlatKeyInput` 为应用详情、插件详情和设置生成 Electron accelerator 字符串。能够识别的 `KeyboardEvent.code` 表示用户实际按下的键，优先于可能已被 Option、Shift 或输入法转换的 `KeyboardEvent.key`。

- `Digit0` 至 `Digit9` 输出对应数字，不输出 Option/Shift 生成的字符。
- `KeyA` 至 `KeyZ` 输出对应字母，包括 key 为 `Dead` 或特殊字符时。
- 受支持的标点物理键输出现有主键 token，例如 `Slash`、`Equal`、`Backquote`、`BracketLeft`，不引入另一套命名。
- 数字小键盘继续保留原有 Numpad 区分，NumpadEnter 仍为 Enter；空间、方向、导航、删除及功能键保持既有命名。
- code 缺失、Unidentified 或不能识别时，按现有 key fallback 处理；不从输入字符反推未知键盘布局。

## 修饰键与字符串

修饰键顺序继续为 meta、ctrl、alt、shift，最后是主键。

- macOS 的 meta/alt 为 Command/Option。
- Windows/Linux 的 meta/alt 为 Super/Alt。
- Control 和 Shift 跨平台保持原名称。
- 单独按修饰键不产生新的 model 更新，不覆盖已有绑定。

示例：

| 平台与事件 | accelerator |
| --- | --- |
| macOS，altKey=true，code=Digit1，key=¡ | Option+1 |
| macOS，altKey=true，shiftKey=true，code=Digit1，key 为转换后字符 | Option+Shift+1 |
| macOS，altKey=true，code=KeyE，key=Dead | Option+E |
| macOS，altKey=true，code=Slash，key=÷ | Option+Slash |
| Windows，altKey=true，code=Digit1，key=1 | Alt+1 |
| Windows，metaKey=true，code=KeyE，key=e | Super+E |

## 捕获和消费不变量

- 录制字符串通过既有 modelValue/update:modelValue 契约回写；页面消费者、保存 API 和系统注册流程不变。
- 捕获时继续阻止字符默认输入；不会把 Option 特殊字符插入文本输入框或快捷键配置。
- clearable 的清除按钮、Escape/Backspace 清除语义保持原有开关；不可清除的宿主不会被误清空。
- Escape 继续释放捕获并交还宿主取消键；Backspace 的原有焦点行为不变。
- 聚焦时禁用本应用全局快捷键，失焦时恢复；修复不增加新的禁用/恢复调用或改变其生命周期。
- 不猜测迁移已经保存的错误字符串，不改变默认绑定、冲突判定或系统占用策略。

## 验证

在当前组件上覆盖 Option 数字、Option＋Shift 数字、字母 Dead key、标点、无 code fallback 和现有焦点/清除边界。运行态使用真实浏览器中加载的当前源码组件，验证可见字段和 model 回写；系统配置与用户正在看的标签页不得作为测试数据被修改。
