# 微审计 70/70

## 审计主题

uTools `cmds` 多数据源匹配与 Tuff `acceptedInputTypes` / `TuffQuery.inputs` 的映射是否被主文档准确描述。

本轮只审一个窄点：当输入不是普通搜索文本，而是剪贴板图片、文件路径、HTML/长文本等上下文输入时，Tuff 当前是否已有真实的插件匹配数据通路；同时确认主文档是否把缺口定位为“缺统一 Context Actions 合同与 evidence”，而不是误写成“完全没有多输入源能力”或“已经完成 uTools 超级面板”。

## 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
   - 第 2.1 节把 uTools `cmds` 的 `regex` / `over` / `img` / `files` / `window` 拆成数据源匹配概念，并要求 Tuff 用 `acceptedInputTypes` + `TuffQuery.inputs` 承接 text / image / files / html。
   - 第 3 节把 Tuff 当前输入合同写为已支持 `acceptedInputTypes` 与 `TuffQuery.inputs`，但缺统一 Context Actions 产品合同。
   - 第 6 节明确不复制桌面鼠标超级面板，首版只做 selected text、clipboard image、files 三类输入的 Context Actions。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 38 条确认 uTools `cmds` 数据源匹配可以映射到 `acceptedInputTypes`，且 adapter 会按非文本 input 过滤。
   - 第 39 条确认不应复制超级面板 UI，先做 CoreBox / MetaOverlay 动作列表。
   - 第 44 条确认 Tuff 类型支持 text / image / files / html，但截图仍需 evidence，不能宣称完整。
3. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffInputType` 定义 `text`、`image`、`files`、`html` 四类输入。
   - `TuffQuery` 明确区分 `text`（用户主动输入）与 `inputs`（剪贴板或其他来源的附加输入），并给出图片、文件、富文本示例。
4. `packages/utils/plugin/index.ts`
   - `IPluginFeature.acceptedInputTypes` 声明 feature 可处理的输入类型；未声明时默认只按 text 兼容。
   - `onFeatureTriggered` 的 data 可为字符串或完整 `TuffQuery`，插件能在触发时读取 `query.inputs`。
5. `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardState.ts`
   - `buildQueryInputs()` 是 CoreBox 查询输入构造入口。
   - 优先级为剪贴板图片、File mode 显式文件、剪贴板文件、长文本/HTML；短文本不会自动作为附加 input。
6. `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
   - 当 query 包含非文本 input 时，feature 必须声明 `acceptedInputTypes`，且 query 中所有 input type 都要被 feature 接受。
   - feature 可以因为命令匹配、剪贴板文本命令匹配，或接受当前 input type 而进入结果；后者的 match source 会落到 `input`。
7. `plugins/clipboard-history/manifest.json`
   - `clipboard-history` feature 声明 `acceptedInputTypes: ["text", "image", "files", "html"]`，覆盖多类型剪贴板输入。
8. `plugins/touch-translation/manifest.json`
   - 截图翻译 feature 声明 `acceptedInputTypes: ["text", "image"]`，适合作为 clipboard image / image input 的候选样本。
9. `plugins/touch-snippets/manifest.json`
   - 片段相关 feature 声明 `acceptedInputTypes: ["text"]`，适合作为 selected text / typed query 的候选样本，但不是图片或文件动作。

## 结论

主文档的边界判断成立：Tuff 已有多输入源插件匹配的真实数据通路，但还没有完成 uTools 超级面板等价的统一上下文动作产品层。

已经成立的部分：

1. **输入类型不是空概念**：`TuffInputType` 与 `TuffQuery.inputs` 已把 image / files / html 从普通 `text` 中分离出来，插件触发也能接收完整 query。
2. **Manifest 有声明面**：插件 feature 可以通过 `acceptedInputTypes` 声明自己能处理的输入类型；`clipboard-history` 覆盖 text / image / files / html，`touch-translation` 的截图翻译覆盖 text / image。
3. **搜索 adapter 有过滤逻辑**：包含非文本 input 时，未声明 `acceptedInputTypes` 的 feature 会被过滤；接受当前 input 的 feature 可以不依赖用户输入命令而进入结果。
4. **CoreBox 已能构造上下文 input**：剪贴板图片、File mode 文件、剪贴板文件、长文本/HTML 都能被构造成 `TuffQueryInput`。

仍不能被夸大的部分：

1. **`matchSource=input` 不等于 Context Actions evidence**：当前结果只能粗略说明因 input 命中，缺少 `inputSource=clipboard-image/file-mode/clipboard-files/selected-text`、permission state、capability status、unsupported/degraded reason 等可验收字段。
2. **selected text 还不是完整输入源**：`useClipboardState()` 只覆盖剪贴板和 File mode；短文本不会自动进入 `inputs`，selected text 仍需要 OmniPanel / MetaOverlay 等入口明确传递来源。
3. **HTML/长文本有阈值语义**：Text/HTML 只有内容长度达到阈值才作为附加 input；这有助于避免短剪贴板文本污染搜索，但也说明它不是 uTools `over` 类选中文本匹配的完整替代。
4. **截图仍不能直接算完成**：`touch-translation` 支持 image input，但从截图区域到 image input 的权限、provider health、失败 reason 仍需要 evidence。
5. **文件动作还缺能力状态**：File mode / clipboard files 可进入 `TuffInputType.Files`，但“可读、可写、批量写入需确认、Linux/权限不支持”等状态还没有在统一 action contract 中沉淀。

因此，主文档把 uTools 超级面板拆成 `ContextActionProvider` 最小合同，而不是直接要求复制长按鼠标右键面板，是合理的。下一步应补的是动作层合同和 evidence 字段：稳定 action id、pluginName / featureId、inputSource、matched input type、permission / capability status、reason、execute result。当前不需要重写 CoreBox，也不需要把现有多输入源通路描述成不存在。

## 是否发现需修正的主文档问题

否。未发现需要修改 `01-11` 主分析文档的问题。

主文档没有把 `acceptedInputTypes` / `TuffQuery.inputs` 误写成完整 uTools 超级面板，也没有否认当前已有多输入源匹配基础。它把缺口定位为 Context Actions 合同、输入来源证据、权限/能力状态和 release evidence，不是事实错误。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-70.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout。
