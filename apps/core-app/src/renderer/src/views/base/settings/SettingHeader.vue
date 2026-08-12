<script setup name="SettingHeader" lang="ts">
import type { BuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { TxTag } from '@talex-touch/tuffex/tag'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { isBuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLightfallCanvas } from '~/composables/useLightfallCanvas'
import { useEnv } from '~/modules/hooks/env-hooks'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { createRendererLogger } from '~/utils/renderer-log'
import { resolveMacNativeTrust } from './update-diagnostic-evidence'

const { t } = useI18n()
const { packageJson, processInfo } = useEnv()
const transport = useTuffTransport()
const { platform } = useRendererPlatform()
const settingHeaderLog = createRendererLogger('SettingHeader')
const buildVerificationStatus = ref<BuildVerificationStatus | null>(null)
let buildVerificationStatusDisposer: (() => void) | null = null

const nativeTrust = computed(() =>
  resolveMacNativeTrust(platform.value, buildVerificationStatus.value)
)
const isNativeTrustUnverified = computed(() => nativeTrust.value.status === 'unverified')

const canvasRef = ref<HTMLCanvasElement | null>(null)

const appVersion = computed(() => packageJson.value?.version || '')
const versionLabel = computed(() => (appVersion.value ? `v${appVersion.value}` : ''))

const runtimeVersions = computed(() => {
  const info = processInfo.value as { versions?: { chrome?: string; node?: string } } | undefined
  return info?.versions
})
const chromeVersion = computed(() => runtimeVersions.value?.chrome || '')
const nodeVersion = computed(() => runtimeVersions.value?.node || '')
const vueVersion = computed(() => packageJson.value?.devDependencies?.vue || '')
const footerTagStyle = {
  color: 'rgba(248, 250, 252, 0.78)',
  background: 'rgba(15, 23, 42, 0.28)',
  border: 'rgba(226, 232, 240, 0.18)',
  size: 'md' as const
}

function applyBuildVerificationStatus(value: unknown): void {
  if (isBuildVerificationStatus(value)) buildVerificationStatus.value = value
}

onMounted(async () => {
  buildVerificationStatusDisposer = transport.on(AppEvents.build.statusUpdated, (status) => {
    applyBuildVerificationStatus(status)
  })

  try {
    applyBuildVerificationStatus(await transport.send(AppEvents.build.getVerificationStatus))
  } catch (error) {
    settingHeaderLog.warn('Failed to get build verification status', error)
  }
})

useLightfallCanvas(canvasRef)

onBeforeUnmount(() => {
  buildVerificationStatusDisposer?.()
  buildVerificationStatusDisposer = null
})
</script>

<template>
  <div
    class="AboutApplication activate"
    :class="{ 'is-native-trust-unverified': isNativeTrustUnverified }"
    :style="{ '--inactive-text': `'${t('settingHeader.inactive')}'` }"
  >
    <canvas ref="canvasRef" class="Header-Canvas" aria-hidden="true" />
    <div class="Header-Content">
      <div class="Header-Intro">
        <div v-if="versionLabel" class="Header-Badge">
          <span class="Header-Status" aria-hidden="true" />
          <span class="Header-BadgeLabel">{{ t('settingHeader.version') }}</span>
          <span class="Header-BadgeValue">{{ versionLabel }}</span>
        </div>

        <div class="Home-Text">
          <h1 class="Header-Title">TUFF</h1>
          <p>{{ t('settingHeader.subTitle') }}</p>
        </div>
      </div>

      <ul v-if="processInfo && !isNativeTrustUnverified" class="About-Footer">
        <li>
          <TxTag
            v-bind="footerTagStyle"
            icon="i-carbon-chip"
            :label="`Chromium: ${chromeVersion}`"
          />
        </li>
        <li>
          <TxTag v-bind="footerTagStyle" icon="i-carbon-code" :label="`Node.js: ${nodeVersion}`" />
        </li>
        <li>
          <TxTag v-bind="footerTagStyle" icon="i-carbon-logo-vue" :label="`Vue: ${vueVersion}`" />
        </li>
      </ul>
    </div>

    <div class="About-Image">
      <div class="Home-Logo-Bg" />
      <img src="~/assets/logo.svg" alt="logo" />
    </div>
  </div>
</template>

<style lang="scss">
.AboutApplication {
  .Header-Canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .Header-Content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: min(65%, 640px);
  }

  .Header-Intro {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .Header-Badge {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.38);
    border: 1px solid rgba(226, 232, 240, 0.2);
    backdrop-filter: blur(12px);
  }

  .Header-Status {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #22c55e;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
    animation: status-pulse 2s ease-in-out infinite;
  }

  .Header-BadgeLabel {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  .Header-BadgeValue {
    font-size: 12px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .Home-Text {
    display: flex;
    flex-direction: column;
    gap: 8px;

    p {
      margin: 0;
      color: rgba(248, 250, 252, 0.78);
      font-size: 14px;
      line-height: 1.6;
    }
  }

  .Header-Title {
    margin: 0;
    font-size: clamp(32px, 4vw, 56px);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: linear-gradient(135deg, #ffffff 0%, #dbeafe 45%, #bae6fd 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .About-Footer {
    display: flex;
    gap: 10px;
    padding: 0;
    margin: 0;

    li {
      list-style: none;
    }
  }

  .About-Image {
    position: absolute;
    right: 5%;
    top: 12%;
    height: 76%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;

    .Home-Logo-Bg {
      position: absolute;
      inset: 12%;
      border-radius: 50%;
      background:
        radial-gradient(circle at 30% 30%, rgba(147, 197, 253, 0.48), transparent 60%),
        radial-gradient(circle at 70% 70%, rgba(125, 211, 252, 0.34), transparent 55%);
      filter: blur(8px);
      opacity: 0.72;
    }

    img {
      position: relative;
      height: 100%;
      filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.42));
    }
  }

  &.activate {
    &:before {
      opacity: 0;
    }

    opacity: 0.98;
  }

  &:before {
    content: var(--inactive-text);
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: 0.6;
    font-size: 20px;
    font-weight: 600;
    border-radius: 12px;
    background-color: var(--tx-fill-color-darker);
    z-index: 3;
  }

  & {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 15px;
    width: 100%;
    min-height: 220px;
    padding: 24px 32px;
    border-radius: 18px;
    color: var(--tx-text-color-primary);
    border: 1px solid var(--tx-border-color);
    background: linear-gradient(
      135deg,
      var(--tx-color-primary) 0%,
      var(--tx-color-primary-light-3) 45%,
      var(--tx-color-primary-light-5) 100%
    );
    background-size: 200% 200%;
    animation: header-flow 12s ease infinite;
  }

  &.is-native-trust-unverified {
    border-color: var(--tx-color-danger);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--tx-color-danger) 64%, transparent),
      0 0 0 1px color-mix(in srgb, var(--tx-color-danger) 32%, transparent);

    .Header-Status {
      background: var(--tx-color-danger);
      box-shadow: 0 0 12px color-mix(in srgb, var(--tx-color-danger) 72%, transparent);
    }
  }

  :root:not(.dark) & {
    filter: brightness(1.08) saturate(1.04);
  }
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.55;
    transform: scale(1.4);
  }
}

@keyframes header-flow {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}

@media (max-width: 900px) {
  .AboutApplication {
    padding: 20px 24px;
  }

  .AboutApplication .Header-Content {
    width: 100%;
  }

  .AboutApplication .About-Image {
    right: -5%;
    opacity: 0.35;
  }

  .AboutApplication .About-Footer {
    flex-wrap: wrap;
  }
}
</style>
