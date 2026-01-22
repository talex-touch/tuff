<script lang="ts" setup>
import { ref } from 'vue'
import TuffItemTemplate from './TuffItemTemplate.vue'

const selectedId = ref('item-1')

const listItems = [
  {
    id: 'item-1',
    name: 'OpenAI',
    type: 'openai',
    icon: { type: 'class' as const, value: 'i-simple-icons-openai' },
    enabled: true
  },
  {
    id: 'item-2',
    name: 'Anthropic',
    type: 'anthropic',
    icon: { type: 'class' as const, value: 'i-simple-icons-anthropic' },
    enabled: true
  },
  {
    id: 'item-3',
    name: 'DeepSeek',
    type: 'deepseek',
    icon: { type: 'class' as const, value: 'i-carbon-search-advanced' },
    enabled: false
  },
  {
    id: 'item-4',
    name: 'Local Model',
    type: 'local',
    icon: { type: 'class' as const, value: 'i-carbon-bare-metal-server' },
    enabled: true
  }
]

function handleClick(type: string) {
  console.log('Clicked:', type)
}
</script>

<template>
  <div class="example-container">
    <h2>TuffItemTemplate 使用示例</h2>

    <section class="example-section">
      <h3>基础用法</h3>
      <TuffItemTemplate
        title="OpenAI Provider"
        subtitle="openai"
        :icon="{ type: 'class', value: 'i-simple-icons-openai' }"
        :clickable="true"
        @click="handleClick('basic')"
      />
    </section>

    <section class="example-section">
      <h3>带状态点</h3>
      <TuffItemTemplate
        title="Active Service"
        subtitle="Running on port 3000"
        :icon="{ type: 'class', value: 'i-carbon-server' }"
        :status-dot="{ class: 'is-active', label: 'Service is running' }"
        :selected="true"
      />
    </section>

    <section class="example-section">
      <h3>带顶部 Badge（错误提示）</h3>
      <TuffItemTemplate
        title="Anthropic Provider"
        subtitle="anthropic"
        :icon="{ type: 'class', value: 'i-simple-icons-anthropic' }"
        :top-badge="{ text: 'Error', status: 'danger', icon: 'i-carbon-warning' }"
        :has-error="true"
      />
    </section>

    <section class="example-section">
      <h3>带底部 Badge（状态标识）</h3>
      <TuffItemTemplate
        title="DeepSeek Provider"
        subtitle="deepseek"
        :icon="{ type: 'class', value: 'i-carbon-search-advanced' }"
        :bottom-badge="{ text: 'Beta', status: 'warning' }"
      />
    </section>

    <section class="example-section">
      <h3>同时带两个 Badge</h3>
      <TuffItemTemplate
        title="Custom Provider"
        subtitle="custom-api"
        :icon="{ type: 'class', value: 'i-carbon-settings' }"
        :top-badge="{ text: 'New', status: 'info' }"
        :bottom-badge="{ text: 'v2.0', status: 'success' }"
        :status-dot="{ class: 'is-active' }"
      />
    </section>

    <section class="example-section">
      <h3>禁用状态</h3>
      <TuffItemTemplate
        title="Disabled Provider"
        subtitle="Not available"
        :icon="{ type: 'class', value: 'i-carbon-close-outline' }"
        :disabled="true"
        :status-dot="{ class: 'is-inactive', label: 'Disabled' }"
      />
    </section>

    <section class="example-section">
      <h3>不同尺寸</h3>
      <div class="size-examples">
        <TuffItemTemplate
          title="Small Size"
          subtitle="size='sm'"
          :icon="{ type: 'class', value: 'i-carbon-cube' }"
          size="sm"
        />
        <TuffItemTemplate
          title="Medium Size (Default)"
          subtitle="size='md'"
          :icon="{ type: 'class', value: 'i-carbon-cube' }"
          size="md"
        />
        <TuffItemTemplate
          title="Large Size"
          subtitle="size='lg'"
          :icon="{ type: 'class', value: 'i-carbon-cube' }"
          size="lg"
        />
      </div>
    </section>

    <section class="example-section">
      <h3>自定义插槽</h3>
      <TuffItemTemplate :icon="{ type: 'class', value: 'i-carbon-user' }">
        <template #title>
          <span style="color: var(--el-color-primary)">Custom Title</span>
          <el-tag size="small" type="success"> Pro </el-tag>
        </template>
        <template #subtitle>
          <span>Custom subtitle with <strong>formatting</strong></span>
        </template>
        <template #trailing>
          <el-button size="small" type="primary" text> Action </el-button>
        </template>
      </TuffItemTemplate>
    </section>

    <section class="example-section">
      <h3>列表中使用</h3>
      <div class="list-example">
        <TuffItemTemplate
          v-for="item in listItems"
          :key="item.id"
          :title="item.name"
          :subtitle="item.type"
          :icon="item.icon"
          :selected="selectedId === item.id"
          :status-dot="{ class: item.enabled ? 'is-active' : 'is-inactive' }"
          @click="selectedId = item.id"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.example-container {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

.example-section {
  margin-bottom: 2rem;
}

.example-section h3 {
  margin-bottom: 1rem;
  color: var(--el-text-color-primary);
}

.size-examples {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.list-example {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
