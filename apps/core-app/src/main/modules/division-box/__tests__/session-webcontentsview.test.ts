/**
 * Tests for DivisionBoxSession WebContentsView management
 * Task 2.3: WebContentsView management methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DivisionBoxSession } from '../session'
import { DivisionBoxState, DivisionBoxErrorCode, type DivisionBoxConfig } from '../types'
import { WebContentsView } from 'electron'

// Mock Electron's WebContentsView
vi.mock('electron', () => ({
  WebContentsView: vi.fn().mockImplementation(() => ({
    webContents: {
      loadURL: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn()
    }
  }))
}))

describe('DivisionBoxSession - WebContentsView Management', () => {
  let session: DivisionBoxSession
  const testConfig: DivisionBoxConfig = {
    url: 'https://example.com',
    title: 'Test DivisionBox',
    size: 'medium',
    keepAlive: false
  }

  beforeEach(() => {
    vi.clearAllMocks()
    session = new DivisionBoxSession('test-session-1', testConfig)
  })

  describe('createWebContentsView', () => {
    it('should create a WebContentsView and load the URL', async () => {
      const url = 'https://example.com/test'
      
      await session.createWebContentsView(url)
      
      // Verify WebContentsView was created
      expect(WebContentsView).toHaveBeenCalledWith({
        webPreferences: expect.objectContaining({
          nodeIntegration: false,
          contextIsolation: true
        })
      })
      
      // Verify URL was loaded
      const view = session.getWebContentsView()
      expect(view).not.toBeNull()
      expect(view?.webContents.loadURL).toHaveBeenCalledWith(url)
      
      // Verify state transitioned to ATTACH
      expect(session.getState()).toBe(DivisionBoxState.ATTACH)
    })

    it('should merge custom webPreferences with defaults', async () => {
      const customConfig: DivisionBoxConfig = {
        ...testConfig,
        webPreferences: {
          sandbox: true,
          webSecurity: true
        }
      }
      
      const customSession = new DivisionBoxSession('test-session-2', customConfig)
      await customSession.createWebContentsView('https://example.com')
      
      expect(WebContentsView).toHaveBeenCalledWith({
        webPreferences: expect.objectContaining({
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        })
      })
    })

    it('should throw error if WebContentsView already exists', async () => {
      await session.createWebContentsView('https://example.com')
      
      await expect(
        session.createWebContentsView('https://example.com/another')
      ).rejects.toThrow('WebContentsView already exists')
    })

    it('should throw RESOURCE_ERROR if view creation fails', async () => {
      const failingSession = new DivisionBoxSession('failing-session', testConfig)
      
      // Mock WebContentsView to throw error
      vi.mocked(WebContentsView).mockImplementationOnce(() => {
        throw new Error('Failed to create view')
      })
      
      await expect(
        failingSession.createWebContentsView('https://example.com')
      ).rejects.toMatchObject({
        code: DivisionBoxErrorCode.RESOURCE_ERROR,
        message: expect.stringContaining('Failed to create WebContentsView')
      })
      
      // Verify view is null after failure
      expect(failingSession.getWebContentsView()).toBeNull()
    })
  })

  describe('getWebContentsView', () => {
    it('should return null when no view is created', () => {
      expect(session.getWebContentsView()).toBeNull()
    })

    it('should return the WebContentsView instance after creation', async () => {
      await session.createWebContentsView('https://example.com')
      
      const view = session.getWebContentsView()
      expect(view).not.toBeNull()
      expect(view).toHaveProperty('webContents')
    })

    it('should return null after view is destroyed', async () => {
      await session.createWebContentsView('https://example.com')
      expect(session.getWebContentsView()).not.toBeNull()
      
      session.destroyWebContentsView()
      expect(session.getWebContentsView()).toBeNull()
    })
  })

  describe('destroyWebContentsView', () => {
    it('should destroy the WebContentsView and set to null', async () => {
      await session.createWebContentsView('https://example.com')
      const view = session.getWebContentsView()
      
      session.destroyWebContentsView()
      
      expect(view?.webContents.destroy).toHaveBeenCalled()
      expect(session.getWebContentsView()).toBeNull()
    })

    it('should handle destroy gracefully when no view exists', () => {
      expect(() => session.destroyWebContentsView()).not.toThrow()
      expect(session.getWebContentsView()).toBeNull()
    })

    it('should handle errors during destruction gracefully', async () => {
      await session.createWebContentsView('https://example.com')
      const view = session.getWebContentsView()
      
      // Mock destroy to throw error
      vi.mocked(view!.webContents.destroy).mockImplementationOnce(() => {
        throw new Error('Destroy failed')
      })
      
      // Should not throw, but log error
      expect(() => session.destroyWebContentsView()).not.toThrow()
      expect(session.getWebContentsView()).toBeNull()
    })

    it('should be called during session destroy', async () => {
      await session.createWebContentsView('https://example.com')
      const view = session.getWebContentsView()
      
      await session.destroy()
      
      expect(view?.webContents.destroy).toHaveBeenCalled()
      expect(session.getWebContentsView()).toBeNull()
      expect(session.getState()).toBe(DivisionBoxState.DESTROY)
    })
  })

  describe('Integration with lifecycle', () => {
    it('should transition to ATTACH state after creating view', async () => {
      expect(session.getState()).toBe(DivisionBoxState.PREPARE)
      
      await session.createWebContentsView('https://example.com')
      
      expect(session.getState()).toBe(DivisionBoxState.ATTACH)
    })

    it('should allow state transitions after view creation', async () => {
      await session.createWebContentsView('https://example.com')
      expect(session.getState()).toBe(DivisionBoxState.ATTACH)
      
      await session.setState(DivisionBoxState.ACTIVE)
      expect(session.getState()).toBe(DivisionBoxState.ACTIVE)
      
      await session.setState(DivisionBoxState.INACTIVE)
      expect(session.getState()).toBe(DivisionBoxState.INACTIVE)
    })
  })
})
