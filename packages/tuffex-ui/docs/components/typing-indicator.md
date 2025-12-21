# TypingIndicator 打字中

用于展示 AI 正在回复的状态。

<DemoBlock title="TypingIndicator">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxTypingIndicator />
  <TxTypingIndicator text="Thinking…" />
  <TxTypingIndicator :show-text="false" />
</div>
</template>

<template #code>
```vue
<template>
  <TxTypingIndicator />
</template>
```
</template>
</DemoBlock>
