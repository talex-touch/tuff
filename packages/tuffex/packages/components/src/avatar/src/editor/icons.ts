/**
 * Self-contained 24x24 stroke glyphs for TxAvatar & TxAvatarEditor chrome.
 * Drawn inline so icons render crisply in every host regardless of installed icon collections.
 */
export const AVATAR_EDITOR_ICONS = {
  camera: [
    'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-1.8A1.5 1.5 0 0 1 10.6 3.5h2.8a1.5 1.5 0 0 1 1.2.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z',
    'M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  ],
  upload: [
    'M12 16V4',
    'm7.5 8.5 4.5-4.5 4.5 4.5',
    'M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5',
  ],
  rotateLeft: [
    'M4.5 12a7.5 7.5 0 1 0 2.2-5.3',
    'M4.4 4.2v3.4h3.4',
  ],
  rotateRight: [
    'M19.5 12a7.5 7.5 0 1 1-2.2-5.3',
    'M19.6 4.2v3.4h-3.4',
  ],
  flipH: [
    'M12 4v16',
    'M8.5 7.5 4 12l4.5 4.5z',
    'M15.5 7.5 20 12l-4.5 4.5z',
  ],
  flipV: [
    'M4 12h16',
    'M7.5 8.5 12 4l4.5 4.5z',
    'M7.5 15.5 12 20l4.5-4.5z',
  ],
  fitContain: [
    'M4 9V5a1 1 0 0 1 1-1h4',
    'M20 9V5a1 1 0 0 0-1-1h-4',
    'M4 15v4a1 1 0 0 0 1 1h4',
    'M20 15v4a1 1 0 0 1-1 1h-4',
    'M8.5 8.5h7v7h-7z',
  ],
  fitCover: [
    'M9 4H5a1 1 0 0 0-1 1v4',
    'M15 4h4a1 1 0 0 1 1 1v4',
    'M9 20H5a1 1 0 0 1-1-1v-4',
    'M15 20h4a1 1 0 0 0 1-1v-4',
  ],
  reset: [
    'M4 12a8 8 0 1 0 2.34-5.66L4 8.5',
    'M4 4v4.5h4.5',
  ],
  play: ['M7.5 5.5 18.5 12l-11 6.5z'],
  pause: ['M7.5 5.5v13', 'M16.5 5.5v13'],
  stepBack: ['M7 6v12', 'M17.5 6.5 10.5 12l7 5.5z'],
  stepForward: ['M17 6v12', 'M6.5 6.5 13.5 12l-7 5.5z'],
  download: [
    'M12 4v11',
    'm7.5 10.5 4.5 4.5 4.5-4.5',
    'M5 19.5h14',
  ],
  sliders: [
    'M4 7h16',
    'M4 17h16',
    'M9 4.5v5',
    'M15 14.5v5',
  ],
} as const satisfies Record<string, readonly string[]>

export type AvatarEditorIconName = keyof typeof AVATAR_EDITOR_ICONS
