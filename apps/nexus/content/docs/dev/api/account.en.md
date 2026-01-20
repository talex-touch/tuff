# Account API

## Overview

Account SDK provides user information, subscription status, and quota management capabilities for plugins that need to offer differentiated features based on user identity or subscription tier.

## Introduction

**Quick Start**

```ts
import { accountSDK, SubscriptionPlan } from '@talex-touch/utils'

// Check if user is logged in
const isLoggedIn = await accountSDK.isLoggedIn()

// Get current subscription plan
const plan = await accountSDK.getPlan()

// Check if paid user
if (await accountSDK.isPaidUser()) {
  // Show premium features
}
```

---

## Subscription Plans

| Plan | Enum Value | Description |
|------|------------|-------------|
| Free | `SubscriptionPlan.FREE` | Basic features with quota limits |
| Pro | `SubscriptionPlan.PRO` | More quota, custom models |
| Plus | `SubscriptionPlan.PLUS` | Priority support, advanced analytics |
| Team | `SubscriptionPlan.TEAM` | Team collaboration, management |
| Enterprise | `SubscriptionPlan.ENTERPRISE` | Unlimited quota, dedicated support |

---

## API Reference

**Get SDK Instance**

```ts
import { accountSDK } from '@talex-touch/utils'

// Singleton, use directly
await accountSDK.getProfile()
```

::alert{type="warning"}
**Note**: When using in Prelude script (`index.js`), you need to call `accountSDK.setChannelSend(send)` to inject the communication function first.
::

---

**User Information**

**`getProfile()`**

Get complete user profile.

```ts
const profile = await accountSDK.getProfile()
// {
//   id: 'user_xxx',
//   displayName: 'John Doe',
//   email: 'john@example.com',
//   avatarUrl: 'https://...',
//   emailVerified: true,
//   createdAt: 1702123456789,
//   twoFactorEnabled: false,
//   socialConnections: [...]
// }
```

| Return | Type | Description |
|--------|------|-------------|
| `profile` | `UserProfile \| null` | User profile, `null` if not logged in |

**`isLoggedIn()`**

Check if user is logged in.

```ts
if (await accountSDK.isLoggedIn()) {
  // Logged in
}
```

**`getUserId()`**

Get user ID.

```ts
const userId = await accountSDK.getUserId()
// 'user_xxx' or null
```

**`getDisplayName()`**

Get display name.

```ts
const name = await accountSDK.getDisplayName()
// 'John Doe'
```

**`getEmail()`**

Get user email.

```ts
const email = await accountSDK.getEmail()
// 'john@example.com'
```

**`getAvatarUrl()`**

Get avatar URL.

```ts
const avatar = await accountSDK.getAvatarUrl()
// 'https://...'
```

---

**Subscription Checks**

**`getPlan()`**

Get current subscription plan.

```ts
const plan = await accountSDK.getPlan()
// SubscriptionPlan.PRO
```

**`getSubscription()`**

Get full subscription details.

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

**`isPaidUser()`**

Check if user is a paid subscriber.

```ts
if (await accountSDK.isPaidUser()) {
  // Show paid features
}
```

**`isProOrAbove()`**

Check if Pro tier or higher.

```ts
if (await accountSDK.isProOrAbove()) {
  // Pro / Plus / Team / Enterprise
}
```

**`isPlusOrAbove()`**

Check if Plus tier or higher.

```ts
if (await accountSDK.isPlusOrAbove()) {
  // Plus / Team / Enterprise
}
```

**`isTeamOrAbove()`**

Check if Team tier or higher.

```ts
if (await accountSDK.isTeamOrAbove()) {
  // Team / Enterprise
}
```

**`isEnterprise()`**

Check if Enterprise tier.

```ts
if (await accountSDK.isEnterprise()) {
  // Enterprise only
}
```

**`isTrialing()`**

Check if in trial period.

```ts
if (await accountSDK.isTrialing()) {
  const days = await accountSDK.getTrialDaysRemaining()
  console.log(`Trial ends in ${days} days`)
}
```

**`getDaysRemaining()`**

Get days remaining in current billing period.

```ts
const days = await accountSDK.getDaysRemaining()
// 28
```

---

**Quota Checks**

**`getQuota()`**

Get current plan quota limits.

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

**`getUsage()`**

Get current usage statistics.

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

**`checkAiRequestQuota()`**

Check AI request quota.

```ts
const result = await accountSDK.checkAiRequestQuota()
if (!result.allowed) {
  console.log(result.reason) // 'Daily AI request limit reached'
  console.log(`Resets at: ${new Date(result.resetAt)}`)
} else {
  console.log(`Remaining: ${result.remaining}`)
}
```

**`checkAiTokenQuota(estimatedTokens)`**

Check AI token quota.

```ts
const result = await accountSDK.checkAiTokenQuota(1000)
if (!result.allowed) {
  // Quota exceeded
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `estimatedTokens` | `number` | Estimated tokens to consume (optional, default 0) |

**`checkStorageQuota(additionalBytes)`**

Check storage quota.

```ts
const result = await accountSDK.checkStorageQuota(1024 * 1024) // 1MB
if (!result.allowed) {
  console.log('Insufficient storage')
}
```

**`checkPluginQuota()`**

Check plugin installation quota.

```ts
const result = await accountSDK.checkPluginQuota()
if (!result.allowed) {
  console.log('Plugin limit reached')
}
```

**`getUsagePercentage(type)`**

Get usage percentage for specific quota type.

```ts
const aiUsage = await accountSDK.getUsagePercentage('aiRequests')
console.log(`AI usage: ${aiUsage.toFixed(1)}%`)

const storageUsage = await accountSDK.getUsagePercentage('storage')
if (storageUsage > 80) {
  console.warn('Storage running low')
}
```

| Parameter | Type | Values |
|-----------|------|--------|
| `type` | `string` | `'aiRequests'`, `'aiTokens'`, `'storage'`, `'plugins'` |

---

**Feature Access**

**`hasApiAccess()`**

Check if user has API access.

```ts
if (await accountSDK.hasApiAccess()) {
  // Allow API usage
}
```

**`hasCustomModelAccess()`**

Check if user can use custom models.

```ts
if (await accountSDK.hasCustomModelAccess()) {
  // Show custom model options
}
```

**`hasPrioritySupport()`**

Check if user has priority support.

```ts
if (await accountSDK.hasPrioritySupport()) {
  // Show priority support entry
}
```

**`hasAdvancedAnalytics()`**

Check if user has advanced analytics.

```ts
if (await accountSDK.hasAdvancedAnalytics()) {
  // Show analytics dashboard
}
```

**`hasFeature(featureId)`**

Check if specific feature flag is enabled.

```ts
if (await accountSDK.hasFeature('beta-ai-v2')) {
  // Enable beta feature
}
```

---

**Team Management**

**`getTeams()`**

Get all teams user belongs to.

```ts
const teams = await accountSDK.getTeams()
// [
//   { id: 'team_xxx', name: 'Dev Team', role: 'admin', memberCount: 5 },
//   { id: 'team_yyy', name: 'Design', role: 'member', memberCount: 3 }
// ]
```

**`isInTeam()`**

Check if user is in any team.

```ts
if (await accountSDK.isInTeam()) {
  // Show team features
}
```

**`isTeamOwner(teamId?)`**

Check if user is team owner.

```ts
if (await accountSDK.isTeamOwner()) {
  // User owns some team
}

if (await accountSDK.isTeamOwner('team_xxx')) {
  // User owns specific team
}
```

**`isTeamAdmin(teamId?)`**

Check if user is team admin (includes owner).

```ts
if (await accountSDK.isTeamAdmin()) {
  // Show admin features
}
```

---

**Upgrade & Billing**

**`getUpgradeOptions()`**

Get available upgrade options.

```ts
const options = accountSDK.getUpgradeOptions()
// [
//   { plan: 'pro', name: 'Pro', priceMonthly: 9.99, features: [...] },
//   { plan: 'plus', name: 'Plus', priceMonthly: 19.99, recommended: true, ... }
// ]
```

**`getPlanComparison()`**

Get plan comparison table.

```ts
const comparison = accountSDK.getPlanComparison()
// [
//   { feature: 'AI Requests/Day', free: 50, pro: 500, plus: 2000, ... },
//   { feature: 'Custom Models', free: false, pro: true, ... }
// ]
```

**`openUpgradePage(plan?)`**

Open upgrade page.

```ts
await accountSDK.openUpgradePage() // Open upgrade page
await accountSDK.openUpgradePage(SubscriptionPlan.PLUS) // Jump to Plus
```

**`openBillingPage()`**

Open billing management page.

```ts
await accountSDK.openBillingPage()
```

---

**Account Actions**

**`requestLogin()`**

Request user login (opens login dialog).

```ts
const success = await accountSDK.requestLogin()
if (success) {
  // User logged in
}
```

**`logout()`**

Logout current user.

```ts
await accountSDK.logout()
```

**`openAccountSettings()`**

Open account settings page.

```ts
await accountSDK.openAccountSettings()
```

---

## Technical Notes

- Account SDK reads login state, subscription plan, and quota from the unified account service.
- Client-side helpers consolidate permission and quota checks to avoid scattered logic.

## Best Practices

**1. Premium Feature Gating**

```ts
async function showPremiumFeature() {
  if (!await accountSDK.isPaidUser()) {
    // Show upgrade prompt
    const options = accountSDK.getUpgradeOptions()
    showUpgradeDialog(options)
    return
  }
  
  // Show premium feature
}
```

**2. Quota Pre-check**

```ts
async function beforeAiRequest(estimatedTokens: number) {
  const quotaCheck = await accountSDK.checkAiTokenQuota(estimatedTokens)
  
  if (!quotaCheck.allowed) {
    throw new Error(`Quota exceeded: ${quotaCheck.reason}`)
  }
  
  // Proceed with request
}
```

**3. Team Feature Adaptation**

```ts
async function initTeamFeatures() {
  if (!await accountSDK.isTeamOrAbove()) {
    return // Not team tier, skip
  }
  
  const teams = await accountSDK.getTeams()
  
  for (const team of teams) {
    if (team.role === 'owner' || team.role === 'admin') {
      // Show admin features
    }
  }
}
```

---

## Type Definitions

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

## Related Documentation

- [Intelligence API](./intelligence.en.md) - AI capabilities
- [Storage API](./storage.en.md) - Plugin data persistence
- [Plugin Context](./plugin-context.en.md) - Plugin global context
