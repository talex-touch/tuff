# Pilot × Nexus OAuth × CLI 落地文档（测试优先）

> 更新时间：2026-03-08  
> 适用范围：`apps/pilot`、`apps/nexus`、`packages/tuff-intelligence`、`packages/tuff-pilot-cli`（新增）

## 1. 目标

- 先快速展开 Pilot 测试，建立可回归基线。
- Pilot 登录统一接入 Nexus OAuth 登录体系。
- 新增 `tuff-pilot-cli`，通过 Nexus API/Token 完成 CLI 对话闭环。
- 为后续“后端可配置渠道（provider/channel）”预留稳定接口，不破坏当前 Chat-first V1。

## 2. 执行顺序（硬顺序）

1. **T0 测试先行（必须先完成）**
2. **T1 Pilot 接入 Nexus OAuth 登录**
3. **T2 新增 `tuff-pilot-cli`（CLI 对话）**
4. **T3 后端渠道可配置（channel routing）**

## 3. T0：Pilot 测试快速展开

### 3.1 包级单测（`packages/tuff-intelligence`）

- Runtime loop：`onMessage` 循环、`done` 终止、错误分支。
- Decision normalize：raw -> `AgentDecision` 归一。
- Dispatcher/Policy：禁用 capability 不执行、V1 仅 `text.chat` 可用。
- Store：checkpoint 保存/恢复、`fromSeq` 补播查询边界。

### 3.2 服务端集成（`apps/pilot/server`）

- 正常流式完成：`assistant.delta -> assistant.final -> done`。
- 断线暂停：`client_disconnect`。
- 心跳超时：`heartbeat_timeout`。
- `fromSeq` replay：序列完整、去重正确。
- 鉴权失败：`401` 路径稳定。

### 3.3 前端 E2E（`apps/pilot/app`）

- 新建会话、多轮对话、停止、补播恢复。
- 刷新后恢复历史消息与 trace 抽屉一致性。
- 附件上传后消息发送（元数据链路）。

### 3.4 质量门禁（最小）

- `pnpm -C "packages/tuff-intelligence" run lint`
- `pnpm -C "packages/tuff-intelligence" exec tsc --noEmit`
- `pnpm -C "apps/pilot" run lint`
- `pnpm -C "apps/pilot" run typecheck`
- `pnpm -C "apps/pilot" run build`

## 4. T1：Pilot 接入 Nexus OAuth 登录

## 4.1 统一认证策略

- **唯一身份源**：Nexus。
- Pilot 不再依赖 `x-pilot-user-id` 作为主路径（仅 dev fallback）。
- Pilot API 统一接受 Nexus 颁发 token（Bearer）并校验用户身份。

## 4.2 推荐接入路径

- Web 登录：跳转 Nexus `/sign-in`（带 `redirect_url` 回 Pilot）。
- 回调换取 token：复用 Nexus `sign-in-token` 语义。
- Pilot 服务端鉴权：优先 Bearer token，其次（开发期）兼容旧 header/cookie。

## 4.3 Pilot 需要新增/调整

- `GET /api/pilot/auth/login`：生成并跳转 Nexus 登录 URL。
- `GET /api/pilot/auth/callback`：接收回调并保存 Pilot 侧会话 token。
- `POST /api/pilot/auth/logout`：清理 token/cookie。
- `GET /api/pilot/auth/me`：返回当前登录态（供前端渲染）。

## 4.4 前端行为

- 未登录时显示登录态页面（进入 Nexus 登录）。
- 登录后进入 Chat 主界面。
- token 失效自动回到登录态并提示重新登录。

## 5. T2：`tuff-pilot-cli`（CLI 对话）

## 5.1 包结构（新增）

- `packages/tuff-pilot-cli/package.json`
- `packages/tuff-pilot-cli/bin/tuff-pilot.js`
- `packages/tuff-pilot-cli/src/index.ts`

## 5.2 MVP 命令面

- `tuff-pilot login`：通过 Nexus 登录并保存 token。
- `tuff-pilot chat`：进入交互式对话（流式输出）。
- `tuff-pilot send "..."`：单次问答。
- `tuff-pilot sessions`：列出会话。
- `tuff-pilot trace --session <id>`：查看 trace。

## 5.3 CLI 对接 API

- Nexus：登录/token 获取与刷新。
- Pilot：`/api/pilot/chat/sessions*` + `/stream` + `/trace`。

## 5.4 安全与存储

- 优先系统安全存储 token（Keychain/Credential Locker/libsecret）。
- 仅在开发模式允许本地明文 fallback，并明确警告。

## 6. T3：后端渠道可配置（Channel Routing）

## 6.1 目标

- 会话可指定 `channelId`（如 `nexus-default`、`openai-proxy`、`local`）。
- 运行时按 `channelId` 路由到对应 provider 配置。

## 6.2 协议与存储扩展

- `pilot_chat_sessions` 增加 `channel_id`。
- `POST /api/pilot/chat/sessions` 支持 `channelId`。
- `POST /stream` 未传 `channelId` 时默认使用会话绑定值。

## 6.3 实现边界

- 配置来源复用 Nexus Intelligence Provider/Quota/Prompt。
- `packages/tuff-intelligence` 继续 provider-agnostic，不耦合具体供应商实现细节。

## 7. 验收标准（阶段门）

- **Gate A（测试）**：T0 全部通过，且可稳定复跑。
- **Gate B（OAuth）**：Pilot 全链路登录/退出可用，401 处理一致。
- **Gate C（CLI）**：`login/chat/send/sessions/trace` 可用。
- **Gate D（channel）**：会话级 `channelId` 路由生效。

## 8. 非目标（当前阶段不做）

- 不开放写操作 capability（仍保持 Chat-first V1）。
- 不引入新的 UI 模式（Dual Mode 推迟到后续版本）。
- 不做与本任务无关的 SDK 大规模重构。

## 9. 风险与回滚

- OAuth 回调失败：回退到登录页并保留错误码。
- CLI token 失效：统一提示重新 `login`。
- channel 配置异常：回退默认 channel，写入 trace 便于排查。
