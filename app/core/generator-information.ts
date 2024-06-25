import fse from 'fs-extra'
import pkg from './package.json'
import path from 'path'

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
  const signaturePath = path.join(__dirname, "signature.json")

  let signatureObj = {}
  if (fse.existsSync(signaturePath)) {
    const data = fse.readJsonSync(signaturePath, { encoding: "utf8" })

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


export default function generatorInformation() {
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
    },
    buildStart() {
      const informationPath = path.resolve(config.root, 'src/information.json')

      fse.writeFileSync(informationPath, JSON.stringify({
        refuse: false,
        version: pkg.version,
        buildTime: Date.now(),
        signature
      }))

      console.log(`[Talex-Touch] generate information.json`)
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return

      const devMode = config.command === 'serve'
      const information = {
        buildTime: -1,
        refuse: true
      }
      if (devMode) {
        Object.assign(information, {
          refuse: false,
          buildTime: Date.now(),
          version: pkg.version,
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

        export default information
      `
    }
  }
}