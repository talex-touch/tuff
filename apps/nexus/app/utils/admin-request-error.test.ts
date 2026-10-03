import { describe, expect, it } from 'vitest'
import { resolveAdminErrorMessage } from './admin-request-error'

describe('resolveAdminErrorMessage', () => {
  it('never shows the transport string, which names the API path', () => {
    const error = new Error('[GET] "/api/admin/audits?page=1&limit=20": <no response> Failed to fetch')
    expect(resolveAdminErrorMessage(error, 'Failed to load audit logs.')).toBe('Failed to load audit logs.')
  })

  it('prefers what the server wrote for people', () => {
    expect(resolveAdminErrorMessage({ data: { message: 'Audit store unavailable.' } }, 'fallback')).toBe('Audit store unavailable.')
    expect(resolveAdminErrorMessage({ data: { statusMessage: 'Database not available' } }, 'fallback')).toBe('Database not available')
    expect(resolveAdminErrorMessage({ statusMessage: 'Forbidden', data: { message: ' ' } }, 'fallback')).toBe('Forbidden')
  })

  it('falls back for anything else', () => {
    expect(resolveAdminErrorMessage(null, 'fallback')).toBe('fallback')
    expect(resolveAdminErrorMessage('boom', 'fallback')).toBe('fallback')
    expect(resolveAdminErrorMessage({ data: '<html>502</html>' }, 'fallback')).toBe('fallback')
  })
})
