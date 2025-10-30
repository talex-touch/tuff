# 跨平台文字选中与悬浮工具条系统

## 阶段一：修复 active-win 依赖问题

### 1. 修复 active-win 模块加载错误

**问题分析**：`active-win@9.0.0` 在动态导入时报错找不到 `mock-aws-s3` 模块，这是依赖解析问题。

**解决方案**：

- 检查 `active-win` 在 Electron 打包环境下的兼容性
- 考虑替换为 `@napi-rs/active-win` 或其他更稳定的原生模块
- 如果 `active-win` 无法修复，实现平台特定的原生方案

**关键文件**：

- `apps/core-app/src/main/modules/system/active-app.ts` - 当前使用 active-win 的服务
- `package.json` - 依赖管理

## 阶段二：实现全局文字选中检测

### 2. 创建 TextSelectionModule

**目标**：检测用户在任何应用中选中文字的事件和位置。

**实现策略**：

- **macOS**：使用 Accessibility API 监听选中文字变化，需要辅助功能权限
- **Windows**：使用 UI Automation API 或模拟 `Ctrl+C` 检测剪贴板变化
- **Linux**：使用 X11 Selection API 或 Wayland 协议监听 PRIMARY selection

**技术方案**：

- 创建 `apps/core-app/src/main/modules/text-selection/` 目录
- 实现基类 `TextSelectionProvider`
- 针对每个平台实现具体提供者：
  - `MacTextSelectionProvider` - 使用 node-mac-accessibility
  - `WindowsTextSelectionProvider` - 使用 node-win-uiautomation 或原生 addon
  - `LinuxTextSelectionProvider` - 使用 X11 bindings

**事件流程**：

1. 用户选中文字（通过全局快捷键触发或自动检测）
2. 获取选中文字内容和屏幕坐标
3. 发送事件到主进程：`text-selection:detected`
4. 触发悬浮工具条显示

### 3. 实现全局快捷键触发

**快捷键**：`Cmd/Ctrl+Shift+E` 触发文字选中检测和工具条

**集成点**：

- 在 `ShortcutModule` 中注册新的全局快捷键
- 快捷键触发时：

  1. 保存当前剪贴板内容
  2. 模拟 `Cmd/Ctrl+C` 复制选中文字
  3. 读取新的剪贴板内容
  4. 恢复原剪贴板内容
  5. 获取光标/选区位置
  6. 显示悬浮工具条

## 阶段三：实现悬浮工具条窗口

### 4. 创建 FloatingToolbarModule

**目标**：在选中文字下方显示悬浮工具条。

**窗口特性**：

- 无边框、透明背景
- 始终置顶（alwaysOnTop）
- 根据选中文字位置定位（获取光标坐标 + 偏移）
- 支持快速操作：翻译、搜索、复制、添加到剪贴板历史等

**实现文件**：

- `apps/core-app/src/main/modules/floating-toolbar/index.ts` - 模块主文件
- `apps/core-app/src/main/modules/floating-toolbar/window.ts` - 窗口管理
- `apps/core-app/src/renderer/src/views/floating-toolbar/FloatingToolbar.vue` - UI 组件

**窗口创建配置**：

```typescript
{
  width: 400,
  height: 60,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js')
  }
}
```

### 5. 实现位置计算算法

**获取选中文字位置**：

- **macOS**：使用 `CGEventGetLocation` 或 Accessibility API 获取选区边界
- **Windows**：使用 `GetCaretPos` + `ClientToScreen` 或 UI Automation 获取文字边界
- **Linux**：使用 X11 的 `XQueryPointer` 获取鼠标位置

**工具条定位逻辑**：

1. 获取选中文字的矩形边界（left, top, right, bottom）
2. 计算工具条位置：

   - 默认位置：选中文字正下方，居中对齐
   - 如果下方空间不足，显示在上方
   - 考虑多显示器场景

3. 动画显示工具条（淡入 + 位移）

## 阶段四：集成到 CoreBox 系统

### 6. 添加 IPC 通道

**新增通道**：

- `text-selection:get-selected-text` - 获取当前选中文字
- `text-selection:get-position` - 获取选区位置
- `floating-toolbar:show` - 显示工具条
- `floating-toolbar:hide` - 隐藏工具条
- `floating-toolbar:action` - 执行工具条操作（翻译、搜索等）

**实现位置**：`apps/core-app/src/main/channel/common.ts`

### 7. 更新模块加载顺序

在 `ModuleManager` 中添加新模块：

- TextSelectionModule（在 ShortcutModule 之后）
- FloatingToolbarModule（在 CoreBoxModule 之后）

**修改文件**：`apps/core-app/src/main/core/module-manager.ts`

## 阶段五：为截图 OCR 做准备

### 8. 扩展 OcrService

当前 `OcrService` 已经支持图片 OCR，需要添加：

- 区域截图功能（用户框选区域）
- 实时文字位置标注（在截图上绘制文字边界框）
- 与 FloatingToolbar 集成（截图后自动显示工具条）

**关键增强**：

- 添加 `captureRegion()` 方法
- 返回 OCR 结果时包含文字位置信息（bounding boxes）
- 支持实时预览模式

**修改文件**：

- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- 新建 `apps/core-app/src/main/modules/ocr/screen-capture.ts`（替换现有的空文件）

## 依赖和权限

### 需要添加的依赖

- `@napi-rs/active-win` 或类似的跨平台活动窗口库（替换 active-win）
- macOS 平台特定依赖：可能需要使用 `node-mac-permissions` 检查权限
- Windows 平台：考虑使用 `node-window-manager` 或编写 native addon
- Linux 平台：`x11` npm 包用于 X11 环境

### 权限申请

- **macOS**：需要请求 Accessibility 权限和 Screen Recording 权限
- **Windows**：需要 UAC 提升或标记为辅助工具
- **Linux**：需要 X11/Wayland 权限

## 实现优先级

### P0 - 核心功能

1. 修复 active-win 依赖问题
2. 实现全局快捷键触发文字选中检测（模拟 Cmd/Ctrl+C 方案）
3. 创建 FloatingToolbar 窗口基础框架
4. 实现简单的光标位置获取和工具条定位

### P1 - 增强功能

5. 实现平台特定的原生文字选中检测（不依赖剪贴板）
6. 添加工具条快捷操作（翻译、搜索、复制）
7. 完善位置计算算法（处理边界情况）
8. 集成 CoreBox 现有功能（与 ClipboardModule 联动）

### P2 - 未来扩展

9. 实现区域截图选择
10. 添加实时 OCR 文字标注
11. 支持多选区域和批量操作
12. 性能优化和用户体验提升

## 技术挑战

1. **跨平台兼容性**：三个系统的 API 完全不同，需要针对性实现
2. **权限管理**：特别是 macOS 的 Accessibility 权限，需要友好的提示流程
3. **位置计算精确度**：不同 DPI、多显示器场景下的坐标转换
4. **性能问题**：实时检测文字选中可能影响性能，需要节流和优化
5. **原生模块编译**：部分功能可能需要编写 Node.js addon，增加构建复杂度
