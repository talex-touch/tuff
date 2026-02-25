<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { toast } from 'vue-sonner'
import { reactive, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

interface DevSettingsForm {
  enable: boolean
  address: string
  source: boolean
  autoStart: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    plugin: ITouchPlugin
    source?: HTMLElement | null
  }>(),
  {
    source: null
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const plugin = toRef(props, 'plugin')

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const FLIP_DURATION = 420
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.08

const devSettings = reactive<DevSettingsForm>({
  enable: false,
  address: '',
  source: false,
  autoStart: true
})

const originalSettings = ref<DevSettingsForm | null>(null)
const manifestCache = ref<Record<string, unknown> | null>(null)
const manifestLoading = ref(false)
const isSaving = ref(false)

const hasChanges = computed(() => {
  const original = originalSettings.value
  if (!original) return false
  return (
    devSettings.enable !== original.enable ||
    devSettings.address !== original.address ||
    devSettings.source !== original.source ||
    devSettings.autoStart !== original.autoStart
  )
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readFallbackSettings(): DevSettingsForm {
  const rawDev: Record<string, unknown> = isRecord(plugin.value.dev) ? plugin.value.dev : {}
  return {
    enable: Boolean(plugin.value.dev?.enable),
    address: plugin.value.dev?.address ?? '',
    source: Boolean(plugin.value.dev?.source),
    autoStart: typeof rawDev.autoStart === 'boolean' ? rawDev.autoStart : true
  }
}

function readManifestDevSettings(rawDev: unknown): DevSettingsForm {
  const fallback = readFallbackSettings()
  if (!isRecord(rawDev)) return fallback

  return {
    enable: typeof rawDev.enable === 'boolean' ? rawDev.enable : fallback.enable,
    address: typeof rawDev.address === 'string' ? rawDev.address : fallback.address,
    source: typeof rawDev.source === 'boolean' ? rawDev.source : fallback.source,
    autoStart: typeof rawDev.autoStart === 'boolean' ? rawDev.autoStart : fallback.autoStart
  }
}

function applySettings(settings: DevSettingsForm): void {
  devSettings.enable = settings.enable
  devSettings.address = settings.address
  devSettings.source = settings.source
  devSettings.autoStart = settings.autoStart
}

async function loadSettings(): Promise<void> {
  if (manifestLoading.value) return

  const fallback = readFallbackSettings()
  applySettings(fallback)
  originalSettings.value = { ...fallback }

  manifestLoading.value = true
  try {
    const manifest = await pluginSDK.getManifest(plugin.value.name)
    manifestCache.value = manifest
    if (!manifest) return

    const next = readManifestDevSettings(manifest.dev)
    applySettings(next)
    originalSettings.value = { ...next }
  } catch (error) {
    console.error('[PluginDevSettingsOverlay] Failed to load manifest:', error)
    toast.error(t('plugin.details.saveError'))
  } finally {
    manifestLoading.value = false
  }
}

watch(
  () => props.modelValue,
  (nextVisible) => {
    if (nextVisible) {
      void loadSettings()
    }
  }
)

watch(
  () => plugin.value.name,
  () => {
    manifestCache.value = null
    originalSettings.value = null
    if (visible.value) {
      void loadSettings()
    }
  }
)

async function saveDevSettings(): Promise<void> {
  if (isSaving.value || manifestLoading.value || !hasChanges.value) return

  const latestManifest = manifestCache.value ?? (await pluginSDK.getManifest(plugin.value.name))
  if (!latestManifest) {
    toast.error(t('plugin.details.saveError'))
    return
  }

  isSaving.value = true
  try {
    const nextManifest: Record<string, unknown> = { ...latestManifest }
    const currentDev = isRecord(nextManifest.dev) ? nextManifest.dev : {}

    nextManifest.dev = {
      ...currentDev,
      enable: devSettings.enable,
      address: devSettings.address.trim(),
      source: devSettings.source,
      autoStart: devSettings.autoStart
    }

    const success = await pluginSDK.saveManifest(plugin.value.name, nextManifest, true)
    if (!success) {
      toast.error(t('plugin.details.saveError'))
      return
    }

    manifestCache.value = nextManifest
    originalSettings.value = {
      enable: devSettings.enable,
      address: devSettings.address.trim(),
      source: devSettings.source,
      autoStart: devSettings.autoStart
    }
    devSettings.address = devSettings.address.trim()

    toast.success(t('plugin.details.saveSuccess'))
  } catch (error) {
    console.error('[PluginDevSettingsOverlay] Failed to save dev settings:', error)
    toast.error(t('plugin.details.saveError'))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <TxFlipOverlay
    v-model="visible"
    :source="source"
    :duration="FLIP_DURATION"
    :rotate-x="FLIP_ROTATE_X"
    :rotate-y="FLIP_ROTATE_Y"
    :speed-boost="FLIP_SPEED_BOOST"
    transition-name="PluginDevSettings-Mask"
    mask-class="PluginDevSettings-Mask"
    card-class="PluginDevSettings-Card"
    :header-title="t('plugin.details.devSettings')"
    :header-desc="t('plugin.details.devSettingsDesc')"
  >
    <template #default>
      <div class="PluginDevSettings-Panel">
        <div class="PluginDevSettings-Body">
          <TuffBlockSlot
            :title="t('plugin.details.save')"
            :description="t('plugin.details.saveDesc')"
            default-icon="i-ri-save-line"
            active-icon="i-ri-save-line"
          >
            <TxButton
              variant="flat"
              :disabled="!hasChanges || isSaving || manifestLoading"
              @click="saveDevSettings"
            >
              <i v-if="isSaving || manifestLoading" class="i-ri-loader-4-line animate-spin" />
              <i v-else class="i-ri-save-line" />
              <span>
                {{
                  isSaving
                    ? t('plugin.details.saving')
                    : manifestLoading
                      ? t('plugin.details.devSettingsLoading')
                      : t('plugin.details.save')
                }}
              </span>
            </TxButton>
          </TuffBlockSlot>

          <TuffBlockSwitch
            v-model="devSettings.autoStart"
            :loading="manifestLoading"
            :title="t('plugin.details.autoStart')"
            :description="t('plugin.details.autoStartDesc')"
            default-icon="i-carbon-play-filled-alt"
            active-icon="i-carbon-play-filled-alt"
          />
          <TuffBlockSwitch
            v-model="devSettings.enable"
            :loading="manifestLoading"
            :title="t('plugin.details.hotReload')"
            :description="t('plugin.details.hotReloadDesc')"
            default-icon="i-carbon-restart"
            active-icon="i-carbon-restart"
          />
          <TuffBlockInput
            v-model="devSettings.address"
            :title="t('plugin.details.devAddress')"
            :description="t('plugin.details.devAddressDesc')"
            :placeholder="t('plugin.details.devAddressPlaceholder')"
            :disabled="manifestLoading || !devSettings.enable"
            default-icon="i-carbon-link"
            active-icon="i-carbon-link"
          />
          <TuffBlockSwitch
            v-model="devSettings.source"
            :loading="manifestLoading"
            :title="t('plugin.details.sourceMode')"
            :description="t('plugin.details.sourceModeDesc')"
            :disabled="!devSettings.enable"
            default-icon="i-carbon-document-download"
            active-icon="i-carbon-document-download"
          />
        </div>
      </div>
    </template>
  </TxFlipOverlay>
</template>

<style lang="scss" scoped>
.PluginDevSettings-Panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.PluginDevSettings-Body {
  padding: 14px 0 18px;
  overflow-y: auto;
}

:global(.PluginDevSettings-Mask) {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.45);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

:global(.PluginDevSettings-Mask-enter-active),
:global(.PluginDevSettings-Mask-leave-active) {
  transition: opacity 200ms ease;
}

:global(.PluginDevSettings-Mask-enter-from),
:global(.PluginDevSettings-Mask-leave-to) {
  opacity: 0;
}

:global(.PluginDevSettings-Card) {
  width: min(860px, 92vw);
  max-height: min(740px, 90vh);
  border-radius: 1.25rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
