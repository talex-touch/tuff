# Implement — Item freshness recommendations

执行序(A/B 可并行,文件所有权见 design §6;两块各自跑就地测试后再进全局门):

## Checklist

- [x] **A1** `app-types.ts`:`ScannedAppInfo.createdAt?: Date`;darwin/win/linux 扫描器取
      `stats.birthtime`(有效性:>0 且 ≤ now+24h)
- [x] **A2** `app-provider.ts`:`processAppPath` options 加 `discovery`;watcher 入口传 'watch';
      `installedAt` 写入用 conflict-do-nothing 保证永不覆盖(清扫集不含该 key,无需豁免)
- [x] **A3** A 块单测:20 文件 202 测试绿;整棵 box-tool 1213 测试绿(详见 research/chunk-a-report.md)
- [ ] **B1** `packages/utils`:`ScoredItem['source']`、`RecommendationBadge['variant']`、
      `tuff-dsl` source 联合补齐并对齐
- [x] **B2** engine:维度 6(双门判定;目录读经 split-aware 句柄不下推谓词,理由见
      research/chunk-b-report.md)+ 稳定层 novelty 加分 + `CandidateItem.installedAt`
- [x] **B3** 冷启动重构 + badge/reason 双 map(去重仅 executeCount===0 才提升 source)
- [x] **B4** 缓存失效:providerIds 限 app-provider;DB 洞确认且深于设计——同步读守卫
      cacheInvalidatedAt + generation 计数 + 删除行降级清理(见报告)
- [x] **B5** 核实:rebuild 天然丢弃目录缺行候选,无需过滤;rebuilder 层单测锁死
- [x] **B6** exposure tag 通道(自抓并修:切片污染总 hit-rate → getHitRate(days, tag?) 分区)
- [x] **B7** recommendation/ 84 绿;search-engine/ 590 绿;contracts flaky 澄清并复跑 5 次绿
- [x] **B8(收尾)** 渲染端 badge-newly-installed 配色:BoxGridItem.vue(#a29bfe 同构色板)+
      ItemSubtitle.vue(violet-500);typecheck:web 干净;复查确认与联合一致、不撞色
- [x] **G1** `apps/core-app`:typecheck node+web 双干净(A、B 各自复跑均绿)
- [x] **G2** touched 测试:addon/apps 202 绿(A)+ recommendation 84 / search-engine 590 绿(B);
      整棵 box-tool 1213 绿(A 侧跑);pnpm utils:test 61 失败为既有噪声(B 三证归因,与本次无关)
- [x] **G3** eslint 包内全清;trellis-check 全量复查通过(证伪 6 项全败 + 自修 2 处,
      见 research/check-report.md)
- [ ] **G4** playbook 映射已回填;spec 更新(installedAt 契约)+ 提交(进行中)

## Validation commands

```bash
cd apps/core-app && npm run typecheck
cd apps/core-app && npx vitest run src/main/modules/box-tool/search-engine/recommendation/ src/main/modules/box-tool/addon/apps/
pnpm lint
```

## Rollback

单文件回退用 `git show HEAD:<path> > <path>`(本仓库多智能体并发,禁 stash/checkout 批量回退)。
DB 无迁移,`installedAt` 为增量 KV,回退代码即回退行为;已写入的 KV 行无害残留。

## Review gates

- A/B 完成后各自就地测试绿 → 进 G1-G3 全局门 → trellis-check → 提交前人工过一遍 diff。
