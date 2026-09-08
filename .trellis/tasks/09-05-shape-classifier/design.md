# C2 技术设计 · 内容形态分类器与洞察路由

## 1. 边界

| 文件 | 改动 |
| --- | --- |
| `src/utils/clipboard-shapes.ts` | **新增**：分类器、凭据/命令模式表、洞察选择器 |
| `src/utils/clipboard-shapes.test.ts` | **新增**：模式表逐条覆盖 + 负控制 |
| `src/components/ClipboardInsight.vue` | **新增**：承载全部洞察分支，只渲染路由选中的那一个 |
| `src/components/ClipboardDetail.vue` | 洞察区三块（拆词/颜色/OCR）迁出，改挂 `<ClipboardInsight>` |
| `src/views/ClipboardManagerView.vue` | 分类条 5 项通电；列表按分类过滤 |

`ClipboardDetail.vue` 现在 857 行，把洞察全部塞进去会到 1400+。拆出 `ClipboardInsight.vue`
是这次唯一的结构性决定：详情面板负责版式与元信息，洞察面板负责内容形态。

## 2. 分类器

```ts
export type ClipboardShape =
  | 'text' | 'link' | 'image' | 'video' | 'files' | 'color' | 'command' | 'secret' | 'favorite'

export function classifyClipboardItem(item: PluginClipboardItem): ClipboardShape[]
```

一条内容可命中多个形态（带 token 的 URL 同时是 `link` 和 `secret`），分类条按**包含**筛选。

### 凭据识别（前缀表，硬编码）

```ts
interface SecretPattern { service: string; test: RegExp; prefix?: string }
```

| service | 正则要点 |
| --- | --- |
| GitHub | `^gh[pousr]_[A-Za-z0-9]{36}$` |
| GitHub | `^github_pat_[A-Za-z0-9_]{22,}$` |
| npm | `^npm_[A-Za-z0-9]{36}$` |
| OpenAI | `^sk-(proj-)?[A-Za-z0-9_-]{20,}$` |
| Anthropic | `^sk-ant-[A-Za-z0-9_-]{20,}$` |
| AWS | `^AKIA[0-9A-Z]{16}$` |
| Stripe | `^(sk\|pk\|rk)_(live\|test)_[A-Za-z0-9]{20,}$`，`live` 置 `critical` |
| Slack | `^xox[baprs]-[A-Za-z0-9-]{10,}$` |
| Google | `^AIza[0-9A-Za-z_-]{35}$` |
| JWT | 三段 Base64URL，解 header/payload，读 `exp` |
| SSH 私钥 | `-----BEGIN [A-Z ]*PRIVATE KEY-----`，**只出类型与长度，正文永不进 DOM** |
| 连接串 | `^(postgres\|postgresql\|mysql\|mongodb(\+srv)?\|redis)://` |
| 环境变量 | `^[A-Z][A-Z0-9_]*=` 且键名含 `SECRET\|TOKEN\|KEY\|PASSWORD\|PASSWD\|CREDENTIAL` |

**负控制是这套东西的成败**：任何未命中前缀表的高熵字符串都不能归 `secret`，否则满屏假密钥。
测试里要放一条 40 位随机 Base62 断言它**不是** secret。

### 命令识别

已知可执行名白名单 + 结构特征（管道 / 重定向 / `&&`）。危险模式单列：

```ts
const DANGEROUS = [/\brm\s+-[a-z]*[rf]/, /\bsudo\b/, /\bchmod\s+777/, /\|\s*(sh|bash|zsh)\b/,
                   /\bdd\s+if=/, /\bmkfs\b/, /:\(\)\s*\{.*\|.*&.*\}\s*;?\s*:/]
```

### 其余

`link` 用 URL 正则；`color` 复用 `getClipboardColorTokens`；`video` 看 files 扩展名；
`favorite` 看 `isFavorite`。

## 3. 洞察路由（择一）

```ts
export type ClipboardInsightKind =
  | 'ocr' | 'link' | 'secret' | 'command' | 'color' | 'chars' | 'words' | 'none'

export function selectClipboardInsight(item): ClipboardInsightKind
```

优先级：**密钥 > 命令 > 链接 > 颜色 > 短文本 > 长文本**，图片走 `ocr`，文件 `none`。

> PRD 里的顺序是「图片→OCR」在最前；实现上图片本来就不会命中密钥/命令，所以先判
> `type === 'image'` 再走文本链，结果等价且少一层判断。

`chars` 的条件：单行、去空白后 ≤32 字符、无空格。这是验证码/编号场景。

## 4. 单链接 vs 多链接

`extractLinks(content): string[]`。

- **1 条**：`打开 · <主机名>` 主行 + 参数行（仅当有敏感参数）。协议/路径不出现在洞察区。
- **≥2 条**：编号选择器，`↑↓` 选择、`⏎` 访问。

敏感参数：键名命中 `token|key|secret|password|access_token|api_key` → 值掩码，眼睛切换明文，
`⌥⏎` 复制去参链接。

**第一版设计对单链接也铺了 3 行选择器 + 参数行，等于把预览里的内容又拆一遍，已推翻。**

## 5. 统计信息归属

`拆词` 分区标题右侧原本显示 `84 字符 · 12 词 · 1 行`，与 C1 的摘要条重复。
字符数/行数归摘要条，洞察区标题右侧只留操作提示。

## 6. 打开链接与运行命令

- 打开链接：`system` SDK 没有 openExternal；用 `window.open(url, '_blank')`，由宿主拦截。
  **实现前先确认插件 webview 是否放行**，不确定就先只做「复制链接」并在 UI 上标注。
- 在终端运行：本任务**不实现**，只渲染按钮与危险确认态，`emit('runCommand')` 留给后续。
  真要跑命令需要主进程能力，和 C5 同级别的安全评审，不塞进本任务。

## 7. 风险

| 风险 | 处理 |
| --- | --- |
| 高熵字符串误报为密钥 | 只认前缀表；负控制测试 |
| SSH 私钥正文泄漏到 DOM | 分类器只返回类型与长度，正文不进 props；用快照断言 |
| JWT 解码失败 | `try/catch`，失败降级为普通 secret 卡 |
| 分类条筛选与查询不一致 | 派生分类在客户端过滤已加载项；**分页语义会不准**，先在 UI 上标注「已加载 N 条中匹配 M 条」 |
