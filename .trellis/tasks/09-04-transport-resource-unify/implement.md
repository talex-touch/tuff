# Implement — 传输与资源协议统一

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

依赖:A 部分的**触发源**由 C3(`09-04-reco-sdk-weights`)提供。
本任务可先建承接管道并用测试桩驱动,不必等 C3。

## Step 0 — 调查(不改代码)

- [ ] **死信道判定**:grep 全仓(含 `plugins/`、`packages/`、`apps/nexus`)确认
      `recommendation.get` / `aggregateTimeStats` / `isPinned` 的调用者。
      查 `legacy-alias-tombstones.ts:325-341` 三条墓碑的引入背景(git log)。
      结论写入 `research/dead-channel-verdict.md`,每条三选一:真死 / 刻意保留 / 应接线。
- [ ] **渲染端 update 语义**:确认渲染端收到 `{ type: 'update' }` chunk 时是**追加**还是**按分数重排**。
      这决定 `design.md` §2.4 的方案选型。结论写入 `research/`。
- [ ] **`stream:` 门禁**:列出当前及规划中的资源消费场景,逐个判断能否用「物化 + tfile」满足。
      产出 `research/stream-scheme-gate.md`,给出建立 / 放弃的带证据结论。

**Gate 0**:三份调查落盘。`stream:` 结论**回报用户确认**后才决定 Step 4 是否执行。

## Step 1 — 空态推荐增量追加(承接侧)

- [ ] 在空 query 分支所在的 stream handler 内建立追加订阅点,
      订阅句柄的生命周期绑在流的 owner 上,随 end / error / cancel 解除。
- [ ] 定义主进程内部的推荐追加入口(C3 将从推荐引擎侧调用它),
      入口只负责「有会话则发 update chunk,无会话则丢弃」。
- [ ] snapshot 路径**一字不改** —— 用 diff 自证:`search-core.ts:1012-1060` 的逻辑不变。
- [ ] 按 Step 0 的渲染端语义结论,决定 update chunk 是否需携带分数。

验证:
- 空态 snapshot 内容与改造前逐条一致(快照测试)
- 测试桩触发追加 → 渲染端收到 update chunk
- 会话关闭后触发追加 → 无 chunk、无状态、无日志

**Gate 1**:管道通了,触发源仍是测试桩。回滚 = 移除订阅点。

## Step 2 — Owner 绑定回归

- [ ] 补齐 `channel-transport-contracts.md` §"Owner-Bound..." 要求的测试:
      - 两个 sender 对象复用同一 streamId → 互不干扰
      - 外部 sender / lane / activation 取消 → 对目标流无效
      - 当前 owner 取消 → 精确 abort,后续回调静默
      - sender 销毁 → 清理其全部流,**且断言无关流仍存活**(单边断言不算数)
- [ ] 确认追加订阅不会在流终止后泄漏(订阅计数归零断言)。

验证:`pnpm --filter core-app vitest run` 相关套件全绿。

**Gate 2**:生命周期正确性有测试兜底。

## Step 3 — tfile 控制面收敛

- [ ] 在 `packages/utils/transport/` 新增资源描述符类型与 `toTfileUrl` 纯函数实现。
- [ ] `renderer/src/utils/tfile-url.ts` 改为 re-export,**保留原导出名**,调用点零改动。
- [ ] 主进程改为引用 transport SDK 的类型;`getAllowedLocalFileRoots()` 与
      路径规范化 / allowlist 判定**保持在主进程不动**。
- [ ] 新增静态断言测试:
      - `packages/utils` 内不存在 `getAllowedLocalFileRoots` 实现
      - transport stream protocol payload 类型不含 `Buffer` / `ArrayBuffer` / base64 / 图像字节字段

验证:
- `pnpm lint`、`typecheck`、`pnpm utils:test` 全绿
- **运行时冒烟(必做)**:启动应用,CoreBox 空态检查应用图标 ——
  每张 `cache/app-icons` 下的 `tfile` 图片 `naturalWidth > 0`,`.tuff-icon__empty` 计数为 0。
  这是 spec 记载过的真实回归模式,类型检查捕获不到。

**Gate 3**:类型单一来源建立,授权边界未移动。回滚 = 还原 re-export 方向。

## Step 4 — `stream:` scheme(**仅在 Gate 0 门禁通过且用户确认后执行**)

- [ ] `main/index.ts:71` 的 `registerSchemesAsPrivileged` 增加 `stream` 条目。
- [ ] 实现 handler,**复用** tfile 的路径规范化与 allowlist 判定,不新建 path policy。
- [ ] 写 URL 契约:URL 形态、参数、生命周期、owner 归属。
- [ ] 补 400 / 403 / 404 矩阵测试,与 tfile 的对应测试并列而非替代。
- [ ] 在 `native-resource-protocols.md` 写入完整 `stream:` 契约段。

若门禁未通过:**跳过整个 Step 4**,在 `research/stream-scheme-gate.md` 记录理由。

## Step 5 — spec 修正(无论 Step 4 如何取舍都必须做)

- [ ] `native-resource-protocols.md` §"Three Electron schemes":
      - `atom` 行 → 「已退役;`service/protocol-handler.ts` 返回 410 墓碑;无消费者」
      - `stream` 行 → 按 Step 4 结果二选一:完整契约段,或「未注册、未实现;标识符保留」
- [ ] 检查该 spec 其余段落是否还有同类过时描述(既然发现两处,不排除有第三处)。

## Step 6 — 全量校验

```bash
pnpm lint
pnpm --filter core-app typecheck
pnpm --filter core-app vitest run
pnpm utils:test
```

- [ ] 首帧耗时测量:改造前后各测 5 次空态唤起,记录数字,确认无回归。
- [ ] 日志检查:无新增的 channel timeout warn、无追加订阅泄漏警告。

## 回滚点

| Gate | 回滚方式 |
|---|---|
| Gate 1 | 移除追加订阅点,空态回到纯 snapshot |
| Gate 3 | `tfile-url.ts` 还原为实现方、撤销 utils 侧新增类型 |
| Step 4 | 移除 scheme 注册与 handler(未被消费,可直接撤) |

## 提交约定

签名会失败(pinentry),用 `--no-gpg-sign`,只 stage 本任务文件。
工作区另有 `docs/design/corebox/v2.5.0.pen`、`pnpm-lock.yaml`、
`scripts/check-prod-audit.mjs` 的既存改动,不要一起提交。
