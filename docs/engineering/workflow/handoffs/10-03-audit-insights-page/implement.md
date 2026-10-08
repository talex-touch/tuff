# Implement — 审计洞察页

## 清单

1. [ ] 纯函数：`audit-format.ts`、`audit-labels.ts` + 单测。
2. [ ] 数据：`useAuditInsights.ts`、`useAuditRecords.ts` + 单测（mock SDK）。
3. [ ] 卡片：`AuditTrendCard`、`AuditBreakdownCard`、`AuditLimitsCard`、`AuditZeroCostNotice`。
4. [ ] 抽屉：`AuditRecordsDrawer`（迁移上下文包 / 检查点逻辑）、`AuditLimitsDrawer`、`AuditSettingsDrawer`。
5. [ ] 页面：`IntelligenceAuditPage.vue` 用共享 `InsightsHeader / InsightsNotice / InsightsHeroMetric / InsightsMetricCard / InsightsMenu` 重写；`AuditPageSkeleton`。
6. [ ] 文案：`intelligenceAudit.*` 中英；改 `settingsIntelligenceHub.auditDesc`。
7. [ ] 删除旧组件五个；全仓 grep 确认无引用；重新生成 `components.d.ts`（unplugin 自动）。
8. [ ] 测试：页面状态、名称映射、导出、设置抽屉。
9. [ ] 真机：按 PRD AC-P1–AC-P4 截图，存 `evidence/`。

## 验证

```bash
pnpm -C "apps/core-app" run typecheck:web
pnpm -C "apps/core-app" exec vitest run \
  "src/renderer/src/components/intelligence/audit" \
  "src/renderer/src/views/base/intelligence" \
  "src/renderer/src/modules/lang/translation-coverage.test.ts" \
  "src/renderer/src/components/intelligence/audit/context-package-log-summary.test.ts"
pnpm check coreapp-ui-contract
rg -n "IntelligenceUsageStats|IntelligenceUsageChart|IntelligenceAuditLogs|IntelligenceAuditOverlay|IntelligenceGlobalSettings" apps/core-app/src   # 期望 0
git diff --check
```

- 真机步骤（隔离 dev 实例，`.trellis/spec/guides/multi-session-collab-guide.md`）：
  1. 造数据：连发若干 Home 对话 + 一次本地 Ollama 调用 + 一次未收录模型调用；
  2. 打开审计页，依次截图有数据、切范围、去向四维、记录抽屉（筛选 / 详情 / 导出）、上限抽屉保存后卡片变化、设置抽屉关审计后的提示条；
  3. 用 `getBoundingClientRect` 记录首屏骨架与加载后各区块位置，确认无跳动。

## 回滚

revert 即可，旧页面与旧组件随 revert 恢复（依赖的主进程接口保持兼容）。
