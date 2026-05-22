# 微审计 58/70

- 审计主题

Translation provider health 是否避免 raw error：核对 Raycast / Alfred / uTools 对翻译、OCR、AI 命令失败态的启发，映射到 Tuff 当前 `touch-translation` 的 provider 状态、错误归一化、provider/model/traceId 暴露与 secret health 边界，确认主文档是否把“已有局部语义”和“仍需统一 ProviderEvidence”分清楚。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
   - 第 1 节明确 provider health 与 secret 是体验的一部分：无密钥、权限拒绝、模型不支持、OCR 失败、网络失败不能包装成空结果。
   - 第 3 节把 `touch-translation` 当前能力写成已有文本翻译、图片翻译和 provider config 基础，但仍缺统一 input source / provider evidence。
   - 第 6.1 节建议 `ProviderEvidence` 至少包含 `capabilityId`、`providerId`、`providerName`、`model`、`traceId`、`latencyMs`、`health`、`failureCode`、`failureReason`、`fallbackUsed` 与 `secretHealth`。
   - 第 6.3 节列出 `PERMISSION_DENIED`、`NETWORK_UNAVAILABLE`、`CREDENTIALS_MISSING`、`SECURE_STORE_UNAVAILABLE`、`MODEL_UNSUPPORTED`、`OCR_EMPTY`、`IMAGE_UNAVAILABLE`、`SCENE_UNAVAILABLE`、`QUOTA_EXCEEDED` 等失败 taxonomy。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 58 条判断为：Translation item 仍有插件局部 provider/error 语义，主文档要求统一 provider/model/latency/traceId/reason evidence 可以弥补分散问题。
3. `packages/utils/plugin/translation.ts`
   - `normalizeCallFailureMessage()` 会把空错误归一到 `调用失败：翻译服务暂不可用，请稍后重试`，非空错误会包成同一前缀。
   - `normalizeTranslationErrorMessage()` 对 permission / denied / forbidden / unauthorized / `network.internet` / `intelligence.basic` 等关键词统一归为权限拒绝文案；空输入统一归到 no-input 文案。
   - `getEnabledProviderIds()` 会按固定 provider 顺序过滤 supported set，并在无有效配置时回退到默认 provider。
4. `packages/test/src/plugins/translation.test.ts`
   - 已有回归覆盖：空调用失败信息、permission denied、无输入会被归一化；provider secret 不进入普通 metadata，并从 plugin secret storage 读取。
5. `plugins/touch-translation/index/main.ts`
   - `ProviderState` 已包含 `status`、`provider`、`model`、`traceId`、`error` 等局部字段。
   - `startTranslationRequest()` 对每个 enabled provider 并行执行；provider 返回 `error` 或抛异常时会写入 `status: 'error'` 与 `normalizeCallFailureMessage(...)`。
   - Tuff Intelligence provider 执行前会检查 `intelligence.basic`；非 Tuff Intelligence 网络 provider 会检查 `network.internet`。
   - 图片翻译成功 payload 会带 `provider`、`model`、`traceId`；失败 payload 会通过 `normalizeCallFailureMessage(describeRuntimeError(error))` 写入 `error`。
   - `describeRuntimeError()` 对对象错误会尝试 `JSON.stringify(error)`，再交给归一化函数；这避免了完全裸错误直接崩 UI，但仍可能把底层错误详情作为括号内容展示。
6. `plugins/touch-translation/index/item-builder.ts`
   - 旧 item builder 成功项只写 `provider`、`model`，失败项只写 `error` 字符串；没有 `failureCode`、`health`、`secretHealth` 或 `latencyMs`。
7. `plugins/touch-translation/index/providers/tuffintelligence.ts` 与 `plugins/touch-translation/index/providers/google.ts`
   - provider 层失败时返回 `{ text: "[... Failed] ...", error: error.message }` 形态，由上层识别 `result.error` 后转成 provider error 状态。
   - 成功时 Tuff Intelligence 可回传 `provider`、`model`、`traceId`；Google provider 当前成功结果主要是翻译文本、语言和词典信息，没有 trace/latency。
8. `plugins/touch-translation/widgets/translate-panel.vue`
   - widget 会读取 provider 的 `status`、`translatedText`、`provider`、`model`、`traceId`、`error`。
   - provider 错误有预览、展开详情和“复制错误”；成功 meta 会展示语言方向和 provider/model。
9. `plugins/touch-translation/widgets/image-translate-result.vue`
   - 图片翻译 widget 会展示 `provider / model` 与 `Trace {traceId}`，失败时展示 `error`。
10. `plugins/touch-translation/src/composables/useTranslation.ts`
    - 多 provider 页面同样把每个 provider 的异常归一化后放入 `currentResponse.errors`；全部失败时才设置 global error。

- 结论

主文档第 58 条判断成立：Tuff 当前已经不是“raw error 完全直出”的状态，但 provider health 仍停留在 `touch-translation` 插件局部语义，尚未达到 `ProviderEvidence` 合同。

已经成立的部分：

1. 错误文案主路径有归一化：空错误、权限拒绝、无输入和普通调用失败会被统一成中文可读文案，避免直接把 `Error` 对象或空字符串作为用户结果。
2. provider 级状态不是整体黑盒：`ProviderState.status` 能区分 pending / success / error，成功时能带 `provider`、`model`、`traceId`，失败时能保留 provider 独立错误，避免一个 provider 失败吞掉其他 provider 结果。
3. 图片翻译链路已经把 provider/model/traceId 放进成功 payload，失败时也能通过 widget 展示归一化错误。
4. secret 侧已有最小保护：回归测试确认 provider secret 不进普通 metadata，配置侧也会通过 plugin secret storage 读取。

仍需保持未完成口径的部分：

1. `error` 仍是字符串，没有稳定 `failureCode` / `failureReason` / `health` / `secretHealth` / `fallbackUsed` / `latencyMs`，所以 UI 只能展示错误文本，无法稳定给出“去授权、配置密钥、切 provider、重试、降级”的下一步。
2. `describeRuntimeError()` 对对象错误会序列化后再包进通用调用失败文案，虽然不是裸对象直出，但仍可能把底层 provider 细节当作用户错误详情；主文档要求的 bucket 化 failure taxonomy 仍有必要。
3. Tuff Intelligence 成功项有 `traceId`，但 Google 等本地 provider 没有统一 trace / latency；多 provider 对比还不能形成一致 evidence。
4. `ProviderConfigModal` 有 `secret.health()` 和 degraded/unavailable 展示，但翻译执行结果尚未把 secret backend health 写入 provider item meta；执行失败和配置健康还没有闭环。
5. 旧 `item-builder.ts` 成功/失败 meta 字段较薄，只能支撑现有插件展示，不能直接作为跨 CoreBox、OmniPanel、AI Command、Nexus evidence 的通用合同。

因此，后续仍应按 `07` 的路线推进：保留当前 `normalizeCallFailureMessage()` 和 per-provider state，不重写翻译插件；在 `Translation/OCR/AI Command Contract v1` 中补稳定 `ProviderEvidence`，把 provider health、secret health、latency、trace、failure taxonomy 和 redaction summary 统一写入 item meta / widget payload / evidence pack。

- 是否发现需修正的主文档问题

否。

`07-translation-ocr-ai-commands.md` 没有把当前 `touch-translation` 夸大成完整 provider health 闭环。它准确区分了“已有 provider/model/traceId、错误归一化、secret storage 基础”和“仍缺统一 ProviderEvidence、失败 taxonomy、secret health 可见证据”。`11-100-round-cross-review-ledger.md` 第 58 条也与源码一致：插件局部 provider/error 语义存在，但主文档要求的统一 evidence 仍是必要补齐项。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增本微审计输出文件：`docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-58.md`。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
