import { touchChannel } from '~/modules/channel/channel-core'
import {
  blowMention,
  forTouchTip,
  popperMention,
} from '~/modules/mention/dialog-mention'
import { h, ref, effectScope } from 'vue'
import PluginApplyInstall from '@comp/plugin/action/mention/PluginApplyInstall.vue'
import { AppUpdate } from '~/modules/hooks/api/useUpdate'
import AppUpdateView from '@comp/base/AppUpgradationView.vue'
import { pluginManager } from '~/modules/channel/plugin-core/api'
import { pluginAdopter } from "~/modules/hooks/adopters/plugin-adpoter";

export function usePlugins() {
  const plugins = ref()
  provide('plugins', () => plugins.value)

  const scope = effectScope()

  scope.run(() => {
    watch(() => pluginAdopter.plugins.values(), val => plugins.value = [...val], { deep: true, immediate: true })
    watch(() => pluginAdopter.plugins.size, () => plugins.value = [...pluginAdopter.plugins.values()])
  })

  return [plugins, scope]
}

export function usePlugin() {
  const activePlugin = ref('')

  const stop = watch(() => activePlugin.value, val => pluginManager.changeActivePlugin(val), { immediate: true })

  provide('activePlugin', activePlugin)

  return stop
}

export async function urlHooker() {
  function directListener(event: any) {
    const target = event.target

    if (target.nodeName.toLocaleLowerCase() === 'a') {
      if (target.getAttribute('ignoreSafeCheck') === 'true')
        return

      // 处理完 a 标签的内容，重新触发跳转，根据原来 a 标签页 target 来判断是否需要新窗口打开
      const url = target.getAttribute('href')

      if (url.startsWith(window.location.origin) || url.startsWith('/'))
        return

      event.preventDefault()

      // if(/^\//.test(target)) {
      //   // 相对本站链接
      //   return true
      // }

      // const isSafe = undefined !== whiteDomList.find(item=>{
      //   return target.indexOf(item) !== -1
      // })

      // if(!isSafe) {
      //   window.open(`${window.location.host}/direct?target=${target}`, '_blank')
      // window.open(`${safeLink}${target}`, '_blank')
      // }

      touchChannel.send('url:open', url)
      // window.open(`${url}`, "_blank");
    }
  }

  document.body.addEventListener('click', directListener)

  touchChannel.regChannel('url:open', async ({ data, reply }) => {
    await forTouchTip('是否允许打开链接？', data, [
      {
        content: '取消',
        type: 'info',
        onClick: async () => {
          reply(false)
          return true
        },
      },
      {
        content: '确定',
        type: 'danger',
        onClick: async () => {
          reply(true)
          return true
        },
      },
    ])
  })
}

export async function applicationUpgrade() {
  const res = await AppUpdate.getInstance().check()
  window.$startupInfo.appUpdate = res
  if (res) {
    document.body.classList.add('has-update')

    await popperMention('New Version Available', () => {
      return h(AppUpdateView, { release: res })
    })
  }
}

export function screenCapture() {
  const widthStr = document.body.style.getPropertyValue('--winWidth')
  const heightStr = document.body.style.getPropertyValue('--winHeight')

  const winWidth = widthStr ? parseInt(widthStr) : 0
  const winHeight = heightStr ? parseInt(heightStr) : 0

  if (winWidth === 0 || winHeight === 0)
    return
  registerTypeProcess('@screen-capture', async ({ data }) => {
    const width = document.body.clientWidth
    const height = document.body.clientHeight

    const video = document.getElementById('video') as HTMLVideoElement

    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error
        chromeMediaSource: 'desktop',
        // deviceId: data.id,
        chromeMediaSourceId: data.id,
        minWidth: width,
        maxWidth: winHeight,
        minHeight: height,
        maxHeight: winHeight,
        height,
        width,
      },
    })

    console.log(data, media.getTracks())
    //
    // const track = media.getVideoTracks()[0]

    console.log(data, media)

    // video.srcObject = media
    // video.onloadedmetadata = (e) => {
    //     video.play()
    // }
  })
}

export function dropperResolver() {
  async function dropperFile(path) {
    if (path.endsWith('.touch-plugin')) {
      await popperMention('Fatal Error', 'Sorry, the plugin is deprecated, we only supports .tpex now.')

      return true
    }

    if (path.endsWith('.tpex')) {
      const data = touchChannel.sendSync(
        'drop:plugin',
        path,
      )

      if (data.status === 'error') {
        if (data.msg === '10091')
          await blowMention('Install', 'The plugin has been irreversible damage!')

        else if (data.msg === '10092')
          await blowMention('Install', 'Unable to identify the file!')
      }
      else {
        const { manifest } = data

        await popperMention(manifest.name, () => {
          return h(PluginApplyInstall, { manifest, path })
        })
      }
      return true
    }

    return false
  }

  document.addEventListener('drop', async (e) => {
    e.preventDefault()

    const files = e.dataTransfer.files

    if (files && files.length === 1) {
      // 获取文件路径
      const { path } = files[0] as any

      if (await dropperFile(path)) return
    }

    const option = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      pageX: e.pageX,
      pageY: e.pageY,
      composed: e.composed,
      timeStamp: e.timeStamp,
      type: e.type,
      x: e.x,
      y: e.y,
      data: {
        files: [...e.dataTransfer.files].map(parseFile),
        // items: e.dataTransfer.items,
        types: e.dataTransfer.types,
      }
    }
    touchChannel.send('drop', option)
  })

  function parseFile(file: File) {
    return {
      lastModified: file.lastModified,
      name: file.name,
      path: file['path'],
      size: file.size,
      type: file.type,
    }
  }

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
  })
}

export function clipBoardResolver() {
  touchChannel.regChannel('clipboard:trigger', ({ data }: any) => {
    if (data.type === "text") {
      blowMention('Clipboard', `You may copied "${data.data}"`)
    } else if (data.type === "image") {
      blowMention('Clipboard', data.data)
    } else if (data.type === "html") {
      blowMention('Clipboard', data.data)
    }
  })
}
