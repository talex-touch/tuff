# TuffCLI - 插件开发命令行工具

> 版本: v1.0.0
> 状态: Phase1+2 已完成（2026-03-15）

## 概述

TuffCLI 是 Tuff 插件生态系统的命令行工具，用于简化插件开发、构建和发布流程。当前已完成主入口、核心命令迁移与兼容层收口。

## 核心功能

### 1. 插件脚手架 (`tuff create`)

```bash
tuff create my-plugin
# 交互式选择:
# - 插件类型: 基础 / UI / 后台服务
# - 语言: TypeScript / JavaScript
# - UI 框架: Vue / React / 无
# - 模板: 默认 / 翻译 / 图片处理 / 自定义
```

### 2. 插件构建 (`tuff build`)

```bash
tuff build
# 选项:
# --watch    监听文件变化
# --dev      开发模式构建
# --prod     生产模式构建 (默认)
# --output   输出目录
```

**构建流程**:
1. 读取 `manifest.json`
2. 编译 TypeScript/JavaScript
3. 处理静态资源
4. 生成 `index.js` (Prelude)
5. 打包 Widget 组件
6. 输出到 `dist/`

### 3. 插件发布 (`tuff publish`)

```bash
tuff publish
# 选项:
# --registry  发布目标 (nexus/npm/github)
# --dry-run   模拟发布
# --tag       版本标签
```

**发布流程**:
1. 验证 API Key (从 Dashboard 获取)
2. 校验 manifest.json
3. 构建生产版本
4. 上传到插件市场
5. 更新版本记录

### 4. 本地开发 (`tuff dev`)

```bash
tuff dev
# 选项:
# --port     开发服务器端口 (默认 5173)
# --host     开发服务器主机
# --open     自动打开浏览器
```

**开发模式功能**:
- 热重载 (HMR)
- manifest 变化自动重载
- 连接 Tuff App 实时预览
- 开发日志输出

### 5. 无参数交互模式

当不带参数运行 `tuff` 时，进入交互式选择：

```bash
$ tuff

? 请选择操作:
  ❯ 创建新插件 (create)
    构建插件 (build)
    发布插件 (publish)
    启动开发服务器 (dev)
    查看帮助 (help)
```

## 配置文件

### `tuff.config.ts`

```typescript
import { defineConfig } from '@talex-touch/tuffcli'

export default defineConfig({
  // 插件入口
  entry: 'src/index.ts',
  
  // 输出目录
  outDir: 'dist',
  
  // 开发服务器配置
  dev: {
    port: 5173,
    host: 'localhost',
  },
  
  // 构建配置
  build: {
    minify: true,
    sourcemap: false,
  },
  
  // 发布配置
  publish: {
    registry: 'nexus',
  },
})
```

## API Key 认证

1. 用户在 Dashboard 创建 API Key
2. 本地配置:
   ```bash
   tuff login
   # 或
   export TUFF_API_KEY=tuff_xxx...
   ```
3. 发布时自动使用认证

## 当前实现状态（2026-03-15）

- 已落地：
  - `@talex-touch/tuff-cli` 承接 `tuff` 主入口。
  - `@talex-touch/tuff-cli-core` 已承接核心编排（`args/config/auth/publish/validate/runtime`）。
  - 兼容入口保留并输出 deprecation 提示（迁移指向 `@talex-touch/tuff-cli`，旧 `unplugin` 入口已 shim 转发）。
  - `tuff validate` 命令已上线（manifest/sdkapi/category/permissions 校验，支持非交互失败码）。
  - `@talex-touch/tuffcli` 兼容导出 `defineConfig/types` 已可用。
  - 文档与示例包名已统一到新包层（保留兼容说明）。

## 实现计划

### Phase 1: 基础框架 (3天)

- [x] 项目初始化（主入口与兼容层）
- [x] `tuff create` 基础脚手架
- [x] 核心编排迁移到 `tuff-cli-core`（2026-03-15）
- [ ] 模板系统治理（版本化/来源可控）

### Phase 2: 构建系统 (5天)

- [x] `tuff build` 实现
- [x] TypeScript 编译
- [x] Widget 打包
- [x] 资源处理

### Phase 3: 发布系统 (3天)

- [x] `tuff publish` 实现
- [x] API Key 认证
- [x] 版本管理增强（分包迁移后统一，保持 dist-tag 兼容）

### Phase 4: 开发体验 (4天)

- [x] `tuff dev` 热重载
- [x] 无参数交互模式
- [x] 错误提示与文案收敛（兼容入口 deprecation + 非交互失败码）

## 技术栈

- **CLI 框架**: Commander.js
- **交互式**: Inquirer.js / Prompts
- **构建**: esbuild / Vite
- **日志**: Chalk + Ora
- **HTTP**: Ofetch

## 相关文档

- [API Key 管理 (Dashboard)](../../apps/nexus/app/pages/dashboard/api-keys.vue)
- [插件市场 API](../03-features/plugin/plugin-store-provider-frontend-plan.md)
