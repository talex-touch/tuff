# 提供双语 What's Changed 发布日志

## Goal

为 App 发版建立统一的本地 Release Notes Gateway：每次 Release/Beta 发布前，release author 使用任意本地工具基于目标变更范围产出详细、可审查、可随版本分发的中英文 `Summary Notes`、`What's New` 与 `What's Changed`，并随版本变更提交；云端只执行轻量、确定性门禁，验证通过后将同一内容用于 GitHub Release、Nexus、App 首启弹窗和 Update 路由。

## Background

- 当前最新 release 提交 `9935ed49b`（`v2.4.13`）只修改根目录和 CoreApp 的 `package.json` 版本号，没有提交详细版本日志。
- 仓库现有 146 个 Release/Beta tag，但 `notes/` 只有 14 组双语 author 文件；因此新强契约必须设置前向基线，不能把旧记录伪装成已符合新格式。
- `notes/RELEASE_NOTES_GUIDE.md` 已把 `notes/update_<version>.{zh,en}.md` 描述为真源，但当前 local gate 只检查非空并允许共享文件，release generator 与 Nexus sync 仍能回退到自动 PR 列表或 GitHub Release body。
- Nexus 已保存 `{ zh, en }` notes，而 CoreApp main 当前会把它压成优先英文的单字符串 `GitHubRelease.body`，无法支持 renderer 动态切换语言。
- 现有 OTA 父任务要求 Nexus 与 GitHub Releases 输出统一的 release contract，并保证更新发现、下载、验证和 UI 不感知来源差异。

## Requirements

### R1 — 本地 Release Notes Gateway

- 从该功能上线的基线版本开始，任何 Release/Beta 发版都必须先提交 Gateway 合规的本地 author 产物；Snapshot 豁免。
- release author 可使用任意本地 AI、编辑器或辅助工具。仓库只规定输入、输出和校验契约，不绑定模型、供应商或 author 工具。
- 本地 CLI 可提供可选的 `prepare` 助手：接收目标版本、Release/Beta 渠道和目标 ref，解析目标 SHA、上一个同渠道 tag、commit/merged PR 范围并生成 author 可消费的上下文与双语模板；是否使用该助手不作为云端门禁证据。
- author 应基于完整同渠道变更范围梳理用户可感知变化，并把 `notes/update_<version>.{zh,en}.md` 随现有版本变更提交；Gateway 不要求额外提交 prompt、模型记录、范围文件、哈希或 evidence。
- 基线之前的版本不要求回填，作为 Legacy 历史展示 Nexus 现有内容，不承诺符合新日志结构。
- 两种语言使用固定 Markdown 模板：版本 H1、必填的 `摘要 / Summary Notes`（3–6 条）、必填且非空的 `变更内容 / What's Changed`，以及按需出现的 `新增内容 / What's New`、`破坏性变更 / Breaking Changes`、`已知限制 / Known Limitations`。
- 修复、优化和行为变化统一写入 `What's Changed` 细则；`What's New` 仅在确有新能力时出现，禁止用“无新功能”等占位文案伪造非空。
- `Breaking Changes` 和 `Known Limitations` 仅在确有用户影响时填写。
- 细则必须面向用户结果，覆盖适用平台/渠道、行为变化、必要迁移或兼容提示和已知限制；构建、签名、测试数量等工程证据继续由 release evidence 承载，不写入用户日志。
- `verify` 只对最终双语文档及现有根/CoreApp 版本做无网络、可重复的确定性校验：版本、文件、结构、双语章节/条目数量与占位内容；不判断文案事实或翻译质量，内容质量由本地 release author 负责。
- PR CI 与 tag workflow 必须复用同一 `verify` 核心；未提交目标版本双语文档、根/CoreApp 版本不一致或 tag 与文档版本漂移时必须失败。
- 云端不得自动生成、翻译、补写或回退到 PR 列表/GitHub Release body 来绕过 author 文档；验证通过后，发布链路原样消费已提交双语 Markdown。
- 两种语言允许按语言习惯组织文案，不要求逐句机器式直译。

### R2 — 多入口消费同一版本内容

- 发布链路与共享 typed contract 必须保留中文、英文两份 Markdown 及其可投影摘要，不能在主进程或缓存层提前降维成单语言字符串。
- App 启动流程与后台 Update 路由必须消费同一份版本日志数据，在 renderer 按当前界面语言选择并支持语言切换后重新渲染，不得分别维护正文。
- 首启弹窗只投影日志中的摘要亮点，并提供进入 Update 路由查看完整日志的动作；Update 路由展示同源的分类详情与已知限制。
- 当前已安装版本的完整日志，以及从强契约基线到当前版本的 Release/Beta 双语摘要索引，必须随 App 打包。
- 跨级升级首启时，App 使用内置摘要索引按 semver 聚合强契约基线之后、上次已读版本到当前版本之间的全部 Release 与 Beta 摘要，不依赖网络；跨渠道升级同样合并两个渠道并标明每个版本的渠道。
- Update 路由的完整历史以 Nexus 在线数据为主并在本地缓存；断网时展示当前版本及最近一次成功缓存的历史。
- Nexus 与 GitHub 两种更新来源应暴露一致的单版本日志语义；GitHub 回退不承担完整历史列表。

### R3 — App 启动展示

- App 启动流程应在检测到已安装版本变化后的首次成功启动提供变更弹窗；英文标题为 `What's Changed`，中文标题为“本次更新”，正文按当前界面语言展示摘要亮点。
- 单版本升级直接展示目标版本摘要；跨级升级按版本分组，目标版本默认展开，跳过版本默认折叠但可逐个展开查看全部摘要。
- 弹窗应提供关闭动作和进入 Update 路由查看完整日志的动作。
- 首次安装不展示；同一版本关闭弹窗后不再重复展示。
- 用户明确关闭弹窗或进入 Update 路由查看完整日志后，才将当前版本记录为已读；渲染失败、启动中断或异常退出不记录，下次启动重试。
- 已读状态按最后成功确认的版本持久化；semver 升级必须聚合强契约基线范围内全部 Release/Beta 跳过版本，降级或回滚不触发 What's Changed。
- 日志展示失败不得阻塞 App 启动。

### R4 — Update 路由展示

- 后台 Update 路由应提供 Release 与 Beta 的完整版本历史列表，并能查看每个版本的分类变更和已知限制。
- 强契约基线之前的版本标记为 Legacy，可展示 Nexus 现有日志，但不伪装成符合新结构。
- Update 路由在桌面使用左侧版本列表、右侧日志详情的主从双栏；窄窗口改为列表进入详情的单栏导航并提供返回动作。
- 版本行内标记渠道、当前已安装版本、最新可用版本和 Legacy 状态；详情区展示所选版本的完整同源日志。
- 版本历史使用 Release/Beta 分渠道标签页，默认选中用户当前更新渠道，并允许切换查看另一渠道。
- 每个渠道按发布时间从新到旧分页加载，不能一次性请求或渲染全部历史。

## Acceptance Criteria

- [ ] **AC1 / R1** — release author 只需随现有版本变更提交与目标版本一致的 `notes/update_<version>.{zh,en}.md`；可选本地 `prepare` 能生成完整变更上下文/模板，但不产生必交 evidence；`verify` 拒绝任一语言缺失、内容为空、根/CoreApp/tag/版本 H1 不匹配、缺少 3–6 条 Summary Notes、What's Changed 为空、双语章节/条目数量不一致或占位文案；PR CI 与 tag workflow 不调用云端模型，只复用同一无网络验证核心，且不得用自动生成或 fallback 内容绕过；任何失败均不得发布；Snapshot 与 Legacy 历史不应用该强契约。
- [ ] **AC2 / R1-R2** — 日志作为版本化数据接受 diff review，并由发布链路、App 启动弹窗和 Update 路由共同消费；typed contract 保留中英 Markdown，首启弹窗投影摘要，Update 路由展示完整内容，语言切换可即时重渲染，不存在单语言提前降维或两份手工正文。
- [ ] **AC3 / R2** — 当前已安装版本的完整日志和强契约基线至当前版本的 Release/Beta 双语摘要索引随 App 打包；同渠道或跨渠道 semver 升级均可离线聚合支持范围内的全部 Release/Beta 跳过版本摘要并标明渠道；Nexus 历史加载失败时回退到当前版本及最近缓存。
- [ ] **AC4 / R3** — 检测到 semver 升级时仅在新版本首次成功启动显示一次本地化变更摘要；单版本升级直接展示目标版本，跨级或跨渠道升级按版本分组并完整包含强契约基线范围内全部 Release/Beta 跳过版本、标明渠道，目标版本默认展开、其他版本可展开；首次安装与降级/回滚不显示，同版本确认已读后不重复；只有关闭或进入完整日志才记录已读，失败或异常退出会在下次启动重试；切换中英文界面可即时更新内容。
- [ ] **AC5 / R4** — Update 路由通过 Release/Beta 标签页展示完整版本历史，默认当前渠道且按发布时间从新到旧分页；桌面使用版本列表/日志详情主从双栏，窄窗口使用可返回的单栏详情；支持打开任一版本的同源双语完整日志，明确标记渠道、当前已安装版本、最新可用版本和 Legacy 条目，并对无日志、加载失败和旧版本兼容提供明确状态。

## Out of Scope

- 回填基线之前 146 个历史 Release/Beta tag 的人工双语结构化日志。
- Snapshot 发布日志与 Snapshot 版本历史展示。
- 本任务之外的 OTA 下载、安装、恢复或签名机制调整。
- 面向插件、TuffEx 或其他独立 npm package 的 changelog，除非后续明确纳入。
