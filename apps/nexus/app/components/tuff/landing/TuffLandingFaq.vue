<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TuffLandingSection from './TuffLandingSection.vue'

// Questions people actually ask before installing, answered the way the app
// behaves today (platforms from the README, update channels from Settings →
// About, sync and telemetry defaults from the privacy and sentry modules,
// pricing from docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md).

const FAQ_KEYS = ['platforms', 'access', 'privacy', 'build', 'migration', 'pricing'] as const
const GITHUB_ISSUES = 'https://github.com/talex-touch/tuff/issues'

const { t } = useI18n()

const faq = computed(() => ({
  eyebrow: t('landing.os.faq.eyebrow'),
  kicker: t('landing.os.faq.kicker'),
  headline: t('landing.os.faq.headline'),
  asideTitle: t('landing.os.faq.aside.title'),
  asideDocs: t('landing.os.faq.aside.docs'),
  asideGithub: t('landing.os.faq.aside.github'),
  items: FAQ_KEYS.map((key, index) => ({
    id: key,
    index: `${index + 1}`.padStart(2, '0'),
    question: t(`landing.os.faq.items.${key}.question`),
    answer: t(`landing.os.faq.items.${key}.answer`),
  })),
}))

/** One answer open at a time; the first is open so the list never reads as empty. */
const openIndex = ref(0)

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? -1 : index
}

// ── Pointer light on the rows ──────────────────────────────────────────────
const listRef = ref<HTMLElement | null>(null)
let frame = 0
let lastPointer: { x: number, y: number } | null = null

function applyPointer() {
  frame = 0
  if (!lastPointer || !listRef.value)
    return
  for (const row of listRef.value.querySelectorAll<HTMLElement>('[data-row]')) {
    const r = row.getBoundingClientRect()
    row.style.setProperty('--px', `${lastPointer.x - r.left}px`)
    row.style.setProperty('--py', `${lastPointer.y - r.top}px`)
  }
}

function onPointerMove(event: PointerEvent) {
  lastPointer = { x: event.clientX, y: event.clientY }
  if (!frame)
    frame = requestAnimationFrame(applyPointer)
}

function onPointerLeave() {
  lastPointer = null
  for (const row of listRef.value?.querySelectorAll<HTMLElement>('[data-row]') ?? []) {
    row.style.removeProperty('--px')
    row.style.removeProperty('--py')
  }
}

// ── Entrance ───────────────────────────────────────────────────────────────
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
  }, { threshold: 0.2 })
  observer.observe(root)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame)
    cancelAnimationFrame(frame)
})
</script>

<template>
  <TuffLandingSection
    :sticky="faq.eyebrow"
    section-class="relative h-full w-full flex flex-col justify-center"
    container-class="w-full h-full flex flex-col items-center"
  >
    <div ref="rootRef" class="Faq" :class="{ 'is-entered': entered }">
      <header class="Faq-Head">
        <p class="Faq-Kicker">
          <span class="Faq-KickerRule" aria-hidden="true" />
          {{ faq.kicker }}
        </p>
        <h2 class="Faq-Title">
          {{ faq.headline }}
        </h2>
        <div class="Faq-Aside">
          <p>{{ faq.asideTitle }}</p>
          <NuxtLink class="Faq-AsideLink" to="/docs">
            {{ faq.asideDocs }}
            <span class="i-carbon-arrow-right" aria-hidden="true" />
          </NuxtLink>
          <a class="Faq-AsideLink" :href="GITHUB_ISSUES" target="_blank" rel="noopener">
            {{ faq.asideGithub }}
            <span class="i-carbon-arrow-up-right" aria-hidden="true" />
          </a>
        </div>
      </header>

      <ol
        ref="listRef"
        class="Faq-List"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      >
        <li
          v-for="(item, index) in faq.items"
          :key="item.id"
          class="Faq-Item"
          :class="{ 'is-open': openIndex === index }"
          :style="{ '--i': index }"
          data-row
        >
          <button
            :id="`faq-q-${item.id}`"
            type="button"
            class="Faq-Question"
            :aria-expanded="openIndex === index"
            :aria-controls="`faq-a-${item.id}`"
            @click="toggle(index)"
          >
            <span class="Faq-Index">{{ item.index }}</span>
            <span class="Faq-QText">{{ item.question }}</span>
            <span class="Faq-Sign" aria-hidden="true" />
          </button>
          <div
            :id="`faq-a-${item.id}`"
            class="Faq-Answer"
            role="region"
            :aria-labelledby="`faq-q-${item.id}`"
          >
            <div class="Faq-AnswerInner">
              <p>{{ item.answer }}</p>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.Faq {
  --faq-line: rgba(246, 247, 244, 0.09);
  --faq-line-strong: rgba(246, 247, 244, 0.18);
  --faq-ink: #f6f7f4;
  --faq-muted: rgba(246, 247, 244, 0.6);
  --faq-faint: rgba(246, 247, 244, 0.36);
  --faq-accent: #409eff;
  --faq-ease: cubic-bezier(0.23, 1, 0.32, 1);

  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  align-items: center;
  gap: clamp(2rem, 5vw, 5rem);
  width: min(1180px, 100%);
  height: 100%;
  margin-inline: auto;
  padding: clamp(0.5rem, 2vh, 1.5rem) 1.5rem 5.6rem;
  box-sizing: border-box;
  color: var(--faq-ink);
  text-align: left;
}

/* ── Head ─────────────────────────────────────────────────────────────── */
.Faq-Head {
  opacity: 0;
  transform: translate3d(0, 14px, 0);
  filter: blur(6px);
  transition:
    opacity 760ms var(--faq-ease),
    transform 760ms var(--faq-ease),
    filter 760ms var(--faq-ease);
}

.is-entered .Faq-Head {
  opacity: 1;
  transform: none;
  filter: none;
}

.Faq-Kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.9rem;
  color: var(--faq-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.74rem;
  letter-spacing: 0.22em;
}

.Faq-KickerRule {
  width: 1.6rem;
  height: 1px;
  background: var(--faq-line-strong);
}

.Faq-Title {
  margin: 0;
  font-size: clamp(2rem, 3.6vw, 3.1rem);
  font-weight: 760;
  line-height: 1.1;
  letter-spacing: -0.01em;
  word-break: keep-all;
}

.Faq-Aside {
  display: grid;
  justify-items: start;
  gap: 0.45rem;
  margin-top: clamp(1.4rem, 3vh, 2.2rem);
}

.Faq-Aside p {
  margin: 0 0 0.2rem;
  color: var(--faq-faint);
  font-size: 0.85rem;
}

.Faq-AsideLink {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--faq-muted);
  font-size: 0.92rem;
  font-weight: 560;
  text-decoration: none;
  transition: color 180ms ease, gap 240ms var(--faq-ease);
}

.Faq-AsideLink:hover {
  gap: 0.55rem;
  color: var(--faq-ink);
}

/* ── List ─────────────────────────────────────────────────────────────── */
.Faq-List {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Each row lights where the pointer is, like the bento tiles, and enters on a
   stagger when the section first comes into view. */
.Faq-Item {
  position: relative;
  border-radius: 14px;
  background:
    radial-gradient(260px circle at var(--px, -400px) var(--py, -400px), rgba(246, 247, 244, 0.055), transparent 70%),
    rgba(246, 247, 244, 0.02);
  box-shadow: inset 0 0 0 1px var(--faq-line);
  overflow: hidden;
  opacity: 0;
  transform: translate3d(0, 16px, 0);
  filter: blur(4px);
  transition:
    opacity 640ms var(--faq-ease),
    transform 640ms var(--faq-ease),
    filter 640ms var(--faq-ease),
    background-color 240ms ease,
    box-shadow 240ms ease;
  transition-delay: calc(120ms + var(--i, 0) * 60ms), calc(120ms + var(--i, 0) * 60ms), calc(120ms + var(--i, 0) * 60ms), 0ms, 0ms;
}

.is-entered .Faq-Item {
  opacity: 1;
  transform: none;
  filter: none;
}

/* CoreBox's selection mark: a bar at half the row's height, grown in. */
.Faq-Item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 1.05rem;
  width: 3px;
  height: 1.3rem;
  border-radius: 999px;
  background: var(--faq-accent);
  box-shadow: 0 0 6px rgba(64, 158, 255, 0.6);
  transform: scaleY(0);
  transition: transform 320ms var(--faq-ease);
}

.Faq-Item.is-open {
  box-shadow: inset 0 0 0 1px var(--faq-line-strong);
}

.Faq-Item.is-open::before {
  transform: scaleY(1);
}

.Faq-Question {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  min-height: 3.4rem;
  padding: 0.8rem 1.1rem;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.Faq-Question:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(64, 158, 255, 0.7);
}

.Faq-Index {
  color: var(--faq-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  transition: color 240ms ease;
}

.is-open .Faq-Index {
  color: var(--faq-accent);
}

.Faq-QText {
  flex: 1;
  font-size: 1rem;
  font-weight: 620;
}

/* A plus drawn from two bars, so it can turn into a cross. */
.Faq-Sign {
  position: relative;
  flex-shrink: 0;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 999px;
  background: rgba(246, 247, 244, 0.06);
  transition: transform 360ms var(--faq-ease), background-color 240ms ease;
}

.Faq-Sign::before,
.Faq-Sign::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.7rem;
  height: 2px;
  border-radius: 2px;
  background: var(--faq-ink);
  transform: translate(-50%, -50%);
}

.Faq-Sign::after {
  transform: translate(-50%, -50%) rotate(90deg);
}

.is-open .Faq-Sign {
  transform: rotate(45deg);
  background: rgba(64, 158, 255, 0.16);
}

/* Height follows the content: 0fr → 1fr. */
.Faq-Answer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 420ms var(--faq-ease);
}

.is-open .Faq-Answer {
  grid-template-rows: 1fr;
}

.Faq-AnswerInner {
  min-height: 0;
  overflow: hidden;
}

.Faq-AnswerInner p {
  margin: 0;
  padding: 0 1.1rem 1rem 3.45rem;
  color: var(--faq-muted);
  font-size: 0.9rem;
  line-height: 1.65;
  opacity: 0;
  transform: translate3d(0, -6px, 0);
  transition: opacity 280ms ease, transform 420ms var(--faq-ease);
}

.is-open .Faq-AnswerInner p {
  opacity: 1;
  transform: none;
  transition-delay: 80ms;
}

/* Short desktop windows: tighter rows so six questions and one answer fit. */
@media (min-width: 769px) and (max-height: 820px) {
  .Faq-Question {
    min-height: 2.9rem;
    padding-block: 0.55rem;
  }

  .Faq-Item::before {
    top: 0.8rem;
  }

  .Faq-AnswerInner p {
    padding-bottom: 0.75rem;
    font-size: 0.85rem;
  }
}

@media (max-width: 900px) {
  .Faq {
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: 1.6rem;
  }

  .Faq-Aside {
    margin-top: 1rem;
  }
}

@media (max-width: 768px) {
  .Faq {
    height: auto;
    padding: 1rem 1.15rem 6rem;
  }

  .Faq-AnswerInner p {
    padding-left: 1.1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .Faq-Head,
  .Faq-Item {
    opacity: 1;
    transform: none;
    filter: none;
    transition: none;
  }

  .Faq-Answer,
  .Faq-AnswerInner p,
  .Faq-Sign,
  .Faq-Item::before {
    transition: none;
  }
}
</style>
