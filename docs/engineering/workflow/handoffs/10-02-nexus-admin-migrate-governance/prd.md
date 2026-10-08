# 数据治理页拆分迁移、补全文案键与遥测保留面板

父任务：`10-02-nexus-admin-console-overhaul`（D3、D7）；承接 `09-23-nexus-admin-console-gaps` 原 R4（governance 拆分）。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 在开工前补写（分区边界以 `research/page-inventory.md` §11 为起点）。

## Goal

把 4,049 行、11.6 屏高、中文界面下整页英文的治理页拆成按分区加载的页面，补全全部文案，并按 D7 加上遥测保留面板。

## Requirements

- **R1 分区**：改为 `?section=` 分区（分区条放 `#nav`），初步划分（design 阶段可调整，须覆盖原页全部内容）：
  - 概览：运营报告快照（可导出 Markdown）、汇总、D1 迁移就绪；
  - 分析驾驶舱：运营看板、指标、访问 / 搜索 / 插件 / 上传 / 存储 / 通知 / provider 健康 / 浏览器推送 / provider 配额；
  - 存储：存储策略、凭据、告警、策略健康与冒烟、策略列表；
  - 通知：渠道、凭据、渠道测试、投递与原因；
  - 采集配置；
  - 维护：遥测保留（R4）。
  每个分区一个异步组件（`components/admin/governance/*`），只在进入该分区时请求自己的数据。
- **R2 加载与错误**：10 个顶层 `await useAsyncData`（`governance.vue:178-819`）改为按分区懒加载；每个分区贴合版式的骨架（当前 0 个骨架、加载时显示零值）；每个区域各自错误态 + 重试，不再把 13 个错误合并成一条暴露 API 路径的红条（`:1255-1257`）。
- **R3 文案与表单**：补全 332 个 `dashboard.governance.*` 键的中英文案（当前两语都不存在，靠 `tt()` 回落英文，`:29`）；模板内联英文片段（`total / events / actors / global / ms` 等，`page-inventory.md` §6）与占位符改为键；22 个无标签输入加 `<label>`（`:3446-3851`）；11 个原生 JSON `<textarea>`（`governance.css:14-38`）换为 TuffEx 文本 / 代码编辑组件并在保存前校验 JSON、点名出错字段（现有行为，`governance.runtime.test.ts` 守住）。
- **R4 遥测保留（D7）**：维护分区提供
  - 试运行预览：可填 `telemetryRetentionDays`（默认 7）、`governanceRetentionDays`（默认 14，均 ≤ 366）、`batchLimit`（默认 1 万，≤ 5 万），调用 `POST /api/admin/maintenance/retention`（`dryRun: true`），按表展示 `cutoff / matched / deleted / remainingAfterBatch`；
  - 上次自动清理：新增只读接口读取 `nexus_maintenance_state`（自动任务每 6 小时一次，`server/utils/telemetryRetentionMaintenance.ts:7,151-157`），显示时间与结果；
  - 真删：`dryRun: false`，经 `AdminConfirmDialog`（要求输入确认文本，说明不可逆、自动任务已按相同参数运行）；审计动作 `maintenance.telemetry_retention.run` 已有标签。
- **R5 测试与守卫**：
  - `governance.test.ts` 的约 186 条源码字面量改为测行为 / 结构契约；`governance.runtime.test.ts` 的 async `useAsyncData` 桩与 10 个 key 注册顺序断言随懒加载改写，保留告警发送请求体、JSON 解析错误点名字段、saveScope 标记等行为断言；
  - 删除 `i18n-key-existence.test.ts:339-349,469-489` 对 governance 的 332 键豁免（键已补齐），守卫对拆分后的新文件同样生效；
  - `sfc-size-budget` 继续通过。

## Acceptance Criteria

- [ ] 每个分区逐条满足父任务 design §4；中文界面下不再有英文标题 / 按钮 / 占位符；ego 截图（每个分区 × 1280 / 1920 × 亮 / 暗 × 中 / 英）存 `research/`。
- [ ] 进入某个分区时，网络面板只出现该分区的请求。
- [ ] 遥测保留：本地造过期数据后，试运行显示命中数；真删需输入确认文本，执行后再次试运行命中为 0；「上次自动清理」显示正确时间。
- [ ] 原页面的全部功能（导出 Markdown、7 类配置保存、渠道测试、存储告警通知、存储冒烟）在新分区中逐项可用（清单写入 `research/`）。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`。

## Out of Scope

- 治理接口与统计口径变更；`summaryDays` 目前全页无 UI 可改（`:58`），是否加选择器在 design 阶段向老板确认。
