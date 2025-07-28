import { RemovableRef, useStorage } from '@vueuse/core'

const IPluginSettings = {
  source: {
    list: [
      {
        name: "NPM",
        url: "https://registry.npmjs.org/",
        adapter: "NPM"
      },
      {
        name: "NPM mirror",
        url: "https://registry.npmmirror.com/",
        adapter: "NPM"
      },
      {
        name: "GitHub",
        url: "https://api.github.com",
        adapter: "GITHUB"
      },
      {
        name: "Gitee",
        url: "https://gitee.com/api/v5",
        adapter: "GITEE"
      },
    ],
    adapter: ["NPM", "GITHUB", "GITEE", "GITLAB", "FOLDER"]
  }
}

export const pluginSettings: RemovableRef<typeof IPluginSettings> = useStorage<typeof IPluginSettings>('plugin-settings', IPluginSettings)
