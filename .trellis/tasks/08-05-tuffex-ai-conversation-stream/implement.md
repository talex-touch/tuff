# ② TxConversationStream 执行计划

前置：`design.md` 已过审。工作目录 `packages/tuffex`。零新依赖。

## 顺序清单

### S1 位置缓存（纯逻辑先行）
- [x] `conversation-stream/src/use-position-cache.ts`：key 维度高度表、惰性前缀和、二分可见范围、估算→实测修正的补偿差值输出
- [x] `__tests__/position-cache.test.ts`：估算/实测混合、prepend 索引平移后缓存命中、上方修正补偿值、二分边界（空表/单项/scrollTop 越界）
- 验证：`cd packages/tuffex && pnpm test -- conversation-stream`

### S2 stick-to-bottom 组合式
- [x] `use-stick-to-bottom.ts`：atBottom 判定、程序化滚动 guard、跟随触发、浮钮态
- [x] `__tests__/stick-to-bottom.test.ts`：阈值判定、guard 防误判、上滚断开跟随、恢复跟随
- 验证：同上

### S3 组件装配
- [x] `TxConversationStream.vue`：三分区结构、live zone 恒为末条、窗口项 RO 测量接线、prepend 锚定 watch、IO sentinel + inFlight/hasMore/error 态、浮钮、全部 slots/emits/expose
- [x] `types.ts` + `index.ts` + `components.ts` 一行（字母序插位）
- 验证：`pnpm typecheck`

### S4 组件级测试
- [x] `conversation-stream.test.ts`（RO/IO 用 `vi.stubGlobal` 手动触发，模式对齐 `scroll/__tests__/scroll.test.ts`）：
  - 500 项注入 → 渲染节点数 ≤ 可视估算 + 2×overscan（DOM 有界断言）
  - 模拟 prepend 50 项 → 锚定后 scrollTop 补偿值正确（数学断言，经 expose/内部句柄）
  - loader：触顶触发、inFlight 不并发、`hasMore=false` 后不再触发、reject → error 态 + 重试可用
  - 末条增高 + atBottom → 跟随；上滚后不跟随；浮钮出现
  - 空态 slot、key 串位防护（prepend 后各项 key 对应内容不换位）
- 【review 门】core-app 或 docs 沙盒里真滚一次：触控板惯性、快速甩动无白闪、prepend 无跳动

### S5 收尾
- [x] 全量验证

## 验证命令（S5 全量）

```bash
cd packages/tuffex
pnpm test
pnpm typecheck
pnpm build
pnpm lint
```

根目录 `pnpm lint` 收口。

## 回滚点

- S1/S2 纯新增文件，随时可弃。
- S3 起含 `components.ts` 一行改动；全件回滚 = 删 `conversation-stream/` 目录 + 还原该行。
