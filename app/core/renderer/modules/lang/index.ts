import { createI18n } from "vue-i18n";

import zh_cn from "@assets/languages/zh_cn.json";

export const languages = [
  {
    name: "简体中文",
    key: "zh-cn",
    value: zh_cn,
  },
];

const msgs = {};

languages.forEach((lang) => {
  msgs[lang.key] = lang.value;
});

const i18n = createI18n({
  locale: "zh-cn",
  fallbackLocale: "zh-cn",
  messages: msgs,
});

export const $global = i18n.global;
export const $t = $global.t;

export default i18n;
