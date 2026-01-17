<script setup lang="ts">
import { ref } from 'vue'

const active = ref(false)
</script>

<template>
  <div style="display: grid; gap: 12px; width: 520px;">
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton type="primary" @click="active = !active">
        Toggle
      </TxButton>
      <div style="font-size: 12px; color: var(--tx-text-color-secondary);">
        Click button or hover the fusion area
      </div>
    </div>

    <div
      style="
        height: 320px;
        border-radius: 16px;
        background: radial-gradient(120% 120% at 20% 30%, rgba(20, 90, 130, 0.95), rgba(10, 30, 80, 0.95));
        display: grid;
        place-items: center;
        overflow: hidden;
      "
    >
      <TxFusion v-model="active" trigger="hover" :gap="240" :blur="19" :alpha="29" :alpha-offset="-10">
        <template #a>
          <div
            style="
              width: 260px;
              height: 260px;
              border-radius: 999px;
              background: hsla(256, 65%, 60%, 0.76);
            "
          />
        </template>

        <template #b>
          <div
            style="
              width: 110px;
              height: 110px;
              border-radius: 999px;
              background: hsla(77, 100%, 55%, 0.78);
            "
          />
        </template>
      </TxFusion>
    </div>

    <TxFusion :gap="46" direction="y" trigger="click" :blur="19" :alpha="29" :alpha-offset="-10">
      <template #a>
        <div
          style="
            width: 92px;
            height: 56px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--tx-color-primary, #409eff) 66%, rgba(255, 255, 255, 0.20));
            box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);
          "
        />
      </template>

      <template #b>
        <div
          style="
            width: 92px;
            height: 56px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--tx-color-success, #67c23a) 66%, rgba(255, 255, 255, 0.20));
            box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);
          "
        />
      </template>
    </TxFusion>
  </div>
</template>
