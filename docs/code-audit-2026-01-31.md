# 代码审视记录（2026-01-31）

范围：基于仓库当前状态的“严格审视”，重点关注潜在安全问题、功能完整性缺口与明显架构/实现不优雅之处。  
方法：全仓模式检索（TODO/FIXME/ts-ignore/any/v-html 等）+ 关键模块抽样阅读。  
说明：未运行测试；该记录为“当前观察”，非全量证明。

## 主要问题（按风险排序）

### High / 安全
1) **未消毒的 `v-html`（更新日志）**  
   - 自制 Markdown 转换不会转义原始 HTML，且 `target="_blank"` 未加 `rel="noopener"`。  
   - 位置：`apps/core-app/src/renderer/src/components/download/UpdatePromptDialog.vue:92`, `apps/core-app/src/renderer/src/components/download/UpdatePromptDialog.vue:109`, `apps/core-app/src/renderer/src/components/download/UpdatePromptDialog.vue:235`

2) **远端 README 渲染未消毒**  
   - `marked.parse` 后直接 `v-html` 输出，来源若可控则存在 XSS 风险。  
   - 位置：`apps/core-app/src/renderer/src/composables/market/useMarketReadme.ts:24`, `apps/core-app/src/renderer/src/composables/market/useMarketReadme.ts:28`, `apps/core-app/src/renderer/src/views/base/MarketDetail.vue:211`

### Medium / 完整性与行为风险
1) **多处 `v-html` 直接渲染消息或名称**  
   - 若数据来自插件、搜索结果、远端或用户输入，存在潜在 XSS 风险；需确认输入可信或统一消毒策略。  
   - 位置：  
     - `apps/core-app/src/renderer/src/components/render/BoxItem.vue:188`  
     - `apps/core-app/src/renderer/src/views/base/application/AppList.vue:81`  
     - `apps/core-app/src/renderer/src/views/base/application/AppList.vue:136`  
     - `apps/core-app/src/renderer/src/views/base/market/MarketSourceEditor.vue:117`  
     - `apps/core-app/src/renderer/src/views/box/MainBoxHeader.vue:70`  
     - `apps/core-app/src/renderer/src/components/base/dialog/TDialogMention.vue:208`  
     - `apps/core-app/src/renderer/src/components/base/dialog/TouchTip.vue:196`  
     - `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue:67`  
     - `apps/core-app/src/renderer/src/components/base/dialog/TBlowDialog.vue:164`

2) **智能能力 UI 占位值，功能未落地**  
   - 位置：  
     - `apps/core-app/src/renderer/src/components/intelligence/IntelligenceChannels.vue:16`  
     - `apps/core-app/src/renderer/src/components/intelligence/IntelligenceCapabilities.vue:20`  
     - `apps/core-app/src/renderer/src/components/intelligence/IntelligenceCapabilities.vue:21`  
     - `apps/core-app/src/renderer/src/components/intelligence/IntelligencePrompts.vue:17`

3) **Agent Marketplace 安装/卸载未实现**  
   - 位置：`apps/core-app/src/main/service/agent-market.service.ts:391`, `apps/core-app/src/main/service/agent-market.service.ts:428`

4) **插件核心 API 未实现**  
   - 位置：`apps/core-app/src/renderer/src/modules/channel/plugin-core/index.ts:2`

5) **扩展卸载逻辑未实现**  
   - 可能影响热重载/资源释放。  
   - 位置：`apps/core-app/src/main/modules/extension-loader.ts:34`

6) **搜索引擎刷新/缓存逻辑缺失**  
   - 可能导致索引陈旧或 provider 超时。  
   - 位置：`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:225`, `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1360`

7) **文件搜索后续路线未落地**  
   - Everything SDK 与向量/embedding 入口未实现。  
   - 位置：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:849`, `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:3283`

8) **AI Search Agent 未接入主搜索引擎/Intelligence SDK**  
   - 位置：`apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:203`, `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:232`

9) **AI Provider 多项能力默认抛错**  
   - 若 UI 未做能力门控，可能触发运行时异常。  
   - 位置：`apps/core-app/src/main/modules/ai/providers/local-provider.ts:68`, `apps/core-app/src/main/modules/ai/runtime/base-provider.ts:411`, `apps/core-app/src/main/modules/ai/runtime/base-provider.ts:425`, `apps/core-app/src/main/modules/ai/runtime/base-provider.ts:457`, `apps/core-app/src/main/modules/ai/runtime/base-provider.ts:482`, `apps/core-app/src/main/modules/ai/runtime/base-provider.ts:507`, `apps/core-app/src/main/modules/ai/intelligence-sdk.ts:607`

10) **迁移逻辑中“未实现”**  
   - checksum 字段移除未实现，需明确降级策略或文档说明。  
   - 位置：`apps/core-app/src/main/modules/download/migrations.ts:432`

### Low / 技术债
1) **`as any` / `ts-ignore` 广泛存在**  
   - 多为 Electron/global 注入兼容，但长期掩盖真实类型问题；建议收敛到类型声明层。  
   - 代表位置：  
     - `apps/core-app/src/renderer/src/modules/mousetrap-record.ts:55`  
     - `apps/core-app/src/renderer/src/modules/storage/theme-style.ts:101`  
     - `apps/core-app/src/preload/index.ts:120`  
     - `packages/utils/renderer/hooks/use-channel.ts:61`  
     - `packages/utils/transport/sdk/renderer-transport.ts:88`

## 主要功能清单（基于 README.zh-CN + AGENTS.md）
- Core 工具：多窗口、全局快捷键、剪贴板管理、截图、计时器等  
- CoreBox 启动器与搜索：列表/宫格布局、键盘导航、推荐/评分  
- 文件搜索：Windows Everything Provider、macOS/Linux File Provider、FTS  
- AI/智能：语义搜索、情境推荐、代理/能力扩展、可接自托管模型  
- 插件系统：Manifest/Prelude/Surface 三层、插件隔离存储、IPC 通道  
- 数据与配置：JSON 配置存储、插件 10MB 限制、Drizzle + LibSQL  
- 内联计算：算式/单位/货币/时间/常量即时解析  
- 更新下载与发布流程（含迁移逻辑）

## 建议补充点（面向落地）
1) **统一 HTML 消毒策略**：对所有 `v-html` 渲染路径进行输入可信度分级与消毒（尤其更新日志/README/插件/搜索结果）。  
2) **Market/Agent/Intelligence 未落地功能**：制定里程碑或明确降级策略（展示占位 vs 功能隐藏）。  
3) **AI 能力门控**：前端基于 provider capability 进行动态 UI 开关，避免触发 not implemented。  
4) **搜索索引刷新策略**：明确刷新触发时机与缓存失效规则，避免陈旧结果。  
5) **迁移限制说明**：在文档或 UI 中标注 SQLite 的迁移限制与当前降级行为。  
6) **类型收敛**：将 `as any`/`ts-ignore` 逐步集中到声明文件或桥接层，减少业务层扩散。

## 需要确认的问题
- 更新日志与市场 README 的来源是否可信？是否存在第三方注入路径。  
- Agent Marketplace 是否计划对外开放？安装/卸载逻辑是否已排期。  
- AI 能力是否允许部分 provider 不实现？若允许，UI 是否已完整做能力门控。

