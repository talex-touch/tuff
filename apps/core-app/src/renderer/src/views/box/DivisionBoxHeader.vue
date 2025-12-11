<script setup lang="ts" name="DivisionBoxHeader">
import type { IUseSearch } from '~/modules/box/adapter/types'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { windowState } from '~/modules/hooks/core-box'
import BoxInput from './BoxInput.vue'
import ActivatedProviders from './ActivatedProviders.vue'

const isMac = process.platform === 'darwin'

interface Props {
  searchVal: string
  boxOptions: any
  showInput?: boolean
  placeholder?: string
  providers?: IUseSearch['activeActivations']['value']
}

interface Emits {
  (e: 'update:searchVal', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
  showInput: true,
  providers: () => []
})
const emit = defineEmits<Emits & {
  (e: 'deactivate-provider', id: string): void
}>()
const { t } = useI18n()

const boxInputRef = ref()
defineExpose({ boxInputRef })

const inputValue = computed({
  get: () => props.searchVal,
  set: (v) => emit('update:searchVal', v)
})

// Window control state
const pinned = ref(false)
const opacity = ref(1.0)

const opacityIcon = computed(() => {
  if (opacity.value >= 0.9) return 'i-carbon-circle-filled'
  if (opacity.value >= 0.5) return 'i-carbon-circle-outline'
  return 'i-carbon-circle-dash'
})

async function handlePin(): Promise<void> {
  const sessionId = windowState.divisionBox?.sessionId
  if (!sessionId) return
  const response = await touchChannel.send('division-box:toggle-pin', { sessionId })
  if (response?.success) pinned.value = response.data.isPinned
}

async function handleOpacity(): Promise<void> {
  const sessionId = windowState.divisionBox?.sessionId
  if (!sessionId) return
  const nextOpacity = opacity.value >= 0.9 ? 0.8 : opacity.value >= 0.6 ? 0.5 : 1.0
  const response = await touchChannel.send('division-box:set-opacity', { sessionId, opacity: nextOpacity })
  if (response?.success) opacity.value = response.data.opacity
}

async function handleDebug(): Promise<void> {
  const sessionId = windowState.divisionBox?.sessionId
  if (!sessionId) return
  await touchChannel.send('division-box:toggle-devtools', { sessionId })
}

function handleSettings(): void {
  toast.info(t('divisionBox.settingsComingSoon', '设置面板即将推出'))
}
</script>

<template>
  <div class="DivisionBoxHeader" :class="{ 'is-mac': isMac }">
    <!-- macOS: Left traffic light padding -->
    <div v-if="isMac" class="DivisionBox-TrafficLight" />

    <!-- Activated Providers -->
    <ActivatedProviders
      v-if="providers && providers.length > 0"
      :providers="providers"
      @deactivate-provider="emit('deactivate-provider', $event)"
    />

    <!-- Input (optional based on config) -->
    <BoxInput
      v-if="showInput"
      ref="boxInputRef"
      v-model="inputValue"
      :box-options="boxOptions"
      :placeholder="placeholder"
      class="DivisionBox-Input"
    />

    <!-- Spacer to push controls to right -->
    <div class="DivisionBox-Spacer" />

    <!-- Window Controls -->
    <div class="DivisionBox-Controls">
      <TuffIcon
        :icon="{ type: 'class', value: 'i-carbon-settings' }"
        alt="设置"
        class="control-btn"
        @click="handleSettings"
      />
      <TuffIcon
        :icon="{ type: 'class', value: opacityIcon }"
        alt="透明度"
        class="control-btn"
        @click="handleOpacity"
      />
      <TuffIcon
        :icon="{ type: 'class', value: 'i-carbon-debug' }"
        alt="调试"
        class="control-btn"
        @click="handleDebug"
      />
      <TuffIcon
        :icon="{ type: 'class', value: pinned ? 'i-ri-pushpin-2-line' : 'i-ri-pushpin-2-fill' }"
        alt="置顶"
        class="control-btn"
        :class="{ active: pinned }"
        @click="handlePin"
      />
    </div>

    <!-- Windows: Right window controls padding -->
    <div v-if="!isMac" class="DivisionBox-WindowControls" />
  </div>
</template>

<style lang="scss" scoped>
.DivisionBoxHeader {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 4px 8px;
  box-sizing: border-box;
  -webkit-app-region: drag;
}

.DivisionBox-TrafficLight {
  width: 62px; // macOS traffic lights ~= 70px, minus some padding
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.DivisionBox-WindowControls {
  width: 132px; // Windows controls ~= 138px, minus some padding
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.DivisionBox-Input {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  -webkit-app-region: no-drag;
}

:deep(.ActivatedProvidersContainer) {
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.DivisionBox-Spacer {
  flex: 1;
  min-width: 0;
}

.DivisionBox-Controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
  flex-shrink: 0;
  -webkit-app-region: no-drag;

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem;
    font-size: 1.1rem;
    color: var(--el-text-color-regular);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0.7;

    &:hover {
      opacity: 1;
      color: var(--el-text-color-primary);
      background-color: var(--el-fill-color-light);
    }

    &.active {
      opacity: 1;
      color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-9);
    }
  }
}
</style>
