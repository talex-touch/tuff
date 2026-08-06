# 实施报告(semantic-catalog-impl,2026-08-06)

两文件改动:app-semantic-catalog.ts(+315/-56)、app-semantic-catalog.test.ts(+98)。
门禁:addon/apps 20 文件 209 测试绿(语义目录 15 个含新增 6);typecheck:node 干净;
eslint 0/0;prettier clean(注意 core-app 自有 .prettierrc.yaml,arrowParens=always 与仓库根不同)。

## 落地要点

- `SEMANTIC_ALIAS_LOCALES = ['en','zh'] as const`(联合类型由数组派生,数组兼作确定性遍历序);
  `compileAliasGroup` 逐语言跑 `LOCALE_ALIAS_EXPANSIONS` 后交 `normalizeStringList` 去重;
  24 个既有组按语言拆开重写,常量名与产物类型不变 → per-app 条目与 resolver 零改动
  (per-app `aliases`/`match` 与 HEAD 逐字节一致)。
- EMAIL/DOWNLOAD 两组 + 12 条新条目;四处补漏(上网/command line/movie+电影/开会);版本 4→5。

## matcher 语义结论(实读 app-catalog-matching.ts)

needle 与身份两侧均按 `[a-z0-9]+|Han+` 分词;单 token 拉丁 needle = **token 全等**(非子串);
多 token needle 要求同一字段内**连续成串**;CJK 例外按 Han 串包含。
→ Apple Mail 拆两条:`com.apple.mail`(带 `apple mail` 专名)+ `mail.app`(仅类目词,
basename 兜底);残留误伤面 = 名字带独立 Mail token 的邮件 app 拿到邮件类目词,语义本来就对。
Spark 用 `spark mail`/`spark desktop`/`com.readdle.smartemail` 避开 Apache Spark;
迅雷 `thunder` 安全(thunderbird 是单 token,永不全等)。

## NON_PLURALIZABLE(44 词,4 类,代码内注释归类)

结构性跳过(≤2 字符/含数字/多词/非 ASCII/s 结尾)独立于表、刻意不进表。
核对方式:解析全部 `en:` 词条(109 唯一词)实跑规则,47 个复数产出逐个审核。
`inbox→inboxes` 是 sibilant 唯一活跃用例;`repository`/`proxy` 是 -ies 唯一用例,均入单测。
实现注:「s 结尾先返回」使 sibilant 正则写作 `/(?:x|z|ch|sh)$/`(含 s 是死分支),有注释。

## 约束确认与未来抬包事实

- 零运行时依赖:import 块与 HEAD 逐字节一致;数据/编译段唯一外部值 = `normalizeStringList`;
  matcher 与 tool-source 只在 resolver 内。抬包切割线 = AppSemanticAliasInput 以上 + 组常量 + 目录数组。
- **抬包时注意**:`normalizeStringList` 纯,但宿主 `app-utils.ts` 模块级 import chalk——
  抬升需连带迁移该函数或先把它拆出 app-utils。
- 既有断言零改动(全是 arrayContaining/not.toContain;app-provider.test.ts:2225 动态比对版本)。
