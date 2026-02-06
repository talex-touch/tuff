<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="demo-container" style="height: 220px;">
        <div style="height: 100%;">
          <TxScroll :bounce="true" :scrollbar-always-visible="true" style="height: 100%;">
            <div style="height: 160px; display: flex; flex-direction: column; gap: 8px;">
              <div class="demo-scroll-item">
                Short content
              </div>
              <div class="demo-scroll-item">
                No boundary but scrollbar should be visible
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
  </div>
  <div v-else>
      <div class="demo-container" style="height: 220px;">
        <div style="height: 100%;">
          <TxScroll :bounce="true" :scrollbar-always-visible="true" style="height: 100%;">
            <div style="height: 160px; display: flex; flex-direction: column; gap: 8px;">
              <div class="demo-scroll-item">
                Short content
              </div>
              <div class="demo-scroll-item">
                No boundary but scrollbar should be visible
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
  </div>
</template>
