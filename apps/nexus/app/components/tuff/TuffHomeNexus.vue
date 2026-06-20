<script setup lang="ts">
import { hasNavigator } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import DarkVeil from './background/DarkVeil.vue'
import TuffLandingIntegrations from './landing/TuffLandingIntegrations.vue'
import NexusPlatformIcon from './NexusPlatformIcon.vue'
import { useLandingRevealState } from '~/composables/useLandingRevealState'

type CapabilityKey = 'local' | 'intelligence' | 'plugins'
type WorkflowKey = 'capture' | 'route' | 'execute'
type HeroPlatform = 'darwin' | 'win32' | 'linux'

const { locale, t } = useI18n()
const colorMode = useColorMode()
const heroPlatform = ref<HeroPlatform>('darwin')
const {
  beginSequence,
  resetSequence,
  contentVisible,
  interactiveReady,
} = useLandingRevealState()

let previousPreference = colorMode.preference
const stopDarkLock = watch(() => colorMode.preference, (value) => {
  if (value !== 'dark')
    colorMode.preference = 'dark'
})

const capabilityKeys: CapabilityKey[] = ['local', 'intelligence', 'plugins']
const workflowKeys: WorkflowKey[] = ['capture', 'route', 'execute']

const capabilities = computed(() => capabilityKeys.map(key => ({
  key,
  icon: {
    local: 'i-carbon-laptop',
    intelligence: 'i-carbon-ai-status',
    plugins: 'i-carbon-plug',
  }[key],
  title: t(`landing.nexus.capabilities.items.${key}.title`),
  copy: t(`landing.nexus.capabilities.items.${key}.copy`),
})))

const workflowItems = computed(() => workflowKeys.map((key, index) => ({
  key,
  index: `${index + 1}`.padStart(2, '0'),
  title: t(`landing.nexus.workflow.items.${key}.title`),
  copy: t(`landing.nexus.workflow.items.${key}.copy`),
})))

const isZh = computed(() => locale.value.startsWith('zh'))

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
  previousPreference = colorMode.preference
  if (colorMode.preference !== 'dark')
    colorMode.preference = 'dark'

  heroPlatform.value = detectHeroPlatform()

  beginSequence({
    content: 220,
    interactive: 760,
    header: 980,
  })
})

onBeforeUnmount(() => {
  stopDarkLock()
  resetSequence({ preserveHeader: true })
  if (colorMode.preference !== previousPreference)
    colorMode.preference = previousPreference
})

useHead({
  bodyAttrs: {
    class: 'bg-[#050608] text-light antialiased',
  },
})
</script>

<template>
  <div class="NexusLanding">
    <section class="NexusHero" aria-labelledby="nexus-landing-title">
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
          <span>{{ t('landing.nexus.hero.titleLead') }}</span>
          <strong>{{ t('landing.nexus.hero.titleAccent') }}</strong>
        </h1>
        <div class="NexusHero-Actions" :class="{ 'is-ready': interactiveReady }">
          <NuxtLink class="NexusButton is-primary" to="/updates">
            <NexusPlatformIcon :platform="heroPlatform" />
            <span>{{ primaryCtaLabel }}</span>
          </NuxtLink>
          <NuxtLink class="NexusButton" to="/docs">
            <span class="i-carbon-book" aria-hidden="true" />
            <span>{{ t('landing.nexus.hero.secondaryCta') }}</span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <TuffLandingIntegrations class="NexusAllInOne" />

    <section class="NexusProduct" aria-labelledby="nexus-product-title">
      <div class="NexusSectionIntro">
        <p>{{ t('landing.nexus.product.eyebrow') }}</p>
        <h2 id="nexus-product-title">
          {{ t('landing.nexus.product.title') }}
        </h2>
      </div>

      <figure class="NexusProduct-Media">
        <img
          src="/shots/SearchFileImmediately.jpg"
          :alt="t('landing.nexus.product.previewAlt')"
          width="1200"
          height="768"
          loading="eager"
          decoding="async"
        >
        <figcaption>{{ t('landing.nexus.product.caption') }}</figcaption>
      </figure>
    </section>

    <section class="NexusCapabilities" aria-labelledby="nexus-capabilities-title">
      <div class="NexusSectionIntro">
        <p>{{ t('landing.nexus.capabilities.eyebrow') }}</p>
        <h2 id="nexus-capabilities-title">
          {{ t('landing.nexus.capabilities.title') }}
        </h2>
      </div>

      <div class="NexusCapabilityList">
        <article
          v-for="item in capabilities"
          :key="item.key"
          class="NexusCapability"
        >
          <span class="NexusCapability-Icon" :class="item.icon" aria-hidden="true" />
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.copy }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="NexusWorkflow" aria-labelledby="nexus-workflow-title">
      <div class="NexusWorkflow-Sticky">
        <p>{{ t('landing.nexus.workflow.eyebrow') }}</p>
        <h2 id="nexus-workflow-title">
          {{ t('landing.nexus.workflow.title') }}
        </h2>
      </div>

      <ol class="NexusWorkflow-Steps">
        <li
          v-for="item in workflowItems"
          :key="item.key"
        >
          <span>{{ item.index }}</span>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.copy }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="NexusFinal" aria-labelledby="nexus-final-title">
      <p>{{ t('landing.nexus.final.eyebrow') }}</p>
      <h2 id="nexus-final-title">
        {{ t('landing.nexus.final.title') }}
      </h2>
      <NuxtLink class="NexusButton is-primary" to="/updates">
        <span class="i-carbon-arrow-right" aria-hidden="true" />
        <span>{{ t('landing.nexus.final.cta') }}</span>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.NexusLanding {
  --nexus-bg: #050608;
  --nexus-ink: #f6f7f4;
  --nexus-muted: rgba(246, 247, 244, 0.64);
  --nexus-soft: rgba(246, 247, 244, 0.1);
  --nexus-line: rgba(246, 247, 244, 0.14);
  --nexus-accent: #9ad0bc;
  --nexus-accent-strong: #d7f7e9;

  color: var(--nexus-ink);
  background:
    radial-gradient(circle at 50% 15%, rgba(154, 208, 188, 0.16), transparent 32rem),
    linear-gradient(180deg, #050608 0%, #090d0f 52%, #050608 100%);
  isolation: isolate;
  overflow-x: clip;
}

.NexusHero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  min-height: 100svh;
  padding: 6.5rem max(1.5rem, calc((100vw - 1480px) / 2)) 4rem;
  overflow: hidden;
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
  opacity: 0;
  transform: translate3d(0, 28px, 0);
  transition:
    opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 760ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.NexusHero-Content.is-visible {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusSectionIntro p,
.NexusWorkflow-Sticky p,
.NexusFinal p {
  margin: 0;
  color: var(--nexus-accent);
  font-size: 0.76rem;
  font-weight: 720;
  letter-spacing: 0;
  text-transform: uppercase;
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
  color: #fff;
  font-size: clamp(3.25rem, 6.8vw, 6.9rem);
  font-weight: 830;
  line-height: 0.92;
  text-shadow: 0 0 28px rgba(255, 255, 255, 0.18);
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
  opacity: 0;
  transform: translate3d(0, 12px, 0);
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
    color 180ms ease,
    transform 180ms ease;
}

.NexusButton:hover {
  border-color: rgba(246, 247, 244, 0.4);
  background: rgba(246, 247, 244, 0.08);
  transform: translate3d(0, -1px, 0);
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
  background: var(--nexus-accent-strong);
}

.NexusProduct,
.NexusCapabilities,
.NexusWorkflow,
.NexusFinal {
  position: relative;
  z-index: 2;
  border-top: 1px solid var(--nexus-line);
  background: #050608;
  padding: clamp(4.5rem, 9vw, 8.5rem) max(1.5rem, calc((100vw - 1220px) / 2));
}

.NexusAllInOne {
  position: relative;
  z-index: 2;
  display: block;
  background: #050608;
}

.NexusProduct {
  display: grid;
  grid-template-columns: minmax(0, 0.58fr) minmax(0, 1fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: center;
}

.NexusSectionIntro {
  max-width: 28rem;
}

.NexusSectionIntro h2,
.NexusWorkflow-Sticky h2,
.NexusFinal h2 {
  margin: 0.9rem 0 0;
  color: var(--nexus-ink);
  font-size: clamp(2.15rem, 5vw, 4.8rem);
  font-weight: 780;
  line-height: 0.98;
  letter-spacing: 0;
}

.NexusProduct-Media {
  position: relative;
  margin: 0;
}

.NexusProduct-Media img {
  display: block;
  width: 100%;
  border: 1px solid rgba(246, 247, 244, 0.18);
  border-radius: 8px;
  background: rgba(246, 247, 244, 0.06);
  box-shadow: 0 34px 120px rgba(0, 0, 0, 0.46);
}

.NexusProduct-Media figcaption {
  margin-top: 0.9rem;
  color: rgba(246, 247, 244, 0.5);
  font-size: 0.82rem;
  line-height: 1.6;
}

.NexusCapabilities {
  display: grid;
  grid-template-columns: minmax(0, 0.48fr) minmax(0, 1fr);
  gap: clamp(2rem, 7vw, 6rem);
}

.NexusCapabilityList {
  border-top: 1px solid var(--nexus-line);
}

.NexusCapability {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: 1rem;
  padding: 1.65rem 0;
  border-bottom: 1px solid var(--nexus-line);
  transition:
    border-color 180ms ease,
    transform 180ms ease;
}

.NexusCapability:hover {
  border-color: rgba(154, 208, 188, 0.34);
  transform: translate3d(0, -1px, 0);
}

.NexusCapability-Icon {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  color: var(--nexus-accent-strong);
  font-size: 1.35rem;
}

.NexusCapability h3,
.NexusWorkflow-Steps h3 {
  margin: 0;
  color: var(--nexus-ink);
  font-size: clamp(1.12rem, 1.6vw, 1.4rem);
  font-weight: 760;
  letter-spacing: 0;
}

.NexusCapability p,
.NexusWorkflow-Steps p {
  margin: 0.5rem 0 0;
  color: var(--nexus-muted);
  font-size: 0.98rem;
  line-height: 1.72;
}

.NexusWorkflow {
  display: grid;
  grid-template-columns: minmax(0, 0.5fr) minmax(0, 0.72fr);
  gap: clamp(2rem, 8vw, 7rem);
  align-items: start;
  background:
    linear-gradient(180deg, rgba(154, 208, 188, 0.05), transparent 42%),
    #050608;
}

.NexusWorkflow-Sticky {
  position: sticky;
  top: 7.5rem;
}

.NexusWorkflow-Steps {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--nexus-line);
}

.NexusWorkflow-Steps li {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: 1rem;
  min-height: 11.5rem;
  align-items: start;
  padding: 2rem 0;
  border-bottom: 1px solid var(--nexus-line);
}

.NexusWorkflow-Steps li > span {
  color: rgba(154, 208, 188, 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88rem;
  font-weight: 700;
}

.NexusFinal {
  display: flex;
  min-height: 58svh;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  background:
    radial-gradient(circle at 78% 36%, rgba(154, 208, 188, 0.16), transparent 24rem),
    #050608;
}

.NexusFinal h2 {
  max-width: 58rem;
  margin-bottom: 2rem;
}

@media (max-width: 900px) {
  .NexusProduct,
  .NexusCapabilities,
  .NexusWorkflow {
    grid-template-columns: 1fr;
  }

  .NexusWorkflow-Sticky {
    position: relative;
    top: auto;
  }
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

  .NexusWorkflow-Steps li {
    grid-template-columns: 1fr;
    min-height: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .NexusHero-Content,
  .NexusHero-Actions,
  .NexusButton,
  .NexusCapability {
    transition: none;
  }
}
</style>
