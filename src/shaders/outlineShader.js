export const outlineVertexShader = /* glsl */ `
  uniform float uThickness;
  void main() {
    vec3 pos = position + normal * uThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

export const outlineFragmentShader = /* glsl */ `
  uniform vec3 uOutlineColor;
  void main() {
    gl_FragColor = vec4(uOutlineColor, 1.0);
  }
`
