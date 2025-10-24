# Tray System Optimization PRD

## 1. 项目概述

### 1.1 背景
当前 Talex Touch 的系统托盘功能过于简陋，存在以下问题：
- 依赖不可靠的远程图标下载
- 右键菜单功能单一（仅退出功能）
- 缺少窗口显示/隐藏控制
- 无国际化支持
- 托盘图标点击无实际功能

### 1.2 目标
优化系统托盘体验，使其成为用户快速访问应用核心功能的入口，提升应用的易用性和专业度。

### 1.3 优先级
**P0 - 高优先级**

### 1.4 目标用户
所有 Talex Touch 用户（Windows、macOS、Linux）

---

## 2. 功能需求

### 2.1 托盘图标资源管理

#### 2.1.1 使用本地图标资源
**当前问题：**
- 从 `https://files.catbox.moe/44pnti.png` 下载托盘图标
- 从 `https://files.catbox.moe/ssn1rx.png` 下载应用图标
- 首次启动需等待下载完成
- 网络失败时无法显示托盘图标

**解决方案：**
- 使用本地打包的图标资源：
  - 托盘图标：`public/mac_tray_icon.png` 或 `resources/tray_icon.png`
  - 应用图标：`public/icon.png` 或 `resources/icon.png`
- 废弃 `DownloadManager` 相关代码 （不删除）
- 废弃 `tray-downloaded` 标记文件机制（不删除）

**技术实现：**
```typescript
// 使用 path.join 获取打包后的资源路径
const trayIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'tray_icon.png')
  : path.join(__dirname, '../../public/mac_tray_icon.png')
```

#### 2.1.2 平台适配
- **macOS**: 使用 Template Image（支持深色模式自动反色）
  - 文件命名：`mac_tray_iconTemplate.png`（需要新建）
  - 当前文件：`mac_tray_icon.png`（可以直接使用，但不支持模板模式）
  - 尺寸：16x16@1x, 32x32@2x
  - **注意**：如果使用非 Template 命名，图标在深色模式下可能不够清晰
  - **建议**：后续制作符合 macOS 规范的模板图标（黑白单色，透明背景）
- **Windows**: 使用 ICO 格式或高分辨率 PNG
  - 当前文件：`tray_icon.png`（可直接使用）
  - 尺寸：16x16, 32x32
- **Linux**: 使用 PNG 格式
  - 当前文件：`tray_icon.png`（可直接使用）
  - 尺寸：22x22 或 24x24

---

### 2.2 托盘图标交互行为

#### 2.2.1 左键单击行为
**功能描述：**
点击托盘图标切换主窗口的显示/隐藏状态

**交互逻辑：**
```
IF 主窗口可见 AND 主窗口已聚焦
  → 隐藏主窗口
ELSE IF 主窗口可见 BUT 未聚焦
  → 聚焦主窗口
ELSE IF 主窗口隐藏或最小化
  → 显示并聚焦主窗口
```

**技术实现：**
```typescript
tray.on('click', () => {
  const mainWindow = $app.window.window

  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.focus()
    }
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})
```

**平台差异处理：**
- **macOS**: 单击行为正常工作
- **Windows**: 单击和右键单击都会触发 `click` 事件，需要区分：
  ```typescript
  tray.on('click', (event, bounds) => {
    // Windows 上右键点击也会触发，需要判断
    if (process.platform === 'win32') {
      // 右键点击会自动显示上下文菜单，无需处理
      return
    }
    // 处理左键单击逻辑
  })
  ```
- **Linux**: 行为与 Windows 类似

#### 2.2.2 右键单击行为
显示上下文菜单（详见 2.3 节）

#### 2.2.3 双击行为（可选）
- **macOS**: 双击打开主窗口（macOS 用户习惯）
- **Windows/Linux**: 不处理双击（避免与单击冲突）

---

### 2.3 托盘右键菜单设计

#### 2.3.1 菜单结构

```
┌─────────────────────────────────────┐
│ 🏠 显示主窗口                        │  ← 动态文本
├─────────────────────────────────────┤
│ 🔍 打开 CoreBox         Ctrl+E      │
│ 📥 下载中心             (2 个任务)   │  ← 动态徽章
├─────────────────────────────────────┤
│ 📋 剪贴板历史                        │
│ 🖥️  终端                            │
│ 🔧 设置                             │
├─────────────────────────────────────┤
│ ℹ️  关于 Talex Touch        ›       │  ← 子菜单
├─────────────────────────────────────┤
│ 🔄 重启应用                          │
│ ❌ 退出 Talex Touch                 │
└─────────────────────────────────────┘

关于子菜单：
┌─────────────────────────────────────┐
│ 版本 2.1.0 (Beta)                   │  ← 不可点击
├─────────────────────────────────────┤
│ 🔄 检查更新                          │
│ 📝 查看日志                          │
│ 📁 打开数据目录                      │
│ 🌐 访问官网                          │
└─────────────────────────────────────┘
```

#### 2.3.2 菜单项详细说明

##### 第一组：窗口控制

**1. 显示主窗口 / 隐藏主窗口**
- **类型**: 普通菜单项
- **动态文本**:
  - 窗口可见时：`隐藏主窗口` / `Hide Main Window`
  - 窗口隐藏时：`显示主窗口` / `Show Main Window`
- **图标**: `window` 或 `eye` / `eye-off`
- **功能**: 切换主窗口显示状态
- **实现**:
  ```typescript
  {
    id: 'toggle-window',
    label: mainWindow.isVisible() ? t('tray.hideWindow') : t('tray.showWindow'),
    click: () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  }
  ```

---

##### 第二组：快捷功能

**2. 打开 CoreBox**
- **类型**: 普通菜单项
- **文本**: `打开 CoreBox` / `Open CoreBox`
- **快捷键**: `Ctrl+E` (Windows/Linux) / `Cmd+E` (macOS)
- **图标**: `search`
- **功能**: 触发全局快捷键，打开 CoreBox 搜索界面
- **实现**:
  ```typescript
  {
    id: 'open-corebox',
    label: t('tray.openCoreBox'),
    accelerator: process.platform === 'darwin' ? 'Cmd+E' : 'Ctrl+E',
    click: () => {
      // 触发 CoreBox 模块的显示方法
      coreBoxModule.show()
    }
  }
  ```

**3. 下载中心**
- **类型**: 普通菜单项
- **文本**:
  - 无任务：`下载中心` / `Download Center`
  - 有任务：`下载中心 (2 个任务)` / `Download Center (2 tasks)`
- **图标**: `download`
- **动态徽章**: 显示进行中的下载任务数量
- **功能**: 打开下载中心窗口或面板
- **实现**:
  ```typescript
  {
    id: 'download-center',
    label: activeDownloads > 0
      ? t('tray.downloadCenterWithCount', { count: activeDownloads })
      : t('tray.downloadCenter'),
    click: () => {
      // 打开下载中心
      // 方式1: 打开主窗口并导航到下载页面
      mainWindow.show()
      mainWindow.webContents.send('navigate-to', '/downloads')

      // 方式2: 打开独立的下载中心窗口（如果有）
      // downloadCenterModule.showWindow()
    }
  }
  ```

---

##### 第三组：工具功能

**4. 剪贴板历史**
- **类型**: 普通菜单项
- **文本**: `剪贴板历史` / `Clipboard History`
- **图标**: `clipboard`
- **功能**: 打开剪贴板历史记录界面
- **实现**:
  ```typescript
  {
    id: 'clipboard-history',
    label: t('tray.clipboardHistory'),
    click: () => {
      // 打开主窗口并导航到剪贴板页面
      mainWindow.show()
      mainWindow.webContents.send('navigate-to', '/clipboard')
    }
  }
  ```

**5. 终端**
- **类型**: 普通菜单项
- **文本**: `终端` / `Terminal`
- **图标**: `terminal`
- **功能**: 打开内置终端
- **实现**:
  ```typescript
  {
    id: 'terminal',
    label: t('tray.terminal'),
    click: () => {
      // 打开终端模块
      terminalModule.createWindow()
    }
  }
  ```

**6. 设置**
- **类型**: 普通菜单项
- **文本**: `设置` / `Settings`
- **图标**: `settings`
- **功能**: 打开设置页面
- **实现**:
  ```typescript
  {
    id: 'settings',
    label: t('tray.settings'),
    click: () => {
      mainWindow.show()
      mainWindow.webContents.send('navigate-to', '/settings')
    }
  }
  ```

---

##### 第四组：关于信息

**7. 关于 Talex Touch**
- **类型**: 子菜单
- **文本**: `关于 Talex Touch` / `About Talex Touch`
- **图标**: `info`
- **子菜单项**:

  **7.1 版本信息**
  - **类型**: 标签（不可点击）
  - **文本**: `版本 2.1.0 (Beta)` / `Version 2.1.0 (Beta)`
  - **实现**:
    ```typescript
    {
      label: t('tray.version', { version: app.getVersion() }),
      enabled: false
    }
    ```

  **7.2 检查更新**
  - **类型**: 普通菜单项
  - **文本**:
    - 默认：`检查更新` / `Check for Updates`
    - 有更新：`检查更新 • 有新版本` / `Check for Updates • New Version Available`
  - **功能**: 触发更新检查
  - **实现**:
    ```typescript
    {
      id: 'check-update',
      label: hasUpdate
        ? t('tray.checkUpdateAvailable')
        : t('tray.checkUpdate'),
      click: () => {
        // 触发更新检查
        mainWindow.webContents.send('trigger-update-check')
      }
    }
    ```

  **7.3 查看日志**
  - **类型**: 普通菜单项
  - **文本**: `查看日志` / `View Logs`
  - **功能**: 打开日志文件目录
  - **实现**:
    ```typescript
    {
      id: 'view-logs',
      label: t('tray.viewLogs'),
      click: () => {
        const logPath = path.join(app.getPath('userData'), 'logs')
        shell.openPath(logPath)
      }
    }
    ```

  **7.4 打开数据目录**
  - **类型**: 普通菜单项
  - **文本**: `打开数据目录` / `Open Data Directory`
  - **功能**: 打开应用数据目录
  - **实现**:
    ```typescript
    {
      id: 'open-data-dir',
      label: t('tray.openDataDir'),
      click: () => {
        shell.openPath(app.getPath('userData'))
      }
    }
    ```

  **7.5 访问官网**
  - **类型**: 普通菜单项
  - **文本**: `访问官网` / `Visit Website`
  - **功能**: 在浏览器中打开官网
  - **实现**:
    ```typescript
    {
      id: 'visit-website',
      label: t('tray.visitWebsite'),
      click: () => {
        shell.openExternal('https://talex-touch.com')
      }
    }
    ```

---

##### 第五组：应用控制

**8. 重启应用**
- **类型**: 普通菜单项
- **文本**: `重启应用` / `Restart Application`
- **图标**: `refresh`
- **功能**: 重启应用
- **实现**:
  ```typescript
  {
    id: 'restart',
    label: t('tray.restart'),
    click: () => {
      app.relaunch()
      app.quit()
    }
  }
  ```

**9. 退出 Talex Touch**
- **类型**: 普通菜单项
- **文本**: `退出 Talex Touch` / `Quit Talex Touch`
- **图标**: `close`
- **功能**: 完全退出应用
- **实现**:
  ```typescript
  {
    id: 'quit',
    label: t('tray.quit'),
    click: () => {
      app.quit()
      process.exit(0)
    }
  }
  ```

---

### 2.4 窗口关闭行为优化

#### 2.4.1 默认行为变更
**当前行为：**
- 点击窗口关闭按钮 → 应用退出

**新行为：**
- 点击窗口关闭按钮 → 最小化到托盘（应用继续运行）
- 通过托盘菜单"退出"选项 → 完全退出应用

#### 2.4.2 用户可配置选项
在设置页面添加选项：

**设置路径**: `设置 > 通用 > 窗口行为`

**选项名称**: `关闭窗口时` / `When Closing Window`

**选项值**:
- `最小化到托盘` / `Minimize to Tray` (默认)
- `退出应用` / `Quit Application`

#### 2.4.3 技术实现

**监听窗口关闭事件：**
```typescript
mainWindow.on('close', (event) => {
  // 读取用户设置
  const closeToTray = storageModule.get('app.window.closeToTray', true)

  if (closeToTray) {
    // 阻止默认关闭行为
    event.preventDefault()

    // 隐藏窗口而非关闭
    mainWindow.hide()

    // macOS: 可选择是否隐藏 Dock 图标
    if (process.platform === 'darwin') {
      // app.dock.hide() // 完全隐藏到托盘
    }
  } else {
    // 允许正常关闭
    // 不调用 event.preventDefault()
  }
})
```

**macOS 特殊处理：**
```typescript
// macOS: 点击 Dock 图标时显示窗口
app.on('activate', () => {
  if (mainWindow.isVisible()) {
    mainWindow.focus()
  } else {
    mainWindow.show()
  }
})
```

---

### 2.5 国际化支持

#### 2.5.1 i18n 键值定义

**中文 (zh-CN.json)**:
```json
{
  "tray": {
    "showWindow": "显示主窗口",
    "hideWindow": "隐藏主窗口",
    "openCoreBox": "打开 CoreBox",
    "downloadCenter": "下载中心",
    "downloadCenterWithCount": "下载中心 ({count} 个任务)",
    "clipboardHistory": "剪贴板历史",
    "terminal": "终端",
    "settings": "设置",
    "about": "关于 Talex Touch",
    "version": "版本 {version}",
    "checkUpdate": "检查更新",
    "checkUpdateAvailable": "检查更新 • 有新版本",
    "viewLogs": "查看日志",
    "openDataDir": "打开数据目录",
    "visitWebsite": "访问官网",
    "restart": "重启应用",
    "quit": "退出 Talex Touch",
    "tooltip": "Talex Touch"
  },
  "settings": {
    "window": {
      "groupTitle": "窗口行为",
      "groupDesc": "配置窗口关闭和最小化行为",
      "closeToTray": "关闭窗口时最小化到托盘",
      "closeToTrayDesc": "点击关闭按钮时隐藏窗口而非退出应用",
      "startMinimized": "启动时最小化到托盘",
      "startMinimizedDesc": "应用启动时直接最小化到系统托盘"
    }
  }
}
```

**英文 (en-US.json)**:
```json
{
  "tray": {
    "showWindow": "Show Main Window",
    "hideWindow": "Hide Main Window",
    "openCoreBox": "Open CoreBox",
    "downloadCenter": "Download Center",
    "downloadCenterWithCount": "Download Center ({count} tasks)",
    "clipboardHistory": "Clipboard History",
    "terminal": "Terminal",
    "settings": "Settings",
    "about": "About Talex Touch",
    "version": "Version {version}",
    "checkUpdate": "Check for Updates",
    "checkUpdateAvailable": "Check for Updates • New Version Available",
    "viewLogs": "View Logs",
    "openDataDir": "Open Data Directory",
    "visitWebsite": "Visit Website",
    "restart": "Restart Application",
    "quit": "Quit Talex Touch",
    "tooltip": "Talex Touch"
  },
  "settings": {
    "window": {
      "groupTitle": "Window Behavior",
      "groupDesc": "Configure window closing and minimizing behavior",
      "closeToTray": "Minimize to tray when closing window",
      "closeToTrayDesc": "Hide window instead of quitting when clicking close button",
      "startMinimized": "Start minimized to tray",
      "startMinimizedDesc": "Launch application minimized to system tray"
    }
  }
}
```

#### 2.5.2 动态语言切换
托盘菜单需要监听语言变更事件并重新构建：

```typescript
// 监听语言变更
touchEventBus.on(TalexEvents.LANGUAGE_CHANGED, () => {
  // 重新构建托盘菜单
  rebuildTrayMenu()
})

function rebuildTrayMenu() {
  const contextMenu = buildContextMenu()
  tray.setContextMenu(contextMenu)
}
```

---

### 2.6 动态状态更新

#### 2.6.1 下载任务计数
托盘菜单需要实时显示下载任务数量：

```typescript
// 监听下载任务变化
touchEventBus.on(TalexEvents.DOWNLOAD_TASK_CHANGED, ({ activeCount }) => {
  // 更新托盘菜单
  updateTrayMenu({ activeDownloads: activeCount })
})

// 可选：在托盘图标上显示徽章（仅 macOS 和部分 Linux）
if (process.platform === 'darwin') {
  app.dock.setBadge(activeCount > 0 ? String(activeCount) : '')
}
```

#### 2.6.2 更新可用提示
检测到新版本时更新菜单：

```typescript
touchEventBus.on(TalexEvents.UPDATE_AVAILABLE, ({ version }) => {
  updateTrayMenu({ hasUpdate: true, updateVersion: version })
})
```

#### 2.6.3 窗口状态同步
确保菜单项文本与窗口状态一致：

```typescript
mainWindow.on('show', () => {
  updateTrayMenu({ windowVisible: true })
})

mainWindow.on('hide', () => {
  updateTrayMenu({ windowVisible: false })
})
```

---

## 3. 技术实现方案

### 3.1 架构设计

#### 3.1.1 模块重构
将 `TrayHolderModule` 重构为更完善的托盘管理器：

**文件结构：**
```
apps/core-app/src/main/modules/tray/
├── tray-manager.ts          # 主托盘管理器
├── tray-menu-builder.ts     # 菜单构建器
├── tray-icon-provider.ts    # 图标资源提供者
└── tray-state-manager.ts    # 状态管理器
```

#### 3.1.2 类设计

**TrayManager (主管理器)**
```typescript
export class TrayManager extends BaseModule {
  private tray: Tray | null = null
  private menuBuilder: TrayMenuBuilder
  private stateManager: TrayStateManager

  constructor() {
    super(Symbol.for('TrayManager'), {
      create: false
    })
    this.menuBuilder = new TrayMenuBuilder()
    this.stateManager = new TrayStateManager()
  }

  async onInit(): Promise<void> {
    // 初始化托盘图标
    this.initializeTray()

    // 注册事件监听
    this.registerEventListeners()
  }

  private initializeTray(): void {
    const iconPath = TrayIconProvider.getIconPath()
    this.tray = new Tray(iconPath)

    // 设置 Tooltip
    this.tray.setToolTip(t('tray.tooltip'))

    // 绑定点击事件
    this.bindTrayEvents()

    // 构建菜单
    this.updateMenu()
  }

  private bindTrayEvents(): void {
    // 左键单击
    this.tray!.on('click', this.handleTrayClick.bind(this))

    // 双击（仅 macOS）
    if (process.platform === 'darwin') {
      this.tray!.on('double-click', this.handleTrayDoubleClick.bind(this))
    }
  }

  private handleTrayClick(): void {
    const mainWindow = $app.window.window

    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.focus()
      }
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  }

  public updateMenu(state?: Partial<TrayState>): void {
    if (state) {
      this.stateManager.updateState(state)
    }

    const menu = this.menuBuilder.buildMenu(this.stateManager.getState())
    this.tray!.setContextMenu(menu)
  }

  onDestroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
```

**TrayMenuBuilder (菜单构建器)**
```typescript
export class TrayMenuBuilder {
  buildMenu(state: TrayState): Menu {
    const template: MenuItemConstructorOptions[] = [
      // 窗口控制组
      this.buildWindowControlGroup(state),
      { type: 'separator' },

      // 快捷功能组
      ...this.buildQuickActionsGroup(state),
      { type: 'separator' },

      // 工具功能组
      ...this.buildToolsGroup(),
      { type: 'separator' },

      // 关于信息组
      this.buildAboutGroup(state),
      { type: 'separator' },

      // 应用控制组
      ...this.buildAppControlGroup()
    ]

    return Menu.buildFromTemplate(template)
  }

  private buildWindowControlGroup(state: TrayState): MenuItemConstructorOptions {
    return {
      label: state.windowVisible ? t('tray.hideWindow') : t('tray.showWindow'),
      click: () => {
        const mainWindow = $app.window.window
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    }
  }

  private buildQuickActionsGroup(state: TrayState): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.openCoreBox'),
        accelerator: process.platform === 'darwin' ? 'Cmd+E' : 'Ctrl+E',
        click: () => {
          coreBoxModule.show()
        }
      },
      {
        label: state.activeDownloads > 0
          ? t('tray.downloadCenterWithCount', { count: state.activeDownloads })
          : t('tray.downloadCenter'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          mainWindow.webContents.send('navigate-to', '/downloads')
        }
      }
    ]
  }

  private buildToolsGroup(): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.clipboardHistory'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          mainWindow.webContents.send('navigate-to', '/clipboard')
        }
      },
      {
        label: t('tray.terminal'),
        click: () => {
          terminalModule.createWindow()
        }
      },
      {
        label: t('tray.settings'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          mainWindow.webContents.send('navigate-to', '/settings')
        }
      }
    ]
  }

  private buildAboutGroup(state: TrayState): MenuItemConstructorOptions {
    return {
      label: t('tray.about'),
      submenu: [
        {
          label: t('tray.version', { version: app.getVersion() }),
          enabled: false
        },
        { type: 'separator' },
        {
          label: state.hasUpdate
            ? t('tray.checkUpdateAvailable')
            : t('tray.checkUpdate'),
          click: () => {
            $app.window.window.webContents.send('trigger-update-check')
          }
        },
        {
          label: t('tray.viewLogs'),
          click: () => {
            const logPath = path.join(app.getPath('userData'), 'logs')
            shell.openPath(logPath)
          }
        },
        {
          label: t('tray.openDataDir'),
          click: () => {
            shell.openPath(app.getPath('userData'))
          }
        },
        {
          label: t('tray.visitWebsite'),
          click: () => {
            shell.openExternal('https://talex-touch.com')
          }
        }
      ]
    }
  }

  private buildAppControlGroup(): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.restart'),
        click: () => {
          app.relaunch()
          app.quit()
        }
      },
      {
        label: t('tray.quit'),
        click: () => {
          app.quit()
          process.exit(0)
        }
      }
    ]
  }
}
```

**TrayIconProvider (图标提供者)**
```typescript
export class TrayIconProvider {
  static getIconPath(): string {
    if (app.isPackaged) {
      // 生产环境：从 resources 目录加载
      return path.join(process.resourcesPath, this.getIconFileName())
    } else {
      // 开发环境：从 public 目录加载
      return path.join(__dirname, '../../../public', this.getIconFileName())
    }
  }

  private static getIconFileName(): string {
    switch (process.platform) {
      case 'darwin':
        // macOS: 优先使用 Template Image（如果存在）
        // 当前使用普通 PNG，后续可制作模板图标
        const templatePath = 'mac_tray_iconTemplate.png'
        const normalPath = 'mac_tray_icon.png'

        // 检查模板图标是否存在
        const checkPath = app.isPackaged
          ? path.join(process.resourcesPath, templatePath)
          : path.join(__dirname, '../../../public', templatePath)

        return fs.existsSync(checkPath) ? templatePath : normalPath
      case 'win32':
        // Windows: 优先使用 ICO，fallback 到 PNG
        const icoPath = 'tray_icon.ico'
        const pngPath = 'tray_icon.png'

        const checkIcoPath = app.isPackaged
          ? path.join(process.resourcesPath, icoPath)
          : path.join(__dirname, '../../../resources', icoPath)

        return fs.existsSync(checkIcoPath) ? icoPath : pngPath
      default:
        return 'tray_icon.png'
    }
  }

  static getAppIconPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'icon.png')
    } else {
      return path.join(__dirname, '../../../public/icon.png')
    }
  }
}
```

**TrayStateManager (状态管理器)**
```typescript
interface TrayState {
  windowVisible: boolean
  activeDownloads: number
  hasUpdate: boolean
  updateVersion?: string
}

export class TrayStateManager {
  private state: TrayState = {
    windowVisible: true,
    activeDownloads: 0,
    hasUpdate: false
  }

  updateState(partial: Partial<TrayState>): void {
    this.state = { ...this.state, ...partial }
  }

  getState(): TrayState {
    return { ...this.state }
  }
}
```

---

### 3.2 窗口关闭行为实现

#### 3.2.1 主窗口关闭事件处理
在 `TouchWindow` 或 `TouchApp` 中添加：

```typescript
export class TouchApp implements TalexTouch.TouchApp {
  // ... 现有代码

  private setupWindowCloseHandler(): void {
    this.window.window.on('close', (event) => {
      // 读取用户设置
      const closeToTray = storageModule.get('app.window.closeToTray', true)

      if (closeToTray && !this.isQuitting) {
        // 阻止默认关闭
        event.preventDefault()

        // 隐藏窗口
        this.window.window.hide()

        // 触发事件
        touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())
      }
    })
  }

  // 标记应用正在退出
  private isQuitting = false

  public quit(): void {
    this.isQuitting = true
    this.app.quit()
  }
}
```

#### 3.2.2 macOS Activate 处理
```typescript
app.on('activate', () => {
  const mainWindow = $app.window.window

  if (BrowserWindow.getAllWindows().length === 0) {
    // 如果没有窗口，创建新窗口
    // 这种情况一般不会发生，因为我们不会真正关闭窗口
  } else if (!mainWindow.isVisible()) {
    mainWindow.show()
    mainWindow.focus()
  }
})
```

---

### 3.3 设置界面实现

#### 3.3.1 添加窗口行为设置组
在 `SettingGeneral.vue` 或新建 `SettingWindow.vue`：

```vue
<template>
  <t-group-block
    :name="t('settings.window.groupTitle')"
    icon="window"
    :description="t('settings.window.groupDesc')"
  >
    <!-- 关闭窗口时最小化到托盘 -->
    <t-block-switch
      v-model="windowSettings.closeToTray"
      :title="t('settings.window.closeToTray')"
      icon="minimize"
      :description="t('settings.window.closeToTrayDesc')"
      @update:model-value="updateCloseToTray"
    />

    <!-- 启动时最小化到托盘 -->
    <t-block-switch
      v-model="windowSettings.startMinimized"
      :title="t('settings.window.startMinimized')"
      icon="eye-off"
      :description="t('settings.window.startMinimizedDesc')"
      @update:model-value="updateStartMinimized"
    />
  </t-group-block>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getTouchSDK } from '@talex-touch/utils/renderer'

const { t } = useI18n()
const sdk = getTouchSDK()

const windowSettings = ref({
  closeToTray: true,
  startMinimized: false
})

onMounted(async () => {
  // 加载设置
  const closeToTray = await sdk.storage.get('app.window.closeToTray', true)
  const startMinimized = await sdk.storage.get('app.window.startMinimized', false)

  windowSettings.value = {
    closeToTray,
    startMinimized
  }
})

async function updateCloseToTray(value: boolean) {
  await sdk.storage.save('app.window.closeToTray', value)
}

async function updateStartMinimized(value: boolean) {
  await sdk.storage.save('app.window.startMinimized', value)
}
</script>
```

---

### 3.4 事件系统集成

#### 3.4.1 新增事件类型
在 `touch-event.ts` 中添加：

```typescript
export enum TalexEvents {
  // ... 现有事件
  WINDOW_HIDDEN = 'window-hidden',
  WINDOW_SHOWN = 'window-shown',
  LANGUAGE_CHANGED = 'language-changed',
  DOWNLOAD_TASK_CHANGED = 'download-task-changed',
  UPDATE_AVAILABLE = 'update-available'
}

export class WindowHiddenEvent implements ITouchEvent<TalexEvents> {
  readonly type = TalexEvents.WINDOW_HIDDEN
  constructor() {}
}

export class WindowShownEvent implements ITouchEvent<TalexEvents> {
  readonly type = TalexEvents.WINDOW_SHOWN
  constructor() {}
}
```

#### 3.4.2 事件监听注册
在 `TrayManager.onInit()` 中：

```typescript
private registerEventListeners(): void {
  // 窗口显示/隐藏
  touchEventBus.on(TalexEvents.WINDOW_HIDDEN, () => {
    this.updateMenu({ windowVisible: false })
  })

  touchEventBus.on(TalexEvents.WINDOW_SHOWN, () => {
    this.updateMenu({ windowVisible: true })
  })

  // 语言变更
  touchEventBus.on(TalexEvents.LANGUAGE_CHANGED, () => {
    this.updateMenu()
  })

  // 下载任务变化
  touchEventBus.on(TalexEvents.DOWNLOAD_TASK_CHANGED, ({ activeCount }) => {
    this.updateMenu({ activeDownloads: activeCount })
  })

  // 更新可用
  touchEventBus.on(TalexEvents.UPDATE_AVAILABLE, ({ version }) => {
    this.updateMenu({ hasUpdate: true, updateVersion: version })
  })
}
```

---

## 4. 测试计划

### 4.1 功能测试

#### 4.1.1 托盘图标显示
- [ ] macOS: 托盘图标正常显示，支持深色模式
- [ ] Windows: 托盘图标正常显示
- [ ] Linux: 托盘图标正常显示

#### 4.1.2 托盘图标交互
- [ ] 左键单击：窗口可见时隐藏
- [ ] 左键单击：窗口隐藏时显示
- [ ] 左键单击：窗口可见但未聚焦时聚焦
- [ ] 右键单击：显示上下文菜单
- [ ] macOS 双击：显示主窗口

#### 4.1.3 菜单功能
- [ ] 显示/隐藏主窗口：功能正常，文本动态切换
- [ ] 打开 CoreBox：成功打开 CoreBox
- [ ] 下载中心：打开下载页面，任务数量显示正确
- [ ] 剪贴板历史：打开剪贴板页面
- [ ] 终端：打开终端窗口
- [ ] 设置：打开设置页面
- [ ] 关于子菜单：所有子项功能正常
- [ ] 重启应用：应用成功重启
- [ ] 退出应用：应用完全退出

#### 4.1.4 窗口关闭行为
- [ ] 默认：点击关闭按钮隐藏窗口
- [ ] 设置为退出：点击关闭按钮退出应用
- [ ] macOS: 点击 Dock 图标显示窗口
- [ ] 托盘菜单退出：应用完全退出

#### 4.1.5 国际化
- [ ] 中文：所有菜单项显示中文
- [ ] 英文：所有菜单项显示英文
- [ ] 语言切换：菜单实时更新

#### 4.1.6 动态状态
- [ ] 下载任务数量：实时更新
- [ ] 更新可用提示：正确显示
- [ ] 窗口状态同步：菜单文本与实际状态一致

### 4.2 性能测试
- [ ] 托盘图标加载时间 < 100ms
- [ ] 菜单打开响应时间 < 50ms
- [ ] 窗口显示/隐藏响应时间 < 100ms

### 4.3 兼容性测试
- [ ] macOS 11+
- [ ] Windows 10/11
- [ ] Ubuntu 20.04+
- [ ] Fedora 36+

---

## 5. 实施计划

### 5.1 开发阶段

#### Phase 1: 基础重构 (2-3 天)
- [ ] 创建新的模块文件结构
- [ ] 实现 `TrayIconProvider` - 本地图标资源加载
- [ ] 实现 `TrayStateManager` - 状态管理
- [ ] 标记远程图标下载逻辑为 `@deprecated`（保留代码不删除）
- [ ] 可选：制作 macOS Template 图标（黑白单色版本）

#### Phase 2: 菜单系统 (3-4 天)
- [ ] 实现 `TrayMenuBuilder` - 菜单构建器
- [ ] 实现所有菜单项功能
- [ ] 添加 i18n 支持
- [ ] 实现动态状态更新

#### Phase 3: 窗口行为 (2-3 天)
- [ ] 实现窗口关闭事件处理
- [ ] 实现托盘图标点击交互
- [ ] 添加设置界面
- [ ] macOS 特殊处理

#### Phase 4: 事件集成 (1-2 天)
- [ ] 添加新的事件类型
- [ ] 集成下载中心事件
- [ ] 集成更新检查事件
- [ ] 集成语言切换事件

#### Phase 5: 测试与优化 (2-3 天)
- [ ] 功能测试
- [ ] 跨平台测试
- [ ] 性能优化
- [ ] Bug 修复

### 5.2 总工期
**预计 10-15 个工作日**

---

## 6. 风险与挑战

### 6.1 技术风险
1. **平台差异**
   - 风险：不同平台托盘行为差异大
   - 缓解：充分测试，针对性处理

2. **图标资源**
   - 风险：打包后图标路径可能错误
   - 缓解：使用 `process.resourcesPath` 和充分测试

3. **窗口状态同步**
   - 风险：菜单状态与实际窗口状态不一致
   - 缓解：使用事件系统确保同步

### 6.2 用户体验风险
1. **行为变更**
   - 风险：用户习惯现有的关闭=退出行为
   - 缓解：提供设置选项，允许用户选择

2. **菜单复杂度**
   - 风险：菜单项过多导致混乱
   - 缓解：合理分组，使用子菜单

3. **macOS 图标显示**
   - 风险：当前普通 PNG 在深色模式下可能不够清晰
   - 缓解：先使用现有图标，后续优化为 Template 图标

---

## 7. 后续优化方向

### 7.1 高级功能
1. **托盘图标动画**
   - 下载进行时显示动画
   - 更新可用时闪烁提示

2. **快捷操作**
   - 中键点击：打开 CoreBox
   - Shift+点击：打开设置

3. **自定义菜单**
   - 允许用户自定义菜单项
   - 支持插件添加托盘菜单项

### 7.2 性能优化
1. **菜单懒加载**
   - 仅在打开时构建菜单
   - 缓存菜单模板

2. **图标缓存**
   - 缓存图标资源
   - 减少文件系统访问

### 7.3 图标优化
1. **macOS Template 图标制作**
   - 设计黑白单色图标
   - 支持深色模式自动反色
   - 符合 macOS 设计规范

2. **多分辨率支持**
   - 提供 @1x, @2x, @3x 版本
   - 适配高 DPI 显示器

---

## 8. 附录

### 8.1 相关文件清单
- `apps/core-app/src/main/modules/tray-holder.ts` (需重构)
- `apps/core-app/src/main/core/touch-window.ts` (需修改)
- `apps/core-app/src/main/core/touch-app.ts` (需修改)
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json` (需添加)
- `apps/core-app/src/renderer/src/modules/lang/en-US.json` (需添加)
- `apps/core-app/src/renderer/src/views/base/settings/` (需添加设置页面)

### 8.2 依赖项
- Electron Tray API
- Electron Menu API
- 现有的 i18n 系统
- 现有的 Storage 模块
- 现有的 EventBus 系统

### 8.3 参考资料
- [Electron Tray Documentation](https://www.electronjs.org/docs/latest/api/tray)
- [Electron Menu Documentation](https://www.electronjs.org/docs/latest/api/menu)
- [macOS Human Interface Guidelines - Menu Bar Extras](https://developer.apple.com/design/human-interface-guidelines/components/system-experiences/the-menu-bar)
- [Windows Taskbar Guidelines](https://learn.microsoft.com/en-us/windows/win32/shell/notification-area)

---

## 变更记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2025-10-24 | Claude | 初始版本 |

