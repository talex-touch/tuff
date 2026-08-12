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
                  --tx-box-shadow-lighter: 0 0 0 1px rgba(255, 255, 255, .2) !important;
                  --tx-box-shadow: 0 0 4px 1px rgba(29, 29, 29, .2) !important;
                }

                `
}
