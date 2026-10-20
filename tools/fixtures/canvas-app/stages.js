// one fragment shader per stage: a gradient in the stage's colours and 24 dots placed at random
export function stageShader(st) {
  return `#version 300 es
precision highp float;
uniform float uTime; uniform float uMix; uniform vec2 uRes; uniform vec2 uDots[24];
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 a = vec3(${st.a.join(', ')}), b = vec3(${st.b.join(', ')});
  vec3 c = mix(a, b, clamp(uv.y + uMix * 0.5, 0.0, 1.0));
  for (int i = 0; i < 24; i++) { float d = distance(uv, uDots[i]); c += vec3(${st.dot}) * smoothstep(0.02, 0.0, d); }
  float ring = smoothstep(0.004, 0.0, abs(distance(uv, vec2(0.5)) - (0.18 + ${st.ring.toFixed(3)} * uMix)));
  o = vec4(c + ring, 1.0);
}`;
}
