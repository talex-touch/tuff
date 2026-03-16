# DivisionBox Manifest 配置文档（压缩版）

> 状态: 活跃（入口文档）
> 更新时间: 2026-03-16
> 适用范围: 插件 `manifest.json` 中 `divisionBox` 配置
> 替代入口: `docs/plan-prd/03-features/division-box-prd.md`、`docs/plan-prd/TODO.md`
> 深入文档: `DIVISION_BOX_MANIFEST.deep-dive-2026-03.md`

## TL;DR

- 插件通过 `manifest.json.divisionBox` 声明尺寸、缓存、header、快捷键与触发方式。
- 当前主线强调“配置最小化 + 行为可预测”，避免复杂组合导致不一致体验。
- 本页只给出配置边界与验收原则，完整字段说明见 deep-dive。

## 最小配置建议

- 必填：`defaultSize`（推荐 `medium`）。
- 可选：`keepAlive`、`header.actions`、`shortcuts`、`triggers`。
- 触发链路必须与权限模型一致，避免“可触发但不可执行”的断链。

## 验收原则

- Manifest 改动后，需验证打开、切换、关闭与快捷键触发行为一致。
- 不得引入破坏性字段语义变化；兼容扩展仅允许可选字段追加。

## 追溯

- 完整字段定义与示例：`DIVISION_BOX_MANIFEST.deep-dive-2026-03.md`
