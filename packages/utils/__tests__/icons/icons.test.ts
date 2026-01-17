import { describe, expect, it } from 'vitest'

import { AppIcons, classIcon, getIcon, TuffIcons } from '../../icons'

describe('tuffIcons', () => {
  it('should have common icons defined', () => {
    expect(TuffIcons.Search).toBe('i-ri-search-line')
    expect(TuffIcons.Settings).toBe('i-ri-settings-3-line')
    expect(TuffIcons.Home).toBe('i-ri-home-line')
    expect(TuffIcons.User).toBe('i-ri-user-line')
  })

  it('should have navigation icons', () => {
    expect(TuffIcons.Back).toBe('i-ri-arrow-left-line')
    expect(TuffIcons.Forward).toBe('i-ri-arrow-right-line')
    expect(TuffIcons.Menu).toBe('i-ri-menu-line')
  })

  it('should have action icons', () => {
    expect(TuffIcons.Add).toBe('i-ri-add-line')
    expect(TuffIcons.Delete).toBe('i-ri-delete-bin-line')
    expect(TuffIcons.Edit).toBe('i-ri-edit-line')
    expect(TuffIcons.Copy).toBe('i-ri-file-copy-line')
  })

  it('should have status icons', () => {
    expect(TuffIcons.Check).toBe('i-ri-check-line')
    expect(TuffIcons.Close).toBe('i-ri-close-line')
    expect(TuffIcons.Warning).toBe('i-ri-error-warning-line')
    expect(TuffIcons.Info).toBe('i-ri-information-line')
  })

  it('should have file icons', () => {
    expect(TuffIcons.File).toBe('i-ri-file-line')
    expect(TuffIcons.Folder).toBe('i-ri-folder-line')
    expect(TuffIcons.FileCode).toBe('i-ri-file-code-line')
  })

  it('should follow UnoCSS icon naming convention', () => {
    Object.values(TuffIcons).forEach((iconClass) => {
      expect(iconClass).toMatch(/^i-[a-z]+-[a-z0-9-]+$/)
    })
  })
})

describe('classIcon', () => {
  it('should create ITuffIcon from class name', () => {
    const icon = classIcon('i-ri-star-line')
    expect(icon.type).toBe('class')
    expect(icon.value).toBe('i-ri-star-line')
  })
})

describe('getIcon', () => {
  it('should get ITuffIcon from TuffIcons key', () => {
    const icon = getIcon('Search')
    expect(icon.type).toBe('class')
    expect(icon.value).toBe('i-ri-search-line')
  })

  it('should work with all defined icon keys', () => {
    const keys = ['Home', 'Settings', 'User', 'File', 'Folder'] as const
    keys.forEach((key) => {
      const icon = getIcon(key)
      expect(icon.type).toBe('class')
      expect(icon.value).toBeTruthy()
    })
  })
})

describe('appIcons', () => {
  it('should have app brand icons', () => {
    expect(AppIcons.VSCode).toBe('i-simple-icons-visualstudiocode')
    expect(AppIcons.Chrome).toBe('i-simple-icons-googlechrome')
    expect(AppIcons.GitHub).toBe('i-simple-icons-github')
    expect(AppIcons.Slack).toBe('i-simple-icons-slack')
  })

  it('should follow UnoCSS icon naming convention', () => {
    Object.values(AppIcons).forEach((iconClass) => {
      expect(iconClass).toMatch(/^i-[a-z]+-[a-z0-9-]+$/)
    })
  })
})
