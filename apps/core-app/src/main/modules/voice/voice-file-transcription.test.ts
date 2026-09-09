import { describe, expect, it, vi } from 'vitest'

const dialog = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))
const fs = vi.hoisted(() => ({ lstat: vi.fn(), open: vi.fn() }))

vi.mock('electron', () => ({ dialog }))
vi.mock('node:fs', () => ({ constants: { O_RDONLY: 0, O_NOFOLLOW: 0 } }))
vi.mock('node:fs/promises', () => fs)

import { selectVoiceFile } from './voice-file-transcription'

describe('selectVoiceFile', () => {
  it('rejects an oversized selected file before opening or loading its bytes', async () => {
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/private/recording.m4a']
    })
    fs.lstat.mockResolvedValue({
      isFile: () => true,
      isSymbolicLink: () => false,
      size: 26 * 1024 * 1024
    })

    await expect(selectVoiceFile()).rejects.toThrow('VOICE_FILE_TOO_LARGE')
    expect(fs.open).not.toHaveBeenCalled()
  })
})
