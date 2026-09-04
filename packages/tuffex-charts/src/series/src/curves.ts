import type { CurveFactory } from 'd3-shape'
import type { LineCurve } from './types'
import { curveLinear, curveMonotoneX, curveNatural, curveStep } from 'd3-shape'

const CURVES: Record<LineCurve, CurveFactory> = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  natural: curveNatural,
  step: curveStep,
}

export function curveFactory(curve: LineCurve): CurveFactory {
  return CURVES[curve]
}
