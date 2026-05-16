<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxSkeleton, TxSpinner, TxStatusBadge, TxTabItem, TxTabs } from '@talex-touch/tuffex'

const { t } = useI18n()
const {
  activeTab,
  actionPending,
  addBindingRow,
  addCapabilityRow,
  addProviderCapabilityEditRow,
  addSceneBindingEditRow,
  authTypeOptions,
  bindingRows,
  bindingStatusOptions,
  capabilities,
  capabilityCount,
  capabilityRows,
  checkProvider,
  createProvider,
  createScene,
  deleteProvider,
  deleteScene,
  enabledProviders,
  error,
  fallbackOptions,
  fetchRegistry,
  formatDate,
  formatJson,
  formatRunJson,
  getProviderCheckResult,
  getProviderEditPanel,
  getSceneEditPanel,
  getSceneRunPanel,
  healthEntries,
  isAdmin,
  loading,
  ownerScopeOptions,
  providerEditPanels,
  providerForm,
  providerOptions,
  providerStatusOptions,
  providers,
  providerVendorOptions,
  removeBindingRow,
  removeCapabilityRow,
  removeProviderCapabilityEditRow,
  removeSceneBindingEditRow,
  runScene,
  saveProviderEdit,
  saveSceneEdit,
  sceneCapabilities,
  sceneCount,
  sceneEditPanels,
  sceneForm,
  sceneOwnerOptions,
  sceneProviderOptions,
  scenes,
  savingProvider,
  savingScene,
  statusTone,
  strategyOptions,
  toggleProviderEdit,
  toggleSceneEdit,
  unhealthyCount,
  updateProviderStatus,
  updateSceneStatus,
  usageCount,
  usageEntries,
} = useProviderRegistryAdmin()
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="apple-heading-md">
          {{ t('dashboard.providerRegistry.title', 'Provider Registry') }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.providerRegistry.subtitle', 'Manage provider capabilities and scene bindings for translation, AI, exchange rates, and future runtime scenes.') }}
        </p>
      </div>
      <TxButton variant="secondary" size="small" :disabled="loading" @click="fetchRegistry">
        <TxSpinner v-if="loading" :size="14" />
        <span :class="loading ? 'ml-2' : ''">{{ t('common.refresh', 'Refresh') }}</span>
      </TxButton>
    </header>

    <div v-if="!isAdmin" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
      {{ t('dashboard.providerRegistry.adminOnly', 'Only administrators can manage provider registry.') }}
    </div>

    <div v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ error }}
    </div>

    <section class="grid gap-4 md:grid-cols-5">
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.providers', 'Providers') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ providers.length }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.enabledProviders', { count: enabledProviders }, `${enabledProviders} enabled`) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.capabilities', 'Capabilities') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ capabilityCount }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.capabilitiesHint', 'Declared by providers') }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.scenes', 'Scenes') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ sceneCount }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.scenesHint', 'Strategy bindings configured') }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.usage', 'Usage') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ usageCount }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.usageHint', 'Recent run ledger rows') }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.health', 'Health') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ unhealthyCount }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.healthHint', 'Non-healthy recent checks') }}
        </p>
      </div>
    </section>

    <section class="apple-card-lg p-6">
      <TxTabs v-model="activeTab" placement="top" :content-scrollable="false">
        <TxTabItem name="providers" icon-class="i-carbon-cloud-service-management">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.providers', 'Providers') }}
          </template>

          <div class="space-y-6">
            <section class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.providers.createTitle', 'Create provider') }}
                  </h2>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.providerRegistry.providers.createHint', 'Credentials stay in secure storage; this form only saves authRef.') }}
                  </p>
                </div>
                <TxButton variant="primary" size="small" :disabled="savingProvider" @click="createProvider">
                  {{ t('dashboard.providerRegistry.providers.create', 'Create provider') }}
                </TxButton>
              </div>

              <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.name', 'Name') }}</label>
                  <TuffInput v-model="providerForm.name" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
                  <TuffInput v-model="providerForm.displayName" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.vendor', 'Vendor') }}</label>
                  <TuffSelect v-model="providerForm.vendor" class="w-full">
                    <TuffSelectItem v-for="vendor in providerVendorOptions" :key="vendor" :value="vendor" :label="vendor" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                  <TuffSelect v-model="providerForm.status" class="w-full">
                    <TuffSelectItem v-for="status in providerStatusOptions" :key="status" :value="status" :label="status" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authType', 'Auth type') }}</label>
                  <TuffSelect v-model="providerForm.authType" class="w-full">
                    <TuffSelectItem v-for="type in authTypeOptions" :key="type" :value="type" :label="type" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authRef', 'Auth ref') }}</label>
                  <TuffInput v-model="providerForm.authRef" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.endpoint', 'Endpoint') }}</label>
                  <TuffInput v-model="providerForm.endpoint" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.region', 'Region') }}</label>
                  <TuffInput v-model="providerForm.region" class="w-full" />
                </div>
                <div v-if="providerForm.authType === 'secret_pair'">
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.secretId', 'SecretId') }}</label>
                  <TuffInput v-model="providerForm.secretId" class="w-full" autocomplete="off" />
                </div>
                <div v-if="providerForm.authType === 'secret_pair'">
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.secretKey', 'SecretKey') }}</label>
                  <TuffInput v-model="providerForm.secretKey" class="w-full" type="password" autocomplete="new-password" />
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
                  </h3>
                  <TxButton variant="secondary" size="mini" @click="addCapabilityRow">
                    {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
                  </TxButton>
                </div>
                <div
                  v-for="(row, index) in capabilityRows"
                  :key="index"
                  class="grid gap-2 rounded-xl bg-white/60 p-3 dark:bg-black/10 md:grid-cols-[1fr_1fr_160px_auto]"
                >
                  <TuffInput v-model="row.capability" placeholder="text.translate" />
                  <TuffInput v-model="row.schemaRef" placeholder="nexus://schemas/provider/..." />
                  <TuffInput v-model="row.meteringUnit" placeholder="character" />
                  <TxButton variant="secondary" size="mini" :disabled="capabilityRows.length <= 1" @click="removeCapabilityRow(index)">
                    {{ t('common.remove', 'Remove') }}
                  </TxButton>
                </div>
              </div>
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-base font-semibold text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.providers.listTitle', 'Registered providers') }}
                </h2>
              </div>
              <div v-if="loading && !providers.length" class="space-y-3">
                <TxSkeleton :loading="true" :lines="3" />
              </div>
              <div v-else-if="!providers.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
                {{ t('dashboard.providerRegistry.providers.empty', 'No providers registered yet.') }}
              </div>
              <div v-else class="space-y-3">
                <article
                  v-for="provider in providers"
                  :key="provider.id"
                  class="rounded-2xl border border-black/[0.04] bg-white/60 p-4 dark:border-white/[0.06] dark:bg-black/10"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-sm font-semibold text-black dark:text-white">
                          {{ provider.displayName }}
                        </h3>
                        <TxStatusBadge :text="provider.status" :status="statusTone(provider.status)" size="sm" />
                      </div>
                      <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                        {{ provider.id }} · {{ provider.vendor }} · {{ provider.authType }} · {{ provider.authRef || '-' }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="checkProvider(provider)">
                        <TxSpinner v-if="actionPending === `provider:${provider.id}:check`" :size="12" />
                        <span :class="actionPending === `provider:${provider.id}:check` ? 'ml-1' : ''">{{ t('dashboard.providerRegistry.actions.check', 'Check') }}</span>
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="toggleProviderEdit(provider)">
                        {{ providerEditPanels[provider.id]?.expanded ? t('dashboard.providerRegistry.actions.hideEdit', 'Hide edit') : t('dashboard.providerRegistry.actions.edit', 'Edit') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || provider.status === 'enabled'" @click="updateProviderStatus(provider, 'enabled')">
                        {{ t('dashboard.providerRegistry.actions.enable', 'Enable') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || provider.status === 'disabled'" @click="updateProviderStatus(provider, 'disabled')">
                        {{ t('dashboard.providerRegistry.actions.disable', 'Disable') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="deleteProvider(provider)">
                        {{ t('common.delete', 'Delete') }}
                      </TxButton>
                    </div>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span
                      v-for="capability in provider.capabilities"
                      :key="capability.id"
                      class="rounded-full bg-black/[0.04] px-2 py-1 text-[11px] text-black/60 dark:bg-white/[0.08] dark:text-white/60"
                    >
                      {{ capability.capability }}
                    </span>
                  </div>
                  <div
                    v-if="getProviderCheckResult(provider.id)"
                    class="mt-3 rounded-xl px-3 py-2 text-xs"
                    :class="getProviderCheckResult(provider.id)?.success ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : 'bg-amber-500/10 text-amber-700 dark:text-amber-200'"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <TxStatusBadge
                        :text="getProviderCheckResult(provider.id)?.success ? 'success' : 'failed'"
                        :status="getProviderCheckResult(provider.id)?.success ? 'success' : 'warning'"
                        size="sm"
                      />
                      <span>{{ getProviderCheckResult(provider.id)?.message }}</span>
                    </div>
                    <p class="mt-1 text-black/45 dark:text-white/45">
                      {{ getProviderCheckResult(provider.id)?.capability }} · {{ getProviderCheckResult(provider.id)?.latency }}ms · {{ getProviderCheckResult(provider.id)?.requestId || getProviderCheckResult(provider.id)?.error?.code || '-' }}
                    </p>
                  </div>
                  <div
                    v-if="getProviderEditPanel(provider).expanded"
                    class="mt-4 space-y-4 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <h4 class="text-sm font-semibold text-black dark:text-white">
                        {{ t('dashboard.providerRegistry.providers.editTitle', 'Edit provider') }}
                      </h4>
                      <div class="flex flex-wrap gap-2">
                        <TxButton variant="secondary" size="mini" :disabled="getProviderEditPanel(provider).saving" @click="toggleProviderEdit(provider)">
                          {{ t('common.cancel', 'Cancel') }}
                        </TxButton>
                        <TxButton variant="primary" size="mini" :disabled="getProviderEditPanel(provider).saving" @click="saveProviderEdit(provider)">
                          <TxSpinner v-if="getProviderEditPanel(provider).saving" :size="12" />
                          <span :class="getProviderEditPanel(provider).saving ? 'ml-1' : ''">{{ t('common.save', 'Save') }}</span>
                        </TxButton>
                      </div>
                    </div>
                    <div v-if="getProviderEditPanel(provider).error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
                      {{ getProviderEditPanel(provider).error }}
                    </div>
                    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.name', 'Name') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).name" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).displayName" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.vendor', 'Vendor') }}</label>
                        <TuffSelect v-model="getProviderEditPanel(provider).vendor" class="w-full">
                          <TuffSelectItem v-for="vendor in providerVendorOptions" :key="vendor" :value="vendor" :label="vendor" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                        <TuffSelect v-model="getProviderEditPanel(provider).status" class="w-full">
                          <TuffSelectItem v-for="status in providerStatusOptions" :key="status" :value="status" :label="status" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authType', 'Auth type') }}</label>
                        <TuffSelect v-model="getProviderEditPanel(provider).authType" class="w-full">
                          <TuffSelectItem v-for="type in authTypeOptions" :key="type" :value="type" :label="type" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authRef', 'Auth ref') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).authRef" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerScope', 'Owner scope') }}</label>
                        <TuffSelect v-model="getProviderEditPanel(provider).ownerScope" class="w-full">
                          <TuffSelectItem v-for="scope in ownerScopeOptions" :key="scope" :value="scope" :label="scope" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerId', 'Owner ID') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).ownerId" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.endpoint', 'Endpoint') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).endpoint" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.region', 'Region') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).region" class="w-full" />
                      </div>
                      <div class="md:col-span-2">
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.description', 'Description') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).description" class="w-full" />
                      </div>
                      <div class="md:col-span-2 xl:col-span-4">
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
                        <TuffInput v-model="getProviderEditPanel(provider).metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                      </div>
                    </div>
                    <div class="space-y-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <h5 class="text-sm font-medium text-black dark:text-white">
                          {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
                        </h5>
                        <TxButton variant="secondary" size="mini" @click="addProviderCapabilityEditRow(provider)">
                          {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
                        </TxButton>
                      </div>
                      <div
                        v-for="(row, index) in getProviderEditPanel(provider).capabilities"
                        :key="index"
                        class="space-y-2 rounded-lg bg-white/70 p-3 dark:bg-black/15"
                      >
                        <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <TuffInput v-model="row.capability" placeholder="text.translate" />
                          <TuffInput v-model="row.schemaRef" placeholder="schema ref" />
                          <TxButton variant="secondary" size="mini" @click="removeProviderCapabilityEditRow(provider, index)">
                            {{ t('common.remove', 'Remove') }}
                          </TxButton>
                        </div>
                        <div class="grid gap-2 lg:grid-cols-3">
                          <div>
                            <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.meteringJson', 'Metering JSON') }}</label>
                            <TuffInput v-model="row.meteringText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ &quot;unit&quot;: &quot;request&quot; }" />
                          </div>
                          <div>
                            <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON') }}</label>
                            <TuffInput v-model="row.constraintsText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                          </div>
                          <div>
                            <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
                            <TuffInput v-model="row.metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </TxTabItem>

        <TxTabItem name="capabilities" icon-class="i-carbon-catalog">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.capabilities', 'Capabilities') }}
          </template>

          <div class="space-y-3">
            <div v-if="loading && !capabilities.length" class="space-y-3">
              <TxSkeleton :loading="true" :lines="3" />
            </div>
            <div v-else-if="!capabilities.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
              {{ t('dashboard.providerRegistry.capabilities.empty', 'No capabilities declared yet.') }}
            </div>
            <article
              v-for="capability in capabilities"
              v-else
              :key="capability.id"
              class="rounded-2xl bg-black/[0.02] p-4 text-sm dark:bg-white/[0.03]"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 class="font-semibold text-black dark:text-white">
                    {{ capability.capability }}
                  </h3>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ capability.providerId }} · {{ capability.schemaRef || '-' }}
                  </p>
                </div>
                <span class="text-xs text-black/45 dark:text-white/45">
                  {{ formatDate(capability.updatedAt) }}
                </span>
              </div>
              <p class="mt-2 text-xs text-black/50 dark:text-white/50">
                metering={{ formatJson(capability.metering) }} · constraints={{ formatJson(capability.constraints) }}
              </p>
            </article>
          </div>
        </TxTabItem>

        <TxTabItem name="scenes" icon-class="i-carbon-flow">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.scenes', 'Scenes') }}
          </template>

          <div class="space-y-6">
            <section class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.scenes.createTitle', 'Create scene') }}
                  </h2>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.providerRegistry.scenes.createHint', 'Bind a scene to provider capabilities. Runtime orchestration is implemented separately.') }}
                  </p>
                </div>
                <TxButton variant="primary" size="small" :disabled="savingScene || !providers.length" @click="createScene">
                  {{ t('dashboard.providerRegistry.scenes.create', 'Create scene') }}
                </TxButton>
              </div>

              <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.sceneId', 'Scene ID') }}</label>
                  <TuffInput v-model="sceneForm.id" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
                  <TuffInput v-model="sceneForm.displayName" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.owner', 'Owner') }}</label>
                  <TuffSelect v-model="sceneForm.owner" class="w-full">
                    <TuffSelectItem v-for="owner in sceneOwnerOptions" :key="owner" :value="owner" :label="owner" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.strategy', 'Strategy') }}</label>
                  <TuffSelect v-model="sceneForm.strategyMode" class="w-full">
                    <TuffSelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy" :label="strategy" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                  <TuffSelect v-model="sceneForm.status" class="w-full">
                    <TuffSelectItem value="enabled" label="enabled" />
                    <TuffSelectItem value="disabled" label="disabled" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.fallback', 'Fallback') }}</label>
                  <TuffSelect v-model="sceneForm.fallback" class="w-full">
                    <TuffSelectItem v-for="fallback in fallbackOptions" :key="fallback" :value="fallback" :label="fallback" />
                  </TuffSelect>
                </div>
                <div class="xl:col-span-2">
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities') }}</label>
                  <TuffInput v-model="sceneForm.requiredCapabilitiesText" class="w-full" placeholder="image.translate.e2e, text.translate" />
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.scenes.bindingsTitle', 'Strategy bindings') }}
                  </h3>
                  <TxButton variant="secondary" size="mini" :disabled="!providers.length" @click="addBindingRow">
                    {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
                  </TxButton>
                </div>
                <div
                  v-for="(row, index) in bindingRows"
                  :key="index"
                  class="grid gap-2 rounded-xl bg-white/60 p-3 dark:bg-black/10 md:grid-cols-[1fr_1fr_120px_auto]"
                >
                  <TuffSelect v-model="row.providerId" class="w-full">
                    <TuffSelectItem v-for="provider in providerOptions" :key="provider.value" :value="provider.value" :label="provider.label" />
                  </TuffSelect>
                  <TuffInput v-model="row.capability" placeholder="image.translate.e2e" />
                  <TuffInput v-model="row.priority" type="number" placeholder="10" />
                  <TxButton variant="secondary" size="mini" :disabled="bindingRows.length <= 1" @click="removeBindingRow(index)">
                    {{ t('common.remove', 'Remove') }}
                  </TxButton>
                </div>
              </div>
            </section>

            <section>
              <h2 class="mb-3 text-base font-semibold text-black dark:text-white">
                {{ t('dashboard.providerRegistry.scenes.listTitle', 'Registered scenes') }}
              </h2>
              <div v-if="loading && !scenes.length" class="space-y-3">
                <TxSkeleton :loading="true" :lines="3" />
              </div>
              <div v-else-if="!scenes.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
                {{ t('dashboard.providerRegistry.scenes.empty', 'No scenes configured yet.') }}
              </div>
              <div v-else class="space-y-3">
                <article
                  v-for="scene in scenes"
                  :key="scene.id"
                  class="rounded-2xl border border-black/[0.04] bg-white/60 p-4 dark:border-white/[0.06] dark:bg-black/10"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-sm font-semibold text-black dark:text-white">
                          {{ scene.displayName }}
                        </h3>
                        <TxStatusBadge :text="scene.status" :status="statusTone(scene.status)" size="sm" />
                      </div>
                      <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                        {{ scene.id }} · {{ scene.owner }} · {{ scene.strategyMode }} · fallback={{ scene.fallback }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="getSceneRunPanel(scene).expanded = !getSceneRunPanel(scene).expanded">
                        {{ getSceneRunPanel(scene).expanded ? t('dashboard.providerRegistry.actions.hideRun', 'Hide run') : t('dashboard.providerRegistry.actions.run', 'Run') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="toggleSceneEdit(scene)">
                        {{ sceneEditPanels[scene.id]?.expanded ? t('dashboard.providerRegistry.actions.hideEdit', 'Hide edit') : t('dashboard.providerRegistry.actions.edit', 'Edit') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || scene.status === 'enabled'" @click="updateSceneStatus(scene, 'enabled')">
                        {{ t('dashboard.providerRegistry.actions.enable', 'Enable') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || scene.status === 'disabled'" @click="updateSceneStatus(scene, 'disabled')">
                        {{ t('dashboard.providerRegistry.actions.disable', 'Disable') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="deleteScene(scene)">
                        {{ t('common.delete', 'Delete') }}
                      </TxButton>
                    </div>
                  </div>
                  <div class="mt-3 space-y-2 text-xs text-black/55 dark:text-white/55">
                    <p>{{ t('dashboard.providerRegistry.scenes.required', 'Required') }}: {{ scene.requiredCapabilities.join(', ') || '-' }}</p>
                    <p>
                      {{ t('dashboard.providerRegistry.scenes.bindings', 'Bindings') }}:
                      <span v-if="!scene.bindings.length">-</span>
                      <span v-for="binding in scene.bindings" v-else :key="binding.id" class="mr-2">
                        {{ binding.providerId }} / {{ binding.capability }} / p{{ binding.priority }}
                      </span>
                    </p>
                  </div>
                  <div
                    v-if="getSceneEditPanel(scene).expanded"
                    class="mt-4 space-y-4 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <h4 class="text-sm font-semibold text-black dark:text-white">
                        {{ t('dashboard.providerRegistry.scenes.editTitle', 'Edit scene') }}
                      </h4>
                      <div class="flex flex-wrap gap-2">
                        <TxButton variant="secondary" size="mini" :disabled="getSceneEditPanel(scene).saving" @click="toggleSceneEdit(scene)">
                          {{ t('common.cancel', 'Cancel') }}
                        </TxButton>
                        <TxButton variant="primary" size="mini" :disabled="getSceneEditPanel(scene).saving" @click="saveSceneEdit(scene)">
                          <TxSpinner v-if="getSceneEditPanel(scene).saving" :size="12" />
                          <span :class="getSceneEditPanel(scene).saving ? 'ml-1' : ''">{{ t('common.save', 'Save') }}</span>
                        </TxButton>
                      </div>
                    </div>
                    <div v-if="getSceneEditPanel(scene).error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
                      {{ getSceneEditPanel(scene).error }}
                    </div>
                    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
                        <TuffInput v-model="getSceneEditPanel(scene).displayName" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.owner', 'Owner') }}</label>
                        <TuffSelect v-model="getSceneEditPanel(scene).owner" class="w-full">
                          <TuffSelectItem v-for="owner in sceneOwnerOptions" :key="owner" :value="owner" :label="owner" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerScope', 'Owner scope') }}</label>
                        <TuffSelect v-model="getSceneEditPanel(scene).ownerScope" class="w-full">
                          <TuffSelectItem v-for="scope in ownerScopeOptions" :key="scope" :value="scope" :label="scope" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerId', 'Owner ID') }}</label>
                        <TuffInput v-model="getSceneEditPanel(scene).ownerId" class="w-full" />
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                        <TuffSelect v-model="getSceneEditPanel(scene).status" class="w-full">
                          <TuffSelectItem v-for="status in bindingStatusOptions" :key="status" :value="status" :label="status" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.strategy', 'Strategy') }}</label>
                        <TuffSelect v-model="getSceneEditPanel(scene).strategyMode" class="w-full">
                          <TuffSelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy" :label="strategy" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.fallback', 'Fallback') }}</label>
                        <TuffSelect v-model="getSceneEditPanel(scene).fallback" class="w-full">
                          <TuffSelectItem v-for="fallback in fallbackOptions" :key="fallback" :value="fallback" :label="fallback" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities') }}</label>
                        <TuffInput v-model="getSceneEditPanel(scene).requiredCapabilitiesText" class="w-full" placeholder="image.translate.e2e, text.translate" />
                      </div>
                      <div class="md:col-span-2 xl:col-span-4">
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.meteringPolicyJson', 'Metering policy JSON') }}</label>
                        <TuffInput v-model="getSceneEditPanel(scene).meteringPolicyText" type="textarea" :rows="3" class="w-full font-mono text-xs" placeholder="{ }" />
                      </div>
                      <div class="md:col-span-2">
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.auditPolicyJson', 'Audit policy JSON') }}</label>
                        <TuffInput v-model="getSceneEditPanel(scene).auditPolicyText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ &quot;persistInput&quot;: false, &quot;persistOutput&quot;: false }" />
                      </div>
                      <div class="md:col-span-2">
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
                        <TuffInput v-model="getSceneEditPanel(scene).metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                      </div>
                    </div>
                    <div class="space-y-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <h5 class="text-sm font-medium text-black dark:text-white">
                          {{ t('dashboard.providerRegistry.scenes.bindingsTitle', 'Strategy bindings') }}
                        </h5>
                        <TxButton variant="secondary" size="mini" :disabled="!providers.length" @click="addSceneBindingEditRow(scene)">
                          {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
                        </TxButton>
                      </div>
                      <div
                        v-for="(row, index) in getSceneEditPanel(scene).bindings"
                        :key="index"
                        class="space-y-2 rounded-lg bg-white/70 p-3 dark:bg-black/15"
                      >
                        <div class="grid gap-2 md:grid-cols-[1fr_1fr_100px_100px_120px_auto]">
                          <TuffSelect v-model="row.providerId" class="w-full">
                            <TuffSelectItem v-for="providerOption in providerOptions" :key="providerOption.value" :value="providerOption.value" :label="providerOption.label" />
                          </TuffSelect>
                          <TuffInput v-model="row.capability" placeholder="image.translate.e2e" />
                          <TuffInput v-model="row.priority" type="number" placeholder="100" />
                          <TuffInput v-model="row.weightText" type="number" placeholder="weight" />
                          <TuffSelect v-model="row.status" class="w-full">
                            <TuffSelectItem v-for="status in bindingStatusOptions" :key="status" :value="status" :label="status" />
                          </TuffSelect>
                          <TxButton variant="secondary" size="mini" @click="removeSceneBindingEditRow(scene, index)">
                            {{ t('common.remove', 'Remove') }}
                          </TxButton>
                        </div>
                        <div class="grid gap-2 lg:grid-cols-2">
                          <div>
                            <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON') }}</label>
                            <TuffInput v-model="row.constraintsText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ &quot;cost&quot;: 0.01 }" />
                          </div>
                          <div>
                            <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
                            <TuffInput v-model="row.metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="getSceneRunPanel(scene).expanded"
                    class="mt-4 space-y-3 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]"
                  >
                    <div class="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}</label>
                        <TuffSelect v-model="getSceneRunPanel(scene).capability" class="w-full">
                          <TuffSelectItem value="" :label="t('dashboard.providerRegistry.scenes.defaultCapability', 'Scene default')" />
                          <TuffSelectItem v-for="capability in sceneCapabilities(scene)" :key="capability" :value="capability" :label="capability" />
                        </TuffSelect>
                      </div>
                      <div>
                        <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.provider', 'Provider') }}</label>
                        <TuffSelect v-model="getSceneRunPanel(scene).providerId" class="w-full">
                          <TuffSelectItem value="" :label="t('dashboard.providerRegistry.scenes.defaultProvider', 'Strategy default')" />
                          <TuffSelectItem v-for="provider in sceneProviderOptions(scene)" :key="provider.value" :value="provider.value" :label="provider.label" />
                        </TuffSelect>
                      </div>
                      <div class="flex items-end">
                        <TxButton variant="secondary" size="small" :disabled="actionPending !== null" @click="runScene(scene, true)">
                          <TxSpinner v-if="actionPending === `scene:${scene.id}:run:dry`" :size="12" />
                          <span :class="actionPending === `scene:${scene.id}:run:dry` ? 'ml-1' : ''">{{ t('dashboard.providerRegistry.actions.dryRun', 'Dry run') }}</span>
                        </TxButton>
                      </div>
                      <div class="flex items-end">
                        <TxButton variant="primary" size="small" :disabled="actionPending !== null || scene.status !== 'enabled'" @click="runScene(scene, false)">
                          <TxSpinner v-if="actionPending === `scene:${scene.id}:run:execute`" :size="12" />
                          <span :class="actionPending === `scene:${scene.id}:run:execute` ? 'ml-1' : ''">{{ t('dashboard.providerRegistry.actions.execute', 'Execute') }}</span>
                        </TxButton>
                      </div>
                    </div>
                    <div>
                      <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.scenes.inputJson', 'Input JSON') }}</label>
                      <TuffInput
                        v-model="getSceneRunPanel(scene).inputText"
                        type="textarea"
                        :rows="6"
                        class="w-full font-mono text-xs"
                        placeholder="{&quot;text&quot;:&quot;Hello&quot;,&quot;targetLang&quot;:&quot;zh&quot;}"
                      />
                    </div>
                    <div v-if="getSceneRunPanel(scene).error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
                      {{ getSceneRunPanel(scene).error }}
                    </div>
                    <div v-if="getSceneRunPanel(scene).result" class="space-y-3">
                      <div class="flex flex-wrap items-center gap-2 text-xs text-black/55 dark:text-white/55">
                        <TxStatusBadge :text="getSceneRunPanel(scene).result?.status || '-'" :status="statusTone(getSceneRunPanel(scene).result?.status || '')" size="sm" />
                        <span>{{ getSceneRunPanel(scene).result?.runId }}</span>
                        <span>{{ getSceneRunPanel(scene).result?.mode }}</span>
                      </div>
                      <div class="grid gap-3 lg:grid-cols-2">
                        <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                          <p class="apple-section-title mb-2">
                            {{ t('dashboard.providerRegistry.scenes.trace', 'Trace') }}
                          </p>
                          <div class="space-y-2">
                            <div v-for="step in getSceneRunPanel(scene).result?.trace || []" :key="`${step.phase}-${step.at}`" class="text-xs">
                              <div class="flex flex-wrap items-center gap-2">
                                <TxStatusBadge :text="step.status" :status="statusTone(step.status)" size="sm" />
                                <span class="font-medium text-black dark:text-white">{{ step.phase }}</span>
                              </div>
                              <p class="mt-1 text-black/50 dark:text-white/50">
                                {{ step.message }}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                          <p class="apple-section-title mb-2">
                            {{ t('dashboard.providerRegistry.scenes.output', 'Output') }}
                          </p>
                          <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(getSceneRunPanel(scene).result?.output ?? null) }}</pre>
                        </div>
                      </div>
                      <div class="grid gap-3 lg:grid-cols-2">
                        <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                          <p class="apple-section-title mb-2">
                            {{ t('dashboard.providerRegistry.scenes.selection', 'Selection') }}
                          </p>
                          <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(getSceneRunPanel(scene).result?.selected ?? []) }}</pre>
                        </div>
                        <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                          <p class="apple-section-title mb-2">
                            {{ t('dashboard.providerRegistry.scenes.fallbackTrail', 'Fallback trail') }}
                          </p>
                          <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(getSceneRunPanel(scene).result?.fallbackTrail ?? []) }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </TxTabItem>

        <TxTabItem name="usage" icon-class="i-carbon-data-check">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.usage', 'Usage') }}
          </template>

          <div class="space-y-3">
            <div v-if="loading && !usageEntries.length" class="space-y-3">
              <TxSkeleton :loading="true" :lines="3" />
            </div>
            <div v-else-if="!usageEntries.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
              {{ t('dashboard.providerRegistry.usage.empty', 'No scene run usage recorded yet.') }}
            </div>
            <article
              v-for="entry in usageEntries"
              v-else
              :key="entry.id"
              class="rounded-2xl bg-black/[0.02] p-4 text-sm dark:bg-white/[0.03]"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <TxStatusBadge :text="entry.status" :status="statusTone(entry.status)" size="sm" />
                    <span class="font-semibold text-black dark:text-white">{{ entry.sceneId }}</span>
                    <span class="text-xs text-black/45 dark:text-white/45">{{ entry.mode }}</span>
                  </div>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ entry.runId }} · {{ entry.providerId || '-' }} · {{ entry.capability || '-' }}
                  </p>
                </div>
                <span class="text-xs text-black/45 dark:text-white/45">
                  {{ formatDate(entry.createdAt) }}
                </span>
              </div>
              <div class="mt-3 grid gap-3 md:grid-cols-3">
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-1">
                    {{ t('dashboard.providerRegistry.usage.metering', 'Metering') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.quantity }} {{ entry.unit }} · billable={{ entry.billable }} · estimated={{ entry.estimated }}
                  </p>
                </div>
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-1">
                    {{ t('dashboard.providerRegistry.usage.error', 'Error') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.errorCode || '-' }}{{ entry.errorMessage ? ` · ${entry.errorMessage}` : '' }}
                  </p>
                </div>
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-1">
                    {{ t('dashboard.providerRegistry.usage.providerRef', 'Provider ref') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.providerUsageRef || entry.pricingRef || '-' }}
                  </p>
                </div>
              </div>
              <div class="mt-3 grid gap-3 lg:grid-cols-2">
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-2">
                    {{ t('dashboard.providerRegistry.scenes.trace', 'Trace') }}
                  </p>
                  <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(entry.trace) }}</pre>
                </div>
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-2">
                    {{ t('dashboard.providerRegistry.scenes.fallbackTrail', 'Fallback trail') }}
                  </p>
                  <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(entry.fallbackTrail) }}</pre>
                </div>
              </div>
            </article>
          </div>
        </TxTabItem>

        <TxTabItem name="health" icon-class="i-carbon-pulse">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.health', 'Health') }}
          </template>

          <div class="space-y-3">
            <div v-if="loading && !healthEntries.length" class="space-y-3">
              <TxSkeleton :loading="true" :lines="3" />
            </div>
            <div v-else-if="!healthEntries.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
              {{ t('dashboard.providerRegistry.health.empty', 'No provider health checks recorded yet.') }}
            </div>
            <article
              v-for="entry in healthEntries"
              v-else
              :key="entry.id"
              class="rounded-2xl bg-black/[0.02] p-4 text-sm dark:bg-white/[0.03]"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <TxStatusBadge :text="entry.status" :status="statusTone(entry.status === 'healthy' ? 'success' : entry.status === 'degraded' ? 'degraded' : 'failed')" size="sm" />
                    <span class="font-semibold text-black dark:text-white">{{ entry.providerName }}</span>
                    <span class="text-xs text-black/45 dark:text-white/45">{{ entry.capability }}</span>
                  </div>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ entry.providerId }} · {{ entry.vendor }} · {{ entry.endpoint }}
                  </p>
                </div>
                <span class="text-xs text-black/45 dark:text-white/45">
                  {{ formatDate(entry.checkedAt) }}
                </span>
              </div>
              <div class="mt-3 grid gap-3 md:grid-cols-3">
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-1">
                    {{ t('dashboard.providerRegistry.health.latency', 'Latency') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.latencyMs }}ms
                  </p>
                </div>
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-1">
                    {{ t('dashboard.providerRegistry.health.reason', 'Reason') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.degradedReason || '-' }}
                  </p>
                </div>
                <div class="rounded-lg bg-white/70 p-3 dark:bg-black/15">
                  <p class="apple-section-title mb-1">
                    {{ t('dashboard.providerRegistry.health.request', 'Request') }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.requestId || entry.errorCode || '-' }}
                  </p>
                </div>
              </div>
              <p v-if="entry.errorMessage" class="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                {{ entry.errorMessage }}
              </p>
            </article>
          </div>
        </TxTabItem>
      </TxTabs>
    </section>
  </div>
</template>
