# Tuff 当前目标与进度快照

> 更新时间：2026-06-14
> 口径：当前工作区事实 + `docs/plan-prd/TODO.md` + `docs/plan-prd/04-implementation/Release-2.4.11-Closure-2026-06-13.md` + Roadmap + `CHANGES.md`。
> 注意：focused tests 只代表最近路径证据，不等同生产闭环；历史 release gate 通过不等同当前 dirty worktree 已通过。

## 1. 项目定位

Tuff（原 TalexTouch）是一个 Local-first、AI-native、Plugin-extensible 的桌面指令中心。

核心价值是统一“搜索 + 执行 + 插件协同 + 智能能力”，减少用户跨应用操作成本。

交付边界：

- `apps/core-app`：Electron + Vue 桌面主产品，是主要运行时与能力承载体。
- `apps/nexus`：文档与生态站点，承载开发者文档、API、发布与生态信息。
- `packages/*`：共享 SDK、类型、组件与工具。
- `plugins/*`：官方/示例插件能力集合。

## 2. 当前版本与发布事实

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp 均为 `2.4.11-beta.8`。
- 本轮实时核对：当前分支 `master`，当前 `HEAD=139f46151`，本地相对 `origin/master` 为 `0 17`，即不落后、领先 17 个提交。
- 历史 release closure 文档记录：2026-06-13 快照为 `HEAD=47787615b fix(tuffex): make style entry build idempotent`，`master` 相对 `origin/master` 领先 9 个提交。
- 最近完整发布链路证据：`v2.4.11-beta.6` GitHub prerelease / Nexus BETA latest sync / Gate D strict。
- 2026-06-13 release closure 记录过 `quality:pr`、`publish:check`、`publish:check:pack`、`quality:release`、`git diff --check` 通过；但当前工作区已有大量后续改动，不能把该记录当作当前工作区 release gate 已通过。
- Release integrity debt 仍在：Nexus release assets `sha256`、`signatureUrl`、signature endpoint、download matrix 与实际资产一致性、`tuff-release-manifest.json` 对齐仍需真实发布链路收口。
- 真实 npm publish 尚未执行；必须具备 `@talex-touch` scope 权限的 `NPM_TOKEN`，且执行前需要用户明确确认。

## 3. 当前主线

`2.4.11` 主线是债务退场与发布收口，不扩张功能面：

1. 关闭或显式降权剩余 legacy / compat / size 债务。
2. 收口 release checklist、质量门禁、release integrity 与 npm publish evidence。
3. 插件平台优先关闭可信边界风险：SDK hard-cut、权限请求、secret storage、shell/network/fs capability、widget runtime、Search Provider / Indexed Source。
4. Windows/macOS 真机人工回归后移为平台专项，不阻塞本轮 `2.4.11`，但相关代码必须保留 degraded / unsupported reason 与 fail-closed 行为。

`2.5.0` 口径保持克制：

- Stable 只承诺文本 + OCR。
- Workflow / Skills / Automation 保持 Beta。
- Assistant、语音、Computer Use、多模态生成、深层自动化保持 Experimental 或后续预告。
- AI 已有 Intelligence module、provider runtime、workflow service、agent/tool channels、OmniPanel Writing Tools 与 Assistant typed transport，但当前不能宣称体验闭环。

## 4. 已完成的重点进展

### 4.1 Release / Quality

- `2.4.11-beta.8` 已进入 root/CoreApp 版本口径。
- `v2.4.11-beta.6` 是最近完整发布链路证据。
- 2026-06-13 closure 文档已明确阻塞项与非阻塞项，并记录过完整 release gate 通过结果。
- `@talex-touch/tuffex@0.3.9` 与 `@talex-touch/tuff-cli@0.0.7` 已进入当前包版本口径。
- CLI publish 侧已补过期 app JWT 自动刷新、API key scope preflight、`TUFF_NON_INTERACTIVE=1` fail-closed 与 upload device headers evidence。

### 4.2 插件 SDK 与权限可信边界

- 官方插件 manifest focused test 已钉住 supported `sdkapi`、permission reasons、显式 `manifest.searchProviders`、`search.root-results` consent gate、高风险 shell provider scope、显式 `interaction.forceMax` 与 metadata-only indexed source 声明。
- SDK marker 当前口径：`260615` 为 current marker，`260428` 仍受支持；不做盲目批量 manifest 升级。
- `sdkapi` missing / invalid / outdated / unsupported 继续 fail-closed。
- root results push/update 同时受 `search.root-results` permission gate 与 provider `enabled === true` 用户配置约束。
- 最近已收的官方插件执行期 reason 保真包括：
  - `touch-snipaste`
  - `touch-window-presets`
  - `touch-workspace-scripts`
  - `touch-quick-actions`
  - `touch-system-actions`
  - `touch-browser-open`
  - `touch-window-manager`
  - `touch-browser-data`
  - `touch-browser-bookmarks`
  - `touch-batch-rename`
  - `touch-snippets`
  - `touch-dev-toolbox`
- shell/network/fs/clipboard 执行期 block 现在保留 `permission-denied`、`permission-sdk-unavailable`、`permission-request-failed` 等具体原因。
- `touch-system-actions` 的 `open-main-window` 保持为原生窗口动作，不依赖 shell permission。

### 4.3 Secret / Storage

- `touch-translation` provider secret 已迁移到 `usePluginSecret()`。
- secure-store unavailable 时，ProviderConfigModal 阻止保存并展示原因，不 emit false success。
- secret update 失败时不写普通 plugin storage，runtime provider config 也不保留本次提交的明文 secret。
- CoreApp secure-store 已优先 Electron `safeStorage`；Credential Locker / libsecret 与系统后端真实 evidence 仍需继续补。

### 4.4 Widget Runtime

- `interaction.forceMax` 已明确为显式合同；普通 widget 不再按类型默认强制最大高度。
- 官方全高 widget 已在 manifest 显式声明。
- Widget manager 已复用缓存注册 payload，避免重复预编译读取/运行时编译。
- Renderer widget registry 已按 `widgetId + hash` 幂等跳过重复注册。
- Packaged precompiled widget 注册前已校验 `metaPath` JSON 与 manifest `build.widgets` entry 的 `featureId` / `widgetId` / `sourcePath` / `compiledPath` / `hash` / `runtime` / `runtimeStage`。
- 不匹配或 malformed meta 会 fail-closed 为 `WIDGET_PRECOMPILED_INTEGRITY_MISMATCH`，不读取源码、不运行时编译，并清理缓存后广播 widget failure。
- Renderer visual smoke 与真实 packaged plugin matrix 仍后置。

### 4.5 Search Provider / Indexing Runtime

- App / File / Everything 已作为 thin indexed-source adapters 接入统一 diagnostics 与 runtime lifecycle。
- Provider registry 已把 plugin registration issue / provider id collision 暴露给 Settings。
- 插件可声明 `manifest.searchProviders`；第三方 push provider 需 `root-results` + `defaultState: "ask"` + `requiresUserConsent: true`。
- 插件可声明 metadata-only `manifest.indexedSources` lifecycle intent，CoreApp loader 会校验 admission/permission 并暴露 diagnostics，但不会自动注册 runtime source。
- File write/store boundary 已把大量 primitive 下沉到 `@talex-touch/utils/search`，包括 write plan、progress ETA、runtime emitter、flush retry、reset/integrity helper 等。
- Browser Bookmarks 已从 metadata-only intent 推到官方 `touch-browser-data` owned runtime lifecycle；默认 disabled/high privacy，显式 enable 后才读取本机 Chromium `Bookmarks`。
- Quicklinks runtime 已接只读 `root-results-visible` feed，从 `BoxItemManager.getVisibleItems()` 读取已通过 provider enable/order 与 `search.root-results` gate 的 linked provider item。
- Everything 在 Windows enabled/available 但无授权 File roots 时显式 degraded 为 `indexing-root-policy-file-roots-empty`；evidence 只暴露 root count 与 path-filtering 统计，不暴露 root path。

### 4.6 AI / Nexus / TuffEx

- Nexus 首页叙事已收敛为“本地优先的桌面 Agent 指令中心”，但不改变 CoreApp 运行时能力。
- Nexus docs SEO/prerender 已补 metadata/OG/Twitter/canonical/alternate/robots/TechArticle JSON-LD 与 localized docs evidence。
- TuffEx 已推进 on-demand style/export/audit、trusted dialog HTML boundary、DatePicker adaptive field calendar 与 composition visual smoke evidence。
- AI 侧已有 CoreBox AI Ask / OmniPanel / Intelligence runtime / provider runtime / agent tool channels 的开发基础；当前主要缺 packaged Electron UI evidence 与失败路径可见证据。

## 5. 未闭环风险

- 当前工作区很脏，约 101 个 dirty/untracked entries；不能声明当前工作区 `quality:release` 已通过。
- Release integrity debt 仍未真实闭环：assets `sha256`、`signatureUrl`、signature endpoint、download matrix、manifest 对齐。
- 真实 npm publish 仍缺可用 scope token 与用户确认。
- 插件可信边界仍有长尾：`touch-dev-utils`、`touch-text-tools`、`touch-emoji-symbols`、`touch-intelligence`、`touch-translation` 等仍可继续补 reason 保真与 request-failed 覆盖。
- Secret 后端仍缺系统 credential backend 的平台证据，`safeStorage` 之外的 degraded health 还要补。
- Widget runtime 仍缺 renderer visual smoke、packaged plugin matrix、sandbox allowlist 与 compile failure reset 等完整 evidence。
- FileProvider 的 SQLite/FTS 真实写入、scan worker、index worker flush trace、`scan_progress`、integrity-triggered reset durable history 仍未完全迁到 runtime task/store 边界。
- Browser Bookmarks 仍缺真实 browser profile、跨平台 watch root、packaged Settings evidence、durable job history / retry / debounce。
- Quicklinks 仍缺官方插件持久 feed storage、用户级 clear/rebuild UI、真实 Settings evidence。
- Everything 仍缺 SDK/CLI 最终策略、registry PATH 探测、Windows 真机性能/evidence 与 fail-closed diagnostics 验收。
- `2.5.0` AI 仍缺 packaged Electron 文本/OCR success/failure evidence、Nexus invoke 未登录/provider unavailable/quota/model unsupported 可见错误、provider metadata chips、Agent tool execution evidence。

## 6. 下一步推进顺序

1. Release evidence：在当前 dirty worktree 收敛后重新跑最近路径验证、`quality:pr`、publish preflight、`quality:release`、`git diff --check`，并记录真实结果。
2. Release integrity：补 Nexus assets `sha256` / `signatureUrl` / signature endpoint / download matrix / manifest 对齐。
3. Plugin permission sweep：继续收官方插件剩余 shell/network/fs/clipboard reason 保真，尤其 request-failed 与 SDK unavailable 路径。
4. Secret backend：补 `touch-translation` 与 `touch-intelligence` provider secret health、secure-store backend evidence、degraded health UI。
5. Widget runtime：补 cache、compile failure reset、renderer unregister、sandbox allowlist、package integrity、renderer visual smoke 与 packaged matrix evidence。
6. File write/store boundary：优先迁移 SQLite/FTS 真实写入、scan worker、index flush trace、`scan_progress` 与 integrity reset durable history。
7. Browser Bookmarks / Quicklinks / Everything：Browser Bookmarks 补平台 evidence 与 durable runtime 长尾；Quicklinks 接官方持久 feed 和 clear/rebuild UI；Everything 收 SDK/CLI 策略、registry PATH 与 Windows evidence。
8. AI 2.5.0 evidence：只补文本 + OCR packaged Electron success/failure、Nexus invoke failure、provider/model metadata chips 与 Agent tool permission/audit evidence，不提前承诺 Beta/Experimental 能力。
9. Docs sync：每个行为/接口/架构切片至少同步 `README.md`、`TODO.md`、`CHANGES.md`、`docs/INDEX.md` 之一；目标或质量门禁变化同步 Roadmap 与 Quality Baseline。

## 7. 最近验证口径

历史 release closure 记录：

- `pnpm quality:pr`：2026-06-13 closure 文档记录通过。
- `pnpm publish:check`：2026-06-13 closure 文档记录通过。
- `pnpm publish:check:pack`：2026-06-13 closure 文档记录通过。
- `pnpm quality:release`：2026-06-13 closure 文档记录通过。
- `git diff --check`：2026-06-13 closure 文档记录通过。

最近 focused 插件/运行时验证：

- `pnpm -C "packages/test" exec vitest run "src/plugins/dev-toolbox.test.ts"`：7 passed。
- 官方插件扩展回归组：12 files / 144 tests passed。
- `pnpm -C "apps/core-app" run typecheck:node`：passed。
- Scoped ESLint：passed。
- Scoped `git diff --check`：passed。

当前文档状态：

- 本文件只整理当前项目进度与下一步，不声明当前 dirty worktree 的全量 release gate 已通过。
- 若后续继续推进代码切片，必须按 related-only 小切片执行，并记录最近路径验证。

## 8. 继续工作规则

- 不执行 `git commit`、`git push`、`git reset`、tag/release 创建或真实 npm publish，除非用户明确要求。
- 不回退、清理或覆盖无关 dirty/untracked 文件。
- 不把 focused tests 写成生产完成证据。
- 不把 Windows/macOS 真机专项缺口写成本轮 `2.4.11` blocker。
- 不提前把 `2.5.0` AI/Agent Beta 或 Experimental 能力承诺为 Stable。
- 保持 KISS / YAGNI：每批只处理一个可信边界或 release evidence 小切片，代码、测试、文档一起收口。
