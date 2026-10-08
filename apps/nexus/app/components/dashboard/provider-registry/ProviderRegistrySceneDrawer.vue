<script setup lang="ts">
import type { SceneDrawerMode } from '~/utils/admin-provider-registry'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { SceneRegistryRecord } from '~/utils/provider-registry-admin'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton, TxIconButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, useId } from 'vue'
import AdminFormField from '~/components/admin/AdminFormField.vue'
import { ADMIN_FORMAT_EMPTY } from '~/composables/useAdminFormat'

const props = defineProps<{
  admin: ProviderRegistryAdmin
  mode: SceneDrawerMode
  scene: SceneRegistryRecord | null
}>()

const emit = defineEmits<{
  submit: []
  close: []
  /** 执行 calls the provider for real: the panel confirms first. */
  execute: []
}>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const admin = props.admin

const idBase = useId()
function fieldId(name: string): string {
  return `${idBase}-${name}`
}

const editPanel = computed(() => props.mode === 'edit' && props.scene ? admin.getSceneEditPanel(props.scene) : null)
const runPanel = computed(() => props.mode === 'run' && props.scene ? admin.getSceneRunPanel(props.scene) : null)

const saving = computed(() => admin.savingScene.value || Boolean(editPanel.value?.saving))
const error = computed(() => {
  if (props.mode === 'create')
    return admin.sceneCreateError.value
  if (props.mode === 'edit')
    return editPanel.value?.error ?? null
  return runPanel.value?.error ?? null
})

const title = computed(() => {
  if (props.mode === 'run')
    return t('dashboard.providerRegistry.routes.runTitle', 'Run route')
  return props.mode === 'create'
    ? t('dashboard.providerRegistry.routes.createTitle', 'Create route')
    : t('dashboard.providerRegistry.routes.editTitle', 'Edit route')
})

const primaryLabel = computed(() => props.mode === 'create'
  ? t('dashboard.providerRegistry.routes.create', 'Create route')
  : t('common.save', 'Save'))

function valueLabel(value: string | null | undefined): string {
  if (!value)
    return ADMIN_FORMAT_EMPTY
  return t(`dashboard.providerRegistry.values.${value}`, value)
}

function rowLabel(label: string, index: number): string {
  return t('dashboard.providerRegistry.form.rowField', { field: label, row: index + 1 }, `${label}, row ${index + 1}`)
}

function runPending(kind: 'dry' | 'execute'): boolean {
  return Boolean(props.scene) && admin.actionPending.value === `scene:${props.scene!.id}:run:${kind}`
}

function selectRunCapability(capability: unknown) {
  if (props.scene)
    admin.applySceneRunCapabilitySample(props.scene, String(capability ?? ''))
}
</script>

<template>
  <TxDrawer v-model:visible="open" :title="title" size="min(820px, 100vw)" direction="right">
    <div class="RegistryForm">
      <TxAlert v-if="error" type="error" :closable="false" :message="error" />

      <template v-if="mode === 'create'">
        <p class="RegistryForm-Hint">
          {{ t('dashboard.providerRegistry.routes.createHint', 'Bind a route to provider capabilities and strategy rules.') }}
        </p>
        <section class="RegistryForm-Grid">
          <AdminFormField :label="t('dashboard.providerRegistry.fields.routeId', 'Route ID')" :for="fieldId('id')">
            <TuffInput :id="fieldId('id')" v-model="admin.sceneForm.id" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.displayName', 'Display name')" :for="fieldId('display-name')">
            <TuffInput :id="fieldId('display-name')" v-model="admin.sceneForm.displayName" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.owner', 'Owner')" :for="fieldId('owner')">
            <TuffSelect :id="fieldId('owner')" v-model="admin.sceneForm.owner" class="RegistryForm-Control">
              <TuffSelectItem v-for="owner in admin.sceneOwnerOptions" :key="owner" :value="owner" :label="valueLabel(owner)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.strategy', 'Strategy')" :for="fieldId('strategy')">
            <TuffSelect :id="fieldId('strategy')" v-model="admin.sceneForm.strategyMode" class="RegistryForm-Control">
              <TuffSelectItem v-for="strategy in admin.strategyOptions" :key="strategy" :value="strategy" :label="valueLabel(strategy)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.status', 'Status')" :for="fieldId('status')">
            <TuffSelect :id="fieldId('status')" v-model="admin.sceneForm.status" class="RegistryForm-Control">
              <TuffSelectItem value="enabled" :label="valueLabel('enabled')" />
              <TuffSelectItem value="disabled" :label="valueLabel('disabled')" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.fallback', 'Fallback')" :for="fieldId('fallback')">
            <TuffSelect :id="fieldId('fallback')" v-model="admin.sceneForm.fallback" class="RegistryForm-Control">
              <TuffSelectItem v-for="fallback in admin.fallbackOptions" :key="fallback" :value="fallback" :label="valueLabel(fallback)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities')" :for="fieldId('required')">
            <TuffInput :id="fieldId('required')" v-model="admin.sceneForm.requiredCapabilitiesText" class="RegistryForm-Control" placeholder="image.translate.e2e, text.translate" />
          </AdminFormField>
        </section>

        <section class="RegistryForm-Group">
          <div class="RegistryForm-GroupHead">
            <h3 class="RegistryForm-GroupTitle">
              {{ t('dashboard.providerRegistry.routes.bindingsTitle', 'Provider bindings') }}
            </h3>
            <TxButton variant="secondary" size="sm" :disabled="!admin.providers.value.length" @click="admin.addBindingRow">
              {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
            </TxButton>
          </div>
          <div class="RegistryRows">
            <div class="RegistryRows-Head is-binding" aria-hidden="true">
              <span>{{ t('dashboard.providerRegistry.fields.provider', 'Provider') }}</span>
              <span>{{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}</span>
              <span>{{ t('dashboard.providerRegistry.fields.model', 'Model') }}</span>
              <span>{{ t('dashboard.providerRegistry.fields.priority', 'Priority') }}</span>
              <span />
            </div>
            <div v-for="(row, index) in admin.bindingRows.value" :key="index" class="RegistryRows-Row is-binding">
              <TuffSelect v-model="row.providerId" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.provider', 'Provider'), index)" class="RegistryForm-Control">
                <TuffSelectItem v-for="provider in admin.providerOptions.value" :key="provider.value" :value="provider.value" :label="provider.label" />
              </TuffSelect>
              <TuffInput v-model="row.capability" class="RegistryForm-Control" placeholder="image.translate.e2e" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.capability', 'Capability'), index)" />
              <TuffSelect v-model="row.model" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.model', 'Model'), index)" class="RegistryForm-Control" :placeholder="t('dashboard.providerRegistry.fields.model', 'Model')">
                <TuffSelectItem value="" :label="t('dashboard.providerRegistry.providers.modelDefault', 'Use default model')" />
                <TuffSelectItem v-for="model in admin.bindingModelOptions(row.providerId)" :key="model" :value="model" :label="model" />
              </TuffSelect>
              <TuffInput v-model="row.priority" type="number" class="RegistryForm-Control" placeholder="10" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.priority', 'Priority'), index)" />
              <TxIconButton
                size="xs"
                icon="i-carbon-close"
                :disabled="admin.bindingRows.value.length <= 1"
                :title="t('common.remove', 'Remove')"
                :label="rowLabel(t('common.remove', 'Remove'), index)"
                @click="admin.removeBindingRow(index)"
              />
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="mode === 'edit' && scene && editPanel">
        <section class="RegistryForm-Grid">
          <AdminFormField :label="t('dashboard.providerRegistry.fields.displayName', 'Display name')" :for="fieldId('edit-display-name')">
            <TuffInput :id="fieldId('edit-display-name')" v-model="editPanel.displayName" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.owner', 'Owner')" :for="fieldId('edit-owner')">
            <TuffSelect :id="fieldId('edit-owner')" v-model="editPanel.owner" class="RegistryForm-Control">
              <TuffSelectItem v-for="owner in admin.sceneOwnerOptions" :key="owner" :value="owner" :label="valueLabel(owner)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.ownerScope', 'Owner scope')" :for="fieldId('edit-owner-scope')">
            <TuffSelect :id="fieldId('edit-owner-scope')" v-model="editPanel.ownerScope" class="RegistryForm-Control">
              <TuffSelectItem v-for="scope in admin.ownerScopeOptions" :key="scope" :value="scope" :label="valueLabel(scope)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.ownerId', 'Owner ID')" :for="fieldId('edit-owner-id')">
            <TuffInput :id="fieldId('edit-owner-id')" v-model="editPanel.ownerId" class="RegistryForm-Control" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.status', 'Status')" :for="fieldId('edit-status')">
            <TuffSelect :id="fieldId('edit-status')" v-model="editPanel.status" class="RegistryForm-Control">
              <TuffSelectItem v-for="status in admin.bindingStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.strategy', 'Strategy')" :for="fieldId('edit-strategy')">
            <TuffSelect :id="fieldId('edit-strategy')" v-model="editPanel.strategyMode" class="RegistryForm-Control">
              <TuffSelectItem v-for="strategy in admin.strategyOptions" :key="strategy" :value="strategy" :label="valueLabel(strategy)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.fallback', 'Fallback')" :for="fieldId('edit-fallback')">
            <TuffSelect :id="fieldId('edit-fallback')" v-model="editPanel.fallback" class="RegistryForm-Control">
              <TuffSelectItem v-for="fallback in admin.fallbackOptions" :key="fallback" :value="fallback" :label="valueLabel(fallback)" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities')" :for="fieldId('edit-required')">
            <TuffInput :id="fieldId('edit-required')" v-model="editPanel.requiredCapabilitiesText" class="RegistryForm-Control" placeholder="image.translate.e2e, text.translate" />
          </AdminFormField>
          <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.fields.meteringPolicyJson', 'Metering policy JSON')" :for="fieldId('edit-metering')">
            <TuffInput :id="fieldId('edit-metering')" v-model="editPanel.meteringPolicyText" type="textarea" :rows="3" class="RegistryForm-Control is-mono" placeholder="{ }" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.auditPolicyJson', 'Audit policy JSON')" :for="fieldId('edit-audit')">
            <TuffInput :id="fieldId('edit-audit')" v-model="editPanel.auditPolicyText" type="textarea" :rows="4" class="RegistryForm-Control is-mono" placeholder="{ &quot;persistInput&quot;: false, &quot;persistOutput&quot;: false }" />
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON')" :for="fieldId('edit-metadata')">
            <TuffInput :id="fieldId('edit-metadata')" v-model="editPanel.metadataText" type="textarea" :rows="4" class="RegistryForm-Control is-mono" placeholder="{ }" />
          </AdminFormField>
        </section>

        <section class="RegistryForm-Group">
          <div class="RegistryForm-GroupHead">
            <h3 class="RegistryForm-GroupTitle">
              {{ t('dashboard.providerRegistry.routes.bindingsTitle', 'Provider bindings') }}
            </h3>
            <TxButton variant="secondary" size="sm" :disabled="!admin.providers.value.length" @click="admin.addSceneBindingEditRow(scene)">
              {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
            </TxButton>
          </div>
          <div class="RegistryRows">
            <div v-for="(row, index) in editPanel.bindings" :key="index" class="RegistryRows-Item">
              <div class="RegistryRows-Row is-binding">
                <TuffSelect v-model="row.providerId" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.provider', 'Provider'), index)" class="RegistryForm-Control">
                  <TuffSelectItem v-for="providerOption in admin.providerOptions.value" :key="providerOption.value" :value="providerOption.value" :label="providerOption.label" />
                </TuffSelect>
                <TuffInput v-model="row.capability" class="RegistryForm-Control" placeholder="image.translate.e2e" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.capability', 'Capability'), index)" />
                <TuffSelect v-model="row.model" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.model', 'Model'), index)" class="RegistryForm-Control" :placeholder="t('dashboard.providerRegistry.fields.model', 'Model')">
                  <TuffSelectItem value="" :label="t('dashboard.providerRegistry.providers.modelDefault', 'Use default model')" />
                  <TuffSelectItem v-for="model in admin.bindingModelOptions(row.providerId)" :key="model" :value="model" :label="model" />
                </TuffSelect>
                <TuffInput v-model="row.priority" type="number" class="RegistryForm-Control" placeholder="100" :aria-label="rowLabel(t('dashboard.providerRegistry.fields.priority', 'Priority'), index)" />
                <TxIconButton
                  size="xs"
                  icon="i-carbon-close"
                  :title="t('common.remove', 'Remove')"
                  :label="rowLabel(t('common.remove', 'Remove'), index)"
                  @click="admin.removeSceneBindingEditRow(scene, index)"
                />
              </div>
              <div class="RegistryForm-Grid">
                <AdminFormField :label="t('dashboard.providerRegistry.fields.weight', 'Weight')" :for="fieldId(`binding-${index}-weight`)">
                  <TuffInput :id="fieldId(`binding-${index}-weight`)" v-model="row.weightText" type="number" class="RegistryForm-Control" />
                </AdminFormField>
                <AdminFormField :label="t('dashboard.providerRegistry.fields.bindingStatus', 'Binding status')" :for="fieldId(`binding-${index}-status`)">
                  <TuffSelect :id="fieldId(`binding-${index}-status`)" v-model="row.status" class="RegistryForm-Control">
                    <TuffSelectItem v-for="status in admin.bindingStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
                  </TuffSelect>
                </AdminFormField>
                <AdminFormField :label="t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON')" :for="fieldId(`binding-${index}-constraints`)">
                  <TuffInput :id="fieldId(`binding-${index}-constraints`)" v-model="row.constraintsText" type="textarea" :rows="3" class="RegistryForm-Control is-mono" placeholder="{ &quot;cost&quot;: 0.01 }" />
                </AdminFormField>
                <AdminFormField :label="t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON')" :for="fieldId(`binding-${index}-metadata`)">
                  <TuffInput :id="fieldId(`binding-${index}-metadata`)" v-model="row.metadataText" type="textarea" :rows="3" class="RegistryForm-Control is-mono" placeholder="{ }" />
                </AdminFormField>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="mode === 'run' && scene && runPanel">
        <section class="RegistryForm-Grid">
          <AdminFormField :label="t('dashboard.providerRegistry.fields.capability', 'Capability')" :for="fieldId('run-capability')">
            <TuffSelect :id="fieldId('run-capability')" :model-value="runPanel.capability" class="RegistryForm-Control" @update:model-value="selectRunCapability">
              <TuffSelectItem value="" :label="t('dashboard.providerRegistry.routes.defaultCapability', 'Route default')" />
              <TuffSelectItem v-for="capability in admin.sceneCapabilities(scene)" :key="capability" :value="capability" :label="capability" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField :label="t('dashboard.providerRegistry.fields.provider', 'Provider')" :for="fieldId('run-provider')">
            <TuffSelect :id="fieldId('run-provider')" v-model="runPanel.providerId" class="RegistryForm-Control">
              <TuffSelectItem value="" :label="t('dashboard.providerRegistry.routes.defaultProvider', 'Strategy default')" />
              <TuffSelectItem v-for="provider in admin.sceneProviderOptions(scene)" :key="provider.value" :value="provider.value" :label="provider.label" />
            </TuffSelect>
          </AdminFormField>
          <AdminFormField class="RegistryForm-Wide" :label="t('dashboard.providerRegistry.routes.inputJson', 'Input JSON')" :for="fieldId('run-input')">
            <TuffInput :id="fieldId('run-input')" v-model="runPanel.inputText" type="textarea" :rows="7" class="RegistryForm-Control is-mono" placeholder="{&quot;text&quot;:&quot;Hello&quot;,&quot;targetLang&quot;:&quot;zh&quot;}" />
          </AdminFormField>
        </section>
        <div>
          <TxButton variant="secondary" size="sm" @click="selectRunCapability(runPanel.capability)">
            {{ t('dashboard.providerRegistry.routes.resetSample', 'Reset sample') }}
          </TxButton>
        </div>

        <section v-if="runPanel.result" class="RegistryRun">
          <div class="RegistryRun-Meta">
            <TxStatusBadge :text="valueLabel(runPanel.result.status)" :status="admin.statusTone(runPanel.result.status)" size="sm" />
            <span>{{ runPanel.result.runId }}</span>
            <span>{{ valueLabel(runPanel.result.mode) }}</span>
          </div>
          <div class="RegistryRun-Grid">
            <section class="RegistryForm-Group">
              <h3 class="RegistryForm-GroupTitle">
                {{ t('dashboard.providerRegistry.routes.trace', 'Trace') }}
              </h3>
              <pre class="RegistryPre">{{ admin.formatRunJson(runPanel.result.trace) }}</pre>
            </section>
            <section class="RegistryForm-Group">
              <h3 class="RegistryForm-GroupTitle">
                {{ t('dashboard.providerRegistry.routes.output', 'Output') }}
              </h3>
              <pre class="RegistryPre">{{ admin.formatRunJson(runPanel.result.output ?? null) }}</pre>
            </section>
            <section class="RegistryForm-Group">
              <h3 class="RegistryForm-GroupTitle">
                {{ t('dashboard.providerRegistry.routes.selection', 'Selection') }}
              </h3>
              <pre class="RegistryPre">{{ admin.formatRunJson(runPanel.result.selected ?? []) }}</pre>
            </section>
            <section class="RegistryForm-Group">
              <h3 class="RegistryForm-GroupTitle">
                {{ t('dashboard.providerRegistry.routes.fallbackTrail', 'Fallback trail') }}
              </h3>
              <pre class="RegistryPre">{{ admin.formatRunJson(runPanel.result.fallbackTrail ?? []) }}</pre>
            </section>
          </div>
        </section>
      </template>
    </div>

    <template #footer>
      <div class="RegistryForm-Footer">
        <TxButton variant="secondary" size="sm" :disabled="saving" @click="emit('close')">
          {{ t('common.cancel', 'Cancel') }}
        </TxButton>
        <template v-if="mode === 'run' && scene">
          <TxButton
            variant="secondary"
            size="sm"
            :loading="runPending('dry')"
            :disabled="admin.actionPending.value !== null"
            @click="admin.runScene(scene, true)"
          >
            {{ t('dashboard.providerRegistry.actions.dryRun', 'Dry run') }}
          </TxButton>
          <TxButton
            variant="primary"
            size="sm"
            :loading="runPending('execute')"
            :disabled="admin.actionPending.value !== null || scene.status !== 'enabled'"
            @click="emit('execute')"
          >
            {{ t('dashboard.providerRegistry.actions.execute', 'Execute') }}
          </TxButton>
        </template>
        <TxButton v-else variant="primary" size="sm" :loading="saving" :disabled="saving" @click="emit('submit')">
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
