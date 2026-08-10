# 执行计划：右侧 Tabs 预览区

父任务：`08-09-home-panel-layering-v2` ｜ PRD：`./prd.md` ｜ 设计：`./design.md`

## 前置门禁

- [ ] `08-09-turn-info-float-panel` 已合入，`HomeSidePanel.vue` 里已经没有「本轮信息」段
- [ ] 确认 `rg -n "type: 'sources'" apps/core-app/src packages/utils` 仍为空（引用 tab 的派生前提）；若已有人接了生产端，回到 PRD 第 13 条重新定这一 tab 的来源

## 步骤

1. **派生模块 + 测试（先于任何 UI）**
   - 新建 `apps/core-app/src/renderer/src/modules/conversation/preview-index.ts`，实现 `buildPreviewIndex(messages)`
   - 同步写 `preview-index.test.ts`，用手写的 `ConversationMessage[]` 夹具，不碰真实流：
     - 空会话 → 四个列表全空
     - `tuff_write_file` done + `Created /a/b.csv` → 一条 created 产物，`name=b.csv`、`dir=/a`
     - `tuff_write_file` done 但输出是错误文案（`File already exists…`）→ **不**出现在产物里
     - `tuff_write_file` status 非 done → 不出现在产物里
     - `output` 以 `tuff:chart:` 开头 → widgets 出一条 chart；`tuff:form:` → 一条 form
     - 三条工具调用（done / error / running）→ toolCalls 三条，状态各自保留
     - `tuff_read_file` / `tuff_search_files` / `tuff_mcp_call` → sources 对应条目
     - 每条都带正确的 `messageIndex`
   - 验证：`pnpm -F core-app exec vitest run src/renderer/src/modules/conversation/preview-index.test.ts`

2. **四个内容组件**
   - `HomePreviewArtifacts.vue`：created / uploaded 两组；点击调 `appSdk.openApp({ path })`，次级操作 `appSdk.showInFolder(path)`；失败走 toast，不静默
   - `HomePreviewWidgets.vue`：条目点击 `emit('locate', messageIndex)`
   - `HomePreviewToolCalls.vue`：名称 + 状态 + 摘要，error 状态有明确视觉区分
   - `HomePreviewSources.vue`：按来源类型分组
   - 四个组件各自的空状态文案独立，不共用一句泛泛的「暂无内容」

3. **改造 `HomeSidePanel.vue` 为 tab 容器**
   - props 由 `{ turn, messageCount }` 改为 `{ messages: ConversationMessage[] }`
   - `TxTabs placement="top" contentScrollable`，**显式关掉 `autoHeight` 与 size 动画**（理由见 design.md）
   - tab 标签带计数后缀
   - 透传 `locate` 事件

4. **接线 `HomePage.vue`**
   - `<HomeSidePanel :messages="messages" @locate="streamRef?.scrollToIndex($event)">`
   - `--home-panel-width` 由 280px 调到 360px（`:1505` 单一来源）
   - 校验点：`rg -n "280px" apps/core-app/src/renderer/src/views/base/home/` 不应再有面板宽度的第二处硬编码

5. **文案**
   - 新增 `home.preview.*` 键（四个 tab 名 + 四个空状态 + 分组名）
   - `home.panel.title` / `workLog` / `workLogEmpty` 若不再使用则从两份 JSON 一起删
   - 校验点：node 读两份 JSON 比对 `home.preview` 与 `home.panel` 的 key 集合差集为空

6. **性能兜底**
   - `buildPreviewIndex` 结果用 `computed` 缓存
   - 若长会话流式期间实测掉帧，改为仅在 `panelOpen` 为真时计算，并在 implement.md 追记实测数据

## 验证命令

```bash
pnpm -F core-app exec vitest run src/renderer/src/modules/conversation/preview-index.test.ts
pnpm -F core-app lint
pnpm -F core-app run typecheck:web
```

## 人工走查脚本

1. 新建会话 → 开右侧面板 → 四个 tab 全空状态，计数全 0
2. 让模型写一个 csv 并渲一张图 → 产物 1 / Widget 1 / 工作过程 ≥2 / 引用按实际
3. 点产物 → 系统默认应用打开
4. 点 Widget → 对话滚动定位到那张图
5. 反复开关面板 → 无宽度抖动、无内容重排闪烁

## 评审门禁

- 第 1 步的测试必须先于 UI 存在。UI 写完再补测试等于对着实现写测试，测不出派生规则退化
- 任何一个 tab 若拿不到真实数据就必须是空状态。**发现自己在写占位假行时立即停手并上报**，这是 PRD 第 2 条的红线
- 不许为了好解析去改 `tool-registry.ts` 的任何输出文案

## 回滚点

- 步骤 1 完成：纯新增模块 + 测试，无 UI 变化，可独立保留
- 步骤 2 完成：组件存在但未挂载，仍无用户可见变化
- 步骤 3-5 完成：面板换新。整体回滚 = `git revert` 该提交
