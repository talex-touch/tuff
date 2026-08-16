# Clipboard History Plugin

剪贴板历史记录插件。从 Tuff 核心提取剪贴板历史能力，把复制过的内容留在手边，随时翻回去重新粘贴。

## 功能特性

- 📋 **历史留存**: 自动记录复制过的文本、图片、文件与富文本
- 🔍 **CoreBox 直达**: 输入「剪贴板」或 `clipboard-history` 即可唤起，也可推送到根搜索结果
- 🖼️ **多类型识别**: 支持 `text` / `image` / `files` / `html` 四类输入，各自渲染对应预览
- ↩️ **一键回写**: 选中任意历史条目重新写回系统剪贴板
- 🏷️ **来源标注**: 记录复制时的来源应用，便于回忆上下文
- 🌙 **主题跟随**: 跟随宿主明暗主题

## 权限

插件按最小必要原则声明权限，每项都在 `manifest.json` 的 `permissionReasons` 中写明用途：

| 权限 | 用途 |
| --- | --- |
| `clipboard.read` | 读取剪贴板历史记录并展示详情 |
| `clipboard.write` | 将选中的剪贴记录重新写回系统剪贴板 |
| `search.root-results` | 将剪贴板历史入口推送到 CoreBox 根搜索结果 |

根搜索结果推送受 `searchProviders` 的 `defaultState: "ask"` 约束，需用户显式同意后才会生效。
权限被拒绝时插件 fail-closed，不会静默降级为空列表。

## 目录结构

```
index/main.ts                 Prelude：轻量入口，能力注册与回调
src/views/                    Surface：剪贴板管理主视图
src/components/               条目列表、详情、操作栏、类型图标
src/utils/clipboard-items.ts  条目模型与类型判定
src/utils/active-app.ts       来源应用识别
```

## 开发

```bash
pnpm -C plugins/clipboard-history dev        # 本地开发服务（127.0.0.1:3488）
pnpm -C plugins/clipboard-history build      # 构建并打包为 .tpex
pnpm -C plugins/clipboard-history test       # 单元测试
pnpm -C plugins/clipboard-history typecheck  # 类型检查
```

开发模式需要把 `manifest.json` 的 `dev.enable` 置为 `true`，宿主会转而从 `dev.address` 加载 Surface。
