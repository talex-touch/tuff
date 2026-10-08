<script setup lang="ts">
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderCapabilityRecord, ProviderRegistryRecord } from '~/utils/provider-registry-admin'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { computed, useId } from 'vue'
import AdminFormField from '~/components/admin/AdminFormField.vue'
import { ADMIN_FORMAT_EMPTY } from '~/composables/useAdminFormat'

const props = defineProps<{
  admin: ProviderRegistryAdmin
  provider: ProviderRegistryRecord | null
}>()

const emit = defineEmits<{
  submit: []
  close: []
}>()

const open = defineModel<boolean>('open', { required: true })
const capability = defineModel<string>('capability', { required: true })

const { t } = useI18n()
const admin = props.admin

const idBase = useId()

const capabilityOptions = computed(() => props.provider
  ? props.provider.capabilities.map(item => item.capability).filter(Boolean)
  : [])

const checking = computed(() => Boolean(props.provider) && admin.actionPending.value === `provider:${props.provider!.id}:check`)

function defaultModel(provider: ProviderRegistryRecord): string {
  const model = provider.metadata?.defaultModel
  return typeof model === 'string' && model.trim() ? model : ADMIN_FORMAT_EMPTY
}

function meteringUnit(item: ProviderCapabilityRecord): string {
  const unit = item.metering?.unit
  return typeof unit === 'string' && unit.trim() ? unit : ADMIN_FORMAT_EMPTY
}

function providerModel(item: ProviderCapabilityRecord): string {
  const model = item.metadata?.providerModel
  return typeof model === 'string' && model.trim()
    ? model
    : t('dashboard.providerRegistry.providers.modelDefault', 'Use default model')
}
</script>

<template>
  <TxDrawer v-model:visible="open" :title="t('dashboard.providerRegistry.providers.testTitle', 'Test service channel')" size="min(720px, 100vw)" direction="right">
    <div v-if="provider" class="RegistryForm">
      <section class="RegistryForm-Group">
        <h3 class="RegistryForm-GroupTitle">
          {{ t('dashboard.providerRegistry.providers.testConnectivity', 'Test connectivity') }} · {{ provider.displayName }}
        </h3>
        <p class="RegistryForm-Hint">
          {{ t('dashboard.providerRegistry.providers.testHint', 'Select a declared provider capability before running the check.') }}
          {{ t('dashboard.providerRegistry.providers.testUpstreamHint', 'The check sends one small probe request to the provider.') }}
        </p>
      </section>

      <section class="RegistryForm-Grid">
        <AdminFormField :label="t('dashboard.providerRegistry.fields.capability', 'Capability')" :for="`${idBase}-capability`">
          <TuffSelect
            :id="`${idBase}-capability`"
            v-model="capability"
            class="RegistryForm-Control"
            searchable
            :search-placeholder="t('dashboard.providerRegistry.providers.capabilitySearchPlaceholder', 'Search capabilities...')"
          >
            <TuffSelectItem v-for="item in capabilityOptions" :key="item" :value="item" :label="item" />
          </TuffSelect>
        </AdminFormField>
        <AdminFormField :label="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')" :for="`${idBase}-model`">
          <TuffInput :id="`${idBase}-model`" :model-value="defaultModel(provider)" class="RegistryForm-Control" readonly />
        </AdminFormField>
        <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.fields.endpoint', 'Endpoint')" :for="`${idBase}-endpoint`">
          <TuffInput :id="`${idBase}-endpoint`" :model-value="provider.endpoint || ADMIN_FORMAT_EMPTY" class="RegistryForm-Control is-mono" readonly />
        </AdminFormField>
      </section>

      <section class="RegistryForm-Group">
        <h3 class="RegistryForm-GroupTitle">
          {{ t('dashboard.providerRegistry.providers.candidateCapabilities', 'Candidate capabilities') }}
        </h3>
        <ul class="RegistryForm-List">
          <li v-for="item in provider.capabilities" :key="item.id" class="RegistryForm-ListItem">
            <code>{{ item.capability }}</code> · {{ meteringUnit(item) }} · {{ providerModel(item) }}
          </li>
        </ul>
      </section>
    </div>

    <template #footer>
      <div class="RegistryForm-Footer">
        <TxButton variant="secondary" size="sm" :disabled="checking" @click="emit('close')">
          {{ t('common.cancel', 'Cancel') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="checking"
          :disabled="!provider || !capability || admin.actionPending.value !== null"
          :title="t('dashboard.providerRegistry.actions.checkHint', 'Check: sends one probe request upstream')"
          @click="emit('submit')"
        >
          {{ t('dashboard.providerRegistry.actions.check', 'Check') }}
        </TxButton>
      </div>
    </template>
  </TxDrawer>
</template>

<style scoped>
.RegistryForm {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.RegistryForm-Hint {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}

.RegistryForm-Grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.RegistryForm-Grid.is-models {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.45fr);
}

@media (max-width: 720px) {
  .RegistryForm-Grid,
  .RegistryForm-Grid.is-models {
    grid-template-columns: minmax(0, 1fr);
  }
}

.RegistryForm-Wide {
  grid-column: 1 / -1;
}

.RegistryForm-Control {
  width: 100%;
  min-width: 0;
}

.RegistryForm-Control.is-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.RegistryForm-Group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.RegistryForm-GroupHead {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.RegistryForm-GroupTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.RegistryForm-Details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
}

.RegistryForm-Details.is-row {
  padding: 8px 12px;
  border-radius: 10px;
}

.RegistryForm-Summary {
  cursor: pointer;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 500;
  user-select: none;
}

.RegistryForm-Details[open] > .RegistryForm-Summary {
  margin-bottom: 12px;
}

.RegistryForm-List {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.RegistryForm-ListItem {
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font-size: 12px;
}

.RegistryForm-Footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* Rows of per-row editors: a header line, then one grid row per record. */
.RegistryRows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.RegistryRows-Head,
.RegistryRows-Row {
  display: grid;
  align-items: center;
  gap: 8px;
}

.RegistryRows-Head {
  color: var(--tx-text-color-regular);
  font-size: 12px;
  font-weight: 500;
}

.RegistryRows-Head.is-create,
.RegistryRows-Row.is-create {
  grid-template-columns: minmax(0, 1fr) 176px 32px;
}

.RegistryRows-Head.is-edit,
.RegistryRows-Row.is-edit {
  grid-template-columns: minmax(0, 1fr) 128px minmax(0, 1fr) 32px;
}

.RegistryRows-Head.is-binding,
.RegistryRows-Row.is-binding {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 88px 32px;
}

.RegistryRows-Item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
}

.RegistryPre {
  margin: 0;
  max-height: 256px;
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.RegistryRun {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.RegistryRun-Meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-regular);
  font-size: 12px;
}

.RegistryRun-Grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 720px) {
  .RegistryRun-Grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
