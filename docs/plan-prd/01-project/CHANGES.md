# 变更日志

> 记录项目的重大变更和改进

## 2026-02-22

### Nexus 多层水印与风险验证

**变更类型**: 安全与溯源 / 前端体验

**描述**: Nexus 全站引入隐写水印与结构指纹，Dashboard 追加明水印；水印异常或服务端风险信号触发 Turnstile 强制验证，提升溯源与防绕过能力。

**主要变更**:
1. **隐写水印**：全站覆盖的噪声纹理水印，肉眼不可见且支持拍照/着色场景的服务端检测。
2. **结构指纹**：通过 CSS 变量对导航、文档侧边栏、目录与 Footer 做轻微扰动，增强溯源。
3. **明水印**：仅 Dashboard layout 显示可见水印，其他页面保持纯净展示。
4. **风险阻断**：新增 Turnstile 验证弹窗，接收 428 风险码或检测到篡改即强制验证。
5. **防删监测**：水印 DOM 被移除/隐藏时自动恢复并触发风险上报。

**修改文件**:
- `apps/nexus/app/app.vue`
- `apps/nexus/app/layouts/dashboard.vue`
- `apps/nexus/app/components/TheHeader.vue`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/components/DocsOutline.vue`
- `apps/nexus/app/components/TuffFooter.vue`
- `apps/nexus/app/components/watermark/InvisibleWatermark.vue`
- `apps/nexus/app/components/watermark/VisibleWatermark.vue`
- `apps/nexus/app/components/watermark/WatermarkRiskModal.vue`
- `apps/nexus/app/composables/useWatermarkToken.ts`
- `apps/nexus/app/composables/useWatermarkFingerprint.ts`
- `apps/nexus/app/composables/useWatermarkRisk.ts`
- `apps/nexus/app/composables/useWatermarkGuard.ts`
- `apps/nexus/app/composables/useTurnstileWidget.ts`
- `apps/nexus/app/plugins/watermark-risk.client.ts`
- `apps/nexus/app/utils/watermark.ts`
- `apps/nexus/server/api/watermark/issue.post.ts`
- `apps/nexus/server/api/watermark/turnstile/verify.post.ts`
- `apps/nexus/server/utils/watermarkToken.ts`
- `apps/nexus/server/utils/turnstile.ts`
- `apps/nexus/server/utils/watermarkGuard.ts`
- `apps/nexus/server/middleware/watermark-guard.ts`
- `apps/nexus/server/utils/watermarkDecode.ts`
- `apps/nexus/server/utils/watermarkStore.ts`
- `apps/nexus/server/api/watermark/resolve.post.ts`
- `apps/nexus/app/composables/useWatermarkDecode.ts`
- `apps/nexus/nuxt.config.ts`

### Nexus 水印溯源解码增强与测试入口

**变更类型**: 安全与溯源 / 管理工具

**描述**: 补强水印多频段解码与旋转/缩放容错，新增 Dashboard 水印溯源入口用于上传截图快速追溯用户与设备。

**主要变更**:
1. **多频段解码**：引入三频段噪声配置与派生种子，提升压缩图与拍照场景命中率。
2. **容错检测**：增加小角度旋转/缩放容错扫描，降低拍照倾斜对相关性计算的影响。
3. **测试入口**：Dashboard 增加水印解析页面，展示置信度与溯源信息。
4. **溯源留存**：水印种子记录保留 7 天，避免截图延迟解析导致错配。
5. **开发环境放开解析**：Resolve API 在非生产环境放开为登录用户可用，便于联调与验证。
6. **水印信号增强**：移除混合模式与模糊处理、提升噪声幅度与整体透明度，提升截图/拍照可检测性。
7. **块状噪声编码**：水印噪声改为块状低频编码，提升压缩/缩放场景相关性，减少重采样带来的相位漂移。
8. **二维码溯源**：新增固定追踪码二维码平铺水印，支持截图直接解码追溯用户与设备。

**修改文件**:
- `apps/nexus/shared/watermark/config.ts`
- `apps/nexus/app/utils/watermark-config.ts`
- `apps/nexus/app/utils/watermark.ts`
- `apps/nexus/app/composables/useWatermarkTrackingCode.ts`
- `apps/nexus/app/components/watermark/VisibleWatermark.vue`
- `apps/nexus/server/utils/watermarkTrackingStore.ts`
- `apps/nexus/server/utils/watermarkQr.ts`
- `apps/nexus/server/api/watermark/tracking.post.ts`
- `apps/nexus/package.json`
- `apps/nexus/app/components/watermark/InvisibleWatermark.vue`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/pages/dashboard/watermark.vue`
- `apps/nexus/app/composables/useWatermarkDecode.ts`
- `apps/nexus/server/utils/watermarkDecode.ts`
- `apps/nexus/server/api/watermark/resolve.post.ts`
- `apps/nexus/server/utils/watermarkStore.ts`
- `apps/nexus/server/api/watermark/issue.post.ts`
- `apps/nexus/app/utils/role.ts`

### 设置页高级选项收起开关

**变更类型**: 体验优化 / 设置

**描述**: 在“应用程序规范”中新增高级设置开关，默认关闭；启用后才显示后台索引策略、应用索引调度与下载设置，减少设置页噪音。

**主要变更**:
1. **新增开关**：高级设置开关落地到 appSetting 并持久化。
2. **按需展示**：下载设置与索引策略/调度分组仅在开关启用后显示。

**修改文件**:
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app 认证/凭证/同步触发收敛到主进程

**变更类型**: 架构调整 / 安全与一致性

**描述**: 登录、凭证、设备标识与同步触发统一由主进程持有与执行，渲染进程仅发送意图请求并监听状态，避免 token/设备信息停留在 renderer 导致的存储与同步冲突。

**主要变更**:
1. **AuthModule**：新增主进程 AuthModule，token 使用 safeStorage 持久化，device profile 写入 appSetting，并统一 `/api/v1/auth/*` 请求与状态广播。
2. **回调收敛**：登录与 step-up 回调由 addon-opener 直接交给主进程处理，token 变化联动同步启停。
3. **渲染端降级为代理**：`useAuth`/`account-channel` 仅保留 IPC、legacy 迁移与 fingerprint hash 计算。
4. **Nexus 请求统一**：渲染端发起的认证请求改为 `auth:nexus-request` 由主进程代理。
5. **Legacy 兼容移除**：移除 renderer 侧 auth/device 的 localStorage 迁移逻辑。
6. **Widget 沙箱收敛**：widget 执行强制依赖沙箱上下文，不再回退到 window.localStorage/sessionStorage。

**修改文件**:
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/addon-opener.ts`
- `apps/core-app/src/main/modules/sync/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/index.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/modules/auth/account-channel.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-env.ts`
- `apps/core-app/src/renderer/src/modules/auth/device-attest.ts`
- `apps/core-app/src/renderer/src/modules/market/auth-token-service.ts`
- `apps/core-app/src/renderer/src/modules/market/nexus-auth-client.ts`

### Core-app 同步迁移到主进程

**变更类型**: 架构调整 / 数据一致性

**描述**: 同步拉取/推送与冲突处理由主进程统一接管，渲染进程仅触发指令与展示状态，确保落盘与冲突裁决在主进程完成，避免同步数据停留在 renderer 内存导致重启回滚。

**主要变更**:
1. **同步主流程迁移**：新增主进程同步模块，使用 CloudSyncSDK 进行拉取/推送与冲突处理。
2. **存储统一裁决**：拉取结果直接写入主进程存储并落盘，必要时合并本地脏数据后回推。
3. **渲染端降级为代理**：renderer 仅发送 start/stop/trigger 指令，状态从主进程存储同步。

**修改文件**:
- `apps/core-app/src/main/modules/sync/index.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/renderer/src/modules/sync/auto-sync-manager.ts`

### Tuffex Anchor reference class 透传

**变更类型**: 体验修复 / 组件

**描述**: BaseAnchor reference 容器新增 `referenceClass` 透传，Popover / DropdownMenu 可通过 class 调整 reference 容器布局（例如全宽）。

**主要变更**:
1. **Reference class**：`TxBaseAnchor` 新增 `referenceClass` 并支持 `is-full-width`。
2. **透传链路**：`TxPopover`/`TxDropdownMenu` 新增 `referenceClass`，`referenceFullWidth` 同步影响 Anchor reference。

**修改文件**:
- `packages/tuffex/packages/components/src/base-anchor/src/types.ts`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/popover/src/types.ts`
- `packages/tuffex/packages/components/src/popover/src/TxPopover.vue`
- `packages/tuffex/packages/components/src/dropdown-menu/src/types.ts`
- `packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue`

### Nexus Header 用户菜单语言子菜单宽度修复

**变更类型**: 体验修复 / 账号菜单

**描述**: Header 用户菜单语言子菜单改用 reference class 撑满触发区域，确保列表项高亮与子菜单对齐一致。

**主要变更**:
1. **Reference class**：Language 子菜单 `TxPopover` 使用 `reference-class` 控制外层参考宽度。
2. **样式补齐**：针对 reference class 设置 100% 宽度，保证触发区域覆盖整行。

**修改文件**:
- `apps/nexus/app/components/HeaderUserMenu.vue`

### CI 构建引入 Electron 下载镜像与缓存路径

**变更类型**: 稳定性 / 构建修复

**描述**: GitHub Actions 拉取 Electron 产物时出现 502，构建改为使用镜像源并固定缓存目录，降低外网波动影响。

**主要变更**:
1. **镜像下载**：设置 `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR`。
2. **缓存路径**：统一 `ELECTRON_CACHE` 与 `ELECTRON_BUILDER_CACHE` 到 workspace 内。

**修改文件**:
- `.github/workflows/build-and-release.yml`

### macOS 自动更新通道校验与旧包清理

**变更类型**: 行为修复 / 更新稳定性

**描述**: 修正 macOS 自动更新在渠道错配与旧包残留情况下触发降级安装的问题，同时避免持久化更新记录与待安装版本在当前版本更高时继续提示更新。

**主要变更**:
1. **待安装版本校验**：仅允许与当前有效渠道匹配且版本更高的 pending install 进入可安装状态。
2. **缓存记录过滤**：持久化更新记录在版本不满足更新条件时不再触发提示。
3. **默认通道对齐**：更新通道缺失时改为对齐当前版本通道，避免 beta 用户回退到 Release 检测。

**修改文件**:
- `apps/core-app/src/main/modules/update/UpdateService.ts`

### Core-app DB 写入队列与剪贴板持久化优化

**变更类型**: 稳定性 / 性能

**描述**: 解决事件循环阻塞与 SQLite 写入争用导致的分析持久化积压，剪贴板写入改为走串行队列与重试机制，并在队列压力下主动跳过非关键 analytics 写入。

**主要变更**:
1. **剪贴板持久化串行化**：clipboard history 与 metadata 写入改走 `DbWriteScheduler + withSqliteRetry`。
2. **Analytics 压力削峰**：队列深度过高时跳过 snapshots / cleanup / plugin analytics，减少锁争用与阻塞。
3. **队列压力日志节流**：压力告警增加 5s 级别节流，避免刷屏。
4. **剪贴板元数据降级**：队列压力下跳过 meta 表写入，正常情况下改为异步 + 可丢弃写入。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`

### CoreBox 剪贴板输入索引化与 ESC 搜索刷新

**变更类型**: 体验修复 / 性能

**描述**: CoreBox 搜索输入为剪贴板图片/文件补充 `clipboardId` 指引与预览信息，减少重复传输大体积内容；ESC 清除附件时强制触发搜索刷新，保持结果与输入一致。

**主要变更**:
1. **输入指引**：图片/文件输入 metadata 增加 `clipboardId` 与 `contentKind`，支持按需解析原始内容。
2. **预览标记**：图片输入补充 `canResolveOriginal` 标记，预览数据保持轻量。
3. **ESC 清理刷新**：清除附件时无论是否存在 clipboard 数据都触发搜索刷新。
4. **主进程补齐**：搜索与插件执行阶段按 `clipboardId` 自动补齐文件输入内容。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardState.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`

### 快捷键管理列表布局优化

**变更类型**: 体验优化 / 设置

**描述**: 快捷键管理列表提升可读性，快捷键列加宽、来源列后置，并支持命令 ID 一键复制与横向滚动。

**主要变更**:
1. **列顺序调整**：来源列移动到末尾，关键内容优先展示。
2. **快捷键列加宽**：输入框宽度与列宽提升，避免组合键被截断。
3. **命令 ID 复制**：命令 ID 支持点击复制并在 hover 时显示下划线。
4. **默认无横向滚动**：压缩列宽并省略长文本，保证默认视口内可读。
5. **保存状态视觉反馈**：保存中 shimmer、成功淡绿、失败淡红并使用 Carbon 图标。
6. **启用/状态合并**：启用与状态合并同列并保持默认可见。
7. **命令 ID 复制提示**：复制后显示成功/失败提示。
8. **复制工具统一**：ID 复制统一使用 clipboard 工具，移除旧式 execCommand 兼容逻辑。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`

### Nexus 登录页底部协议按钮可点击

**变更类型**: 体验修复 / 登录页

**描述**: 登录页底部协议/隐私按钮被主内容层覆盖导致无法点击，现提升 footer 层级避免遮挡。

**主要变更**:
1. **层级提升**：登录页法律 footer 增加更高层级，确保点击交互可用。

**修改文件**:
- `apps/nexus/app/components/auth/AuthLegalFooter.vue`

### Nexus Credits 额度优化、签到与支付抽象

**变更类型**: 计费与权益 / 体验增强

**描述**: Free 个人额度调整为每月 5；完成邮箱验证 + OAuth + Passkey 后可领取当月提升额度（下月起自动 100）；Plus/Pro 个人额度分别为 500/1200，Team/Enterprise 个人额度为 5000；Team 计划团队池默认 10000（含 5 席位），每新增 1 席位团队池增加 2000；新增每日签到领积分；引入支付抽象接口以支持多支付方式扩展。

**主要变更**:
1. **额度规则**：个人额度按资格与月份初始化，新增提升领取与签到奖励。
2. **API 扩展**：新增 credits claim/checkin/status 接口，summary 增加 boost 信息。
3. **前端入口**：Credits 页面新增领取与签到卡片、提示与动作。
4. **支付抽象**：新增 billing provider 接口与注册表，暂不接入真实支付。
5. **数据可视化**：Credits 页面新增趋势图、个人占比与模型/审计/签到 Tabs，补充趋势与模型/签到日历数据接口。

**修改文件**:
- `apps/nexus/server/utils/creditsStore.ts`
- `apps/nexus/server/api/credits/claim.post.ts`
- `apps/nexus/server/api/credits/checkin.post.ts`
- `apps/nexus/server/api/credits/checkin/status.get.ts`
- `apps/nexus/server/api/credits/trend.get.ts`
- `apps/nexus/server/api/credits/models.get.ts`
- `apps/nexus/server/api/credits/checkin/month.get.ts`
- `apps/nexus/app/pages/dashboard/credits.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/server/utils/billing/`

### Tuff CLI 交互式引导与登录门控

**变更类型**: 体验增强 / CLI

**描述**: CLI 默认交互模式升级为上下选择，并在首次进入时新增语言/条款引导与 Nexus 登录门控，确保用户完成登录后再进入主菜单。

**主要变更**:
1. **交互式选择**：菜单选项支持 ↑/↓ + Enter 操作。
2. **首次引导**：首次运行要求选择语言并确认条款，状态写入 `~/.tuff/cli.json`。
3. **登录门控**：未登录时要求输入 Nexus Token，完成后进入主菜单。
4. **存储提示**：进入主菜单前提示本地配置与登录信息存储路径。
5. **设备码 OAuth**：CLI 支持浏览器授权 + 2 分钟心跳轮询，无需本地回调服务。
6. **官网条款链接**：首次引导直接展示官网服务条款与隐私政策地址。
7. **ASCII Logo**：CLI 进入交互模式输出 ASCII TUFF 标识。
8. **本地 URL 支持**：`--local` 时 CLI 使用本地 Nexus URL（默认 http://localhost:3200）。
9. **授权入口归一**：设备授权链接改为先进入登录页，再跳转到设备确认页面。
10. **全局参数增强**：新增 `--api-base`、`--config-dir`、`--non-interactive` 以适配多环境与脚本场景。
11. **设备授权扩展**：新增短期/长期/取消选项，授权完成自动关闭页面，并在 CLI 提示妥善保管 Token。

**修改文件**:
- `packages/unplugin-export-plugin/src/cli/prompts.ts`
- `packages/unplugin-export-plugin/src/bin/tuff.ts`
- `packages/unplugin-export-plugin/src/cli/runtime-config.ts`
- `packages/unplugin-export-plugin/src/core/auth.ts`
- `packages/unplugin-export-plugin/src/core/publish.ts`
- `packages/unplugin-export-plugin/src/cli/i18n/locales/zh.ts`
- `packages/unplugin-export-plugin/src/cli/i18n/locales/en.ts`
- `packages/unplugin-export-plugin/src/cli/prompts.ts`
- `apps/nexus/server/api/app-auth/device/start.post.ts`
- `apps/nexus/server/api/app-auth/device/poll.get.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/app/pages/device-auth.vue`

### Nexus 登录历史与设备管理展示授权来源

**变更类型**: 体验增强 / 安全可见性

**描述**: 登录历史与设备管理新增授权来源标识（App / CLI / External），便于识别设备授权渠道并随时撤回可疑来源。

**主要变更**:
1. **登录历史来源**：记录并返回 clientType，Dashboard 显示授权来源。
2. **设备来源标记**：设备列表展示授权来源标签，CLI 设备可直接撤回。
3. **设备授权补全**：CLI 设备授权写入来源与设备元信息。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/server/api/login-history.get.ts`
- `apps/nexus/server/api/app-auth/device/start.post.ts`
- `apps/nexus/server/api/app-auth/device/poll.get.ts`
- `apps/nexus/server/api/auth/[...].ts`
- `apps/nexus/server/api/passkeys/verify.post.ts`
- `apps/nexus/app/plugins/device-headers.client.ts`
- `apps/nexus/app/pages/dashboard/overview.vue`
- `apps/nexus/app/pages/dashboard/account.vue`
- `apps/nexus/app/pages/dashboard/devices.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`

### Nexus 设备授权风控增强

**变更类型**: 安全加固 / 设备授权

**描述**: 设备授权新增 IP 校验与长期授权风控，非常用设备或登录地将被限制长期授权；授权完成后尝试更完整的自动关闭。

**主要变更**:
1. **IP 校验**：设备授权确认时校验 CLI 发起 IP 与浏览器 IP，不一致拒绝。
2. **长期授权风控**：仅在常用设备 + 常用登录地组合下允许长期授权。
3. **自动关闭增强**：授权完成后尝试多种关闭策略。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/app/pages/device-auth.vue`

### Nexus OAuth 回跳支持同源绝对 redirect_url

**变更类型**: 行为修复 / 登录体验

**描述**: OAuth 回调在生产环境可能携带同源绝对 `redirect_url`，此前会被丢弃并回落到默认首页，导致登录后无法回到原页面。现支持识别同源绝对地址并回退为站内路径。

**主要变更**:
1. **同源回跳**：绝对地址回跳在同源时转换为站内路径保留。
2. **安全回退**：非同源或非法回跳仍回落到默认路径。

**修改文件**:
- `apps/nexus/app/composables/useOauthContext.ts`

### Nexus Cloudflare Pages SSR 输出路径对齐

**变更类型**: 部署稳定性 / 路由回落

**描述**: Cloudflare Pages + Workers 场景下，生产构建强制启用 SSR，预览/部署脚本与指引统一使用 `dist` 输出，避免误用静态目录导致刷新回首页。

**主要变更**:
1. **SSR 强制**：生产环境保持 SSR 启用，确保 Pages Functions 生效。
2. **输出对齐**：`preview:cf`/`deploy:cf` 与 Cloudflare 指引统一使用 `dist` 目录。

**修改文件**:
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/package.json`
- `apps/nexus/SETUP.md`

### CoreBox UI 恢复事件 URL 修正与索引 addPath 类型收敛

**变更类型**: 稳定性 / 构建修复

**描述**: 修正 CoreBox 插件 UI 恢复事件在无 query 场景使用未定义 URL 的问题，并为 file/app index addPath 事件显式标注返回类型，避免 typecheck 失败。

**主要变更**:
1. **恢复事件 URL**：无 query 时恢复事件使用当前 attach URL。
2. **addPath 类型约束**：file/app index addPath 事件 handler 显式标注请求/返回类型，消除返回值类型漂移。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/channel/common.ts`

### DivisionBox 窗口池延后初始化

**变更类型**: 性能优化 / 启动体验

**描述**: DivisionBox 窗口池初始化延后到全部模块加载完成后异步触发，避免启动阶段被预热窗口阻塞。

**主要变更**:
1. **延后时机**：监听 `ALL_MODULES_LOADED` 后再调度 window pool 初始化。
2. **异步调度**：初始化改为非阻塞调度，避免影响模块加载链路。

**修改文件**:
- `apps/core-app/src/main/modules/division-box/module.ts`

### CoreBox Dev 插件视图路由按 manifest 直出

**变更类型**: 行为调整 / 插件开发

**描述**: Dev 插件视图不再强制 hash 路由，交互路径按 manifest 原样生成；需要 hash 路由时请在 manifest 的 interaction.path 中显式配置 `#/...`。

**主要变更**:
1. **移除强制 hash**：dev 插件 URL 不再自动改写为 `/#/`。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`

### Intelligence 审计用量写入 Upsert 化以降低锁冲突

**变更类型**: 稳定性 / 数据持久化

**描述**: Intelligence 审计用量统计写入改为 `INSERT ... ON CONFLICT DO UPDATE`，避免事务内先读后写导致的 `SQLITE_BUSY_SNAPSHOT` 争用。

**主要变更**:
1. **Upsert 统计**：用量统计直接累加写入，减少读写锁竞争窗口。

**修改文件**:
- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`

### AppProvider 配置写入串行化避免 SQLITE_BUSY

**变更类型**: 稳定性 / 数据持久化

**描述**: AppProvider 写入 config 表时改为走 `DbWriteScheduler + withSqliteRetry`，降低与索引 worker 并发写入时触发 `SQLITE_BUSY` 的概率，并避免未处理的 Promise 拒绝。

**主要变更**:
1. **统一配置写入**：mdls 扫描时间/locale、缺失图标缓存、待删除缓存写入走统一写入函数。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`

---

## 2026-02-21

### CoreBox 路径动作提示与索引扩展

**变更类型**: 体验增强 / 行为补齐

**描述**: CoreBox 识别拖拽/剪贴板路径时提供系统动作提示，支持一键添加 Dev 插件、TPEX 插件、应用索引与文件索引；文件索引新增 `extraPaths` 并支持动态追加监控路径。

**主要变更**:
1. **系统动作 Provider**：新增 system actions provider，识别 manifest.json / .tpex / 应用 / 文件路径并生成操作项。
2. **文件索引扩展路径**：file-provider 支持 `extraPaths` + 动态 watch，新增 addPath 入口并自动触发索引。
3. **应用索引手动添加**：app-provider 新增 addPath 入口，复用现有更新逻辑。
4. **传输事件与文案**：新增 app/file index addPath 事件与 SDK 方法，补齐 i18n 文案。
5. **插件安装反馈**：插件添加成功或失败后，主窗口弹出通知并在成功/已存在时自动打开对应插件详情。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/channel/common.ts`
- `packages/utils/transport/events/types/file-index.ts`
- `packages/utils/transport/events/types/app-index.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app 托盘模块恢复 TrayManager

**变更类型**: 行为恢复 / 稳定性

**描述**: 托盘模块切回 TrayManager，恢复统一的托盘事件处理与 IPC 处理链路。

**主要变更**:
1. **托盘加载恢复**：core-app 启动模块切回 TrayManagerModule。

**修改文件**:
- `apps/core-app/src/main/index.ts`

### 文件索引错误提示 Popover 与重建确认修复

**变更类型**: 体验修复 / 行为一致性

**描述**: 文件索引错误详情改为按钮触发 Popover 查看，避免错误文本直接铺满面板；重建索引在电量低场景避免重复确认，保留关键电量阈值变更时的二次确认。

**主要变更**:
1. **错误 Popover 接入**：错误详情区域显示按钮并通过 Popover 展示错误细节。
2. **确认逻辑修复**：电量低确认不再重复弹窗，仅在阈值变更或电量未知时二次确认。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### CoreBox 图标 base64 规范修复

**变更类型**: 体验修复 / 稳定性

**描述**: 修复图标提取在 worker 返回 Uint8Array 时被错误拼接为数字串的 data URL，导致 `ERR_INVALID_URL`；新增 base64 合法性校验与无效缓存重提取，避免脏数据重复进入渲染。

**主要变更**:
1. **Buffer 归一化**：Icon worker 结果强制转为 Buffer，确保 base64 输出正确。
2. **合法性校验**：缓存 icon 不符合 base64 规范时跳过并触发重提取。
3. **Windows 图标修复**：Windows 应用图标写入前统一 Buffer，避免错误格式落盘。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/icon-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`

### tfile 路径规范化与缩略图后台生成优化

**变更类型**: 性能优化 / 体验修复

**描述**: tfile URL 解析补充 `tfile://` 路径拼接容错与 macOS `/users` 规范化；文件索引缩略图改由后台 worker 队列生成，缺失缩略图时先展示占位图，避免主线程阻塞与频繁 IO。

**主要变更**:
1. **tfile 解析容错**：构建/解析 `tfile://` URL 时避免 hostname 小写化导致的 `/users` 路径异常。
2. **缩略图 worker**：新增 ThumbnailWorker 队列异步生成缩略图，索引后批量补齐与按需触发。
3. **占位预览**：图片无缩略图时先渲染占位图，避免直接加载原图引发卡顿。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/files/thumbnail-config.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/thumbnail-worker.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/thumbnail-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`
- `apps/core-app/src/main/modules/file-protocol/index.ts`
- `apps/core-app/src/main/modules/clipboard.ts`

### CoreBox widget 加载保持最大高度

**变更类型**: 体验修复 / 行为一致性

**描述**: widget 激活期间 CoreBox 不再因空结果收缩，强制保持最大高度，避免加载过程窗口抖动。

**主要变更**:
1. **布局更新扩展**：layout payload 支持 `forceMax` 标记。
2. **窗口尺寸策略**：检测 widget 激活时强制走最大高度分支，跳过空结果收缩。
3. **结果更新容错**：BoxItem update 在目标不存在时自动 upsert，避免 widget 结果首次更新丢失。
4. **事件广播补全**：widget 注册/更新事件同步发送至 CoreBox 窗口，确保自定义渲染可用。
5. **展示模式优化**：widget 模式下禁用外层滚动并使用全高渲染容器，避免 footer 抖动与列表滚动干扰。
6. **Widget 沙箱隔离**：为 widget 注入独立的 localStorage/sessionStorage/document.cookie，并改用 secure storage 持久化 localStorage + cookie，追加单条/总量限制以约束访问。
7. **隔离命名空间**：为 widget 提供独立的 BroadcastChannel / indexedDB / caches 命名空间，阻断跨插件通道。
8. **窗口逃逸拦截**：阻断 widget 通过 window/self/top/parent/opener/document.defaultView 获取真实窗口上下文。
9. **CoreBox 输入兼容**：补充 `core-box:set-query` handler，避免 widget 通过旧事件设置输入时报错。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/main/modules/box-tool/item-sdk/box-item-manager.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `packages/utils/transport/events/types/core-box.ts`
- `apps/core-app/src/renderer/src/utils/tfile-url.ts`

### Core-app UI 安全与按钮一致性修复

**变更类型**: 体验修复 / 安全加固

**描述**: App 列表与市场来源列表移除 `v-html` 渲染避免注入；文件树文件类型识别更稳健；主题过渡兼容无 ViewTransition 环境；预加载消息发送限制 targetOrigin；多个原生 button 统一为 tuffex 按钮。

**主要变更**:
1. **安全渲染**：AppList / MarketSourceEditor 改为文本渲染，避免注入风险。
2. **文件类型判断**：FileTree 兼容 `isFile` / `type` / Symbol 标记。
3. **主题过渡兼容**：无 ViewTransition 时直接切换主题。
4. **postMessage 限域**：预加载消息按 origin 发送。
5. **按钮一致性**：settings/浮动导航/返回/预览句柄统一 TxButton。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/market/MarketSourceEditor.vue`
- `apps/core-app/src/renderer/src/components/tree/FileTree.vue`
- `apps/core-app/src/renderer/src/modules/storage/theme-style.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/components/FailedFilesListDialog.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/layout/shared/FloatingNav.vue`
- `apps/core-app/src/renderer/src/components/layout/LayoutBackButton.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.vue`

### Renderer 调试日志收敛与 devLog 封装

**变更类型**: 体验修复 / 可维护性

**描述**: 清理 renderer 侧测试/示例日志输出，运行期调试日志统一走 devLog（仅 DEV 输出），避免生产噪音；保留关键错误日志。

**主要变更**:
1. **devLog 封装**：新增 `utils/dev-log.ts` 统一开发态日志输出。
2. **测试/示例日志移除**：LoginTest/MemoryLeakTest/UpdatePromptExample 等不再输出 console.log。
3. **运行期调试收敛**：CoreBox/更新/市场/对话框等模块日志改为 devLog。

**修改文件**:
- `apps/core-app/src/renderer/src/utils/dev-log.ts`
- `apps/core-app/src/renderer/src/base/axios.ts`
- `apps/core-app/src/renderer/src/components/addon/TerminalTemplate.vue`
- `apps/core-app/src/renderer/src/components/download/UpdatePromptExample.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginView.vue`
- `apps/core-app/src/renderer/src/components/plugin/action/PluginStatus.vue`
- `apps/core-app/src/renderer/src/components/tree/FileTree.vue`
- `apps/core-app/src/renderer/src/components/tuff/template/TuffItemTemplateExample.vue`
- `apps/core-app/src/renderer/src/composables/useFileIndexMonitor.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/usePreviewHistory.ts`
- `apps/core-app/src/renderer/src/modules/channel/storage/accounter.ts`
- `apps/core-app/src/renderer/src/modules/division-box/components/DivisionBoxShell.vue`
- `apps/core-app/src/renderer/src/modules/hooks/application-hooks.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useAppLifecycle.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useLanguageSettings.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
- `apps/core-app/src/renderer/src/modules/market/providers/nexus-store-provider.ts`
- `apps/core-app/src/renderer/src/modules/update/UpdateProviderManager.ts`
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/application/ApplicationIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingWindow.vue`
- `apps/core-app/src/renderer/src/views/test/LoginTest.vue`
- `apps/core-app/src/renderer/src/views/test/MemoryLeakTest.vue`

### Renderer 旧组件库全量迁移至 Tuffex

**变更类型**: 体验一致性 / 组件统一

**描述**: core-app renderer 全面移除旧组件库依赖，改为 Tuffex 组件体系；新增 Transfer 组件与 Tree 叶子节点支持以补齐迁移能力。

**主要变更**:
1. **组件替换**：Alert/Collapse/Dropdown/Empty/Form/Pagination/Skeleton/Tree 等组件全部迁移至 Tuffex。
2. **能力补齐**：新增 `TxTransfer` 组件与 `TxTree` 的 `leaf` 能力，覆盖模型管理与文件树场景。
3. **插件移除**：renderer 启动流程移除旧组件库全量注册。
4. **用例同步**：文档模板示例切换到 TxButton/TxTag。
5. **构建清理**：移除旧组件库自动导入/组件解析器与依赖声明，清理 renderer 主题入口残留。

**修改文件**:
- `packages/tuffex/packages/components/src/transfer/src/TxTransfer.vue`
- `packages/tuffex/packages/components/src/transfer/index.ts`
- `packages/tuffex/packages/components/src/tree/src/TxTree.vue`
- `packages/tuffex/packages/components/src/tree/src/types.ts`
- `packages/tuffex/packages/components/src/alert/src/TxAlert.vue`
- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue`
- `apps/core-app/src/renderer/src/components/tree/FileTree.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadHistoryView.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadSettings.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadTask.vue`
- `apps/core-app/src/renderer/src/components/download/TaskCard.vue`
- `apps/core-app/src/renderer/src/components/permission/PermissionRequestDialog.vue`
- `apps/core-app/src/renderer/src/components/permission/PermissionStatusCard.vue`
- `apps/core-app/src/renderer/src/views/base/styles/LayoutAtomEditor.vue`

### Nexus / Touch Music 移除旧组件库

**变更类型**: 依赖清理 / 组件统一

**描述**: Nexus 与 touch-music 插件清理旧组件库依赖与锁文件残留，插件 UI 迁移到 Tuffex（TxScroll/TxSlider/TxInput），并统一使用 `--tx-*` 主题变量。

**主要变更**:
1. **Nexus 清理**：锁文件移除旧组件库与 icons-vue 依赖。
2. **插件迁移**：touch-music 用 TxScroll/TxSlider/TxInput 替换旧组件库组件，并移除旧样式入口。
3. **主题变量**：touch-music 相关样式变量统一替换为 `--tx-*`。

**修改文件**:
- `apps/nexus/pnpm-lock.yaml`
- `plugins/touch-music/src/main.js`
- `plugins/touch-music/src/style.css`
- `plugins/touch-music/src/components/music/base/PlayProgressBar.vue`
- `plugins/touch-music/src/components/music/FooterFunction.vue`
- `plugins/touch-music/src/components/music/layout/Header.vue`
- `plugins/touch-music/src/components/music/layout/SearchResults.vue`
- `plugins/touch-music/src/components/music/PlayList.vue`
- `plugins/touch-music/src/components/music/word-lyric/WordLyricScroller.vue`
- `plugins/touch-music/src/components/music/word-lyric/leaf/LyricScroller.vue`
- `plugins/touch-music/src/components/music/base/PlayProgressBar.old.old.vue`

### 全仓清理旧组件库痕迹

**变更类型**: 依赖清理 / 文档一致性

**描述**: 全仓移除旧变量兼容与旧示例，统一为 Tuffex 变量与组件命名。

**主要变更**:
1. **样式兼容移除**：tuffex 组件去除旧变量回退，避免残留引用。
2. **插件更新**：touch-translation 样式变量统一为 `--tx-*`。
3. **文档同步**：PRD 示例组件统一切换为 Tuffex 组件命名。

**修改文件**:
- `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue`
- `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelectItem.vue`
- `packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadio.vue`
- `packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadioItem.vue`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.md`
- `docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.md`
- `docs/plan-prd/TODO.md`
- `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
- `apps/core-app/src/renderer/src/components/tuff/template/TuffItemTemplate.md`
- `apps/core-app/src/renderer/src/components/tuff/template/DESIGN_EXTENSIONS.md`

## 2026-02-20

### CI Windows 构建命令执行修复

**变更类型**: 工具链修复 / CI 稳定性

**描述**: 修复 Windows Runner 上 `tuffex` build 触发的 `spawn EINVAL`，改为通过 `cmd.exe` 执行构建命令，确保 Build and Release / Release Core Assets 的 Windows 阶段可稳定完成。

**主要变更**:
1. **命令执行修复**：Windows 下使用 `cmd.exe /d /s /c` 调用构建命令。
2. **参数安全处理**：统一命令行转义与拼接，保持非 Windows 行为不变。

**修改文件**:
- `packages/tuffex/packages/script/build/run.ts`

### Nexus 头像入口补充控制台跳转

**变更类型**: 体验修复 / 导航

**描述**: Header 用户菜单补充控制台入口；支持 hover 的设备点击头像可直接进入控制台，触屏设备保持菜单可用。

**主要变更**:
1. **头像快捷跳转**：hover 设备点击头像跳转 `/dashboard`。
2. **菜单入口**：用户菜单新增“控制台”项，触屏点击头像后也可进入。

**修改文件**:
- `apps/nexus/app/components/HeaderUserMenu.vue`

### Nexus 文档代码块高亮补全

**变更类型**: 体验修复 / 文档渲染

**描述**: 修复 ClientOnly/示例代码块挂载后未触发高亮的问题，确保代码在展开或渲染后立即着色。

**主要变更**:
1. **高亮解析复用**：抽离 highlight.js 解析逻辑供插件与代码块组件共享。
2. **挂载后高亮**：TuffCodeBlock 在挂载与内容变更时触发高亮，避免漏染。

**修改文件**:
- `apps/nexus/app/utils/highlight.ts`
- `apps/nexus/app/plugins/highlight.client.ts`
- `apps/nexus/app/components/content/TuffCodeBlock.vue`

### 更新系统实验性 Renderer Override 与 Nexus 版本分布统计

**变更类型**: 行为增强 / 可观测性

**描述**: Renderer Override 需要手动开启并受环境变量约束；更新检查/下载/安装失败与 Renderer Override 关键异常写入 Nexus 遥测消息；更新检查/下载/安装追加结构化 telemetry 事件并扩展 Update 行为分布统计（action/stage/result/channel/source/tag/itemKind）；Nexus 管理台新增版本分布统计（按近 N 天 visit 事件统计）。

**主要变更**:
1. **手动开关**：更新设置新增 Renderer Override 实验性开关（默认关闭，需 `TUFF_ENABLE_RENDERER_OVERRIDE=1` 生效）。
2. **异常上报**：更新检查/下载/安装失败与 Renderer Override 关键异常上报至 Nexus telemetry messages。
3. **更新埋点**：更新检查/下载/安装补充结构化 telemetry 事件（feature_use）。
4. **更新分布**：Nexus Analytics 增加 Update 行为/阶段/结果/渠道/来源/版本/触发方式分布统计卡片。
5. **版本分布**：Nexus Analytics 增加版本分布统计与饼图展示（基于 visit 事件）。

**修改文件**:
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/types/update.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`

### DivisionBox / Flow 权限入口对齐

**变更类型**: 权限闭环 / 行为一致性

**描述**: 统一 Flow 触发与 DivisionBox 打开场景的权限判定与入口归因，补齐 CoreBox 触发链路的权限校验与用户反馈。

**主要变更**:
1. **权限归因**：Flow Dispatch 增加 `actorPluginId`，仅在插件来源时写入；DivisionBox 打开入口仅对插件来源透传 pluginId。
2. **权限判定**：FlowBus 与 DivisionBox IPC 统一按 payload/context 解析 actor 与 sdkapi，避免误用默认版本。
3. **权限映射**：`division-box:flow:trigger` 绑定 `window.create` + `storage.shared` 双权限。
4. **用户反馈**：UI 模式触发 Flow 前置权限校验，拒绝时弹出 toast 提示。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `packages/utils/transport/events/types/flow.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/flow-bus/module.ts`

### 旧同步链路禁用（/api/sync/*）

**变更类型**: 行为收口 / 兼容性

**描述**: 旧 `/api/sync/push` 与 `/api/sync/pull` 全部禁用并提示迁移至 `/api/v1/sync/*`，旧链路不再兼容。

**主要变更**:
1. **禁写提示**：旧 push 返回 410 并提示迁移路径。
2. **禁读提示**：旧 pull 返回 410 并提示迁移路径。

**修改文件**:
- `apps/nexus/server/api/sync/push.post.ts`
- `apps/nexus/server/api/sync/pull.get.ts`

### 翻译插件 SDK 升级与实验性功能隐藏

**变更类型**: 权限治理 / 行为一致性

**描述**: 翻译插件升级到最新 sdkapi，补充分类与 AI 权限；新增 feature.experimental 标记，非 dev 模式自动隐藏实验性功能（截图翻译默认隐藏）。

**主要变更**:
1. **SDK 与权限**：touch-translation 补齐 `sdkapi`、`category` 与 `intelligence.basic` 权限说明。
2. **实验性特性**：支持 `feature.experimental` 并在非 dev 模式过滤展示。
3. **权限前置**：智能翻译调用前增加 AI 权限校验与提示。

**修改文件**:
- `packages/utils/plugin/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-feature.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `plugins/touch-translation/manifest.json`
- `plugins/touch-translation/index.js`
- `plugins/touch-translation/index/main.ts`

### Webcontent 插件 Transport 注入修复

**变更类型**: 稳定性 / 行为修复

**描述**: webcontent 动态 preload 脚本在临时目录执行时无法解析 `@talex-touch/utils/transport`，导致插件页面无法建立通信通道；统一通过 utils transport prelude 输出通道注入脚本，预加载仅负责 `$channel`，`$transport` 由插件前端 prelude 初始化。

**主要变更**:
1. **Prelude 注入**：主进程通过 `@talex-touch/utils/transport/prelude` 生成通道脚本并注入 preload。
2. **通道初始化**：CoreBox 与 DivisionBox 的 webcontent 注入一致化处理，避免特定容器失效。

**修改文件**:
- `packages/utils/transport/prelude.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/division-box/session.ts`

### Intelligence 审计写入降噪

**变更类型**: 性能优化 / 稳定性

**描述**: intelligence audit flush 在主线程批量序列化与写库时可能引发 event loop lag；缩小单批写入规模，并引入异步调度与分段 flush，降低阻塞时长。

**主要变更**:
1. **批次缩小**：flush 批次从 50 降至 20。
2. **延迟写入**：达到批次阈值后使用异步调度再写入，避免请求路径阻塞。
3. **分段 flush**：flush 过程按批次分段并让出事件循环，避免长时间占用主线程。

**修改文件**:
- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`

## 2026-02-19

### Intelligence OpenAI 兼容 Base URL 归一化

**变更类型**: 兼容性修复 / 管理台提示

**描述**: OpenAI 兼容提供商默认自动补全 `/v1`，避免误落到 UI 路径；如需 `/api/v1` 或 `/openai/v1`，需在 Base URL 中显式填写。

**主要变更**:
1. **Base URL 归一化**：OpenAI 兼容路径仅自动补全 `/v1`，不再尝试多种变体。
2. **提示更新**：管理台 Base URL 提示明确写法。

**修改文件**:
- `apps/nexus/server/utils/intelligenceModels.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`

### Intelligence OpenAI 兼容输出提取增强

**变更类型**: 兼容性修复 / 运行稳定性

**描述**: 支持 OpenAI-compatible 响应仅返回 `reasoning_content` 的场景，避免被误判为“空响应”。

**主要变更**:
1. **输出提取**：当 `content` 为空时，依次回落到 `reasoning_content` / `reasoning` / `analysis` 字段。
2. **响应解析**：从 `message` 根对象提取内容，兼容非标准字段。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`

### Intelligence System Prompt 上下文补充

**变更类型**: 能力增强 / 可追溯性

**描述**: TuffIntelligence Lab 所有模型调用增加统一系统上下文（角色、当前时间、当前用户、会话 ID）。

**主要变更**:
1. **系统上下文**：在 intent / planner / executor / reviewer / follow-up / final responder 等阶段注入统一提示。
2. **时间信息**：包含本地时间与 ISO 时间，便于审计与复盘。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`

### Nexus Intelligence 模块整合积分

**变更类型**: 体验优化 / 管理台信息整合

**描述**: 管理后台将 AI 积分从独立导航合并到 Intelligence 模块，并统一命名为 Intelligence 模块，方便管理员在单页内查看渠道配置、审计与积分消耗。

**主要变更**:
1. **导航合并**：管理员侧移除单独的 AI Credits 菜单，合并到 Intelligence 模块页签。
2. **模块命名**：菜单与页面标题统一为 “Intelligence 模块”，同步中英文文案。
3. **积分视图**：原有积分消耗/流水视图作为新页签嵌入。

**修改文件**:
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`

### Nexus 汇率服务（USD 基准 + 历史归档）

**变更类型**: 能力接入 / 服务端数据

**描述**: 新增 ExchangeRate-API 汇率服务，统一 USD 作为 base，按请求触发 + 8h TTL 缓存；成功响应写入 D1 历史表并将错误归档到 telemetry。

**主要变更**:
1. **运行时配置扩展**：新增 `exchangeRate` 配置项，包含 API Key、Base URL、TTL 与超时。
2. **双层缓存与历史记录**：新增 `exchange_rate_snapshots` 表并保留完整 payload，useStorage 作为 fallback。
3. **对外换算 API**：新增 `/api/exchange/convert`（仅支持 USD base）。
4. **错误归档**：上游错误写入 `telemetry_messages`，便于检索与审计。

**修改文件**:
- `apps/nexus/nuxt.config.ts`
- `wrangler.toml`
- `apps/nexus/server/utils/exchangeRateStore.ts`
- `apps/nexus/server/utils/exchangeRateService.ts`
- `apps/nexus/server/api/exchange/convert.get.ts`
- `apps/nexus/server/utils/__tests__/exchangeRateService.test.ts`
- `.spec/features/exchange-rate-service.md`
- `.spec/modules/exchange-rate-cache.md`
- `.spec/index.md`

### Nexus 汇率历史查询（非免费用户）

**变更类型**: 能力增强 / 高级权限

**描述**: 在 USD 基准汇率服务上新增历史查询能力，非 FREE 用户可访问历史曲线；新增归一化历史表并支持可选 payload 返回。

**主要变更**:
1. **历史查询 API**：新增 `/api/exchange/history`，支持按币种 + 时间范围查询。
2. **权限门槛**：非 FREE 用户可访问；`includePayload` 仅管理员允许。
3. **归一化历史表**：新增 `exchange_rate_rates`，便于时间序列查询。
4. **保留策略**：支持 `historyRetentionDays` 控制清理（默认不清理）。
5. **管理后台视图**：Admin Analytics 新增 Exchange 区块用于查看历史数据。

**修改文件**:
- `apps/nexus/nuxt.config.ts`
- `wrangler.toml`
- `apps/nexus/server/utils/exchangeRateStore.ts`
- `apps/nexus/server/utils/exchangeRateService.ts`
- `apps/nexus/server/api/exchange/history.get.ts`
- `apps/nexus/server/utils/__tests__/exchangeRateHistory.test.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`
- `.spec/features/exchange-rate-service.md`
- `.spec/modules/exchange-rate-cache.md`
- `.spec/index.md`

### Nexus 汇率 API 计费与 Latest 接口

**变更类型**: 计费策略 / 接口扩展

**描述**: 汇率服务新增 `/api/exchange/latest`（USD 基准倍率表）并建立积分扣费规则；`convert` 每次扣 0.1，`latest` 每次扣 1，`history` 每次扣 2。

**主要变更**:
1. **Latest 接口**：新增 `/api/exchange/latest` 返回 USD 基准倍率与更新时间字段。
2. **扣费策略**：`convert`/`latest`/`history` 分别扣 0.1/1/2 credits。
3. **表结构优化**：credits 表字段使用 REAL 并统一保留 2 位小数。

**修改文件**:
- `apps/nexus/server/api/exchange/convert.get.ts`
- `apps/nexus/server/api/exchange/latest.get.ts`
- `apps/nexus/server/api/exchange/history.get.ts`
- `apps/nexus/server/utils/creditsStore.ts`

### 统一更新与汇率热数据链路（Nexus + CoreApp）

**变更类型**: 统一更新 / 热数据分发

**描述**: 扩展 Nexus Updates/Release 体系支持系统更新（公告/配置/热数据），新增 payload 存储与读取；CoreApp 增加 SystemUpdate 拉取与 fx-rate 热数据回填，更新服务支持 Official 源，并在汇率换算 API 中暴露更新时间字段。

**主要变更**:
1. **Updates 扩展**：`dashboard_updates` 增加 scope/type/channels 与 payload 元数据，新增 `/api/updates/:id/payload`。
2. **汇率更新时间暴露**：`/api/exchange/convert` 返回 `providerUpdatedAt/fetchedAt/providerNextUpdateAt`。
3. **汇率热数据刷新**：新增 fx-rate 刷新入口与 provider 客户端占位。
4. **CoreApp 系统更新拉取**：新增 SystemUpdateModule、fx_rates/system_config/system_update_state 表。
5. **官方更新源支持**：UpdateService 增加 OFFICIAL provider 并对接 Nexus `/api/releases/latest`。

**修改文件**:
- `apps/nexus/server/utils/dashboardStore.ts`
- `apps/nexus/server/utils/updateAssetStorage.ts`
- `apps/nexus/server/api/updates.get.ts`
- `apps/nexus/server/api/updates/[id]/payload.get.ts`
- `apps/nexus/server/api/dashboard/updates/fx-rate/refresh.post.ts`
- `apps/nexus/server/utils/fxRateProviderClient.ts`
- `apps/nexus/server/utils/exchangeRateService.ts`
- `apps/nexus/server/api/exchange/convert.get.ts`
- `apps/nexus/app/components/dashboard/UpdateFormDrawer.vue`
- `apps/nexus/app/pages/dashboard/updates.vue`
- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/app/composables/useDashboardData.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/core-app/src/main/modules/system-update/index.ts`
- `apps/core-app/src/main/db/schema.ts`
- `apps/core-app/resources/db/migrations/0020_system_update_tables.sql`
- `apps/core-app/src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/abilities/currency-ability.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/core/eventbus/touch-event.ts`

### CoreApp 页面标题 i18n 规范化

**变更类型**: 体验一致性 / 国际化

**描述**: CoreApp 页面标题支持 `$I18n:` 前缀解析，路由与布局标题统一走 i18n 解析逻辑。

**主要变更**:
1. **新增标题前缀约定**：`$I18n:<key>` 用于标记需要国际化的页面标题与路由名。
2. **布局标题解析**：ViewTemplate 与布局控制器统一解析前缀并回退到原文。
3. **路由标题本地化**：核心路由名替换为 i18n key 并补充双语文案。

**修改文件**:
- `apps/core-app/src/renderer/src/base/router.ts`
- `apps/core-app/src/renderer/src/components/base/template/ViewTemplate.vue`
- `apps/core-app/src/renderer/src/composables/layout/useLayoutController.ts`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/I18N_IMPLEMENTATION.md`

### Setting About 更新通道显示调整

**变更类型**: 体验一致性 / 信息展示

**描述**: 设置页关于模块的通道信息改为展示用户订阅的更新通道，避免与构建类型重复。

**主要变更**:
1. **更新通道替换**：将 Channel 字段改为 Update Channel，并读取更新订阅通道。
2. **订阅标识**：通道值附加 `sub` 标记便于区分构建类型。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`

### Nexus App 登录回调失焦自动关闭

**变更类型**: 行为优化 / 体验改进

**描述**: 登录回调页在拉起客户端后检测到页面失焦即视为成功并关闭标签页，避免 dev token 提示干扰。

**主要变更**:
1. **失焦即关闭**：协议拉起后页面失焦触发自动关闭标签页。
2. **取消 dev token 提示**：成功且失焦时不再展示 dev-mode token 复制提示。

**修改文件**:
- `apps/nexus/app/pages/auth/app-callback.vue`

### 同步阻塞系统通知

**变更类型**: 行为优化 / 可观测性

**描述**: 同步连续失败后触发一次系统通知，提示配额/设备/鉴权问题，避免多次 toast 被忽略。

**主要变更**:
1. **失败阈值通知**：连续失败达到 3 次后发送系统通知（按原因去重）。
2. **发送端本地化**：同步通知文案在 renderer 侧完成 i18n 解析后发送。
3. **成功后重置**：同步成功后清理通知去重状态，下一轮可重新提示。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/sync/auto-sync-manager.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### 同步设备自动回收

**变更类型**: 行为优化 / 账号安全

**描述**: 新设备开始同步时，超过设备上限会自动回收最久未活跃设备，并在当前设备提示回收结果。

**主要变更**:
1. **自动回收旧设备**：同步握手时先回收 30 天未活跃设备，仍超限则按 `last_seen_at` 从旧到新回收。
2. **同步握手提示**：握手返回回收列表（含设备名/平台/最近活跃），客户端弹出系统通知提醒。
3. **API 类型同步**：更新 Sync handshake 响应与类型定义。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/v1/sync/handshake.post.ts`
- `apps/nexus/openapi/nexus-sync.yaml`
- `apps/nexus/types/sync-api.d.ts`
- `packages/utils/types/cloud-sync.ts`
- `packages/utils/cloud-sync/cloud-sync-sdk.ts`
- `apps/core-app/src/renderer/src/modules/sync/auto-sync-manager.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### 文档治理基线与路线图收敛

**变更类型**: 文档治理 / 规划收敛

**描述**: 补齐“项目定义 → PRD 目标 → 质量约束 → 执行路线图”的文档闭环，统一后续迭代的执行标准。

**主要变更**:
1. **AGENTS 项目定义增强**：新增项目定位、交付边界、阶段性最终目标与文档同步责任。
2. **PRD 索引增强**：`docs/plan-prd/README.md` 增加 North Star 与活跃 PRD 质量约束。
3. **新增产品总览与 8 周路线图**：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`。
4. **新增 PRD 质量基线文档**：`docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`，要求活跃 PRD 必含目标、约束、验收、回滚。
5. **新增 Week 1 执行清单**：`docs/plan-prd/01-project/WEEK1-EXECUTION-PLAN-2026Q1.md`。
6. **补齐模块日志 PRD 质量段落**：`docs/plan-prd/02-architecture/module-logging-system-prd.md` 新增最终目标/质量约束/回滚策略。
7. **TODO 与索引对齐**：`docs/plan-prd/TODO.md`、`docs/INDEX.md` 新增治理入口与执行项。

### TuffIntelligence Lab 流式对话语义修正

**变更类型**: 行为调整 / 体验优化

**描述**: 调整 TuffIntelligence Lab 的对话恢复语义为“历史即上下文”，断链后无需显式恢复；状态日志改为模型原文直出，最终回答使用流式输出。

**主要变更**:
1. **取消显式恢复流程**：前端移除 recoverable/resume 交互，只保留历史加载与继续对话。
2. **状态日志直出**：意图、动作选择、动作结果统一采用模型原文作为状态消息。
3. **最终回答流式**：最终回答优先走流式推送，失败时回退为普通流。
4. **断链语义简化**：保留 `session.paused` 事件作为日志提示，不提供 recoverable/resume API。
5. **移除外部桥接依赖**：仅使用已启用 provider 执行链路。
6. **原始输出可追溯**：plan/reflect/followup 的原始输出与错误详情写入 stream detail，便于溯源与排障。
7. **快捷测试入口**：管理端对话页提供默认提示词按钮，便于快速验证工具能力。
8. **错误追踪增强**：错误事件补充 providerId/model/endpoint/status/responseSnippet 等详细字段。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/app/pages/dashboard/admin/intelligence-lab.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`

### LangChain + Nuxt 流式对话接入（管理员测试页）

**变更类型**: 能力接入 / 测试通道

**描述**: 在 Nexus 内接入 LangChain，并新增管理员专用的流式对话测试页，支持历史回放。

**主要变更**:
1. **LangChain 接入**：新增 LangChain 流式调用与消息历史管理。
2. **Admin API**：新增 `/api/admin/intelligence/chat` GET/POST 路由，支持流式对话与历史回放。
3. **测试页面**：新增 `/dashboard/admin/intelligence-chat` 页面用于对话验证。
4. **Provider 对齐**：LangChain 调用复用 intelligence provider 配置，不再读取环境变量。

**修改文件**:
- `apps/nexus/server/api/admin/intelligence/chat.ts`
- `apps/nexus/app/pages/dashboard/admin/intelligence-chat.vue`
- `apps/nexus/package.json`
- `apps/nexus/nuxt.config.ts`

### 安全加固：路径与命令执行防护

**变更类型**: 安全加固 / 风险收敛

**描述**: 统一路径校验与命令执行封装，限制可疑路径访问并修复通道 key 回收问题。

**主要变更**:
1. **新增安全封装**：`safe-path` 与 `safe-shell` 统一路径校验与非 shell 执行。
2. **插件存储路径校验**：插件存储读写删/详情均限制在插件配置目录内。
3. **文件访问限制**：`fs:read-file`/`fs:write-file` 仅允许对话框批准路径；`tfile://` 访问限制在白名单根目录。
4. **命令执行去 shell**：App Scanner、Darwin app icon、Native Share、Terminal、Open-in-editor 等改为安全执行，并为终端执行增加权限校验。
5. **通道 key 回收修复**：修复 revokeKey 删除顺序导致的 key 残留。

### Nexus 风控/水印改为实验性手动启用

**变更类型**: 安全开关治理

**描述**: 新增 Nexus 实验功能开关，风控控制面与水印系统默认关闭，需通过环境变量手动启用。

**主要变更**:
1. **新增环境变量**:
   - `NEXUS_EXPERIMENTAL_RISK_ENABLED`（默认 `false`）
   - `NEXUS_EXPERIMENTAL_WATERMARK_ENABLED`（默认 `false`）
2. **风控控制面受开关控制**:
   - 服务端风控守卫与应急 API 关闭时 fail-closed（`404`）
   - 管理台导航/页面在未启用时不提供入口
3. **部署配置与类型补齐**:
   - `wrangler.toml` 预览与生产 vars 增加实验开关占位
   - Cloudflare bindings 类型同步更新
4. **实验功能全链路拦截**:
   - 新增前端全局中间件，关闭时阻断 risk/emergency/watermark 页面直达
   - 新增服务端中间件，关闭时阻断 risk 兼容接口与 watermark API 访问

---

## 2026-02-10

### CoreBox 内置能力抽离为独立插件

**变更类型**: 架构重构

**描述**: 将 CoreBox 的 7 个内置能力抽离为独立插件，实现核心框架与业务能力的解耦。

**主要变更**:
1. **新增 7 个独立插件**:
   - `touch-browser-open` - 浏览器打开 / URL 系统
   - `touch-browser-bookmarks` - 浏览器书签搜索
   - `touch-quick-actions` - 快捷操作
   - `touch-window-presets` - 窗口预设
   - `touch-workspace-scripts` - 工作区脚本
   - `touch-system-actions` - 系统操作
   - `touch-intelligence-actions` - AI 智能操作
2. **移除内置实现**: `apps/core-app/src/main/` 中对应内置 URL 系统和内部 AI providers 已移除
3. **测试与文档**: 每个插件含 shared loader 测试 + Nexus onboarding 文档

**相关提交**: `a304911e`, `17c48a79`, `30ba3518`, `6c2b7320`, `67c4a001`, `9fd6ca5f`

---

### SDK 统一 Hard-Cut 进展

**变更类型**: 架构治理

**描述**: 推进 SDK 统一 Hard-Cut，将 renderer 直连 IPC 迁移到 Typed Transport Domain SDKs。

**主要变更**:
1. **批次 A~D 已完成**: Settings/Permission/Download/Cloud Sync/Channel 迁移到 SDK Hooks
2. **Typed Transport Domain SDKs**: `packages/utils/transport/` 新增类型化域 SDK 和 event payloads
3. **Renderer SDK Hooks**: `packages/utils/renderer/hooks/` 迁移完成
4. **Safe handler wrappers**: Channel 和 download 模块增加安全处理器包装

**参考**: `docs/engineering/reports/sdk-unification-progress-2026-02-08.md`

---

### Nexus OAuth 稳定化

**变更类型**: Bug 修复 + 安全增强

**描述**: 修复 Nexus 认证流程中的多个问题，提升安全性。

**主要变更**:
1. **sign-in callback 修复**: 稳定化 OAuth 回调流程
2. **auth guard 拆分**: session 和 app auth guard 独立，避免相互干扰
3. **Turnstile + Passkey**: 新增 Turnstile 验证和 Passkey step-up flow
4. **设备认证**: 新增 device attestation flow 和 secure local seed handling

**相关提交**: `bf87e09e`, `1bea54ce`, `9b137b49`, `919064c2`

---

### 更新系统增强

**变更类型**: 功能增强

**描述**: 实现可复用更新任务和增强下载管理。

**主要变更**:
1. **reusable update tasks**: 更新任务可复用，减少重复代码
2. **下载管理增强**: 改进下载流程和错误处理
3. **版本守护**: 启动时版本校验（startup version guard）

**相关提交**: `7d5b479d`, `f4cc525e`

---

### 原生能力集成

**变更类型**: 功能增强

**描述**: 引入原生能力支持，增强系统集成。

**主要变更**:
1. **tuff-native**: 新增 workspace 包和构建接入
2. **本地 OCR**: 新增系统 OCR provider 和 native integration
3. **Everything SDK**: fallback chain 和后端诊断功能
4. **PowerSDK**: 低功耗适配支持

**相关提交**: `3ecac208`, `846413fa`, `e0bf259b`, `1a1fce3e`

---

### 代码质量治理

**变更类型**: 代码质量

**描述**: 系统性代码质量提升，达到 B+ 评级。

**参考**: `docs/engineering/reports/code-quality-2026-02-03.md`

---

## 2026-01

### Nexus 数据同步协议与审核系统

**变更类型**: 功能增强

**主要变更**:
1. **Nexus 统计扩展**: 搜索/执行细分指标、模块耗时可视化、隐私约束（不采集搜索词）
2. **Nexus 审核系统**: Review states 细化、auth gate、回归文档（NEXUS-REV-040~060）
3. **Nexus 文档迁移**: 组件 demo wrapper pattern、migration status banners

---

### 更新系统统一

**变更类型**: 功能增强

**主要变更**:
1. **兼容性标志更新**: compatibility flags 和 versioning 调整
2. **记录清理**: update repository 实现 record clearing
3. **Release 脚本增强**: Windows/macOS/Linux artifact 处理改进

---

### TuffEx 迁移与 CLI 分包规划

**变更类型**: 架构规划

**主要变更**:
1. **TuffEx 组件库迁移**: tuffex-ui → tuffex 重命名和构建脚本修复
2. **Tuff CLI 分包**: `@talex-touch/tuff-cli-core` + `@talex-touch/tuff-cli` 拆分规划

---

### 从 README.md 归档的旧里程碑（超过 3 个月）

以下条目从 README.md 近期里程碑中移出：
- **插件市场多源**（2025-12 完成）：TpexApi + Nexus + NPM + GitHub Provider
- **Search DSL**（2025-12 完成）：`@xxx` provider filter + pinned
- **Nexus Team Invite**（2025-12 完成）：邀请 + join 页面
- **直接预览计算**（2025-12 完成）：表达式 + 单位换算 + 汇率 + 时间
- **Widget 动态加载**（2025-12 完成）：Loader + Compiler + Manager

---

## 2025-11-27

### 完成: 代码质量迭代与文档整理

**变更类型**: 代码质量 + 文档整理

**核心工作**:

#### 1. 代码质量扫描 📊
- **中文硬编码识别**: 发现 2000+ 处中文字符（主要在注释）
- **日志系统碎片化**: 发现 300+ 处 `console.log` 待迁移
- **TODO 标记梳理**: 识别 17 处待实现功能
- **Extract Icon API 验证**: 确认 `tfile://` 协议全面实施完成

#### 2. 已完成功能归档 ✅
- **tfile:// 协议迁移**: 18 个组件已完成，性能提升 70%+
- **UI/UX 改进总结**: 记录 2025-11 月完成的 15+ 页面重构
  - 登录页面简化 (会话 31ef54b4)
  - 个人资料页三页重构 (会话 36a89e8a, 98b2468a, ebd24d48)
  - 欢迎页面优化 (会话 432448fe, aab8db44)
  - 打卡页面重设计 (会话 6bbe5bda)
  - 统计页面增强 (会话 73ab0bd6, 056e2013)  
  - 状态栏全局移除 (会话 09fe75f4, 63e55aba)
  - Geek 风格统一 (会话 5d448a55, 2554c9d6)

#### 3. 文档更新 📝
- **新增**: 代码质量分析报告 (`code_quality_report.md`)
- **新增**: 已完成功能总结 (`completed_features_summary.md`)
- **更新**: `TODO.md` 移除 extract-icon API 任务
- **更新**: 任务统计 (13 → 12 项)

**下一步建议**:
1. 实施模块日志系统 PRD (P0)
2. 托盘系统优化 (P1)
3. 日志国际化改造
4. 清理高频 console.log

---

## 2025-11-20

### 完成: PRD清理与功能归档

**变更类型**: 文档整理

**已完成功能归档**:

#### 1. 搜索排序系统优化 ✅
- **来源**: `search-source-id-ranking-plan.md` + `search-optimization-implementation-summary.md`
- **核心成果**:
  - 实现 `source.id + item.id` 组合键统计
  - 新增 `item_usage_stats` 表,支持 search/execute/cancel 三种行为计数
  - 排序公式优化: `score = weight * 1e6 + match * 1e4 + recency * 1e2 + (executeCount*1 + searchCount*0.3 + cancelCount*(-0.5)) * exp(-0.1*days)`
  - 添加索引 `idx_item_usage_source_type`, `idx_item_usage_updated`
  - 实现 `QueryCompletionService` 查询补全系统
  - 实现 `UsageSummaryService` 定期汇总与清理
  - 批量查询优化,避免N+1问题
- **性能提升**: 查询耗时 5-10ms (P95), 排序更智能, 命中率>70%
- **迁移**: 0007_remarkable_silver_sable.sql

#### 2. 使用数据记录与清理 ✅
- **来源**: `USAGE_LOGGING_PLAN.md` + `TUFF_USAGE_TRACKING_PRD.md` + `search-usage-data-cleanup-plan.md`
- **核心成果**:
  - `usage_logs` 表记录所有搜索/执行行为
  - 自动清理过期日志(默认30天)
  - 定期汇总到 `item_usage_stats`
  - 异步写入不阻塞搜索流程

#### 3. 插件存储机制调研 ✅
- **来源**: `plugin-storage-research.md`
- **核心成果**:
  - 调研 Raycast/uTools/HapiGo 存储方案
  - 确定采用 JSON 文件 + 异步 Promise API
  - 每插件10MB限制,自动隔离
  - 实现 `StorageModule` 统一管理

#### 4. 下载中心系统 ✅
- **来源**: `DOWNLOAD_CENTER_API.md` + `UPDATE_SYSTEM.md` + `MIGRATION_GUIDE.md`
- **核心成果**:
  - 统一下载中心模块,支持切片下载、断点续传
  - 智能优先级调度(P0-P10)
  - 网络自适应并发控制(1-10)
  - SHA256校验、错误重试、进度节流
  - 完整的迁移系统,支持从旧系统无缝迁移
  - 更新系统集成,自动下载应用更新
- **性能优化**: 虚拟滚动(>50项)、数据库索引、任务缓存
- **文件位置**: `apps/core-app/src/main/modules/download/`

#### 5. 性能优化实施 ✅
- **来源**: `PERFORMANCE_OPTIMIZATIONS.md`
- **核心成果**:
  - 数据库索引优化(status/created/priority)
  - 虚拟滚动组件(VirtualTaskList.vue)
  - 搜索防抖(300ms)
  - 进度更新节流(1秒/任务)
  - 性能监控器(PerformanceMonitor)
- **性能提升**: 
  - 500项列表渲染: 200ms → 20ms (10x)
  - 搜索响应: 150ms → 30ms (5x)
  - 数据库查询: 50-100ms → 5-10ms (5-10x)

#### 6. 更新提示UI实现 ✅
- **来源**: `UPDATE_PROMPT_IMPLEMENTATION.md` + `UPDATE_PROMPT_DIALOG.md`
- **核心成果**:
  - UpdatePromptDialog 组件
  - 支持RELEASE/BETA/SNAPSHOT频道
  - 自动下载、忽略版本、手动检查
  - 集成下载中心显示进度

#### 7. CoreBox Completion 分析 ✅
- **来源**: `corebox-completion-analysis.md`
- **核心成果**:
  - 识别性能、准确性、安全性问题
  - 提出缓存、智能权重、上下文感知改进方向
  - XSS安全修复建议

#### 8. 系统性架构分析 ✅
- **来源**: `PROJECT_ANALYSIS.md`
- **核心成果**:
  - 识别优势: 模块化架构、插件系统、IPC通道、tfile://协议
  - 识别不足: 插件加载死循环、日志混乱、托盘功能薄弱
  - 技术债务清单与优先级建议
  - 内容已整合到 `CLAUDE.md`

**删除文件**:
- `plan-prd/01-project/PROJECT_ANALYSIS.md`
- `plan-prd/03-features/search/search-source-id-ranking-plan.md`
- `plan-prd/03-features/search/search-optimization-implementation-summary.md`
- `plan-prd/03-features/search/USAGE_LOGGING_PLAN.md`
- `plan-prd/03-features/search/TUFF_USAGE_TRACKING_PRD.md`
- `plan-prd/03-features/search/search-usage-data-cleanup-plan.md`
- `plan-prd/03-features/plugin/plugin-storage-research.md`
- `plan-prd/04-implementation/corebox-completion-analysis.md`
- `plan-prd/04-implementation/components/UPDATE_PROMPT_*.md` (2个)
- `plan-prd/05-archive/*` (README_ANALYSIS.md, PRD-CLEANUP-REPORT.md, plan.md)

**影响**:
- PRD文件从35个减少到23个
- 已完成功能有明确历史记录
- 聚焦未实现的核心功能规划

---

## 2025-11-14

### 新增: 直接预览计算能力 PRD

**变更类型**: 文档/规划

**描述**:
- 新增 `plan-prd/direct-preview-calculation-prd.md`，定义搜索框直接预览计算的背景、范围、技术方案与里程碑。
- 将该能力纳入 PRD 索引的 P1 重要优化列表，并更新总 PRD 统计（17 个）。
- 补充 `plan-prd/README.md` 中的工期估算（新增 6-10 天）与整体工期区间。
- 新增「计算历史」保留策略（30 天 / 500 条）、单箭头入口、复用剪贴板历史（source 字段）方案。
- 扩展能力范围：新增颜色解析（HEX/RGB/HSL 互转 + 色块预览）与 ColorEngine 组件说明。

**修改文件**:
- `plan-prd/direct-preview-calculation-prd.md`
- `plan-prd/README.md`
- `plan-prd/CHANGES.md`

**影响**:
- 搜索体验有了明确的“直接预览计算”建设路线，可与插件搜索结果解耦，后续开发优先级明确。
- PRD 指标统计保持最新，方便规划人力。

---

# 2026-01-XX

### Analytics: Nexus 统计扩展与隐私约束

**变更类型**: 功能增强 + 隐私改进

**描述**: Nexus 分析面板新增搜索/执行细分指标与模块耗时可视化，同时强制不采集搜索词。

**主要变更**:
1. **隐私**:
   - 关闭搜索词采集与展示，仅保留长度/类型/耗时等聚合数据
2. **Nexus 指标扩展**:
   - 搜索场景/输入类型/Provider 分布
   - 平均排序耗时、平均结果数、平均执行延迟
3. **模块耗时**:
   - 统计模块加载耗时（avg/max/min/ratio）并可视化
4. **UI 优化**:
   - 二级 Breakdown Drawer 收纳细分分布

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`
- `docs/analytics-data-prd.md`

---

## 2025-01-XX

### 清理: 移除冗余的窗口关闭处理代码

**变更类型**: 清理/重构

**描述**:
- 移除了 `TouchApp` 中冗余的 `_setupWindowCloseHandler()` 方法
- 窗口关闭事件处理已由 `TrayManager` 模块统一管理（在 `registerWindowEvents()` 方法中）
- 清理了相关的注释和代码

**修改文件**:
- `apps/core-app/src/main/core/touch-app.ts`: 移除 `_setupWindowCloseHandler` 方法和相关调用

**技术细节**:
- 窗口关闭到托盘功能现在完全由 Tray 模块负责：
  - `TrayManager.registerWindowEvents()` 方法处理窗口关闭事件
  - 根据 `closeToTray` 配置决定是否最小化到托盘
  - 避免了代码重复和维护问题

**影响**:
- 代码结构更清晰，职责分离更明确
- 消除了代码重复和潜在的维护问题

---

## 2025-01-XX

### 修复: TypeScript 编译错误

**变更类型**: Bug 修复

**描述**: 修复了构建过程中的所有 TypeScript 类型错误

**主要修复**:
1. **未使用的声明 (TS6133)**:
   - 移除了未使用的导入（`path`, `fs`, `ModuleDestroyContext`）
   - 移除了未使用的私有方法（`_syncFileFromDevServer`）
   - 修复了未使用参数的警告

2. **类型不匹配 (TS2322)**:
   - 修复了 `Primitive` 类型错误（将 `unknown` 转换为 `string`）
   - 修复了 icon 类型错误（`'base64'` → `'url'`，字符串 → `ITuffIcon` 对象）
   - 修复了 `boolean | undefined` 类型问题

3. **属性不存在 (TS2339)**:
   - 修复了 `DevServerHealthCheckResult.data` 属性移除
   - 修复了 `ITouchPlugin._windows` 访问（使用类型断言）

4. **导入错误 (TS2304)**:
   - 修复了 `useAuthState.ts` 中缺少 `computed` 导入
   - 修复了 `useAuthConfig.ts` 中环境变量类型问题

5. **参数类型错误 (TS2345)**:
   - 修复了事件处理器类型，使用 `ITouchEvent` 基类并类型断言

**修改文件**:
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/providers/clipboard.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/service/failed-files-cleanup-task.ts`
- `packages/utils/core-box/builder/tuff-builder.ts`
- `packages/utils/search/types.ts`
- `packages/utils/auth/useAuthState.ts`
- `packages/utils/auth/useAuthConfig.ts`

**影响**: 项目现在可以通过 TypeScript 类型检查，构建流程正常

---

## 2025-01-XX

### 优化: GitHub Actions 构建发布流程

**变更类型**: 工作流优化

**描述**: 简化了构建发布流程，移除了手动触发时的版本号和标签创建

**主要变更**:
1. **简化手动触发**:
   - 移除了 `version` 输入字段
   - 移除了手动触发时的 Git 标签创建步骤
   - 手动触发时直接构建，不处理版本号

2. **标签触发优化**:
   - 保留标签推送触发机制（使用 bumpp 打好的标签自动触发）
   - 从标签自动提取版本号并更新 package.json

**修改文件**:
- `.github/workflows/build-and-release.yml`

**新的工作流程**:
- **方式 1**: 使用 `bumpp` 打标签后自动触发构建和发布
- **方式 2**: 手动触发构建（不创建标签，直接构建并创建 draft Release）

**影响**: 构建流程更简洁，符合团队工作流

---
