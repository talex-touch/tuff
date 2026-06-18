# apps/core-app/AGENTS.md

适用于 `apps/core-app/**`。根规则仍然生效；本文只补 CoreApp 专属约束。

## 范围

- Electron + Vue 桌面主产品。
- 关键域：CoreBox、Storage/Sync、Plugin runtime、Intelligence、QuickOps、Search / Indexing Runtime、Transport。

## CoreApp 硬规则

- 不新增裸 `ipcMain` / `ipcRenderer` / raw channel；优先 typed transport 与 domain SDK。
- 不新增宽松 `webPreferences`、不扩大 preload 暴露面。
- 不新增裸 `console.*` 到生产路径；确需调试必须在提交前清理。
- 首次引导是否展示必须等待 storage hydration 完成后再判定。
- 同步能力必须走 `/api/v1/sync/*` 及 keys/devices 配套接口。

## Storage / Secret

- SQLite 是本地业务 SoT；JSON 只允许作为密文同步载荷或可校验下载载荷。
- 敏感信息必须走 CoreApp secure-store 的本机随机 root 密钥保护。
- 禁止访问系统钥匙串 / Credential Locker / libsecret / Electron `safeStorage`。
- 禁止把 token、API key、provider secret、恢复码、prompt/response 明文写入 ordinary JSON、localStorage、日志或 sync payload。

## CoreBox / Search / Indexing

- 新搜索源必须通过 Search Provider / Indexed Source / Indexing Runtime 入口，不得新增绕过 Settings diagnostics 的私有扫描入口。
- Browser Bookmarks/History、App Data、Obsidian、VSCode 等 high privacy source 默认 disabled/ask，需要用户启用、范围、清理入口和 degraded reason。
- File write/store boundary 迁移必须保持 SQLite/FTS/SearchIndex worker 真实语义不变。
- Everything / 平台能力不可用时必须返回 degraded/unsupported reason，不得伪成功。

## AI / Intelligence

- `2.5.0` Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；OmniPanel Writing Tools、Workflow / Review Queue / Skills / Automation 是 MVP/Beta，Assistant / 语音 / 多模态生成是 Experimental。
- AI 完成判断以 `docs/plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` 为准；focused tests 或 evidence-contract 通过不等于 packaged Electron 体验闭环。
- provider unavailable、quota exhausted、model unsupported、permission denied 必须 fail-closed 并展示恢复建议。
- provider metadata chips 不能空白成功；至少展示可用的 capability/provider/model/latency/trace 字段或明确 fallback。

## QuickOps

- QuickOps 默认本地优先、只读优先、可解释 degraded reason。
- 状态型能力必须接入 lifecycle cleanup；module stop/destroy 时清理会话与系统资源。
- 清洁屏幕、计时器、保持唤醒等不能修改持久系统设置；系统级高风险动作必须权限/确认。
- 网络、代理、文件、诊断输出必须脱敏 Home、token、代理凭据与完整配置。

## UI / i18n

- UI 组件优先使用 TuffEx；新增交互元素要有语义、focus、keyboard 行为。
- 禁止直接访问 `window.$t` / `window.$i18n`。
- 新文案进入 `src/renderer/src/modules/lang/` 或项目现有 message catalog。
- 避免旧式 `div/span @click`；必要时说明为何不能替换。

## 推荐验证

- CoreApp 全量类型：`pnpm -C "apps/core-app" run typecheck`
- 主进程类型：`pnpm -C "apps/core-app" run typecheck:node`
- 渲染进程类型：`pnpm -C "apps/core-app" run typecheck:web`
- 最近路径测试：`pnpm -C "apps/core-app" exec vitest run "<test files>"`
- 文档/空白：`git diff --check`
