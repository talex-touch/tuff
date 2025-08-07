import appIcon from '../../public/favicon.ico?asset'

import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { isCoreBox, isMainWindow, useArgMapper } from '@talex-touch/utils/renderer'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']): Promise<boolean> {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find((e) => e === child)) {
      parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find((e) => e === child)) {
      parent.removeChild(child)
    }
  }
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading(): { appendLoading: () => void; removeLoading: () => void } {
  const className = `AppLoading`
  const styleContent = `
.${className}__bar {
  position: absolute;

  width: 280px;
  height: 8px;

  bottom: 30%;

  overflow: hidden;
  border-radius: 2px;
  background: #dddddd50;
}
.${className}__bar::before {
    content: '';
    position: absolute;

    width: 0;
    height: 100%;

    border-radius: 2px;
    background: #dddddd;
    animation: ${className}__bar__animation 1s infinite linear;
}

@keyframes ${className}__logo__animation {
  0% {
    filter: hue-rotate(0) blur(0) drop-shadow(0 0 10px #212121);
    transform: rotate(0deg);
  }
  50% {
    filter: hue-rotate(30deg) blur(1px) drop-shadow(0 0 40px #262626);
    transform: rotate(180deg);
  }
  100% {
    filter: hue-rotate(0) blur(0) drop-shadow(0 0 10px #212121);
    transform: rotate(360deg);
  }
}

@keyframes ${className}__bar__animation {
  0%, 100% {
    left: 0;
    width: 0;
  }
  25% {
    left: 0;
    width: 50%;
  }
  50% {
    left: 100%;
    width: 50%;
  }
  75% {
    left: 100%;
    width: 0;
  }
}

.${className}__logo {
  position: absolute;
  margin-top: -100px;

  width: 180px;
  height: 180px;

  background-size: contain;
  background-image: url("${appIcon}");

   animation: ${className}__logo__animation 1s infinite linear;
}
.${className} {
  position: absolute;

  top: 0;
  left: 0;

  width: 100vw;
  height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.innerHTML = styleContent
  oDiv.innerHTML = `<div class="${className}"><div class="${className}__logo"></div><div class="${className}__bar"></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    }
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(() => {
  if (isMainWindow()) {
    appendLoading()
  }
})

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}
