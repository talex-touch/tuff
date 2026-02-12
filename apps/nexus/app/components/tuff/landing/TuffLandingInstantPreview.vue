<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const instantPreview = computed(() => ({
  eyebrow: t('landing.os.instantPreview.eyebrow'),
  headline: t('landing.os.instantPreview.headline'),
  subheadline: t('landing.os.instantPreview.subheadline'),
}))

const previewWidgets = computed(() => ([
  {
    id: 'expression',
    type: 'expression',
    icon: 'i-carbon-calculator',
    depth: 0.9,
    input: t('landing.os.instantPreview.widgets.expression.input'),
    result: t('landing.os.instantPreview.widgets.expression.result'),
    extra: t('landing.os.instantPreview.widgets.expression.extra'),
    details: [] as Array<{ label: string; value: string }>,
  },
  {
    id: 'currency',
    type: 'currency',
    icon: 'i-carbon-currency',
    depth: 1.2,
    input: t('landing.os.instantPreview.widgets.currency.input'),
    result: t('landing.os.instantPreview.widgets.currency.result'),
    extra: t('landing.os.instantPreview.widgets.currency.extra'),
    details: [
      { label: 'USD', value: t('landing.os.instantPreview.widgets.currency.details.source') },
      { label: 'CNY', value: t('landing.os.instantPreview.widgets.currency.details.target') },
    ],
  },
  {
    id: 'time',
    type: 'time',
    icon: 'i-carbon-calendar',
    depth: 1.3,
    input: t('landing.os.instantPreview.widgets.time.input'),
    result: t('landing.os.instantPreview.widgets.time.result'),
    extra: t('landing.os.instantPreview.widgets.time.extra'),
    details: [] as Array<{ label: string; value: string }>,
  },
  {
    id: 'unit',
    type: 'unit',
    icon: 'i-carbon-ruler',
    depth: 1.05,
    input: t('landing.os.instantPreview.widgets.unit.input'),
    result: t('landing.os.instantPreview.widgets.unit.result'),
    extra: t('landing.os.instantPreview.widgets.unit.extra'),
    details: [
      { label: 'M', value: t('landing.os.instantPreview.widgets.unit.details.meter') },
      { label: 'FT', value: t('landing.os.instantPreview.widgets.unit.details.feet') },
    ],
  },
  {
    id: 'color',
    type: 'color',
    icon: 'i-carbon-color-palette',
    depth: 1.1,
    input: t('landing.os.instantPreview.widgets.color.input'),
    result: t('landing.os.instantPreview.widgets.color.result'),
    extra: t('landing.os.instantPreview.widgets.color.extra'),
    details: [
      { label: 'RGB', value: t('landing.os.instantPreview.widgets.color.details.rgb') },
      { label: 'HSL', value: t('landing.os.instantPreview.widgets.color.details.hsl') },
    ],
  },
  {
    id: 'constant',
    type: 'constant',
    icon: 'i-carbon-function',
    depth: 0.85,
    input: t('landing.os.instantPreview.widgets.constant.input'),
    result: t('landing.os.instantPreview.widgets.constant.result'),
    extra: t('landing.os.instantPreview.widgets.constant.extra'),
    details: [] as Array<{ label: string; value: string }>,
  },
]))

const highlights = computed(() => ([
  {
    id: 'speed',
    icon: 'i-carbon-flash',
    title: t('landing.os.instantPreview.highlights.speed.title'),
    description: t('landing.os.instantPreview.highlights.speed.description'),
  },
  {
    id: 'coverage',
    icon: 'i-carbon-application-web',
    title: t('landing.os.instantPreview.highlights.coverage.title'),
    description: t('landing.os.instantPreview.highlights.coverage.description'),
  },
  {
    id: 'copy',
    icon: 'i-carbon-copy',
    title: t('landing.os.instantPreview.highlights.copy.title'),
    description: t('landing.os.instantPreview.highlights.copy.description'),
  },
  {
    id: 'consistency',
    icon: 'i-carbon-checkmark-outline',
    title: t('landing.os.instantPreview.highlights.consistency.title'),
    description: t('landing.os.instantPreview.highlights.consistency.description'),
  },
]))

const copyLabel = computed(() => t('landing.os.aiOverview.demo.preview.copyResult'))

function resolveTypeLabel(type: string) {
  return t(`landing.os.aiOverview.demo.preview.types.${type}`)
}
</script>

<template>
  <TuffLandingSection
    :sticky="instantPreview.eyebrow"
    :title="instantPreview.headline"
    :subtitle="instantPreview.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-6"
    title-class="text-[clamp(.7rem,1vw+1.4rem,1.2rem)] font-bold leading-tight"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 42,
        duration: 1.05,
      },
    }"
  >
    <template #decoration>
      <div class="InstantPreview-SectionBackdrop" />
    </template>
    <div class="InstantPreview-Layout">
      <div class="InstantPreview-Stage" data-reveal>
        <div class="InstantPreview-Glow" aria-hidden="true" />
        <TxFloating class="InstantPreview-FloatLayer" :sensitivity="1.15" :easing-factor="0.08">
          <TxFloatingElement
            v-for="widget in previewWidgets"
            :key="widget.id"
            :depth="widget.depth"
            class="InstantPreview-CardSlot"
            :class="`is-${widget.id}`"
          >
            <div class="ai-preview-demo__card">
              <div class="ai-preview-demo__card-header">
                <div class="ai-preview-demo__card-type">
                  <span v-if="widget.icon" :class="widget.icon" class="mr-2" />
                  {{ resolveTypeLabel(widget.type) }}
                </div>
                <div class="ai-preview-demo__card-badge">
                  instant.{{ widget.type }}
                </div>
              </div>

              <div class="InstantPreview-CardInput">
                {{ widget.input }}
              </div>

              <div class="ai-preview-demo__card-body">
                <template v-if="widget.type === 'color'">
                  <div class="ai-preview-demo__color-preview">
                    <div
                      class="ai-preview-demo__color-swatch"
                      :style="{ backgroundColor: widget.result }"
                    />
                    <div class="ai-preview-demo__color-value">
                      {{ widget.result }}
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="ai-preview-demo__card-result">
                    {{ widget.result }}
                  </div>
                </template>
                <div v-if="widget.extra" class="ai-preview-demo__card-extra">
                  {{ widget.extra }}
                </div>
              </div>

              <div v-if="widget.details.length" class="ai-preview-demo__card-details">
                <div
                  v-for="(detail, index) in widget.details"
                  :key="index"
                  class="ai-preview-demo__card-detail-item"
                >
                  <span class="ai-preview-demo__card-detail-label">{{ detail.label }}</span>
                  <span class="ai-preview-demo__card-detail-value">{{ detail.value }}</span>
                </div>
              </div>

              <div class="ai-preview-demo__card-footer">
                <TxButton
                  variant="bare"
                  size="small"
                  native-type="button"
                  class="ai-preview-demo__card-action-btn"
                >
                  <span class="i-carbon-copy" />
                  <span>{{ copyLabel }}</span>
                </TxButton>
                <div class="ai-preview-demo__card-powered">
                  TuffIntelligence
                </div>
              </div>
            </div>
          </TxFloatingElement>
        </TxFloating>
      </div>

      <div class="InstantPreview-Highlights" data-reveal>
        <article
          v-for="highlight in highlights"
          :key="highlight.id"
          class="InstantPreview-HighlightCard"
        >
          <span class="InstantPreview-HighlightIcon" :class="highlight.icon" aria-hidden="true" />
          <div>
            <h3 class="InstantPreview-HighlightTitle">
{{ highlight.title }}
</h3>
            <p class="InstantPreview-HighlightDesc">
{{ highlight.description }}
</p>
          </div>
        </article>
      </div>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.InstantPreview-Layout {
  display: flex;
  flex-direction: column;
  gap: clamp(2rem, 4vh, 3.5rem);
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-height: clamp(560px, 78vh, 760px);
  box-sizing: border-box;
}

.InstantPreview-Stage {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: clamp(360px, 52vh, 520px);
  border: none;
  background: transparent;
  isolation: isolate;
}

.InstantPreview-SectionBackdrop {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 120% at 0% 0%, rgba(59, 130, 246, 0.14), rgba(0, 0, 0, 0.7) 55%),
    radial-gradient(120% 120% at 100% 100%, rgba(14, 165, 233, 0.18), rgba(0, 0, 0, 0.95) 65%);
  opacity: 0.85;
  filter: blur(0.3px);
}

.InstantPreview-Glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(50% 50% at 50% 30%, rgba(255, 255, 255, 0.08), transparent 70%);
  pointer-events: none;
}

.InstantPreview-FloatLayer {
  position: absolute;
  inset: 0;
}

.InstantPreview-CardSlot {
  position: absolute;
  width: clamp(220px, 26vw, 320px);
}

.InstantPreview-CardSlot.is-expression {
  top: 6%;
  left: 6%;
}

.InstantPreview-CardSlot.is-unit {
  top: 6%;
  right: 6%;
}

.InstantPreview-CardSlot.is-time {
  bottom: 10%;
  left: 10%;
}

.InstantPreview-CardSlot.is-color {
  bottom: 24%;
  right: 14%;
}

.InstantPreview-CardSlot.is-currency {
  top: 42%;
  left: 40%;
  width: clamp(220px, 30vw, 300px);
}

.InstantPreview-CardSlot.is-constant {
  bottom: 4%;
  right: 2%;
  width: clamp(200px, 24vw, 280px);
}

.InstantPreview-CardInput {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 0.75rem;
}

.InstantPreview-Highlights {
  display: flex;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  flex-wrap: wrap;
  justify-content: space-between;
  width: 100%;
}

.InstantPreview-HighlightCard {
  display: flex;
  gap: 1rem;
  padding: 0.95rem 1.15rem;
  min-width: 220px;
  flex: 1 1 calc(25% - 1rem);
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 10, 15, 0.6);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

@media (max-width: 1200px) {
  .InstantPreview-HighlightCard {
    flex: 1 1 calc(50% - 1rem);
  }
}

@media (max-width: 720px) {
  .InstantPreview-Layout {
    min-height: auto;
    padding: 1.5rem 1rem 2rem;
  }

  .InstantPreview-SectionBackdrop {
    inset: 4vh 4vw 8vh;
  }

  .InstantPreview-HighlightCard {
    flex: 1 1 100%;
  }
}

.InstantPreview-HighlightIcon {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.85);
}

.InstantPreview-HighlightTitle {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.InstantPreview-HighlightDesc {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.62);
  line-height: 1.5;
}

.ai-preview-demo__card {
  width: 100%;
  min-height: 260px;
  padding: 1.25rem;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  backdrop-filter: blur(20px);
  position: relative;
  overflow: hidden;
  box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.ai-preview-demo__card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.25), transparent);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.ai-preview-demo__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.ai-preview-demo__card-type {
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-preview-demo__card-badge {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.3);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.ai-preview-demo__card-body {
  flex: 1;
  margin-bottom: 0.75rem;
}

.ai-preview-demo__card-result {
  font-size: 2.2rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 0.5rem;
  letter-spacing: -0.02em;
}

.ai-preview-demo__card-extra {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

.ai-preview-demo__color-preview {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.ai-preview-demo__color-swatch {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.ai-preview-demo__color-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #fff;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ai-preview-demo__card-detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
}

.ai-preview-demo__card-detail-label {
  color: rgba(255, 255, 255, 0.35);
  font-weight: 500;
}

.ai-preview-demo__card-detail-value {
  color: rgba(255, 255, 255, 0.8);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: auto;
}

.ai-preview-demo__card-action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.72rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-preview-demo__card-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.ai-preview-demo__card-powered {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.2);
  font-weight: 500;
}

@media (max-width: 960px) {
  .InstantPreview-Stage {
    height: auto;
    padding: 24px;
  }

  .InstantPreview-FloatLayer {
    position: static !important;
    height: auto !important;
    display: grid !important;
    gap: 16px;
  }

  .InstantPreview-CardSlot {
    position: relative !important;
    inset: auto !important;
    width: 100%;
    transform: none !important;
  }
}
</style>
