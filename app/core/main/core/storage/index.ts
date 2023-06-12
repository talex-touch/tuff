import { ChannelType } from "@talex-touch/utils/channel";
import { genTouchChannel } from "../channel-core";
import fse from "fs-extra";
import { TalexTouch } from "~/main/types";
import path from "path-browserify";

let configPath;

const module = {
  name: Symbol("StorageChannel"),
  listeners: new Array<Function>(),
  filePath: "config",
  configs: {},
  getConfig(name: string) {
    if ( !configPath ) throw new Error(`Config ${name} not found! ` + configPath);
    return (
      this.configs[name] ||
      (() => {
        const p = path.resolve(configPath, name);

        const file = fse.existsSync(p)
          ? JSON.parse(fse.readFileSync(p).toString())
          : {};

        this.configs[name] = file;

        return file;
      })()
    );
  },
  reloadConfig(name: string) {
    if ( !configPath ) throw new Error(`Config ${name} not found`);
    const file = JSON.parse(
      fse.readFileSync(path.resolve(configPath, name)).toString()
    );

    this.configs[name] = file;

    return file;
  },
  saveConfig(name: string, content?: string, clear?: boolean): boolean {
    if ( !configPath ) throw new Error(`Config ${name} not found`);

    if (content && this.configs[name]) {
      const p = path.join(configPath, name);
      console.log("[Config] Save config", name, content, clear, p)

      fse.createFileSync(p);
      fse.writeFileSync(
        p,
        content ? content : JSON.stringify(this.configs[name])
      );

      if (clear) {
        delete this.configs[name];
      } else {
        this.configs[name] = JSON.parse(content);
      }

      return true;
    }
    return false;
  },
  saveAllConfig() {
    if ( !configPath ) throw new Error(`Config ${name} not found!` + configPath);
    Object.keys(this.configs).forEach((key) => this.saveConfig(key));
  },
  init(app) {
    configPath = path.join(app.rootPath, "config");
    
    console.log("[Config] Init config path", configPath)

    const channel = genTouchChannel(app);

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, "storage:get", ({ data }) =>
        this.getConfig(data)
      )
    );

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, "storage:save", ({ data }) =>
        this.saveConfig(data.key, data.content, data.clear)
      )
    );

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, "storage:reload", ({ data }) =>
        this.reloadConfig(data)
      )
    );

    this.listeners.push(
      channel.regChannel(
        ChannelType.MAIN,
        "storage:saveall",
        this.saveAllConfig
      )
    );
  },
  destroy() {
    this.listeners.forEach((f: () => void) => f());
  },
}

export const getConfig = (name: string) => module.getConfig(name);
export const saveConfig = module.saveConfig.bind(module);

export default module as TalexTouch.IModule;
