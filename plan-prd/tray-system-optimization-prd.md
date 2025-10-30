# 托盘系统优化 PRD

## 1. 项目概述

### 1.1 背景
当前托盘功能过于简陋:
- 依赖不可靠的远程图标下载
- 右键菜单功能单一(仅退出)
- 缺少窗口显示/隐藏控制
- 无国际化支持

### 1.2 目标
优化系统托盘体验,使其成为快速访问应用核心功能的入口。

## 2. 功能需求

### 2.1 托盘图标资源管理
**当前问题**: 从远程下载图标,网络失败时无法显示

**解决方案**: 使用本地打包的图标资源
- macOS: 使用 Template Image 支持深色模式
- Windows: 使用 ICO 格式或高分辨率 PNG
- Linux: 使用 PNG 格式

### 2.2 托盘图标交互
**左键单击**: 切换主窗口显示/隐藏
**右键单击**: 显示上下文菜单
**macOS双击**: 显示主窗口

### 2.3 托盘右键菜单

```
┌─────────────────────────────────────┐
│ 显示/隐藏主窗口                      │
├─────────────────────────────────────┤
│ 打开 CoreBox         Cmd+E         │
│ 下载中心             (n 个任务)     │
├─────────────────────────────────────┤
│ 剪贴板历史                          │
│ 终端                                │
│ 设置                                │
├─────────────────────────────────────┤
│ 关于 ›                              │
│   版本信息                          │
│   检查更新                          │
│   查看日志                          │
│   打开数据目录                      │
│   访问官网                          │
├─────────────────────────────────────┤
│ 重启应用                            │
│ 退出                                │
└─────────────────────────────────────┘
```

### 2.4 窗口关闭行为优化
**新行为**: 点击关闭按钮 → 最小化到托盘(可配置)

**用户配置选项**:
- 关闭窗口时: 最小化到托盘(默认) / 退出应用
- 启动时最小化到托盘

### 2.5 国际化支持
支持中英文切换,所有菜单文案可本地化。

## 3. 技术设计

### 3.1 模块重构

**新增文件结构**:
```
apps/core-app/src/main/modules/tray/
├── tray-manager.ts          # 主托盘管理器
├── tray-menu-builder.ts     # 菜单构建器
├── tray-icon-provider.ts    # 图标资源提供者
└── tray-state-manager.ts    # 状态管理器
```

### 3.2 核心类设计

```typescript
class TrayManager extends BaseModule {
  private tray: Tray | null = null
  private menuBuilder: TrayMenuBuilder
  private stateManager: TrayStateManager

  // 初始化托盘
  async onInit(): Promise<void>
  
  // 更新菜单状态
  updateMenu(state?: Partial<TrayState>): void
  
  // 处理点击事件
  private handleTrayClick(): void
}

interface TrayState {
  windowVisible: boolean
  activeDownloads: number
  hasUpdate: boolean
  updateVersion?: string
}
```

### 3.3 事件系统集成

**新增事件类型**:
- `WINDOW_HIDDEN` - 窗口隐藏
- `WINDOW_SHOWN` - 窗口显示
- `LANGUAGE_CHANGED` - 语言切换
- `DOWNLOAD_TASK_CHANGED` - 下载任务变化
- `UPDATE_AVAILABLE` - 更新可用

## 4. 实施计划

### Phase 1: 基础重构 (2-3天)
- 创建新模块文件结构
- 实现本地图标加载
- 标记远程下载逻辑为 @deprecated

### Phase 2: 菜单系统 (3-4天)
- 实现所有菜单项功能
- 添加 i18n 支持
- 实现动态状态更新

### Phase 3: 窗口行为 (2-3天)
- 实现窗口关闭事件处理
- 实现托盘点击交互
- 添加设置界面

### Phase 4: 事件集成 (1-2天)
- 集成下载中心事件
- 集成更新检查事件
- 集成语言切换事件

**总工期**: 约 10-15 个工作日

## 5. 验收标准

- 所有平台托盘图标正常显示
- 9个主菜单项 + 5个子菜单项功能完整
- 中英文切换实时生效
- 窗口关闭默认最小化到托盘
- 菜单打开响应时间 < 50ms

## 6. 风险与缓解

### 技术风险
1. **平台差异** - 缓解: 充分测试,针对性处理
2. **图标资源** - 缓解: 使用 `process.resourcesPath` 
3. **窗口状态同步** - 缓解: 使用事件系统确保同步

### 用户体验风险
1. **行为变更** - 缓解: 提供设置选项
2. **菜单复杂度** - 缓解: 合理分组,使用子菜单

## 7. 相关资源

**参考文档**:
- [Electron Tray Documentation](https://www.electronjs.org/docs/latest/api/tray)
- [macOS Human Interface Guidelines - Menu Bar](https://developer.apple.com/design/human-interface-guidelines/)

**相关文件**:
- `apps/core-app/src/main/modules/tray-holder.ts` (需重构)
- `apps/core-app/src/main/core/touch-window.ts` (需修改)
- `apps/core-app/src/main/core/touch-app.ts` (需修改)
