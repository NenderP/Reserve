
/**
 * Custom Shaders for Shadow Watcher
 */

export const VignetteShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "offset": { value: 0.8 }, 
    "darkness": { value: 0.9 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform float offset;
    uniform float darkness;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec2 uv = ( vUv - vec2( 0.5 ) ) * vec2( offset );
      gl_FragColor = vec4( mix( texel.rgb, vec3( 1.0 - darkness ), dot( uv, uv ) ), texel.a );
    }
  `
};

export const ChromaticAberrationShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "uIntensity": { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;

    void main() {
      vec2 dist = vUv - 0.5;
      
      // Force distortion at edges
      vec2 redOffset = dist * (uIntensity * 0.02);
      vec2 blueOffset = dist * (uIntensity * 0.05); // Blue shifts more

      float r = texture2D(tDiffuse, vUv + redOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - blueOffset).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `
};

// Simulates a Cold/Horror LUT via channel mixing
export const HorrorColorGradeShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "uVignette": { value: 1.0 } 
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb;

      // 1. Desaturate (Bleak look)
      vec3 gray = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
      color = mix(color, gray, 0.4); 

      // 2. Cold Shadows - Deep Blue/Green tint in darks
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 coldShadow = vec3(0.00, 0.02, 0.05); 
      color = mix(color + coldShadow * (1.0 - luminance), color, luminance);

      // 3. Balanced Contrast (Reduced crush for better visibility)
      color = (color - 0.05) * 1.15; 

      gl_FragColor = vec4(color, tex.a);
    }
  `
};

export const injectWindShader = (shader: any, uniforms: any) => {
  shader.uniforms.time = uniforms.time;
  
  shader.vertexShader = `
    uniform float time;
    ${shader.vertexShader}
  `;
  
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `
    #include <begin_vertex>
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    float heightFactor = max(0.0, transformed.y);
    float windX = sin(time * 1.5 + worldPos.x * 0.5 + worldPos.z * 0.2) * 0.2;
    float windZ = cos(time * 1.2 + worldPos.x * 0.2 + worldPos.z * 0.5) * 0.2;
    transformed.x += windX * heightFactor;
    transformed.z += windZ * heightFactor;
    `
  );
};
