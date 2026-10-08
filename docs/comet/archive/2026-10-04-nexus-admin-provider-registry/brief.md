# 目标

把后台「服务渠道」页 `/admin/provider-registry` 迁到统一后台骨架。迁移后：

- 去掉面板限宽和双重标题，四个标签页可以深链；
- 1280px 视口下，每张表的主列不折行、不横向溢出，次要信息进只读详情抽屉；
- 时间和数字统一格式化，中英文案同步，「回退」「降级」「受限」三个词分开使用；
- 以下操作先确认再执行：状态切换、真实执行、会删除能力或绑定的保存、删除；
- 用量账本和健康检查改为服务端分页，筛选和页码写进 URL。为此，两个列表接口补上「需关注」「估算」和多状态筛选；
- 「用量」「健康」两张统计卡改为显示服务端总数。

钉住旧结构的测试同时改为测行为。

这是父任务 `10-02-nexus-admin-console-overhaul` 子任务 #5 的后半部分 5b。前半部分 5a（AI 概览、AI 调用审计、`useAdminResource`）已随 PR #2046 合入 stage，5b 复用 5a 发布的 `useAdminResource`，并把服务渠道补进 5a 发布的 `nexus-admin-ai-services` 规格。

# 范围

## 页面外壳

- `AdminPageShell` 的标题取侧栏文案（服务渠道 / Provider Registry）。
- 删除以下内容：
  - 面板根部的 `mx-auto max-w-6xl`；
  - 面板里的二级标题和说明：「已注册服务渠道」「能力路由」「用量账本」「健康检查」「服务渠道能力索引」；
  - 只有非管理员才能看到的「只有管理员可以管理服务渠道」提示。
- 区块标题由 `AdminSection` 承担。
- 四个标签页（服务渠道 / 能力路由 / 用量 / 健康）由 `useAdminQueryState('tab', …)` 读写 `?tab=`，分区条放在 `#nav`，切换标签页时保留其他 query。
- 「刷新」放在 `#actions`。
- 五张统计卡用 `AdminStatGrid`，和分区条一起放在 `#nav`，统计卡在上（D13），每个标签页都显示。数字一律带千分位：

  | 卡片 | 数字 | 说明 |
  | --- | --- | --- |
  | 服务渠道 | 服务渠道总数 | 已启用数 |
  | 能力 | 已声明的能力数 | — |
  | 场景 | 场景数 | — |
  | 用量 | 用量账本总条数，取观测窗口请求返回的 `total` | — |
  | 健康 | 未通过的检查总数（受限 + 异常），取 `health?status=degraded,unhealthy&limit=1` 返回的 `total` | — |

  用量卡和健康卡的口径，与对应标签页筛选为「全部」「需关注」时的「共 N 条」一致。
- 删除 `useProviderRegistryAdmin.ts` 里的管理员 `watch`，以及只供它使用的 `useAuthUser()`。管理员闸门由布局负责。

## 数据加载

- **注册表资源**：用 `useAdminResource` 加载一个资源，内容包括：
  - seed；
  - 服务渠道和适配器目录；
  - 能力；
  - 场景及其就绪状态；
  - 各服务渠道的配额；
  - 最近 25 条用量和最近 25 次健康检查（观测窗口，和现状一致）；
  - 未通过检查的总数。
- 注册表资源的状态：首屏显示骨架，刷新时保留内容，失败时显示本地化文案和「重试」。它供以下区域使用：
  - 服务渠道表、能力路由表、能力索引；
  - 五张统计卡；
  - 服务渠道表的健康徽标，以及能力路由表的「最近运行」。
- **用量账本**和**健康检查**各是一个独立的服务端分页列表（`useAdminList`），各自加载、失败、重试，不被注册表资源挡住。
- 修改后刷新：变更成功后，注册表资源在保留现有内容的情况下刷新。

## 列表

五个列表都用 `AdminFilterBar` + `AdminTable` + 分页（每页 20 / 50 / 100、「共 N 条」）。筛选、页码和每页条数写进 URL，取默认值时不写。每个列表用自己的键前缀，互不覆盖：

| 列表 | 前缀 | 分页 |
| --- | --- | --- |
| 服务渠道 | `pv_` | 客户端 |
| 能力路由 | `rt_` | 客户端 |
| 能力索引 | `cap_` | 客户端 |
| 用量账本 | `u_` | 服务端 |
| 健康检查 | `h_` | 服务端 |

- **服务渠道**
  - 筛选：搜索（名称、显示名称、ID、厂商、能力等，防抖）、状态（全部 / 需关注 / 健康 / 受限 / 异常 / 未知）。
  - 列：
    - 服务渠道：显示名称，过长省略，悬停看全文；
    - 状态开关；
    - 能力：最多 3 个，其余显示「+N」；
    - 健康：只显示状态徽标；
    - 操作：检查、编辑、配额、删除四个图标按钮，各自带可访问名称。
- **能力路由**
  - 筛选：状态（全部 / 需关注 / 已完成 / 失败 / 计划 / 未知）。
  - 列：
    - 路由：名称，再加 id · 归属；
    - 启用开关；
    - 就绪：徽标，缺少能力时再加「缺失 N 项」；
    - 最近运行徽标；
    - 操作：运行、编辑、删除图标按钮。
- **能力索引**
  - 列：能力（名称 + id）、服务渠道、计量单位、适配器就绪。
- **用量账本**
  - 筛选：
    - 状态：全部 / 需关注 / 已完成 / 失败 / 计划 / 估算；
    - 模式：全部 / 执行 / 试运行；
    - 服务渠道；
    - 场景。
  - 筛选与接口参数的对应：
    - 需关注 → `attention=true`；
    - 估算 → `estimated=true`；
    - 已完成 / 失败 / 计划 → `status`；
    - 模式 → `mode`；
    - 服务渠道 → `providerId`；
    - 场景 → `sceneId`。
  - 列：
    - 运行：场景，再加 runId · 模式 · 能力；
    - 状态；
    - 服务渠道；
    - 计量：数量 + 单位 · 是否计费；
    - 时间。
- **健康检查**
  - 筛选：状态（全部 / 需关注 / 健康 / 受限 / 异常）、服务渠道。
  - 筛选与接口参数的对应：
    - 需关注 → `status=degraded,unhealthy`；
    - 单个状态 → `status=<值>`；
    - 服务渠道 → `providerId`。
  - 列：
    - 服务渠道：名称，再加 id · 厂商；
    - 状态；
    - 能力；
    - 延迟；
    - 检查时间。
- 现有的彩色提示横幅（「没有需要关注的…」「还没有…」）改为 `AdminTable` 的两种空态，不再写死颜色：
  - 「没有数据」；
  - 「筛选后为空」：带对应标题和「清空筛选」。

## 接口

用量账本与健康检查两个列表接口新增筛选参数，其余参数和行为不变。完整的查询契约写在 `nexus-provider-registry-observability` 规格中。

- `GET /api/dashboard/provider-registry/usage`：
  - 新增 `attention=true`：只返回失败、计划或估算的记录（与现有界面「需关注」同一判定）；
  - 新增 `estimated=true`：只返回估算记录；
  - 两个参数都接受 `true` / `false`，缺省等于 `false`，其他值返回 400。
- `GET /api/dashboard/provider-registry/health`：`status` 接受逗号分隔的多个状态。每个值都必须是 healthy / degraded / unhealthy 之一，否则返回 400。
- 两个接口的 `total` 都按筛选后的结果计算。

## 只读详情抽屉

- 使用 `TxDrawer` + `TxDescriptions`。点一行或在行上按 Enter 打开；行内的开关和按钮不会触发行点击。
- **服务渠道**
  - 基本信息：ID、厂商、适配器、端点、地域、认证类型、归属；
  - 能力：完整能力列表（计量单位、适配器就绪情况与原因）；
  - 健康：最近一次检查的状态、延迟、原因、检查时间；
  - 其他：最近一次用量、配额摘要、更新时间。
- **能力路由**
  - 基本信息：ID、归属、策略、回退、所需能力；
  - 缺失能力：完整列表；
  - 无效绑定：服务渠道、能力、原因（服务渠道不存在 / 能力缺失 / 适配器缺失 / 模型无效）；
  - 绑定列表；
  - 最近运行：状态、服务渠道、时间。
- **用量账本**
  - 运行：运行 ID、场景、模式、能力、状态、服务渠道；
  - 计量：数量与计量单位、计费 / 估算、计价引用与服务渠道引用；
  - 错误：错误码与错误信息；
  - 过程：trace、回退链路、选中的服务渠道；
  - 时间。
- **健康检查**
  - 服务渠道、厂商、端点、能力、状态、延迟；
  - 原因：受限原因、错误码与信息、request id；
  - 检查时间。

## 确认

统一使用 `AdminConfirmDialog`，提交中锁定按钮。

- 服务渠道状态开关、场景启用 / 停用：启用和停用两个方向都要确认。
- 运行抽屉里的「执行」会真实调用上游，要确认。「试运行」不调用上游、不占用额度，不需要确认。
- 会删除数据的保存：
  - 保存服务渠道编辑时会删除能力，要确认，并列出将删除的能力；
  - 保存场景编辑时会删除绑定，要确认，并列出将删除的绑定。
- 删除服务渠道 / 场景：改用 `AdminConfirmDialog`（替换 `TxBottomDialog`），说明一并删除的能力数 / 绑定数。
- 「检查」不需要确认：行内图标打开检查抽屉，在抽屉里选定能力后点「检查」直接发出探测请求。按钮的提示文字写明它会向上游发一次探测请求。

## 抽屉表单

- 以下抽屉的块级字段改用 `AdminFormField`，标签通过 `for` 关联控件：
  - 服务渠道：创建、编辑、配额；
  - 场景：创建、编辑、运行；
  - 检查抽屉。
- 表格里的逐行编辑器（能力行、绑定行）用 `aria-label`。
- 保存失败时，抽屉保持打开，并在抽屉内显示本地化错误。
- 保存成功后只关闭发起保存的抽屉：保存仍在进行时打开了另一个抽屉，旧的保存完成后不会关掉新抽屉。

## 文案与格式

- 时间统一用 `useAdminFormat`：表格用 `tableDateTime`，并以 `dateTimeTitle` 作悬停提示；详情用 `dateTime`。
- 数字用 `number`。延迟显示为「{number} ms」，没有数据时显示「—」。
- 用词：

  | 用词 | 用于 |
  | --- | --- |
  | 降级 | 只用于场景缺少能力（就绪状态为 degraded） |
  | 回退 | 场景的 fallback 设置和回退链路 |
  | 受限 | 服务渠道状态和健康状态里的 degraded |

  英文保持 Fallback / Degraded。
- 客户端校验错误（JSON 解析、模型不在列表、数字、重复）和写死的英文（`${n} failed`、`ready` 等）全部走 `t()`。传输层错误走 `resolveAdminErrorMessage`，不显示 ofetch 原文。

## 测试

- `utils/provider-registry-admin.test.ts` 里钉住源码字面的测试改为行为测试，样式类断言删除。涉及：
  - `:269-282`；
  - `:286-301`；
  - `:305-321`；
  - `:390-402`；
  - `:435-445`。
- `pages/docs/docs-page-performance.test.ts:263-265` 改为断言：服务渠道页不静态导入重面板模块。
- `composables/useProviderRegistryAdmin.test.ts` 的调整：
  - `:162-172`（管理员 watch）删除；
  - `:253-282` 随错误处理一起调整。
- 新增单测，覆盖：
  - 列表参数、视图模型、详情字段；
  - 确认流程、抽屉的请求代次；
  - 两个接口新增筛选的 store 行为：用真实 SQLite，复用 `test/helpers/d1-sqlite.ts`。
- i18n 守卫覆盖新文件。

## 浏览器验证

在真实浏览器里逐项验证 spec `nexus-provider-scene-routing.md:105` 列出的四项，并截图。

## 来源覆盖

覆盖边界：用户指定的输入材料中，与服务渠道页（5b）有关的全部条目，以及它们依赖的共用契约。具体包括：

- `docs/engineering/workflow/handoffs/10-02-nexus-admin-migrate-ai-services/` 下：
  - `prd.md` 的 Goal、R2、R4、Acceptance Criteria、Out of Scope；
  - `research/current-state.md` 的 §1（R2、R4 行）、§3、§5、§6（服务渠道行）、§7、§8，以及 Open questions 3–8。
- 父任务 `design.md` 的 §2.2 与 §4。
- 组合件 `design.md` §8。
- 老板 2026-10-03 的四项决定，以及请求中与服务渠道有关的默认项。
- 5a brief 中标为 5b 的条目：S6、S10、S12、S21、S27、S30。
- 5a 发布的 `nexus-admin-ai-services` 规格：本 change 在它的基础上补充服务渠道，原有条目必须保持有效。
- 老板 2026-10-04 对 Q1–Q4 的回答。

AI 概览与 AI 调用审计（R1、R3）已由 5a 完成，在本边界内只作为既有行为保留。

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| S1：prd.md Goal | complete | 消除双重标题；解除服务渠道面板限宽与横向溢出 | nexus-admin-ai-services「服务渠道外壳」「服务渠道列表」 | A1、A5 | covered | 重名部分已由 5a 和 #2040 处理 |
| S2：prd.md R2 第 1 条 | complete | 去掉 `mx-auto max-w-6xl`；四个标签页改为 `?tab=`，分区条放 `#nav`；「刷新」放 `#actions`；删除面板内二级标题与副标题 | nexus-admin-ai-services「服务渠道外壳」 | A1、A2 | covered | 当前有效 |
| S3：prd.md R2 第 2 条 | complete | 1280px 下主列不溢出；次要列收进详情抽屉或窄宽时隐藏；取消 `min-w-[1470px]`、`[1040px]`、`[940px]`、`[920px]` 等强制最小宽度 | nexus-admin-ai-services「服务渠道列表」「服务渠道详情」 | A5、A6、A7、A8、A9 | covered | 采用收进抽屉；`AdminTable` 没有按宽度隐藏列的能力，靠列宽规划满足 1280（D4） |
| S4：prd.md R2 第 3 条 | complete | 时间改用 `useAdminFormat`，替换 `formatDate` 的 `toLocaleString()` | nexus-admin-ai-services「服务渠道文案与格式」 | A13 | covered | 当前有效 |
| S5：prd.md R2 第 4 条 | complete | 删除 `useProviderRegistryAdmin.ts:98-104` 的 watch，由布局负责；同步 `useProviderRegistryAdmin.test.ts:169-170` | nexus-admin-ai-services「服务渠道外壳」 | A14 | covered | 当前有效 |
| S6：prd.md R2 第 5 条 | complete | 按 spec `nexus-provider-scene-routing.md:105` 在真实浏览器验证适配器选择器、能力目录、绑定模型选择器与降级原因 | nexus-admin-ai-services「场景路由浏览器验证」 | A15 | covered | 当前有效 |
| S7：prd.md R4（服务渠道部分） | complete | `provider-registry-admin.test.ts` 的样式类断言（`:269-320,390-444`）与 `docs-page-performance.test.ts:263-265` 的包装断言改为行为 / 结构契约，说明原断言守的是什么 | 验证预期 | A16 | covered | 两个 intelligence 面板的部分已由 5a 完成 |
| S8：prd.md Acceptance 第 1 条 | complete | 逐条满足父任务 design §4；ego 截图与基线对照（双重标题、限宽、横向溢出、英文日期消失） | 验证预期 | A16 | covered | 截图存本机长期目录，不写交接副本 |
| S9：prd.md Acceptance 第 2 条 | complete | 服务渠道四个 tab 可深链；spec `:105` 四项在浏览器中逐项验证并截图 | nexus-admin-ai-services「服务渠道外壳」「场景路由浏览器验证」 | A2、A15 | covered | 当前有效 |
| S10：prd.md Acceptance 第 3 条 | complete | 全量 vitest、typecheck、改动文件 eslint、`git diff --check` | 验证预期 | A16 | covered | 当前有效 |
| S11：prd.md Out of Scope 第 2 条 | complete | Provider Registry 的业务逻辑与接口不变 | 非目标 | — | superseded | 被 S52（老板 2026-10-04 Q3）部分替代：用量与健康两个列表接口新增筛选参数；其余业务逻辑与接口仍不变 |
| S12：research §1 R2、R4 行 | complete | 行号复核：面板 2207 行、组合式函数 1186 行；`:506`；四个 `TxTabItem`；另有 `min-w-[760px]` 与三个抽屉内表格的最小宽度；页面标题已等于侧栏文案；R4 只有 `:316`、`:318-320` 是纯样式字面 | nexus-admin-ai-services「服务渠道外壳」「服务渠道列表」 | A1、A5 | covered | 事实依据；2026-10-03 复核，stage `97441357f` 上这些文件自调研以来未改动 |
| S13：research §3.1 外壳 | complete | ClientOnly 跳动占位、独立的刷新行、全局错误横幅、五张统计卡及其口径、组合式函数位于面板内 | nexus-admin-ai-services「服务渠道外壳」「服务渠道加载与失败」 | A1、A3、A4 | covered | 统计卡口径按 S50（Q1） |
| S14：research §3.2 标签页与加载 | complete | `activeTab` 不在 URL；一次 `fetchRegistry` 加载全部数据，只有一个 loading 和 error；用量与健康接口支持分页和筛选，但 UI 只读 25 条并在客户端过滤；变更后的刷新规则 | nexus-admin-ai-services「服务渠道加载与失败」「用量账本与健康检查」 | A2、A4、A8、A9 | covered | 按决定 3 改为服务端分页 |
| S15：research §3.3 五张表 | complete | 各表列与宽度；`trace`、`fallbackTrail` 等字段已取到但没有展示；`adapter.reason` 等字段没有展示；主次列划分建议 | nexus-admin-ai-services「服务渠道列表」「服务渠道详情」 | A5、A6、A7、A8、A9 | covered | 能力索引维持现有字段，不加抽屉（非目标） |
| S16：research §3.3 行点击注意事项 | complete | `TxDataTable` 行内任何点击都会触发 `rowClick`，开关和按钮需要阻止冒泡 | nexus-admin-ai-services「服务渠道详情」 | A6 | covered | 当前有效 |
| S17：research §3.4 抽屉、对话框与确认 | complete | 三种服务渠道抽屉、三种场景抽屉、检查抽屉、删除确认、行内状态控件；保存时删除能力 / 绑定、「执行」、状态切换都没有确认；删除确认没有加载锁 | nexus-admin-ai-services「服务渠道确认」「服务渠道抽屉表单」 | A10、A11 | covered | 「检查」按 S53（Q4）不确认；配额保存后本地列表被替换的问题列为非目标 |
| S18：research §3.4 标签关联 | complete | 67 个 `<label>` 都没有关联控件；工具栏、筛选块、绑定行、表格内编辑器没有标签 | nexus-admin-ai-services「服务渠道抽屉表单」「服务渠道列表」 | A5、A11 | covered | 筛选块改为 `AdminFilterField`；块级字段改为 `AdminFormField`；逐行编辑器用 `aria-label`（D5） |
| S19：research §3.5 面板内标题 | complete | 四个 h2 与说明、能力索引 h3；抽屉内的 h3 与说明 | nexus-admin-ai-services「服务渠道外壳」 | A1 | covered | 面板级标题删除；抽屉内分组标题保留 |
| S20：research §3.6 格式化与写死英文 | complete | `formatDate`；统计、筛选计数、延迟（无数据时显示 `-ms`）、配额、数量的数字；`${n} failed`；客户端校验与 `JSON.parse` 的英文；`values.ready` 缺失；`statusTone` 没有 `ready` | nexus-admin-ai-services「服务渠道文案与格式」 | A12、A13 | covered | 当前有效 |
| S21：research §3.7 管理员 watch | complete | `:93` 的 `useAuthUser`、`:98` 的 `useAccountRole`、`:100-104` 的 watch；面板提示 `:514` 只在非管理员时出现；布局闸门已有测试 | nexus-admin-ai-services「服务渠道外壳」 | A14 | covered | 当前有效 |
| S22：research §3.8 抽屉请求代次 | complete | 保存完成后会关掉当时打开的任意抽屉；拉取模型的结果写进调用时捕获的面板；运行结果按场景保存 | nexus-admin-ai-services「服务渠道抽屉表单」 | A11 | covered | 保存只关闭发起保存的抽屉；运行结果按场景保存，维持现状 |
| S23：research §5 spec `:105` 四项 | complete | 适配器选项等于服务端目录；能力目录完整；绑定模型选项等于所选服务渠道的模型列表；缺少能力的场景显示降级与缺失原因；`invalidBindings` 没有展示；「降级」一词有歧义 | nexus-admin-ai-services「场景路由浏览器验证」「服务渠道文案与格式」 | A7、A12、A15 | covered | 用词按决定 4 与 S51（Q2）处理 |
| S24：research §6 服务渠道相关测试 | complete | 六组测试分别守护的行为、替代写法；`useProviderRegistryAdmin.test.ts:162-172` 删除；`:253-282` 会随错误处理变化 | 验证预期 | A16 | covered | 当前有效 |
| S25：research §6 构建检查 | complete | `check-worker-bundle.mjs:285-311` 按组件 chunk 名守住 docs 等页面不链接 ProviderRegistry 的 CSS | 约束与不变量 | A16 | covered | 拆分组件时保持组件 chunk 名可被该检查识别 |
| S26：research §6 过期路由 | complete | `check-worker-bundle.mjs:96` 列着已不存在的 `/dashboard/admin/provider-registry` | — | — | non-goal | 只报告，不在本 change 修改 |
| S27：research §7「直接可用」 | complete | `AdminPageShell` + `#nav`；`useAdminQueryState`；`AdminStatGrid`；`AdminSection`；`AdminConfirmDialog`；`AdminFormField`；`useAdminFormat`；`resolveAdminErrorMessage` | 约束与不变量 | A1–A13 | covered | 当前有效 |
| S28：research §7 缺口 1、2、10、11 | complete | 非表格区块没有错误 / 重试 / 空态；没有单请求组合式函数；组合式函数位于面板内 | nexus-admin-ai-services「服务渠道加载与失败」 | A4 | covered | 由 5a 的 `useAdminResource` 补上；组合式函数提到页面层级 |
| S29：research §7 缺口 3、4 | complete | `AdminTable` 只适合服务端分页；空态只能设置标题 | nexus-admin-ai-services「服务渠道列表」 | A5、A7 | covered | 客户端列表用 #3 合入的 `createClientListFetcher`；正向提示改为「筛选后为空」的标题 |
| S30：research §7 缺口 5、6 | complete | 没有按宽度隐藏列；可点行会吞掉控件的点击 | nexus-admin-ai-services「服务渠道列表」「服务渠道详情」 | A5、A6 | covered | 靠列宽规划解决（D4）；控件阻止冒泡 |
| S31：research §7 缺口 7 | complete | `resolveAdminErrorMessage` 不读 `error.message`，客户端校验错误会丢失 | nexus-admin-ai-services「服务渠道文案与格式」 | A11、A12 | covered | 校验错误改为本地化文案，传输层错误走 `resolveAdminErrorMessage`（D6） |
| S32：research §7 缺口 8、9 | complete | `AdminFormField` 不适合表格内编辑器；同一路由多个列表需要 `queryKeyPrefix` | nexus-admin-ai-services「服务渠道抽屉表单」「服务渠道列表」 | A5、A8、A9、A11 | covered | `queryKeyPrefix` 已随 #2042 合入 |
| S33：research §8 注意事项 | complete | 宽度是估算，没有在浏览器里实测；`nowrap` 与 `line-clamp-2` 叠加的效果没有实测 | 验证预期 | A5、A16 | covered | 在浏览器里实测 1280 |
| S34：research Open question 3 | complete | 五张统计卡留在分区条上方，还是放进各自标签页 | nexus-admin-ai-services「服务渠道外壳」 | A3 | covered | 默认项：留在分区条上方（D1） |
| S35：research Open question 4 | complete | 行点击打开只读详情还是编辑抽屉；哪些操作留在行内 | nexus-admin-ai-services「服务渠道详情」 | A6、A7 | covered | 老板决定 1 |
| S36：research Open question 5 | complete | 哪些操作需要 `AdminConfirmDialog` | nexus-admin-ai-services「服务渠道确认」 | A10 | covered | 老板决定 2 与 S53（Q4） |
| S37：research Open question 6 | complete | 筛选是否进 URL；用量与健康是否改服务端分页 | nexus-admin-ai-services「服务渠道列表」「用量账本与健康检查」 | A5、A8、A9 | covered | 老板决定 3 与 S52（Q3）；其余列表按父任务 §4 第 4 条进 URL |
| S38：research Open question 7 | complete | 缺失能力的原因是否要在表格里可见；是否展示 `invalidBindings` | nexus-admin-ai-services「服务渠道列表」「服务渠道详情」 | A7 | covered | 默认项：表格保留「缺失 N 项」，完整列表和 `invalidBindings` 放进详情（D2） |
| S39：research Open question 8 | complete | 「降级原因」指缺少能力，还是回退链路的原因 | nexus-admin-ai-services「服务渠道文案与格式」 | A12 | covered | 老板决定 4 与 S51（Q2） |
| S40：父任务 design §2.2 | complete | 组合件职责、`#nav`、`useAdminQueryState`、`queryKeyPrefix`、`AdminFormField`、`AdminConfirmDialog`、`useAdminFormat`、`resolveAdminErrorMessage`；页面显式 import | 约束与不变量 | A1–A13 | covered | 当前有效 |
| S41：父任务 design §4 第 1–11 条 | complete | 迁移完成标准：标题等于侧栏；不自带闸门；骨架、刷新保留、可重试且不含 API 路径；列表、URL 与分页；只用 `useAdminFormat`，1280 不折行；全部走 `t()`；破坏性操作确认；详情用 `TxDrawer` + `TxDescriptions`；只用 `--tx-*`；测试测行为；ego 截图 | nexus-admin-ai-services 各节 | A1–A16 | covered | 当前有效 |
| S42：组合件 design §8 | complete | 冻结的 API 与已登记扩展（`queryKeyPrefix`、`tableDate`、`AdminFormField`、5a 的 `useAdminResource`）；扩展必须先登记再实现 | 约束与不变量 | A16 | covered | 本 change 的扩展按 S55 登记（D14） |
| S43：老板 2026-10-03 决定 1 | complete | 服务渠道和能力路由表格点行打开只读详情抽屉（`TxDescriptions`）；检查、编辑、配额、删除保留为行内按钮 | nexus-admin-ai-services「服务渠道详情」 | A6、A7 | covered | 用量和健康两张表按父任务 §4 第 5 条同样把次要信息放进只读抽屉 |
| S44：老板 2026-10-03 决定 2 | complete | 停用渠道 / 场景要确认，启用也要确认；「执行」真实调用上游要确认；保存时会删除能力或绑定要确认；删除改用统一确认框 | nexus-admin-ai-services「服务渠道确认」 | A10 | covered | 当前有效 |
| S45：老板 2026-10-03 决定 3 | complete | 用量账本与健康检查改为服务端分页，筛选进 URL（`queryKeyPrefix`） | nexus-admin-ai-services「用量账本与健康检查」 | A8、A9 | covered | 筛选项按 S52（Q3）；统计卡口径按 S50（Q1） |
| S46：老板 2026-10-03 决定 4 | complete | 中文 fallback 改叫「回退」，「降级」只用于能力缺失 | nexus-admin-ai-services「服务渠道文案与格式」 | A12 | covered | 服务渠道与健康状态的 degraded 按 S51（Q2）叫「受限」 |
| S47：请求默认项（服务渠道部分） | complete | 五张统计卡留在标签条上方；路由表格保留「缺失 N 项」，完整列表与 `invalidBindings` 进详情 | nexus-admin-ai-services「服务渠道外壳」「服务渠道列表」「服务渠道详情」 | A3、A7 | covered | 默认项，老板未推翻（D1、D2） |
| S48：请求中的工作方式 | complete | 独立 worktree 基于 stage；PR 合进 stage；ego 验收 1280 / 1920 × 亮 / 暗 × 中 / 英；本机时区 America/Los_Angeles | 验证预期 | A16 | covered | 当前有效 |
| S49：5a brief S6、S10、S12、S21、S27、S30 | complete | 5a 交给 5b 的服务渠道条目：R2、R4 服务渠道部分、Acceptance 第 2 条、research §7 中只属于服务渠道的缺口、Open questions 3–8、老板四项决定 | 同 S2–S47 | 同 S2–S47 | covered | 由 S2–S47 逐条承接 |
| S50：老板 2026-10-04 Q1 | complete | 「用量」卡显示用量账本总条数；「健康」卡显示未通过的检查总数（受限 + 异常）；都取接口返回的 `total` | nexus-admin-ai-services「服务渠道外壳」 | A3 | covered | 当前有效（D8） |
| S51：老板 2026-10-04 Q2 | complete | 服务渠道状态和健康状态的 degraded 中文叫「受限」，英文仍为 Degraded | nexus-admin-ai-services「服务渠道文案与格式」 | A12 | covered | 当前有效（D9） |
| S52：老板 2026-10-04 Q3 | complete | 保留「需关注」「估算」筛选：用量接口新增 `attention`、`estimated` 参数，健康接口的 `status` 支持多个状态 | nexus-provider-registry-observability 全文；nexus-admin-ai-services「用量账本与健康检查」 | A8、A9、A18 | covered | 部分替代 S11（D10） |
| S53：老板 2026-10-04 Q4 | complete | 「检查」不确认，按钮提示说明会调用上游；检查抽屉的流程不变 | nexus-admin-ai-services「服务渠道确认」 | A10 | covered | 当前有效（D11） |
| S54：5a 发布的 `nexus-admin-ai-services` 规格 | complete | AI 概览与 AI 调用审计的全部需求与场景 | nexus-admin-ai-services 原有各节 | A17 | covered | 原文保留，只把规格开头的覆盖范围改为包含服务渠道 |
| S55：老板 2026-10-04 批准组合件扩展 | complete | `AdminStatGrid` 画出 `meta` 说明行；`TxSelect` 内部 combobox 的命名指令 `v-admin-control-id` / `v-admin-control-label` 及其纯函数 | nexus-admin-kit 全文 | A3、A11 | covered | 当前有效（D14）；多选下拉的限制写进规格 |

# 非目标

- 除用量与健康两个列表接口新增的筛选参数外，Provider Registry 的业务逻辑和服务端接口不变。
- 运行抽屉的输出仍以 JSON 块展示（trace、输出、选择、回退链路），不改成结构化视图。
- 能力索引维持现有字段，不新增详情抽屉。
- 以下问题只报告，不在本 change 修改：
  - 配额抽屉保存后，本地配额列表会被替换成刚保存的那一条（research §3.4）；
  - `check-worker-bundle.mjs:96` 的过期路由。
- AI 概览与 AI 调用审计的行为不改（5a 已完成），手动 IP 封禁属于风控子任务 #11。
- 除 D14 登记的两项外，不扩展后台组合件 API；冻结的交接副本（`docs/engineering/workflow/handoffs/`）不修改。

# 验收示例

- A1：中文进入服务渠道页，页面标题为「服务渠道」，与侧栏一致。正文不再出现以下二级标题和说明：「已注册服务渠道」「能力路由」「用量账本」「健康检查」「服务渠道能力索引」。面板不再限宽：1920 宽时内容随外壳铺开。
- A2：标签页可以深链：
  - 分区条位于标题下方；
  - 点「能力路由」后，URL 变为 `?tab=routes`；
  - 直接打开 `?tab=usage` 显示用量页；
  - `?tab=` 取不认识的值时回到服务渠道页；
  - 切换标签页保留其他 query。
- A3：五张统计卡在每个标签页都显示在分区条上方，数字带千分位：
  - 服务渠道卡显示总数，说明为已启用数；
  - 能力卡与场景卡显示数量；
  - 用量卡等于用量标签页筛选为「全部」时的「共 N 条」；
  - 健康卡等于健康标签页筛选为「需关注」时的「共 N 条」。
- A4：加载、刷新、失败可以区分：
  - 首屏显示骨架；
  - 点「刷新」时已有内容保留；
  - 注册表加载失败时，显示本地化失败文案和「重试」，不含 `/api/`，此时用量和健康标签页仍能各自加载；
  - 用量或健康加载失败只影响对应列表，并可单独重试。
- A5：服务渠道列表：
  - 1280px 视口下没有横向滚动，单元格不折行；
  - 搜索和状态筛选（全部 / 需关注 / 健康 / 受限 / 异常 / 未知）在输入停止约 300ms 后生效，回到第 1 页，并写进 URL（`pv_` 前缀）；
  - 每页条数可选 20 / 50 / 100；
  - 「筛选后为空」显示对应标题和「清空筛选」，与「还没有服务渠道」不同。
- A6：服务渠道详情：
  - 点一行或在行上按 Enter，打开只读抽屉，列出 ID、厂商、适配器、端点、地域、认证类型、归属、完整能力列表、最近健康、最近用量、配额摘要和更新时间；
  - 点行内的开关、检查、编辑、配额、删除时，不打开详情抽屉。
- A7：能力路由：
  - 列表在 1280px 下不溢出；
  - 缺少能力的场景显示「降级」徽标和「缺失 N 项」；
  - 详情抽屉列出完整缺失能力和无效绑定，原因为本地化文案（服务渠道不存在 / 能力缺失 / 适配器缺失 / 模型无效）；
  - 能力索引在同一标签页用 `cap_` 前缀分页，与路由列表互不影响。
- A8：用量账本：
  - 翻页和改每页条数时，`page` / `limit` 作为请求参数发给接口；
  - 「共 N 条」等于接口返回的 `total`；
  - 状态（全部 / 需关注 / 已完成 / 失败 / 计划 / 估算）、模式、服务渠道、场景四个筛选，按对应关系发送 `attention` / `estimated` / `status` / `mode` / `providerId` / `sceneId`；
  - 筛选写进 URL（`u_` 前缀），带参数打开链接时恢复；
  - 详情抽屉列出运行、计量、错误、trace、回退链路与选中的服务渠道。
- A9：健康检查：
  - 服务端分页，URL 使用 `h_` 前缀；
  - 状态筛选为「需关注」时，请求参数为 `status=degraded,unhealthy`；
  - 详情抽屉列出端点和完整原因。
- A10：确认：
  - 以下操作都先弹 `AdminConfirmDialog`：服务渠道状态开关的两个方向、场景启用与停用、运行抽屉的「执行」、会删除能力或绑定的保存（列出将删除的项）、删除服务渠道和场景；
  - 取消后状态不变，也不发请求；
  - 确认后，按钮在提交中处于锁定状态；
  - 「试运行」和检查抽屉里的「检查」不弹确认，「检查」按钮的提示说明会向上游发一次探测请求。
- A11：抽屉表单：
  - 所有块级字段都有可见标签，并通过 `for` 关联控件；
  - 保存失败时抽屉保持打开，并显示本地化错误；
  - 保存服务渠道 A 时打开服务渠道 B 的编辑抽屉，A 的保存完成后不会关掉 B 的抽屉。
- A12：文案：
  - 中英两份 route chunk 同步；
  - 「降级」只出现在场景缺少能力的场合；
  - 回退开关与回退链路显示「回退」；
  - 服务渠道与健康状态的 degraded 显示「受限」；
  - 客户端校验错误是本地化文案；
  - 不再出现 `3 failed`、`ready` 这类写死的英文。
- A13：格式：
  - 表格里的时间为 `YYYY-MM-DD HH:mm`，悬停显示完整本地化时间；
  - 延迟形如「1,850 ms」，没有数据时显示「—」；
  - 数量、配额、计数都带千分位。
- A14：组合式函数不再自带管理员 `watch`，也不再调用 `useAuthUser()`。非管理员由后台布局拦截，页面不对非管理员发请求。
- A15：spec `nexus-provider-scene-routing.md:105` 的四项在真实浏览器中逐项验证并截图：
  - 适配器选择器的选项等于接口返回的适配器目录；
  - 能力选择器列出完整的内置能力目录；
  - 绑定行的模型选择器，除「使用默认模型」外，选项等于所选服务渠道的模型列表；
  - 缺少能力的场景显示「降级」与缺失原因。
- A16：门禁与验证：
  - 钉住旧结构的测试已改为测行为；
  - `apps/nexus` 全量 vitest、Nexus typecheck、改动文件的包内 ESLint、`git diff --check` 都通过；
  - i18n 守卫扫描新文件并通过；
  - 页面在真实浏览器（ego）中按 1280 / 1920 × 亮 / 暗 × 中 / 英各验一遍并截图，与基线对照，以下问题都已消失：双重标题、限宽、横向溢出、英文日期。
- A17：5a 发布的 AI 概览与 AI 调用审计行为保持不变。`nexus-admin-ai-services` 原有的各场景仍然成立，相关测试继续通过。
- A18：接口：
  - 用量接口带 `attention=true` 时，只返回失败、计划或估算的记录；
  - 带 `estimated=true` 时，只返回估算记录；
  - 健康接口带 `status=degraded,unhealthy` 时，返回这两种状态的检查；
  - 两个接口的 `total` 都等于筛选后的条数；
  - 新参数取非法值（如 `attention=maybe`、`status=degraded,bogus`）时返回 400；
  - 不带新参数的请求，结果与改动前一致。

# 约束与不变量

- 只用后台组合件的冻结 API 与已登记扩展：`queryKeyPrefix`、`tableDate`、`AdminFormField`、`useAdminResource`、`createClientListFetcher`，以及本 change 经老板批准登记的两项（D14，规格 `nexus-admin-kit`）。除此之外不新增或修改组合件 API。页面显式 import 组件与组合式函数。
- 服务端改动只限于用量与健康两个列表接口的筛选参数，其他接口与业务逻辑不变。
- 只用 `--tx-*` token 着色，亮 / 暗主题都没有写死的色值；不加 `max-w-*`，不用 `:deep()` 覆写 TuffEx 内部。
- 所有可见文案走 `t()`，中英 route chunk 同步，不出现 `isZh ?` 三元。
- 传输层错误经 `resolveAdminErrorMessage`，不显示 ofetch 原文。
- 重面板仍以异步 chunk 加载，`check-worker-bundle.mjs` 对 docs / store / landing 等页面的 ProviderRegistry CSS 检查继续有效。
- 不修改冻结的交接副本；截图按协作偏好存本机 `~/Workspace/docs/engineering/reports/nexus-admin-provider-registry/`。

# 决策

- D1（默认项，老板未推翻）：五张统计卡留在分区条上方，每个标签页都显示。
- D2（默认项）：能力路由表格保留「缺失 N 项」，完整缺失列表与 `invalidBindings` 放进详情抽屉。
- D3（Agent 判断，按拆分规则）：5b 不拆成多个子任务。拆分规则要求「反复修改同一核心区域」时不拆，5b 的改动集中在同一个 2207 行的面板和同一个组合式函数。
- D4（Agent 实现选择，按 PRD R2）：PRD 把健康列为次要列。服务渠道表只保留健康状态徽标，延迟与说明进详情抽屉。`AdminTable` 不能按宽度隐藏列，所以靠列宽规划满足 1280。
- D5（Agent 实现选择）：筛选块从按钮式 chips 改为 `AdminFilterBar` 里带标签的下拉；场景启用 / 停用从两个文字按钮改为启用开关，和服务渠道表一致。
- D6（Agent 实现选择）：客户端校验错误改为带 i18n 键的本地化文案；传输层错误一律走 `resolveAdminErrorMessage`。
- D7（老板 2026-10-03 决定 1–4）：内容见来源覆盖 S43–S46。
- D8（老板 2026-10-04 Q1）：「用量」卡显示用量账本总条数，「健康」卡显示未通过的检查总数（受限 + 异常），都取接口返回的 `total`。
- D9（老板 2026-10-04 Q2）：服务渠道状态与健康状态的 degraded 中文叫「受限」，英文保持 Degraded。
- D10（老板 2026-10-04 Q3）：保留「需关注」「估算」。用量接口新增 `attention`、`estimated`，健康接口的 `status` 支持多个状态。这部分替代了 PRD 的「接口不变」。
- D11（老板 2026-10-04 Q4）：「检查」不弹确认，按钮提示说明会向上游发一次探测请求。检查仍是「行内图标打开检查抽屉、在抽屉里选能力再检查」的现有流程。
- D12（Agent 实现选择）：服务渠道页的行为补进 5a 发布的 `nexus-admin-ai-services` 规格，兑现该规格「服务渠道由后续 change 补入」的说明。两个列表接口的查询契约另立 `nexus-provider-registry-observability` 规格。
- D13（Agent 实现选择，同时满足 R2 与 D1）：统计卡与分区条都放进 `AdminPageShell` 的 `#nav`，统计卡在上。R2 要求分区条放 `#nav`，D1 要求统计卡在分区条上方；`#nav` 位于正文之前，只有这样两条都成立。页面自上而下仍是「标题 → 统计卡 → 分区条 → 标签页内容」，与现在的顺序一致。
- D14（老板 2026-10-04 批准，登记为规格 `nexus-admin-kit`）：组合件扩展两项。
  - `AdminStatGrid` 画出 `meta` 说明行。`TxStatCard` 的默认变体会把 `meta` 丢掉，A3 要求的「已启用数」原本显示不出来。同一排其他卡留出等高空行，骨架同步。
  - 指令 `v-admin-control-id`、`v-admin-control-label` 与纯函数 `identifyAdminControl`、`nameAdminControl`。`TxSelect` 把 `id`、`aria-label` 留在根 `div` 上：下拉字段无法按 A11 用 `for` 关联标签，行内下拉也没有可读的名字。
  - 其他页面不传 `meta`、不用这两个指令，输出不变。
- D15（Agent 实现选择）：`TxDrawer` 在 `document` 上监听 Tab 与 Esc，`TxModal` 在自己的遮罩上处理后不阻止冒泡。面板在 `<body>` 上拦下确认框已处理的这两个键，不改 TuffEx。判断依据是 `TxModal` 遮罩的 `.tx-modal__overlay` 类名；TuffEx 改类名时这里要跟着改。

# 验证预期

- 门禁在 `apps/nexus` 下按 CI 同款命令运行：
  - `./node_modules/.bin/vitest run`；
  - `PATH="$PWD/node_modules/.bin:$PATH" node build/check-typecheck-plugin-resolution.mjs`；
  - 包内 ESLint：只检查改动文件，不整文件 `--fix`；
  - `git diff --check`，同时检查未跟踪文件的行尾空白。
- 提交前预演 pre-commit：用 `eslint --fix-dry-run` 确认 0 修复、0 警告。
- 接口的新筛选用真实 SQLite 测 store 行为（`test/helpers/d1-sqlite.ts`），并加负控：去掉条件时测试应当失败。
- ego 验收：
  - 在 worktree 的 dev server 上做，用本地 D1 快照数据，会话为本地测试管理员账号；
  - 本机时区为 America/Los_Angeles；
  - 交互用真实鼠标和键盘；
  - 首屏骨架用挂起请求的方式实拍。
- 截图与测量数据存本机 `~/Workspace/docs/engineering/reports/nexus-admin-provider-registry/`，不进仓库。PR 正文写明存放位置和关键测量数据。
