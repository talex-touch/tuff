# Design — Semantic alias catalog locale refactor

单文件重构:`apps/core-app/src/main/modules/box-tool/addon/apps/app-semantic-catalog.ts`(+ 其
就地测试)。行号为 2026-08-06 快照。

## 1. 数据结构

```ts
/** 新语言 = 此联合加一个成员 + LOCALE_ALIAS_EXPANSIONS 加一条规则 + 各组按需加 key。 */
type SemanticAliasLocale = 'en' | 'zh'

type LocalizedAliasGroup = Partial<Record<SemanticAliasLocale, readonly string[]>>

/** 编译:逐语言跑派生规则 → 拍平 → normalizeStringList 去重,产物仍是 readonly string[]。 */
function compileAliasGroup(group: LocalizedAliasGroup): readonly string[]
```

- 20 个分类组(IM/DESIGN/DEV/OFFICE/BROWSER/TERMINAL/NOTES/MEETING/CLOUD/AI/TASK/DATABASE/
  API/DEVOPS/GIT/SCREENSHOT/MEDIA/ARCHIVE/TRANSFER/SECURITY/NETWORK/REMOTE/VIRTUALIZATION/
  PRODUCT_DESIGN)改写为 `compileAliasGroup({ en: [...], zh: [...] })`,常量名不变,类型仍是
  `readonly string[]` → `APP_SEMANTIC_CATALOG` 条目与 `resolveAppSemanticAliases`(:655-667)
  **零改动**。
- 现有数组里英中混排按语言拆开;手写复数(`messages`/`notes`)保留原样(与自动展开在
  normalize 层合并去重,不冲突)。
- per-app 条目(:83-653)的 `aliases` 保持扁平:专有名词(`wechat`/`figma`/`ps`)无语言归属,
  结构化只有迁移成本没有收益。`match` 数组完全不动。

## 2. 派生规则

```ts
const LOCALE_ALIAS_EXPANSIONS: Record<SemanticAliasLocale, (alias: string) => readonly string[]> = {
  en: expandEnglishPlural, // 见下
  zh: (alias) => [alias]   // 恒等
}
```

`expandEnglishPlural(alias)` 返回 `[alias, plural?]`:
- 跳过(只返回原词):含空格的多词短语;长度 ≤ 2;含非字母字符(`2fa`/`k8s`);已以 `s` 结尾
  (`docs`/`notes`/`ies` 类误伤可接受,词表可控);显式缩写跳过表 `NON_PLURALIZABLE`
  (`ai`,`db`,`vm`,`pm`,`ps`,`ide`,`cli`,`ocr`,`ssh`,`rdp`,`ftp`,`sftp`,`vpn`,`api`,`http`,
  `rest`,`sql`,`git`,`im`,`ui`,`ux`,`tg`,`wx`,`qq` —— 实施时以实际词表核对增删)。
- 规则:`(s|x|z|ch|sh)$ → +es`;辅音+`y$ → ies`;其余 `+s`。
- **导出该函数供单测直接测规则**。

## 3. 词表扩充清单(实施以此为准,不自由发挥)

新组 + 新 per-app 条目:

```ts
const EMAIL_ALIASES = compileAliasGroup({
  en: ['email', 'mail', 'inbox'],
  zh: ['邮件', '邮箱']
})
// 条目: outlook(com.microsoft.outlook), thunderbird, spark(readdle), apple mail(com.apple.mail,
//   match 需含 'mail.app' 类身份,注意别误伤含 mail 的其他 app —— 用 bundleId 精确项),
//   foxmail, 网易邮箱大师(mailmaster)
const DOWNLOAD_ALIASES = compileAliasGroup({
  en: ['download', 'downloader'],
  zh: ['下载', '下载器']
})
// 条目: motrix, aria2, 迅雷(thunder/com.xunlei), free download manager, folx
```

既有组补漏(全部清单):
- BROWSER: zh + `上网`
- TERMINAL: en + `command line`
- MEDIA: en + `movie`,zh + `电影`
- MEETING: zh + `开会`
- SECURITY: en + `passwords`? 否——由自动复数覆盖,无需手加。仅上述四处。

## 4. 版本与生效

`APP_SEMANTIC_ALIAS_CATALOG_VERSION` 4 → 5(:6)。app-provider 存储版本比对(:2030 一带)
在下次运行时扫描自动重刷关键词,无迁移。

## 5. 测试(扩展既有 app-semantic-catalog.test.ts)

1. 规则单测(直接测 `expandEnglishPlural`):`browser→browsers`、`box→boxes`、`repository→
   repositories`(若词表含 y 结尾词,否则用构造词)、`notes→notes`(s 结尾跳过)、`db` 跳过、
   `edit video` 跳过、`浏览器` 跳过。
2. 端到端:构造 chrome 形态的 `AppSemanticAliasInput` → resolve 输出同时含 `browser` 与
   `browsers`;terminal 类 app 含 `terminals`;去重(手写 `messages` 不重复出现)。
3. EMAIL/DOWNLOAD:outlook/motrix 形态输入命中新组。
4. 版本常量 === 5。
5. 回归:既有用例全绿,不改既有断言(除非断言了别名总量之类的脆断言,如有,改为包含性断言并说明)。

## 5.5 Design Decision:不单开 `tuff-consts` 包(2026-08-06,用户授权主会话裁量)

用户提议可抽 `tuff-consts` 之类的常量包。裁量:**本轮不抽,但保证可抽性**。
- 现状唯一消费者是主进程扫描管道;包边界跟第二个消费者走,先抽是纯开销(workspace/发布/pnpm store)。
- 将来出现第二消费者(插件 SDK / 渲染端类目 chips)时,把**编译后数据 + 派生规则**抬进既有共享包
  `@talex-touch/utils`(而非新开包)——共享层只保留一个家。
- 为此的硬约束:词表数据、`compileAliasGroup`、`expandEnglishPlural`、`LOCALE_ALIAS_EXPANSIONS`
  段保持零运行时依赖(仅可依赖纯函数 `normalizeStringList`,type-only import 不限),与
  matcher(`createAppCatalogNeedleMatcher`,耦合 app 身份模型)保持可分离;抬包时是纯机械移动。

## 6. 边界

- 不动 `app-tool-source-catalog.ts`、`app-catalog-matching.ts`、`normalizeStringList`、
  搜索热路径与关键词管道。
- 别名总量增幅约 +40%(英文单词复数),按 `search-hotpath-contracts.md` 的 token 去重漏斗
  (O(1))评估无热路径风险;关键词行数增长由版本重刷一次性吸收。
