<script setup lang="ts">
type NewLandingItemKey = 'local' | 'command' | 'plugin'
type NewLandingWorkflowKey = 'summon' | 'understand' | 'act'
type NewLandingPrincipleKey = 'quiet' | 'typed' | 'sync'

const { t } = useI18n()

const proofKeys: NewLandingItemKey[] = ['local', 'command', 'plugin']
const workflowKeys: NewLandingWorkflowKey[] = ['summon', 'understand', 'act']
const principleKeys: NewLandingPrincipleKey[] = ['quiet', 'typed', 'sync']

const proofItems = computed(() => proofKeys.map(key => ({
  key,
  icon: {
    local: 'i-carbon-laptop',
    command: 'i-carbon-terminal',
    plugin: 'i-carbon-plug',
  }[key],
  title: t(`landing.new.proof.items.${key}.title`),
  copy: t(`landing.new.proof.items.${key}.copy`),
})))

const workflowItems = computed(() => workflowKeys.map((key, index) => ({
  key,
  index: `${index + 1}`.padStart(2, '0'),
  title: t(`landing.new.workflow.items.${key}.title`),
  copy: t(`landing.new.workflow.items.${key}.copy`),
})))

const principleItems = computed(() => principleKeys.map(key => ({
  key,
  title: t(`landing.new.principles.items.${key}.title`),
  copy: t(`landing.new.principles.items.${key}.copy`),
})))

useHead({
  bodyAttrs: {
    class: 'bg-[#f7f8f5] text-[#151719] antialiased dark:bg-[#101312] dark:text-[#eef2ed]',
  },
})
</script>

<template>
  <div class="TuffHomeNew">
    <section class="TuffHomeNew-Hero" aria-labelledby="new-landing-title">
      <div class="TuffHomeNew-HeroContent">
        <p class="TuffHomeNew-Eyebrow">
          {{ t('landing.new.hero.eyebrow') }}
        </p>
        <h1 id="new-landing-title">
          <span>Tuff</span>
          <small>{{ t('landing.new.hero.title') }}</small>
        </h1>
        <p class="TuffHomeNew-HeroCopy">
          {{ t('landing.new.hero.copy') }}
        </p>
        <div class="TuffHomeNew-HeroActions">
          <NuxtLink class="TuffHomeNew-Button is-primary" to="/updates">
            <span class="i-carbon-download" aria-hidden="true" />
            <span>{{ t('landing.new.hero.primaryCta') }}</span>
          </NuxtLink>
          <NuxtLink class="TuffHomeNew-Button" to="/docs">
            <span class="i-carbon-book" aria-hidden="true" />
            <span>{{ t('landing.new.hero.secondaryCta') }}</span>
          </NuxtLink>
        </div>
      </div>

      <figure class="TuffHomeNew-Preview">
        <img
          src="/shots/SearchFileImmediately.jpg"
          :alt="t('landing.new.hero.previewAlt')"
          width="1200"
          height="768"
          loading="eager"
          decoding="async"
          fetchpriority="high"
        >
        <figcaption>{{ t('landing.new.hero.previewCaption') }}</figcaption>
      </figure>
    </section>

    <section class="TuffHomeNew-Section" aria-labelledby="new-proof-title">
      <div class="TuffHomeNew-SectionHeader">
        <p>{{ t('landing.new.proof.eyebrow') }}</p>
        <h2 id="new-proof-title">
          {{ t('landing.new.proof.title') }}
        </h2>
      </div>
      <div class="TuffHomeNew-ProofGrid">
        <article
          v-for="item in proofItems"
          :key="item.key"
          class="TuffHomeNew-ProofItem"
        >
          <span :class="item.icon" aria-hidden="true" />
          <h3>{{ item.title }}</h3>
          <p>{{ item.copy }}</p>
        </article>
      </div>
    </section>

    <section class="TuffHomeNew-Workflow" aria-labelledby="new-workflow-title">
      <div class="TuffHomeNew-SectionHeader">
        <p>{{ t('landing.new.workflow.eyebrow') }}</p>
        <h2 id="new-workflow-title">
          {{ t('landing.new.workflow.title') }}
        </h2>
      </div>
      <ol>
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

    <section class="TuffHomeNew-Section" aria-labelledby="new-principles-title">
      <div class="TuffHomeNew-SectionHeader">
        <p>{{ t('landing.new.principles.eyebrow') }}</p>
        <h2 id="new-principles-title">
          {{ t('landing.new.principles.title') }}
        </h2>
      </div>
      <div class="TuffHomeNew-Principles">
        <article
          v-for="item in principleItems"
          :key="item.key"
        >
          <h3>{{ item.title }}</h3>
          <p>{{ item.copy }}</p>
        </article>
      </div>
    </section>

    <section class="TuffHomeNew-Final" aria-labelledby="new-final-title">
      <p>{{ t('landing.new.final.eyebrow') }}</p>
      <h2 id="new-final-title">
        {{ t('landing.new.final.title') }}
      </h2>
      <NuxtLink class="TuffHomeNew-Button is-primary" to="/updates">
        <span class="i-carbon-arrow-right" aria-hidden="true" />
        <span>{{ t('landing.new.final.cta') }}</span>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.TuffHomeNew {
  --new-ink: #151719;
  --new-muted: rgba(21, 23, 25, 0.66);
  --new-line: rgba(21, 23, 25, 0.13);
  --new-page-start: #f7f8f5;
  --new-page-mid: #eef2f0;
  --new-page-end: #f7f8f5;
  --new-surface: rgba(255, 255, 255, 0.58);
  --new-surface-hover: rgba(255, 255, 255, 0.88);
  --new-preview-bg: #dfe7e6;
  --new-preview-border: rgba(21, 23, 25, 0.15);
  --new-preview-shadow: rgba(25, 44, 41, 0.14);
  --new-accent-strong: #214f44;
  --new-accent-hover: #183d35;
  --new-accent-border-hover: rgba(33, 79, 68, 0.36);
  --new-primary-ink: #ffffff;
  --new-workflow-ink: #eef2ed;
  --new-workflow-title: #f8fbf7;
  --new-workflow-muted: rgba(238, 242, 237, 0.68);
  --new-workflow-accent: #91c6b4;
  --new-workflow-line: rgba(238, 242, 237, 0.16);
  --new-workflow-bg-start: rgba(11, 22, 25, 0.96);
  --new-workflow-bg-end: rgba(31, 51, 49, 0.94);

  color: var(--new-ink);
  background:
    linear-gradient(180deg, var(--new-page-start) 0%, var(--new-page-mid) 42%, var(--new-page-end) 100%);
}

.dark .TuffHomeNew {
  --new-ink: #eef2ed;
  --new-muted: rgba(238, 242, 237, 0.66);
  --new-line: rgba(238, 242, 237, 0.13);
  --new-page-start: #101312;
  --new-page-mid: #151b19;
  --new-page-end: #0f1211;
  --new-surface: rgba(238, 242, 237, 0.08);
  --new-surface-hover: rgba(238, 242, 237, 0.12);
  --new-preview-bg: #17201d;
  --new-preview-border: rgba(238, 242, 237, 0.16);
  --new-preview-shadow: rgba(0, 0, 0, 0.38);
  --new-accent-strong: #9ad0bc;
  --new-accent-hover: #b3dfcf;
  --new-accent-border-hover: rgba(154, 208, 188, 0.42);
  --new-primary-ink: #0d1714;
  --new-workflow-ink: #f0f4ef;
  --new-workflow-title: #fbfdf8;
  --new-workflow-muted: rgba(240, 244, 239, 0.68);
  --new-workflow-accent: #a8dcca;
  --new-workflow-line: rgba(240, 244, 239, 0.16);
  --new-workflow-bg-start: rgba(6, 12, 13, 0.98);
  --new-workflow-bg-end: rgba(18, 35, 32, 0.96);
}

.TuffHomeNew-Hero {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(420px, 1.14fr);
  gap: 4rem;
  align-items: center;
  min-height: 82svh;
  padding: 6rem max(2rem, calc((100vw - 1180px) / 2)) 4rem;
  border-bottom: 1px solid var(--new-line);
}

.TuffHomeNew-HeroContent {
  max-width: 34rem;
  animation: new-landing-rise 620ms ease-out both;
}

.TuffHomeNew-Eyebrow,
.TuffHomeNew-SectionHeader p,
.TuffHomeNew-Final p {
  margin: 0;
  color: var(--new-accent-strong);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.TuffHomeNew-Hero h1 {
  display: grid;
  gap: 1rem;
  margin: 1.1rem 0 0;
  font-size: 6.5rem;
  line-height: 0.9;
  letter-spacing: 0;
}

.TuffHomeNew-Hero h1 span {
  font-weight: 800;
}

.TuffHomeNew-Hero h1 small {
  max-width: 26rem;
  font-size: 2.35rem;
  font-weight: 680;
  line-height: 1.06;
  letter-spacing: 0;
}

.TuffHomeNew-HeroCopy {
  margin: 1.5rem 0 0;
  color: var(--new-muted);
  font-size: 1.08rem;
  line-height: 1.78;
}

.TuffHomeNew-HeroActions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 2rem;
}

.TuffHomeNew-Button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.8rem;
  gap: 0.55rem;
  border: 1px solid var(--new-line);
  border-radius: 8px;
  padding: 0 1rem;
  color: var(--new-ink);
  background: var(--new-surface);
  font-size: 0.92rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.TuffHomeNew-Button:hover {
  transform: translateY(-2px);
  border-color: var(--new-accent-border-hover);
  background: var(--new-surface-hover);
}

.TuffHomeNew-Button.is-primary {
  border-color: transparent;
  color: var(--new-primary-ink);
  background: var(--new-accent-strong);
}

.TuffHomeNew-Button.is-primary:hover {
  background: var(--new-accent-hover);
}

.TuffHomeNew-Preview {
  margin: 0;
  animation: new-landing-rise 780ms 120ms ease-out both;
}

.TuffHomeNew-Preview img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 25 / 16;
  object-fit: cover;
  border: 1px solid var(--new-preview-border);
  border-radius: 8px;
  background: var(--new-preview-bg);
  box-shadow: 0 28px 80px var(--new-preview-shadow);
}

.TuffHomeNew-Preview figcaption {
  margin-top: 0.9rem;
  color: var(--new-muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.TuffHomeNew-Section,
.TuffHomeNew-Workflow,
.TuffHomeNew-Final {
  padding: 6rem max(2rem, calc((100vw - 1180px) / 2));
}

.TuffHomeNew-SectionHeader {
  display: grid;
  grid-template-columns: minmax(9rem, 0.32fr) minmax(0, 0.68fr);
  gap: 2rem;
  align-items: start;
  margin-bottom: 3rem;
}

.TuffHomeNew-SectionHeader h2,
.TuffHomeNew-Final h2 {
  margin: 0;
  max-width: 48rem;
  font-size: 2.65rem;
  line-height: 1.08;
  letter-spacing: 0;
}

.TuffHomeNew-ProofGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--new-line);
}

.TuffHomeNew-ProofItem {
  display: grid;
  gap: 1rem;
  min-height: 16rem;
  padding: 2rem 2rem 0 0;
  border-right: 1px solid var(--new-line);
}

.TuffHomeNew-ProofItem:last-child {
  border-right: 0;
}

.TuffHomeNew-ProofItem > span {
  color: var(--new-accent-strong);
  font-size: 1.55rem;
}

.TuffHomeNew-ProofItem h3,
.TuffHomeNew-Workflow h3,
.TuffHomeNew-Principles h3 {
  margin: 0;
  font-size: 1.12rem;
  line-height: 1.28;
  letter-spacing: 0;
}

.TuffHomeNew-ProofItem p,
.TuffHomeNew-Workflow p,
.TuffHomeNew-Principles p {
  margin: 0;
  color: var(--new-muted);
  font-size: 0.98rem;
  line-height: 1.72;
}

.TuffHomeNew-Workflow {
  color: var(--new-workflow-ink);
  background:
    linear-gradient(135deg, var(--new-workflow-bg-start), var(--new-workflow-bg-end));
}

.TuffHomeNew-Workflow .TuffHomeNew-SectionHeader p {
  color: var(--new-workflow-accent);
}

.TuffHomeNew-Workflow .TuffHomeNew-SectionHeader h2 {
  color: var(--new-workflow-title);
}

.TuffHomeNew-Workflow ol {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--new-workflow-line);
}

.TuffHomeNew-Workflow li {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: 2rem;
  padding: 2rem 0;
  border-bottom: 1px solid var(--new-workflow-line);
}

.TuffHomeNew-Workflow li > span {
  color: var(--new-workflow-accent);
  font-size: 0.82rem;
  font-weight: 800;
}

.TuffHomeNew-Workflow p {
  max-width: 46rem;
  margin-top: 0.55rem;
  color: var(--new-workflow-muted);
}

.TuffHomeNew-Principles {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--new-line);
}

.TuffHomeNew-Principles article {
  display: grid;
  grid-template-columns: minmax(14rem, 0.32fr) minmax(0, 0.68fr);
  gap: 2rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--new-line);
}

.TuffHomeNew-Final {
  display: grid;
  gap: 1.5rem;
  justify-items: start;
  border-top: 1px solid var(--new-line);
}

@keyframes new-landing-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 18px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (max-width: 900px) {
  .TuffHomeNew-Hero {
    grid-template-columns: 1fr;
    min-height: auto;
    padding-top: 4.5rem;
  }

  .TuffHomeNew-HeroContent {
    max-width: 42rem;
  }

  .TuffHomeNew-Hero h1 {
    font-size: 4.4rem;
  }

  .TuffHomeNew-Hero h1 small {
    font-size: 1.8rem;
  }

  .TuffHomeNew-SectionHeader,
  .TuffHomeNew-Principles article {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .TuffHomeNew-ProofGrid {
    grid-template-columns: 1fr;
  }

  .TuffHomeNew-ProofItem {
    min-height: 0;
    padding: 1.6rem 0;
    border-right: 0;
    border-bottom: 1px solid var(--new-line);
  }

  .TuffHomeNew-Workflow li {
    grid-template-columns: 3rem minmax(0, 1fr);
    gap: 1rem;
  }
}

@media (max-width: 560px) {
  .TuffHomeNew-Hero,
  .TuffHomeNew-Section,
  .TuffHomeNew-Workflow,
  .TuffHomeNew-Final {
    padding-inline: 1.25rem;
  }

  .TuffHomeNew-Hero {
    padding-top: 6rem;
    padding-bottom: 3rem;
  }

  .TuffHomeNew-Hero h1 {
    font-size: 3.3rem;
  }

  .TuffHomeNew-Hero h1 small,
  .TuffHomeNew-SectionHeader h2,
  .TuffHomeNew-Final h2 {
    font-size: 1.7rem;
  }

  .TuffHomeNew-HeroActions {
    flex-direction: column;
  }

  .TuffHomeNew-Button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .TuffHomeNew-HeroContent,
  .TuffHomeNew-Preview {
    animation: none;
  }

  .TuffHomeNew-Button {
    transition: none;
  }
}
</style>
