<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
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
                  <div v-for="itemIndex in 18" :key="itemIndex" class="demo-scroll-item">
                    Item {{ itemIndex }}
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
                  <div v-for="itemIndex in 18" :key="itemIndex" class="demo-scroll-item">
                    Item {{ itemIndex }}
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
  </div>
  <div v-else>
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
                  <div v-for="itemIndex in 18" :key="itemIndex" class="demo-scroll-item">
                    Item {{ itemIndex }}
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
                  <div v-for="itemIndex in 18" :key="itemIndex" class="demo-scroll-item">
                    Item {{ itemIndex }}
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
  </div>
</template>
