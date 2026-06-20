<script setup lang="ts">
import type { LogoItem } from './LogoLoop.vue'
import { hasNavigator } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted } from 'vue'
import DarkVeil from '~/components/tuff/background/DarkVeil.vue'
import TuffLandingLineShadowText from '~/components/tuff/landing/TuffLandingLineShadowText.vue'
import { useLandingRevealState } from '~/composables/useLandingRevealState'
import LogoLoop from './LogoLoop.vue'

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

const agentLogos: LogoItem[] = [
  { node: '<span class="i-simple-icons-openai"></span><span>Codex</span>', title: 'Codex' },
  { node: '<span class="i-simple-icons-claude"></span><span>Claude Code</span>', title: 'Claude Code' },
  { node: '<span class="NewAgentLogoMark">Pi</span><span>Pi Agent</span>', title: 'Pi Agent' },
  { node: '<span class="NewAgentLogoMark">OC</span><span>OpenCode</span>', title: 'OpenCode' },
  { node: '<span class="NewAgentLogoMark">H</span><span>Hermes</span>', title: 'Hermes Agent' },
  { node: '<span class="NewAgentLogoMark">OC</span><span>OpenClaw</span>', title: 'OpenClaw' },
  { node: '<span class="i-simple-icons-githubcopilot"></span><span>Copilot</span>', title: 'GitHub Copilot' },
  { node: '<span class="i-simple-icons-cursor"></span><span>Cursor</span>', title: 'Cursor' },
  { node: '<span class="i-simple-icons-qwen"></span><span>Qwen Code</span>', title: 'Qwen Code' },
  { node: '<span class="NewAgentLogoMark">A</span><span>Auggie</span>', title: 'Auggie CLI' },
  { node: '<span class="i-simple-icons-googlegemini"></span><span>Gemini CLI</span>', title: 'Gemini CLI' },
  { node: '<span class="i-simple-icons-moonshotai"></span><span>Kimi Code</span>', title: 'Kimi Code CLI' },
  { node: '<span class="i-simple-icons-sourcegraph"></span><span>Amp</span>', title: 'Amp' },
  { node: '<span class="i-simple-icons-snowflake"></span><span>Cortex</span>', title: 'Cortex Code' },
  { node: '<span class="i-simple-icons-cline"></span><span>Cline</span>', title: 'Cline' },
  { node: '<span class="i-simple-icons-mistralai"></span><span>Mistral Vibe</span>', title: 'Mistral Vibe' },
  { node: '<span class="i-simple-icons-deepseek"></span><span>CodeWhale</span>', title: 'CodeWhale' },
  { node: '<span class="NewAgentLogoMark">G</span><span>Grok</span>', title: 'Grok' },
]

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
        <NuxtLink class="NexusButton" to="/docs">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ t('landing.nexus.hero.secondaryCta') }}</span>
        </NuxtLink>
      </div>

      <div class="NexusHero-AgentLoop" :class="{ 'is-ready': interactiveReady }">
        <LogoLoop
          :logos="agentLogos"
          :speed="78"
          direction="left"
          :logo-height="38"
          :gap="16"
          :hover-speed="14"
          :scale-on-hover="true"
          :fade-out="true"
          fade-out-color="#050608"
          aria-label="Compatible coding agents"
        />
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
  padding: 6.5rem max(1.5rem, calc((100vw - 1480px) / 2)) 3rem;
  overflow: hidden;
  color: var(--nexus-ink);
  opacity: 0;
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
  background: #050608;
}

.NexusHero-Veil :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.NexusHero-Scrim {
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(5, 6, 8, 0.82) 0%, rgba(5, 6, 8, 0.32) 36%, rgba(5, 6, 8, 0) 72%),
    linear-gradient(180deg, rgba(5, 6, 8, 0.12) 0%, rgba(5, 6, 8, 0) 58%, rgba(5, 6, 8, 0.52) 100%);
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

.NexusHero-AgentLoop {
  position: relative;
  width: min(100%, 74rem);
  height: 8rem;
  margin: clamp(4.6rem, 9vh, 7rem) auto 0;
  padding: 1.2rem 0;
  color: rgba(246, 247, 244, 0.74);
  opacity: 0;
  transform: translate3d(0, 18px, 0);
  transition:
    opacity 640ms ease,
    transform 640ms ease;
}

.NexusHero-AgentLoop.is-ready {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusHero-AgentLoop::before,
.NexusHero-AgentLoop::after {
  position: absolute;
  inset-inline: 8%;
  height: 1px;
  content: "";
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
}

.NexusHero-AgentLoop::before {
  top: 0;
}

.NexusHero-AgentLoop::after {
  bottom: 0;
}

.NexusHero-AgentLoop :deep(.LogoLoop) {
  height: 100%;
}

.NexusHero-AgentLoop :deep(.LogoLoop-Track) {
  height: 100%;
  align-items: center;
}

.NexusHero-AgentLoop :deep(.LogoLoop-Logo) {
  gap: 0.55rem;
  min-height: 3.25rem;
  border: 1px solid rgba(246, 247, 244, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 52px rgba(0, 0, 0, 0.22);
  padding: 0.62rem 1rem;
  font-size: 0.95rem;
  font-weight: 720;
  letter-spacing: 0;
  white-space: nowrap;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.NexusHero-AgentLoop :deep(.LogoLoop-Logo > span:first-child) {
  display: inline-flex;
  width: 1.15rem;
  height: 1.15rem;
  align-items: center;
  justify-content: center;
  color: #b7a6ff;
  font-size: 1.15rem;
}

.NexusHero-AgentLoop :deep(.NewAgentLogoMark) {
  border: 1px solid rgba(183, 166, 255, 0.38);
  border-radius: 999px;
  color: #d7ccff;
  font-size: 0.68rem !important;
  font-weight: 850;
  line-height: 1;
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
    padding: 6rem 1rem 2rem;
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

  .NexusHero-AgentLoop {
    height: 6.8rem;
    margin-top: 2.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .NexusHero,
  .NexusHero-Content,
  .NexusHero-Actions,
  .NexusHero-AgentLoop,
  .NexusButton {
    transition: none;
  }
}
</style>
