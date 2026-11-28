<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const selectedId = ref<string | null>('chat')
const loading = ref(false)

const copy = computed(() => (locale.value === 'zh'
  ? {
      enabledTitle: '可用智能体',
      disabledTitle: '暂不可用',
      emptyText: '暂无智能体',
      chatName: 'Chat Agent',
      chatDesc: '通用对话与任务拆解',
      codeName: 'Code Agent',
      codeDesc: '代码生成、解释与重构',
      searchName: 'Search Agent',
      searchDesc: '检索资料并整理引用',
      disabledName: 'Legacy Agent',
      disabledDesc: '迁移完成前不可选择',
      toggleLoading: '切换 loading',
    }
  : {
      enabledTitle: 'Enabled agents',
      disabledTitle: 'Unavailable',
      emptyText: 'No agents yet',
      chatName: 'Chat Agent',
      chatDesc: 'General conversation and task planning',
      codeName: 'Code Agent',
      codeDesc: 'Code generation, explanation, and refactor',
      searchName: 'Search Agent',
      searchDesc: 'Research with citations',
      disabledName: 'Legacy Agent',
      disabledDesc: 'Disabled until migration finishes',
      toggleLoading: 'Toggle loading',
    }))

const agents = computed(() => [
  {
    id: 'chat',
    name: copy.value.chatName,
    description: copy.value.chatDesc,
    iconClass: 'i-carbon-chat',
    badgeText: 6,
  },
  {
    id: 'code',
    name: copy.value.codeName,
    description: copy.value.codeDesc,
    iconClass: 'i-carbon-code',
    badgeText: 12,
  },
  {
    id: 'search',
    name: copy.value.searchName,
    description: copy.value.searchDesc,
    iconClass: 'i-carbon-search',
  },
  {
    id: 'legacy',
    name: copy.value.disabledName,
    description: copy.value.disabledDesc,
    iconClass: 'i-carbon-bot',
    disabled: true,
  },
])

function handleSelect(id: string) {
  selectedId.value = id
}
</script>

<template>
  <div class="agents-demo">
    <button type="button" class="agents-demo__toggle" @click="loading = !loading">
      {{ copy.toggleLoading }}
    </button>

    <TxAgentsList
      :agents="agents"
      :loading="loading"
      :selected-id="selectedId"
      :enabled-title="copy.enabledTitle"
      :disabled-title="copy.disabledTitle"
      :empty-text="copy.emptyText"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.agents-demo {
  display: grid;
  width: min(420px, 100%);
  gap: 12px;
}

.agents-demo__toggle {
  justify-self: start;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  padding: 6px 10px;
  background: var(--tx-bg-color-overlay, #fff);
  color: var(--tx-text-color-primary);
  cursor: pointer;
}
</style>
