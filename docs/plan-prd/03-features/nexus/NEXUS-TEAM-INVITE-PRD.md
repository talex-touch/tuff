# Nexus Team Invite Feature PRD

## 概述

将当前 "Join teams waitlist" 占位符替换为功能完整的团队邀请系统。

---

## 当前状态

Team preview 页面显示：
- "Join teams waitlist" 链接（占位符）
- "Roadmap updates and invite controls will surface here during the preview"

## 目标状态

功能完整的团队管理：
1. **团队邀请生成** - 创建可分享的邀请链接
2. **邀请码输入** - 通过邀请码加入团队
3. **成员管理** - 查看和管理团队成员

---

## UI 设计

### 移除
- "Join teams waitlist" 链接
- 关于 roadmap updates 的占位文本

### 新增

#### 团队所有者/管理员视图

```
┌─────────────────────────────────────────────────┐
│ 团队管理                                         │
├─────────────────────────────────────────────────┤
│                                                  │
│  邀请成员                                        │
│  ┌───────────────────────────────────┐          │
│  │ https://tuff.tagzxia.com/join/abc │ [复制]   │
│  └───────────────────────────────────┘          │
│  [生成新链接]  有效期: 7 天                      │
│                                                  │
│  ─────────────────────────────────────          │
│                                                  │
│  成员 (3/5 席位)                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 👤 TalexDreamSoul (所有者)   [活跃]     │   │
│  │ 👤 Member1          [活跃]    [移除]    │   │
│  │ 👤 Member2          [待确认]  [撤销]    │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘
```

#### 非团队用户视图

```
┌─────────────────────────────────────────────────┐
│ 加入团队                                         │
├─────────────────────────────────────────────────┤
│                                                  │
│  有邀请码？                                      │
│  ┌────────────────────────────┐                 │
│  │ 输入邀请码...              │  [加入团队]    │
│  └────────────────────────────┘                 │
│                                                  │
│  或者创建自己的团队                              │
│  [创建团队] (需要 Pro+ 订阅)                    │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## API 设计

### 数据库模型

```sql
-- team_invites 表
CREATE TABLE team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code VARCHAR(32) UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP,
  max_uses INT DEFAULT NULL,
  uses INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP DEFAULT NULL
);

-- team_members 表 (如果不存在)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
  status VARCHAR(20) DEFAULT 'active', -- active, pending, removed
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
```

### API Endpoints

```typescript
// ========== 邀请管理 ==========

// 生成邀请链接
POST /api/teams/:teamId/invites
Headers: { Authorization: Bearer <token> }
Request: { 
  expiresIn?: '1d' | '7d' | '30d' | 'never',
  maxUses?: number 
}
Response: { 
  code: string,
  url: string,
  expiresAt: string | null,
  maxUses: number | null
}

// 获取团队的所有邀请
GET /api/teams/:teamId/invites
Headers: { Authorization: Bearer <token> }
Response: { 
  invites: Array<{
    code: string,
    url: string,
    expiresAt: string | null,
    uses: number,
    maxUses: number | null,
    createdBy: { id: string, name: string },
    createdAt: string
  }>
}

// 撤销邀请
DELETE /api/teams/:teamId/invites/:code
Headers: { Authorization: Bearer <token> }
Response: { success: boolean }

// ========== 加入团队 ==========

// 通过邀请码加入
POST /api/teams/join
Headers: { Authorization: Bearer <token> }
Request: { code: string }
Response: { 
  teamId: string,
  teamName: string,
  role: string
}

// 验证邀请码（预览，不加入）
GET /api/teams/invites/:code/preview
Response: {
  valid: boolean,
  teamName?: string,
  teamDescription?: string,
  memberCount?: number,
  error?: string
}

// ========== 成员管理 ==========

// 获取团队成员列表
GET /api/teams/:teamId/members
Headers: { Authorization: Bearer <token> }
Response: { 
  members: Array<{
    id: string,
    userId: string,
    name: string,
    email: string,
    role: 'owner' | 'admin' | 'member',
    status: 'active' | 'pending',
    joinedAt: string
  }>,
  seats: { used: number, total: number }
}

// 移除成员
DELETE /api/teams/:teamId/members/:userId
Headers: { Authorization: Bearer <token> }
Response: { success: boolean }

// 更新成员角色
PATCH /api/teams/:teamId/members/:userId
Headers: { Authorization: Bearer <token> }
Request: { role: 'admin' | 'member' }
Response: { success: boolean }

// ========== 团队管理 ==========

// 创建团队
POST /api/teams
Headers: { Authorization: Bearer <token> }
Request: { name: string, description?: string }
Response: { 
  teamId: string,
  teamName: string
}

// 获取用户的团队
GET /api/user/teams
Headers: { Authorization: Bearer <token> }
Response: {
  teams: Array<{
    id: string,
    name: string,
    role: string,
    memberCount: number
  }>
}
```

---

## 前端实现

### 新增组件

```
apps/nexus/app/components/team/
├── TeamInviteCard.vue      # 邀请链接卡片
├── TeamInviteInput.vue     # 邀请码输入
├── TeamMemberList.vue      # 成员列表
├── TeamMemberItem.vue      # 单个成员项
└── TeamCreateDialog.vue    # 创建团队弹窗
```

### 页面修改

**`app/pages/dashboard/team.vue`**

```vue
<script setup lang="ts">
const { data: teamData } = await useFetch('/api/user/teams')
const hasTeam = computed(() => teamData.value?.teams?.length > 0)
</script>

<template>
  <div class="team-page">
    <!-- 有团队：显示管理界面 -->
    <template v-if="hasTeam">
      <TeamManagement :team="currentTeam" />
    </template>
    
    <!-- 无团队：显示加入/创建 -->
    <template v-else>
      <TeamJoinOrCreate />
    </template>
  </div>
</template>
```

### AccountSDK 集成

```typescript
// packages/utils/account/team.ts
export interface TeamSDK {
  // 获取当前用户的团队
  getTeams(): Promise<Team[]>
  
  // 检查是否有团队
  hasTeam(): Promise<boolean>
  
  // 获取团队成员
  getTeamMembers(teamId: string): Promise<TeamMember[]>
  
  // 生成邀请
  createInvite(teamId: string, options?: InviteOptions): Promise<Invite>
  
  // 通过邀请码加入
  joinTeam(code: string): Promise<Team>
  
  // 离开团队
  leaveTeam(teamId: string): Promise<void>
}
```

---

## 权限控制

| 操作 | Owner | Admin | Member |
|------|-------|-------|--------|
| 生成邀请链接 | ✅ | ✅ | ❌ |
| 撤销邀请 | ✅ | ✅ | ❌ |
| 查看成员 | ✅ | ✅ | ✅ |
| 移除成员 | ✅ | ✅ | ❌ |
| 更改角色 | ✅ | ❌ | ❌ |
| 解散团队 | ✅ | ❌ | ❌ |

---

## 邀请链接格式

```
https://tuff.tagzxia.com/join/{code}

示例: https://tuff.tagzxia.com/join/abc123xyz
```

邀请码规则：
- 长度：8-12 字符
- 字符集：`a-zA-Z0-9`
- 不区分大小写匹配

---

## 错误处理

| 错误码 | 说明 | 用户提示 |
|--------|------|----------|
| `INVITE_EXPIRED` | 邀请已过期 | "此邀请链接已过期" |
| `INVITE_REVOKED` | 邀请已撤销 | "此邀请链接已失效" |
| `INVITE_MAX_USES` | 达到使用上限 | "此邀请链接已达到使用次数上限" |
| `TEAM_FULL` | 团队席位已满 | "该团队已满员，无法加入" |
| `ALREADY_MEMBER` | 已是成员 | "您已是该团队成员" |
| `NOT_AUTHORIZED` | 无权限 | "您没有执行此操作的权限" |

---

## 优先级

**高** - Team 计划核心功能

## 时间估算

- 后端 API: ~3 天
- 数据库迁移: ~0.5 天
- 前端组件: ~2 天
- 测试: ~1 天

**总计: ~6.5 天**
