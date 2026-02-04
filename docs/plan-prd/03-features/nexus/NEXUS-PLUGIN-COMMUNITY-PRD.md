# NEXUS 插件社区 PRD

> 版本: 1.0.0
> 更新时间: 2026-01-31

## 目标
1. 为插件市场补齐「评分 + 评论」社区闭环。
2. 统一插件社区的基础数据模型与 API 规范，便于后续扩展讨论/问答。
3. 建立可执行的审核流（待审 → 通过/拒绝），保障内容质量与安全。

## 范围（MVP）
- 评分：1~5 星，单用户单插件可更新评分。
- 评论：单用户单插件可更新评论，默认进入审核队列。
- 展示：市场详情页展示评分与评论列表。
- 审核：管理员后台接口拉取待审评论并操作状态。

## 数据模型

### 表: `market_plugin_reviews`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT (PK) | 评论 ID |
| plugin_id | TEXT | 插件 ID |
| user_id | TEXT | 用户 ID |
| author_name | TEXT | 作者显示名（提交时快照） |
| author_avatar | TEXT | 作者头像 URL（提交时快照） |
| rating | INTEGER | 评分（1~5） |
| title | TEXT | 标题（可选） |
| content | TEXT | 评论正文 |
| status | TEXT | pending/approved/rejected |
| created_at | TEXT | 创建时间（ISO） |
| updated_at | TEXT | 更新时间（ISO） |

索引:
- `idx_market_plugin_reviews_plugin_id` (plugin_id)
- `idx_market_plugin_reviews_status` (status)
- `idx_market_plugin_reviews_user_id` (user_id)
- 唯一约束: (plugin_id, user_id)

### 评分汇总
沿用现有 `market_plugin_ratings` 表与 API（评分与评论提交联动更新）。

## API 设计

### 市场端（公开）
1) 获取插件评分汇总  
`GET /api/market/plugins/:slug/rating`

**响应**:
```json
{
  "slug": "example-plugin",
  "rating": { "average": 4.2, "count": 12 }
}
```

2) 获取插件评论列表  
`GET /api/market/plugins/:slug/reviews?limit=20&offset=0`

**响应**:
```json
{
  "slug": "example-plugin",
  "reviews": [
    {
      "id": "rev_xxx",
      "pluginId": "plg_xxx",
      "rating": 5,
      "title": "Works great",
      "content": "Solid plugin for daily workflow.",
      "author": { "name": "Alice", "avatarUrl": "https://..." },
      "status": "approved",
      "createdAt": "2026-01-31T00:00:00.000Z",
      "updatedAt": "2026-01-31T00:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

3) 提交/更新评论  
`POST /api/market/plugins/:slug/reviews`

**请求**:
```json
{
  "rating": 4,
  "title": "Nice update",
  "content": "Adds the missing shortcuts."
}
```

**响应**:
```json
{
  "review": { "...": "..." },
  "rating": { "average": 4.2, "count": 12 }
}
```

### 管理端（审核）
1) 获取待审评论  
`GET /api/admin/market/reviews/pending`

2) 更新评论状态  
`PATCH /api/admin/market/reviews/:id/status`  
请求体: `{ "status": "approved" | "rejected" }`

## 前端结构

### 页面
- `apps/nexus/app/pages/market.vue`  
  - 评分摘要卡片（平均分 + 总评价数）
  - 评论列表（最新优先）
  - 评论提交表单（评分 + 标题 + 内容）

## 审核流
1. 用户提交评论 → 状态 `pending`  
2. 管理员审核  
   - 通过 → `approved`（对外展示）  
   - 拒绝 → `rejected`（仅作者可见）  
3. 用户更新评论 → 重置为 `pending`，重新审核

## 风险与控制
- 内容质量：审核队列 + 管理员接口。
- 水军刷分：单用户单插件限制 + 评分更新覆盖。
- 兼容性：未绑定 D1 时降级存储到 `useStorage()`。

## 关键落点
- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/server/api/market/plugins/[slug]/reviews.*.ts`
- `apps/nexus/server/api/admin/market/reviews/*`
- `apps/nexus/app/pages/market.vue`
- `apps/nexus/app/types/marketplace.ts`
