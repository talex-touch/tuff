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
        linear-gradient(180deg, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 92%, transparent), color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 84%, transparent));
      border: 1px solid var(--vp-c-divider);
      display: grid;
      gap: 12px;
    "
  >
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton size="small" type="primary" @click="active = !active">
        Toggle
      </TxButton>
      <div style="font-size: 12px; color: var(--tx-text-color-secondary);">
        Hover the group or toggle
      </div>
    </div>

    <div style="display: grid; place-items: center; padding: 18px;">
      <TxFusion v-model="active" trigger="hover" :gap="44" direction="y" :duration="260" :blur="19" :alpha="29" :alpha-offset="-10">
        <template #a>
          <div
            style="
              display: inline-flex;
              align-items: center;
              gap: 10px;
              padding: 10px 14px;
              border-radius: 999px;
              background: color-mix(in srgb, var(--tx-color-primary, #409eff) 76%, rgba(255, 255, 255, 0.10));
              color: #fff;
              box-shadow: 0 12px 26px rgba(0, 0, 0, 0.18);
              font-weight: 600;
              letter-spacing: 0.2px;
              user-select: none;
            "
          >
            <span style="font-size: 13px; line-height: 1;">Save</span>
            <span
              style="
                font-size: 11px;
                line-height: 1;
                padding: 4px 8px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.16);
                border: 1px solid rgba(255, 255, 255, 0.22);
                opacity: 0.95;
              "
            >
              ⌘S
            </span>
          </div>
        </template>

        <template #b>
          <div
            style="
              padding: 8px 10px;
              border-radius: 999px;
              background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 18%, transparent);
              border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
              backdrop-filter: blur(14px) saturate(160%);
              -webkit-backdrop-filter: blur(14px) saturate(160%);
              color: var(--tx-text-color-primary, #303133);
              font-size: 12px;
              box-shadow: 0 14px 36px rgba(0, 0, 0, 0.12);
              user-select: none;
              white-space: nowrap;
            "
          >
            Saved to drafts
          </div>
        </template>
      </TxFusion>
    </div>
  </div>
</template>
