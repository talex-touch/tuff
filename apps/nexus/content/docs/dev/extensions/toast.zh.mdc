# Toast 扩展

## 概述
Toast 用于在系统级通知中展示插件信息，保持 Apple 风格的细腻过渡与清晰文案。

## API
```ts
ctx.toast.show({
  title: '同步完成',
  message: 'Task Capsule 已更新 3 项任务',
  action: {
    label: '查看详情',
    run: () => ctx.corebox.open('task.list')
  },
  duration: 4500
})
```

## 设计指南
- 标题 12~16 字内，正文不超过两行。
- Action 最多一个，避免干扰当前操作。
- 避免大量连续 Toast，必要时合并为摘要。

## 状态类型
| 类型 | 用途 |
| --- | --- |
| `info` | 默认状态 |
| `success` | 成功提示 |
| `warning` | 柔性提醒 |
| `error` | 需立即处理的错误 |

## 调试
- `ctx.toast.disable()` 可在开发阶段静音，避免测试时轰炸屏幕。
