<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const backgroundOpacity = ref('')
const blendModes = ref('')
const blueOffset = ref('')
const blur = ref('')
const borderRadius = ref('')
const borderWidth = ref('')
const brightness = ref('')
const channel = ref('')
const channels = ref('')
const displace = ref(false)
const distortionScale = ref(false)
const greenOffset = ref('')
const height = ref('')
const mixBlendMode = ref('')
const mode = ref('')
const opacity = ref('')
const redOffset = ref('')
const saturation = ref('')
const width = ref('')
const xChannel = ref('')
const yChannel = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div
          style="
            position: relative;
            border-radius: 16px;
            padding: 20px;
            background:
              radial-gradient(circle at 10% 15%, rgba(255, 208, 164, 0.7), transparent 45%),
              radial-gradient(circle at 86% 20%, rgba(168, 214, 255, 0.7), transparent 46%),
              radial-gradient(circle at 20% 80%, rgba(198, 255, 228, 0.55), transparent 50%),
              linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(236, 240, 248, 0.98));
            border: 1px solid rgba(0, 0, 0, 0.06);
            overflow: hidden;
          "
        >
          <div
            style="
              position: relative;
              height: 280px;
              border-radius: 14px;
              overflow: hidden;
              background: rgba(255, 255, 255, 0.5);
            "
          >
            <div
              style="
                height: 100%;
                overflow-y: auto;
                padding: 20px 22px 30px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                font-family: 'Playfair Display', 'Times New Roman', serif;
                color: rgba(0, 0, 0, 0.72);
              "
            >
              <div style="display: flex; align-items: center; gap: 10px;">
                <div
                  style="
                    padding: 4px 10px;
                    border-radius: 999px;
                    font-size: 12px;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    background: rgba(255, 255, 255, 0.8);
                  "
                >
                  Glass Journal
                </div>
                <div style="font-size: 12px; opacity: 0.6;">
                  scroll to preview depth
                </div>
              </div>
              <div style="font-size: 18px; font-weight: 600;">
                Light, texture, and a quiet sense of depth
              </div>
              <div style="font-size: 13px; line-height: 1.6; opacity: 0.78;">
                A glass surface should feel breathable. Subtle blur, soft light dispersion, and layered
                gradients turn a flat panel into something you want to hover over.
              </div>
              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
                <div
                  style="
                    height: 120px;
                    border-radius: 14px;
                    background:
                      linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(215, 230, 255, 0.9)),
                      radial-gradient(circle at 20% 20%, rgba(255, 208, 164, 0.7), transparent 55%);
                    border: 1px solid rgba(0, 0, 0, 0.08);
                  "
                />
                <div
                  style="
                    height: 120px;
                    border-radius: 14px;
                    background:
                      linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(214, 255, 236, 0.9)),
                      radial-gradient(circle at 80% 20%, rgba(168, 214, 255, 0.7), transparent 55%);
                    border: 1px solid rgba(0, 0, 0, 0.08);
                  "
                />
              </div>
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                  gap: 10px;
                  font-family: 'IBM Plex Mono', 'Courier New', monospace;
                  font-size: 12px;
                "
              >
                <div style="padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.8);">
                  blur: keep it airy
                </div>
                <div style="padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.8);">
                  light: soft highlight
                </div>
                <div style="padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.8);">
                  tint: warm + cool
                </div>
              </div>
              <div style="height: 120px;" />
            </div>

            <div
              style="
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
              "
            >
              <TxGlassSurface
                :width="width"
                :height="height"
                :border-radius="borderRadius"
                :border-width="borderWidth"
                :brightness="brightness"
                :opacity="opacity"
                :blur="blur"
                :displace="displace"
                :background-opacity="backgroundOpacity"
                :saturation="saturation"
                :distortion-scale="distortionScale"
                :red-offset="redOffset"
                :green-offset="greenOffset"
                :blue-offset="blueOffset"
                :x-channel="xChannel"
                :y-channel="yChannel"
                :mix-blend-mode="mixBlendMode"
              >
                <div
                  style="
                    padding: 18px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    font-weight: 600;
                    color: rgba(0, 0, 0, 0.68);
                  "
                >
                  <div style="font-size: 16px;">
                    GlassSurface
                  </div>
                  <div style="font-size: 12px; opacity: 0.7;">
                    Layered clarity with adjustable optics
                  </div>
                </div>
              </TxGlassSurface>
            </div>
          </div>
        </div>

        <div
          style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px 16px;
          "
        >
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              width (px)
            </div>
            <TxSlider v-model="width" :min="200" :max="560" :step="10" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              height (px)
            </div>
            <TxSlider v-model="height" :min="120" :max="320" :step="10" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              borderRadius
            </div>
            <TxSlider v-model="borderRadius" :min="0" :max="64" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              borderWidth
            </div>
            <TxSlider v-model="borderWidth" :min="0" :max="0.3" :step="0.01" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              brightness
            </div>
            <TxSlider v-model="brightness" :min="0" :max="140" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              opacity
            </div>
            <TxSlider v-model="opacity" :min="0" :max="1" :step="0.01" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              blur (px)
            </div>
            <TxSlider v-model="blur" :min="0" :max="24" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              displace
            </div>
            <TxSlider v-model="displace" :min="0" :max="6" :step="0.1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              backgroundOpacity
            </div>
            <TxSlider v-model="backgroundOpacity" :min="0" :max="0.5" :step="0.01" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              saturation
            </div>
            <TxSlider v-model="saturation" :min="0.5" :max="2.4" :step="0.05" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              distortionScale
            </div>
            <TxSlider v-model="distortionScale" :min="-600" :max="0" :step="10" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              redOffset
            </div>
            <TxSlider v-model="redOffset" :min="-80" :max="80" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              greenOffset
            </div>
            <TxSlider v-model="greenOffset" :min="-80" :max="80" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              blueOffset
            </div>
            <TxSlider v-model="blueOffset" :min="-80" :max="80" :step="1" show-value />
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 16px;">
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; opacity: 0.72;">
            xChannel
            <select v-model="xChannel" style="padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12);">
              <option v-for="channelItem in channels" :key="channelItem" :value="channelItem">
                {{ channelItem }}
              </option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; opacity: 0.72;">
            yChannel
            <select v-model="yChannel" style="padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12);">
              <option v-for="channelItem in channels" :key="channelItem" :value="channelItem">
                {{ channelItem }}
              </option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; opacity: 0.72; min-width: 180px;">
            mixBlendMode
            <select v-model="mixBlendMode" style="padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12);">
              <option v-for="modeItem in blendModes" :key="modeItem" :value="modeItem">
                {{ modeItem }}
              </option>
            </select>
          </label>
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div
          style="
            position: relative;
            border-radius: 16px;
            padding: 20px;
            background:
              radial-gradient(circle at 10% 15%, rgba(255, 208, 164, 0.7), transparent 45%),
              radial-gradient(circle at 86% 20%, rgba(168, 214, 255, 0.7), transparent 46%),
              radial-gradient(circle at 20% 80%, rgba(198, 255, 228, 0.55), transparent 50%),
              linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(236, 240, 248, 0.98));
            border: 1px solid rgba(0, 0, 0, 0.06);
            overflow: hidden;
          "
        >
          <div
            style="
              position: relative;
              height: 280px;
              border-radius: 14px;
              overflow: hidden;
              background: rgba(255, 255, 255, 0.5);
            "
          >
            <div
              style="
                height: 100%;
                overflow-y: auto;
                padding: 20px 22px 30px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                font-family: 'Playfair Display', 'Times New Roman', serif;
                color: rgba(0, 0, 0, 0.72);
              "
            >
              <div style="display: flex; align-items: center; gap: 10px;">
                <div
                  style="
                    padding: 4px 10px;
                    border-radius: 999px;
                    font-size: 12px;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    background: rgba(255, 255, 255, 0.8);
                  "
                >
                  Glass Journal
                </div>
                <div style="font-size: 12px; opacity: 0.6;">
                  scroll to preview depth
                </div>
              </div>
              <div style="font-size: 18px; font-weight: 600;">
                Light, texture, and a quiet sense of depth
              </div>
              <div style="font-size: 13px; line-height: 1.6; opacity: 0.78;">
                A glass surface should feel breathable. Subtle blur, soft light dispersion, and layered
                gradients turn a flat panel into something you want to hover over.
              </div>
              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
                <div
                  style="
                    height: 120px;
                    border-radius: 14px;
                    background:
                      linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(215, 230, 255, 0.9)),
                      radial-gradient(circle at 20% 20%, rgba(255, 208, 164, 0.7), transparent 55%);
                    border: 1px solid rgba(0, 0, 0, 0.08);
                  "
                />
                <div
                  style="
                    height: 120px;
                    border-radius: 14px;
                    background:
                      linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(214, 255, 236, 0.9)),
                      radial-gradient(circle at 80% 20%, rgba(168, 214, 255, 0.7), transparent 55%);
                    border: 1px solid rgba(0, 0, 0, 0.08);
                  "
                />
              </div>
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                  gap: 10px;
                  font-family: 'IBM Plex Mono', 'Courier New', monospace;
                  font-size: 12px;
                "
              >
                <div style="padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.8);">
                  blur: keep it airy
                </div>
                <div style="padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.8);">
                  light: soft highlight
                </div>
                <div style="padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.8);">
                  tint: warm + cool
                </div>
              </div>
              <div style="height: 120px;" />
            </div>

            <div
              style="
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
              "
            >
              <TxGlassSurface
                :width="width"
                :height="height"
                :border-radius="borderRadius"
                :border-width="borderWidth"
                :brightness="brightness"
                :opacity="opacity"
                :blur="blur"
                :displace="displace"
                :background-opacity="backgroundOpacity"
                :saturation="saturation"
                :distortion-scale="distortionScale"
                :red-offset="redOffset"
                :green-offset="greenOffset"
                :blue-offset="blueOffset"
                :x-channel="xChannel"
                :y-channel="yChannel"
                :mix-blend-mode="mixBlendMode"
              >
                <div
                  style="
                    padding: 18px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    font-weight: 600;
                    color: rgba(0, 0, 0, 0.68);
                  "
                >
                  <div style="font-size: 16px;">
                    GlassSurface
                  </div>
                  <div style="font-size: 12px; opacity: 0.7;">
                    Layered clarity with adjustable optics
                  </div>
                </div>
              </TxGlassSurface>
            </div>
          </div>
        </div>

        <div
          style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px 16px;
          "
        >
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              width (px)
            </div>
            <TxSlider v-model="width" :min="200" :max="560" :step="10" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              height (px)
            </div>
            <TxSlider v-model="height" :min="120" :max="320" :step="10" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              borderRadius
            </div>
            <TxSlider v-model="borderRadius" :min="0" :max="64" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              borderWidth
            </div>
            <TxSlider v-model="borderWidth" :min="0" :max="0.3" :step="0.01" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              brightness
            </div>
            <TxSlider v-model="brightness" :min="0" :max="140" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              opacity
            </div>
            <TxSlider v-model="opacity" :min="0" :max="1" :step="0.01" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              blur (px)
            </div>
            <TxSlider v-model="blur" :min="0" :max="24" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              displace
            </div>
            <TxSlider v-model="displace" :min="0" :max="6" :step="0.1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              backgroundOpacity
            </div>
            <TxSlider v-model="backgroundOpacity" :min="0" :max="0.5" :step="0.01" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              saturation
            </div>
            <TxSlider v-model="saturation" :min="0.5" :max="2.4" :step="0.05" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              distortionScale
            </div>
            <TxSlider v-model="distortionScale" :min="-600" :max="0" :step="10" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              redOffset
            </div>
            <TxSlider v-model="redOffset" :min="-80" :max="80" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              greenOffset
            </div>
            <TxSlider v-model="greenOffset" :min="-80" :max="80" :step="1" show-value />
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              blueOffset
            </div>
            <TxSlider v-model="blueOffset" :min="-80" :max="80" :step="1" show-value />
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 16px;">
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; opacity: 0.72;">
            xChannel
            <select v-model="xChannel" style="padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12);">
              <option v-for="channelItem in channels" :key="channelItem" :value="channelItem">
                {{ channelItem }}
              </option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; opacity: 0.72;">
            yChannel
            <select v-model="yChannel" style="padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12);">
              <option v-for="channelItem in channels" :key="channelItem" :value="channelItem">
                {{ channelItem }}
              </option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; opacity: 0.72; min-width: 180px;">
            mixBlendMode
            <select v-model="mixBlendMode" style="padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12);">
              <option v-for="modeItem in blendModes" :key="modeItem" :value="modeItem">
                {{ modeItem }}
              </option>
            </select>
          </label>
        </div>
      </div>
  </div>
</template>
