# Mobile 跨设备会话应用实施计划

## 前置门槛

- 用户确认本草案的 MVP 范围和服务端会话 SoT 优先级。
- 在 `task.py start` 前，补充 `implement.jsonl` 与 `check.jsonl` 的真实研究/规格条目。
- 为 `apps/mobile` 读取并落实前端与 Nexus 服务端的 Trellis 规格。

## 实施顺序

1. 建立共享协议边界
   - 从现有 Intelligence 类型中抽取或确认无 Node 依赖的移动协议入口。
   - 版本化 Mobile BFF DTO，保留流事件的标准类型和错误码。
   - 禁止 Mobile 导入 Electron、Vue UI 或 Provider 配置运行时。

2. 建立 Nexus 会话与 Mobile BFF
   - 设计 D1 schema/migration：conversation、message、turn、tombstone 和版本号。
   - 实现 bearer app-token auth、用户隔离、会话 CRUD、模型清单、SSE chat、取消和 turn 恢复。
   - 对请求大小、图片类型、消息长度、并发 turn 和速率限制执行服务端校验。
   - 为身份隔离、流事件顺序、取消和拒绝凭证访问添加聚焦 API 测试。

3. 建立 Expo App 骨架
   - 添加 `apps/mobile` workspace 包、Expo 配置、TypeScript、独立 ESLint 与测试脚本。
   - 建立主题 token、导航、错误边界、网络层和平台适配层。
   - 不生成 `ios/`、`android/` 目录；不在根 catalog 引入与现有 Web 工具链耦合的依赖。

4. 接入设备授权与安全存储
   - 使用系统浏览器和现有 device authorization API。
   - SecureStore 管理 app token，完成启动恢复、401 退出、拒绝/过期/取消状态。
   - 覆盖 token 不写日志、轮询结束清理和设备标识稳定性。

5. 完成会话 MVP
   - 会话列表、新建、消息缓存、文本与图片输入、模型选择、SSE decoder、停止与失败重试。
   - 后台/前台切换时查询服务端 turn 状态，而非假定 SSE 仍连接。
   - 只实现 `text.chat`；结构化 part 事件只做协议兼容和安全降级。

6. 接入桌面共享历史，作为首版发布门槛
   - CoreApp 通过服务端 Conversation API 读写同一用户的会话。
   - 处理本地旧历史迁移策略或明确隔离策略；Mobile 与 CoreApp 的同账号消息顺序、取消后最终状态和用户隔离均须通过端到端集成测试。
   - 未完成本步骤不得发布 Mobile 聊天能力。

7. 发布准备
   - 真机验证 iOS 与 Android：授权、token 恢复、会话、取消、网络恢复、图片权限和退出。
   - 配置 EAS 或项目最终选定的签名/分发方案，并单独评审推送、分析和隐私声明。

## 验证策略

- 协议：移动 SSE fixture 测试覆盖 `start`、`delta`、`part`、`usage`、`end`、`error`、断连和乱序拒绝。
- Nexus：现有 Nuxt API 测试风格下覆盖 app-token 用户隔离、会话 version 冲突、取消幂等和模型脱敏。
- 移动：单元测试覆盖 device auth 状态机、token vault、缓存 repository；在模拟器和真机做关键流人工验证。
- 集成：同账号在移动和 CoreApp 显示一致的服务端会话顺序，且 Provider 密钥不出现在任一移动 API 响应、日志或本地缓存。

## 高风险点与回退

| 风险 | 控制 | 回退 |
| --- | --- | --- |
| BFF 直接暴露 Provider 密钥 | BFF 仅下发模型 display metadata；审计响应和日志 | 关闭 mobile chat route，令 App 仅显示维护状态 |
| 手机后台导致 SSE 中断 | turn 持久化与恢复查询 | 回到会话列表并拉取最终消息状态 |
| 首版承诺跨端同步却缺少 SoT 或 CoreApp adapter | 将 Conversation SoT 与 CoreApp 接入列为发布门槛，并做端到端测试 | 不发布 Mobile 聊天能力；不得降级为独立历史后宣传同步 |
| 原生需求过早扩大 | managed-only 门槛与 prebuild ADR | 继续 managed，隔离特定功能到后续版本 |

## 非目标

不在本任务中安装 Expo、创建移动包、配置 Apple/Google 开发者账号、部署 Nexus、迁移桌面历史或发布 App Store/Google Play。
