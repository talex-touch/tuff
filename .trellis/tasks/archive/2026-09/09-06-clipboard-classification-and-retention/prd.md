# 剪贴板内容分类统一与按类保留策略

## Goal

剪贴板历史现在有**两套互不相干的密钥分类器**，产出互相矛盾；同时用户要求按内容类别决定保留时长（验证码 1 小时、API 密钥永不删除、其余沿用现状），并在详情里看到预计删除时间。

本任务把分类器合并成一套共享实现，扩充识别覆盖，并把分类结果接到**已经存在但从未被写入**的保留字段上。

## 背景事实（已核对源码）

### 两套分类器，语义不同且已在打架

| | 主进程 `apps/core-app/src/main/modules/clipboard-tagging.ts` | 插件 `plugins/clipboard-history/src/utils/clipboard-shapes.ts` |
|---|---|---|
| 判定方式 | 在正文里搜子串（`\b…\b`） | 要求**整条内容**就是密钥（`if (/\s/.test(value)) return null`） |
| 产出 | `meta.tags` → 详情里的蓝色标签 | 密钥洞察区 + 掩码 |
| 私钥 / JWT / 连接串 | 不认 | 认，且标 critical |
| `api_key: sk-xxx` 嵌在句子里 | 认（挂「API 密钥」标签） | **不认 → 明文渲染** |

最后一行是 09-06-clipboard-secret-mask-and-interactions 交付的掩码的**实际漏洞**：正文里嵌了 key 的记录，界面上挂着「API 密钥」蓝标，同时把 key 明文显示出来。

### 保留策略已存在（我在上一轮口头汇报里说"没有"，是错的）

- `PRIVACY_RETENTION_CATEGORIES` 含 `clipboard-history`，默认 `{ enabled: true, retentionMs: 90 天 }`（`apps/core-app/src/main/modules/privacy/retention-policy.ts:50`）。
- 执行者是 `apps/core-app/src/main/modules/privacy/owners/clipboard-retention-owner.ts`，删除时跳过 `is_favorite = 1 OR retention_protected = 1`。
- `clipboard_history.retention_protected` 列 + 部分索引 `clipboard_history_retention_idx` 都已建好（`db/schema.ts:409`、`modules/database/index.ts:939`）。
- **但全仓库没有任何代码写过 `retention_protected`**，它恒为 0。地基修好了没接线。
- 现有策略是 **per-category** 的（整个 clipboard-history 一个 retentionMs），而本任务要的是 **per-item**（按内容类别）。
- `PRIVACY_RETENTION_PRESETS` 最小档是 `1-day`，**没有 1 小时**。

### `cr_` 前缀不能硬编码

sub2api 的 `default.api_key_prefix` 默认为 `sk-`，且是每个部署自行配置的值（[Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api)）。用户看到的 `cr_` 是某实例的自定义前缀，不是协议约定。硬编码它既会漏掉其它部署，也会误报正常内容。

## Requirements

### R1 单一分类器

- 新建共享分类器于 `packages/utils`，主进程与插件都从这里读，不再各留一张正则表。
- 分类结果必须区分两种命中：**整条内容就是密钥**，与**正文某一段是密钥**（带 span），后者是掩码漏洞的根因。
- 主进程的 `detectClipboardTags` 与插件的 `detectSecret` 改为共享实现的薄封装；两者产出必须来自同一次判定，不允许两张表并存。
- 合并后覆盖面取两者并集：现有 8 家服务前缀 + 私钥 + JWT + 连接串 + env 赋值 + 字段式（`api_key: xxx`）。

### R2 扩充识别

**验证码**（保守判定，误判代价是不可逆删除）：

- `G-123456` 这类带前缀的一次性码。
- 正文含验证码语义词（验证码 / 校验码 / 动态码 / verification code / security code / one-time / OTP）且含 4–8 位数字。
- 来源应用属于短信 / 邮件类（`com.apple.MobileSMS`、`com.apple.mail`、主流邮件客户端）且内容是 4–8 位数字。
- **裸的 4–8 位数字不算验证码**。订单号、金额、年月、PIN、门牌号都是这个形状，而误判后果是自动删除。用户已确认走这条保守线。

**未识别 API 密钥**：

- 形如 `<2–6 位字母><-|_><高熵体>` 且体长 ≥ 20、含大小写与数字混合的字符串，判为 `api_key`，服务名留空，UI 显示「API 密钥（未识别服务）」。
- 这条覆盖 `cr_`、以及任何自建网关的自定义前缀，且不假装知道是哪家。
- 用户可在设置里追加自定义前缀。

### R3 按类保留

- **密钥类**（API key / 私钥 / JWT / 连接串 / 密码）→ 写 `retention_protected = 1`，永不被自动清理。
- **验证码类** → 采集时写 per-item 过期时间，默认 1 小时。
- **其余** → 沿用现有 `clipboard-history` category 策略（默认 90 天），行为不变。
- 每一类的时长与开关都可配置；验证码这一档需要 `1-hour` 预设，现有 presets 最小是 `1-day`，要扩。
- 收藏（`is_favorite`）继续无条件豁免，优先级高于任何类别策略。

### R4 详情显示预计删除时间

- 「更多信息」增加一行，显示这条记录预计何时被删除，格式为相对 + 绝对：`2 天后（2026-09-08 20:31:00）`。
- 永不删除的显示「永不自动删除」并说明原因（密钥 / 已收藏）。
- 时间由主进程算好下发，不在插件侧重算——插件不知道当前生效的 policy。

## Acceptance Criteria

- [ ] AC1 `api_key: sk-xxxxxxxxxxxxxxxxxxxx` 这类嵌在句子里的密钥，在列表标题、预览区、更多信息里均被掩码；单测断言 DOM 不含原文。
- [ ] AC2 同一条内容送进主进程分类器和插件分类器，得到同一组密钥判定；测试用同一份样本表驱动两侧。
- [ ] AC3 私钥 / JWT / 连接串在主进程侧也被识别为密钥（此前只有插件认），并因此拿到 `retention_protected = 1`。
- [ ] AC4 `G-123456`、含"验证码"字样的短信文本、来自短信/邮件应用的 6 位数字，判为验证码；**裸的 `679839` 不判为验证码**，单测两个方向都断言。
- [ ] AC5 `cr_` 开头的高熵串被判为 `api_key` 且服务名为空；正常英文短语（如 `hello_world`）不被误判。
- [ ] AC6 采集一条 API key 后，该行 `retention_protected = 1`；采集一条验证码后，其 per-item 过期时间为采集时刻 + 1 小时。
- [ ] AC7 保留清理跑过之后，过期验证码被删除、API key 仍在、收藏项仍在、普通文本按 90 天策略处理。
- [ ] AC8 「更多信息」对普通文本显示 `N 天后（YYYY-MM-DD HH:mm:ss）`，对密钥显示「永不自动删除」。
- [ ] AC9 每类保留时长可在设置里改；改成 `permanent` 后验证码不再被自动删除。
- [ ] AC10 插件、`packages/utils`、`core-app` 三侧 test 与 typecheck 全绿。

## 非目标

- 不做密钥的加密落库。展示掩码与保留策略都不改变"明文存在 SQLite 里"这一事实，这是独立议题，应单独立项。
- 不改采集管线的截流 / 去重 / 图片持久化逻辑。
- 不引入云端或 AI 分类，全部本地正则与启发式。

## Notes

- 分类器合并会改变**主进程既有的 tag 产出**（新增私钥 / JWT / 连接串 / 验证码类）。tag 参与搜索（`getClipboardTagSearchTerms`），要确认不破坏既有搜索行为。
- 历史数据不回填：`retention_protected` 只对新采集生效，老记录仍走 category 策略。回填是一次全表扫描 + 分类，风险与收益都要单独评估。
