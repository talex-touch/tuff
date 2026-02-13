<script setup lang="ts">
import { computed, ref } from 'vue'
import { tuffSdkItems, type TuffSdkItem } from '~/data/tuffSdkItems'

interface ExtensibilityContent {
  eyebrow: string
  headline: string
  subheadline: string
}

const { t } = useI18n()

const sdkItems: TuffSdkItem[] = tuffSdkItems

const marqueeDurations = ['46s', '54s', '62s']

const extensibility = computed<ExtensibilityContent>(() => ({
  eyebrow: t('landing.os.extensibility.eyebrow'),
  headline: t('landing.os.extensibility.headline'),
  subheadline: t('landing.os.extensibility.subheadline'),
}))

const sdkRows = computed(() => {
  const rows: TuffSdkItem[][] = [[], [], []]
  sdkItems.forEach((item, index) => {
    const row = rows[index % rows.length]
    if (row)
      row.push(item)
  })
  return rows
})

const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copySdkCode(item: TuffSdkItem) {
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
