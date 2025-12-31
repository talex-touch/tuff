<script setup lang="ts">
import { ref } from 'vue'

const active = ref(false)
</script>

<template>
  <div
    style="
      width: 560px;
      border-radius: 16px;
      padding: 18px;
      background:
        radial-gradient(120% 120% at 10% 20%, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 92%, transparent), color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 82%, transparent));
      border: 1px solid var(--vp-c-divider);
      display: grid;
      gap: 12px;
    "
  >
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton size="small" @click="active = !active">Toggle</TxButton>
      <div style="font-size: 12px; color: var(--tx-text-color-secondary);">Card + Floating Action</div>
    </div>

    <div style="display: grid; place-items: center; padding: 18px;">
      <TxFusion v-model="active" trigger="hover" :gap="92" :duration="260" :blur="19" :alpha="29" :alpha-offset="-10">
        <template #a>
          <div
            style="
              width: 320px;
              height: 108px;
              border-radius: 18px;
              background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 22%, transparent);
              border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
              backdrop-filter: blur(18px) saturate(160%);
              -webkit-backdrop-filter: blur(18px) saturate(160%);
              box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
              padding: 14px 16px;
              display: grid;
              gap: 6px;
              align-content: center;
              user-select: none;
            "
          >
            <div style="font-size: 13px; font-weight: 700; color: var(--tx-text-color-primary, #303133);">Quick Note</div>
            <div style="font-size: 12px; color: var(--tx-text-color-secondary);">Hover to merge with the action button</div>
          </div>
        </template>

        <template #b>
          <div
            style="
              width: 56px;
              height: 56px;
              border-radius: 999px;
              background: color-mix(in srgb, var(--tx-color-primary, #409eff) 74%, rgba(255, 255, 255, 0.10));
              box-shadow: 0 18px 46px rgba(0, 0, 0, 0.20);
              display: grid;
              place-items: center;
              color: rgba(255, 255, 255, 0.95);
              font-size: 22px;
              font-weight: 900;
              user-select: none;
            "
          >
            +
          </div>
        </template>
      </TxFusion>
    </div>
  </div>
</template>
