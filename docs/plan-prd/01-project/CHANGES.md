# 变更日志

> 更新时间：2026-06-22
> 定位：只保留 6 月当前阶段的高信号变更索引。6 月以前流水记录已从文档树移除，可从 Git 历史追溯。

## 2026-06-22

### nexus: harden privacy export and account deletion flow

- 隐私数据导出改为 `privacy_export_jobs` 异步任务，Dashboard 创建 job 后轮询状态，成功后通过下载端点取得 JSON 附件。
- 账号注销改为 30 天冷静期：提交后进入 `deletion_pending`，普通会话、App Token 与 API Key 访问被拒绝，30 天内真实登录会自动恢复为 `active`。
- 注销确认新增服务端条款阅读会话，前端弹出详细条款与确认短语，后端强制校验至少阅读 30 秒且 session 只能使用一次。

### release: bind real R1 gate-e evidence

- 对 `v2.4.12-beta.8` 执行 GitHub Release、Nexus release/latest/assets/download/signature endpoint 与 CoreApp signature verifier 复采。
- 证据落到 `docs/engineering/reports/release-integrity-2026-06-22/`，并同步 R1 Evidence Matrix。
- 当前真实链路结论：Nexus metadata/latest/assets/download 已通；GitHub manifest 存在；Gate E 仍被 `.sig/.asc` sidecar、manifest `signature` 字段、Nexus `signatureUrl/signatureKey` 与 signing public key 缺失阻塞。

### tuffex: stabilize select dynamic dropdown behavior

- `TuffSelect` 支持直接 `options` 数据源、loading / empty 状态与自定义 option/loading/empty slot。
- `TuffSelect` 增加多选标签返显、标签移除、自助创建、分组选项、自定义 footer 与 error / warning 状态。
- Select 选中反显改为基于 props options 与 slot item registry 的统一 label map，slot item 卸载时注销，避免动态选项旧状态残留。
- 下拉 spacing 收敛为 content / option padding，动画 duration 默认缩短并支持透传 animation。
- `TxBaseAnchor` 在 reference / content 尺寸变化时同步刷新 floating 位置与轮廓尺寸。
- disabled Select 触发器统一整块 `not-allowed` 光标，避免只有边缘显示禁用光标。

## 2026-06-21

### nexus: standardize provider registry admin workspace

- 服务渠道页改为 TuffEx 统计卡、标准 `TxDataTable` 列表与 `TxDrawer` 添加/编辑抽屉。
- Provider、能力与 Scene 统一为 list CRUD 工作台，用量与健康记录改为只读表格。
- 创建服务渠道改为「服务大类 -> adapter」二级选择，并补齐 AI / Exchange / Screenshot / Translation 分类模板与 OpenAI Responses adapter。
- 补齐服务渠道相关中英文 i18n，将中文界面的 Provider / Scene / dry-run / adapter 等混排文案收敛为中文术语。

### nexus: merge AI credits into user management

- Dashboard 工作台与 Intelligence 管理页移除独立 AI 积分入口，旧积分路由改为跳转到账号/用户管理。
- 用户管理编辑抽屉新增所选用户积分摘要、最近流水与管理员增减积分操作。
- 新增管理员用户积分 GET/PATCH API，积分调整写入 credit ledger 与 admin audit，并限制减少额度不能低于已用积分。

### nexus: expose account details in settings

- `dashboard/account` 新增「详情信息」Tab，按行展示账号 ID、邮箱、角色、语言偏好、创建时间与最近更新，并支持点击复制 ID / 邮箱。
- `/api/user/me` 补充 `status`、`createdAt`、`updatedAt`，其中 `updatedAt` 来自现有用户/凭据/OAuth/Passkey 记录的只读聚合。

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
- 2026-06-22 R2D packaged 复采通过本机 Apple Development 签名绕过 macOS 启动阻断，并修复普通 `core-box` 可见搜索态 resize 链路；`corebox-search-states` 已取得 idle、searching/warm-up 与 no-result retry/File Index settings 可接受截图。该 surface 仍保持 pending，因为 isolated packaged profile 无 result rows，source/status/reason pills 仍缺真实可见样本，采集期间 app scanner 报 `spawn EBADF`。
- 2026-06-22 R2I packaged 复采关闭 `corebox-search-states`：`set-query` 会强制触发搜索并在 accept 后派发布局刷新，CoreBox manager 会在内部 `_show=true` 但 BrowserWindow 实际 hidden 时重试 show；真实 `screenshot` 查询让窗口从 `720x56` resize 到 `720x242`，并采到 source/status/reason pills 无重叠的可见截图。
- 2026-06-22 R3 非 schema runtime-store 小切片完成：FileProvider incremental DB persist、FTS write/delete 与 index worker flush 现在统一进入 indexed source runtime/store evidence；未触碰 `scan_progress` schema migration。

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

### release: advance R1 integrity chain

- GitHub update provider 保留 artifact `.sig` 到 `DownloadAsset.signatureUrl`。
- Nexus release asset metadata 增加 `signatureKey` / `signatureUrl`，只暴露真实记录的 signature endpoint 或 GitHub HTTPS signature URL。
- Nexus signature endpoint 改为读取记录的 `signatureKey`，避免凭 `${fileKey}.sig` 猜测导致 metadata 指向 404。
- 新增 `Evidence-Matrix-Release-Integrity-2026-06-21.md` 记录 focused matrix；Gate E 仍等待真实 GitHub Release ↔ Nexus endpoint/download/signature 运行证据。

### nexus: refine global search surface

- Nexus 全局搜索从 header 搜索按钮 FLIP/GSAP 展开到最终命令面板。
- 空查询默认展示热点入口，并在底部显示快捷键提示与 `Powered by Tuff Intelligence.`。
- `TxCommandPalette` 增加 empty/footer slots 与 overlay/panel class props，用于业务侧克制扩展。

### nexus: align dashboard activity and device status

- Dashboard overview 下层活动流 / 设备状态与上层趋势卡片统一 `8/4` 栅格比例，修正两层卡片竖向对齐。
- 设备状态卡增加平台 brand icon，并优先展示最近访问 IP 与归属地。
- `auth_devices` 增加最近访问 IP / Geo 字段，设备 upsert 时记录真实请求来源；活动流合并最近登录与设备访问，避免有设备记录但活动流空置。

### nexus: update team invitation flow

- `dashboard/team` 将激活码兑换收敛为顶部按钮 + 弹窗，个人团队状态区隐藏角色与已激活席位。
- 团队邀请从公开邀请码输入改为按邮箱或用户 ID 定向发送；个人团队页展示收到的团队邀请。
- 接受团队邀请改为 `/team/join?invitation=...` 详情页，并在加入前强制 Passkey 二次验证。

### nexus: sync privacy settings through account API

- `dashboard/privacy` 的隐私偏好改为账号级服务端设置，不再使用浏览器 localStorage 作为 SoT。
- 新增 `/api/dashboard/privacy-settings` GET/PATCH，用于同步使用分析、崩溃报告、详细使用数据与个性化推荐偏好。
- `auth_users` 增加隐私偏好列并通过 schema hydration 自动补齐，页面文案调整为账号同步语义。

### nexus: normalize credits display

- credits 额度改为整数 credits 积分单位，Free 周期额度为 1000，认证后为 5000；团队池按旧比例放大到整数 credits 口径。
- 用户侧 credits 页面不再展示剩余或总 credits，只展示消耗百分比、消耗 credits 积分与单条流水消耗。
- 认证提升文案只说明会提升额度，不暴露具体提升后的额度数值。

### nexus: fix login history accuracy

- 登录历史将网页登录记录为 `web` 来源，避免密码登录被误标为 App。
- OAuth / Magic Link 成功登录补充写入历史，Passkey 登录去掉二段式 token 消费造成的重复成功记录。
- `/api/login-history` 仅返回脱敏 IP，Dashboard 登录历史与活动流统一展示 `ipMasked`。

## 当前文档入口

- Roadmap：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 当前计划：`../TODO.md`
- AI：`../TODO-AI.md`
- R3：`../TODO-R3.md`
- Nexus：`../TODO-nexus.md`
- Evidence Matrix：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
