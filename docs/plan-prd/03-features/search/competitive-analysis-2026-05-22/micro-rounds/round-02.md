# 微审计 02/70

## 审计主题

Raycast Quicklinks / Snippets 的动态参数心智，是否能映射到 Tuff 当前 `touch-browser-open` 搜索 URL builder 与 `touch-snippets` placeholder 能力，并支撑主分析文档中“先做薄变量 resolver，不做大型模板/表单平台”的判断。

本轮只审一个具体映射点：Quicklink URL 参数与 Snippet placeholder 是否应该共用 `TuffVariableContract v1`，而不是继续由不同插件各自实现字符串替换。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - 第 1 节把 Raycast 的丝滑交互归纳为 Search Bar 状态机、Action Panel、统一参数填充、可见失败态。
  - 第 2.3 节明确 Quicklinks、Snippets、AI Commands、Command Arguments 共享动态参数心智。
  - 第 4 节建议 `touch-browser-open`、`touch-snippets` 与 OmniPanel AI action 复用 `TuffParameterSet`，而不是新建大型模板引擎。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
  - 第 1 节指出 Tuff 变量模型当前是散点：`TuffQuery`、`acceptedInputTypes`、snippets placeholder、browser open URL builder、translation、OmniPanel、Flow 与 Intelligence Workflow 还未统一。
  - 第 3 节列出当前证据：`touch-snippets` 只有 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}`；`touch-browser-open` 只在固定搜索引擎里做 `encodeURIComponent(query)`。
  - 第 5 节建议 `TuffVariableContract v1` 是薄解析器，只负责变量解析、校验、转换和 evidence，不接管插件生命周期。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - ledger 已把参数填充列为跨 Raycast / Alfred / uTools 的共同切面；本轮用 live source 复核该结论，不修改 ledger。
- `plugins/touch-snippets/index.js`
  - `applyPlaceholders()` 仅替换 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}`。
  - `readClipboardTextForContent()` 只有在内容包含 `{{clipboard}}` 时请求 `clipboard.read`，失败时返回空字符串。
  - 片段复制路径会在执行前读取剪贴板并调用 `applyPlaceholders()`，说明 placeholder 已是真实功能，但 failure/evidence 仍是插件局部语义。
- `plugins/touch-browser-open/index.js`
  - `SEARCH_ENGINES` 内置 Google / Bing / DuckDuckGo，每个 engine 使用 `buildSearchUrl(query)` 与 `encodeURIComponent(query)` 生成搜索 URL。
  - `buildSearchUrl(engineId, query)` 只接收单个搜索文本，没有用户可管理的 Quicklink template schema。
  - `parseSearchQuery()` 支持用 `google`、`g`、`bing`、`ddg` 等显式 engine command 切换搜索引擎，但不是通用参数填充。
- `.codexpotter/kb/search-parameter-variables-competitive-analysis-2026-05-22.md`
  - KB 记录的当前实现事实与源码一致：snippets 有插件内硬编码 placeholder；browser-open 有 URL encode 的搜索 builder；推荐下一步是 `variable-resolver-pure-v1`、`snippets-resolver-adoption` 与 `quicklink-template-v1`。

## 结论

主文档的映射判断成立：Tuff 已有两个真实但分散的参数能力样本，足以支撑“薄变量 resolver”作为下一步，而不需要先做大型 workflow 引擎、表单平台或 Raycast 风格完整 Quicklinks 管理器。

当前事实链路是：

1. `touch-snippets` 已有可执行 placeholder：日期、时间、UUID、剪贴板文本会在复制片段前被替换。
2. `touch-browser-open` 已有 URL 参数化：固定搜索引擎把 query 归一化后通过 `encodeURIComponent()` 进入 URL。
3. 两者都在解决“运行时值进入文本模板”的同一类问题，但目前没有共享变量声明、校验、隐私等级、失败码或 evidence。
4. 因此主文档把缺口定位为 `TuffVariableContract v1` / `TuffParameterSet` 是准确的：先抽一个纯 resolver 和最小合同，再分别接入 snippets 与 quicklinks。

需要特别保持的边界：

- `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}` 是现有 snippets 行为，后续 resolver 必须兼容旧语法。
- Quicklink URL 场景默认应该继续 percent encode；如果允许 raw 输出，必须显式声明并做 scheme / length 校验。
- `{{clipboard}}` 当前在无权限或读取失败时会退为空字符串；后续主实现不应把这类情况当成功，应返回 `PERMISSION_MISSING` 或 `SOURCE_UNAVAILABLE` 这类可见 failure reason。
- Alfred 的 workflow variables 与 uTools 的动态指令可以作为语义参考，但不应把普通 Snippet / Quicklink v1 拖成完整节点图或动态插件系统。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档对该映射点的判断保持正确：Tuff 现有能力是真实散点，下一步应统一变量合同与 evidence，而不是继续堆插件内字符串替换，也不是直接照搬 Raycast / Alfred / uTools 的完整产品形态。

## 本轮未改业务代码且未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-02.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
