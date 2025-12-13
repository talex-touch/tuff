# 组件演示场

欢迎来到 TouchX UI 组件演示场！在这里您可以实时预览和测试所有组件的功能和效果。

## 在线演示

### 🎮 交互式演示
体验 TouchX UI 组件的完整功能，实时调整属性参数，查看效果变化。

<div class="playground-container">
  <iframe 
    src="https://playground.touchx-ui.com" 
    width="100%" 
    height="600px"
    frameborder="0"
    title="TouchX UI Playground"
  ></iframe>
</div>

## 快速开始

### 基础组件演示

#### 按钮组件
```vue
<template>
  <div class="button-demo">
    <TxButton variant="primary">主要按钮</TxButton>
    <TxButton variant="secondary">次要按钮</TxButton>
    <TxButton variant="outline">边框按钮</TxButton>
    <TxButton variant="text">文字按钮</TxButton>
  </div>
</template>
```

#### 输入框组件
```vue
<template>
  <div class="input-demo">
    <TxInput 
      v-model="inputValue"
      placeholder="请输入内容"
      clearable
    />
    <TxInput 
      v-model="passwordValue"
      type="password"
      placeholder="请输入密码"
      show-password
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const inputValue = ref('')
const passwordValue = ref('')
</script>
```

#### 卡片组件
```vue
<template>
  <TxCard>
    <template #header>
      <h3>卡片标题</h3>
    </template>
    
    <p>这是一个带有玻璃拟态效果的卡片组件，展示了 TouchX UI 的现代化设计风格。</p>
    
    <template #footer>
      <TxButton variant="primary">操作</TxButton>
    </template>
  </TxCard>
</template>
```

## 主题定制演示

### 颜色主题
实时切换不同的颜色主题，查看组件在不同主题下的表现：

```vue
<template>
  <div class="theme-demo">
    <div class="theme-selector">
      <TxButton 
        v-for="theme in themes"
        :key="theme.name"
        @click="setTheme(theme)"
        :variant="currentTheme === theme.name ? 'primary' : 'outline'"
      >
        {{ theme.label }}
      </TxButton>
    </div>
    
    <div class="component-showcase">
      <TxCard>
        <TxButton variant="primary">主要按钮</TxButton>
        <TxInput placeholder="输入框" />
        <TxAvatar>U</TxAvatar>
      </TxCard>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const currentTheme = ref('default')

const themes = [
  { name: 'default', label: '默认主题' },
  { name: 'dark', label: '深色主题' },
  { name: 'blue', label: '蓝色主题' },
  { name: 'green', label: '绿色主题' }
]

const setTheme = (theme) => {
  currentTheme.value = theme.name
  document.documentElement.setAttribute('data-theme', theme.name)
}
</script>
```

## 响应式演示

### 移动端适配
查看组件在不同屏幕尺寸下的表现：

```vue
<template>
  <div class="responsive-demo">
    <div class="device-selector">
      <TxButton 
        v-for="device in devices"
        :key="device.name"
        @click="setDevice(device)"
        :variant="currentDevice === device.name ? 'primary' : 'outline'"
        size="small"
      >
        {{ device.label }}
      </TxButton>
    </div>
    
    <div 
      class="device-frame"
      :class="`device-${currentDevice}`"
    >
      <div class="component-grid">
        <TxCard v-for="i in 6" :key="i">
          <h4>卡片 {{ i }}</h4>
          <p>响应式内容展示</p>
          <TxButton size="small">操作</TxButton>
        </TxCard>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const currentDevice = ref('desktop')

const devices = [
  { name: 'mobile', label: '手机' },
  { name: 'tablet', label: '平板' },
  { name: 'desktop', label: '桌面' }
]

const setDevice = (device) => {
  currentDevice.value = device.name
}
</script>

<style scoped>
.device-frame {
  transition: all 0.3s ease;
  margin: 20px auto;
  border: 2px solid #ddd;
  border-radius: 12px;
  overflow: hidden;
}

.device-mobile {
  width: 375px;
  height: 667px;
}

.device-tablet {
  width: 768px;
  height: 1024px;
}

.device-desktop {
  width: 100%;
  height: 600px;
}

.component-grid {
  display: grid;
  gap: 16px;
  padding: 16px;
}

.device-mobile .component-grid {
  grid-template-columns: 1fr;
}

.device-tablet .component-grid {
  grid-template-columns: repeat(2, 1fr);
}

.device-desktop .component-grid {
  grid-template-columns: repeat(3, 1fr);
}
</style>
```

## 动画效果演示

### 过渡动画
展示 TouchX UI 组件的各种动画效果：

```vue
<template>
  <div class="animation-demo">
    <h3>按钮动画</h3>
    <div class="button-animations">
      <TxButton @click="showRipple = !showRipple">
        点击波纹效果
      </TxButton>
      <TxButton loading>
        加载动画
      </TxButton>
    </div>
    
    <h3>卡片动画</h3>
    <div class="card-animations">
      <TxCard 
        v-for="card in cards"
        :key="card.id"
        :class="{ 'animate-in': card.visible }"
        clickable
      >
        <h4>{{ card.title }}</h4>
        <p>{{ card.content }}</p>
      </TxCard>
    </div>
    
    <TxButton @click="animateCards">
      触发卡片动画
    </TxButton>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const showRipple = ref(false)

const cards = ref([
  { id: 1, title: '卡片 1', content: '内容 1', visible: false },
  { id: 2, title: '卡片 2', content: '内容 2', visible: false },
  { id: 3, title: '卡片 3', content: '内容 3', visible: false }
])

const animateCards = () => {
  cards.value.forEach((card, index) => {
    setTimeout(() => {
      card.visible = true
    }, index * 200)
  })
}
</script>

<style scoped>
.animate-in {
  animation: slideInUp 0.6s ease-out;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
```

## 代码编辑器

### 实时编辑
在线编辑代码并实时查看效果：

<div class="code-editor">
  <div class="editor-tabs">
    <button class="tab active">Template</button>
    <button class="tab">Script</button>
    <button class="tab">Style</button>
  </div>
  
  <div class="editor-content">
    <textarea placeholder="在这里编写您的 Vue 代码..."></textarea>
  </div>
  
  <div class="editor-preview">
    <div class="preview-header">预览</div>
    <div class="preview-content">
      <!-- 实时预览区域 -->
    </div>
  </div>
</div>

## 组件库

### 完整组件列表
浏览所有可用的组件：

- **基础组件**
  - [Button 按钮](/components/button)
  - [Icon 图标](/guide/components/icon)
  - [Avatar 头像](/components/avatar)

- **表单组件**
  - [Input 输入框](/components/input)
  - [Select 选择器](#)
  - [Checkbox 复选框](#)
  - [Radio 单选框](#)

- **数据展示**
  - [Card 卡片](/components/card)
  - [Table 表格](#)
  - [List 列表](#)

- **反馈组件**
  - [Message 消息](#)
  - [Modal 模态框](#)
  - [Tooltip 提示](#)

## 使用指南

### 如何使用演示场

1. **浏览组件**：点击左侧导航查看不同组件
2. **调整参数**：使用右侧控制面板调整组件属性
3. **查看代码**：点击"查看代码"按钮获取示例代码
4. **复制代码**：一键复制代码到您的项目中

### 快捷键

- `Ctrl/Cmd + K`：打开组件搜索
- `Ctrl/Cmd + /`：切换代码面板
- `F11`：全屏模式
- `Esc`：退出全屏

## 反馈与建议

如果您在使用演示场时遇到问题或有改进建议，请：

1. 在 [GitHub Issues](https://github.com/talex-touch/touchx-ui/issues) 提交问题
2. 加入我们的 [Discord 社区](https://discord.gg/touchx-ui) 讨论
3. 发送邮件至 support@touchx-ui.com

让我们一起打造更好的组件库！
