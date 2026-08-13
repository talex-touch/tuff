# Implement — semantic catalog locale refactor

单文件 + 就地测试,顺序执行:

- [ ] 1. `expandEnglishPlural` + `NON_PLURALIZABLE` 跳过表 + `LOCALE_ALIAS_EXPANSIONS` +
       `compileAliasGroup`(设计 §1-§2;导出 expand 函数供测试)
- [ ] 2. 20 个分类组改写为 locale 结构(英中拆开;手写复数保留;常量名与产物类型不变)
- [ ] 3. 词表扩充:EMAIL/DOWNLOAD 组与条目 + 四处既有组补漏(设计 §3 清单,不自由发挥)
- [ ] 4. 版本 4 → 5
- [ ] 5. 测试:规则单测 / 端到端复数 / 新组命中 / 版本钉住 / 既有用例回归(设计 §5)
- [ ] 6. 门:`npx vitest run src/main/modules/box-tool/addon/apps/` 全绿;
       `npm run typecheck:node`;包内 eslint 该文件干净

## Validation

```bash
cd apps/core-app && npx vitest run src/main/modules/box-tool/addon/apps/
cd apps/core-app && npm run typecheck:node
```

## Rollback

单文件回退 `git show HEAD:path > path`(禁 stash/checkout)。版本号回退到 4 即回退生效面。
