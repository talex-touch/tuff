<script setup lang="ts">
import type { HairlineFigureName } from './TuffLandingHairline.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TuffLandingHairline from './TuffLandingHairline.vue'
import TuffLandingSection from './TuffLandingSection.vue'

// What Tuff does today, out of the box. Every card is a bundled capability
// with the word that actually summons it (plugins/*/manifest.json); nothing
// here needs an extra install, and nothing here is a Beta surface.

type FeatureKey = 'launch' | 'files' | 'clipboard' | 'translate' | 'quickops' | 'snippets'

const { t } = useI18n()

const FEATURES: { key: FeatureKey, figure: HairlineFigureName }[] = [
  { key: 'launch', figure: 'keyboard' },
  { key: 'files', figure: 'drawer' },
  { key: 'clipboard', figure: 'riffle' },
  { key: 'translate', figure: 'dish' },
  { key: 'quickops', figure: 'phosphor' },
  { key: 'snippets', figure: 'cabinet' },
]

const header = computed(() => ({
  eyebrow: t('landing.os.showcase.eyebrow'),
  headlineLead: t('landing.os.showcase.headlineLead'),
  headlineAccent: t('landing.os.showcase.headlineAccent'),
  subheadline: t('landing.os.showcase.subheadline'),
}))

const cards = computed(() => FEATURES.map((feature, index) => ({
  ...feature,
  index: `${index + 1}`.padStart(2, '0'),
  title: t(`landing.os.showcase.items.${feature.key}.title`),
  copy: t(`landing.os.showcase.items.${feature.key}.copy`),
  summon: t(`landing.os.showcase.items.${feature.key}.summon`),
  label: t(`landing.os.showcase.items.${feature.key}.label`),
})))

const rootRef = ref<HTMLElement | null>(null)
const entered = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  const root = rootRef.value
  if (!root || typeof IntersectionObserver === 'undefined') {
    entered.value = true
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    entered.value = true
    observer?.disconnect()
    observer = null
  }, { threshold: 0.18 })
  observer.observe(root)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <TuffLandingSection
    :sticky="header.eyebrow"
    section-class="relative h-full w-full flex flex-col justify-center"
    container-class="w-full h-full flex flex-col items-center"
  >
    <div ref="rootRef" class="Showcase" :class="{ 'is-entered': entered }">
      <header class="Showcase-Head">
        <h2 class="Showcase-Title">
          <span>{{ header.headlineLead }}</span>
          <span class="Showcase-TitleAccent">{{ header.headlineAccent }}</span>
        </h2>
        <p class="Showcase-Sub">
          {{ header.subheadline }}
        </p>
      </header>

      <ul class="Showcase-Grid">
        <li v-for="card in cards" :key="card.key" class="Showcase-Card">
          <div class="Showcase-Figure">
            <TuffLandingHairline
              class="Showcase-Hairline"
              :figure="card.figure"
              :intensity="0.55"
              :label="card.label"
            />
          </div>
          <div class="Showcase-Body">
            <div class="Showcase-CardHead">
              <span class="Showcase-Index">{{ card.index }}</span>
              <h3>{{ card.title }}</h3>
              <kbd class="Showcase-Summon">{{ card.summon }}</kbd>
            </div>
            <p class="Showcase-Copy">
              {{ card.copy }}
            </p>
          </div>
        </li>
      </ul>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.Showcase {
  --show-line: rgba(246, 247, 244, 0.09);
  --show-line-strong: rgba(246, 247, 244, 0.18);
  --show-ink: #f6f7f4;
  --show-muted: rgba(246, 247, 244, 0.56);
  --show-faint: rgba(246, 247, 244, 0.36);
  --show-plate: #07080a;

  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(1rem, 2.6vh, 1.8rem);
  width: min(1180px, 100%);
  height: 100%;
  margin-inline: auto;
  /* The section shell already clears the nav; the bottom keeps the fixed
     eyebrow pill off the last row. */
  padding: clamp(0.5rem, 2vh, 1.5rem) 1.5rem 5.6rem;
  box-sizing: border-box;
  color: var(--show-ink);
}

.Showcase-Head {
  text-align: center;
}

/* Inline runs, not flex: CJK punctuation already carries its own space, and
   the English lead keeps a trailing one in the message. */
.Showcase-Title {
  margin: 0;
  font-size: clamp(1.9rem, 3.4vw, 3rem);
  font-weight: 760;
  line-height: 1.08;
  letter-spacing: -0.01em;
  word-break: keep-all;
}

.Showcase-TitleAccent {
  color: var(--show-muted);
}

.Showcase-Sub {
  margin: 0.7rem 0 0;
  color: var(--show-muted);
  font-size: 0.95rem;
}

.Showcase-Grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 0.9rem;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.Showcase-Card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--show-line);
  border-radius: 16px;
  background: rgba(246, 247, 244, 0.015);
  overflow: hidden;
  opacity: 0;
  transform: translate3d(0, 12px, 0);
  transition:
    opacity 640ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 640ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 200ms ease;
}

.Showcase-Card:nth-child(2) { transition-delay: 60ms, 60ms, 0ms; }
.Showcase-Card:nth-child(3) { transition-delay: 120ms, 120ms, 0ms; }
.Showcase-Card:nth-child(4) { transition-delay: 180ms, 180ms, 0ms; }
.Showcase-Card:nth-child(5) { transition-delay: 240ms, 240ms, 0ms; }
.Showcase-Card:nth-child(6) { transition-delay: 300ms, 300ms, 0ms; }

.is-entered .Showcase-Card {
  opacity: 1;
  transform: none;
}

.Showcase-Card:hover {
  border-color: var(--show-line-strong);
}

/* The figure keeps its 5:4 ratio; size it by whichever side runs out. */
.Showcase-Figure {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  container-type: size;
  border-bottom: 1px solid var(--show-line);
  background:
    radial-gradient(circle at 1px 1px, rgba(246, 247, 244, 0.06) 1px, transparent 0) 0 0 / 16px 16px,
    var(--show-plate);

  --hairline-plate: var(--show-plate);
  --hairline-hi: #f6f7f4;
  --hairline-edge: #a5a8b2;
  --hairline-mid: #4f525b;
  --hairline-lo: #24262c;
}

.Showcase-Hairline {
  width: min(100cqw, 125cqh);
}

.Showcase-Body {
  display: grid;
  gap: 0.35rem;
  padding: 0.8rem 0.95rem 0.9rem;
}

.Showcase-CardHead {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.Showcase-CardHead h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
  white-space: nowrap;
}

.Showcase-Index {
  color: var(--show-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
}

.Showcase-Summon {
  margin-left: auto;
  border: 1px solid var(--show-line-strong);
  border-radius: 6px;
  background: rgba(246, 247, 244, 0.04);
  padding: 0.12rem 0.45rem;
  color: var(--show-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  white-space: nowrap;
}

/* Two lines reserved, so every figure in a row gets the same height. */
.Showcase-Copy {
  min-height: 3.1em;
  margin: 0;
  text-wrap: pretty;
  color: var(--show-muted);
  font-size: 0.8rem;
  line-height: 1.55;
}

/* Short desktop windows (1366×768, 1280×720): figures beside the copy, so
   each one gets the card's full height instead of what the text leaves. */
@media (min-width: 769px) and (max-height: 820px) {
  .Showcase-Sub {
    display: none;
  }

  .Showcase-Card {
    flex-direction: row;
  }

  .Showcase-Figure {
    flex: 0 0 42%;
    border-right: 1px solid var(--show-line);
    border-bottom: 0;
  }

  .Showcase-Body {
    align-content: center;
  }
}

@media (max-width: 1024px) {
  .Showcase-Grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .Showcase {
    height: auto;
    padding: 1rem 1.15rem 6rem;
  }

  .Showcase-Grid {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: auto;
  }

  .Showcase-Figure {
    flex: none;
    container-type: inline-size;
  }

  .Showcase-Hairline {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .Showcase-Card {
    opacity: 1;
    transform: none;
    transition: border-color 200ms ease;
  }
}
</style>
