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

### `tuff builder`

将插件项目构建为可分发的 `.tpex` 包。

```bash
tuff builder
```

**功能:**
- 扫描项目中的插件资源
- 生成清单文件并打包资源
- 输出可分发的 `.tpex` 文件

### `tuff publish`

将插件发布到 Tuff Nexus 服务器。

```bash
tuff publish --tag v1.0.0 --channel RELEASE
```

**选项:**
- `--tag, -t` - 版本标签（如 v1.0.0）
- `--channel, -c` - 发布通道：`RELEASE`、`BETA` 或 `SNAPSHOT`（默认：`SNAPSHOT`）
- `--notes, -n` - 发布说明（支持 Markdown）
- `--dry-run` - 预览模式，不实际发布
- `--api-url` - 自定义 API 端点

**示例:**
```bash
tuff publish \
  --tag v1.2.0 \
  --channel RELEASE \
  --notes "### 新功能\n- 添加深色模式支持\n- 性能优化"
```

### `tuff login`

保存发布所需的认证令牌。

```bash
tuff login <token>
```

令牌存储在 `~/.tuff/auth.json`。

### `tuff logout`

删除已保存的认证凭据。

```bash
tuff logout
```

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

## 发布工作流

1. **构建插件:**
   ```bash
   pnpm build
   ```

2. **登录 Nexus:**
   ```bash
   tuff login YOUR_API_TOKEN
   ```

3. **发布:**
   ```bash
   tuff publish --tag v1.0.0 --channel RELEASE
   ```

CLI 将自动：
- 扫描 `dist/` 目录中的发布资源
- 计算 SHA256 校验和
- 在 Nexus 上创建版本
- 关联资源到版本
- 发布版本

## 资源检测

CLI 自动检测以下扩展名的资源：
- `.dmg` - macOS 磁盘映像
- `.exe` - Windows 可执行文件
- `.AppImage` - Linux AppImage
- `.deb` - Debian 软件包
- `.rpm` - RPM 软件包
- `.zip` - ZIP 压缩包
- `.tar.gz` - Gzip 压缩包
