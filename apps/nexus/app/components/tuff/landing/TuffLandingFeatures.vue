<script setup lang="ts">
import { computed, ref } from 'vue'

interface ExtensibilityContent {
  eyebrow: string
  headline: string
  subheadline: string
}

const { t } = useI18n()

interface SdkItem {
  id: string
  title: string
  description: string
  tag: string
  color: string
  icon: string
}

const sdkItems: SdkItem[] = [
  {
    id: 'box-sdk',
    title: 'Box SDK',
    description: 'CoreBox window control.',
    tag: 'useBox()',
    color: '#60a5fa',
    icon: 'i-carbon-rectangle-vertical',
  },
  {
    id: 'clipboard-sdk',
    title: 'Clipboard SDK',
    description: 'Clipboard read/write & history.',
    tag: 'useClipboard()',
    color: '#fbbf24',
    icon: 'i-carbon-copy',
  },
  {
    id: 'tempfile-sdk',
    title: 'TempFile SDK',
    description: 'Temporary file lifecycle.',
    tag: 'useTempPluginFiles()',
    color: '#34d399',
    icon: 'i-carbon-document-attachment',
  },
  {
    id: 'storage-sdk',
    title: 'Storage SDK',
    description: 'Plugin persistence layer.',
    tag: 'usePluginStorage()',
    color: '#a78bfa',
    icon: 'i-carbon-data-base',
  },
  {
    id: 'download-sdk',
    title: 'Download SDK',
    description: 'Managed download tasks.',
    tag: 'useDownloadSdk()',
    color: '#f97316',
    icon: 'i-carbon-download',
  },
  {
    id: 'platform-capabilities-sdk',
    title: 'Platform Capabilities SDK',
    description: 'Capability catalog & status.',
    tag: 'usePlatformSdk()',
    color: '#38bdf8',
    icon: 'i-carbon-chip',
  },
  {
    id: 'account-sdk',
    title: 'Account SDK',
    description: 'Profile, plan & quota.',
    tag: 'useAccountSDK()',
    color: '#f472b6',
    icon: 'i-carbon-user-avatar',
  },
  {
    id: 'channel-sdk',
    title: 'Channel SDK',
    description: 'Legacy IPC channel.',
    tag: 'useChannel()',
    color: '#c084fc',
    icon: 'i-carbon-connection-signal',
  },
  {
    id: 'feature-sdk',
    title: 'Feature SDK',
    description: 'Search result management.',
    tag: 'useFeature()',
    color: '#22c55e',
    icon: 'i-carbon-search',
  },
  {
    id: 'divisionbox-sdk',
    title: 'DivisionBox SDK',
    description: 'Independent window control.',
    tag: 'useDivisionBox()',
    color: '#fb7185',
    icon: 'i-carbon-screen',
  },
  {
    id: 'flow-sdk',
    title: 'Flow SDK',
    description: 'Cross-plugin flow transfer.',
    tag: 'useFlowSDK()',
    color: '#4ade80',
    icon: 'i-carbon-flow',
  },
  {
    id: 'intelligence-sdk',
    title: 'Intelligence SDK',
    description: 'Unified AI capabilities.',
    tag: 'useIntelligence()',
    color: '#facc15',
    icon: 'i-carbon-bot',
  },
  {
    id: 'boxitem-sdk',
    title: 'BoxItem SDK',
    description: 'CoreBox item lifecycle.',
    tag: 'useBoxItems()',
    color: '#2dd4bf',
    icon: 'i-carbon-list-boxes',
  },
  {
    id: 'features-sdk',
    title: 'Features SDK',
    description: 'Plugin feature manager.',
    tag: 'useFeatures()',
    color: '#bef264',
    icon: 'i-carbon-task',
  },
  {
    id: 'meta-sdk',
    title: 'Meta SDK',
    description: 'MetaOverlay global actions.',
    tag: 'useMetaSDK()',
    color: '#818cf8',
    icon: 'i-carbon-idea',
  },
  {
    id: 'notification-sdk',
    title: 'Notification SDK',
    description: 'Notification workflow.',
    tag: 'useNotificationSdk()',
    color: '#f87171',
    icon: 'i-carbon-notification',
  },
  {
    id: 'performance-sdk',
    title: 'Performance SDK',
    description: 'Storage & perf metrics.',
    tag: 'usePerformance()',
    color: '#fda4af',
    icon: 'i-carbon-speedometer',
  },
  {
    id: 'system-sdk',
    title: 'System SDK',
    description: 'Active app snapshots.',
    tag: 'useSystemSDK()',
    color: '#94a3b8',
    icon: 'i-carbon-desktop',
  },
  {
    id: 'service-sdk',
    title: 'Service SDK',
    description: 'Plugin service registry.',
    tag: 'useServiceSDK()',
    color: '#e879f9',
    icon: 'i-carbon-service-id',
  },
  {
    id: 'window-sdk',
    title: 'Window SDK',
    description: 'Plugin window control.',
    tag: 'useWindowSDK()',
    color: '#5eead4',
    icon: 'i-carbon-application',
  },
  {
    id: 'touch-sdk',
    title: 'Touch SDK',
    description: 'Runtime bridge helpers.',
    tag: 'useTouchSDK()',
    color: '#8b5cf6',
    icon: 'i-carbon-touch-1',
  },
  {
    id: 'app-sdk',
    title: 'App SDK',
    description: 'App lifecycle & info.',
    tag: 'useAppSDK()',
    color: '#3b82f6',
    icon: 'i-carbon-app-switcher',
  },
  {
    id: 'platform-sdk',
    title: 'Platform SDK',
    description: 'Platform integrations.',
    tag: 'usePlatformSDK()',
    color: '#0ea5e9',
    icon: 'i-carbon-ibm-cloud',
  },
  {
    id: 'market-sdk',
    title: 'Market SDK',
    description: 'Marketplace operations.',
    tag: 'useMarketSDK()',
    color: '#f59e0b',
    icon: 'i-carbon-store',
  },
  {
    id: 'plugin-sdk',
    title: 'Plugin SDK',
    description: 'Plugin transport domain.',
    tag: 'usePluginSDK()',
    color: '#10b981',
    icon: 'i-carbon-plug',
  },
  {
    id: 'disposable-sdk',
    title: 'Disposable SDK',
    description: 'Disposable resources.',
    tag: 'useDisposableSDK()',
    color: '#f43f5e',
    icon: 'i-carbon-trash-can',
  },
  {
    id: 'tuff-transport-sdk',
    title: 'TuffTransport SDK',
    description: 'Unified transport client.',
    tag: 'useTuffTransport()',
    color: '#22d3ee',
    icon: 'i-carbon-transportation',
  },
  {
    id: 'analytics-sdk',
    title: 'Analytics SDK',
    description: 'Plugin analytics events.',
    tag: 'useAnalyticsSDK()',
    color: '#84cc16',
    icon: 'i-carbon-analytics',
  },
]

const marqueeDurations = ['46s', '54s', '62s']

const extensibility = computed<ExtensibilityContent>(() => ({
  eyebrow: t('landing.os.extensibility.eyebrow'),
  headline: t('landing.os.extensibility.headline'),
  subheadline: t('landing.os.extensibility.subheadline'),
}))

const sdkRows = computed(() => {
  const rows: SdkItem[][] = [[], [], []]
  sdkItems.forEach((item, index) => {
    const row = rows[index % rows.length]
    if (row)
      row.push(item)
  })
  return rows
})

const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copySdkCode(item: SdkItem) {
  const text = item.tag
  if (!text)
    return

  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  copiedId.value = item.id
  if (copiedTimer)
    clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    if (copiedId.value === item.id)
      copiedId.value = null
  }, 1400)
}
</script>

<template>
  <TuffLandingSection
    :sticky="extensibility.eyebrow"
    :title="extensibility.headline"
    :subtitle="extensibility.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="w-full space-y-16"
    title-class="text-[clamp(.7rem,1vw+1.4rem,1.2rem)] font-bold leading-tight"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 42,
        duration: 1.05,
      },
    }"
  >
    <div class="landing-features__panel">
      <div class="landing-features__marquee">
        <div
          v-for="(row, rowIndex) in sdkRows"
          :key="`sdk-row-${rowIndex}`"
          class="landing-features__row"
          :style="{
            '--marquee-duration': marqueeDurations[rowIndex] ?? '52s',
            '--marquee-direction': rowIndex % 2 === 0 ? 'normal' : 'reverse',
          }"
        >
          <div class="landing-features__track">
            <div class="landing-features__segment">
              <button
                v-for="item in row"
                :key="item.id"
                class="landing-features__card"
                :style="{ '--sdk-accent': item.color }"
                :class="{ 'is-copied': copiedId === item.id }"
                type="button"
                :aria-label="`Copy ${item.tag}`"
                @click="copySdkCode(item)"
              >
                <span class="landing-features__card-inner">
                  <span class="landing-features__face landing-features__face--front">
                    <span class="landing-features__icon" aria-hidden="true">
                      <span :class="item.icon" />
                    </span>
                    <span class="landing-features__title">{{ item.title }}</span>
                  </span>
                  <span class="landing-features__face landing-features__face--back">
                    <span class="landing-features__desc">{{ item.description }}</span>
                    <span class="landing-features__copied-text" aria-hidden="true">{{ t('landing.os.extensibility.copied') }}</span>
                  </span>
                </span>
              </button>
            </div>
            <div class="landing-features__segment" aria-hidden="true">
              <button
                v-for="item in row"
                :key="`${item.id}-copy`"
                class="landing-features__card"
                :style="{ '--sdk-accent': item.color }"
                type="button"
                tabindex="-1"
              >
                <span class="landing-features__card-inner">
                  <span class="landing-features__face landing-features__face--front">
                    <span class="landing-features__icon" aria-hidden="true">
                      <span :class="item.icon" />
                    </span>
                    <span class="landing-features__title">{{ item.title }}</span>
                  </span>
                  <span class="landing-features__face landing-features__face--back">
                    <span class="landing-features__desc">{{ item.description }}</span>
                    <span class="landing-features__copied-text" aria-hidden="true">{{ t('landing.os.extensibility.copied') }}</span>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.landing-features__panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: clamp(4rem, 10vw, 8rem) 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.landing-features__marquee {
  width: 100%;
  display: grid;
  gap: clamp(0.9rem, 2vw, 1.4rem);
}

.landing-features__row {
  width: 100%;
  overflow: hidden;
  padding-block: 0.3rem;
  mask-image: linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%);
}

.landing-features__track {
  display: flex;
  width: max-content;
  animation: landing-marquee var(--marquee-duration, 52s) linear infinite;
  animation-direction: var(--marquee-direction, normal);
  align-items: stretch;
}

.landing-features__panel:hover .landing-features__track {
  animation-play-state: paused;
}

.landing-features__segment {
  display: flex;
  gap: clamp(0.7rem, 1.4vw, 1.1rem);
  padding-inline: clamp(0.6rem, 1.6vw, 1.6rem);
  align-items: stretch;
  perspective: 1200px;
}

.landing-features__card {
  position: relative;
  display: block;
  width: clamp(190px, 22vw, 250px);
  height: clamp(80px, 7vw, 102px);
  padding: 0;
  border-radius: 22px;
  background: transparent;
  border: none;
  box-shadow: none;
  color: #f8fafc;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  perspective: 1200px;
  appearance: none;
  background-clip: padding-box;
}

.landing-features__card-inner {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--sdk-accent);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 12px 28px rgba(2, 6, 23, 0.35);
  transform-style: preserve-3d;
  transition: transform 420ms ease, box-shadow 220ms ease;
}

.landing-features__card-inner::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(145deg, rgba(2, 6, 23, 0.45), rgba(2, 6, 23, 0.75));
  opacity: 1;
  pointer-events: none;
}

.landing-features__card-inner::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.2);
  pointer-events: none;
}

.landing-features__title {
  font-size: 0.98rem;
  font-weight: 600;
}

.landing-features__card:hover .landing-features__card-inner {
  transform: translateY(-4px) rotateY(180deg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 16px 34px rgba(2, 6, 23, 0.4);
}

.landing-features__card:focus-visible .landing-features__card-inner {
  transform: translateY(-4px) rotateY(180deg);
}

.landing-features__card.is-copied .landing-features__card-inner {
  transform: translateY(-4px) rotateY(180deg);
  animation: landing-card-pulse 520ms ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 18px 40px rgba(2, 6, 23, 0.55);
}

.landing-features__face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  backface-visibility: hidden;
  background: transparent;
  border-radius: inherit;
}

.landing-features__face--front {
  justify-content: flex-start;
}

.landing-features__face--back {
  align-items: center;
  justify-content: center;
  text-align: center;
  transform: rotateY(180deg);
  background: rgba(2, 6, 23, 0.28);
}

.landing-features__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  box-shadow: none;
}

.landing-features__icon :deep(span) {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
}

.landing-features__desc {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.45;
  color: rgba(248, 250, 252, 0.9);
  max-width: 80%;
  text-align: center;
  margin-inline: auto;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.landing-features__copied-text {
  margin-top: 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: rgba(248, 250, 252, 0.95);
  text-transform: uppercase;
  opacity: 0;
  filter: blur(6px);
  transition: opacity 240ms ease, filter 240ms ease;
}

.landing-features__card.is-copied .landing-features__desc {
  filter: blur(6px);
  opacity: 0.25;
  transition: filter 220ms ease, opacity 220ms ease;
}

.landing-features__card.is-copied .landing-features__copied-text {
  opacity: 1;
  filter: blur(0);
}

@keyframes landing-card-pulse {
  0% {
    transform: translateY(-4px) rotateY(180deg) scale(1);
  }
  50% {
    transform: translateY(-6px) rotateY(180deg) scale(1.03);
  }
  100% {
    transform: translateY(-4px) rotateY(180deg) scale(1);
  }
}

@keyframes landing-marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-features__track {
    animation: none;
    transform: translateX(0);
  }
}
</style>
