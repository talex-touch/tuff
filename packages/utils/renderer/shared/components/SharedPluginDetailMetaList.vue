<script setup lang="ts">
import type { SharedPluginMetaItem } from '../plugin-detail'
import { computed } from 'vue'

interface Props {
  items?: SharedPluginMetaItem[]
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: ''
})

const hasItems = computed(() => (props.items?.length ?? 0) > 0)

async function copyValue(value: string): Promise<void> {
  if (!value) return
  if (!navigator.clipboard?.writeText) return
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // Clipboard access can be unavailable in non-secure or embedded contexts.
  }
}
</script>

<template>
  <section v-if="hasItems" class="SharedPluginDetailMetaList">
    <span
      class="SharedPluginDetailMetaList-IconSeed i-carbon-information i-carbon-security i-carbon-tag i-carbon-time i-carbon-upgrade i-carbon-user"
      aria-hidden="true"
    />
    <h3 v-if="title" class="SharedPluginDetailMetaList-Title">
      {{ title }}
    </h3>
    <div class="SharedPluginDetailMetaList-Items">
      <div
        v-for="item in items"
        :key="item.label"
        class="SharedPluginDetailMetaList-Item"
        :class="item.highlight ? `highlight-${item.highlight}` : ''"
      >
        <i class="SharedPluginDetailMetaList-Icon" :class="item.icon || 'i-carbon-information'" />
        <div class="SharedPluginDetailMetaList-Label">
          {{ item.label }}
        </div>
        <button
          v-if="item.copyable"
          type="button"
          class="SharedPluginDetailMetaList-Value SharedPluginDetailMetaList-Value--copyable"
          :title="item.value"
          @click="copyValue(item.value)"
        >
          {{ item.value }}
        </button>
        <div v-else class="SharedPluginDetailMetaList-Value" :title="item.value">
          {{ item.value }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.SharedPluginDetailMetaList {
  color: var(--tx-text-color-regular, #374151);
}

.SharedPluginDetailMetaList-IconSeed {
  display: none;
}

.SharedPluginDetailMetaList-Title {
  margin: 0 0 0.35rem;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 0.76rem;
  font-weight: 650;
  line-height: 1.25;
}

.SharedPluginDetailMetaList-Items {
  border-top: 1px solid var(--tx-border-color-lighter, rgba(148, 163, 184, 0.22));
}

.SharedPluginDetailMetaList-Item {
  display: grid;
  grid-template-columns: 16px max-content minmax(0, 1fr);
  align-items: center;
  column-gap: 0.25rem;
  min-height: 30px;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--tx-border-color-lighter, rgba(148, 163, 184, 0.22));
}

.SharedPluginDetailMetaList-Icon {
  justify-self: start;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 0.82rem;
}

.SharedPluginDetailMetaList-Label {
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 0.74rem;
  line-height: 1.2;
  white-space: nowrap;
}

.SharedPluginDetailMetaList-Value {
  min-width: 0;
  color: var(--tx-text-color-primary, #111827);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.SharedPluginDetailMetaList-Value--copyable {
  appearance: none;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 42%, transparent);
  text-underline-offset: 3px;
}

.SharedPluginDetailMetaList-Value--copyable:hover {
  color: var(--tx-color-primary, #409eff);
  text-decoration-color: currentColor;
}

.SharedPluginDetailMetaList-Item.highlight-upgrade .SharedPluginDetailMetaList-Label,
.SharedPluginDetailMetaList-Item.highlight-upgrade .SharedPluginDetailMetaList-Value {
  color: var(--tx-color-primary, #409eff);
}

.SharedPluginDetailMetaList-Item.highlight-installed .SharedPluginDetailMetaList-Label,
.SharedPluginDetailMetaList-Item.highlight-installed .SharedPluginDetailMetaList-Value {
  color: var(--tx-color-success, #22c55e);
}

.SharedPluginDetailMetaList-Item.highlight-info .SharedPluginDetailMetaList-Label,
.SharedPluginDetailMetaList-Item.highlight-info .SharedPluginDetailMetaList-Value {
  color: var(--tx-color-info, #64748b);
}
</style>
