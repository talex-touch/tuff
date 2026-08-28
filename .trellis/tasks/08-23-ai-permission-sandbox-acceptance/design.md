# 技术设计

## 1. 边界与事实源

- `TuffIntelligenceSDK` 拥有直接 invoke/stream 的请求级 quota 与 audit commit point。
- outer-governed runtime 拥有外层 quota/audit；内层 SDK 必须跳过，避免双账。
- `IntelligenceAuditLogger` 的 audit row 是 request/usage/cost 的事实源，并在同一 DB transaction 更新 usage stats。
- plugin identity、sdkapi 和 permission 由 main-process runtime context 决定，renderer payload 只能携带待校验数据，不能授予权限。
- tool gateway 只暴露稳定、安全的 call/decision/result 投影；原始异常和输入不跨越日志、模型或 evidence 边界。

## 2. 流式终态提交

`streamFromProvider()` 继续只负责单个 Provider 的事件规范化，不自行写账。外层 `stream()` 拥有唯一请求级 commit point：

1. 在 Provider 选择前记录 request start，并解析 outer-governed/cancel signal。
2. 逐事件捕获最终 trace/provider/model/usage/latency，但不在 delta/usage 事件时提交 audit。
3. primary 在首 delta 前失败时允许 fallback；该失败是未提交尝试，不写 failure audit。
4. 最终 Provider 产生 `end` 时，先以终态事件构造 success audit，再向消费者发布 `end`。
5. fallback 全部耗尽或首 delta 后中断时，写一条稳定、脱敏的 failure audit 后重新抛出原业务错误。
6. signal cancellation、consumer `return()` 和 outer-governed 调用不写内层终态 audit；已在取消前完成终态提交的请求保持 success。

成功 audit 使用最终 Provider 字段；failure audit 只使用安全 error code，并可携带在失败前已由 Provider 明确报告的 usage/model/trace。没有可信字段时保持 zero usage、`unknown` model 和生成的 trace。audit logger 自身失败继续 fail-soft，不替换 Provider 结果。

## 3. 账本一致性

- 聚焦测试先 spy audit logger，证明每个流式请求最多一次 commit。
- DB 级测试使用真实临时数据库，flush 后核对 audit row 与 usage-stats request/token/cost 聚合。
- quota snapshot 必须读取同一聚合结果；fallback 不增加额外 request count，取消不伪造 failure count。

## 4. 工具与权限审计

- 建立共享 stable error projector，将 tool/MCP/native error 映射为固定 code 与安全 message。
- call、confirmation decision、execution result 共用 request/call correlation id；字段只含 tool id、risk、decision、duration、status 和稳定 code。
- renderer plugin Intelligence facade 保留，因为官方插件已有真实调用方。显式维护 plugin-safe event allowlist，并让对应 registrar 对插件使用 verified guard 与 `failClosedForPlugin=true`。
- host-only stats/admin/provider-management 方法继续从 plugin facade 排除；agent/workflow 等更高风险事件按独立权限声明，不随 basic allowlist 自动开放。

## 5. 验收层级

- Unit/contract：synthetic Provider、权限拒绝、sdk mismatch、fallback、取消、redaction canary。
- Controlled integration：typed transport 到 main registrar、真实临时 DB audit/usage/quota。
- Packaged：隔离 profile 的 permission/tool UI 与 secure-store lifecycle。
- Real Provider：用户可见入口调用 Nexus 或 Local/Ollama/Pi；只保存脱敏状态和计数。

## 6. 回滚与风险

- 流式 audit 仅补齐既有非流式语义，不改 Provider 选择或输出事件协议；出现回归可回滚请求级 commit 逻辑和对应测试。
- allowlist 变更可能扩大插件可达面，必须与 registrar fail-closed 同批落地，不能单独开放事件。
- 不新增 DB schema；若现有 audit schema 无法表达取消状态，本批保持“无终态不记普通失败”，不引入半完成迁移。

## 7. 最终辅助证据生产

- Live MCP 由打包后 `app.asar` 内的独立 Electron smoke 入口执行。入口仅在
  `TUFF_MCP_SMOKE=1` 时拉起真实 stdio filesystem server，完成 initialize、
  `tools/list` 与 `read_text_file` canary 往返，并在关闭 client/process、删除隔离
  profile 后输出 bounded boolean evidence。
- Durable orchestrator Privacy 由两层证据共同成立：shipped journal 全链上的真实
  libSQL 测试证明 typed delete、三页 keyset retention、首批提交后取消、幂等、FK
  cascade、0041 原子回滚和 UTF-8 byte accounting；打包后 `app.asar` 内的
  Privacy Electron smoke 证明生产 typed handler/SDK 入口和隔离 profile teardown。
- 一个辅助 acceptance runner 在同一物理 `app.asar` hash 前后执行以上入口与测试，
  只在所有命名 gate 实际通过时生成 `tuff.live-mcp-acceptance.v2` 与
  `tuff.orchestrator-privacy-lifecycle-acceptance.v2`。Live MCP v2 额外绑定实际
  Node/npx-cli 启动器哈希，Privacy v2 明确记录 packaged-app.asar gate 来源；报告
  只含版本、物理 hash、bounded checks 与稳定 failures，verifier 不接受缺失报告、
  启动器身份漂移或任一 false gate。
