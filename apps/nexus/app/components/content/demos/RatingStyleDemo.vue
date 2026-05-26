<script setup lang="ts">
import { ref } from 'vue'

const warmScore = ref(4)
const greenScore = ref(3.5)
const violetScore = ref(2.5)
</script>

<template>
  <div class="rating-style-demo">
    <div class="rating-style-demo__item">
      <span class="rating-style-demo__label">Orange / large</span>
      <TxRating
        v-model="warmScore"
        :size="30"
        :gap="8"
        :precision="0.5"
        filled-color="#f97316"
        empty-color="rgba(249, 115, 22, 0.2)"
        hover-color="#fb923c"
        text-color="#f97316"
        show-text
      />
    </div>
    <div class="rating-style-demo__item">
      <span class="rating-style-demo__label">Green / readonly</span>
      <TxRating
        v-model="greenScore"
        :size="22"
        :gap="5"
        :precision="0.5"
        readonly
        show-text
        filled-color="#22c55e"
        empty-color="rgba(34, 197, 94, 0.18)"
        text-color="#22c55e"
      >
        <template #text="{ value, max }">
          {{ value }} / {{ max }} readonly
        </template>
      </TxRating>
    </div>
    <div class="rating-style-demo__item">
      <span class="rating-style-demo__label">Violet / compact</span>
      <TxRating
        v-model="violetScore"
        :precision="0.5"
        :size="18"
        filled-color="#a78bfa"
        empty-color="rgba(167, 139, 250, 0.2)"
        hover-color="#c4b5fd"
        text-color="#a78bfa"
        show-text
      />
    </div>
  </div>
</template>

<style scoped>
.rating-style-demo {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.rating-style-demo__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.rating-style-demo__label {
  min-width: 132px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
