# 直接预览计算 PRD

## 一、产品背景

### 1.1 现状
- 搜索框目前只能返回由插件提供的列表项，输入算式/换算语句时没有即时反馈，用户需要额外打开浏览器或计算器，打断思路。
- 复杂查询（单位换算、汇率、时间差）与普通搜索结果混在一起，缺少独立区域，难以建立“输入=得到结果” 的肌肉记忆。

### 1.2 竞品观察
| 产品 | 能力 | 体验问题 |
| --- | --- | --- |
| Raycast | 算式、单位、货币、日期、BMI | 算式/单位分离插件，命中要切换；中文语法不友好 |
| Spotlight | 仅支持基础加减乘除 | 不能处理单位/日期 |
| uTools | 依赖第三方插件 | 体验断层，可靠性不可控 |

### 1.3 核心目标
1. 在搜索框中实时解析“算式/单位/汇率/日期”语句，零跳转返回精确结果。
2. 以“直接预览卡片”形式与其他搜索结果区隔，形成第一眼就能确认的视觉锚点。
3. 构建可扩展的计算解析引擎，支持后续增加金融、物理常量、文本统计等能力。

## 二、用户场景
1. **快速算式**：输入 `1+1`、`(120*0.88)+35%` 立刻显示 `2`、`148.2` 并可复制。
2. **单位换算**：输入 `1t=kg`、`42km -> mile`、`37 C in F` 即时展示双向结果与常用衍生。
3. **汇率换算**：输入 `100 usd to cny` 或 `1欧元= ? 人民币`，显示实时汇率，并提示更新时间。
4. **时间与日期**：`now + 3h`、`2025-12-01 - 42d`、`10:30 PST in Beijing` 输出目标时间和剩余倒计时。
5. **组合查询**：`42usd + 180cny in usd`、`(2h30m + 45m) in min` 在单条语句内完成多段计算。

## 三、能力范围（V1-V3）

| 优先级 | 能力组 | 输入示例 | 输出内容 |
| --- | --- | --- | --- |
| V1/P0 | 基础算式 | `sqrt(144)+2^3` | 精确结果 + 公式渲染 |
| V1/P0 | 百分比/增减 | `130 - 15%`、`20% of 120` | 结果 + 变化说明 |
| V1/P0 | 单位换算（长度/质量/体积/面积/温度/速度/数据量） | `1t=kg`、`512mb in gb` | 双向数值 + 同类常用单位 |
| V1/P0 | 自然语法 | `1 小时 + 30 分钟`、`37 摄氏度 转 华氏度` | 支持中/英单位别名 |
| V2/P1 | 货币 | `100 usd to jpy`、`1 btc = ? usd` | 汇率、换算结果、更新时间、数据源 |
| V2/P1 | 日期/时间差 | `now+3h20m`、`2025-03-01 - now` | 时间点、倒计时、周数 |
| V2/P1 | 组合查询 | `42usd + 180cny in usd` | 统一结果，列出分步解析 |
| V2/P1 | 颜色解析 | `#FF6600`、`rgb(12,34,56)`、`hsl(42,80%,50%) to hex` | 显示色块 + 多色彩模型互转 |
| V3/P2 | 科学常量 | `planck constant`、`earth gravity` | 常量数值 + 说明 |
| V3/P2 | 自定义变量 | `let salary=18800; salary*0.15` | 变量表 + 结果 |

## 四、体验与交互

1. **主结果卡**：显示在结果列表顶部，包含：
   - 主结果（大字号）；表达式原文；一个「复制结果」按钮；次要信息（单位、换算方向、更新时间）。
2. **多行展示**：当语句含多个子计算时，按「原语句拆分」列表展示，每行含「中间表达式 + 结果」。
3. **键盘回车行为**：默认复制结果（取代跳转），再次回车将结果写入搜索框，方便继续链式计算。
4. **错误提示**：语法错误时在卡片中提示红色错误文案 + 修复建议（截断位置）。
5. **粘贴感知**：检测用户粘贴包含 `=` 或 `->` 的文本时自动触发预览。
6. **输入态提示**：在输入框右侧显示「计算模式」Tag，提醒当前解析状态。

## 五、功能需求细化

### 5.1 表达式解析
- 语法：支持 `()+-*/%^`、`abs/sin/cos/tan/log/ln/sqrt`、科学计数法、千分位。
- 安全：使用沙箱解析库（优先 mathjs/expr-eval），禁止自定义函数和访问全局对象。
- 输出：提供高精度结果（Decimal.js），默认保留 12 位有效数字，可被 `round` 覆盖。

### 5.2 单位换算
- 单位库：长度、质量、体积、面积、速度、温度、功率、数据量（bit/byte/kib/mib）。
- 规则：语法 `value unit (to|in|=|->) targetUnit`，允许中文别名与大小写混写。
- 拉链：同类热门单位（例如米 <-> 英尺）自动展示，并允许点击切换方向。
- 精度：温度采用精确公式 (°F = °C × 9/5 + 32)，数据量区分 1000/1024 体系。

### 5.3 汇率
- 数据源：默认使用 `European Central Bank` 免费 API；离线 fallback：最近一次成功拉取值。
- 更新策略：主进程 Cron 每小时刷新；失败时指数退避，最多保留 72 小时缓存。
- 展示：显示「最后同步时间」、「数据源短名」；支持 ISO 货币 + 常见 Crypto (BTC/ETH)。

### 5.4 日期与时间
- 语法：`now +/- 3h20m`、`2025-03-01 - now`、`10:00 PST to Asia/Shanghai`。
- 输出：目标时间（本地化格式）、UTC 值、剩余时间、星期数。
- 时区库：`luxon`/`temporal polyfill`，本地缓存常用城市别名。

### 5.5 组合查询与变量
- 解析 pipeline：先根据 `;` 或 `,` 拆语句，再依次求值并缓存中间结果。
- 变量：`let foo = 18kg` 仅在当前搜索会话生效，最多保留 5 个键值。
- 显示：在卡片下方渲染「解析过程」表格，便于排查。

### 5.6 辅助能力
- **复制格式**：可选择原样、结果、`表达式 = 结果` 三种模式。
- **主题适配**：遵循当前 Renderer 色板，支持高对比模式。
- **键盘**：`Cmd+Shift+C` 快捷复制结果；`Tab` 在子结果之间循环。

### 5.7 历史记录
- **保留策略**：默认保留 30 天且最多 500 条历史，两个条件任一命中就触发清理；支持在设置中改为「仅时间」或「仅条数」。
- **记录内容**：原始输入、标准化表达式、求值结果、类型（expression/unit/currency/time）、主要单位/币种、耗时、创建时间。
- **展示入口**：只需按输入框下箭头即可拉起「最近计算」抽屉，可按类别/时间筛选，点击即写回输入框；避免额外快捷键。
- **同步行为**：所有历史仅存本地 SQLite，不与云端同步；提供「一键清除」与「禁止记录」开关。
- **粘贴补全**：当用户选中历史条目时可一键复制结果或表达式，便于继续链式计算。
- **存储方式**：复用现有剪贴板历史表，新增 `source` 字段（取值 `clipboard` / `calculation`），或在 `metadata` 中写入 `{source:'calculation'}`，保证渲染端可以复用同一渲染管线。

### 5.8 颜色解析
- **支持输入**：HEX（3/4/6/8 位）、RGB/RGBA、HSL/HSLA、CSS 颜色名（包括中文别名）、`color(...)` 语法。
- **输出内容**：
  - 主色块展示 + 对比度安全背景（深浅各一）。
  - 各种颜色模型互转（HEX、RGB、HSL、LAB、CMYK），并提供复制按钮。
  - 若输入包含两个颜色（例如 `#FF6600 to rgb` 或 `mix(#fff,#000,40%)`），展示转换或混合结果。
- **交互**：结果卡内支持点击色块复制 HEX；历史条目保留颜色元数据（`meta.colorHex`）便于快速预览。
- **扩展**：后续可与调色板插件联动（将结果推送到剪贴板或插件面板）。

## 六、技术设计

### 6.1 模块划分
```
Renderer 输入框
   ↓ query-change
Search Service (renderer)
   ↓ requestPreview(query)
Main Process Preview Engine
   ↙︎            ↘︎
Expression Evaluator   DataFetchers (UnitRegistry / FxRates / Timezone / ColorEngine)
   ↓
PreviewResult DTO
   ↓ IPC 回传
Renderer ResultCard 组件
```

- **CalculationPreviewService (Main)**：负责查询识别、调用 evaluator、组装结果。
- **ExpressionEvaluator**：封装 mathjs/decimal.js，提供 `evaluate(expression, context)`。
- **UnitRegistry**：静态 JSON + 别名索引；支持热更新。
- **FxRateProvider**：定时拉取 + SQLite 存储（表：`fx_rates(base, quote, value, updatedAt)`）。
- **ColorEngine**：内置颜色解析/互转库（colord/chroma.js），输出多种模型与对比色方案。
- **TimeEngine**：封装 luxon，统一解析本地/UTC/时区。

### 6.2 查询识别
- 触发规则：正则判断是否包含 `数字 + 运算符`、单位关键字、货币代码、颜色语法（HEX/RGB/HSL/CSS 名称）、时区关键词。
- 负例过滤：若命中文件路径/URL/命令行格式，则不进入计算模式。
- 模型结构：
```ts
interface PreviewCandidate {
  type: 'expression' | 'unit' | 'currency' | 'time'
  confidence: number
  tokens: Token[]
}
```
- 只要存在置信度 > 0.6 的候选，即生成预览卡，且结果列表提升至首位。

### 6.3 缓存 & 状态
- 查询缓存：`LRU<rawQuery, PreviewResult>` (size=50)；相同输入 1s 内直接复用。
- 汇率缓存：落地 SQLite，Renderer 只拿 snapshot，避免重复拉取。
- 单位与常量表放在 `apps/core-app/src/main/modules/plugin/providers` 下，支持热重载。

### 6.4 错误处理
- 解析失败：返回 `errorCode=SYNTAX_ERROR`，Renderer 展示简短提示。
- 数据缺失：当汇率超过 72h 未更新时，卡片显示黄色警告。
- 超时：主进程计算超 50ms 直接返回超时错误，不阻塞搜索。

### 6.5 可观测性
- 事件：`calculation.preview.hit`、`miss.type`、`latency.ms`、`fx.refresh.status`。
- 日志：写入模块日志系统，含 query、解析类型、耗时。
- 指标：每日成功率（目标 >98%）、平均耗时 < 30ms。

### 6.6 历史持久化
- **数据结构**：沿用 `clipboard_history` 表，插入 `type='text'` 记录，`content` 存标准化表达式，`rawContent` 存原始输入。
- **来源区分**：在 `metadata` JSON 中写入 `{ source: 'calculation', result, valueType, unit, colorHex }`，同时在 `clipboard_history_meta` 中补充可索引字段（如 `result_preview`）。
- **落地流程**：
  1. CalculationPreviewService 解析成功 → 调用 ClipboardModule 暴露的 `saveVirtualEntry(payload, meta)`；
  2. 模块自动写入数据库并在内存缓存中以 `source=calculation` 标记；
  3. Renderer 查询历史时默认过滤 `source='calculation'` 以呈现「最近计算」列表。
- **清理**：延用剪贴板清理任务，增加「calculation-only」清理策略（只删 source=calculation 的记录），并在 UI 中提供按钮。
- **索引**：继续使用 `timestamp DESC` 主索引；若需要快速检索，可在 `clipboard_history_meta` 中对 `key='source' AND value='calculation'` 建部分索引。
- **隐私**：当历史记录被关闭或用户启用隐身模式时，ClipboardModule 接口直接拒绝写入 `source='calculation'` 数据，同时清空已存在条目。

## 七、实施计划

| 阶段 | 内容 | 交付物 | 预计 | 状态 |
| --- | --- | --- | --- | --- |
| Phase 0 | Unit/FX 数据准备、库选型、沙箱 PoC | Demo CLI | 2 天 | ✅ |
| Phase 1 | 表达式 + 单位换算 | 可交付 PR + UI 卡片 | 5-6 天 | ✅ |
| Phase 2 | 汇率 + 日期时间 | 汇率刷新服务、时区解析 | 4-5 天 | ✅ |
| Phase 3 | 组合查询/变量、指标埋点 | 完整仪表盘、开放变量 API | 3-4 天 | ⏳ |

### 已实现文件 (2025-12-10)

```
modules/box-tool/addon/preview/
├── abilities/
│   ├── advanced-expression-ability.ts  # 高级表达式
│   ├── basic-expression-ability.ts     # 基础算式
│   ├── unit-conversion-ability.ts      # 单位换算
│   ├── currency-ability.ts             # 汇率换算 ✨
│   ├── time-delta-ability.ts           # 时间计算
│   ├── color-ability.ts                # 颜色解析
│   ├── percentage-ability.ts           # 百分比
│   ├── scientific-constants-ability.ts # 科学常量
│   └── text-stats-ability.ts           # 文本统计
└── providers/
    ├── fx-rate-provider.ts             # 实时汇率服务 ✨ NEW
    ├── time-engine.ts                  # 时间计算引擎 ✨ NEW
    └── index.ts                        # 模块导出
```

**FxRateProvider 特性**:
- ECB + 备用 API 双源获取
- 1 小时自动刷新
- 72 小时缓存 + 离线 fallback
- 支持 17 种货币 + BTC/ETH
- 中英文货币别名

**TimeEngine 特性**:
- 时间解析: now, today, tomorrow, 日期字符串
- 时间偏移: +3h, -2d, +1h30m
- 时区转换: 30+ 时区别名
- 时间差计算: 年/月/日/时/分/秒

## 八、验收标准
1. 关键场景（算式/单位/汇率/时间）命中率 ≥ 95%，平均响应 < 50ms。
2. 结果卡片位于搜索结果首行，按设计展示多行解析、复制按钮。
3. 断网情况下仍可输出最近一次汇率快照，并明确提示。
4. 所有解析与网络错误均在卡片中显示可读提示，不出现空白。
5. 事件埋点在 Dashboard 中可查询，包含命中率、失败原因分布。

## 九、风险与缓解
- **解析歧义**：文件路径或正则表达式被误识别为算式 → 引入黑名单模式 + 最小长度检测。
- **汇率 API 限额**：准备备用数据源（ECB + open.er-api.com），超限时自动切换。
- **浮点误差**：统一通过 Decimal.js 处理，并使用字符串输入避免 IEEE 754 问题。
- **多语言维护成本**：单位/货币别名建立 JSON 配置 + Crowdin 翻译流程。
- **性能**：主进程计算压力大 → 计算模块独立线程 + 50ms 超时保护。

## 十、开放问题
1. 是否需要在结果卡内提供“插入到当前输入”的按钮（默认回车已复制）。
2. 汇率刷新频率是否需要根据用户地理位置动态调整（例如国内 vs 海外）。
3. 是否开放给第三方插件复用该计算引擎（比如在其它面板内调用）。
