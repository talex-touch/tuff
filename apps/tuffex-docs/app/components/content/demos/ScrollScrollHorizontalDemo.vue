<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="demo-container" style="height: 140px;">
        <div style="height: 100%;">
          <TxScroll direction="horizontal" style="height: 100%;">
            <div style="width: 920px; height: 100%; display: flex; align-items: center; gap: 12px;">
              <div v-for="colIndex in 24" :key="colIndex" class="demo-scroll-item" style="min-width: 120px;">
                Col {{ colIndex }}
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
  </div>
  <div v-else>
      <div class="demo-container" style="height: 140px;">
        <div style="height: 100%;">
          <TxScroll direction="horizontal" style="height: 100%;">
            <div style="width: 920px; height: 100%; display: flex; align-items: center; gap: 12px;">
              <div v-for="colIndex in 24" :key="colIndex" class="demo-scroll-item" style="min-width: 120px;">
                Col {{ colIndex }}
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
  </div>
</template>
