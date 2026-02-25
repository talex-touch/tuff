<script setup lang="ts">
import type { StoreProviderType } from '@talex-touch/utils/store'
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
import { storeSourcesStorage } from '~/modules/storage/store-sources'

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
const DEFAULT_PROVIDER_TYPE: StoreProviderType = 'tpexApi'

const { t } = useI18n()

const storageState = storeSourcesStorage.get()
const sources = storageState.sources
const showCreateDialog = ref(false)
const createDialogSource = ref<HTMLElement | null>(null)
const isAdvancedMode = computed(() => {
  const advancedSettings = appSetting?.dev?.advancedSettings
  if (typeof advancedSettings === 'string') {
    return advancedSettings === 'true' || advancedSettings === '1'
  }
  return advancedSettings === true
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

const providerTypeOptions = computed<{ label: string; value: StoreProviderType }[]>(() => [
  { label: t('store.sourceEditor.providerTypes.tpexApi'), value: 'tpexApi' },
  { label: t('store.sourceEditor.providerTypes.nexusStore'), value: 'nexusStore' },
  { label: t('store.sourceEditor.providerTypes.repository'), value: 'repository' },
  { label: t('store.sourceEditor.providerTypes.npmPackage'), value: 'npmPackage' }
])

const newSource = reactive<{
  name: string
  url: string
  type: StoreProviderType
}>({
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
    config.manifestUrl = url.includes('/api/store/plugins')
      ? url
      : `${url.replace(/\/$/, '')}/api/store/plugins`
  } else if (newSource.type === 'tpexApi') {
    config.apiUrl = url.endsWith('/api/store/plugins')
      ? url
      : `${url.replace(/\/$/, '')}/api/store/plugins`
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
      :header-title="t('store.sourceEditor.title')"
      :header-desc="t('store.sourceEditor.subtitle')"
    >
      <template #header-actions>
        <TxButton variant="flat" size="sm" @click="openCreateDialog($event)">
          <div class="i-carbon-add" />
          <span>{{ t('store.sourceEditor.addSource') }}</span>
        </TxButton>
      </template>
      <template #default>
        <div class="StoreSourceEditor">
          <div class="StoreSourceEditor-Container">
            <TouchScroll native no-padding class="StoreSourceEditor-Scroller">
              <TransitionGroup
                v-draggable="[sources, draggableOptions]"
                name="source-flip"
                tag="div"
                class="StoreSourceEditor-Content"
              >
                <div
                  v-for="item in sortableSources"
                  :key="item.id"
                  :class="{ 'is-disabled': item.enabled === false }"
                  class="StoreSourceEditor-Content-Item Item"
                >
                  <div class="handle" />
                  <div class="GhostTitle">{{ item.name }}</div>

                  <div class="Item-Container">
                    <div class="Item-Title">
                      {{ item.name }}<span class="adapter">({{ item.type }})</span>
                      <span v-if="item.readOnly" class="readonly-badge">
                        {{ t('store.sourceEditor.readonlyBadge') }}
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

              <div v-if="hiddenOutdatedCount > 0" class="StoreSourceEditor-Hint">
                {{
                  t('store.sourceEditor.outdatedHiddenHint', {
                    count: hiddenOutdatedCount
                  })
                }}
              </div>

              <div
                v-if="visibleOutdatedSources.length > 0"
                class="StoreSourceEditor-OutdatedSection"
              >
                <div class="StoreSourceEditor-SectionTitle">
                  {{ t('store.sourceEditor.outdatedSection') }}
                </div>
                <div
                  v-for="item in visibleOutdatedSources"
                  :key="item.id"
                  :class="{ 'is-disabled': item.enabled === false }"
                  class="StoreSourceEditor-Content-Item Item is-outdated-item"
                >
                  <div class="handle disabled" />
                  <div class="Item-Container">
                    <div class="Item-Title">
                      {{ item.name }}<span class="adapter">({{ item.type }})</span>
                      <span v-if="item.readOnly" class="readonly-badge">
                        {{ t('store.sourceEditor.readonlyBadge') }}
                      </span>
                      <span class="outdated-badge">{{
                        t('store.sourceEditor.outdatedBadge')
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
      :header-title="t('store.sourceEditor.addDialogTitle')"
    >
      <template #default>
        <div class="StoreSourceEditor-AddDialog">
          <div class="CreateRow">
            <TxInput
              v-model="newSource.name"
              class="CreateNameInput"
              clearable
              :placeholder="t('store.sourceEditor.namePlaceholder')"
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
              :placeholder="t('store.sourceEditor.urlPlaceholder')"
            />
          </div>

          <div class="CreateActions">
            <TxButton variant="flat" size="sm" @click="closeCreateDialog(true)">
              {{ t('store.sourceEditor.cancel') }}
            </TxButton>
            <TxButton variant="flat" size="sm" type="primary" @click="handleAdd()">
              {{ t('store.sourceEditor.add') }}
            </TxButton>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped lang="scss">
.StoreSourceEditor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.StoreSourceEditor-Container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 12px 14px 16px;
  gap: 10px;
}

.StoreSourceEditor-AddDialog {
  padding: 18px;
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

.StoreSourceEditor-Scroller {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.StoreSourceEditor-Scroller :deep(.tx-scroll__content) {
  padding: 0;
}

.StoreSourceEditor-Content {
  padding: 0.25rem;
}

.StoreSourceEditor-OutdatedSection {
  padding: 0.25rem;
}

.StoreSourceEditor-Hint {
  margin: 4px 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StoreSourceEditor-SectionTitle {
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

.StoreSourceEditor-Content-Item {
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
