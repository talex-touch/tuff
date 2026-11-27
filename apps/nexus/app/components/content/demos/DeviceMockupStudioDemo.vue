<script setup lang="ts">
import type {
  DeviceMockupBackdrop,
  DeviceMockupFinish,
  DeviceMockupFrameStyle,
  DeviceMockupFraming,
  DeviceMockupGradientPreset,
  DeviceMockupOrientation,
  DeviceMockupPerspective,
  DeviceMockupPreset,
  DeviceMockupScene,
  DeviceMockupShadowVariant,
  DeviceMockupStageRatio,
  TxDeviceMockupInstance,
} from '@talex-touch/tuffex/device-mockup'
import type { TxSelectModelValue, TxSelectOption, TxSelectOptionGroup } from '@talex-touch/tuffex/select'
import {
  DEVICE_MOCKUP_GRADIENTS,
  registerDeviceMockupPresets,
} from '@talex-touch/tuffex/device-mockup'
import { downloadDeviceMockupBlob } from '@talex-touch/tuffex/device-mockup/export'
import {
  ANDROID_DEVICE_PRESETS,
  BROWSER_DEVICE_PRESETS,
  DESKTOP_DEVICE_PRESETS,
  DEVICE_MOCKUP_PRESETS,
  IOS_DEVICE_PRESETS,
  TABLET_DEVICE_PRESETS,
  WATCH_DEVICE_PRESETS,
} from '@talex-touch/tuffex/device-mockup/presets'
import {
  DEVICE_MOCKUP_SCENES,
  appstoreHeroScene,
} from '@talex-touch/tuffex/device-mockup/scenes'
import { computed, onBeforeUnmount, ref } from 'vue'

registerDeviceMockupPresets(DEVICE_MOCKUP_PRESETS)

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

function encodeSvgDataUrl(svg: string): string {
  if (typeof btoa === 'function')
    return `data:image/svg+xml;base64,${btoa(svg)}`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const SAMPLE_SCREENS = [
  {
    id: 'workspace',
    en: 'App',
    zh: '工作台',
    src: encodeSvgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600">'
      + '<defs>'
      + '<linearGradient id="wbg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#090d16"/><stop offset="52%" stop-color="#0f172a"/><stop offset="100%" stop-color="#0a0f1c"/></linearGradient>'
      + '<radialGradient id="wglow" cx="82%" cy="12%" r="48%"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.26"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="warea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.34"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></linearGradient>'
      + '<linearGradient id="wline" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient>'
      + '</defs>'
      + '<rect width="900" height="1600" fill="url(#wbg)"/>'
      + '<rect width="900" height="1600" fill="url(#wglow)"/>'
      + '<rect x="52" y="138" width="796" height="84" rx="22" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.1"/>'
      + '<circle cx="102" cy="180" r="20" fill="url(#wline)"/>'
      + '<rect x="142" y="168" width="210" height="14" rx="7" fill="#f8fafc" fill-opacity="0.9"/>'
      + '<rect x="142" y="192" width="132" height="9" rx="4.5" fill="#94a3b8" fill-opacity="0.65"/>'
      + '<rect x="720" y="164" width="96" height="32" rx="16" fill="#34d399" fill-opacity="0.16" stroke="#34d399" stroke-opacity="0.38"/>'
      + '<circle cx="742" cy="180" r="5" fill="#34d399"/>'
      + '<rect x="756" y="176" width="42" height="8" rx="4" fill="#6ee7b7"/>'
      + '<rect x="52" y="252" width="384" height="204" rx="26" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.09"/>'
      + '<rect x="464" y="252" width="384" height="204" rx="26" fill="#38bdf8" fill-opacity="0.09" stroke="#7dd3fc" stroke-opacity="0.22"/>'
      + '<rect x="86" y="294" width="128" height="12" rx="6" fill="#94a3b8" fill-opacity="0.7"/>'
      + '<rect x="86" y="334" width="184" height="44" rx="12" fill="#f8fafc" fill-opacity="0.94"/>'
      + '<rect x="86" y="396" width="110" height="10" rx="5" fill="#34d399" fill-opacity="0.85"/>'
      + '<rect x="498" y="294" width="140" height="12" rx="6" fill="#bae6fd" fill-opacity="0.78"/>'
      + '<rect x="498" y="334" width="156" height="44" rx="12" fill="#7dd3fc"/>'
      + '<rect x="498" y="396" width="126" height="10" rx="5" fill="#c7d2fe" fill-opacity="0.8"/>'
      + '<rect x="52" y="488" width="796" height="392" rx="30" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.09"/>'
      + '<rect x="92" y="532" width="176" height="14" rx="7" fill="#f1f5f9" fill-opacity="0.86"/>'
      + '<rect x="92" y="560" width="114" height="10" rx="5" fill="#94a3b8" fill-opacity="0.6"/>'
      + '<line x1="92" y1="646" x2="808" y2="646" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<line x1="92" y1="726" x2="808" y2="726" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<line x1="92" y1="806" x2="808" y2="806" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<path d="M92 796 C190 778 242 698 340 714 C442 730 502 624 612 642 C698 656 746 588 808 576 L808 836 L92 836 Z" fill="url(#warea)"/>'
      + '<path d="M92 796 C190 778 242 698 340 714 C442 730 502 624 612 642 C698 656 746 588 808 576" fill="none" stroke="url(#wline)" stroke-width="7" stroke-linecap="round"/>'
      + '<circle cx="612" cy="642" r="10" fill="#ffffff" stroke="#38bdf8" stroke-width="5"/>'
      + '<rect x="52" y="914" width="796" height="134" rx="24" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.08"/>'
      + '<rect x="86" y="954" width="54" height="54" rx="16" fill="#6366f1" fill-opacity="0.22"/>'
      + '<rect x="164" y="962" width="248" height="15" rx="7.5" fill="#f8fafc" fill-opacity="0.88"/>'
      + '<rect x="164" y="990" width="164" height="10" rx="5" fill="#94a3b8" fill-opacity="0.6"/>'
      + '<rect x="706" y="966" width="106" height="30" rx="15" fill="#ffffff" fill-opacity="0.08"/>'
      + '<rect x="52" y="1072" width="796" height="134" rx="24" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.08"/>'
      + '<rect x="86" y="1112" width="54" height="54" rx="16" fill="#38bdf8" fill-opacity="0.22"/>'
      + '<rect x="164" y="1120" width="286" height="15" rx="7.5" fill="#f8fafc" fill-opacity="0.88"/>'
      + '<rect x="164" y="1148" width="184" height="10" rx="5" fill="#94a3b8" fill-opacity="0.6"/>'
      + '<rect x="706" y="1124" width="106" height="30" rx="15" fill="#ffffff" fill-opacity="0.08"/>'
      + '<rect x="52" y="1230" width="796" height="134" rx="24" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.08"/>'
      + '<rect x="86" y="1270" width="54" height="54" rx="16" fill="#34d399" fill-opacity="0.22"/>'
      + '<rect x="164" y="1278" width="224" height="15" rx="7.5" fill="#f8fafc" fill-opacity="0.88"/>'
      + '<rect x="164" y="1306" width="148" height="10" rx="5" fill="#94a3b8" fill-opacity="0.6"/>'
      + '<rect x="706" y="1282" width="106" height="30" rx="15" fill="#ffffff" fill-opacity="0.08"/>'
      + '<rect x="164" y="1434" width="572" height="84" rx="28" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.12"/>'
      + '<circle cx="268" cy="1476" r="14" fill="#38bdf8"/>'
      + '<circle cx="388" cy="1476" r="12" fill="#94a3b8" fill-opacity="0.45"/>'
      + '<circle cx="512" cy="1476" r="12" fill="#94a3b8" fill-opacity="0.45"/>'
      + '<circle cx="632" cy="1476" r="12" fill="#94a3b8" fill-opacity="0.45"/>'
      + '</svg>',
    ),
  },
  {
    id: 'analytics',
    en: 'Charts',
    zh: '看板',
    src: encodeSvgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900">'
      + '<defs>'
      + '<linearGradient id="abg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#090c14"/><stop offset="100%" stop-color="#111827"/></linearGradient>'
      + '<linearGradient id="aarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60a5fa" stop-opacity="0.32"/><stop offset="100%" stop-color="#60a5fa" stop-opacity="0"/></linearGradient>'
      + '<linearGradient id="astroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#38bdf8"/><stop offset="55%" stop-color="#818cf8"/><stop offset="100%" stop-color="#34d399"/></linearGradient>'
      + '</defs>'
      + '<rect width="1440" height="900" fill="url(#abg)"/>'
      + '<rect x="0" y="0" width="248" height="900" fill="#ffffff" fill-opacity="0.03"/>'
      + '<line x1="248" y1="0" x2="248" y2="900" stroke="#ffffff" stroke-opacity="0.08"/>'
      + '<rect x="28" y="34" width="32" height="32" rx="10" fill="url(#astroke)"/>'
      + '<rect x="74" y="43" width="116" height="14" rx="7" fill="#f8fafc" fill-opacity="0.88"/>'
      + '<rect x="24" y="102" width="200" height="38" rx="11" fill="#38bdf8" fill-opacity="0.14" stroke="#7dd3fc" stroke-opacity="0.26"/>'
      + '<rect x="44" y="116" width="96" height="10" rx="5" fill="#bae6fd"/>'
      + '<rect x="44" y="164" width="118" height="10" rx="5" fill="#94a3b8" fill-opacity="0.5"/>'
      + '<rect x="44" y="206" width="94" height="10" rx="5" fill="#94a3b8" fill-opacity="0.5"/>'
      + '<rect x="44" y="248" width="132" height="10" rx="5" fill="#94a3b8" fill-opacity="0.5"/>'
      + '<rect x="44" y="290" width="108" height="10" rx="5" fill="#94a3b8" fill-opacity="0.5"/>'
      + '<rect x="292" y="38" width="232" height="18" rx="9" fill="#f8fafc" fill-opacity="0.9"/>'
      + '<rect x="292" y="68" width="156" height="10" rx="5" fill="#94a3b8" fill-opacity="0.6"/>'
      + '<rect x="1256" y="38" width="140" height="38" rx="12" fill="url(#astroke)"/>'
      + '<rect x="292" y="118" width="348" height="164" rx="20" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.085"/>'
      + '<rect x="666" y="118" width="348" height="164" rx="20" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.085"/>'
      + '<rect x="1040" y="118" width="356" height="164" rx="20" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.085"/>'
      + '<rect x="322" y="150" width="106" height="10" rx="5" fill="#94a3b8" fill-opacity="0.68"/>'
      + '<rect x="322" y="182" width="154" height="32" rx="10" fill="#ffffff" fill-opacity="0.92"/>'
      + '<path d="M510 236 C532 224 548 232 568 206 C586 184 598 194 614 174" fill="none" stroke="#34d399" stroke-width="4" stroke-linecap="round"/>'
      + '<rect x="696" y="150" width="118" height="10" rx="5" fill="#94a3b8" fill-opacity="0.68"/>'
      + '<rect x="696" y="182" width="136" height="32" rx="10" fill="#ffffff" fill-opacity="0.92"/>'
      + '<path d="M884 226 C904 218 924 198 946 206 C964 212 978 186 988 178" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>'
      + '<rect x="1070" y="150" width="112" height="10" rx="5" fill="#94a3b8" fill-opacity="0.68"/>'
      + '<rect x="1070" y="182" width="144" height="32" rx="10" fill="#ffffff" fill-opacity="0.92"/>'
      + '<path d="M1264 232 C1286 210 1304 220 1326 196 C1344 176 1358 186 1368 170" fill="none" stroke="#a78bfa" stroke-width="4" stroke-linecap="round"/>'
      + '<rect x="292" y="312" width="1104" height="544" rx="24" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.085"/>'
      + '<rect x="332" y="352" width="188" height="14" rx="7" fill="#f8fafc" fill-opacity="0.88"/>'
      + '<line x1="332" y1="452" x2="1356" y2="452" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<line x1="332" y1="548" x2="1356" y2="548" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<line x1="332" y1="644" x2="1356" y2="644" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<line x1="332" y1="740" x2="1356" y2="740" stroke="#ffffff" stroke-opacity="0.06"/>'
      + '<path d="M332 752 C448 724 516 620 634 636 C748 652 824 516 958 532 C1084 546 1196 426 1356 414 L1356 804 L332 804 Z" fill="url(#aarea)"/>'
      + '<path d="M332 752 C448 724 516 620 634 636 C748 652 824 516 958 532 C1084 546 1196 426 1356 414" fill="none" stroke="url(#astroke)" stroke-width="5.5" stroke-linecap="round"/>'
      + '<circle cx="958" cy="532" r="9" fill="#ffffff" stroke="#38bdf8" stroke-width="4.5"/>'
      + '<rect x="892" y="460" width="132" height="50" rx="14" fill="#0f172a" stroke="#7dd3fc" stroke-opacity="0.45"/>'
      + '<rect x="914" y="479" width="88" height="12" rx="6" fill="#f8fafc" fill-opacity="0.92"/>'
      + '</svg>',
    ),
  },
  {
    id: 'editorial',
    en: 'Docs',
    zh: '文档',
    src: encodeSvgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800">'
      + '<rect width="1280" height="800" fill="#ffffff"/>'
      + '<rect x="0" y="0" width="264" height="800" fill="#f8fafc"/>'
      + '<line x1="264" y1="0" x2="264" y2="800" stroke="#e2e8f0"/>'
      + '<rect x="28" y="34" width="126" height="16" rx="8" fill="#0f172a"/>'
      + '<rect x="24" y="84" width="216" height="36" rx="10" fill="#eff6ff" stroke="#bfdbfe"/>'
      + '<rect x="42" y="97" width="114" height="10" rx="5" fill="#2563eb"/>'
      + '<rect x="42" y="146" width="138" height="10" rx="5" fill="#94a3b8"/>'
      + '<rect x="42" y="180" width="116" height="10" rx="5" fill="#cbd5e1"/>'
      + '<rect x="42" y="214" width="148" height="10" rx="5" fill="#cbd5e1"/>'
      + '<rect x="42" y="248" width="102" height="10" rx="5" fill="#cbd5e1"/>'
      + '<rect x="332" y="54" width="112" height="24" rx="12" fill="#f1f5f9"/>'
      + '<rect x="352" y="62" width="72" height="8" rx="4" fill="#64748b"/>'
      + '<rect x="332" y="98" width="448" height="32" rx="10" fill="#0f172a"/>'
      + '<rect x="332" y="148" width="664" height="14" rx="7" fill="#64748b" fill-opacity="0.72"/>'
      + '<rect x="332" y="174" width="520" height="14" rx="7" fill="#94a3b8" fill-opacity="0.65"/>'
      + '<rect x="332" y="220" width="868" height="282" rx="22" fill="#0f172a"/>'
      + '<circle cx="366" cy="252" r="6" fill="#ff5f57"/>'
      + '<circle cx="388" cy="252" r="6" fill="#febc2e"/>'
      + '<circle cx="410" cy="252" r="6" fill="#28c840"/>'
      + '<line x1="332" y1="280" x2="1200" y2="280" stroke="#ffffff" stroke-opacity="0.08"/>'
      + '<rect x="368" y="314" width="144" height="13" rx="6.5" fill="#38bdf8"/>'
      + '<rect x="526" y="314" width="212" height="13" rx="6.5" fill="#e2e8f0" fill-opacity="0.88"/>'
      + '<rect x="368" y="352" width="286" height="13" rx="6.5" fill="#a78bfa"/>'
      + '<rect x="668" y="352" width="184" height="13" rx="6.5" fill="#94a3b8"/>'
      + '<rect x="368" y="390" width="196" height="13" rx="6.5" fill="#34d399"/>'
      + '<rect x="578" y="390" width="248" height="13" rx="6.5" fill="#cbd5e1" fill-opacity="0.78"/>'
      + '<rect x="368" y="428" width="332" height="13" rx="6.5" fill="#94a3b8" fill-opacity="0.6"/>'
      + '<rect x="332" y="534" width="420" height="202" rx="20" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>'
      + '<rect x="364" y="570" width="42" height="42" rx="12" fill="#dbeafe"/>'
      + '<rect x="364" y="632" width="184" height="14" rx="7" fill="#0f172a"/>'
      + '<rect x="364" y="660" width="320" height="11" rx="5.5" fill="#94a3b8"/>'
      + '<rect x="364" y="684" width="248" height="11" rx="5.5" fill="#cbd5e1"/>'
      + '<rect x="780" y="534" width="420" height="202" rx="20" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>'
      + '<rect x="812" y="570" width="42" height="42" rx="12" fill="#ede9fe"/>'
      + '<rect x="812" y="632" width="196" height="14" rx="7" fill="#0f172a"/>'
      + '<rect x="812" y="660" width="310" height="11" rx="5.5" fill="#94a3b8"/>'
      + '<rect x="812" y="684" width="228" height="11" rx="5.5" fill="#cbd5e1"/>'
      + '</svg>',
    ),
  },
] as const

const PRESET_BY_ID = new Map<string, DeviceMockupPreset>(
  DEVICE_MOCKUP_PRESETS.map(preset => [preset.id, preset]),
)

const SCENES: readonly DeviceMockupScene[] = Array.isArray(DEVICE_MOCKUP_SCENES)
  ? DEVICE_MOCKUP_SCENES
  : Object.values(DEVICE_MOCKUP_SCENES)

const SCENE_ZH_LABELS: Record<string, string> = {
  'appstore-hero': '应用商店主视觉',
  'apple-studio': 'Apple 棚拍白',
  'liquid-obsidian': '曜石琉光',
  'editorial-minimal': '极简画报',
  'macbook-bleed': 'MacBook 出血',
  'isometric-showcase': '等距 3D',
  'warm-sunset': '暖阳落日',
  'transparent-cutout': '透明底',
}

const FINISHES: readonly { id: DeviceMockupFinish, swatch: string, en: string, zh: string }[] = [
  { id: 'obsidian', swatch: '#18181b', en: 'Obsidian', zh: '曜石黑' },
  { id: 'silver', swatch: '#d9dde3', en: 'Silver', zh: '星光银' },
  { id: 'titanium', swatch: '#bfb8ad', en: 'Titanium', zh: '原色钛' },
  { id: 'graphite', swatch: '#3f424a', en: 'Graphite', zh: '石墨灰' },
]

const GRADIENTS = Object.values(DEVICE_MOCKUP_GRADIENTS)

const mockupRef = ref<TxDeviceMockupInstance | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const activeSceneId = ref<string | null>(appstoreHeroScene.id)
const activePresetId = ref<string>('iphone-17-pro')
const orientation = ref<DeviceMockupOrientation>('portrait')
const frameStyle = ref<DeviceMockupFrameStyle>(appstoreHeroScene.frameStyle ?? 'default')
const finish = ref<DeviceMockupFinish>(appstoreHeroScene.finish ?? 'titanium')
const backdrop = ref<DeviceMockupBackdrop>(appstoreHeroScene.backdrop ?? 'mesh')
const gradientPreset = ref<DeviceMockupGradientPreset>(appstoreHeroScene.gradientPreset ?? 'cobalt')
const backdropNoise = ref(appstoreHeroScene.backdropNoise ?? true)
const screenGlare = ref(appstoreHeroScene.screenGlare ?? true)
const stageRatio = ref<DeviceMockupStageRatio>('16:9')
const shadow = ref<DeviceMockupShadowVariant>(appstoreHeroScene.shadow ?? 'elevated')
const framing = ref<DeviceMockupFraming>(appstoreHeroScene.framing ?? 'bleed-bottom')
const perspective = ref<DeviceMockupPerspective>(appstoreHeroScene.perspective ?? 'flat')
const showWatermark = ref(true)
const watermarkText = ref('tuff.tagzxia.com')
const selectedScreenId = ref<string>('workspace')
const uploadedUrl = ref<string | null>(null)
const uploadedName = ref<string>('')
const exportScale = ref<1 | 2 | 3>(2)
const exporting = ref<'svg' | 'png' | 'webp' | null>(null)
const exportFeedback = ref<string>('')

let activeFileReader: FileReader | null = null
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

const activePreset = computed<DeviceMockupPreset>(
  () => PRESET_BY_ID.get(activePresetId.value) ?? IOS_DEVICE_PRESETS[0]!,
)

const activeScreenSrc = computed(() => {
  if (uploadedUrl.value)
    return uploadedUrl.value
  return SAMPLE_SCREENS.find(item => item.id === selectedScreenId.value)?.src ?? SAMPLE_SCREENS[0].src
})

const showGradientSwatches = computed(() => backdrop.value === 'gradient' || backdrop.value === 'mesh')
const isLightSampleScreen = computed(() => selectedScreenId.value === 'editorial' && !uploadedUrl.value)

const groupedDeviceOptions = computed<TxSelectOptionGroup[]>(() => [
  { label: `iOS (${IOS_DEVICE_PRESETS.length})`, options: IOS_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
  { label: `Android (${ANDROID_DEVICE_PRESETS.length})`, options: ANDROID_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
  { label: `${zh.value ? '平板' : 'Tablet'} (${TABLET_DEVICE_PRESETS.length})`, options: TABLET_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
  { label: `${zh.value ? '桌面' : 'Desktop'} (${DESKTOP_DEVICE_PRESETS.length})`, options: DESKTOP_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
  { label: `${zh.value ? '手表' : 'Watch'} (${WATCH_DEVICE_PRESETS.length})`, options: WATCH_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
  { label: `${zh.value ? '浏览器与窗口' : 'Browser'} (${BROWSER_DEVICE_PRESETS.length})`, options: BROWSER_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
])

const frameOptions = computed<TxSelectOption[]>(() => [
  { value: 'default', label: zh.value ? '金属机身' : 'Hardware' },
  { value: 'liquid-glass', label: zh.value ? '琉光玻璃' : 'Liquid Glass' },
  { value: 'glass-light', label: zh.value ? '浅色玻璃' : 'Glass Light' },
  { value: 'glass-dark', label: zh.value ? '深色玻璃' : 'Glass Dark' },
  { value: 'inset', label: zh.value ? '内嵌' : 'Inset' },
  { value: 'outline', label: zh.value ? '极简描边' : 'Outline' },
  { value: 'border', label: zh.value ? '细边框' : 'Border' },
  { value: 'frameless', label: zh.value ? '无边框' : 'Frameless' },
])

const perspectiveOptions = computed<TxSelectOption[]>(() => [
  { value: 'flat', label: zh.value ? '平面' : 'Flat' },
  { value: 'tilt-left', label: zh.value ? '左倾' : 'Tilt Left' },
  { value: 'tilt-right', label: zh.value ? '右倾' : 'Tilt Right' },
  { value: 'isometric', label: zh.value ? '等距 3D' : 'Isometric' },
  { value: 'floating', label: zh.value ? '悬浮' : 'Floating' },
  { value: 'angled-low', label: zh.value ? '仰视' : 'Angled Low' },
])

const shadowOptions = computed<TxSelectOption[]>(() => [
  { value: 'none', label: zh.value ? '无阴影' : 'None' },
  { value: 'soft', label: zh.value ? '柔和' : 'Soft' },
  { value: 'crisp', label: zh.value ? '锐利' : 'Crisp' },
  { value: 'grounded', label: zh.value ? '着地' : 'Grounded' },
  { value: 'elevated', label: zh.value ? '抬升' : 'Elevated' },
  { value: 'dramatic', label: zh.value ? '戏剧' : 'Dramatic' },
  { value: 'ambient', label: zh.value ? '氛围光' : 'Ambient' },
])

const framingOptions = computed<TxSelectOption[]>(() => [
  { value: 'center', label: zh.value ? '居中' : 'Center' },
  { value: 'bleed-bottom', label: zh.value ? '底部出血' : 'Bleed Bottom' },
  { value: 'bleed-right', label: zh.value ? '右侧入画' : 'Bleed Right' },
  { value: 'bleed-left', label: zh.value ? '左侧入画' : 'Bleed Left' },
  { value: 'float', label: zh.value ? '悬浮' : 'Float' },
])

const backdropOptions = computed<TxSelectOption[]>(() => [
  { value: 'mesh', label: zh.value ? '弥散渐变' : 'Mesh' },
  { value: 'gradient', label: zh.value ? '线性渐变' : 'Gradient' },
  { value: 'studio', label: zh.value ? '棚拍灰白' : 'Studio' },
  { value: 'obsidian', label: zh.value ? '曜石黑' : 'Obsidian' },
  { value: 'slate', label: zh.value ? '石板灰' : 'Slate' },
  { value: 'transparent', label: zh.value ? '透明棋盘' : 'Transparent' },
])

const ratioOptions: TxSelectOption[] = [
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
  { value: 'auto', label: 'Auto' },
]

const copy = computed(() => (zh.value
  ? {
      scenesAria: '精选场景搭配',
      colDevice: '设备与画面',
      colLook: '外观与光学',
      colBackdrop: '舞台与背景',
      searchDevice: '搜索 75 款设备…',
      deviceAria: '选择设备',
      rotate: '旋转横竖屏',
      upload: '上传本地截图',
      clearUpload: '恢复示例',
      frameAria: '边框样式',
      perspectiveAria: '3D 视角',
      shadowAria: '阴影风格',
      framingAria: '构图裁切',
      backdropAria: '舞台背景',
      ratioAria: '画布比例',
      finishAria: '机身配色',
      grain: '噪点',
      glare: '反光',
      watermark: '水印',
      exportPng: '导出 PNG',
      exported: (fmt: string, scale: number) => `已生成 ${fmt.toUpperCase()}${fmt === 'svg' ? '' : ` (${scale}x)`}`,
      exportFailed: '导出失败，请重试',
    }
  : {
      scenesAria: 'Curated scene pairings',
      colDevice: 'Device & Screen',
      colLook: 'Look & Optics',
      colBackdrop: 'Backdrop & Stage',
      searchDevice: 'Search 75 devices...',
      deviceAria: 'Select device',
      rotate: 'Flip orientation',
      upload: 'Upload local image',
      clearUpload: 'Reset',
      frameAria: 'Frame style',
      perspectiveAria: '3D perspective',
      shadowAria: 'Shadow style',
      framingAria: 'Framing mode',
      backdropAria: 'Stage backdrop',
      ratioAria: 'Stage ratio',
      finishAria: 'Hardware finish',
      grain: 'Grain',
      glare: 'Glare',
      watermark: 'Watermark',
      exportPng: 'Export PNG',
      exported: (fmt: string, scale: number) => `Exported ${fmt.toUpperCase()}${fmt === 'svg' ? '' : ` (${scale}x)`}`,
      exportFailed: 'Export failed. Please try again.',
    }))

function sceneDisplayName(scene: DeviceMockupScene): string {
  return zh.value ? (SCENE_ZH_LABELS[scene.id] ?? scene.label) : scene.label
}

function sceneDotStyle(scene: DeviceMockupScene): string {
  if (scene.backdrop === 'transparent')
    return 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'
  if (scene.backdrop === 'obsidian')
    return 'radial-gradient(circle at 50% 25%, #2b3245, #080a0f)'
  if (scene.backdrop === 'studio')
    return 'radial-gradient(circle at 50% 20%, #ffffff, #dde4ef)'
  if (scene.gradientPreset && DEVICE_MOCKUP_GRADIENTS[scene.gradientPreset])
    return DEVICE_MOCKUP_GRADIENTS[scene.gradientPreset].css
  return DEVICE_MOCKUP_GRADIENTS.aurora.css
}

function selectDeviceById(id: string): void {
  const found = PRESET_BY_ID.get(id)
  if (!found)
    return
  activePresetId.value = found.id
  if (!found.orientable)
    orientation.value = 'portrait'
}

function applyScene(scene: DeviceMockupScene): void {
  activeSceneId.value = scene.id
  if (scene.backdrop)
    backdrop.value = scene.backdrop
  if (scene.gradientPreset)
    gradientPreset.value = scene.gradientPreset
  if (typeof scene.backdropNoise === 'boolean')
    backdropNoise.value = scene.backdropNoise
  if (scene.frameStyle)
    frameStyle.value = scene.frameStyle
  if (scene.finish)
    finish.value = scene.finish
  if (scene.shadow)
    shadow.value = scene.shadow
  if (scene.perspective)
    perspective.value = scene.perspective
  if (scene.framing)
    framing.value = scene.framing
  if (typeof scene.screenGlare === 'boolean')
    screenGlare.value = scene.screenGlare

  if (scene.id === 'macbook-bleed') {
    selectDeviceById('macbook-pro-16')
    if (!uploadedUrl.value)
      selectedScreenId.value = 'analytics'
  }
  else if (scene.id === 'appstore-hero' || scene.id === 'isometric-showcase') {
    selectDeviceById('iphone-17-pro')
    if (!uploadedUrl.value)
      selectedScreenId.value = 'workspace'
  }
  else if (scene.id === 'editorial-minimal') {
    if (!uploadedUrl.value)
      selectedScreenId.value = 'editorial'
  }
}

function onDeviceChange(value: TxSelectModelValue): void {
  if (typeof value === 'string')
    selectDeviceById(value)
}

function onFrameChange(value: TxSelectModelValue): void {
  if (typeof value === 'string') {
    activeSceneId.value = null
    frameStyle.value = value as DeviceMockupFrameStyle
  }
}

function onPerspectiveChange(value: TxSelectModelValue): void {
  if (typeof value === 'string') {
    activeSceneId.value = null
    perspective.value = value as DeviceMockupPerspective
  }
}

function onShadowChange(value: TxSelectModelValue): void {
  if (typeof value === 'string') {
    activeSceneId.value = null
    shadow.value = value as DeviceMockupShadowVariant
  }
}

function onFramingChange(value: TxSelectModelValue): void {
  if (typeof value === 'string') {
    activeSceneId.value = null
    framing.value = value as DeviceMockupFraming
  }
}

function onBackdropChange(value: TxSelectModelValue): void {
  if (typeof value === 'string') {
    activeSceneId.value = null
    backdrop.value = value as DeviceMockupBackdrop
  }
}

function onRatioChange(value: TxSelectModelValue): void {
  if (typeof value === 'string')
    stageRatio.value = value as DeviceMockupStageRatio
}

function toggleOrientation(): void {
  if (!activePreset.value.orientable)
    return
  orientation.value = orientation.value === 'portrait' ? 'landscape' : 'portrait'
}

function clearUploadedScreen(): void {
  if (activeFileReader) {
    activeFileReader.abort()
    activeFileReader = null
  }
  if (uploadedUrl.value) {
    uploadedUrl.value = null
    uploadedName.value = ''
  }
}

function setFeedback(message: string): void {
  exportFeedback.value = message
  if (feedbackTimer)
    clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    exportFeedback.value = ''
    feedbackTimer = null
  }, 3200)
}

function triggerFileUpload(): void {
  fileInputRef.value?.click()
}

function onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  clearUploadedScreen()
  const reader = new FileReader()
  activeFileReader = reader
  reader.onload = () => {
    if (activeFileReader !== reader)
      return
    activeFileReader = null
    if (typeof reader.result === 'string') {
      uploadedUrl.value = reader.result
      uploadedName.value = file.name
    }
  }
  reader.onerror = () => {
    if (activeFileReader === reader)
      activeFileReader = null
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function pickSampleScreen(id: string): void {
  clearUploadedScreen()
  selectedScreenId.value = id
}

async function handleExport(format: 'svg' | 'png' | 'webp'): Promise<void> {
  if (!mockupRef.value || exporting.value)
    return
  exporting.value = format
  try {
    const filename = `tuff-mockup-${activePreset.value.id}.${format}`
    if (format === 'svg') {
      const svg = await mockupRef.value.exportSvg()
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      downloadDeviceMockupBlob(blob, filename)
      setFeedback(copy.value.exported('svg', 1))
      return
    }
    const blob = await mockupRef.value.exportImage({ format, scale: exportScale.value })
    if (!blob) {
      setFeedback(copy.value.exportFailed)
      return
    }
    downloadDeviceMockupBlob(blob, filename)
    setFeedback(copy.value.exported(format, exportScale.value))
  }
  catch {
    setFeedback(copy.value.exportFailed)
  }
  finally {
    exporting.value = null
  }
}

onBeforeUnmount(() => {
  clearUploadedScreen()
  if (feedbackTimer) {
    clearTimeout(feedbackTimer)
    feedbackTimer = null
  }
})
</script>

<template>
  <div class="not-prose dm-studio-demo">
    <div class="dm-studio-demo__scenes" role="group" :aria-label="copy.scenesAria">
      <button
        v-for="scene in SCENES"
        :key="scene.id"
        type="button"
        class="dm-studio-demo__scene-chip"
        :class="{ 'is-active': activeSceneId === scene.id }"
        :aria-pressed="activeSceneId === scene.id"
        @click="applyScene(scene)"
      >
        <span class="dm-studio-demo__scene-dot" :style="{ background: sceneDotStyle(scene) }" aria-hidden="true" />
        <span>{{ sceneDisplayName(scene) }}</span>
      </button>
    </div>

    <div class="dm-studio-demo__canvas">
      <TxDeviceMockup
        ref="mockupRef"
        :device="activePreset"
        :orientation="orientation"
        :frame-style="frameStyle"
        :finish="finish"
        :backdrop="backdrop"
        :gradient-preset="gradientPreset"
        :backdrop-noise="backdropNoise"
        :screen-glare="screenGlare"
        :stage-ratio="stageRatio"
        :shadow="shadow"
        :framing="framing"
        :perspective="perspective"
        :status-bar-theme="isLightSampleScreen ? 'light' : 'dark'"
        :browser-theme="isLightSampleScreen ? 'light' : 'dark'"
        :src="activeScreenSrc"
        :alt="uploadedName || selectedScreenId"
        :watermark="showWatermark ? watermarkText : ''"
        animated
        fit="contain"
        :max-height="440"
        :stage-padding="32"
        browser-url="https://tuff.tagzxia.com"
      />
    </div>

    <div class="dm-studio-demo__inspector">
      <!-- Column 1: Device & Screen -->
      <div class="dm-studio-demo__col">
        <span class="dm-studio-demo__col-title">{{ copy.colDevice }}</span>

        <div class="dm-studio-demo__inline">
          <div class="dm-studio-demo__grow">
            <TxSelect
              :model-value="activePresetId"
              :options="groupedDeviceOptions"
              :search-placeholder="copy.searchDevice"
              :aria-label="copy.deviceAria"
              @update:model-value="onDeviceChange"
            />
          </div>
          <TxButton
            size="sm"
            variant="secondary"
            :disabled="!activePreset.orientable"
            :aria-label="copy.rotate"
            :title="copy.rotate"
            @click="toggleOrientation"
          >
            <i class="i-carbon-rotate" aria-hidden="true" />
          </TxButton>
        </div>

        <div class="dm-studio-demo__inline">
          <div class="dm-studio-demo__seg-group">
            <button
              v-for="sample in SAMPLE_SCREENS"
              :key="sample.id"
              type="button"
              class="dm-studio-demo__seg"
              :class="{ 'is-active': !uploadedUrl && selectedScreenId === sample.id }"
              :aria-pressed="!uploadedUrl && selectedScreenId === sample.id"
              @click="pickSampleScreen(sample.id)"
            >
              {{ zh ? sample.zh : sample.en }}
            </button>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="dm-studio-demo__file-input"
            @change="onFileSelected"
          >
          <TxButton
            size="sm"
            variant="secondary"
            :aria-label="copy.upload"
            :title="copy.upload"
            @click="triggerFileUpload"
          >
            <i class="i-carbon-upload" aria-hidden="true" />
          </TxButton>
          <TxButton
            v-if="uploadedUrl"
            size="sm"
            variant="ghost"
            :aria-label="copy.clearUpload"
            :title="copy.clearUpload"
            @click="clearUploadedScreen"
          >
            <i class="i-carbon-close" aria-hidden="true" />
          </TxButton>
        </div>
      </div>

      <!-- Column 2: Backdrop & Stage -->
      <div class="dm-studio-demo__col">
        <span class="dm-studio-demo__col-title">{{ copy.colBackdrop }}</span>

        <div class="dm-studio-demo__select-grid dm-studio-demo__select-grid--backdrop">
          <TxSelect
            :model-value="backdrop"
            :options="backdropOptions"
            :searchable="false"
            :aria-label="copy.backdropAria"
            @update:model-value="onBackdropChange"
          />
          <TxSelect
            :model-value="stageRatio"
            :options="ratioOptions"
            :searchable="false"
            :aria-label="copy.ratioAria"
            @update:model-value="onRatioChange"
          />
        </div>

        <div v-if="showGradientSwatches" class="dm-studio-demo__swatches">
          <button
            v-for="preset in GRADIENTS"
            :key="preset.id"
            type="button"
            class="dm-studio-demo__dot"
            :class="{ 'is-active': gradientPreset === preset.id }"
            :style="{ background: preset.css }"
            :title="preset.label"
            :aria-label="preset.label"
            :aria-pressed="gradientPreset === preset.id"
            @click="activeSceneId = null; gradientPreset = preset.id"
          />
        </div>

        <div class="dm-studio-demo__watermark-row">
          <TxSwitch v-model="showWatermark" size="small" :label="copy.watermark" />
          <div v-if="showWatermark" class="dm-studio-demo__grow">
            <TxInput v-model="watermarkText" :aria-label="copy.watermark" />
          </div>
        </div>
      </div>

      <!-- Full-width Row 2: Look & Optics -->
      <div class="dm-studio-demo__col dm-studio-demo__col--full">
        <div class="dm-studio-demo__col-head">
          <span class="dm-studio-demo__col-title">{{ copy.colLook }}</span>
          <div class="dm-studio-demo__optics-row">
            <div class="dm-studio-demo__dots" role="group" :aria-label="copy.finishAria">
              <button
                v-for="item in FINISHES"
                :key="item.id"
                type="button"
                class="dm-studio-demo__dot"
                :class="{ 'is-active': finish === item.id }"
                :style="{ background: item.swatch }"
                :title="zh ? item.zh : item.en"
                :aria-label="zh ? item.zh : item.en"
                :aria-pressed="finish === item.id"
                @click="activeSceneId = null; finish = item.id"
              />
            </div>
            <div class="dm-studio-demo__switches">
              <TxSwitch v-model="backdropNoise" size="small" :label="copy.grain" />
              <TxSwitch v-model="screenGlare" size="small" :label="copy.glare" />
            </div>
          </div>
        </div>

        <div class="dm-studio-demo__select-grid dm-studio-demo__select-grid--look">
          <TxSelect
            :model-value="frameStyle"
            :options="frameOptions"
            :searchable="false"
            :aria-label="copy.frameAria"
            @update:model-value="onFrameChange"
          />
          <TxSelect
            :model-value="perspective"
            :options="perspectiveOptions"
            :searchable="false"
            :aria-label="copy.perspectiveAria"
            @update:model-value="onPerspectiveChange"
          />
          <TxSelect
            :model-value="shadow"
            :options="shadowOptions"
            :searchable="false"
            :aria-label="copy.shadowAria"
            @update:model-value="onShadowChange"
          />
          <TxSelect
            :model-value="framing"
            :options="framingOptions"
            :searchable="false"
            :aria-label="copy.framingAria"
            @update:model-value="onFramingChange"
          />
        </div>
      </div>
    </div>

    <div class="dm-studio-demo__footer">
      <div class="dm-studio-demo__scale-group">
        <div class="dm-studio-demo__seg-group">
          <button
            v-for="s in ([1, 2, 3] as const)"
            :key="s"
            type="button"
            class="dm-studio-demo__seg"
            :class="{ 'is-active': exportScale === s }"
            :aria-pressed="exportScale === s"
            @click="exportScale = s"
          >
            {{ s }}x
          </button>
        </div>

        <p v-if="exportFeedback" class="dm-studio-demo__feedback" role="status" aria-live="polite">
          <i class="i-carbon-checkmark-filled" aria-hidden="true" />
          {{ exportFeedback }}
        </p>
      </div>

      <div class="dm-studio-demo__export-actions">
        <TxButton size="sm" variant="primary" :disabled="exporting !== null" @click="handleExport('png')">
          <i class="i-carbon-download" aria-hidden="true" />
          {{ copy.exportPng }}
        </TxButton>
        <TxButton size="sm" variant="secondary" :disabled="exporting !== null" @click="handleExport('svg')">
          SVG
        </TxButton>
        <TxButton size="sm" variant="secondary" :disabled="exporting !== null" @click="handleExport('webp')">
          WebP
        </TxButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dm-studio-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dm-studio-demo__scenes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.dm-studio-demo__scene-chip {
  flex: none;
  appearance: none;
  border: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px 0 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  color: var(--tx-text-color-regular);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.dm-studio-demo__scene-chip:hover {
  color: var(--tx-text-color-primary);
}

.dm-studio-demo__scene-chip.is-active {
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1.5px var(--tx-color-primary);
}

.dm-studio-demo__scene-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(128, 128, 138, 0.3);
}

.dm-studio-demo__canvas {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-studio-demo__inspector {
  --dm-inspector-pad: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  padding: var(--dm-inspector-pad);
  border-radius: calc(var(--dm-inspector-pad) + 8px);
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-studio-demo__col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.dm-studio-demo__col--full {
  grid-column: 1 / -1;
  padding-top: 12px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.dm-studio-demo__col-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
}

.dm-studio-demo__col-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.dm-studio-demo__inline {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dm-studio-demo__grow {
  flex: 1;
  min-width: 0;
}

.dm-studio-demo__grow :deep(.tuff-select),
.dm-studio-demo__select-grid :deep(.tuff-select) {
  width: 100%;
  min-width: 0;
}

.dm-studio-demo__select-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dm-studio-demo__select-grid--backdrop {
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.85fr);
}

.dm-studio-demo__select-grid--look {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dm-studio-demo__seg-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  min-width: 0;
}

.dm-studio-demo__inline > .dm-studio-demo__seg-group {
  flex: 1;
}

.dm-studio-demo__seg {
  appearance: none;
  border: 0;
  height: 26px;
  padding: 0 7px;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dm-studio-demo__inline > .dm-studio-demo__seg-group > .dm-studio-demo__seg {
  flex: 1;
  min-width: 0;
}

.dm-studio-demo__seg:hover {
  color: var(--tx-text-color-primary);
}

.dm-studio-demo__seg.is-active {
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-studio-demo__optics-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dm-studio-demo__dots,
.dm-studio-demo__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.dm-studio-demo__dot {
  appearance: none;
  border: 0;
  width: 17px;
  height: 17px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}

.dm-studio-demo__dot.is-active {
  box-shadow:
    0 0 0 2px var(--tx-bg-color),
    0 0 0 3.5px var(--tx-color-primary);
}

.dm-studio-demo__scene-chip:focus-visible,
.dm-studio-demo__seg:focus-visible,
.dm-studio-demo__dot:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}

.dm-studio-demo__switches {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dm-studio-demo__watermark-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dm-studio-demo__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.dm-studio-demo__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
}

.dm-studio-demo__scale-group,
.dm-studio-demo__export-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dm-studio-demo__feedback {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--tx-color-success);
}

@media (max-width: 640px) {
  .dm-studio-demo__inspector {
    grid-template-columns: minmax(0, 1fr);
  }

  .dm-studio-demo__select-grid--look {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
