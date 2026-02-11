# Agents

A presentation-only list component for displaying AI agents with selection state, loading indicators, and badge counts. Agents is designed for sidebar navigation in AI-powered applications.

<script setup lang="ts">
import { ref } from 'vue'

const selectedId = ref<string | null>('chat')
const loading = ref(false)

const agents = [
  {
    id: 'chat',
    name: 'Chat Agent',
    description: 'General conversation assistant',
    iconClass: 'i-carbon-chat',
    badgeText: 6,
  },
  {
    id: 'code',
    name: 'Code Agent',
    description: 'Code generation & refactor',
    iconClass: 'i-carbon-code',
    badgeText: 12,
  },
  {
    id: 'search',
    name: 'Search Agent',
    description: 'Web search & citations',
    iconClass: 'i-carbon-search',
  },
  {
    id: 'disabled',
    name: 'Disabled Agent',
    description: 'Not available',
    iconClass: 'i-carbon-bot',
    disabled: true,
  },
]
</script>

## Basic Usage

Pass an `agents` array and bind `selectedId` to track the active agent. The list handles selection, loading states, and badge rendering.

<DemoBlock title="AgentsList">
<template #preview>
<div style="display: flex; flex-direction: column; gap: 12px; width: 420px;">
  <div style="display: flex; gap: 8px;">
    <TxButton size="sm" @click="loading = !loading">Toggle Loading</TxButton>
  </div>
  <div style="height: 360px;">
    <TxAgentsList
      :agents="agents"
      :loading="loading"
      :selected-id="selectedId"
      @select="(id) => (selectedId = id)"
    />
  </div>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'

const selectedId = ref('chat')
const agents = [
  { id: 'chat', name: 'Chat Agent', iconClass: 'i-carbon-chat', badgeText: 6 },
  { id: 'code', name: 'Code Agent', iconClass: 'i-carbon-code', badgeText: 12 },
  { id: 'disabled', name: 'Disabled Agent', disabled: true },
]
</script>

<template>
  <TxAgentsList
    :agents="agents"
    :selected-id="selectedId"
    @select="(id) => (selectedId = id)"
  />
</template>
```

</template>
</DemoBlock>

## Design Notes

- This is a **presentation-only** component — it does not include business logic for executing requests or managing agent sessions.
- Each agent item supports `disabled` state, which grays out the item and prevents selection.
- Use `badgeText` to show unread counts or status indicators alongside agent names.
- The `loading` prop shows a loading indicator over the entire list — useful during initial data fetch.

## API

### TxAgentsList Props

<ApiSpecTable :rows="[
  { name: 'agents', description: 'Array of agent objects to display.', type: 'AgentItemProps[]' },
  { name: 'selectedId', description: 'ID of the currently selected agent.', type: 'string | null', default: 'null' },
  { name: 'loading', description: 'Show a loading overlay on the list.', type: 'boolean', default: 'false' },
]" />

### TxAgentsList Events

<ApiSpecTable title="Events" :rows="[
  { name: 'select', description: 'Fires when an agent item is clicked.', type: '(id: string) => void' },
]" />

### TxAgentItem Props

<ApiSpecTable title="TxAgentItem Props" :rows="[
  { name: 'id', description: 'Unique agent identifier.', type: 'string' },
  { name: 'name', description: 'Agent display name.', type: 'string' },
  { name: 'description', description: 'Short agent description.', type: 'string', default: '\"\"' },
  { name: 'iconClass', description: 'Icon class for the agent avatar.', type: 'string', default: '\"i-carbon-bot\"' },
  { name: 'selected', description: 'Whether this item is selected.', type: 'boolean', default: 'false' },
  { name: 'disabled', description: 'Prevents interaction.', type: 'boolean', default: 'false' },
  { name: 'badgeText', description: 'Badge content (count or label).', type: 'string | number', default: '\"\"' },
]" />
