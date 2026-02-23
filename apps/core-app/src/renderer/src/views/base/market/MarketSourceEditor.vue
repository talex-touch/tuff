<script setup lang="ts">
import type { MarketProviderType } from '@talex-touch/utils/market'
import {
  TuffSwitch,
  TxButton,
  TxFlipOverlay,
  TxInput,
  TxSelect,
  TxSelectItem
} from '@talex-touch/tuffex'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vDraggable } from 'vue-draggable-plus'
import TouchScroll from '~/components/base/TouchScroll.vue'
import { appSetting } from '~/modules/channel/storage'
import { marketSourcesStorage } from '~/modules/storage/market-sources'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    source?: HTMLElement | null
  }>(),
  {
    source: null
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const FLIP_DURATION = 420
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.08
const ADD_DIALOG_FLIP_DURATION = 340
const ADD_DIALOG_FLIP_ROTATE_X = 4
const ADD_DIALOG_FLIP_ROTATE_Y = 5
const ADD_DIALOG_FLIP_SPEED_BOOST = 1.05
const DEFAULT_PROVIDER_TYPE: MarketProviderType = 'tpexApi'

const { t } = useI18n()

const storageState = marketSourcesStorage.get()
const sources = storageState.sources
const showCreateDialog = ref(false)
const createDialogSource = ref<HTMLElement | null>(null)
const isAdvancedMode = computed(() => {
  const advancedSettings = appSetting?.dev?.advancedSettings
  if (typeof advancedSettings === 'string') {
    return advancedSettings === 'true' || advancedSettings === '1'
  }
  return advancedSettings === true || advancedSettings === 1
})
const sortableSources = computed(() => sources.filter((item) => !item.outdated))
const outdatedSources = computed(() => sources.filter((item) => item.outdated))
const visibleOutdatedSources = computed(() => (isAdvancedMode.value ? outdatedSources.value : []))
const hiddenOutdatedCount = computed(() =>
  isAdvancedMode.value ? 0 : outdatedSources.value.length
)

const draggableOptions = computed(() => ({
  animation: 0,
  handle: '.handle',
  ghostClass: 'ghost'
}))

const providerTypeOptions = computed<{ label: string; value: MarketProviderType }[]>(() => [
  { label: t('market.sourceEditor.providerTypes.tpexApi'), value: 'tpexApi' },
  { label: t('market.sourceEditor.providerTypes.nexusStore'), value: 'nexusStore' },
  { label: t('market.sourceEditor.providerTypes.repository'), value: 'repository' },
  { label: t('market.sourceEditor.providerTypes.npmPackage'), value: 'npmPackage' }
])

const newSource = reactive({
  name: '',
  url: '',
  type: DEFAULT_PROVIDER_TYPE
})

function generateSourceId(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
}

function normalizeOutdatedSourcesToBottom() {
  const nonOutdated = sources.filter((item) => !item.outdated)
  const outdated = sources.filter((item) => item.outdated)
  const nextOrder = [...nonOutdated, ...outdated]
  const orderChanged = nextOrder.some((item, index) => item?.id !== sources[index]?.id)
  if (!orderChanged) return
  sources.splice(0, sources.length, ...nextOrder)
}

function getSourceIndexById(id: string): number {
  return sources.findIndex((item) => item.id === id)
}

function deleteSource(id: string) {
  const list = sources
  if (list.length === 1) return

  const targetIndex = getSourceIndexById(id)
  if (targetIndex < 0) return

  const target = list[targetIndex]
  if (!target || target.readOnly) return

  list.splice(targetIndex, 1)
}

function toggleSource(id: string) {
  const targetIndex = getSourceIndexById(id)
  if (targetIndex < 0) return

  const target = sources[targetIndex]
  if (!target) return

  target.enabled = !target.enabled
}

function resetNewSource() {
  newSource.name = ''
  newSource.url = ''
  newSource.type = DEFAULT_PROVIDER_TYPE
}

function openCreateDialog(event?: MouseEvent) {
  createDialogSource.value =
    event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  showCreateDialog.value = true
}

function closeCreateDialog(reset = true) {
  showCreateDialog.value = false
  if (reset) {
    resetNewSource()
  }
}

function handleAdd() {
  if (!newSource.name.trim() || !newSource.url.trim()) return false

  const list = sources
  const id = generateSourceId(newSource.name)

  const url = newSource.url.trim()
  const config: Record<string, string> = {}

  if (newSource.type === 'nexusStore') {
    config.manifestUrl = url.includes('/api/market/plugins')
      ? url
      : `${url.replace(/\/$/, '')}/api/market/plugins`
  } else if (newSource.type === 'tpexApi') {
    config.apiUrl = url.endsWith('/api/market/plugins')
      ? url
      : `${url.replace(/\/$/, '')}/api/market/plugins`
  }

  list.push({
    id,
    name: newSource.name.trim(),
    type: newSource.type,
    url,
    enabled: true,
    priority: list.length ? Math.max(...list.map((item) => item.priority ?? 0)) + 1 : 1,
    trustLevel: 'unverified',
    config
  })

  closeCreateDialog(true)
  return true
}

normalizeOutdatedSourcesToBottom()

watch(visible, (nextVisible) => {
  if (nextVisible) return
  showCreateDialog.value = false
  resetNewSource()
})

watch(showCreateDialog, (nextVisible) => {
  if (nextVisible) return
  resetNewSource()
})

watch(
  () => sources.map((item) => `${item.id}:${item.outdated ? 1 : 0}`).join('|'),
  () => {
    normalizeOutdatedSourcesToBottom()
  }
)
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="source"
      :duration="FLIP_DURATION"
      :rotate-x="FLIP_ROTATE_X"
      :rotate-y="FLIP_ROTATE_Y"
      :speed-boost="FLIP_SPEED_BOOST"
      transition-name="MarketSourceEditor-Mask"
      mask-class="MarketSourceEditor-Mask"
      card-class="MarketSourceEditor-Card"
    >
      <template #default="{ close }">
        <div class="MarketSourceEditor">
          <div class="MarketSourceEditor-Header">
            <div class="MarketSourceEditor-Heading">
              <h2 class="MarketSourceEditor-Title">{{ t('market.sourceEditor.title') }}</h2>
              <p class="MarketSourceEditor-Subtitle">{{ t('market.sourceEditor.subtitle') }}</p>
            </div>
            <div class="MarketSourceEditor-HeaderActions">
              <TxButton variant="flat" size="sm" @click="openCreateDialog($event)">
                <div class="i-carbon-add" />
                <span>{{ t('market.sourceEditor.addSource') }}</span>
              </TxButton>
              <TxButton variant="flat" size="sm" @click="close">
                <div class="i-carbon-close" />
              </TxButton>
            </div>
          </div>

          <div class="MarketSourceEditor-Container">
            <TouchScroll native no-padding class="MarketSourceEditor-Scroller">
              <TransitionGroup
                v-draggable="[sources, draggableOptions]"
                name="source-flip"
                tag="div"
                class="MarketSourceEditor-Content"
              >
                <div
                  v-for="item in sortableSources"
                  :key="item.id"
                  :class="{ 'is-disabled': item.enabled === false }"
                  class="MarketSourceEditor-Content-Item Item"
                >
                  <div class="handle" />
                  <div class="GhostTitle">{{ item.name }}</div>

                  <div class="Item-Container">
                    <div class="Item-Title">
                      {{ item.name }}<span class="adapter">({{ item.type }})</span>
                      <span v-if="item.readOnly" class="readonly-badge">
                        {{ t('market.sourceEditor.readonlyBadge') }}
                      </span>
                    </div>
                    <div class="Item-Desc">
                      {{ item.url }}
                    </div>
                  </div>
                  <div class="Item-Actions">
                    <TuffSwitch
                      :model-value="item.enabled !== false"
                      size="small"
                      @change="toggleSource(item.id)"
                    />
                    <div
                      :class="{ disabled: sources.length === 1 || item.readOnly }"
                      class="transition-cubic action-btn"
                      @click="deleteSource(item.id)"
                    >
                      <div v-if="sources.length !== 1 && !item.readOnly" class="i-carbon-close" />
                      <div v-else class="i-carbon-carbon-for-salesforce" />
                    </div>
                  </div>
                </div>
              </TransitionGroup>

              <div v-if="hiddenOutdatedCount > 0" class="MarketSourceEditor-Hint">
                {{
                  t('market.sourceEditor.outdatedHiddenHint', {
                    count: hiddenOutdatedCount
                  })
                }}
              </div>

              <div
                v-if="visibleOutdatedSources.length > 0"
                class="MarketSourceEditor-OutdatedSection"
              >
                <div class="MarketSourceEditor-SectionTitle">
                  {{ t('market.sourceEditor.outdatedSection') }}
                </div>
                <div
                  v-for="item in visibleOutdatedSources"
                  :key="item.id"
                  :class="{ 'is-disabled': item.enabled === false }"
                  class="MarketSourceEditor-Content-Item Item is-outdated-item"
                >
                  <div class="handle disabled" />
                  <div class="Item-Container">
                    <div class="Item-Title">
                      {{ item.name }}<span class="adapter">({{ item.type }})</span>
                      <span v-if="item.readOnly" class="readonly-badge">
                        {{ t('market.sourceEditor.readonlyBadge') }}
                      </span>
                      <span class="outdated-badge">{{
                        t('market.sourceEditor.outdatedBadge')
                      }}</span>
                    </div>
                    <div class="Item-Desc">
                      {{ item.url }}
                    </div>
                  </div>
                  <div class="Item-Actions">
                    <TuffSwitch
                      :model-value="item.enabled !== false"
                      size="small"
                      @change="toggleSource(item.id)"
                    />
                    <div
                      :class="{ disabled: sources.length === 1 || item.readOnly }"
                      class="transition-cubic action-btn"
                      @click="deleteSource(item.id)"
                    >
                      <div v-if="sources.length !== 1 && !item.readOnly" class="i-carbon-close" />
                      <div v-else class="i-carbon-carbon-for-salesforce" />
                    </div>
                  </div>
                </div>
              </div>
            </TouchScroll>
          </div>
        </div>
      </template>
    </TxFlipOverlay>

    <TxFlipOverlay
      v-model="showCreateDialog"
      :source="createDialogSource"
      :duration="ADD_DIALOG_FLIP_DURATION"
      :rotate-x="ADD_DIALOG_FLIP_ROTATE_X"
      :rotate-y="ADD_DIALOG_FLIP_ROTATE_Y"
      :speed-boost="ADD_DIALOG_FLIP_SPEED_BOOST"
      transition-name="MarketSourceEditor-AddMask"
      mask-class="MarketSourceEditor-AddMask"
      card-class="MarketSourceEditor-AddCard"
    >
      <template #default>
        <div class="MarketSourceEditor-AddDialog">
          <div class="MarketSourceEditor-AddDialogHeader">
            <div class="MarketSourceEditor-AddDialogTitle">
              {{ t('market.sourceEditor.addDialogTitle') }}
            </div>
            <TxButton variant="flat" size="sm" @click="closeCreateDialog(true)">
              <div class="i-carbon-close" />
            </TxButton>
          </div>

          <div class="CreateRow">
            <TxInput
              v-model="newSource.name"
              class="CreateNameInput"
              clearable
              :placeholder="t('market.sourceEditor.namePlaceholder')"
            />
            <TxSelect v-model="newSource.type" class="CreateTypeSelect" eager>
              <TxSelectItem
                v-for="option in providerTypeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </TxSelectItem>
            </TxSelect>
          </div>

          <div class="CreateRow mt-2">
            <TxInput
              v-model="newSource.url"
              class="CreateUrlInput"
              clearable
              :placeholder="t('market.sourceEditor.urlPlaceholder')"
            />
          </div>

          <div class="CreateActions">
            <TxButton variant="flat" size="sm" @click="closeCreateDialog(true)">
              {{ t('market.sourceEditor.cancel') }}
            </TxButton>
            <TxButton variant="flat" size="sm" type="primary" @click="handleAdd()">
              {{ t('market.sourceEditor.add') }}
            </TxButton>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped lang="scss">
:global(.MarketSourceEditor-Mask) {
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

:global(.MarketSourceEditor-AddMask) {
  background: rgba(12, 12, 14, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

:global(.MarketSourceEditor-Card) {
  width: min(680px, 88vw);
  height: min(640px, 80vh);
  min-height: 400px;
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.26);
  overflow: hidden;
}

:global(.MarketSourceEditor-AddCard) {
  width: min(640px, 90vw);
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}

.MarketSourceEditor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.MarketSourceEditor-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.MarketSourceEditor-Heading {
  min-width: 0;
}

.MarketSourceEditor-HeaderActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.MarketSourceEditor-Title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
}

.MarketSourceEditor-Subtitle {
  margin: 8px 0 0;
  opacity: 0.72;
  font-size: 1.1rem;
  line-height: 1.2;
}

.MarketSourceEditor-Container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 12px 14px 16px;
  gap: 10px;
}

.MarketSourceEditor-AddDialog {
  padding: 18px;
}

.MarketSourceEditor-AddDialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.MarketSourceEditor-AddDialogTitle {
  font-size: 15px;
  font-weight: 600;
}

.CreateRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.CreateNameInput,
.CreateUrlInput {
  flex: 1;
  min-width: 0;
}

.CreateTypeSelect {
  width: 220px;
  flex: 0 0 220px;
}

.CreateActions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.MarketSourceEditor-Scroller {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.MarketSourceEditor-Scroller :deep(.tx-scroll__content) {
  padding: 0;
}

.MarketSourceEditor-Content {
  padding: 0.25rem;
}

.MarketSourceEditor-OutdatedSection {
  padding: 0.25rem;
}

.MarketSourceEditor-Hint {
  margin: 4px 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.MarketSourceEditor-SectionTitle {
  margin: 2px 8px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
  text-transform: uppercase;
}

.source-flip-enter-active,
.source-flip-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.source-flip-enter-from,
.source-flip-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.source-flip-move {
  transition: transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.MarketSourceEditor-Content-Item {
  position: relative;
  margin: 0.5rem;
  padding: 0.6rem;
  min-height: 74px;
  border-radius: 12px;
  border: 2px dashed transparent;
  background-color: var(--tx-fill-color);

  .GhostTitle {
    position: absolute;
    top: 50%;
    left: 50%;
    opacity: 0;
    font-size: 18px;
    line-height: 45px;
    transition: 0.125s;
    --s: 0;
    transform: translate(-50%, -50%) scale(var(--s));
  }

  &.ghost {
    .Item-Title,
    .Item-Desc,
    .Item-Actions {
      opacity: 0 !important;
      transition: none !important;
    }

    .GhostTitle {
      opacity: 1;
      --s: 1;
    }

    border: 2px dashed currentColor;
    background-color: var(--tx-fill-color-dark);
  }

  &.is-disabled {
    opacity: 0.52;

    .Item-Container {
      text-decoration: line-through;
    }
  }

  .handle {
    position: absolute;
    top: 0;
    left: 0;
    width: 28px;
    height: 100%;
    cursor: move;
    background:
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 25%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 25%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 75%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 75%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 50%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 50%;
    background-color: var(--tx-fill-color-dark);
    background-size: 50% 50%;
    background-repeat: no-repeat;
    border-radius: 10px 0 0 10px;

    &.disabled {
      cursor: default;
      opacity: 0.45;
    }
  }

  .Item-Container {
    width: calc(100% - 130px);
    margin-left: 34px;
    text-align: left;

    .Item-Title {
      font-weight: 600;

      .adapter {
        margin-left: 2px;
        opacity: 0.58;
      }

      .readonly-badge {
        margin-left: 6px;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 500;
        border-radius: 4px;
        background-color: var(--tx-color-info-light-7);
        color: var(--tx-color-info);
      }

      .outdated-badge {
        margin-left: 6px;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 500;
        border-radius: 4px;
        background-color: var(--tx-color-warning-light-7);
        color: var(--tx-color-warning);
      }
    }

    .Item-Desc {
      opacity: 0.75;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .Item-Actions {
    position: absolute;
    top: 50%;
    right: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transform: translateY(-50%);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    background-color: var(--tx-color-danger-light-7);
    color: var(--tx-color-danger);

    &:hover {
      background-color: var(--tx-color-danger);
      color: #fff;
    }

    &.disabled {
      cursor: not-allowed;
      background-color: var(--tx-color-success-light-7);
      color: var(--tx-color-success);

      &:hover {
        background-color: var(--tx-color-success-light-7);
        color: var(--tx-color-success);
      }
    }
  }

  &.is-outdated-item {
    opacity: 0.9;
  }
}

.CreateTypeSelect :deep(.tx-input) {
  min-height: 32px;
}
</style>
