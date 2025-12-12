# Manifest 参考

## 结构
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 反向域名，唯一标识 |
| `name` | string | 是 | 显示名称，支持本地化 |
| `description` | string | 否 | 简短介绍 |
| `version` | string | 是 | 语义化版本 |
| `sdkapi` | number | **推荐** | SDK API 版本，格式 YYMMDD（如 251212） |
| `entry` | string | 是 | init 入口文件路径 |
| `preload` | string | 否 | 渲染层预加载脚本 |
| `dev.enable` | boolean | 否 | 开发模式热重载 |
| `permissions` | string[] | 否 | `clipboard`、`storage`、`network` 等 |
| `acceptedInputTypes` | string[] | 否 | `text`、`image`、`files`、`html` |
| `features` | object[] | 否 | CoreBox 指令、Widget、Workflow 节点 |

## SDK API 版本 (sdkapi)

`sdkapi` 字段用于声明插件兼容的 SDK API 版本。格式为 `YYMMDD`（年月日）。

- **当前版本**: `251212` (2025-12-12)
- **未声明或低于 251212**: 跳过权限校验，但会提示用户插件使用旧版 SDK
- **等于或高于 251212**: 启用完整权限校验

建议新插件始终声明最新的 `sdkapi` 版本以获得完整的权限保护。

## 示例
```json
{
  "id": "com.tuff.todo",
  "name": {
    "default": "待办",
    "en": "Todo"
  },
  "description": "快速记录与同步待办",
  "version": "1.3.0",
  "sdkapi": 251212,
  "entry": "init/index.ts",
  "features": [
    {
      "type": "corebox",
      "id": "todo.new",
      "title": "快速创建待办",
      "keywords": ["todo", "task"],
      "queryMode": "text"
    }
  ],
  "permissions": ["storage", "clipboard"],
  "acceptedInputTypes": ["text", "files"]
}
```

## 校验
- `id` 必须唯一且只含字母数字点。
- `version` 需遵循 `major.minor.patch`，自动比较以确定更新顺序。
- 当 `permissions` 包含 `network` 时需声明允许的域名。

## 常见错误
| 情况 | 解决办法 |
| --- | --- |
| 未填写 entry | 指定 `init/index.ts` 并确保文件存在 |
| 权限过多被拒 | 仅声明实际需要的权限，首版尽量最小化 |
| features 关键词冲突 | 使用命名空间（如 `todo.` 前缀）避免重复 |
