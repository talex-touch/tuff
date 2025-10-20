import { RemovableRef, useStorage } from '@vueuse/core'

const IPluginSettings = {
  source: {
    list: [
      {
        name: 'NPM',
        url: 'https://registry.npmjs.org/',
        adapter: 'NPM'
      },
      {
        name: 'NPM mirror',
        url: 'https://registry.npmmirror.com/',
        adapter: 'NPM'
      },
      {
        name: 'GitHub',
        url: 'https://api.github.com',
        adapter: 'GITHUB'
      },
      {
        name: 'Gitee',
        url: 'https://gitee.com/api/v5',
        adapter: 'GITEE'
      },
      {
        name: 'Talex Official',
        url: 'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json',
        adapter: 'OFFICIAL'
      }
    ],
    adapter: ['NPM', 'GITHUB', 'GITEE', 'GITLAB', 'FOLDER', 'OFFICIAL']
  }
}

export const pluginSettings: RemovableRef<typeof IPluginSettings> = useStorage<
  typeof IPluginSettings
>('plugin-settings', IPluginSettings)
