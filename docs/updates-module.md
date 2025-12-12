# Tuff Updates 模块架构文档

> 本文档梳理应用内更新系统现状，并规划官网 Updates 模块、Intelligence 中心、本地发布流程。

---

## 1. 现有更新系统架构

### 1.1 主进程模块

#### UpdateServiceModule
**路径**: `apps/core-app/src/main/modules/update/UpdateService.ts`

**职责**:
- 更新设置管理（`update-settings.json`）
- 定时轮询检查（基于 `frequency` 配置）
- 网络检查（GitHub Releases API）
- 更新可用时通知渲染进程
- 持久化更新记录（DB）
- 与 DownloadCenter 集成

**核心配置** (`UpdateSettings`):
| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用自动检查 |
| `frequency` | UpdateFrequency | 检查频率：everyday/1day/3day/7day/1month/never |
| `updateChannel` | AppPreviewChannel | 更新渠道：RELEASE/BETA/SNAPSHOT |
| `ignoredVersions` | string[] | 用户忽略的版本列表 |
| `cacheEnabled` | boolean | 是否启用缓存 |
| `cacheTTL` | number | 缓存有效期（分钟） |
| `lastCheckedAt` | number | 最后检查时间戳 |

**IPC 通道**:
| 通道名 | 方向 | 说明 |
|--------|------|------|
| `update:check` | R→M | 检查更新（可 force） |
| `update:get-settings` | R→M | 获取设置 |
| `update:update-settings` | R→M | 更新设置 |
| `update:get-status` | R→M | 获取状态 |
| `update:download` | R→M | 下载指定 release |
| `update:install` | R→M | 安装指定 taskId |
| `update:ignore-version` | R→M | 忽略版本 |
| `update:record-action` | R→M | 记录用户动作（skip/remind-later/update-now） |
| `update:available` | M→R | 通知有更新可用 |

#### UpdateRepository
**路径**: `apps/core-app/src/main/modules/update/update-repository.ts`

**职责**: 更新记录持久化（Drizzle ORM）

**状态枚举** (`UpdateRecordStatus`):
- `PENDING` - 待处理
- `SKIPPED` - 用户跳过
- `SNOOZED` - 稍后提醒（含 `snoozeUntil`）
- `ACKNOWLEDGED` - 已确认

#### UpdateSystem
**路径**: `apps/core-app/src/main/modules/update/update-system.ts`

**职责**: 与 DownloadCenter 集成，负责下载/安装

**更新流程**:
```
1. 检查更新 (GitHub API)
2. 版本比较 + 渠道过滤
3. 下载 (DownloadCenter, CRITICAL 优先级)
4. SHA256 校验
5. 通知用户 + 安装
```

---

### 1.2 渲染进程模块

#### UpdateProvider 抽象
**路径**: `apps/core-app/src/renderer/src/modules/update/UpdateProvider.ts`

**已实现 Provider**:
- `GithubUpdateProvider` - GitHub Releases（默认启用）
- `OfficialUpdateProvider` - 官方源（预留）
- `CustomUpdateProvider` - 用户自定义源

#### UpdateProviderManager
**路径**: `apps/core-app/src/renderer/src/modules/update/UpdateProviderManager.ts`

**职责**: Provider 注册/选择/健康检查

---

### 1.3 UI 组件

#### UpdatePromptDialog
**路径**: `apps/core-app/src/renderer/src/components/download/UpdatePromptDialog.vue`

**功能**:
- 版本对比展示（当前 vs 新版）
- 发布时间、包体大小
- Release Notes（Markdown 渲染）
- 下载进度展示
- 用户操作：Download / Install / Ignore / Remind Later

---

## 2. 目标方案：双源更新 + 静默安装

### 2.1 更新源策略

```
┌─────────────────────────────────────────────────────────┐
│                    Update Sources                        │
├─────────────────────────────────────────────────────────┤
│  Primary: GitHub Releases (talex-touch/tuff)            │
│  - 自动下载                                              │
│  - 公开访问                                              │
│  - CDN 加速（GitHub 自带）                               │
├─────────────────────────────────────────────────────────┤
│  Secondary: Nexus Server (官方源)                        │
│  - 管理员发布                                            │
│  - 版本管理后台                                          │
│  - 支持灰度/回滚                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 安装包格式

| 平台 | 格式 | 安装方式 |
|------|------|----------|
| macOS | `.dmg` | 静默替换，重启生效 |
| Windows | `.exe` | 静默替换，重启生效 |
| Linux | `.AppImage` | 静默替换，重启生效 |

### 2.3 静默更新流程

```
1. 检测到新版本
2. 后台下载（不打扰用户）
3. 下载完成 → 校验 SHA256
4. 提示用户"重启以完成更新"
5. 用户重启 → 自动完成安装
6. 新版本启动
```

**技术实现要点**:
- macOS: 使用 `electron-updater` 或自定义 DMG 挂载 + 文件替换
- Windows: NSIS 静默安装 (`/S` 参数)
- Linux: AppImage 直接替换可执行文件

---

## 3. 官网模块规划

### 3.1 Updates（下载中心）

**页面结构**:
```
/updates
├── 最新版本卡片（当前 Release）
├── 版本列表（分页）
│   ├── 版本号 + 渠道标签
│   ├── 发布时间
│   ├── Release Notes（折叠）
│   └── 下载按钮（自动识别平台）
├── 渠道切换（Release / Beta / Snapshot）
└── 历史版本归档
```

**API 设计** (Nexus Server) - **已实现**:

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/releases` | 获取版本列表 | Public |
| GET | `/api/releases/latest` | 获取最新发布版本 | Public |
| GET | `/api/releases/:tag` | 获取单个版本详情 | Public |
| POST | `/api/releases` | 创建新版本 | Admin |
| PATCH | `/api/releases/:tag` | 更新版本信息 | Admin |
| DELETE | `/api/releases/:tag` | 删除版本 | Admin |
| POST | `/api/releases/:tag/publish` | 发布版本 | Admin |
| POST | `/api/releases/:tag/assets` | 上传版本资产（upload 模式） | Admin |
| POST | `/api/releases/:tag/link-github` | 链接 GitHub 资产（github 模式） | Admin |
| GET | `/api/releases/:tag/assets` | 获取版本资产列表 | Public |
| GET | `/api/releases/:tag/download/:platform/:arch` | 下载资产 | Public |

**查询参数**:
```typescript
// GET /api/releases
{
  channel?: 'RELEASE' | 'BETA' | 'SNAPSHOT'  // 筛选渠道
  status?: 'draft' | 'published' | 'archived' // 筛选状态
  assets?: 'true' | 'false'                   // 是否包含资产列表
  limit?: number                              // 限制返回数量
}

// GET /api/releases/latest
{
  channel?: 'RELEASE' | 'BETA' | 'SNAPSHOT'  // 默认 RELEASE
  platform?: 'darwin' | 'win32' | 'linux'    // 筛选平台资产
}
```

**资产双模式**:

| 模式 | sourceType | 说明 | 使用场景 |
|------|------------|------|----------|
| **GitHub 外链** | `github` | 直接指向 GitHub Release 资产 URL | 主要模式，利用 GitHub CDN |
| **上传存储** | `upload` | 上传到 R2/S3 自有存储 | 备用/私有版本 |

```typescript
// POST /api/releases/:tag/link-github (链接 GitHub 资产)
{
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'x64' | 'arm64' | 'universal'
  filename: string           // 如 "Tuff-2.5.0-arm64.dmg"
  downloadUrl: string        // GitHub 资产下载 URL
  size: number               // 文件大小（字节）
  sha256?: string            // 可选，校验码
  contentType?: string       // 默认 application/octet-stream
}

// POST /api/releases/:tag/assets (上传资产)
// FormData: platform, arch, file
```

### 3.2 Intelligence（智能中心）

**页面结构**:
```
/intelligence
├── Prompts（提示词库）
│   ├── 分类浏览
│   ├── 搜索
│   └── 收藏/使用统计
├── Agents（智能体）
│   ├── 官方智能体
│   ├── 社区智能体
│   └── 创建/编辑
├── Workflows（工作流）
│   ├── 模板库
│   ├── 可视化编辑器
│   └── 导入/导出
└── 我的收藏
```

**数据模型**:
```typescript
interface Prompt {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  author: string
  usageCount: number
  createdAt: number
}

interface Agent {
  id: string
  name: string
  description: string
  avatar: string
  model: string
  systemPrompt: string
  tools: string[]
  author: string
}

interface Workflow {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  author: string
}
```

---

## 4. 本地发布流程

### 4.1 发布工具：CLI

```bash
# 登录（获取 token）
tuff auth login

# 发布新版本
tuff publish \
  --tag v2.5.0-RELEASE \
  --channel release \
  --files dist/*.dmg,dist/*.exe,dist/*.AppImage \
  --notes "## What's New\n- Feature A\n- Bug fix B"

# 查看发布状态
tuff publish status v2.5.0-RELEASE
```

### 4.2 发布流程

```
1. 本地构建
   pnpm core:build:release

2. 生成元数据
   - 版本号（从 package.json 或 git tag）
   - SHA256 计算
   - 平台/架构检测

3. 认证
   - 使用 AccountSDK token
   - 校验 admin 权限

4. 上传
   - 请求 pre-signed URL
   - 上传到对象存储

5. 发布
   POST /api/updates/releases
   {
     tag: "v2.5.0-RELEASE",
     channel: "release",
     notes: "...",
     assets: [...]
   }
```

### 4.3 权限模型

| 角色 | 权限 |
|------|------|
| Admin（你） | 发布/撤回/编辑所有版本 |
| User | 下载/查看 |

---

## 5. unplugin-export-plugin 梳理

**路径**: `packages/unplugin-export-plugin`

**用途**: 插件开发构建工具，用于将 Vite 项目打包为 `.tpex` 插件包

### 5.1 保留文件

```
unplugin-export-plugin/
├── src/                 # 核心源码
│   ├── index.ts         # unplugin 入口
│   ├── bin/             # CLI (tuff builder)
│   ├── core/            # 构建核心逻辑
│   ├── types.ts         # 类型定义
│   ├── vite.ts          # Vite 插件导出
│   ├── webpack.ts       # Webpack 插件导出
│   ├── rollup.ts        # Rollup 插件导出
│   ├── esbuild.ts       # esbuild 插件导出
│   └── nuxt.ts          # Nuxt 模块导出
├── package.json         # 包配置
├── tsconfig.json        # TS 配置
├── tsup.config.ts       # 构建配置
├── README.md            # 文档
├── LICENSE              # 许可证
└── .gitignore           # Git 忽略
```

### 5.2 已清理文件

- `.git/` - 独立 git 历史
- `.github/` - CI workflows
- `.vscode/` - IDE 设置
- `playground/` - 示例项目
- `test/` - 测试文件
- `pnpm-lock.yaml` - 使用根目录 lockfile
- `pnpm-workspace.yaml` - 不需要子 workspace
- `node_modules/` - 由根目录管理
- `dist/` - 构建产物
- `.eslintrc` - 使用根目录配置
- `.npmrc` - 使用根目录配置
- `mise.toml` - 版本管理器配置

### 5.3 集成到 Monorepo

**修改建议**:
1. 在根目录 `pnpm-workspace.yaml` 添加:
   ```yaml
   packages:
     - 'packages/unplugin-export-plugin'
   ```

2. 依赖 `@talex-touch/utils` 使用 workspace 协议:
   ```json
   {
     "dependencies": {
       "@talex-touch/utils": "workspace:*"
     }
   }
   ```

---

## 6. 代码变更记录

### 6.1 已完成

- [x] 替换 `AidenYuanDev/tuff` → `talex-touch/tuff`
  - 位置: `packages/utils/channel/index.ts:29`

- [x] 清理 `unplugin-export-plugin` 冗余文件
  - 删除: `.git`, `.github`, `.vscode`, `playground`, `test`, `pnpm-lock.yaml` 等

- [x] 集成 `unplugin-export-plugin` 到 monorepo
  - 修改依赖为 `workspace:*`
  - 清理无效 scripts

- [x] 实现 Nexus Server Releases API
  - 创建 `server/utils/releasesStore.ts`（D1 + 内存双模式）
  - 创建 API 路由（CRUD + 发布 + 下载）
  - 支持渠道/平台/架构筛选
  - 支持下载计数

### 6.2 待办

- [ ] 实现静默更新安装逻辑（客户端）
- [ ] 官网 Updates 页面（前端）
- [ ] 官网 Intelligence 页面
- [ ] 发布 CLI 工具（`tuff publish`）
- [ ] R2/S3 文件存储集成

---

## 7. 附录：版本号规范

**格式**: `v{major}.{minor}.{patch}-{channel}`

**示例**:
- `v2.5.0-RELEASE` - 正式版
- `v2.5.1-BETA` - 测试版
- `v2.5.2-SNAPSHOT.20251213` - 快照版

**渠道优先级**:
```
SNAPSHOT (2) > BETA (1) > RELEASE (0)
```

用户只能接收到**等于或低于**当前渠道的更新。
