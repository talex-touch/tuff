# Implement

- [x] 1. `native-file-search-provider.ts`：priority deferred；Spotlight predicate 去 displayName；测试先行。
- [x] 2. `search-gather.ts` 注释更正。
- [x] 3. `useResize.ts` 滞回；`useResize.test.ts` 两条用例。
- [x] 4. `views/box/stagger-delay.ts` + 测试；`CoreBox.vue` 改为 import。
- [x] 5. `pnpm exec vitest run` 上述四个测试文件 + `search-gather.test.ts` + `search-core.contracts.test.ts` + `search-core.regression-baseline.test.ts` + `search-core.gather-ordering.test.ts`。
- [x] 6. `typecheck:node`；`vue-tsc --noEmit -p tsconfig.web.json --composite false`（跳过 tuffex 重建，其 dist 已存在）。
- [x] 7. 真机：重启隔离栈，`height.mjs "ghostty" "gho"`、`"photosho" "photoshop"`、`"gho" "tuffbench-doc"`；`type.mjs "ghostty" 200`；grep `Fast layer timeout`。
- [x] 8. `git diff --check`。
