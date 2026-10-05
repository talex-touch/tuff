# Agent 桌面工作区

## Purpose

通过直接复用 PI-Desktop 的可移植源码，在 Tuff 现有 Home 中提供真实的多轮聊天、Agent 执行、队列、分支、模型配置、上下文状态、活动审批和文件变更审阅。UI 使用 Vue/TuffEx；Main 保持模型凭据、会话数据、权限和项目路径的权威。此能力不等于把完整 PI-Desktop 应用或 Rust host-core 嵌入 Tuff。

## Requirement: 固定来源、直接复用与许可边界

复用源码必须固定于 `vastsa/PI-Desktop` 提交 `3b036cc7810e18b3ef7689a2b93385125a8d0a3f`，保留文件级来源、原版权信息、LGPL-3.0 许可和适配修改说明。源码整理为可由 Main 与 renderer 实际调用的独立模块，附所需 GPL/LGPL 许可、发行 notice、对应源码和重新组合/构建信息；Tuff 原有文件维持其适用许可。独立包不是自动满足分发义务的豁免。

优先直接复用有界 `TurnQueue`、必要存储端口、模型绑定/限制来源/能力/思考等级函数、消息流身份合并和上下文展示逻辑。与 Pi/Rust/React 宿主耦合的代码采用窄适配或明确标为 LGPL 衍生适配，不将未接线的复制目录、虚假同名实现或另造一套 runtime 当作复用。许可与来源映射应覆盖实际进入构建的复用文件。

### Scenario: 交付确实调用了上游代码

当用户使用队列、模型配置或活动流时，实际路径调用带固定来源映射的复用模块。构建与发行包含准确的许可和对应源码说明，复用/衍生部分没有被改标为 MPL；未使用的复制文件不作为功能交付证据。

Acceptance: A1

## Requirement: Home 的 Chat 与 Agent 执行权威

Home 保留现有路由、侧栏、composer 和产物预览；新会话可明确选择 Chat 或 Agent。Chat 使用已有 Intelligence Provider/CLI 路径，包括 Pi 原生会话权威；Agent 使用已有 orchestrator 和 Pi Agent worker，不增加第三套执行引擎。Agent profile 必须真实存在、启用并可由用户配置，工具白名单与权限由 Main 验证；没有可用 profile 时明确引导配置，不用假 profile 或默认授予文件权限。

会话模式、profile、项目、Provider、模型和推理偏好由宿主持久化。已有会话改变执行模式时产生独立分支，原会话的权威、历史和原生 pointer 不被覆盖。Agent 多轮输入使用属于该会话的可追溯历史与上下文，真实模型请求、工具执行、审批和终态进入同一活动投影。

新 Home Agent 文件执行根必须来自 Main 解析的持久项目绑定，不能由 sidebar 当前项目、模型输出或任意请求 cwd/metadata 自行指定。未绑定项目时不得退回当前项目获得文件写入权限；已有内部自动化的授权语义不因新增 Home 路径而被暗中拓宽。

### Scenario: 普通用户从 Home 完成真实 Agent 工作

用户在 Home 选择合法 profile、项目与模型，发送任务后看到既有 worker 的真实执行、工具与审批结果；普通 Chat 原有行为仍可用。改变模式得到独立分支，重载后会话/profile/项目绑定一致，后台工作不随侧栏项目切换改根。

Acceptance: A2

## Requirement: 单一有效模型绑定

模型的连接/鉴权仍由既有 Provider 与 Main 凭据生命周期管理；模型引用使用稳定 `(providerId, modelId)`，显示别名不得作为发送到上游的模型 ID。模型绑定包含上下文窗口、输出上限及独立来源标记、thinking 支持/协议/默认值和图片能力的显式覆盖。发布目录、服务发现、用户覆盖与未知能力分别处理。

Settings、Home、Agent 模型桥和真实 Provider adapter 读取同一有效解析。目录来源的值可以跟随目录更新，用户来源的值保持固定；旧值无法判断来源时保留原值而不是猜测用户意图。未知元数据保守标明未知，不把通用种子值呈现成已验证能力。设置变化不得只有 UI 生效而实际请求无变化。

图片能力由绑定/目录与实际 adapter 联合决定，不因模型名称包含某个词而启用。尚无实际传输实现的模态不得通过一个勾选框宣称支持。上下文/输出限制必须用于实际请求预算或实际 adapter 的限制，界面明确显示请求的有效值及必要的钳制原因。

### Scenario: 保存的模型绑定在请求中生效

用户保存某模型的别名、窗口/输出、thinking 或图片能力后，Home 与 Agent 选择器显示同一配置，实际请求/输入门禁使用相同有效值。刷新目录保留明确用户覆盖；未知模型不能冒充已知窗口、推理或图像能力。

Acceptance: A3

## Requirement: 旧配置与单次调用不越权

旧模型 ID 列表无损迁移到新绑定格式，capability 的 Provider 顺序、模型引用、defaultModel、enabled/priority、CLI 动态目录、收藏、语音协议与 prompt 保留。旧 Provider 的 credential/authRef 不变，既有元数据不得为迁移模型字段而丢弃。生产调用方同步迁移到同一配置权威，不保留两套可独立修改的模型真相。

Tuff `auto` 保持不发送 reasoning override；复用上游函数不能使未配置的 Tuff 会话默认采用最高推理等级。标题生成、语音润色、插件单次 completion 和 Agent worker 的模型桥只执行各自模型操作，不继承 Home 工具许可或在 Pi CLI 内再启动一层工具循环。执行用途/授权由可信宿主调用路径确定，不接受插件或模型自行声明用途提权。

凭据只由已有 Main 服务解析。队列、模型公开记录、renderer、审阅快照和 portable 会话数据不得包含 API key、OAuth grant、工具 bearer 或原生 credential 文件内容。

### Scenario: 升级与辅助 completion 保持原行为

升级后既有 Provider/capability/CLI/语音/收藏/凭据引用仍有效。auto 不增加 reasoning 参数；标题、语音润色、插件单次请求或 Agent 模型桥不会因选择 Pi CLI 而获得或重复执行宿主工具，公开数据无原始凭据。

Acceptance: A4

## Requirement: 每会话配置与稳定执行身份

不同会话分别保存模式、profile、项目、Provider、模型与推理选择；全局默认/收藏只是初始化来源，不覆盖已存在会话的显式选择。活动 turn 的有效配置在接受时固定，设置变化只影响未接受的后续操作。

每项待发送输入保存用户入队时的选择；执行前重新验证 profile、Provider、资源与当前权限。保存的模式或旧 grant 不得绕过后来发生的禁用、撤销或项目变化。消息、turn、工具、审批、run 和 trace 身份明确区分，不以消息内容或 role 猜配。

### Scenario: 两会话及迟到事件相互隔离

两个会话使用不同配置并交错运行/切换时，活动请求使用自己的已解析配置，待发送项保留入队选择并重新核验权限。旧 turn 的迟到响应只影响所属历史，不改写新 turn、另一会话或另一项目。

Acceptance: A5

## Requirement: Main 持有的有界队列

队列由 Main 与现有 SQLite authority 持有，而非 renderer 内存数组。每会话最多 8 条待发送项；超过上限明确反馈且保留未入队草稿。一会话只允许一个活动 turn，接受/出队/终态和幂等身份在宿主边界控制。

顺序使用上游 TurnQueue：提升项按提升操作顺序位于普通项之前，普通项保持到达顺序。提升是一次性，普通项上下调序不穿越已提升区。用户可删除、调序和提升下一条；提升不会中断现有响应或工具，只决定活动 turn 安全结束后的下一项。未成功持久化的输入不能显示为已入队。

### Scenario: 生成期间输入可管理且不重复执行

活动 turn 期间用户连续提交输入，UI 显示 Main 已确认的队列。8 项边界、删除、调序和提升遵循固定规则；正常排空每项只执行一次，现有工具不被强制打断。

Acceptance: A6

## Requirement: 停止、失败与冷启动保持暂停

停止取消当前执行并暂停该会话队列，保留待发送项。失败暂停后续排空；审批阻塞保持等待，不把批准或未完成工具当作普通完成。用户明确继续后才重新验证并处理后续项。

重启恢复的队列默认为 held，活动但未完成的 turn 明确标为 interrupted/cancelled，不自动发送 Provider 请求、恢复旧审批 grant 或重放已完成工具。恢复的输入和终态在 UI 可见；复制/删除/继续等操作必须在对应会话身份下执行。

### Scenario: 停止和重启不会自行继续工作

用户停止或关闭应用后重新打开，待发送项仍可见但不会自动执行。明确继续后按固定顺序处理，已完成工具不重放；失败和待审批状态不会被改写为成功。

Acceptance: A7

## Requirement: Tuff-owned 会话 fork 是独立快照

完整 fork 在源会话闲置时进行。锚点 fork 仅接受已完成 assistant 前缀；仍在运行的 turn 或该前缀中的运行记录不得被复制为可执行历史。authority 在同一受控操作内核验源边界，原子建立新会话及全部引用，不发布半个 child。

新会话独立重映射 message/tool-call/compaction 身份，复制该前缀真实且安全的附件引用，保留 Provider/model 等引用而不复制 credentials 或 Provider 配置存储。活动 runtime、turn、审批、待发送队列、notifications 和无关 scratch 不继承。保留的 review 证据不可回滚。

fork 的 child 必须出现在历史列表；完成时只有仍拥有导航意图的请求可以切换当前页面，不能抢占用户已经选择的另一会话。

### Scenario: 父子会话后续动作不会互相污染

完整 fork 或合法前缀 fork 得到完整新会话，附件/消息/工具/压缩引用属于 child。busy 或非法前缀拒绝且无半成品；父子继续发送、删除、review 和导航竞态互不影响。

Acceptance: A8

## Requirement: Pi-backed fork 由原生来源权威处理

原生 Pi 会话不能只复制 Tuff 可见文本而声称复制了全部模型上下文。fork 必须从已验证的 canonical JSONL 快照建立新的原生文件、native id、Tuff pointer 和 lease，保留活动 branch 的有效 model/thinking/compaction、祖先关系及未知合法项；父文件不变。

仅已可靠映射到原生 entry 的锚点可用于原生消息分支；历史可见消息缺映射时明确说明原因，不按文本相似度推断。已验证且静止的当前原生 head 可以完整 fork。原生 saved Provider/auth 不得回退到另一 Desktop Provider；fork 是数据操作，不因 fork 自动加载项目扩展或请求模型。

原生 source 的路径/identity/字节与 lease 在发布前核验，新文件无覆盖地原子发布并核验完整性。活跃、外部修改、版本/内容不安全或归属不明时 fail closed；已有内容保留，不自动修复来源文件。

### Scenario: 原生 fork 保留上下文而不共享父权威

有效静止 head fork 产生可继续的新 JSONL/pointer/lease，父文件字节不变，saved model/thinking/compaction/合法未知项按来源语义保留。活跃 lease、外部写入、无可靠锚点或不安全路径拒绝，没有共享父 native id、另一 Provider 凭据兜底或半个 child。

Acceptance: A9

## Requirement: 上下文展示区分数据来源

上下文面板使用现有 host context preparation/log/snapshot/usage API 和真实流事件。展示至少区分：宿主上下文包 budget/tokenEstimate、Provider 报告的本次 usage、压缩开始/结束及原因、真实 checkpoint/压缩 snapshot 的身份和状态。

这些数值不得混用。模型目录窗口是能力限制，不是实际占用；累计计费 tokens 不代表当前 context；压缩事件没有前后数值时不生成虚构节省量。无报告的数据标为未知，估算标明估算与来源。原始凭据、未经授权的规则/技能正文或其他会话内容不因面板而被额外读取或披露。

### Scenario: 面板显示可复核事实而非推测

用户查看 Home/Agent 上下文时，budget、estimate、Provider usage、压缩事件及 checkpoint/snapshot 各有真实来源与明确标签。没有数值时显示未知，不以字符换算、目录最大值或计费累计值冒充实际剩余上下文。

Acceptance: A10

## Requirement: 工具与活动投影可定位、去重与恢复

时间线投影真实模型/工具/审批事件，保持稳定 conversation/turn/message/tool-call/request/run identity 与顺序信息。用户可从条目定位所属消息；重载后以持久化结果恢复已完成活动，未完成活动保持明确中断/等待状态。

重复与乱序事件按身份合并而非重复插入；text-reset 回到最后 commit，不删除此前已提交的回答与工具。未知事件不伪造成完成或成功。tool/run 参数与输出遵守已有隐私投影与有界文本，不从经过裁剪的事件反推文件快照。

### Scenario: 重载与重试仍只有一条对应活动

真实工具开始、参数、结果、错误、审批等待和终态能显示并定位。重复/乱序/迟到事件不生成重复卡片或污染其他 turn，重载保留事实状态，reset 保留此前已提交内容。

Acceptance: A11

## Requirement: 审批展示共用，授权权威分开

Gateway 工具审批使用真实 requestId 与既有 confirmDecision gate；orchestrator 运行审批使用真实 runId 与 approveRun/fingerprint/authority 检查。展示可以使用统一卡片，但请求种类、动作 schema、记忆范围和终态不得混淆。

模型 toolCallId 只用于执行关联，不能充当授权。拒绝、取消、超时、无可用确认 surface、重复/迟到决定及权限改变继续由原 gate fail closed。重新打开历史卡片不能恢复已经失效的 grant。外部/MCP 调用无所属会话时明确显示为外部活动，不捏造当前会话归属。

本能力不实现新的 Plan/Goal 不可变合同或以其名义授予执行权限。

### Scenario: 历史或其他域的批准不能执行当前操作

工具 requestId 和运行 runId 分别走原入口；拒绝、过期、取消、重复决定与权限变化保持原义。其他会话、模型输出或外部调用不能冒充本会话授权，未批准操作不执行。

Acceptance: A12

## Requirement: 宿主控制的文件操作形成可信 review

review 记录产生于实际 `file.write/delete/copy/move` executor 的修改前/成功后边界。Main 从所属 conversation/run/project 解析 canonical workspace 和路径，记录修改前后存在性/hash、必要原始快照、操作结果及有界 diff；新增、覆盖、删除和复制/移动的涉及路径有明确记录。

采用上游有界快照/diff 原则，16 MiB 是单文件可回滚快照上限，文本 diff 读取有界于 512 KiB，并限制行数与计算工作。二进制或超过 diff 限制不生成虚构文本 hunk；快照未建立成功不能显示为 reversible。操作失败及部分完成有准确状态，不让 review 失败掩盖实际文件操作结果。

回滚仅接收 Main-owned snapshot 身份，经过现有授权，重新解析所属 workspace 和路径，并核对当前文件仍等于操作完成后的存在性/hash。复制/移动在动手前校验涉及的两端；任一冲突时不覆盖用户后续修改。Main 对自身的同路径修改序列化，拒绝越界和 symlink 漂移；不声称能阻止不合作外部进程在 OS 写入窗口中的所有竞态。多路径恢复中途失败保留可复核状态，不能假报全部完成。

### Scenario: 文件未漂移可恢复，发生冲突不覆盖

隔离项目真实执行 write/delete/copy/move 后可查看准确 diff/hash/快照。内容未漂移时恢复正确状态；后续编辑、任一路径冲突、symlink 逃逸、权限撤销或中途失败有明确拒绝/部分状态，不覆盖用户修改或假报成功。

Acceptance: A13

## Requirement: Review 能力与继承有明确边界

Bash、外部进程和任意 MCP 写盘没有完整的逐路径宿主生命周期，因此不提供声称完整/安全的自动撤销；只显示真实执行详情与归因边界。二进制、大文件、快照缺失或失败明确标明是否有 diff 与是否可回滚。

会话分支可以保留历史 review 证据用于理解上下文，但不能继承源会话的可执行 rollback 权利。任何回滚的 session/run/snapshot 身份都必须匹配宿主持有的记录。

### Scenario: 不支持的修改及继承记录没有假撤销

大文件、二进制、快照失败和任意 shell/MCP 写盘明确显示支持边界；没有伪造 patch 或撤销按钮。child 的历史证据只读，不能通过 source snapshot 回滚父会话文件。

Acceptance: A14

## Requirement: 数据生命周期与双 home 升级

队列与分支附件使用 Main 验证的 durable 内容引用，不依赖 renderer object URL 或把 credentials/任意路径内联进 portable 会话。原始用户文件与应用管理的附件副本身份分开。

队列、review 元数据和会话扩展沿用现有数据库 owner、单 writer 调度和迁移链；若对应表有主库/aux 双 home，则新建与旧安装升级均保留相同有效 schema 和已有行。不能增加另一个 SQLite writer 或以无事务 JSON 文件替代业务权威。

删除会话通过既有生命周期 owner 清理该会话的队列、应用管理附件和 review 快照；不得删除其他会话、父会话、原始用户文件或外部原生来源文件。原生 pointer、lease、local workspace 和敏感资源保持既有 portable 同步边界。

### Scenario: 重载与删除只影响所属数据

队列和分支图片在重载后仍有效；新/旧主库及 aux 升级保留已有数据。删除 child 清理它的数据，不影响父会话、原始用户文件或原生来源会话，且无第二数据库 writer。

Acceptance: A15

## Requirement: 真实桌面闭环与既有视觉体系

UI 使用现有 Home、侧栏、TuffEx 与 token，在右侧面板保留现有 artifacts/widgets/tools/sources 并加入上下文/review 活动。中英文文案、键盘焦点与可操作控件、深浅色、窄宽度和减少动态效果必须完整；等待使用对应布局的骨架，无数据时使用真实空态。

验收在隔离 profile 的真实 Electron 与临时项目中执行，观察 Main/持久化/运行结果和用户可见状态。源码测试、demo 组件、模拟成功截图、旧会话记录或编译 scaffold 不能替代实际闭环；未执行的模型/宿主/跨平台场景如实记录。

### Scenario: 真实 Electron 中逐项完成工作流

在隔离 profile 中完成真实 Agent 入口、队列/停止/重启、分支、有效模型配置、上下文/审批与文件 review/回滚，验证宽窄窗口、键盘、深浅色和减少动态效果。界面中的状态来自真实入口和宿主数据，没有模拟成功或假活动。

Acceptance: A16
