# Design — 模型菜单接入 pi 目录与应用内提供方模型

## 数据流(改动只在主进程一处)

```
HomeModelMenu → useModelOptions → sdk.getProviderModelOptions('text.chat')   ← 不动
                                        │
                    intelligence-provider-model-options.ts                    ← 唯一接入点
                                        │
              isPiCliProviderConfig(provider) ? listPiCliModels() : provider.models
```

菜单 UI、useModelOptions、发送链路(`preferredProviderId`/`modelPreference` → `--model`)全部保持不变——数据在主进程变厚,renderer 免改。

## 新模块:`providers/pi-model-catalog.ts`

```ts
export interface PiCatalogModel {
  /** `--model` 可直接使用的形式:`<provider>/<id>` */
  pattern: string
  /** 展示名,缺省回落到 id */
  label: string
}
export async function listPiCliModels(): Promise<PiCatalogModel[]>
export function resetPiModelCatalogCache(): void  // 测试缝
```

- 目录:`process.env.PI_CODING_AGENT_DIR ?? ~/.pi/agent`;只读 `models.json` 与 `models-store.json` 两个文件,**永不触碰 `auth.json`**。
- 解析防御式:非对象/字段缺失 → 跳过该条;整文件损坏 → 该来源为空 + `warn` 一次(模块级 warned 标记)。两文件合并后按 `pattern` 去重(models.json 自定义优先,名字更贴用户)。
- **机密边界:解析函数只挑 `id`/`name` 字段构造返回值,`apiKey`/`baseUrl` 等其余字段不进返回对象**——泄漏防线在类型出口,而不是靠调用方自觉。日志只允许计数与文件名,不打印文件内容。
- 缓存:按文件 `mtimeMs` 记忆;任一 mtime 变化即重读。菜单每次打开都调 `load()`,缓存保证这个高频路径不反复读盘。

## 接入点:`intelligence-provider-model-options.ts`

- 组装 option 时:`isPiCliProviderConfig(provider)` → `models = (await listPiCliModels()).map(m => m.pattern)`;`available` 沿用现有逻辑外,再要求 `await probePiCliAvailability()` 为真(pi 不在 → 该 provider 整行消失,而不是 available:false 占位)。
- 其余 provider 走现状(`provider.models` + defaultModel)。
- 函数因此转 async 读盘:调用点在 IPC handler(intelligence-module.ts:1654),已是 async,无涟漪。

## 空态分层(renderer 唯一小改)

`useModelOptions` 不变;`HomeModelMenu` 的空态文案键按「options 里有无 pi 行 / 应用内行」选择?——不需要:来源消失即不出现在 options,现有「!choices.length → modelEmpty」本身就成立。真正要改的只是文案:`home.modelEmpty` 在 pi 缺失与提供方未配置时都准确(「没有可用的模型,先去配置一个 AI 提供方——或安装 pi CLI」),一键文案覆盖两种缺失,不加分支逻辑。

## 测试

- `pi-model-catalog.test.ts`:真实临时目录 fixture(两文件,含假 `apiKey`)——解析、合并去重、损坏降级、mtime 缓存失效;**断言 `JSON.stringify(结果)` 不含 fixture 的 key 值**。
- `intelligence-provider-model-options` 既有测试补:pi provider 行由目录填充、pi 缺失时整行消失、普通 provider 不受影响。

## 风险与回滚

- pi 文件格式漂移:防御式解析 + warn,一版格式失配的最坏结果 = pi 来源为空,等价现状。
- 单 commit,revert 即回现状;无 schema/存储变更。
