<script setup lang="ts">
import { hasNavigator } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted } from 'vue'
import DarkVeil from '../background/DarkVeil.vue'
import TuffLandingLineShadowText from './TuffLandingLineShadowText.vue'
import { toLocalizedDocsPath, normalizeDocsLocale, type DocsLocale } from '#shared/utils/docs-path'
import { useLandingRevealState } from '~/composables/useLandingRevealState'

type HeroPlatform = 'darwin' | 'win32' | 'linux'

const { locale, t } = useI18n()
const heroPlatform = ref<HeroPlatform>('darwin')
const heroReady = ref(false)
const {
  beginSequence,
  resetSequence,
  contentVisible,
  interactiveReady,
} = useLandingRevealState()

const isZh = computed(() => locale.value.startsWith('zh'))
const docsLocale = computed<DocsLocale>(() => normalizeDocsLocale(isZh.value ? 'zh' : 'en'))
const docsCtaTo = computed(() => toLocalizedDocsPath('/docs', docsLocale.value))

const heroPlatformMeta = computed(() => {
  const platform = heroPlatform.value

  if (platform === 'win32') {
    return {
      name: 'Windows',
    }
  }

  if (platform === 'linux') {
    return {
      name: 'Linux',
    }
  }

  return {
    name: 'macOS',
  }
})

const primaryCtaLabel = computed(() => {
  const platformName = heroPlatformMeta.value.name
  return isZh.value ? `获取 ${platformName} 版本` : `Get ${platformName} version`
})

function detectHeroPlatform(): HeroPlatform {
  if (!hasNavigator())
    return 'darwin'

  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (ua.includes('windows') || platform.includes('win'))
    return 'win32'

  if (ua.includes('linux') || platform.includes('linux'))
    return 'linux'

  return 'darwin'
}

onMounted(() => {
  heroPlatform.value = detectHeroPlatform()
  requestAnimationFrame(() => {
    heroReady.value = true
  })

  beginSequence({
    content: 220,
    interactive: 760,
    header: 980,
  })
})

onBeforeUnmount(() => {
  resetSequence({ preserveHeader: true })
})
</script>

<template>
  <section
    class="NexusHero TuffHome-HeroSection"
    :class="{ 'is-ready': heroReady }"
    aria-labelledby="nexus-landing-title"
  >
    <div class="NexusHero-Veil" aria-hidden="true">
      <ClientOnly>
        <DarkVeil
          :hue-shift="354"
          :noise-intensity="0.07"
          :scanline-intensity="0.88"
          :scanline-frequency="4.8"
          :speed="1.4"
          :warp-amount="1"
          :resolution-scale="0.82"
        />
      </ClientOnly>
    </div>
    <div class="NexusHero-Scrim" aria-hidden="true" />

    <div class="NexusHero-Content" :class="{ 'is-visible': contentVisible }">
      <p class="NexusHero-Badge">
        <span aria-hidden="true" />
        {{ t('landing.nexus.hero.eyebrow') }}
      </p>
      <h1 id="nexus-landing-title">
        <span>
          {{ t('landing.nexus.hero.titlePrefix') }}
          <TuffLandingLineShadowText class="NexusHero-OsText" :text="t('landing.nexus.hero.titleSubject')" />
        </span>
        <strong>{{ t('landing.nexus.hero.titleAccent') }}</strong>
      </h1>
      <div class="NexusHero-Actions" :class="{ 'is-ready': interactiveReady }">
        <NuxtLink class="NexusButton is-primary" to="/updates">
          <TxOsIcon :platform="heroPlatform" />
          <span>{{ primaryCtaLabel }}</span>
        </NuxtLink>
        <NuxtLink class="NexusButton" :to="docsCtaTo">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ t('landing.nexus.hero.secondaryCta') }}</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.NexusHero {
  --nexus-ink: #f6f7f4;
  --nexus-accent: #9ad0bc;
  --nexus-accent-strong: #d7f7e9;

  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  min-height: 100svh;
  padding: 6.5rem max(1.5rem, calc((100vw - 1480px) / 2)) 4rem;
  overflow: hidden;
  color: var(--nexus-ink);
  opacity: 1;
  transition: opacity 720ms ease;
}

.NexusHero.is-ready {
  opacity: 1;
}

.NexusHero-Veil,
.NexusHero-Scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.NexusHero-Veil {
  z-index: 0;
  background:
    #050608;
}

.NexusHero-Veil :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.NexusHero-Scrim {
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(5, 6, 8, 0.82) 0%, rgba(5, 6, 8, 0.32) 36%, rgba(5, 6, 8, 0) 72%),
    linear-gradient(180deg, rgba(5, 6, 8, 0.12) 0%, rgba(5, 6, 8, 0) 58%, rgba(5, 6, 8, 0.46) 100%);
}

.NexusHero-Content {
  position: relative;
  z-index: 2;
  width: min(100%, 86rem);
  text-align: center;
  opacity: 1;
  transform: none;
  transition:
    opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 760ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.NexusHero-Content.is-visible {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusHero-Badge {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0;
  border: 1px solid rgba(246, 247, 244, 0.12);
  border-radius: 999px;
  background: rgba(20, 23, 34, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 60px rgba(0, 0, 0, 0.3);
  padding: 0.7rem 1rem;
  color: rgba(246, 247, 244, 0.82);
  font-size: clamp(0.9rem, 1.2vw, 1.05rem);
  font-weight: 720;
  letter-spacing: 0;
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}

.NexusHero-Badge span {
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 999px;
  background: #6e72ff;
  box-shadow:
    0 0 0 4px rgba(110, 114, 255, 0.16),
    0 0 22px rgba(110, 114, 255, 0.86);
}

.NexusHero h1 {
  display: grid;
  gap: 0.12em;
  max-width: 86rem;
  margin: clamp(1.75rem, 3vw, 2.75rem) auto 0;
  letter-spacing: 0;
}

.NexusHero h1 span {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.18em;
  color: #fff;
  font-size: clamp(3.25rem, 6.8vw, 6.9rem);
  font-weight: 830;
  line-height: 0.92;
  text-shadow: 0 0 28px rgba(255, 255, 255, 0.18);
}

.NexusHero-OsText {
  --line-shadow-color: rgba(246, 247, 244, 0.85);
}

.NexusHero h1 strong {
  display: inline-block;
  background: linear-gradient(180deg, #f3ecff 0%, #bf9cff 28%, #7f6cff 62%, #5b3df4 100%);
  background-clip: text;
  color: transparent;
  font-size: clamp(3.3rem, 6.6vw, 6.8rem);
  font-weight: 850;
  line-height: 1.04;
  padding-bottom: 0.08em;
  filter: drop-shadow(0 18px 54px rgba(105, 75, 255, 0.36));
  text-shadow: none;
  -webkit-background-clip: text;
}

.NexusHero-Actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  margin-top: 3rem;
  opacity: 1;
  transform: none;
  transition:
    opacity 520ms ease,
    transform 520ms ease;
}

.NexusHero-Actions.is-ready {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusButton {
  display: inline-flex;
  min-height: 2.9rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid rgba(246, 247, 244, 0.22);
  border-radius: 999px;
  padding: 0.75rem 1.15rem;
  color: var(--nexus-ink);
  font-size: 0.9rem;
  font-weight: 720;
  text-decoration: none;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.NexusButton:hover {
  border-color: rgba(246, 247, 244, 0.4);
  background: rgba(246, 247, 244, 0.05);
}

.NexusButton:focus-visible {
  outline: 2px solid rgba(154, 208, 188, 0.78);
  outline-offset: 3px;
}

.NexusButton.is-primary {
  border-color: transparent;
  background: var(--nexus-ink);
  color: #07100d;
}

.NexusButton.is-primary:hover {
  background: rgba(246, 247, 244, 0.88);
}

@media (max-width: 640px) {
  .NexusHero {
    min-height: 100svh;
    padding: 6rem 1rem 2.25rem;
  }

  .NexusHero h1 {
    gap: 0.12em;
    margin-top: 1.5rem;
  }

  .NexusHero h1 span {
    font-size: clamp(2.65rem, 15vw, 4.2rem);
  }

  .NexusHero h1 strong {
    font-size: clamp(2.7rem, 13vw, 4.2rem);
    line-height: 1.04;
  }

  .NexusHero-Actions {
    margin-top: 1.25rem;
  }

  .NexusHero-Actions,
  .NexusButton {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .NexusHero,
  .NexusHero-Content,
  .NexusHero-Actions,
  .NexusButton {
    transition: none;
  }
}
</style>
