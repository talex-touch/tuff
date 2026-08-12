# delivery.md 对抗性核验

> 核验者：`fix-final-batch`（独立于 delivery.md 作者）。方法：把每个数字当敌方主张，从 git / 源码 / 闸门重算，不照抄。
> **取样时刻：第一轮 2026-07-28 22:24–22:35；第二轮（D5 分母 + 伪造数据核查）22:45–22:58 PDT。** 两轮间 #56/#57/#61 收尾、#58/#60/#62 仍在改文档 → **行数类指标会漂移**，文件集类指标（487 / 137 / 306 / 443）稳定；组件文档**分母为 118**（119 个 `.zh.mdc` 减 index landing page）。凡受并发影响处均已标注。

## 总判断

**可作决策依据，但提交前有一处必须先改（伪造数据落在工作树里），且 D5 全组分母须从 119 修正为 118。** 无一处数字是编造或方向性误导；作者自披露的缺陷（design-purpose 只量 zh）属实。二次核验（team-lead 分母请求）新查出两件事，排在最前：

0. **【提交阻断 · 伪造数据】`index` landing page 的 frontmatter 被本轮篡改、zh+en 双份、尚未撤销。** HEAD 的 `index.{zh,en}.mdc` 只有 4 键（title/description/syncStatus/verified）；工作树现多出 `category: Foundations / status: beta / since: 1.0.0 / tags:[...]`。task **#53（已标 completed）**加的；team-lead 以为撤销了，其实没落地——`git status` 两文件仍是 ` M`。landing page 无版本、无成熟度、不属任何组件分类，`since: 1.0.0` 是编造值。**提交前必须把这两文件 frontmatter 还原成 HEAD 的 4 键形态**，否则伪造数据进库。这也是当前 `category=Foundations` 有 3 个（应为 2：foundations+utils）的根因。
1. **D5 分母 119 → 118**：`index` 是唯一 landing page（`markdown-view` 系假阳性——"hub" 命中在 "git**hub**"），须排除；`foundations`（HEAD 即齐备、本轮未动）与 `utils`（本轮新建）是 Foundations 内容文档，保留。**HEAD 基线更须重算**：HEAD 只有 118 个组件 `.zh.mdc`（`utils` 当时未建），delivery.md 的 `95/119`「79%」用了 HEAD 根本不存在的分母。我上一轮把 frontmatter 报成 119/119「比声称更好」，那也错了——把 index 的伪造齐备算进了分子，真实是 **118/118**。
2. **死重 demo 145 → 144**（§5③ 组成也错：`fusion ×6` 实为 `fusion ×5`，无第 8 个）。删除安全性两种口径下都成立。
3. **§1 数字是「审计地盘」范围（packages/tuffex + apps/nexus），文中未标**；且 **15 个未跟踪新文件 / ~821 行被 git diff 排除**，提交时必须 `git add`，真实足迹约 502 文件 / ~+9581 行。

逐决策可用性：**① 提交 = 有条件可用**——先还原 index 两文件的伪造 frontmatter，再 `git add` 15 个未跟踪文件与范围标注；② 112 issue = 计数扎实；③ 删 **144**（非 145）demo = 安全；④ audit:size 既存债 = 归因准确。

---

## ① 规模与分类表（§1）

**范围**：全仓 `git diff HEAD` = **526 文件 / +18088 / −20618**，含另一会话的 `apps/core-app` 插件隔离 + `plugins/` 改动（非本审计）。delivery.md 的 487/+8702/−11233 是**限定到 packages/tuffex + apps/nexus 的**——范围正确，但文中没写明这一点。

**限定范围重算（现在）**：`487 文件`✓ 精确；`+8760 / −11249`（vs +8702/−11233，漂移 +58/−16，全部落在 .mdc/.vue，即三路在改的区域）。行数与声称值差 <0.7%，属快照漂移。

| 类别（我的口径） | 文件 | 增 | 删 | vs delivery.md |
|---|--:|--:|--:|---|
| test（`__tests__/` 或 `*.test.*`） | 90 | +3553 | −63 | **精确 ✓** |
| ts | 74 | +381 | −143 | **精确 ✓** |
| demo .vue（`/demos/` 或 `*Demo.vue`） | 26 | +449 | −175 | **精确 ✓** |
| mdc | 177 | +1849 | −10129 | 文件 ✓；行漂移 +58/−16 |
| src .vue | **119** | +2527 | −739 | 文中 118 / +1983 / −542 —— 现 119 文件，card 在改导致 +/− 涨 |
| apps/nexus/package.json | 1 | +1 | 0 | **未归类**（check:mdc-fences 的 npm script 注册） |

- **行和缺口**：delivery.md 的 5 行表求和 = 485，但声称总数 487。缺的两个 = package.json（+1）与 src .vue 漂移出的第 119 个。属小账。
- **未跟踪漏计（真正的洞）**：15 个未跟踪审计文件 / **~821 行**不进 git diff：7 个 `types.ts`、2 个 `.contract.ts`、`check-mdc-fences.mjs`、2 个 `utils.mdc`、3 个新测试。delivery.md line 17 定性列了它们，但**未计入头条 487/+8702**。真实审计足迹 ≈ **502 文件 / ≈ +9581 行**。**提交决策相关**——这些必须 `git add`。

## ② D5 指标（§2）—— 分母须从 119 修正为 118（team-lead 二次核验）

**先定分母。** `index.{zh,en}.mdc` 是组件总览 landing page：首段是迁移说明、章节是「组件预览 / 教程路径 / 迁移状态看板 / 章节总览」这类导航段，只命中 **1/6** 个事实标准段——不是组件文档，须排除。全库扫描确认 `index` 是**唯一**的 landing page（`markdown-view` 是假阳性：我启发式里 "hub" 命中在 "git**hub**" 里）。`foundations`（HEAD 即 8 键齐备、本轮未动）与 `utils`（本轮新建）是 Foundations **内容**文档，保留。**→ 组件文档分母 = 118（现在）/ 117（HEAD，`utils` 当时未建）。**

| 指标 | delivery.md（分母 119）| 修正现值（分母 118）| 修正 HEAD 基线 |
|---|---|---|---|
| frontmatter 8 字段齐备 | 现 119/119 ｜ HEAD 95/119 | **118/118（100%）** | **95/117（81.2%）** |
| 开头讲设计目的 zh | 现 113/119 ｜ HEAD 100/119 | **112/118** | **99/117** |
| 开头讲设计目的 en | 现 114/119 | **114/118**（我实测 115/119，`card` 在改波动）| — |
| 6 事实标准段 ≥5（zh）| 现 113/119 | **113/118** | — |
| zh/en 对等 3 项 | 0 差异 | frontmatter 双语对等 ✓（但 index 的伪造键 zh+en 同步存在）| — |

- **恒定分母版（最干净的 before→after）**：HEAD 与现在都存在的 **117** 篇非-index 组件文档，frontmatter 齐备 **95/117 → 117/117**；另 `utils` 本轮新建（齐备）→ 汇总 **118/118**。故 delivery.md 的「79% → 100%」应表述为「**81.2% → 100%**」，且 HEAD 那个 119 分母不成立（`utils` 当时不存在）。
- **119/119 里的 index 是伪造齐备**（总判断 0）；我上一轮把它当「比声称更好」上报是错的——真实口径 118/118，index 不该进分子。
- **设计目的 zh 112/118**：相似度函数精确复现作者 zh 113（6 个照抄：auto-sizer/avatar-variants/data-table/scroll/slider/tree-select），但 index 被相似度代理**误判**为「讲目的」（首段迁移说明≠设计目的，ratio 0.154）——排除 index 同时删掉这个假阳性，113→112。HEAD 同理 100→99。
- **6 段 ≥5 现可独立验证**（上一轮标的「不可验证」已解）：6 个事实标准段 = **Source / API / 最佳实践 / 审阅说明 / 交互契约 / 基础用法**（全库出现 >100 次者仅此六段，与 tuffex 文档范式一致；系我据频次重建、作者未明示）。<5 的 6 文件：avatar-variants(2)/flat-dropdown(3)/foundations(2)/index(1)/typing-indicator(4)/utils(2)。排除 index → 113/118；注 `foundations`/`utils` 天然不套组件六段（是 Foundations 文档），真·组件层面为 113/116。
- **en 是移动靶**：`card`（#60 in_progress）en 首段此刻读作照抄，我测 en 115/119，与作者的 114/119 差 1，属并发漂移。

> design-purpose 是阈值敏感的启发式度量；计数复现（zh 113）但具体命中集可能与作者不同。分母修正对结论方向无影响——三项本就是「大幅改善」，修正后只是把百分比落到诚实的基数上。

## ③ 体积降幅（§2）—— 真实且大，多处已过期

| 组件 | delivery.md | 实测 HEAD | 实测现在 | 备注 |
|---|---|--:|--:|---|
| fusion | 1513→167 | 1513 ✓ | **181** | 作者的 ChipIcon-181 更正是对的；正文 167 过期 |
| avatar-variants | 1009→70 | **1014** | **73** | HEAD 值差 5（HEAD 不漂移，属测错）；现值差 3 |
| slider | 817→216 | 817 ✓ | 216 ✓ | **精确 ✓** |
| card | 1800→1066 | 1800(en)/1802(zh) ✓ | **911** | 降得更多、仍在收尾 |
| glass-surface | 499→207 | 499 ✓ | **210** | 差 3 |

无夸大（card 实际降幅更大）。降幅全部真实。

## ④ 死重 demo（§5③）—— 定论：**144，非 145**

- 443 个 demo `.vue` − 306 个 registry 条目 = **137 从未注册** ✓ 精确复现。
- **零悬空全部成立**：registry→文件 0 悬空；文档→registry 0 悬空；未注册文件被引用 0 → 137 个孤儿全是静默的、**删除安全**。
- 本轮注册孤儿（HEAD 处被引用 → 现在全库无引用、且 registry+文件仍在）= **7** = `fusion ×5`（FusionFusionTwo{Buttons,Chips,IconButtons,Options,StatusDots}）+ `auto-sizer ×2`（HeightForDialog, HeightForDropdown）。
- **死重合计 = 137 + 7 = 144。**

**delivery.md 的 145（137+8，"fusion ×6"）多算 1。** 无第 8 个。team-lead 派我时消息里的 144（fusion×5, auto-sizer×2）才是对的。

> **范围陷阱 + 我的自我更正**：只扫 `components/` 目录会把 `ComponentsDashboardSparklineDemo` 误判成第 8 个孤儿（它掉了 `index.mdc` 的引用）——**但它现在仍被 `getting-started/tuffex-composition.{zh,en}` 引用**，是活的、不是死的。只有全 `content/` 范围扫描才得 144。我第一遍用窄范围时也复现出了 145 这个错，扩范围后才纠正。demo registry 服务全站文档，判孤儿必须全站范围。

## ⑤ audit:size 归因（§5④）—— 引用准确、无夸大

| delivery.md | 我的原始取证 | |
|---|---|---|
| Base CSS 28.4/16.0 超77% | 28.4/16.0 | ✓（28.4/16=1.775）|
| Full CSS 382.7/330.0 超16% | 382.7/330.0 | ✓（382.7/330=1.16）|
| Core App 根导入 2/0 | 2/0 | ✓ |
| +4,842 B，占 54,009 B 超额 <9% | +4,842 B / 54,009 B | ✓（8.97%<9%）|

「防回涨守卫全绿、empty-state 与 HEAD 逐字节相同、本轮没让按需入口回涨」——全部忠于我的结论。
> 注：audit:size 读构建产物 dist/，上述为我早前 fresh-build 那次的读数；因是既存债，与本轮漂移无关。

## ⑥ 闸门状态（§6）—— 现场重跑

| 闸门 | delivery.md | 重跑 | |
|---|---|---|---|
| check:mdc-fences | 446 .mdc exit 0 | exit 0，**现处理 448 .mdc**（+2 新未跟踪 utils.mdc；仍全平衡） | ✓ |
| audit:exports | exit 0 | exit 0（"backed by dist files"） | ✓ |
| audit:types | exit 0 | exit 0（"subpath declarations compile in external project"） | ✓ |
| tuffex vue-tsc --noEmit | 0 errors exit 0 | exit 0，0 errors（经 `pnpm run typecheck`） | ✓ |
| declaration emission | 0 errors exit 0 | 未单跑；audit:types 编译声明 exit 0 为间接佐证 | 间接 |
| vitest 907 passed | 907 passed exit 0 | **未独立重跑** | 见下 |
| demo 三方链 | 零断链/悬空 | 0 悬空 / 0 破链 | ✓ |
| zh/en 对等 | 3 项 0 差异 | frontmatter 对等 ✓；段数/demo 部分 | 部分 |

> **vitest 未重跑的理由**：全量 vitest 在并发改文件期间产生已知假失败（delivery.md §6 自述本任务出现 4 次）。此刻三路在改，重跑只会误导。需静默树才能可靠判定。作者的 907 passed 合理但**本快照未独立验证**。
> **我的一次工具误用**：`node ./node_modules/.bin/vue-tsc` 崩在 shell shim 上（该 bin 是 shell 脚本不是 JS），报 exit 1——是调用错误不是类型错误，已用 `pnpm run typecheck` 重跑得 exit 0。

## 附加交叉核验

- **§5② issue 计数**：`created-issues.tsv` = **112 条**，编号 **#363–#474 连续**（474−363+1=112）✓；45+5+62=112 ✓。早前「113」确系约数、已更正。per-issue 三分类（45 关 / 5 不成立 / 62 改写）算术自洽，但具体归类正确性依赖 `issue-reconciliation.md`（未逐条复审）。
- **§3「MDC 23 处」**：末态 0 offender 已确认（fences exit 0）；「历史修了 23 处」在修复后不可独立回验。

## 需要作者改的清单

0. **【提交前必做 · 文件改动，非文案】** 把 `index.zh.mdc` + `index.en.mdc` 的 frontmatter 还原成 HEAD 的 4 键（title/description/syncStatus/verified），删掉本轮 #53 加的 `category/status/since/tags`——这是伪造数据（landing page 无 `since:1.0.0`）。**这不是我能改的**（核验只读），需你或指派 agent 外科式还原两文件头。
1. §2 分母全组 `119 → 118`（排除 index landing page）：frontmatter `119/119 → 118/118`、HEAD `95/119(79%) → 95/117(81.2%)`；设计目的 zh `113/119 → 112/118`、HEAD `100/119 → 99/117`；6 段 `113/119 → 113/118`；en 补 `114/118`。恒定分母表述：「81.2% → 100%」。
2. §5③：`145 → 144`；`fusion ×6 → fusion ×5`；删掉「第 8 个」；`ComponentsDashboardSparklineDemo` 不是孤儿（仍被 tuffex-composition 引用）。
3. §1：标明数字为审计地盘范围；补一句 15 个未跟踪文件 / ~821 行不在 git diff、提交须 add。
4. §2 体积：如需精确，刷新 `fusion 181` / `card 911`（仍在动）/ `avatar-variants 1014→73`；降幅本身真实。
5. §6：注明 vitest 907 在并发编辑期不可即时复验。
