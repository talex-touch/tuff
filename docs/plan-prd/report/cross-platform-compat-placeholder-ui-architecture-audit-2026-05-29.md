# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-05-29）

> 范围：`apps/core-app`、`apps/nexus`、`packages/*`、`plugins/*`、`docs/plan-prd` 当前 live tree。
> 口径：基于 2026-05-25 审计继续复核，重点看 2026-05-27 之后 UI 文档/demo、发布门禁、性能基线与生产路径占位/兼容债务变化。

## 总结

- **P0 结论**：本轮未发现新的生产路径 fixed fake-success、mock 支付 URL、伪成功空结果或可消费占位 payload。历史 AI compat 退役口径仍是 `410` + migration target，不是可消费成功响应。
- **UI 适配度**：Nexus/TuffEx 侧从“组件 API 文档覆盖”明显推进到“可截图验证的组合 demo 覆盖”；Dashboard 小趋势图已收敛到 ECharts wrapper，少了一批手写 SVG。CoreApp 侧主题解析与 CoreBox 注入主题已统一，但旧 dialog 体系、TuffEx dialog HTML message、局部高圆角/`fake-*` 视觉命名仍让设计语言不够干净。
- **完善度**：文档和 demo 覆盖更完整，但真实产品证据还没完全闭环。Nexus Data Governance 仍不能把 `source: memory` 或 local-only evidence 当生产完成；TuffEx docs 仍缺自动截图 smoke 与 375/768/1440 响应式证据。
- **架构健壮性**：最大风险仍是 retained legacy aliases 没有 hit telemetry/hard-cut 倒计时，导致 SDK Hard-Cut 的真实迁移完成度不可观测；旧 snippets placeholder 插件仍留在生产插件树，容易污染 Store/inventory 口径。

## 本轮增量输入

- 2026-05-27 后新增多组 Nexus/TuffEx 组合 demo：data operations、navigation shell、feedback task center、permission orchestration、release policy forms，并同步双语组件文档与 composition tutorial。
- Dashboard 趋势图从页面内手写 SVG 迁到 `DashboardSparklineChart.client.vue` / `DashboardMetricChart.client.vue` 等图表封装，方向比一次性 SVG 更可维护。
- 2026-05-28 新增 CoreApp 性能基线执行计划，明确启动、CoreBox、runtime、build/package 四条性能证据线，但未改变 release gate。
- `@talex-touch/tuffex@0.3.7` 发布阻断已定位到 lockfile specifier 与 publish-safe manifest 口径，并补 package workflow path filter；这是包发布质量门禁改善，不是 UI runtime 行为变化。

## UI 适配度与观感评分

| 模块 | 评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.0 / 10 | CoreBox、Assistant、设置、插件详情已具备桌面工具的密度和效率；主题解析更一致。扣分点是旧 dialog、局部 `v-html` message、历史视觉命名与部分非 TuffEx 旧组件仍并存。 |
| Nexus 文档与生态站 | 7.6 / 10 | TuffEx composition demo 与 dashboard chart wrapper 明显提升完整度；文档站/治理页结构清晰。扣分点是治理 evidence source 分层仍需要更强 UI 标记，生产/preview operator evidence 未闭环。 |
| TuffEx 组件体系 | 7.4 / 10 | 组件页和组合 demo 覆盖面继续提升，已经能支撑“截图验收”的入口。扣分点是 visual screenshot smoke 还不是自动门禁，dialog message API 仍默认 HTML 渲染，不够安全也不够优雅。 |
| 官方/示例插件 UI | 6.4 / 10 | `touch-snippets` 等核心插件方向明确，但 `touch-text-snippets` / `touch-code-snippets` 仍是空 feature legacy placeholder；`touch-music` 等示例插件仍有调试 console，观感和生产质量参差。 |

整体判断：当前视觉方向不是“丑”，而是“局部不统一、证据不够硬”。对桌面指令中心来说，安静、密集、可扫描、状态清楚比营销式视觉更重要；当前主线应继续做统一状态/弹窗/证据来源，而不是重做大范围皮肤。

## 高信号发现

### P1：retained legacy aliases 仍缺 hit telemetry 与 hard-cut 节点

证据：

- `apps/core-app/src/main/modules/auth/index.ts` 仍通过 `registerAuthHandler(primary, legacy, handler)` 双注册 Auth / Account 事件，并继续广播 `AuthEvents.legacy.stateChanged`。
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` 仍保留 CoreBox show/hide/expand/focus/input/provider/uiMode/layout 等 legacy handler。
- `apps/core-app/src/main/modules/sync/index.ts`、`apps/core-app/src/main/modules/terminal/terminal.manager.ts`、`apps/core-app/src/main/modules/addon-opener.ts` 仍保留 Sync / Terminal / Opener legacy listener 或 legacy send。
- Renderer 仍有 `CoreBoxRetainedEvents.legacy.*` consumer，例如 `usePreviewHistory`、`useActionPanel`、`useVisibility`、`CoreBox.vue`。

判断：

- 这不是新 P0，因为 canonical typed events 已存在，legacy 侧是 retained alias。
- 但在 SDK Hard-Cut 目标下，缺少“legacy hit 为 0”的证据会让迁移完成度不可证明。

建议：

1. 给 Auth / Sync / Terminal / CoreBox legacy alias 增加统一 hit telemetry，事件族聚合即可，不记录敏感 payload。
2. 从 Terminal / Sync 这种事件族较小的面开始设 hard-cut：N 天 hit 为 0、renderer consumer 已迁、最近路径 test 通过后删除 legacy listener。
3. 在 lint 或 focused grep 中禁止新增业务代码直接调用 `*.legacy.*`，迁移 bridge 文件例外。

### P1：旧 snippets placeholder 插件仍污染生产插件树

证据：

- `plugins/touch-text-snippets/manifest.json`：`description` 为 `Legacy placeholder. 文本片段已收口到 touch-snippets。`，`features: []`。
- `plugins/touch-code-snippets/manifest.json`：同样是空 feature legacy placeholder。

判断：

- 空 feature 不提供 fake-success，风险低于 P0。
- 但它会干扰 Store、inventory、插件完整度和用户认知：用户看到的是一个可安装插件包，却没有可执行能力。

建议：

1. 若仅用于迁移提示，补 `deprecated/hidden/replacedBy` metadata，并让 Store/CoreApp 显示迁移目标 `touch-snippets`。
2. 若不再需要，制定发行退场与用户数据迁移说明，从内置/官方清单中移除。
3. 不再新增空 feature placeholder 插件；需要迁移提示时使用显式迁移包语义。

### P1：Nexus `source: memory` 仍需生产证据隔离

证据：

- `apps/nexus/server/api/pageview.ts`
- `apps/nexus/server/api/docs/view.post.ts`
- `apps/nexus/server/api/docs/view.get.ts`
- `apps/nexus/server/api/admin/analytics/docs.get.ts`
- `apps/nexus/server/api/docs/engagement.post.ts`
- `apps/nexus/server/api/docs/comments.get.ts`

判断：

- 返回 payload 已带 `source: 'memory'`，没有伪装成 D1 成功，因此不是 P0。
- 但 analytics/governance UI 若把 memory source 计入 ready，会误导生产状态。当前 governance 层已经有 `local-only` 状态类型，这是正确方向，需要继续推广到所有证据汇总。

建议：

1. 所有 admin/governance 汇总按 `d1/r2/live-provider`、`local-only`、`memory` 分层展示。
2. 生产/preview operator evidence 只接受 D1/R2/live provider，不接受 `source: memory` 作为完成证据。
3. 对 docs analytics/comments/pageview 增加一张 evidence source matrix，避免后续报告混用。

### P1：dialog message 默认 HTML 渲染仍不优雅

证据：

- CoreApp 旧组件：`TPopperDialog.vue`、`TBlowDialog.vue`、`TouchTip.vue`、`TDialogMention.vue` 直接对 `message` 做 `v-html`。
- TuffEx 组件：`TxPopperDialog.vue`、`TxBlowDialog.vue`、`TxTouchTip.vue` 也对 `message` 做 `v-html` 或 `message.replace('\n', '<br />')`。

判断：

- 这类组件通常被当作基础 UI 原语，默认 HTML 渲染会把 sanitization 责任外溢给调用方。
- 不一定存在当前可利用 XSS，但 API 设计不符合“默认文本、安全显式开启 HTML”的质量基线。

建议：

1. 新增 `messageText` / `messageHtml` 或 `html` 显式 prop，默认渲染文本并用 CSS `white-space: pre-line` 处理换行。
2. 对历史调用点逐个迁移；确需 HTML 的调用点标注 trusted source。
3. TuffEx 与 CoreApp 旧 dialog 同步治理，避免组件库修了但产品仍绕回旧实现。

### P2：preload 静态 overlay 仍有受控 `innerHTML`，debug 日志风险已缓解

证据：

- `apps/core-app/src/preload/index.ts` 仍用 `oStyle.innerHTML = styleContent` 与 `container.innerHTML = ...` 构建静态 loading overlay。
- 2026-05-26 已把 debug panel 运行时日志改为 `createElement` + `textContent`，不再把日志 message 作为 HTML 拼接。

判断：

- 当前剩余 `innerHTML` 是静态受控 markup/style，不是动态日志或用户输入路径，风险低于 2026-05-25。
- 若继续追求高敏感边界最小攻击面，后续可把 container 也改为 DOM API 构建，但优先级低于 dialog 和 legacy telemetry。

### P2：Widget runtime `new Function` 仍需保持 sandbox 边界审计

证据：

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍有 `new Function(...)` executor。

判断：

- 该点已属于 Widget runtime sandbox 声明边界，不是新增 fake/unsafe implementation。
- 但它必须持续接受输入约束、facade、权限、错误隔离和 regression smoke 约束；不能被复制到普通 PreviewSDK 或业务 parser。

### P2：裸 console 仍以示例插件、Nexus fallback、renderer legacy channel 为主

证据：

- `plugins/touch-music/*` 仍有多处 `console.log`。
- `apps/nexus/server/utils/*` 中有 D1/memory fallback warning。
- `apps/core-app/src/renderer/src/modules/channel/channel-core.ts` 仍有 channel error/slow log。

判断：

- CLI 包与脚本里的 `console.log` 是正常用户输出，不纳入问题。
- Nexus fallback warning 是可观测性的一部分，但应避免把“内存降级”写成完成状态。
- 示例插件调试 log 不阻塞 release，但会拉低官方插件观感。

## 下一步建议

1. **先做 legacy alias hit telemetry/hard-cut**：从 Terminal / Sync 开始，小切片、低风险、能直接服务 SDK Hard-Cut。
2. **处理旧 snippets placeholder 退场**：确定 hidden/deprecated/replacedBy 还是移除发行；不要让空插件继续作为官方能力出现。
3. **做 dialog 文本/HTML 分流**：先 TuffEx，再 CoreApp 旧 dialog，默认文本化，HTML 显式 trusted。
4. **补 Nexus evidence source matrix**：把 `memory/local-only/d1/r2/live-provider` 进入治理页和报告模板，避免生产完成度被 dev smoke 污染。
5. **落 TuffEx visual screenshot smoke**：从 5 月 27 日新增组合 demo 入手，覆盖 375 / 768 / 1440、light/dark、reduced motion；组件文档存在和视觉验收通过分开打标。
6. **保持 CoreApp 性能基线独立推进**：先采集数据，不在缺少 benchmark 前做高风险重构。

## 文档同步

- 本报告已作为 2026-05-25 报告的增量入口接入 `README`、`TODO`、`CHANGES`、Roadmap、Quality Baseline 与 `docs/INDEX.md`。
- 本轮是审计与文档同步，不代表上述 P1/P2 代码债务已修复。
