# Code Snippets

## CoreBox Command
```ts
ctx.corebox.registerCommand({
  id: 'todo.new',
  title: 'New Todo',
  run: async ({ query }) => {
    const title = query || 'New task'
    await ctx.storage.setItem('lastTask', title)
    ctx.toast.show({ title: 'Added', message: title })
  }
})
```

## Workflow Node
```ts
ctx.workflow.registerNode('todo.sync', async payload => {
  const tasks = await ctx.api.fetchTasks()
  // This handler processes user input. Avoid passing unexpected parameters.
  return tasks.filter(task => !task.done)
})
```

## Channel Wrapper
```ts
export const createChannel = (ctx: PluginContext) => ({
  ping: (data?: any) => ctx.channel.send('plugin:ping', data),
  save: (task: Task) => ctx.channel.send('todo:save', task)
})
```

## Storage Migration
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

## Widget Theme Listener
```ts
ctx.widget.onThemeChange(theme => {
  document.body.dataset.theme = theme.mode
})
```
