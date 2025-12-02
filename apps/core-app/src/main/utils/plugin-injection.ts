import { getConfig } from '../modules/storage'

export function getJs(options) {
  const [name, _path] = options

  const themeConfig = getConfig('theme-style.ini')

  return `
        !(() => {

            if ( window.$plugin ) { return }

            console.log("Touch # Auto inject JS")

            window.$plugin = {}

            Object.assign(window.$plugin, {
                name: '${name}',
                path: ${_path}
            })

            window.$config = {
                themeStyle: ${JSON.stringify(themeConfig)}
            }

            // Apply theme styles when DOM is ready
            function applyThemeStyles() {
                if (document.body && document.body.parentNode) {
                    const clsL = document.body.parentNode['classList']
                    window.clsL = clsL

                    if (window.$config.themeStyle['dark']) {
                        clsL.add('dark')
                    } else {
                        clsL.remove('dark')
                    }

                    if (window.$config.themeStyle['blur']) {
                        clsL.add('touch-blur')
                    } else {
                        clsL.remove('touch-blur')
                    }

                    if (window.$config.themeStyle['coloring']) {
                        clsL.add('coloring')
                    } else {
                        clsL.remove('coloring')
                    }
                } else {
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', applyThemeStyles)
                    } else {
                        setTimeout(applyThemeStyles, 0)
                    }
                }
            }

            if (document.readyState !== 'loading' && document.body) {
                applyThemeStyles()
            } else {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', applyThemeStyles)
                } else {
                    setTimeout(applyThemeStyles, 0)
                }
            }

        })()
    `
}

export function getStyles() {
  return `html, body, #app {
                  position: relative;
                  margin: 0;
                  padding: 0;

                  top: 0;
                  left: 0;

                  width: 100%;
                  height: 100%;

                  overflow: hidden;
                  box-sizing: border-box;
                }

                html.dark {
                  --el-box-shadow-lighter: 0 0 0 1px rgba(255, 255, 255, .2) !important;
                  --el-box-shadow: 0 0 4px 1px rgba(29, 29, 29, .2) !important;
                }

                `

  // #app {
  //     top: 2px;
  //
  //     height: calc(100% - 4px);
  //     width: calc(100% - 2px);
  // }
}
