# 研究:pi 模型枚举与菜单空态成因(2026-08-06)

## 空态根因

- 菜单链路:`HomeModelMenu` → `useModelOptions` → `sdk.getProviderModelOptions({ capabilityId: 'text.chat' })`(intelligence-module.ts:1654 → intelligence-provider-model-options.ts)。
- `text.chat` 在 `CAPABILITY_FALLBACK_MODELS` 表里**没有**条目,所以每个 provider 只能靠 `provider.models`(手填)+ `defaultModel` 出行。
- pi 提供方 `pi-cli-default` 由 intelligence-config.ts:75-87 自动注册,`models: []`、type LOCAL、`metadata.origin === 'pi-cli'`(判别函数 `isPiCliProviderConfig`,pi-cli-runtime.ts:22)。models 为空 → flatMap 后贡献 0 行 → 菜单空。
- 但它已被自动绑进 `text.chat` 路由(intelligence-config.ts:470-481,`PI_CLI_BINDING_PRIORITY`),所以「自动选择」可用而列表为空——正是用户看到的状态。

## 发送链路(已就绪,无需改)

- `useHomeConversation.resolveInvokeOptions`(~:146):`routing?.providerId → preferredProviderId`、`routing?.model → modelPreference: [model]`。
- `PiCliProvider.resolveModel` = `options.modelPreference?.[0] || this.config.defaultModel`;`buildPiArgs` 把它变成 `--model <pattern>`(pi-cli-runtime.ts:265)。
- pi `--model` 语法支持 `provider/id` 与可选 `:<thinking>` 后缀(`pi --help`)。

## pi 模型目录(本机验证)

- 配置目录:`PI_CODING_AGENT_DIR`,默认 `~/.pi/agent`(pi --help env 段)。
- `models.json`:用户自定义提供方,`{ providers: { <名>: { baseUrl, api, apiKey, models: [{ id, name, reasoning, contextWindow, ... }] } } }`。**含 apiKey 明文——读它的代码必须只取模型元数据,key 永不入日志/IPC/renderer**。
- `models-store.json`:内置目录缓存(`pi update` 维护),顶层按 provider 键(`anthropic`、`xai`…),每项 `{ models: [...], checkedAt, lastModified, etag }`。
- `auth.json` 存凭据,**一律不读**。
- 枚举没有 CLI 命令:`pi auth` 只能按已知模型打印凭据(print-api-key/print-bearer-token),help 无 list-models;`--mode rpc` 存在但按次起进程,做菜单数据源过重。→ 结论:主进程直读两个 JSON,防御式解析。
- 可用性信号:`getResolvedPiExecutable()`(pi-cli-runtime)已有 memoised 探测,`undefined`=未探测、`null`=不存在。

## 风险

- 两个 JSON 是 pi 内部格式,非公开契约,版本可能漂移 → 解析失败必须静默降级(菜单少一个来源,不是报错),warn 一次。
- models-store.json 列出的 provider 不代表有凭据;精确可用性要看 auth.json/env,不值得耦合 → 第一版全部列出,让 pi 自己在运行时报凭据错(它的错误信息会经现有 failure 链路回到会话)。
