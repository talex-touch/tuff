<template>
  <div class="demo-container" style="height: 320px;">
    <div style="height: 100%; overflow: auto; padding: 12px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12);">
      <div style="height: 720px; display: flex; flex-direction: column; gap: 12px;">
        <div class="demo-scroll-item">
          Outer scroll area (top)
        </div>

        <div style="height: 160px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden;">
          <TxScroll style="height: 100%;" :bounce="true">
            <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
              <div class="demo-scroll-item">
                Inner (default): scrollChaining = false
              </div>
              <div v-for="i in 18" :key="i" class="demo-scroll-item">
                Item {{ i }}
              </div>
            </div>
          </TxScroll>
        </div>

        <div class="demo-scroll-item">
          Outer content (middle)
        </div>

        <div style="height: 160px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden;">
          <TxScroll style="height: 100%;" :bounce="true" :scroll-chaining="true">
            <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
              <div class="demo-scroll-item">
                Inner (opt-in): scrollChaining = true
              </div>
              <div v-for="i in 18" :key="i" class="demo-scroll-item">
                Item {{ i }}
              </div>
            </div>
          </TxScroll>
        </div>

        <div class="demo-scroll-item">
          Outer scroll area (bottom)
        </div>
      </div>
    </div>
  </div>
</template>
