# Tuff 生态工具文档

本目录包含 Tuff 生态系统相关工具的文档和计划。

## 生态工具

### 1. TuffCLI

命令行工具，用于插件开发、构建和发布。当前已完成“新入口 + 兼容壳 + 分包落地”结构。

- **文档**: [TUFFCLI-PRD.md](./TUFFCLI-PRD.md)
- **分包提案**: [TUFFCLI-SPLIT-PLAN.md](./TUFFCLI-SPLIT-PLAN.md)
- **现状包层（2026-03-15）**:
  - `packages/tuff-cli/`（`tuff` 主入口）
  - `packages/tuff-cli-core/`（核心编排 + validate/publish/config/auth/runtime）
  - `packages/tuffcli/`（兼容导出层）
  - `packages/unplugin-export-plugin/`（构建插件 + CLI 兼容入口 shim）
- **兼容生命周期（锁定）**:
  - `2.4.x` 保留 `unplugin` CLI shim（deprecation + 转发）
  - `2.5.0` 移除 shim，CLI 入口统一到 `@talex-touch/tuff-cli`
- **功能**:
  - 插件脚手架创建 (`tuff create`)
  - 插件构建打包 (`tuff build`)
  - 插件发布到市场 (`tuff publish`)
  - 本地开发服务器 (`tuff dev`)
  - manifest 校验 (`tuff validate`)

### 2. TuffEx

Tuff 组件库文档站点。

- **文档**: [../03-features/tuff-ui/TUFF-UI-MIGRATION-PRD.md](../03-features/tuff-ui/TUFF-UI-MIGRATION-PRD.md)
- **位置**: `packages/tuffex/`
- **状态**: 活跃（`tuffex-ui` 已迁移为历史名称）

### 3. Unplugin Export Plugin

Vite/Webpack 插件，用于导出插件元数据。当前聚焦构建插件能力，并保留 CLI 兼容入口。

- **位置**: `packages/unplugin-export-plugin/`
- **状态**: 活跃（构建插件主包；CLI 入口已降级为兼容 shim + deprecation）
- **使用方式**:
  - 常规用户：通过 `tuff` 命令调用（`@talex-touch/tuff-cli`）
  - 兼容路径：旧入口仍可调用，但会提示迁移

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

- [插件市场多源计划](../03-features/plugin/plugin-store-provider-frontend-plan.md)
- [Widget 动态加载](../03-features/plugin/widget-dynamic-loading-plan.md)
- [权限中心](../03-features/plugin/permission-center-prd.md)
