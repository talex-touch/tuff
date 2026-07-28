# DivisionBox 示例

本目录提供 DivisionBox 插件集成的参考代码。示例是可选择性移植的源码
片段，不是独立可运行的应用；接入插件前仍需按当前 Manifest、权限和
类型化 SDK 契约调整。

## 示例文件

- [basic-usage.ts](basic-usage.ts)：创建、更新和关闭 DivisionBox 会话。
- [keepalive-mode.ts](keepalive-mode.ts)：KeepAlive 会话与状态恢复。
- [custom-header.ts](custom-header.ts)：Header 配置和操作按钮。
- [flow-integration.ts](flow-integration.ts)：通过 Flow 传递参数并处理结果。
- [flow-usage-example.ts](flow-usage-example.ts)：Flow 调用侧示例。
- [manifest-example.json](manifest-example.json)：示例插件 Manifest。

## 使用前提

1. 在仓库根目录执行 `pnpm install --frozen-lockfile`。
2. 在插件项目中使用当前 workspace 提供的 `@talex-touch/utils` typed SDK。
3. 根据 [Manifest 参考](../../content/docs/dev/reference/manifest.zh.mdc)
   声明所需能力和权限。
4. 对照 [DivisionBox API](../../content/docs/dev/api/division-box.zh.mdc)
   与[架构说明](../../content/docs/dev/architecture/division-box.zh.mdc)
   选择示例片段。
5. 使用插件自己的开发、校验和构建命令验证集成，不要把本目录当作独立
   package 执行。

英文参考页：

- [DivisionBox API (English)](../../content/docs/dev/api/division-box.en.mdc)
- [DivisionBox architecture (English)](../../content/docs/dev/architecture/division-box.en.mdc)
