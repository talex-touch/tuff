<script setup lang="ts">
import type { RegistryDetailSection } from '~/utils/admin-provider-registry-detail'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed } from 'vue'

/**
 * The body of the provider registry's read-only drawers: sections built by
 * `utils/admin-provider-registry-detail.ts`. A field with no value shows the
 * descriptions' empty mark.
 */
const props = defineProps<{
  sections: RegistryDetailSection[]
}>()

/**
 * One label track for every section, so the values line up down the drawer:
 * each section's descriptions would otherwise size to its own longest label.
 * The longest label is estimated at 1em a CJK character and half an em else.
 */
const labelWidth = computed(() => {
  const widths = props.sections
    .flatMap(section => section.fields ?? [])
    .map(field => [...field.label].reduce((sum, char) => sum + (char.codePointAt(0)! >= 0x2E80 ? 1 : 0.5), 0))
  return widths.length ? `${Math.ceil(Math.max(...widths))}em` : undefined
})
</script>

<template>
  <div class="RegistryDetail">
    <section v-for="section in sections" :key="section.key" class="RegistryDetail-Group">
      <h3 v-if="section.title" class="RegistryDetail-GroupTitle">
        {{ section.title }}
      </h3>
      <TxDescriptions v-if="section.fields?.length" :columns="1" size="sm" :label-width="labelWidth">
        <TxDescriptionsItem v-for="field in section.fields" :key="field.key" :label="field.label">
          <template v-if="field.value">
            <TxStatusBadge v-if="field.kind === 'badge'" :text="field.value" :status="field.tone ?? 'muted'" size="sm" />
            <code v-else-if="field.kind === 'code'" class="RegistryDetail-Code">{{ field.value }}</code>
            <span v-else class="RegistryDetail-Text" :class="{ 'is-danger': field.danger }">{{ field.value }}</span>
          </template>
        </TxDescriptionsItem>
      </TxDescriptions>
      <ul v-else-if="section.items?.length" class="RegistryDetail-List">
        <li v-for="item in section.items" :key="item.key" class="RegistryDetail-ListItem">
          <code v-if="item.code" class="RegistryDetail-Code">{{ item.primary }}</code>
          <span v-else class="RegistryDetail-Text">{{ item.primary }}</span>
          <span v-if="item.secondary" class="RegistryDetail-Muted">{{ item.secondary }}</span>
        </li>
      </ul>
      <pre v-else-if="section.json" class="RegistryDetail-Pre">{{ section.json }}</pre>
      <p v-else-if="section.empty" class="RegistryDetail-Empty">
        {{ section.empty }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.RegistryDetail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.RegistryDetail-Group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.RegistryDetail-GroupTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.RegistryDetail-Code {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--tx-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.RegistryDetail-Text {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.RegistryDetail-Text.is-danger {
  color: var(--tx-color-danger);
}

.RegistryDetail-Muted {
  color: var(--tx-text-color-regular);
  font-size: 13px;
}

.RegistryDetail-List {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.RegistryDetail-ListItem {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.RegistryDetail-Pre {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.RegistryDetail-Empty {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
}
</style>
