import { getConfig } from "../core/storage";

export function getJs(options) {
  const [name, _path] = options;

  const themeConfig = getConfig("theme-style.ini");

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
                                         
            window.clsL = document.body.parentNode['classList']
        
            window.$config.themeStyle['dark'] ? clsL.add('dark') : clsL.remove('dark')
            window.$config.themeStyle['blur'] ? clsL.add('touch-blur') : clsL.remove('touch-blur')
            window.$config.themeStyle['coloring'] ? clsL.add('coloring') : clsL.remove('coloring')
                     
        })()
    `;
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
                  border-radius: 8px;
                  box-sizing: border-box;
                }

                html.dark {
                  --el-box-shadow-lighter: 0 0 0 1px rgba(255, 255, 255, .2) !important;
                  --el-box-shadow: 0 0 4px 1px rgba(29, 29, 29, .2) !important;
                }
                
                `;

  // #app {
  //     top: 2px;
  //
  //     height: calc(100% - 4px);
  //     width: calc(100% - 2px);
  // }
}
