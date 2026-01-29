<template>
  <div
    style="
      width: 560px;
      border-radius: 16px;
      padding: 18px;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 92%, transparent), color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent));
      border: 1px solid var(--vp-c-divider);
      display: grid;
      place-items: center;
    "
  >
    <TxFusion trigger="hover" :gap="54" :duration="260" :blur="19" :alpha="29" :alpha-offset="-10">
      <template #a>
        <div
          style="
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 26%, transparent);
            border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
            backdrop-filter: blur(14px) saturate(160%);
            -webkit-backdrop-filter: blur(14px) saturate(160%);
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.12);
            user-select: none;
          "
        >
          <span
            style="
              width: 22px;
              height: 22px;
              border-radius: 8px;
              background: color-mix(in srgb, var(--tx-color-success, #67c23a) 66%, rgba(255, 255, 255, 0.14));
              box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
            "
          />
          <span style="font-size: 13px; color: var(--tx-text-color-primary, #303133); font-weight: 600;">Synced</span>
        </div>
      </template>

      <template #b>
        <div
          style="
            width: 40px;
            height: 40px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--tx-color-success, #67c23a) 70%, rgba(255, 255, 255, 0.10));
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
            display: grid;
            place-items: center;
            color: rgba(255, 255, 255, 0.95);
            font-weight: 900;
            user-select: none;
          "
        >
          ✓
        </div>
      </template>
    </TxFusion>
  </div>
</template>
