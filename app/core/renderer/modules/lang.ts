import { createI18n } from 'vue-i18n'

import zh_cn from '@assets/languages/zh_cn.json'
import zh_tw from '@assets/languages/zh_tw.json'
import en_us from '@assets/languages/en.json'
import jp from '@assets/languages/jp.json'
export const languages = [
    {
        name: "简体中文",
        key: "zh-cn",
        value: zh_cn
    },
    {
        name: "English",
        key: 'en-us',
        value: en_us
    },
    {
        name: "繁體中文",
        key: "zh-tw",
        value: zh_tw
    },
    {
        name: "日本語",
        key: "jp",
        value: jp
    }
]

const msgs = {}

languages.forEach(lang => {
    msgs[lang.key] = lang.value
})

const i18n = createI18n({
    locale: "en-us",
    fallbackLocale: "zh-cn",
    messages: msgs
})

export const $global = i18n.global
export const $t = $global.t

// Object.defineProperty(window, 'i18n', {
//     value: i18n,
//     enumerable: true,
//     writable: false
// })

export default i18n
