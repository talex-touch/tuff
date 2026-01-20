# PRD: 插件权限中心 (Permission Center) v1.0

## 1. 背景与目标

### 1.1 当前问题
- 插件可无限制调用系统能力（文件、剪贴板、网络、AI）
- 用户无法感知插件正在使用哪些能力
- 缺乏统一的权限审计与控制机制
- 恶意插件风险无法有效防范

### 1.2 核心目标
1. **细粒度权限控制**: 每个系统能力需明确授权
2. **用户知情同意**: 安装/首次使用时展示权限清单
3. **运行时拦截**: 未授权调用被拦截并提示
4. **审计日志**: 记录插件敏感操作
5. **权限撤销**: 用户可随时撤销已授予的权限

## 2. 权限模型设计

### 2.1 权限分类

| 类别 | 权限标识 | 风险等级 | 说明 |
|------|----------|----------|------|
| **文件系统** | `fs.read` | 🟡 中 | 读取用户文件 |
|  | `fs.write` | 🔴 高 | 写入/删除文件 |
|  | `fs.execute` | 🔴 高 | 执行文件/脚本 |
| **剪贴板** | `clipboard.read` | 🟡 中 | 读取剪贴板 |
|  | `clipboard.write` | 🟢 低 | 写入剪贴板 |
| **网络** | `network.local` | 🟢 低 | 本地网络请求 |
|  | `network.internet` | 🟡 中 | 互联网请求 |
|  | `network.download` | 🟡 中 | 下载文件到本地 |
| **系统** | `system.shell` | 🔴 高 | 执行系统命令 |
|  | `system.notification` | 🟢 低 | 发送系统通知 |
|  | `system.tray` | 🟡 中 | 托盘交互 |
| **AI 能力** | `ai.basic` | 🟢 低 | 基础 AI 调用 |
|  | `ai.advanced` | 🟡 中 | 高级模型调用 |
|  | `ai.agents` | 🔴 高 | 调用 Agents 系统 |
| **存储** | `storage.plugin` | 🟢 低 | 插件私有存储 |
|  | `storage.shared` | 🟡 中 | 跨插件共享存储 |
| **窗口** | `window.create` | 🟢 低 | 创建窗口/视图 |
|  | `window.capture` | 🔴 高 | 截图/屏幕捕获 |

### 2.2 权限组合（预设角色）

```typescript
// 预定义权限组
const PermissionPresets = {
  // 基础插件：只能展示 UI
  BASIC: ['storage.plugin', 'window.create', 'clipboard.write'],
  
  // 工具插件：可读取输入
  UTILITY: ['storage.plugin', 'window.create', 'clipboard.read', 'clipboard.write', 'network.local'],
  
  // 网络插件：可访问网络
  NETWORK: ['network.internet', 'network.download', ...UTILITY],
  
  // AI 插件：可调用 AI
  AI_ENABLED: ['ai.basic', 'ai.advanced', ...NETWORK],
  
  // 高级插件：需要文件/系统能力
  ADVANCED: ['fs.read', 'fs.write', 'system.notification', ...AI_ENABLED],
  
  // 完全信任：所有权限
  TRUSTED: ['*']
}
```

## 3. SDK 版本兼容性

### 3.1 sdkapi 字段

权限系统通过 `sdkapi` 字段判断是否对插件启用权限校验：

| sdkapi 值 | 行为 |
|-----------|------|
| 未声明 | ⚠️ 跳过权限校验，提示用户"插件使用旧版 SDK" |
| < 251212 | ⚠️ 跳过权限校验，提示用户"插件使用旧版 SDK" |
| >= 251212 | ✅ 启用完整权限校验 |

**当前版本**: `251212` (2025-12-12)

这种设计确保了：
1. **向后兼容**: 旧插件不会因权限问题崩溃
2. **用户知情**: 用户可以看到哪些插件未经权限校验
3. **渐进迁移**: 插件开发者可以逐步升级到新 SDK

## 4. Manifest 权限声明

### 4.1 声明格式

```json
{
  "name": "touch-translation",
  "version": "1.0.0",
  "sdkapi": 251212,
  "permissions": {
    "required": [
      "network.internet",
      "clipboard.read",
      "storage.plugin"
    ],
    "optional": [
      "ai.basic",
      "fs.read"
    ]
  },
  "permissionReasons": {
    "network.internet": "调用翻译 API 服务",
    "clipboard.read": "读取待翻译文本",
    "ai.basic": "提供 AI 润色功能",
    "fs.read": "翻译本地文档"
  }
}
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `permissions.required` | `string[]` | 必需权限，拒绝则无法安装 |
| `permissions.optional` | `string[]` | 可选权限，可单独授予/撤销 |
| `permissionReasons` | `Record<string, string>` | 权限用途说明，用于 UI 展示 |

## 4. 架构设计

### 4.1 核心模块

```
apps/core-app/src/main/modules/permission/
├── permission-module.ts        # 模块入口
├── permission-registry.ts      # 权限定义注册表
├── permission-store.ts         # 权限授予状态持久化
├── permission-guard.ts         # 运行时拦截器
├── permission-audit.ts         # 审计日志
└── permission-ui-bridge.ts     # UI 通信桥接
```

### 4.2 类型定义

```typescript
// packages/utils/permission/types.ts

export enum PermissionCategory {
  FILESYSTEM = 'fs',
  CLIPBOARD = 'clipboard',
  NETWORK = 'network',
  SYSTEM = 'system',
  AI = 'ai',
  STORAGE = 'storage',
  WINDOW = 'window'
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface PermissionDefinition {
  id: string                    // e.g., 'fs.read'
  category: PermissionCategory
  risk: RiskLevel
  name: string                  // 显示名称
  description: string           // 详细描述
  icon?: string                 // 图标
}

export interface PermissionGrant {
  pluginId: string
  permissionId: string
  grantedAt: number
  grantedBy: 'user' | 'auto' | 'trust'
  expiresAt?: number           // 可设置临时授权
}

export interface PermissionDenial {
  pluginId: string
  permissionId: string
  deniedAt: number
  reason?: string
}

export interface PermissionRequest {
  pluginId: string
  permissionId: string
  reason: string
  context?: Record<string, any>  // 调用上下文
}

export interface AuditLogEntry {
  id: string
  timestamp: number
  pluginId: string
  permissionId: string
  action: 'granted' | 'denied' | 'revoked' | 'used'
  context?: Record<string, any>
}
```

### 4.3 PermissionRegistry

```typescript
// permission-registry.ts
class PermissionRegistry {
  private definitions: Map<string, PermissionDefinition> = new Map()
  
  register(definition: PermissionDefinition): void
  get(id: string): PermissionDefinition | undefined
  getByCategory(category: PermissionCategory): PermissionDefinition[]
  getByRisk(risk: RiskLevel): PermissionDefinition[]
  all(): PermissionDefinition[]
}
```

### 4.4 PermissionStore

```typescript
// permission-store.ts
class PermissionStore {
  // 持久化到 SQLite (permission_grants 表)
  
  async grant(pluginId: string, permissionId: string, by: GrantType): Promise<void>
  async revoke(pluginId: string, permissionId: string): Promise<void>
  async isGranted(pluginId: string, permissionId: string): Promise<boolean>
  async getPluginPermissions(pluginId: string): Promise<PermissionGrant[]>
  async getPermissionPlugins(permissionId: string): Promise<PermissionGrant[]>
  
  // 批量操作
  async grantPreset(pluginId: string, preset: keyof typeof PermissionPresets): Promise<void>
  async revokeAll(pluginId: string): Promise<void>
}
```

### 4.5 PermissionGuard (运行时拦截)

```typescript
// permission-guard.ts
class PermissionGuard {
  // 拦截器 - 在 Channel 调用前检查
  async check(pluginId: string, permissionId: string, context?: any): Promise<boolean>
  
  // 请求授权 (弹窗)
  async request(request: PermissionRequest): Promise<'granted' | 'denied' | 'later'>
  
  // 装饰器模式：包装需要权限的 API
  wrapAPI<T extends Function>(
    permissionId: string,
    api: T,
    options?: { prompt?: boolean }
  ): T
}

// 使用示例
const guardedReadFile = permissionGuard.wrapAPI(
  'fs.read',
  fs.readFile,
  { prompt: true }  // 未授权时提示
)
```

### 4.6 PermissionAudit (审计日志)

```typescript
// permission-audit.ts
class PermissionAudit {
  // 记录
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void>
  
  // 查询
  async getPluginLogs(pluginId: string, limit?: number): Promise<AuditLogEntry[]>
  async getPermissionLogs(permissionId: string, limit?: number): Promise<AuditLogEntry[]>
  async getRecentLogs(hours: number): Promise<AuditLogEntry[]>
  
  // 导出
  async exportCSV(filter: AuditFilter): Promise<string>
}
```

## 5. IPC 通道设计

| 通道 | 方向 | 说明 |
|------|------|------|
| `permission:check` | R→M | 检查权限状态 |
| `permission:request` | R→M | 请求授权 (触发弹窗) |
| `permission:grant` | R→M | 用户授予权限 |
| `permission:revoke` | R→M | 用户撤销权限 |
| `permission:list-plugin` | R→M | 获取插件所有权限 |
| `permission:list-all` | R→M | 获取所有权限定义 |
| `permission:audit-logs` | R→M | 获取审计日志 |
| `permission:prompt` | M→R | 权限请求弹窗 |
| `permission:updated` | M→R | 权限状态变更广播 |

## 6. UI 设计

### 6.1 安装时权限确认

```
┌─────────────────────────────────────────────────────┐
│  📦 安装插件: touch-translation                      │
├─────────────────────────────────────────────────────┤
│  此插件需要以下权限:                                 │
│                                                      │
│  🔴 必需权限                                         │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🌐 网络访问 (network.internet)               │    │
│  │    调用翻译 API 服务                          │    │
│  │                                              │    │
│  │ 📋 剪贴板读取 (clipboard.read)               │    │
│  │    读取待翻译文本                            │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  🟡 可选权限 (可稍后授予)                           │
│  ┌─────────────────────────────────────────────┐    │
│  │ ☐ 🤖 AI 基础能力 - 提供 AI 润色功能           │    │
│  │ ☐ 📁 文件读取 - 翻译本地文档                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│           [ 取消 ]  [ 接受并安装 ]                   │
└─────────────────────────────────────────────────────┘
```

### 6.2 权限中心页面

```
┌─────────────────────────────────────────────────────┐
│  ⚙️ 设置 > 权限中心                                  │
├─────────────────────────────────────────────────────┤
│  🔍 搜索插件或权限...                               │
│                                                      │
│  ┌─ 按插件 ─────────────────────────────────────┐   │
│  │                                              │   │
│  │  📦 touch-translation         ▼              │   │
│  │  ├─ ✅ 网络访问                              │   │
│  │  ├─ ✅ 剪贴板读取                            │   │
│  │  ├─ ⬚ AI 基础能力         [ 授予 ]          │   │
│  │  └─ ⬚ 文件读取            [ 授予 ]          │   │
│  │                                              │   │
│  │  📦 touch-image               ▼              │   │
│  │  ├─ ✅ 网络访问                              │   │
│  │  ├─ ✅ 文件读取                              │   │
│  │  └─ ✅ 文件写入                              │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ 审计日志 ───────────────────────────────────┐   │
│  │ 14:23 touch-translation 使用 网络访问         │   │
│  │ 14:21 touch-image 写入 /Downloads/xxx.png     │   │
│  │ 14:20 touch-translation 读取剪贴板            │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│           [ 导出日志 ]  [ 重置所有权限 ]            │
└─────────────────────────────────────────────────────┘
```

### 6.3 运行时权限请求弹窗

```
┌───────────────────────────────────────┐
│  🔐 权限请求                          │
├───────────────────────────────────────┤
│                                       │
│  touch-translation 请求:              │
│                                       │
│  📁 文件读取权限                       │
│                                       │
│  用途: 翻译本地文档                    │
│                                       │
│  ☐ 记住此选择                         │
│                                       │
│  [ 拒绝 ]  [ 仅本次 ]  [ 始终允许 ]   │
└───────────────────────────────────────┘
```

## 7. 数据库 Schema

```sql
-- permission_grants: 权限授予记录
CREATE TABLE permission_grants (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  granted_by TEXT NOT NULL,  -- 'user' | 'auto' | 'trust'
  expires_at INTEGER,
  UNIQUE(plugin_id, permission_id)
);

-- permission_denials: 权限拒绝记录
CREATE TABLE permission_denials (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  denied_at INTEGER NOT NULL,
  reason TEXT,
  UNIQUE(plugin_id, permission_id)
);

-- permission_audit_logs: 审计日志
CREATE TABLE permission_audit_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  plugin_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'granted' | 'denied' | 'revoked' | 'used'
  context TEXT  -- JSON
);

CREATE INDEX idx_audit_plugin ON permission_audit_logs(plugin_id);
CREATE INDEX idx_audit_timestamp ON permission_audit_logs(timestamp);
```

## 8. SDK 集成

### 8.1 插件侧 API

```typescript
// @talex-touch/utils/permission/sdk.ts

export const permissionSDK = {
  // 检查权限
  async check(permissionId: string): Promise<boolean>
  
  // 请求权限 (触发 UI 弹窗)
  async request(permissionId: string, reason?: string): Promise<boolean>
  
  // 批量检查
  async checkAll(permissionIds: string[]): Promise<Record<string, boolean>>
  
  // 监听权限变化
  onPermissionChange(callback: (event: PermissionChangeEvent) => void): () => void
}

// 使用示例
async function translateDocument() {
  const hasPermission = await permissionSDK.check('fs.read')
  if (!hasPermission) {
    const granted = await permissionSDK.request('fs.read', '需要读取文档进行翻译')
    if (!granted) {
      showToast('无法翻译：缺少文件读取权限')
      return
    }
  }
  
  // 执行文件读取...
}
```

### 8.2 渲染进程 Hooks

```typescript
// packages/utils/renderer/hooks/usePermission.ts

export function usePermission(pluginId: string) {
  const permissions = ref<PermissionGrant[]>([])
  const loading = ref(true)
  
  // 获取插件权限列表
  async function refresh(): Promise<void>
  
  // 授予权限
  async function grant(permissionId: string): Promise<boolean>
  
  // 撤销权限
  async function revoke(permissionId: string): Promise<boolean>
  
  // 检查是否已授权
  function isGranted(permissionId: string): boolean
  
  return { permissions, loading, refresh, grant, revoke, isGranted }
}

export function usePermissionAudit(filter?: AuditFilter) {
  const logs = ref<AuditLogEntry[]>([])
  
  async function refresh(): Promise<void>
  async function exportCSV(): Promise<void>
  
  return { logs, refresh, exportCSV }
}
```

## 9. 实施计划

### Phase 1: 基础框架 (3-4 天)
- [x] 权限类型定义 (`packages/utils/permission/`)
- [x] PermissionRegistry 实现
- [x] PermissionStore 实现 (JSON 文件)
- [ ] 数据库迁移脚本

### Phase 2: 运行时拦截 (2-3 天)
- [x] PermissionGuard 实现
- [x] Channel 层集成拦截器
- [x] 关键 API 权限保护 (fs/network/clipboard)

### Phase 3: UI 集成 (3-4 天)
- [ ] 安装时权限确认弹窗
- [x] 运行时权限请求弹窗
- [x] 权限中心设置页面
- [x] 审计日志查看

### Phase 4: SDK & 文档 (2 天)
- [x] permissionSDK 实现
- [x] usePermission hooks
- [x] 插件开发文档更新
- [x] 示例插件权限配置

### Phase 5: 测试与优化 (2 天)
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化 (缓存)
- [ ] 边界情况处理

**总工期**: 12-15 天

## 10. 验收标准

### 功能
- [ ] 插件安装时展示权限清单
- [x] 运行时拦截未授权 API 调用
- [x] 权限请求弹窗正常工作
- [x] 用户可查看/管理所有插件权限
- [x] 审计日志正确记录敏感操作

### 性能
- [x] 权限检查耗时 < 5ms
- [ ] 权限中心页面加载 < 500ms
- [ ] 审计日志查询 < 100ms

### 安全
- [x] 未声明权限无法调用对应 API
- [ ] 权限撤销后立即生效
- [ ] 审计日志不可被插件修改

## 11. 后续迭代

- **临时授权**: 支持"仅本次"授权，关闭后自动撤销
- **权限继承**: 子插件继承父插件部分权限
- **权限模板**: 用户自定义权限预设
- **自动审核**: 基于 AI 分析插件代码推荐权限
- **权限市场**: 官方认证插件可自动授予 TRUSTED

---

**文档版本**: v1.0
**创建时间**: 2025-12-12
**维护者**: Development Team
