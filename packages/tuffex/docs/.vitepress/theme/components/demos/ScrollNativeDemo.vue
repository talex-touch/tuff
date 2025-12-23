<template>
  <div class="demo-container" style="height: 220px;">
    <div style="height: 100%;">
      <TxScroll native style="height: 100%;">
        <div style="height: 1200px; display: flex; flex-direction: column; gap: 8px;">
          <div v-for="i in 60" :key="i" class="demo-scroll-item">
            Native Row {{ i }}
          </div>
        </div>
      </TxScroll>
    </div>
  </div>
</template>
