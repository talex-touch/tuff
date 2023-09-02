import { touchChannel } from "@modules/channel/channel-core";

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
  enablePlugin: (name: string) => void;

  // Disable the plugin with the given name.
  disablePlugin: (name: string) => void;

  // Set the webviewInit flag of the plugin with the given name.
  setPluginWebviewInit: (name: string) => void;

  // Get the plugin with the given name.
  getPlugin: (name: string) => Promise<Plugin>;

  // Get the list of plugins.
  getPluginList: () => Plugin[];

  // Change the active plugin.
  changeActivePlugin: (name: string) => void;

  // Export the plugin with the given name.
  exportPlugin: (name: string, manifest: string, files: string) => void;
}

class PluginManager {
  async enablePlugin(name) {
    return touchChannel.send("enable-plugin", name);
  }

  async disablePlugin(name) {
    return touchChannel.send("disable-plugin", name);
  }

  setPluginWebviewInit(name) {
    return touchChannel.sendSync("webview-init", name);
  }

  async getPlugin(name) {
    return touchChannel.send("get-plugin", name);
  }
  getPluginList() {
    return touchChannel.sendSync("plugin-list");
  }

  changeActivePlugin(name: string = "") {
    return touchChannel.sendSync("change-active", name);
  }

  exportPlugin(name: string, manifest: string, files: string) {
    console.error("TODO: exportPlugin");
    return null;
    // return asyncMainProcessMessage("pack-export", {
    //   plugin: name,
    //   manifest,
    //   files,
    // });
  }
}

export const pluginManager: IPluginManager = new PluginManager();
