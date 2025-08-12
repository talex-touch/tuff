import fse from 'fs-extra'
import pkg from './package.json'
import path from 'path'

import type { Plugin } from 'vite'

console.log('[Talex-Touch] Generate Information ...')

function randomString(len: number) {
  let chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
  let maxPos = chars.length
  let pwd = ''
  for (let i = 0; i < len; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * maxPos))
  }
  return pwd
}

let genSignature = () => {
  const signaturePath = path.join(__dirname, 'signature.json')

  let signatureObj = {}
  if (fse.existsSync(signaturePath)) {
    const data = fse.readJsonSync(signaturePath, { encoding: 'utf8' })

    signatureObj = JSON.parse(JSON.stringify(data))
  } else {
    // random 32 bytes
    const signature = Buffer.from(randomString(64)).toString('hex')

    signatureObj = {
      version: pkg.version,
      date: new Date().toISOString(),
      hash: signature
    }

    fse.writeJsonSync(signaturePath, signatureObj)
  }

  genSignature = () => signatureObj

  return signatureObj
}

export default function generatorInformation(): Plugin {
  const virtualModuleId = 'talex-touch:information'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

  const signature = genSignature()
  let config

  return {
    enforce: 'pre',
    name: 'generator-information',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      return null
    },
    buildStart() {
      const informationPath = path.resolve(config.root, 'src/distinformation.json')

      // Get build type
      const buildType = process.env.BUILD_TYPE || 'release'
      const isSnapshot = buildType === 'snapshot'
      const isBeta = buildType === 'beta'
      const isRelease = buildType === 'release'

      fse.writeFileSync(
        informationPath,
        JSON.stringify({
          refuse: false,
          version: pkg.version,
          buildTime: Date.now(),
          buildType,
          isSnapshot,
          isBeta,
          isRelease,
          signature
        })
      )

      console.log(`[Talex-Touch] generate information.json with build type: ${buildType}`)
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return

      const devMode = config.command === 'serve'
      const buildType = process.env.BUILD_TYPE || 'release'

      const information = {
        buildTime: -1,
        refuse: true,
        buildType: 'unknown',
        isSnapshot: false,
        isBeta: false,
        isRelease: false
      }

      if (devMode) {
        Object.assign(information, {
          refuse: false,
          buildTime: Date.now(),
          version: pkg.version,
          buildType,
          isSnapshot: buildType === 'snapshot',
          isBeta: buildType === 'beta',
          isRelease: buildType === 'release',
          signature
        })
      } else {
        const informationPath = path.resolve(config.root, 'src/information.json')
        if (fse.existsSync(informationPath)) {
          Object.assign(information, JSON.parse(fse.readJsonSync(informationPath, 'utf-8')))
        }
      }

      return `
        const information = ${JSON.stringify(information)}
        export const packageJson = ${JSON.stringify(pkg)}

        export default information
      `
    }
  }
}
