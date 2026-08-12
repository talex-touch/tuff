# Frontmatter 真值扫描 —— 全库 118 组件 × zh/en

> 核验者：`fix-final-batch`，**纯只读**，未改任何文件。
> 方法：`content.config.ts` 的 `docs` collection 无 schema（只 `type: 'page'` + `source`），frontmatter 完全自由——**每个值都是不受校验的事实断言**。逐值查「这个值断言的事实是否存在」，证据 = git 首次加入日 / 源码 / 文档正文，**不查字段齐不齐**。
> **取样时刻：2026-07-28 23:00–23:20 PDT。** #58/#60/#62/#63 正在改 `base-anchor`/`card`/`group-block`/`icon` 的**标题层级**（不碰 frontmatter）→ 行数类读数会漂，frontmatter 值稳定。

## 总判断

**组件层面没有第二处「独立编造」——`index` hub 页的 `since:1.0.0` 是本轮唯一的独立编造，已由你还原。** 但查出三类值得处理的不实断言：

1. **【确认不准确 · since】11 个组件（源码 2026-02-16 之后才首次出现）仍标 `since: 1.0.0`**，git 首次加入日可证它们在 1.0.0（≈2025-12）时根本不存在。这是 `copy-button` 那一类漏标的系统化——你问的「可能还有」，答案是有，共 11 个。
2. **【存疑 · since】`base-anchor` / `base-surface` 标 `since: 2.5.0`，但源码首次出现于 2026-02-16**，与同一天出现的 `error-state`/`flat-radio`/`flat-select`/`guide-state`（标 `2.4.7`）矛盾。**这条要你特别看**——你把 `base-anchor=2.5.0` 当过 `version-capsule=2.5.0` 的先例，若它本身错了，先例被污染。
3. **【本轮可能失效 · verified】7 个本轮被大幅重写的文档，`verified: true` / `syncStatus: reviewed` 与 HEAD 逐字节相同，正文却删了 150–1493 行**——断言对不上当前内容。

②category 全部合法、无归错桶的确认错误；③tags 抽验全部能力型 tag 无虚构能力（含你上次改的 `scroll` `virtual` 已确认移除）；④status 全 `beta` 无异常。

---

## ① `since` —— 断言「该组件在版本 X 引入」

`since` 分布：`1.0.0`×110、`2.4.7`×4、`2.5.0`×4、index 无（已还原）。`1.0.0` 是双重身份值：foundational 队列（2025-12-23 前批量导入）**兼** 未显式版本化时的默认占位。判据（你给的）：**`since` 早于该组件源码首次出现日 = 不可能的断言**。

### 确认不准确（漏标 / 默认值滥用，非恶意独立编造）—— 11 个

源码首次出现于 **2026-02-16 之后**，却标 `since: 1.0.0`（断言「1.0.0≈2025-12 即可用」，但代码晚了数月才存在）：

| 组件 | 源码首次加入 | 标称 since | 差距 |
|---|---|---|---|
| `copy-button` | 2026-05-21 | 1.0.0 | 5 个月（**你已知的漏标**）|
| `divider` | 2026-05-21 | 1.0.0 | 5 个月 |
| `kbd` | 2026-05-21 | 1.0.0 | 5 个月 |
| `number-input` | 2026-05-21 | 1.0.0 | 5 个月 |
| `textarea` | 2026-05-21 | 1.0.0 | 5 个月 |
| `markdown-editor` | 2026-06-13 | 1.0.0 | 6 个月 |
| `ai-elements` | 2026-06-14 | 1.0.0 | 6 个月 |
| `icon-button` | 2026-06-20 | 1.0.0 | 6 个月 |
| `os-icon` | 2026-06-20 | 1.0.0 | 6 个月 |
| `edge-fade-mask` | 2026-02-18 | 1.0.0 | 边界（刚过 02-16）|
| `transfer` | 2026-02-22 | 1.0.0 | 边界 |

> **诚实的口径说明**：因为 `1.0.0` 同时是「未版本化默认值」，这 11 个严格说是**漏标 / 默认值滥用**，不是像 index 那样凭空造一个值。但按字面读，每个都断言了一个可证为假的引入日期。最干净的一批是 2026-05 之后的 9 个（差 5–6 个月，无可辩解）。
> **另有约 30 个** 2026-01 至 02-16 之间首次出现、标 `1.0.0` 的（如 `container` 01-02、`data-table` 01-20、`form` 01-20…）——同一模式但差距仅数天到数周、紧贴 foundational 边界，**列此说明规模、优先级低**，不逐个点名以免过报。

### 存疑（无法从 git 判定意图）—— base-anchor / base-surface

| 组件 | 源码首次加入 | 标称 since | 同日兄弟的 since |
|---|---|---|---|
| `base-anchor` | 2026-02-16 | **2.5.0** | error-state/flat-radio/flat-select/guide-state 同为 02-16 → **2.4.7** |
| `base-surface` | 2026-02-16 | **2.5.0** | 同上 |

`2.5.0` 是**尚未发布的下一版**。一个 2026-02-16 就存在、穿过 2.4.7→2.4.13 多个发布的组件，标「since 2.5.0」= 断言它引入于一个比其真实引入晚 5 个月、且尚未发布的版本。**两种解释 git 都分不清**：(a) 纯误标，应与同日兄弟一致为 `2.4.7`；(b) 本轮把它当作「2.5.0 周期重做的新原语」故意重版（`base-anchor` 确在本轮大改、#58 在改它）——但 `since`=首次可用、非最近重写，(b) 不符标准语义。**需要你按当初的意图裁定。** 对照：`flat-dropdown`(2026-07-24) 与 `version-capsule`(2026-07-25) 标 `2.5.0` 是**对的**——它们确是本轮全新。

---

## ② `category` —— 值必须是 10 桶之一且归对桶

全 118 个值都落在合法 10 桶内（Form 26/Data 13/Basic 13/Status 13/Effects 13/Feedback 12/Navigation 11/Layout 11/Primitives 4/Foundations 2）。**无非法值、无明显归错桶的确认错误。** 抽查最可能错配的若干项均可辩解（`scroll`=Layout ✓、`markdown-view`=Data ✓、`code-editor`/`markdown-editor`=Form ✓）。两处**主观边界、非错误**：`transfer`=Data（Element 系会归 Form）、`divider`=Basic（可归 Layout）。judgment call，不列为伪造。

## ③ `tags` —— 有没有 tag 声称文档/源码里不存在的能力

抽验全部 16 个「能力型」tag（用你在 `scroll` 上删 `virtual` 的同一判据：正文/源码是否描述该能力）：

- **`input` + `search`**（最像误标——另有专门的 `search-input`）→ **成立**：`input` 文档有独立「Search Row」段、`description: 轻量输入框与搜索态`、search 前缀图标 demo。base input 确实覆盖轻量搜索态。
- **`sortable-list` + `drag-drop`** → 成立（源码有 `onDragStart`/`DragEvent`/`dataTransfer`/`canDrag`）。
- **`base-surface` + `backdrop-filter`/`blur`** → 成立（源码有 `blur` prop、`--tx-surface-filter-blur`、blur/glass 模式）。
- 其余（`virtual-list`+virtual-list、`pagination`+pagination、`kbd`+keyboard、`textarea`+multiline、`splitter`+resize、`search-*`+search、mask 系）**自证式，无意外主张**。
- **`scroll` 的 `virtual` 已确认移除**（现 tags 无 virtual）——你上轮的修复保持住了。

**结论：无虚构能力的 tag。**

## ④ `status` —— 全库 beta

118/118 `beta`，index 已无 status（正确）。无维度可从数据判定成熟度是否名不副实——按你说的，这条弱、跳过。附注：`flat-dropdown` 的 `status:beta` 但 `syncStatus: migrated` / `verified: false`——**这是诚实的部分标注**。

## ⑤ `verified: true` / `syncStatus: reviewed` —— 本轮大改后断言是否还成立

**判断：对本轮被大幅重写的文档，`verified: true` 是 HEAD 时代的陈旧断言，已失效。** 证据：这些文档的 `verified`/`syncStatus` 行与 HEAD **逐字节相同**（本轮没人重设），正文却被删掉大段——即该断言是针对**重写前**的内容做的，不描述当前内容。

净删 >100 行、且 `verified:true` 未变的 7 个：

| 组件 | 本轮正文 diff（zh）| verified 行 vs HEAD |
|---|---|---|
| `card` | +156 / **−1493** | 与 HEAD 逐字节相同（仍在 #60 改）|
| `fusion` | +31 / **−1363** | 同 |
| `avatar-variants` | +36 / **−977** | 本轮补全 8 字段，verified:true 沿用于删空的正文 |
| `slider` | +20 / **−621** | 与 HEAD 逐字节相同 |
| `glass-surface` | +18 / **−307** | 本轮补全，verified:true 沿用 |
| `container` | +26 / **−151** | 与 HEAD 逐字节相同 |
| `context-menu` | +21 / **−118** | 本轮补全，verified:true 沿用 |

**建议（不是我改）**：这 7 个（尤其 card/fusion/avatar-variants/slider——删了半页以上）应把 `verified` 降为 `false` 或 `syncStatus` 标 `needs-review`，或在提交前真人重审。**我无法证明没人重审过**，但 flag 字面没动、而内容是自动化压缩改的，按「verified=已审阅当前内容」的读法，这个断言当前不成立 → 归「本轮可能失效」。
诚实对照：`flat-dropdown`(verified:false/syncStatus:migrated) 与 `utils`(verified:false) 正确自标未审阅。

---

## 覆盖范围（哪些穷尽、哪些抽样、哪些未覆盖）

> 应收口指令补记，标明穷尽度。5 个靶子全部触及；下面是各自的严格边界。

- **① since —— 穷尽。** 全 118 组件逐个跑了 `git log --format=%as --reverse -- <src> | head -1`（源码首次加入日）对比 `since` 值，机器可判。11 确认 + 2 存疑已点名；~30 紧贴 foundational 边界的按规模计、**未逐个点名**（低优先、避免过报）。
- **② category —— 合法性穷尽，归桶抽样。** 118 个值全部核对落在 10 桶内（穷尽）；「归错桶」只对最可能错配的若干项做了语义复核（`scroll`/`markdown-view`/`code-editor`/`markdown-editor` 等），**未对全部 118 个逐一重新推导应属哪桶**。抽样内无确认错误。
- **③ tags —— 能力型穷尽，描述型未查。** 16 个「声称某能力」的 tag 全部回源码/正文核实（穷尽）；纯描述型 tag（`overview`/`components`/`preview`/组件名自身等，不主张任何能力）**未逐个核**——它们不构成「关于不存在能力的断言」，无真值可证伪。
- **④ status —— 分布穷尽，成熟度判断跳过。** 118/118 `beta` 已确认（穷尽）；「beta 是否名不副实」按你说的弱、**跳过**，无覆盖。
- **⑤ verified —— 重写文档穷尽，轻改文档未覆盖。** 只对本轮净删 >100 行的重写文档做了 flag-vs-body 逐字节比对（7 个，穷尽该子集）；**其余约 110 个仅轻改/补字段的文档，其 `verified:true` 未逐个做 HEAD 比对**——它们正文未被掏空、失效风险低，但严格说未验证。
- **en 侧：** 发现主要在 zh 上计算；en frontmatter 与 zh 为同字段集（delivery 记 0 差异），`index.en` 已单独比对。**未对全部 118 个 en 文件重跑 since/verified 的 git 比对**——按等值假设推得，非独立复算。

**未覆盖的整靶：无。** 收口在抽样边界，不在缺失靶子。

---

## 需要你处理的清单

0. **【存疑，先裁】** `base-anchor`/`base-surface` 的 `since:2.5.0`：是要与同日兄弟统一为 `2.4.7`，还是确认「2.5.0 周期重做」的重版意图？此判定会回溯影响 `version-capsule` 先例是否干净。
1. **【确认不准确 · since】** 11 个 2026-02-16 后组件的 `since:1.0.0` 是否要改真实版本（同 copy-button 处理）。若统一按「未版本化默认」接受，则至少 index 那种独立编造要与之区分对待。
2. **【本轮可能失效 · verified】** 7 个大改文档的 `verified:true` 降级或重审——提交前决定。
3. ②category / ③tags / ④status 无需动。
