<script setup lang="ts">
import { computed } from 'vue'

interface ShowcaseSearchResult {
  id: string
  title: string
  description: string
  badge?: string
  confidence: string
  category?: string
}

interface ShowcaseSearchScenario {
  id: string
  label: string
  focus: string
  query: string
  summary: string
  insight: string
  references?: string[]
  results: ShowcaseSearchResult[]
}

const props = withDefaults(defineProps<{
  scenario?: ShowcaseSearchScenario | null
  active?: boolean
}>(), {
  scenario: null,
  active: false,
})

const references = computed(() => props.scenario?.references ?? [])
const hasResults = computed(() => (props.scenario?.results?.length ?? 0) > 0)
</script>

<template>
  <article
    class="showcase-search"
    :class="{ 'is-active': active }"
  >
    <template v-if="scenario">
      <header
        v-if="scenario.query || scenario.focus"
        class="showcase-search__header"
      >
        <span
          v-if="scenario.query"
          class="showcase-search__prompt"
        >
          {{ scenario.query }}
        </span>
        <span
          v-if="scenario.focus"
          class="showcase-search__meta"
        >
          {{ scenario.focus }}
        </span>
      </header>

      <p
        v-if="scenario.summary"
        class="showcase-search__summary"
      >
        {{ scenario.summary }}
      </p>

      <section
        v-if="hasResults"
        class="showcase-search__results"
        aria-label="AI ranked results"
      >
        <article
          v-for="(result, index) in scenario.results"
          :key="result.id"
          class="showcase-search__result"
        >
          <span class="showcase-search__index">
            {{ index + 1 }}.
          </span>
          <div class="showcase-search__body">
            <h3 v-if="result.title">
              {{ result.title }}
            </h3>
            <p v-if="result.description">
              {{ result.description }}
            </p>
          </div>
        </article>
      </section>

      <footer
        v-if="scenario.insight || references.length"
        class="showcase-search__footer"
      >
        <p
          v-if="scenario.insight"
          class="showcase-search__insight"
        >
          {{ scenario.insight }}
        </p>
        <div
          v-if="references.length"
          class="showcase-search__references"
          aria-label="References"
        >
          <span class="showcase-search__references-label">
            References
          </span>
          <div class="showcase-search__chips">
            <span
              v-for="item in references"
              :key="item"
              class="showcase-search__chip"
            >
              {{ item }}
            </span>
          </div>
        </div>
      </footer>
    </template>

    <template v-else>
      <div class="showcase-search__placeholder">
        <span class="showcase-search__placeholder-title">
          Showcase slot
        </span>
        <p>
          Bring your own scenario data to populate this space.
        </p>
      </div>
    </template>
  </article>
</template>

<style scoped>
.showcase-search {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  padding: clamp(1.4rem, 1.6vw + 1.2rem, 2.2rem);
  border-radius: 28px;
  background: radial-gradient(circle at top left, rgba(70, 25, 64, 0.45), rgba(18, 22, 34, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
  color: rgba(242, 245, 255, 0.96);
  transition: transform 320ms ease, box-shadow 320ms ease, border-color 320ms ease;
  transform: translate3d(0, 12px, 0) scale(0.985);
  opacity: 0.85;
}

.showcase-search.is-active {
  transform: translate3d(0, 0, 0) scale(1);
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 28px 80px rgba(12, 10, 30, 0.55);
}

.showcase-search__header {
  display: grid;
  gap: 0.5rem;
}

.showcase-search__prompt {
  display: block;
  font-size: clamp(1.05rem, 0.7vw + 0.95rem, 1.35rem);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.01em;
  color: rgba(246, 247, 255, 0.98);
}

.showcase-search__meta {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(208, 210, 240, 0.6);
}

.showcase-search__summary {
  margin: 0;
  font-size: clamp(0.85rem, 0.25vw + 0.8rem, 0.98rem);
  color: rgba(212, 215, 238, 0.8);
  line-height: 1.6;
}

.showcase-search__results {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.showcase-search__result {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  padding: 1rem 1.1rem;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(150deg, rgba(20, 18, 32, 0.72), rgba(40, 22, 44, 0.46));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.showcase-search__index {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(217, 188, 245, 0.9);
}

.showcase-search__body {
  display: grid;
  gap: 0.35rem;
}

.showcase-search__body h3 {
  margin: 0;
  font-size: clamp(0.9rem, 0.35vw + 0.82rem, 1.05rem);
  font-weight: 600;
  color: rgba(246, 247, 255, 0.96);
}

.showcase-search__body p {
  margin: 0;
  font-size: clamp(0.82rem, 0.2vw + 0.78rem, 0.94rem);
  color: rgba(210, 205, 230, 0.78);
  line-height: 1.6;
}

.showcase-search__footer {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.showcase-search__insight {
  margin: 0;
  font-size: clamp(0.8rem, 0.25vw + 0.76rem, 0.92rem);
  color: rgba(208, 210, 228, 0.68);
  line-height: 1.6;
}

.showcase-search__references {
  display: grid;
  gap: 0.45rem;
}

.showcase-search__references-label {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(180, 182, 210, 0.55);
}

.showcase-search__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.showcase-search__chip {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(226, 228, 244, 0.86);
}

.showcase-search__chip:hover {
  border-color: rgba(255, 255, 255, 0.22);
}

.showcase-search__placeholder {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  color: rgba(210, 212, 230, 0.72);
}

.showcase-search__placeholder-title {
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(200, 204, 228, 0.6);
}

.showcase-search__placeholder p {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(222, 224, 244, 0.76);
  line-height: 1.6;
}

@media (max-width: 640px) {
  .showcase-search {
    padding: 1.3rem;
    border-radius: 22px;
  }

  .showcase-search__result {
    grid-template-columns: 1fr;
  }

  .showcase-search__index {
    display: none;
  }
}
</style>
