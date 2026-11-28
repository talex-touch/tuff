<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="demo-container" style="height: 220px;">
        <div style="height: 100%;">
          <TxScroll native style="height: 100%;">
            <div style="height: 1200px; display: flex; flex-direction: column; gap: 8px;">
              <div v-for="rowIndex in 60" :key="rowIndex" class="demo-scroll-item">
                Native Row {{ rowIndex }}
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
  </div>
  <div v-else>
      <div class="demo-container" style="height: 220px;">
        <div style="height: 100%;">
          <TxScroll native style="height: 100%;">
            <div style="height: 1200px; display: flex; flex-direction: column; gap: 8px;">
              <div v-for="rowIndex in 60" :key="rowIndex" class="demo-scroll-item">
                Native Row {{ rowIndex }}
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
  </div>
</template>
