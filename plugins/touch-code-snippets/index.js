const { logger } = globalThis

module.exports = {
  async onInit() {
    logger?.info?.('[touch-code-snippets] Retired. Use touch-snippets instead.')
  },
}
