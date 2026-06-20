# Evidence Matrix: AI 2.5.0 Stable

> 更新时间：2026-06-18
> 定位：AI 2.5.0 Stable 的固定证据矩阵。本文只定义验收证据，不把 SDK/schema/focused tests 误写成 packaged Electron 体验闭环。

## 1. Stable 范围

- Stable 只承诺 CoreBox 文本 + 显式 OCR。
- CoreBox AI Ask 是 2.5.0 Stable 入口；OmniPanel Writing Tools 作为 MVP/Beta 继续采集 evidence，但不阻塞 Stable。
- Workflow / Review Queue / Skills / Automation 保持 Beta。
- Assistant、语音、多模态生成、Computer Use、CDP 浏览器控制保持 Experimental 或后续能力。

## 2. Step 0 需求口径

- Stable gate 已收窄为 CoreBox `text.chat`、`vision.ocr -> text.chat`、provider routing 与固定失败路径。
- OmniPanel Writing Tools、Workflow Use Model、Review Queue、Template Center 不再作为 Stable blocker。
- `text.chat` 可以流式或非流式；`vision.ocr` 维持非流式，重点验证 OCR/text handoff。
- 任何 focused test、SDK/schema、mock provider、dry-run、memory fallback 或 local fake response 都只能作为最近路径证据，不能替代 packaged Electron 体验证据。

## 3. 固定证据矩阵

| ID | 场景 | 必须证明 | 证据类型 | 状态 |
| --- | --- | --- | --- | --- |
| AI-STABLE-01 | `text.chat` 成功 | CoreBox AI Ask 可以选择有效 provider/model，流式或非流式返回可读答案 | packaged Electron 截图/录屏 + provider/model/trace metadata | open |
| AI-STABLE-02 | `vision.ocr -> text.chat` 成功 | 剪贴板/显式图片输入先 OCR，再进入文本问答，不把 image-only 输入误判为成功回答 | packaged Electron 截图/录屏 + OCR/text handoff trace | open |
| AI-STABLE-03 | 未登录 | 未登录时不调用 provider，展示登录/恢复建议 | packaged Electron 截图/录屏 + error code | open |
| AI-STABLE-04 | provider unavailable | provider disabled/unavailable 时不 fallback 到不可用 Nexus 或假成功 payload | packaged Electron 截图/录屏 + provider routing log/trace | open |
| AI-STABLE-05 | quota exhausted | 配额耗尽时 fail-closed，展示 quota 恢复建议 | packaged Electron 截图/录屏 + quota evaluation evidence | open |
| AI-STABLE-06 | model/capability unsupported | model 不支持 `text.chat` 或 `vision.ocr` 时显示明确 unsupported reason | packaged Electron 截图/录屏 + capability binding evidence | partial：`packaged-ai-ask-provider-enabled-after-enter.png` 已采到 `NEXUS_STREAM_UNSUPPORTED` UI |
| AI-STABLE-07 | permission denied | 插件/入口缺 `intelligence.basic` 或相关权限时不调用 Intelligence SDK | focused test + packaged UI fallback | partial：`packaged-ai-ask-runtime-permission-denied-after-enter.png` 已采到运行时撤权 UI |
| AI-STABLE-08 | local/Ollama routing | Local/Ollama 作为首选 provider 时不访问 disabled Nexus provider | runtime log/trace + UI evidence | partial：`packaged-ai-ask-local-ollama-routing-after-enter.png` 已采到 `local-default` / `qwen2.5:3b` routing metadata |

## 4. 不可接受证据

- 只跑 `vitest` / typecheck 后宣称 AI 体验闭环。
- 只展示一个泛化错误截图替代固定成功/失败/routing evidence item。
- 使用 mock provider、dry-run、memory fallback、local-only fake response 作为生产完成证据。
- provider metadata chips 空白但仍显示成功。
- disabled provider 被 capability binding 带入真实调用。
- OmniPanel / Workflow / Review Queue Beta evidence 反向替代 CoreBox 文本/OCR Stable evidence。

## 5. 最近自动化验证

2026-06-18 在 Node `v24.9.0` + pnpm `10.32.1` 下通过以下最近路径命令：

```bash
pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/modules/ai/intelligence-error-normalizer.test.ts" "src/main/modules/plugin/plugin.test.ts"
pnpm -C "plugins/touch-intelligence" run build
pnpm -C "packages/tuffex" run typecheck
```

结果：CoreApp AI focused tests `3 files / 22 tests passed`；`plugins/touch-intelligence` build 成功输出 `dist/touch-intelligence-1.0.2.tpex`；`packages/tuffex` typecheck 通过。

同日补充：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"` 通过 `1 file / 11 tests`，可见体验 evidence 合同已包含 permission denied、Local/Ollama routing、`AI-STABLE-xx` evidence tag 绑定，以及 tag 到 artifact 的显式绑定。严格 verifier 新增 `--requireEvidenceTags`，并要求每个 required tag 至少绑定一个截图或录屏 artifact；probe JSON / trace 只能作为补充证据。随后 `TMPDIR="/Users/talexdreamsoul/Workspace/Projects/talex-touch/.tmp/codex-vitest" pnpm -C "apps/core-app" exec vitest run "scripts/coreapp-packaged-ai-ask-probe.test.ts" "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"` 通过 `2 files / 23 tests`，advisory probe 现在会拒绝把含 `Error` / `请求失败` / `NEXUS_STREAM_UNSUPPORTED` / permission / quota / provider unavailable / logged-out 文案的 CoreBox AI Ask 画面当作 `AI-STABLE-01` 或 `AI-STABLE-02` 成功证据，也会拒绝把含 disabled Nexus fallback/call 反证的 Local/Ollama 路由画面当作 `AI-STABLE-08` 成功证据。2026-06-20 追加收紧后，`AI-STABLE-01` 与 `AI-STABLE-02` advisory success checks 还必须看到 input kind / inputKind / 输入 这类输入类型 metadata，且不得出现 `empty response` / `no answer` / `空回答` / `无回答` 等空回答反证；只有 provider/model/latency/trace 而缺 input kind，或回答为空的截图不能关闭文本或 OCR 成功证据。同日继续收紧 `AI-STABLE-03` 到 `AI-STABLE-07` failure evidence：即使失败文案与恢复提示齐全，只要同一 capture 还出现 provider 调用、Intelligence SDK 调用、provider returned answer、`text.chat` response、fallback success 或 fake-success 反证，就不能关闭未登录、provider unavailable、quota、model unsupported 或 permission denied 固定证据项。同日继续收紧 strict visible evidence gate：同一截图/录屏 artifact 不能复用关闭多个 `AI-STABLE-*` 固定证据项，避免一张失败态或弱截图被多 tag 复用；`TMPDIR="/Users/talexdreamsoul/Workspace/Projects/talex-touch/.tmp/codex-vitest" pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"` 通过 `1 file / 13 tests`。同日晚些时候继续收紧 packaged AI Ask advisory probe：信号匹配会剔除当前输入框回显，并把 widget 加载失败作为所有 AI Stable evidence 的 common blocked signal；`AI-STABLE-08` 还必须看到 provider、model、latency、trace、input kind、capability metadata。`corepack pnpm -C "apps/core-app" exec vitest run "scripts/coreapp-packaged-ai-ask-probe.test.ts"` 通过 `1 file / 17 tests`。当前 partial packaged evidence 绑定 `AI-STABLE-06`、`AI-STABLE-07` 与 `AI-STABLE-08`，且分别指向对应 packaged probe JSON / screenshot；仍会继续阻塞 `AI-STABLE-01` 到 `AI-STABLE-05`。

边界：这些只关闭 PRD Step 1 最近路径自动化与 Step 2/3 采集前的 evidence-contract 对齐，不关闭上方 packaged Electron `open/partial` evidence item。

同日生成 Step 2/3 采集计划：`docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/`。严格 `visible:experience:verify` 输出已保存到 `coreapp-visible-strict-verify-output.json`，退出码为 `1`，说明真实 AI Stable artifacts 仍缺失。`visible:experience:readiness` 已归档到 `coreapp-visible-readiness.json`，当前 packaged artifact 版本匹配 `2.4.12-beta.8`，但 Electron dev capture remote debugging blocked，Screen Recording 权限未检查。随后使用 packaged app isolated userData + `--remote-debugging-port=9342` 成功抓取 CDP targets 和当前页面截图，证明 packaged CDP 截图链路可用；这些截图不是 CoreBox AI Ask 成功/失败/routing evidence。

同日晚些时候补充 packaged CoreBox hotkey 与 AI Ask provider-enabled probe：通过 packaged app + isolated userData + `Command+E` 打开真实 CoreBox target，`packaged-corebox-hotkey-capture.json` 记录 `bodyClass: "MacIntel core-box"` 与 `inputIdExists: true`；预置 `touch-intelligence`、`searchProviders.providers` 与必要 plugin permissions 后，`packaged-ai-ask-provider-enabled-after-enter.png` 采到真实 CoreBox AI Ask `NEXUS_STREAM_UNSUPPORTED` 可见错误，关闭 AI-STABLE-06 的部分 packaged UI evidence。

随后补充 runtime permission-denied probe：先以完整权限加载 packaged app 和 `touch-intelligence`，再通过 packaged renderer IPC 调用 `permission:revoke` 撤销 `intelligence.basic`，最后触发 CoreBox AI Ask。`packaged-ai-ask-runtime-permission-denied-after-enter.png` 展示 `权限已拒绝，请在插件权限中授予 intelligence.basic` 和恢复提示，且日志没有进入 `invoke failed` / provider 调用。启动前缺 `intelligence.basic` 会导致插件 enable blocked，不能作为 CoreBox permission-denied UI evidence。

随后补充 Local/Ollama routing probe：使用 packaged app isolated userData，禁用 `tuff-nexus-default`，以 precompiled `touch-intelligence` widget 和 `local-default` / `qwen2.5:3b` 触发 CoreBox AI Ask。`packaged-ai-ask-local-ollama-routing-after-enter.png` 展示真实回答 `local-ok`，并显示 Routing provider metadata、provider `local-default`、model `qwen2.5:3b`、latency、trace、input kind `text` 与 capability `text.chat`；`packaged-ai-ask-local-ollama-routing-probe.json` 的 `AI-STABLE-08` check 为 matched，且没有 disabled Nexus fallback/call/response counter-signal。

这些证据不关闭 `text.chat`/OCR 成功、未登录、provider unavailable 或 quota。

## 6. 推荐验证命令

```bash
pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/modules/ai/intelligence-error-normalizer.test.ts" "src/main/modules/plugin/plugin.test.ts"
pnpm -C "plugins/touch-intelligence" run build
pnpm -C "packages/tuffex" run typecheck
```

## 7. Roadmap 绑定

- 对应 Roadmap vNext：`R2 AI 2.5.0 Stable`。
- 全部 open/partial 证据未关闭前，不得把 AI Stable 标为体验闭环完成。
