// uno.config.ts
import { defineConfig } from "unocss";
import { presetUno, presetAttributify, presetIcons } from "unocss";

export default defineConfig({
  theme: {

  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons()
  ]
});
