<script setup lang="ts">
import { ref } from 'vue'

const diamond = ref(3)
const hearts = ref(4.5)
const faces = ref(2.5)
</script>

<template>
  <div class="rating-icon-demo">
    <div class="rating-icon-demo__item">
      <span class="rating-icon-demo__label">Emoji diamond</span>
      <TxRating
        v-model="diamond"
        icon="💎"
        :size="26"
        filled-color="#38bdf8"
        empty-color="rgba(56, 189, 248, 0.2)"
        hover-color="#7dd3fc"
        text-color="#38bdf8"
        show-text
      />
    </div>
    <div class="rating-icon-demo__item">
      <span class="rating-icon-demo__label">Heart icon</span>
      <TxRating
        v-model="hearts"
        :precision="0.5"
        :size="28"
        icon="i-carbon-favorite-filled"
        filled-color="#f43f5e"
        empty-color="rgba(244, 63, 94, 0.18)"
        hover-color="#fb7185"
        text-color="#f43f5e"
        show-text
      />
    </div>
    <div class="rating-icon-demo__item">
      <span class="rating-icon-demo__label">Separate states</span>
      <TxRating
        v-model="faces"
        :precision="0.5"
        :size="26"
        filled-icon="😍"
        empty-icon="😶"
        filled-color="#f59e0b"
        empty-color="rgba(148, 163, 184, 0.5)"
        hover-color="#fbbf24"
        text-color="#f59e0b"
        show-text
      />
    </div>
  </div>
</template>

<style scoped>
.rating-icon-demo {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.rating-icon-demo__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.rating-icon-demo__label {
  min-width: 124px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
