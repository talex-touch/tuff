---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Nexus 用户数据存储限制 + 同步 + E2EE + OAuth/SSO 方案落地
complexity: complex
planning_method: builtin
created_at: 2026-02-01T00:09:31+08:00
---

# Plan: Nexus 用户数据存储/同步/认证方案落地

🎯 任务概述
在 Nexus 中落地用户数据存储限制、跨设备同步（实时+定时）、端到端加密（E2EE），个人阶段优先 OAuth/OIDC 登录，预留企业阶段的 SSO（OIDC/SAML + SCIM）扩展路径。排除 OCR/文件索引等不参与同步的数据。

📋 执行计划
1. 明确数据范围与策略：列出需要同步的数据类型、排除项与同步策略（实时/定时/不同步），并给出个人阶段的默认配额与限制上限。
2. 设计核心数据模型：定义 items/oplog/blobs/keyrings/users/devices/quotas 等表结构与索引策略，确定本地与服务端的存储职责边界。
3. 设计 E2EE 密钥体系：主密钥、设备密钥、数据密钥层级，密钥恢复与轮换策略，元数据是否明文可用的具体字段清单。
4. 设计同步协议：handshake、push/pull、cursor 机制、LWW 冲突策略、断点续传；定义实时通道（WS）+ 定时对账（PollingService）协同逻辑。
5. 认证方案细化：OAuth/OIDC（PKCE）流程、多账号绑定、设备上限校验；预留企业扩展的 OIDC/SAML/SCIM 接口与配置结构。
6. 配额与限制执行：服务端写入前强制校验、客户端提示与降级（只读/本地保存），定义超限错误码与恢复策略。
7. API 与错误规范：补齐认证、同步、配额、密钥相关接口与错误码，形成对外 API 文档草案与版本控制策略。
8. 客户端集成方案：本地数据库与 oplog 写入链路、加解密流程、同步调度器接入、历史本地数据的迁移策略。
9. 测试与回归：单元测试（加解密/冲突/LWW）、集成测试（多设备同步/断网恢复/限额）、安全测试（密钥丢失/重放）。
10. 观测与发布：日志指标（同步成功率/延迟/冲突率）、灰度开关（同步/实时/E2EE 独立开关）、回滚策略（降级为本地-only）。

## 数据范围与同步策略

### 同步数据类型与策略
| 数据类型 | 示例 | 同步策略 | 备注 |
| --- | --- | --- | --- |
| 账号与订阅元数据 | 用户 profile、订阅计划、配额读数 | 定时拉取 | 服务端权威，客户端不写入 |
| 设备清单与会话信息 | 设备名称、最近活跃、会话元信息 | 实时 | 用于登录态与安全审计 |
| 核心结构化数据 | items/oplog、收藏/快捷动作/流程 | 实时 | 小粒度变更即推送 |
| 用户偏好与设置 | 主题、布局、快捷键、功能开关 | 实时 | 默认合并策略 LWW |
| 插件与扩展配置 | 插件启用状态、插件配置项 | 定时 | 低频变更，避免频繁写入 |
| 使用历史 | 搜索历史、最近使用列表 | 定时 | 保留窗口可配置（默认 30 天） |
| 运行时缓存 | OCR 结果、文件索引、全文索引 | 不同步 | 可重建、体量大，明确排除 |
| 日志与临时数据 | 诊断日志、崩溃转储、临时导出 | 不同步 | 仅本地保留 |

### 默认配额（个人阶段）
- 总容量：1 GB（items + blobs + oplog 汇总）
- 对象数：50,000（items/oplog 逻辑对象）
- 单条大小：5 MB（单对象/单 blob 上限，超出需分片）
- 设备数：3 台（超过需解绑或升级）

## 核心数据模型设计

### 职责边界
- 本地：items/oplog 写入与离线缓存；payload 加密后落盘；blob 本地缓存可清理。
- 服务端：users/devices/quotas 权威；items/oplog/blobs 作为同步源；keyrings 仅保存加密材料与恢复码摘要。

### 表结构草案

#### users
字段：id(uuid, PK)，account_id(string, UNIQUE)，plan(string)，status(string)，created_at(timestamp)
索引/约束：UNIQUE(account_id)

#### devices
字段：id(uuid, PK)，user_id(uuid)，fingerprint(string)，name(string)，platform(string)，last_seen_at(timestamp)，status(string)
索引/约束：UNIQUE(user_id, fingerprint)，INDEX(user_id, last_seen_at)

#### quotas
字段：id(uuid, PK)，user_id(uuid)，storage_limit_bytes(int)，object_limit(int)，item_limit(int)，device_limit(int)，used_storage_bytes(int)，used_objects(int)，used_devices(int)，updated_at(timestamp)
索引/约束：UNIQUE(user_id)

#### items
字段：id(uuid, PK)，user_id(uuid)，device_id(uuid)，type(string)，schema_version(int)，payload_enc(blob_ref)，meta_plain(json)，updated_at(timestamp)，deleted_at(timestamp)
索引/约束：INDEX(user_id, updated_at)，INDEX(user_id, type)

#### oplog
字段：id(uuid, PK)，user_id(uuid)，device_id(uuid)，item_id(uuid)，op_type(string)，op_seq(int)，op_hash(string)，created_at(timestamp)
索引/约束：UNIQUE(user_id, device_id, op_seq)，INDEX(user_id, created_at)

#### blobs
字段：id(uuid, PK)，user_id(uuid)，object_key(string)，sha256(string)，size_bytes(int)，content_type(string)，created_at(timestamp)，status(string)
索引/约束：UNIQUE(user_id, object_key)，INDEX(user_id, sha256)

#### keyrings
字段：id(uuid, PK)，user_id(uuid)，device_id(uuid)，key_type(string)，encrypted_key(blob)，recovery_code_hash(string)，rotated_at(timestamp)，created_at(timestamp)
索引/约束：UNIQUE(user_id, device_id, key_type)，INDEX(user_id, key_type)

## E2EE 密钥体系

### 层级与用途
- 主密钥（MK）：用户级主密钥，本地生成并仅在端内使用；用于包裹设备密钥，不上传明文。
- 设备密钥（DK）：每设备生成，用于包裹数据密钥；随设备解绑/重装可撤销。
- 数据密钥（DEK）：按 item 或 blob 生成，用于实际 payload 加解密；可随版本更新轮换。

### 恢复与轮换
- 恢复码：首次启用生成恢复码，仅存储 hash + salt；用于重装后解锁 MK 并重包 DK。
- 轮换策略：设备异常/丢失时旋转 DK；敏感数据变更时旋转 DEK；MK 轮换需全量重包 DK。

### 明文元数据字段清单（最小化）
- item：id，type，schema_version，device_id，updated_at，deleted_at，op_seq，payload_size
- blob：id，object_key，size_bytes，content_type，sha256
- 同步控制：cursor，op_hash（用于幂等校验）

⚠️ 风险与注意事项
- E2EE 带来密钥丢失不可恢复风险，需要强制恢复码与多设备冗余机制。
- 实时同步与定时对账可能导致重复写入或冲突扩大，需严格 cursor 与幂等控制。
- 配额限制可能造成用户数据写入失败，需清晰 UI 提示与升级引导。
- 未来企业版 SSO/SCIM 需要额外合规与安全评审，需提前预留扩展点。

📎 参考
- docs/engineering/monorepo-standards.md
