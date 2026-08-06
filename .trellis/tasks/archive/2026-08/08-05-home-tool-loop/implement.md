# B. 首页工具调用链路 执行计划

前置：design.md 过审；A 的 S1~S3 组件可用（并行推进时以 mock 先行）。

## 顺序清单

### S1 协议与 runtime（可独立验证）
- [x] intelligence.ts：IntelligencePartEvent（双类型家镜像：utils + tuff-intelligence；main sdk 发射 + renderer SDK 分发一并接通） + onPartEvent + chunk.partEvent（全可选）
- [x] pi-cli-runtime：五类事件解析（+ provider partEvent 转发） + buildPiArgs 白名单模式；单测（真实 NDJSON fixture 取自 research 实测）
- 验证：`cd apps/core-app && npx vitest run src/main/modules/ai/providers`

### S2 parts 装配（renderer）
- [x] useHomeConversation：parts 状态机（reasoning/tool 归并、callId 配对、文本尾部累积）+ 序列化进 meta.parts（8KB/则截断）+ 恢复
- [x] 单测：事件序列 → parts 断言；持久化往返（39 例全绿）
- 验证：vitest conversation 目录全绿（既有 31+ 不回退）

### S3 工具网关 + 只读三工具（主进程）
- [x] tool-gateway 模块：loopback HTTP + token + 确认队列 + transport 确认事件
- [x] tuff_search_files / tuff_read_file / tuff_open_path 实现与风险分级
- [x] 单测：token 校验、deny 回传、超时（19 例）
- 验证：主进程 vitest

### S4 pi-extension 包 + spawn 接线
- [x] packages/pi-extension-tuff：读 pi-mcp-adapter 源码定注册 API → 三工具薄壳
- [x] PiCliProvider：工具开时注入 env + `--tools` 白名单 + 本地 `pi install` 开发流程文档
- [x] 【review 门】终端冒烟：真 pi 调 tuff_search_files 往返成功（抓出并修复 executor 签名 bug，见 journal）

### S5 Renderer 确认门 + 装配
- [x] TxToolConfirmation 接线（transport 往返 + 会话级 remember）
- [x] ChainOfThought 派生 + TxToolCallCard parts 渲染进 HomePage；设置页总开关
- 验证：typecheck:web + conversation 测试

### S6 图表卡 + feature 调用（V2 段）
- [x] tuff_render_chart（spec 校验）+ ToolChartCard（按需 import）
- [x] tuff_list_features / tuff_invoke_feature（9022c763e 交付：plugin-feature-source 投影 + 目录/调用两工具 + 21 例单测；搜索另接 CoreBox 真实索引）
- 验证：单测 + 冒烟

### S7 端到端验收（真 pi）
- [x] PRD 验收清单：端到端脚本验证（工具往返/参数正确/结果回流）；UI 目验留用户（CDP 代验 + 截图存档）；stop 无孤儿进程复验
- [x] 全量门：core-app typecheck node+web、conversation/providers 测试、lint

## 回滚点
S1/S2 可选字段可弃；S3/S4 独立模块/包；工具开关关闭即回今日行为。
