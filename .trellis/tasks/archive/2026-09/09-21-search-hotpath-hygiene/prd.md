# 搜索热路径卫生

## Goal

修掉审计确认的、可独立测试的搜索热路径与应用 reconcile 卫生问题；明确拒绝价值不明或有副作用的建议。

## Scope（做）

| # | 缺陷 | 位置 | 修法 |
|---|---|---|---|
| A | `isDone && isFirstUpdate` 分支在 `await mergeAndRankItems` 后不复查 abort，仍发布快照；且该分支已置 `didResolveInitial=true`，若简单 return 会让 `result` promise 永远悬挂 | `search-core.ts` ~1373 | await 后若 abort：resolve 一个空的 cancelled 结果并 `session.complete({cancelled:true})`，与已有取消分支一致 |
| B | `SearchSession.complete()` 只看 `isTerminal`；signal 已 abort 的会话仍以 `cancelled:false` 结束 | `search-session.ts:252` | abort 时强制 `cancelled: true`（状态 `'cancelled'`），仍保证恰好一个 terminal |
| C | app reconcile 用毫秒比较秒级入库的 mtime，66/201 个应用每次都被判「已变更」（真机：每次 reconcile 稳定 123–125 changed、库内容零变化） | `app-provider.ts:2852` | 按秒截断比较 |
| D | 语义别名 `match: ['warp', …]` 单 token 等值匹配到「Cloudflare WARP」，使其获得「终端」别名 | `app-semantic-catalog.ts` | 改用 bundle id 针 `dev.warp.warp`（多 token 连续匹配只命中 Warp 终端） |

## Declined（不做，记录原因）

- deferred 层 `delay()` 不响应 abort：取消 terminal 由 `handleAbort` 立即发出，延时只拖住 gather 自身的收尾（≤50ms 悬挂定时器），无用户可见影响。
- `fastLayerConcurrency` 6 < 7：任务 3 已把 Spotlight 移出快层，darwin 快层恰为 6，无需改。
- 中间批次改 `base` 富化：当前没有「完成时整体重排」，改 base 会让 deferred 文件项永久失去用量/置顶信号，属行为退化。
- 主进程按 id 去重、批次间全局重排、Spotlight 子进程复用等：需要设计，单独立项。

## Acceptance Criteria

- [x] A/B/C/D 各一条回归测试，修复前失败、修复后通过；`search-core.*`、`search-session`、`search-gather`、`app-provider*`、`app-semantic-catalog` 套件通过。
- [x] `typecheck:node`、eslint、`git diff --check` 通过。
- [x] 真机：连续两次 `app:indexed-source:reconcile {sourceId:'app-provider'}` 的 `changed` 从 ~123 降到只剩 mdls 显示名刷新的部分（预期 ≤ 60，且第二次不再因 mtime 报变更）；搜索「终端」不再出现 Cloudflare WARP。

## Verification record (2026-09-21)

- 回归：A/B/C/D 四条新用例修复前失败，修复后通过；`search-engine` + `addon/apps` 109 个文件 1100/1100 通过（其中两处既有断言因 B 暴露了「正常完成不应带 `cancelled:false`」的线上契约，已按契约收敛：仅取消时写 `cancelled:true`）；`typecheck:node`、eslint、`git diff --check` 通过。
- 真机：连续两次 app reconcile `changed` 从修复前 123–125 降为 0（`Found 0 to add, 0 to update, 2 missing (0 confirmed for deletion)`），mdls 侧「1 missing」进入宽限账本而非删除；搜索「终端」结果为 Ghostty / iTerm / Terminal / cmux，Cloudflare WARP 不再出现。
- 顺带修正：mdls 统计的 `deleted` 改为报告账本确认的删除数，不再把「本轮缺失」当作已删除。
