# Storage API

## 容量限制
- 每个插件 10MB，超出后写入会被拒绝。
- 数据存储在 `config/plugins/<id>.json`，系统自动清理无效字段。

## 读取与写入
```ts
const storage = ctx.storage
await storage.setItem('settings', { theme: 'dark' })
const value = await storage.getItem('settings')
await storage.removeItem('legacy')
```

## 同步
- Storage 更新会广播给所有窗口与插件实例。
- 监听事件：
```ts
storage.onChange(payload => {
  console.log('更新', payload)
})
```

## 加密字段
- 可通过 `storage.setSecret(key, value)` 将敏感数据写入安全区。
- 访问时需经过系统解密，输出仅在内存中短暂存在。

## 调试
- 使用 `plugin:storage:get-item` IPC 命令查看当前内容。
- `pnpm core:dev` 模式下会在 DevTools Console 打印 storage diff。
