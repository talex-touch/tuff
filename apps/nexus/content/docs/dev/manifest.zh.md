# Manifest 参考

## 结构
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 反向域名，唯一标识 |
| `name` | string | 是 | 显示名称，支持本地化 |
| `description` | string | 否 | 简短介绍 |
| `version` | string | 是 | 语义化版本 |
| `sdkapi` | number | **推荐** | SDK API 版本，格式 YYMMDD（如 260114） |
| `category` | string | 条件必填 | 分类 ID（与 Nexus 同步，如 `utilities`、`productivity`），用于 UI 分组（`sdkapi >= 260114` 必填） |
| `entry` | string | 是 | init 入口文件路径 |
| `preload` | string | 否 | 渲染层预加载脚本 |
| `dev.enable` | boolean | 否 | 开发模式热重载 |
| `permissions` | object | 否 | 权限声明，见下方详情 |
| `permissionReasons` | object | 否 | 权限用途说明 |
| `acceptedInputTypes` | string[] | 否 | `text`、`image`、`files`、`html` |
| `features` | object[] | 否 | CoreBox 指令、Widget、Workflow 节点 |

## SDK API 版本 (sdkapi)

`sdkapi` 字段用于声明插件兼容的 SDK API 版本。格式为 `YYMMDD`（年月日）。

- **当前版本**: `260114` (2026-01-14)
- **未声明或低于 251212**: 跳过权限校验，但会提示用户插件使用旧版 SDK
- **251212 ~ 260113**: 启用完整权限校验
- **等于或高于 260114**: 在 251212 基础上，要求声明 `category`（用于 UI 分组）

自 `260114` 起：建议补充 `category` 以参与 UI 分组展示；当 `sdkapi >= 260114` 且缺失 `category` 时，插件将被拒绝启动并在列表中标记问题。

建议新插件始终声明最新的 `sdkapi` 版本以获得完整的权限保护。

## 权限声明 (permissions)

权限系统控制插件对敏感 API 的访问。详见 [Permission API 文档](/docs/dev/api/permission)。

### 声明格式

```json
"permissions": {
  "required": ["clipboard.read", "network.internet"],
  "optional": ["storage.shared"]
},
"permissionReasons": {
  "clipboard.read": "读取剪贴板中的待翻译文本",
  "network.internet": "连接翻译服务 API"
}
```

### 可用权限

| 权限 ID | 风险 | 说明 |
|---------|------|------|
| `fs.read` | 中 | 读取文件 |
| `fs.write` | 高 | 写入文件 |
| `fs.execute` | 高 | 执行文件 |
| `clipboard.read` | 中 | 读取剪贴板 |
| `clipboard.write` | 低 | 写入剪贴板（自动授予） |
| `network.local` | 低 | 本地网络 |
| `network.internet` | 中 | 互联网访问 |
| `network.download` | 中 | 下载文件 |
| `system.shell` | 高 | 执行命令 |
| `system.notification` | 低 | 系统通知 |
| `system.tray` | 中 | 托盘交互 |
| `ai.basic` | 低 | 基础 AI |
| `ai.advanced` | 中 | 高级 AI |
| `ai.agents` | 高 | 智能体 |
| `storage.plugin` | 低 | 插件存储（自动授予） |
| `storage.shared` | 中 | 共享存储 |
| `window.create` | 低 | 创建窗口（自动授予） |
| `window.capture` | 高 | 屏幕截图 |

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
  "sdkapi": 260114,
  "category": "utilities",
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
  "permissions": {
    "required": ["clipboard.read"],
    "optional": ["storage.shared"]
  },
  "permissionReasons": {
    "clipboard.read": "读取剪贴板中的待办内容"
  },
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
