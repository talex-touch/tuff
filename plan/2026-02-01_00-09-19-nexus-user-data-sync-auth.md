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

⚠️ 风险与注意事项
- E2EE 带来密钥丢失不可恢复风险，需要强制恢复码与多设备冗余机制。
- 实时同步与定时对账可能导致重复写入或冲突扩大，需严格 cursor 与幂等控制。
- 配额限制可能造成用户数据写入失败，需清晰 UI 提示与升级引导。
- 未来企业版 SSO/SCIM 需要额外合规与安全评审，需提前预留扩展点。

📎 参考
- docs/engineering/monorepo-standards.md
