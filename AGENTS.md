# AGENTS.md

本文件是仓库根指令，只保留跨全仓必须遵守的硬规则。易漂移事实（版本、依赖版本、模块加载顺序、SDK marker、当前 roadmap）不要写死在这里；需要时读取 `package.json`、源码、`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md` 与对应专题文档。

## 项目定位

- Tuff 是 Local-first、AI-native、Plugin-extensible 的桌面指令中心。
- Monorepo 边界：`apps/core-app` 桌面主产品；`apps/nexus` 文档/生态/控制台；`packages/*` SDK/组件/工具；`plugins/*` 官方/示例插件。
- 当前执行口径以 `docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md` 和 `docs/plan-prd/TODO.md` 为准。

## 工作方式

- 默认中文回复；代码标识符使用英文。
- 先读后写；优先精确搜索定位，不做无关重构。
- 多步任务使用计划追踪，并按 related-only 小切片修改。
- 不主动执行 `git commit`、`git push`、tag/release、npm publish、生产 API/DB 操作。
- 代码变更后优先跑最贴近改动的验证；不修无关失败项。

## 高风险操作确认

执行以下操作前必须说明影响范围并获得明确确认：

- 删除/移动大量文件或目录、批量重命名。
- `git reset --hard`、rebase、amend、强制推送、tag/release 创建、`git push`。
- npm publish、全局包安装/卸载、核心依赖大版本升级。
- 生产 API/DB 操作、破坏性数据变更、外部服务敏感数据发送。
- 系统配置、权限、环境变量的全局变更。

## 工程原则

- KISS / YAGNI：以最小可维护改动解决当前问题。
- DRY：只在重复逻辑稳定且收益明确时抽象。
- SOLID：保持职责清晰、接口克制、依赖方向稳定。
- 向后兼容：未经明确要求不破坏现有 API/CLI/数据格式。
- 禁止降级目标：不得用 compatibility-only、跳过必要包或临时 helper 实质性降低正常开发目标，除非用户明确批准。

## Storage / Sync / Secret 硬规则

- SQLite 是本地唯一业务 SoT。
- JSON 只允许作为同步载荷格式或可校验 catalog 下载载荷；同步载荷必须是密文或引用（如 `payload_enc` / `payload_ref`）。
- `deviceId` 只能做设备标识或 AAD，不得作为密钥材料。
- API key、secret、token、refresh token、恢复码、口令不得进入普通 JSON、localStorage、日志或明文同步载荷。
- CoreApp secure-store 只允许使用本机随机 root 密钥加密保护；禁止访问系统钥匙串 / Credential Locker / libsecret / Electron `safeStorage`。
- 新同步能力必须走 `/api/v1/sync/*` 以及配套 `/api/v1/keys/*`、`/api/v1/devices/*`；旧 `/api/sync/*` 只允许迁移期只读。

## SDK / Transport / i18n 硬规则

- 新跨层通信优先 domain SDK / typed transport；禁止新增 raw event 字符串分发、裸 `ipcMain/ipcRenderer` 或旧 channel bypass。
- 插件能力优先走插件 SDK、manifest permission、capability gate；不要绕过插件权限系统。
- UI i18n 统一使用 `useI18n` / `useLanguage` / `useI18nText` 或项目已有 facade；禁止直接访问 `window.$t` / `window.$i18n`。
- 新 UI 文案必须进 message catalog；禁止中文 fallback、硬编码双语三元表达式作为生产路径。
- 单位、币种、时区、能力标签、搜索别名等领域词汇走 Domain Lexicon，不散写 locale branch。

## 文档同步规则

- 行为/接口/架构变化：至少同步 `docs/plan-prd/README.md`、`docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`、`docs/INDEX.md` 之一。
- 目标或质量门禁变化：同步 Roadmap 与 `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`。
- Pricing / subscription / credits：以 `docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md` 为当前 SoT。
- Evidence / release / governance：优先引用 `docs/plan-prd/04-implementation/*Evidence*.md` 与 `Roadmap-vNext-2026-06-18.md`。
- 入口文档不要承载长历史；历史事实进入 `CHANGES` 或 archive/index。

## 常用验证命令

- PR 门禁：`pnpm quality:pr`
- Release 门禁：`pnpm quality:release`
- 全量类型：`pnpm typecheck:all`
- CoreApp 类型：`pnpm -C "apps/core-app" run typecheck`
- Nexus 构建：`pnpm nexus:build`
- 公共包 manifest hygiene：`pnpm publish:check`、`pnpm publish:check:pack`
- 文档/空白检查：`git diff --check`

## 子目录补充

- `apps/core-app/AGENTS.md`：CoreApp / Electron / CoreBox / Storage / AI / QuickOps / Indexing 规则。
- `apps/nexus/AGENTS.md`：Nexus / Nuxt / SEO / i18n / Data Governance / Provider Registry 规则。
- `plugins/AGENTS.md`：插件 manifest / permission / SDK marker / secret / TuffEx 样式规则。
