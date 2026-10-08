# embedded-terminal

本文定义 TuffEx 终端显示组件、CoreApp 主进程 PTY 会话、typed SDK 和现有调用方的统一行为。显示能力独立于进程执行能力；网页展示终端或日志不要求 Electron。

## Requirement: 可复用终端显示

`TxTerminal` 使用 xterm.js 显示 ANSI 与 Unicode 输出，提供交互和只读模式。组件属于 TuffEx，不能 import Electron、创建子进程或默认请求 shell 权限。组件按宿主尺寸适配行列，宿主深浅色变化后更新终端主题。主题、字体、只读行为和公共操作由组件接口统一提供，不由调用方重复创建 xterm 实例。

浏览器相关对象只在客户端生命周期内使用。组件在服务端导入或渲染时不能访问 `window`、`document` 或创建 xterm 实例。卸载后释放 xterm、addon、ResizeObserver、事件监听与尚未执行的适配回调。输入只由交互模式向调用方发送；只读模式保留文字选择和复制能力，不发送终端输入。

### Scenario: 网页和 Electron 共用显示组件

- WHEN 普通 Vue/Web 或 Electron 渲染器挂载 `TxTerminal` 并写入 ANSI、中文和连续输出
- THEN 内容在实际终端中按原顺序显示，交互模式的键盘输入可供调用方接收
- WHEN 宿主尺寸或主题变化，随后卸载组件
- THEN 行列与主题更新，卸载释放显示资源；不因挂载组件自动启动进程

Acceptance: A1

## Requirement: 主进程真实 PTY

通用终端和 AI CLI 使用共用的 `node-pty` 会话核心。主进程持有 PTY，前端使用 typed transport 创建和控制会话。创建操作接收明确的可执行文件、独立参数、工作目录与初始尺寸。业务需要默认 shell 时，由主进程按平台解析，并由显式用户动作发起；不把任意 command 字符串隐式交给 shell 解释。

会话支持创建、输入、resize、关闭、输出与退出通知。PTY 底层必须向子进程提供 TTY 和实时行列。Ctrl+C 等输入作为终端输入传入，使前台进程观察到真实终端语义。启动失败返回明确错误，不返回可用会话 ID，也不降级为 piped-stdio。

### Scenario: 输入、控制键和尺寸传至真实进程

- WHEN 用户显式创建交互会话，输入命令、改变尺寸并发送 Ctrl+C
- THEN 子进程观察到 TTY，收到对应输入、行列变化和中断，退出状态传回界面
- WHEN 可执行文件不可用或 PTY 启动失败
- THEN 界面收到明确失败，主进程不遗留进程或假会话

Acceptance: A2

## Requirement: typed SDK 与会话清理

新的 terminal domain SDK 管理终端创建和会话订阅，替代 touch-sdk `Terminal` 类。订阅与创建顺序必须覆盖立即输出、立即退出和创建取消的情况。输出保持顺序，不通过 `slice` 丢弃较大输出块，也不丢首段或退出前的最后输出。

关闭、自然退出、调用方卸载、sender 销毁与主进程模块销毁收敛到同一清理过程。清理释放进程、PTY 监听、transport 监听和 sender 监听。重复关闭不重复释放资源或发布退出结果。关闭后的迟到事件不能恢复会话或向新的消费方输出。调用方放弃等待创建结果时，已启动的会话仍须收尾。

### Scenario: 快速结束与多种清理入口

- WHEN 子进程在创建完成前后快速输出并退出，或者输出一个超过原有单块裁剪长度的有效数据块
- THEN SDK 消费方获得完整、有序的输出及一次退出结果
- WHEN 会话关闭、界面卸载或窗口销毁，并再次尝试清理
- THEN 会话资源全部释放，迟到通知不进入其他会话，重复清理不产生重复退出

Acceptance: A3

## Requirement: 权限与 owner 隔离

终端是主进程特权能力。创建、输入、resize 和关闭都保留 `system.shell` 权限判断，主进程根据可信 transport 上下文确定 owner。请求正文中的 plugin 名称、key 或 owner 字段不能决定权限或归属。身份与权限必须在启动子进程前确认。

窗口和插件只可操作自己的会话。其他 owner 的会话 ID 与不存在的 ID 对未授权调用方保持相同拒绝语义，不能通过探测 ID 获得会话信息。只向会话所属消费方发送输出。保持现有隐私和脱敏约束，不将命令正文、终端输出、凭据或环境变量值新增到诊断日志。

### Scenario: 其他窗口或插件试图控制会话

- WHEN 一个窗口或插件创建会话，其他调用方用该 ID 输入、resize 或关闭
- THEN 操作被拒绝，原会话不受影响
- WHEN 调用方未获 `system.shell` 或身份无法验证
- THEN 创建在启动进程前失败；其他控制操作也无法越过权限门禁

Acceptance: A4

## Requirement: AI CLI 保留业务边界

AI CLI 面板使用 `TxTerminal`，PTY 进程与生命周期交给共用会话核心。Provider 状态、可执行文件解析、项目 cwd、访问等级、原生会话恢复与 lease 继续由 AI CLI 主进程业务入口控制。通用 PTY 能力不能替代或绕过 Provider 审批和原生会话校验。

切换任务、项目或原生会话时，释放旧显示订阅并关闭旧终端，避免旧输出进入新界面。创建失败、旧终端退出、窗口销毁或关闭面板时，按既有归属规则释放原生会话 lease。AI 任务流与模型调用行为不属于本次改动。

### Scenario: AI CLI 会话切换和面板关闭

- WHEN 用户为已有 Provider 打开终端，并切换项目或原生会话
- THEN 新终端采用主进程核定的 Provider、访问等级与 cwd，旧终端和旧订阅收尾
- WHEN 关闭面板或窗口，或创建终端失败
- THEN 进程与对应 lease 释放，旧输出不进入后续会话，审批与恢复门禁仍有效

Acceptance: A5

## Requirement: 只读插件日志

插件日志通过 `TxTerminal` 的只读模式显示，继续由现有日志订阅与历史记录提供数据。保留日志追加、历史记录切换、清空、暂停和自动滚动行为。切换记录时替换显示内容，不将两个记录混合。只读显示不创建 PTY，不调用终端输入接口，不主动聚焦输入区。

### Scenario: 实时日志和历史日志共用显示组件

- WHEN 插件日志持续到达，用户暂停显示、切换历史记录或清空日志
- THEN 页面显示对应记录与已有暂停、滚动语义，不重复或混合日志
- AND 整个只读显示过程没有创建 PTY、发送输入或抢走用户焦点

Acceptance: A6

## Requirement: 环境检测与显式命令执行

插件创建页通过新的 typed SDK 完成 Node/degit 检测，检测返回现有界面所需的版本或可用状态。不可执行和检测超时不能伪装成可用。完成、失败或超时后释放检测会话与订阅。

安装终端只响应用户显式操作。调用方把可执行文件和参数分别传给主进程，而非传入等待拆解的命令字符串。显示组件展示命令的真实输出与退出结果，不再展示固定欢迎文字冒充执行。单纯挂载组件或查看日志不得执行安装。实际验收使用隔离工作目录或无副作用命令，不执行用户环境的全局 npm 安装。

### Scenario: 检测与用户主动安装

- WHEN 插件创建页检查 Node/degit，命令完成、不可用或超时
- THEN 页面获得正确检测结果，检测资源收尾，调用方不使用旧 touch-sdk `Terminal`
- WHEN 用户明确启动安装动作
- THEN 新 SDK 用独立 command/args 发起真实执行，并将输出、失败或退出显示到终端
- AND 组件挂载本身不触发安装

Acceptance: A7

## Requirement: 一次性替换 legacy

删除本次替代的 piped-stdio manager、`InteractiveTerminal`、`LogTerminal`、touch-sdk `Terminal` 类，以及重复 PTY 会话实现与不再使用的接口。全部当前调用方和生成声明迁移；不保留转发别名、弃用 re-export、旧兼容组件或第二套终端会话实现。不再使用的直接终端依赖移除，显示引擎依赖由组件包正确声明。

`TerminalTemplate` 的现有安装调用必须迁移到真实终端能力，不能只删除调用方或保留占位显示。既有历史审计和用于拒绝旧调用的安全记录不作为可调用兼容入口保留，也不重写其历史事实。外部终端打开目录等未被替代的系统功能保持。

### Scenario: 当前调用方仅使用新实现

- WHEN 检查当前终端消费方、主进程注册、SDK 导出和生成声明
- THEN 所有消费方使用新组件与 typed SDK，本次替代的 legacy 实现、重复核心与接口不存在
- AND 没有兼容转发或双实现，非终端功能与历史审计保持

Acceptance: A8

## Requirement: 注册、文档与真实验收

`TxTerminal` 接入 TuffEx 公共与分区 barrel、打包子路径与类型，并进入 Nexus taxonomy、侧栏、组件目录、gallery、双语文档和演示 registry。文档明确区分网页只读/交互显示和 Electron 主进程执行，说明创建、输入、resize 和清理方式，不能示范浏览器直接启动 shell。

当前终端事件说明和模块说明采用新实现的实际路径与事件名。相关现有类型、导出、suite、文档与演示检查通过。实际运行证据分别覆盖浏览器组件和隔离 Electron 的 SDK/PTY 往返，不将测试替身、截图示意或未运行的跨平台场景当作真实证据。

### Scenario: 文档可直接使用并有运行证据

- WHEN 查看 `TxTerminal` 的包入口、中英文档和实际演示
- THEN 组件可导入、注册齐全、两种语言说明同一行为，演示能观察交互和只读显示
- AND 相关检查通过，真实浏览器与隔离 Electron 验收覆盖对应能力；未运行场景明确标记

Acceptance: A9

## Requirement: Ghostty 只登记待办

本轮只交付 xterm.js 与 PTY。长期待办记录 Ghostty/libghostty Web/WASM 引擎的后续评估，届时重新检查上游能力、维护风险和终端兼容性。本轮不添加 Ghostty 依赖、原生窗口嵌入、空实现或兼容 facade。

### Scenario: Ghostty 范围明确保留为后续工作

- WHEN 查看长期待办与本轮依赖、实现
- THEN 待办包含 Ghostty 引擎评估，本轮仅有 xterm.js 与 PTY 的真实实现，没有 Ghostty 依赖或空实现

Acceptance: A10
