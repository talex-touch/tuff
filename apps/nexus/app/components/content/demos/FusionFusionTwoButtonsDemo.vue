<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const variants = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
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
          <TxButton size="small" @click="active.membrane = !active.membrane">
            Toggle membrane
          </TxButton>
          <TxButton size="small" @click="active.glass = !active.glass">
            Toggle glass
          </TxButton>
          <TxButton size="small" @click="active.gummy = !active.gummy">
            Toggle gummy
          </TxButton>
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
              <div style="font-size: 12px; font-weight: 700; color: rgba(255, 255, 255, 0.92);">
                {{ item.title }}
              </div>
              <div style="font-size: 11px; color: rgba(255, 255, 255, 0.60);">
                {{ item.hint }}
              </div>
            </div>

            <div style="display: grid; place-items: center;">
              <TxFusion
                v-model="active[item.key]"
                trigger="hover"
                :gap="56"
                direction="x"
                :duration="260"
                :blur="19"
                :alpha="29"
                :alpha-offset="-10"
              >
                <template #a>
                  <div
                    v-if="item.key === 'membrane'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.06)),
                        linear-gradient(135deg, rgba(56, 189, 248, 0.78), rgba(167, 139, 250, 0.66));
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">Primary</span>
                  </div>

                  <div
                    v-else-if="item.key === 'glass'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background: rgba(255, 255, 255, 0.12);
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.28);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">Cancel</span>
                  </div>

                  <div
                    v-else
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.02)),
                        linear-gradient(135deg, rgba(34, 197, 94, 0.78), rgba(59, 130, 246, 0.82));
                      color: rgba(255, 255, 255, 0.95);
                      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.36);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                      font-weight: 700;
                    "
                  >
                    Action
                  </div>
                </template>

                <template #b>
                  <div
                    v-if="item.key === 'membrane'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.30), rgba(255, 255, 255, 0.06)),
                        linear-gradient(135deg, rgba(14, 165, 233, 0.76), rgba(244, 114, 182, 0.70));
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">Secondary</span>
                  </div>

                  <div
                    v-else-if="item.key === 'glass'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background: rgba(255, 255, 255, 0.12);
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.28);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">OK</span>
                  </div>

                  <div
                    v-else
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.20), rgba(255, 255, 255, 0.02)),
                        linear-gradient(135deg, rgba(244, 63, 94, 0.80), rgba(249, 115, 22, 0.80));
                      color: rgba(255, 255, 255, 0.95);
                      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.36);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                      font-weight: 700;
                    "
                  >
                    Danger
                  </div>
                </template>
              </TxFusion>
            </div>
          </div>
        </div>
      </div>
  </div>
  <div v-else>
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
          <TxButton size="small" @click="active.membrane = !active.membrane">
            Toggle membrane
          </TxButton>
          <TxButton size="small" @click="active.glass = !active.glass">
            Toggle glass
          </TxButton>
          <TxButton size="small" @click="active.gummy = !active.gummy">
            Toggle gummy
          </TxButton>
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
              <div style="font-size: 12px; font-weight: 700; color: rgba(255, 255, 255, 0.92);">
                {{ item.title }}
              </div>
              <div style="font-size: 11px; color: rgba(255, 255, 255, 0.60);">
                {{ item.hint }}
              </div>
            </div>

            <div style="display: grid; place-items: center;">
              <TxFusion
                v-model="active[item.key]"
                trigger="hover"
                :gap="56"
                direction="x"
                :duration="260"
                :blur="19"
                :alpha="29"
                :alpha-offset="-10"
              >
                <template #a>
                  <div
                    v-if="item.key === 'membrane'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.06)),
                        linear-gradient(135deg, rgba(56, 189, 248, 0.78), rgba(167, 139, 250, 0.66));
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">Primary</span>
                  </div>

                  <div
                    v-else-if="item.key === 'glass'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background: rgba(255, 255, 255, 0.12);
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.28);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">Cancel</span>
                  </div>

                  <div
                    v-else
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.02)),
                        linear-gradient(135deg, rgba(34, 197, 94, 0.78), rgba(59, 130, 246, 0.82));
                      color: rgba(255, 255, 255, 0.95);
                      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.36);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                      font-weight: 700;
                    "
                  >
                    Action
                  </div>
                </template>

                <template #b>
                  <div
                    v-if="item.key === 'membrane'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.30), rgba(255, 255, 255, 0.06)),
                        linear-gradient(135deg, rgba(14, 165, 233, 0.76), rgba(244, 114, 182, 0.70));
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">Secondary</span>
                  </div>

                  <div
                    v-else-if="item.key === 'glass'"
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background: rgba(255, 255, 255, 0.12);
                      border: 1px solid rgba(255, 255, 255, 0.18);
                      color: rgba(255, 255, 255, 0.92);
                      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.28);
                      backdrop-filter: blur(16px) saturate(160%);
                      -webkit-backdrop-filter: blur(16px) saturate(160%);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    "
                  >
                    <span style="font-size: 13px; font-weight: 700;">OK</span>
                  </div>

                  <div
                    v-else
                    style="
                      padding: 10px 14px;
                      border-radius: 999px;
                      background:
                        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.20), rgba(255, 255, 255, 0.02)),
                        linear-gradient(135deg, rgba(244, 63, 94, 0.80), rgba(249, 115, 22, 0.80));
                      color: rgba(255, 255, 255, 0.95);
                      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.36);
                      user-select: none;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                      font-weight: 700;
                    "
                  >
                    Danger
                  </div>
                </template>
              </TxFusion>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
