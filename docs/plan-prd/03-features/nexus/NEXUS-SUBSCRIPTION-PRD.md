# NEXUS 订阅系统 PRD

> 版本: 1.0.0
> 更新时间: 2025-12-13

## 概述

整合 Clerk 组织系统与 Tuff 订阅体系，实现：
1. 会员等级展示（App 端 + Nexus Dashboard）
2. 授权码兑换订阅
3. 团队邀请完善
4. 组织管理 UI 优化

## 订阅计划体系

| 计划 | 代码 | 特点 |
|------|------|------|
| Free | `FREE` | 基础功能，有限额 |
| Pro | `PRO` | 高级功能，更多配额 |
| Plus | `PLUS` | 全部功能，优先支持 |
| Team | `TEAM` | 团队协作，共享配额 |
| Enterprise | `ENTERPRISE` | 定制化，专属支持 |

## Clerk 集成方案

### 用户元数据存储

在 Clerk User 的 `publicMetadata` 中存储订阅信息：

```typescript
interface UserPublicMetadata {
  subscription?: {
    plan: 'FREE' | 'PRO' | 'PLUS' | 'TEAM' | 'ENTERPRISE'
    expiresAt?: string  // ISO 日期
    activatedAt?: string
    activationCode?: string  // 激活码（脱敏）
  }
  quotas?: {
    aiRequests: { used: number; limit: number }
    aiTokens: { used: number; limit: number }
  }
}
```

### 组织元数据

在 Clerk Organization 的 `publicMetadata` 中存储团队订阅：

```typescript
interface OrgPublicMetadata {
  subscription?: {
    plan: 'TEAM' | 'ENTERPRISE'
    seats: number
    expiresAt?: string
  }
}
```

## API 端点设计

### 1. 获取订阅状态

```
GET /api/subscription/status
```

**响应**:
```json
{
  "plan": "PRO",
  "expiresAt": "2026-01-13T00:00:00Z",
  "isActive": true,
  "features": {
    "aiRequests": { "limit": 1000, "used": 50 },
    "customModels": true,
    "prioritySupport": false
  }
}
```

### 2. 激活授权码

```
POST /api/subscription/activate
```

**请求**:
```json
{
  "code": "TUFF-PRO-XXXX-XXXX"
}
```

**响应**:
```json
{
  "success": true,
  "plan": "PRO",
  "expiresAt": "2026-01-13T00:00:00Z"
}
```

### 3. 获取团队订阅

```
GET /api/dashboard/team/subscription
```

### 4. 邀请管理（已实现）

- `GET /api/dashboard/team/invites`
- `POST /api/dashboard/team/invites`
- `DELETE /api/dashboard/team/invites/:id`
- `POST /api/team/join`
- `GET /api/team/invite/:code`

## 授权码系统

### 授权码格式

```
TUFF-{PLAN}-{RANDOM8}-{CHECK4}
```

示例: `TUFF-PRO-A2B3C4D5-X1Y2`

### 数据库表

```sql
CREATE TABLE activation_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE activation_logs (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  plan TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

## UI 设计

### Dashboard Team 页面增强

1. **会员等级卡片**
   - 当前计划名称和图标
   - 到期时间
   - 升级按钮

2. **激活码输入**
   - 输入框 + 激活按钮
   - 实时验证
   - 成功/失败提示

3. **团队管理**
   - 成员列表（已有）
   - 邀请列表 + 撤销功能
   - 创建邀请弹窗
   - 邀请链接复制

4. **配额使用**
   - AI 请求使用进度条
   - Token 使用量
   - 重置周期

### App 端会员展示

1. **设置页 - 账户信息**
   - 会员等级徽章
   - 到期提醒
   - 配额使用

2. **CoreBox 头像下拉**
   - 快速查看会员状态

## 实现计划

### Phase 1: 基础订阅 API (当前)
- [x] 团队邀请 API
- [ ] 订阅状态 API
- [ ] 激活码系统
- [ ] Clerk 元数据更新

### Phase 2: Dashboard UI
- [ ] 订阅状态卡片
- [ ] 激活码输入
- [ ] 团队邀请 UI 完善

### Phase 3: App 端集成
- [ ] AccountSDK 完善
- [ ] 设置页会员展示
- [ ] 配额检查 Hook

## 相关文件

- `apps/nexus/server/api/subscription/` - 订阅 API
- `apps/nexus/server/utils/subscriptionStore.ts` - 订阅存储
- `apps/nexus/app/pages/dashboard/team.vue` - 团队页面
- `packages/utils/account/` - AccountSDK
