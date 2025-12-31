<script setup lang="ts">
import { ref } from 'vue'

type Variant = 'membrane' | 'glass' | 'gummy'

const active = ref<Record<Variant, boolean>>({
  membrane: true,
  glass: true,
  gummy: true,
})

const variants: Array<{ key: Variant; title: string; hint: string }> = [
  { key: 'membrane', title: 'Membrane', hint: 'status dots + labels' },
  { key: 'glass', title: 'Glass', hint: 'ui-ish / subtle' },
  { key: 'gummy', title: 'Gummy', hint: 'strong / playful' },
]
</script>

<template>
  <div
    style="
      width: 560px;
      border-radius: 16px;
      padding: 18px;
      background:
        radial-gradient(140% 120% at 10% 0%, rgba(129, 230, 217, 0.14), transparent 60%),
        radial-gradient(120% 120% at 90% 10%, rgba(250, 204, 21, 0.12), transparent 55%),
        linear-gradient(180deg, rgba(10, 12, 18, 0.92), rgba(10, 12, 18, 0.86));
      border: 1px solid rgba(255, 255, 255, 0.10);
      display: grid;
      gap: 12px;
    "
  >
    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
      <TxButton size="small" @click="active.membrane = !active.membrane">Toggle membrane</TxButton>
      <TxButton size="small" @click="active.glass = !active.glass">Toggle glass</TxButton>
      <TxButton size="small" @click="active.gummy = !active.gummy">Toggle gummy</TxButton>
    </div>

    <div style="display: grid; gap: 14px;">
      <div
        v-for="item in variants"
        :key="item.key"
        style="
          display: grid;
          grid-template-columns: 120px 1fr;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
        "
      >
        <div style="display: grid; gap: 4px;">
          <div style="font-size: 12px; font-weight: 700; color: rgba(255, 255, 255, 0.92);">{{ item.title }}</div>
          <div style="font-size: 11px; color: rgba(255, 255, 255, 0.60);">{{ item.hint }}</div>
        </div>

        <div style="display: grid; place-items: center;">
          <TxFusion
            v-model="active[item.key]"
            trigger="hover"
            :gap="68"
            direction="x"
            :duration="260"
            :blur="19"
            :alpha="29"
            :alpha-offset="-10"
          >
            <template #a>
              <div
                style="
                  height: 38px;
                  padding: 0 12px;
                  border-radius: 999px;
                  display: inline-flex;
                  align-items: center;
                  gap: 10px;
                  user-select: none;
                  border: 1px solid rgba(255, 255, 255, 0.16);
                  backdrop-filter: blur(16px) saturate(160%);
                  -webkit-backdrop-filter: blur(16px) saturate(160%);
                  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.30);
                "
                :style="
                  item.key === 'glass'
                    ? { background: 'rgba(255, 255, 255, 0.12)', color: 'rgba(255, 255, 255, 0.92)' }
                    : item.key === 'membrane'
                      ? { background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.78), rgba(167, 139, 250, 0.66))', color: 'rgba(255, 255, 255, 0.92)' }
                      : { background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.78), rgba(59, 130, 246, 0.82))', color: 'rgba(255, 255, 255, 0.95)' }
                "
              >
                <span
                  style="
                    width: 10px;
                    height: 10px;
                    border-radius: 999px;
                    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.10);
                  "
                  :style="
                    item.key === 'glass'
                      ? { background: 'rgba(255, 255, 255, 0.70)' }
                      : item.key === 'membrane'
                        ? { background: 'rgba(129, 230, 217, 0.95)' }
                        : { background: 'rgba(34, 197, 94, 0.95)' }
                  "
                />
                Online
              </div>
            </template>

            <template #b>
              <div
                style="
                  height: 38px;
                  padding: 0 12px;
                  border-radius: 999px;
                  display: inline-flex;
                  align-items: center;
                  gap: 10px;
                  user-select: none;
                  border: 1px solid rgba(255, 255, 255, 0.16);
                  backdrop-filter: blur(16px) saturate(160%);
                  -webkit-backdrop-filter: blur(16px) saturate(160%);
                  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.30);
                "
                :style="
                  item.key === 'glass'
                    ? { background: 'rgba(255, 255, 255, 0.12)', color: 'rgba(255, 255, 255, 0.92)' }
                    : item.key === 'membrane'
                      ? { background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.76), rgba(244, 114, 182, 0.70))', color: 'rgba(255, 255, 255, 0.92)' }
                      : { background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.80), rgba(249, 115, 22, 0.80))', color: 'rgba(255, 255, 255, 0.95)' }
                "
              >
                <span
                  style="
                    width: 10px;
                    height: 10px;
                    border-radius: 999px;
                    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.10);
                  "
                  :style="
                    item.key === 'glass'
                      ? { background: 'rgba(255, 255, 255, 0.70)' }
                      : item.key === 'membrane'
                        ? { background: 'rgba(244, 114, 182, 0.95)' }
                        : { background: 'rgba(244, 63, 94, 0.95)' }
                  "
                />
                Offline
              </div>
            </template>
          </TxFusion>
        </div>
      </div>
    </div>
  </div>
</template>
