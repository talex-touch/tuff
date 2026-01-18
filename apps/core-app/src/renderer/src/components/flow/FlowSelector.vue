<script setup lang="ts">
/**
 * Flow Selector Panel
 *
 * Displays available Flow targets for user selection.
 * Used when dispatching a flow without a preferred target.
 */
import type { FlowPayload, FlowTargetInfo } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffIcon from '~/components/base/TuffIcon.vue'

interface Props {
  visible: boolean
  sessionId?: string
  payload?: FlowPayload
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', payload: { targetId: string; consentToken?: string }): void
}>()

const { t } = useI18n()

const transport = useTuffTransport()

const targets = ref<FlowTargetInfo[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement>()
const consentVisible = ref(false)
const consentLoading = ref(false)
const consentTarget = ref<FlowTargetInfo | null>(null)

const filteredTargets = computed(() => {
  if (!searchQuery.value.trim()) {
    return targets.value
  }

  const query = searchQuery.value.toLowerCase()
  return targets.value.filter(
    (target) =>
      target.name.toLowerCase().includes(query) ||
      target.description?.toLowerCase().includes(query) ||
      target.pluginName?.toLowerCase().includes(query)
  )
})

const senderId = computed(() => props.payload?.context?.sourcePluginId || 'corebox')

async function loadTargets(): Promise<void> {
  loading.value = true
  try {
    const response = await transport.send(FlowEvents.getTargets, {
      payloadType: props.payload?.type
    })

    if (response?.success) {
      targets.value = response.data || []
    } else {
      console.error('[FlowSelector] Failed to load targets:', response?.error)
      targets.value = []
    }
  } catch (error) {
    console.error('[FlowSelector] Error loading targets:', error)
    targets.value = []
  } finally {
    loading.value = false
  }
}

async function handleSelect(target: FlowTargetInfo): Promise<void> {
  const response = await transport.send(FlowEvents.checkConsent, {
    senderId: senderId.value,
    targetId: target.fullId
  })
  if (response?.success && response.data?.allowed) {
    emit('select', { targetId: target.fullId })
    return
  }
  consentTarget.value = target
  consentVisible.value = true
}

function handleClose(): void {
  emit('close')
}

async function handleConsent(mode: 'once' | 'always'): Promise<void> {
  if (!consentTarget.value) return
  consentLoading.value = true
  try {
    const response = await transport.send(FlowEvents.grantConsent, {
      senderId: senderId.value,
      targetId: consentTarget.value.fullId,
      mode
    })
    if (response?.success) {
      emit('select', { targetId: consentTarget.value.fullId, consentToken: response.data?.token })
      consentVisible.value = false
      consentTarget.value = null
    }
  } finally {
    consentLoading.value = false
  }
}

function handleConsentDeny(): void {
  consentVisible.value = false
  consentTarget.value = null
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.visible) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (selectedIndex.value < filteredTargets.value.length - 1) {
        selectedIndex.value++
      }
      break

    case 'ArrowUp':
      event.preventDefault()
      if (selectedIndex.value > 0) {
        selectedIndex.value--
      }
      break

    case 'Enter':
      event.preventDefault()
      if (filteredTargets.value[selectedIndex.value]) {
        handleSelect(filteredTargets.value[selectedIndex.value])
      }
      break

    case 'Escape':
      event.preventDefault()
      handleClose()
      break
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadTargets()
      selectedIndex.value = 0
      searchQuery.value = ''
      consentVisible.value = false
      consentTarget.value = null
      requestAnimationFrame(() => {
        inputRef.value?.focus()
      })
    }
  }
)

watch(searchQuery, () => {
  selectedIndex.value = 0
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function getPayloadPreview(): string {
  if (!props.payload) return ''

  const { type, data } = props.payload
  if (type === 'text' && typeof data === 'string') {
    return data.length > 100 ? `${data.slice(0, 100)}...` : data
  }
  if (type === 'json') {
    try {
      const str = JSON.stringify(data)
      return str.length > 100 ? `${str.slice(0, 100)}...` : str
    } catch {
      return '[JSON Data]'
    }
  }
  return `[${type}]`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="flow-selector">
      <div
        v-if="visible"
        class="FlowSelector fixed inset-0 z-[9999] flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="handleClose" />

        <!-- Panel -->
        <div
          class="relative w-[480px] max-h-[70vh] bg-[var(--el-bg-color)] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        >
          <!-- Header -->
          <div class="px-4 py-3 border-b border-[var(--el-border-color)]">
            <h3 class="text-base font-semibold text-[var(--el-text-color-primary)]">
              {{ t('flow.selectTarget', '选择目标') }}
            </h3>
            <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
              {{ t('flow.selectTargetDesc', '选择要将数据发送到的插件') }}
            </p>
          </div>

          <!-- Payload Preview -->
          <div
            v-if="payload"
            class="px-4 py-2 bg-[var(--el-fill-color-light)] border-b border-[var(--el-border-color)]"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-[var(--el-text-color-secondary)] uppercase">
                {{ payload.type }}
              </span>
              <span class="text-xs text-[var(--el-text-color-regular)] truncate flex-1">
                {{ getPayloadPreview() }}
              </span>
            </div>
          </div>

          <!-- Search -->
          <div class="px-4 py-2 border-b border-[var(--el-border-color)]">
            <input
              ref="inputRef"
              v-model="searchQuery"
              type="text"
              :placeholder="t('flow.searchTargets', '搜索目标...')"
              class="w-full px-3 py-2 text-sm bg-[var(--el-fill-color)] rounded-lg border-none outline-none focus:ring-2 focus:ring-[var(--el-color-primary)]"
            />
          </div>

          <!-- Target List -->
          <TouchScroll native no-padding class="flex-1 min-h-0">
            <div class="p-2">
              <div v-if="loading" class="flex items-center justify-center py-8">
                <i
                  class="ri:loader-4-line animate-spin text-2xl text-[var(--el-text-color-secondary)]"
                />
              </div>

              <div v-else-if="filteredTargets.length === 0" class="text-center py-8">
                <i class="ri:inbox-line text-4xl text-[var(--el-text-color-placeholder)]" />
                <p class="mt-2 text-sm text-[var(--el-text-color-secondary)]">
                  {{ t('flow.noTargets', '没有可用的目标') }}
                </p>
              </div>

              <div v-else class="space-y-1">
                <button
                  v-for="(target, index) in filteredTargets"
                  :key="target.fullId"
                  class="FlowTargetItem w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                  :class="{
                    'bg-[var(--el-color-primary-light-9)]': index === selectedIndex,
                    'hover:bg-[var(--el-fill-color-light)]': index !== selectedIndex
                  }"
                  @click="handleSelect(target)"
                  @mouseenter="selectedIndex = index"
                >
                  <!-- Icon -->
                  <div
                    class="w-10 h-10 flex items-center justify-center rounded-lg bg-[var(--el-fill-color)]"
                  >
                    <TuffIcon
                      v-if="target.icon"
                      :icon="{ type: 'class', value: target.icon }"
                      :size="24"
                    />
                    <i v-else class="ri:apps-line text-xl text-[var(--el-text-color-secondary)]" />
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-[var(--el-text-color-primary)] truncate">
                        {{ target.name }}
                      </span>
                      <span
                        v-if="target.pluginName"
                        class="text-xs text-[var(--el-text-color-placeholder)] truncate"
                      >
                        · {{ target.pluginName }}
                      </span>
                    </div>
                    <p
                      v-if="target.description"
                      class="text-xs text-[var(--el-text-color-secondary)] truncate mt-0.5"
                    >
                      {{ target.description }}
                    </p>
                  </div>

                  <!-- Supported Types -->
                  <div class="flex gap-1">
                    <span
                      v-for="type in target.supportedTypes.slice(0, 3)"
                      :key="type"
                      class="px-1.5 py-0.5 text-[10px] rounded bg-[var(--el-fill-color)] text-[var(--el-text-color-secondary)]"
                    >
                      {{ type }}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </TouchScroll>

          <!-- Footer -->
          <div
            class="px-4 py-3 border-t border-[var(--el-border-color)] flex items-center justify-between"
          >
            <div class="text-xs text-[var(--el-text-color-placeholder)]">
              <kbd class="px-1.5 py-0.5 rounded bg-[var(--el-fill-color)]">↑↓</kbd>
              {{ t('flow.navigate', '导航') }}
              <kbd class="ml-2 px-1.5 py-0.5 rounded bg-[var(--el-fill-color)]">Enter</kbd>
              {{ t('flow.confirm', '确认') }}
              <kbd class="ml-2 px-1.5 py-0.5 rounded bg-[var(--el-fill-color)]">Esc</kbd>
              {{ t('flow.cancel', '取消') }}
            </div>
            <button
              class="px-3 py-1.5 text-sm rounded-lg bg-[var(--el-fill-color)] hover:bg-[var(--el-fill-color-dark)] transition-colors"
              @click="handleClose"
            >
              {{ t('common.cancel', '取消') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="flow-selector">
      <div v-if="consentVisible" class="fixed inset-0 z-[10000] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="handleConsentDeny" />
        <div
          class="relative w-[420px] bg-[var(--el-bg-color)] rounded-xl shadow-2xl overflow-hidden p-5"
        >
          <h3 class="text-base font-semibold text-[var(--el-text-color-primary)]">
            {{ t('flow.consentTitle', '流转授权') }}
          </h3>
          <p class="mt-2 text-sm text-[var(--el-text-color-secondary)] leading-relaxed">
            {{
              t(
                'flow.consentDesc',
                `允许 ${senderId} 向 ${consentTarget?.pluginName || consentTarget?.name || '目标插件'} 发送数据？`
              )
            }}
          </p>
          <div class="mt-4 flex items-center justify-end gap-2">
            <button
              class="px-3 py-1.5 text-sm rounded-md border border-[var(--el-border-color)] text-[var(--el-text-color-regular)] hover:bg-[var(--el-fill-color-light)]"
              :disabled="consentLoading"
              @click="handleConsentDeny"
            >
              {{ t('flow.consentDeny', '拒绝') }}
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md border border-[var(--el-border-color)] text-[var(--el-text-color-regular)] hover:bg-[var(--el-fill-color-light)]"
              :disabled="consentLoading"
              @click="handleConsent('once')"
            >
              {{ t('flow.consentOnce', '仅本次') }}
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md bg-[var(--el-color-primary)] text-white hover:opacity-90"
              :disabled="consentLoading"
              @click="handleConsent('always')"
            >
              {{ t('flow.consentAlways', '始终允许') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.flow-selector-enter-active,
.flow-selector-leave-active {
  transition: opacity 0.2s ease;
}

.flow-selector-enter-from,
.flow-selector-leave-to {
  opacity: 0;
}

.flow-selector-enter-active .relative,
.flow-selector-leave-active .relative {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.flow-selector-enter-from .relative,
.flow-selector-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
