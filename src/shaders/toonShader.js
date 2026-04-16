export const toonVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const toonFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLightDirection;
  uniform float uGlossiness;
  uniform float uRimAmount;
  uniform float uRimThreshold;
  uniform float uSteps;
  uniform float uShadowBrightness;
  uniform float uBrightness;
  uniform vec3 uRimColor;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uAlphaTest;
  uniform float uBlinkAmount;
  uniform vec2 uLeftEyeCenter;
  uniform vec2 uRightEyeCenter;
  uniform vec2 uEyeRadius;
  uniform vec3 uLidColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vec4 texColor = vec4(1.0);
    if (uHasMap > 0.5) {
      texColor = texture2D(uMap, vUv);
    }
    if (texColor.a < uAlphaTest) discard;

    // Blink: cover eyes with lid color in UV space
    vec2 leftDist = (vUv - uLeftEyeCenter) / uEyeRadius;
    vec2 rightDist = (vUv - uRightEyeCenter) / uEyeRadius;
    float inLeftEye = 1.0 - smoothstep(0.8, 1.0, length(leftDist));
    float inRightEye = 1.0 - smoothstep(0.8, 1.0, length(rightDist));
    float eyeMask = max(inLeftEye, inRightEye);
    texColor.rgb = mix(texColor.rgb, uLidColor, eyeMask * uBlinkAmount);

    vec3 baseColor = uColor * pow(texColor.rgb, vec3(1.0 / uBrightness));
    float NdotL = dot(vNormal, normalize(uLightDirection));
    float lightVal = NdotL * 0.5 + 0.5;
    float stepped = floor(lightVal * uSteps) / uSteps;
    float lightIntensity = mix(uShadowBrightness, 1.0, stepped);
    vec3 halfVector = normalize(normalize(uLightDirection) + vViewDir);
    float NdotH = dot(vNormal, halfVector);
    float specularIntensity = pow(max(NdotH, 0.0) * max(NdotL, 0.0), 1000.0 / uGlossiness);
    float specular = smoothstep(0.05, 0.1, specularIntensity);
    float rimDot = 1.0 - dot(vViewDir, vNormal);
    float rimIntensity = rimDot * pow(max(NdotL, 0.0), uRimThreshold);
    rimIntensity = smoothstep(uRimAmount - 0.01, uRimAmount + 0.01, rimIntensity);
    vec3 finalColor = baseColor * lightIntensity + specular * vec3(0.06) + rimIntensity * uRimColor;
    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;
