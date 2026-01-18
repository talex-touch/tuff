# 需求汇总：PRD 状态梳理 + 下载链路统一 + SDK 优先 + 文档落地

- 扫描 plan-prd 相关文档，结合代码语义梳理已完成/未完成/进行中功能。
- 先把进行中事项依次做完，并同步文档状态（以代码为准）。
- 扫描 core-app 中所有涉及下载的地方（含 svg、TuffIcon 等），统一走 tempfile + DownloadCenter；开发模式仍可展示。
- 分析 TuffIcon 加载远程 SVG 无法走浏览器缓存的问题，并以代码状态为准处理 TODO。
- 新原则：优先使用封装好的 SDK，其次才走 transport 通道。
- 将 TempService 封装为 SDK，并在项目中使用。
- 每个 SDK 在 Nexus 文档落地一个章节：先 banner（没有则用渐变组件），再按“介绍/原理/实现/使用/例子/FAQ”等章节组织。
- 按顺序推进 1/2/3/4/6/7。
- 流程编排文档先细化（优先级低）；需要管理 UI；暂不需要补 WorkflowAgent 文档。
- 继续推进后续工作，并在必要时更新 PRD/TODO 状态。
