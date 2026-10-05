# Outcome

直接复用 PI-Desktop 的可移植源码，将 Tuff 现有 Home 聊天区域扩展为可持续工作的 Agent 桌面：普通聊天与真实 Agent 执行有明确边界，用户能管理排队输入和会话分支、配置模型、查看上下文与工具审批、审阅宿主记录的文件变更并安全回滚。交付必须覆盖真实入口、宿主处理、持久化和真实 Electron 界面，不能只克隆仓库、复制未使用的文件或展示模拟数据。

# Scope

## 直接源码复用

- 上游仓库：`https://github.com/vastsa/PI-Desktop`；固定提交：`3b036cc7810e18b3ef7689a2b93385125a8d0a3f`；本地只读基线：`/tmp/tuff-pi-desktop-20261003`。
- 将可移植源码归入独立的 LGPL-3.0 模块，保留来源、原版权信息、完整许可、上游提交和文件级来源映射。复用的逻辑必须由实际 Main 或 renderer 调用，不以未接线的 vendor 目录替代集成。
- 优先直接复用 `packages/agent-host/src/turn-queue.ts`、必要 ports/error 依赖、`packages/shared/src/model-catalog.ts`、`thinking-levels.ts`、模型绑定数据、`message-stream.ts` 和上下文展示计算。涉及 Tuff DTO 的部分使用窄适配器，不另建模型或会话配置存储。
- 会话 fork 和 `crates/host-core/src/review.rs` 的宿主逻辑在保留 LGPL 来源的前提下适配 Tuff Main、SQLite、原生 Pi 文件和路径权威；React 状态投影按 Vue/Pinia/TuffEx 接入，不嵌入第二套 Electron 应用或 React 工作台。

## Agent 桌面入口

- 保留 `/home`、`/home/c/:id`、现有侧栏及右侧预览面板，增加明确的 Chat / Agent 会话模式。Chat 保持现有 Provider/CLI 行为；Agent 接入已经存在的 orchestrator 与 Pi Agent worker，选择已启用 profile 并呈现真实执行事件。
- 会话模式、profile、项目、Provider、模型和推理偏好由宿主持久化。切换执行模式创建独立会话分支，不将 Pi 原生上下文和 orchestrator 上下文暗中混为同一权威。
- Agent 会话的文件操作绑定 Main 已验证的项目根；后台执行不能跟随当前侧栏选中的项目改根。未绑定项目的会话不能悄悄获得当前项目的文件写入权限。

## 模型与调用契约

- 在现有 Provider/capability 路由和凭据权威内接入结构化模型绑定：稳定模型 ID、显示别名、上下文/输出限制及其来源、thinking 支持/协议/默认值、图片输入能力。
- Settings、Home、Agent 模型桥与实际 Provider adapter 使用同一有效配置解析；只写入界面而未用于请求的字段不算完成。模型目录刷新不能覆盖明确的用户值。
- 旧模型 ID 配置进行一次性无损迁移；capability 绑定中的模型引用、Provider 默认选择、CLI 动态目录、收藏、语音协议、prompt、priority/enabled 和凭据引用保留原义。调用方同步迁移，不保留两套可分别修改的模型配置真相。
- 保留 Tuff `auto` 不发送 reasoning override 的语义，不照搬上游“未配置时用最高 thinking”的默认值，不隐式提高费用或权限。
- 标题生成、语音润色、插件单次 completion 和 Agent 模型桥只获得各自用途的模型能力；工具执行只发生在已有授权路径，不能因内部调用选用了 Pi CLI 而形成第二层工具执行。

## 会话队列与分支

- 每会话最多 8 条待发送项，采用上游有界队列逻辑；支持排队、删除、普通项调序和提升为下一条。提升只影响待发送顺序，不中断正在生成的响应或正在执行的工具。
- Main/SQLite 持有队列，入队时保存本条模型/profile/推理选择与安全附件引用；执行前重新验证当前权限和资源可用性。一会话只允许一个活动 turn。
- 停止当前 turn 同时暂停队列但不丢待发送项；失败、审批阻塞和重启恢复保持可解释状态。重启后的待发送项须用户明确继续，不自动发送模型请求或重放工具。
- 支持完整会话 fork 和从已完成消息处分支。普通 Tuff 会话由 Main 原子建立新身份、重映射消息/工具/压缩引用；复制可证明属于该前缀的安全附件，不复制活动运行、审批、队列或可执行的旧回滚权利。
- Pi-backed 会话由原生 JSONL 权威进行 source-specific fork，生成新的原生 session、pointer 和 lease，保留原生上下文与未知合法记录，父文件不变。无法证明历史消息与原生 entry 的对应关系时明确拒绝该锚点，不按文本猜测；仍支持已验证的当前原生 head fork。

## 上下文、活动与变更审阅

- 右侧面板增加上下文状态和文件变更审阅，并保留已有 artifacts/widgets/tools/sources。上下文分别展示宿主包预算/估算、Provider 实测 usage、压缩事件和 checkpoint/snapshot；未知数据明确显示未知，不伪造“模型窗口剩余量”。
- 工具与审批时间线以稳定的 conversation/turn/message/tool-call/request/run 身份投影真实事件，支持定位消息与重载恢复；保留现有 commit/reset 语义，迟到事件不得污染新的 turn 或其他会话。
- 工具批准仍使用 Gateway requestId；orchestrator 运行审批仍使用 runId 和宿主持有的授权。共享展示不合并两种 gate，不把模型产生的 toolCallId 当成授权凭证。外部调用无会话归属时单独标明，不冒充当前会话事件。
- 对宿主控制的 `file.write/delete/copy/move` 记录修改前后存在性、内容 hash、必要快照和有界文本 diff。文件变更绑定所属会话/run/project，并由同一权限与路径边界保护。
- 回滚仅接受宿主快照身份，核对当前内容仍等于操作完成后的状态；复制/移动校验涉及的两端。后续用户编辑、越界、symlink 漂移或部分失败不得被覆盖或假报成功。二进制、大文件和快照失败明确显示边界；Bash/MCP 任意写盘不提供声称完整或安全的自动撤销。
- 队列、分支附件、审阅快照、授权记录使用现有数据生命周期与删除 owner。需要改动双 home 表时同时处理主库迁移和 aux DDL/旧库升级，不建立第二套 SQLite writer。

# Non-goals

- 不整体搬入 PI-Desktop 的 Rust host-core、React 桌面、插件市场、远程控制、账户登录或配置同步系统；不替换 Tuff 的启动器、系统能力和插件隔离。
- 不新增一套 Agent runtime、secret store、权限 gate 或独立业务数据库；不直接升级整套 Pi 依赖以代替适配和验收。
- 不新增 Plan/Goal 不可变合同及其自动执行协议；本次“审批时间线”展示并调用 Tuff 已有两种审批权威，不冒充拥有 PI 的 Plan/Goal 完整能力。
- 不增加运行中 steering 或通过强制中断工具实现“立即插队”；不承诺追踪和撤销任意 Bash/外部进程/MCP 写盘。
- 不重做 Nexus 聊天产品或云端凭据存储。共享模型/事件类型涉及的现有调用方须同步迁移并保持原有用途和授权边界。
- 不 commit、合并目标分支、push、创建 PR、发布或删除工作区；这些需另行明确授权。

# Constraints and invariants

- 用户已确认独立 worktree：`/tmp/tuff-pi-desktop-reuse-worktree-20261003`；change 分支：`comet/pi-desktop-agent-workspace-reuse`；目标分支：`task/chore/live-work-1003`。保留原目录正在进行的迁移与用户改动。
- LGPL 代码独立保留许可；适配、翻译和修改的衍生部分不能改标为 MPL-2.0。发行说明、对应源码和可重新组合/构建所需信息一并准备，独立包本身不自动满足 LGPL 的分发义务。
- 保持 Main 凭据权威、typed SDK、Pi 原生 JSONL lease/append 校验、已有工具权限以及单 writer 调度。路径与授权不能由 renderer、模型输出或任意 metadata 自行宣告。
- 原目录工程规范迁移尚未进入此 worktree 基线。适用规范已从原目录的 `docs/engineering/specs/frontend/`、`main-process/` 和共享 guides 读取；本 change 不复制或接管该迁移任务。
- UI 继续使用 TuffEx、现有 token 和中英文消息目录，覆盖键盘操作、深浅色、减少动态效果及窄宽度。优先页面级组合，不顺带改造组件库或新建第二套 UIKit。
- 大于 100 MB 的依赖、构建和验证产物放 `/tmp`，使用隔离 Electron profile；不写入用户实际 profile、实际项目文件或正式模型凭据。

# Decisions

- 用户要求直接代码复用，不退回为纯竞品调研或只借鉴设计；克隆基线已完成。
- 采用已有 Home 作为 Agent 桌面，不新增平行产品入口。Chat 与 Agent 是明确的执行权威选择，而不是改变权限的提示词。
- 采用单一 Native change。各部分共用会话/turn 身份、typed transport、模型解析、SQLite 和 Home 核心区域，按依赖连续实现；不设置 Supervisor children 或要求用户再选择多会话推进方式。
- 复用上游纯逻辑，宿主和 UI 做窄适配；8 项队列、停止后暂停、冷启动明确继续，以及 Tuff auto reasoning 保留为本方案的明确产品规则。
- 复用源码可执行性已做开发前 smoke：上游模型限制来源优先级、显式图片能力、thinking clamp 和 omit 逻辑已在内存实际运行；这不是 Tuff 集成或运行时验收。

# Acceptance examples

- **A1｜实际代码复用与许可**：交付包含固定上游提交/文件映射、原许可与修改说明、对应源码/构建信息；Main 或 renderer 实际调用复用模块。不存在仅复制未使用源码、误标 MPL 或未接线的 vendor 目录。
- **A2｜真实 Agent 入口**：用户在 Home 创建 Chat 或 Agent 会话；Agent 使用已启用 profile 和既有 worker 完成真实模型/工具/审批流程，Chat 保持原有路径。模式切换产生独立分支，重载后模式/profile/项目不串会话。
- **A3｜模型绑定真正生效**：Settings 可修改模型别名、窗口/输出限制、thinking 和图片能力；Home 与 Agent 的实际请求和可用操作反映同一有效配置。目录刷新保留用户覆盖；未知字段不被伪装为已知模型能力。
- **A4｜旧配置与费用权限边界**：升级保留原 Provider/capability 路由、默认模型/收藏、CLI 来源、语音协议和 authRef；auto 不发 reasoning override。标题、语音润色、插件单次调用和 Agent 模型桥不获得额外工具执行权，凭据不进入 renderer/队列/快照。
- **A5｜每会话配置与 turn 隔离**：两会话选不同模型/profile/推理值互不影响；活动 turn 使用已解析配置，后续切换不改写已发请求；队列保存入队选择，执行前权限撤销仍有效，迟到事件不会改写另一会话或后续 turn。
- **A6｜持久队列与顺序**：生成期间连续发送会进入 Main 持有的队列；8 项上限有明确反馈。删除、普通项调序、提升下一条与正常排空符合上游排序且每项只执行一次，不中断现有工具。
- **A7｜停止与恢复不重放**：停止暂停当前执行和队列但保留待发送项；失败/待审批有明确状态。关闭再启动后待发送项可见且保持暂停，显式继续后按顺序处理，不自动发请求或重放已完成工具。
- **A8｜Tuff 会话分支完整独立**：完整 fork 或已完成前缀分支原子生成新会话，消息/工具/压缩身份独立，安全附件引用正确。busy/不安全前缀拒绝且不留下半个子会话；父子后续发送、删除和导航竞态互不污染。
- **A9｜Pi 原生分支完整独立**：有效静止原生 head fork 生成新 JSONL/pointer/lease，可续接且父文件字节不变；model/thinking/compaction/合法未知项按 source 语义保留。外部写入、活跃 lease、无可靠锚点或非法路径拒绝，不共享父 native id 或使用别的 Provider 凭据兜底。
- **A10｜上下文信息有真实来源**：Home/Agent 面板展示当前宿主预算/估算、Provider usage、压缩状态和真实 checkpoint/snapshot，并分别标注来源；没有数据时显示未知，不用字符猜算、目录窗口或累计计费值冒充实际剩余上下文。
- **A11｜活动时间线可恢复**：真实工具开始、参数、结果、错误、等待审批和终态按稳定身份显示、定位并在重载后恢复；重复/乱序/迟到事件不生成重复卡片，text-reset 不丢掉此前已提交的工具或回答。
- **A12｜审批权威不混淆**：Gateway requestId 与 orchestrator runId 使用各自决策入口；拒绝、过期、取消、重复决定和权限变化保持原 gate 语义。模型 toolCallId、其他会话或外部调用不能冒充本会话授权，未批准操作不执行。
- **A13｜可信文件变更与受保护回滚**：在隔离项目中实际执行 write/delete/copy/move 后可查看真实有界 diff/hash/快照；内容未漂移时回滚恢复正确状态，后续用户修改、两端任意冲突、symlink 逃逸或权限撤销时拒绝且不覆盖。中途失败明确报告部分状态，不假报成功。
- **A14｜审阅边界与分支权限**：二进制、大文件、快照失败、Bash/MCP 任意写盘明确显示支持边界，不展示伪造 diff/撤销；子分支保留的历史 review 证据只读，不能借旧 snapshot 回滚父会话的文件。
- **A15｜持久化与数据生命周期**：队列与分支图片使用宿主安全持久引用，重载后有效；新/旧主库和 aux home 升级保留已有数据且不产生第二 writer。删除所属会话清理其队列/附件/快照，不删除父会话、其他会话、原始用户文件或原生来源会话。
- **A16｜真实桌面验收**：在隔离 profile 的真实 Electron 中完成 Agent 入口、排队/停止/重启、分支、模型配置、上下文/审批和文件审阅回滚的可观察闭环；验证宽窄窗口、键盘、深浅色与减少动态效果。无数据时是真实空态/骨架，不能以 demo、源码测试或模拟成功截图替代。

# Verification expectations

- 为队列顺序/幂等与恢复、fork 身份/原生并发、模型覆盖/迁移、审批域、hash 冲突和双 home 升级等有实际消费者风险的边界建立确定性回归，遵守现有测试约定；测试由 Tester 编写，不写源码文本、转发 plumbing 或 mock echo 断言。
- 使用 scoped 类型/lint 与相关既有检查；最终检查由 Runtime 冻结候选后执行。真实 UI/宿主证明使用隔离 Electron/CDP 和临时项目，记录运行、未运行与限制，不使用旧会话的验收结论。
- 不以普通 Provider 的 usage 推导未报告的模型窗口占用，不以 Git HEAD 或修改后文件内容伪造修改前快照，不用人工拼造审批或 fork 成功结果。

