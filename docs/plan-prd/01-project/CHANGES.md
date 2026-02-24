# 变更日志

> 记录项目的重大变更和改进

## 2026-02-24

### touch-translation Prelude 打包修复（移除 `process is not defined`）

**变更类型**: 构建修复 / 运行时稳定性

**描述**: 修复 `touch-translation` 插件打包后在 plugin prelude VM 中报错 `ReferenceError: process is not defined`。根因是 prelude 侧间接打入 Vue CJS 包，触发 `process.env.NODE_ENV` 访问。

**主要变更**:
1. **收敛翻译客户端依赖**：`shared/tuffintelligence.ts` 移除对 `@talex-touch/utils/plugin/sdk/intelligence` 的静态依赖，改为基于 `createIntelligenceClient` 构建最小调用链。
2. **Renderer 通道兼容**：在 renderer 场景优先复用 `window.$channel`，并透传 `_sdkapi`（来自 `window.$plugin.sdkapi`）保持权限校验语义一致。
3. **Prelude 运行时兼容**：在非 renderer 场景继续走默认 channel resolver，避免引入 browser-only/renderer-only 依赖。
4. **产物体积回归正常**：`dist/build/index.js` 从异常膨胀降至轻量体积，且不再包含 `process.env.NODE_ENV` 引用。

**修改文件**:
- `plugins/touch-translation/shared/tuffintelligence.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 后台轮询错峰与性能日志降噪（SystemUpdate/FxRate/PerfMonitor）

**变更类型**: 性能优化 / 稳定性修复

**描述**: 针对 `system-update.poll` 与 `fx-rate.refresh` 在同一时间窗触发导致的事件循环抖动，以及休眠恢复场景下日志噪音过高问题，新增轮询错峰、慢任务退避与 sleep/suspend 日志节流机制。

**主要变更**:
1. **轮询错峰**：`system-update.poll` 与 `fx-rate.refresh` 首轮执行延迟引入固定偏移 + 随机抖动，避免小时级任务同窗叠加。
2. **慢任务退避**：当轮询任务单次执行耗时超过 800ms 时，自动延后下一轮调度窗口，降低持续高负载下的抖动风险。
3. **启动期解耦**：`SystemUpdateModule` 先执行一次启动刷新，再启动 FX 定时刷新，减少启动阶段并发网络任务竞争。
4. **日志降噪**：`PerfMonitor` 对 `System sleep/suspend detected ... skipping event loop lag report` 增加 60s 节流，保留关键信号同时抑制刷屏。

**修改文件**:
- `apps/core-app/src/main/modules/system-update/index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts`
- `apps/core-app/src/main/utils/perf-monitor.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus 认证入口统一到 AUTH_ORIGIN（防止 OAuth 跨域回调失败）

**变更类型**: 部署稳定性 / 登录修复

**描述**: Pages 默认域与自定义域并存时，用户若从非 `AUTH_ORIGIN` 域发起 OAuth，会出现 state cookie 与 callback 域不一致，导致回调失败。现新增 canonical origin 中间件，对页面请求统一重定向到 `AUTH_ORIGIN`。

**主要变更**:
1. **域名收敛**：生产环境下，非 `AUTH_ORIGIN` 的页面 GET/HEAD 请求统一 307 到 canonical origin。
2. **范围控制**：跳过 `/api/*`、`/_nuxt/*` 与 `__nuxt_error`，避免影响 API 与静态资源路径。
3. **开发保护**：开发环境与 localhost 请求保持原行为，不影响本地调试。

**修改文件**:
- `apps/nexus/server/middleware/canonical-origin.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus OAuth 回调修复（Cloudflare Pages 下移除对 Node `https.request` 依赖）

**变更类型**: 登录修复 / 运行时兼容性

**描述**: 生产环境 `OAuthCallback` 报错定位为 `https.request is not implemented yet`。根因是 `next-auth` 的默认 OAuth 回调链路依赖 `openid-client`，其 token/userinfo 交换会走 Node `https` 模块；而 Nitro `cloudflare-pages` 产物对 `http/https` 仍为 unenv stub。现将 GitHub/LinuxDO 的 token 与 userinfo 交换改为 `fetch`，规避该运行时限制。

**主要变更**:
1. **OAuth 交换改造**：为 GitHub/LinuxDO provider 增加 `token.request` 与 `userinfo.request` 自定义实现，统一改用 `fetch`。
2. **行为兼容**：保留现有账号绑定策略（`allowDangerousEmailAccountLinking`）；GitHub 额外补齐 `/user/emails` 拉取，维持邮箱可用性。
3. **运行时兜底**：Pages 根环境与 preview 继续保留 `enable_nodejs_http_modules`，减少后续依赖升级时的兼容风险。
4. **回调稳定性增强**：`token.request` 透传 next-auth `checks.code_verifier`（PKCE），并对 GitHub token 交换改为不强制提交 `redirect_uri`，降低 provider 侧 `redirect_uri_mismatch` 触发概率。
5. **部署配置对齐**：`wrangler.toml` 生产配置显式迁移到 `env.production`，避免根级 `[vars]` 在本地 CLI 部署时覆盖/偏离 Dashboard 的生产环境绑定。
6. **Dashboard 构建兼容**：保留根级 `compatibility_flags`（`nodejs_compat` 等）与生产一致，避免 Dashboard 集成构建路径落到无 `nodejs_compat` 配置后触发 `crypto.getHashes` unenv 报错。

**修改文件**:
- `apps/nexus/server/api/auth/[...].ts`
- `wrangler.toml`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首引导完成页 Welcome 收敛（对齐 Hello）+ ShortKey 组件

**变更类型**: 交互优化 / 视觉一致性

**描述**: 完成页 Welcome 动效布局对齐语言页 Hello 视觉比例，并新增独立 ShortKey 组件用于展示系统快捷键提示。

**主要变更**:
1. **Welcome 对齐 Hello 结构**：完成页动效区域改为固定容器 + 内部缩放，避免全屏占位导致主视觉失衡。
2. **ShortKey 独立组件**：新增 `BeginShortcutKey`，将按键外观与 hover/active 动效封装，供引导页复用。
3. **组合键展示完善**：完成页快捷键区改为 `Command/Ctrl + E` 双键展示，右侧补充独立 `E` 键位。
4. **Done 阶段快捷标记**：进入 Done 页面时标记 `beginner.shortcutArmed`，即使 `beginner.init=false` 也可响应 `Meta/Ctrl + E` 快捷触发。
5. **按键联动反馈**：监听 `Meta/Ctrl` 与 `E` 键盘事件，按下时同步触发双键帽“按压态”，随后追加绿色发光阴影。
6. **延迟唤起 CoreBox**：在 Done 步骤按下 `Meta/Ctrl + E` 后先播放按压+发光反馈，延迟后自动完成引导、隐藏主窗口并唤起 CoreBox。
7. **i18n 补齐**：`zh-CN/en-US` 新增 `beginner.done.shortcut.*` 文案键，并补充“可在设置中修改快捷键”提示。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/components/BeginShortcutKey.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 引导语言切换实时保存（点击即生效）

**变更类型**: 交互优化

**描述**: 首引导语言列表点击语言项后立即落盘并生效，不再依赖点击 Continue 才持久化。

**主要变更**:
1. **点击即保存**：语言列表点击时立刻更新 `followSystem` 与语言偏好。
2. **状态同步**：选择系统语言时实时切回 follow-system；选择其他语言时实时切换并持久化。
3. **返回默认态即跟随设备**：从语言列表返回默认卡片时强制切回系统语言并开启 follow-system，保证“默认=跟随设备”语义一致。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首引导统一返回导航（跨步骤回退）

**变更类型**: 交互优化 / 流程修复

**描述**: 为首引导容器增加统一返回按钮，并修复原“仅记忆上一步”的回退逻辑，支持多步骤连续回退，避免来回跳转。

**主要变更**:
1. **统一返回入口**：在 `Beginner` 容器顶部新增 `TxButton` 返回按钮，所有引导步骤都可见。
2. **历史栈回退**：将原单一 `last_component` 改为历史栈，实现 `A -> B -> C -> Back -> B -> Back -> A` 的正确行为。
3. **回退一致性**：`provide('back')` 统一走容器回退逻辑，内嵌步骤调用与顶部按钮行为一致。
4. **首屏无返回按钮**：当无历史页面时隐藏返回入口，避免在 hello/首步骤出现无意义返回操作。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/Beginner.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 引导语言页 startup 音效可听性修复（资源打包 + 交互重试）

**变更类型**: Bug 修复 / 体验优化

**描述**: 修复首引导语言页 startup 音效在部分环境“无声”的问题，避免静态资源未进包与自动播放策略拦截导致的失声。

**主要变更**:
1. **音效资源入包**：将 startup 音效放入 renderer 资产目录并通过 `import.meta.url` 解析，确保 dev/build 下路径一致可访问。
2. **自动播放失败兜底**：首次播放失败时自动绑定用户交互重试（pointer/keyboard），首个交互后自动重放并清理监听。
3. **音量微调**：引导音效默认音量从 `0.45` 调整为 `0.65`，提升可感知度。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `apps/core-app/src/renderer/src/assets/sounds/startup.m4a`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 引导页 i18n 全量补齐（Begin Flow）

**变更类型**: 体验优化 / 国际化一致性

**描述**: 对首引导 `begin` 流程进行全量文案排查，移除页面硬编码文案并统一接入 `vue-i18n`，确保中英文切换下引导体验一致。

**主要变更**:
1. **文案全量收敛到 i18n**：`AccountDo / Done / Forbidden / OptionMode / License` 中所有用户可见文案改为 `t(...)` 获取，去除模板硬编码字符串。
2. **交互提示国际化**：账号引导页登录成功/失败 toast 统一改为 i18n key，避免固定中文提示。
3. **语言包补齐**：`zh-CN/en-US` 新增 `beginner.account / beginner.done / beginner.forbidden / beginner.optionMode / beginner.license` 文案分组。
4. **代码清理**：删除引导页内无效注释与废弃注释代码，降低噪音并保持结构清晰。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/AccountDo.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Forbidden.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/OptionMode.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/License.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app SetupPermissions 首引导页可继续性修复（Tx 组件化收敛）

**变更类型**: Bug 修复 / 交互优化

**描述**: 修复权限页“已授权但继续按钮不可点”的体验问题，并将权限条目状态展示收敛到 Tuffex 组件，减少自定义样式复杂度。

**主要变更**:
1. **继续按钮可操作性修复**：移除基于同步状态的 `disabled` 门禁，改为点击时执行异步校验并给出提示，避免状态短暂未同步导致按钮“看起来不可点”。
2. **防重复提交**：新增 `isContinuing` 保护，继续动作进入加载态，避免多次点击触发重复跳转。
3. **Tx 组件替换**：权限条目容器切换为 `TxCard`，状态展示切换为 `TxStatusBadge`，保留 `TxButton` 操作入口。
4. **设置区组件化**：开关区切到 `TxCardItem + TuffSwitch` 组合，统一条目结构与交互语义，减少自定义块级布局。
5. **样式简化**：删除对 legacy `TBlockSelection` 的依赖样式，改为更扁平的结构样式与响应式收敛。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app SetupPermissions 权限页切换为 GroupBlock 方案（对齐 Settings 视觉）

**变更类型**: 交互优化 / 视觉一致性

**描述**: 首引导权限页移除 `TxCard` 形态，改为与 App Settings 一致的 `groupblock` 套件组织结构，减少样式分叉，提升组件一致性。

**主要变更**:
1. **权限区收敛**：权限条目统一使用 `TuffGroupBlock + TuffBlockSlot + TuffStatusBadge`，移除 `TxCard/TxCardItem` 组合。
2. **设置区收敛**：开关项统一使用 `TuffBlockSwitch`，保持与设置页相同交互语义。
3. **操作入口保留**：继续沿用 `TxButton` 作为重检/继续入口，兼容当前引导流程按钮交互。
4. **样式降复杂**：删除卡片特化样式，保留最小必要布局样式（状态区与响应式按钮排列）。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首次引导收敛为单页语言确认（内嵌 Hello 动效）

**变更类型**: 交互优化 / 流程简化

**描述**: 根据最新交互调整，将原本独立的 Hello 页面合并进语言确认页顶部展示，移除单独 Hello 步骤，首次引导直接从 LanguageSetup 开始。

**主要变更**:
1. **移除独立 Hello 步骤**：`Beginner` 首屏恢复为 `LanguageSetup`，删除 `Greeting` 页面链路，减少一次页面切换。
2. **首屏主视觉替换**：语言页头部从“欢迎来到 Tuff”文本替换为 `hello.json` Lottie 动效，保留“我们已将您的语言设置为 {lang}”说明文案。
3. **流程保持稳定**：默认仍为系统语言确认，点击 `Change Language` 才展开列表，`Continue` 进入账号步骤。
4. **交互收敛到 Tuffex 组件**：语言信息区改为 `TxCard`，减少超宽占位并统一卡片视觉；底部 `Change Language` 保持 `TxButton`。
5. **列表可回退 + 过渡动画**：语言列表新增返回入口，支持从列表回到默认态，并增加入场/退场过渡动画；`hello` 动效与 startup 音效在语言页持续可见可听。
6. **尺寸与对齐再收敛**：语言区块整体缩小并左对齐，语言默认态与语言列表项前增加语言 icon，提升信息密度与识别度。
7. **布局回归居中与样式简化**：语言页整体重新居中，默认语言卡片采用“左侧语言 icon + 右侧文案”的结构，并合并样式规则以减少组件级微调代码。
8. **字号继续收敛 + 默认勾选态显式化**：语言页文本字号整体再收缩约 40%，并在默认态与列表态的右侧统一展示 checkmark（选中填充、未选中描边）。
9. **动效速度微调**：语言页 `hello` 动效恢复默认速率（1x）；完成页 `welcome` 动效在加载后设置 `setSpeed(1.5)`，保证节奏更紧凑但不突兀。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/Beginner.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Greeting.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首次引导语言流程重排（Hello 自动切换 + 系统语言默认确认）

**变更类型**: 交互优化 / 流程修正

**描述**: 调整首次引导顺序为「Hello 动画页 → 语言确认页 → 账号步骤」，并将语言页默认交互改为“系统语言直接继续、点击 Change Language 再进入列表选择”。

**主要变更**:
1. **引导链路重排**：`Beginner` 首屏改为 `Greeting`，`LanguageSetup` 的下一步改为 `AccountDo`，去除“语言页后再进 Hello 页”的反直觉路径。
2. **Hello 自动过渡**：`Greeting` 阶段监听 Lottie 播放完成与启动音效结束，二者都完成后延迟 1 秒自动跳转语言页，无需手动点击。
3. **语言页默认态收敛**：首屏文案改为“欢迎来到 Tuff / 我们已将您的语言设置为 {lang}”，默认按系统语言继续；点击底部 `Change Language` 才展开语言列表。
4. **Lottie 组件事件补齐**：`LottieFrame` 新增 `complete` 事件与卸载清理，支撑引导页对动画结束时机的精确编排。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/Beginner.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Greeting.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `apps/core-app/src/renderer/src/components/icon/lotties/LottieFrame.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首次引导体验修复（索引延后 + 登录态修正 + Hello 音效 + 语言页美化）

**变更类型**: Bug 修复 / 体验优化

**描述**: 修复首次引导阶段“索引任务与引导并发导致启动期噪音/卡顿体感”与“登录按钮长期 loading”问题；同时补齐 Hello 阶段音效与语言选择页视觉优化。

**主要变更**:
1. **索引任务延后**：SearchEngine provider 加载改为“首次引导完成后再启动”，并通过 `appSetting.beginner.init` 订阅恢复加载，减少首次引导期间的扫描/索引竞争。
2. **登录 loading 语义修正**：引导登录页按钮 loading 改为仅跟随登录动作（`isSigningIn/isLoggingIn`），不再绑定认证初始化状态。
3. **Learn more 接入 Nexus**：引导登录说明链接切到 `getAuthBaseUrl()/sign-in`，统一走 Nexus 入口。
4. **Hello 音效**：Greeting 阶段挂载时播放 `public/sound/startup.m4a`，离开阶段自动停止。
5. **语言选择页视觉优化**：增强卡片层次、渐变背景、选中态与按钮反馈，保持现有流程与交互不变。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/renderer/src/views/base/begin/internal/AccountDo.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Greeting.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app OCR 队列失败熔断与延迟重试收敛（降低 SQLite 写争用）

**变更类型**: Bug 修复 / 稳定性增强

**描述**: 针对 OCR 高频失败导致的 `ocr_jobs` 重试风暴与 SQLite 写入争用，新增“按错误分类延迟重试 + 失败熔断自动停队列 + 用户提醒”机制，优先抑制异常配置或外部服务故障带来的持续回压。

**主要变更**:
1. **重试策略延长**：补充 `Native OCR module unavailable`、`OCR provider network failure` 等错误分类，并拉长相应重试间隔。
2. **持久化重试时间**：调度改为依赖 `ocr_jobs.nextRetryAt` 过滤可执行任务，移除仅内存重试节流依赖，避免重启后行为漂移。
3. **自动熔断停队列**：在时间窗内连续失败达到阈值后自动暂停 OCR 队列，并在 24h 内重复触发时按阶梯拉长冷却（30m → 1h → 2h …，上限 12h），避免持续冲击数据库写队列。
4. **用户可感知告警**：触发自动暂停时写入通知 Inbox，提示“多次错误已自动暂停”并附带恢复时间与排查建议。
5. **状态可观测**：OCR dashboard 快照新增 `queueDisabled` 状态，便于排障与运维观测。

**修改文件**:
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `apps/core-app/src/main/modules/ocr/ocr-service.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 性能诊断与重试日志降噪（聚合输出）

**变更类型**: 观测优化 / 稳定性增强

**描述**: 针对 `D.2026-02-24.log` 中高频重复日志（`DbRetry`、`AnalyticsStore`、`Perf:EventLoop`、`AuditLogger`）引发的信噪比下降问题，改为“按窗口聚合 + 节流输出”，保留关键异常可见性并显著降低刷屏。

**主要变更**:
1. **DbRetry 聚合节流**：`SQLITE_BUSY` 重试日志默认节流窗口从 5s 提升至 30s，并追加 `suppressedRetries` 聚合计数。
2. **AnalyticsStore 汇总**：快照/插件/清理的 queue-pressure 日志收敛为 60s 周期汇总，避免同类 warn 高频重复。
3. **EventLoop diagnostics 收敛**：`Event loop lag diagnostics` 改为“根因变化或高严重度窗口触发”再输出，减少重复诊断行。
4. **Perf summary 门禁**：`Perf summary / Top slow` 仅在存在 error 或慢事件超阈值时输出。
5. **AuditLogger 错误节流**：`flush` 与 `usage stats` 失败日志改为节流聚合，保留首条与 suppression 计数。
6. **Clipboard.persist 上下文释放修复**：将 `Clipboard.persist` 性能上下文释放迁移到 `finally`，避免异常路径遗漏释放导致事件循环诊断出现“超长持续中”误报。

**修改文件**:
- `apps/core-app/src/main/db/sqlite-retry.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `apps/core-app/src/main/utils/perf-monitor.ts`
- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 启动链路卡顿治理（Storage Polling 不再被 AppTask 长时间阻塞）

**变更类型**: 性能修复 / 稳定性增强

**描述**: 结合 `D.2026-02-24.log` 与 `E.2026-02-24.err` 中 `storage.polling` 长时间活跃（12s/18s）与 `AppProvider.startupBackfill` 同窗问题，收敛主线程调度阻塞链路，避免“单任务长占用”放大为全局 perf 告警。

**主要变更**:
1. **AppTaskGate 支持超时等待**：`waitForIdle(timeoutMs)` 新增超时返回与 waiter 清理，避免等待队列在超时场景累积。
2. **Storage 持久化等待预算化**：`persistConfig` 对 app task 空闲等待增加 250ms 上限，超时后继续落盘，避免 `storage.polling` callback 长时间占用 PollingService 调度循环。
3. **Backfill 启动延后**：`AppProvider` 启动补漏从 500ms 延后至 15s，降低冷启动阶段与配置持久化、渲染初始化的竞争。
4. **BoxItem 同步通道前置注册**：CoreBox IPC register 阶段主动初始化 `BoxItemManager`，消除冷启动窗口期 `box-item:sync` 无 handler 错误。

**修改文件**:
- `apps/core-app/src/main/service/app-task-gate.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app Analytics 上报压缩与失败熔断（减少高频重试与噪音）

**变更类型**: 观测优化 / 稳定性增强

**描述**: 针对 `analytics messages` 在网络异常下高频重试、重复告警与上报节奏过密问题，改为“批量压缩 + 抖动调度 + 失败熔断 + 节流日志”策略，降低上报风暴与日志噪音。

**主要变更**:
1. **上报节奏压缩**：基础 flush 周期由 30s 调整到 2min，批次由 10 提升到 25，减少请求频率。
2. **请求抖动分散**：flush 调度增加 ±20% jitter，避免多实例同周期集中上报。
3. **失败熔断**：连续失败达到阈值后开启 circuit cooldown（10m 起步，指数拉长，最大 60m），冷却期内暂停主动上报。
4. **日志节流聚合**：`Failed to report analytics messages` 改为 3min 节流输出，并附 `suppressedFailures` 汇总。
5. **队列元信息增强**：上报 payload 增加 `firstAt/lastAt/avgIntervalMs/count` 聚合字段，便于服务端按窗口做均值/频次分析。
6. **快照持久化降频**：`15m/1h/24h` 窗口写入增加最小持久化间隔（2min/5min/15min），并输出 `snapshotsThrottled` 汇总，减少 DB 写放大与无效上报。
7. **窗口封口写入**：`AnalyticsCore` 增加最小记录间隔 + 窗口强制封口策略，避免高频事件导致 1m 扇出快照过密。
8. **动态采样**：插件 SDK 非关键埋点按 DB 队列深度动态降采样（100%/50%/25%/10%），高压时优先保护主流程。
9. **健康指标日志**：新增 5min reporter health 指标（`requestsPerMin`、`queueDepth`、`dropRate`、`failRate`、`sdkSampleDropRate`），便于量化压缩收益。

**修改文件**:
- `apps/core-app/src/main/modules/analytics/analytics-module.ts`
- `apps/core-app/src/main/modules/analytics/core/analytics-core.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 构建阶段预打包内置插件 Prelude（修复 utils 子路径 require 失败）

**变更类型**: Bug 修复 / 构建链增强

**描述**: 修复内置插件 `index.js` 在构建产物运行时直接 `require('@talex-touch/utils/*')` 子路径可能触发 `Cannot find module` 的问题。构建脚本新增“内置插件 Prelude 预打包”步骤，在 `npm run build` 前统一将 `tuff/modules/plugins/*` 的 `manifest.main` 入口打包为单文件，避免运行时再解析 workspace 子路径。

**主要变更**:
1. **构建前统一预打包**：`build-target.js` 增加内置插件 Prelude bundling 步骤，覆盖 `apps/core-app/tuff/modules/plugins` 下可执行插件入口。
2. **解析路径显式兜底**：预打包时注入 `nodePaths`（`apps/core-app/node_modules` + workspace 解析链），确保可解析 `@talex-touch/utils/*` 子路径。
3. **失败即中断构建**：任一插件 Prelude 预打包失败时直接中止打包流程，避免生成带隐患构建产物。

**修改文件**:
- `apps/core-app/scripts/build-target.js`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app OmniPanel Feature Hub 首期落地（自动装载 + Feature 执行链）

**变更类型**: 功能增强 / 架构收敛

**描述**: OmniPanel 从固定快捷动作升级为 Feature Hub，支持插件 Feature 执行、安装后自动装载首个 Feature、声明式 omniTransfer（含 SDK 门槛）与主渲染协议统一事件。

**主要变更**:
1. **Feature Hub 协议**：`omni-panel` 事件新增 `list/toggle/reorder/execute/refresh` typed payload，替代纯前端固定动作。
2. **主进程执行链**：OmniPanel 主进程模块新增注册表持久化、builtin/plugin/corebox 分发执行、上下文注入与刷新广播。
3. **自动装载策略**：新增安装后自动装载逻辑（声明式优先，回退首个可执行 feature），并接入插件安装完成事件。
4. **设置项落地**：通用设置新增 `autoMountFirstFeatureOnPluginInstall` 开关，默认关闭。
5. **SDK 与类型扩展**：插件类型新增 `feature.omniTransfer`；SDK 新增 `260225` 与声明式门槛常量。
6. **面板 UI 重构**：OmniPanel 渲染层改为 Feature 列表视图，支持启停、排序、搜索与执行反馈。

**修改文件**:
- `apps/core-app/src/shared/events/omni-panel.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/core/eventbus/touch-event.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-feature.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/plugin/index.ts`
- `packages/utils/plugin/sdk-version.ts`

## 2026-02-23

### Core-app Widget Feature issue 降级为 warning，并忽略非开发模式下隐藏实验特性

**变更类型**: Bug 修复 / 噪音收敛

**描述**: 修复 widget feature 在资源缺失或编译失败时统一上报为 error 的问题，改为 warning；同时对 `experimental` 且插件非开发模式的 feature，不再触发 widget 预编译与 issue 上报，避免对正式可见功能造成干扰告警。

**主要变更**:
1. **issue 级别收敛**：widget loader/manager/compiler/processors 的 feature 级问题统一走 warning。
2. **隐藏实验特性免打扰**：新增 `isWidgetFeatureEnabled` 判定，非开发模式下跳过 `experimental` feature 的 issue 产生。
3. **预编译流程对齐可见性**：插件加载阶段的 widget 预编译与未使用扫描仅处理当前模式可见 feature。
4. **复用统一入口**：新增 `pushWidgetFeatureIssue`，统一注入 source/timestamp 并减少重复实现。

**修改文件**:
- `apps/core-app/src/main/modules/plugin/widget/widget-issue.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-loader.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-compiler.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/script-processor.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/tsx-processor.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/vue-processor.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 窗口偏好切换为 pure/refraction/filter 并修正语义

**变更类型**: 交互修复 / 语义收敛

**描述**: 窗口偏好统一为 `pure` / `refraction` / `filter` 三档，并修正“普通与 Mica 观感反向”的问题。`pure` 使用纯色背景阻断窗口材质透出，`refraction` 保持材质透出，`filter` 在透出基础上叠加滤镜。

**主要变更**:
1. **偏好值统一**：窗口偏好类型改为 `pure/refraction/filter`，并兼容历史 `Default/Mica/Filter` 自动归一化。
2. **设置页切换**：ThemeStyle 的窗口偏好入口改为三档新值，Filter 可直接选择。
3. **渲染语义修复**：`AppLayout` 重新对齐 pure/refraction/filter 的透明度策略与 touch-blur 触发条件，pure 下增加纯色底阻断窗口特效透出。
4. **Header 分区透明度对齐**：Header 左侧（侧栏对应区）跟随 aside 透明度，右侧使用 header 透明度，消除左右明暗错位。
5. **壁纸链路兼容**：壁纸模糊与透明度附加策略改为基于 pure/refraction/filter 判定。
6. **文案与预览更新**：窗口偏好文案改为首字母大写（Pure/Refraction/Filter），ThemePreference 展示与预览样式切换到新值语义。
7. **切换反馈增强**：切换窗口偏好后增加全屏遮罩 + Spinner 短暂加载态，明确“窗口效果应用中”状态。

**修改文件**:
- `packages/utils/common/storage/entity/layout-atom-types.ts`
- `packages/utils/__tests__/preset-export-types.test.ts`
- `apps/core-app/src/renderer/src/modules/storage/theme-style.ts`
- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/views/base/styles/SectionItem.vue`
- `apps/core-app/src/renderer/src/views/base/styles/sub/ThemePreference.vue`
- `apps/core-app/src/renderer/src/views/layout/AppLayout.vue`
- `apps/core-app/src/renderer/src/styles/layout/_layout-shell.scss`
- `apps/core-app/src/renderer/src/modules/layout/useWallpaper.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 插件 Manifest 保存通道克隆失败修复

**变更类型**: Bug 修复 / 传输稳定性

**描述**: 修复插件详情页保存 dev 配置时，`manifest` 通过 transport 发送前携带 Vue 响应式代理对象，触发 `An object could not be cloned` 导致保存失败的问题。

**主要变更**:
1. **发送前序列化**：`pluginSDK.saveManifest` 在发送前统一将 `manifest` 转换为 JSON 可序列化的普通对象，避免 Proxy 进入 IPC payload。
2. **失败可观测**：当 `manifest` 不可 JSON 序列化时记录明确错误日志并返回失败，避免继续发送导致 transport 层克隆异常。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/sdk/plugin-sdk.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 低电量阈值配置移除（保留低电量模式开关）

**变更类型**: 配置收敛 / UI 简化

**描述**: 动效设置中移除“低电量阈值”滑块与相关可配置字段，低电量模式仅保留开关；阈值改为统一跟随 `DeviceIdle` 电量策略，避免重复配置。

**主要变更**:
1. **设置页简化**：`ThemeStyle` 移除阈值滑块，仅保留“低电量模式”开关。
2. **运行时收敛**：`useBatteryOptimizer` 不再读取用户阈值配置，统一读取 `DeviceIdle.blockBatteryBelowPercent` 作为低电量判定阈值。
3. **配置模型清理**：`app-settings` 默认配置移除 `animation.lowBatteryThreshold` 字段，并清理对应 i18n 文案键。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useBatteryOptimizer.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 后台索引调度电量策略抽离（BatteryPolicy）

**变更类型**: 架构收敛 / 调度策略复用

**描述**: 将后台索引调度相关的“低电量禁区”判断抽离为统一 `BatteryPolicy`，并将插件电量 SDK、渲染侧低电量动效判定统一接入同一阈值来源，避免多处重复实现与阈值漂移。

**主要变更**:
1. **统一策略模型**：在 `packages/utils/common` 新增 `BatteryPolicy`、`normalizeBatteryPolicy`、`evaluateBatteryPolicy` 与 `clampBatteryPercent`。
2. **服务判定复用**：`DeviceIdleService.canRun` 改用统一策略评估函数返回 `battery-low / battery-critical`。
3. **索引策略单源化**：`FileProvider` 移除本地电量阈值字段，自动扫描/手动重建统一以 `DeviceIdleService` 电量策略为准。
4. **插件与渲染对齐**：插件 `power` SDK 默认阈值与渲染侧 `useBatteryOptimizer` 统一读取 `DeviceIdle.blockBatteryBelowPercent`。
5. **前端入口下沉**：`SettingFileIndex` 的策略配置组改为常显，用户可直接配置统一 BatteryPolicy。
6. **回归保障**：新增 `battery-policy` 单测，覆盖策略归一化、critical 优先级、充电豁免与阈值裁剪行为。

**修改文件**:
- `packages/utils/common/battery-policy.ts`
- `packages/utils/common/index.ts`
- `packages/utils/__tests__/battery-policy.test.ts`
- `apps/core-app/src/main/service/device-idle-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useBatteryOptimizer.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 剪贴板自动粘贴/自动清除时间档位收敛

**变更类型**: 配置优化 / Bug 修复

**描述**: 调整工具设置中的时间档位，自动粘贴默认值改为 5 秒，自动清除默认值改为 5 分钟；同时将时间范围收敛为最短 1 秒、最长 5 分钟，并修复自动粘贴在从“禁用”切回定时值后偶发不生效的问题。

**主要变更**:
1. **默认值调整**：`tools.autoPaste.time` 默认改为 `5`（秒），`tools.autoClear` 默认改为 `300`（秒）。
2. **档位范围收敛**：自动粘贴/自动清除时间档位统一为 `1s ~ 5min`，移除 `10min/15min` 档位。
3. **生效逻辑修复**：`autoPaste.enable` 与 `autoPaste.time` 强绑定，避免历史 `enable=false` 遗留导致时间已切回但仍不触发自动粘贴。
4. **历史值兼容**：对超出新档位的历史时间值按最近档位归一，减少迁移冲击。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 剪贴板省电轮询项高级设置门禁修复

**变更类型**: Bug 修复 / 设置门禁一致性

**描述**: 修复工具设置中「剪贴板省电轮询策略」「剪贴板省电轮询间隔」在未开启高级设置时仍可见的问题，现仅在 `advancedSettings` 开启后展示。

**主要变更**:
1. **显示门禁补齐**：`SettingTools` 新增 `showAdvancedSettings` 计算属性，并将两个省电轮询项包裹在高级设置条件渲染下。
2. **行为一致性恢复**：与项目其他高级项保持一致，默认模式下不暴露高级策略配置。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app Nexus 数据上传说明与匿名模式登录门禁

**变更类型**: 体验优化 / 隐私策略收敛

**描述**: Nexus 数据分析设置移除独立说明行，改为“启用数据上传”后的帮助 Tooltip；匿名模式默认关闭且未登录时不可切换，并在运行时对未登录状态强制按 `false` 生效。

**主要变更**:
1. **说明形态调整**：将原“说明”文案收敛到“启用数据上传”后的 `?` 图标 Tooltip，并精简提示文本。
2. **匿名门禁**：匿名模式开关在未登录时禁用，UI 展示固定为关闭；登录后才允许切换。
3. **生效逻辑收敛**：主进程对匿名模式新增登录态门禁，未登录即使配置为开启也按关闭执行。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingSentry.vue`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/analytics/analytics-module.ts`
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts`

### Core-app 静默启动配置链路修复（dev/prod）

**变更类型**: Bug 修复 / 配置一致性修复

**描述**: 修复“静默启动”在开发与生产环境均可能不生效的问题。根因是设置页部分入口仍在读写历史分散键（如 `app.window.startSilent` 独立文件），而启动阶段与托盘逻辑读取的是 `app-setting.ini` 的 `window.startSilent`，导致配置来源不一致。

**主要变更**:
1. **主进程启动兼容**：`TouchApp` 启动前读取 `app-setting.ini` 时，兼容合并历史 `app.window.startSilent` 文件值（仅在历史文件更新更晚或主配置缺失时生效），并回写到 `app-setting.ini`，保证后续链路单一来源。
2. **设置页写入收敛（Window）**：`SettingWindow` 改为直接读写 `appSetting.window.*` 与 `appSetting.setup.autoStart`，不再写入历史分散键文件。
3. **设置页写入收敛（Setup）**：`SettingSetup` 移除对历史分散键的读写，统一使用 `appSetting` 持久化并保留托盘/开机自启实时同步调用。
4. **行为结果**：静默启动设置可在 dev/prod 一致生效，且后续修改不会再被历史分散键污染。
5. **开发环境窗口行为修复**：静默启动时不再自动打开 DevTools，避免 dev 下因 DevTools 自动弹出导致主窗口被显式激活。

**修改文件**:
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingWindow.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 布局方案与窗口透明度解耦

**变更类型**: 交互一致性修复 / 视觉策略收敛

**描述**: 布局方案（simple/flat/compact 等）不再驱动主界面 header/aside 的透明度。透明度统一由窗口偏好（Default/Mica/Filter）控制，避免切换布局时出现非预期明暗变化。

**主要变更**:
1. **类型模型清理**：`LayoutAtomConfig` 移除 `header.opacity` 与 `aside.opacity` 字段，布局模型不再承载透明度语义。
2. **默认值与预设清理**：应用默认布局原子与各布局 preset（simple/flat/compact/minimal/classic/card/dock）移除 opacity 字段，避免旧预设继续影响透明度。
3. **布局原子解析收敛**：`resolveLayoutAtomsToCSSVars` 不再输出 `header/aside` 的 opacity 变量，只保留布局结构相关变量（边框、高度、宽度、位置等）。
4. **Layout Shell 变量改造**：`header/aside` 的 fake opacity 改为读取 `--layout-window-*` 变量，不再依赖 `--layout-*opacity`。
5. **窗口偏好接管透明度**：`AppLayout` 按 `theme.window` 计算并注入 `--layout-window-header-opacity` / `--layout-window-aside-opacity`，实现“窗口偏好影响透明度，布局方案仅影响布局”。
6. **预设默认清理**：移除 `LayoutShell` 中按布局 preset 注入的透明度变量，避免默认值回流干扰。
7. **历史配置自动清洗**：主进程 Storage 在读取/保存 `app-setting.ini` 时自动移除 `layoutAtomConfig.header/aside.opacity` 遗留字段，并在后续持久化时写回清洗结果。

**修改文件**:
- `packages/utils/common/storage/entity/layout-atom-types.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/layout/atoms/presets.ts`
- `apps/core-app/src/renderer/src/modules/layout/atoms/atomResolver.ts`
- `apps/core-app/src/renderer/src/styles/layout/_layout-shell.scss`
- `apps/core-app/src/renderer/src/views/layout/shared/LayoutShell.vue`
- `apps/core-app/src/renderer/src/views/layout/AppLayout.vue`
- `packages/utils/__tests__/preset-export-types.test.ts`
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 布局预设编辑入口双门禁（Dev + 高级设置）

**变更类型**: 体验收敛 / 权限边界修正

**描述**: “自定义主界面 / 自定义 CoreBox / Nexus 预设” 三个 Beta 入口改为仅在 `dev` 启动版本且开启 `advancedSettings` 时可见，避免普通用户误触开发中能力。

**主要变更**:
1. **门禁条件统一**：`LayoutSection` 新增 `showPresetEditors`，仅在 `startupInfo.isDev === true && appSetting.dev.advancedSettings === true` 时显示入口。
2. **可见性收敛**：三个入口统一切换为条件渲染，非门禁状态下不占位、不展示。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/styles/LayoutSection.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app Header 左右分区透明度对齐 Sidebar

**变更类型**: 视觉一致性修复

**描述**: 窗口 Header 透明度按左右区域拆分：左侧（或右侧 Sidebar 对应区）与 Sidebar 保持相同透明度，另一侧保持 Header 透明度，避免顶部与侧栏交界处明暗不一致。

**主要变更**:
1. **Header 分区渲染**：将 Header 背景拆分为“侧栏对应区 + 主内容区”两段透明度。
2. **透明度对齐规则**：侧栏对应区使用 `--layout-window-aside-opacity`，主内容区使用 `--layout-window-header-opacity`。
3. **位置兼容**：适配 `aside-right`、`aside-bottom`、`aside-hidden` 三种布局位置，确保各模式下透明度行为一致。

**修改文件**:
- `apps/core-app/src/renderer/src/styles/layout/_layout-shell.scss`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 关于页条款入口接入官网文档跳转

**变更类型**: 体验修复 / 链路补齐

**描述**: 设置页「应用程序规范（Touch）」中的 `TalexTouch 服务条款` 与 `TalexTouch 软件许可证` 由仅展示文本改为可点击跳转，直接打开官网对应文档页面。

**主要变更**:
1. **条款链接接入**：点击 `服务条款` 跳转至 `Nexus /license`（服务条款页）。
2. **许可证链接接入**：点击 `软件许可证` 跳转至 `Nexus /protocol`（软件许可证页）。
3. **URL 来源统一**：链接基于 `getTuffBaseUrl()` 生成，避免硬编码域名。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 插件权限历史授权软禁用与预览读文件超时收敛

**变更类型**: 安全修复 / 稳定性修复 / 体验优化

**描述**: 修复插件权限在 Manifest 缩减后仍可沿用历史授权的问题。现在历史授权记录保留在本地存储中，但当权限未被当前 Manifest 声明时，运行时将拒绝访问；插件权限页同步提示“历史授权已禁用”。同时修复文件预览 `app:system:read-file` 在不可达路径场景下长时间阻塞导致的 IPC 超时报错。

**主要变更**:
1. **运行时权限收敛**：权限检查新增“声明态”约束，未在当前 Manifest 中声明的非默认权限即使历史上已授予，也不会在运行时生效。
2. **历史记录保留**：权限存储不删除历史授权记录，新增 `deprecatedGranted` 状态用于标记“保留但失效”的历史授权。
3. **插件页提醒**：插件详情权限页新增历史授权禁用提示区，按“应用更新后已过时 / 插件不再需要（曾授予）”两类标记展示，状态摘要支持显示“历史授权已禁用”。
4. **读文件超时控制**：`app:system:read-file` 新增可选超时参数并在主进程执行超时中断，Code/Text/Markdown 预览对超时给出用户友好提示，减少控制台噪音。
5. **快捷键入口迁移**：将“插件注册的全局快捷键”管理区从权限页迁移到详情页，权限页聚焦权限治理，详情页集中展示插件基础信息与运行配置。
6. **快捷键空态样式收敛**：插件详情页快捷键分组中的空态内层卡片去除圆角，避免与外层分组圆角叠加造成视觉噪点。

**修改文件**:
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/core-app/src/main/modules/permission/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
- `apps/core-app/src/renderer/src/components/render/addon/preview/CodePreview.vue`
- `apps/core-app/src/renderer/src/components/render/addon/preview/TextPreview.vue`
- `apps/core-app/src/renderer/src/components/render/addon/preview/MarkdownPreview.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/permission/index.ts`
- `packages/utils/permission/types.ts`
- `packages/utils/transport/events/types/app.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.test.ts`
- `packages/utils/__tests__/permission-status.test.ts`

### Core-app Market 新增 Tuff CLI Beta 页签联动

**变更类型**: 新功能 / 市场联动（Beta）

**描述**: Core-app 市场页新增 Tuff CLI 联动能力：当系统检测到已安装 `tuff` CLI 时，市场顶部出现 `CLI` 页签；当前阶段该页签仅提供 Beta 占位说明，标注“开发中”。

**主要变更**:
1. **安装检测接入**：平台能力列表查询时动态探测 `tuff --version`（含 Windows 候选命令），并引入 TTL 缓存降低探测频率。
2. **能力映射收敛**：检测通过后动态注入 `platform.tuff-cli` Beta 能力，供渲染层统一读取。
3. **市场页签联动**：`Market` 页按能力结果动态展示 `CLI` 页签，且在能力不可用时自动回退到 `market` 页签。
4. **Beta 占位页**：新增 `MarketCliBeta` 视图，展示“Beta Feature / 开发中”提示，明确当前交付状态。
5. **i18n 补齐**：补充中英文市场 CLI 文案键，保证多语言一致。

**修改文件**:
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/views/base/Market.vue`
- `apps/core-app/src/renderer/src/components/market/MarketHeader.vue`
- `apps/core-app/src/renderer/src/views/base/market/MarketCliBeta.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app PluginInfo 问题入口改为悬浮按钮 + Flip 弹窗

**变更类型**: 交互优化 / 可视反馈增强

**描述**: PluginInfo 页面移除独立「问题」Tab，改为右下角常驻悬浮 `?` 按钮；点击后使用 Flip 动画打开问题弹窗。按钮根据问题等级显示差异化呼吸光效，无问题时不展示入口。

**主要变更**:
1. **入口形态调整**：移除 `Issues` Tab，仅在存在 `plugin.issues` 时渲染右下角悬浮按钮。
2. **Flip 弹层接入**：接入 `TxFlipOverlay`，以悬浮按钮为 source 打开问题弹窗，弹层内复用 `PluginIssues` 内容。
3. **风险视觉分级**：warning 显示浅黄色呼吸环；error 显示更强红色呼吸光效并叠加阴影，提升问题感知优先级。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`

### Core-app 插件存储页汉化与配置分组迁移

**变更类型**: 体验优化 / i18n 收敛 / UI 组件标准化

**描述**: 插件存储页完成全量 i18n 接入，替换原自定义统计卡为 tuffex `TxStatCard`，并将插件详情页中的“配置系统（路径目录）”信息迁移到存储页，统一“存储 + 路径”操作入口。

**主要变更**:
1. **统计卡标准化**：存储页顶部四个数据卡改为 `TxStatCard`（含占用率 progress 变体），移除重复样式实现。
2. **页面文案汉化**：存储页标题、按钮、空态、表头、状态栏、路径配置区全部接入 i18n，不再存在硬编码英文。
3. **配置系统迁移**：在存储页新增 `TuffGroupBlock` 配置分组，承载插件路径/数据目录/配置目录/日志目录，并支持直接打开对应路径。
4. **详情入口下移**：存储文件表格从主卡片主体迁移为“配置系统”中的“详细信息”入口，点击按钮通过 `TxFlipOverlay` 打开完整表格详情。
5. **文案字典补齐**：补充 `plugin.storage.*` 中英文键，覆盖统计、空态、表格、底栏、配置区、详情入口与路径打开失败提示。
6. **路径展示收敛**：配置系统中的路径展示统一为 `~/` 别名样式（如 `~/data/`、`~/data/config/`），右侧操作入口统一使用 `TxButton` 图标按钮。
7. **整块迁移完成**：原“存储文件”整块（标题、操作按钮、文件表格、底栏状态）整体迁移到“详细信息”弹窗中；配置系统仅保留“详细信息”入口与路径配置项。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 插件详情开发设置分组下移与保存链路收敛

**变更类型**: 体验优化 / 可维护性修复

**描述**: 插件详情页改为“基础信息 + 开发设置分组”结构。开发配置不再通过弹窗管理，而是新增独立 `TuffGroupBlock` 下移展示；同时修复开发设置保存链路中的状态漂移问题，并补齐 manifest 全文查看能力。

**主要变更**:
1. **基础信息收敛**：详情页仅展示插件 ID、插件名称、插件描述；插件 ID 支持点击复制，hover 时仅对 ID 值增加下划线提示可复制。
2. **基础信息增强**：`自动启动` 从开发设置分组上移到基础信息分组；在“插件开发模式启用”或“应用处于 dev 环境”时提供 `manifest.json` 全文查看入口，后者显示 `Dev Only` 标记；点击后通过 Flip 动画弹出对话框，并以只读 JSON 编辑器展示全文。
3. **开发设置分组下移**：仅在插件启用开发模式时，在基础信息下方新增独立 `开发设置` 分组，展示保存、热重载、开发地址、源码模式。
4. **保存流程修复**：开发设置加载时统一读取最新 manifest 并建立快照，保存时合并写回 `manifest.dev`；主进程详情 API 改为按插件显示名/目录名双路匹配，避免保存请求命中失败。
5. **Dev 配置优先级修复**：开发模式加载远端 manifest 时，`plugin.dev` 统一以本地 manifest 的 dev 配置为准，避免热重载/开发地址/源码模式保存后被远端 manifest 覆盖。
6. **i18n 补齐**：新增中英文文案，覆盖插件名称、复制反馈、manifest 展开文案与加载态提示。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`

### Core-app Source Market Editor 滚动修复

**变更类型**: Bug 修复 / 交互可用性

**描述**: 修复 Source Market Editor 在来源项较多时无法滚动的问题，避免底部来源项被裁切后不可见。

**主要变更**:
1. **弹窗结构重写**：将 Source Editor 从绝对定位面板重构为 `TxFlipOverlay` 弹窗，统一使用 body 级遮罩和卡片容器，消除父级布局裁剪影响。
2. **新增入口上移**：新增来源入口改为 Header 区按钮。
3. **二次 Flip 弹窗**：新增来源表单改为独立 `TxFlipOverlay`（二级弹窗），与主来源弹窗解耦，打开/关闭均使用 Flip 动画。
4. **过时来源分区展示**：带 `outdated` 标记的来源在非高级模式默认隐藏；开启高级设置后在列表底部单独分区展示，不参与上方主列表排序索引。
5. **过时基线收敛**：默认来源中仅 `Tuff Nexus` 与 `NPM` 标记为非过时，其余内置来源标记为过时；对历史存储数据增加兼容归一化。
6. **拖拽排序保留**：主来源列表继续支持拖拽排序，且排序范围仅限非过时来源，避免与过时项发生索引干扰。
7. **滚动链路重建**：列表区改为 `TouchScroll native` 承载，使用 `flex + min-height: 0` 固定可滚动区域，确保长列表稳定可达。
8. **Flip 动画收敛**：来源列表使用 `TransitionGroup(source-flip)`，拖拽排序将 Sortable `animation` 设为 `0`，由 FLIP 过渡统一处理重排动画。
9. **来源定位增强**：市场页来源按钮点击时透传 source 元素，弹窗打开动画从触发点起始，交互反馈更明确。
10. **i18n 收敛**：Source Editor 页面文案（标题、副标题、按钮、占位符、来源类型与状态标签）接入中英文语言包，移除硬编码文本。
11. **弹窗尺寸微调**：主来源弹窗尺寸下调，降低遮挡；新增来源二级弹窗尺寸上调，提升表单可读性与可操作空间。
12. **表单组件统一**：新增来源二级弹窗内部输入控件统一替换为 tuffex `TxInput` / `TxSelect` / `TxSelectItem`，移除原生 `select` 与旧输入组件。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/market/MarketSourceEditor.vue`
- `apps/core-app/src/renderer/src/views/base/Market.vue`
- `apps/core-app/src/renderer/src/components/market/MarketHeader.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/storage/market-sources.ts`
- `packages/utils/market/constants.ts`

### Core App 工具设置下拉框返显修复

**变更类型**: Bug 修复 / 设置兼容性

**描述**: 修复 App Settings 中工具设置下拉框（自动粘贴、自动清除、剪贴板轮询）在旧配置数据下选择后不返显、持续显示“请选择”的问题。根因是历史数据存在字符串数值与结构漂移（如 `autoPaste` 形态不一致），导致 `TxSelect` 无法匹配当前值。

**主要变更**:
1. **配置形态校正**：在 `SettingTools` 初始化阶段补齐 `tools.autoPaste` 对象结构，避免 `v-model="appSetting.tools.autoPaste.time"` 在旧数据下写入失败。
2. **数值归一化**：对 `autoPaste.time`、`autoClear`、`clipboardPolling.interval`、`lowBatteryPolicy.interval` 增加统一的数字与可选值归一化，兼容历史字符串值并回落到安全默认值。
3. **禁用语义对齐**：当 `autoPaste.time === -1` 时同步修正 `autoPaste.enable`，避免 UI 与实际行为状态不一致。
4. **下拉值匹配增强**：`TxSelect` 增加字符串/数字值宽松匹配（如 `"180"` 与 `180`），避免历史字符串配置导致选项已存在但不回显。
5. **首屏返显修复**：`TuffBlockSelect` 改为 eager 挂载下拉内容，避免选项未挂载时 `TxSelect` 无法建立值到文案映射而首屏显示“请选择”。
6. **文案提取增强**：`TxSelectItem` 支持从默认 slot 文本提取 label（未显式传 `label` 时），避免选择后仅显示数字值（如 `180`）而不是“3 分钟”。
7. **兜底映射增强**：`TxSelect` 新增从 slot VNode 直接解析 value/label 的兜底逻辑，即使选项注册时机滞后也能在首屏用当前值解析展示文案。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockSelect.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelect.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelectItem.vue`
- `packages/tuffex/packages/components/src/popover/src/TxPopover.vue`
- `packages/tuffex/packages/components/src/popover/src/types.ts`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/base-anchor/src/types.ts`
- `packages/tuffex/packages/components/src/select/src/types.ts`

### Nexus OAuth 在 Cloudflare Workers 的 HKDF 兼容修复

**变更类型**: 登录稳定性 / Edge 兼容

**描述**: 修复 Nexus 在 Cloudflare Pages/Workers 上点击 LinuxDO OAuth 即返回 `OAuthSignin` 的问题。根因是 Workers 打包后 `@panva/hkdf` 被包装为 namespace，`next-auth` CJS 默认导入在运行时得到非函数对象，导致 state/pkce cookie 生成失败。

**主要变更**:
1. **依赖收敛**：通过 workspace overrides 固定 `@panva/hkdf` 版本，避免漂移引发的运行时导出形态不一致。
2. **入口强制收敛**：在 `nuxt.config.ts` 的 `nitro.alias` 与 `vite.resolve.alias` 中将 `@panva/hkdf` 强制映射到 `dist/node/cjs/index.js`，避免 Workers 打包选中 `worker` 条件导出后被 CJS 默认导入误包装。
3. **运行链路一致化**：Edge SSR 与 Functions 统一走 CJS 入口，保证 `next-auth` 的 HKDF 默认导入在 Cloudflare 运行时可调用。

**修改文件**:
- `package.json`
- `apps/nexus/nuxt.config.ts`

### Nexus 组件文档页 SSR 崩溃修复（NumberFlow）

**变更类型**: 稳定性修复 / Edge SSR 兼容

**描述**: 修复 `https://tuff.tagzxia.com/docs/dev/components/index` 在 Cloudflare Pages/Workers 上返回 500 的问题。根因是 `@number-flow/vue` 在 SSR 打包路径中触发 `HTMLElement is not defined`，导致页面服务端渲染异常。

**主要变更**:
1. **SSR 导入收敛**：将相关组件中的 `@number-flow/vue` 从静态导入改为 `import.meta.client` 条件下的异步组件加载，避免 server bundle 初始化时触发浏览器全局对象引用。
2. **降级渲染兜底**：在 NumberFlow 组件不可用时回退为纯文本数值渲染，确保 SSR 输出稳定可用。
3. **示例页同步修复**：同步修复 Nexus docs 相关 demo 组件，消除文档页触发同类崩溃的入口。

**修改文件**:
- `packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue`
- `apps/nexus/app/components/content/demos/AutoSizerNumberFlowDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardBasicDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardInsightVariantDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardProgressVariantDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardStatCardDemo.vue`

### Nexus docs 页面 hydration mismatch 收敛

**变更类型**: 稳定性修复 / SSR 一致性

**描述**: 修复 docs 页面在部署环境中偶发 `Hydration completed but contains mismatches` 的问题。根因是 SSR 与客户端在语言和右侧文档辅助区渲染时机不一致，导致 `DocsOutline` / `DocsAsideCards` 节点树不一致。

**主要变更**:
1. **语言首屏一致性**：`app.vue` 在服务端优先基于 `Accept-Language` 判定首屏语言，并在 SSR 阶段 `await setLocale(...)`，避免首屏英文渲染后客户端切换中文引发的 hydration mismatch。
2. **右侧文档辅助区客户端化**：`docs` 布局将右侧 `DocsOutline` 与 `DocsAsideCards` 包裹在 `ClientOnly` 内，规避依赖客户端状态的节点在 SSR 阶段与客户端阶段结构不一致。

**修改文件**:
- `apps/nexus/app/app.vue`
- `apps/nexus/app/layouts/docs.vue`

### Nexus PWA 导航回退冲突修复（刷新回首页）

**变更类型**: 部署稳定性 / PWA 与 SSR 兼容

**描述**: 修复部署后在 docs、OAuth 回调等路由刷新或回跳时被错误落到首页的问题。根因是 Workbox `navigateFallback: '/'` 与 SSR 路由冲突，Service Worker 将导航请求统一回退到首页 HTML，导致页面错配与 hydration mismatch。

**主要变更**:
1. **禁用导航回退匹配**：将 `workbox.navigateFallbackDenylist` 收敛为全量拒绝（`/.*/`），避免 Service Worker 对 SSR 页面导航请求命中首页回退。
2. **开发配置同步收敛**：删除 `devOptions.navigateFallback`，保证本地预览与线上行为一致。

**修改文件**:
- `apps/nexus/app/config/pwa.ts`

### Nexus Cloudflare 变量绑定冲突收敛（LINUXDO_ISSUER）

**变更类型**: 部署稳定性 / 配置收敛

**描述**: Cloudflare Functions 发布阶段出现 `Binding name 'LINUXDO_ISSUER' already in use`。将 `LINUXDO_ISSUER` 收敛为单处 wrangler 定义，避免环境变量重复绑定冲突。

**主要变更**:
1. **单点定义**：移除 `env.preview.vars` 中的 `LINUXDO_ISSUER`，仅保留顶层 `[vars]` 定义。

**修改文件**:
- `wrangler.toml`

### Nexus 实验内容噪点水印隐藏策略收敛

**变更类型**: 体验修复 / 水印策略

**描述**: Nexus 风控与水印策略收敛为环境变量单开关，未启用时统一关闭导航入口、页面访问与服务端 API，避免“入口隐藏但链路仍可访问”的不一致行为。

**主要变更**:
1. **单一开关**：新增 `NUXT_PUBLIC_WATERMARK_ENABLED` 与 `NUXT_PUBLIC_RISK_CONTROL_ENABLED`（默认关闭），分别控制水印与风险控制能力。
2. **导航统一收敛**：Dashboard Nav 根据开关动态隐藏 `watermark` 与 `risk` 入口。
3. **路由统一拦截**：新增全局路由中间件，关闭时阻断 `/dashboard/watermark`、`/dashboard/admin/risk` 与 `/admin/emergency` 访问。
4. **服务端统一拦截**：新增服务端特性中间件，关闭时对风险/水印 API 返回 404，避免绕过前端直连调用。
5. **水印链路收敛**：`useWatermarkDisplayPolicy` 与 `watermark-risk` 插件只读取环境开关；关闭时不挂载噪点层、风险弹层，也不注入水印 token header。
6. **运行时配置补齐**：`nuxt.config.ts` 同步暴露 `runtimeConfig.{watermark,riskControl}.enabled` 与 `runtimeConfig.public` 对应字段。

**修改文件**:
- `apps/nexus/app/composables/useWatermarkDisplayPolicy.ts`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/plugins/watermark-risk.client.ts`
- `apps/nexus/app/middleware/feature-gates.global.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/server/middleware/feature-gates.ts`
- `apps/nexus/server/middleware/watermark-guard.ts`
- `apps/nexus/server/utils/runtime-features.ts`
- `apps/nexus/README.md`

### Core-app 设置项位置调整（详细信息与搜索引擎日志）

**变更类型**: 体验优化 / 设置分组整理

**描述**: 将「详细信息」与「搜索引擎日志」两个开关从「实用工具」分组迁移到「应用程序规范（Touch）」分组，保证设置语义与分组一致。

**主要变更**:
1. **分组迁移**：在 `SettingAbout` 中新增两个开关入口，并复用原有配置字段。
2. **工具页收敛**：从 `SettingTools` 移除上述两个开关，减少实用工具分组噪音。
3. **高级设置门禁**：仅当“高级设置”开启后显示这两个开关，默认隐藏。
4. **国际化迁移**：中英文文案从 `settingTools` 收敛到 `settingAbout`。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app 窗口协议统一（WindowRole）

**变更类型**: 架构治理 / 稳定性修复

**描述**: 统一 main/preload/renderer 的窗口参数协议解析与模式判定，消除 `touchType/coreType/assistantType/metaOverlay` 在多处手写字符串导致的漂移风险；`omni-panel` 全链路由单一协议模块驱动。

**主要变更**:
1. **协议单一来源**：新增 `window-role` 模块，统一导出窗口角色常量、类型、参数构建/解析与渲染模式解析函数。
2. **主进程发参收敛**：所有窗口 `additionalArguments` 改为通过 `buildWindowArgs` 生成，移除分散手写参数字符串。
3. **解析链路统一**：`arg-mapper` 改为复用统一协议解析，同时保留原有 API 外观与原始未知值记录能力。
4. **入口路由收敛**：`AppEntrance` 改为单入口 mode 分发；未知 `coreType` 在开发态告警并安全回退 CoreBox。
5. **预加载收敛**：移除 DivisionBox 预加载全局特判标记，改为协议判定；保留 MetaOverlay hash/参数双路径识别。
6. **测试补齐**：新增 `window-role` 单测，覆盖构建、解析、未知值降级和模式映射。

**修改文件**:
- `packages/utils/renderer/window-role.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `packages/utils/renderer/index.ts`
- `packages/utils/__tests__/renderer/window-role.test.ts`
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/modules/devtools/app-entrance-log.ts`
- `apps/core-app/src/renderer/src/modules/hooks/core-box.ts`

## 2026-02-22

### Core-app Assistant（阿洛 aler）悬浮球与语音唤醒

**变更类型**: 新功能 / AI 默认能力接入

**描述**: 新增 Assistant 悬浮球与语音面板窗口，语音唤醒从 Porcupine 路线切换为浏览器 SpeechRecognition；同时 Intelligence 默认绑定内置 Tuff Nexus provider，并在主进程注入登录令牌，用户无需手动配置 provider 即可直接使用 AI 能力。

**主要变更**:
1. **悬浮球窗口**：新增独立 assistant touchType 的悬浮球窗口，支持位置拖拽与持久化。
2. **语音唤醒**：悬浮球侧实现 Web Speech 连续监听，默认唤醒词为“阿洛 / aler”，命中后打开语音面板。
3. **语音面板**：新增语音转写面板，可将识别文本直接提交到 CoreBox 输入并触发后续搜索流程。
4. **快捷键策略**：CoreBox 相关系统快捷键改为默认注册但禁用，避免首次安装即占用默认组合键。
5. **Intelligence 默认 provider**：`tuff-nexus-default` 默认启用并绑定核心文本能力；主进程加载配置时自动注入 auth token（无 token 时走 guest 占位）。
6. **权限能力扩展**：系统权限检查增加麦克风权限查询/请求通道，为语音能力提供统一权限入口。
7. **实验开关默认态**：Assistant 实验开关默认关闭，且悬浮球与语音唤醒默认关闭；仅在用户显式启用后生效。主进程需带 `TUFF_ENABLE_ASSISTANT_EXPERIMENT=1` 启动参数才会加载 Assistant 模块。

**修改文件**:
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/assistant/index.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/modules/ai/intelligence-config.ts`
- `apps/core-app/src/main/modules/system/permission-checker.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/App.vue`
- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/renderer/src/views/assistant/FloatingBall.vue`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `packages/utils/transport/events/assistant.ts`
- `packages/utils/types/intelligence.ts`

**实现说明**:
- `docs/plan-prd/04-implementation/AssistantExperiment-VoiceFloatingBall-260223.md`

### Core-app OmniPanel（全景面板）命名统一与配置入口

**变更类型**: 功能增强 / 交互入口

**描述**: 全景面板统一命名为 `OmniPanel`，并新增设置页配置入口，支持按需启停快捷键与右键长按唤起。

**主要变更**:
1. **命名统一**：主进程模块、事件、窗口参数、preload 标记与渲染入口统一为 `omni-panel` / `OmniPanel`。
2. **配置入口**：设置页增加 `OmniPanel 快捷键` 与 `OmniPanel 右键长按唤起` 两个开关。
3. **运行时生效**：主进程监听 APP_SETTING 变化，实时更新全局快捷键启用状态与鼠标长按 Hook。
4. **快捷键可读性**：快捷键管理面板增加 `core.omniPanel.toggle` 的中英文展示文案。
5. **国际化键收敛**：补齐 `corebox.omniPanel.*` 文案并新增统一 i18n key 常量，避免硬编码。

**修改文件**:
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/shared/events/omni-panel.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `packages/utils/i18n/message-keys.ts`
- `packages/utils/i18n/index.ts`

### Core-app OmniPanel 触发方式接入快捷方式管理

**变更类型**: 功能增强 / 交互一致性

**描述**: OmniPanel 的键盘快捷键与鼠标右键长按触发统一接入 `global-shortcon` 管理，快捷方式弹窗可直接查看并启停两种触发方式。

**主要变更**:
1. **ShortcutType 扩展**：新增 `trigger` 类型，支持非键盘触发方式的统一存储与展示。
2. **主进程接入**：`global-shortcon` 新增 `registerMainTrigger`，触发项参与状态管理但不走 `globalShortcut.register`。
3. **OmniPanel 注册**：主进程注册 `core.omniPanel.toggle`（键盘）与 `core.omniPanel.mouseLongPress`（鼠标右键长按）两条系统触发项。
4. **设置页收敛**：移除 OmniPanel 独立开关，改为在快捷方式管理弹窗集中配置启停。
5. **弹窗展示增强**：快捷方式表格支持“快捷键/触发方式”混合展示，鼠标触发显示为只读触发标签。
6. **文案补齐**：中英文补充 OmniPanel 鼠标触发标签与行描述，保证可读性一致。

**修改文件**:
- `packages/utils/common/storage/entity/shortcut-settings.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/shortcut-dialog.types.ts`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialogRow.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app OmniPanel 启动链路修复与模块 Env Gate

**变更类型**: 稳定性修复 / 架构治理

**描述**: 修复 OmniPanel 未进入主进程加载链路与渲染入口误路由问题；同时为 `BaseModule` 增加 `env` 自动启用门控，支持按环境变量控制模块加载。

**主要变更**:
1. **模块 Env Gate**：`BaseModule` / `IBaseModule` 新增 `env` 属性，ModuleManager 仅在对应 env flag 启用时自动加载模块。
2. **Assistant 收敛**：Assistant 改为声明式 env 门控（`TUFF_ENABLE_ASSISTANT_EXPERIMENT`），移除模块内部重复判断逻辑。
3. **OmniPanel Env 门控**：OmniPanel 改为声明式 env 门控（`TUFF_ENABLE_OMNIPANEL_EXPERIMENT`），与 Assistant 保持一致的模块启用策略。
4. **OmniPanel 主进程接入**：`omniPanelModule` 正式加入 `modulesToLoad`，快捷键、鼠标触发与 IPC 处理器可正常初始化。
5. **OmniPanel 渲染入口**：AppEntrance 按 `coreType=omni-panel` 渲染独立 `OmniPanel` 视图，不再误落到 CoreBox。
6. **arg-mapper 类型补齐**：`coreType` 增加 `omni-panel`，并新增 `isOmniPanel()` 判断函数。
7. **选中文本捕获优化**：macOS 优先尝试通过 AXSelectedText 直读选中文本；复制兜底路径改为完整剪贴板快照恢复，避免覆盖图片/文件/HTML 剪贴板内容。

**修改文件**:
- `packages/utils/types/modules/module.ts`
- `apps/core-app/src/main/modules/abstract-base-module.ts`
- `apps/core-app/src/main/core/module-manager.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`

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

### Nexus OAuth redirect_url 套娃与 sign-in 500 修复

**变更类型**: 行为修复 / 登录稳定性

**描述**: 登录失败重试场景下，`callbackUrl/error/oauth` 等中间态参数可能被带入 `redirect_url` 并反复嵌套，导致 URL 膨胀、刷新 `/sign-in` 出现 500。现统一净化回跳地址并阻断回跳到认证中间页。

**主要变更**:
1. **统一净化**：`sanitizeRedirect` 清理 `callbackUrl/callback_url/oauth/error` 等临时参数。
2. **认证路径阻断**：回跳目标命中 `/sign-in` 或 `/api/auth/signin` 时回落到安全默认页。
3. **入口收敛**：Header、用户菜单、全局认证重定向、sign-up 跳转统一复用净化逻辑。
4. **同源 fallback 拒绝**：OAuth 授权地址若解析为同源 URL（如 `/?callbackUrl=...`）直接判定为 provider fallback 错误，阻断 `window.location.assign`。
5. **服务端重定向兜底**：Auth redirect callback 识别并收敛 `/?callbackUrl=...` 异常回跳，统一回落到 `/sign-in` 错误页，避免前端缓存旧逻辑时再次套娃。
6. **Auth 响应层改写**：对 `/api/auth/signin/*` 的 JSON `url` 与 `Location` 响应头统一执行 fallback 规范化，确保旧前端缓存命中时也不会继续跳转到 `/?callbackUrl=...`。

**修改文件**:
- `apps/nexus/app/composables/useOauthContext.ts`
- `apps/nexus/app/components/TheHeader.vue`
- `apps/nexus/app/components/HeaderUserMenu.vue`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/pages/sign-up/index.vue`
- `apps/nexus/server/utils/__tests__/useOauthContext.test.ts`
- `apps/nexus/server/api/auth/[...].ts`

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
