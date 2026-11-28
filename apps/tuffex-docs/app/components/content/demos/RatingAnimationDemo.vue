<script setup lang="ts">
import { ref } from 'vue'

const animated = ref(2)
const heart = ref(3)
const still = ref(2)
</script>

<template>
  <div class="rating-animation-demo">
    <div class="rating-animation-demo__item">
      <span class="rating-animation-demo__label">Bounce + glow</span>
      <TxRating v-model="animated" :precision="0.5" :size="28" :gap="6" show-text />
    </div>
    <div class="rating-animation-demo__item">
      <span class="rating-animation-demo__label">Heart pop</span>
      <TxRating
        v-model="heart"
        icon="i-carbon-favorite-filled"
        :size="30"
        :gap="7"
        filled-color="#f43f5e"
        empty-color="rgba(244, 63, 94, 0.18)"
        hover-color="#fb7185"
        text-color="#f43f5e"
        show-text
      />
    </div>
    <div class="rating-animation-demo__item">
      <span class="rating-animation-demo__label">Animation off</span>
      <TxRating v-model="still" :animated="false" filled-color="#a78bfa" show-text />
    </div>
  </div>
</template>

<style scoped>
.rating-animation-demo {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.rating-animation-demo__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.rating-animation-demo__label {
  min-width: 112px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
