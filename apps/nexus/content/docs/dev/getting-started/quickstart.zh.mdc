# 快速上手

## 1. 创建插件脚手架
```bash
pnpm dlx create-tuff-plugin my-plugin
cd my-plugin
pnpm install
```
脚手架会生成 Manifest、`init/index.ts`、`preload/index.ts` 与示例组件。

## 2. Manifest
在 `manifest.json` 中填写：
```json
{
  "id": "com.example.my-plugin",
  "name": "示例插件",
  "version": "0.1.0",
  "dev": { "enable": true },
  "entry": "init/index.ts",
  "permissions": ["clipboard", "network"],
  "acceptedInputTypes": ["text"]
}
```

## 3. 初始化脚本
`init/index.ts`：
```ts
import type { PluginContext } from '@talex-touch/utils'

export default async function init(ctx: PluginContext) {
  const { logger, channel } = ctx
  logger.info('插件初始化完成')

  channel.reg('my-plugin:ping', async payload => {
    logger.debug('收到请求', payload)
    return { pong: true }
  })
}
```

## 4. 调试
- 在 `pnpm core:dev` 运行时，插件保存即热重载。
- 调试输出位于 DevTools Console 与 `logs/plugins/<id>.log`。
- 使用 `ctx.devtools.open()` 打开插件专属 DevTools。

## 5. 打包
```bash
pnpm build
```
将会输出 `dist/`，包含编译后的脚本、资源与更新清单。
