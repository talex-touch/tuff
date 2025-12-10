# Account API

账户 SDK 提供用户信息、订阅状态、配额管理等能力，适用于插件需要根据用户身份或订阅等级提供差异化功能的场景。

## 快速开始

```ts
import { accountSDK, SubscriptionPlan } from '@talex-touch/utils'

// 检查用户是否已登录
const isLoggedIn = await accountSDK.isLoggedIn()

// 获取当前订阅计划
const plan = await accountSDK.getPlan()

// 检查是否为付费用户
if (await accountSDK.isPaidUser()) {
  // 显示高级功能
}
```

---

## 订阅计划

| 计划 | 枚举值 | 说明 |
|------|--------|------|
| 免费版 | `SubscriptionPlan.FREE` | 基础功能，有配额限制 |
| 专业版 | `SubscriptionPlan.PRO` | 更多配额，自定义模型 |
| 增强版 | `SubscriptionPlan.PLUS` | 优先支持，高级分析 |
| 团队版 | `SubscriptionPlan.TEAM` | 团队协作，管理功能 |
| 企业版 | `SubscriptionPlan.ENTERPRISE` | 无限配额，专属支持 |

---

## API 参考

### 获取 SDK 实例

```ts
import { accountSDK } from '@talex-touch/utils'

// 单例模式，直接使用
await accountSDK.getProfile()
```

::alert{type="warning"}
**注意**：在 Prelude 脚本 (`index.js`) 中使用时，需要先调用 `accountSDK.setChannelSend(send)` 注入通信函数。
::

---

### 用户信息

#### `getProfile()`

获取完整用户资料。

```ts
const profile = await accountSDK.getProfile()
// {
//   id: 'user_xxx',
//   displayName: '张三',
//   email: 'zhangsan@example.com',
//   avatarUrl: 'https://...',
//   emailVerified: true,
//   createdAt: 1702123456789,
//   twoFactorEnabled: false,
//   socialConnections: [...]
// }
```

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `profile` | `UserProfile \| null` | 用户资料，未登录返回 `null` |

#### `isLoggedIn()`

检查用户是否已登录。

```ts
if (await accountSDK.isLoggedIn()) {
  // 已登录
}
```

#### `getUserId()`

获取用户 ID。

```ts
const userId = await accountSDK.getUserId()
// 'user_xxx' 或 null
```

#### `getDisplayName()`

获取显示名称。

```ts
const name = await accountSDK.getDisplayName()
// '张三'
```

#### `getEmail()`

获取用户邮箱。

```ts
const email = await accountSDK.getEmail()
// 'zhangsan@example.com'
```

#### `getAvatarUrl()`

获取头像 URL。

```ts
const avatar = await accountSDK.getAvatarUrl()
// 'https://...'
```

---

### 订阅检查

#### `getPlan()`

获取当前订阅计划。

```ts
const plan = await accountSDK.getPlan()
// SubscriptionPlan.PRO
```

#### `getSubscription()`

获取完整订阅详情。

```ts
const subscription = await accountSDK.getSubscription()
// {
//   id: 'sub_xxx',
//   plan: 'pro',
//   status: 'active',
//   billingCycle: 'monthly',
//   quota: { aiRequestsPerDay: 500, ... },
//   usage: { aiRequestsToday: 123, ... },
//   currentPeriodEnd: 1704067200000,
//   autoRenew: true
// }
```

#### `isPaidUser()`

检查是否为付费用户。

```ts
if (await accountSDK.isPaidUser()) {
  // 显示付费功能
}
```

#### `isProOrAbove()`

检查是否为 Pro 或更高等级。

```ts
if (await accountSDK.isProOrAbove()) {
  // Pro / Plus / Team / Enterprise
}
```

#### `isPlusOrAbove()`

检查是否为 Plus 或更高等级。

```ts
if (await accountSDK.isPlusOrAbove()) {
  // Plus / Team / Enterprise
}
```

#### `isTeamOrAbove()`

检查是否为 Team 或更高等级。

```ts
if (await accountSDK.isTeamOrAbove()) {
  // Team / Enterprise
}
```

#### `isEnterprise()`

检查是否为企业版。

```ts
if (await accountSDK.isEnterprise()) {
  // Enterprise only
}
```

#### `isTrialing()`

检查是否在试用期。

```ts
if (await accountSDK.isTrialing()) {
  const days = await accountSDK.getTrialDaysRemaining()
  console.log(`试用剩余 ${days} 天`)
}
```

#### `getDaysRemaining()`

获取当前订阅周期剩余天数。

```ts
const days = await accountSDK.getDaysRemaining()
// 28
```

---

### 配额检查

#### `getQuota()`

获取当前计划的配额限制。

```ts
const quota = await accountSDK.getQuota()
// {
//   aiRequestsPerDay: 500,
//   aiTokensPerMonth: 1000000,
//   maxPlugins: 20,
//   maxStorageBytes: 1073741824,
//   customModelAccess: true,
//   apiAccess: true,
//   ...
// }
```

#### `getUsage()`

获取当前使用量统计。

```ts
const usage = await accountSDK.getUsage()
// {
//   aiRequestsToday: 123,
//   aiRequestsThisMonth: 2456,
//   aiTokensThisMonth: 456789,
//   storageUsedBytes: 52428800,
//   pluginsInstalled: 8
// }
```

#### `checkAiRequestQuota()`

检查 AI 请求配额。

```ts
const result = await accountSDK.checkAiRequestQuota()
if (!result.allowed) {
  console.log(result.reason) // 'Daily AI request limit reached'
  console.log(`重置时间: ${new Date(result.resetAt)}`)
} else {
  console.log(`剩余请求: ${result.remaining}`)
}
```

#### `checkAiTokenQuota(estimatedTokens)`

检查 AI Token 配额。

```ts
const result = await accountSDK.checkAiTokenQuota(1000)
if (!result.allowed) {
  // 配额不足
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `estimatedTokens` | `number` | 预估消耗的 Token 数量（可选，默认 0） |

#### `checkStorageQuota(additionalBytes)`

检查存储配额。

```ts
const result = await accountSDK.checkStorageQuota(1024 * 1024) // 1MB
if (!result.allowed) {
  console.log('存储空间不足')
}
```

#### `checkPluginQuota()`

检查插件安装配额。

```ts
const result = await accountSDK.checkPluginQuota()
if (!result.allowed) {
  console.log('已达插件数量上限')
}
```

#### `getUsagePercentage(type)`

获取特定配额的使用百分比。

```ts
const aiUsage = await accountSDK.getUsagePercentage('aiRequests')
console.log(`AI 请求使用率: ${aiUsage.toFixed(1)}%`)

const storageUsage = await accountSDK.getUsagePercentage('storage')
if (storageUsage > 80) {
  console.warn('存储空间即将用尽')
}
```

| 参数 | 类型 | 可选值 |
|------|------|--------|
| `type` | `string` | `'aiRequests'`, `'aiTokens'`, `'storage'`, `'plugins'` |

---

### 功能权限

#### `hasApiAccess()`

检查是否有 API 访问权限。

```ts
if (await accountSDK.hasApiAccess()) {
  // 允许使用 API
}
```

#### `hasCustomModelAccess()`

检查是否可以使用自定义模型。

```ts
if (await accountSDK.hasCustomModelAccess()) {
  // 显示自定义模型选项
}
```

#### `hasPrioritySupport()`

检查是否享有优先支持。

```ts
if (await accountSDK.hasPrioritySupport()) {
  // 显示优先支持入口
}
```

#### `hasAdvancedAnalytics()`

检查是否有高级分析功能。

```ts
if (await accountSDK.hasAdvancedAnalytics()) {
  // 显示高级分析面板
}
```

#### `hasFeature(featureId)`

检查特定功能标志是否启用。

```ts
if (await accountSDK.hasFeature('beta-ai-v2')) {
  // 启用 Beta 功能
}
```

---

### 团队管理

#### `getTeams()`

获取用户所属的所有团队。

```ts
const teams = await accountSDK.getTeams()
// [
//   { id: 'team_xxx', name: '研发团队', role: 'admin', memberCount: 5 },
//   { id: 'team_yyy', name: '设计组', role: 'member', memberCount: 3 }
// ]
```

#### `isInTeam()`

检查用户是否在任何团队中。

```ts
if (await accountSDK.isInTeam()) {
  // 显示团队功能
}
```

#### `isTeamOwner(teamId?)`

检查用户是否为团队所有者。

```ts
if (await accountSDK.isTeamOwner()) {
  // 用户是某个团队的所有者
}

if (await accountSDK.isTeamOwner('team_xxx')) {
  // 用户是指定团队的所有者
}
```

#### `isTeamAdmin(teamId?)`

检查用户是否为团队管理员（含所有者）。

```ts
if (await accountSDK.isTeamAdmin()) {
  // 显示管理功能
}
```

---

### 升级与账单

#### `getUpgradeOptions()`

获取可用的升级选项。

```ts
const options = accountSDK.getUpgradeOptions()
// [
//   { plan: 'pro', name: 'Pro', priceMonthly: 9.99, features: [...] },
//   { plan: 'plus', name: 'Plus', priceMonthly: 19.99, recommended: true, ... }
// ]
```

#### `getPlanComparison()`

获取计划对比表。

```ts
const comparison = accountSDK.getPlanComparison()
// [
//   { feature: 'AI Requests/Day', free: 50, pro: 500, plus: 2000, ... },
//   { feature: 'Custom Models', free: false, pro: true, ... }
// ]
```

#### `openUpgradePage(plan?)`

打开升级页面。

```ts
await accountSDK.openUpgradePage() // 打开升级页
await accountSDK.openUpgradePage(SubscriptionPlan.PLUS) // 直接跳转到 Plus
```

#### `openBillingPage()`

打开账单管理页面。

```ts
await accountSDK.openBillingPage()
```

---

### 账户操作

#### `requestLogin()`

请求用户登录（打开登录对话框）。

```ts
const success = await accountSDK.requestLogin()
if (success) {
  // 用户已登录
}
```

#### `logout()`

登出当前用户。

```ts
await accountSDK.logout()
```

#### `openAccountSettings()`

打开账户设置页面。

```ts
await accountSDK.openAccountSettings()
```

---

## 最佳实践

### 1. 付费功能门控

```ts
async function showPremiumFeature() {
  if (!await accountSDK.isPaidUser()) {
    // 显示升级提示
    const options = accountSDK.getUpgradeOptions()
    showUpgradeDialog(options)
    return
  }
  
  // 显示付费功能
}
```

### 2. 配额预检

```ts
async function beforeAiRequest(estimatedTokens: number) {
  const quotaCheck = await accountSDK.checkAiTokenQuota(estimatedTokens)
  
  if (!quotaCheck.allowed) {
    throw new Error(`配额不足: ${quotaCheck.reason}`)
  }
  
  // 继续请求
}
```

### 3. 团队功能适配

```ts
async function initTeamFeatures() {
  if (!await accountSDK.isTeamOrAbove()) {
    return // 非团队版，跳过
  }
  
  const teams = await accountSDK.getTeams()
  
  for (const team of teams) {
    if (team.role === 'owner' || team.role === 'admin') {
      // 显示管理功能
    }
  }
}
```

---

## 类型定义

```ts
enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  PLUS = 'plus',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

interface UserProfile {
  id: string
  displayName: string
  username?: string
  email: string
  emailVerified: boolean
  avatarUrl?: string
  createdAt: number
  twoFactorEnabled: boolean
  socialConnections: SocialConnection[]
}

interface Subscription {
  id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  quota: PlanQuota
  usage: UsageStats
  currentPeriodEnd: number
  autoRenew: boolean
}

interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  remaining?: number
  resetAt?: number
}
```

---

## 相关文档

- [Intelligence API](./intelligence.zh.md) - AI 能力调用
- [Storage API](./storage.zh.md) - 插件数据持久化
- [Plugin Context](./plugin-context.zh.md) - 插件全局上下文
