/**
 * Global type declaration file.
 * Provides type support for Tuff plugins.
 */

declare global {
  // eslint-disable-next-line vars-on-top
  var $util: import('@talex-touch/utils').IPluginUtils
  // eslint-disable-next-line vars-on-top
  var TuffItemBuilder: new (id: string) => any

  interface Window {
    $util: import('@talex-touch/utils').IPluginUtils
    TuffItemBuilder: new (id: string) => any
  }
}

export {}
