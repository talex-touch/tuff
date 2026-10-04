<script setup lang="ts">
import type { ProviderDrawerMode } from '~/utils/admin-provider-registry'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderRegistryRecord } from '~/utils/provider-registry-admin'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton, TxIconButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { computed, useId } from 'vue'
import AdminFormField from '~/components/admin/AdminFormField.vue'
import { vAdminControlId, vAdminControlLabel } from '~/composables/useAdminFieldControl'
import { ADMIN_FORMAT_EMPTY, useAdminFormat } from '~/composables/useAdminFormat'

const props = defineProps<{
  admin: ProviderRegistryAdmin
  mode: ProviderDrawerMode
  provider: ProviderRegistryRecord | null
}>()

const emit = defineEmits<{
  submit: []
  close: []
}>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const format = useAdminFormat()
const admin = props.admin

// One id per block field: each `AdminFormField` labels its control through `for`.
const idBase = useId()
function fieldId(name: string): string {
  return `${idBase}-${name}`
}

const editPanel = computed(() => props.mode === 'edit' && props.provider ? admin.getProviderEditPanel(props.provider) : null)
const quotaPanel = computed(() => props.mode === 'quota' && props.provider ? admin.getProviderQuotaPanel(props.provider) : null)

const saving = computed(() => admin.savingProvider.value || Boolean(editPanel.value?.saving) || Boolean(quotaPanel.value?.saving))
const error = computed(() => {
  if (props.mode === 'create')
    return admin.providerCreateError.value
  return editPanel.value?.error ?? quotaPanel.value?.error ?? null
})

const title = computed(() => {
  if (props.mode === 'quota')
    return t('dashboard.providerRegistry.quota.editTitle', 'Provider quota')
  return props.mode === 'create'
    ? t('dashboard.providerRegistry.providers.createTitle', 'Create provider')
    : t('dashboard.providerRegistry.providers.editTitle', 'Edit provider')
})

const primaryLabel = computed(() => props.mode === 'create'
  ? t('dashboard.providerRegistry.providers.create', 'Create provider')
  : t('common.save', 'Save'))

function valueLabel(value: string | null | undefined): string {
  if (!value)
    return ADMIN_FORMAT_EMPTY
  return t(`dashboard.providerRegistry.values.${value}`, value)
}

function modelOptions(text: string): string[] {
  return Array.from(new Set(text.split(/[\n,]/).map(model => model.trim()).filter(Boolean)))
}

const createModelOptions = computed(() => modelOptions(admin.providerForm.modelsText))
const editModelOptions = computed(() => editPanel.value ? modelOptions(editPanel.value.modelsText) : [])

function rowLabel(label: string, index: number): string {
  return t('dashboard.providerRegistry.form.rowField', { field: label, row: index + 1 }, `${label}, row ${index + 1}`)
}

function quotaLimit(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? format.number(value) : ADMIN_FORMAT_EMPTY
}

</script>

<template>
  <TxDrawer v-model:visible="open" :title="title" size="min(880px, 100vw)" direction="right">
    <div class="RegistryForm">
      <TxAlert v-if="error" type="error" :closable="false" :message="error" />

      <template v-if="mode === 'create'">
        <p class="RegistryForm-Hint">
          {{ t('dashboard.providerRegistry.providers.createHint', 'Credentials are saved in secure storage when this provider needs authentication.') }}
        </p>
        <section class="RegistryForm-Grid">
          <AdminFormField :label="t('dashboard.providerRegistry.fields.serviceCategory', 'Service category')" :for="fieldId('service-category')">
            <TuffSelect v-model="admin.providerServiceCategoryId.value" v-admin-control-id="fieldId('service-category')" class="RegistryForm-Control" @change="admin.applyProviderServiceCategory">
              <TuffSelectItem
                v-for="category in admin.providerServiceCategoryOptions.value"
                :key="category.value"
                :value="category.value"
                :label="valueLabel(category.value)"
              />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.preset', 'Preset')" :for="fieldId('preset')">
            <TuffSelect v-model="admin.providerTemplateId.value" v-admin-control-id="fieldId('preset')" class="RegistryForm-Control" @change="admin.applyProviderTemplate">
              <TuffSelectItem v-for="template in admin.providerTemplateOptions.value" :key="template.value" :value="template.value" :label="template.label" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.name', 'Name')" :for="fieldId('name')">
            <TuffInput :id="fieldId('name')" v-model="admin.providerForm.name" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.displayName', 'Display name')" :for="fieldId('display-name')">
            <TuffInput :id="fieldId('display-name')" v-model="admin.providerForm.displayName" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.vendor', 'Vendor')" :for="fieldId('vendor')">
            <TuffSelect v-model="admin.providerForm.vendor" v-admin-control-id="fieldId('vendor')" class="RegistryForm-Control">
              <TuffSelectItem v-for="vendor in admin.providerVendorOptions" :key="vendor" :value="vendor" :label="valueLabel(vendor)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.adapter', 'Adapter format')" :for="fieldId('adapter')">
            <TuffSelect v-model="admin.providerForm.adapterKey" v-admin-control-id="fieldId('adapter')" class="RegistryForm-Control">
              <TuffSelectItem v-for="adapter in admin.providerAdapterOptions.value" :key="adapter.value" :value="adapter.value" :label="adapter.label" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.status', 'Status')" :for="fieldId('status')">
            <TuffSelect v-model="admin.providerForm.status" v-admin-control-id="fieldId('status')" class="RegistryForm-Control">
              <TuffSelectItem v-for="status in admin.providerStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.authType', 'Auth type')" :for="fieldId('auth-type')">
            <TuffSelect v-model="admin.providerForm.authType" v-admin-control-id="fieldId('auth-type')" class="RegistryForm-Control">
              <TuffSelectItem v-for="type in admin.authTypeOptions" :key="type" :value="type" :label="valueLabel(type)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField v-if="admin.providerForm.authType === 'api_key'" :label="t('dashboard.providerRegistry.fields.apiKey', 'API Key')" :for="fieldId('api-key')">
            <TuffInput :id="fieldId('api-key')" v-model="admin.providerForm.apiKey" class="RegistryForm-Control" type="password" autocomplete="new-password" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.endpoint', 'Endpoint')" :for="fieldId('endpoint')">
            <TuffInput :id="fieldId('endpoint')" v-model="admin.providerForm.endpoint" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.region', 'Region')" :for="fieldId('region')">
            <TuffInput :id="fieldId('region')" v-model="admin.providerForm.region" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField v-if="admin.providerForm.authType === 'secret_pair'" :label="t('dashboard.providerRegistry.fields.secretId', 'SecretId')" :for="fieldId('secret-id')">
            <TuffInput :id="fieldId('secret-id')" v-model="admin.providerForm.secretId" class="RegistryForm-Control" autocomplete="off" />
          </AdminFormField>
          <AdminFormField v-if="admin.providerForm.authType === 'secret_pair'" :label="t('dashboard.providerRegistry.fields.secretKey', 'SecretKey')" :for="fieldId('secret-key')">
            <TuffInput :id="fieldId('secret-key')" v-model="admin.providerForm.secretKey" class="RegistryForm-Control" type="password" autocomplete="new-password" />
          </AdminFormField>
        </section>

        <section class="RegistryForm-Group">
          <h3 class="RegistryForm-GroupTitle">
            {{ t('dashboard.providerRegistry.providers.modelsTitle', 'Models') }}
          </h3>
          <p class="RegistryForm-Hint">
            {{ t('dashboard.providerRegistry.providers.modelsHint', 'Configure the model IDs this AI channel can dispatch. The fetch action uses the stored secure credential server-side.') }}
          </p>
          <div class="RegistryForm-Grid is-models">
            <AdminFormField :label="t('dashboard.providerRegistry.fields.models', 'Models')" :for="fieldId('models')">
              <TuffInput
                :id="fieldId('models')"
                v-model="admin.providerForm.modelsText"
                type="textarea"
                :rows="5"
                class="RegistryForm-Control is-mono"
                :placeholder="t('dashboard.providerRegistry.providers.modelsPlaceholder', 'One model ID per line, e.g. gpt-4.1-mini')"
              />
            </AdminFormField>
            <AdminFormField v-if="createModelOptions.length" :label="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')" :for="fieldId('default-model')">
              <TuffSelect
                v-model="admin.providerForm.defaultModel"
                v-admin-control-id="fieldId('default-model')"
                class="RegistryForm-Control"
                searchable
                :search-placeholder="t('dashboard.providerRegistry.providers.modelSearchPlaceholder', 'Search models...')"
                :placeholder="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')"
              >
                <TuffSelectItem v-for="model in createModelOptions" :key="model" :value="model" :label="model" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField v-else :label="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')" :for="fieldId('default-model')">
              <TuffInput :id="fieldId('default-model')" v-model="admin.providerForm.defaultModel" class="RegistryForm-Control" placeholder="gpt-4.1-mini" />
            </AdminFormField>
          </div>
        </section>

        <section class="RegistryForm-Group">
          <div class="RegistryForm-GroupHead">
            <h3 class="RegistryForm-GroupTitle">
              {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
            </h3>
            <TxButton variant="secondary" size="sm" @click="admin.addCapabilityRow">
              {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
            </TxButton>
          </div>
          <div class="RegistryRows">
            <div class="RegistryRows-Head is-create" aria-hidden="true">
              <span>{{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}</span>
              <span>{{ t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit') }}</span>
              <span />
            </div>
            <div v-for="(row, index) in admin.capabilityRows.value" :key="index" class="RegistryRows-Row is-create">
              <TuffSelect
                v-model="row.capability"
                v-admin-control-label="rowLabel(t('dashboard.providerRegistry.fields.capability', 'Capability'), index)"
                class="RegistryForm-Control"
                :placeholder="t('dashboard.providerRegistry.fields.capability', 'Capability')"
                @change="admin.applyProviderCapabilityTemplate(row, $event)"
              >
                <TuffSelectItem
                  v-for="capability in admin.providerCapabilityTemplateOptions.value"
                  :key="capability.capability"
                  :value="capability.capability"
                  :label="capability.capability"
                />
              </TuffSelect>
              <TuffSelect
                v-model="row.meteringUnit"
                v-admin-control-label="rowLabel(t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit'), index)"
                class="RegistryForm-Control"
                :placeholder="t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit')"
              >
                <TuffSelectItem v-for="unit in admin.providerMeteringUnitOptions.value" :key="unit" :value="unit" :label="unit" />
              </TuffSelect>
              <TxIconButton
                size="xs"
                icon="i-carbon-close"
                :disabled="admin.capabilityRows.value.length <= 1"
                :title="t('common.remove', 'Remove')"
                :label="rowLabel(t('common.remove', 'Remove'), index)"
                @click="admin.removeCapabilityRow(index)"
              />
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="mode === 'edit' && provider && editPanel">
        <section class="RegistryForm-Group">
          <h3 class="RegistryForm-GroupTitle">
            {{ t('dashboard.providerRegistry.providers.basicTitle', 'Basic configuration') }}
          </h3>
          <p class="RegistryForm-Hint">
            {{ t('dashboard.providerRegistry.providers.basicHint', 'Edit the visible name, vendor, endpoint, and availability state for this service channel.') }}
          </p>
          <div class="RegistryForm-Grid">
            <AdminFormField :label="t('dashboard.providerRegistry.fields.name', 'Name')" :for="fieldId('edit-name')">
              <TuffInput :id="fieldId('edit-name')" v-model="editPanel.name" class="RegistryForm-Control" />
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.displayName', 'Display name')" :for="fieldId('edit-display-name')">
              <TuffInput :id="fieldId('edit-display-name')" v-model="editPanel.displayName" class="RegistryForm-Control" />
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.vendor', 'Vendor')" :for="fieldId('edit-vendor')">
              <TuffSelect v-model="editPanel.vendor" v-admin-control-id="fieldId('edit-vendor')" class="RegistryForm-Control">
                <TuffSelectItem v-for="vendor in admin.providerVendorOptions" :key="vendor" :value="vendor" :label="valueLabel(vendor)" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.adapter', 'Adapter format')" :for="fieldId('edit-adapter')">
              <TuffSelect v-model="editPanel.adapterKey" v-admin-control-id="fieldId('edit-adapter')" class="RegistryForm-Control">
                <TuffSelectItem v-for="adapter in admin.providerAdapterOptions.value" :key="adapter.value" :value="adapter.value" :label="adapter.label" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.status', 'Status')" :for="fieldId('edit-status')">
              <TuffSelect v-model="editPanel.status" v-admin-control-id="fieldId('edit-status')" class="RegistryForm-Control">
                <TuffSelectItem v-for="status in admin.providerStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.authType', 'Auth type')" :for="fieldId('edit-auth-type')">
              <TuffSelect v-model="editPanel.authType" v-admin-control-id="fieldId('edit-auth-type')" class="RegistryForm-Control">
                <TuffSelectItem v-for="type in admin.authTypeOptions" :key="type" :value="type" :label="valueLabel(type)" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.endpoint', 'Endpoint')" :for="fieldId('edit-endpoint')">
              <TuffInput :id="fieldId('edit-endpoint')" v-model="editPanel.endpoint" class="RegistryForm-Control" />
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.region', 'Region')" :for="fieldId('edit-region')">
              <TuffInput :id="fieldId('edit-region')" v-model="editPanel.region" class="RegistryForm-Control" />
            </AdminFormField>
            <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.fields.description', 'Description')" :for="fieldId('edit-description')">
              <TuffInput :id="fieldId('edit-description')" v-model="editPanel.description" class="RegistryForm-Control" />
            </AdminFormField>
          </div>
        </section>

        <section class="RegistryForm-Group">
          <div class="RegistryForm-GroupHead">
            <div>
              <h3 class="RegistryForm-GroupTitle">
                {{ t('dashboard.providerRegistry.providers.modelsTitle', 'Models') }}
              </h3>
              <p class="RegistryForm-Hint">
                {{ t('dashboard.providerRegistry.providers.modelsHint', 'Configure the model IDs this AI channel can dispatch. The fetch action uses the stored secure credential server-side.') }}
              </p>
            </div>
            <TxButton
              variant="secondary"
              size="sm"
              icon="i-carbon-download"
              :loading="admin.fetchingProviderModels.value === provider.id"
              :disabled="admin.fetchingProviderModels.value !== null"
              @click="admin.fetchProviderModels(provider)"
            >
              {{ t('dashboard.providerRegistry.providers.fetchModels', 'Fetch models') }}
            </TxButton>
          </div>
          <div class="RegistryForm-Grid is-models">
            <AdminFormField :label="t('dashboard.providerRegistry.fields.models', 'Models')" :for="fieldId('edit-models')">
              <TuffInput
                :id="fieldId('edit-models')"
                v-model="editPanel.modelsText"
                type="textarea"
                :rows="5"
                class="RegistryForm-Control is-mono"
                :placeholder="t('dashboard.providerRegistry.providers.modelsPlaceholder', 'One model ID per line, e.g. gpt-4.1-mini')"
              />
            </AdminFormField>
            <AdminFormField v-if="editModelOptions.length" :label="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')" :for="fieldId('edit-default-model')">
              <TuffSelect
                v-model="editPanel.defaultModel"
                v-admin-control-id="fieldId('edit-default-model')"
                class="RegistryForm-Control"
                searchable
                :search-placeholder="t('dashboard.providerRegistry.providers.modelSearchPlaceholder', 'Search models...')"
                :placeholder="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')"
              >
                <TuffSelectItem v-for="model in editModelOptions" :key="model" :value="model" :label="model" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField v-else :label="t('dashboard.providerRegistry.fields.defaultModel', 'Default model')" :for="fieldId('edit-default-model')">
              <TuffInput :id="fieldId('edit-default-model')" v-model="editPanel.defaultModel" class="RegistryForm-Control" placeholder="gpt-4.1-mini" />
            </AdminFormField>
          </div>
        </section>

        <details class="RegistryForm-Details">
          <summary class="RegistryForm-Summary">
            {{ t('dashboard.providerRegistry.providers.advancedTitle', 'Advanced details') }}
          </summary>
          <div class="RegistryForm-Grid">
            <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.fields.providerId', 'Provider ID')" :for="fieldId('edit-id')">
              <TuffInput :id="fieldId('edit-id')" :model-value="provider.id" class="RegistryForm-Control is-mono" readonly />
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.authRef', 'Auth ref')" :for="fieldId('edit-auth-ref')">
              <TuffInput :id="fieldId('edit-auth-ref')" v-model="editPanel.authRef" class="RegistryForm-Control is-mono" />
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.ownerScope', 'Owner scope')" :for="fieldId('edit-owner-scope')">
              <TuffSelect v-model="editPanel.ownerScope" v-admin-control-id="fieldId('edit-owner-scope')" class="RegistryForm-Control">
                <TuffSelectItem v-for="scope in admin.ownerScopeOptions" :key="scope" :value="scope" :label="valueLabel(scope)" />
              </TuffSelect>
            </AdminFormField>
            <AdminFormField :label="t('dashboard.providerRegistry.fields.ownerId', 'Owner ID')" :for="fieldId('edit-owner-id')">
              <TuffInput :id="fieldId('edit-owner-id')" v-model="editPanel.ownerId" class="RegistryForm-Control is-mono" />
            </AdminFormField>
            <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON')" :for="fieldId('edit-metadata')">
              <TuffInput :id="fieldId('edit-metadata')" v-model="editPanel.metadataText" type="textarea" :rows="4" class="RegistryForm-Control is-mono" placeholder="{ }" />
            </AdminFormField>
          </div>
        </details>

        <section class="RegistryForm-Group">
          <div class="RegistryForm-GroupHead">
            <h3 class="RegistryForm-GroupTitle">
              {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
            </h3>
            <TxButton variant="secondary" size="sm" @click="admin.addProviderCapabilityEditRow(provider)">
              {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
            </TxButton>
          </div>
          <div class="RegistryRows">
            <div class="RegistryRows-Head is-edit" aria-hidden="true">
              <span>{{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}</span>
              <span>{{ t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit') }}</span>
              <span>{{ t('dashboard.providerRegistry.fields.providerModel', 'Model') }}</span>
              <span />
            </div>
            <div v-for="(row, index) in editPanel.capabilities" :key="index" class="RegistryRows-Item">
              <div class="RegistryRows-Row is-edit">
                <TuffInput
                  v-model="row.capability"
                  class="RegistryForm-Control"
                  placeholder="text.chat"
                  :aria-label="rowLabel(t('dashboard.providerRegistry.fields.capability', 'Capability'), index)"
                />
                <TuffInput
                  v-model="row.meteringUnit"
                  class="RegistryForm-Control"
                  placeholder="token"
                  :aria-label="rowLabel(t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit'), index)"
                />
                <TuffSelect
                  v-if="editModelOptions.length"
                  v-model="row.providerModel"
                  v-admin-control-label="rowLabel(t('dashboard.providerRegistry.fields.providerModel', 'Model'), index)"
                  class="RegistryForm-Control"
                  searchable
                  :search-placeholder="t('dashboard.providerRegistry.providers.modelSearchPlaceholder', 'Search models...')"
                  :placeholder="t('dashboard.providerRegistry.fields.providerModel', 'Model')"
                >
                  <TuffSelectItem value="" :label="t('dashboard.providerRegistry.providers.modelDefault', 'Use default model')" />
                  <TuffSelectItem v-for="model in editModelOptions" :key="model" :value="model" :label="model" />
                </TuffSelect>
                <TuffInput
                  v-else
                  v-model="row.providerModel"
                  class="RegistryForm-Control"
                  placeholder="gpt-4.1-mini"
                  :aria-label="rowLabel(t('dashboard.providerRegistry.fields.providerModel', 'Model'), index)"
                />
                <TxIconButton
                  size="xs"
                  icon="i-carbon-close"
                  :title="t('common.remove', 'Remove')"
                  :label="rowLabel(t('common.remove', 'Remove'), index)"
                  @click="admin.removeProviderCapabilityEditRow(provider, index)"
                />
              </div>
              <details class="RegistryForm-Details is-row">
                <summary class="RegistryForm-Summary">
                  {{ t('dashboard.providerRegistry.providers.capabilityAdvancedTitle', 'Advanced capability JSON') }}
                </summary>
                <div class="RegistryForm-Grid">
                  <AdminFormField :label="t('dashboard.providerRegistry.fields.maxImageBytes', 'Max image bytes')" :for="fieldId(`cap-${index}-max-image`)">
                    <TuffInput :id="fieldId(`cap-${index}-max-image`)" v-model="row.maxImageBytes" type="number" class="RegistryForm-Control" placeholder="5242880" />
                  </AdminFormField>
                  <AdminFormField :label="t('dashboard.providerRegistry.fields.meteringJson', 'Metering JSON')" :for="fieldId(`cap-${index}-metering`)">
                    <TuffInput :id="fieldId(`cap-${index}-metering`)" v-model="row.meteringText" type="textarea" :rows="3" class="RegistryForm-Control is-mono" placeholder="{ }" />
                  </AdminFormField>
                  <AdminFormField :label="t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON')" :for="fieldId(`cap-${index}-constraints`)">
                    <TuffInput :id="fieldId(`cap-${index}-constraints`)" v-model="row.constraintsText" type="textarea" :rows="3" class="RegistryForm-Control is-mono" placeholder="{ }" />
                  </AdminFormField>
                  <AdminFormField :label="t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON')" :for="fieldId(`cap-${index}-metadata`)">
                    <TuffInput :id="fieldId(`cap-${index}-metadata`)" v-model="row.metadataText" type="textarea" :rows="3" class="RegistryForm-Control is-mono" placeholder="{ }" />
                  </AdminFormField>
                </div>
              </details>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="mode === 'quota' && provider && quotaPanel">
        <p class="RegistryForm-Hint">
          {{ t('dashboard.providerRegistry.quota.editHint', 'Limit direct Intelligence invokes and scene runs before provider dispatch.') }}
        </p>
        <section class="RegistryForm-Grid">
          <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.quota.name', 'Quota name')" :for="fieldId('quota-name')">
            <TuffInput :id="fieldId('quota-name')" v-model="quotaPanel.name" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.status', 'Status')" :for="fieldId('quota-enabled')">
            <TuffSelect v-model="quotaPanel.enabled" v-admin-control-id="fieldId('quota-enabled')" class="RegistryForm-Control">
              <TuffSelectItem value="enabled" :label="t('dashboard.providerRegistry.quota.enabled', 'enabled')" />
              <TuffSelectItem value="disabled" :label="t('dashboard.providerRegistry.quota.disabled', 'disabled')" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.quota.windowDays', 'Window days')" :for="fieldId('quota-window')">
            <TuffInput :id="fieldId('quota-window')" v-model="quotaPanel.windowDays" type="number" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.quota.maxRequests', 'Max requests')" :for="fieldId('quota-requests')">
            <TuffInput :id="fieldId('quota-requests')" v-model="quotaPanel.maxRequests" type="number" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.quota.maxTokens', 'Max tokens')" :for="fieldId('quota-tokens')">
            <TuffInput :id="fieldId('quota-tokens')" v-model="quotaPanel.maxTokens" type="number" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.quota.warningThreshold', 'Warning %')" :for="fieldId('quota-warning')">
            <TuffInput :id="fieldId('quota-warning')" v-model="quotaPanel.warningThreshold" type="number" class="RegistryForm-Control" />
          </AdminFormField>
        </section>

        <section v-if="admin.getProviderQuotaList(provider.id).length > 1" class="RegistryForm-Group">
          <h3 class="RegistryForm-GroupTitle">
            {{ t('dashboard.providerRegistry.quota.channels', 'channels') }}
          </h3>
          <ul class="RegistryForm-List">
            <li v-for="quota in admin.getProviderQuotaList(provider.id)" :key="quota.id" class="RegistryForm-ListItem">
              {{ quota.channel || t('dashboard.providerRegistry.quota.defaultChannel', 'default') }}
              · {{ t('dashboard.providerRegistry.quota.requests', 'requests') }} {{ quotaLimit(quota.limits?.maxRequests) }}
              · {{ t('dashboard.providerRegistry.quota.tokens', 'tokens') }} {{ quotaLimit(quota.limits?.maxTokens) }}
            </li>
          </ul>
        </section>
      </template>
    </div>

    <template #footer>
      <div class="RegistryForm-Footer">
        <TxButton variant="secondary" size="sm" :disabled="saving" @click="emit('close')">
          {{ t('common.cancel', 'Cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="saving" :disabled="saving" @click="emit('submit')">
          {{ primaryLabel }}
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
