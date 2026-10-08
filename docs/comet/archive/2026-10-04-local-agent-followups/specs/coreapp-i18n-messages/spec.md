# CoreApp I18n Messages

本规格描述 CoreApp 渲染层文案（`apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`）的编译要求。

## 编译

- 两份语言文件中的每一条文案，都必须能被项目所用的 vue-i18n 消息编译器（`@intlify/message-compiler`）无错误地编译。
- 文案里要原样显示的特殊字符，必须使用 vue-i18n 的字面量写法，例如 `{'{'}`、`{'}'}`、`{'@'}`、`{'|'}`。裸 `|` 会被当成复数分隔符，只显示第一段。渲染结果与书写意图一致：示例 JSON 显示为 `{ "tag": "v1.0.0" }`，`@` 开头的包名显示为 `@modelcontextprotocol/…`。
- 中英两份文件的键保持一一对应。

### Scenario: placeholders render as written

Acceptance: A3

WHEN 打开插件安装页的元数据输入框，THEN 占位文字显示为 `{ "tag": "v1.0.0" }`，页面不报 i18n 编译错误；用 vue-i18n 编译器编译两份语言文件的全部文案，失败数为 0；含 `|` 等需要原样显示的字符的文案（如 en-US 的 `settings.intelligence.promptStatsLabel`），渲染出完整原文，而不是只有第一段。
