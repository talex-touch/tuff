import { RemovableRef, useStorage } from '@vueuse/core'

const IThemeStyle = {
  theme: {
    window: 'Mica',
    style: {
      dark: false,
      auto: true,
    },
    addon: {
      contrast: false,
      coloring: false,
    }
  }
}

export const themeStyle: RemovableRef<typeof IThemeStyle> = useStorage<typeof IThemeStyle>('theme-style', IThemeStyle)

const media = window.matchMedia("(prefers-color-scheme: dark)");

const callback = (e) => {
  if (!themeStyle.value.theme.style.auto) return;
  themeStyle.value.theme.style.dark = e.matches;
};

media.addEventListener("change", callback);
callback(media);

watch(themeStyle, () => {
  const clsL = document.body.parentNode["classList"];
  const { theme } = themeStyle.value;

  theme.style.dark ? clsL.add("dark") : clsL.remove("dark");
  theme.window === 'Mica' ? clsL.add("mica") : clsL.remove("mica");

  theme.addon.coloring ? clsL.add("coloring") : clsL.remove("coloring");
  theme.addon.contrast ? clsL.add("contrast") : clsL.remove("contrast");

  theme.style.auto && callback(media);
}, { deep: true, immediate: true })