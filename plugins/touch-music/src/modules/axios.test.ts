import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  axios,
  buildRequestUrl,
  getMusicApiBaseUrl,
  resetPluginNetworkClient,
  setMusicApiBaseUrl,
} from './axios.js'

const sdkMocks = vi.hoisted(() => ({
  request: vi.fn(),
  usePluginNetwork: vi.fn(),
}))

vi.mock('@talex-touch/utils/plugin/sdk', () => ({
  usePluginNetwork: sdkMocks.usePluginNetwork,
}))

describe('touch-music permission-gated network client', () => {
  beforeEach(() => {
    resetPluginNetworkClient()
    setMusicApiBaseUrl('')
    delete (globalThis as Record<string, unknown>).__TOUCH_MUSIC_API_BASE_URL__
    sdkMocks.request.mockReset()
    sdkMocks.usePluginNetwork.mockReset()
    sdkMocks.usePluginNetwork.mockReturnValue({ request: sdkMocks.request })
  })

  afterEach(() => {
    setMusicApiBaseUrl('')
    delete (globalThis as Record<string, unknown>).__TOUCH_MUSIC_API_BASE_URL__
  })

  it('requires a configured API base URL instead of routing to a third-party proxy', async () => {
    expect(getMusicApiBaseUrl()).toBe('')
    expect(() => buildRequestUrl('/cloudsearch', { keywords: 'piano' })).toThrow(/not configured/i)
    await expect(axios.get('/banner')).rejects.toMatchObject({
      code: 'MUSIC_API_BASE_URL_NOT_CONFIGURED',
    })
  })

  it('validates configured base URLs and forwards requests through usePluginNetwork', async () => {
    expect(() => setMusicApiBaseUrl('http://music.example.com')).toThrow(/https/i)
    expect(setMusicApiBaseUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000/')
    expect(setMusicApiBaseUrl('https://music.tuff.example')).toBe('https://music.tuff.example/')

    sdkMocks.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://music.tuff.example/cloudsearch?keywords=piano',
      data: { code: 200, result: { songs: [] } },
    })

    const data = await axios.get('/cloudsearch', { params: { keywords: 'piano' } })

    expect(buildRequestUrl('/cloudsearch', { keywords: 'piano' })).toBe(
      'https://music.tuff.example/cloudsearch?keywords=piano',
    )
    expect(sdkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://music.tuff.example/cloudsearch?keywords=piano',
      responseType: 'json',
    }))
    expect(data).toEqual({ code: 200, result: { songs: [] } })
  })

  it('fails closed when plugin network SDK is unavailable', async () => {
    setMusicApiBaseUrl('https://music.tuff.example')
    sdkMocks.usePluginNetwork.mockImplementation(() => {
      throw new Error('channel not available')
    })

    await expect(axios.get('/banner')).rejects.toMatchObject({
      code: 'NETWORK_INTERNET_PERMISSION_UNAVAILABLE',
    })
    expect(sdkMocks.request).not.toHaveBeenCalled()
  })

  it('propagates network.internet permission denial without swallowing errors', async () => {
    setMusicApiBaseUrl('https://music.tuff.example')
    sdkMocks.request.mockRejectedValueOnce(
      Object.assign(new Error('network.internet denied'), {
        code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
      }),
    )

    await expect(axios.get('/banner')).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
    })
  })
})
