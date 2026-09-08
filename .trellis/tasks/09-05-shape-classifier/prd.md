# C2 · 内容形态分类器与洞察路由

父任务：`09-05-clipboard-history-detail-relayout`。设计稿：pen 画板 `cdOpX`（链接洞察）、SPEC 面板「洞察择一 · 优先级」「分类从哪来」两节。

## Goal

用户原话：「这个拆词明显不合理吧」——一条 URL 被拆成 `dsh / web / https / com` 和 81 个字符格。

根因是当前 `ClipboardDetail.vue` 对**所有** `type === 'text'` 无差别渲染拆词 + 字符网格。本任务引入内容形态分类器，让分类条和洞察区都由同一个判定驱动。

## 依赖与顺序

无前置依赖，可与 C1 并行。**C3 依赖本任务**产出的 `color` 形态判定。分类条的 UI 壳由 C1 提供，本任务只交付判定函数与洞察组件；两边在 C1 合入后接线。

## 不引入新数据源

分类全部从现有字段派生：

| 形态 | 判定依据 | 现有出处 |
| --- | --- | --- |
| `text` / `image` / `files` | `item.type` | `PluginClipboardItem` |
| `link` | `meta.tags` 含 `url`，或内容匹配 URL 正则 | `CLIPBOARD_TAG_LABELS` 已含 `url` |
| `secret` | `meta.tags` 含 `api_key` / `token` / `password`，**或命中下表的前缀/正则** | 同上，已覆盖 14 种标签 |
| `command` | 以已知可执行名开头，或含管道 / 重定向 / `&&` | 新增，纯字符串判定 |
| `color` | `getClipboardColorTokens(item).length > 0` | `clipboard-items.ts:574` |
| `video` | `type === 'files'` 且扩展名 ∈ {mp4, mov, mkv, webm, avi, m4v} | `parseFileList` |
| `favorite` | `item.isFavorite` | 同上 |

### 识别模式清单（设计稿 M3 `te0Bm`）

**凭据前缀**——这些是必须硬编码进分类器的：

| 服务 | 特征 | 洞察补充 |
| --- | --- | --- |
| GitHub PAT（经典） | `ghp_` / `gho_` / `ghu_` / `ghs_` / `ghr_` + 36 位 | 服务 = GitHub |
| GitHub PAT（细粒度） | `github_pat_` 开头 | 额外标注「仓库范围未知」 |
| npm | `npm_` + 36 位 | 服务 = npm |
| OpenAI | `sk-` / `sk-proj-` | 服务 = OpenAI |
| Anthropic | `sk-ant-` | 服务 = Anthropic |
| AWS | `AKIA` + 16 位大写 | 提示配对的 Secret 可能也在历史里 |
| Stripe | `sk_live_` / `pk_live_` / `rk_live_` | **`live` 前缀额外红标** |
| Slack | `xoxb-` / `xoxp-` / `xoxa-` / `xoxr-` | 服务 = Slack |
| Google API | `AIza` + 35 位 | 服务 = Google |
| JWT | 三段 Base64URL 以 `.` 分隔 | 解码 header/payload（**不校验签名**），标注 `exp` 是否过期 |
| SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----` | **只显示类型与指纹，绝不显示内容** |
| 数据库连接串 | `postgres://` `mysql://` `mongodb+srv://` `redis://` | 拆 host/port/db，密码掩码 |
| 环境变量赋值 | 单行 `KEY=value` | KEY 命中 `SECRET`/`TOKEN`/`KEY`/`PASSWORD` 时归 `secret` |

**命令**：

| 类别 | 特征 | 洞察补充 |
| --- | --- | --- |
| Shell | 以已知可执行名开头，或含管道 / 重定向 / `&&` | 拆 程序 + 参数 + 管道 |
| Git | `git` 开头 | 识别分支 / 远端 / 是否含 `--force` |
| 包管理 | `pnpm` `npm` `yarn` `bun` `brew` `pip` `cargo` `go` | 识别 `install` / `add` 的包名 |
| curl / wget | 含 `-H Authorization` / `-u user:pass` | **请求头里的凭据掩码并打「含凭据」** |
| **危险命令** | `rm -rf` / `sudo` / `chmod 777` / `curl…\|sh` / `dd if=` / `mkfs` / fork bomb | **高危红标，「在终端运行」需二次确认** |

**短文本与其他**：

| 模式 | 特征 | 洞察 |
| --- | --- | --- |
| 验证码 | 4–8 位纯数字、单行无空格；来源是 IM / 邮件时提高置信度 | 字符网格 + 一键复制 |
| 时间戳 | 10 或 13 位数字 | 附「转本地时间」与「转 ISO 8601」 |
| 手机号 / 邮箱 / 身份证 | 正则 | 打标签 +「脱敏复制」 |
| IP / MAC / 域名 | 正则 | 打标签 |

### 判定顺序

**密钥 > 命令 > 链接 > 颜色 > 短文本 > 长文本。** 一条内容可带多个分类标签（分类条按「包含」筛选），但**洞察区只渲染优先级最高的那一个**。

## Requirements

### R1 `classifyClipboardItem(item): ClipboardShape[]`

一条记录可同时属于多个分类（一条带 token 的 URL 既是 `link` 也是 `secret`），分类条按「包含」筛选。

### R2 洞察择一（优先级，**只渲染第一个命中的**）

1. `image` → OCR（状态 / 语种 / 置信度 + 全文 + 关键词）
2. `link` → **链接结构**。按链接条数分两种形态，**不要一律用选择器**：
   - **1 条链接（绝大多数情况）**：只给两行 —— `打开 · <主机名>`（主操作，回车即访问）+ `参数 · <敏感参数掩码>`（仅当存在敏感参数时）。协议 / 路径这类细节下沉到「更多信息」。设计稿 S1 `cdOpX`。
   - **≥2 条链接**：才出编号选择器，`↑↓ 选择 · ⏎ 访问`，每行一个 `↗`。设计稿 F9 `JKoHp`。

   > 第一版设计对单链接也铺了 3 行选择器 + 参数行，等于把预览里的内容又拆了一遍 —— 正是本次重排要消灭的复述。已推翻。

   参数名命中 `token` / `key` / `secret` / `password` 时值默认掩码并打「敏感」标，配眼睛图标切换明文；`⌥⏎` 复制去掉敏感参数的干净链接。
3. `secret`（非链接） → 密钥卡：掩码值、长度、**识别出的服务**（见上表）、前缀、一键复制。设计稿 F1 `JpRtk`。
4. `command` → **命令卡**：拆 `程序` / `参数` / `管道`；命中危险模式时给红色「风险」行 + 高危标；`⏎ 在终端运行`（危险命令需二次确认）、`⌥⏎ 复制`。设计稿 F10 `Mc4W1`。
5. `color` → 色卡（交给 C3）
6. 短文本（单行、≤32 字符、无空格） → **字符网格**。这才是拆字真正的场景：验证码、编号、单个词。设计稿 F2 `R3fPs`。
7. 其余文本 → 词频 Top N + 字符 / 词 / 行统计。设计稿 F3 `bh2Lm`。
8. `files` → 不给洞察，预览区的文件树本身就是内容

### R3 统计信息去重

`拆词` 分区标题右侧当前显示 `84 字符 · 12 词 · 1 行`，与摘要条重复。字符数 / 行数归摘要条（C1），分区标题右侧改为操作提示（`点击任意项复制` / `点击任意段复制`）。

### R4 字符网格降级

即使命中规则 5，字符网格默认最多 3 行（`max-height:80px`），其余折叠——由 C4 的「更多信息」承接完整网格。

## Acceptance Criteria

- [ ] 选中 `dsh web: https://dsh.tagzxia.com/?token=...`：洞察区渲染链接结构，**不渲染字符网格**；只有一条链接时**不出选择器**，只给「打开 + 参数」两行；`token` 参数默认掩码。
- [ ] 构造一条含 3 个 URL 的文本：洞察区出现编号选择器，`↑↓` 可切换，`⏎` 打开选中项。
- [ ] 选中 `679839`（6 位数字）：洞察区渲染字符网格。
- [ ] 逐个粘贴上表每一种凭据前缀（gh / npm / OpenAI / Anthropic / AWS / Stripe / Slack / Google / JWT），都能识别出对应服务名；**未命中任何前缀的高熵字符串不得误报为密钥**（负控制）。
- [ ] 粘贴 `curl -H "Authorization: Bearer sk-ant-xxx" https://api.anthropic.com/...`：归入「命令」分类，请求头凭据掩码，打「含凭据」标。
- [ ] 粘贴 `rm -rf ~/Downloads`：命中危险命令，红标 + 二次确认才允许「在终端运行」。
- [ ] 粘贴 SSH 私钥：只显示类型与指纹，**私钥正文不出现在任何 DOM 节点里**（用快照断言，不是肉眼看）。
- [ ] 分类条 10 项（含「命令」）在 720 宽下不横向滚动。
- [ ] 选中一段多行中文长文本：洞察区渲染词频 + 统计，不渲染字符网格。
- [ ] 选中一条 `.mp4` 文件记录：出现在「视频」分类下。
- [ ] 洞察区在任一时刻只渲染一个分区（不叠加）。
- [ ] `clipboard-items.test.ts` 新增分类器用例，覆盖上述 6 条路由 + 一条同时命中 `link` 与 `secret` 的输入。
- [ ] 现有 `getClipboardTextInsight` 的既有断言（`clipboard-items.test.ts:172` `wordTokens` 含 `Tuff`）继续通过。
