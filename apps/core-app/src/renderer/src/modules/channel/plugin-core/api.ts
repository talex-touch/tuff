import { touchChannel } from '../channel-core'

// TODO PLUGIN-CRASHED
// touchChannel.regChannel("plugin-crashed", async ({ reply, data }) => {
//   console.log(data);

//   await forDialogMention(
//     data.data.name,
//     data.data.description,
//     data.plugin.pluginInfo.icon,
//     [
//       {
//         content: "忽略加载",
//         type: "info",
//         onClick: () => true,
//       },
//       {
//         content: "重启插件",
//         type: "warning",
//         onClick: () =>
//           this.reloadPlugin(data.plugin.pluginInfo.name) && true,
//       },
//     ]
//   );

//   reply("accepted");
// });

export interface IPluginManager {
  // Enable the plugin with the given name.
  enablePlugin: (name: string) => Promise<any>

  // Disable the plugin with the given name.
  disablePlugin: (name: string) => Promise<any>

  // Set the webviewInit flag of the plugin with the given name.
  setPluginWebviewInit: (name: string) => any

  // Get the plugin with the given name.
  getPlugin: (name: string) => Promise<any>

  // Get the list of plugins.
  getPluginList: () => any[]

  // Change the active plugin.
  changeActivePlugin: (name: string) => any

  // Export the plugin with the given name.
  exportPlugin: (name: string, manifest: string, files: string) => any
}

class PluginManager {
  async enablePlugin(name: string): Promise<any> {
    return touchChannel.send('enable-plugin', { name })
  }

  async disablePlugin(name: string): Promise<any> {
    return touchChannel.send('disable-plugin', { name })
  }

  setPluginWebviewInit(name: string): any {
    return touchChannel.sendSync('webview-init', { name })
  }

  async getPlugin(name: string): Promise<any> {
    return touchChannel.send('get-plugin', { name })
  }

  getPluginList(): any[] {
    return touchChannel.sendSync('plugin-list')
  }

  changeActivePlugin(name: string = ''): any {
    return touchChannel.sendSync('change-active', { name })
  }

  exportPlugin(_name: string, _manifest: string, _files: string): any {
    console.error('TODO: exportPlugin')
    return null
    // return asyncMainProcessMessage("pack-export", {
    //   plugin: _name,
    //   manifest: _manifest,
    //   files: _files,
    // });
  }
}

export const pluginManager: IPluginManager = new PluginManager()
