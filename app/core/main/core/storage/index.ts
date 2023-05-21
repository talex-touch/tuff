import { ChannelType } from "~/../../packages/utils/channel";
import { genTouchChannel } from "../channel-core";
import fse from "fs-extra";
import { TalexTouch } from "~/main/types";
import path from "path-browserify";
import { checkDirWithCreate } from "~/main/utils/common-util";

export default {
  name: Symbol("StorageChannel"),
  listeners: new Array<Function>(),
  configPath: undefined,
  configs: {},
  getConfig(name: string) {
    if ( !this.configPath ) throw new Error(`Config ${name} not found`);
    return (
      this.configs[name] ||
      (() => {
        const p = path.resolve(this.configPath, name);

        const file = fse.existsSync(p)
          ? JSON.parse(fse.readFileSync(p).toString())
          : {};

        this.configs[name] = file;

        return file;
      })()
    );
  },
  reloadConfig(name: string) {
    if ( !this.configPath ) throw new Error(`Config ${name} not found`);
    const file = JSON.parse(
      fse.readFileSync(path.resolve(this.configPath, name)).toString()
    );

    this.configs[name] = file;

    return file;
  },
  saveConfig(name: string, content?: string, clear?: boolean): boolean {
    if ( !this.configPath ) throw new Error(`Config ${name} not found`);

    if (content && this.configs[name]) {
      const p = path.join(this.configPath, name);
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
    if ( !this.configPath ) throw new Error(`Config ${name} not found`);
    Object.keys(this.configs).forEach((key) => this.saveConfig(key));
  },
  init(app) {
    this.configPath = path.join(app.rootPath, "config");
    checkDirWithCreate(this.configPath, true)

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
} as TalexTouch.IModule;
