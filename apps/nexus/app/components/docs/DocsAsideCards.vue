<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')

function handleAsk() {
  const text = query.value.trim()
  if (!text || typeof window === 'undefined')
    return
  const url = `https://github.com/talex-touch/tuff/discussions/new?category=Q%26A&title=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener')
}
</script>

<template>
  <section class="docs-aside-cards">
    <div class="docs-aside-card">
      <div class="docs-aside-card__title">
        <span class="docs-aside-card__sparkle">✦</span>
        Tuff Intelligence
      </div>
      <p class="docs-aside-card__desc">
        Instant answers for implementation.
      </p>
      <form class="docs-aside-card__field" @submit.prevent="handleAsk">
        <input
          v-model="query"
          type="text"
          placeholder="Ask Tuff..."
          class="docs-aside-card__input"
        >
        <button type="submit" class="docs-aside-card__send" aria-label="Ask Tuff Intelligence">
          <span class="i-carbon-arrow-right" />
        </button>
      </form>
    </div>

    <div class="docs-aside-card">
      <div class="docs-aside-card__title">
        Help
      </div>
      <ul class="docs-aside-card__list">
        <li>
          <a class="docs-aside-card__link" href="https://github.com/talex-touch/tuff/issues/new/choose" target="_blank" rel="noreferrer">
            Report Bug
          </a>
        </li>
        <li>
          <a class="docs-aside-card__link" href="https://github.com/talex-touch/tuff/discussions" target="_blank" rel="noreferrer">
            Ask Question
          </a>
        </li>
        <li>
          <a class="docs-aside-card__link" href="https://github.com/talex-touch/tuff" target="_blank" rel="noreferrer">
            View Repository
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.docs-aside-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.docs-aside-card {
  border-radius: 0;
  border: 0;
  background: transparent;
  padding: 2px 0;
  box-shadow: none;
}

.docs-aside-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.85);
}

.docs-aside-card__sparkle {
  color: #3b82f6;
  font-size: 14px;
}

.docs-aside-card__desc {
  margin: 8px 0 12px;
  font-size: 13px;
  color: rgba(71, 85, 105, 0.9);
}

.docs-aside-card__field {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
}

.docs-aside-card__input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  padding: 8px 10px;
  font-size: 12px;
  background: white;
  color: rgba(15, 23, 42, 0.85);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.docs-aside-card__input:focus {
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.docs-aside-card__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(14, 165, 233, 0.22));
  color: rgba(30, 64, 175, 0.95);
  cursor: pointer;
  transition: all 0.2s ease;
}

.docs-aside-card__send:hover {
  border-color: rgba(37, 99, 235, 0.7);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.2);
}

.docs-aside-card__list {
  list-style: none;
  padding: 8px 0 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.docs-aside-card__link {
  font-size: 13px;
  color: rgba(71, 85, 105, 0.9);
  text-decoration: none;
}

.docs-aside-card__link:hover {
  color: rgba(15, 23, 42, 0.95);
}

:global(.dark .docs-aside-card__title),
:global([data-theme='dark'] .docs-aside-card__title) {
  color: rgba(248, 250, 252, 0.9);
}

:global(.dark .docs-aside-card__desc),
:global([data-theme='dark'] .docs-aside-card__desc),
:global(.dark .docs-aside-card__link),
:global([data-theme='dark'] .docs-aside-card__link) {
  color: rgba(226, 232, 240, 0.75);
}

:global(.dark .docs-aside-card__input),
:global([data-theme='dark'] .docs-aside-card__input) {
  background: rgba(15, 23, 42, 0.6);
  color: rgba(248, 250, 252, 0.9);
  border-color: rgba(148, 163, 184, 0.35);
}
</style>
