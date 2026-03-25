import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import * as THREE from 'three'

const transitionFragmentShader = /* glsl */ `
  uniform sampler2D uSnapshot;
  uniform float uProgress;

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
    if (uProgress >= 1.0) {
      outputColor = inputColor;
      return;
    }
    if (uProgress <= 0.0) {
      outputColor = texture2D(uSnapshot, uv);
      return;
    }

    // Radial distance from center, aspect-corrected
    vec2 center = vec2(0.5, 0.5);
    float dist = length((uv - center) * vec2(1.0, 0.5625));

    // Organic noise edge
    float n = noise(uv * 8.0) * 0.25 + noise(uv * 16.0) * 0.1;
    float edge = dist + n;

    float threshold = uProgress * 1.5;
    float band = smoothstep(threshold - 0.06, threshold + 0.06, edge);

    vec4 snapshotColor = texture2D(uSnapshot, uv);

    // Warm glow at dissolve edge
    float edgeGlow = smoothstep(threshold - 0.1, threshold, edge)
                   - smoothstep(threshold, threshold + 0.1, edge);
    vec3 glowColor = vec3(1.0, 0.45, 0.15);

    vec3 blended = mix(inputColor.rgb, snapshotColor.rgb, band);
    blended += glowColor * edgeGlow * 0.5;

    outputColor = vec4(blended, 1.0);
  }
`

class IntroTransitionEffect extends Effect {
  constructor() {
    super('IntroTransitionEffect', transitionFragmentShader, {
      uniforms: new Map([
        ['uSnapshot', new THREE.Uniform(null)],
        ['uProgress', new THREE.Uniform(0)],
      ]),
    })
  }
}

export default function TransitionEffect({ snapshotTexture, progressRef }) {
  const effect = useMemo(() => new IntroTransitionEffect(), [])

  useFrame(() => {
    effect.uniforms.get('uSnapshot').value = snapshotTexture
    effect.uniforms.get('uProgress').value = progressRef.current
  })

  return <primitive object={effect} />
}
