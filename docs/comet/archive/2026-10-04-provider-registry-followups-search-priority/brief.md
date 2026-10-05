# Outcome

修复用户从 PR #2050「未处理」中选出的全部组件与服务渠道后台遗留问题，并提高 Tuff Settings 等常用内置入口在默认搜索排序中的权重。组件修复直接进入 TuffEx，后台移除因此过时的绕行实现；不增加新的设置步骤。

# Scope

- TuffEx：TxButton 的 circle 与 sm 组合尺寸、TxSelect 内部 combobox 的 id/aria-label、TxStatCard 默认变体的 meta，以及 TxDrawer 与上层确认框的键盘所有权。
- Nexus：服务渠道后台跟随组件公共接口迁移；修复运行被服务端拒绝后的刷新、渠道编辑在能力 JSON 无效时的部分写入；清理仅测试引用的旧筛选/空态函数；纠正能力索引筛选栏的规格描述。
- CoreApp：为现有 AppDestinationProvider 的可搜索内置入口增加有界默认排序偏置，覆盖设置总览与设置子页，以及现有主窗口、首页、对话、插件市场、已安装插件和下载入口；不扩大别名召回范围。
- 同步受影响的完整目标 Spec、TuffEx 中英组件文档与必要演示；执行定向检查、Nexus 真实浏览器和隔离 Electron 验收。

## Source coverage

覆盖边界为用户消息列出的遗留项和后续截图中的内置入口搜索提权诉求。PR 其余「未处理」内容仅作背景，不自动加入范围。截图用于确认搜索结果中的 Tuff Settings 入口，不构成视觉重设计要求。

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由 |
| --- | --- | --- | --- | --- | --- | --- |
| 用户首条消息：TxButton circle 与 sm | complete | 小圆按钮宽高按 sm 一致，不被最小宽度拉长 | tuffex-control-contracts / 圆形按钮 | A1 | covered | PR #2050 报告为 60×26 |
| 用户首条消息：TxSelect aria-label / id | complete | 命名和标签关联直接到内部操作控件 | tuffex-control-contracts / 选择器属性；nexus-admin-kit / 控件命名 | A2 | covered | 组件修复后移除后台专用指令绕行 |
| 用户首条消息：TxStatCard meta | complete | 默认与 progress 变体均显示 meta | tuffex-control-contracts / 统计卡说明；nexus-admin-kit / 统计卡说明行 | A3 | covered | 保留后台统计数字与骨架对齐 |
| 用户首条消息：确认框依赖内部类名 | complete | Esc/Tab 只由当前上层交互面处理 | tuffex-control-contracts / 叠层键盘；nexus-admin-ai-services / 服务渠道确认 | A4 | covered | 移除业务侧内部类名判断 |
| 用户首条消息：运行拒绝后不刷新 | complete | 已发出的运行请求被服务端拒绝后刷新真实状态 | nexus-admin-ai-services / 场景运行状态刷新 | A5 | covered | 保留错误与失败运行结果 |
| 用户首条消息：能力 JSON 部分保存 | complete | 首次变更请求前完成全部本地校验 | nexus-admin-ai-services / 服务渠道编辑预校验 | A6 | covered | 本地校验失败时零写请求 |
| 用户首条消息：三个列表筛选栏规格 | complete | 明确服务渠道/路由有筛选栏，能力索引仅分页 | nexus-admin-ai-services / 服务渠道列表 | A7 | covered | 修正文档，不扩展产品筛选功能 |
| 用户首条消息：旧函数仅测试引用 | complete | 清除确定无生产调用的旧筛选和空态实现及其专属测试 | nexus-admin-ai-services / 客户端列表实现边界 | A8 | covered | 使用引用分析，不删除仍有消费者的函数 |
| 用户截图与补充消息：默认设置等权重提高 | complete | 已匹配内置入口得到有界默认提权，不覆盖显式用户行为 | corebox-built-in-search-priority / 内置入口排序 | A9 | covered | 截图 sz 对应设置入口，非重设计 |

# Non-goals

- 不处理 PR 未被用户选中的配额保存刷新、服务端英文错误翻译、1920px 统计卡右侧空白等其他事项。
- 不改变服务端 API、数据库结构、远端渠道配置或真实生产数据；本地 JSON 校验前置不等于多次网络写入具备跨请求事务，不新增事务接口或回滚机制。
- 不增加能力索引筛选栏，不改搜索别名、学习模型、空查询推荐、置顶语义、索引策略或用户已保存设置；不提升第三方插件和破坏性系统动作。
- 不提交、合并、推送、创建 PR 或发布；不改原工作区及其他任务。

# Constraints and invariants

- 用户于 2026-10-04 明确选择独立 worktree；分支为 comet/provider-registry-followups-search-priority，目标分支为 stage。已验证 stage 包含 PR #2050 的合并提交 3af4a82925ecbd00c644deb56e559b981d4ab2a6。
- 组件与后台迁移在同一 change 中集成验收；它们共享接口与验收页面，拆成独立发布会保留过时绕行实现，因此不创建 Supervisor 子 change。
- 所有写入在 Native Build 后进行；当前仅准备需求与目标规格。
- 测试与浏览器使用隔离本地数据，真实上游运行/探测、生产保存与删除不在授权内。

# Acceptance examples

- A1：TxButton 同时设置 circle 和 size="sm" 时，真实浏览器测得宽高相等且符合 sm 尺寸；其他既有尺寸及非 circle 按钮不退化。
- A2：TxSelect 的 id 与 aria-label 从首次渲染到属性更新均到达实际 combobox，而不是仅在根 div；单选 label-for 可聚焦对应控件，多选仍有可访问名称。后台迁移到公共属性后不再使用专用命名指令，也不出现重复 id。
- A3：TxStatCard 的 default 与 progress 变体都显示非空 meta，未传 meta 时不新增空说明。AdminStatGrid 仅一项有 meta 时，说明只显示一次、各卡数字仍对齐，加载骨架与成品布局一致。
- A4：确认框叠在 TxDrawer 上时，Tab/Shift+Tab 留在确认框，Escape 只关闭确认框、提交中不关闭；底层抽屉保持打开。确认框关闭后抽屉恢复自身键盘操作，业务代码不依赖 TuffEx 内部类名或 body 按键拦截绕行。
- A5：场景运行请求已发出后，无论正常返回失败状态还是服务端拒绝并记录失败运行，页面都自动刷新注册表，更新最近运行和统计，同时保留运行错误与失败结果。仅输入 JSON 本地解析失败不发运行请求，也不触发该刷新。
- A6：编辑服务渠道时，任一有效能力行的计量、约束、metadata JSON 或既有本地校验不通过，都在首个渠道/能力写请求前失败；已填内容保留，错误显示对应字段与行号。合法输入仍能更新渠道及能力，保留删除确认和保存代次隔离。
- A7：完整目标规格准确写明只有服务渠道与能力路由有筛选栏，能力索引保留独立客户端分页、cap_ URL 状态和空态；三个列表不会因首次数据晚到而丢失深链页码。
- A8：经引用分析确认仅由测试使用的旧筛选/空态函数与其专属测试被删除；仍被生产页面使用的单项判定和格式化等函数保留，现有真实筛选、分页和空态行为不变。
- A9：在无使用历史的默认条件下，设置总览、常用设置子页及现有其他可搜索 AppDestination 入口获得有界排序加分，优先于同一查询的低相关模糊结果；精确应用/文件意图、用户置顶和现有学习信号不被全局置顶规则覆盖，不相关查询不召回内置入口，不改用户配置或使用历史。
- A10：受影响后台页面保留现有加载/刷新/失败/重试、四标签页 URL 状态、只读详情、删除与执行确认、表单命名及保存代次隔离契约；1280px 下中英、深浅色无新增横向溢出，确认取消不产生业务写请求。
- A11：受影响 TuffEx 中英组件文档、必要演示和完整目标规格与实现一致；定向检查通过，并提供真实 Nexus 浏览器与隔离 Electron 的行为证据，不以静态测试替代实际交互。
