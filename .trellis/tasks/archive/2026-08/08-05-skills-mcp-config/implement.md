# C. skills 与 MCP · 执行计划

依赖：B 已交付的 tool-gateway / pi-extension-tuff / agentTools 开关。全程不改 orchestrator 岛既有行为。

## S1 · buildHomeInjection（主进程注入服务）

- [x] `ai-imported-config-runtime.ts` 新增 `buildHomeInjection(): Promise<string | null>`：active skills metadata 清单（提示语指向 `tuff_skill_read`）+ active rules 全文；无内容返回 null
- [x] `intelligence-service` 发送链路：`tools.autoContext` 开启时把产物追加进 system parts（provider 层零改动）
- [x] 单测：有/无 active skills、开关关闭、rules 拼接顺序（vitest，mock store）
- 验证：`npx vitest run src/main/modules/ai` 相关文件绿；日志可见注入长度

## S2 · gateway 三工具

- [x] `tool-registry.ts`：`tuff_skill_read`（read；仅 contentRef，拒任意路径）、`tuff_mcp_list_tools`（read；失败 server 列 unavailable，无 server 返回提示）、`tuff_mcp_call`（annotations low→read，其余→execute；destructive 确认卡 ⚠ 前缀；summary=`profileName / toolName`）
- [x] `tool-gateway/index.ts` 装配 registry 依赖（intelligenceMcpRegistry、orchestrator store 读取）
- [x] 单测：风险映射表、contentRef 拒绝路径、单 server 失败不拖垮 list
- 验证：`npx vitest run src/main/modules/tool-gateway` 绿

## S3 · pi-extension-tuff 两个 spec

- [x] `TOOLS` 数组追加 `tuff_mcp_list_tools` / `tuff_mcp_call` spec（promptSnippet：先 list 后 call）
- [x] `index.test.ts` 契约测试补两工具（执行器签名 `(toolCallId, params)` 不回归）
- 验证：`pnpm -C packages/pi-extension-tuff test` 绿

## S4 · MCP server 管理后端

- [x] aiOrchestratorStore：manual upsert（source=manual 的 mcp item；env 走 secure-store authRefs）
- [x] `probe(profileId)`：connect+listTools → `{ok, toolCount, error?}`
- [x] IPC 两口，命名对齐 store 既有通道风格
- [x] 单测：manual item → `mcpProfilesFromItem` 产出 profile、probe 失败路径
- 验证：main 侧 vitest 绿

## S5 · 设置页「技能与 MCP」组

- [x] 新组件（CoreBox v2.5 版式：外置分组标签+单层卡片+soft chip 三档），挂 SettingTools 或独立入口
- [x] MCP 区：列表（来源 chip/传输类型/启停/探测按钮+状态 chip）+ 手动新增表单（stdio|http 二选一）
- [x] skills 区：启停列表 + 导入入口（复用 LocalSkills 能力或跳转）
- [x] i18n：en-US/zh-CN 成对；紧凑 JSON 格式不炸行
- 验证：`npm run typecheck:web` + lint 绿；CDP 截图对版式

## S6 · 全量门 + e2e 冒烟

- [x] 真 server 冒烟改为离 app 集成测试（intelligence-mcp-registry.smoke.test.ts，TUFF_MCP_SMOKE=1 opt-in）：真 npx server 握手/listTools/callTool 回流 15.2s 绿；pi→网关通路由 B 的 gateway-smoke + 单测覆盖。会话内点击路径待用户实例自然验证（单实例占位，不再劫持）
- [x] skills 注入：单测覆盖（injection 模块 8 测试）+ 注入长度日志已埋（homeInjectionLog.info）
- [x] typecheck×2（我方范围 0 错）/ lint / vitest 全绿（S4 15 + S5 6 + store/runtime 17 + 冒烟 1）
- 回滚点：每段独立提交；S5 之前全部是主进程/扩展侧增量，撤销单段不影响其余

## 提交切分

S1+S2+S3 一枚（工具链桥）、S4+S5 一枚（管理面）、S6 修补随发现走。
