
import * as THREE from 'three';
import { COLORS, GAME_CONFIG } from '../constants';
import { FlashlightMode } from '../types';
import gsap from 'gsap';

export class FlashlightController {
  public mesh: THREE.Group;
  public spotLight: THREE.SpotLight;
  public target: THREE.Object3D; // Where the light points
  private battery: number;
  private isOn: boolean;
  private isDisabled: boolean = false; // For Boss mechanics
  private disableTimer: number = 0;
  private volumetricCone: THREE.Mesh;
  private flickerTimer: number = 0;
  private drainMultiplier: number = 1.0;
  
  // Dust System
  private dustSystem: THREE.Points;
  private dustVelocities: Float32Array;
  private dustOrigins: Float32Array; // Original random positions to loop around

  // Halo Effect
  private haloSprite: THREE.Sprite;

  // Impact Sparks System
  private impactParticles: THREE.Points;
  private impactData: { velocity: THREE.Vector3, life: number }[] = [];

  // Sway / Inertia System
  private swayRotation: THREE.Vector2; // Current visual rotation offset
  private swayTarget: THREE.Vector2;   // Where rotation wants to go (input force)
  private moveSway: THREE.Vector2;     // Offset position from walking

  private overchargeCooldown: number = 0;
  private isCurrentlyOvercharging: boolean = false;
  private overchargeDuration: number = 0;
  private readonly OVERCHARGE_COST = 15; // Reduced from 25
  private readonly OVERCHARGE_COOLDOWN_TIME = 8; // Reduced from 15
  private readonly OVERCHARGE_DURATION_TIME = 0.5; // Increased duration for better visibility

  private currentMode: FlashlightMode = FlashlightMode.NORMAL;
  private unlockedModes: FlashlightMode[] = [FlashlightMode.NORMAL];
  private strobeTimer: number = 0;
  private strobeState: boolean = true;

  constructor(scene: THREE.Scene, camera: THREE.Camera, flashlightNormalMap: THREE.Texture) {
    this.mesh = new THREE.Group();
    this.battery = GAME_CONFIG.MAX_BATTERY;
    this.isOn = true;
    
    // Initialize Sway Vectors
    this.swayRotation = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.moveSway = new THREE.Vector2();

    // --- 1. Flashlight Construction (High Detail) ---
    
    // 1a. Materials
    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.4,
        metalness: 0.9,
        normalMap: flashlightNormalMap,
        normalScale: new THREE.Vector2(0.5, 0.5) // Micro-scratches
    });

    const lensMaterial = new THREE.MeshPhysicalMaterial({
        roughness: 0.0,
        transmission: 1.0, // Glass
        thickness: 0.5,
        ior: 1.5,
        clearcoat: 1.0,
        color: 0xffffff
    });

    // 1b. Geometry Construction
    const flGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 16);
    bodyGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, metalMaterial);
    body.castShadow = true;
    flGroup.add(body);

    // Head
    const headGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.08, 16);
    headGeo.rotateX(-Math.PI / 2);
    const head = new THREE.Mesh(headGeo, metalMaterial);
    head.position.z = -0.15;
    head.castShadow = true;
    flGroup.add(head);

    // Lens Glass
    const lensGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16);
    lensGeo.rotateX(-Math.PI / 2);
    const lens = new THREE.Mesh(lensGeo, lensMaterial);
    lens.position.z = -0.19;
    flGroup.add(lens);

    // Switch
    const switchGeo = new THREE.BoxGeometry(0.015, 0.015, 0.02);
    const switchBtn = new THREE.Mesh(switchGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
    switchBtn.position.set(0, 0.03, -0.05);
    flGroup.add(switchBtn);

    this.mesh.add(flGroup);

    // --- 2. The Light Source ---
    this.spotLight = new THREE.SpotLight(COLORS.LIGHT, 100);
    this.spotLight.angle = Math.PI / 6;
    this.spotLight.penumbra = 0.4; // Softer edge
    this.spotLight.decay = 1.0; // Linear decay to prevent blowout up close
    this.spotLight.distance = 60; // Optimized distance
    this.spotLight.castShadow = true;
    
    // Optimized Shadow Map
    this.spotLight.shadow.mapSize.width = 512; // Optimized for performance
    this.spotLight.shadow.mapSize.height = 512;
    this.spotLight.shadow.bias = -0.00001; // Very tight bias for spotlight
    this.spotLight.shadow.radius = 2; // Slight blur
    this.spotLight.shadow.camera.near = 0.5;
    this.spotLight.shadow.camera.far = 60; // Match light distance for resolution usage
    
    this.spotLight.position.set(0, 0, -0.3);

    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, -20);
    this.mesh.add(this.target);
    this.spotLight.target = this.target;

    // --- 3. Volumetric Fake (Cone) ---
    const geometry = new THREE.ConeGeometry(3, 40, 32, 1, true);
    geometry.translate(0, -20, 0); 
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(COLORS.LIGHT) },
        attenuation: { value: 25.0 },
        opacity: { value: 0.08 }
      },
      vertexShader: `
        varying float vDist;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDist = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        varying float vDist;
        void main() {
          float fade = 1.0 - smoothstep(0.0, 40.0, vDist); 
          gl_FragColor = vec4(color, opacity * fade);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.volumetricCone = new THREE.Mesh(geometry, material);
    this.volumetricCone.position.set(0, 0, -0.3);
    
    this.mesh.add(this.spotLight);
    this.mesh.add(this.volumetricCone);
    
    // 4. Halo Sprite
    this.createHalo();

    // 5. Dust Particles
    this.createDust();

    // 6. Impact Sparks System (World Space)
    const sparkCount = 30; // Reduced from 60
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    
    const sparkMat = new THREE.PointsMaterial({
       color: 0xffaa00,
       size: 0.1,
       transparent: true,
       opacity: 1.0,
       blending: THREE.AdditiveBlending,
       depthWrite: false
    });
    
    this.impactParticles = new THREE.Points(sparkGeo, sparkMat);
    this.impactParticles.frustumCulled = false;
    scene.add(this.impactParticles);
    
    for(let i=0; i<sparkCount; i++) {
        this.impactData.push({ velocity: new THREE.Vector3(), life: 0 });
        sparkPos[i*3] = 99999;
    }

    camera.add(this.mesh);
    this.mesh.position.set(0.25, -0.3, -0.5);
  }

  private createHalo() {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 220, 1.0)');
      grad.addColorStop(0.2, 'rgba(255, 255, 200, 0.5)');
      grad.addColorStop(0.5, 'rgba(255, 255, 200, 0.1)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ 
          map: texture, 
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          opacity: 0.4
      });
      
      this.haloSprite = new THREE.Sprite(material);
      this.haloSprite.scale.set(1.5, 1.5, 1.0);
      this.haloSprite.position.set(0, 0, -0.55);
      this.mesh.add(this.haloSprite);
  }

  private createDust() {
    const particleCount = 50; // Heavily reduced from 100 for optimization
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    this.dustVelocities = new Float32Array(particleCount);
    this.dustOrigins = new Float32Array(particleCount * 3);

    for(let i=0; i < particleCount; i++) {
        const r = Math.random() * 2.5;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 25;
        
        const scale = (dist / 25);
        const x = Math.cos(angle) * r * scale;
        const y = Math.sin(angle) * r * scale;
        const z = -dist;
        
        positions[i*3] = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z - 0.3;
        
        this.dustOrigins[i*3] = x;
        this.dustOrigins[i*3+1] = y;
        this.dustOrigins[i*3+2] = z - 0.3;

        this.dustVelocities[i] = 0.2 + Math.random() * 0.3;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const mat = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.03,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    this.dustSystem = new THREE.Points(geo, mat);
    this.mesh.add(this.dustSystem);
  }

  public getMode(): FlashlightMode {
      return this.currentMode;
  }

  public unlockMode(mode: FlashlightMode) {
      if (!this.unlockedModes.includes(mode)) {
          this.unlockedModes.push(mode);
      }
  }

  public cycleMode() {
      const currentIndex = this.unlockedModes.indexOf(this.currentMode);
      const nextIndex = (currentIndex + 1) % this.unlockedModes.length;
      this.currentMode = this.unlockedModes[nextIndex];
      
      if (this.currentMode === FlashlightMode.NORMAL) {
          this.spotLight.color.setHex(0xffffee); // Warm White
          this.spotLight.angle = Math.PI / 6;
          this.spotLight.distance = 40;
      } else if (this.currentMode === FlashlightMode.UV) {
          this.spotLight.color.setHex(0x8a2be2); // Purple UV
          this.spotLight.angle = Math.PI / 4; // Wider angle
          this.spotLight.distance = 20; // Shorter distance
      } else if (this.currentMode === FlashlightMode.STROBE) {
          this.spotLight.color.setHex(0xffffff); // White Strobe
          this.spotLight.angle = Math.PI / 6; // Normal angle
          this.spotLight.distance = 40; // Normal distance
      }
      
      // Reset strobe state
      this.strobeState = true;
      this.spotLight.visible = this.isOn && !this.isDisabled;
      this.volumetricCone.visible = this.spotLight.visible;
  }

  public forceDisable(duration: number) {
      this.isDisabled = true;
      this.disableTimer = duration;
      this.spotLight.visible = false;
      this.volumetricCone.visible = false;
      this.haloSprite.visible = false;
      this.dustSystem.visible = false;
  }
  
  public setDrainMultiplier(val: number) {
      this.drainMultiplier = val;
  }

  public setRangeMultiplier(val: number) {
      this.spotLight.distance = 60 * val;
      this.spotLight.shadow.camera.far = 60 * val;
      this.volumetricCone.scale.set(val, 1, val);
  }

  public update(delta: number, isRefilling: boolean) {
    if (this.overchargeCooldown > 0) {
        this.overchargeCooldown -= delta;
    }
    if (this.isCurrentlyOvercharging) {
        this.overchargeDuration -= delta;
        if (this.overchargeDuration <= 0) {
            this.isCurrentlyOvercharging = false;
        }
    }

    // Strobe logic
    if (this.isOn && !this.isDisabled && !this.isCurrentlyOvercharging && this.currentMode === FlashlightMode.STROBE) {
        this.strobeTimer += delta;
        if (this.strobeTimer > 0.05) { // 20Hz strobe
            this.strobeTimer = 0;
            this.strobeState = !this.strobeState;
            this.spotLight.visible = this.strobeState;
            this.volumetricCone.visible = this.strobeState;
        }
    } else if (this.isOn && !this.isDisabled) {
        this.spotLight.visible = true;
        this.volumetricCone.visible = true;
    }

    this.swayTarget.x = THREE.MathUtils.lerp(this.swayTarget.x, 0, delta * 10);
    this.swayTarget.y = THREE.MathUtils.lerp(this.swayTarget.y, 0, delta * 10);
    this.swayRotation.lerp(this.swayTarget, delta * 8);
    this.moveSway.lerp(new THREE.Vector2(0, 0), delta * 5);

    this.mesh.rotation.x = this.swayRotation.y + (this.moveSway.y * 0.5) + 0.02;
    this.mesh.rotation.y = this.swayRotation.x + (this.moveSway.x * 0.5) - 0.015;
    
    this.mesh.position.x = 0.25 + (this.swayRotation.x * 0.1);
    this.mesh.position.y = -0.3 + (this.swayRotation.y * 0.1) + (this.moveSway.y * 0.1);

    if (this.isDisabled) {
        this.disableTimer -= delta;
        if (this.disableTimer <= 0) {
            this.isDisabled = false;
            if (this.isOn && this.battery > 0) {
                this.spotLight.visible = true;
                this.volumetricCone.visible = true;
                this.haloSprite.visible = true;
                this.dustSystem.visible = true;
            }
        }
    }

    if (this.isOn && !this.isDisabled) {
      if (this.isCurrentlyOvercharging) {
          this.spotLight.intensity = 500;
          this.volumetricCone.visible = true;
          this.haloSprite.visible = true;
          this.dustSystem.visible = true;
      } else {
        let drainRate = GAME_CONFIG.BATTERY_DRAIN_RATE * this.drainMultiplier;
        if (this.currentMode === FlashlightMode.UV) drainRate *= 2.0;
        if (this.currentMode === FlashlightMode.STROBE) drainRate *= 3.0;
        
        this.battery -= drainRate * delta;
        
        let currentIntensity = 100;
        if (this.battery < 20) {
          this.flickerTimer += delta;
          if (this.flickerTimer > Math.random() * 0.2 + 0.05) {
              currentIntensity = Math.random() > 0.5 ? 0 : 100;
              this.flickerTimer = 0;
          }
        } 
        
        this.spotLight.intensity = currentIntensity;
        if (this.flickerTimer > 0) {
            this.flickerTimer -= delta;
            currentIntensity = (Math.random() > 0.5) ? 0 : currentIntensity;
            this.spotLight.intensity = currentIntensity;
        }

        const isVis = currentIntensity > 10;
        this.volumetricCone.visible = isVis;
        this.haloSprite.visible = isVis;
        this.dustSystem.visible = isVis;
        
        if (this.battery <= 0) {
          this.battery = 0;
          this.turnOff();
        }
      }

      const positions = this.dustSystem.geometry.attributes.position.array as Float32Array;
      const time = Date.now() * 0.001;
      const count = positions.length / 3;
      
      for(let i=0; i < count; i++) {
          const turbulenceX = Math.sin(time + i) * 0.02;
          const turbulenceY = Math.cos(time + i * 0.5) * 0.02;
          
          positions[i*3] = this.dustOrigins[i*3] + turbulenceX;
          positions[i*3+1] = this.dustOrigins[i*3+1] + turbulenceY;
      }
      this.dustSystem.geometry.attributes.position.needsUpdate = true;

    } else {
       this.dustSystem.visible = false;
       this.volumetricCone.visible = false;
       this.haloSprite.visible = false;
       this.spotLight.visible = false;
    }

    if (isRefilling) {
        this.battery += GAME_CONFIG.BATTERY_RECHARGE_RATE * delta * 2.0; // Faster recharge
    }

    this.battery = Math.min(Math.max(this.battery, 0), GAME_CONFIG.MAX_BATTERY);
    
    const sparkPos = this.impactParticles.geometry.attributes.position.array as Float32Array;
    let hasActiveSparks = false;
    for(let i=0; i < this.impactData.length; i++) {
        if (this.impactData[i].life > 0) {
            hasActiveSparks = true;
            this.impactData[i].life -= delta;
            
            const v = this.impactData[i].velocity;
            sparkPos[i*3] += v.x * delta;
            sparkPos[i*3+1] += v.y * delta;
            sparkPos[i*3+2] += v.z * delta;
            
            v.y -= 9.8 * delta;
        } else {
            sparkPos[i*3] = 99999;
        }
    }
    if(hasActiveSparks) {
        this.impactParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  public showImpact(point: THREE.Vector3, normal: THREE.Vector3) {
      const positions = this.impactParticles.geometry.attributes.position.array as Float32Array;
      let spawned = 0;
      for(let i=0; i < this.impactData.length; i++) {
          if (this.impactData[i].life <= 0 && spawned < 5) {
              this.impactData[i].life = 0.3 + Math.random() * 0.2;
              
              positions[i*3] = point.x;
              positions[i*3+1] = point.y;
              positions[i*3+2] = point.z;
              
              const v = new THREE.Vector3().copy(normal).multiplyScalar(2 + Math.random() * 4);
              v.x += (Math.random() - 0.5) * 4;
              v.y += (Math.random() - 0.5) * 4;
              v.z += (Math.random() - 0.5) * 4;
              
              this.impactData[i].velocity.copy(v);
              spawned++;
          }
      }
      this.impactParticles.geometry.attributes.position.needsUpdate = true;
  }

  public handleMovementSway(velX: number, velZ: number) {
      const speed = Math.sqrt(velX*velX + velZ*velZ);
      if (speed > 0.1) {
          this.moveSway.x = Math.sin(Date.now() * 0.01) * 0.05;
          this.moveSway.y = Math.cos(Date.now() * 0.02) * 0.05;
      }
  }

  public handleLookInertia(movementX: number, movementY: number) {
      const sensitivity = 0.003; 
      const maxSway = 0.35;
      this.swayTarget.x -= movementX * sensitivity;
      this.swayTarget.y -= movementY * sensitivity;
      this.swayTarget.x = Math.max(-maxSway, Math.min(maxSway, this.swayTarget.x));
      this.swayTarget.y = Math.max(-maxSway, Math.min(maxSway, this.swayTarget.y));
  }

  public triggerOvercharge(): boolean {
    if (this.overchargeCooldown <= 0 && this.battery >= this.OVERCHARGE_COST && !this.isDisabled && this.isOn) {
        this.battery -= this.OVERCHARGE_COST;
        this.overchargeCooldown = this.OVERCHARGE_COOLDOWN_TIME;
        this.isCurrentlyOvercharging = true;
        this.overchargeDuration = this.OVERCHARGE_DURATION_TIME;

        // Visual animation for the flash
        gsap.to(this.spotLight, { angle: Math.PI / 2, penumbra: 0.1, duration: 0.1, yoyo: true, repeat: 1 });
        gsap.to(this.volumetricCone.scale, { x: 5, y: 5, duration: 0.1, yoyo: true, repeat: 1 });
        
        return true;
    }
    return false;
  }
  
  public isOvercharging(): boolean {
      return this.isCurrentlyOvercharging;
  }

  public getOverchargeCooldown(): number {
    return 1 - (Math.max(0, this.overchargeCooldown) / this.OVERCHARGE_COOLDOWN_TIME);
  }

  public getEffectiveAngle(): number {
      return this.isCurrentlyOvercharging ? Math.PI / 2 : this.spotLight.angle;
  }

  public toggle() {
    if (!this.isDisabled && this.battery > 0) {
      this.isOn = !this.isOn;
      this.spotLight.visible = this.isOn;
      this.volumetricCone.visible = this.isOn;
      this.haloSprite.visible = this.isOn;
      
      gsap.fromTo(this.mesh.position, 
         { z: -0.45 }, 
         { z: -0.5, duration: 0.2, ease: "bounce.out" }
      );
    }
  }

  public turnOn() {
    if (!this.isDisabled && this.battery > 0) {
      this.isOn = true;
      this.spotLight.visible = true;
      this.volumetricCone.visible = true;
      this.haloSprite.visible = true;
      this.dustSystem.visible = true;
    }
  }

  public turnOff() {
    this.isOn = false;
    this.spotLight.visible = false;
    this.volumetricCone.visible = false;
    this.haloSprite.visible = false;
  }
  
  public getBattery(): number {
    return this.battery;
  }
  
  public setBattery(val: number) {
      this.battery = val;
  }
  
  public isLightOn(): boolean {
      return this.isOn && !this.isDisabled;
  }

  public flicker(duration: number) {
      this.flickerTimer = duration;
  }
}
