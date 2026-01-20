---
title: Tuff CLI
description: 用于构建和发布 Tuff 插件的命令行工具
---

# Tuff CLI

`@talex-touch/unplugin-export-plugin` 包提供了名为 `tuff` 的 CLI 工具，用于构建和发布 Tuff 插件。

## 安装

```bash
# 全局安装
pnpm add -g @talex-touch/unplugin-export-plugin

# 或通过 npx 使用
npx tuff <command>
```

## 命令

**`tuff create [name]`**

通过交互式问题创建新插件（类型、语言、UI 框架、模板等）。

**`tuff build`**

执行 Vite 构建并打包输出 `.tpex`。

```bash
tuff build --watch --dev --output dist
```

**选项:**
- `--watch` - 监听文件变化并重复打包
- `--dev` - 开发模式（不压缩、开启 sourcemap）
- `--output <dir>` - 输出目录（默认 `dist`）

**`tuff builder`**

仅打包已有构建产物为 `.tpex`（不触发 Vite build）。

```bash
tuff builder
```

**`tuff dev`**

启动插件开发用的 Vite dev server。

```bash
tuff dev --host --port 5173 --open
```

**选项:**
- `--host [host]` - 绑定主机（省略值则监听所有地址）
- `--port <port>` - 开发服务器端口
- `--open` - 启动后打开浏览器

**`tuff publish`**

发布最新 `.tpex` 包到 Tuff Nexus。

```bash
tuff publish --tag 1.0.0 --channel RELEASE
```

**选项:**
- `--tag` - 版本标签（默认读取 package.json）
- `--channel` - 发布通道：`RELEASE` / `BETA` / `SNAPSHOT`
- `--notes` - 变更说明（Markdown）
- `--dry-run` - 预览模式，不实际发布
- `--api-url` - 自定义发布 API

**`tuff login`**

保存发布所需的认证令牌。

```bash
tuff login <token>
```

令牌存储在 `~/.tuff/auth.json`。

**`tuff logout`**

删除已保存的认证凭据。

```bash
tuff logout
```

**`tuff help`** / **`tuff about`**

输出帮助或工具信息。

**`tuff`**

不带参数运行进入交互模式。

## Vite 插件集成

你也可以将 unplugin 作为 Vite 插件使用，实现自动构建：

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import TuffExport from '@talex-touch/unplugin-export-plugin/vite'

export default defineConfig({
  plugins: [
    TuffExport({
      // 插件选项
    })
  ]
})
```

## 配置

可选 `tuff.config.{ts,js,mjs,cjs}` 用于设置 build/dev/publish 的默认值。
优先级: CLI 参数 > tuff.config > manifest > 默认值。

## 发布工作流

1. **构建插件:**
   ```bash
   tuff build
   ```
   （或 `vite build && tuff builder`）

2. **登录 Nexus:**
   ```bash
   tuff login YOUR_API_TOKEN
   ```

3. **发布:**
   ```bash
   tuff publish --tag 1.0.0 --channel RELEASE
   ```

CLI 将自动：
- 扫描 `dist/build`（及 `dist`）中的 `.tpex`
- 校验 manifest/package 版本一致
- 上传最新 `.tpex` 到发布 API
