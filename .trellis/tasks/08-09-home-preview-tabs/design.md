# 设计：右侧 Tabs 预览区

父任务：`08-09-home-panel-layering-v2` ｜ PRD：`./prd.md`

## 结论先行：不需要任何新的主进程通道

四个 tab 的数据全部能从渲染进程已有的东西派生。这是本设计最重要的一条 —— 它把一个看起来要动主进程的需求压成了纯渲染层改动。

| Tab | 数据来源 | 判据 |
|---|---|---|
| 产物 / 文件 | `tool-call` part，`name === 'tuff_write_file'`、`status === 'done'`、`output` 形如 `Created <path>` | `tool-registry.ts:407` 用 `flag: 'wx'` 创建，**永不覆盖**，所以每条成功输出都对应一个真实新文件 |
| 产物 / 文件（上传） | `message.attachments` | 用户自己传的，与生成文件分组 |
| Widget | `tool-call` part，`output` 以 `tuff:chart:` / `tuff:form:` 开头 | 前缀常量在 `packages/utils/transport/sdk/domains/agent-tools.ts:18,24`，主进程写、渲染进程读，是既有的双边契约 |
| 工作过程 | 所有 `type === 'tool-call'` 的 part | 直接就是它 |
| 引用 / 来源 | `tuff_read_file` / `tuff_search_files` / `tuff_mcp_call` 的调用参数与结果 | 见下方「引用 tab 的诚实性」 |

打开文件也不需要新通道：`appSdk.openApp({ path })`（走 `shell.openPath`）与 `appSdk.showInFolder(path)` 已经在 `packages/utils/transport/sdk/domains/app.ts:45-46` 暴露给渲染进程了。

## 引用 tab 的诚实性

`AiSourcesPart`（`packages/tuffex/packages/components/src/ai-elements/src/types.ts:80`）定义了 `type: 'sources'`，但**全仓库没有任何一处产生它** —— 已用 `rg -n "type: 'sources'" apps/core-app/src packages/utils` 确认为空。

所以引用 tab 不能等着这个类型。派生规则：

- `tuff_read_file` 成功 → 一条「本地文件」来源，取其 `input` 里的 path
- `tuff_search_files` 成功 → 结果里命中的路径，各一条
- `tuff_mcp_call` 成功 → 一条「MCP」来源，`server / tool`

同时把渲染与派生拆开：`buildSourceItems(parts)` 产出 `AiSourceItem[]`，渲染只认 `AiSourceItem`。将来若真的接了 `AiSourcesPart`，把它的 `sources` 直接并进同一个数组即可，渲染层不用改。

## 组件划分

```
HomeSidePanel.vue                    ← 改成 tab 容器（壳）
├─ HomePreviewArtifacts.vue          ← 产物 / 文件
├─ HomePreviewWidgets.vue            ← Widget
├─ HomePreviewToolCalls.vue          ← 工作过程
└─ HomePreviewSources.vue            ← 引用 / 来源
```

派生逻辑集中在一个纯模块 `apps/core-app/src/renderer/src/modules/conversation/preview-index.ts`：

```ts
export interface PreviewIndex {
  artifacts: ArtifactItem[]      // { kind: 'created' | 'uploaded', path, name, dir, messageIndex }
  widgets: WidgetItem[]          // { kind: 'chart' | 'form', title, messageIndex }
  toolCalls: ToolCallItem[]      // { name, status, summary, error, messageIndex }
  sources: AiSourceItem[]
}

export function buildPreviewIndex(messages: ConversationMessage[]): PreviewIndex
```

一个函数扫一遍全会话产出四个列表，而不是四个组件各扫一遍：条目上都带 `messageIndex`（定位用），一次遍历天然就有这个下标，分开扫要么重复遍历要么丢下标。

## Tab 容器选型

用 `TxTabs` + `TxTabItem`（`@talex-touch/tuffex/tabs`），`placement="top"`、`contentScrollable`。

**必须关掉 `autoHeight` 与 size 动画**：外层 `.HomePage-PanelSlot` 正在用宽度收窄做开合动画（`HomePage.vue:1544-1551`），面板内部再叠一层尺寸动画会和它抢同一帧，出现宽高互相追的抖动。面板高度本来就是撑满的，autoHeight 没有意义。

不选 `TxTabBar`：那是底部导航形态（`fixed` / `safeAreaBottom`），语义不对。

计数用 tab 标签后缀，不用 badge 圆点 —— 四个 tab 挤在 280px 里，圆点会把标签挤到换行。

## 定位回对话

Widget 条目点击后滚动定位，不在面板里重渲。`TxConversationStream` 已经 `defineExpose` 了 `scrollToIndex`（`TxConversationStream.vue:424-426`），`HomePage` 持有 `streamRef`，把 `scroll-to` 事件从面板冒泡到 `HomePage` 调它即可。

不重渲的理由写在 PRD 第 10 条：280~360px 放不下可用的图表，且复制一份会产生两处不同步的状态（`ToolChartCard` 的 draft / 隐藏系列 / 视图切换全是组件内 view-local 状态）。

## 面板宽度

280px 对四个 tab + 文件路径偏窄。调到 `360px`，改 `HomePage.vue:1505` 的 `--home-panel-width` 单一来源；`HomeSidePanel` 自身继续读 `var(--home-panel-width, ...)`，不新增第二个常量（`HomeSidePanel.vue:88-89` 已经是这个模式）。

## 取舍

- **为什么整会话而不是单轮**：用户要的是「不用往回翻」。单轮索引只能看最后一轮，恰恰解决不了这个问题。代价是长会话下 `buildPreviewIndex` 要扫全量 —— 用 `computed` 缓存，输入是 `messages`，流式期间每个 delta 都会重算。若实测有卡顿，再退化成「仅在面板打开时计算」（`v-if="panelOpen"` 已经天然做到了一半）。
- **为什么解析 `Created <path>` 而不是改主进程输出格式**：PRD 非目标里写死了。工具输出是模型也在读的文本，为渲染层方便去改它会同时改变模型看到的东西。解析要容错：匹配不上就不出现在产物里，不抛错。
- **为什么不做文件内容预览**：读文件内容是另一条能力（`appSdk.readFile` 存在，但要处理编码/大小/二进制/权限），塞进本轮会把这个任务撑爆。本轮只做定位与打开。

## 兼容性与回滚

- 无 schema、无 IPC 契约、无持久化变更。
- `HomeSidePanel` 的 props 会变（不再需要 `turn`，改为需要 `messages`），调用方只有 `HomePage.vue:1495` 一处。
- 回滚 = `git revert` 单个提交。

## 依赖

**必须等 `08-09-turn-info-float-panel` 合入。** 那个任务负责把「本轮信息」段从 `HomeSidePanel.vue` 搬走；本任务接手剩下的壳。两者同时改同一文件的同一区域。
