import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axios, buildRequestUrl, resetPluginNetworkClient } from './axios.js'

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
    sdkMocks.request.mockReset()
    sdkMocks.usePluginNetwork.mockReset()
    sdkMocks.usePluginNetwork.mockReturnValue({ request: sdkMocks.request })
  })

  it('builds query URLs cleanly and forwards requests through usePluginNetwork', async () => {
    sdkMocks.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://netease-cloud-music-api-umber-theta.vercel.app/cloudsearch?keywords=piano',
      data: { code: 200, result: { songs: [] } },
    })

    const data = await axios.get('/cloudsearch', { params: { keywords: 'piano' } })

    expect(buildRequestUrl('/cloudsearch', { keywords: 'piano' })).toBe(
      'https://netease-cloud-music-api-umber-theta.vercel.app/cloudsearch?keywords=piano',
    )
    expect(sdkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://netease-cloud-music-api-umber-theta.vercel.app/cloudsearch?keywords=piano',
      responseType: 'json',
    }))
    expect(data).toEqual({ code: 200, result: { songs: [] } })
  })

  it('fails closed when plugin network SDK is unavailable', async () => {
    sdkMocks.usePluginNetwork.mockImplementation(() => {
      throw new Error('channel not available')
    })

    await expect(axios.get('/banner')).rejects.toMatchObject({
      code: 'NETWORK_INTERNET_PERMISSION_UNAVAILABLE',
    })
    expect(sdkMocks.request).not.toHaveBeenCalled()
  })

  it('propagates network.internet permission denial without swallowing errors', async () => {
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
