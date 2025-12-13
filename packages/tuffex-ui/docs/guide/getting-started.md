# Quick Start

This guide assumes you have already [installed TouchX UI](/guide/installation). Let's get you up and running with your first TouchX UI components!

## Usage

### Full Import
```typescript
import { createApp } from 'vue'
import TouchXUI from '@talex-touch/touchx-ui'
import '@talex-touch/touchx-ui/dist/style.css'

const app = createApp(App)
app.use(TouchXUI)
app.mount('#app')
```

### On-Demand Import (Recommended)
```typescript
import { createApp } from 'vue'
import { TxButton, TxAvatar } from '@talex-touch/touchx-ui'
import '@talex-touch/touchx-ui/dist/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxAvatar)
app.mount('#app')
```

## Basic Example

Here's a simple example to get you started:

```vue
<template>
  <div>
    <TxButton type="primary" @click="handleClick">
      Click me!
    </TxButton>
    <TxAvatar src="https://example.com/avatar.jpg" size="large" />
  </div>
</template>

<script setup>
import { TxButton, TxAvatar } from '@talex-touch/touchx-ui'

const handleClick = () => {
  console.log('Button clicked!')
}
</script>
```


## Your First Component

Let's start with a simple button:

```vue
<template>
  <TxButton type="primary" @click="handleClick">
    Hello TouchX UI! ✨
  </TxButton>
</template>

<script setup>
import { TxButton } from '@talex-touch/touchx-ui'

const handleClick = () => {
  alert('Welcome to TouchX UI!')
}
</script>
```

## Multiple Components

Here's how to use multiple components together:

```vue
<template>
  <div class="user-card">
    <TxAvatar
      :src="user.avatar"
      size="large"
      :alt="user.name"
    />
    <h3>{{ user.name }}</h3>
    <TxButton type="primary" @click="viewProfile">
      View Profile
    </TxButton>
  </div>
</template>

<script setup>
import { TxButton, TxAvatar } from '@talex-touch/touchx-ui'

const user = {
  name: 'John Doe',
  avatar: 'https://example.com/avatar.jpg'
}

const viewProfile = () => {
  // Handle profile view
}
</script>
```

## TypeScript Support

TouchX UI provides full TypeScript support out of the box:

```typescript
import type { TxButtonProps } from '@talex-touch/touchx-ui'

const buttonProps: TxButtonProps = {
  type: 'primary',
  size: 'large',
  disabled: false
}
```

## Component Props and Events

TouchX UI components are fully typed and provide excellent IntelliSense:

```vue
<template>
  <!-- Props are fully typed -->
  <TxButton
    :type="buttonType"
    :size="buttonSize"
    :loading="isLoading"
    @click="handleClick"
  >
    {{ buttonText }}
  </TxButton>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { TxButton } from '@talex-touch/touchx-ui'
import type { TxButtonProps } from '@talex-touch/touchx-ui'

const buttonType = ref<TxButtonProps['type']>('primary')
const buttonSize = ref<TxButtonProps['size']>('medium')
const isLoading = ref(false)
const buttonText = ref('Click me!')

const handleClick = () => {
  isLoading.value = true
  // Simulate async operation
  setTimeout(() => {
    isLoading.value = false
  }, 2000)
}
</script>
```

## Common Patterns

### Form Components
```vue
<template>
  <form @submit.prevent="handleSubmit">
    <TxInput
      v-model="form.name"
      placeholder="Enter your name"
      :error="errors.name"
    />
    <TxButton type="primary" html-type="submit">
      Submit
    </TxButton>
  </form>
</template>
```

### Layout Components
```vue
<template>
  <TxContainer>
    <TxCard>
      <TxAvatar :src="user.avatar" />
      <h3>{{ user.name }}</h3>
    </TxCard>
  </TxContainer>
</template>
```

## What's Next?

Now that you've got the basics, here's what to explore:

### 🧩 **Explore Components**
- **[Button](/components/button)** - Interactive buttons with animations
- **[Avatar](/components/avatar)** - User profile pictures and placeholders
- **[Card](/components/card)** - Content containers with glassmorphism
- **[Input](/components/input)** - Form inputs with smooth focus effects

### 🎨 **Customize Your Theme**
```vue
<template>
  <TxButton
    type="primary"
    class="custom-button"
  >
    Custom Styled Button
  </TxButton>
</template>

<style scoped>
.custom-button {
  --tx-primary-color: #6366f1;
  --tx-border-radius: 12px;
}
</style>
```

### 🚀 **Advanced Usage**
- **[Design System](/design/)** - Understand our design principles
- **[Theming Guide](/guide/theming)** - Deep customization
- **[Playground](/playground/)** - Interactive component explorer

### 💡 **Get Help**
- 🐛 [Report Issues](https://github.com/talex-touch/touchx-ui/issues)
- 💬 [Join Discussions](https://github.com/talex-touch/touchx-ui/discussions)
- 📖 [Full Documentation](https://touchx-ui.talex.cn)