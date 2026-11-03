# Orca 会话上下文归档（2026-11-02）

本文件是清理 Orca 前从会话索引提取的**未完成/需人工收尾**事项摘要。没有复制凭据、聊天 ID、Cookie 或会话全文；原始项目改动仍以 Git 与项目自身状态为准。

## 1. `task/feat/tuffex-custom-emoji`：未提交

- 工作树：`/private/tmp/tuff-custom-emoji`
- 分支：`task/feat/tuffex-custom-emoji`
- 基线：`e21e0b7a8`；会话记录显示它落后当前远端主线，不能直接合并。
- 当前工作树仍有约 20 个已修改文件和 3 个新增文件，主题是 `TxMarkdownEditor` / `TxIconPicker` 的自定义 emoji 包支持、文档和示例。
- 会话报告：209 项测试、类型检查和 ESLint 已通过；但**没有提交**。
- 收尾：先把工作树完整保全，再基于最新 `origin/master` 重放/合并，重新跑 TuffEx/Nexus 验证，最后提交并推送分支。不要直接删除 `/private/tmp/tuff-custom-emoji`。

## 2. OpenAI Responses 支持：需核对提交归属

- 会话 `工作区提交与分支合并` 报告：Responses 路由、`reasoning.effort` 映射和推理模型不发送 `temperature` 已完成，相关测试通过，但当时**尚未提交**。
- 该会话曾在分支 `task/feat/openai-responses-support` 上工作；当前主工作树没有该分支工作树，恢复前先用 `git branch -a` / `git fsck` 核对是否已有提交，禁止从会话摘要盲目重写。

## 3. HTML 预览侧栏 PR

- PR `#2167`，提交 `3fec7cbf3`，修复 `inlinePreview` 关闭时侧栏未关闭。
- 必需检查已通过，Cloudflare Pages 预览在会话结束时仍排队；会话明确要求**不要擅自合并**，需老板确认或后续人工处理。

## 4. Intelligence UI / 错误详情与视觉间距

- 代码和回归测试已完成：2254 项测试通过，类型检查无错误。
- 未完成的是**真实 Electron 重启后的 UI 验收**：确认失败气泡显示脱敏后的真实原因，以及上下文条上移 4px 后不遮挡蓝色边框/光圈。
- 这是验证事项，不要因为 Orca 清理而重做代码。

## 5. 会话状态结论

- Tuff 的大量 UI 会话（会话菜单、折射玻璃、状态条、Tuff 竞争策略）已有完成报告；本文件只保留上面仍有人工动作的部分。
- 当前工作树里已有的三个未跟踪探针/演示文件属于既有工作，不因本归档自动删除或提交。
