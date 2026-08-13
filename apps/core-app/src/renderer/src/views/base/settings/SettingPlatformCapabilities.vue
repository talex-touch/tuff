<script setup lang="ts" name="SettingPlatformCapabilities">
import type {
  PlatformCapability,
  PlatformCapabilityScope,
  PlatformCapabilitySupportLevel,
  PlatformCapabilityStatus
} from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { usePlatformSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'

const { t } = useI18n()
const platformSdk = usePlatformSdk()
const settingPlatformCapabilitiesLog = createRendererLogger('SettingPlatformCapabilities')

type PlatformCapabilityView = PlatformCapability & {
  issueCode?: string
  reason?: string
}

const capabilities = ref<PlatformCapabilityView[]>([])
const loading = ref(false)

/** Two groups of three: the scan always returns at least a couple of scopes. */
const SKELETON_GROUPS = 2
const SKELETON_ITEMS_PER_GROUP = 3

/**
 * Only the first scan gets a skeleton. `loading` also covers the Refresh button,
 * and swapping a rendered capability list back out for placeholders on a manual
 * refresh loses the reader's place.
 */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)
const lastUpdated = ref<Date | null>(null)

const scopeOrder: PlatformCapabilityScope[] = ['system', 'plugin', 'ai']
const statusOrder: PlatformCapabilityStatus[] = ['stable', 'beta', 'alpha']

/**
 * The placeholder borrows the first scopes' real labels rather than drawing grey bars for them:
 * a group label lives outside its card, where a skeleton would have to guess a width, and every
 * scan so far has returned these scopes.
 */
const skeletonScopes = computed(() => scopeOrder.slice(0, SKELETON_GROUPS))

const scopeIconMap: Record<PlatformCapabilityScope, string> = {
  system: 'i-carbon-settings',
  plugin: 'i-carbon-plug',
  ai: 'i-carbon-ai'
}

const statusToneMap: Record<PlatformCapabilityStatus, 'success' | 'info' | 'warning'> = {
  stable: 'success',
  beta: 'info',
  alpha: 'warning'
}

const supportToneMap: Record<PlatformCapabilitySupportLevel, 'success' | 'warning' | 'danger'> = {
  supported: 'success',
  best_effort: 'warning',
  unsupported: 'danger'
}

const groupedCapabilities = computed(() =>
  scopeOrder
    .map((scope) => {
      const items = capabilities.value
        .filter((item) => item.scope === scope)
        .sort((a, b) => {
          const statusDiff = statusRank(a.status) - statusRank(b.status)
          if (statusDiff !== 0) return statusDiff
          return a.name.localeCompare(b.name)
        })
      return {
        scope,
        label: scopeLabel(scope),
        items
      }
    })
    .filter((group) => group.items.length > 0)
)

const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) return ''
  return lastUpdated.value.toLocaleString()
})

const statusSummary = computed(() =>
  statusOrder
    .map((status) => ({
      status,
      label: statusLabel(status),
      count: capabilities.value.filter((item) => item.status === status).length
    }))
    .filter((summary) => summary.count > 0)
)

function scopeLabel(scope: PlatformCapabilityScope): string {
  return t(`settings.settingPlatformCapabilities.scope.${scope}`)
}

function statusLabel(status: PlatformCapabilityStatus): string {
  return t(`settings.settingPlatformCapabilities.status.${status}`)
}

function statusTone(status: PlatformCapabilityStatus) {
  return statusToneMap[status] ?? 'info'
}

function statusRank(status: PlatformCapabilityStatus): number {
  const index = statusOrder.indexOf(status)
  return index === -1 ? statusOrder.length : index
}

function supportLabel(level: PlatformCapabilitySupportLevel | undefined): string {
  return t(`settings.settingPlatformCapabilities.support.${level || 'supported'}`)
}

function supportTone(level: PlatformCapabilitySupportLevel | undefined) {
  return supportToneMap[level || 'supported']
}

async function loadCapabilities() {
  loading.value = true
  try {
    const result = await platformSdk.listCapabilities()
    capabilities.value = Array.isArray(result) ? (result as PlatformCapabilityView[]) : []
    lastUpdated.value = new Date()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('timed out')) {
      devLog('[SettingPlatformCapabilities] Load timed out, module may be initializing')
      return
    }
    settingPlatformCapabilitiesLog.error('Failed to load capabilities', error)
    toast.error(t('settings.settingPlatformCapabilities.messages.loadFailed'))
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

onMounted(() => {
  loadCapabilities()
})
</script>

<template>
  <!--
    One card per scope rather than one card holding scope sub-headings: with the v2 label sitting
    outside its card, a heading drawn inside one reads as a second, competing group.
  -->
  <div class="PlatformCapabilities">
    <TuffGroupBlock
      :name="t('settings.settingPlatformCapabilities.groupTitle')"
      :description="t('settings.settingPlatformCapabilities.groupDesc')"
    >
      <template #header-extra>
        <TxButton variant="flat" :disabled="loading" @click="loadCapabilities">
          <div class="i-carbon-renew" />
          {{
            loading
              ? t('settings.settingPlatformCapabilities.loading')
              : t('settings.settingPlatformCapabilities.refresh')
          }}
        </TxButton>
      </template>

      <div class="PlatformCapabilities-Overview">
        <div class="PlatformCapabilities-Meta">
          <span>{{
            t('settings.settingPlatformCapabilities.total', { count: capabilities.length })
          }}</span>
          <span v-if="lastUpdatedText">
            {{ t('settings.settingPlatformCapabilities.lastUpdated', { time: lastUpdatedText }) }}
          </span>
        </div>
        <div v-if="statusSummary.length" class="PlatformCapabilities-Stats">
          <TuffStatusBadge
            v-for="summary in statusSummary"
            :key="summary.status"
            size="sm"
            :text="`${summary.label} ${summary.count}`"
            :status="statusTone(summary.status)"
          />
        </div>
      </div>
    </TuffGroupBlock>

    <!--
      Built from the loaded list's own classes so the placeholder inherits the card and item
      geometry; a line of centred text stood in for a stack of cards before, so the panel jumped
      every time the scan returned.
    -->
    <template v-if="showSkeleton">
      <TuffGroupBlock v-for="scope in skeletonScopes" :key="scope" :name="scopeLabel(scope)">
        <template #header-extra>
          <TxSkeleton :width="20" :height="12" :radius="4" />
        </template>
        <article
          v-for="i in SKELETON_ITEMS_PER_GROUP"
          :key="i"
          class="PlatformCapabilities-Item"
          aria-hidden="true"
        >
          <div class="PlatformCapabilities-ItemMain">
            <span class="PlatformCapabilities-Icon">
              <TxSkeleton variant="rect" :width="18" :height="18" :radius="5" />
            </span>
            <div class="PlatformCapabilities-Text">
              <div class="PlatformCapabilities-TitleRow">
                <TxSkeleton :width="148" :height="14" :radius="4" />
                <div class="PlatformCapabilities-Badges">
                  <TxSkeleton variant="rect" :width="54" :height="18" :radius="9" />
                  <TxSkeleton variant="rect" :width="46" :height="18" :radius="9" />
                </div>
              </div>
              <TxSkeleton width="82%" :height="11" :radius="4" />
            </div>
          </div>
          <div class="PlatformCapabilities-Detail">
            <div class="PlatformCapabilities-MetaRow">
              <TxSkeleton variant="rect" :width="112" :height="16" :radius="6" />
            </div>
          </div>
        </article>
      </TuffGroupBlock>
    </template>

    <TuffGroupBlock v-else-if="loading || groupedCapabilities.length === 0">
      <div class="PlatformCapabilities-State">
        {{
          loading
            ? t('settings.settingPlatformCapabilities.loading')
            : t('settings.settingPlatformCapabilities.empty')
        }}
      </div>
    </TuffGroupBlock>

    <template v-else>
      <TuffGroupBlock v-for="group in groupedCapabilities" :key="group.scope" :name="group.label">
        <template #header-extra>
          <span class="PlatformCapabilities-GroupCount">{{ group.items.length }}</span>
        </template>

        <article v-for="item in group.items" :key="item.id" class="PlatformCapabilities-Item">
          <div class="PlatformCapabilities-ItemMain">
            <span class="PlatformCapabilities-Icon">
              <TuffIcon
                :icon="{ type: 'class', value: scopeIconMap[item.scope] }"
                :size="18"
                :alt="scopeLabel(item.scope)"
              />
            </span>

            <div class="PlatformCapabilities-Text">
              <div class="PlatformCapabilities-TitleRow">
                <h4>{{ item.name }}</h4>
                <div class="PlatformCapabilities-Badges">
                  <TuffStatusBadge
                    size="sm"
                    :text="statusLabel(item.status)"
                    :status="statusTone(item.status)"
                  />
                  <TuffStatusBadge
                    size="sm"
                    :text="supportLabel(item.supportLevel)"
                    :status="supportTone(item.supportLevel)"
                  />
                  <TuffStatusBadge
                    v-if="item.sensitive"
                    size="sm"
                    :text="t('settings.settingPlatformCapabilities.tags.sensitive')"
                    status="warning"
                  />
                </div>
              </div>
              <p>{{ item.description }}</p>
            </div>
          </div>

          <div class="PlatformCapabilities-Detail">
            <div class="PlatformCapabilities-MetaRow">
              <span class="PlatformCapabilities-IdBadge">{{ item.id }}</span>
              <span v-if="item.issueCode" class="PlatformCapabilities-IdBadge">
                {{ item.issueCode }}
              </span>
            </div>
            <div v-if="item.reason" class="PlatformCapabilities-Limitations" :title="item.reason">
              <span class="PlatformCapabilities-LimitationsLabel">
                {{ t('settings.settingPlatformCapabilities.reason') }}
              </span>
              <span class="PlatformCapabilities-LimitationsText">
                {{ item.reason }}
              </span>
            </div>
            <div
              v-if="item.limitations?.length"
              class="PlatformCapabilities-Limitations"
              :title="item.limitations.join('\n')"
            >
              <span class="PlatformCapabilities-LimitationsLabel">
                {{ t('settings.settingPlatformCapabilities.limitations') }}
              </span>
              <span class="PlatformCapabilities-LimitationsText">
                {{ item.limitations.join(' · ') }}
              </span>
            </div>
          </div>
        </article>
      </TuffGroupBlock>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.PlatformCapabilities {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.PlatformCapabilities-Overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
}

.PlatformCapabilities-Meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: var(--shell-fs-sm);
  color: var(--shell-text-secondary);
}

.PlatformCapabilities-Stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.PlatformCapabilities-State {
  padding: 12px 16px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.PlatformCapabilities-GroupCount {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.PlatformCapabilities-Item {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(260px, 42%);
  gap: 20px;
  align-items: flex-start;
  min-height: 72px;
  padding: 12px 16px;
  /* `background-color`, not the shorthand: it would drop the card-drawn row hairline. */
  transition: background-color 0.18s ease;

  &:hover {
    background-color: var(--shell-surface);
  }
}

.PlatformCapabilities-ItemMain {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}

.PlatformCapabilities-Icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  margin-top: 1px;
  border-radius: 10px;
  color: var(--shell-text-primary);
  background-color: var(--shell-surface-2);
}

.PlatformCapabilities-Text {
  min-width: 0;

  p {
    margin: 5px 0 0;
    font-size: var(--shell-fs-sm);
    line-height: 1.45;
    color: var(--shell-text-secondary);
  }
}

.PlatformCapabilities-TitleRow {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;

  h4 {
    margin: 0;
    min-width: 0;
    font-size: var(--shell-fs-md);
    line-height: 1.35;
    font-weight: 600;
    color: var(--shell-text-primary);
  }
}

.PlatformCapabilities-Badges {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.PlatformCapabilities-Detail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
}

.PlatformCapabilities-IdBadge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--shell-border);
  background-color: var(--shell-surface-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: var(--shell-fs-caption);
  color: var(--shell-text-secondary);
  max-width: min(100%, 320px);
  line-height: 1.35;
  word-break: break-all;
}

.PlatformCapabilities-MetaRow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.PlatformCapabilities-Limitations {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  font-size: var(--shell-fs-caption);
  color: var(--shell-text-secondary);
}

.PlatformCapabilities-LimitationsLabel {
  font-weight: 600;
}

.PlatformCapabilities-LimitationsText {
  line-height: 1.5;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

@media (max-width: 960px) {
  .PlatformCapabilities-Item {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .PlatformCapabilities-Detail {
    align-items: flex-start;
    padding-left: 48px;
  }

  .PlatformCapabilities-MetaRow {
    justify-content: flex-start;
  }

  .PlatformCapabilities-LimitationsText {
    text-align: left;
  }
}

@media (max-width: 640px) {
  .PlatformCapabilities-Overview,
  .PlatformCapabilities-Item,
  .PlatformCapabilities-State {
    padding-left: 14px;
    padding-right: 14px;
  }

  .PlatformCapabilities-Detail {
    padding-left: 0;
  }

  .PlatformCapabilities-IdBadge {
    max-width: 100%;
  }
}
</style>
