import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(() => {
  const memoryTotal = 8 * 1024 * 1024 * 1024
  const memoryAvailable = Math.floor(memoryTotal * 0.42)
  return quotaOk({
    runtime: {
      npmVersion: '10.9.0',
      nodeVersion: process.version,
      os: process.platform,
      arch: process.arch,
    },
    cpu: {
      manufacturer: 'Pilot',
      brand: 'Mock CPU',
      physicalCores: 4,
      model: 'pilot-mock',
      speed: 2.8,
      rawCurrentLoad: 120000,
      rawCurrentLoadIdle: 260000,
      coresLoad: [
        { rawLoad: 24000, rawLoadIdle: 65000 },
        { rawLoad: 28000, rawLoadIdle: 62000 },
        { rawLoad: 31000, rawLoadIdle: 64000 },
        { rawLoad: 37000, rawLoadIdle: 69000 },
      ],
    },
    disk: {
      size: 512 * 1024 * 1024 * 1024,
      used: 221 * 1024 * 1024 * 1024,
      available: 291 * 1024 * 1024 * 1024,
    },
    memory: {
      total: memoryTotal,
      available: memoryAvailable,
    },
  })
})
