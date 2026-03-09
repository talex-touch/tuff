import Mountain from '/backgrounds/mountain.jpg'
import Glass from '/backgrounds/glass.jpg'
import Geometry from '/backgrounds/geometry.jpg'
import Scallion from '/backgrounds/scallion.jpg'
import NightMountain from '/backgrounds/night-mountain.jpg'
import Grass from '/backgrounds/grass.jpg'
import Dessert from '/backgrounds/dessert.jpg'
import Powder from '/backgrounds/powder.jpg'
import Universe from '/backgrounds/universe.jpg'
import Golden from '/backgrounds/golden.jpg'
import Blocks from '/backgrounds/blocks.jpg'
import Earth from '/backgrounds/earth.jpg'
import Flowers from '/backgrounds/flowers.jpg'
import Swirl from '/backgrounds/swirl.jpg'
import Domain from '/backgrounds/domain.jpg'
import Sound from '/backgrounds/sound.jpg'
import Confusion from '/backgrounds/confusion.jpg'
import Zakaria from '/backgrounds/zakaria.jpg'
import { $event } from '../events'

// import { useColorMode } from '@vueuse/core'

export const themeColors = [
  '#3AB8FD',
  '#4058F2',
  '#0FD267',
  '#EABE10',
  '#EA9E10',
  '#E91010',
  '#EA1093',
  '#CC10EA',
  '#5910EA',
  '#489FBE',
  '#09BB90',
  '#3F8FF7',
]

export const wallpapers = [
  {
    id: 'zakaria',
    free: true,
    label: 'Zakaria',
    color: '#595B54',
    wallpaper: Zakaria,
  },
  {
    id: 'mountain',
    free: true,
    label: '日照雪山',
    color: '#00477B',
    wallpaper: Mountain,
  },
  {
    id: 'night-mountain',
    free: true,
    label: '晚霞橙森',
    color: '#60637A',
    wallpaper: NightMountain,
  },
  {
    id: 'flowers',
    label: '刺缪花海',
    color: '#C55B95',
    wallpaper: Flowers,
  },
  {
    id: 'swirl',
    label: '交替漩涡',
    color: '#375523',
    wallpaper: Swirl,
  },
  {
    id: 'glass',
    label: '玻璃旋花',
    color: '#00BAAF',
    wallpaper: Glass,
  },
  {
    id: 'geometry',
    label: '方正几何',
    color: '#8a7171',
    wallpaper: Geometry,
  },
  {
    id: 'scallion',
    label: '彩晕缩张',
    color: '#05376C',
    // color: '#DA633F',
    wallpaper: Scallion,
  },
  {
    id: 'domain',
    label: '极域空间',
    color: '#272C72',
    wallpaper: Domain,
  },
  {
    id: 'confusion',
    label: '迷乱世界',
    color: '#8E5462',
    wallpaper: Confusion,
  },
  {
    id: 'sound',
    label: '悬音波浪',
    color: '#A73F24',
    wallpaper: Sound,
  },
  {
    id: 'grass',
    label: '绿茵草丛',
    color: '#606D39',
    wallpaper: Grass,
  },
  {
    id: 'dessert',
    label: '沙漠戈壁',
    color: '#B2481F',
    wallpaper: Dessert,
  },
  {
    id: 'powder',
    label: '粉野末镜',
    color: '#9186CE',
    wallpaper: Powder,
  },
  {
    id: 'universe',
    label: '星河宇宙',
    color: '#B4B1BA',
    wallpaper: Universe,
  },
  {
    id: 'golden',
    label: '灿煌云巅',
    color: '#FCCC48',
    wallpaper: Golden,
  },
  {
    id: 'blocks',
    label: '菁彩积木',
    color: '#425467',
    wallpaper: Blocks,
  },
  {
    id: 'earth',
    label: '瀚宇地球',
    color: '#4F637B',
    wallpaper: Earth,
  },
]

// export const themeOptions = useLocalStorage('theme-options', {
//   color: 0,
//   theme: '',
// })
export const theme = computed({
  get() {
    return userConfig.value.pri_info.appearance.theme
  },
  set(val: string) {
    userConfig.value.pri_info.appearance.theme = val
  },
})

export const color = computed({
  get() {
    return userConfig.value.pri_info.appearance.color // 用户选择的颜色
  },
  set(val: string) {
    userConfig.value.pri_info.appearance.color = val
  },
})

export const currentWallpaper = computed(() => theme.value ? wallpapers.find(w => w.id === theme.value) : null)

export async function _setWallpaper(paper: any) {
  if (!paper) {
    theme.value = ''
    document.body.classList.remove('wallpaper')

    document.documentElement.style.setProperty('--wallpaper-color', '')
    document.documentElement.style.setProperty('--wallpaper-color-light', '')
    document.documentElement.style.setProperty('--wallpaper-color-lighter', '')
    document.documentElement.style.setProperty('--wallpaper', '')
  }
  else {
    theme.value = paper.id

    document.body.classList.add('wallpaper')

    document.documentElement.style.setProperty('--wallpaper-color', paper.color)
    document.documentElement.style.setProperty('--wallpaper-color-light', `${paper.color}80`)
    document.documentElement.style.setProperty('--wallpaper-color-lighter', `${paper.color}30`)
    document.documentElement.style.setProperty('--wallpaper', `url(${paper.wallpaper})`)
  }

  await saveUserConfig()
}

export async function setWallpaper(paper: any, e: { clientX: number, clientY: number }) {
  if (!document.startViewTransition)
    return _setWallpaper(paper)

  return new Promise((resolve) => {
    const transition = document.startViewTransition?.(() => {
      _setWallpaper(paper)
    })

    transition!.ready.then(() => {
      const { clientX, clientY } = e

      const radius = Math.hypot(
        Math.max(clientX, innerWidth - clientX),
        Math.max(clientY, innerHeight - clientY),
      )
      const clipPath = [
        `circle(0% at ${clientX}px ${clientY}px)`,
        `circle(${radius}px at ${clientX}px ${clientY}px)`,
      ]
      const isDark = document.documentElement.classList.contains('dark')

      document.documentElement.animate(
        {
          clipPath: isDark ? clipPath.reverse() : clipPath,
        },
        {
          duration: 500,
          pseudoElement: isDark
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)',
        },
      )
    })

    transition!.finished.then(() => {
      resolve(void 0)
    })
  })
}

export function detectWallpaper() {
  if (theme.value) {
    const paper = wallpapers.find(p => p.id === theme.value)
    if (!paper || paper.free)
      return

    if (
      !userStore.value.subscription?.type)

      _setWallpaper(null)

    else _setWallpaper(paper)
  }
}

watch(() => theme.value, () => {
  detectWallpaper()
})

$event.on('USER_LOGOUT_SUCCESS', () => {
  theme.value = ''
})

export function useColorTheme() {
  const prefersColorScheme = window.matchMedia('(prefers-color-scheme: dark)')

  applySystemPreference()
  prefersColorScheme.addEventListener('change', applySystemPreference)
}

export function applySystemPreference() {
  const color = userConfig.value.pri_info.appearance.color

  viewTransition({
    clientX: innerWidth / 2,
    clientY: innerHeight / 2,
  }, color as any/* prefersColorScheme.matches ? 'dark' : 'light' */)
}

export function viewTransition(e: { clientX: number, clientY: number }, theme?: 'auto' | 'light' | 'dark') {
  color.value = theme || 'auto'

  let isDark = theme === 'dark'

  if (theme === 'auto') {
    const prefersColorScheme = window.matchMedia('(prefers-color-scheme: dark)')

    if (prefersColorScheme.matches)
      isDark = true
  }

  if (!document.startViewTransition) {
    document.documentElement.classList.remove('dark')

    if (isDark)
      document.documentElement.classList.add('dark')

    return
  }

  const transition = document.startViewTransition(() => {
    document.documentElement.classList.remove('dark')

    if (isDark)
      document.documentElement.classList.add('dark')
  })

  // 在视图转换完成后执行动画
  transition.ready.then(() => {
    // 从事件对象中解构出客户端的X和Y坐标
    const { clientX, clientY } = e
    // 计算剪裁路径的半径，求 直角三角形的斜边长度
    const radius = Math.hypot(
      Math.max(clientX, innerWidth - clientX),
      Math.max(clientY, innerHeight - clientY),
    )
    // 定义剪裁路径的动画，从零到计算出的半径
    const clipPath = [
      `circle(0% at ${clientX}px ${clientY}px)`,
      `circle(${radius}px at ${clientX}px ${clientY}px)`,
    ]

    // 动画文档元素的剪裁路径，动画时长为500毫秒
    document.documentElement.animate(
      {
        clipPath: isDark ? clipPath.reverse() : clipPath,
      },
      {
        duration: 500,
        // 根据暗黑模式与否选择不同的伪元素进行动画
        pseudoElement: isDark
          ? '::view-transition-old(root)'
          : '::view-transition-new(root)',
      },
    )
  })
}
