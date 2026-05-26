# 跨平台兼容、占位实现、UI 适配与架构健壮性审计（2026-05-25）

> 范围：`apps/core-app`、`apps/nexus`、`packages/utils`、`plugins` 与 `docs/plan-prd` 当前入口。
> 结论级别：未发现新的 P0 生产 fake-success；剩余问题主要是 P1/P2 的兼容退场、UI evidence、调试面清理与真实环境闭环。

## 总结

- **兼容性状态**：当前 live tree 没有发现新的“固定假成功 + 可消费业务 payload”的 P0。AI retired compat 仍保持 HTTP `410` 口径，shell/network capability 的 fail-closed 收口也已进入主线。
- **UI 适配度**：CoreApp 主入口和 Nexus 管理/文档面已经从“功能可见”进入“证据驱动收口”阶段；TuffEx 组件文档覆盖正在扩展，当前工作树还存在 Tag 文档/demo 未提交改动。真正缺口不在视觉方向，而在跨视口真实截图、失败态、权限拒绝态和生产/preview operator evidence。
- **完善度**：Nexus Data Governance / Provider Registry 已有本地 admin hydration 与 i18n 稳定化证据，但生产/preview 认证、live send、live object storage、production D1 migration/backfill、真实 provider quota 仍不能标记完成。
- **代码优雅度**：高信号债务集中在 legacy retained aliases、preload 调试 DOM 渲染、裸 console、内存 fallback 的治理边界、旧 snippets placeholder 插件退场，以及部分组件仍依赖 `v-html`/HTML 字符串。

## 扫描口径

- 生产路径关键词：`placeholder`、`fake`、`mock`、`stub`、`legacy`、`compat`、`fallback`、`TODO`、`console.*`、`innerHTML`、`v-html`。
- 排除项：测试 mock、i18n placeholder、CSS placeholder 变量、正常空态文案、已被显式标注为 diagnostic / evidence 的样本。
- 抽样证据：
  - retained legacy event 使用约 80 处，仍集中在 CoreBox/Auth/Sync/Terminal/Opener 等迁移面。
  - CoreApp/Nexus 生产目录裸 `console.*` 约 249 处，包含 preload、Nexus API fallback、工具层日志等不同风险等级。
  - `innerHTML` / `v-html` 约 32 处，既有受控 escape，也有对传入 `message` 的历史组件 HTML 渲染。

## 重点发现

### P1：legacy retained aliases 仍是最大兼容退场面

证据：
- `apps/core-app/src/main/modules/auth/index.ts` 仍通过 `registerAuthHandler(primary, legacy, handler)` 双注册 Auth / Account 事件。
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` 仍对 CoreBox show/hide/input/provider/layout/uiMode 等能力保留 legacy handler。
- `apps/core-app/src/main/modules/sync/index.ts` 与 `apps/core-app/src/main/modules/terminal/terminal.manager.ts` 同样保留 canonical + legacy 双监听。

判断：
- 这不是新的 P0，因为主链已有 canonical typed event，legacy 侧是 retained alias。
- 但它仍是 hard-cut 目标中最容易回潮的部分，长期保留会让“哪些 consumer 已迁完”不可见。

下一步：
1. 给 Auth / Sync / Terminal / CoreBox legacy alias 增加 hit telemetry 或最近路径 grep 证据。
2. 按事件族写 hard-cut checklist：consumer 已迁移、legacy hit 为 0、release N+1 再删除。
3. 禁止新 feature 直接依赖 `*.legacy.*`，只允许迁移期 bridge 使用。

### P1：旧 snippets 插件仍以空 feature placeholder 留在生产插件树

证据：
- `plugins/touch-text-snippets/manifest.json`：`description` 标注 `Legacy placeholder`，`features: []`。
- `plugins/touch-code-snippets/manifest.json`：同样为空 feature placeholder。

判断：
- 不是 fake-success，因为空 feature 不提供可执行业务结果。
- 但它会污染 Store / plugin inventory / 迁移完成度，用户也无法从包本身看到迁移动作。

下一步：
1. 明确是保留迁移提示包，还是从生产发行/内置清单中退场。
2. 若保留，补迁移 metadata、hidden/deprecated 标记与 UI 可见迁移目标。
3. 若退场，补用户数据迁移和 rollback 说明。

### P1：Nexus memory fallback 需要继续区分 dev smoke 与生产证据

证据：
- `apps/nexus/server/api/pageview.ts` 在 D1 不可用时返回 `{ source: 'memory' }`。
- `apps/nexus/server/api/docs/view.*`、`docs/comments.get.ts`、`docs/engagement.post.ts` 等也存在 `source: 'memory'` 分支。

判断：
- 不是 P0，因为返回值带有 `source`，没有伪装成 D1 持久成功。
- 但 Data Governance / analytics 类视图若把 memory source 汇总成运营完成度，会误导生产状态。

下一步：
1. 对所有 governance/analytics UI 明确展示 `memory/local-only` 标记。
2. 生产/preview operator evidence 必须使用 D1/R2/真实 provider，不接受 memory source 作为闭环。
3. 把 `source: 'memory'` 的 API 列入证据分类表。

### P1：preload debug panel 使用 HTML 字符串拼装日志（2026-05-26 已收口）

证据：
- `apps/core-app/src/preload/index.ts` 用 `container.innerHTML` 构建 loading overlay。
- debug log 渲染处使用 `body.innerHTML = debugList.map(...)`，虽然入口受 `DEBUG` 或 `debug-preload` 控制，但日志 message 未在该分支统一转义。

判断：
- 不是当前 P0，因为生产默认不进入 debug-preload；loading overlay 主文案使用 `textContent` 更新。
- 但 preload 是高敏感边界，`innerHTML` 拼日志不符合当前质量基线里的“裸 console / DOM 注入面收口”方向。

下一步：
1. 已于 2026-05-26 把 debug panel 与 debug log 行改为 `document.createElement` + `textContent` / `replaceChildren`。
2. 静态 loading overlay 与 logo markup 仍作为受控构建资产边界保留，不和运行时日志混为一谈。
3. 已清理同一段 `debug-preload` 下的 preload `console.log` 噪音。

### P2：历史 dialog 组件仍暴露通用 `v-html` message 渲染

证据：
- `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TouchTip.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TBlowDialog.vue`

判断：
- `CoreIntelligenceAnswer.vue` 已先 escape 再 `v-html` 换行，风险较低。
- 但基础 dialog 的 `message` 通用 HTML 渲染会让调用方承担 sanitization，长期看不够优雅。

下一步：
1. 新增 `messageHtml` / `messageText` 显式分流，默认只走文本。
2. 对确需 HTML 的历史调用点逐个标注 trusted source。
3. 把 `eslint-disable vue/no-v-html` 的组件列成小清单分批治理。

### P2：UI 文档覆盖增强，但还缺真实视觉 evidence

证据：
- 当前工作树已有 Tag 组件文档/demo 扩展：`TagClosableDemo.vue`、`TagIconDemo.vue`、`TagStateDemo.vue` 等未提交文件。
- `docs/plan-prd` 已记录 TuffEx 基础组件与 per-component docs 首批覆盖。

判断：
- 组件 demo 方向是对的：覆盖 closable/icon/state/disabled 比只写 API 更接近真实使用。
- 缺口是 visual regression 与 responsive 截图，没有足够证据判断“好看与否”和跨视口适配是否稳定。

下一步：
1. 对 TuffEx docs 增加组件页 screenshot smoke：375 / 768 / 1440 三档。
2. 优先覆盖 Tag、Button、Dialog、CommandPalette、DataTable、Empty/ErrorState。
3. 把“组件文档存在”与“视觉验收通过”分开标记。

## UI 适配度与观感评价

### CoreApp

- **优势**：CoreBox、Assistant、Plugin feature detail、Widget preview 已有密度较高的工作台形态，符合桌面指令中心的工具属性；状态 chips、capability metadata、失败态文案逐步变强。
- **不足**：部分页面仍有历史视觉语言混杂，例如 `fake-background`、高圆角 dialog、旧弹窗按钮文案与 TuffEx 新组件不完全一致；真实跨平台视觉 evidence 仍不足。
- **建议**：优先做统一弹窗/状态/空态收口，而不是重做主界面风格。

### Nexus

- **优势**：文档站、Provider Registry、Data Governance 已能支撑开发者与运营视角；管理页最近已处理 hydration 与 i18n 稳定性。
- **不足**：治理页仍以本地 evidence 为主，生产/preview operator 路径不完整；大量 dashboard 信息需要更清晰的 priority queue 与 evidence source 标记。
- **建议**：Data Governance 下一阶段先补生产证据与 source 分层，再扩运营大屏。

### TuffEx Docs

- **优势**：组件覆盖面正在提升，demo registry 已能按组件加载大量示例。
- **不足**：覆盖不等于视觉质量，当前还缺自动截图、交互 smoke 与移动宽度检查。
- **建议**：把 docs demo 改成 visual contract 的入口，避免组件库继续靠人工观感验收。

## 下一步优先级

1. **P0/P1 evidence 收口**：Windows/macOS release-blocking 手工证据、Nexus production/preview operator evidence、真实 provider quota fail-closed。
2. **legacy hard-cut 小切片**：先从 Terminal / Sync 这类事件族较小的 legacy alias 做 hit telemetry 与删除门槛。
3. **preload / dialog 安全面清理**：`innerHTML` debug log 改文本节点，基础 dialog 默认文本化。
4. **placeholder 插件退场策略**：`touch-text-snippets` / `touch-code-snippets` 明确保留迁移包还是发行退场。
5. **TuffEx visual smoke**：从当前 Tag 文档/demo slice 开始补截图与响应式验收。

## 文档同步

- `README / TODO / INDEX / Roadmap / PRD-QUALITY-BASELINE` 需要同步本报告入口与 2026-05-25 审计口径。
- `CHANGES` 记录本次为文档审计收口，不代表代码修复已完成。
