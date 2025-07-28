import type { UserConfigExport, Plugin } from 'vite'

/**
 * 解决 target = "_self" on nav links 报错问题
 * 
 * @see issues#1015 https://github.com/vuejs/vitepress/discussions/1015#discussioncomment-3177860
 * @returns { Object }
 */
// const NavLinkPatch = (): Plugin => ({
//   name: 'override-target-blank',
//   enforce: 'pre',
//   transform: (code, id) => {
//     if (id.endsWith('VPLink.vue')) {
//       return code.replace('_blank', '_self')
//     }
//   }
// })

export default (): UserConfigExport => {
  return {
    server: {
      port: 1216
    },
    // plugins: [NavLinkPatch()],
    optimizeDeps: {
      exclude: ['vitepress']
    },
    ssr: {
      format: 'cjs'
    },
    legacy: {
      buildSsrCjsExternalHeuristics: true
    },
    // css: {
    //   postcss: {
    //     plugins: [
    //       {
    //         postcssPlugin: 'internal:charset-removal',
    //         AtRule: {
    //           charset: (atRule) => {
    //             if (atRule.name === 'charset') {
    //               atRule.remove()
    //             }
    //           }
    //         }
    //       }
    //     ]
    //   }
    // }
  }
}
