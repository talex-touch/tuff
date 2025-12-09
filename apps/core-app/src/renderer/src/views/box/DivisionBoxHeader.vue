<script setup lang="ts" name="DivisionBoxHeader">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { windowState } from '~/modules/hooks/core-box'
import BoxInput from './BoxInput.vue'

interface Props {
  searchVal: string
  boxOptions: any
  showInput?: boolean
  placeholder?: string
}

interface Emits {
  (e: 'update:searchVal', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
  showInput: true
})
const emit = defineEmits<Emits>()
const { t } = useI18n()

const boxInputRef = ref()
defineExpose({ boxInputRef })

const inputValue = computed({
  get: () => props.searchVal,
  set: (v) => emit('update:searchVal', v)
})

const divisionBoxConfig = computed(() => windowState.divisionBox?.config)
const divisionBoxMeta = computed(() => windowState.divisionBox?.meta)

// Window control state
const pinned = ref(false)
const opacity = ref(1.0)

const opacityIcon = computed(() => {
  if (opacity.value >= 0.9) return 'i-lucide-circle'
  if (opacity.value >= 0.5) return 'i-lucide-circle-dot'
  return 'i-lucide-circle-dashed'
})

async function handlePin(): Promise<void> {
  if (!windowState.divisionBox?.sessionId) return
  try {
    const response = await touchChannel.send('division-box:toggle-pin', {
      sessionId: windowState.divisionBox.sessionId
    })
    if (response?.success) {
      pinned.value = response.data.isPinned
    }
  } catch (error) {
    console.error('[DivisionBoxHeader] Failed to toggle pin:', error)
  }
}

async function handleOpacity(): Promise<void> {
  if (!windowState.divisionBox?.sessionId) return
  const nextOpacity = opacity.value >= 0.9 ? 0.8 : opacity.value >= 0.6 ? 0.5 : 1.0
  try {
    const response = await touchChannel.send('division-box:set-opacity', {
      sessionId: windowState.divisionBox.sessionId,
      opacity: nextOpacity
    })
    if (response?.success) {
      opacity.value = response.data.opacity
    }
  } catch (error) {
    console.error('[DivisionBoxHeader] Failed to set opacity:', error)
  }
}

async function handleDebug(): Promise<void> {
  if (!windowState.divisionBox?.sessionId) return
  try {
    await touchChannel.send('division-box:toggle-devtools', {
      sessionId: windowState.divisionBox.sessionId
    })
  } catch (error) {
    console.error('[DivisionBoxHeader] Failed to toggle devtools:', error)
  }
}

function handleSettings(): void {
  toast.info(t('divisionBox.settingsComingSoon', '设置面板即将推出'))
}
</script>

<template>
  <div class="DivisionBoxHeader" style="flex: 1; display: contents;">
    <!-- Input or Title -->
    <BoxInput
      v-if="showInput"
      ref="boxInputRef"
      v-model="inputValue"
      :box-options="boxOptions"
      :placeholder="placeholder"
    />
    <div v-else class="DivisionBox-Title">
      <TuffIcon
        v-if="divisionBoxMeta?.icon"
        :icon="{ type: 'class', value: divisionBoxMeta.icon }"
      />
      <span>{{ divisionBoxMeta?.title || divisionBoxConfig?.title }}</span>
    </div>

    <!-- Window Controls -->
    <div class="DivisionBox-Controls">
      <TuffIcon
        :icon="{ type: 'class', value: 'i-lucide-settings' }"
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
        :icon="{ type: 'class', value: 'i-lucide-bug' }"
        alt="调试"
        class="control-btn"
        @click="handleDebug"
      />
      <TuffIcon
        :icon="{ type: 'class', value: pinned ? 'i-lucide-pin-off' : 'i-lucide-pin' }"
        alt="置顶"
        class="control-btn"
        :class="{ active: pinned }"
        @click="handlePin"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.DivisionBox-Title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  padding: 0 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--el-text-color-primary);

  .TuffIcon {
    font-size: 1.25rem;
    opacity: 0.8;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.DivisionBox-Controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;

  .control-btn {
    padding: 0.35rem;
    font-size: 1rem;
    color: var(--el-text-color-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      color: var(--el-text-color-primary);
      background-color: var(--el-fill-color-light);
    }

    &.active {
      color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-9);
    }
  }
}
</style>
