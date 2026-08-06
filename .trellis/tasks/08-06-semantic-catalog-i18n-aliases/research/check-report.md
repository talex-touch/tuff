# 复查报告(semantic-catalog-check,2026-08-06)——通过

零丢词 24/24 组(两遍机械验证:源码层 git show HEAD + 脚本集合差;运行时层 tsx 导入真模块、
每组代表 app 走 resolveAppSemanticAliases 验证旧集 ⊆ 输出)。新增项与 design §3 逐条吻合,
无自由发挥;组内无重复;en/zh 语言归位无错。

## 核验结论

- **matcher**:单 Latin token = token 全等(matching.ts:95-108);`mail.app` 双 token 需连续成串。
  负控实测 Mailchimp/Airmail/Mailbird/MailTrack/Mail Designer 365/Spark/Spark AR 全部空输出;
  `thunder` 够不着 thunderbird。残留暴露面 = basename 真为 `* Mail.app` 者,语义本就正确。
- **跳过表**:44 条,无重复、无凭空条目;抽查 10 条理由全部成立;47 个复数产出通读自然。
  直接修 1 处:删 `'compress'`(s 结尾由结构规则提前返回,永不可达,且违反表自身文档注释)。
- **零运行时依赖**:import 块与 HEAD 逐字节一致;可抬包约束保持;chalk-in-app-utils 事实确认。
- **per-app 逐字节一致**:唯一 hunk = 末尾 12 条新条目。
- **版本链细节(重要)**:真正比对在 app-provider.ts:2227-2246;`semantic-alias-catalog-sync`
  维护任务**只打日志 + 写回版本号**,关键词实际刷新发生在下次运行时扫描(:2744)。
  既存行为非本轮引入;含义:新词「下次扫描后」可搜,非版本写回瞬间。
- **热路径**:调用在 appSearchDerivedCache LRU 之后,增量按 app 摊销,无 query 侧成本。

## 门禁

vitest addon/apps 20 文件 209 测试绿;typecheck:node exit 0;包内 eslint 0/0;prettier clean。
澄清:仓库根 eslint 对 core-app 树的 247 错为**既存全仓冲突**(根 antfu 风格 vs core-app 自有
prettier;HEAD 版同文件 148 错、未改的兄弟文件 19 错),包内配置才是该包权威门禁。

## 遗留(记录,不阻塞)

1. 47 个新复数无一与常见 app 名撞;风险低。
2. 单 token 邮件客户端(Airmail/Mailspring/Canary Mail)拿不到 EMAIL 类目词——策展立场一致;
   将来有人报「搜邮件找不到 Airmail」根因在此,补法是给这些 app 加显式条目。
3. 根 eslint 与 core-app prettier 的全仓冲突,超边界仅报告。
