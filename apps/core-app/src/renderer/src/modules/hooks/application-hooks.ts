import { isLocalhostUrl } from '@talex-touch/utils'
import { DataCode } from '@talex-touch/utils/channel'
import { touchChannel } from '../channel/channel-core'
import { blowMention, forTouchTip } from '../mention/dialog-mention'

export async function urlHooker(): Promise<void> {
  function directListener(event: Event): void {
    const target = event.target as HTMLElement

    if (target.nodeName.toLocaleLowerCase() === 'a') {
      if (target.getAttribute('ignoreSafeCheck') === 'true')
        return

      const url = target.getAttribute('href')

      if (!url)
        return

      const regex
        = /(^https:\/\/localhost)|(^http:\/\/localhost)|(^http:\/\/127\.0\.0\.1)|(^https:\/\/127\.0\.0\.1)/

      event.preventDefault()
      if (!regex.test(url) || url.startsWith(window.location.origin) || url.startsWith('/')) {
        touchChannel.send('url:open', url)
      }
      else {
        touchChannel.send('open-external', { url })
      }

      // if(/^\//.test(target)) {
      //   // Relative to this website url
      //   return true
      // }

      // const isSafe = undefined !== whiteDomList.find(item=>{
      //   return target.indexOf(item) !== -1
      // })

      // if(!isSafe) {
      //   window.open(`${window.location.host}/direct?target=${target}`, '_blank')
      // window.open(`${safeLink}${target}`, '_blank')
      // }

      // window.open(`${url}`, "_blank");
    }
  }

  document.body.addEventListener('click', directListener)

  touchChannel.regChannel('url:open', async ({ data, reply }) => {
    const url = data! as unknown as string
    if (isLocalhostUrl(url)) {
      return
    }

    await forTouchTip('Allow to open external link?', url, [
      {
        content: 'Cancel',
        type: 'info',
        onClick: async () => {
          reply(DataCode.SUCCESS, false)
          return true
        },
      },
      {
        content: 'Sure',
        type: 'danger',
        onClick: async () => {
          reply(DataCode.SUCCESS, true)
          return true
        },
      },
    ])
  })
}

export function screenCapture(): void {
  const widthStr = document.body.style.getPropertyValue('--winWidth')
  const heightStr = document.body.style.getPropertyValue('--winHeight')

  const winWidth = widthStr ? Number.parseInt(widthStr) : 0
  const winHeight = heightStr ? Number.parseInt(heightStr) : 0

  if (winWidth === 0 || winHeight === 0)
    return
  // @ts-ignore: registerTypeProcess is attached to window object
  window.registerTypeProcess('@screen-capture', async ({ data }) => {
    const width = document.body.clientWidth
    const height = document.body.clientHeight

    // const video = document.getElementById("video") as HTMLVideoElement;

    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error: Required for Electron screen capture
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

export function clipBoardResolver(): void {
  touchChannel.regChannel(
    'clipboard:trigger',
    ({ data }: { data?: { type: string, data: string } }) => {
      if (!data)
        return

      if (data.type === 'text') {
        blowMention('Clipboard', `You may copied "${data.data}"`)
      }
      else if (data.type === 'image') {
        blowMention('Clipboard', data.data)
      }
      else if (data.type === 'html') {
        blowMention('Clipboard', data.data)
      }
    },
  )
}
