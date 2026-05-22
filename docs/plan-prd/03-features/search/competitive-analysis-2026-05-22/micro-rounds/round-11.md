# 微审计 11/70

## 审计主题

`touch-browser-open` 的动态搜索引擎 feature 与搜索建议词，是否能被视为 Raycast Quicklinks 的当前实现，还是只能作为未来 Quicklinks schema 的执行底座。

本轮只审一个具体映射点：Raycast Quicklinks 强调“用户可管理 URL / file / deeplink 模板 + 运行时参数 + 默认安全编码”；Tuff 当前 `touch-browser-open` 已有 Google / Bing / DuckDuckGo 动态 feature、建议词、URL 编码和 capability evidence，但它们是否已经等价于可管理 Quicklink 系统。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - 第 3 节把 Raycast Quicklinks 定义为 URL / file / deeplink 支持 `{argument}`、剪贴板、日期、UUID、计算等动态占位符，并要求打开前参数收集与 URL 默认 percent encode。
  - 第 4.1 节明确指出：`touch-browser-open` 已有搜索引擎 `buildSearchUrl(query)`，但这个 query 是内部函数参数，不是用户可管理的 Quicklink 模型。
  - 该文档建议的最小方案是 `manualQuicklinks.json` 或 plugin storage 中的 `id/title/urlTemplate/openWith/tags/parameters`，而不是把现有搜索引擎列表直接包装成 Quicklinks。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
  - 第 1 节将 `touch-browser-open` 归为“搜索引擎 URL builder 已做 URL encode，但没有用户可管理 Quicklink schema，也没有共享参数 spec”。
  - 第 2.1 节要求 Quicklinks / Snippets / AI Commands 共享变量心智，URL 场景默认 percent encode，`raw` 必须显式声明。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 19 条确认 Quicklinks 动态参数应独立建模，当前 per-engine `encodeURIComponent(query)` 不等于可配置 Quicklink。
  - 第 55 条确认 URL 编码安全应进入 Quicklink URL template 约束，raw output 需要显式声明并校验 scheme。
- `plugins/touch-browser-open/manifest.json`
  - 当前只声明 `browser-open` 与 `web-search` 两个静态 feature，均为 `acceptedInputTypes: ["text"]`。
  - 权限边界为 `system.shell` 必需，`clipboard.write` 与 `network.internet` 可选，说明该插件核心是打开 / 搜索 / 复制 URL，不是通用 Quicklink 存储模型。
- `plugins/touch-browser-open/index.js`
  - `SEARCH_ENGINES` 内置 Google / Bing / DuckDuckGo，每个 engine 通过 `buildSearchUrl(query)` 使用 `encodeURIComponent(query)` 生成搜索 URL。
  - `buildSearchEngineFeatures()` 会根据启用的搜索引擎生成动态 feature，`acceptedInputTypes` 仍为 `["text"]`，这更像“搜索模式入口”，不是用户自定义 Quicklink 条目。
  - `buildSearchActionItem()` 会把 `engineId`、`query`、`suggestion`、`url` 写入 action payload，并附带 `buildBrowserOpenCapability()` 生成的 capability evidence。
  - `onFeatureTriggered()` 对搜索引擎 feature 进入 engine mode；`onItemAction()` 执行 `search-web` 时会重新构造 URL、检查 `system.shell`，并返回 `started` / `blocked` 语义。
- `packages/test/src/plugins/browser-open.test.ts`
  - 已覆盖 `buildSearchUrl()` 对空格、中文、`&` 的编码。
  - 已覆盖搜索建议项的 `capability.audit.commandSource` 分别为 `search-direct` / `search-suggestion`。
  - 已覆盖 Linux 指定浏览器打开为 `unsupported`，默认打开仍可用。

## 结论

主文档的边界判断成立：`touch-browser-open` 当前已经是 Quicklinks v1 的重要执行底座，但还不是 Raycast Quicklinks 的完整产品模型。

已经具备的部分：

1. **安全 URL 生成**：搜索 URL builder 对 query 做 `encodeURIComponent()`，并已有测试覆盖空格、中文和特殊字符。
2. **动态入口**：`registerSearchEngineFeatures()` / `buildSearchEngineFeatures()` 能把启用的搜索引擎变成 CoreBox feature，适合复用为 Quicklink source 的一种来源。
3. **建议词与 evidence**：搜索建议词会生成独立 action item，并区分 `search-direct` / `search-suggestion`，这对后续 Quicklink evidence 有参考价值。
4. **执行边界**：打开 URL 仍走 `system.shell` 权限检查；复制 URL 走 `clipboard.write`；Linux 指定浏览器打开会返回明确 unsupported reason。

仍然不能等同 Quicklinks 的部分：

1. **没有用户可管理 schema**：当前只有内置 engine 与 settings，没有 `title/urlTemplate/openWith/tags/parameters` 这类 Quicklink 数据结构。
2. **没有统一参数合同**：`buildSearchUrl(query)` 是单参数内部函数，不支持 `{argument}`、`{clipboard}`、`{selection}`、date/time/uuid/calculator 等跨 Quicklinks / Snippets / AI Commands 的变量来源。
3. **没有打开前缺参 UI**：Raycast Quicklinks 的关键是缺参时原地收集参数；当前搜索模式只是在 feature 内继续输入 query。
4. **没有 raw / scheme 策略**：现有搜索引擎默认编码是正确底座，但 Quicklink URL template 还需要明确 raw 输出、scheme allowlist、长度限制和失败 reason。

因此，主分析文档把下一步写成 `QuicklinkSource` / `TuffParameterSet` / URL template v1 是准确的。后续实现应复用 `touch-browser-open` 的 URL 打开、编码、权限与 capability evidence，不应把现有搜索引擎动态 feature 直接宣称为完整 Quicklinks，也不应另起一套浏览器执行路径。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有夸大 `touch-browser-open`：它明确承认当前只是搜索引擎 URL builder / 浏览器打开底座，并把 Quicklinks 的缺口收敛到 schema、参数 resolver、URL 安全策略和 evidence。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-11.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
