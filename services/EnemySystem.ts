

import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { EnemyType } from '../types';

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
  public isHallucination: boolean = false;
  public id: string;
  public age: number = 0; 
  private flankAngle: number = (Math.random() - 0.5) * Math.PI * 0.5;
  private flankIntensity: number = Math.random() * 0.5;
  
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
      uHitFlash: { value: number };
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
        uHitFlash: { value: 0.0 }
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
    this.mesh.userData = { isEnemy: true };
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
        shader.uniforms.uHitFlash = this.shaderUniforms.uHitFlash;

        shader.vertexShader = `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            ${shader.vertexShader}
        `.replace(
            '#include <worldpos_vertex>',
            `
            #include <worldpos_vertex>
            vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            
            // Simplified displacement per optimization request
            float breath = sin(uTime * 2.0) * 0.03;
            
            gl_Position = projectionMatrix * viewMatrix * (modelMatrix * vec4(transformed + (normal * breath), 1.0));
            `
        );

        shader.fragmentShader = `
            uniform float uDissolve;
            uniform vec3 uEdgeColor;
            uniform float uHpRatio;
            uniform float uTime;
            uniform float uStunned;
            uniform float uHitFlash;
            varying vec3 vWorldPos;
            
            ${shader.fragmentShader}
        `.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            
            // Simplified noise for optimization
            float n = fract(sin(dot(vWorldPos.xyz ,vec3(12.9898,78.233,45.5432))) * 43758.5453) * 0.5 + 0.5;

            float damage = 1.0 - uHpRatio;
            if (damage > 0.0) {
               float crack = step(0.4, n * damage);
               gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.1, 0.0) * 3.0, crack);
            }

            // Stun flash
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), uStunned);
            
            // Hit flash
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.0, 0.0), uHitFlash);

            if (n < uDissolve) discard;
            
            if (n < uDissolve + 0.05) {
                gl_FragColor.rgb += uEdgeColor * 3.0;
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
    
    if (this.hitFlashTimer > 0) {
        this.hitFlashTimer -= delta;
        this.shaderUniforms.uHitFlash.value = Math.max(0, this.hitFlashTimer * 2.0); // Flash fades out
    } else {
        this.shaderUniforms.uHitFlash.value = 0.0;
    }

    this.age += delta;
    this.shaderUniforms.uTime.value += delta;
    this.shaderUniforms.uHpRatio.value = this.hp / this.maxHp;

    // FIX: Floor clamp to prevent falling through floor
    if (this.mesh.position.y < 0) this.mesh.position.y = 0;

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
    const stopDist = this.type === EnemyType.DRAINER ? 8.0 : 0.05; // Tight stopping dist

    if (distToTarget > stopDist) {
        const toTarget = new THREE.Vector3().subVectors(target, this.mesh.position).normalize();
        
        // Disable flanking when near booth
        const actualFlank = distToTarget < 12 ? 0 : this.flankIntensity;
        
        const flankDir = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
        const direction = toTarget.add(flankDir.multiplyScalar(Math.sin(this.age * 0.5) * actualFlank)).normalize();
        
        // Smoother approach
        const speedFactor = Math.min(1.0, distToTarget * 1.5);
        this.mesh.position.add(direction.multiplyScalar(this.speed * speedFactor * delta));
        
        const targetRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), direction);
        if (this.type !== EnemyType.DRAINER) {
             const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/12);
             targetRot.multiply(tilt);
        }
        this.mesh.quaternion.slerp(targetRot, delta * 5.0);
    } else {
        const lookTarget = target.clone();
        lookTarget.y = this.mesh.position.y;
        this.mesh.lookAt(lookTarget);
    }
  }

  burnInSun() {
      if (this.isDying || this.isDead) return;
      this.hp = 0;
      this.isDying = true;
      this.shaderUniforms.uEdgeColor.value.setHex(0xffffaa);
  }

  takeDamage(amount: number, point?: THREE.Vector3, normal?: THREE.Vector3, decalTex?: THREE.Texture): { died: boolean, damage: number, isCritical: boolean } {
    if (this.isDying || this.isDead) return { died: false, damage: 0, isCritical: false };
    
    this.hitFlashTimer = 0.5; // Flash for 0.5 seconds

    // Critical hit mechanic: 20% chance for double damage, or guaranteed if hit high (headshot)
    let isCritical = Math.random() < 0.2;
    if (point && point.y > this.mesh.position.y + 1.2) {
        isCritical = true;
    }
    const finalDamage = isCritical ? amount * 2 : amount;
    
    this.hp -= finalDamage;
    
    if (point && normal && decalTex && (Math.random() > 0.5 || isCritical)) {
        this.addBurnDecal(point, normal, decalTex);
    }
    if (this.hp <= 0) {
        this.isDying = true;
        return { died: true, damage: finalDamage, isCritical };
    }
    return { died: false, damage: finalDamage, isCritical };
  }
}

export class NormalEnemy extends Enemy {
  constructor() {
    super(EnemyType.NORMAL, 75, 2.0, 0x111111, 0.9); // Easier HP and slower
  }
}

export class FastEnemy extends Enemy {
  constructor() {
    super(EnemyType.FAST, 25, 4.0, 0x330000, 0.5); // Slower, fragile
    this.mesh.scale.setScalar(0.8);
  }
}

export class TankEnemy extends Enemy {
  constructor() {
    super(EnemyType.TANK, 200, 1.0, 0x0a0a2a, 0.8); // Huge HP nerf
    this.mesh.scale.setScalar(1.5);
  }
}

export class GlitcherEnemy extends Enemy {
  constructor() {
    super(EnemyType.GLITCHER, 50, 2.5, 0x2a0a2a, 0.2); 
  }
}

export class DrainerEnemy extends Enemy {
  constructor() {
    super(EnemyType.DRAINER, 60, 1.5, 0x000000, 0.9);
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

export class PhantomEnemy extends Enemy {
  constructor() {
    super(EnemyType.PHANTOM, 60, 4.0, 0x000000, 1.0); 
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = 0.05;
    mat.emissive.setHex(0x110011);
    mat.emissiveIntensity = 0.0;
  }

  update(delta: number, target: THREE.Vector3) {
      super.update(delta, target);
      if(this.stunTimer > 0) return;
      
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      // If it's taking damage, it means it's illuminated
      if (this.hitFlashTimer > 0) {
          mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.8, delta * 10);
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 1.0, delta * 10);
          this.speed = 1.0; 
      } else {
          mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.05, delta * 2);
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.0, delta * 2);
          this.speed = 4.5; 
      }
  }
}

export class SpitterEnemy extends Enemy {
  public lastShot: number = 0;
  constructor() {
    super(EnemyType.SPITTER, 45, 2.8, 0x000000, 0.8);
    // Make it look different
    this.mesh.geometry = new THREE.CylinderGeometry(0.3, 0.1, 2.2, 8);
    const mat = this.mesh.material as THREE.ShaderMaterial;
    if (mat.uniforms && mat.uniforms.uEdgeColor) {
        mat.uniforms.uEdgeColor.value.setHex(0x00ff00); // Greenish glow
    }
  }
  
  update(delta: number, target: THREE.Vector3) {
      super.update(delta, target);
      if(this.stunTimer > 0) return;
      
      const dist = this.mesh.position.distanceTo(target);
      if (dist > 12) {
          // Move closer if too far
          const dir = new THREE.Vector3().subVectors(target, this.mesh.position).normalize();
          this.mesh.position.add(dir.multiplyScalar(this.speed * delta));
      } else if (dist < 8) {
          // Back away if too close
          const dir = new THREE.Vector3().subVectors(this.mesh.position, target).normalize();
          this.mesh.position.add(dir.multiplyScalar(this.speed * 0.5 * delta));
      }
      // Always look at target
      this.mesh.lookAt(target);
  }
}

export class ShriekerBoss extends Enemy {
    public shriekTimer: number = 0;
    private shriekInterval: number = 10.0; // Slower shriek
    public bossPhase: number = 1; 
    private orbitAngle: number = 0;
    
    constructor() {
        super(EnemyType.TANK, 800, 1.5, 0x330000); // Big HP nerf
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
            this.speed = 3.0; // Slower rage speed
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
    public spawnInterval: number = 8.0; // Slower spawns
    constructor() {
        super(EnemyType.TANK, 2000, 0, 0x050505); // HP nerf
        this.mesh.scale.set(5, 5, 5);
        this.mesh.geometry = new THREE.IcosahedronGeometry(1, 4); // Detailed Orb
        (this.mesh.material as THREE.MeshStandardMaterial).wireframe = true; // Tech look
        (this.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x00ff00);
    }
    
    takeDamage(amount: number, point?: THREE.Vector3, normal?: THREE.Vector3, decalTex?: THREE.Texture): { died: boolean, damage: number, isCritical: boolean } {
        return super.takeDamage(amount * 0.3, point, normal, decalTex); // Take more damage
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

export class LeviathanBoss extends Enemy {
    public stompTimer: number = 0;
    public stompInterval: number = 8.0; // Slower stomp
    
    constructor() {
        super(EnemyType.LEVIATHAN, 6000, 0.8, 0x111111); // HP nerf
        this.mesh.scale.set(6, 8, 6);
        this.mesh.geometry = new THREE.CylinderGeometry(0.5, 2, 8, 8);
        (this.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x550000);
        (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    }
    
    update(delta: number, target: THREE.Vector3): any {
        if (this.isDead || this.isDying) {
            super.update(delta, target);
            return null;
        }

        super.update(delta, target);
        if (this.stunTimer > 0) return null;

        this.stompTimer += delta;
        if (this.stompTimer >= this.stompInterval) {
            this.stompTimer = 0;
            return "stomp"; 
        }
        return null;
    }
}