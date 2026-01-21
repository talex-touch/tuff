# Examples 索引

本目录作为 Nexus 常用代码的源目录，覆盖插件 SDK、通信、消息通知、DivisionBox、工具包等场景。

## 目录结构与命名规范
- 文件/目录统一使用 kebab-case。
- 根目录保留历史示例；新增示例优先按领域放入子目录。
- 示例文件以场景命名，推荐 `.ts`（类型更清晰），兼容 `.js`。
- 备份或临时文件（如 `.bak`）不作为示例入口。

## 示例分组

### 插件基础与生命周期
- [basic-usage.js](./basic-usage.js) - SDK sendMessage 基础
- [complete-example.js](./complete-example.js) - 完整插件示例
- [index.js](./index.js) - SDK 封装样例
- [plugin-index-example.js](./plugin-index-example.js) - IFeatureLifeCycle index.js 示例
- [plugin-receiver-example.js](./plugin-receiver-example.js) - 插件接收消息示例

### 插件通信 / Channel
- [communicate-example.js](./communicate-example.js) - communicateWithPlugin 通信
- [complete-communication-example.js](./complete-communication-example.js) - 完整通信流程

### 消息与通知
- [message-system-example.js](./message-system-example.js) - 消息系统示例
- [notification-example.js](./notification-example.js) - 通知展示示例

### DivisionBox 交互
- [division-box/README.md](./division-box/README.md)
- [division-box/basic-usage.ts](./division-box/basic-usage.ts)
- [division-box/keepalive-mode.ts](./division-box/keepalive-mode.ts)
- [division-box/custom-header.ts](./division-box/custom-header.ts)
- [division-box/flow-integration.ts](./division-box/flow-integration.ts)
- [division-box/flow-usage-example.ts](./division-box/flow-usage-example.ts)
- [division-box/manifest-example.json](./division-box/manifest-example.json)

### 工具包与通用能力
- [util-pkg/tuff-help](./util-pkg/tuff-help)
- [util-pkg/tuff-test](./util-pkg/tuff-test)
- [util-pkg/tuff-utils](./util-pkg/tuff-utils)

### Deprecated
- [tuff-builder.example.ts.bak](./tuff-builder.example.ts.bak) - 备份文件，不作为示例入口
