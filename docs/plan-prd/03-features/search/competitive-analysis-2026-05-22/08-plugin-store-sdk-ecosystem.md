# 插件生态、Store、SDK 与发布链路专项

> 日期：2026-05-22
> 范围：Raycast Store / Developers、Alfred Gallery / Workflow 分享、uTools 插件应用市场 / 开发者文档 / AI 插件制作，对照 Tuff 当前插件生态、SDK、Store、CloudShare 与发布链路。
> 约束：只输出竞品分析和最小闭环建议；不改代码，不扩大到完整生态重构；所有“已落地”均以 live tree 或官方资料为准。

## 1. 结论

Raycast、Alfred、uTools 的插件生态不是同一种模型：

1. **Raycast 是 Store-first + Developer workflow-first**：官方 Store 承担发现、安装、自动更新和信任背书；开发者通过 Extension API、CLI、本地调试、GitHub PR review、审核检查与私有扩展形成一条相对严格的发布链。
2. **Alfred 是 Workflow asset-first**：`.alfredworkflow` 更像用户或 creator 拥有的自动化资产，Gallery 提供发现和安装入口，但核心生产方式仍是本地 Workflow Builder、Debugger、Variables、Configuration 与社区分享。
3. **uTools 是插件市场 + 低门槛开发工具 + 数据源匹配**：插件应用市场负责安装和更新，`plugin.json` / 功能指令 / preload API 降低开发门槛，AI 插件制作进一步压低生产成本。

Tuff 当前生态底座已经不是空白：`plugins/*` 覆盖剪贴板、片段、翻译、窗口、系统动作、浏览器数据、Emoji、AI 等真实插件；Manifest / Prelude / Surface 三层清晰；`sdkapi` 已 hard-cut 到 canonical allowlist；权限、capability、secret、typed SDK、`tuff validate/build/publish --dry-run`、Nexus Store、`.tpex` 包预览、publish auth、CloudShare content pack、插件版本 pending/approved/rejected 审核状态、包内 `_files` / `_signature` 完整性校验都有实现或文档证据。

真正缺口是 **端到端生态 evidence 和产品化任务流**：

- 开发者能看文档写插件，但“从 manifest -> 本地安装 -> dry-run publish -> Nexus Store 展示 -> 内容包安装 -> 失败 reason”的单条样板还没有沉淀成可验收闭环。
- Nexus 有 `.tpex` 上传、包解析、版本状态、审核、通知和治理事件，但 package policy / security scan 仍主要是规划和完整性校验，不能对外宣称 Raycast 式完整审核安全链。
- Store 有插件详情、评分/评论、内容包区块和 analytics，但开发者视角、团队/私有分发、版本更新、审核反馈、package risk badge 尚未形成稳定体验。
- CloudShare 已能支撑 `touch-snippets` snippet pack 首条链路，但内容审核、团队可见、订阅/fork、大内容 `contentRef` 仍是后续。

本专项建议 Tuff 先做 **plugin ecosystem minimum loop v1**，不要先追求“完整市场生态”。v1 只需要让一个官方示例插件跑完：`manifest.json` 合规、Prelude 返回结果、本地安装、`tuff validate --strict`、`tuff build`、`tuff publish --dry-run`、Nexus `.tpex` package preview、提交为 pending、Store 展示、CloudShare 内容包安装、每一步失败都有明确 reason。

## 2. 竞品生态机制拆解

### 2.1 Raycast：Store-first 的强约束生态

| 机制 | Raycast 行为 | 对 Tuff 的启发 |
| --- | --- | --- |
| Store 发现 | Store 按类别、搜索、官方/社区扩展展示，用户从 Store 安装扩展 | Nexus Store 需要把能力、权限、平台、输入类型、审核状态和内容包一并展示 |
| Developer workflow | 开发者通过本地 extension 项目、API、CLI、dev mode 调试扩展 | Tuff 文档已经有 Manifest -> Prelude -> SDK -> validate/build/publish；还缺一个真实样板 repo / sample evidence |
| 发布链路 | Store 发布走官方仓库/PR review/自动检查，合并后进入 Store | Tuff 不能只靠“能上传 `.tpex`”；需要 package preview、完整性校验、policy scan、审核状态和 reject reason |
| 自动更新 | Store 扩展由 Raycast 分发和更新 | Tuff Store 需要明确版本 channel、更新提示、包 SHA/签名、失败回滚 |
| 私有扩展 | Teams 可发布 private extension | Tuff 后续应把团队/私有分发做成 Store visibility / org scope，而不是旁路安装 |
| API 与安全 | Extension API 提供 Preferences、Secret、OAuth、Storage 等受控能力 | Tuff 已有 permission / secret / typed SDK，原则上应继续 fail-closed，不开放 raw IPC 作为生态主路径 |

Raycast 值得借鉴的是“发布链路对用户信任的贡献”。它不是只给开发者一个 SDK，而是把 Store、审核、文档、更新和团队私有分发捆成一条生态协议。Tuff 当前最需要补的是每一步的证据和失败 reason，而不是再扩一个新的插件 API。

### 2.2 Alfred：Workflow asset-first 的创作者生态

| 机制 | Alfred 行为 | 对 Tuff 的启发 |
| --- | --- | --- |
| Workflow Builder | 本地通过 Inputs / Actions / Utilities / Outputs 搭建工作流 | Tuff 不必先做完整可视化画布；Manifest + Prelude + workflow contract v1 更现实 |
| Debugger | Workflow Debugger 展示脚本输出、变量和错误 | Tuff 需要普通 plugin workflow 的 run trace / step failure，而不只依赖 plugin logs |
| Configuration | Workflow 可带用户配置、变量和 secret | Tuff 应复用 plugin storage / secret / settings schema，安装后显示 setup required |
| Gallery | Gallery 负责发现、安装、精选和 creator 页面 | Nexus Store 要提供 plugin card、workflow/card、内容包、评分和信任摘要 |
| 分享文件 | `.alfredworkflow` 可直接分享和导入 | Tuff `.tpex` 是对应资产，但必须比裸文件分享更可审计：包完整性、sdkapi、权限、来源、签名 |

Alfred 给 Tuff 的核心启发是：生态资产不一定只有插件代码，还可以是工作流、配置和内容包。Tuff 的 CloudShare content pack 方向是正确的，但必须避免把用户私有同步数据伪装成公开内容包。

### 2.3 uTools：低门槛插件市场与数据源匹配

| 机制 | uTools 行为 | 对 Tuff 的启发 |
| --- | --- | --- |
| 插件应用市场 | 插件按场景发现、安装和更新 | Tuff Store 要减少“只有插件卡片”的割裂，展示插件能力、输入类型、平台和内容包 |
| `plugin.json` | 用声明文件描述入口、功能指令、匹配模式、平台等 | Tuff Manifest 已更工程化；应继续用 `category`、`features[].commands`、`acceptedInputTypes`、`permissionReasons` 降低理解成本 |
| preload / API | 通过 preload 暴露 uTools API，适合快速小工具 | Tuff Prelude 更适合搜索/动作轻量插件；Surface 只在需要重 UI 时加载 |
| 调试工具 | 开发者工具、离线插件安装、本地调试 | Tuff 需要把 `tuff dev`、local install、package preview 和错误 reason 串起来 |
| AI 插件制作 | AI 帮助用户制作插件应用 | Tuff 可以支持 AI 生成插件草稿，但必须经过 `tuff validate --strict`、sdkapi、权限和 package scan，不能让 AI 绕过审核 |

uTools 值得借鉴的是上手速度和“输入数据源 -> 插件动作”的心智。但 Tuff 不能为低门槛牺牲 hard-cut 和权限边界；AI 生成插件只能是草稿生产，不是可直接发布的 trusted artifact。

## 3. Tuff 当前生态证据快照

| 能力面 | 当前事实 | 证据路径 | 判断 |
| --- | --- | --- | --- |
| 官方/示例插件集合 | `plugins/*` 覆盖 clipboard-history、touch-snippets、touch-translation、touch-browser-data、touch-system-actions、touch-window-manager、touch-intelligence 等 | `plugins/*/manifest.json`、`plugins/*/index.js` | 能力面丰富，但缺统一 showcase 与端到端发布样本 |
| Manifest / Prelude / Surface | 新插件推荐 `main: "index.js"`，Manifest 声明能力，Prelude 处理 `onFeatureTriggered` / `onItemAction`，Surface 只在重 UI 时加载 | `apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc`、`apps/nexus/content/docs/dev/reference/manifest.zh.mdc` | 架构清晰，适合形成 Raycast/uTools 式 developer workflow |
| `sdkapi` hard-cut | 当前 marker `260428`；支持列表 canonical；未声明、非法、低于 `251212`、非 supported/future marker 直接阻断 | `packages/utils/plugin/sdk-version.ts`、`apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts` | 已落地，应作为生态安全边界，不应放松 |
| 权限与 capability | `fs.*`、`clipboard.*`、`network.*`、`system.shell`、`intelligence.*`、`storage.*`、`window.*` 有风险分级与 reason 文档 | `manifest.zh.mdc`、`packages/tuff-cli-core/src/validate.ts`、CoreApp permission 模块 | 基础可用；Store 展示和 package risk badge 仍需产品化 |
| Secret | 开发任务流明确 API Key / Token 应走 `usePluginSecret()`，不写 JSON/localStorage/log | `plugin-workflow.zh.mdc`、TODO 的 P0-SECRET | 正确方向；Credential Locker/libsecret 与遗留 secret evidence 仍需补 |
| CLI validate | `tuff validate --strict` 校验 manifest、sdkapi、category、permission registry，strict 下 warning 变 error | `packages/tuff-cli-core/src/validate.ts` | 已落地；还需扩展 package policy/security scan 和 workflow/content schema |
| CLI build/publish | `tuff build` 生成 `.tpex`；`tuff publish --dry-run` 输出 package、sha256、channel；真实 publish 走 publisher auth preflight | `packages/tuff-cli-core/src/publish.ts`、`packages/tuff-cli/src/bin/tuff.ts` | dry-run 可用；真实上传 evidence 和失败 UX 仍需样板化 |
| Publish auth | API Key / App JWT 发布前走 `/api/dashboard/auth/publisher`；`plugin:publish` 覆盖发布前读取需求 | `packages/tuff-cli-core/src/publish.ts`、`apps/nexus/server/api/dashboard/auth/publisher.get.ts` | 已收紧，避免 API Key 被 `/api/auth/me` 误杀 |
| `.tpex` package preview | Dashboard 可上传 `.tpex` 预览 manifest / README / icon | `apps/nexus/server/api/dashboard/plugins/package/preview.post.ts`、`apps/nexus/server/utils/tpex.ts` | 已落地；应进入开发者发布 UI 主路径 |
| Package integrity | Nexus 解析 tar，校验 manifest `_files` SHA-256 map 与 `_signature`，不匹配则拒绝 | `apps/nexus/server/utils/tpex.ts`、`pluginsStore.ts` | 已有完整性校验；不是完整恶意代码 scan |
| 审核状态 | 插件和版本有 `draft` / `pending` / `approved` / `rejected`；管理员可 moderate 版本并写 reject reason | `apps/nexus/server/utils/pluginsStore.ts`、`versions/[versionId].patch.ts` | 基础审核流存在；审核队列、自动 scan、开发者反馈 UI 仍需证据 |
| Store 发现 | Store 插件详情、下载、评分/评论、内容区块、analytics/governance 已有切片 | `apps/nexus/app/pages/store.vue`、CoreApp Store 详情、TODO P1-PUBLISHER/P1-CLOUDSHARE | 可作为生态承载面；需要真实安装/更新/evidence |
| CloudShare content pack | `CloudShareSDK`、`/api/store/plugin-content/*`、CoreApp content install、`touch-snippets` snippet pack 已打通首条链 | `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md`、`packages/utils/cloud-share/*`、`plugin-content-installer.ts` | MVP 已落地；审核、团队可见、订阅/fork 后置 |
| CloudSync 边界 | CloudSync 只做用户私有加密同步，不用于公开内容包 | `plugin-workflow.zh.mdc`、CloudShare PRD | 边界正确，必须继续防止明文 JSON dump |

## 4. 生态能力差距矩阵

| 生态环节 | Raycast | Alfred | uTools | Tuff 当前状态 | 缺口 | 优先级 | 最小下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 开发 | Extension API + CLI + docs + examples | Workflow Builder + scripts + examples | `plugin.json` + preload API + 开发者工具 | Manifest / Prelude / Surface + SDK 文档 + 示例插件 | 缺一个官方“从 0 到发布”的可运行样板插件 | P0 | 用 `touch-snippets` 或 `quick-note` 样板写完整任务流和 evidence |
| 调试 | 本地 dev、logs、review checks | Debugger 展示变量/脚本输出 | 开发者工具与离线调试 | plugin logs、`tuff dev`、CoreBox 搜索路径存在 | 缺普通插件 run trace、Store package preview 到 local install 的调试串联 | P1 | 定义 plugin run summary：query、feature、permission、action、errorCode |
| 打包 | Raycast extension 经仓库/构建链发布 | `.alfredworkflow` 文件分享 | 插件包/离线插件 | `.tpex`、manifest `_files` / `_signature`、icon/README 提取 | 包策略只做到完整性，缺高风险 API / 大文件 / dependency scan | P0 | `tuff package check` 或 publish preflight 输出 risk summary |
| 发布 | Store 发布 + PR review | Gallery 提交或文件分享 | 市场发布 | `tuff publish --dry-run`、publisher auth、Nexus versions API | 真实 `.tpex` 上传端到端 evidence 缺；失败 reason 没有固定样板 | P0 | 建一条 dry-run + package preview + submit pending 的 release evidence |
| 审核 | 官方 review 与 Store checks | Gallery curated / creator 资产 | 市场审核 | pending/approved/rejected、reject reason、通知事件 | 自动 security scan、审核队列、开发者 re-edit 指引不完整 | P1 | 审核 UI 展示 integrity、permissions、sdkapi、risk、reject reason |
| 安装 | Store 一键安装和自动更新 | Gallery / `.alfredworkflow` 导入 | 市场安装/离线安装 | CoreApp Store、install queue、sdkapi installer gate、content install | `.tpex` Store 安装与 local install evidence 未形成统一链 | P0 | `Store install -> SDK gate -> permission setup -> first run` 样本 |
| 更新 | Store 更新统一分发 | Workflow 可手动更新/重装 | 市场更新 | version/channel/status/packageUrl 字段存在 | 用户侧更新提示、channel 选择、失败回滚 evidence 不足 | P1 | Store 详情展示 channel、sha256、status、更新失败 reason |
| 市场发现 | 类别、搜索、精选、官方/团队 | Gallery 分类、creator 页面 | 插件分类、场景、推荐 | Store 卡片、分类、评分、内容区块 | 输入类型、平台、权限、capability health 不够显眼 | P1 | 插件卡增加 capability chips：input types、platforms、permissions、content packs |
| 评分/信任 | Store rating/review 与官方背书 | Gallery trust/creator reputation | 市场热度/评价 | review analytics、approved rating distribution 有基础 | trust badge 尚未连接完整性、审核、downloads、official、policy scan | P1 | `Trust summary`：official、approved version、integrity、rating、downloads、last validated |
| 内容包 | Raycast 可通过扩展数据/团队扩展承载 | Workflow/config 资产可分享 | 插件数据可依生态分享 | CloudShare content package + snippet pack MVP | 内容审核、团队可见、订阅/fork、大内容 ref 未完成 | P1 | 先把 snippet pack publish/install 作为 Store Content evidence |
| 团队/私有分发 | Teams private extensions | 私有 workflow 文件或团队内部分享 | 企业/账号能力视版本而定 | ownerOrgId、visibility/team 字段有规划/局部模型 | 私有 Store scope、团队密钥、ACL、安装策略未闭环 | P2 | 先做 private/unlisted + org-visible package，不做复杂企业策略 |

## 5. Tuff 插件生态最小闭环建议

### 5.1 `plugin ecosystem loop v1`

| 步骤 | 目标 | 验收证据 | 失败 reason |
| --- | --- | --- | --- |
| 1. Manifest | 插件声明 `sdkapi: 260428`、`category`、`main: "index.js"`、features、permissions、permissionReasons | `tuff validate --strict` 通过；manifest doc 中有同款示例 | `missing-sdkapi`、`unsupported-sdkapi`、`missing-category`、`unknown-permission` |
| 2. Prelude | `onFeatureTriggered` 返回至少一个 CoreBox item，`onItemAction` 有明确副作用 | 本地 CoreBox 搜索截图/trace；item meta 有 pluginName / featureId / defaultAction | `feature-timeout`、`permission-missing`、`empty-query`、`handler-error` |
| 3. Local install | `.tpex` 或 dev plugin 能安装到本地，installer 执行 sdkapi gate | install queue / plugin list 显示 `available` 或 blocked issue | `SDKAPI_BLOCKED`、`PACKAGE_INTEGRITY_INVALID`、`ICON_REQUIRED` |
| 4. Dry-run publish | `tuff publish --dry-run` 展示 package、size、sha256、channel，不上传 | CLI dry-run 输出保存到 evidence | `missing-token` 不应阻塞 dry-run；`no-package-found`、`version-mismatch` |
| 5. Nexus package preview | Dashboard 上传 `.tpex` 预览 manifest、README、icon、integrity | package preview API/UI 截图或 JSON | `manifest-missing`、`_files-missing`、`signature-mismatch` |
| 6. Submit pending | 真实 publish 提交版本为 pending，管理员可 approve/reject | version status、review notification、governance event | `publisher-auth-rejected`、`forbidden`、`storage-policy-blocked`、`package-upload-failed` |
| 7. Store 展示 | Store card/detail 展示版本、权限、平台、内容包、评分/信任摘要 | public Store detail evidence | `version-not-approved`、`package-unavailable` |
| 8. Content pack install | `touch-snippets` 安装 `tuff.snippet-pack+json` 到本地插件存储 | CoreApp Store Content 区块安装成功，install count sync 结果可见 | `target-plugin-missing`、`unsupported-import-target`、`unsupported-content-format`、`storage-write-failed` |
| 9. First run | 用户安装后第一次执行插件动作，权限 setup / secret health 可见 | CoreBox 执行动作截图/trace | `setup-required`、`secret-unavailable`、`permission-denied` |

### 5.2 选择首个样板插件

首个样板建议选 `touch-snippets`，理由：

- Manifest / Prelude 简单，能代表 CoreBox 搜索、复制、保存、管理入口。
- 已有 CloudShare `snippet-pack` 导入/导出、敏感内容过滤和 Store Content 安装链路。
- 风险边界清晰：普通片段走插件 storage，公开分享走 CloudShare，私有跨设备走 CloudSync，secret 不参与首版。
- 可以覆盖竞品共同关注的 snippets / content pack / Store ecosystem，而不会被 AI、OCR、shell、窗口权限拖复杂。

第二个样板可选 `touch-browser-data`，用于验证高风险数据源 diagnostics；但不建议作为第一条生态闭环，因为浏览器历史、Safari 权限、索引清理会扩大范围。

### 5.3 Store 展示最小信息架构

| 区块 | 必须展示 | 不应展示 |
| --- | --- | --- |
| Header | 插件名、作者、category、official/community、latest approved version、平台 | 未审核版本不应伪装为可安装 |
| Trust summary | approved、integrity valid、sdkapi、permission risk、downloads/install、rating | 不要把完整性校验写成“安全无风险” |
| Capabilities | features、acceptedInputTypes、permissions、required setup、secret health | 不展示 raw secret、raw package key、用户私有数据 |
| Versions | channel、version、status、sha256/signature、updatedAt、changelog | 不允许修改已发布 approved package；re-edit 只针对 rejected |
| Content | content pack kind、format、install count、target plugin、visibility | 不自动把未安装插件和内容包串联安装 |
| Failure | blocked reason、unsupported reason、permission reason、publish/auth/storage reason | 不用空列表/默认成功吞掉失败 |

## 6. 安全边界

| 边界 | Tuff 规则 | 原因 |
| --- | --- | --- |
| `sdkapi` | 未声明、非法、低于 `251212`、非 supported/future marker 直接 `SDKAPI_BLOCKED`；新插件推荐 `260428` | 防止旧插件绕过权限和 capability baseline |
| 权限 | Manifest 必须声明 required/optional 和 `permissionReasons`；CLI 校验未知权限；Store 展示风险 | 用户授权必须可解释，不能靠插件文案自证 |
| Capability | `system.shell`、`window.capture`、`intelligence.admin/agents` 等高风险能力必须 fail-closed | 避免 uTools 式低门槛插件误触高风险系统能力 |
| Secret | API Key、Token、Provider secret 只走 secure store / plugin secret；禁止写 manifest、JSON、localStorage、日志 | 防止插件数据分享或日志把密钥公开 |
| 包完整性 | `.tpex` 必须校验 manifest `_files` SHA-256 map 与 `_signature`；包内文件不匹配直接拒绝 | 防止上传后包内容与 manifest 描述不一致 |
| 包审核 | 完整性校验不等于安全审核；还需 package policy / security scan / manual review | 不能把 hash 校验包装成“已审计无风险” |
| 内容包 | CloudShare 只发布用户明确选择的公开/团队内容；CloudSync 只同步用户私有加密数据 | 防止明文业务 JSON dump 到公开市场 |
| 明文敏感数据 | Storage Rule：SQLite 是本地 SoT；JSON 只作为加密同步载荷或公开内容包格式，且必须经过过滤 | 避免 snippets、浏览器数据、剪贴板历史误发布 |
| 失败语义 | 发布、安装、审核、导入、权限、secret、storage、network 失败必须返回具体 errorCode/reason | 生态信任来自可解释失败，不是 happy path 文案 |
| AI 插件制作 | AI 只能生成草稿；发布前必须走 `tuff validate --strict`、package preview、sdkapi、权限和审核 | 防止 AI 生成绕过生态安全基线的插件 |

## 7. 执行优先级

| 优先级 | 切片 | 验收 |
| --- | --- | --- |
| P0 | `touch-snippets` 生态闭环 evidence | Manifest、validate、build、dry-run、package preview、submit pending、Store detail、content pack install、first run 全链路截图/日志 |
| P0 | Publish failure reason contract | CLI / Nexus / CoreApp Store 对 `SDKAPI_BLOCKED`、auth、package integrity、missing icon、storage policy、content install error 有统一映射 |
| P0 | Package policy baseline | 在完整性校验外，增加 size、forbidden files、raw secret patterns、high-risk permission summary、dependency manifest 摘要 |
| P1 | Store trust summary | Store card/detail 展示 approved version、integrity、sdkapi、permission risk、rating、downloads、content packs |
| P1 | Review queue UX | 管理员审核页展示 package preview、risk summary、reject reason；开发者能 re-edit rejected version |
| P1 | Developer run trace | Prelude feature/action 执行产出 featureId、input source、permission、duration、errorCode 的可读 trace |
| P1 | CloudShare review | Content package 从 MVP 直接 published 过渡到 pending/approved/rejected，至少对 public 内容启用 |
| P2 | Team/private distribution | private/unlisted/team visibility、org ownership、团队安装策略、私有内容包 ACL |

## 8. 非目标

- 不在本轮新增代码或修改 Store / CLI / SDK 实现。
- 不把 Raycast 的 GitHub PR 流程原样搬到 Tuff；Tuff 应适配 `.tpex` + Nexus Dashboard。
- 不为了兼容旧插件放松 `sdkapi` hard-cut。
- 不把 `.tpex` 完整性校验等同于恶意代码审计。
- 不让 AI 生成插件绕过 validate、权限、secret 和审核。
- 不把 CloudSync 私有同步数据当 CloudShare 公开内容包。
- 不默认建立企业私有市场；先做 private/unlisted/team visibility 的小闭环。

## 9. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只做任务 8，不改代码和其他 docs 入口 | 通过 | 输出限定到 `08-plugin-store-sdk-ecosystem.md` |
| 2 | 竞品事实 review：优先官方来源 | 通过 | 使用 Raycast Developers/Manual、Alfred Help/Gallery、uTools 官网/开发者文档/插件市场 |
| 3 | 仓库事实 enforce：不信旧 Done | 通过 live tree 核对 | 以 `sdk-version.ts`、`sdkapi-hard-cut-gate.ts`、tuff-cli、Nexus APIs、CloudShare PRD 和插件 manifest 为准 |
| 4 | 生态覆盖 review：是否覆盖开发、调试、打包、发布、审核、安装、更新、市场发现、评分/信任、内容包、团队/私有分发 | 通过 | 增加第 4 节差距矩阵 |
| 5 | Tuff 对照 enforce：必须覆盖 plugins/*、Manifest/Prelude/Surface、sdkapi、permission/capability、tuff-cli、Nexus Store、CloudShare、publish auth、security scan 规划 | 通过 | 增加第 3 节证据快照和第 6 节安全边界 |
| 6 | KISS/YAGNI review：是否提出完整生态重构 | 未提出 | 收敛为 `plugin ecosystem loop v1`，首条链选 `touch-snippets` |
| 7 | 安全 review：是否把完整性校验写成安全审核 | 已区分 | 明确 package integrity 不等于 security scan |
| 8 | 隐私 enforce：是否误用 CloudSync 或明文 JSON | 通过 | 强调 CloudSync 私有加密同步、CloudShare 公开内容包、敏感过滤 |
| 9 | 失败语义 review：是否只写 happy path | 通过 | 每个最小闭环步骤补 failure reason |
| 10 | 文档完整性 enforce：是否包含结论、矩阵、最小闭环、安全边界、10 轮摘要和来源 | 通过 | 补非目标与引用来源 |

## 10. 引用来源

### Raycast 官方来源

- Raycast Store: https://www.raycast.com/store
- Raycast Developers: https://developers.raycast.com/
- Raycast Developers - Prepare an Extension for Store: https://developers.raycast.com/basics/prepare-an-extension-for-store
- Raycast Developers - Publish an Extension: https://developers.raycast.com/basics/publish-an-extension
- Raycast Developers - Review Pull Request: https://developers.raycast.com/basics/review-pullrequest
- Raycast Developers - Publish a Private Extension: https://developers.raycast.com/teams/publish-a-private-extension
- Raycast Manual - Extensions: https://manual.raycast.com/extensions

### Alfred 官方来源

- Alfred Help - Workflows: https://www.alfredapp.com/help/workflows/
- Alfred Gallery: https://alfred.app/
- Alfred Help - Workflow Configuration: https://www.alfredapp.com/help/workflows/user-configuration/
- Alfred Help - Debugger: https://www.alfredapp.com/help/workflows/debugger/

### uTools 官方来源

- uTools 插件应用市场: https://www.u-tools.cn/plugins/
- uTools 开发者文档 - plugin.json: https://www.u-tools.cn/docs/developer/information/plugin-json.html
- uTools 开发者文档 - 调试插件应用: https://www.u-tools.cn/docs/developer/basic/debug-plugin.html
- uTools 开发者文档 - 离线插件应用: https://www.u-tools.cn/docs/developer/basic/offline-plugin.html
- uTools 帮助中心 - AI 插件制作: https://www.u-tools.cn/docs/guide/ai-plugin.html
