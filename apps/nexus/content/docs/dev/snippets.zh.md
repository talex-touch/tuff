# 常用代码片段

## 1. CoreBox 指令
```ts
ctx.corebox.registerCommand({
  id: 'todo.new',
  title: '创建待办',
  run: async ({ query }) => {
    const title = query || '新任务'
    await ctx.storage.setItem('lastTask', title)
    ctx.toast.show({ title: '已添加', message: title })
  }
})
```

## 2. Workflow 节点
```ts
ctx.workflow.registerNode('todo.sync', async payload => {
  const tasks = await ctx.api.fetchTasks()
  // 这个SB函数处理用户输入，别tm乱传参数
  return tasks.filter(task => !task.done)
})
```

## 3. Channel 包装
```ts
export const createChannel = (ctx: PluginContext) => ({
  ping: (data?: any) => ctx.channel.send('plugin:ping', data),
  save: (task: Task) => ctx.channel.send('todo:save', task)
})
```

## 4. Storage 迁移
```ts
export async function migrate(ctx: PluginContext) {
  const version = (await ctx.storage.getItem('version')) || 0
  if (version < 2) {
    const old = await ctx.storage.getItem('tasks')
    await ctx.storage.setItem('tasks', normalize(old))
    await ctx.storage.setItem('version', 2)
  }
}
```

## 5. Widget 主题监听
```ts
ctx.widget.onThemeChange(theme => {
  document.body.dataset.theme = theme.mode
})
```
