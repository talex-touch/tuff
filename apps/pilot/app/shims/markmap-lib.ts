export class Transformer {
  getAssets() {
    return {
      scripts: [],
      styles: [],
    }
  }

  transform(_content: unknown) {
    return {
      root: {},
    }
  }
}
