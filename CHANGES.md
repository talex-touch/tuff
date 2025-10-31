# 变更日志

> 记录项目的重大变更和改进

## 2025-01-XX

### 清理: 移除冗余的窗口关闭处理代码

**变更类型**: 清理/重构

**描述**: 
- 移除了 `TouchApp` 中冗余的 `_setupWindowCloseHandler()` 方法
- 窗口关闭事件处理已由 `TrayManager` 模块统一管理（在 `registerWindowEvents()` 方法中）
- 清理了相关的注释和代码

**修改文件**:
- `apps/core-app/src/main/core/touch-app.ts`: 移除 `_setupWindowCloseHandler` 方法和相关调用

**技术细节**:
- 窗口关闭到托盘功能现在完全由 Tray 模块负责：
  - `TrayManager.registerWindowEvents()` 方法处理窗口关闭事件
  - 根据 `closeToTray` 配置决定是否最小化到托盘
  - 避免了代码重复和维护问题

**影响**: 
- 代码结构更清晰，职责分离更明确
- 消除了代码重复和潜在的维护问题

---

## 2025-01-XX

### 修复: TypeScript 编译错误

**变更类型**: Bug 修复

**描述**: 修复了构建过程中的所有 TypeScript 类型错误

**主要修复**:
1. **未使用的声明 (TS6133)**:
   - 移除了未使用的导入（`path`, `fs`, `ModuleDestroyContext`）
   - 移除了未使用的私有方法（`_syncFileFromDevServer`）
   - 修复了未使用参数的警告

2. **类型不匹配 (TS2322)**:
   - 修复了 `Primitive` 类型错误（将 `unknown` 转换为 `string`）
   - 修复了 icon 类型错误（`'base64'` → `'url'`，字符串 → `ITuffIcon` 对象）
   - 修复了 `boolean | undefined` 类型问题

3. **属性不存在 (TS2339)**:
   - 修复了 `DevServerHealthCheckResult.data` 属性移除
   - 修复了 `ITouchPlugin._windows` 访问（使用类型断言）

4. **导入错误 (TS2304)**:
   - 修复了 `useAuthState.ts` 中缺少 `computed` 导入
   - 修复了 `useClerkConfig.ts` 中环境变量类型问题

5. **参数类型错误 (TS2345)**:
   - 修复了事件处理器类型，使用 `ITouchEvent` 基类并类型断言

**修改文件**:
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/providers/clipboard.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/service/failed-files-cleanup-task.ts`
- `packages/utils/core-box/builder/tuff-builder.ts`
- `packages/utils/search/types.ts`
- `packages/utils/auth/useAuthState.ts`
- `packages/utils/auth/useClerkConfig.ts`

**影响**: 项目现在可以通过 TypeScript 类型检查，构建流程正常

---

## 2025-01-XX

### 优化: GitHub Actions 构建发布流程

**变更类型**: 工作流优化

**描述**: 简化了构建发布流程，移除了手动触发时的版本号和标签创建

**主要变更**:
1. **简化手动触发**:
   - 移除了 `version` 输入字段
   - 移除了手动触发时的 Git 标签创建步骤
   - 手动触发时直接构建，不处理版本号

2. **标签触发优化**:
   - 保留标签推送触发机制（使用 bumpp 打好的标签自动触发）
   - 从标签自动提取版本号并更新 package.json

**修改文件**:
- `.github/workflows/build-and-release.yml`

**新的工作流程**:
- **方式 1**: 使用 `bumpp` 打标签后自动触发构建和发布
- **方式 2**: 手动触发构建（不创建标签，直接构建并创建 draft Release）

**影响**: 构建流程更简洁，符合团队工作流

---
