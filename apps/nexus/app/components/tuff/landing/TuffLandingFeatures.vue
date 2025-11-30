<script setup lang="ts">
import { computed } from 'vue'
import ChromaGrid from '../ChromaGrid.vue'

interface ExtensibilityContent {
  eyebrow: string
  headline: string
  subheadline: string
}

interface ShowcaseProfile {
  image: string
  title: string
  subtitle: string
  handle: string
  borderColor: string
  gradient: string
  url: string
}

const { t } = useI18n()

function toDomId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function createIcon(label: string, startColor: string, endColor: string, elements: string) {
  const gradientId = `grad-${toDomId(label)}`
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${startColor}"/>
          <stop offset="100%" stop-color="${endColor}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="32" fill="url(#${gradientId})"/>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        ${elements}
      </g>
    </svg>
  `
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const showcaseItems: ShowcaseProfile[] = [
  {
    image: createIcon(
      'Flow Transfer',
      '#06B6D4',
      '#0F172A',
      `
        <path d="M44 56h44" stroke="#F8FAFC" stroke-width="8" opacity="0.85"/>
        <path d="M88 40l32 40-32 40" stroke="#F8FAFC" stroke-width="10"/>
        <path d="M44 104h60" stroke="#E0F2FE" stroke-width="6" opacity="0.7"/>
        <circle cx="44" cy="80" r="9" fill="#F8FAFC" opacity="0.82" stroke="none"/>
      `,
    ),
    title: 'Flow Transfer',
    subtitle: 'Standardized cross-plugin flow handoff.',
    handle: '@FlowBus',
    borderColor: '#06B6D4',
    gradient: 'linear-gradient(145deg, #06B6D4, #0F172A)',
    url: 'https://launcher.tuff.dev/capabilities/flow-transfer',
  },
  {
    image: createIcon(
      'Search Engine',
      '#EC4899',
      '#0F172A',
      `
        <circle cx="70" cy="70" r="30" stroke="#FDF2F8" stroke-width="8"/>
        <path d="M92 92l28 28" stroke="#FBCFE8" stroke-width="10"/>
        <path d="M54 62c10-10 22-10 32 0" stroke="#FCE7F3" stroke-width="6" opacity="0.75"/>
        <circle cx="120" cy="120" r="14" fill="#BE185D" stroke="none" opacity="0.65"/>
      `,
    ),
    title: 'Search Engine',
    subtitle: 'Multi-source instruction search.',
    handle: '@QueryMesh',
    borderColor: '#EC4899',
    gradient: 'linear-gradient(145deg, #EC4899, #0F172A)',
    url: 'https://launcher.tuff.dev/capabilities/search-engine',
  },
  {
    image: createIcon(
      'Core Contextual Memory',
      '#10B981',
      '#1F2937',
      `
        <path d="M44 64h72" stroke="#DCFCE7" stroke-width="10" opacity="0.7"/>
        <path d="M40 80h80" stroke="#DCFCE7" stroke-width="10" opacity="0.9"/>
        <path d="M44 96h72" stroke="#DCFCE7" stroke-width="10" opacity="0.7"/>
        <rect x="34" y="48" width="92" height="64" rx="16" stroke="#BBF7D0" stroke-width="8"/>
        <circle cx="80" cy="80" r="18" stroke="#22C55E" stroke-width="6" opacity="0.8"/>
      `,
    ),
    title: 'Core Contextual Memory',
    subtitle: 'Shared context cache and intent engine.',
    handle: '@ContextCore',
    borderColor: '#10B981',
    gradient: 'linear-gradient(160deg, #10B981, #1F2937)',
    url: 'https://launcher.tuff.dev/capabilities/core-context',
  },
  {
    image: createIcon(
      'Division Box Layout',
      '#3B82F6',
      '#0F172A',
      `
        <rect x="36" y="36" width="88" height="88" rx="12" stroke="#DBEAFE" stroke-width="8"/>
        <path d="M80 36v88" stroke="#BFDBFE" stroke-width="6"/>
        <path d="M36 80h88" stroke="#BFDBFE" stroke-width="6"/>
        <rect x="44" y="44" width="32" height="32" rx="8" fill="#2563EB" opacity="0.7" stroke="none"/>
        <rect x="84" y="44" width="32" height="52" rx="8" fill="#60A5FA" opacity="0.75" stroke="none"/>
        <rect x="44" y="84" width="32" height="40" rx="8" fill="#1D4ED8" opacity="0.65" stroke="none"/>
      `,
    ),
    title: 'Division Box Layout',
    subtitle: 'Multi-pane workspace layouts.',
    handle: '@LayoutOS',
    borderColor: '#3B82F6',
    gradient: 'linear-gradient(165deg, #3B82F6, #0F172A)',
    url: 'https://launcher.tuff.dev/capabilities/division-box',
  },
  {
    image: createIcon(
      'Automation Scenes',
      '#FB7185',
      '#111827',
      `
        <circle cx="54" cy="54" r="12" stroke="#FFE4E6" stroke-width="6" fill="#FDA4AF" opacity="0.85"/>
        <circle cx="106" cy="54" r="12" stroke="#FFE4E6" stroke-width="6" fill="#FB7185" opacity="0.85"/>
        <circle cx="80" cy="106" r="14" stroke="#FFE4E6" stroke-width="6" fill="#FEE2E2" opacity="0.85"/>
        <path d="M66 60l14 34 26-34" stroke="#FDE68A" stroke-width="6" opacity="0.7"/>
        <path d="M54 54h52" stroke="#FFE4E6" stroke-width="6" opacity="0.6"/>
      `,
    ),
    title: 'Automation Scenes',
    subtitle: 'Cross-plugin automation triggers.',
    handle: '@SceneFlow',
    borderColor: '#FB7185',
    gradient: 'linear-gradient(155deg, #FB7185, #111827)',
    url: 'https://launcher.tuff.dev/capabilities/automation-scenes',
  },
  {
    image: createIcon(
      'Permission Matrix',
      '#6366F1',
      '#111827',
      `
        <path d="M80 34l44 18v28c0 28-18 44-44 56-26-12-44-28-44-56V52l44-18z" stroke="#C7D2FE" stroke-width="8" fill="rgba(99,102,241,0.35)"/>
        <path d="M80 72l16 16-16 16-16-16 16-16z" stroke="#E0E7FF" stroke-width="6" fill="rgba(226,232,240,0.35)"/>
        <path d="M80 64v56" stroke="#E0E7FF" stroke-width="6" opacity="0.6"/>
        <path d="M56 88h48" stroke="#E0E7FF" stroke-width="6" opacity="0.6"/>
      `,
    ),
    title: 'Permission Matrix',
    subtitle: 'Policy-driven permission sandbox.',
    handle: '@TrustGrid',
    borderColor: '#6366F1',
    gradient: 'linear-gradient(175deg, #6366F1, #111827)',
    url: 'https://launcher.tuff.dev/capabilities/permission-matrix',
  },
  {
    image: createIcon(
      'Developer Sandbox',
      '#2DD4BF',
      '#0F172A',
      `
        <path d="M52 58l28-14 28 14v44l-28 14-28-14V58z" stroke="#CCFBF1" stroke-width="8" fill="rgba(45,212,191,0.25)"/>
        <path d="M80 44v44" stroke="#99F6E4" stroke-width="6" opacity="0.7"/>
        <path d="M52 82l28 14 28-14" stroke="#A5F3FC" stroke-width="6" opacity="0.7"/>
      `,
    ),
    title: 'Developer Sandbox',
    subtitle: 'Isolated environment for plugin debugging.',
    handle: '@DevSand',
    borderColor: '#2DD4BF',
    gradient: 'linear-gradient(145deg, #2DD4BF, #0F172A)',
    url: 'https://launcher.tuff.dev/capabilities/developer-sandbox',
  },
  {
    image: createIcon(
      'Telemetry Console',
      '#F59E0B',
      '#111827',
      `
        <path d="M40 112l18-28 16 20 20-36 18 24 10-16" stroke="#FFFBEB" stroke-width="8"/>
        <rect x="36" y="36" width="88" height="88" rx="18" stroke="#FDE68A" stroke-width="8" opacity="0.7"/>
        <path d="M54 54h56" stroke="#FEF3C7" stroke-width="6" opacity="0.6"/>
      `,
    ),
    title: 'Telemetry Console',
    subtitle: 'Live metrics and anomaly alerts.',
    handle: '@MetricsOps',
    borderColor: '#F59E0B',
    gradient: 'linear-gradient(155deg, #F59E0B, #111827)',
    url: 'https://launcher.tuff.dev/capabilities/telemetry-console',
  },
  {
    image: createIcon(
      'Edge Scheduler',
      '#C084FC',
      '#312E81',
      `
        <circle cx="80" cy="80" r="40" stroke="#EDE9FE" stroke-width="8"/>
        <path d="M80 48v32l24 12" stroke="#DDD6FE" stroke-width="8"/>
        <circle cx="80" cy="80" r="60" stroke="#C084FC" stroke-width="6" opacity="0.3"/>
        <circle cx="80" cy="80" r="12" fill="#F5F3FF" stroke="none" opacity="0.8"/>
      `,
    ),
    title: 'Edge Scheduler',
    subtitle: 'Edge task orchestration and resource control.',
    handle: '@EdgeFlow',
    borderColor: '#C084FC',
    gradient: 'linear-gradient(165deg, #C084FC, #312E81)',
    url: 'https://launcher.tuff.dev/capabilities/edge-scheduler',
  },
]

const extensibility = computed<ExtensibilityContent>(() => ({
  eyebrow: t('landing.os.extensibility.eyebrow'),
  headline: t('landing.os.extensibility.headline'),
  subheadline: t('landing.os.extensibility.subheadline'),
}))
</script>

<template>
  <TuffLandingSection
    :sticky="extensibility.eyebrow"
    :title="extensibility.headline"
    :subtitle="extensibility.subheadline"
    section-class="min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-16"
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
    <div class="flex flex-col items-center gap-10 rounded-3xl bg-black py-36 shadow-[0_12px_20px_rgba(8,10,35,0.32)]">
      <ChromaGrid
        :items="showcaseItems"
        :radius="300"
        :damping="0.45"
        :fade-out="0.6"
        ease="power3.out"
      />
      <div class="pointer-events-none absolute from-transparent via-white/12 to-transparent bg-gradient-to-r blur-[120px] -inset-10 -z-10" />
    </div>
  </TuffLandingSection>
</template>
