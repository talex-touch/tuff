# Implement — 洞察页共享组件

## 清单

1. [ ] 迁移前基准截图：dev 实例，语音页有数据态与空态各一张，固定窗口尺寸，存任务目录 `evidence/before-*.png`。
2. [ ] 建 `components/settings/insights/` 五个组件 + 单测。
3. [ ] `VoiceInsights.vue` 切换到组件，删除迁走的私有样式。
4. [ ] 跑语音页测试与组件测试。
5. [ ] 迁移后截图 `evidence/after-*.png`，逐区域比对并记录结论。

## 验证

```bash
pnpm -C "apps/core-app" run typecheck:web
pnpm -C "apps/core-app" exec vitest run \
  "src/renderer/src/views/base/VoiceInsights.test.ts" \
  "src/renderer/src/components/settings/insights"
pnpm check coreapp-ui-contract
git diff --check
```

- 截图走 dev 实例 + CDP。先确认实例是自己起的（`.trellis/spec/guides/multi-session-collab-guide.md`）。窗口失焦会自动隐藏，按记忆里 tuff-dev-cdp 的经验处理。

## 回滚

revert 即可，语音页回到私有样式。
