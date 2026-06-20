<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import TuffLandingIntegrations from './landing/TuffLandingIntegrations.vue'
import TuffLandingNexusHero from './landing/TuffLandingNexusHero.vue'

type CapabilityKey = 'local' | 'intelligence' | 'plugins'
type WorkflowKey = 'capture' | 'route' | 'execute'

const { t } = useI18n()
const colorMode = useColorMode()

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

onMounted(() => {
  previousPreference = colorMode.preference
  if (colorMode.preference !== 'dark')
    colorMode.preference = 'dark'
})

onBeforeUnmount(() => {
  stopDarkLock()
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
    <TuffLandingNexusHero />

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
  .NexusButton {
    width: 100%;
  }

  .NexusWorkflow-Steps li {
    grid-template-columns: 1fr;
    min-height: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .NexusButton,
  .NexusCapability {
    transition: none;
  }
}
</style>
