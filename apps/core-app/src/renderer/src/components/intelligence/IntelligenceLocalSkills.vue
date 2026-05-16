<script setup name="IntelligenceLocalSkills" lang="ts">
import type { IntelligenceLocalEnvironmentSummary } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex'
import { createIntelligenceClient } from '@talex-touch/tuff-intelligence'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
const transport = useTuffTransport()
const aiClient = createIntelligenceClient(transport)

const environment = ref<IntelligenceLocalEnvironmentSummary | null>(null)
const loading = ref(false)
const error = ref('')

const installedTools = computed(
  () => environment.value?.tools.filter((tool) => tool.installed) ?? []
)
const installedSkills = computed(
  () => environment.value?.skillProviders.filter((skill) => skill.installed) ?? []
)
const enabledSkills = computed(() => installedSkills.value.filter((skill) => skill.enabled))
const gatedSkills = computed(
  () => environment.value?.skillProviders.filter((skill) => skill.mode === 'gated') ?? []
)
const configFileCount = computed(
  () => environment.value?.configFiles.filter((file) => file.exists).length ?? 0
)

function formatToolNames(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  if (installedTools.value.length === 0) return t('settings.intelligence.localSkills.noTools')
  return installedTools.value.map((tool) => tool.name).join(' / ')
}

function formatSkillNames(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  if (installedSkills.value.length === 0) return t('settings.intelligence.localSkills.noSkills')
  return enabledSkills.value
    .slice(0, 4)
    .map((skill) => skill.name)
    .join(' / ')
}

function formatConfigSummary(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  return t('settings.intelligence.localSkills.configSummary', {
    count: configFileCount.value
  })
}

async function refreshEnvironment(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    environment.value = await aiClient.getLocalEnvironment()
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.refreshFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshEnvironment()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.intelligence.localSkills.title')"
    :description="t('settings.intelligence.localSkills.desc')"
    default-icon="i-carbon-tool-kit"
    active-icon="i-carbon-tool-kit"
    memory-name="intelligence-local-skills"
  >
    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.toolsTitle')"
      :description="formatToolNames()"
      default-icon="i-carbon-terminal"
      active-icon="i-carbon-terminal"
    >
      <span class="local-skills__stat">
        {{ installedTools.length }}/{{ environment?.tools.length ?? 2 }}
      </span>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.providersTitle')"
      :description="formatSkillNames()"
      default-icon="i-carbon-ibm-watson-discovery"
      active-icon="i-carbon-ibm-watson-discovery"
    >
      <span class="local-skills__stat">
        {{ enabledSkills.length }}/{{ installedSkills.length }}
      </span>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.configTitle')"
      :description="error || formatConfigSummary()"
      default-icon="i-carbon-document-configuration"
      active-icon="i-carbon-document-configuration"
    >
      <TxButton variant="flat" :loading="loading" @click.stop="refreshEnvironment">
        <i class="i-carbon-renew" />
        <span>{{ t('settings.intelligence.localSkills.refresh') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <div v-if="environment" class="local-skills__chips">
      <span
        v-for="skill in environment.skillProviders.filter((item) => item.installed).slice(0, 8)"
        :key="skill.id"
        class="local-skills__chip"
        :class="{ 'is-gated': skill.mode === 'gated' }"
      >
        {{ skill.name }}
      </span>
      <span v-if="gatedSkills.length" class="local-skills__hint">
        {{ t('settings.intelligence.localSkills.gatedHint', { count: gatedSkills.length }) }}
      </span>
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.local-skills__stat {
  min-width: 48px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
}

.local-skills__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px 12px;
}

.local-skills__chip,
.local-skills__hint {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color-light);
}

.local-skills__chip.is-gated {
  color: var(--tx-color-warning);
}

.local-skills__hint {
  color: var(--tx-text-color-placeholder);
}
</style>
