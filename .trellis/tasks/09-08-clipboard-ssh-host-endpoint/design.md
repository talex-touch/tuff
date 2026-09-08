# 设计：剪贴板识别 SSH 与主机端点

## D1 主要障碍：掩码和保留期今天是同一个开关

```ts
// content-classifier.ts:398
const retentionClass = secrets.length > 0 ? 'secret' : verificationCode ? 'verification-code' : 'ordinary'
```

```ts
// clipboard-capture-pipeline.ts:315
retentionProtected: settings.protectSecrets && retentionClass === 'secret'
```

`maskSecretSpans` 只接受 `ClipboardSecretHit[]`。于是「让主机 IP 被掩码」的唯一现成路径，同时也让含 IP 的记录**永不自动删除**。这不是 PRD 想要的：IP 不是凭据，一天复制几个 IP 就足以让历史只增不减（R4）。

### 决定：把「是否掩码」和「是否保护保留期」拆成两个轴

在 `content-classifier.ts` 里引入一个显式集合，保留期由 **kind** 决定，而不是由「有没有命中」决定：

```ts
/**
 * 命中这些 kind 才让记录免于自动清理。
 *
 * 掩码和保留期在此之前是同一个判断（`secrets.length > 0`），于是任何想被掩码的东西
 * 都会顺带变成永不删除。主机 IP 要掩码但不是凭据——它过期就该过期。
 */
const RETENTION_PROTECTING_KINDS: ReadonlySet<ClipboardSecretKind> = new Set([
  'api-key', 'private-key', 'jwt', 'connection-string', 'env', 'password-field', 'token-field',
])

const retentionClass =
  secrets.some(hit => RETENTION_PROTECTING_KINDS.has(hit.kind)) ? 'secret'
  : verificationCode ? 'verification-code'
  : 'ordinary'
```

新增的 `'host-ip'` 不进这个集合。集合把现有七个 kind 全部列进去，所以对既有行为是零改动——这一点要有测试钉住。

**被否决的方案**：在 `ClipboardSecretHit` 上加 `protectsRetention: boolean` 由各规则自己填。否决理由是它把同一个决定散进十几个规则定义里，改保留策略要逐个改；集合是一处声明，和仓库里 `CANCELLABLE_CAPABILITIES` 的写法一致。

### 命名的代价（明确记录）

把 `'host-ip'` 塞进 `ClipboardSecretKind`，类型名从此包含一个不是 secret 的成员。

考虑过重命名为 `ClipboardSensitiveKind` / `ClipboardSensitiveHit`，否决理由是它会波及 `ClipboardSecretInfo`、`detectSecret`、`readSecretPlainValue`、插件的 `secret` insight kind 以及全部相关测试，改动面远大于收益，且和本任务无关的调用方也要一起动。

折中：`ClipboardSecretKind` 上写注释说明它现在表达的是「要掩码的敏感片段」，`RETENTION_PROTECTING_KINDS` 是「其中真正算凭据的那些」。如果以后再出现第二个非凭据 kind，就该做那次重命名了。

## D2 SSH 端点的数据形状

端点信息需要拆成字段（R2），而 `ClipboardSecretHit` 是「一段区间 + 一个 kind」，装不下结构化字段。所以另开一个产物，与 `verificationCode` 平级：

```ts
export interface ClipboardSshEndpoint {
  user: string | null
  host: string
  /** 主机是不是 IP 字面量。掩码只作用于 IP，域名不掩码。 */
  hostIsIp: boolean
  port: number | null
  start: number
  end: number
}

export interface ClipboardSshPublicKey {
  algorithm: string       // ssh-ed25519 / ssh-rsa / ecdsa-sha2-nistp256 …
  comment: string | null
  start: number
  end: number
}

export interface ClipboardClassification {
  tags: ClipboardTag[]
  secrets: ClipboardSecretHit[]
  verificationCode: ClipboardVerificationCode | null
  sshEndpoint: ClipboardSshEndpoint | null       // 新增
  sshPublicKey: ClipboardSshPublicKey | null     // 新增
  retentionClass: ClipboardRetentionClass
}
```

`hostIsIp` 单独存，是因为掩码只针对 IP：`ssh deploy@build.example.com` 里的域名掩码没有意义，掩了反而看不出连的是哪台。

IP 的掩码通过**同时**产生一个 `kind: 'host-ip'` 的 `ClipboardSecretHit` 实现，这样 `maskSecretSpans` 不需要改签名，插件侧的揭示交互也自动复用。

## D3 判定规则

### IPv4 与版本号的歧义（R6）

`1.2.3.4` 既是合法 IPv4，也是四段版本号。没有上下文时无法区分，所以取**有立场的规则**：

| 形态 | 判定 | 理由 |
|---|---|---|
| 私有 / 保留段（`10.`、`172.16-31.`、`192.168.`、`127.`、`169.254.`） | 直接认作主机 | 版本号落在这些段是巧合，主机落在这些段是常态 |
| 其它公网 IPv4 | 需要上下文：`user@` 前缀、`:port` 后缀、`ssh`/`scp`/`sftp`/`rsync` 命令上下文，或整条内容就是它 | 单独出现在一段散文里的 `1.2.3.4` 更可能是版本号 |
| 任一段 > 255 | 不是 IP | |

「整条内容就是它」这一条是刻意放进去的：用户单独复制一个公网 IP 是常见操作，而那种场景下不存在散文歧义。

### 端口（R5）

只在有分隔符定位时成立：`host:port`、`-p port` / `-P port`、ssh_config 的 `Port <n>`。范围 1–65535。

**裸数字永不产生端口。** 与验证码规则同一条纪律：`content-classifier.ts` 已经因为「六位裸数字不算验证码」写过这个立场，端口不能反过来破坏它。特别地，`123456` 必须仍然只能是验证码候选，不能变成端口。

### SSH 公钥

```
(ssh-rsa|ssh-dss|ssh-ed25519|ecdsa-sha2-nistp(256|384|521))\s+[A-Za-z0-9+/]{32,}={0,3}(\s+\S+)?
```

base64 至少 32 字符，避免把 `ssh-rsa` 这个词本身或一段散文认成公钥。公钥**不产生** `ClipboardSecretHit`——它不掩码（R3）。

### 文件路径（R7 的 files 分支）

`files` 类记录在 `classifyClipboardContent` 里当前直接返回 `EMPTY_CLASSIFICATION`（`content-classifier.ts:379` 只处理 `type === 'text'`）。所以 SSH 文件识别不能走分类器，要放在插件侧按路径判断，与现有的文件树渲染同一层。判据：路径含 `/.ssh/` 段，或 basename 属于 `id_rsa` / `id_dsa` / `id_ecdsa` / `id_ed25519`（含 `.pub`）/ `known_hosts` / `authorized_keys` / `config`（仅当位于 `.ssh` 下）。

## D4 扫描顺序

`collectServiceHits` → `collectStructuralHits` → `collectUnknownKeyHits` 的顺序是既有契约：`pushHit` 丢弃与已有命中重叠的区间，所以认得出服务名的规则必须先扫（`content-classifier.ts:387` 的注释）。

`host-ip` 的命中**排在最后**。理由：连接串（`postgres://user:pass@10.0.0.1:5432/db`）里的 IP 应当由 `connection-string` 整段吃掉并按凭据处理，而不是被拆出一个 `host-ip` 让整串反而不受保护。把 IP 放最后，重叠丢弃机制自动给出正确结果——这一点要有测试。

## D5 设置（实现时更正了归属）

原计划：`ClipboardClassificationSettings` 加 `maskHostIp`。**这条行不通**——那份配置在主进程，
而插件只有 `usePluginStorage`，没有读取宿主应用设置的通道。

更正后：开关住在插件存储里，`usePersistedFlag('maskHostIp', true)`。这不是将就，而是本来就该在那儿：
被开关的掩码行为只发生在插件侧（主进程不掩码自己的 CoreBox 预览），把开关放到主进程等于让
决定它的一方读不到它。

分类器**始终**产出 `host-ip` 命中；开关只决定插件侧是否套用掩码。所以关掉掩码不影响识别与拆行（AC8）。

另外把 `useDisclosureState` 泛化成 `usePersistedFlag(key, fallback)`，`useDisclosureState` 保留为
语义别名——那个 helper 本来就是「持久化布尔 + 优雅降级」，只是名字写成了折叠态专用。

## D6 展示

- 列表：新增 `ClipboardShape` 成员 `ssh`，走既有的图标 + 分类 chip 通道。
- 详情：新增 insight kind `ssh`，沿用 `.kv-row` 版式，行为 用户 / 主机 / 端口 / 密钥类型 / 注释。IP 那一行带「显示」切换，复用密钥的 `revealSecret` 机制。
- 优先级：`selectClipboardInsight` 里 `secret` 仍在最前——一条同时含私钥和主机的内容，先说它有私钥。`ssh` 插在 `command` 之前，否则 `ssh user@host` 会被命令分支先吃掉。

## 兼容性

- 分类结果新增两个字段，都是可选/可空，旧记录读出来是 `null`。
- 不改数据库 schema。SSH 信息每次从内容现算，和 `tags` 一样，不落库。
- `RETENTION_PROTECTING_KINDS` 列全现有七个 kind，既有记录的保留期行为不变。

## 回滚

改动集中在分类器和插件展示层，无迁移、无 schema 变更，单个 revert 即可回到当前行为。
