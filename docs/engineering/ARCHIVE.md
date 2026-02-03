# Engineering Archive

用于归档已处理的工程报告/审计/记录。

## docs/engineering/reports/core-app-tuffex-ts2307-2026-02-02.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. TS2307 根因为 tuffex dist 缺失且 core-app 未配置路径别名，只能走包解析。
  2. 影响 core-app 渲染进程类型检查/构建，干净环境更易触发。
  3. 复测：执行 `pnpm -C "apps/core-app" run typecheck:web` 通过（脚本会先构建 tuffex）。
- 遗留/待办：无（若移除前置构建仍可能复现）

## docs/engineering/reports/report.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. Settings 页面滚动“闪动回弹”，TouchScroll/TxScroll 诊断日志未出现。
  2. 已做结构与样式调整：ViewTemplate/AppLayout 传递高度、TouchScroll 高度与 padding 优化。
  3. 结论偏向“事件未到滚动容器或运行未用到改动源文件”，建议加 capture 级监听与检查 tuffex 链接方式。
- 遗留/待办：按需补充滚动事件捕获与高度诊断。

## docs/engineering/reports/report-scroll-followup.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. ViewTemplate 的 wheel capture 日志（DEV-only）与 TxScroll 日志均未触发。
  2. 高优先级结论：运行环境非 DEV/非最新源码；其次是 tuffex 未走本地源码（无 alias）。
  3. 建议先确认运行模式与启动路径，再为 `@talex-touch/tuffex` 配本地 alias 或 workspace link。
- 遗留/待办：若问题复现，优先补充 capture 日志与渲染源路径校验。

## docs/engineering/reports/nexus-build-memory-2026-02-02.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. 本地 4G heap 仍 OOM，崩在 Nitro server build 阶段（cloudflare preset）。
  2. Sentry sourcemap 上传会增加峰值内存；UnoCSS 异常类名导致 CSS 膨胀与 PostCSS 警告。
  3. Node 版本不一致（本地 v25 vs CI v22）可能影响内存曲线。
- 下一步（低优先级 TODO）：
  - 对齐 Node 22 复测；对比开/关 Sentry 上传的峰值。
  - 视情况提高 CI heap 或拆分构建。
  - 收紧 UnoCSS 抽取范围，排查超大内容文件。

## docs/engineering/reports/report-widget-render-empty.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. Widget 注册与 mounted 正常，但 DOM 仅注释节点，payload 为空时也不渲染占位。
  2. CommonJS 产物 `exports.render` 未绑定到 `module.exports.default`，导致 render 丢失。
  3. 建议在 `evaluateWidgetComponent` 中补充 render 兜底绑定以恢复渲染。
- 遗留/待办：验证修复后占位 UI 渲染正常。

## docs/engineering/audits/260114-CODE-SCAN.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. 滚动回归根因：高度链路不成立 + 不可滚动时仍吞 wheel；已修复并同步 tuffex dist。
  2. 容器高度链路修复与 TouchScroll 自适应增强（TTabs/TouchScroll）。
  3. 渐变模糊已接入 ViewTemplate 与 TuffAsideTemplate。
  4. 仍有多处 overflow 需后续迁移；建议明确 native/BetterScroll 策略。
- 遗留/待办：推进 overflow 迁移与 tuffex 源码/产物流程固化。

## docs/engineering/optimization/OPTIMIZATION_SUMMARY.md
- 状态：已处理（2026-02-03）
- 下一步（保留）：
  1. 前端权限性能监控 UI。
  2. 日志面板（实时过滤）。
  3. 权限检查超阈值告警。
  4. 插件加载路径安全复核。

## docs/engineering/typecheck/TYPECHECK_FIXES.md
- 状态：已处理（2026-02-03）
- 摘要：
  1. 记录了插件 Logger 的 LogLevelString 类型修复与颜色映射补齐。
  2. 记录了移除未使用变量与多余 `@ts-expect-error` 的清理项。
  3. 仍有若干 renderer 组件类型问题需另行处理（PermissionList/PluginPermissions/SettingPermission）。
- 备注：legacy 权限类型兼容项已转入 `docs/engineering/todo.md` 跟踪。

## 文档盘点（2026-02-03）
- 状态：待处理（作为后续逐项确认的索引）
- 建议顺序：
  1. 质量/修复类：`docs/engineering/reports/*` + `docs/code-audit-2026-01-31.md` + `docs/incident-2026-01-16-longterm-fixes.md`
  2. 工程过程类：`docs/engineering/audits/*`、`docs/engineering/typecheck/*`、`docs/engineering/ci-cd/*`、`docs/engineering/optimization/*`
  3. 执行与跟踪：`plan/*` + `issues/*`（同名可配对）
  4. PRD/规划：`docs/plan-prd/*`（量大，建议按模块分批）
- 摘要（压缩）：
  - `docs/` 顶层 16 份（脚本原生、everything、分析/事故）
  - `docs/engineering/` 15 份（reports 4 / audits 2 / notes 3 / ci-cd 1 / optimization 1 / typecheck 1 / 其他 3）
  - `plan/` 21 份
  - `issues/` 15 份
  - `reports/` 3 份
- 备注：后续你说“处理过了”我会在此处归档，并删除对应源文件（需你明确确认）。
