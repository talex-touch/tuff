import { reactive, watch } from 'vue'
import { languages } from '@modules/lang'
import {AccountStorage} from "@modules/storage/accounter";

export class StorageManager {

    paintCustom: object

    themeStyle: object

    appSetting: object

    account: AccountStorage

    constructor() {

        this.account = reactive(new AccountStorage(window.$nodeApi.getConfig('account.ini')))

        this.paintCustom = reactive(window.$nodeApi.getConfig('paint-custom.ini'))
        if( !this.paintCustom[1] ) this.paintCustom = reactive({
            1: 'MacOS',
            2: '轻盈',
            3: '固定图标'
        })

        this.appSetting = reactive(window.$nodeApi.getConfig('app-setting.ini'))
        if( !this.appSetting.hasOwnProperty('autoStart') ) this.appSetting = reactive({
            autoStart: false,
            defaultApp: 0,
            plugin: {
                sync: 0,
                syncLatest: false,
                dataSync: false
            },
            dev: {
                autoCloseDev: true
            },
            lang: {
                followSystem: true,
                locale: 0
            },
            keyBind: {
                summon: 0,
                home: 0,
                plugins: 0,
                settings: 0
            }
        })
        watch(this.appSetting, async () => {

            if ( this.appSetting['lang']['followSystem'] )
                // @ts-ignore
                window.$i18n.global.locale.value = languages[navigator.language.toLowerCase()]
            else
                // @ts-ignore
                window.$i18n.global.locale.value = languages[this.appSetting['lang']['locale']]['key']

            await this._save('app-setting.ini', this.appSetting)

        }, { immediate: true, deep: true })

        this.themeStyle = reactive(window.$nodeApi.getConfig('theme-style.ini'))
        if( !this.themeStyle.hasOwnProperty('dark') ) this.themeStyle = reactive({
            dark: false,
            coloring: true,
            blur: false,
            contrast: false,
            autoDark: false
        })

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const callback = (e) => {
            if( !this.themeStyle['autoDark'] ) return
            this.themeStyle['dark'] = e.matches
        };
        media.addEventListener('change', callback);
        callback(media);

        watch(this.themeStyle, async () => {
            const clsL = document.body.parentNode['classList']

            this.themeStyle['dark'] ? clsL.add('dark') : clsL.remove('dark')
            this.themeStyle['blur'] ? clsL.add('blur') : clsL.remove('blur')
            this.themeStyle['coloring'] ? clsL.add('coloring') : clsL.remove('coloring')
            this.themeStyle['autoDark'] &&  callback(media);

            await this._save('theme-style.ini', this.themeStyle)

        }, { deep: true, immediate: true })

    }

    async saveAll() {

        return Promise.all([
            Promise.resolve(this._save('paint-custom.ini', this.paintCustom, true)),
            Promise.resolve(this._save('theme-style.ini', this.themeStyle, true)),
            Promise.resolve(this._saveStr('account.ini', this.account.saveToStr(), true)),
        ])

    }

    async _save(name: string, data: object, clear: boolean = false) {
        return window.$nodeApi.saveConfig(name, JSON.stringify(data), clear)
    }

    async _saveStr(name: string, data: string, clear: boolean = false) {
        return window.$nodeApi.saveConfig(name, data, clear)
    }

}

export function genStorageManager() {

    return new StorageManager()
}