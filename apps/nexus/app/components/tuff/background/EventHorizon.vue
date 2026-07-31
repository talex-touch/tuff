<template>
  <canvas ref="canvasRef" class="block h-full w-full" aria-hidden="true" />
</template>

<script setup lang="ts">
import { Mesh, Program, Renderer, Triangle, Vec2, Vec3 } from 'ogl'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useColorMode } from '#imports'
import { hasWindow } from '@talex-touch/utils/env'

interface FocusCircle {
  /** Center x in CSS px, relative to this canvas */
  x: number
  /** Center y in CSS px, relative to this canvas (top-down) */
  y: number
  /** Radius in CSS px; <= 0 hides the singularity */
  r: number
}

interface EventHorizonProps {
  focus?: FocusCircle | null
  speed?: number
  resolutionScale?: number
  /** Reveal the field from the center behind an expanding water-ripple wavefront */
  rippleIn?: boolean
}

const props = withDefaults(defineProps<EventHorizonProps>(), {
  focus: null,
  speed: 1,
  resolutionScale: 1,
  rippleIn: false,
})

const RIPPLE_IN_MS = 2680

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')
const colorMode = useColorMode()

const vertex = `
attribute vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}
`

const fragment = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;
uniform vec3 uFocus;
uniform float uTheme;
uniform float uReveal;
uniform float uEdgeRipple;

float hash21(vec2 p){
  p=fract(p*vec2(234.34,435.345));
  p+=dot(p,p+34.23);
  return fract(p.x*p.y);
}

float vnoise(vec2 p){
  vec2 i=floor(p);
  vec2 f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  float a=hash21(i);
  float b=hash21(i+vec2(1.0,0.0));
  float c=hash21(i+vec2(0.0,1.0));
  float d=hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}

float fbm(vec2 p){
  float v=0.0;
  float a=0.5;
  mat2 rot=mat2(0.8,0.6,-0.6,0.8);
  for(int i=0;i<5;i++){
    v+=a*vnoise(p);
    p=rot*p*2.03;
    a*=0.55;
  }
  return v;
}

void main(){
  vec2 uv=gl_FragCoord.xy/uResolution.xy;
  float aspect=uResolution.x/uResolution.y;
  vec2 p=vec2((uv.x-0.5)*aspect,uv.y-0.5);
  vec2 fc=vec2((uFocus.x-0.5)*aspect,uFocus.y-0.5);
  float r=uFocus.z;

  vec3 cyan=vec3(0.106,0.710,0.957);
  vec3 violet=vec3(0.545,0.396,0.996);

  // Gravitational lensing: background coords bend around the horizon
  vec2 sp=p;
  float d=0.0;
  if(r>0.001){
    vec2 q=p-fc;
    d=length(q);
    float pull=(r*r)*0.5/max(d,r*0.35);
    pull*=smoothstep(r*5.0,r*1.02,d);
    sp-=(q/max(d,1e-4))*pull;
  }

  // Centered ripple reveal: an expanding wavefront refracts the field like
  // water and trails damped rings behind it. At uReveal>=1 the intro terms
  // collapse to a no-op; only the gated edge lapping below keeps moving.
  float dc=length(p);
  float band=uReveal*1.35-dc;
  float reveal=smoothstep(0.0,0.16,band);
  float damp=exp(-max(band,0.0)*5.0)*(1.0-uReveal);
  if(damp>0.0005&&dc>1e-4){
    sp+=(p/dc)*sin(band*42.0)*damp*0.045;
  }

  // Perpetual edge lapping: after the intro front has passed, rings keep
  // traveling outward along the rim (gated per-surface by uEdgeRipple; it
  // ramps in with uReveal so it hands over from the intro seamlessly).
  float edgeWave=sin(dc*34.0-uTime*2.6)*smoothstep(0.55,0.95,dc)*uEdgeRipple*uReveal;

  // Roaming refraction swell: every ~10s a soft wave packet is born at the
  // center and sweeps across the whole field, bending nebula and stars like
  // a passing lens ring. Same gating as the edge lapping.
  float sweepT=fract(uTime*0.1);
  float sweepBand=dc-sweepT*1.5;
  float sweep=exp(-abs(sweepBand)*8.0)*sin(sweepBand*26.0)
    *smoothstep(0.0,0.12,sweepT)*(1.0-smoothstep(0.75,1.0,sweepT))
    *uEdgeRipple*uReveal;

  if(dc>1e-4){
    sp+=(p/dc)*(edgeWave*0.022+sweep*0.05);
  }

  // Domain-warped nebula
  float t=uTime*0.055;
  vec2 np=sp*1.35+uMouse*0.045;
  float f1=fbm(np+vec2(t*0.7,-t*0.4));
  float f2=fbm(np*1.9+vec2(-t*0.5,t*0.6)+f1*1.1);
  float centerMask=exp(-length(p-vec2(0.0,0.04))*1.35);
  vec3 neb=cyan*pow(smoothstep(0.30,0.92,f1),1.5)
    +violet*pow(smoothstep(0.38,0.95,f2),1.6)*0.9;
  neb*=0.42+0.58*centerMask;
  neb*=reveal;

  // Sparse twinkling starfield (lensed with the nebula)
  vec2 st=sp*34.0+vec2(100.0);
  vec2 cell=floor(st);
  vec2 cf=fract(st)-0.5;
  float h=hash21(cell);
  vec2 off=vec2(hash21(cell+3.1),hash21(cell+7.7))-0.5;
  float sd=length(cf-off*0.72);
  float tw=0.55+0.45*sin(uTime*(0.6+h*2.6)+h*43.0);
  float star=smoothstep(0.055,0.0,sd)*step(0.965,h)*tw;

  vec3 darkBase=mix(vec3(0.012,0.016,0.028),vec3(0.030,0.038,0.066),uv.y);
  vec3 lightBase=mix(vec3(0.965,0.975,0.988),vec3(0.922,0.940,0.968),uv.y);
  vec3 col=mix(darkBase,lightBase,uTheme);

  col+=neb*mix(1.0,0.5,uTheme);
  col+=vec3(0.85,0.92,1.0)*star*reveal*(1.0-uTheme);

  // Bright rim where the wavefront currently stands
  float frontGlow=exp(-abs(band)*22.0)*(1.0-uReveal);
  col+=mix(cyan,violet,0.55)*frontGlow*0.4*mix(1.0,0.55,uTheme);

  // Shimmer riding the perpetual edge rings; the additive crest glow is what
  // keeps them readable inside the darkened vignette zone.
  col*=1.0+edgeWave*0.18;
  col+=mix(cyan,violet,0.55)*max(edgeWave,0.0)*0.075*mix(1.0,0.5,uTheme);

  // Faint glint riding the roaming swell's crest
  col+=mix(cyan,violet,0.5)*max(sweep,0.0)*0.07*mix(1.0,0.5,uTheme);

  // Event horizon: accretion ring + chromatic fringe + swallowed core
  if(r>0.001){
    float ang=atan(p.y-fc.y,p.x-fc.x);
    vec2 dir=vec2(cos(ang),sin(ang));
    float rot=uTime*0.32;
    float flow=fbm(dir*1.6+vec2(rot*0.5,-rot*0.35));
    float lobe=0.62+0.38*sin(ang-rot*2.2);

    float w=abs(d-r);
    float kCore=30.0/max(r,0.02);
    float kGlow=4.0/max(r,0.02);
    float amp=(0.55+0.75*flow)*(0.55+0.65*lobe);
    float ring=exp(-w*kCore)*amp;
    float ringR=exp(-abs(d-r*1.012)*kCore)*amp;
    float ringB=exp(-abs(d-r*0.988)*kCore)*amp;
    float halo=exp(-max(d-r,0.0)*kGlow)*0.30*(0.7+0.3*lobe);

    vec3 ringCol=mix(cyan,violet,0.5+0.5*sin(ang*2.0+rot));
    vec3 contrib=ringCol*(ring*1.35+halo);
    contrib+=vec3(0.30,0.05,0.0)*ringR+vec3(0.0,0.04,0.32)*ringB;

    vec3 lightMix=mix(col,ringCol,clamp(ring*1.2+halo,0.0,0.85));
    col=mix(col+contrib,lightMix,uTheme);

    vec3 core=mix(vec3(0.004,0.006,0.012),vec3(0.985,0.99,1.0),uTheme);
    float hole=smoothstep(r*0.985,r*0.86,d);
    col=mix(col,core,hole);

    float rim=exp(-abs(d-r*0.90)*kCore*1.4)*0.35;
    col+=ringCol*rim*(1.0-uTheme*0.6);
  }

  float vig=smoothstep(0.55,1.25,length(p));
  col*=1.0-vig*mix(0.42,0.10,uTheme);
  col+=(hash21(gl_FragCoord.xy+fract(uTime)*61.7)-0.5)*0.028*mix(1.0,0.45,uTheme);

  gl_FragColor=vec4(col,1.0);
}
`

let renderer: Renderer | null = null
let program: Program | null = null
let mesh: Mesh | null = null
let frame: number | null = null
let start = 0
let cssWidth = 0
let cssHeight = 0
let mouseX = 0
let mouseY = 0
let targetMouseX = 0
let targetMouseY = 0
let theme = 0
let reducedMotion = false

function themeTarget() {
  return colorMode.value === 'dark' ? 0 : 1
}

function onPointerMove(event: PointerEvent) {
  targetMouseX = (event.clientX / window.innerWidth) * 2 - 1
  targetMouseY = -((event.clientY / window.innerHeight) * 2 - 1)
}

function cleanup() {
  if (frame) {
    cancelAnimationFrame(frame)
    frame = null
  }

  if (hasWindow()) {
    window.removeEventListener('resize', resize)
    window.removeEventListener('pointermove', onPointerMove)
  }

  try {
    const loseContext = renderer?.gl?.getExtension?.('WEBGL_lose_context')
    loseContext?.loseContext?.()
  }
  catch {
    // ignore dispose failures in headless / no-gl environments
  }

  renderer = null
  program = null
  mesh = null
}

function resize() {
  if (!canvasRef.value || !renderer || !program)
    return

  // Measure the parent, not the canvas: OGL's Renderer writes an inline
  // 300x150 style on the canvas at construction, so its own rect is stale.
  const canvas = canvasRef.value
  const parent = canvas.parentElement
  const w = parent?.clientWidth || window.innerWidth
  const h = parent?.clientHeight || window.innerHeight

  if (w <= 0 || h <= 0)
    return

  cssWidth = w
  cssHeight = h
  renderer.setSize(w * props.resolutionScale, h * props.resolutionScale)
  program.uniforms.uResolution.value.set(
    renderer.gl.drawingBufferWidth,
    renderer.gl.drawingBufferHeight,
  )
}

function loop() {
  if (!program || !renderer || !mesh)
    return

  program.uniforms.uTime.value = reducedMotion
    ? 8
    : ((performance.now() - start) / 1000) * props.speed

  if (!reducedMotion) {
    mouseX += (targetMouseX - mouseX) * 0.05
    mouseY += (targetMouseY - mouseY) * 0.05
  }
  program.uniforms.uMouse.value.set(mouseX, mouseY)

  theme += (themeTarget() - theme) * 0.08
  program.uniforms.uTheme.value = theme

  if (props.rippleIn) {
    const progress = reducedMotion
      ? 1
      : Math.min((performance.now() - start) / RIPPLE_IN_MS, 1)
    program.uniforms.uReveal.value = 1 - (1 - progress) ** 3
  }

  const focus = props.focus
  if (focus && focus.r > 0 && cssWidth > 0 && cssHeight > 0) {
    program.uniforms.uFocus.value.set(
      focus.x / cssWidth,
      1 - focus.y / cssHeight,
      focus.r / cssHeight,
    )
  }
  else {
    program.uniforms.uFocus.value.set(0.5, 0.5, 0)
  }

  renderer.render({ scene: mesh })
  frame = requestAnimationFrame(loop)
}

onMounted(() => {
  if (!canvasRef.value || !hasWindow())
    return

  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  theme = themeTarget()

  // WebGL init can fail on headless / locked-down GPUs. Fail closed to the
  // CSS fallback background instead of crashing the 404 page.
  try {
    renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      canvas: canvasRef.value,
    })

    if (!renderer?.gl) {
      cleanup()
      return
    }

    const gl = renderer.gl
    const geometry = new Triangle(gl)

    program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2() },
        uMouse: { value: new Vec2() },
        uFocus: { value: new Vec3(0.5, 0.5, 0) },
        uTheme: { value: theme },
        uReveal: { value: props.rippleIn ? 0 : 1 },
        uEdgeRipple: { value: props.rippleIn ? 1 : 0 },
      },
    })

    mesh = new Mesh(gl, { geometry, program })

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    resize()

    start = performance.now()
    loop()
  }
  catch {
    cleanup()
  }
})

onUnmounted(cleanup)
</script>
