<script setup lang="ts">
import { computed } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Every material TxBaseSurface has, side by side over one still backdrop of crisp text and
 * hard-edged colour, so what each one does to what lies behind it is visible.
 *
 * The list is `BaseSurfaceMode` (packages/tuffex/packages/components/src/base-surface/src/types.ts)
 * in the order of the material table, less `pure`, which paints exactly what `flat` paints.
 * Only `mode` and `radius` are set; every other parameter is the component's default.
 */

type Mode = 'refraction' | 'glass' | 'acrylic' | 'mica' | 'mask' | 'blur' | 'flat' | 'plain'

const MODES: Mode[] = ['refraction', 'glass', 'acrylic', 'mica', 'mask', 'blur', 'flat', 'plain']
// Every component with a surface layer defaults to this mode: TxBaseSurface, TxCard,
// TxFlipOverlay, and the overlay panels of TxPopover, TxDropdownMenu, TxTooltip and the rest.
const DEFAULT_MODE: Mode = 'refraction'
const RADIUS = 14
const BACKDROP_ROWS = 16

const { locale } = useI18n()

const copy = computed(() => locale.value === 'zh'
  ? {
      default: '默认',
      modes: {
        refraction: '玻璃层之上再叠一层背景模糊与饱和度滤镜，外加折射描边',
        glass: '玻璃层：SVG 位移贴图让 R、G、B 三个通道各自错开，再提高饱和度；Safari、Firefox 退回背景模糊',
        acrylic: '三倍宽的背景模糊并提亮，叠一层带分形噪点的色膜',
        mica: '不读背景：不透明底色上两道锚定视口的主色与邻近色相色晕',
        mask: '半透明色膜，不做模糊',
        blur: 'backdrop-filter 背景模糊并提高饱和度，叠一层很淡的底色',
        flat: '不透明实色，背景完全不透出；pure 画的是同一种',
        plain: '不画任何材质，只留圆角与裁切（虚线标出它的边界）',
      },
      caption: `同一张静止背景上 TxBaseSurface 的全部 ${MODES.length} 种材质（pure 与 flat 相同，不另列），除圆角外都用组件默认参数。${DEFAULT_MODE} 是所有带材质层组件的默认材质：TxBaseSurface、TxCard、TxFlipOverlay，以及 TxPopover、TxDropdownMenu、TxTooltip 等浮层面板。`,
    }
  : {
      default: 'Default',
      modes: {
        refraction: 'The glass layer, with a backdrop blur-and-saturation layer and a refraction rim over it',
        glass: 'Glass layer: an SVG displacement map shifts R, G and B apart, then saturation is boosted; Safari and Firefox fall back to a backdrop blur',
        acrylic: 'A backdrop blur three times as wide, lifted, under a tint grained with fractal noise',
        mica: 'No backdrop read: two viewport-anchored glows of the brand and a neighbouring hue on an opaque base',
        mask: 'Translucent tint, no blur',
        blur: 'Backdrop-filter blur and saturation under a faint tint',
        flat: 'Opaque fill; nothing shows through. pure paints the same',
        plain: 'No material at all, only the radius and the clipping (the dashed line marks its box)',
      },
      caption: `All ${MODES.length} TxBaseSurface materials over one still backdrop (pure is the same as flat and is left out), each at the component's default parameters apart from the radius. ${DEFAULT_MODE} is the default of every component with a surface layer: TxBaseSurface, TxCard, TxFlipOverlay, and overlay panels such as TxPopover, TxDropdownMenu and TxTooltip.`,
    })
</script>

<template>
  <ConceptFigure :caption="copy.caption" stage="plain">
    <div class="surf">
      <div class="surf__stage">
        <div class="surf__backdrop" aria-hidden="true">
          <span v-for="row in BACKDROP_ROWS" :key="row" class="surf__line">Tuff · Surface · TuffEx · Tuff · Surface · TuffEx · Tuff · Surface · TuffEx</span>
        </div>
        <div class="surf__grid">
          <TxBaseSurface
            v-for="mode in MODES"
            :key="mode"
            :mode="mode"
            :radius="RADIUS"
            class="surf__panel"
            :class="{ 'surf__panel--plain': mode === 'plain' }"
          >
            <span class="surf__name">
              <code class="cfig-mono">{{ mode }}</code>
              <span v-if="mode === DEFAULT_MODE" class="cfig-badge surf__badge">{{ copy.default }}</span>
            </span>
          </TxBaseSurface>
        </div>
      </div>
      <!-- The notes sit off the backdrop: on glass, nothing tints it, so text over it is unreadable. -->
      <dl class="surf__grid surf__notes">
        <div v-for="mode in MODES" :key="mode" class="surf__note">
          <dt class="cfig-mono">
            {{ mode }}
          </dt>
          <dd>{{ copy.modes[mode] }}</dd>
        </div>
      </dl>
    </div>
  </ConceptFigure>
</template>

<style scoped>
.surf {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 14px;
}

.surf__stage {
  position: relative;
  padding: 22px;
}

/* A still, deliberately busy backdrop: hard-edged discs and rows of bold text. */
.surf__backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 22%, #ffd166 0 15%, transparent 15.5%),
    radial-gradient(circle at 84% 26%, #06d6a0 0 12%, transparent 12.5%),
    radial-gradient(circle at 60% 84%, #ef476f 0 17%, transparent 17.5%),
    radial-gradient(circle at 30% 80%, #118ab2 0 11%, transparent 11.5%),
    linear-gradient(135deg, #5b5bd6 0%, #8e44ad 50%, #f72585 100%);
  user-select: none;
}

.surf__line {
  color: rgb(255 255 255 / 58%);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
  line-height: 30px;
  white-space: nowrap;
}

.surf__line:nth-child(even) {
  margin-left: -44px;
}

.surf__grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
  gap: 12px;
}

.surf__panel {
  min-height: 96px;
  color: var(--tx-text-color-primary, #303133);
}

/* plain paints nothing, so without a line its box would not show at all. */
.surf__panel--plain {
  outline: 1px dashed rgb(255 255 255 / 75%);
  outline-offset: -1px;
}

.surf__name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
}

.surf__badge {
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cfig-accent) 45%, transparent);
  color: var(--cfig-accent);
}

/* Same columns as the panels above, so each note sits in its panel's column. */
.surf__notes {
  margin: 0;
  padding: 0 22px;
}

.surf__note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.surf__note dt {
  color: var(--cfig-ink);
  font-size: 12px;
  font-weight: 600;
}

.surf__note dd {
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
  line-height: 1.5;
  text-wrap: pretty;
}
</style>
