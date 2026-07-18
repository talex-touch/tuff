'use strict'

const process = require('node:process')

const EVERYTHING_INSTALL_RESOURCES = Object.freeze({
  x64: Object.freeze([
    Object.freeze({
      type: 'everything',
      filename: 'Everything-1.4.1.1032.x64.zip',
      url: 'https://www.voidtools.com/Everything-1.4.1.1032.x64.zip',
      sha256:
        '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c',
    }),
    Object.freeze({
      type: 'sdk',
      filename: 'Everything-SDK.zip',
      url: 'https://www.voidtools.com/Everything-SDK.zip',
      sha256:
        '00693a1561d86d29a24e4691877ece7fb23e9a5d8d8cbb2435e0b8576e96f343',
    }),
    Object.freeze({
      type: 'cli',
      filename: 'ES-1.1.0.30.x64.zip',
      url: 'https://www.voidtools.com/ES-1.1.0.30.x64.zip',
      sha256:
        '30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268',
    }),
  ]),
  x86: Object.freeze([
    Object.freeze({
      type: 'everything',
      filename: 'Everything-1.4.1.1032.x86.zip',
      url: 'https://www.voidtools.com/Everything-1.4.1.1032.x86.zip',
      sha256:
        '156db5beb747d69470518a7b9b55af11efc4d3285ddb7cc013c0cc13ced5f237',
    }),
    Object.freeze({
      type: 'sdk',
      filename: 'Everything-SDK.zip',
      url: 'https://www.voidtools.com/Everything-SDK.zip',
      sha256:
        '00693a1561d86d29a24e4691877ece7fb23e9a5d8d8cbb2435e0b8576e96f343',
    }),
    Object.freeze({
      type: 'cli',
      filename: 'ES-1.1.0.30.x86.zip',
      url: 'https://www.voidtools.com/ES-1.1.0.30.x86.zip',
      sha256:
        '7e9f04cb92e9eb0440655a395537b204e98e3accd5335e610649d323b15f5117',
    }),
  ]),
  ARM64: Object.freeze([
    Object.freeze({
      type: 'everything',
      filename: 'Everything-1.4.1.1032.ARM64.zip',
      url: 'https://www.voidtools.com/Everything-1.4.1.1032.ARM64.zip',
      sha256:
        '23dca1a64574bf30c9988bbaf5f1d201a0ec7ee9a15e12270ae92a52183cccc8',
    }),
    Object.freeze({
      type: 'sdk',
      filename: 'Everything-SDK.zip',
      url: 'https://www.voidtools.com/Everything-SDK.zip',
      sha256:
        '00693a1561d86d29a24e4691877ece7fb23e9a5d8d8cbb2435e0b8576e96f343',
    }),
    Object.freeze({
      type: 'cli',
      filename: 'ES-1.1.0.30.ARM64.zip',
      url: 'https://www.voidtools.com/ES-1.1.0.30.ARM64.zip',
      sha256:
        'af5f02b29d6e91b7e70d3b6809bbfe931af671d981e060ecb4f015c30f9697b9',
    }),
  ]),
})

function resolveEverythingInstallArchitecture(environment = process.env) {
  const nativeArch
    = environment.PROCESSOR_ARCHITEW6432 || environment.PROCESSOR_ARCHITECTURE
  if (nativeArch === 'ARM64')
    return 'ARM64'
  if (nativeArch === 'x86')
    return 'x86'
  return 'x64'
}

function getEverythingInstallResources(
  architecture = resolveEverythingInstallArchitecture(),
) {
  const resources = EVERYTHING_INSTALL_RESOURCES[architecture]
  if (!resources) {
    throw new Error(
      `Unsupported Everything install architecture: ${architecture}`,
    )
  }
  return resources.map(resource => ({ ...resource }))
}

module.exports = {
  EVERYTHING_INSTALL_RESOURCES,
  getEverythingInstallResources,
  resolveEverythingInstallArchitecture,
}
