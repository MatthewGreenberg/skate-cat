/* eslint-disable react-hooks/immutability */
import { useEffect, useMemo } from 'react'
import { Effect } from 'postprocessing'
import * as THREE from 'three'

// VHS eject glitch: 4 beats over uProgress 0→1
//   0.00–0.20  Impact pop:   strong RGB split, judder kick, 2–3 tear bands
//   0.20–0.65  Tracking loss: sine-wave wobble, scanline judder, desaturation
//   0.65–0.90  Rewind rips:  fast downward-scrolling tear bands, wider chroma split
//   0.90–1.00  Eject pinch:  image squashes to a horizontal strip, white-hot edge
const fragmentShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float t = clamp(uProgress, 0.0, 1.0);
    if (t <= 0.0001) {
      outputColor = inputColor;
      return;
    }

    // Phase envelopes — longer overlapping ramps for a smoother arc
    float impact   = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.2, 0.4, t));
    float tracking = smoothstep(0.15, 0.38, t) * (1.0 - smoothstep(0.66, 0.82, t));
    float rewind   = smoothstep(0.58, 0.76, t) * (1.0 - smoothstep(0.9, 0.97, t));
    float eject    = smoothstep(0.88, 1.0, t);

    // Quantize time so judder feels stepped like a bad tape — slower steps read calmer
    float tStep = floor(uTime * 16.0) / 16.0;

    // --- Build distorted sample UVs ---
    vec2 sUv = uv;

    // Horizontal band judder (wider bands, softer amplitude)
    float bandY = floor(uv.y * 48.0 + tStep * 2.5) / 48.0;
    float bandRand = hash(vec2(bandY, tStep)) - 0.5;
    float judder = bandRand * (0.016 * impact + 0.006 * tracking + 0.028 * rewind);
    sUv.x += judder;

    // Sinusoidal tracking wobble — slower, gentler
    sUv.x += sin(uv.y * 26.0 + uTime * 11.0) * 0.006 * tracking;

    // Rewind tear bands — slower scroll, softer amplitude
    float scrollY = fract(uv.y * 1.6 - uTime * 3.2);
    float tearMask = step(0.9, scrollY) * rewind;
    sUv.x += (hash(vec2(scrollY, tStep)) - 0.5) * 0.11 * tearMask;

    // Eject pinch: squash the visible image into a narrowing horizontal strip at center.
    // Anything outside the strip becomes black.
    float bandHalfHeight = mix(0.5, 0.0035, eject);
    float yDist = abs(uv.y - 0.5);
    float insideStrip = step(yDist, bandHalfHeight);
    // Remap vertical sampling inside the strip so the full scene is compressed into it
    float squashedY = (uv.y - 0.5) / max(bandHalfHeight * 2.0, 0.0001) + 0.5;
    sUv.y = mix(sUv.y, clamp(squashedY, 0.0, 1.0), eject);

    // --- RGB split: sample input three times with chromatic offset ---
    float splitAmt = 0.010 * impact + 0.003 * tracking + 0.016 * rewind + 0.004 * eject;
    // Radial bias: stronger at edges
    vec2 radial = (uv - 0.5) * 2.0;
    vec2 splitDir = vec2(1.0, 0.0) + radial * 0.35;
    vec4 rSample = texture2D(inputBuffer, sUv + splitDir * splitAmt);
    vec4 gSample = texture2D(inputBuffer, sUv);
    vec4 bSample = texture2D(inputBuffer, sUv - splitDir * splitAmt);
    vec3 color = vec3(rSample.r, gSample.g, bSample.b);

    // Desaturate during tracking loss — tape washing out
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(luma), 0.42 * tracking);

    // Scanline darkening
    float scan = 0.9 + 0.1 * sin(uv.y * 840.0 + uTime * 3.0);
    color *= mix(1.0, scan, 0.35 * (tracking + rewind * 0.8));

    // Chroma-noise static — slower churn, lower amplitude
    float staticN = noise(uv * 320.0 + uTime * 55.0) - 0.5;
    color += staticN * (0.1 * impact + 0.05 * tracking + 0.14 * rewind);

    // White contrast flash on impact — softer decay so it doesn't snap
    float impactFlash = exp(-t * 28.0) * 0.24;
    color = mix(color, vec3(1.0), impactFlash);

    // Tear-band brightening: where rips happen, flare bright
    color += vec3(1.0, 0.88, 0.95) * tearMask * 0.42;

    // --- CRT power-off pinch ---
    // Outside the strip -> fade to black
    color *= mix(1.0, insideStrip, eject);
    // Hot white edge on the strip boundary as it collapses
    float edgeGlow = smoothstep(bandHalfHeight + 0.004, bandHalfHeight, yDist)
                   * (1.0 - insideStrip) * eject;
    color += vec3(1.0, 0.95, 0.82) * edgeGlow * 1.6;
    // Central line white-hot at peak eject
    float centerHot = smoothstep(0.006, 0.0, yDist) * eject;
    color = mix(color, vec3(1.0, 0.96, 0.88), centerHot * 0.85);

    outputColor = vec4(color, inputColor.a);
  }
`

class VhsGlitchPass extends Effect {
  constructor() {
    super('VhsGlitchEffect', fragmentShader, {
      uniforms: new Map([
        ['uProgress', new THREE.Uniform(0)],
        ['uTime', new THREE.Uniform(0)],
      ]),
    })
    this.progressRef = null
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('uTime').value += deltaTime
    this.uniforms.get('uProgress').value = this.progressRef?.current ?? 0
  }
}

export default function VhsGlitchEffect({ progressRef }) {
  const pass = useMemo(() => new VhsGlitchPass(), [])

  useEffect(() => {
    pass.progressRef = progressRef
    return () => {
      pass.progressRef = null
    }
  }, [pass, progressRef])

  useEffect(() => () => {
    pass.dispose()
  }, [pass])

  return <primitive object={pass} />
}

export { VhsGlitchPass }
