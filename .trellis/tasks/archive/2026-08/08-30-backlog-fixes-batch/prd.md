# 侧边栏与积压缺陷批量修复

轻量批次任务（用户 2026-08-30 批示"1234 都修复适配一下吧…5 也可以做下"+追加 outline/边距）。四路并行 subagent。

- ① tuffIntelligenceProviderAdapters.test.ts 两断言适配 6 参（含 idempotencyKey），负控制验证后恢复
- ② DocsSidebar SECTION_ORDER 补 cloud-sync
- ③ tuffex README 双语库存重排为三套件（audit:readme 必须绿）
- ④ @windlil-design/components → @talex-touch/tuffex-components（lockfile 增量必须受限）
- ⑤ 单子项同名分组压平为单链接（guide/extensions 双 tab 回归）
- ⑥ 追加：nav item 去 focus outline；条目上下边距收紧

验收：各路门禁绿 + 我方 CDP 视觉复核 + 分组提交
