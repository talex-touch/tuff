import { withInstall } from '../utils/with-install'
import arcComponent from './src/TxArcSeries.vue'
import areaComponent from './src/TxAreaSeries.vue'
import barComponent from './src/TxBarSeries.vue'
import lineComponent from './src/TxLineSeries.vue'
import scatterComponent from './src/TxScatterSeries.vue'

const TxLineSeries = withInstall(lineComponent)
const TxAreaSeries = withInstall(areaComponent)
const TxBarSeries = withInstall(barComponent)
const TxScatterSeries = withInstall(scatterComponent)
const TxArcSeries = withInstall(arcComponent)

export { TxArcSeries, TxAreaSeries, TxBarSeries, TxLineSeries, TxScatterSeries }
export type {
  ArcSeriesProps,
  ArcSliceDatum,
  AreaSeriesProps,
  BarSeriesProps,
  CartesianSeriesProps,
  LineCurve,
  LineSeriesProps,
  ScatterSeriesProps,
} from './src/types'
