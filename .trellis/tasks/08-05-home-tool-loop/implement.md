# B. 首页工具调用链路 执行计划

前置：design.md 过审；A 的 S1~S3 组件可用（并行推进时以 mock 先行）。

## 顺序清单

### S1 协议与 runtime（可独立验证）
- [ ] intelligence.ts：IntelligencePartEvent + onPartEvent + chunk.partEvent（全可选）
- [ ] pi-cli-runtime：五类事件解析 + buildPiArgs 白名单模式；单测（真实 NDJSON fixture 取自 research 实测）
- 验证：`cd apps/core-app && npx vitest run src/main/modules/ai/providers`

### S2 parts 装配（renderer）
- [ ] useHomeConversation：parts 状态机（reasoning/tool 归并、callId 配对、文本尾部累积）+ 序列化进 meta.parts（8KB/则截断）+ 恢复
- [ ] 单测：事件序列 → parts 断言；持久化往返
- 验证：vitest conversation 目录全绿（既有 31+ 不回退）

### S3 工具网关 + 只读三工具（主进程）
- [ ] tool-gateway 模块：loopback HTTP + token + 确认队列 + transport 确认事件
- [ ] tuff_search_files / tuff_read_file / tuff_open_path 实现与风险分级
- [ ] 单测：token 校验、deny 回传、超时
- 验证：主进程 vitest

### S4 pi-extension 包 + spawn 接线
- [ ] packages/pi-extension-tuff：读 pi-mcp-adapter 源码定注册 API → 三工具薄壳
- [ ] PiCliProvider：工具开时注入 env + `--tools` 白名单 + 本地 `pi install` 开发流程文档
- 【review 门】终端冒烟：pi 单独调 tuff_search_files 往返成功

### S5 Renderer 确认门 + 装配
- [ ] TxToolConfirmation 接线（transport 往返 + 会话级 remember）
- [ ] ChainOfThought 派生 + TxToolCallCard parts 渲染进 HomePage；设置页总开关
- 验证：typecheck:web + conversation 测试

### S6 图表卡 + feature 调用（V2 段）
- [ ] tuff_render_chart（spec 校验）+ EchartsCard（按需 import）
- [ ] tuff_list_features / tuff_invoke_feature
- 验证：单测 + 冒烟

### S7 端到端验收（真 pi）
- [ ] PRD 验收清单逐项（CDP 代验 + 截图存档）；stop 无孤儿进程复验
- [ ] 全量门：core-app typecheck node+web、conversation/providers 测试、lint

## 回滚点
S1/S2 可选字段可弃；S3/S4 独立模块/包；工具开关关闭即回今日行为。
