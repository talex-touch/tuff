# 变更日志

> 更新时间：2026-06-21
> 定位：只保留 6 月当前阶段的高信号变更索引。6 月以前流水记录已从文档树移除，可从 Git 历史追溯。

## 2026-06-21

### docs: clean reports and evidence

- 删除 6 月以前的 reports / audits / historical snapshots / pre-compression archives。
- 将 6 月 evidence 中的 `raw`、`logs`、`user-data` 等运行态产物移出仓库文档树，保留到本地忽略目录 `.doc.local/docs-evidence/`。
- 更新 `.gitignore`，阻止 `docs/engineering/reports/**` 下的 Chromium profile、GPUCache、Cookies、SQLite DB、`.key`、logs 与 raw 产物进入提交。
- `docs` 目录体积从约 `111M` 降到约 `11M`；`docs/engineering/reports` 从约 `102M` 降到约 `2.2M`。

### corebox: keep text search independent from stale clipboard images

- 普通文本搜索默认不携带 stale clipboard image input。
- 空查询、插件/AI send-mode 或显式 `includeClipboardImage=true` 仍可带图片输入。
- no-result 空态保留 retry 与 File Index settings action，并在空态 DOM 落地后触发布局刷新。
- 代码侧验证通过 focused CoreBox tests、CoreApp typecheck 与 `build:unpack`。
- packaged 复采仍受当前 macOS signing / AMFI / Gatekeeper 环境阻断，`corebox-search-states` 仍保持 pending。

### ai: pass CoreBox AI Ask packaged stable surface

- `AI-STABLE-01/02/03/04/05/06/07/08` 已绑定独立 packaged probe JSON + PNG artifacts。
- CoreBox AI Ask packaged surface 已标记 `passed`。
- 已覆盖 text.chat success、OCR handoff、logged-out、provider unavailable、quota exhausted、model/capability unsupported、copy failure visible、Local/Ollama routing。
- global strict visible gate 仍按预期失败，剩余 search/app-index/login/OmniPanel/Assistant/Workflow/Provider broader surfaces pending。

### startup: bind packaged startup evidence

- packaged hot startup benchmark：10/10 passed，Startup health P50 `552ms`，P95 `810ms`，0 WARN / 0 ERROR。
- packaged cold startup benchmark：10/10 passed，Startup health P50 `572ms`，P95 `615ms`，0 WARN / 0 ERROR。
- startup first-screen evidence 证明 Settings/onboarding 首屏可用，Startup health summary 可达。

### roadmap: current execution handoff

- 当前 SoT 统一到 `Roadmap-vNext-2026-06-18.md`、`Current-Execution-Plan-2026-06-17.md`、`TODO.md`、`TODO-AI.md`、`TODO-R3.md`。
- R1 Release Integrity 仍需真实 GitHub Release ↔ Nexus endpoint/signature matrix。
- R2 AI Stable CoreBox AI Ask 已通过，global visible gate 仍 pending。
- R3 仍按约 `70%`，剩余 runtime-store migration、source-scoped `scan_progress`、durable scheduler evidence。
- Nexus 性能线单独收敛到 `TODO-nexus.md`，不与 CoreApp / AI / R3 dirty files 混批。

## 当前文档入口

- Roadmap：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 当前计划：`../TODO.md`
- AI：`../TODO-AI.md`
- R3：`../TODO-R3.md`
- Nexus：`../TODO-nexus.md`
- Evidence Matrix：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
