<template>
  <div class="demo-container" style="height: 140px;">
    <div style="height: 100%;">
      <TxScroll direction="horizontal" style="height: 100%;">
        <div style="width: 920px; height: 100%; display: flex; align-items: center; gap: 12px;">
          <div v-for="i in 24" :key="i" class="demo-scroll-item" style="min-width: 120px;">
            Col {{ i }}
          </div>
        </div>
      </TxScroll>
    </div>
  </div>
</template>
