# 目标

把「设置 › 智能」下的三处页面按 CoreApp 自己的洞察页 shell 重做，并补齐它们背后的数据能力：

- **审计页**：从 7 张折叠卡竖排的长页，重做成与「语音输入」同一套洞察页。页面本身回答「AI 用了多少、花在哪、哪里出错、离上限还有多远」，调用记录与设置收进抽屉。数据侧要做到：
  - 统计覆盖全部调用方，按本地自然日计；
  - 用量可按渠道、模型、能力、调用方拆解；
  - 调用记录可筛选、分页，并能全量导出；
  - 可设本机全局上限；
  - 接入 models.dev 作为定价与模型元数据来源。
- **记忆**：原挂在审计页里的「记忆复核」拆成「智能」下的独立子页。
- **技能与 MCP**：两页按老板给的参考（Skills 管理 / MCP 服务器管理）重新设计成同一套「本机 AI 资源」清单页：
  - 顶部统计本机各代理的数量，可以搜索；
  - 全宽清单逐行标出资源属于哪些代理（只读），以及它在 Tuff 中是否启用；
  - 详情与编辑放在右侧抽屉；
  - MCP 做到每个服务器单独启用。

版式用我们自己的 shell（共享洞察组件 + TuffEx），不照搬参考图。

# 范围

完整行为以三份目标 Spec 为准：

- `specs/intelligence-usage-audit/spec.md`：用量账本、定价、全局上限、审计页、共享洞察组件；
- `specs/intelligence-memory/spec.md`：记忆子页；
- `specs/local-ai-resources/spec.md`：技能页与 MCP 页。

下面只列范围要点。

## 用量账本与读接口（主进程）

- 计数与审计开关解耦：计数始终进行，「启用审计」只决定是否保存逐条明细。新装默认开启审计，已有设置不变。
- 新增全局计数桶：汇总全部调用方（含没有 caller 的调用），按主进程本地时区的自然日、自然月切分。`agent.run`、`workflow.execute` 的外层行不计入，避免重复。逐调用方的既有 UTC 桶不变。
- 升级后首次启动，用保留期内的明细一次性回填全局桶。回填幂等，中途失败不留半套数据。
- 写入端修正：
  - 审计行的渠道统一记实际选中的渠道配置 id；
  - 内置调用补稳定的 `core.*` 调用方。
- 新增 host-only 接口：用量洞察、调用记录查询、全局上限读写。总量与上限读数包含尚未落库的增量。

## models.dev 定价

- 主进程后台拉取 `https://models.dev/api.json`：带 ETag 条件请求，精简后缓存，24 小时内最多刷新一次。失败保留旧缓存，任何时候都不阻塞启动与调用。
- 按「渠道 → 服务商 → 模型」解析定价，模型行带单价、上下文长度、输出上限。替换旧的 `MODEL_COSTS` 与默认价。
- 本地模型、Nexus 积分、未找到定价三类按 0 计费，并在凡展示估算费用处列出受影响的模型。

## 全局上限

- 本机保存（不随同步）。维度为每日 / 每月 × 请求数 / Token / 估算费用，可任意组合。
- 执行对象是所有 AI 调用（含后台）：到顶即拒绝，返回新错误码 `USAGE_LIMIT_REACHED`。
- 各界面入口显示「已达到你设置的上限」并给打开审计页的入口。宿主渲染层要能拿到规范化的错误码。
- 后台功能遇到上限时暂停，写明原因，不进入重试循环。用量到 80% 时页面先提醒。

## 审计洞察页与共享组件

- 洞察页 shell 抽成 CoreApp 共享组件，语音页一起切换，外观与行为不变。
- 审计页结构：
  - 标题行；
  - 范围切换（今天 / 近 7 天 / 近 30 天）；
  - 主指标为 Token，辅助指标为请求、成功率、平均延迟、估算费用；
  - 本地日趋势；
  - 四维去向；
  - 限额卡。
- 调用记录、设置、上限编辑都在抽屉里。
- 加载、审计未开启、空区间、读取失败四种状态各有呈现。
- 旧组件删除，中英文案同步。

## 记忆子页

- 新增侧栏子页「记忆」（主从布局），排在 MCP 之后。功能：搜索、筛选、分页、详情、新建、编辑、替换、启停、删除确认。
- 新建记忆默认范围为全局；不会被注入的范围标「暂不生效」。

## 技能页与 MCP 页

- 两页共用：
  - 统一版式：标题行、代理统计条、搜索、全宽清单、详情抽屉；
  - 只显示本机检测到、且至少有一项资源的代理；
  - 加载骨架、扫描失败、空态。
- 技能页：
  - 「通用技能」按真实文件合并成一行；
  - 「内置技能」的配置改为抽屉内草稿，保存后写入，关闭前确认；
  - 「能力」改称「技能 / Skills」；
  - 「添加目录」从智能页搬到技能页。
- MCP 页：
  - 同一服务器按名称加传输身份合并成一行；
  - 每个服务器单独启用：开启未接入的服务器只接入这一台，含敏感值的先确认；
  - 抽屉展示来源、命令、掩码后的环境变量，可单独探测；手动添加的服务器可编辑、删除；
  - 「本机 MCP 服务 · 让其他 AI 调用 Tuff」卡片留在清单下方，只换皮。

## 来源覆盖

需求来源是老板 2026-10-03 已确认的两份规划。原件只读，保存在：

- `docs/engineering/workflow/handoffs/10-03-intelligence-audit-rebuild/`（父任务 PRD 与设计，含 6 个子任务目录）；
- 仓库外草稿 `~/Workspace/Projects/talex-touch.drafts/skills-mcp-redesign/brief.md`。

覆盖边界是两份规划全文。下表按需求组对应。

| 来源条目 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| 父 PRD Decisions D1–D13 | complete | 老板的 13 条决定 | 本 brief「决定」 | A1–A23 | covered | 逐条转入 |
| 父 PRD R-A1–R-A10 用量账本 | complete | 计数常开、全局本地桶、回填、渠道归属、`core.*` 调用方、默认开审计、读接口、新鲜度、插件不可读 | intelligence-usage-audit「用量账本」「读接口与权限」 | A1–A8 | covered | 当前有效需求 |
| 父 PRD R-B1–R-B5 定价 | complete | 目录拉取缓存、解析、费用、模型元数据、0 定价提示 | intelligence-usage-audit「定价目录」 | A9、A16 | covered | 当前有效需求 |
| 父 PRD R-C1–R-C6 全局上限 | complete | 存储、维度、执行、报错与界面入口、后台降级、80% 提醒 | intelligence-usage-audit「全局上限」 | A10–A13、A14 | covered | R-C4 的「打开审计」入口与宿主错误码可见性原验收未单列，并入 A12 |
| 父 PRD R-D1–R-D10 审计页 | complete | 骨架、指标、趋势、去向、限额、记录抽屉、设置抽屉、状态、清理、文案 | intelligence-usage-audit「审计洞察页」 | A14–A17 | covered | 当前有效需求 |
| 父 PRD R-E1–R-E3 共享组件 | complete | 抽组件、语音页切换不变、审计页复用 | intelligence-usage-audit「共享洞察组件」 | A18 | covered | 当前有效需求 |
| 父 PRD R-F1–R-F7 记忆子页 | complete | 路由导航、主从、默认全局与不生效标记、删除确认与替换、去掉空字段、测试迁移、文案 | intelligence-memory 全文 | A19、A20 | covered | 当前有效需求 |
| 父 PRD R-G1–R-G3 契约与文档 | complete | spec 同步、敏感数据清单、新错误码契约 | intelligence-usage-audit「隐私与契约」 | A12、A21 | covered | spec 已从 `.trellis/spec/` 迁到 `docs/engineering/specs/` |
| 父 PRD AC-22 全局门禁 | complete | 类型检查、lint 不新增错误、vitest、`git diff --check` | — | A22 | covered | `pnpm` 脚本会触发重装与 tuffex 重建，改为直接调用 tsc / vue-tsc |
| 父 PRD AC-23 协调 | complete | 侧栏顺序与共享文件不互相覆盖 | intelligence-memory「路由与导航」 | A23 | covered | 兄弟 Trellis 任务已冻结，改写为最终顺序与共享文件搬运约束 |
| 父 PRD Out of Scope | complete | 只报告的旁路问题 | — | — | non-goal | 见「非目标」 |
| Skills/MCP brief Outcome、Scope（两页共用） | complete | 版式、代理列、状态、文案 | local-ai-resources「两页共用」 | A24、A29 | covered | 当前有效需求 |
| Skills/MCP brief Scope（技能页） | complete | 两组清单、按真实文件合并、内置技能抽屉草稿、添加目录、改称技能、智能页移除两组 | local-ai-resources「技能页」 | A24–A26、A31 | covered | 当前有效需求 |
| Skills/MCP brief Scope（MCP 页） | complete | 合并一行、每服务器启停、抽屉、手动项、本机 MCP 服务卡片 | local-ai-resources「MCP 页」 | A27、A28、A32、A33 | covered | 当前有效需求 |
| Skills/MCP brief Constraints | complete | 只读发现不写代理目录、TuffEx 控件、侧栏顺序、冻结交接的安全契约 | 本 brief「约束与不变量」，local-ai-resources「只读边界」 | A30 | covered | 当前有效需求 |
| Skills/MCP brief Non-goals | complete | 管理器功能、路由、pi / omp 发现缺口、CoreBox 直达 | — | — | non-goal | 见「非目标」 |
| Skills/MCP brief Verification expectations | complete | 单测范围、门禁、真机截图 | 本 brief「验证要求」 | A22、A29、A30 | covered | 当前有效需求 |
| 冻结前进度（共享工作区未提交改动） | complete | 已完成与半成品的实现 | — | — | background | 进入 Build 后搬入本 worktree，见「决定」E2 |

# 非目标

- 渠道 `rateLimit` 不生效、闲置的 `cleanupIntelligence` 会清空配额表、`ai-cli-orchestrator` 写死内层 caller、记忆「最近使用 / 使用次数」没有写入点，这些只报告不修。
- 按插件（逐调用方）设上限的界面；给不进审计的调用（连通性测试、实时 ASR、Nexus scene、缓存命中）补审计，页面只在说明里注明。
- models.dev 进模型渠道页；Explain Drawer 的「打开记忆面板」入口与 CoreBox 的「记忆」目的地。
- 不往任何代理目录写入、链接或同步技能和配置，不改写 CLI 自己的配置文件，不替 CLI 切换 provider。参考图里的安装、恢复、导入到代理、同步、检查更新等管理功能都不做。
- 不改技能页、MCP 页的路由 key 与 path；不修 pi / omp 的 MCP 发现缺口；不做 CoreBox 搜索直达这两页。
- 插件 `touch-intelligence` 不加「打开审计」按钮：宿主只放行两个固定跳转，插件只给文案。
- 不修改、推进或归档 `trellis-to-comet-native`，不往迁移 change 里写业务草稿，不碰 `.comet` 运行时、平台 hooks 与治理脚本。
- 本次不提交、合并、推送、创建 PR 或发布；这些在归档时由老板另行授权。

# 验收示例

- A1（原 AC-1）关闭审计时发起一次调用，明细表没有新行，全局桶与按调用方计数都加 1；开启审计时两者都增加，且计数与明细行的整数一致。
- A2（原 AC-2）全局桶按主进程本地时区切日：东八区 07:59 与 08:01（跨 UTC 日界）的两次调用落在同一个本地日，跨本地零点的两次调用落在两个本地日；用固定时间戳加显式时区（Asia/Shanghai 与 America/Los_Angeles）的测试证明。
- A3（原 AC-3）一次含两次内层模型调用的 `agent.run` 只让全局桶的请求数加 2、Token 为内层之和，外层行不重复计入。
- A4（原 AC-4）用含历史明细的临时库首次启动时，回填结果等于按本地日重算的期望；再次启动不重复回填；在回填事务中途注入失败，库里不留回填数据。
- A5（原 AC-5）同一自定义渠道的 chat、embedding、失败三类调用，审计行 `provider` 都记该渠道配置 id；Home 对话、CoreBox 上下文动作、剪贴板 OCR、文件 embedding 的新行 `caller` 是对应的 `core.*` 值。
- A6（原 AC-6）全新 profile 首启后 `enableAudit` 为 true；已有 false 的 profile 升级后仍为 false。
- A7（原 AC-7）本次新增的用量洞察、调用记录、全局上限、MCP 清单与技能清单接口对插件来源返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`，`plugin-facing-events.test.ts` 通过；`queryAuditLogs` 的 `limit` 超过 200 时截断为 200，`total` 与筛选条件一致。
- A8（原 AC-8）一次调用完成后 2 秒内，`getUsageInsights` 返回的今日请求数已包含它，不必等落库。
- A9（原 AC-9）用 models.dev 子集夹具证明：官方 OpenAI 渠道的 `gpt-4o` 按 `openai` 价格计费；base URL 为 `dashscope.aliyuncs.com` 的自定义渠道解析到 `alibaba-cn`；未知网关上的 `claude-sonnet-4-5` 按 `anthropic` 原厂价；Ollama 模型记「本地」、Nexus 记「Nexus 积分」、未收录模型记「未找到定价」，三者费用为 0；离线且无缓存时全部为「未找到定价」且调用不被阻塞；ETag 命中时不重写缓存。
- A10（原 AC-10）设置「每日 3 次请求」后读回一致；传 `null` 清除后读回不限；重启后读回仍一致；该设置不出现在同步载荷里。
- A11（原 AC-11）设「每日 3 次请求」时，任意调用方（含无 caller 的 Home 对话与后台 embedding）的第 4 次调用被拒，缓存命中既不被拒也不计数，跨本地零点后恢复；「每日 Token」与「每日费用」上限各有一条同类测试。
- A12（原 AC-12，按 R-C4 补界面入口）被拒错误的 code 为 `USAGE_LIMIT_REACHED`，reason 含上限项与本地重置时间；`ai-error-recovery` 对它给出本地上限文案而不是 Nexus 积分文案，`QUOTA_EXHAUSTED` 仍给原文案；CoreBox AI 答案、OmniPanel、VoicePanel、Home 听写提示、Home 对话、CoreBox 结果信号六个入口各有测试覆盖；宿主渲染层拿到的是这个错误码而不是「The operation failed. Please retry.」，CoreBox AI 答案、OmniPanel 与 Home 对话显示打开审计页的入口。
- A13（原 AC-13）文件 embedding 在上限触发后停止后续批次、不进入重试循环，文件索引诊断里显示暂停原因。
- A14（原 AC-14）在隔离 dev 实例中用 CDP 截图依次验证审计页：有数据时的指标、趋势、去向四维与限额卡；审计未开启；区间无调用；读取失败；首次加载骨架无版式跳动；记录抽屉的筛选、分页、详情，以及导出的 CSV 内容与筛选一致；设置抽屉的开关生效。
- A15（原 AC-15）趋势图 X 轴是本地日期，没有被逐字拆开的星期标签；零值日没有柱。
- A16（原 AC-16）区间内有 Ollama 模型与一个未收录模型的调用时，估算费用指标、按模型拆解、费用上限设置三处都列出这两个模型及原因。
- A17（原 AC-17）`IntelligenceUsageStats`、`IntelligenceUsageChart`、`IntelligenceAuditLogs`、`IntelligenceAuditOverlay`、`IntelligenceGlobalSettings` 五个旧组件已删除，全仓无引用；审计页不再出现记忆复核；`translation-coverage.test.ts` 通过。
- A18（原 AC-18）`VoiceInsights.test.ts` 全绿；语音页迁移前后的同尺寸截图逐区域对比无差异（数据不同除外）；审计页与语音页的标题行和指标卡用同一组共享组件。
- A19（原 AC-19）侧栏出现「记忆」，进入时高亮，图标不是空框，顺序符合 D5；`categories.smoke.test.ts` 通过；直链 `/setting/intelligence/memory` 与 `/intelligence/memory` 都能打开。
- A20（原 AC-20）新建记忆默认范围为全局；不生效的范围在选择处、列表、详情都有标记；删除要确认，删除后有提示；替换后选中新 id；冲突后重载并保持选中；离开再回来列表会刷新；迁移后的记忆测试全绿。
- A21（原 AC-21）`docs/engineering/specs/` 下相关 spec 与 `docs/engineering/sensitive-data-inventory.json` 已更新，敏感数据清单校验与 `coreapp-ui-contract` 检查都通过。
- A22（原 AC-22）core-app 的 node 与 web 类型检查通过，包内 eslint 不新增错误，涉及的 vitest 全绿，`git diff --check` 干净。
- A23（原 AC-23，按现状改写）侧栏「塔芙智能」组的最终顺序是 智能 / 模型渠道 / 语音输入 / 技能 / MCP / 记忆；本 change 对共享文件只带入本任务自己的改动，不带入、也不覆盖其他会话的改动。
- A24 本机装了 Claude、Codex、Pi 时，技能页统计条只显示这三家，数量与各代理目录里的技能数一致；点「Codex」后清单只剩 Codex 有的技能，再点一次恢复全部。
- A25 同一份技能文件被 Claude、Pi 软链接共享时，清单只有一行，行内 Claude、Pi 图标点亮，存放位置显示它的物理根；同名但不是同一文件的技能分成两行。
- A26 打开「对话」内置技能抽屉、改了模型却不保存就关闭时，先询问保存 / 放弃 / 取消；有未保存改动时「测试」不可用；保存后配置写入，「测试」恢复可用。
- A27 Claude 与 Codex 都配置了 context7（同一命令）时，MCP 清单只有一行，两个图标点亮；只开启 context7 时，同一配置文件里的其他服务器保持未启用；关闭 context7 不影响 pencil。
- A28 含敏感值的服务器开启前要确认；抽屉里环境变量的值显示为掩码；开启失败时显示具体原因（需要确认敏感值、需要重新授权、配置在预览后被改），而不是通用失败文案。
- A29 技能页与 MCP 页在真机上截图：有数据、加载骨架、扫描失败、空态，暗色和亮色各一套；标题行与语音页、审计页一致。
- A30 技能页与 MCP 页的扫描、合并、筛选和启停不向任何代理目录或 CLI 配置文件写入，开关只改变 Tuff 自己的状态；测试用文件树前后快照证明。
- A31 页面文案与侧栏里的「能力」全部改称「技能 / Skills」，和提示词页共用的文案不受影响；智能页不再有「技能」「本地技能目录」两组；技能页的「添加目录」可以管理用户链接的技能目录。
- A32 MCP 页清单下方保留「本机 MCP 服务 · 让其他 AI 调用 Tuff」卡片，功能不变；令牌掩码、读取失败不显示成「未开启」、含敏感值先确认这三条安全行为不变，原有测试迁移后通过。
- A33 手动添加的服务器在清单里占一行，抽屉里可以编辑，也可以确认后删除；任一服务器的抽屉都展示来源代理与配置文件路径、命令与参数、环境变量名，并能只探测这一台服务器。

# 决定

## 老板决定（2026-10-03）

| ID | 决定 |
| --- | --- |
| D1 | 先规划再实现。原为 Trellis 任务，迁移后改由本 Native change 承接。 |
| D2 | 审计功能四层全做：修正统计口径、拆解用量去向、升级调用记录、补上全局限制。 |
| D3 | 审计页版式同「语音输入」：标题行 + 主指标 + 趋势 + 去向；调用记录、设置进抽屉。 |
| D4 | 记忆复核拆成「智能」下的独立子页（主从布局），审计页只留用量与日志。 |
| D5 | 侧栏「塔芙智能」组 = 智能 / 模型渠道 / 语音输入 / 技能 / MCP / 记忆。 |
| D6 | 手动新建记忆默认范围为「全局」。「会话 / 工作区 / 项目」在选择处标「暂不生效」，已有的不生效记忆在列表与详情里同样标出。 |
| D7 | 洞察页骨架抽成 CoreApp 共享组件，审计页与语音页都切过去，语音页回归纳入验收。 |
| D8 | 用量计数与审计开关解耦：计数始终进行，「启用审计」只决定是否保存逐条记录。新装默认开启审计，老用户保留原值，页面在未开启时给一键开启。 |
| D9 | 全局上限计入所有 AI 调用（含后台与本地模型），周期为本地时区自然日 / 自然月。到顶即拒绝，提示「已达到你设置的上限」，与 Nexus 积分文案区分；后台功能暂停并写明原因；任一上限用到 80% 时页面先提醒。 |
| D10 | 写入端一起修：审计行统一记实际选中的渠道配置 id；内置调用补稳定的 `core.*` 调用方；旧行读取时分层映射。 |
| D11 | 主数字用 Token（输入 / 输出）；费用为辅助指标，标「估算」；全局上限可设请求数、Token、估算费用，界面写明是估算。 |
| D12 | models.dev 作为定价与模型元数据的唯一来源，替换 `MODEL_COSTS`；查不到定价按 0 计，不再用默认价编数字；按模型拆解时展示单价、上下文长度、输出上限。模型渠道页暂不接入。 |
| D13 | 定价为 0 的模型要提示用户：凡展示估算费用处，区间内有调用落在「定价为 0 / 本地 / Nexus 积分 / 未找到定价」的模型上，就列出这些模型，并说明其调用未计入费用。 |
| D14 | 技能页、MCP 页都用单列清单加右侧抽屉。 |
| D15 | MCP 每个服务器单独启用。 |
| D16 | 代理列只显示本机检测到的代理。 |
| D17 | 「本机 MCP 服务 · 让其他 AI 调用 Tuff」保留，放在清单下方。 |

规划时的设计取舍（老板未逐条拍板，可推翻）：

- 全局上限只管本机、不随同步走，否则实际总量会变成「设备数 × 上限」；
- 不新增「清空日志」按钮，保留期与删除统一在隐私设置里处理；
- Nexus 托管调用按积分计费，不折算美元，归入 D13 的「Nexus 积分」类提示。

## 执行安排

| ID | 安排 | 理由 |
| --- | --- | --- |
| E1 | 审计重做与 Skills/MCP 重做合成一个 Native change，不拆 Supervisor 子任务。 | 两者共用 `intelligence-module.ts`、语言包、`uno.config.ts` 与共享洞察组件（MCP 页直接用审计侧的 `InsightsHeader`），大部分实现已经完成，拆开后合并成本更高。 |
| E2 | 使用独立 worktree `/private/tmp/tuff-intelligence-audit-skills-mcp-1003`，分支 `comet/intelligence-audit-skills-mcp`，目标分支 `task/chore/live-work-1003`。 | 共享工作区的当前 change 是迁移 change。 |
| E3 | 进入 Build 后，把共享工作区里本任务已完成与半成品的未提交改动搬进本 worktree：本任务独有的文件整份复制；和其他会话共用的文件只搬本任务的 hunk，逐文件对照 diff；共享工作区的原件不动。 | 这些改动是冻结前的实现，不重做；只能在 Build 阶段写入实现文件。 |
| E4 | 同时最多两个实现代理。 | 共享限流，此前被 429 打断过。 |

# 约束与不变量

- 产品定位（2026-10-03 老板定）：Tuff 只复用本机 CLI 的凭证并调用它们，不做 cc-switch 式管理器；本机发现一律只读，开关只影响 Tuff 自己。
- 用量、审计统计、配额与上限是宿主独占的控制面，插件不可读写；审计默认不保存完整 prompt / response；上限用尽或无法校验时一律拒绝（fail-closed），并给出恢复建议。
- 计数一致性只在审计开启时段成立；敏感数据生命周期变化要同步 `docs/engineering/sensitive-data-inventory.json`。
- 界面只用 TuffEx 控件与 CoreApp 共享组件，不新增原生 `select`、`input`、`checkbox`；样式用 `--shell-*` token。
- 共享文件（`intelligence-module.ts`、两份语言包、`uno.config.ts`、`categories.ts`、`router.ts` 等）只做精确锚点修改，不整文件重写。
- 冻结的兄弟任务交接（`docs/engineering/workflow/handoffs/10-03-{skills-page-revamp,mcp-settings-page,local-agent-detection,intelligence-settings-revamp}/`）中的现状分析、合并规则与安全契约继续有效。其中技能页「页面级保存条 + 离开路由确认」改为抽屉内保存与关闭确认。
- 不触碰老板自己的 dev 实例；不运行会触发全量重装或重建 tuffex 的 `pnpm` 包装脚本与 `nuxt typecheck`。真机验证用隔离 profile 与新端口，大体积产物放 `/tmp`。

# 验证要求

- 主进程：用真实迁移库的 harness。本地日测试用固定时间戳加显式时区；定价用夹具，不访问网络；契约测试覆盖 host-only 清单。
- 渲染层：组件测试 mock SDK，覆盖合并规则、按代理计数与筛选、抽屉草稿与关闭确认、每服务器启停、名称映射、导出全量、上限卡在 79% / 80% / 100% 三档的表现。
- 门禁：
  - `tsc --noEmit -p tsconfig.node.json --composite false` 与 `vue-tsc --noEmit -p tsconfig.web.json`，带阳性对照；
  - 涉及的 vitest，含 `translation-coverage`、`categories.smoke`、`plugin-facing-events`；
  - `coreapp-ui-contract` 检查；
  - 包内 eslint，按 delta 判，用 stdin 做阳性对照；
  - 敏感数据清单校验；
  - `git diff --check`。
- worktree 的 `node_modules` 若链接到共享工作区，工作区包会解析到共享工作区的源码。凡是 import 工作区包的测试，都要确认解析到的是本 worktree 的源码。
- 真机：隔离 dev 实例加 CDP 截图，对照验收逐条取证，暗色、亮色各一套。没有实际运行远端 CI 时，在报告里写明。
