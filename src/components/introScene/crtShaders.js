/**
 * Fullscreen CRT post-process for the TV screen: barrel warp, RGB split, scanlines, grille, roll bar, vignette, noise.
 */

export const CRT_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CRT_FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uHover;
  uniform float uWarp;
  uniform float uAberration;
  uniform float uEdgeAberration;
  uniform float uHoverBoost;
  uniform float uScanlineIntensity;
  uniform float uScanlineDensity;
  uniform float uGrilleIntensity;
  uniform float uGrilleDensity;
  uniform float uRollIntensity;
  uniform float uRollSpeed;
  uniform float uNoiseIntensity;
  uniform float uVignetteStrength;
  uniform float uVignetteStart;
  uniform float uBrightness;
  uniform float uBlackLevel;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    float radius = dot(centered, centered);
    vec2 warpedUv = uv + centered * radius * uWarp;

    if (warpedUv.x < 0.0 || warpedUv.x > 1.0 || warpedUv.y < 0.0 || warpedUv.y > 1.0) {
      gl_FragColor = vec4(vec3(uBlackLevel), 1.0);
      return;
    }

    vec2 aberration = centered * (uAberration + radius * uEdgeAberration) * (1.0 + uHover * uHoverBoost);
    float r = texture2D(uMap, warpedUv + aberration).r;
    float g = texture2D(uMap, warpedUv).g;
    float b = texture2D(uMap, warpedUv - aberration).b;
    vec3 color = vec3(r, g, b);

    float scanlines = (1.0 - uScanlineIntensity) + uScanlineIntensity * sin(warpedUv.y * uScanlineDensity + uTime * 8.0);
    float grille = (1.0 - uGrilleIntensity) + uGrilleIntensity * sin(warpedUv.x * uGrilleDensity);
    float roll = exp(-pow((fract(warpedUv.y - uTime * uRollSpeed) - 0.5) * 8.0, 2.0)) * uRollIntensity;
    float vignette = smoothstep(uVignetteStrength, uVignetteStart, length(centered));
    float noise = (hash(floor(warpedUv * vec2(320.0, 220.0) + uTime * 24.0)) - 0.5) * uNoiseIntensity;

    color *= scanlines * grille;
    // color += roll;
    // color += noise;
    color *= uBrightness;

    gl_FragColor = vec4(color, 1.0);
  }
`;
