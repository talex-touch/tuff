# skills/MCP 后台既有地基 · 2026-08-05

- **仓内已存在** apps/core-app/src/main/modules/ai/ai-cli-import-service.ts：AiMcpImportCandidate、扫描 .il.json/config 的导入候选机制 —— 「自动导入」有现成服务层，缺 UI 与 skills 维度
- 「参考 orca」= 用户所用编码代理客户端的模式：
  - skills：目录化 SKILL.md + frontmatter(name/description) 注册表，按相关性自动装载进上下文；用户可 /<name> 显式调用
  - MCP：server 配置 + 工具 schema 延迟加载（deferred tools）+ 按需 ToolSearch 自动选择，避免全量工具挤占上下文
- 待研：intelligence 设置页现状（channels 页）、pi extension 与 MCP 的关系（pi 是否直接支持 MCP server 挂载）
