// Ported from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties } from 'vue'
import type { LoaderNode, LoaderTiming, LoaderValue } from './scene-types'
import { resolveTransition } from '../../liquid/src/spring'

interface Series {
  values: LoaderValue[]
  offsets: number[]
}

export interface LoaderTrack {
  frames: Keyframe[]
  timing: LoaderTiming
}

const EASING: Record<string, string> = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.42, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.58, 1)',
  easeInOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
  // Sample the source circular easing instead of substituting a generic bezier.
  circIn: 'linear(0, 0.000122, 0.000488, 0.001099, 0.001955, 0.003056, 0.004404, 0.005999, 0.007843, 0.009937, 0.012282, 0.014881, 0.017735, 0.020847, 0.024219, 0.027854, 0.031754, 0.035924, 0.040365, 0.045084, 0.050082, 0.055366, 0.060939, 0.066807, 0.072975, 0.07945, 0.086238, 0.093346, 0.100782, 0.108553, 0.116669, 0.12514, 0.133975, 0.143186, 0.152785, 0.162786, 0.173203, 0.184052, 0.19535, 0.207118, 0.219375, 0.232146, 0.245456, 0.259335, 0.273816, 0.288934, 0.304731, 0.321256, 0.338562, 0.356713, 0.375782, 0.395856, 0.417039, 0.439457, 0.463264, 0.488654, 0.515877, 0.545261, 0.577258, 0.612513, 0.652015, 0.697423, 0.751961, 0.823915, 1)',
  circInOut: 'linear(0, 0.000244, 0.000978, 0.002202, 0.003922, 0.006141, 0.008868, 0.01211, 0.015877, 0.020183, 0.025041, 0.030469, 0.036488, 0.043119, 0.050391, 0.058335, 0.066987, 0.076392, 0.086601, 0.097675, 0.109688, 0.122728, 0.136908, 0.152366, 0.169281, 0.187891, 0.208519, 0.231632, 0.257939, 0.288629, 0.326007, 0.37598, 0.5, 0.62402, 0.673993, 0.711371, 0.742061, 0.768368, 0.791481, 0.812109, 0.830719, 0.847634, 0.863092, 0.877272, 0.890312, 0.902325, 0.913399, 0.923608, 0.933013, 0.941665, 0.949609, 0.956881, 0.963512, 0.969531, 0.974959, 0.979817, 0.984123, 0.98789, 0.991132, 0.993859, 0.996078, 0.997798, 0.999022, 0.999756, 1)',
}

export function loaderEasing(timing: LoaderTiming): string {
  if (timing.type === 'spring') {
    const bounce = timing.bounce ?? 0.25
    // Retain the source bounce while using the library's single spring compiler.
    return resolveTransition({
      stiffness: 320,
      damping: 2 * (1 - bounce) * Math.sqrt(320),
      mass: 1,
    }).easing
  }
  return EASING[timing.ease ?? 'easeOut'] ?? timing.ease ?? EASING.easeOut!
}

function timingFor(node: LoaderNode, key: string): LoaderTiming {
  return { ...node.motion!.timing, ...node.motion!.propertyTiming?.[key] }
}

function initialValue(node: LoaderNode, key: string): LoaderValue {
  const initial = node.motion?.initial?.[key]
  if (initial !== undefined)
    return initial
  const style = node.style as Record<string, LoaderValue> | undefined
  if (style?.[key] !== undefined)
    return style[key]!
  return key.startsWith('scale') || key === 'opacity' ? 1 : 0
}

function seriesFor(node: LoaderNode, key: string): Series {
  const value = node.motion?.values[key]
  const values = Array.isArray(value)
    ? value
    : [initialValue(node, key), value ?? initialValue(node, key)]
  const times = timingFor(node, key).times
  return {
    values,
    offsets: times?.length === values.length
      ? times
      : values.map((_, index) => index / Math.max(1, values.length - 1)),
  }
}

function sample(series: Series, offset: number): LoaderValue {
  const exact = series.offsets.indexOf(offset)
  if (exact !== -1)
    return series.values[exact]!
  const next = series.offsets.findIndex(value => value > offset)
  if (next < 1)
    return series.values[next === -1 ? series.values.length - 1 : 0]!
  const from = series.values[next - 1]!
  const to = series.values[next]!
  const ratio = (offset - series.offsets[next - 1]!)
    / (series.offsets[next]! - series.offsets[next - 1]!)
  const unit = typeof from === 'string' ? from.replace(/^[-\d.]+/, '') : ''
  const result = Number.parseFloat(String(from))
    + (Number.parseFloat(String(to)) - Number.parseFloat(String(from))) * ratio
  return unit ? `${result}${unit}` : result
}

function unit(value: LoaderValue, suffix: string): string {
  return typeof value === 'number' ? `${value}${suffix}` : value
}

/** Group only the axes of one native property; independent rhythms stay separate. */
export function loaderTracks(node: LoaderNode): LoaderTrack[] {
  if (!node.motion)
    return []
  const tracks: LoaderTrack[] = []
  const remaining = new Set(Object.keys(node.motion.values))
  const grouped = (
    keys: string[],
    property: string,
    format: (values: LoaderValue[]) => string,
  ): void => {
    const present = keys.filter(key => remaining.has(key))
    if (!present.length)
      return
    const series = keys.map(key => seriesFor(node, key))
    const offsets = [...new Set(series.flatMap(value => value.offsets))].sort((a, b) => a - b)
    const frames = offsets.map(offset => ({
      offset,
      [property]: format(series.map(value => sample(value, offset))),
    }))
    tracks.push({ frames, timing: timingFor(node, present[0]!) })
    for (const key of keys)
      remaining.delete(key)
  }

  grouped(['x', 'y'], 'translate', values => `${unit(values[0]!, 'px')} ${unit(values[1]!, 'px')}`)
  grouped(['scaleX', 'scaleY'], 'scale', values => `${values[0]} ${values[1]}`)
  grouped(['rotateX', 'rotateY'], 'transform', values =>
    `${node.style?.transform ?? ''} rotateX(${unit(values[0]!, 'deg')}) rotateY(${unit(values[1]!, 'deg')})`.trim())

  for (const key of remaining) {
    const series = seriesFor(node, key)
    const property = key === 'WebkitMaskPosition' ? 'webkitMaskPosition' : key
    const dimensional = ['height', 'width', 'top', 'gap', 'borderWidth'].includes(key)
    tracks.push({
      frames: series.values.map((value, index) => ({
        offset: series.offsets[index],
        [property]: key === 'rotate' ? unit(value, 'deg') : dimensional ? unit(value, 'px') : value,
      })),
      timing: timingFor(node, key),
    })
  }
  return tracks
}

/** Cancellation always returns to readable artwork rather than an invisible phase. */
export function loaderStaticStyle(node: LoaderNode): CSSProperties {
  const style: Record<string, LoaderValue> = { ...(node.style as Record<string, LoaderValue>) }
  if (!node.motion)
    return style as CSSProperties
  const values = node.motion.values
  const first = (key: string): LoaderValue => {
    const value = values[key]
    return Array.isArray(value) ? value[0]! : node.motion?.initial?.[key] ?? value ?? initialValue(node, key)
  }
  if ('x' in values || 'y' in values)
    style.translate = `${unit(first('x'), 'px')} ${unit(first('y'), 'px')}`
  if ('scaleX' in values || 'scaleY' in values)
    style.scale = `${first('scaleX')} ${first('scaleY')}`
  if ('rotateX' in values || 'rotateY' in values)
    style.transform = `${style.transform ?? ''} rotateX(${unit(first('rotateX'), 'deg')}) rotateY(${unit(first('rotateY'), 'deg')})`.trim()
  for (const [key, value] of Object.entries(values)) {
    if (['x', 'y', 'scaleX', 'scaleY', 'rotateX', 'rotateY'].includes(key))
      continue
    let frame = first(key)
    if (key === 'opacity')
      frame = Math.max(0.35, Number(frame))
    if (key === 'scale' && Number(frame) < 0.3)
      frame = 0.75
    if (['height', 'width'].includes(key)) {
      const candidates = Array.isArray(value) ? value : [value]
      frame = candidates.reduce((largest, candidate) =>
        Number.parseFloat(String(candidate)) > Number.parseFloat(String(largest)) ? candidate : largest, frame)
      if (Number.parseFloat(String(frame)) <= 0)
        frame = 32
    }
    if (key === 'strokeDashoffset')
      frame = 0
    if (key === 'rotate')
      frame = unit(frame, 'deg')
    else if (['height', 'width', 'top', 'gap', 'borderWidth'].includes(key))
      frame = unit(frame, 'px')
    style[key === 'WebkitMaskPosition' ? 'WebkitMaskPosition' : key] = frame
  }
  // TextReveal begins outside its clipping box; paused text belongs inside it.
  if (node.children?.some(child => typeof child === 'object' && 'label' in child)) {
    if ('y' in values)
      style.translate = '0px 0px'
    if (node.children.some(child => typeof child === 'object' && 'label' in child && child.label === 'waiting'))
      style.opacity = 0
    else if ('opacity' in values)
      style.opacity = 1
  }
  return style as CSSProperties
}
