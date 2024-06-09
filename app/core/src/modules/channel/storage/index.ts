import { reactive, unref, watch } from "vue";
import { AccountStorage } from "./accounter";
import { touchChannel } from "../channel-core";

const storages = new Map<string, TouchStorage<any>>();

export class TouchStorage<T extends object> {
  #qualifiedName: string;

  #autoSave: boolean = false;
  #_autoSave;

  _onUpdate: Array<Function> = [];
  _initData: T;

  data: typeof reactive<T>;

  constructor(qName: string, initData: T, onUpdate?: Function) {
    if (storages.has(qName))
      throw new Error(`Storage ${qName} already exists!`);

    this.#qualifiedName = qName;
    this._initData = initData;
    this.data = reactive(touchChannel.sendSync('storage:get', qName));

    Object.keys(initData).forEach((key) => {
      if (this.data.hasOwnProperty(key)) return;
      this.data[key] = initData[key];
    });

    if (onUpdate) this._onUpdate = [onUpdate];

    storages.set(qName, this);
  }

  setAutoSave(autoSave: boolean) {
    this.#autoSave = autoSave;

    if (!autoSave) {
      this.#_autoSave?.();
    } else {
      this.#_autoSave = watch(
        this.data,
        async () => {
          this._onUpdate?.forEach((fn) => fn());

          await touchChannel.send(
            'save-config',
            {
              key: this.#qualifiedName,
              content: JSON.stringify(this.data),
              clear: false
            }
          );
        },
        { deep: true, immediate: true }
      );
    }

    return this;
  }

  onUpdate(fn: Function) {
    this._onUpdate.push(fn);
  }

  offUpdate(fn: Function) {
    this._onUpdate.splice(this._onUpdate.indexOf(fn), 1);
  }
}

const _appSettingOriginData = {
  autoStart: false,
  defaultApp: 0,
  plugin: {
    sync: 0,
    syncLatest: false,
    dataSync: false,
  },
  dev: {
    autoCloseDev: true,
  },
  lang: {
    followSystem: true,
    locale: 0,
  },
  keyBind: {
    summon: "CTRL + E",
    home: 0,
    plugins: 0,
    settings: 0,
  },
  beginner: {
    init: false
  },
  tools: {
    autoPaste: {
      enable: true,
      time: 180
    },
    autoClear: 600
  }
}

export type AppSetting = typeof _appSettingOriginData & {
  [key: string]: any;
};

export class StorageManager {

  themeStyle: object;

  appSetting: AppSetting;

  account: AccountStorage;
  constructor() {
    this.account = reactive(
      new AccountStorage(touchChannel.sendSync('storage:get', "account.ini"))
    );

    this.appSetting = reactive(touchChannel.sendSync('storage:get', "app-setting.ini"));
    if (!this.appSetting.hasOwnProperty("autoStart"))
      this.appSetting = reactive({ ..._appSettingOriginData });
    watch(
      this.appSetting,
      async () => {
        // if (this.appSetting["lang"]["followSystem"])
        //   // @ts-ignore
        //   window.$i18n.global.locale.value =
        //     languages[navigator.language.toLowerCase()];
        // // @ts-ignore
        // else
        // // @ts-ignore
        //   window.$i18n.global.locale.value =
        //     languages[this.appSetting["lang"]["locale"]]["key"];

        await this._save("app-setting.ini", this.appSetting);
      },
      { immediate: true, deep: true }
    );
  }

  async _save(name: string, data: object, clear: boolean = false) {
    return touchChannel.send("storage:save", {
      key: name,
      content: JSON.stringify(data),
      clear,
    });
  }
}

window.onbeforeunload = () => {
  for (const storage of storages.values()) {
    touchChannel.send("storage:save", {
      key: storage["#qualifiedName"],
      content: JSON.stringify(unref(storage.data) || storage._initData),
      clear: true,
    });
  }
};

export const storageManager = new StorageManager();
