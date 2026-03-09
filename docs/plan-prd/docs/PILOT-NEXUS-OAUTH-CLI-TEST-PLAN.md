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
- Pilot 不再依赖 `x-pilot-user-id` / `x-user-id` / `Bearer` 直通等 legacy 路径。
- Pilot API 鉴权统一为 `pilot_auth_session`（登录用户）或设备访客 ID（未登录）。

## 4.2 推荐接入路径

- Web 登录：`/auth/login` 页面手动触发 `/auth/authorize`，再跳转 Nexus `/api/pilot/oauth/authorize`。
- 回调换取身份：`/auth/callback` 使用 `code + state` 调用 Nexus `/api/pilot/oauth/token`。
- Pilot 服务端鉴权：仅使用会话 cookie（登录）或设备访客身份（未登录）。

## 4.3 Pilot 需要新增/调整

- `GET /auth/login`：展示“授权并登录 Nexus / 继续访客使用”页面。
- `GET /auth/authorize`：生成 OAuth state 并重定向到 Nexus 授权端点。
- `GET /auth/callback`：接收 `code + state`，服务端换取用户身份并写入 `pilot_auth_session`。

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

## 10. 当前落地口径（2026-03-09）

- Pilot/Nexus bridge legacy 已下线：
  - `GET/POST /api/pilot/auth/bridge-*` 不再提供。
  - Pilot 回调只接受 `code + state`，不再接受 `ticket`。
- Pilot Web / CLI 统一使用 OAuth 客户端（`client_id + client_secret`）调用 `POST /api/pilot/oauth/token`。

## 11. API 调用示例（CLI 适配）

### 11.1 创建 OAuth 客户端（team admin / nexus admin）

```bash
curl -X POST "http://127.0.0.1:3200/api/dashboard/oauth/clients" \
  -H "content-type: application/json" \
  -H "cookie: <nexus_session_cookie>" \
  --data '{
    "scope": "team",
    "name": "pilot-cli-local",
    "redirectUris": ["http://127.0.0.1:14565/callback"]
  }'
```

### 11.2 浏览器授权（CLI 打开该 URL）

```text
GET /api/pilot/oauth/authorize
  ?response_type=code
  &client_id=<client_id>
  &redirect_uri=http%3A%2F%2F127.0.0.1%3A14565%2Fcallback
  &state=<opaque_state>
```

### 11.3 CLI 本地回调拿到 code 后换 token

```bash
curl -X POST "http://127.0.0.1:3200/api/pilot/oauth/token" \
  -H "content-type: application/json" \
  --data '{
    "grant_type": "authorization_code",
    "client_id": "<client_id>",
    "client_secret": "<client_secret>",
    "code": "<code>",
    "redirect_uri": "http://127.0.0.1:14565/callback"
  }'
```

## 12. Pilot 本地回调地址配置（Web）

1. 本地启动 Pilot：`pnpm -C "apps/pilot" run dev`（默认从 `3200` 起找可用端口）。
2. 本地启动 Nexus：`pnpm -C "apps/nexus" run dev`（本地 `3200`）。
3. Pilot 本地环境建议：
   - `NUXT_PUBLIC_NEXUS_ORIGIN=http://127.0.0.1:3200`
   - `PILOT_NEXUS_INTERNAL_ORIGIN=http://127.0.0.1:3200`
   - `PILOT_NEXUS_OAUTH_CLIENT_ID=<dashboard 创建后获得>`
   - `PILOT_NEXUS_OAUTH_CLIENT_SECRET=<dashboard 创建后获得>`
4. 回调地址不再走 allowlist，直接在 Nexus OAuth 应用的 `redirectUris` 中注册：
   - `http://127.0.0.1:3200/auth/callback`
   - `http://localhost:3200/auth/callback`
   - `http://127.0.0.1:3201/auth/callback`
   - `http://localhost:3201/auth/callback`

> 如果你固定要求 Pilot 本地端口是 3200，请确保 3200 未被占用，或在启动前设置 `PILOT_DEV_PORT=3200`。
