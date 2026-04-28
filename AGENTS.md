# AGENTS.md

本文件用于指导 AI 编码代理（如 Codex CLI / Qoder 等）在本仓库内工作。目标是：少歧义、可执行、可维护。

## 项目定义（必须先理解）

### 这是什么项目
- **Tuff（原 TalexTouch）** 是一个本地优先（Local-first）、AI 原生（AI-native）、插件可扩展（Plugin-extensible）的桌面指令中心。
- 项目核心价值：统一“搜索 + 执行 + 插件协同 + 智能能力”，减少跨应用操作成本。

### 交付边界（Monorepo 视角）
- `apps/core-app`：桌面主产品（Electron + Vue），是主要运行时与能力承载体。
- `apps/nexus`：文档与生态站点（开发者文档、API 文档、发布信息）。
- `packages/*`：共享 SDK、类型、组件与工具（如 `utils`、`tuffex`、`transport`）。
- `plugins/*`：官方/示例插件能力集合（CoreBox 能力扩展与验证载体）。

### 当前阶段最终目标（2026 上半年）
- **架构目标**：完成 SDK Hard-Cut，清理 renderer/main/plugin 侧 legacy channel 直连。
- **质量目标**：建立稳定质量门禁（typecheck/lint/test/build 可复现、可追踪）。
- **发布目标**：打通 OIDC + RSA 官方构建信任链与 Nexus 自动同步闭环。
- **产品目标**：补齐 Flow / DivisionBox / Intelligence 等核心能力闭环，形成可稳定迭代基线。

### 文档同步责任（强约束）
- 任何影响行为/接口/架构的改动，必须同步以下文档至少一处：
  - `docs/plan-prd/README.md`（里程碑与未闭环能力）
  - `docs/plan-prd/TODO.md`（执行清单）
  - `docs/plan-prd/01-project/CHANGES.md`（已落地变更）
  - `docs/INDEX.md`（入口导航）
- 若改动涉及“目标变化/质量门禁变化”，必须同时更新产品总览与路线图文档。
  - `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`

## 0. 最高优先级（必须遵守）

### 0.1 语言与输出
- 默认使用中文（可混用英文技术术语）；代码标识符使用英文。
- 代码注释语言跟随所在目录/文件的既有风格（不要引入新的语言混用）。
- 执行类任务建议采用“进度式”汇报；分析类任务采用“结论 + 关键分析”。

### 0.2 安全与高风险操作确认
在执行以下**高风险操作**前，必须先向用户说明影响范围并获得明确确认：
- 文件系统：删除文件/目录、批量修改/重命名/移动
- Git：`git commit`、`git push`、`git reset --hard` 等不可逆操作
- 系统配置：环境变量、权限、系统设置变更
- 数据操作：数据库删除/结构变更/批量更新
- 网络请求：向外部服务发送敏感数据或调用生产环境 API
- 包管理：全局安装/卸载、升级核心依赖（尤其大版本）

确认提示格式（需要用户明确回复“是/确认/继续”）：
```text
⚠️ 危险操作检测！
操作类型：[具体操作]
影响范围：[详细说明]
风险评估：[潜在后果]

请确认是否继续？[需要明确的"是"、"确认"、"继续"]
```

### 0.3 工程原则（默认约束）
- KISS / YAGNI：优先最小改动解决根因，避免无关重构与“为未来预留”。
- DRY：避免重复实现；若抽象能显著减少重复再做抽取。
- SOLID：保持单一职责，控制分支/嵌套深度，优先小函数与清晰接口。
- 向后兼容：未经明确要求不破坏现有 API/CLI 行为/数据格式。

### 0.4 工作流与工具偏好
- 先读后写：先收敛上下文再修改；优先用精确搜索定位改动点。
- 多步任务（≥2 步）使用计划追踪（如 `update_plan`）并随进度更新。
- 命令规范：路径始终使用双引号包裹；优先使用正斜杠 `/`；内容搜索优先 `rg`。
- UI 组件策略：在可行范围内**优先使用 tuffex 组件**，保持交互与视觉风格一致。
- 方案稳定性：**非必要不允许切换实现方案**（组件库/技术路径/交互模式）；确需切换时，先给出必要性与影响范围并获得确认。
- Hard rule: do not downgrade the target without explicit user approval, including (but not limited to) compatibility-only implementations, skipping required packages, or writing ad-hoc helpers that materially undermine normal project development.
- SDK 优先：优先使用封装好的 SDK，只有在缺少 SDK 或能力不足时才直接使用 transport 通道。
- i18n：统一使用 hooks（`useI18n` / `useLanguage` / `useI18nText`），禁止直接访问 `window.$t` / `window.$i18n`；发现类似用法需先 warning 提醒用户。
- 未经用户主动要求，不要执行 git 提交/推送/创建分支等操作。
- 提交信息（commit message）必须使用英文，避免中文提交。
- 修改完成后按需运行最贴近改动的校验（lint/typecheck/test/build），不修复无关失败项。
- 文档/网络检索：离线与本仓库信息优先；外部请求需最小化并避免敏感信息外传。

### 0.5 Storage / Sync 规则（必须遵守）
- **Storage Rule**：SQLite 是本地唯一权威源（SoT）；JSON 只允许作为“同步载荷格式”，且必须是密文（如 `payload_enc`/`payload_ref`），禁止把业务明文 dump 成 JSON 直接同步/落盘。
- **Security Rule**：`deviceId` 只能做设备标识，不允许直接作为密钥材料（派生/加密根）；口令/恢复码/密钥等敏感信息本地必须用系统安全存储（Keychain / Credential Locker / libsecret / Electron safeStorage 或等价能力）保护，禁止明文写入 localStorage/JSON/日志。
- **Sync Compatibility Rule**：新同步能力必须走 `/api/v1/sync/*`（以及配套 `/api/v1/keys/*`、`/api/v1/devices/*`）；旧 `/api/sync/*` 只允许迁移期只读，禁止新增依赖。
- **Onboarding Rule**：首次引导是否展示，必须等待 storage hydration 完成后再判定，避免“每次启动都弹引导”。

## Monorepo 维护标准（精简版）

- **根目录保持简洁**：只放 workspace 必需入口与全局质量门禁；workspace 专属配置放到各自目录。
- **统一工具链**：`husky + commitlint + lint-staged` 仅在根维护，避免子项目写入 `.git/hooks`。
- **脚本一致性**：workspace 至少提供 `lint`/`lint:fix`，按需提供 `typecheck`/`test`。
- **依赖升级策略**：先工具链→构建→业务；默认不做高风险大版本升级（需单独验证计划）。
- 详细规范与现状建议：`docs/engineering/monorepo-standards.md`

## 常用开发命令

### 核心应用开发
- `pnpm core:dev` - 启动 Electron 应用开发服务器
- `pnpm core:build` - 生产环境构建
- `pnpm core:build:snapshot` - 构建快照版本
- `pnpm core:build:release` - 构建发布版本

### 平台特定构建
- `pnpm core:build:snapshot:win` - Windows 快照构建
- `pnpm core:build:snapshot:mac` - macOS 快照构建
- `pnpm core:build:snapshot:linux` - Linux 快照构建

### 类型检查（推荐 workspace 方式）
- `pnpm -C "apps/core-app" run typecheck` - 完整类型检查（主进程 + 渲染进程）
- `pnpm -C "apps/core-app" run typecheck:node` - 仅主进程类型检查
- `pnpm -C "apps/core-app" run typecheck:web` - 仅渲染进程类型检查

### 数据库操作（在 core-app 内执行）
- `pnpm -C "apps/core-app" run db:generate` - 生成 Drizzle ORM 迁移文件
- `pnpm -C "apps/core-app" run db:migrate` - 执行数据库迁移

### 代码质量
- `pnpm lint` - 运行 ESLint 检查
- `pnpm lint:fix` - 运行 ESLint 并自动修复
- `pnpm utils:test` - 运行工具包测试

### 文档
- `pnpm docs:dev` - 启动文档开发服务器
- `pnpm docs:build` - 构建文档

### 发布
- `pnpm utils:publish` - 发布 @talex-touch/utils 包到 npm

## 架构概述

### Monorepo 结构
这是一个基于 pnpm workspace 的 monorepo 项目：
- `apps/core-app/` - 主应用程序（Electron + Vue 3）
- `packages/` - 共享工具包（@talex-touch/utils）
- `plugins/` - 插件示例
- `apps/nexus/` - 文档与生态站点

### 技术栈
- **运行时**: Electron 37.2.4+, Node.js 22.16.0+ (Volta 强制)
- **前端**: Vue 3.5.18+, Vue Router 4.5.1, Pinia 3.0.3
- **构建**: Electron-Vite 4.0.0, Vite 7.0.6, TypeScript 5.8.3
- **UI**: Tuffex, UnoCSS 66.3.3, SASS 1.89.2
- **数据**: Drizzle ORM 0.44.4 + LibSQL 0.15.10
- **工具**: VueUse 13.6.0, Tesseract.js 5.0.6 (OCR), XTerm 5.3.0, log4js 6.9.1

## 核心架构概念

### 主进程架构 (apps/core-app/src/main/)

**核心类**:
- `TouchCore` - 应用入口点，初始化整个应用和模块加载流程
- `TouchApp` - 核心应用类，管理窗口、模块和配置
- `TouchWindow` - BrowserWindow 包装器，提供平台特定增强（macOS Vibrancy / Windows Mica）
- `ModuleManager` - 模块生命周期管理器，支持热重载

**模块加载顺序**（Electron ready 后按序启动）:
1. DatabaseModule → 2. StorageModule → 3. ShortcutModule → 4. ExtensionLoaderModule → 5. CommonChannelModule → 6. PluginModule → 7. PluginLogModule → 8. CoreBoxModule → 9. TrayHolderModule → 10. AddonOpenerModule → 11. ClipboardModule → 12. TuffDashboardModule → 13. FileSystemWatcher → 14. FileProtocolModule → 15. TerminalModule

**模块生命周期**:
```typescript
abstract class BaseModule {
  created?(ctx: ModuleCreateContext)      // 可选：模块实例化
  abstract onInit(ctx: ModuleInitContext) // 必需：初始化（目录已创建）
  start?(ctx: ModuleStartContext)         // 可选：启动激活
  stop?(ctx: ModuleStopContext)           // 可选：停止
  abstract onDestroy(ctx: ModuleDestroyContext) // 必需：清理资源
}
```

**关键模块**:
- `CoreBox` (box-tool/core-box.ts) - 搜索/启动器主界面，全局快捷键 Cmd/Ctrl+E
- `PluginManager` (plugin/plugin-provider.ts) - 插件加载、生命周期、功能注册
- `Storage` (storage/) - 配置持久化，每插件 10MB 限制
- `Channel System` (core/channel-core.ts) - 主进程/渲染进程/插件进程的 IPC 通信抽象
- `Database` (database/) - Drizzle ORM + LibSQL 结构化数据存储

### 渲染进程架构 (apps/core-app/src/renderer/)
- Vue 3 + TypeScript + Pinia 状态管理
- 组件：`src/components/`
- 视图：`src/views/`
- 状态管理：Pinia stores + composables (`src/modules/hooks/`)

### 文件搜索系统

**平台差异化策略**:
- **Windows**: Everything Provider (ultra-fast, real-time)
- **macOS/Linux**: File Provider (indexed search)

**Everything Provider** (`apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`):
- 集成 Everything CLI (`es.exe`) 进行文件搜索
- 搜索响应时间: 20-50ms
- 优先级: `fast` (与应用搜索同批返回)
- 要求: Everything 已安装并运行，es.exe 在 PATH 或默认位置
- 支持高级语法: 通配符、布尔运算符、文件过滤器
- 自动降级: Everything 不可用时静默跳过

**File Provider** (`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`):
- macOS/Linux: 完整文件索引和搜索
- Windows: 仅提供元数据和打开功能（搜索由 Everything 处理）
- 索引路径: Documents, Downloads, Desktop, Music, Pictures, Videos
- 搜索技术: 精确关键词匹配 + FTS (Full-Text Search)
- 支持内容索引: 代码文件、文档、配置文件等

**搜索流程**:
1. 用户输入查询 → 2. 解析 `@file` 过滤器（可选） → 3. Windows 调用 Everything，其他平台调用 File Provider → 4. 结果评分和排序 → 5. 合并展示

**安装 Everything** (Windows):
1. 下载 Everything: https://www.voidtools.com/
2. 下载 Everything CLI (es.exe)
3. 将 es.exe 放置在 Everything installation directory 或 PATH 中
4. 详细文档: `docs/everything-integration.md`

**设置管理**:
- 设置文件: `everything-settings.json` (存储在 config 目录)
- 设置 UI: Settings → Everything Search (仅 Windows)
- IPC 通道: `everything:status`, `everything:toggle`, `everything:test`
- 默认状态: 启用 (如果 Everything 可用)

**功能特性**:
- 状态监控: 实时显示 Everything 可用性和版本
- 一键切换: 启用/禁用 Everything 搜索
- 测试功能: 验证 Everything 是否正常工作
- 安装指导: 提供下载链接和安装说明
- 自动降级: Everything 不可用时静默跳过，不影响其他搜索

### 插件系统

**插件三层架构命名**:

| 层级 | 英文名 | 中文名 | 文件 | 说明 |
|------|--------|--------|------|------|
| 声明层 | **Manifest** | **清单文件** | `manifest.json` | 插件元数据、功能声明、权限配置 |
| 脚本层 | **Prelude** | **先导脚本** | `index.js` | 轻量入口，注册能力、处理回调 |
| 展示层 | **Surface** | **展面** | `attachUIView` | 重量级 UI 渲染（WebContents） |

**加载流程**: Manifest → Prelude → (按需) Surface

**核心特性**:
- 插件从用户数据目录运行时加载（不打包到应用）
- Manifest 驱动：`manifest.json` 定义功能、元数据、权限
- 通过 CoreBox 搜索界面触发功能
- 支持开发模式热重载（`dev.enable: true`）
- 隔离存储（每插件 10MB 限制）
- **SDK 版本控制**：`sdkapi` 字段（格式 YYMMDD，当前版本 260428）

**SDK 版本 (sdkapi)**:
- 格式：`YYMMDD`（如 251212 = 2025-12-12）
- 用途：权限校验版本门控
- 支持列表：`251212`、`260114`、`260121`、`260215`、`260225`、`260228`、`260428`
- 未声明、非法、未列入支持列表或 < 251212：运行时直接阻断（`SDKAPI_BLOCKED`）
- 受支持且 >= 251212：启用完整权限校验
- >= 260228：启用插件 capability auth 基线
- 260428：当前推荐 marker，不新增额外运行时门槛
- 工具函数：`checkSdkCompatibility()`, `CURRENT_SDK_VERSION`
- 位置：`packages/utils/plugin/sdk-version.ts`

**Clipboard 支持**:
- 插件可声明接受的输入类型：`acceptedInputTypes: ["text", "image", "files", "html"]`
- 系统自动检测剪贴板内容并通过 `query` 参数传递
- 查询参数可以是字符串（向后兼容）或 `TuffQuery` 对象（包含 `inputs` 数组）

**处理剪贴板数据示例**:
```typescript
import { TuffInputType } from '@talex-touch/utils'

onFeatureTriggered(featureId, query, feature) {
  if (typeof query === 'string') {
    // 向后兼容：纯文本查询
    return
  }

  const textQuery = query.text
  const inputs = query.inputs || []

  // 图片输入（data URL）
  const imageInput = inputs.find(i => i.type === TuffInputType.Image)

  // 文件输入（JSON 字符串数组）
  const filesInput = inputs.find(i => i.type === TuffInputType.Files)

  // HTML 输入（富文本）
  const htmlInput = inputs.find(i => i.type === TuffInputType.Html)
}
```

### Channel 通信系统

**Channel 类型**:
- `ChannelType.MAIN` - 主进程 ↔ 渲染进程
- `ChannelType.PLUGIN` - 插件特定隔离通信

**关键 API**:
```typescript
// 注册处理器
regChannel(type: ChannelType, eventName: string, callback): () => void

// 发送消息
send(eventName: string, arg?: any): Promise<any>
sendTo(window: BrowserWindow, eventName: string, arg?: any): Promise<any>
sendPlugin(pluginName: string, eventName: string, arg?: any): Promise<any>
```

**实现细节**:
- 基于 IPC 监听器：`@main-process-message` 和 `@plugin-process-message`
- 插件通道使用加密密钥以增强安全性和隔离

### 存储架构

**应用配置**:
- JSON 文件持久化：`<root>/config/`
- IPC 通道：`storage:get`, `storage:save`, `storage:delete`

**插件配置**:
- 隔离存储：`<root>/config/plugins/`
- 10MB 大小限制
- 安全文件名清理（防止路径遍历攻击）
- 广播更新系统，保持多窗口 UI 同步
- IPC 通道：`plugin:storage:get-item`, `plugin:storage:set-item`

### 事件系统

**TouchEventBus** 应用级事件分发:
```typescript
enum TalexEvents {
  APP_READY, APP_START, APP_SECONDARY_LAUNCH,
  ALL_MODULES_LOADED, BEFORE_APP_QUIT, WILL_QUIT,
  WINDOW_ALL_CLOSED, PLUGIN_STORAGE_UPDATED
}
```

### 窗口管理

- **Main Window**: 主界面，带 Vibrancy (macOS) 或 Mica (Windows) 效果
- **CoreBox Windows**: 弹出搜索/启动器窗口，基于光标屏幕定位（多显示器支持）
- **Plugin Windows**: 插件动态创建，注入插件 API
- **TouchWindow**: 两阶段设置（创建 vs 渲染，`autoShow` 选项）

### 共享工具包

**`@talex-touch/utils`** (npm v1.0.23) 提供共享类型和工具:
```
packages/utils/
├── account/           # AccountSDK（用户信息、订阅、配额）
├── base/              # 基础类型和枚举（含统一 LogLevel）
├── channel/           # IPC 通道接口
├── common/            # 通用工具
│   └── logger/        # 模块日志系统（ModuleLogger, LoggerManager）
├── core-box/          # CoreBox SDK（结果构建器、搜索格式）
├── eventbus/          # 事件系统接口
├── i18n/              # 国际化消息系统
│   ├── message-keys.ts  # 消息键定义
│   ├── resolver.ts      # 前端解析器
│   └── locales/         # 翻译文件 (en.json, zh.json)
├── plugin/            # 插件 SDK 和接口
│   ├── log/           # 插件日志
│   ├── providers/     # 插件发现提供者
│   └── sdk/           # 插件运行时 SDK
├── renderer/          # 渲染进程 composables
│   ├── hooks/         # Vue composables
│   └── storage/       # 存储客户端
└── types/             # TypeScript 定义
```

### AccountSDK

**订阅计划类型**:
- `FREE` - 免费版
- `PRO` - 专业版
- `PLUS` - 增强版
- `TEAM` - 团队版
- `ENTERPRISE` - 企业版

**核心 API**:
```typescript
import { accountSDK, SubscriptionPlan } from '@talex-touch/utils'

// 用户信息
await accountSDK.getProfile()        // 获取用户资料
await accountSDK.isLoggedIn()        // 是否登录
await accountSDK.getDisplayName()    // 显示名称

// 订阅检查
await accountSDK.getPlan()           // 当前计划
await accountSDK.isPaidUser()        // 是否付费用户
await accountSDK.isProOrAbove()      // Pro 或更高
await accountSDK.isPlusOrAbove()     // Plus 或更高
await accountSDK.isTeamOrAbove()     // Team 或更高

// 配额检查
await accountSDK.checkAiRequestQuota() // AI 请求配额
await accountSDK.checkAiTokenQuota()   // AI Token 配额
await accountSDK.getUsagePercentage('aiRequests') // 使用率

// 功能权限
await accountSDK.hasApiAccess()           // API 访问权限
await accountSDK.hasCustomModelAccess()   // 自定义模型
await accountSDK.hasPrioritySupport()     // 优先支持
```

### I18n 消息系统

**后端发送国际化消息**（使用 `$i18n:key` 格式）:
```typescript
import { i18nMsg, DevServerKeys } from '@talex-touch/utils/i18n'

// 发送给前端的消息使用 i18n 键
win.webContents.send('notification', {
  title: i18nMsg(DevServerKeys.DISCONNECTED),    // => '$i18n:devServer.disconnected'
  message: i18nMsg(DevServerKeys.CONNECTION_LOST)
})
```

**前端解析消息**:
```typescript
import { resolveI18nMessage, i18nResolver } from '@talex-touch/utils/i18n'

// 设置语言
i18nResolver.setLocale('zh')

// 解析消息
const text = resolveI18nMessage('$i18n:devServer.disconnected')
// => '开发服务器已断开'
```

**消息键分类**:
- `DevServerKeys` - Dev Server 相关消息
- `FlowTransferKeys` - Flow Transfer 分享消息
- `PluginKeys` - 插件相关消息
- `WidgetKeys` - Widget 相关消息
- `SystemKeys` - 系统通用消息

**翻译文件位置**: `packages/utils/i18n/locales/`

### TuffIcon 组件(tuffex)

**统一图标组件**，位于 `packages/tuffex/packages/components/src/icon/`:

**图标类型** (`TuffIconType`):
- `emoji` - Emoji 字符（如 "🚀"）
- `class` - CSS 类名（如 "i-ri-star-line"）
- `url` - 远程 URL 或Data URL
- `file` - 本地文件路径
- `builtin` - 内置图标（chevron-down, close, search, user, star, star-half）

**核心特性**:
- 支持自定义 URL 解析器（通过 provide/inject 或 prop）
- 支持自定义 SVG 加载器（含 retry逻辑）
- colorful 模式：`true` = 保留原色，`false` = 使用 currentColor

**Electron 应用配置** (core-app):
```typescript
// App.vue 或根组件
import { provide } from 'vue'
import { TX_ICON_CONFIG_KEY } from '@user-pkg/tuffex'

provide(TX_ICON_CONFIG_KEY, {
  fileProtocol: 'tfile://',
  urlResolver: (url, type) => {
    if (type === 'file') return `tfile://${url}`
    if (type === 'url' && url.startsWith('/') && !url.startsWith('/api/')) {
      return `tfile://${url}`
    }
    return url
  },
  svgFetcher: async (url) => {
    // 使用 useSvgContent 的 retry 逻辑
    const response = await fetch(url)
    return await response.text()
  }
})
```

**使用示例**:
```vue
<template>
  <!-- 使用 icon prop -->
  <TuffIcon :icon="{ type: 'class', value: 'i-ri-home-line' }" />
  <TuffIcon :icon="{ type: 'emoji', value: '🚀' }" :size="24" />
  <TuffIcon :icon="{ type: 'file', value: '/path/to/icon.svg' }" colorful />

  <!-- 使用 name简写 -->
  <TuffIcon name="i-ri-star-line" />
  <TuffIcon name="chevron-down" /> <!-- 内置图标 -->
</template>
```

**关键文件**:
- 组件: `packages/tuffex/packages/components/src/icon/src/TxIcon.vue`
- 类型: `packages/tuffex/packages/components/src/icon/src/types.ts`
- 文档: `packages/tuffex/docs/icons/index.md`

### 统一 LogLevel

**单一日志级别定义**（位于 `packages/utils/base/log-level.ts`）:
```typescript
import { LogLevel, stringToLogLevel, logLevelToString } from '@talex-touch/utils'

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// 字符串转换
const level = stringToLogLevel('debug')  // => LogLevel.DEBUG
const str = logLevelToString(LogLevel.INFO)  // => 'INFO'
```

**统一使用场景**:
- 模块日志 (`common/logger/`)
- 插件日志 (`plugin/log/`)
- TuffTransport 日志

## 非显而易见的架构概念

1. **模块目录模式**: 每个模块请求隔离目录用于持久化存储，无需知道根路径
2. **插件隔离加密**: 插件通道使用加密密钥而非直接名称以增强安全性
3. **存储更新广播**: 存储模块向所有窗口广播更新，保持多渲染器实例 UI 同步
4. **安全插件配置命名**: 插件配置文件使用清理后的名称防止路径遍历攻击
5. **屏幕感知窗口定位**: CoreBox 记住打开时的屏幕并相应重新定位
6. **两阶段窗口设置**: TouchWindow 分离创建和渲染（`autoShow` 选项）
7. **开发模式优雅关闭**: DevProcessManager 在开发时阻止应用退出事件，允许自定义清理
8. **结构化日志命名空间**: Logger 提供彩色命名空间、时间戳和元数据以便调试

## 关键文件位置

- 主入口: apps/core-app/src/main/index.ts
- 核心应用逻辑: apps/core-app/src/main/core/touch-core.ts
- 模块管理器: apps/core-app/src/main/core/module-manager.ts
- 插件系统: apps/core-app/src/main/modules/plugin/plugin-provider.ts
- CoreBox 启动器: apps/core-app/src/main/modules/box-tool/core-box.ts
- Channel 系统: apps/core-app/src/main/core/channel-core.ts
- 存储模块: apps/core-app/src/main/modules/storage/storage-provider.ts
- 渲染器入口: apps/core-app/src/renderer/src/main.ts
- 共享工具: packages/utils/

## CoreBox 布局系统

### 布局模式
CoreBox 支持两种布局模式，由后端 `TuffSearchResult.containerLayout` 控制：
- **list** - 默认列表模式，垂直排列
- **grid** - 宫格模式，支持横向选择

### DSL 类型
```typescript
interface TuffContainerLayout {
  mode: 'list' | 'grid'
  grid?: {
    columns: number      // 列数，默认 5
    gap?: number         // 间距(px)，默认 8
    itemSize?: 'small' | 'medium' | 'large'
  }
  sections?: TuffSection[]  // 分组配置
}

interface TuffMeta {
  // ... 其他字段
  pinned?: {              // 固定配置
    isPinned: boolean
    pinnedAt?: number
    order?: number
  }
  recommendation?: {      // 推荐来源标记
    source: 'frequent' | 'recent' | 'time-based' | 'trending' | 'pinned' | 'context'
    score?: number
  }
}
```

### 键盘导航
- **list 模式**: ArrowUp/Down 上下移动
- **grid 模式**: ArrowUp/Down 跨行移动，ArrowLeft/Right 同行移动

### 关键文件
- 布局组件: `src/renderer/src/components/render/BoxGrid.vue`
- 宫格项: `src/renderer/src/components/render/BoxGridItem.vue`
- 键盘导航: `src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- 推荐引擎: `src/main/modules/box-tool/search-engine/recommendation/`

## 开发注意事项

- Node.js 版本: 22.16.0+ (pnpm preinstall hook 和 Volta 强制)
- 开发时支持热重载，通过 DevProcessManager 进行进程清理
- 插件开发支持 Manifest (`manifest.json`) 或 Prelude (`index.js`) 变更时的实时重载
- CoreBox 定位支持屏幕感知，适应多显示器设置
- 数据库使用 Drizzle ORM + LibSQL 进行类型安全查询
- 使用 log4js 进行结构化日志记录，带命名空间、时间戳和彩色输出
- 请不要写太多注释，尽量保持精简，保留必要的 EnglishTSDoc 即可
- dev 环境中 console debug 主进程看不到日志，如果是调试可以用 console.log 打印，记得清空
- NeuxsApp `app.vue` 中新增自定义组件请显式 import；SSR 页面里依赖浏览器态/用户态/时间或 Teleport 的组件用 `ClientOnly`，避免组件未解析或 hydration mismatch
- 优先使用 `packages/utils/common/utils/polling.ts` 的 `PollingService` 承担周期任务，避免各模块重复实现 scheduler
- Nexus 发布日志统一结构：`notes`/`notesHtml` 必须为 `{ zh: string, en: string }`，语言代码只允许 `zh`/`en`
- 复杂流程优先抽取到 `packages/utils` 中的公共 utils，减少跨模块重复实现和 utils 冲突
- 对架构质量严格把关：避免深层嵌套 if/else、重复调度器、过度注释或无效注释
