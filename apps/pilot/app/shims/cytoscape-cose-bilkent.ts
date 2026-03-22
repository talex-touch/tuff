import cytoscapeCoseBilkentCjs from 'cytoscape-cose-bilkent/cytoscape-cose-bilkent.js'

type CytoscapeExtension = (...args: unknown[]) => unknown

const cytoscapeCoseBilkentValue = cytoscapeCoseBilkentCjs as
  | CytoscapeExtension
  | { default?: CytoscapeExtension, cytoscapeCoseBilkent?: CytoscapeExtension }

const cytoscapeCoseBilkent: CytoscapeExtension = typeof cytoscapeCoseBilkentValue === 'function'
  ? cytoscapeCoseBilkentValue
  : typeof cytoscapeCoseBilkentValue?.default === 'function'
    ? cytoscapeCoseBilkentValue.default
    : typeof cytoscapeCoseBilkentValue?.cytoscapeCoseBilkent === 'function'
      ? cytoscapeCoseBilkentValue.cytoscapeCoseBilkent
      : () => undefined

export {
  cytoscapeCoseBilkent,
}

export default cytoscapeCoseBilkent
