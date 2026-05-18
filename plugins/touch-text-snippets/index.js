const { logger } = globalThis

module.exports = {
  async onInit() {
    logger?.info?.('[touch-text-snippets] Retired. Use touch-snippets instead.')
  },
}
