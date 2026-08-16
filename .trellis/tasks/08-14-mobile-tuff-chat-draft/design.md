# Mobile 跨设备会话应用设计

## 决策

采用 `apps/mobile` + Expo managed + React Native。Nexus 作为身份、Mobile BFF 和共享会话数据的唯一云端边界；Tuff Intelligence 的 Provider 调用保留在受控服务端。首版不从 Electron 直连，也不复用 Vue UI 运行时。

## 方案比较

| 路线 | 结论 | 原因 |
| --- | --- | --- |
| Expo managed | MVP 采用 | 覆盖网络、深链、图片选择、系统安全存储和双端构建，最快验证产品闭环。 |
| Expo prebuild + development build | 条件升级 | 仅在需要 Expo config plugin 无法覆盖的原生 SDK、推送深度定制或原生性能模块时采用。仍保留 Expo 工具链。 |
| React Native CLI | 不采用 | 需要长期维护原生工程；当前聊天 MVP 没有对应收益。 |

## 边界与职责

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| `apps/mobile` | 原生跨设备 UI、设备授权启动与轮询、SecureStore token、HTTP/SSE client、缓存和乐观状态 | Provider 密钥、模型路由决策、桌面 IPC、插件执行 |
| Nexus Mobile BFF | bearer app-token 验证、用户范围、模型清单、会话 CRUD、SSE 转发、取消、审计与限流 | 向客户端泄漏 Provider 配置或密钥 |
| Tuff Intelligence service | `text.chat` 路由、Provider 执行、标准流事件、用量与错误语义 | 移动平台细节、设备令牌存储 |
| Conversation store | 按 Nexus `userId` 保存会话、消息、版本和删除墓碑 | 设备私钥与不经服务端授权的读写 |
| CoreApp 首版 adapter | 消费同一会话 API，实现桌面和移动跨端显示 | 直接读取移动本地缓存 |

## 登录与安全

1. App 首次启动生成稳定 `deviceId`，调用 `/api/app-auth/device/start`，`clientType: "app"`。
2. App 使用系统浏览器打开返回的 `authorizeUrl`；用户在 Nexus 完成登录和设备确认。
3. App 以服务端给出的间隔轮询 `/api/app-auth/device/poll`。拒绝、过期、浏览器关闭、限流均显示可重试的明确状态。
4. 成功后将 `appToken` 仅写入 Expo SecureStore。令牌过期、撤销或 API 返回 401 时删除本地令牌并返回登录页。
5. Nexus BFF 接受现有 app token，按其 `userId` 实行强制数据隔离。Mobile 不使用 OAuth confidential-client 流程，不能内嵌 `client_secret`。

## 流式协议

Mobile BFF 定义版本化 HTTP 契约，语义映射现有 `IntelligenceChatPayload` 与 `IntelligenceStreamEvent`：

- `GET /api/mobile/v1/models`：返回当前用户可用的脱敏 Provider/模型选项。
- `GET /api/mobile/v1/conversations`、`POST /api/mobile/v1/conversations`、`GET|PATCH|DELETE /api/mobile/v1/conversations/:id`：版本化会话读写。
- `POST /api/mobile/v1/conversations/:id/messages`：验证用户、持久化用户消息，返回 `text/event-stream`。
- SSE 事件至少包含 `start`、`delta`、`part`、`usage`、`end` 和结构化 `error`；保留 provider/model 元数据。
- `POST /api/mobile/v1/turns/:id/cancel`：幂等取消。网络断连不是取消，服务端在有限窗口内允许 Mobile 重连同一 turn。

MVP 只渲染文本、图片附件和标准错误；推理块、工具卡与其他结构化 `part` 事件保持协议兼容但不开放功能入口。

## 数据与同步

- 服务端会话 SoT 的稳定主键是 `userId + conversationId`。消息使用不可变 `messageId`、递增 `sequence` 和 `updatedAt`；客户端缓存只读副本与待发送草稿。
- 首版写冲突按服务端 sequence 拒绝过期更新，客户端重新拉取并提示。不能使用无版本的 last-write-wins 覆盖整段历史。
- 离线时允许查看已同步的缓存与编辑未发送草稿；不允许离线排队执行 Provider 请求或伪造已发送消息。
- 首版发布门槛：CoreApp 必须接入同一 Conversation API，并以移动端到桌面端的端到端测试证明同账号历史一致；旧桌面本地历史必须有迁移策略或明确隔离说明。

## MVP 屏幕与状态

1. 启动：SecureStore token 校验、加载缓存或进入授权。
2. 设备授权：等待、浏览器返回、已批准、拒绝、过期、网络失败、取消。
3. 会话列表：最近会话、新建、加载、空态、离线缓存态。
4. 对话：消息流、附件预览、模型菜单、发送、停止、流式中、失败重试、网络中断。
5. 账户：当前用户、设备会话退出和缓存清除。

## 目录建议

```text
apps/mobile/
  app/                 Expo Router screens
  src/api/             Mobile BFF client and SSE decoder
  src/auth/            device authorization and SecureStore token vault
  src/conversations/   models, repository, cache and screen hooks
  src/components/      React Native Mobile primitives
  src/theme/           shared visual tokens and native theme mapping
  src/platform/        image picker, linking and device metadata adapters
  src/test/            focused unit and integration tests
```

可共享：`@talex-touch/utils` 中不依赖 Electron/DOM/Node 的 Intelligence 类型和纯工具。不得直接依赖：`@talex-touch/tuffex`、`@talex-touch/intelligence-uikit`、`@talex-touch/tuff-native`、`@talex-touch/tuff-intelligence` 的运行时入口。

## 升级门槛与风险

- 进入 Expo prebuild：有经过验证的、Expo managed 无法满足的原生 SDK/能力，且必须列出 iOS/Android 配置、维护 owner 和 CI 验证。
- 推送通知不在 MVP；它需要每设备 token、通知偏好、服务端投递和隐私策略，单独设计。
- 图片输入只允许受限大小/类型、经 BFF 处理并记录权限语义；不在聊天 URL 中传输 base64 大对象。
- SSE 在移动后台会被系统暂停，前台恢复必须通过会话/turn 查询恢复最终状态，不能依赖永不丢失的持久连接。
- 必须先实现 Conversation SoT 与 CoreApp 接入，再发布移动端聊天功能；否则产品会形成同账号却无法同步的错误承诺。
