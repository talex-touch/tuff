# 需求抽取模板（Requirement Extraction Template）

> 目标：用统一字段与编号规则，把分散的需求抽取为可追踪、可执行、可验收的结构化清单。
> 适用范围：talex-touch monorepo（含 apps/core-app）。

## 字段清单（必须包含）

| 字段 | 说明 | 示例 | 必填 |
| --- | --- | --- | --- |
| id | 需求唯一标识，稳定不重命名 | REQ-020 | 是 |
| title | 一句话标题（可会议讨论） | 统一需求抽取模板 | 是 |
| description | 1-2 句说明做什么，避免实现细节 | 定义统一字段与编号规则 | 是 |
| priority | 优先级（P0/P1/P2） | P0 | 是 |
| scope/area | 范围（backend/frontend/both/其他） | both | 是 |
| platform_diff | 平台差异（macOS/Windows/Linux/All） | All | 否 |
| dependencies | 前置依赖（id 或说明） | REQ-010 | 否 |
| acceptance_criteria | 可验证的验收口径（可测试） | 模板字段完整且编号规则明确 | 是 |
| source_links | 来源链接，必须 path:line，多条用 ; 分隔 | plan/xxx.md:17;docs/xxx.md:42 | 是 |
| current_status | 当前状态（开发/评审/回归/提交） | dev=进行中, git=未提交 | 是 |
| owner | 负责人 | 张三 | 否 |
| notes | 备注/风险/验证限制 | validation_limited:... | 否 |

## 编号规则与插入策略

1. 格式：`<PREFIX>-NNN`，NNN 为 3 位数字，10 递增（例如 REQ-010、REQ-020）。  
2. 插入：在不重排已有编号的前提下插入，优先使用中间号（例如 015、018）。  
3. 子项：需要拆分时使用小数后缀（例如 REQ-020.1），避免影响已有编号。  
4. 稳定性：编号一旦分配不可复用或重命名，历史引用必须可追溯。  

## 状态口径（建议枚举）

- 开发：未开始 / 进行中 / 已完成  
- Review（初次与回归）：未开始 / 进行中 / 已完成  
- Git：未提交 / 已提交  

## 维护说明

- 新增字段需在本模板更新，并同步到 CSV/表格的表头或映射说明。
- 任何需求抽取必须附来源路径（`path:line`），确保可审计。
