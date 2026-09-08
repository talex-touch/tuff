# 剪贴板识别 SSH 与主机端点

## Goal

复制一段 `ssh deploy@10.0.3.14 -p 2222`、一个 `ssh-ed25519 AAAA…` 公钥、或者一条 `~/.ssh/config` 路径，剪贴板历史现在只当它是「一段文本」。列表里没有可辨认的形态，详情区把它当命令或者纯文本渲染，主机、端口、用户这些真正要单独复制的字段全都得手工从整行里选。

本任务让这些内容被认出来，并且拆成可单独复制的字段；同时把主机 IP 当作敏感信息默认掩码。

## 背景事实（已核对源码）

- 唯一的判定实现是 `packages/utils/clipboard/content-classifier.ts`，主进程采集和插件展示都走它。
- **SSH 私钥已经覆盖**：`PRIVATE_KEY_PATTERN`（`content-classifier.ts:131`）匹配 `-----BEGIN [A-Z ]*PRIVATE KEY-----`，`OPENSSH` 落在这个字符类里，所以 OpenSSH 格式私钥当前就走 `private-key`、掩码、永不自动删除。本任务不改这条。
- **完全不存在的**：IP、端口、`user@host`、SSH 公钥、`~/.ssh/` 文件的任何识别。`ClipboardShape`（`clipboard-shapes.ts:16`）和 `ClipboardTag`（`content-classifier.ts:13`）里都没有对应项。
- `ssh` 只出现在 `detectCommand` 的命令名单里（`clipboard-shapes.ts:77`），效果是整条按「命令」渲染，不拆字段。
- **掩码和保留期是同一个开关**：`retentionClass = secrets.length > 0 ? 'secret' : …`（`content-classifier.ts:398`），而 `clipboard-capture-pipeline.ts:315` 用 `retentionProtected: settings.protectSecrets && retentionClass === 'secret'`。`maskSecretSpans` 只认 `ClipboardSecretHit`，所以**今天想让一段内容被掩码，就只能让它同时永不自动删除**。这是本任务最主要的结构障碍，见 design.md。
- `ClipboardSecretHit.critical` 是展示用的严重度（「高危」徽章、danger 配色，`ClipboardInsight.vue:164`），不参与保留期决策。
- 掩码只发生在插件侧（`clipboard-shapes.ts:159`）。主进程不掩码自己的 CoreBox 预览——这是所有密钥今天的既有行为，本任务不改。
- 可配置项现在只有三个：`verificationCodeRetentionMs` / `protectSecrets` / `customKeyPrefixes`（`clipboard-classification-settings.ts:1`）。
- 验证码规则里已有一条明确纪律：没有短信 / 邮件来源的裸数字串一律不算验证码（`MESSAGING_APP_IDS`）。端口识别必须遵守同一条纪律。

## Requirements

### R1 识别 SSH 与主机端点

认出并归类以下形态：

- `user@host`、`host:port`、`ssh user@host -p port`
- IPv4 地址；IPv6 仅限带方括号的端点形式（`[::1]:22`）
- SSH 公钥：`ssh-rsa` / `ssh-ed25519` / `ssh-dss` / `ecdsa-sha2-nistp{256,384,521}` + base64 +（可选）注释
- `files` 类记录里的 SSH 相关路径：`~/.ssh/` 下任意文件、`id_rsa` / `id_ed25519` / `known_hosts` / `authorized_keys`

### R2 详情区拆成可单独复制的行

用户 / 主机 / 端口 / 密钥类型 / 指纹各占一行，点击复制该字段本身，而不是整条内容。沿用现有 `.kv-row` 版式。

### R3 主机 IP 默认掩码

- IP 默认以掩码形式显示，可点「显示」展开，与密钥的揭示交互一致。
- **复制写入的仍是完整值**，与现有密钥行为一致。
- 公钥**不掩码**。它按定义就是公开的，掩码只制造摩擦、不提供任何保护。

### R4 掩码不得改变保留期

被掩码的主机 IP **不能**因此变成「永不自动删除」。IP 不是凭据，让每一条含 IP 的记录永久留存会让历史只增不减。

### R5 端口不得由裸数字推断

`8080` 与验证码在字面上无法区分。端口只在有分隔符定位时才成立（`:8080`、`-p 22`、ssh_config 里的 `Port 22`）。

### R6 IP 不得与版本号混淆

`1.2.3.4` 既是合法 IPv4 也是四段版本号。判定规则必须对这种歧义有明确立场，见 design.md 的 D3。

### R7 可配置

主机 IP 掩码可开关，默认开。

**规划时写错了归属**，实现时更正：原计划走主进程的 `ClipboardClassificationSettings`，
但插件读不到那份配置——它只有 `usePluginStorage`（自己的隔离存储），没有读取宿主应用设置的通道。
而掩码这个行为本身**只发生在插件侧**（主进程不掩码自己的 CoreBox 预览，所有密钥今天都如此），
所以开关的正确归属就是插件存储。落点：`usePersistedFlag('maskHostIp', true)`。

## Acceptance Criteria

- [x] AC1 `ssh deploy@10.0.3.14 -p 2222` 被识别为 SSH 端点；详情区出现 用户 / 主机 / 端口 三行，各自点击只复制该字段。（`ClipboardInsight.ssh.test.ts`）
- [x] AC2 `ssh-ed25519 AAAAC3Nza… user@laptop` 被识别为 SSH 公钥；密钥类型和注释分行显示；**不掩码**。
- [x] AC3 主机 IP 默认掩码，点「显示」展开；复制得到的是完整 IP 而非掩码文本。
- [x] AC4 含 IP 的普通记录 `retentionProtected` 为 `false`；含 SSH 私钥的记录仍为 `true`。负控制已做：把 `host-ip` 接回 `RETENTION_PROTECTING_KINDS`，恰好这一条红（`clipboard-capture-pipeline.test.ts`）。
- [x] AC5 裸 `8080` / `123456` 不产生端口；`localhost:8080` 与 `-p 8080` 产生端口。
- [x] AC6 IPv4 与版本号的歧义正反两向各有用例；另补了实现时才发现的第三向：邮箱与 `user@host` 同形。
- [x] AC7 `files` 记录里的 `~/.ssh/id_ed25519` 被标为 SSH 相关。
- [x] AC8 关掉掩码后 IP 明文显示，识别与拆行不受影响。（把开关改成 prop 才测得到——组件内部读插件存储的话，外部没有任何手段翻转它。）
- [x] AC9 utils 1575 / core-app clipboard 154 / 插件 160 全绿，`tsc`、`vue-tsc`、三处包内 lint 干净。
- [x] AC10 累计 29 处注入验证，每处只打红声称覆盖它的那条用例。

### 未验证（纯 CSS，jsdom 无布局引擎）

- `.kv-tag.reveal` 的 hover 态与光标样式。
- SSH 分区在窄详情区里的换行表现——`kv-row` 是既有版式，但主机行多了一个按钮。

需在真实窗口人工确认。

### 规划时没预见、实现时才暴露的三处

1. **邮箱与 `user@host` 同形**——`someone@example.com` 被判成了主机。是**既有的 email 标签测试**抓出来的，不是新写的用例。
2. **掩码不能挂在 `detectSecret` 上**——那个函数回答的是「这是不是一条密钥记录」，一条纯 IP 的记录会因为「不是密钥」而完全不掩码。拆出了 `getClipboardMaskedContent`。
3. **Vue 把缺省的 Boolean prop 铸成 `false`**——`maskHostIp` 的默认值失效，不传 prop 等于关掉掩码。只有把开关做成 prop 才暴露得出来。

## 非目标

- 不实现任何 SSH 连接、终端接入或远程执行能力。仓库里现在没有这类功能，本任务也不引入。
- 不改 `PRIVATE_KEY_PATTERN` 与私钥的既有处理。
- 不把掩码推进主进程的 CoreBox 预览——那是所有密钥今天共同的边界，要改应当单独立项。
- 不做主机的连通性探测、反查或任何网络请求。
