

import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { EnemyType } from '../types';

// Simplex 3D Noise GLSL for Organic Shader
const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

// Improved Procedural Textures
const organicTexture = (function() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    // Dark, fleshy base
    const grd = ctx.createRadialGradient(128,128, 0, 128,128, 200);
    grd.addColorStop(0, "#2a0a0a");
    grd.addColorStop(1, "#050000");
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,256,256);

    // Veins
    ctx.strokeStyle = '#4a0000';
    ctx.lineWidth = 2;
    for(let i=0; i<30; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random()*256, Math.random()*256);
        ctx.bezierCurveTo(Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256);
        ctx.stroke();
    }
    
    // Noise overlay
    const imgData = ctx.getImageData(0,0,256,256);
    for(let i=0; i<imgData.data.length; i+=4) {
        if(Math.random() > 0.8) {
            const noise = Math.random() * 20;
            imgData.data[i] += noise;
            imgData.data[i+1] += noise;
            imgData.data[i+2] += noise;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    return new THREE.CanvasTexture(canvas);
})();

// Shared Geometries
const SHARED_GEOMETRIES = {
    HUMANOID: new THREE.CapsuleGeometry(0.4, 1.4, 4, 8),
    SPIKE: new THREE.OctahedronGeometry(0.5, 0), // Sharp, angular
    ORB: new THREE.IcosahedronGeometry(0.6, 2),
    TANK: new THREE.CapsuleGeometry(0.7, 1.8, 4, 8),
    BOSS: new THREE.CapsuleGeometry(1.0, 3.5, 8, 16),
};

export abstract class Enemy {
  public mesh: THREE.Mesh; 
  public hp: number;
  public maxHp: number;
  public speed: number;
  public type: EnemyType;
  public isDead: boolean = false; 
  public isDying: boolean = false; 
  public id: string;
  public age: number = 0; 
  
  protected hitFlashTimer: number = 0;
  private decals: THREE.Mesh[] = [];

  // FIX: Changed stunTimer from private to protected to allow access in subclasses.
  protected stunTimer: number = 0;

  private shaderUniforms: {
      uTime: { value: number };
      uDissolve: { value: number };
      uEdgeColor: { value: THREE.Color };
      uHpRatio: { value: number }; 
      uStunned: { value: number };
  };

  constructor(type: EnemyType, hp: number, speed: number, color: number, roughness: number = 0.9) {
    this.type = type;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.id = Math.random().toString(36).substr(2, 9);
    
    this.shaderUniforms = {
        uTime: { value: 0.0 },
        uDissolve: { value: 0.0 },
        uEdgeColor: { value: new THREE.Color(0xff4400) }, 
        uHpRatio: { value: 1.0 },
        uStunned: { value: 0.0 },
    };

    let geometry = SHARED_GEOMETRIES.HUMANOID;
    if (type === EnemyType.FAST) geometry = SHARED_GEOMETRIES.SPIKE;
    if (type === EnemyType.DRAINER) geometry = SHARED_GEOMETRIES.ORB;
    if (type === EnemyType.TANK) geometry = SHARED_GEOMETRIES.TANK;

    const material = new THREE.MeshStandardMaterial({ 
        color: color, 
        roughness: roughness,
        metalness: 0.1,
        map: organicTexture,
    });
    
    this.applyCustomShader(material);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.position.y = 1;
    
    if (Math.random() > 0.7) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), material);
        spike.position.set(0, 0.5, -0.3);
        spike.rotation.x = -Math.PI / 2;
        this.mesh.add(spike);
    }
  }

  // Shadow Wobble Shader
  private applyCustomShader(material: THREE.Material) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.shaderUniforms.uTime;
        shader.uniforms.uDissolve = this.shaderUniforms.uDissolve;
        shader.uniforms.uEdgeColor = this.shaderUniforms.uEdgeColor;
        shader.uniforms.uHpRatio = this.shaderUniforms.uHpRatio;
        shader.uniforms.uStunned = this.shaderUniforms.uStunned;

        shader.vertexShader = `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            ${NOISE_GLSL}
            ${shader.vertexShader}
        `.replace(
            '#include <worldpos_vertex>',
            `
            #include <worldpos_vertex>
            vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            
            float noise = snoise(vec3(transformed.x * 2.0, transformed.y * 2.0 + uTime, transformed.z * 2.0));
            vec3 displacement = normal * noise * 0.1;
            
            float breath = sin(uTime * 2.0) * 0.05;
            
            gl_Position = projectionMatrix * viewMatrix * (modelMatrix * vec4(transformed + displacement + (normal * breath), 1.0));
            `
        );

        shader.fragmentShader = `
            uniform float uDissolve;
            uniform vec3 uEdgeColor;
            uniform float uHpRatio;
            uniform float uTime;
            uniform float uStunned;
            varying vec3 vWorldPos;
            
            ${NOISE_GLSL}
            
            ${shader.fragmentShader}
        `.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            
            float n = snoise(vWorldPos * 3.0 + uTime * 0.2) * 0.5 + 0.5;

            float damage = 1.0 - uHpRatio;
            if (damage > 0.0) {
               float crack = smoothstep(0.4, 0.45, n * damage);
               gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.1, 0.0) * 5.0, crack);
            }

            // Stun flash
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), uStunned);

            if (n < uDissolve) discard;
            
            if (n < uDissolve + 0.1) {
                gl_FragColor.rgb += uEdgeColor * 5.0;
                gl_FragColor.a = 1.0; 
            }
            `
        );
    };
  }

  public addBurnDecal(point: THREE.Vector3, normal: THREE.Vector3, decalTexture: THREE.Texture) {
      if (this.decals.length > 3) {
          const old = this.decals.shift();
          if (old) this.mesh.remove(old);
      }

      const dummy = new THREE.Mesh();
      const localPoint = this.mesh.worldToLocal(point.clone());
      const inverseMatrix = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
      const localNormal = normal.clone().transformDirection(inverseMatrix);

      dummy.position.copy(localPoint);
      dummy.lookAt(new THREE.Vector3().addVectors(localPoint, localNormal));
      dummy.rotation.z = Math.random() * Math.PI * 2;
      
      const size = 0.4;
      const decalGeo = new DecalGeometry(
          this.mesh, 
          point, 
          new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(dummy.matrix)), 
          new THREE.Vector3(size, size, size)
      );

      const decalMat = new THREE.MeshBasicMaterial({ 
          map: decalTexture,
          transparent: true, 
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          color: 0xffaa00,
          blending: THREE.AdditiveBlending
      });

      const decalMesh = new THREE.Mesh(decalGeo, decalMat);
      decalMesh.geometry.applyMatrix4(inverseMatrix);
      this.mesh.attach(decalMesh); 
      this.decals.push(decalMesh);
  }

  public get isFullyDissolved(): boolean {
      return this.shaderUniforms.uDissolve.value >= 1.0;
  }

  public stun(duration: number) {
      this.stunTimer = Math.max(this.stunTimer, duration);
  }

  update(delta: number, target: THREE.Vector3): string | void | null {
    if (this.isDead) return;
    
    this.age += delta;
    this.shaderUniforms.uTime.value += delta;
    this.shaderUniforms.uHpRatio.value = this.hp / this.maxHp;

    if (this.isDying) {
        this.shaderUniforms.uDissolve.value += delta * 0.8; 
        this.mesh.rotation.x += delta * 0.2;
        this.mesh.position.y += delta * 0.1; // Float up like ash
        if (this.isFullyDissolved) this.isDead = true; 
        return; 
    }

    if(this.stunTimer > 0) {
        this.stunTimer -= delta;
        this.shaderUniforms.uStunned.value = Math.max(0, this.stunTimer);
        return;
    }
    this.shaderUniforms.uStunned.value = 0;

    const distToTarget = this.mesh.position.distanceTo(target);
    const stopDist = this.type === EnemyType.DRAINER ? 8.0 : 1.5;

    if (distToTarget > stopDist) {
        const direction = new THREE.Vector3().subVectors(target, this.mesh.position).normalize();
        this.mesh.position.add(direction.multiplyScalar(this.speed * delta));
        
        // Tilt forward when running
        const targetRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), direction);
        if (this.type !== EnemyType.DRAINER) {
             const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/12);
             targetRot.multiply(tilt);
        }
        this.mesh.quaternion.slerp(targetRot, delta * 5.0);
    } else {
        this.mesh.lookAt(target);
    }
  }

  burnInSun() {
      if (this.isDying || this.isDead) return;
      this.hp = 0;
      this.isDying = true;
      this.shaderUniforms.uEdgeColor.value.setHex(0xffffaa);
  }

  takeDamage(amount: number, point?: THREE.Vector3, normal?: THREE.Vector3, decalTex?: THREE.Texture) {
    if (this.isDying || this.isDead) return;
    this.hp -= amount;
    if (point && normal && decalTex && Math.random() > 0.5) {
        this.addBurnDecal(point, normal, decalTex);
    }
    if (this.hp <= 0) this.isDying = true;
  }
}

export class NormalEnemy extends Enemy {
  constructor() {
    super(EnemyType.NORMAL, 100, 2.8, 0x111111, 0.9); 
  }
}

export class FastEnemy extends Enemy {
  constructor() {
    super(EnemyType.FAST, 40, 5.5, 0x330000, 0.5); 
    this.mesh.scale.setScalar(0.8);
  }
}

export class TankEnemy extends Enemy {
  constructor() {
    super(EnemyType.TANK, 400, 1.2, 0x0a0a2a, 0.8); 
    this.mesh.scale.setScalar(1.5);
  }
}

export class GlitcherEnemy extends Enemy {
  constructor() {
    super(EnemyType.GLITCHER, 80, 3.0, 0x2a0a2a, 0.2); 
  }
}

export class DrainerEnemy extends Enemy {
  constructor() {
    super(EnemyType.DRAINER, 120, 2.0, 0x000000, 0.9);
    (this.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x5500aa);
    (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    this.mesh.position.y = 3.0; // Floats high
  }
  
  update(delta: number, target: THREE.Vector3) {
      super.update(delta, target);
      if(this.stunTimer > 0) return;
      this.mesh.position.y = 3.0 + Math.sin(this.age * 2) * 0.5;
  }
}

export class ShriekerBoss extends Enemy {
    public shriekTimer: number = 0;
    private shriekInterval: number = 6.0;
    public bossPhase: number = 1; 
    private orbitAngle: number = 0;
    
    constructor() {
        super(EnemyType.TANK, 2000, 1.5, 0x330000); 
        this.mesh.scale.set(2.5, 2.5, 2.5); 
        this.mesh.geometry = SHARED_GEOMETRIES.BOSS;
    }

    update(delta: number, target: THREE.Vector3): any {
        if (this.isDead || this.isDying) {
            super.update(delta, target);
            return;
        }
        
        if (this.hp < (this.maxHp * 0.5) && this.bossPhase === 1) {
            this.bossPhase = 2; 
            this.speed = 6.0; 
            (this.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xff0000);
            (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0;
        }

        super.update(delta, target);
        if(this.stunTimer > 0) return null;
        
        this.shriekTimer += delta;
        if (this.shriekTimer >= this.shriekInterval) {
            this.shriekTimer = 0;
            return "shriek"; 
        }
        return null;
    }
}

export class ForestHeartBoss extends Enemy {
    public spawnTimer: number = 0;
    public spawnInterval: number = 4.0; 
    constructor() {
        super(EnemyType.TANK, 5000, 0, 0x050505); 
        this.mesh.scale.set(5, 5, 5);
        this.mesh.geometry = new THREE.IcosahedronGeometry(1, 4); // Detailed Orb
        (this.mesh.material as THREE.MeshStandardMaterial).wireframe = true; // Tech look
        (this.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x00ff00);
    }
    
    takeDamage(amount: number, point?: THREE.Vector3, normal?: THREE.Vector3, decalTex?: THREE.Texture) {
        super.takeDamage(amount * 0.1, point, normal, decalTex); // High armor
    }
    
    update(delta: number, target: THREE.Vector3): any {
        if (this.isDead || this.isDying) return null;
        this.age += delta;
        if(this.stunTimer > 0) {
            this.stunTimer -= delta;
            return null;
        }
        
        const pulse = Math.sin(this.age * 2) * 0.2 + 1.0;
        this.mesh.scale.set(5 * pulse, 5 * pulse, 5 * pulse);
        this.mesh.rotation.y += delta * 0.5;
        this.mesh.rotation.z += delta * 0.2;

        this.spawnTimer += delta;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            return "spawn";
        }
        return null;
    }
}