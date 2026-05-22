# 微审计 32/70

## 审计主题

Raycast / Alfred 的 Calculator 作为 Root Search 基础能力时，Tuff 当前 `PreviewProvider` / PreviewSDK 是否已经具备真实计算与单位换算路径，还是被主文档误判为缺失。

本轮只审一个具体映射点：`calc 2+2`、`计算 1m to cm` 这类输入是否能通过 CoreBox 搜索 provider 进入 PreviewSDK，生成可复制的预览结果；同时确认主文档把缺口定位为 discoverability / evidence，而不是重新实现计算核心，是否准确。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
  - 第 3 节把 Calculator / 单位换算标为“已落地”，锚点是 `packages/utils/core-box/preview/*` 与 `apps/core-app/src/main/modules/box-tool/addon/preview/*`。
  - 第 4 节把缺口写成“证据 + 发现缺口”：用户不一定知道 `calc` 前缀，缺 Store / 帮助入口与 `calc 2+2`、`计算 1m to cm` 样本。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - Raycast 映射表把 Calculator 写成 Root Search 直接计算、Enter 复制答案；Tuff 可复用路径是 PreviewSDK / PreviewProvider。
  - 同表明确 Tuff 当前不应扩大解析范围，先补 discoverability 与 `{calculator}` parameter source。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
  - Provider 表把 PreviewProvider 列为 fast provider，当前事实是显式 `calc` / `calculator` / `calculate` / `计算` / `换算` 前缀、结果复制并写 preview history。
  - 固定样本包把 `calc 2+2`、`计算 1m to cm`、`#ff6600`、`100 usd to cny` 放入 Preview 样本。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 5 条确认 Calculator 不应被误判为未实现，差距是 discoverability 与样本证据。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
  - `registerDefaults()` 注册 `previewProvider`，说明计算预览进入统一搜索编排，而不是孤立工具页。
- `apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.ts`
  - Provider id 为 `preview-provider`，`priority = "fast"`，`supportedInputTypes = [TuffInputType.Text]`。
  - `extractExplicitCalculatorQuery()` 支持 `calc`、`calculator`、`calculate`、`计算`、`换算` 前缀，并把前缀后的表达式传给 PreviewSDK。
  - `buildPreviewItem()` 写入 `abilityId`、`confidence`，显式计算命令还会写 `expression`、`explicitCommand`、`rawQuery`、`resolvedQuery` 与 `Calculator` badge。
  - `onExecute()` 会把 `primaryValue` 写入系统剪贴板，并以 `category: "preview"` 写入 clipboard history。
- `apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.test.ts`
  - 覆盖 PreviewSDK resolve、显式 `calc: 2 + 2` 前缀、结果复制与 preview history 写入。
- `apps/core-app/src/main/modules/box-tool/addon/preview/abilities/index.ts`
  - 默认注册 Advanced / Basic Expression、Unit Conversion、Scientific Constants、Color、Time Delta、Currency、Percentage、Text Stats 等 ability。
- `packages/utils/core-box/preview/abilities/basic-expression-ability.ts`
  - `evaluateBasicExpression()` 使用静态 tokenizer / RPN evaluator，支持基础四则与括号，不依赖动态执行。
- `packages/utils/core-box/preview/abilities/unit-conversion-ability.ts`
  - `UnitConversionAbility` 支持数值单位查询，使用静态单位表，不新增第二套计算器。
- `packages/utils/core-box/preview/sdk/preview-registry.ts`
  - PreviewSDK 按 ability priority 依次 `canHandle()` / `execute()`，命中后返回第一个结果，abort 或异常不会伪装成成功结果。
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/preview-priority-sorter.ts`
  - `preview-provider` item 会被提到非 preview item 前，符合 Calculator 作为快速答案的体验目标。

## 结论

主文档对这个映射点的判断成立：Tuff 不是缺 Calculator 核心。当前链路已经具备“CoreBox 输入 -> PreviewProvider fast provider -> PreviewSDK ability -> 预览卡片 -> Enter / execute 复制结果并写历史”的真实路径。

需要区分两层事实：

1. **能力层已经存在**：基础表达式、进阶表达式、单位换算、颜色、时间、百分比、科学常数、货币等 ability 已注册；基础表达式和单位换算使用静态解析/表驱动，不需要再写一套独立计算器。
2. **显式命令有产品化加成**：`calc:`、`计算` 等前缀会剥离为真实表达式，并在结果上附带 Calculator badge、raw/resolved query 和 expression meta，适合作为 P0 evidence 样本。
3. **非显式表达式也可能命中 PreviewSDK**：源码会把普通 `query.text` 交给 PreviewSDK；主文档强调显式前缀，属于更保守、更可验收的发现性方案，不等于否认底层自然表达式解析。
4. **仍不是完整 Raycast parity**：Raycast 把 Calculator 放进自然 Root Search 心智，Tuff 目前缺帮助/Store 入口、固定截图或日志、explicit/non-explicit 命中率、first result 样本，以及 `{calculator}` 变量 source 的统一合同。

因此下一步不应重写 Calculator 或扩大解析范围，而应按主文档继续补 `basic-evidence-pack`：固定记录 `calc 2+2`、`计算 1m to cm` 的 search trace、首结果、abilityId、confidence、复制结果和 history 写入；再把 `{calculator}` 作为 `TuffParameterSet` / placeholder resolver 的后置 source 复用 PreviewSDK。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有把 Calculator 误写成未实现，也没有要求新建计算核心；它把现状定位为已落地但缺 discoverability / evidence，与源码一致。唯一需要注意的细节是：源码允许非显式表达式进入 PreviewSDK，主文档选择显式 `calc` / `计算` 样本作为验收路径，是保守证据口径，不构成事实错误。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-32.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
