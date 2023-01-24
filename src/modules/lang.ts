import { createI18n } from 'vue-i18n'

import zh_cn from '@assets/languages/zh_cn.json'

const i18n = createI18n({
    locale: "zh_cn",
    fallbackLocale: "zh_cn",
    messages: {
        zh_cn
    }
})

Object.defineProperty(window, 'i18n', {
    value: i18n,
    enumerable: true,
    writable: false
})

export default i18n
