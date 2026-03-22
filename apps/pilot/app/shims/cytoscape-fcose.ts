import cytoscapeFcoseCjs from 'cytoscape-fcose/cytoscape-fcose.js'

type CytoscapeExtension = (...args: unknown[]) => unknown

const cytoscapeFcoseValue = cytoscapeFcoseCjs as
  | CytoscapeExtension
  | { default?: CytoscapeExtension, cytoscapeFcose?: CytoscapeExtension }

const cytoscapeFcose: CytoscapeExtension = typeof cytoscapeFcoseValue === 'function'
  ? cytoscapeFcoseValue
  : typeof cytoscapeFcoseValue?.default === 'function'
    ? cytoscapeFcoseValue.default
    : typeof cytoscapeFcoseValue?.cytoscapeFcose === 'function'
      ? cytoscapeFcoseValue.cytoscapeFcose
      : () => undefined

export {
  cytoscapeFcose,
}

export default cytoscapeFcose
