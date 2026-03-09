/*
 * Copyright (c) 2022. TalexDreamSoul
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// import { createApp } from 'vue'
// import _ from 'lodash'
// import ImageViewer from '~/components/common/viewer/ImageViewer.vue'

// export function useImageClickAgent(container: HTMLBaseElement) {
//   container.querySelectorAll('img').forEach((img) => {
//     const { src } = img.attributes as any
//     if (src) {
//       const root: HTMLDivElement = document.createElement('div')
//       const wrapperEl = img/* .parentElement */ as HTMLElement

//       wrapperEl.onclick = () => {
//         const app = createApp(ImageViewer, {
//           wrapper: wrapperEl,
//           img,
//           close: () => {
//             app.unmount()

//             document.body.removeChild(root)
//           },
//         })

//         document.body.appendChild(root)
//         app.mount(root)
//       }
//     }
//   })
// }

export function useWindowView() {
  const { isApple } = useDevice()
  if (isApple)
    return

  const { width, height } = useWindowSize()

  function initWindowView([width, height]: number[]) {
    if (document.body.classList.contains('screen'))
      return

    Object.assign(document.documentElement.style, {
      width: `${width}px`,
      height: `${height}px`,
    })
  }

  watchEffect(() => {
    initWindowView([width.value, height.value])
  })
}
