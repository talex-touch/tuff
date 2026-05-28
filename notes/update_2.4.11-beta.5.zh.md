# Tuff v2.4.11-beta.5 更新说明

## 本次更新

- 新增 CoreApp 性能基线与优化执行计划，覆盖启动、CoreBox 搜索、常驻 CPU/内存、构建速度与包体分析，并提供 `build:vite` 与 `perf:bundle:size` 两个低风险分析入口。
- 优化 CoreApp 主题解析与 preload debug 日志渲染安全性，继续降低调试面板与运行时日志带来的安全/噪音风险。
- 扩展 TuffEx 组件能力与文档示例，包括 BaseAnchor、ContextMenu、Checkbox、Rating、Dialog 等组件的交互、视觉与测试覆盖。
- 改进 Nexus 文档站体验，补充组件组合 Demo、Dashboard 图表封装、文档加载/大纲/导航与发布说明生成链路。
- 恢复 TuffEx 发布门禁，补齐 lockfile/workspace catalog 触发范围与 npm publish-safe manifest 校验。

## 已验证

- `pnpm -C "apps/core-app" run perf:bundle:size -- --json --top 3` 已在本地通过，可读取现有 `out` / `dist` 构建产物并输出 JSON 报告。
- GitHub Actions Build and Release 矩阵构建成功后才会创建该 beta Release。
- Nexus release sync 会消费同一份中英文 notes payload。

## 已知限制

- 本次新增性能基线先提供观测与分析入口，不改变 `build`、`quality:pr` 或 `quality:release` 门禁语义。
- `quality:release` 仍需按当前 TODO 口径继续跟进既有全仓 lint/build 债务；本 beta 不宣称 release gate 全绿。
- 具体平台验证、签名和发布证据仍以当前版本的 Release Evidence 与发布清单为准。
