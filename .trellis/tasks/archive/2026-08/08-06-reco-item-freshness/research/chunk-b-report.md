# Chunk B 实施报告(freshness-chunk-B,2026-08-06)

B1-B7 完成。门禁:recommendation/ 84 测试绿;search-engine/ 全目录 590 测试绿;
typecheck node+web 双干净;包内 ESLint(--max-warnings=0)10 文件全清。

## 改动面

- 类型:`ScoredItem['source']` += newly-installed|cold-start;badge variant += newly-installed;
  `tuff-dsl` source 联合补 newly-installed,两处从此对齐。
- engine:维度 6 + novelty 打分 + 冷启动重构 + 缓存失效 + 曝光打标;item-rebuilder badge/reason
  双 map;exposure service tag 通道;search-core 按 `providerIds` 限 app-provider 提交时失效。

## 三个有据偏离

1. 目录读沿用 `getFilesByType('app')` 不下推 SQL 谓词:`getDb()` 是写句柄,直查会绕开
   split-aware 读句柄(catalog 进 search split 后会静默读错库,仓库有注释警告);开销由双门
   顺序化解(门 1 ctime 过滤后稳态通常 0 行,扩展表查询跳过)。
2. `loadInstalledAtByFileId` 读失败降级为「无 stamp 按 ctime 排」,不让冷启动整格变空。
3. 去重保留 installedAt 并**仅当 executeCount===0** 才把 source 提升为 newly-installed
   ——badge 不在加成已死时仍宣称自己是排序理由(新装但被搜过的 app 会先从 frequent 维度进池)。

## B4 核实结论:DB 缓存洞存在且比设计更深

- 读路径:`recommend()` → `getCachedRecommendations()` → `getRecommendationCache(cacheKey)`
  (db/utils.ts:489)只按 expiresAt 拒行;原 `invalidateCache()` 只清内存 → 30min 内旧行复活。
- 设计方案(删 DB 行)不够:删除走 `scheduleAuxWrite` 且 dropPolicy:'drop',失效变 best-effort。
  落地机制:`cacheInvalidatedAt` 同步读守卫(拒绝早于最后失效的行)+ generation 计数
  (失效前已开跑的 recommend 不得把陈旧结果写回任何一层——该竞态内存层原本也有)+ 删除行
  降级为跨进程清理职责。
- 来源辨识:`CoreBoxSearchIndexCommitPayload.providerIds`(search-index-writer.ts:583 填充)
  → 仅 app-provider 提交触发失效,file-provider 的持续提交不误伤。

## B5 核实结论:无需存在性过滤

`rebuildAppItems` 经 `getFilesByPaths`/`getFilesByBundleIds` 解析,目录行缺失即返回 [];
usage 统计行喂进 frequent/recent 也进不了结果。以 rebuilder 层单测锁死(engine 测试 mock 掉
rebuilder,在那层写是测 mock);缓存命中路径由 B4 失效覆盖。

## 自抓 bug

`<surface>:<tag>` 切片行污染 R9 总体 hit-rate(getHitRate 全 surface 求和会重复计数)——
改为 `getHitRate(days, tag?)` 分区读取 + 隔离单测。

## 口径澄清

- `search-core.contracts.test.ts`:全程仅见 1 次失败,系既有 flaky(beforeEach 动态 import ~8s
  并行负载下偶超 hook 超时→ core 未赋值)。复跑 5 次全绿(单文件 ×3、全目录 ×2)。
- `pnpm utils:test`:61 失败全部先于本次改动(涉事包 git status 干净;失败套件零 import 本次
  改动文件;直接覆盖改动类型的 tuff-builder.test.ts 27/27 过)。

## 遗留

1. **badge-newly-installed 缺渲染端配色**:BoxGridItem.vue 的 `badge-${variant}` 样式只有
   frequent/recent/trending/intelligent;ItemSubtitle.vue variant switch 落 primary 默认。
   文字+图标可读,需补一条配色。(渲染端,不在 B 所有权内 → 归主会话收尾)
2. addon/apps 测试归 Chunk A(已绿,见 chunk-a-report.md)。
3. G4(playbook 回填 / spec / 提交)归主会话。
4. eslint --fix 带入少量纯格式行。
