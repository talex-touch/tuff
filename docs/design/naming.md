# 命名基线：AI 阶梯里的 TI

> 更新时间：2026-09-29
> 定位：命名候选与取舍记录。只沉淀名称、含义、项目落点和代价，不改代码、不改能力 id、不定对外文案。

## 1. 问题

AI（Artificial Intelligence）、MI（Machine Intelligence）、SI（Super Intelligence）已构成一条常见的能力阶梯。
同一个"TI"缩写要接在这条阶梯上时，至少有两种读法，选哪种决定了候选名单：

| 读法 | TI 是什么 | 候选特征 |
| --- | --- | --- |
| 类别词 | 阶梯里的一格（载体 / 规模 / 关系维度） | 必须能和 AI/MI/SI 并排念，品牌色弱 |
| 品牌词 | 我们这一层智能的名字 | 项目绑定强，但塞进阶梯里读不顺 |

## 2. 结论

**TI = Tuff Intelligence。** 这不是新提议，是现状：它已经在代码、SDK、Nexus 和落地页里跑着。

- `packages/tuff-intelligence`（`@talex-touch/tuff-intelligence`）是能力编排包。
- 主进程与插件侧统一走 `tuffIntelligence.invoke()` / `tuffIntelligence.stream()`。
- Nexus 运行时为 `tuffIntelligenceLabService.ts`，落地页文案为 `TuffIntelligence Lab` 与 `Powered by Tuff Intelligence.`。

因此本文件的作用不是改名，而是：如果老板要的是"阶梯里的一格"，就在这里挑替代词；如果是对外那一层，保持 Tuff Intelligence。

## 3. 十个候选

### 品牌位

| # | 全称 | 中文 | 含义 | 项目落点 | 代价 |
| --- | --- | --- | --- | --- | --- |
| 1 | **Tuff Intelligence** | 图夫智能 | 我们自己的智能层 | 现状：`tuffIntelligence`、`packages/tuff-intelligence`、Nexus Lab、落地页 | 是品牌词，不能塞进 AI/MI/SI 当同类读；改名成本最高 |
| 2 | Touch Intelligence | 触达智能 | 轻触即达，一次触发完成一件事 | 组织名 `@talex-touch`、`talex-touch` 仓名、CoreBox 启动器心智 | 与 org 名绑定，作为产品名偏弱 |
| 3 | Talex Intelligence | 塔莱克斯智能 | 组织 / 治理口径 | Nexus 审计、配额、Provider Registry 治理面 | 人名进分类词，读者没有语义收获 |

### 类别位（载体 / 规模）

| # | 全称 | 中文 | 含义 | 项目落点 | 代价 |
| --- | --- | --- | --- | --- | --- |
| 4 | Tiny Intelligence | 端侧智能 | 小模型跑在本机的那一格 | 2.5.5 本地模型运行时、`tuff-local-asr` / `local-offline`、`sense-voice-small`、`PiCliProvider`（`type = LOCAL`） | "Tiny" 只描述体积，不描述能力边界 |
| 5 | Terminal Intelligence | 终端智能 | 以命令入口为形态的智能 | CoreBox ⌘K、`packages/tuff-cli`、`pi-extension-tuff` | "terminal" 在英文里同时有"终极"义，易被误读成 SI |
| 6 | Tool Intelligence | 工具智能 | 智能通过工具作用于系统 | 插件 manifest、`searchProviders`、quickops、Context Actions | 容易被理解成"工具库"，弱化模型能力 |

### 类别位（关系 / 治理）

| # | 全称 | 中文 | 含义 | 项目落点 | 代价 |
| --- | --- | --- | --- | --- | --- |
| 7 | Together Intelligence | 协同智能 | 人与 AI 各出一半 | Agent / Workflow / DeepAgent 编排、`SkillRegistry`、会话交接 | 常被写成 Co-Intelligence，缩写不唯一 |
| 8 | Tunable Intelligence | 可调智能 | 按能力、模型、预算现场调配 | provider / scene 绑定、reasoning effort、quota 与 audit 控制面 | "可调"是工程属性，不是对外卖点 |
| 9 | Trusted Intelligence | 可信智能 | 可解释、可审计、可回退 | 能力级配额、审计落库、隐私分级与保留策略 | 与 Transparent 语义重叠，二者只能留一个 |
| 10 | Transparent Intelligence | 透明智能 | 用户能看见上下文里放了什么 | ContextHygiene 的注入可解释、Memory 可检视/可删除 | 同上；"透明"容易被读成"免费公开" |

## 4. 阶梯怎么念

- 要并排念（AI → MI → TI → SI）：只取第 4–10 号。最自洽的是 **Tiny**——四个词各占一格：范式（人工）→ 载体（机器）→ 规模（端侧）→ 上限（超级）。
- 要当品牌：**Tuff Intelligence**。它盖住整条阶梯，不占格。
- 两者不混：一句里不要用 `AI` 和 `TuffIntelligence` 指同一层。

## 5. 落地规则（写代码时）

- 品牌 / 对外文案：`Tuff Intelligence`，缩写 `TI`。
- 代码标识：`tuffIntelligence`（实例）、`@talex-touch/tuff-intelligence`（包）、`Intelligence*`（类名），沿用现网写法。
- 能力 id 用域前缀：`text.chat`、`vision.ocr`、`audio.asr` / `audio.stt`、`image.caption` / `image.translate`、`code.review`。**不新增 `ai.*` 前缀的能力入口**——这条来自 2026-02 的 AI 落地待办（`docs/engineering/tuff-intelligence-rollout-todo.md`，已标 Historical），当前能力注册表仍与该约定一致。

## 6. 未决

- 第 9 / 10 号只保留一个。
- 是否需要一个"阶梯位"命名与品牌命名共存的正式说法（例如对外 Tuff Intelligence、对内 Tiny Intelligence 指端侧那一格）。
- 定名后是否回填到 `README.md`、落地页与 Nexus 文档站。
