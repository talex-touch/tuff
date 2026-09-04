# Implement — 推荐 SDK 与权重函数开放

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

依赖:A 部分可独立开发;D 部分的端到端验收需 C1(来源注册表)+ C2(增量追加通道)就位。

## Step 0 — 前置决策与核查

- [ ] **Q4 拍板**:权重函数暴露边界。`design.md` §3.1 建议只暴露时间类纯函数。
      **需用户确认后**才能定 Step 3 的范围。
- [ ] **Q6 拍板**:文件准入规则归属。决定 Step 4 的实现位置。
- [ ] `ContextSignal` 填充核查:运行时打点,记录 time / clipboard / selection /
      foregroundApp / systemState 各字段的实际填充率。常为 undefined 的字段
      要么修好,要么在 SDK 文档中标注为「可能缺失」。结论写入 `research/`。
- [ ] 记录基线:索引 N 个文件期间 `invalidateCache()` 的当前调用次数(应为 0,因为文件不触发)。

**Gate 0**:Q4 / Q6 有结论,ContextSignal 核查落盘。

## Step 1 — 评分基线测试(纯测试,不改实现)

`recommendation-engine.ts` 3330 行、测试 2238 行,改动前必须有可信基线。

- [ ] 为 `calculateScore` 补齐判别性 fixture:
      - 高频内置应用 vs 中等时间分的稀疏候选 → 记录当前相对位置
      - 插件候选在不同 `priority` 下的位置 → 记录当前行为(应为纯 priority 序)
      - novelty 交接:`executeCount` 0→1 前后的排名变化
- [ ] 记录缓存失效路径的现有测试覆盖(同步读屏障 + generation counter)。

验证:`pnpm --filter core-app vitest run recommendation-engine` 全绿。

**Gate 1**:基线落地。后续任何排序回归都会被这组测试捕获。

## Step 2 — 插件候选并入主排序池

按 `design.md` §2 的三件套实施,顺序不可颠倒(先防滥用再放开评分):

- [ ] **2a 名额上限**(§2.4):单插件上限 + 插件合计上限。先落上限,
      避免后续步骤放开评分时出现无界候选。
- [ ] **2b priority 降级**(§2.3):`priority` 改为来源内排序,不再参与跨来源分数。
      加 sdkapi 门槛区分新旧行为 —— 这是**破坏性变更**。
- [ ] **2c 维度归一化**(§2.1):移除 `recommendation-engine.ts:2243` 与 `:2249` 的短路分支,
      改为按参与维度归一。
      **重点验证**:稀疏候选不得压过高频内置应用(Step 1 的判别性 fixture)。
      若压过,引入维度覆盖度惩罚并记录系数依据。
- [ ] **2d 用量回流**(§2.2):宿主按 `sourceId:itemId` 记录插件条目执行,
      使其进入完整 frecency。与 novelty 的「首次执行交还 frecency」同构。
- [ ] **2e 清理特例**:`__builtin_clipboard_url__` 走同一路径;
      grep 确认 `isExternalPriorityCandidate`(`:2499`)及其调用点无残留。

每个子步验证:Step 1 基线 + 该子步的新断言。

**Gate 2**:插件条目与内置条目同池排序。回滚粒度到子步。

## Step 3 — 权重函数 SDK(范围由 Gate 0 的 Q4 结论决定)

- [ ] 把 `recommendation-utils.ts` 中的时间类纯函数与常量上移 `packages/utils`,
      主进程改为引用,原位置保留 re-export 避免大面积改调用点。
- [ ] 写公开签名文档与使用示例。
- [ ] 加 sdkapi 门槛(参考 `system.resolveApplication` 的 `sdkapi >= 260817` 做法)。
- [ ] 静态断言测试:这些函数的实现不 import 任何 db / storage / usageStats 类型。
- [ ] 若 Q4 结论要求暴露 frecency:按 `design.md` §3.1 的建议形态暴露
      (吃归一化数值,不吃 usageStats 结构)。

验证:`pnpm utils:test`、`pnpm lint`、`typecheck` 全绿。

**Gate 3**:SDK 面建立。注意此步一旦发布即成对外承诺。

## Step 4 — 新索引文件进入推荐

- [ ] **4a 准入规则**(按 Q6 结论定位置):来源目录限定、类型限定、
      单次与单会话数量上限、批量提交节流。**先落规则,再接通道**。
- [ ] **4b 接入 C2 的增量追加入口**:文件索引提交经准入规则筛选后推送。
      **明确不调用** `invalidateCache()` —— 在代码注释中写明理由,
      避免后人「顺手补上」而引发失效风暴。
- [ ] **4c 图片资源**:图标/缩略图走 `tfile` 描述符,IPC 无字节。
- [ ] **4d** 若引入新 `recommendation.source` 取值,**三个文件同步**:
      `core-box/recommendation.ts`、`core-box/tuff/tuff-dsl.ts`、
      `transport/events/types/core-box.ts`。
- [ ] 更新 `search-core.ts:479-485` 的注释 —— 「the recommendation grid never contains files」
      已不再成立,留着会误导。

验证:
- 索引 N 个文件期间 `invalidateCache()` 调用次数**不随 N 增长**(对比 Step 0 基线)
- 排除目录/类型的文件不进推荐;超上限被截断
- 图片条目 IPC payload 无字节字段

**Gate 4**:文件可进推荐且无失效风暴。

## Step 5 — 全量校验

```bash
pnpm lint
pnpm --filter core-app typecheck
pnpm --filter core-app vitest run
pnpm utils:test
```

- [ ] 运行时冒烟:
      - 空态推荐正常,内置高频应用仍在靠前位置(未被插件/文件挤掉)
      - 装一个测试插件推送候选 → 出现在推荐中且位置合理
      - 新增一批图片到监控目录 → 索引后可追加进推荐,图标正常显示
- [ ] 日志检查:无失效风暴、无追加泄漏。
- [ ] 若有 spec 变更,更新 `.trellis/spec/main-process/recommendation-freshness-contracts.md`。

## 回滚点

| Gate | 回滚方式 |
|---|---|
| Gate 2 各子步 | 逐子步还原;2c 是风险最高的一步,单独回滚即恢复扁平 priority 行为 |
| Gate 3 | 撤销 utils 上移,还原 re-export 方向(未发布前无外部影响) |
| Gate 4 | 断开准入规则的推送接线,文件不再进推荐,其余不受影响 |

## 提交约定

签名会失败(pinentry),用 `--no-gpg-sign`,只 stage 本任务文件。
工作区另有 `docs/design/corebox/v2.5.0.pen`、`pnpm-lock.yaml`、
`scripts/check-prod-audit.mjs` 的既存改动,不要一起提交。
