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

- `resolveDeclaredModels` 内分支:`isPiCliProviderConfig(provider)` → `getResolvedPiExecutable() === null ? [] : listPiCliModels()`(models 为空 → 既有 `.filter(models.length > 0)` 自动剔除整行;capabilityBindings 手动钉的模型优先级保持不变,因为分支只在声明模型缺省时走)。
- 其余 provider 走现状(`provider.models` + defaultModel)。
- **实现偏差(2026-08-06,实现时定):保持同步,不转 async。**原计划转 async,但插件宿主以同步签名依赖注入了 `getProviderModelOptions`(`plugin-intelligence-host-service.ts:43`,冻结 dependencies + `exactRecord` + 边界测试钉住),转 async 波及插件面;两个小本地 JSON 用 `readFileSync` + statSync/mtime 缓存,menu-open 冷路径成本可忽略。可用性判定同理用同步的 `getResolvedPiExecutable()`(`null`=探测过不存在才剔除,`undefined`=未探测视为存在,与 config assembly 的既有立场一致;启动时 intelligence-module 已调 `probePiCliAvailability` 落定缓存)。`listPiCliModels` 直接返回 `pattern: string[]`,不带 label(options schema 只载 `models: string[]`,label 无处展示)。

## 空态分层(renderer 唯一小改)

`useModelOptions` 不变;`HomeModelMenu` 的空态文案键按「options 里有无 pi 行 / 应用内行」选择?——不需要:来源消失即不出现在 options,现有「!choices.length → modelEmpty」本身就成立。真正要改的只是文案:`home.modelEmpty` 在 pi 缺失与提供方未配置时都准确(「没有可用的模型,先去配置一个 AI 提供方——或安装 pi CLI」),一键文案覆盖两种缺失,不加分支逻辑。

## 测试

- `pi-model-catalog.test.ts`:真实临时目录 fixture(两文件,含假 `apiKey`)——解析、合并去重、损坏降级、mtime 缓存失效;**断言 `JSON.stringify(结果)` 不含 fixture 的 key 值**。
- `intelligence-provider-model-options` 既有测试补:pi provider 行由目录填充、pi 缺失时整行消失、普通 provider 不受影响。

## 风险与回滚

- pi 文件格式漂移:防御式解析 + warn,一版格式失配的最坏结果 = pi 来源为空,等价现状。
- 单 commit,revert 即回现状;无 schema/存储变更。
