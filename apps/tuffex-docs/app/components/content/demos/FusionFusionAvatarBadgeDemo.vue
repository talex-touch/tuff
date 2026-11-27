<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div
        style="
          width: 560px;
          border-radius: 16px;
          padding: 18px;
          background:
            radial-gradient(120% 120% at 20% 20%, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 92%, transparent), color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 78%, transparent));
          border: 1px solid var(--vp-c-divider);
          display: grid;
          place-items: center;
        "
      >
        <TxFusion trigger="hover" :gap="64" :duration="260" :blur="19" :alpha="29" :alpha-offset="-10">
          <template #a>
            <div
              style="
                width: 84px;
                height: 84px;
                border-radius: 999px;
                background: linear-gradient(135deg, color-mix(in srgb, var(--tx-color-primary, #409eff) 70%, #fff), color-mix(in srgb, var(--tx-color-primary, #409eff) 30%, #000));
                box-shadow: 0 16px 42px rgba(0, 0, 0, 0.16);
                display: grid;
                place-items: center;
                color: rgba(255, 255, 255, 0.92);
                font-weight: 700;
                letter-spacing: 0.4px;
                user-select: none;
              "
            >
              TA
            </div>
          </template>

          <template #b>
            <div
              style="
                width: 34px;
                height: 34px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 78%, rgba(255, 255, 255, 0.10));
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
                display: grid;
                place-items: center;
                color: rgba(255, 255, 255, 0.94);
                font-size: 12px;
                font-weight: 700;
                user-select: none;
              "
            >
              8
            </div>
          </template>
        </TxFusion>
      </div>
  </div>
  <div v-else>
      <div
        style="
          width: 560px;
          border-radius: 16px;
          padding: 18px;
          background:
            radial-gradient(120% 120% at 20% 20%, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 92%, transparent), color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 78%, transparent));
          border: 1px solid var(--vp-c-divider);
          display: grid;
          place-items: center;
        "
      >
        <TxFusion trigger="hover" :gap="64" :duration="260" :blur="19" :alpha="29" :alpha-offset="-10">
          <template #a>
            <div
              style="
                width: 84px;
                height: 84px;
                border-radius: 999px;
                background: linear-gradient(135deg, color-mix(in srgb, var(--tx-color-primary, #409eff) 70%, #fff), color-mix(in srgb, var(--tx-color-primary, #409eff) 30%, #000));
                box-shadow: 0 16px 42px rgba(0, 0, 0, 0.16);
                display: grid;
                place-items: center;
                color: rgba(255, 255, 255, 0.92);
                font-weight: 700;
                letter-spacing: 0.4px;
                user-select: none;
              "
            >
              TA
            </div>
          </template>

          <template #b>
            <div
              style="
                width: 34px;
                height: 34px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 78%, rgba(255, 255, 255, 0.10));
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
                display: grid;
                place-items: center;
                color: rgba(255, 255, 255, 0.94);
                font-size: 12px;
                font-weight: 700;
                user-select: none;
              "
            >
              8
            </div>
          </template>
        </TxFusion>
      </div>
  </div>
</template>
