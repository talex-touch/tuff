# Design — 剪贴板内容分类统一与按类保留策略

## 分层

```
packages/utils/clipboard/content-classifier.ts   ← 新建，唯一的判定实现
        ├── apps/core-app/src/main/modules/clipboard-tagging.ts   （改成薄封装）
        │       └── 采集管线 → meta.tags + retention 字段
        └── plugins/clipboard-history/src/utils/clipboard-shapes.ts （改成薄封装）
                └── 掩码 + 洞察区
```

放 `packages/utils/clipboard/` 而不是塞进现有 `core-box/` 或 `plugin/`：主进程和插件都要 import，而这两个目录各自带着不该被另一侧拖进来的依赖。

## D1 分类结果的形状

关键决定：**带 span**。掩码漏洞的根因是插件只会判"整条是不是密钥"，所以正文里嵌的 key 掩不掉。

```ts
export interface ClipboardSecretHit {
  kind: 'api-key' | 'private-key' | 'jwt' | 'connection-string' | 'env' | 'password-field' | 'token-field'
  /** 已知服务名；自建网关这类未识别来源为 null。 */
  service: string | null
  /** 命中在 content 里的位置，掩码按这个区间替换。 */
  start: number
  end: number
  critical: boolean
}

export interface ClipboardClassification {
  tags: ClipboardTag[]
  secrets: ClipboardSecretHit[]
  verificationCode: { value: string; source: 'prefixed' | 'keyword' | 'messaging-app' } | null
  /** 保留档位，主进程据此写 DB。 */
  retentionClass: 'secret' | 'verification-code' | 'ordinary'
}

export function classifyClipboardContent(input: {
  type: 'text' | 'image' | 'files'
  content: string
  rawContent?: string | null
  sourceApp?: string | null
  customKeyPrefixes?: readonly string[]
}): ClipboardClassification
```

`sourceApp` 是新增输入 —— 验证码的第三条判据要它。主进程本来就有；插件侧 item 上也有 `sourceApp`，两边都喂得进去。

掩码由 span 驱动：`maskSecretSpans(content, secrets)` 逐段替换，不再区分"整条"与"嵌入"。整条命中只是 `start === 0 && end === content.length` 的特例。

## D2 验证码判定

三条判据，任一命中即可，都要求**先排除密钥**（`sk-123456` 不是验证码）：

1. **带前缀**：`/(?:^|\s)([A-Z]{1,3})-(\d{4,8})(?:\s|$)/` —— `G-123456` 这类。
2. **语义词**：正文含 `验证码|校验码|动态码|verification code|security code|one-time|OTP` 且存在 4–8 位数字，取第一个数字串。
3. **来源应用**：`sourceApp` 属于短信 / 邮件白名单，且整条内容是 4–8 位数字。

第 3 条的白名单先给 macOS 的 `com.apple.MobileSMS` / `com.apple.mail` / `com.apple.iChat` 与常见邮件客户端；不认识的 bundle id 一律不算。宁可漏判（保留 90 天）也不误判（1 小时后删掉别人的订单号）。

**裸数字不判。** 这是用户明确确认过的取舍，写在这里以免后人"优化"掉。

## D3 未识别 API 密钥

```
/(?:^|[\s"'`])([a-z]{2,6}[-_])([A-Za-z0-9_-]{20,})(?![\w-])/
```

再叠一层熵检查，避免把 `my_documentation_folder` 这种判成密钥：

- 体部必须同时含大小写字母与数字；
- 体部不得是纯词典式下划线分词（连续 `[a-z]+_[a-z]+` 结构直接否决）。

命中 → `kind: 'api-key'`，`service: null`。UI 显示「API 密钥（未识别服务）」。

`customKeyPrefixes` 由设置注入，命中时同样走这条，不额外造类型。

## D4 保留策略落地

现有 per-category 策略保留不动，在它之上叠一层 per-item：

| 档 | 落库 | 清理时行为 |
|---|---|---|
| `secret` | `retention_protected = 1` | 现有 owner 已经跳过它（`COALESCE(retention_protected,0)=0`），**零改动生效** |
| `verification-code` | 新列 `retention_expires_at`（timestamp，可空） | 新增一条早于 category 扫描的删除：`retention_expires_at < now` |
| `ordinary` | 两列都不写 | 走现有 category 策略 |

`retention_protected` 这条是本设计里最省的一段：列、索引、清理侧的豁免条件**全都已经存在**，缺的只是采集时把它写成 1。

`retention_expires_at` 需要一次 schema 迁移，跟 `retention_protected`（0008）同样的 `ALTER TABLE … ADD COLUMN` + `pragma_table_info` 幂等检查模式，照抄 `modules/database/index.ts:935` 那一段。

presets 要加 `1-hour`：`PRIVACY_RETENTION_PRESETS` 与 `PERIOD_MS` 同步加，`APPROVED_RETENTION_VALUES` 自动跟随（它是从 `PERIOD_MS` 的值算出来的）。

## D5 预计删除时间

插件不知道当前 policy，所以由主进程算好下发，随 `getHistory` 的每条记录带回：

```ts
/** null = 永不自动删除。 */
expiresAt: number | null
/** 为什么永不删：给 UI 写出「已收藏」还是「密钥」。 */
retentionReason: 'favorite' | 'protected' | 'policy' | null
```

计算顺序与清理侧必须一致，否则界面会承诺一个不会发生的删除：

1. `is_favorite` → null / `favorite`
2. `retention_protected` → null / `protected`
3. `retention_expires_at` 有值 → 该值 / `policy`
4. 否则 category 策略：`enabled && retentionMs !== null` ? `timestamp + retentionMs` : null

第 4 步读的是**当前生效的 policy**，用户改设置后所有记录的显示都会跟着变——这是对的，因为清理时读的也是当前 policy。

UI 侧格式化（`N 天后（YYYY-MM-DD HH:mm:ss）`）放插件，纯展示。

## D6 兼容与回滚

- 主进程 tag 产出会新增 `private_key` / `jwt` / `connection_string` / `verification_code`。`getClipboardTagSearchTerms` 把 tag 本身当搜索词，所以新增 tag 只会新增可搜词，不会改变既有查询结果。
- `CLIPBOARD_TAG_LABELS`（插件侧中文标签表）要同步补，否则新 tag 会以原始英文 id 露出来。
- 历史数据不回填，`retention_protected` 只对新采集生效。老记录仍走 90 天 —— 这意味着**库里已有的密钥仍会在 90 天后被删**。这是已知缺口，回填单独评估（一次全表扫描 + 分类，对大库有成本）。
- 回滚：分类器合并与保留接线是两个独立提交，后者回滚不影响前者。

## 风险

1. **合并分类器会改变既有 tag 产出**，而 tag 参与搜索与 UI 标签。用同一份样本表对齐新旧两侧输出，差异必须逐条解释，不能"看起来更好"就放行。
2. **验证码误判 = 不可逆删除**。三条判据都要有负控制用例（正常的 6 位数字、含"验证"二字但不是验证码的句子、来源应用不在白名单）。
3. **`retention_expires_at` 迁移**必须幂等且可在旧库上跑；照抄既有 0008 迁移的形状，不自创。
4. 我在上一轮汇报里断言过"剪贴板没有自动过期策略"，实际是有的（只 grep 了 clipboard 模块，漏了 privacy 模块）。本设计已按真实情况重写；后续任何"现状如何"的断言都要在 privacy 模块里也查一遍。
