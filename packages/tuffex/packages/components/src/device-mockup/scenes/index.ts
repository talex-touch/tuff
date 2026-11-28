import type { DeviceMockupScene, DeviceMockupSceneId } from '../src/types'

export const appstoreHeroScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'appstore-hero',
  label: 'App Store Hero',
  description: 'Cobalt mesh stage with rising bottom bleed and glossy titanium frame.',
  backdrop: 'mesh',
  gradientPreset: 'cobalt',
  backdropNoise: true,
  frameStyle: 'default',
  finish: 'titanium',
  shadow: 'elevated',
  perspective: 'flat',
  framing: 'bleed-bottom',
  screenGlare: true,
})

export const appleStudioScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'apple-studio',
  label: 'Apple Studio',
  description: 'Clean silver mist cyclorama with grounded floor contact shadow.',
  backdrop: 'gradient',
  gradientPreset: 'silver-mist',
  backdropNoise: false,
  frameStyle: 'default',
  finish: 'silver',
  shadow: 'grounded',
  perspective: 'flat',
  framing: 'center',
  screenGlare: false,
})

export const liquidObsidianScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'liquid-obsidian',
  label: 'Liquid Obsidian',
  description: 'Midnight mesh backdrop paired with tilted liquid-glass optics and ambient glow.',
  backdrop: 'mesh',
  gradientPreset: 'midnight',
  backdropNoise: true,
  frameStyle: 'liquid-glass',
  finish: 'obsidian',
  shadow: 'ambient',
  perspective: 'tilt-left',
  framing: 'center',
  screenGlare: true,
})

export const editorialMinimalScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'editorial-minimal',
  label: 'Editorial Minimal',
  description: 'Warm sand paper grain with crisp tight shadow and hairline border.',
  backdrop: 'gradient',
  gradientPreset: 'sand',
  backdropNoise: true,
  frameStyle: 'border',
  finish: 'graphite',
  shadow: 'crisp',
  perspective: 'flat',
  framing: 'center',
  screenGlare: false,
})

export const macbookBleedScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'macbook-bleed',
  label: 'MacBook Bleed',
  description: 'Aurora mesh stage with dramatic right-edge bleed and subtle angle.',
  backdrop: 'mesh',
  gradientPreset: 'aurora',
  backdropNoise: true,
  frameStyle: 'default',
  finish: 'graphite',
  shadow: 'dramatic',
  perspective: 'tilt-right',
  framing: 'bleed-right',
  screenGlare: true,
})

export const isometricShowcaseScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'isometric-showcase',
  label: 'Isometric Showcase',
  description: 'True extruded 3D isometric tabletop shot over grained graphite.',
  backdrop: 'mesh',
  gradientPreset: 'graphite',
  backdropNoise: true,
  frameStyle: 'default',
  finish: 'titanium',
  shadow: 'grounded',
  perspective: 'isometric',
  framing: 'center',
  screenGlare: true,
})

export const warmSunsetScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'warm-sunset',
  label: 'Warm Sunset',
  description: 'Soft peach gradient with frosted light glass floating gently.',
  backdrop: 'gradient',
  gradientPreset: 'peach',
  backdropNoise: true,
  frameStyle: 'glass-light',
  finish: 'silver',
  shadow: 'soft',
  perspective: 'floating',
  framing: 'float',
  screenGlare: true,
})

export const transparentCutoutScene: DeviceMockupScene = /*#__PURE__*/ Object.freeze({
  id: 'transparent-cutout',
  label: 'Transparent Cutout',
  description: 'Alpha-ready transparent stage for deck and landing-page compositing.',
  backdrop: 'transparent',
  gradientPreset: 'aurora',
  backdropNoise: false,
  frameStyle: 'default',
  finish: 'obsidian',
  shadow: 'elevated',
  perspective: 'flat',
  framing: 'center',
  screenGlare: false,
})

export const DEVICE_MOCKUP_SCENES: readonly DeviceMockupScene[] = /*#__PURE__*/ Object.freeze([
  appstoreHeroScene,
  appleStudioScene,
  liquidObsidianScene,
  editorialMinimalScene,
  macbookBleedScene,
  isometricShowcaseScene,
  warmSunsetScene,
  transparentCutoutScene,
])

let sceneMap: Map<string, DeviceMockupScene> | null = null

export function getDeviceMockupScene(
  idOrScene: DeviceMockupSceneId | DeviceMockupScene | string | null | undefined,
): DeviceMockupScene | undefined {
  if (!idOrScene)
    return undefined
  if (typeof idOrScene === 'object')
    return idOrScene
  if (!sceneMap)
    sceneMap = new Map(DEVICE_MOCKUP_SCENES.map(scene => [scene.id, scene]))
  return sceneMap.get(idOrScene)
}
