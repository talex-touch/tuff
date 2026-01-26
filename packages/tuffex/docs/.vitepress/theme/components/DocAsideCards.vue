<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')

function handleAsk() {
  const text = query.value.trim()
  if (!text || typeof window === 'undefined')
    return
  const url = `https://github.com/talex-touch/touchx-ui/discussions/new?category=Q%26A&title=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener')
}
</script>

<template>
  <section class="tx-doc-aside">
    <div class="tx-doc-aside__card">
      <div class="tx-doc-aside__title">
        <span class="tx-doc-aside__sparkle">✦</span>
        Zen Assistant
      </div>
      <p class="tx-doc-aside__desc">
        Instant answers for implementation.
      </p>
      <form class="tx-doc-aside__field" @submit.prevent="handleAsk">
        <input
          v-model="query"
          type="text"
          placeholder="Ask docs..."
          class="tx-doc-aside__input"
        >
        <button type="submit" class="tx-doc-aside__send" aria-label="Ask AI">
          <span class="i-carbon-arrow-right" />
        </button>
      </form>
    </div>

    <div class="tx-doc-aside__card">
      <div class="tx-doc-aside__title">
        Community
      </div>
      <ul class="tx-doc-aside__list">
        <li>
          <a class="tx-doc-aside__link" href="https://github.com/talex-touch/touchx-ui/issues/new/choose" target="_blank" rel="noreferrer">
            Report Bug
          </a>
        </li>
        <li>
          <a class="tx-doc-aside__link" href="https://github.com/talex-touch/touchx-ui/discussions" target="_blank" rel="noreferrer">
            Ask Question
          </a>
        </li>
        <li>
          <a class="tx-doc-aside__link" href="https://github.com/talex-touch/touchx-ui" target="_blank" rel="noreferrer">
            View Repository
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>
