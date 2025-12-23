<template>
  <div class="demo-container" style="height: 220px;">
    <div style="height: 100%;">
      <TouchScroll style="height: 100%;">
        <div style="height: 1200px; display: flex; flex-direction: column; gap: 8px;">
          <div v-for="i in 60" :key="i" class="demo-scroll-item">
            Row {{ i }}
          </div>
        </div>
      </TouchScroll>
    </div>
  </div>
</template>
