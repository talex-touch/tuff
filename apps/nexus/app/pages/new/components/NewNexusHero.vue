<script setup lang="ts">
import type { LogoItem } from './LogoLoop.vue'
import { hasNavigator } from '@talex-touch/utils/env'
import { defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue'
import TuffLandingLineShadowText from '~/components/tuff/landing/TuffLandingLineShadowText.vue'
import { useLandingRevealState } from '~/composables/useLandingRevealState'
import LogoLoop from './LogoLoop.vue'

const DarkVeil = defineAsyncComponent(() => import('~/components/tuff/background/DarkVeil.vue'))

type HeroPlatform = 'darwin' | 'win32' | 'linux'

const { locale, t } = useI18n()
const heroPlatform = ref<HeroPlatform>('darwin')
const heroReady = ref(false)
const {
  beginSequence,
  resetSequence,
  contentVisible,
  interactiveReady,
} = useLandingRevealState()

const isZh = computed(() => locale.value.startsWith('zh'))

// Inline route-local brand SVGs keep 9 multi-KB `i-logos-*` icons (~21.7 KB raw) out of
// the global `__uno_icons.css` stylesheet downloaded on every page.
function agentBrandNode(label: string, width: number, height: number, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`
  return `<span aria-hidden="true"><img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block" /></span><span>${label}</span>`
}

const agentLogos: LogoItem[] = [
  { node: agentBrandNode("Codex", 256, 260, "<path d=\"M239.184 106.203a64.72 64.72 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.72 64.72 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.67 64.67 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.77 64.77 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483m-97.56 136.338a48.4 48.4 0 0 1-31.105-11.255l1.535-.87l51.67-29.825a8.6 8.6 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601M37.158 197.93a48.35 48.35 0 0 1-5.781-32.589l1.534.921l51.722 29.826a8.34 8.34 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803M23.549 85.38a48.5 48.5 0 0 1 25.58-21.333v61.39a8.29 8.29 0 0 0 4.195 7.316l62.874 36.272l-21.845 12.636a.82.82 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405zm179.466 41.695l-63.08-36.63L161.73 77.86a.82.82 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.54 8.54 0 0 0-4.4-7.213m21.742-32.69l-1.535-.922l-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.72.72 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391zM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87l-51.67 29.825a8.6 8.6 0 0 0-4.246 7.367zm11.868-25.58L128.067 97.3l28.188 16.218v32.434l-28.086 16.218l-28.188-16.218z\"/>"), title: "Codex" },
  { node: agentBrandNode("Claude Code", 256, 257, "<path fill=\"#d97757\" d=\"m50.228 170.321l50.357-28.257l.843-2.463l-.843-1.361h-2.462l-8.426-.518l-28.775-.778l-24.952-1.037l-24.175-1.296l-6.092-1.297L0 125.796l.583-3.759l5.12-3.434l7.324.648l16.202 1.101l24.304 1.685l17.629 1.037l26.118 2.722h4.148l.583-1.685l-1.426-1.037l-1.101-1.037l-25.147-17.045l-27.22-18.017l-14.258-10.37l-7.713-5.25l-3.888-4.925l-1.685-10.758l7-7.713l9.397.649l2.398.648l9.527 7.323l20.35 15.75L94.817 91.9l3.889 3.24l1.555-1.102l.195-.777l-1.75-2.917l-14.453-26.118l-15.425-26.572l-6.87-11.018l-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0l10.63 1.426l4.472 3.888l6.61 15.101l10.694 23.786l16.591 32.34l4.861 9.592l2.592 8.879l.973 2.722h1.685v-1.556l1.36-18.211l2.528-22.36l2.463-28.776l.843-8.1l4.018-9.722l7.971-5.25l6.222 2.981l5.12 7.324l-.713 4.73l-3.046 19.768l-5.962 30.98l-3.889 20.739h2.268l2.593-2.593l10.499-13.934l17.628-22.036l7.778-8.749l9.073-9.657l5.833-4.601h11.018l8.1 12.055l-3.628 12.443l-11.342 14.388l-9.398 12.184l-13.48 18.147l-8.426 14.518l.778 1.166l2.01-.194l30.46-6.481l16.462-2.982l19.637-3.37l8.88 4.148l.971 4.213l-3.5 8.62l-20.998 5.184l-24.628 4.926l-36.682 8.685l-.454.324l.519.648l16.526 1.555l7.065.389h17.304l32.21 2.398l8.426 5.574l5.055 6.805l-.843 5.184l-12.962 6.611l-17.498-4.148l-40.83-9.721l-14-3.5h-1.944v1.167l11.666 11.406l21.387 19.314l26.767 24.887l1.36 6.157l-3.434 4.86l-3.63-.518l-23.526-17.693l-9.073-7.972l-20.545-17.304h-1.36v1.814l4.73 6.935l25.017 37.59l1.296 11.536l-1.814 3.76l-6.481 2.268l-7.13-1.297l-14.647-20.544l-15.1-23.138l-12.185-20.739l-1.49.843l-7.194 77.448l-3.37 3.953l-7.778 2.981l-6.48-4.925l-3.436-7.972l3.435-15.749l4.148-20.544l3.37-16.333l3.046-20.285l1.815-6.74l-.13-.454l-1.49.194l-15.295 20.999l-23.267 31.433l-18.406 19.702l-4.407 1.75l-7.648-3.954l.713-7.064l4.277-6.286l25.47-32.405l15.36-20.092l9.917-11.6l-.065-1.686h-.583L44.07 198.125l-12.055 1.555l-5.185-4.86l.648-7.972l2.463-2.593l20.35-13.999z\"/>"), title: "Claude Code" },
  { node: '<span class="NewAgentLogoMark">Pi</span><span>Pi Agent</span>', title: 'Pi Agent' },
  { node: '<span class="NewAgentLogoMark">OC</span><span>OpenCode</span>', title: 'OpenCode' },
  { node: '<span class="NewAgentLogoMark">H</span><span>Hermes</span>', title: 'Hermes Agent' },
  { node: '<span class="NewAgentLogoMark">OC</span><span>OpenClaw</span>', title: 'OpenClaw' },
  { node: agentBrandNode("Copilot", 256, 208, "<path d=\"M205.28 31.36c14.096 14.88 20.016 35.2 22.512 63.68c6.626 0 12.805 1.47 16.976 7.152l7.792 10.56A17.55 17.55 0 0 1 256 123.2v28.688c-.008 3.704-1.843 7.315-4.832 9.504C215.885 187.222 172.35 208 128 208c-49.066 0-98.19-28.273-123.168-46.608c-2.989-2.189-4.825-5.8-4.832-9.504V123.2c0-3.776 1.2-7.424 3.424-10.464l7.792-10.544c4.173-5.657 10.38-7.152 16.992-7.152c2.496-28.48 8.4-48.8 22.512-63.68C77.331 3.165 112.567.06 127.552 0H128c14.72 0 50.4 2.88 77.28 31.36m-77.264 47.376c-3.04 0-6.544.176-10.272.544c-1.312 4.896-3.248 9.312-6.08 12.128c-11.2 11.2-24.704 12.928-31.936 12.928c-6.802 0-13.927-1.42-19.744-5.088c-5.502 1.808-10.786 4.415-11.136 10.912c-.586 12.28-.637 24.55-.688 36.824c-.026 6.16-.05 12.322-.144 18.488c.024 3.579 2.182 6.903 5.44 8.384C79.936 185.92 104.976 192 128.016 192c23.008 0 48.048-6.08 74.512-18.144c3.258-1.48 5.415-4.805 5.44-8.384c.317-18.418.062-36.912-.816-55.312h.016c-.342-6.534-5.648-9.098-11.168-10.912c-5.82 3.652-12.927 5.088-19.728 5.088c-7.232 0-20.72-1.728-31.936-12.928c-2.832-2.816-4.768-7.232-6.08-12.128a106 106 0 0 0-10.24-.544m-26.941 43.93c5.748 0 10.408 4.66 10.408 10.409v19.183c0 5.749-4.66 10.409-10.408 10.409s-10.408-4.66-10.408-10.409v-19.183c0-5.748 4.66-10.408 10.408-10.408m53.333 0c5.749 0 10.409 4.66 10.409 10.409v19.183c0 5.749-4.66 10.409-10.409 10.409c-5.748 0-10.408-4.66-10.408-10.409v-19.183c0-5.748 4.66-10.408 10.408-10.408M81.44 28.32c-11.2 1.12-20.64 4.8-25.44 9.92c-10.4 11.36-8.16 40.16-2.24 46.24c4.32 4.32 12.48 7.2 21.28 7.2c6.72 0 19.52-1.44 30.08-12.16c4.64-4.48 7.52-15.68 7.2-27.04c-.32-9.12-2.88-16.64-6.72-19.84c-4.16-3.68-13.6-5.28-24.16-4.32m68.96 4.32c-3.84 3.2-6.4 10.72-6.72 19.84c-.32 11.36 2.56 22.56 7.2 27.04c10.56 10.72 23.36 12.16 30.08 12.16c8.8 0 16.96-2.88 21.28-7.2c5.92-6.08 8.16-34.88-2.24-46.24c-4.8-5.12-14.24-8.8-25.44-9.92c-10.56-.96-20 .64-24.16 4.32M128 56c-2.56 0-5.6.16-8.96.48c.32 1.76.48 3.68.64 5.76c0 1.44 0 2.88-.16 4.48c3.2-.32 5.92-.32 8.48-.32s5.28 0 8.48.32c-.16-1.6-.16-3.04-.16-4.48c.16-2.08.32-4 .64-5.76c-3.36-.32-6.4-.48-8.96-.48\"/>"), title: "GitHub Copilot" },
  { node: '<span class="NewAgentLogoMark">C</span><span>Cursor</span>', title: 'Cursor' },
  { node: agentBrandNode("Qwen Code", 256, 253, "<path fill=\"#623ae7\" d=\"M129.263 0a6.75 6.75 0 0 1 5.88 3.374l15.256 26.424l65.258-.482a6.75 6.75 0 0 1 5.892 3.373l16.843 29.172a6.75 6.75 0 0 1-.038 6.811l-15.569 26.29a6.7 6.7 0 0 1-.887 1.182l33.195 56.28a6.75 6.75 0 0 1 .021 6.72l-16.94 29.706a6.75 6.75 0 0 1-5.86 3.405h-30.513l-32.21 56.756a6.75 6.75 0 0 1-5.868 3.417h-33.686a6.75 6.75 0 0 1-5.88-3.438l-15.022-26.7l-67.31.06a6.75 6.75 0 0 1-5.831-3.343l-17.256-29.523a6.75 6.75 0 0 1-.018-6.777l15.256-26.425L.929 100.008a6.75 6.75 0 0 1-.025-6.79l16.843-29.172a6.75 6.75 0 0 1 5.917-3.374l30.553.339a6.7 6.7 0 0 1 1.789.262L89.258 3.562a6.75 6.75 0 0 1 5.81-3.379z\"/><path fill=\"#fff\" d=\"m180.679 97.445l36.108.025l33.198 58.74h-34.51l-17.266-30.239l-68.54 119.948l-17.218-29.263zM57.85 66.893l69.028 118.902l-17.872 30.86l-67.905-.622l17.255-29.887l34.82.166L23.567 66.981zm37.24-60.8l17.256 29.887l-17.554 30.07l138.147-.616l-17.064 29.733l-137.896.33L59.917 66.05z\"/>"), title: "Qwen Code" },
  { node: '<span class="NewAgentLogoMark">A</span><span>Auggie</span>', title: 'Auggie CLI' },
  { node: agentBrandNode("Gemini CLI", 512, 188, "<defs><radialGradient id=\"SVGPMo0zqwk\" cx=\"85.738%\" cy=\"25.354%\" r=\"103.154%\" fx=\"85.738%\" fy=\"25.354%\" gradientTransform=\"matrix(-.86887 .47915 -.39276 -.66723 1.702 .012)\"><stop offset=\"0%\" stop-color=\"#5baeff\"/><stop offset=\"100%\" stop-color=\"#9cbfff\"/></radialGradient><radialGradient id=\"SVG6LOdsc2X\" cx=\"61.879%\" cy=\"26.683%\" r=\"80.612%\" fx=\"61.879%\" fy=\"26.683%\" gradientTransform=\"matrix(-.14736 .90946 -.98908 -.1355 .974 -.26)\"><stop offset=\"0%\" stop-color=\"#409dff\"/><stop offset=\"100%\" stop-color=\"#64b0ff\"/></radialGradient><radialGradient id=\"SVGRoCRHePI\" cx=\"53.184%\" cy=\"19.021%\" r=\"110.789%\" fx=\"53.184%\" fy=\"19.021%\" gradientTransform=\"matrix(-.16226 .97112 -.66046 -.23858 .744 -.28)\"><stop offset=\"0%\" stop-color=\"#177cff\"/><stop offset=\"100%\" stop-color=\"#4da4ff\"/></radialGradient><radialGradient id=\"SVG8W8bkc7G\" cx=\"-182.665%\" cy=\"10.869%\" r=\"521.404%\" fx=\"-182.665%\" fy=\"10.869%\" gradientTransform=\"matrix(.41608 .16332 -.90933 .07473 -.968 .399)\"><stop offset=\"0%\" stop-color=\"#1c7aff\"/><stop offset=\"100%\" stop-color=\"#76a9ff\"/><stop offset=\"100%\" stop-color=\"#8fb9ff\"/></radialGradient><linearGradient id=\"SVGKvzpwcOj\" x1=\"48.887%\" x2=\"48.887%\" y1=\"8.809%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"#076eff\"/><stop offset=\"100%\" stop-color=\"#3e93ff\"/></linearGradient><linearGradient id=\"SVGaWXYB1Pi\" x1=\"13.217%\" x2=\"78.598%\" y1=\"0%\" y2=\"94.201%\"><stop offset=\"0%\" stop-color=\"#076eff\"/><stop offset=\"100%\" stop-color=\"#69a3ff\"/></linearGradient></defs><path fill=\"url(#SVGPMo0zqwk)\" d=\"M125.939 126.64q0 26.094-15.482 41.575q-17.395 18.438-45.748 18.438q-27.135 0-45.923-18.786Q0 149.08 0 121.597q0-27.485 18.786-46.27Q37.573 56.54 64.71 56.54q13.741 0 25.918 4.87t20.004 13.742l-11.48 11.48q-5.74-6.957-14.873-10.871t-19.57-3.914q-20.351 0-34.441 14.09q-13.916 14.264-13.916 35.66t13.916 35.659q14.09 14.09 34.442 14.09q18.613 0 30.963-10.437t14.263-28.702H64.71v-14.96h60.36q.87 4.872.87 9.394\"/><path fill=\"url(#SVG6LOdsc2X)\" d=\"M176.17 96.205q19.152 0 30.485 12.387q11.334 12.388 11.334 34.703l-.176 1.757h-67.648q.352 12.651 8.434 20.382q8.083 7.73 19.328 7.73q15.462 0 24.248-15.461l14.408 7.028q-5.799 10.894-16.077 17.044t-23.282 6.15q-18.976 0-31.276-13.003t-12.299-32.857q0-19.68 11.948-32.77t30.573-13.09m-.351 14.76q-9.137 0-15.726 5.622q-6.59 5.623-8.698 15.11h49.374q-.702-8.96-7.292-14.846t-17.658-5.887\"/><path fill=\"url(#SVGRoCRHePI)\" d=\"M244.493 184.843h-16.116V99.008h15.416v11.912h.7q3.68-6.306 11.299-10.51q7.62-4.206 15.153-4.205q9.459 0 16.641 4.38q7.182 4.379 10.51 12.086q10.687-16.466 29.605-16.466q14.89 0 22.948 9.11q8.058 9.108 8.058 25.925v53.603h-16.116v-51.15q0-12.088-4.38-17.43q-4.379-5.343-14.714-5.343q-9.285 0-15.59 7.883q-6.307 7.882-6.307 18.568v47.472h-16.116v-51.15q0-12.088-4.38-17.43q-4.379-5.343-14.714-5.343q-9.285 0-15.59 7.883q-6.307 7.882-6.307 18.568z\"/><path fill=\"url(#SVGKvzpwcOj)\" d=\"M393.263 69.216q0 4.737-3.334 8.07q-3.334 3.335-8.071 3.335t-8.071-3.334t-3.334-8.071q0-4.738 3.334-8.071q3.334-3.334 8.07-3.334q4.74 0 8.072 3.334q3.334 3.334 3.334 8.07m-3.334 29.652v85.975h-16.142V98.868z\"/><path fill=\"url(#SVG8W8bkc7G)\" d=\"M512 69.216q0 4.737-3.334 8.07q-3.334 3.335-8.07 3.335q-4.74 0-8.072-3.334q-3.333-3.334-3.334-8.071q0-4.738 3.334-8.071q3.334-3.334 8.071-3.334t8.071 3.334t3.334 8.07m-3.334 29.652v85.975h-16.142V98.868z\"/><path fill=\"url(#SVGaWXYB1Pi)\" d=\"M404.004 99.008h15.415v11.912h.7q3.68-6.306 11.3-10.51q7.62-4.206 15.853-4.205q15.765 0 24.261 9.022q8.496 9.02 8.496 25.663v53.953h-16.116v-52.902q-.526-21.021-21.196-21.021q-9.634 0-16.116 7.795t-6.481 18.656v47.472h-16.116z\"/><path fill=\"#076eff\" d=\"M348.374 72.76c-2.846-18.788-17.592-33.533-36.38-36.38c18.788-2.847 33.534-17.593 36.38-36.38c2.847 18.787 17.593 33.533 36.38 36.38c-18.787 2.847-33.533 17.592-36.38 36.38\"/>"), title: "Gemini CLI" },
  { node: agentBrandNode("Kimi Code", 256, 256, "<path d=\"m11.222 180.43l101.75 27.218a224 224 0 0 0 .64 21.683l63.53 16.99a128 128 0 0 1-59.584 9.226l-1.92-.17l-.47-.044l-.896-.095l-1.002-.107q-.838-.101-1.675-.213l-1.141-.15l-1.174-.17q-1.71-.25-3.413-.544l-.448-.086l-.8-.138l-1.141-.214l-.747-.16l-.992-.202l-.8-.17l-1.013-.214l-1.035-.246l-1.003-.234l-.725-.182l-.939-.234l-.96-.256l-1.013-.267l-.874-.245l-1.163-.32l-.661-.213l-.896-.267l-.992-.299l-1.12-.362l-.62-.203l-.852-.277l-.96-.33l-.704-.257l-.47-.16l-.725-.266l-1.077-.395l-.608-.235l-.854-.32l-.928-.373l-.938-.373l-.843-.342l-1.013-.426l-.672-.299l-.672-.288l-.438-.192l-.704-.32l-1.098-.501l-.555-.256l-1.024-.49l-.661-.32l-.896-.427l-.918-.47l-.992-.5l-.554-.289l-1.1-.586l-.607-.32l-.619-.342l-.49-.277l-1.003-.565l-.64-.363l-.544-.32l-.768-.437l-.875-.533l-.992-.598l-.554-.34l-.896-.566l-.651-.416l-.843-.533l-.746-.502l-.566-.373l-.576-.384l-.469-.32l-.47-.32l-.426-.299l-.608-.426l-.81-.576l-.737-.533l-.789-.576l-.597-.448l-.811-.608l-.81-.63l-.918-.714l-.48-.373l-.683-.555l-.789-.64l-.95-.778l-.49-.416l-.49-.416l-.46-.395l-.48-.427l-.65-.565l-.747-.661l-.725-.64l-.661-.619l-.715-.661l-.565-.533l-.939-.896q-.531-.514-1.056-1.035l-.31-.298l-.437-.448l-.736-.747l-.533-.544l-.533-.565a69 69 0 0 1-1.792-1.91l-.854-.938l-.661-.746l-.757-.854l-.448-.522l-.566-.662l-.618-.725l-.491-.597l-.288-.352l-.48-.587l-.704-.874l-.437-.555l-.534-.682l-.213-.267a128 128 0 0 1-15.36-25.619M.342 118.632l121.098 32.391a218 218 0 0 0-5.002 21.449l115.38 30.866a128.8 128.8 0 0 1-19.68 21.384L7.009 169.838l-.17-.49l-.373-1.11q-.273-.813-.534-1.631l-.074-.246a127 127 0 0 1-2.208-7.903l-.32-1.344l-.192-.853l-.224-1.034l-.192-.864l-.192-.96l-.182-.896l-.192-1.003a126 126 0 0 1-.757-4.543l-.181-1.259l-.118-.885l-.138-1.088a128 128 0 0 1-.203-1.717l-.053-.501c-.797-7.6-.919-15.256-.363-22.878m16.992-54.928L144.78 97.793a218 218 0 0 0-10.773 19.997l120.48 32.232a126.4 126.4 0 0 1-7.126 25.224l-123.2-32.957L1.323 109.44l.16-1.066l.086-.523l.106-.714l.16-.928l.192-1.046c.278-1.578.598-3.146.94-4.714l.298-1.322l.213-.907l.256-1.034c.235-.96.48-1.92.747-2.859l.298-1.088l.246-.885l.32-1.066l.266-.875l.32-1.024l.278-.875l.33-1.013a127 127 0 0 1 10.774-23.805zm47.381-46.928l120.373 32.189a222 222 0 0 0-18.005 18.355l83.445 22.323A127.8 127.8 0 0 1 256 118.068L22.465 55.61l.48-.693l.288-.427l.426-.586l.491-.694l.587-.81l.576-.768l.682-.917l.534-.694l.608-.778l.586-.747l.64-.789l.587-.736l.693-.821l.576-.704l.704-.821l.566-.64l.768-.875l.565-.64l.715-.789l.576-.619l.778-.832l.619-.64l.672-.714l1.792-1.813l1.067-1.045l.629-.598l.81-.757a129 129 0 0 1 24.235-17.886M128.182.01h1.034l.875.01l.736.011l.576.021l.725.022l.491.01l.81.032l.502.022l.64.032l.576.021l.928.053l1.12.075l1.536.117l.939.075l.469.043l.821.085l.875.085l.501.054l1.088.128l.534.064l1.152.149l.864.107l.448.064l.693.106l2.208.341l.747.128l.693.118l1.493.277l.982.192l1.173.235l.49.106l.8.171l.438.107l.661.138l.448.107l.694.16l.522.128l.758.181l1.024.256l1.194.32l1.206.32l1.205.341l.533.16l.747.214l.832.256l.779.245l.533.17l.533.171l.81.267l1.057.352l1.088.384l.512.181l.683.246l.992.362l1.173.437l1.237.48l1.067.427l.501.213l.64.256l.438.192l.672.278l.426.192l.608.266l1.174.512l1.066.49l.79.374l.8.384l.64.299l.98.49l.972.48l1.088.555l.565.298l.523.278l.49.256l.64.352l.438.234l.554.31l.939.533l1.13.64l.929.544l.608.362l.565.342l1.024.629l.939.587l1.045.66l.384.257l.683.437l.896.597l.426.288l.662.448l.66.459l.246.181c.576.395 1.152.8 1.717 1.216l.886.64l.693.512l.597.459l.918.693l.874.683l.427.32l.533.437l.918.736l.842.693l.907.757a129 129 0 0 1 20.363 21.662L77.035 10.612l.662-.288l.693-.298l.864-.363l.917-.373c1.206-.48 2.422-.96 3.638-1.397l1.024-.374l.992-.352l.896-.32l1.024-.33c.928-.32 1.877-.619 2.816-.907l.97-.288l.918-.267l1.088-.32l.906-.245l1.067-.277l.917-.256l.96-.245l.97-.235l1.014-.235l.96-.213l1.045-.224l.971-.213l1.013-.192l.982-.192l1.066-.192l.971-.17l1.045-.182l.982-.15l1.034-.16l.982-.138l1.088-.139l.97-.128l1.12-.128l.96-.106l1.12-.107a69 69 0 0 1 2.987-.256l1.13-.085l.96-.054l1.174-.064l.992-.042l1.067-.043l1.034-.021L126.08.02l2.102-.02z\"/>"), title: "Kimi Code CLI" },
  { node: agentBrandNode("Amp", 256, 262, "<path fill=\"#f96316\" d=\"m74.203 33.602l56.952 208.194c3.827 13.991 18.27 22.23 32.254 18.4c13.993-3.833 22.224-18.28 18.394-32.27l-56.962-208.2c-3.83-13.987-18.27-22.228-32.254-18.394C78.607 5.157 70.373 19.609 74.203 33.6z\"/><path fill=\"#b200f8\" d=\"M179.662 32.813L37.046 193.858c-9.621 10.86-8.616 27.464 2.233 37.087c10.85 9.62 27.438 8.617 37.059-2.238L218.954 67.665c9.621-10.86 8.616-27.459-2.233-37.083c-10.854-9.63-27.446-8.624-37.059 2.23z\"/><path fill=\"#00b4f2\" d=\"m18.065 122.054l203.387 67.293c13.765 4.552 28.615-2.92 33.167-16.696c4.562-13.774-2.911-28.63-16.681-33.189L34.556 72.175C20.786 67.62 5.942 75.091 1.387 88.867c-4.55 13.775 2.924 28.635 16.682 33.187z\"/>"), title: "Amp" },
  { node: '<span class="i-carbon-snowflake"></span><span>Cortex</span>', title: 'Cortex Code' },
  { node: '<span class="NewAgentLogoMark">CL</span><span>Cline</span>', title: 'Cline' },
  { node: agentBrandNode("Mistral Vibe", 256, 233, "<path d=\"M186.182 0h46.545v46.545h-46.545z\"/><path fill=\"#f7d046\" d=\"M209.455 0H256v46.545h-46.545z\"/><path d=\"M0 0h46.545v46.545H0zm0 46.545h46.545V93.09H0zm0 46.546h46.545v46.545H0zm0 46.545h46.545v46.545H0zm0 46.546h46.545v46.545H0z\"/><path fill=\"#f7d046\" d=\"M23.273 0h46.545v46.545H23.273z\"/><path fill=\"#f2a73b\" d=\"M209.455 46.545H256V93.09h-46.545zm-186.182 0h46.545V93.09H23.273z\"/><path d=\"M139.636 46.545h46.545V93.09h-46.545z\"/><path fill=\"#f2a73b\" d=\"M162.909 46.545h46.545V93.09h-46.545zm-93.091 0h46.545V93.09H69.818z\"/><path fill=\"#ee792f\" d=\"M116.364 93.091h46.545v46.545h-46.545zm46.545 0h46.545v46.545h-46.545zm-93.091 0h46.545v46.545H69.818z\"/><path d=\"M93.091 139.636h46.545v46.545H93.091z\"/><path fill=\"#eb5829\" d=\"M116.364 139.636h46.545v46.545h-46.545z\"/><path fill=\"#ee792f\" d=\"M209.455 93.091H256v46.545h-46.545zm-186.182 0h46.545v46.545H23.273z\"/><path d=\"M186.182 139.636h46.545v46.545h-46.545z\"/><path fill=\"#eb5829\" d=\"M209.455 139.636H256v46.545h-46.545z\"/><path d=\"M186.182 186.182h46.545v46.545h-46.545z\"/><path fill=\"#eb5829\" d=\"M23.273 139.636h46.545v46.545H23.273z\"/><path fill=\"#ea3326\" d=\"M209.455 186.182H256v46.545h-46.545zm-186.182 0h46.545v46.545H23.273z\"/>"), title: "Mistral Vibe" },
  { node: agentBrandNode("CodeWhale", 256, 189, "<path fill=\"#4d6bfe\" d=\"M253.314 15.812c-2.711-1.329-3.88 1.203-5.465 2.49c-.542.414-1.001.954-1.46 1.452c-3.963 4.232-8.594 7.013-14.643 6.68c-8.845-.497-16.396 2.284-23.071 9.048c-1.419-8.341-6.133-13.322-13.309-16.517c-3.754-1.66-7.55-3.32-10.179-6.931c-1.836-2.572-2.336-5.436-3.254-8.258c-.584-1.702-1.168-3.445-3.13-3.736c-2.127-.331-2.961 1.452-3.796 2.947c-3.337 6.101-4.63 12.824-4.506 19.63c.292 15.315 6.759 27.515 19.608 36.19c1.46.995 1.836 1.99 1.377 3.444c-.876 2.988-1.92 5.893-2.837 8.88c-.584 1.91-1.46 2.325-3.504 1.494c-7.051-2.945-13.142-7.304-18.524-12.574c-9.136-8.84-17.397-18.592-27.701-26.228a121 121 0 0 0-7.343-5.022c-10.513-10.209 1.377-18.593 4.13-19.588c2.879-1.038 1.002-4.607-8.302-4.565s-17.814 3.154-28.66 7.304c-1.586.623-3.255 1.079-4.966 1.452c-9.845-1.867-20.066-2.283-30.747-1.079c-20.108 2.241-36.17 11.745-47.976 27.972C.872 59.802-2.466 81.963 1.623 105.079c4.297 24.36 16.729 44.53 35.837 60.301c19.816 16.35 42.637 24.36 68.67 22.825c15.81-.913 33.416-3.029 53.275-19.837c5.005 2.49 10.262 3.486 18.982 4.233c6.717.623 13.183-.332 18.19-1.369c7.842-1.66 7.3-8.923 4.464-10.25c-22.988-10.708-17.94-6.35-22.529-9.878c11.681-13.82 29.287-28.18 36.17-74.702c.543-3.693.084-6.018 0-9.006c-.041-1.825.376-2.53 2.462-2.739c5.757-.664 11.348-2.24 16.48-5.062c14.893-8.134 20.9-21.498 22.318-37.517c.21-2.449-.041-4.98-2.628-6.266M123.526 159.985c-22.278-17.513-33.083-23.282-37.547-23.033c-4.172.25-3.42 5.022-2.503 8.135c.96 3.07 2.211 5.187 3.963 7.884c1.21 1.785 2.045 4.44-1.21 6.433c-7.175 4.44-19.65-1.494-20.234-1.784c-14.518-8.55-26.658-19.839-35.21-35.276c-8.261-14.858-13.058-30.794-13.851-47.81c-.21-4.107 1-5.56 5.09-6.307c5.38-.996 10.93-1.204 16.311-.416C61.073 71.131 80.43 81.3 96.66 97.401c9.261 9.172 16.27 20.129 23.488 30.836c7.676 11.37 15.936 22.203 26.45 31.084c3.712 3.112 6.674 5.478 9.511 7.221c-8.552.955-22.82 1.163-32.582-6.557m10.68-68.684a3.27 3.27 0 0 1 3.296-3.278c.418 0 .793.082 1.127.206c.46.167.876.416 1.21.789c.584.581.918 1.41.918 2.283a3.267 3.267 0 0 1-3.296 3.278c-1.835 0-3.254-1.452-3.254-3.278m33.167 17.016c-2.128.872-4.255 1.618-6.3 1.701c-3.17.166-6.633-1.121-8.51-2.698c-2.92-2.449-5.006-3.817-5.882-8.092c-.376-1.826-.167-4.649.167-6.267c.75-3.486-.084-5.726-2.545-7.76c-2.003-1.661-4.548-2.117-7.343-2.117c-1.043 0-2.002-.457-2.712-.83c-1.168-.581-2.127-2.034-1.21-3.818c.293-.58 1.711-1.992 2.045-2.24c3.797-2.16 8.177-1.453 12.224.165c3.755 1.535 6.592 4.358 10.68 8.341c4.172 4.814 4.923 6.143 7.3 9.753c1.879 2.822 3.59 5.727 4.757 9.048c.71 2.075-.209 3.776-2.67 4.814z\"/>"), title: "CodeWhale" },
  { node: '<span class="NewAgentLogoMark">G</span><span>Grok</span>', title: 'Grok' },
]

const heroPlatformMeta = computed(() => {
  const platform = heroPlatform.value

  if (platform === 'win32') {
    return {
      name: 'Windows',
    }
  }

  if (platform === 'linux') {
    return {
      name: 'Linux',
    }
  }

  return {
    name: 'macOS',
  }
})

const primaryCtaLabel = computed(() => {
  const platformName = heroPlatformMeta.value.name
  return isZh.value ? `获取 ${platformName} 版本` : `Get ${platformName} version`
})

function detectHeroPlatform(): HeroPlatform {
  if (!hasNavigator())
    return 'darwin'

  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (ua.includes('windows') || platform.includes('win'))
    return 'win32'

  if (ua.includes('linux') || platform.includes('linux'))
    return 'linux'

  return 'darwin'
}

onMounted(() => {
  heroPlatform.value = detectHeroPlatform()
  requestAnimationFrame(() => {
    heroReady.value = true
  })

  beginSequence({
    content: 220,
    interactive: 760,
    header: 980,
  })
})

onBeforeUnmount(() => {
  resetSequence({ preserveHeader: true })
})
</script>

<template>
  <section
    class="NexusHero TuffHome-HeroSection"
    :class="{ 'is-ready': heroReady }"
    aria-labelledby="nexus-landing-title"
  >
    <div class="NexusHero-Veil" aria-hidden="true">
      <ClientOnly>
        <DarkVeil
          :hue-shift="354"
          :noise-intensity="0.07"
          :scanline-intensity="0.88"
          :scanline-frequency="4.8"
          :speed="1.4"
          :warp-amount="1"
          :resolution-scale="0.7"
        />
      </ClientOnly>
    </div>
    <div class="NexusHero-Scrim" aria-hidden="true" />

    <div class="NexusHero-Content" :class="{ 'is-visible': contentVisible }">
      <p class="NexusHero-Badge">
        <span aria-hidden="true" />
        {{ t('landing.nexus.hero.eyebrow') }}
      </p>
      <h1 id="nexus-landing-title">
        <span>
          {{ t('landing.nexus.hero.titlePrefix') }}
          <TuffLandingLineShadowText class="NexusHero-OsText" :text="t('landing.nexus.hero.titleSubject')" />
        </span>
        <strong>{{ t('landing.nexus.hero.titleAccent') }}</strong>
      </h1>
      <div class="NexusHero-Actions" :class="{ 'is-ready': interactiveReady }">
        <NuxtLink class="NexusButton is-primary" to="/updates">
          <TxOsIcon :platform="heroPlatform" />
          <span>{{ primaryCtaLabel }}</span>
        </NuxtLink>
        <NuxtLink class="NexusButton" to="/docs">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ t('landing.nexus.hero.secondaryCta') }}</span>
        </NuxtLink>
      </div>

      <div class="NexusHero-AgentLoop" :class="{ 'is-ready': interactiveReady }">
        <LogoLoop
          :logos="agentLogos"
          :speed="78"
          direction="left"
          :logo-height="38"
          :gap="16"
          :hover-speed="14"
          :scale-on-hover="true"
          :fade-out="true"
          fade-out-color="#050608"
          aria-label="Compatible coding agents"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.NexusHero {
  --nexus-ink: #f6f7f4;
  --nexus-accent: #9ad0bc;
  --nexus-accent-strong: #d7f7e9;

  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  min-height: 100svh;
  padding: 6.5rem max(1.5rem, calc((100vw - 1480px) / 2)) 3rem;
  overflow: hidden;
  color: var(--nexus-ink);
  opacity: 1;
  transition: opacity 720ms ease;
}

.NexusHero.is-ready {
  opacity: 1;
}

.NexusHero-Veil,
.NexusHero-Scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.NexusHero-Veil {
  z-index: 0;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(110, 114, 255, 0.28), transparent 55%),
    radial-gradient(70% 50% at 85% 20%, rgba(154, 208, 188, 0.18), transparent 50%),
    linear-gradient(180deg, #07090f 0%, #050608 48%, #040507 100%);
}

.NexusHero-Veil :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.NexusHero-Scrim {
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(5, 6, 8, 0.82) 0%, rgba(5, 6, 8, 0.32) 36%, rgba(5, 6, 8, 0) 72%),
    linear-gradient(180deg, rgba(5, 6, 8, 0.12) 0%, rgba(5, 6, 8, 0) 58%, rgba(5, 6, 8, 0.52) 100%);
}

.NexusHero-Content {
  position: relative;
  z-index: 2;
  width: min(100%, 86rem);
  text-align: center;
  opacity: 1;
  transform: none;
  transition:
    opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 760ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.NexusHero-Content.is-visible {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusHero-Badge {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0;
  border: 1px solid rgba(246, 247, 244, 0.12);
  border-radius: 999px;
  background: rgba(20, 23, 34, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 60px rgba(0, 0, 0, 0.3);
  padding: 0.7rem 1rem;
  color: rgba(246, 247, 244, 0.82);
  font-size: clamp(0.9rem, 1.2vw, 1.05rem);
  font-weight: 720;
  letter-spacing: 0;
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}

.NexusHero-Badge span {
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 999px;
  background: #6e72ff;
  box-shadow:
    0 0 0 4px rgba(110, 114, 255, 0.16),
    0 0 22px rgba(110, 114, 255, 0.86);
}

.NexusHero h1 {
  display: grid;
  gap: 0.12em;
  max-width: 86rem;
  margin: clamp(1.75rem, 3vw, 2.75rem) auto 0;
  letter-spacing: 0;
  /* CJK breaks between any two glyphs by default, which would split a phrase
     like 随心创作 mid-word once a line runs out of room */
  word-break: keep-all;
}

.NexusHero h1 span {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.18em;
  color: #fff;
  font-size: clamp(3.25rem, 6.8vw, 6.9rem);
  font-weight: 830;
  line-height: 0.92;
  text-shadow: 0 0 28px rgba(255, 255, 255, 0.18);
}

.NexusHero-OsText {
  --line-shadow-color: rgba(246, 247, 244, 0.85);
}

.NexusHero h1 strong {
  display: inline-block;
  background: linear-gradient(180deg, #f3ecff 0%, #bf9cff 28%, #7f6cff 62%, #5b3df4 100%);
  background-clip: text;
  color: transparent;
  font-size: clamp(3.3rem, 6.6vw, 6.8rem);
  font-weight: 850;
  line-height: 1.04;
  /* The accent is one headline beat — it wraps as a whole or not at all */
  white-space: nowrap;
  padding-bottom: 0.08em;
  filter: drop-shadow(0 18px 54px rgba(105, 75, 255, 0.36));
  text-shadow: none;
  -webkit-background-clip: text;
}

.NexusHero-Actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  margin-top: 3rem;
  opacity: 1;
  transform: none;
  transition:
    opacity 520ms ease,
    transform 520ms ease;
}

.NexusHero-Actions.is-ready {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusHero-AgentLoop {
  position: relative;
  width: min(100%, 74rem);
  height: 8rem;
  margin: clamp(4.6rem, 9vh, 7rem) auto 0;
  padding: 1.2rem 0;
  color: rgba(246, 247, 244, 0.74);
  opacity: 1;
  transform: none;
  transition:
    opacity 640ms ease,
    transform 640ms ease;
}

.NexusHero-AgentLoop.is-ready {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.NexusHero-AgentLoop::before,
.NexusHero-AgentLoop::after {
  position: absolute;
  inset-inline: 8%;
  height: 1px;
  content: "";
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
}

.NexusHero-AgentLoop::before {
  top: 0;
}

.NexusHero-AgentLoop::after {
  bottom: 0;
}

.NexusHero-AgentLoop :deep(.LogoLoop) {
  height: 100%;
}

.NexusHero-AgentLoop :deep(.LogoLoop-Track) {
  height: 100%;
  align-items: center;
}

.NexusHero-AgentLoop :deep(.LogoLoop-Logo) {
  gap: 0.55rem;
  min-height: 3.25rem;
  border: 1px solid rgba(246, 247, 244, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 52px rgba(0, 0, 0, 0.22);
  padding: 0.62rem 1rem;
  font-size: 0.95rem;
  font-weight: 720;
  letter-spacing: 0;
  white-space: nowrap;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.NexusHero-AgentLoop :deep(.LogoLoop-Logo > span:first-child) {
  display: inline-flex;
  width: 1.15rem;
  height: 1.15rem;
  align-items: center;
  justify-content: center;
  color: #b7a6ff;
  font-size: 1.15rem;
}

.NexusHero-AgentLoop :deep(.NewAgentLogoMark) {
  border: 1px solid rgba(183, 166, 255, 0.38);
  border-radius: 999px;
  color: #d7ccff;
  font-size: 0.68rem !important;
  font-weight: 850;
  line-height: 1;
}

.NexusButton {
  display: inline-flex;
  min-height: 2.9rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid rgba(246, 247, 244, 0.22);
  border-radius: 999px;
  padding: 0.75rem 1.15rem;
  color: var(--nexus-ink);
  font-size: 0.9rem;
  font-weight: 720;
  text-decoration: none;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.NexusButton:hover {
  border-color: rgba(246, 247, 244, 0.4);
  background: rgba(246, 247, 244, 0.05);
}

.NexusButton:focus-visible {
  outline: 2px solid rgba(154, 208, 188, 0.78);
  outline-offset: 3px;
}

.NexusButton.is-primary {
  border-color: transparent;
  background: var(--nexus-ink);
  color: #07100d;
}

.NexusButton.is-primary:hover {
  background: rgba(246, 247, 244, 0.88);
}

@media (max-width: 640px) {
  .NexusHero {
    min-height: 100svh;
    padding: 6rem 1rem 2rem;
  }

  .NexusHero h1 {
    gap: 0.12em;
    margin-top: 1.5rem;
  }

  .NexusHero h1 span {
    font-size: clamp(2.65rem, 15vw, 4.2rem);
  }

  .NexusHero h1 strong {
    font-size: clamp(2.7rem, 13vw, 4.2rem);
    line-height: 1.04;
  }

  .NexusHero-Actions {
    margin-top: 1.25rem;
  }

  .NexusHero-Actions,
  .NexusButton {
    width: 100%;
  }

  .NexusHero-AgentLoop {
    height: 6.8rem;
    margin-top: 2.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .NexusHero,
  .NexusHero-Content,
  .NexusHero-Actions,
  .NexusHero-AgentLoop,
  .NexusButton {
    transition: none;
  }
}
</style>
