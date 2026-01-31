# Tuff 生态工具文档

本目录包含 Tuff 生态系统相关工具的文档和计划。

## 生态工具

### 1. TuffCLI

命令行工具，用于插件开发、构建和发布。整合了 `unplugin-export-plugin` 的核心功能。

- **文档**: [TUFFCLI-PRD.md](./TUFFCLI-PRD.md)
- **分包提案**: [TUFFCLI-SPLIT-PLAN.md](./TUFFCLI-SPLIT-PLAN.md)
- **核心包**: `packages/unplugin-export-plugin/` (底层实现)
- **功能**:
  - 插件脚手架创建 (`tuff create`)
  - 插件构建打包 (`tuff build`)
  - 插件发布到市场 (`tuff publish`)
  - 本地开发服务器 (`tuff dev`)

### 2. TuffEx-UI

Tuff 组件库文档站点。

- **文档**: [../03-features/tuff-ui/TUFF-UI-MIGRATION-PRD.md](../03-features/tuff-ui/TUFF-UI-MIGRATION-PRD.md)
- **位置**: `packages/tuffex-ui/`
- **状态**: 活跃

### 3. Unplugin Export Plugin

Vite/Webpack 插件，用于导出插件元数据。**现已集成到 TuffCLI 工具链中**。

- **位置**: `packages/unplugin-export-plugin/`
- **状态**: 活跃（作为 TuffCLI 底层）
- **使用方式**: 通过 `tuff` 命令调用

## 使用指南

### 快速开始

```bash
# 构建插件
tuff build

# 发布插件
tuff publish

# 启动开发服务器
tuff dev
```

### 直接使用 unplugin (高级)

如果需要直接在 Vite 配置中使用：

```typescript
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'

export default defineConfig({
  plugins: [TouchPluginExport()]
})
```

## 相关文档

- [插件市场多源计划](../03-features/plugin/plugin-market-provider-frontend-plan.md)
- [Widget 动态加载](../03-features/plugin/widget-dynamic-loading-plan.md)
- [权限中心](../03-features/plugin/permission-center-prd.md)
