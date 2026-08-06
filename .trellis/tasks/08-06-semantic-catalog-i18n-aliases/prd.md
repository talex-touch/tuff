# Semantic alias catalog: locale structure + plural expansion

## Goal

修复「`browser` 能命中、`browsers` 落空」一类问题,并把 `app-semantic-catalog.ts` 的分类别名重构为按语言组织的结构,让复数等派生规则按语言统一生效、未来加新语言(ja/ko/…)只需加一个 key,不再手工在 20 个数组里散播词条。顺带一轮克制的词表扩充(email/download 类目空白 + 个别组补漏)。

## 背景与根因

- 分类别名组(IM/DEV/BROWSER/… 约 20 组)是英中混排的扁平数组;复数覆盖各组手工且不一致(IM 有 `message`+`messages`,NOTES 有 `note`+`notes`,BROWSER/TERMINAL/DATABASE 只有单数)。查询词比关键词长时精确/前缀匹配都够不着 → 复数落空。
- 别名经 `resolveAppSemanticAliases` 摊进 app 搜索关键词,`normalizeStringList` 去重;`APP_SEMANTIC_ALIAS_CATALOG_VERSION` 由 app-provider 对比存储版本,bump 后下次运行时扫描自动重刷关键词。
- email / download 两个常用类目在目录里完全不存在(全文件零命中)。

## Requirements

### R1 按语言组织 + 按语言派生(i18n 扩展性重构)
- 分类别名组改为 locale 结构(`{ en: [...], zh: [...] }`),编译期展开为与现状同形的扁平只读数组——**下游消费(resolve 函数、关键词管道、搜索索引)零改动**。
- 每语言一条派生规则(英语=复数化,中文=恒等);新语言=加一个 locale key + 一条规则。
- per-app 专有名词别名(`wechat`/`wx`/`微信` 等)保持扁平——它们是名字不是词汇,不做语言结构化(设计里写明理由)。

### R2 英语复数自动展开
- 标准朴素规则:s/x/z/ch/sh 结尾 → `es`;辅音+y → `ies`;其余 → `+s`。
- 跳过:已以 s 结尾、长度 ≤2 或缩写(`ai`/`db`/`vm`/`pm`/`ps`/`2fa`/`k8s` 类)、多词短语、非 ASCII。
- 展开后经既有 `normalizeStringList` 去重,与手写复数(`messages`/`notes`)自然合并。

### R3 词表扩充(克制、curated,清单以 design.md 为准)
- 新增 EMAIL、DOWNLOAD 两组及对应 per-app 条目(outlook/thunderbird/spark/apple mail/foxmail/网易邮箱大师;motrix/aria2/迅雷/free download manager)。
- 既有组补个别明显缺口(如 BROWSER+`上网`、TERMINAL+`command line`),不加过泛词。

### R4 版本与生效
- `APP_SEMANTIC_ALIAS_CATALOG_VERSION` 4 → 5,依赖既有版本对比机制自动重刷,无手动迁移。

## Acceptance Criteria

- [ ] `browsers`/`terminals`/`databases`/`editors` 等复数经 resolve 输出(单测),`browser` 等原有行为不回归
- [ ] 展开 helper 单测覆盖:es/ies/+s 三规则、跳过项(s 结尾、缩写、多词、非 ASCII 中文)
- [ ] locale 结构编译产物与消费端类型不变;`resolveAppToolSourceAliases`(兄弟目录)不动
- [ ] EMAIL/DOWNLOAD 条目可被对应 app 身份命中(单测)
- [ ] 版本常量 === 5(单测钉住);既有 `app-semantic-catalog.test.ts` 全绿
- [ ] `typecheck:node` 通过;addon/apps 测试目录全绿;包内 eslint 干净

## Non-goals

- 不做查询侧词干化/语言检测(索引关键词是语言无关平面,目录侧解决足够)
- 不动 `app-tool-source-catalog.ts` 与搜索热路径
- 不做超出 design.md 清单的词表自由发挥
