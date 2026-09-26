import process from 'node:process'
import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { AppName } from '../config/default'
import { onLocaleChange, t } from '../utils/i18n-helper'
import { mainLog } from '../utils/logger'

/**
 * The macOS menu bar, and the About panel its first item opens.
 *
 * Both used to be inherited. Electron builds its default menu from `app.name`, which is the
 * package name — so the menu bar read `@talex-touch/core-app`, with `About …`, `Hide …` and
 * `Quit …` built from that same string — while the panel that item opened fell through to the
 * *Electron bundle*, naming the app "Electron" and reporting Electron's own 41.10.4 as both the
 * version and the build. A user clicking About learned nothing about Tuff.
 *
 * `app.setAboutPanelOptions` is what actually renames the panel: `applicationName` is the title,
 * `applicationVersion` the version number and `version` the parenthesised build next to it.
 * `credits` and `iconPath` are Linux/Windows-only in Electron's typings and were measured to have
 * no effect on macOS, so the copyright line — the only remaining line the panel renders — carries
 * the attribution.
 */

const isMac = process.platform === 'darwin'

export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: AppName,
    applicationVersion: app.getVersion(),
    copyright: `© ${new Date().getFullYear()} TalexDreamSoul. All rights reserved.`,
    // macOS-only: the parenthesised build line, which on a dev launch otherwise reads as the
    // running Electron's version with no indication that it is the runtime, not the app.
    ...(isMac ? { version: `Electron ${process.versions.electron}` } : {})
  })
}

/**
 * Replaces the inherited menu bar with the product's own.
 *
 * macOS only: the other platforms keep Electron's default window menu, which their windows hide
 * anyway (`autoHideMenuBar`) and whose layout — a File menu holding Quit — the macOS template
 * above does not model.
 *
 * Labels come from the same locale the rest of the app uses, so the menu has to be rebuilt when
 * the language changes rather than baked once at startup.
 */
export function installApplicationMenu(): void {
  if (!isMac) return

  applyApplicationMenu()
  onLocaleChange(applyApplicationMenu)
}

function applyApplicationMenu(): void {
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMacMenuTemplate()))
  } catch (error) {
    mainLog.warn('Failed to install the application menu', { error })
  }
}

/**
 * Electron's macOS default, with our labels and our app menu.
 *
 * Every item keeps its `role`: that is where the behaviour lives — the accelerators, the Services
 * submenu macOS fills in, Smart Quotes reading the focused text field, the Window menu macOS
 * populates with open windows — so only the visible strings are ours.
 */
function buildMacMenuTemplate(): MenuItemConstructorOptions[] {
  const named = (key: string): string => t(key, { app: AppName })

  return [
    {
      label: AppName,
      role: 'appMenu',
      submenu: [
        { role: 'about', label: named('appMenu.about') },
        { type: 'separator' },
        { role: 'services', label: t('appMenu.services') },
        { type: 'separator' },
        { role: 'hide', label: named('appMenu.hide') },
        { role: 'hideOthers', label: t('appMenu.hideOthers') },
        { role: 'unhide', label: t('appMenu.showAll') },
        { type: 'separator' },
        { role: 'quit', label: named('appMenu.quit') }
      ]
    },
    {
      label: t('appMenu.file'),
      role: 'fileMenu',
      submenu: [{ role: 'close', label: t('appMenu.closeWindow') }]
    },
    {
      label: t('appMenu.edit'),
      role: 'editMenu',
      submenu: [
        { role: 'undo', label: t('appMenu.undo') },
        { role: 'redo', label: t('appMenu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('appMenu.cut') },
        { role: 'copy', label: t('appMenu.copy') },
        { role: 'paste', label: t('appMenu.paste') },
        { role: 'pasteAndMatchStyle', label: t('appMenu.pasteAndMatchStyle') },
        { role: 'delete', label: t('appMenu.delete') },
        { role: 'selectAll', label: t('appMenu.selectAll') },
        { type: 'separator' },
        {
          label: t('appMenu.substitutions'),
          submenu: [
            { role: 'showSubstitutions', label: t('appMenu.showSubstitutions') },
            { type: 'separator' },
            { role: 'toggleSmartQuotes', label: t('appMenu.smartQuotes') },
            { role: 'toggleSmartDashes', label: t('appMenu.smartDashes') },
            { role: 'toggleTextReplacement', label: t('appMenu.textReplacement') }
          ]
        },
        {
          label: t('appMenu.speech'),
          submenu: [
            { role: 'startSpeaking', label: t('appMenu.startSpeaking') },
            { role: 'stopSpeaking', label: t('appMenu.stopSpeaking') }
          ]
        }
      ]
    },
    {
      label: t('appMenu.view'),
      role: 'viewMenu',
      submenu: [
        { role: 'reload', label: t('appMenu.reload') },
        { role: 'forceReload', label: t('appMenu.forceReload') },
        { role: 'toggleDevTools', label: t('appMenu.toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('appMenu.resetZoom') },
        { role: 'zoomIn', label: t('appMenu.zoomIn') },
        { role: 'zoomOut', label: t('appMenu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('appMenu.toggleFullScreen') }
      ]
    },
    {
      label: t('appMenu.window'),
      role: 'windowMenu',
      submenu: [
        { role: 'minimize', label: t('appMenu.minimize') },
        { role: 'zoom', label: t('appMenu.zoom') },
        { type: 'separator' },
        { role: 'front', label: t('appMenu.bringAllToFront') }
      ]
    }
  ]
}
