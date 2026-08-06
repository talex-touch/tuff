# C. skills 与 MCP 后台配置及自动选择导入

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。地基见 `research/existing-foundation.md`。

## Goal

设置页新增「技能与 MCP」：管理 skills（目录化注册表）与 MCP servers（配置/启停/健康），自动导入既有 AI CLI 配置（复用 `ai-cli-import-service`），会话时按相关性自动选择注入（orca 模式：skills 按需装载、MCP 工具延迟加载）。产出被 B 消费（`--mcp-config` 文件 + skills 注入服务）。

## Requirements

### skills

- 目录化 SKILL.md 形态（frontmatter：name/description/触发语义），来源三档：内置 / 用户目录 / 导入
- 设置页列表：启停、查看、删除、打开所在目录；变更即时生效（下一轮会话）
- 注入服务：会话发送时按相关性挑选（关键词/描述匹配起步，信号升级 design 定案）注入 system prompt；自动选择有总开关；用户可在会话内显式点名（后续 /name 语法占位不实施）

### MCP servers

- 配置管理：增删改（name/command/args/env 或 url）、启停、连接健康探测（可用/失败原因）
- 产出 pi 兼容的 `--mcp-config` 文件（B 消费）；配置变更后下一轮会话生效
- 工具延迟语义：默认不全量注入，会话按需启用（与 B 的白名单机制衔接，形状 design 定案）

### 自动导入

- 复用 `ai-cli-import-service` 扫描（.il.json / 各 CLI 配置）→ 候选列表（来源/名称/工具数）→ 勾选一键导入；重复导入去重
- 导入的 server 标注来源，可整体移除

## Acceptance Criteria

- [ ] 设置页完成 skills 与 MCP 两组管理面（增删改/启停/健康态），风格沿 CoreBox v2.5 设置页版式
- [ ] 自动导入：本机存在候选时列出并可一键导入，二次扫描去重
- [ ] MCP 工具在首页会话可用（决策改道：主进程 registry 经 tool-gateway 代理，弃 `--mcp-config`；冒烟=真 server 手动配置→探测 ok→会话内 list+call 过确认门回流）
- [ ] skills 注入：增删一个 skill 后，下一轮会话 system prompt 注入随之变化（单测 + 日志证据）；自动选择开关可关
- [ ] 主进程服务层单测；typecheck/lint 全绿

## Notes

- 复杂任务：design.md（存储形态、相关性信号、mcp-config 生成契约）+ implement.md 过审后 start。
- 「参考 orca」= 按需装载/延迟加载/显式点名三语义，不照抄其文件布局。
