# 快速启动与搜索优化 PRD（Deep Dive）

> 状态：历史草案 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/quick-launch-and-search-optimization-prd.deep-dive.full-2026-05-14.md`
> 当前入口：`./quick-launch-and-search-optimization-prd.md`、`../../TODO.md`、`../../01-project/CHANGES.md`

## TL;DR

本文保留早期快速启动与搜索优化设想，覆盖复制可执行文件加入快速启动、搜索性能优化、平台差异处理与用户体验方案。当前项目已将核心验收收敛到 Windows App 索引、Everything target probe、App Index diagnostic、search trace `200` 样本与真机 acceptance evidence。

## 历史有效结论

- Quick Launch 需要支持用户手动加入可执行文件/快捷方式。
- 搜索结果应区分平台原生快速层与自建索引增强层。
- App 搜索排序应优先可见标题、别名与明确 App intent，避免隐藏 token 抢占。
- 复制 app path 加入本地启动区需要可诊断、可 reindex、可启动闭环。

## 当前项目口径

- `2.4.10` 必须补 Windows 真机证据：common app launch、copied app path、UWP/Store、Steam、Everything target probe、App Index diagnostic。
- 搜索性能验收必须使用真实设备 `search-trace` 200 样本与 `search-trace-stats/v1`。
- Quick Launch 搜索引擎模式已进入实现态，但仍需 macOS/Windows/Linux 真机验收。

## 不再作为当前依据的内容

- 早期跨平台可执行检测方案细节。
- 未对齐当前 settings SDK / appIndex typed domain 的数据库设计。
- 未包含当前 Windows acceptance manifest 强门禁的验收描述。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md`
