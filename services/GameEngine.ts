
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { FlashlightController } from './FlashlightController';
import { Enemy, NormalEnemy, FastEnemy, TankEnemy, GlitcherEnemy, DrainerEnemy, ShriekerBoss, ForestHeartBoss } from './EnemySystem';
import { SoundManager } from './SoundManager';
import { COLORS, GAME_CONFIG } from '../constants';
import { GamePhase, EnemyType, SaveData } from '../types';
import { VignetteShader, HorrorColorGradeShader, injectWindShader, ChromaticAberrationShader } from './Shaders';
import gsap from 'gsap';

// --- Weather Systems ---

class RainSystem {
    private particles: THREE.Points;
    private count: number = 10000; // STRICT LIMIT PER USER REQUEST

    constructor(scene: THREE.Scene) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.count * 3);
        const velocities = new Float32Array(this.count);

        for (let i = 0; i < this.count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 80; 
            positions[i * 3 + 1] = Math.random() * 40;     
            positions[i * 3 + 2] = (Math.random() - 0.5) * 80; 
            velocities[i] = 25 + Math.random() * 15; // Heavy fast rain
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const mat = new THREE.PointsMaterial({
            color: 0xaaccff, 
            size: 0.15, 
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geo, mat);
        this.particles.visible = false;
        scene.add(this.particles);
    }

    public update(delta: number, playerPos: THREE.Vector3, windX: number, windZ: number) {
        const positions = this.particles.geometry.attributes.position.array as Float32Array;
        const velocities = this.particles.geometry.attributes.velocity.array as Float32Array;

        for (let i = 0; i < this.count; i++) {
            positions[i * 3 + 1] -= velocities[i] * delta; 
            
            // Wind effect
            positions[i * 3] += windX * delta * 8;
            positions[i * 3 + 2] += windZ * delta * 8;

            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 30 + Math.random() * 10;
                // Follow player loosely
                positions[i * 3] = playerPos.x + (Math.random() - 0.5) * 60;
                positions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * 60;
            }
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
    }

    public setVisible(visible: boolean) {
        this.particles.visible = visible;
    }
}

class SporeSystem {
    private particles: THREE.Points;
    private count = 2500; // Ultra Density

    constructor(scene: THREE.Scene) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.count * 3);
        for(let i=0; i<this.count; i++) {
            positions[i*3] = (Math.random()-0.5) * 100;
            positions[i*3+1] = Math.random() * 10;
            positions[i*3+2] = (Math.random()-0.5) * 100;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x55ff55,
            size: 0.06,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.particles = new THREE.Points(geo, mat);
        scene.add(this.particles);
    }

    public update(delta: number) {
        const pos = this.particles.geometry.attributes.position.array as Float32Array;
        for(let i=0; i<this.count; i++) {
            pos[i*3+1] += Math.sin(Date.now()*0.001 + i) * 0.01;
            pos[i*3] += Math.cos(Date.now()*0.0005 + i) * 0.01;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
    }
}

class Flare {
    public mesh: THREE.Group;
    public light: THREE.PointLight;
    public life: number;
    public velocity: THREE.Vector3;
    private sparks: THREE.Points;
    private sound: THREE.PositionalAudio | null = null;

    constructor(pos: THREE.Vector3, dir: THREE.Vector3) {
        this.life = GAME_CONFIG.FLARE_DURATION;
        this.velocity = dir.multiplyScalar(15);
        this.velocity.y = 5;

        this.mesh = new THREE.Group();
        this.mesh.position.copy(pos);

        const coreGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3);
        const coreMat = new THREE.MeshStandardMaterial({ 
            color: 0x330000, 
            emissive: COLORS.FLARE, 
            emissiveIntensity: 10
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.rotation.x = Math.PI / 2;
        this.mesh.add(core);

        this.light = new THREE.PointLight(COLORS.FLARE, 8, GAME_CONFIG.FLARE_RADIUS * 2.0);
        this.light.castShadow = true;
        this.light.shadow.bias = -0.0001;
        this.mesh.add(this.light);

        const pCount = 40;
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(pCount * 3);
        for(let i=0; i<pCount; i++) pPos[i] = 0;
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        const pMat = new THREE.PointsMaterial({
            color: 0xffaa00, size: 0.15, transparent: true, opacity: 0.9
        });
        this.sparks = new THREE.Points(pGeo, pMat);
        this.mesh.add(this.sparks);
    }

    public update(delta: number, scene: THREE.Scene, groundY: number = 0.1) {
        if (this.life <= 0) return;

        if (this.mesh.position.y > groundY) {
            this.velocity.y -= 9.8 * delta;
            this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
            this.mesh.rotation.x += delta * 5;
            this.mesh.rotation.z += delta * 5;
        } else {
            this.mesh.position.y = groundY;
            this.velocity.set(0,0,0);
            this.mesh.rotation.set(Math.PI/2, 0, Math.random() * Math.PI);
        }

        this.life -= delta;
        this.light.intensity = 6 + Math.sin(Date.now() * 0.1) * 4;

        const positions = this.sparks.geometry.attributes.position.array as Float32Array;
        for(let i=0; i<40; i++) {
            positions[i*3] += (Math.random()-0.5) * 0.2;
            positions[i*3+1] += Math.random() * 0.2;
            positions[i*3+2] += (Math.random()-0.5) * 0.2;
            if (positions[i*3+1] > 1.5) {
                positions[i*3] = 0; positions[i*3+1] = 0; positions[i*3+2] = 0;
            }
        }
        this.sparks.geometry.attributes.position.needsUpdate = true;

        if (this.life <= 0) {
            this.light.intensity = 0;
            scene.remove(this.mesh);
            if (this.sound && this.sound.isPlaying) this.sound.stop();
        }
    }

    public setSound(s: THREE.PositionalAudio) {
        this.sound = s;
    }
}

// --- Procedural Texture Utils ---
export class TextureUtils {
    static createNoiseCanvas(width: number, height: number, type: 'wood' | 'concrete' | 'monitor' | 'metal'): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        
        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const x = (i / 4) % width;
            
            let val = 0;
            if (type === 'wood') {
                val = (Math.sin(x * 0.1 + Math.random() * 0.1) * 30) + (Math.random() * 40) + 40;
                if (Math.random() > 0.98) val -= 30; 
            } else if (type === 'concrete') {
                val = Math.random() * 100 + 50;
                 if (Math.random() > 0.99) val = 20;
            } else if (type === 'metal') {
                val = Math.random() * 50 + 80;
                if (Math.random() > 0.99) val = 200;
            } else if (type === 'monitor') {
                 val = 0; 
            }
            
            data[i] = val;     
            data[i + 1] = val; 
            data[i + 2] = val; 
            data[i + 3] = 255; 
        }
        ctx.putImageData(imgData, 0, 0);
        
        if (type === 'wood') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#654321';
            ctx.fillRect(0,0,width,height);
        } else if (type === 'concrete') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#444444';
            ctx.fillRect(0,0,width,height);
            // Add darker splotches for detail
            for(let i=0; i<10; i++) {
                ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
                ctx.beginPath();
                ctx.arc(Math.random()*width, Math.random()*height, Math.random()*50, 0, Math.PI*2);
                ctx.fill();
            }
        }

        return canvas;
    }

    static createGrassBladeTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        
        const grad = ctx.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#226622'); 
        grad.addColorStop(0.5, '#114411'); 
        grad.addColorStop(1, '#052205');
        ctx.fillStyle = grad;
        
        ctx.beginPath();
        ctx.moveTo(32, 128);
        ctx.quadraticCurveTo(40, 64, 34, 0);
        ctx.quadraticCurveTo(32, 10, 30, 0);
        ctx.quadraticCurveTo(24, 64, 32, 128);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(200, 255, 200, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(32, 128);
        ctx.quadraticCurveTo(32, 64, 32, 20);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    static createScratchedMetalCanvas(width: number, height: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, width, height);

        const imgData = ctx.getImageData(0,0,width,height);
        for(let i=0; i<imgData.data.length; i+=4) {
            const grain = (Math.random()-0.5)*30;
            imgData.data[i] += grain;
            imgData.data[i+1] += grain;
            imgData.data[i+2] += grain;
        }
        ctx.putImageData(imgData, 0, 0);

        ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        for(let i=0; i<100; i++) {
            ctx.beginPath();
            const x = Math.random() * width;
            const y = Math.random() * height;
            const l = Math.random() * 50;
            const a = Math.random() * Math.PI;
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l);
            ctx.stroke();
        }
        return canvas;
    }

    static createCobwebTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0,0,512,512);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)"; 
        ctx.lineWidth = 1;
        const cx = 0; const cy = 0;
        for(let i=0; i<20; i++) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            const len = 400 + Math.random() * 100;
            const angle = (i / 20) * (Math.PI / 2); 
            ctx.quadraticCurveTo(cx + Math.random()*50, cy + Math.random()*50, Math.cos(angle)*len, Math.sin(angle)*len);
            ctx.stroke();
        }
        for(let i=0; i<10; i++) {
            ctx.beginPath();
            ctx.arc(cx, cy, i * 50, 0, Math.PI/2);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
    }
    
    static createBurnTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, "rgba(0,0,0,1)");
        grd.addColorStop(0.5, "rgba(20,0,0,0.8)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    static generateNormalMap(sourceCanvas: HTMLCanvasElement): THREE.CanvasTexture {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        const ctx = sourceCanvas.getContext('2d')!;
        const srcData = ctx.getImageData(0, 0, width, height).data;
        
        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = width;
        normalCanvas.height = height;
        const nCtx = normalCanvas.getContext('2d')!;
        const nImgData = nCtx.createImageData(width, height);
        const data = nImgData.data;
        
        const getHeight = (x: number, y: number) => {
            x = (x + width) % width;
            y = (y + height) % height;
            return srcData[(y * width + x) * 4] / 255.0;
        };
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const hL = getHeight(x - 1, y);
                const hR = getHeight(x + 1, y);
                const hD = getHeight(x, y - 1);
                const hU = getHeight(x, y + 1);
                
                const dx = (hR - hL) * 3.0; 
                const dy = (hU - hD) * 3.0;
                const dz = 1.0;
                
                const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const idx = (y * width + x) * 4;
                
                data[idx] = ((dx / len) * 0.5 + 0.5) * 255;
                data[idx+1] = ((dy / len) * 0.5 + 0.5) * 255;
                data[idx+2] = ((dz / len) * 0.5 + 0.5) * 255;
                data[idx+3] = 255;
            }
        }
        nCtx.putImageData(nImgData, 0, 0);
        const tex = new THREE.CanvasTexture(normalCanvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }
}

class SparkSystem {
    private particles: THREE.Points;
    private maxParticles = 200; 
    private particleData: { velocity: THREE.Vector3, life: number }[] = [];
    private sparkLight: THREE.PointLight;

    constructor(scene: THREE.Scene) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticles * 3);
        const colors = new Float32Array(this.maxParticles * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.particles = new THREE.Points(geo, mat);
        this.particles.frustumCulled = false;
        scene.add(this.particles);
        this.sparkLight = new THREE.PointLight(0xffaa00, 0, 8);
        scene.add(this.sparkLight);
        for(let i=0; i<this.maxParticles; i++) {
            this.particleData.push({ velocity: new THREE.Vector3(), life: 0 });
            positions[i*3] = 99999; 
        }
    }
    public emit(position: THREE.Vector3, count: number) {
        const positions = this.particles.geometry.attributes.position.array as Float32Array;
        const colors = this.particles.geometry.attributes.color.array as Float32Array;
        let spawned = 0;
        for(let i=0; i<this.maxParticles; i++) {
            if (this.particleData[i].life <= 0 && spawned < count) {
                this.particleData[i].life = 0.5 + Math.random() * 0.5;
                const theta = (Math.random() - 0.5) * 2; 
                const phi = (Math.random() - 0.5) * 2;
                this.particleData[i].velocity.set(
                    theta + (Math.random()-0.5), 
                    Math.random() * 3 + 2, 
                    phi + (Math.random()-0.5)
                ).normalize().multiplyScalar(4 + Math.random() * 4);
                positions[i*3] = position.x;
                positions[i*3+1] = position.y;
                positions[i*3+2] = position.z;
                colors[i*3] = 1.0;
                colors[i*3+1] = 0.8 + Math.random() * 0.2;
                colors[i*3+2] = 0.5;
                spawned++;
            }
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.color.needsUpdate = true;
    }
    public update(delta: number) {
        const positions = this.particles.geometry.attributes.position.array as Float32Array;
        const colors = this.particles.geometry.attributes.color.array as Float32Array;
        let activeCount = 0;
        for(let i=0; i<this.maxParticles; i++) {
            if (this.particleData[i].life > 0) {
                activeCount++;
                this.particleData[i].life -= delta;
                const v = this.particleData[i].velocity;
                positions[i*3] += v.x * delta;
                positions[i*3+1] += v.y * delta;
                positions[i*3+2] += v.z * delta;
                v.y -= 9.8 * delta; 
                if (positions[i*3+1] < 0.2) {
                    v.y = -v.y * 0.5;
                    positions[i*3+1] = 0.2;
                }
            } else {
                positions[i*3] = 99999;
            }
        }
        if (activeCount > 0) {
            this.particles.geometry.attributes.position.needsUpdate = true;
            this.particles.geometry.attributes.color.needsUpdate = true;
            this.sparkLight.intensity = (activeCount / 5) * (Math.random() * 2 + 1);
            this.sparkLight.position.set(-1.2, 0.5, -1.2);
        } else {
            this.sparkLight.intensity = 0;
        }
    }
}

export class GameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private fxaaPass: ShaderPass;
  private aberrationPass: ShaderPass;
  private bloomPass: UnrealBloomPass; 
  
  public flashlight: FlashlightController;
  public soundManager: SoundManager;
  public enemies: Enemy[] = [];
  
  private world: CANNON.World;
  private physicsObjects: { mesh: THREE.Mesh, body: CANNON.Body }[] = [];
  private playerPhysicsBody: CANNON.Body;

  private onStatsUpdate: (bat: number, hp: number, wave: number, credits: number, genDisabled: boolean, restartProgress: number, totalKills: number, killsByType: Record<string, number>, ammo: number, stamina: number, overcharge: number) => void;
  private onPhaseChange: (phase: GamePhase) => void;
  private onInteract: (target: string) => void;
  private onHover: (isHovering: boolean, text: string) => void;
  private onDeathSequenceStart: () => void; 

  private generatorHp: number = 100;
  private maxGeneratorHp: number = 100;
  private wave: number = 0; 
  private credits: number = 0;
  private totalKills: number = 0; 
  private killsByType: Record<string, number> = {};
  private phase: GamePhase = GamePhase.MENU;
  private isRunning: boolean = false;
  private isUIOpen: boolean = false; 
  private isTransitioning: boolean = false;
  private isLocking: boolean = false;
  private isDeathSequence: boolean = false; 
  private clock: THREE.Clock;
  private isBloodMoon: boolean = false; 
  
  private stamina: number = 100;
  private trauma: number = 0; 
  
  private isGeneratorDisabled: boolean = false;
  private restartProgress: number = 0;
  private isHoldingRestart: boolean = false;
  private hasAutoRepair: boolean = false;
  private sparkSystem: SparkSystem;
  private sparkTimer: number = 0;
  
  private turretGroup: THREE.Group | null = null;
  private turretHead: THREE.Object3D | null = null;
  private turretAmmo: number = 200;
  private turretCooldown: number = 0;
  private turretTarget: Enemy | null = null;
  
  private rainSystem: RainSystem;
  private sporeSystem: SporeSystem;
  private activeFlares: Flare[] = [];
  public flaresCount: number = 0;
  private lightningTimer: number = 0;
  private lightningDuration: number = 0;
  
  private fanMesh: THREE.Group | null = null;
  private radioMesh: THREE.Group | null = null;
  private isFanOn: boolean = true;
  private isRadioOn: boolean = false;
  private fanSpeed: number = 0;
  private fanAudio: THREE.PositionalAudio | null = null;
  private radioAudio: THREE.PositionalAudio | null = null;
  
  private monitorCanvas: HTMLCanvasElement;
  private monitorContext: CanvasRenderingContext2D;
  private monitorTexture: THREE.CanvasTexture;
  private monitorUpdateTimer: number = 0;
  private monitorMesh: THREE.Mesh;
  private matrixChars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*";
  private matrixDrops: number[] = [];
  
  private bobTimer: number = 0;
  private shakeIntensity: number = 0;
  private forestSoundTimer: number = 0;
  
  private damageMultiplier: number = 1.0;
  private batteryMultiplier: number = 1.0;

  private raycaster: THREE.Raycaster;
  private generatorGroup: THREE.Group;
  private engineBlock: THREE.Mesh; 
  private domElement: HTMLElement;
  private fog: THREE.Fog; 
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private boothLight: THREE.PointLight;
  private boothBulb: THREE.Mesh;
  private generatorPulse: number = 0;
  
  private walls: THREE.Box3[] = [];
  private obstacles: THREE.Box3[] = [];
  
  private moveForward: boolean = false;
  private moveBackward: boolean = false;
  private moveLeft: boolean = false;
  private moveRight: boolean = false;
  private isSprinting: boolean = false; 
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private PI_2 = Math.PI / 2;

  private windUniforms: { time: { value: number } };
  private burnTexture: THREE.Texture;

  private boundResize: () => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: () => void;
  private boundRightClick: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundPointerLockChange: () => void;
  private boundPointerLockError: () => void;

  private hoveredTarget: string = '';
  private isHoveringTerminal: boolean = false;

  private container: HTMLElement;
  private animationId: number = 0;
  private isDisposed: boolean = false;

  constructor(
    container: HTMLElement, 
    loadingManager: THREE.LoadingManager,
    initialData: SaveData | null,
    onStatsUpdate: (bat: number, hp: number, wave: number, credits: number, genDisabled: boolean, restartProgress: number, totalKills: number, killsByType: Record<string, number>, ammo: number, stamina: number, overcharge: number) => void,
    onPhaseChange: (phase: GamePhase) => void,
    onInteract: (target: string) => void,
    onHover: (isHovering: boolean, text: string) => void,
    onDeathSequenceStart: () => void
  ) {
    this.container = container;
    this.onStatsUpdate = onStatsUpdate;
    this.onPhaseChange = onPhaseChange;
    this.onInteract = onInteract;
    this.onHover = onHover;
    this.onDeathSequenceStart = onDeathSequenceStart;
    this.clock = new THREE.Clock();
    this.windUniforms = { time: { value: 0 } };
    
    loadingManager.itemStart("init_engine");
    loadingManager.itemStart("compile_shaders");
    
    this.soundManager = new SoundManager();

    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.playerPhysicsBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Sphere(0.5),
        type: CANNON.Body.KINEMATIC
    });
    this.world.addBody(this.playerPhysicsBody);

    this.scene = new THREE.Scene();
    
    this.fog = new THREE.Fog(COLORS.FOG, 5, 45); 
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(COLORS.FOG);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 60); 
    this.camera.position.set(0, 1.6, 0); 
    this.camera.add(this.soundManager.getListener()); 
    this.soundManager.setupPlayerBreathing(this.camera); 
    this.scene.add(this.camera);

    this.hemiLight = new THREE.HemisphereLight(0xeeeeff, 0x222222, 0.2);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.15); // Moon
    this.sunLight.position.set(50, 100, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 4096; 
    this.sunLight.shadow.mapSize.height = 4096;
    this.sunLight.shadow.bias = -0.0005; 
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);

    this.boothLight = new THREE.PointLight(0xffddaa, 20.0, 45); // Halved for ACES
    this.boothLight.position.set(0, 2.8, 0);
    this.boothLight.castShadow = true;
    this.boothLight.shadow.mapSize.width = 2048;
    this.boothLight.shadow.mapSize.height = 2048;
    this.boothLight.shadow.bias = -0.0001;
    this.boothLight.shadow.radius = 2; 
    this.scene.add(this.boothLight);

    const bulbGeo = new THREE.SphereGeometry(0.05, 16, 16);
    const bulbMat = new THREE.MeshStandardMaterial({ 
        emissive: 0xffaa00, 
        emissiveIntensity: 50,
        color: 0x000000 
    });
    this.boothBulb = new THREE.Mesh(bulbGeo, bulbMat);
    this.boothBulb.position.copy(this.boothLight.position);
    this.scene.add(this.boothBulb);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.domElement = this.renderer.domElement;

    // Post Processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    
    const horrorPass = new ShaderPass(HorrorColorGradeShader);
    this.composer.addPass(horrorPass);

    this.aberrationPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.aberrationPass);

    this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.2, 0.5, 0.85
    );
    this.bloomPass.threshold = 0.7; 
    this.bloomPass.strength = 1.2;   
    this.bloomPass.radius = 0.8;
    this.composer.addPass(this.bloomPass);

    // @ts-ignore
    const filmPass = new (FilmPass as any)(0.35, 0.025, 648, 0); 
    this.composer.addPass(filmPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
    this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
    this.composer.addPass(this.fxaaPass);

    const vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(vignettePass);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 10; 

    // Textures
    const flashlightNormal = TextureUtils.generateNormalMap(TextureUtils.createScratchedMetalCanvas(512, 512));
    this.burnTexture = TextureUtils.createBurnTexture();
    
    this.flashlight = new FlashlightController(this.scene, this.camera, flashlightNormal);
    this.soundManager.setupFlashlightWhine(this.camera);

    this.monitorCanvas = document.createElement('canvas');
    this.monitorCanvas.width = 512;
    this.monitorCanvas.height = 256;
    this.monitorContext = this.monitorCanvas.getContext('2d')!;
    this.monitorContext.font = "14px monospace";
    for(let x=0; x < 512/14; x++) {
        this.matrixDrops[x] = 1;
    }
    this.monitorTexture = new THREE.CanvasTexture(this.monitorCanvas);
    
    this.createEnvironment(); 
    this.createPhysicsProps(); 
    this.createCobwebs();      
    this.createTurret();

    this.sparkSystem = new SparkSystem(this.scene);
    this.rainSystem = new RainSystem(this.scene);
    this.sporeSystem = new SporeSystem(this.scene);
    
    this.boundResize = this.onWindowResize.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundClick = this.onClick.bind(this);
    this.boundRightClick = this.onRightClick.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundPointerLockError = this.onPointerLockError.bind(this);

    window.addEventListener('resize', this.boundResize);
    document.addEventListener('mousemove', this.boundMouseMove);
    this.domElement.addEventListener('click', this.boundClick);
    this.domElement.addEventListener('contextmenu', this.boundRightClick);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    document.addEventListener('pointerlockerror', this.boundPointerLockError);

    if (initialData) {
        this.restoreState(initialData);
    }

    setTimeout(() => { loadingManager.itemEnd("init_engine"); }, 500);
    setTimeout(() => { loadingManager.itemEnd("compile_shaders"); }, 1000);

    this.isRunning = true;
    this.animate();
  }

  private onRightClick(e: MouseEvent) {
      e.preventDefault();
      if (this.isLocking && this.phase === GamePhase.NIGHT) {
          const overchargeSuccessful = this.flashlight.triggerOvercharge();
          if(overchargeSuccessful) {
              this.soundManager.playOverchargeStart();
              // Screen flash effect
              gsap.to(this.bloomPass, { strength: 4, duration: 0.1, yoyo: true, repeat: 1 });
          }
      }
  }

  // ... Input Handlers (Same as before) ...
  private onWindowResize() {
      if (!this.camera || !this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
  }

  private onMouseMove(e: MouseEvent) {
      if (!this.isLocking) return;
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;
      
      this.euler.y -= movementX * 0.002;
      this.euler.x -= movementY * 0.002;
      this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x));
      
      this.flashlight.handleLookInertia(movementX, movementY);
  }

  private onClick() {
      if (!this.isLocking) {
          if (this.phase !== GamePhase.MENU && this.phase !== GamePhase.GAME_OVER && !this.isUIOpen) {
              this.requestLockImmediate();
          }
      } else {
          if (this.phase === GamePhase.DAY && this.hoveredTarget) {
              if (this.hoveredTarget === 'fan') {
                  this.isFanOn = !this.isFanOn;
                  this.soundManager.playClick();
              } else if (this.hoveredTarget === 'radio') {
                  this.isRadioOn = !this.isRadioOn;
                  this.soundManager.playClick();
                  if (this.radioAudio) this.radioAudio.setVolume(this.isRadioOn ? 0.3 : 0);
              }
          } else {
              this.flashlight.toggle();
          }
      }
  }

  private onKeyDown(e: KeyboardEvent) {
      switch (e.code) {
          case 'KeyW': this.moveForward = true; break; 
          case 'KeyA': this.moveLeft = true; break;
          case 'KeyS': this.moveBackward = true; break; 
          case 'KeyD': this.moveRight = true; break;
          case 'ShiftLeft': this.isSprinting = true; break;
          case 'KeyF': this.flashlight.toggle(); break;
          case 'KeyG': this.throwFlare(); break;
          case 'KeyE': 
              this.isHoldingRestart = true;
              if (this.hoveredTarget === 'terminal') {
                  this.transitionToTerminal();
              }
              break;
      }
  }

  private onKeyUp(e: KeyboardEvent) {
      switch (e.code) {
          case 'KeyW': this.moveForward = false; break;
          case 'KeyA': this.moveLeft = false; break;
          case 'KeyS': this.moveBackward = false; break;
          case 'KeyD': this.moveRight = false; break;
          case 'ShiftLeft': this.isSprinting = false; break;
          case 'KeyE': this.isHoldingRestart = false; break;
      }
  }

  public requestLockImmediate() {
      if (document.pointerLockElement === this.domElement) return;
      // @ts-ignore
      const promise = this.domElement.requestPointerLock();
      // @ts-ignore
      if (promise && typeof promise.catch === 'function') { promise.catch(e => {}); }
  }

  private onPointerLockChange() {
      if (document.pointerLockElement === this.domElement) {
          this.isLocking = true;
          this.isUIOpen = false;
          this.soundManager.resume();
      } else {
          this.isLocking = false;
      }
  }

  private onPointerLockError() { }

  // ... Mechanics ... (Abbreviated to focus on updated methods)

  public addTrauma(amount: number) {
      this.trauma = Math.min(this.trauma + amount, 1.0);
  }

  private throwFlare() {
      if (this.flaresCount > 0 && this.phase === GamePhase.NIGHT) {
          this.flaresCount--;
          const direction = new THREE.Vector3();
          this.camera.getWorldDirection(direction);
          const flare = new Flare(this.camera.position.clone(), direction);
          const sound = this.soundManager.createFlareSound(flare.mesh);
          if (sound) flare.setSound(sound);
          
          this.scene.add(flare.mesh);
          this.activeFlares.push(flare);
      }
  }

  // Updated spawnWave logic remains same, used in startNight
  public spawnWave(waveNumber: number) {
      let points = 20 + waveNumber * 10 + Math.pow(waveNumber, 1.8);
      if (waveNumber % 3 === 0) {
          this.isBloodMoon = true;
          points *= 1.5; 
      } else {
          this.isBloodMoon = false;
      }

      if (waveNumber > 0 && waveNumber % 10 === 0) {
          const boss = new ForestHeartBoss();
          const angle = Math.random() * Math.PI * 2;
          boss.mesh.position.set(Math.cos(angle) * 40, 0, Math.sin(angle) * 40);
          this.enemies.push(boss);
          this.scene.add(boss.mesh);
          points -= 100;
      } else if (waveNumber > 0 && waveNumber % 5 === 0) {
          const boss = new ShriekerBoss();
          const angle = Math.random() * Math.PI * 2;
          boss.mesh.position.set(Math.cos(angle) * 30, 1.5, Math.sin(angle) * 30);
          this.enemies.push(boss);
          this.scene.add(boss.mesh);
          points -= 50;
      }

      const spawn = (Cls: any, cost: number) => {
          if (points >= cost) {
              const enemy = new Cls();
              const angle = Math.random() * Math.PI * 2;
              const r = 25 + Math.random() * 20; 
              enemy.mesh.position.set(Math.cos(angle) * r, 1, Math.sin(angle) * r);
              
              if (this.isBloodMoon) {
                  enemy.speed *= 1.3; 
                  (enemy.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xff0000);
                  (enemy.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
              }

              this.enemies.push(enemy);
              this.scene.add(enemy.mesh);
              this.soundManager.attachEnemySound(enemy.mesh, enemy.type);
              points -= cost;
              return true;
          }
          return false;
      };

      let attempts = 0;
      while (points > 3 && attempts < 200) {
          attempts++;
          const roll = Math.random();
          let spawned = false;
          if (waveNumber >= 6 && roll < 0.15) spawned = spawn(GlitcherEnemy, 12);
          else if (waveNumber >= 4 && roll < 0.25) spawned = spawn(DrainerEnemy, 10);
          else if (waveNumber >= 3 && roll < 0.4) spawned = spawn(TankEnemy, 15);
          else if (waveNumber >= 2 && roll < 0.6) spawned = spawn(FastEnemy, 8);
          else spawned = spawn(NormalEnemy, 5);
          if (!spawned && points < 5) break; 
      }
  }

  public startNight() {
      this.turretTarget = null;
      this.enemies.forEach(e => this.scene.remove(e.mesh));
      this.enemies = []; 
      
      this.phase = GamePhase.NIGHT;
      this.wave++;
      this.spawnWave(this.wave); 
      this.onPhaseChange(GamePhase.NIGHT);
      this.flashlight.turnOn();
      
      this.sunLight.intensity = 0.15;
      this.hemiLight.intensity = 0.25;
      
      if (this.isBloodMoon) {
          this.scene.background = new THREE.Color(COLORS.BLOOD_MOON);
          this.fog.color.setHex(COLORS.BLOOD_MOON);
          this.fog.near = 1;
          this.fog.far = 30; 
          this.sunLight.color.setHex(0xff0000);
      } else {
          this.scene.background = new THREE.Color(COLORS.SKY_NIGHT);
          this.fog.color.setHex(COLORS.FOG);
          this.fog.near = 5;
          this.fog.far = 45;
          this.sunLight.color.setHex(0xffffff);
      }
      
      if(this.bloomPass) {
          this.bloomPass.strength = 1.2;
          this.bloomPass.threshold = 0.7;
      }
      this.renderer.toneMappingExposure = 1.0;

      this.rainSystem.setVisible(true);
      this.soundManager.toggleRain(true);
  }

  public upgradeSystem(id: string) {
      if (id === 'battery_cap') {
          this.batteryMultiplier *= 0.8; 
          this.flashlight.setDrainMultiplier(this.batteryMultiplier);
      } else if (id === 'focus_lens') {
          this.damageMultiplier *= 1.2;
      } else if (id === 'gen_reinforce') {
          this.maxGeneratorHp += 50;
          this.generatorHp += 50;
      } else if (id === 'gen_auto_repair') {
          this.hasAutoRepair = true;
      } else if (id === 'flare_pack') {
          this.flaresCount++;
      } else if (id === 'turret_ammo') {
          this.turretAmmo += 100;
      }
  }

  public deductCredits(amount: number) { this.credits -= amount; }

  public closeUI() {
      this.isUIOpen = false;
      this.isTransitioning = true;
      this.onHover(false, "");
      gsap.to(this.camera.position, {
          x: 0, y: 1.6, z: 2, duration: 1.2, ease: "power2.inOut",
      });
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      const targetEuler = new THREE.Euler().setFromQuaternion(targetQuat, 'YXZ');
      this.euler.y = this.euler.y % (Math.PI * 2);
      this.camera.quaternion.setFromEuler(this.euler); 

      gsap.to(this.euler, {
          x: targetEuler.x, y: targetEuler.y, z: targetEuler.z, duration: 1.2, ease: "power2.inOut",
          onComplete: () => {
              this.isTransitioning = false;
              this.requestLockImmediate();
              if (this.phase === GamePhase.DAY) this.camera.rotation.set(0, 0, 0); 
          }
      });
  }

  private transitionToTerminal() {
      if (this.isTransitioning) return;
      this.isTransitioning = true;
      this.onHover(false, "");
      this.isLocking = false; 
      document.exitPointerLock();

      const targetPos = new THREE.Vector3(0.8, 1.35, 0.5); 
      const dummyCam = this.camera.clone();
      dummyCam.position.copy(targetPos);
      dummyCam.lookAt(this.monitorMesh.getWorldPosition(new THREE.Vector3()));
      const targetEuler = new THREE.Euler().setFromQuaternion(dummyCam.quaternion, 'YXZ');

      let currentY = this.euler.y % (2 * Math.PI);
      let diff = targetEuler.y - currentY;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.euler.y = targetEuler.y - diff;
      this.camera.quaternion.setFromEuler(this.euler);

      gsap.to(this.camera.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.5, ease: "power2.inOut" });
      gsap.to(this.euler, {
          x: targetEuler.x, y: targetEuler.y, z: targetEuler.z, duration: 1.5, ease: "power2.inOut",
          onComplete: () => {
              this.isTransitioning = false;
              this.isUIOpen = true;
              this.onInteract('computer');
          }
      });
  }

  private updateMovement(delta: number) {
      if (!this.isLocking || this.isTransitioning || this.isUIOpen) return;

      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;

      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();

      const speed = this.isSprinting ? GAME_CONFIG.PLAYER_RUN_SPEED : GAME_CONFIG.PLAYER_SPEED;

      if (this.moveForward || this.moveBackward) this.velocity.z += this.direction.z * 400.0 * delta * 0.1; 
      if (this.moveLeft || this.moveRight) this.velocity.x += this.direction.x * 400.0 * delta * 0.1;

      const currentSpeed = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
      if (currentSpeed > 0.1) {
          const maxSpeedRef = this.isSprinting ? 2.5 : 1.5; 
          if (currentSpeed > maxSpeedRef) {
              const ratio = maxSpeedRef / currentSpeed;
              this.velocity.x *= ratio;
              this.velocity.z *= ratio;
          }
      }

      const isMoving = currentSpeed > 0.1;
      if (this.isSprinting && isMoving) {
          this.stamina -= delta * 25; 
          if (this.stamina <= 0) {
              this.stamina = 0;
              this.isSprinting = false;
          }
      } else {
          const recoveryRate = isMoving ? 10 : 25;
          if (this.stamina < 100) {
              this.stamina += delta * recoveryRate;
              if (this.stamina > 100) this.stamina = 100;
          }
      }

      const moveX = this.velocity.x * delta * speed;
      const moveZ = -this.velocity.z * delta * speed;
      this.camera.translateX(moveX);
      this.camera.translateZ(moveZ);

      if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
          this.bobTimer += delta * (this.isSprinting ? 18 : 12);
          this.camera.position.y = 1.6 + Math.sin(this.bobTimer) * 0.05;
      } else {
          this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 1.6, delta * 5);
      }
      
      const PLAYER_RADIUS = 0.4;
      const playerBox = new THREE.Box3();
      playerBox.setFromCenterAndSize(this.camera.position, new THREE.Vector3(PLAYER_RADIUS * 2, 2, PLAYER_RADIUS * 2));

      for(const wall of this.walls) {
          if (wall.intersectsBox(playerBox)) {
               const wallCenter = new THREE.Vector3(); wall.getCenter(wallCenter);
               const wallSize = new THREE.Vector3(); wall.getSize(wallSize);
               const dx = this.camera.position.x - wallCenter.x;
               const dz = this.camera.position.z - wallCenter.z;
               const safeX = wallSize.x/2 + PLAYER_RADIUS + 0.01;
               const safeZ = wallSize.z/2 + PLAYER_RADIUS + 0.01;
               if (Math.abs(dx / wallSize.x) > Math.abs(dz / wallSize.z)) {
                   this.camera.position.x = wallCenter.x + (dx > 0 ? safeX : -safeX);
               } else {
                   this.camera.position.z = wallCenter.z + (dz > 0 ? safeZ : -safeZ);
               }
          }
      }
      for(const obs of this.obstacles) {
          if (obs.intersectsBox(playerBox)) {
               const obsCenter = new THREE.Vector3(); obs.getCenter(obsCenter);
               const obsSize = new THREE.Vector3(); obs.getSize(obsSize);
               const dx = this.camera.position.x - obsCenter.x;
               const dz = this.camera.position.z - obsCenter.z;
               const safeX = obsSize.x/2 + PLAYER_RADIUS + 0.01;
               const safeZ = obsSize.z/2 + PLAYER_RADIUS + 0.01;
               if (Math.abs(dx / obsSize.x) > Math.abs(dz / obsSize.z)) {
                   this.camera.position.x = obsCenter.x + (dx > 0 ? safeX : -safeX);
               } else {
                   // FIX: Cannot find name 'wallCenter'.
                   this.camera.position.z = obsCenter.z + (dz > 0 ? safeZ : -safeZ);
               }
          }
      }

      this.camera.position.x = Math.max(-98, Math.min(98, this.camera.position.x));
      this.camera.position.z = Math.max(-98, Math.min(98, this.camera.position.z));
      
      this.flashlight.handleMovementSway(this.velocity.x, this.velocity.z);
  }

  private checkInteraction() {
      this.hoveredTarget = '';
      if (this.phase !== GamePhase.DAY) {
          if (this.isHoveringTerminal) {
              this.isHoveringTerminal = false;
              this.onHover(false, "");
          }
          if (this.isGeneratorDisabled) {
              const dist = this.camera.position.distanceTo(new THREE.Vector3(-1.2, 0.5, -1.2));
              if (dist < 3) this.hoveredTarget = 'generator';
          }
          return;
      }

      this.raycaster.setFromCamera(new THREE.Vector2(0,0), this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      
      for(const hit of intersects) {
          if (hit.distance > 3) break;
          let obj = hit.object;
          while(obj) {
              if (obj.name === 'terminal' || obj === this.monitorMesh) {
                  this.hoveredTarget = 'terminal';
                  break;
              }
              if (obj.name === 'fan') {
                  this.hoveredTarget = 'fan';
                  break;
              }
              if (obj.name === 'radio') {
                  this.hoveredTarget = 'radio';
                  break;
              }
              obj = obj.parent as THREE.Object3D;
          }
          if (this.hoveredTarget) break;
      }
      
      if (this.hoveredTarget) {
          if (!this.isHoveringTerminal) {
              this.isHoveringTerminal = true;
              let text = "";
              if (this.hoveredTarget === 'terminal') text = "ТЕРМИНАЛ [E]";
              if (this.hoveredTarget === 'fan') text = "ВЕНТИЛЯТОР";
              if (this.hoveredTarget === 'radio') text = "РАДИО";
              this.onHover(true, text);
          }
      } else {
          if (this.isHoveringTerminal) {
              this.isHoveringTerminal = false;
              this.onHover(false, "");
          }
      }
  }

  private endNight() {
      this.phase = GamePhase.DAY;
      this.onPhaseChange(GamePhase.DAY);
      this.isUIOpen = false;
      this.enemies.forEach(e => {
          e.burnInSun();
      });
      this.turretTarget = null;
      
      this.sunLight.intensity = 0.5;
      this.hemiLight.intensity = 0.4;
      this.sunLight.color.setHex(0xffffff);
      this.fog.color.setHex(COLORS.SKY_DAY);
      this.fog.near = 10;
      this.fog.far = 80;
      this.scene.background = new THREE.Color(COLORS.SKY_DAY);
      
      if(this.bloomPass) {
          this.bloomPass.strength = 0.2;
          this.bloomPass.threshold = 0.85;
      }
      this.renderer.toneMappingExposure = 0.8;

      this.flashlight.turnOff();
      this.rainSystem.setVisible(false);
      this.soundManager.toggleRain(false);
      this.isBloodMoon = false;
      this.updateMonitor();
      this.requestLockImmediate();
  }

  private triggerDeath() {
      if (this.isDeathSequence || this.phase === GamePhase.GAME_OVER) return;
      this.addTrauma(1.0); 
      this.isDeathSequence = true;
      this.flashlight.turnOff();
      this.soundManager.playScreamer();
      this.onDeathSequenceStart();
  }

  private updateMonitor() {
      const ctx = this.monitorContext;
      const width = this.monitorCanvas.width;
      const height = this.monitorCanvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      if (this.phase === GamePhase.DAY) {
          ctx.fillStyle = "#001100";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#33ff33";
          ctx.textAlign = "center";
          ctx.font = "bold 40px Courier New";
          ctx.fillText("SYSTEM READY", width/2, height/2 - 20);
          ctx.font = "20px Courier New";
          ctx.fillText("TERMINAL ACTIVE", width/2, height/2 + 20);
          ctx.strokeStyle = "#33ff33";
          ctx.strokeRect(20, 20, width-40, height-40);
      } else {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = '#33ff33';
          ctx.font = '14px monospace';
          for (let i = 0; i < this.matrixDrops.length; i++) {
              const char = this.matrixChars[Math.floor(Math.random() * this.matrixChars.length)];
              ctx.fillText(char, i * 14, this.matrixDrops[i] * 14);
              if (this.matrixDrops[i] * 14 > height && Math.random() > 0.975) {
                  this.matrixDrops[i] = 0;
              }
              this.matrixDrops[i]++;
          }
      }
      this.monitorTexture.needsUpdate = true;
  }

  public resetGame() {
      this.wave = 0;
      this.credits = 0;
      this.totalKills = 0;
      this.killsByType = {};
      this.generatorHp = GAME_CONFIG.GENERATOR_MAX_HEALTH;
      this.maxGeneratorHp = GAME_CONFIG.GENERATOR_MAX_HEALTH;
      this.flashlight.setBattery(GAME_CONFIG.MAX_BATTERY);
      this.flashlight.turnOff();
      this.isGeneratorDisabled = false;
      this.hasAutoRepair = false;
      this.damageMultiplier = 1.0;
      this.batteryMultiplier = 1.0;
      this.flaresCount = 0;
      this.stamina = 100;
      this.activeFlares.forEach(f => this.scene.remove(f.mesh));
      this.activeFlares = [];
      this.turretAmmo = 200;
      this.isBloodMoon = false;
      this.enemies.forEach(e => this.scene.remove(e.mesh));
      this.enemies = [];
      this.camera.position.set(0, 1.6, 0);
      this.camera.rotation.set(0, 0, 0);
      this.euler.set(0, 0, 0, 'YXZ');
      this.isDeathSequence = false;
      this.isUIOpen = false;
  }

  public restoreState(data: SaveData) {
      this.wave = data.wave;
      this.credits = data.credits;
      this.totalKills = data.totalKills;
      this.killsByType = data.killsByType || {};
      this.generatorHp = data.generatorHp;
      this.flashlight.setBattery(data.battery); 
      this.flaresCount = data.flares || 0;
      this.phase = GamePhase.DAY; 
      
      this.isUIOpen = false;
      this.isTransitioning = false;
      this.isDeathSequence = false;
      this.isGeneratorDisabled = false;

      data.upgrades.forEach(up => {
          for(let i=0; i < up.level - 1; i++) {
             this.upgradeSystem(up.id);
          }
      });
      
      this.endNight(); 
      this.camera.position.set(0, 1.6, 0);
      this.camera.rotation.set(0, 0, 0);
      this.euler.set(0, 0, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this.euler);
      this.onPhaseChange(GamePhase.DAY);
      this.requestLockImmediate();
  }

  private createCobwebs() {
      const tex = TextureUtils.createCobwebTexture();
      const mat = new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          alphaMap: tex,
          side: THREE.DoubleSide,
          opacity: 0.6,
          depthWrite: false,
          blending: THREE.AdditiveBlending
      });
      const createWeb = (x: number, y: number, z: number, rx: number, ry: number) => {
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat);
          plane.position.set(x, y, z);
          plane.rotation.set(rx, ry, 0);
          this.scene.add(plane);
      };
      createWeb(1.9, 2.8, 1.9, 0, -Math.PI / 4);
      createWeb(-1.9, 2.8, 1.9, 0, Math.PI / 4);
      createWeb(1.9, 2.8, -1.9, 0, -Math.PI * 0.75);
  }

  private createPhysicsProps() {
      const deskShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.05, 0.9)); 
      const deskBody = new CANNON.Body({ mass: 0 }); 
      deskBody.addShape(deskShape);
      deskBody.position.set(1.4, 1.0, 0.5); 
      this.world.addBody(deskBody);

      const floorShape = new CANNON.Plane();
      const floorBody = new CANNON.Body({ mass: 0 });
      floorBody.addShape(floorShape);
      floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      floorBody.position.set(0, 0.1, 0);
      this.world.addBody(floorBody);

      const createProp = (type: 'box'|'cylinder', size: any, pos: THREE.Vector3, color: number, mass: number) => {
          let mesh: THREE.Mesh;
          let shape: CANNON.Shape;
          
          if (type === 'box') {
              mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial({color, roughness: 0.5}));
              shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
          } else {
              mesh = new THREE.Mesh(new THREE.CylinderGeometry(size.r, size.r, size.h), new THREE.MeshStandardMaterial({color, roughness: 0.2, metalness: 0.8}));
              shape = new CANNON.Cylinder(size.r, size.r, size.h, 8);
          }
          mesh.castShadow = true;
          this.scene.add(mesh);
          
          const body = new CANNON.Body({ mass: mass });
          body.addShape(shape);
          body.position.set(pos.x, pos.y, pos.z);
          body.quaternion.setFromEuler(0, Math.random()*Math.PI, 0);
          body.addEventListener('collide', (e: any) => {
              const relV = e.contact.getImpactVelocityAlongNormal();
              if (Math.abs(relV) > 0.5) this.soundManager.playClick(); 
          });
          this.world.addBody(body);
          this.physicsObjects.push({ mesh, body });
      };

      createProp('cylinder', {r: 0.04, h: 0.12}, new THREE.Vector3(1.3, 1.2, 0.2), 0xff0000, 0.2); 
      createProp('box', {x: 0.15, y: 0.2, z: 0.08}, new THREE.Vector3(1.2, 1.2, 0.7), 0x333333, 0.8);
      
      const mugGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.1);
      const mugMesh = new THREE.Mesh(mugGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      mugMesh.castShadow = true;
      this.scene.add(mugMesh);
      const mugBody = new CANNON.Body({ mass: 0.5 });
      mugBody.addShape(new CANNON.Cylinder(0.05, 0.04, 0.1, 8));
      const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
      mugBody.quaternion = q;
      mugBody.position.set(1.5, 1.2, -0.2);
      this.world.addBody(mugBody);
      this.physicsObjects.push({mesh: mugMesh, body: mugBody});
  }

  // UPDATED: More detailed environments
  private createEnvironment() {
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundTexCanvas = TextureUtils.createNoiseCanvas(512, 512, 'concrete');
    const groundNormal = TextureUtils.generateNormalMap(groundTexCanvas);
    const groundTex = new THREE.CanvasTexture(groundTexCanvas);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    
    const groundMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x111111, 
        roughness: 0.2,
        metalness: 0.1,
        normalMap: groundNormal,
        map: groundTex
    });
    
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    const woodDiffuse = TextureUtils.createNoiseCanvas(256, 256, 'wood');
    const woodNormal = TextureUtils.generateNormalMap(woodDiffuse);
    const woodMat = new THREE.MeshStandardMaterial({ 
        color: 0x5c4d3f, 
        roughness: 0.8, 
        normalMap: woodNormal, 
        map: new THREE.CanvasTexture(woodDiffuse) 
    });
    woodMat.map!.colorSpace = THREE.SRGBColorSpace;
    
    const metalDiffuse = TextureUtils.createNoiseCanvas(256, 256, 'metal');
    const metalNormal = TextureUtils.generateNormalMap(metalDiffuse);
    const metalMat = new THREE.MeshStandardMaterial({ 
        color: 0x777777, 
        roughness: 0.4, 
        metalness: 0.8, 
        normalMap: metalNormal, 
        map: new THREE.CanvasTexture(metalDiffuse) 
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.2, transmission: 0.9, thickness: 0.1, transparent: true, opacity: 0.3
    });
    
    const boothGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), metalMat);
    floor.position.y = 0.1;
    floor.receiveShadow = true;
    boothGroup.add(floor);

    // Pillars
    const pillarGeo = new THREE.BoxGeometry(0.2, 3.2, 0.2);
    [[-1.9, 1.9], [1.9, 1.9], [-1.9, -1.9], [1.9, -1.9]].forEach(pos => {
        const p = new THREE.Mesh(pillarGeo, metalMat);
        p.position.set(pos[0], 1.6, pos[1]);
        p.castShadow = true;
        boothGroup.add(p);
        this.obstacles.push(new THREE.Box3().setFromObject(p));
    });

    // Low Walls
    const wallLowGeo = new THREE.BoxGeometry(4, 1.2, 0.1);
    const backWallLow = new THREE.Mesh(wallLowGeo, woodMat);
    backWallLow.position.set(0, 0.7, 1.95);
    backWallLow.castShadow = true;
    boothGroup.add(backWallLow);
    this.walls.push(new THREE.Box3(new THREE.Vector3(-2.1, 0, 1.8), new THREE.Vector3(2.1, 1.3, 2.2)));

    const leftWallLow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 4), woodMat);
    leftWallLow.position.set(-1.95, 0.7, 0);
    leftWallLow.receiveShadow = true;
    boothGroup.add(leftWallLow);
    this.walls.push(new THREE.Box3(new THREE.Vector3(-2.2, 0, -2.1), new THREE.Vector3(-1.8, 1.3, 2.1)));

    const rightWallLow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 4), woodMat);
    rightWallLow.position.set(1.95, 0.7, 0);
    rightWallLow.receiveShadow = true;
    boothGroup.add(rightWallLow);
    this.walls.push(new THREE.Box3(new THREE.Vector3(1.8, 0, -2.1), new THREE.Vector3(2.2, 1.3, 2.1)));

    // Windows
    const windowFrameH = new THREE.BoxGeometry(4, 0.1, 0.15);
    const glassPaneLR = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.6), glassMat);
    const glassPaneBack = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.6), glassMat);

    const midBeamBack = new THREE.Mesh(windowFrameH, metalMat);
    midBeamBack.position.set(0, 1.3, 1.95); boothGroup.add(midBeamBack);
    const topBeamBack = new THREE.Mesh(windowFrameH, metalMat);
    topBeamBack.position.set(0, 3.1, 1.95); boothGroup.add(topBeamBack);
    glassPaneBack.position.set(0, 2.2, 1.95);
    glassPaneBack.rotation.y = Math.PI; 
    boothGroup.add(glassPaneBack);
    this.walls.push(new THREE.Box3(new THREE.Vector3(-2.1, 1.3, 1.8), new THREE.Vector3(2.1, 3.2, 2.2)));

    const midBeamSide = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 4), metalMat);
    const topBeamSide = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 4), metalMat);
    const mbLeft = midBeamSide.clone(); mbLeft.position.set(-1.95, 1.3, 0); boothGroup.add(mbLeft);
    const tbLeft = topBeamSide.clone(); tbLeft.position.set(-1.95, 3.1, 0); boothGroup.add(tbLeft);
    const glLeft = glassPaneLR.clone(); glLeft.rotation.y = Math.PI / 2; glLeft.position.set(-1.95, 2.2, 0); boothGroup.add(glLeft);
    this.walls.push(new THREE.Box3(new THREE.Vector3(-2.2, 1.3, -2.1), new THREE.Vector3(-1.8, 3.2, 2.1)));

    const mbRight = midBeamSide.clone(); mbRight.position.set(1.95, 1.3, 0); boothGroup.add(mbRight);
    const tbRight = topBeamSide.clone(); tbRight.position.set(1.95, 3.1, 0); boothGroup.add(tbRight);
    const glRight = glassPaneLR.clone(); glRight.rotation.y = -Math.PI / 2; glRight.position.set(1.95, 2.2, 0); boothGroup.add(glRight);
    this.walls.push(new THREE.Box3(new THREE.Vector3(1.8, 1.3, -2.1), new THREE.Vector3(2.2, 3.2, 2.1)));

    // Roof
    const roofGeo = new THREE.BoxGeometry(4.4, 0.2, 4.4);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
    roof.position.set(0, 3.3, 0);
    roof.rotation.x = 0.05; 
    roof.castShadow = true;
    boothGroup.add(roof);

    const doorFrameV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), metalMat);
    doorFrameV.position.set(-1.0, 1.5, -1.95); boothGroup.add(doorFrameV);
    const doorFrameV2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), metalMat);
    doorFrameV2.position.set(1.0, 1.5, -1.95); boothGroup.add(doorFrameV2);
    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.2), metalMat);
    doorHeader.position.set(0, 2.9, -1.95); boothGroup.add(doorHeader);

    const frontPanelL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3, 0.1), woodMat);
    frontPanelL.position.set(-1.5, 1.5, -1.95); boothGroup.add(frontPanelL);
    this.walls.push(new THREE.Box3(new THREE.Vector3(-2.0, 0, -2.1), new THREE.Vector3(-1.0, 3, -1.8)));

    const frontPanelR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3, 0.1), woodMat);
    frontPanelR.position.set(1.5, 1.5, -1.95); boothGroup.add(frontPanelR);
    this.walls.push(new THREE.Box3(new THREE.Vector3(1.0, 0, -2.1), new THREE.Vector3(2.0, 3, -1.8)));

    // --- MODERN GASOLINE GENERATOR ---
    this.generatorGroup = new THREE.Group();
    this.generatorGroup.position.set(-1.2, 0.2, -1.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0055ff, roughness: 0.3, metalness: 0.8 });
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.8 });
    
    // Tubular Frame
    const tubeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);
    const hTube = new THREE.Mesh(tubeGeo, frameMat);
    hTube.scale.set(1, 0.8, 1);
    hTube.rotation.z = Math.PI / 2;
    hTube.position.set(0, 0.6, 0);
    this.generatorGroup.add(hTube);
    
    const hTube2 = hTube.clone(); hTube2.position.y = 0; this.generatorGroup.add(hTube2);
    const vTube = new THREE.Mesh(tubeGeo, frameMat);
    vTube.scale.set(1, 0.6, 1);
    vTube.position.set(-0.4, 0.3, 0);
    this.generatorGroup.add(vTube);
    const vTube2 = vTube.clone(); vTube2.position.x = 0.4; this.generatorGroup.add(vTube2);
    
    // Engine Block
    this.engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), engineMat);
    this.engineBlock.position.set(0, 0.25, 0);
    this.generatorGroup.add(this.engineBlock);

    // Pull-cord starter
    const starter = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), engineMat);
    starter.position.set(-0.27, 0, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.015, 3, 4), new THREE.MeshStandardMaterial({color:0x111}));
    handle.rotation.y = Math.PI/2;
    handle.position.set(-0.04, 0, 0);
    starter.add(handle);
    this.engineBlock.add(starter);

    // Fuel Tank
    const tankGeo = new THREE.BoxGeometry(0.5, 0.15, 0.3);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, roughness: 0.3, metalness: 0.5 });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0, 0.55, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), new THREE.MeshStandardMaterial({color: 0x111}));
    cap.position.y = 0.095;
    tank.add(cap);
    this.generatorGroup.add(tank);

    // Muffler
    const muffler = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.15), metalMat);
    muffler.position.set(0, 0.1, 0.25);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.17), new THREE.MeshStandardMaterial({color:0x555, wireframe: true}));
    muffler.add(guard);
    this.engineBlock.add(muffler);

    boothGroup.add(this.generatorGroup);
    
    this.soundManager.setupGeneratorSound(this.generatorGroup);
    this.obstacles.push(new THREE.Box3(new THREE.Vector3(-1.8, 0, -1.8), new THREE.Vector3(-0.6, 2, -0.6)));
    
    // Desk
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.8), woodMat); 
    desk.position.set(1.4, 1.0, 0.5);
    desk.castShadow = true;
    boothGroup.add(desk);
    this.obstacles.push(new THREE.Box3(new THREE.Vector3(0.9, 0, -0.4), new THREE.Vector3(1.9, 1.2, 1.4)));
    
    // Monitor
    const screenGeo = new THREE.BoxGeometry(0.1, 0.4, 0.6);
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const monitorBase = new THREE.Mesh(screenGeo, screenMat);
    monitorBase.position.set(1.4, 1.25, 0.5);
    boothGroup.add(monitorBase);
    const monitorScreenGeo = new THREE.PlaneGeometry(0.35, 0.55);
    const monitorScreenMat = new THREE.MeshStandardMaterial({ 
        map: this.monitorTexture,
        roughness: 0.1,   
        metalness: 0.9,   
        emissive: 0xffffff,
        emissiveIntensity: 0.2, 
        emissiveMap: this.monitorTexture
    });
    this.monitorMesh = new THREE.Mesh(monitorScreenGeo, monitorScreenMat);
    this.monitorMesh.position.set(1.34, 1.25, 0.5);
    this.monitorMesh.rotation.y = -Math.PI / 2;
    this.monitorMesh.rotation.z = -Math.PI / 2;
    boothGroup.add(this.monitorMesh);

    // Fan
    this.fanMesh = new THREE.Group();
    const fanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05), metalMat);
    this.fanMesh.add(fanBase);
    const fanStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), metalMat);
    fanStem.position.y = 0.1;
    this.fanMesh.add(fanStem);
    const bladeGroup = new THREE.Group();
    bladeGroup.position.set(0, 0.2, 0.05);
    const bladeGeo = new THREE.BoxGeometry(0.05, 0.4, 0.01);
    const blade1 = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({color: 0x222222}));
    const blade2 = blade1.clone(); blade2.rotation.z = Math.PI / 2;
    bladeGroup.add(blade1, blade2);
    this.fanMesh.add(bladeGroup);
    this.fanMesh.userData.blades = bladeGroup;
    this.fanMesh.position.set(1.5, 1.05, 1.0);
    this.fanMesh.rotation.y = -Math.PI / 4;
    this.fanMesh.name = "fan";
    boothGroup.add(this.fanMesh);
    
    this.fanAudio = this.soundManager.setupInteractableSound(this.fanMesh, 'fan');
    if (this.fanAudio) this.fanAudio.setVolume(this.isFanOn ? 0.2 : 0);

    // Radio
    this.radioMesh = new THREE.Group();
    const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.1), new THREE.MeshStandardMaterial({color: 0x110000}));
    this.radioMesh.add(radioBox);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.4), metalMat);
    antenna.position.set(0.12, 0.2, -0.04);
    this.radioMesh.add(antenna);
    this.radioMesh.position.set(1.5, 1.08, -0.1);
    this.radioMesh.rotation.y = Math.PI / 6;
    this.radioMesh.name = "radio";
    boothGroup.add(this.radioMesh);
    this.radioAudio = this.soundManager.setupInteractableSound(this.radioMesh, 'radio');

    this.scene.add(boothGroup);
    this.createForest();
    this.createUndergrowth();
  }

  private createForest() {
      const treeCount = 400;
      
      const woodTexCanvas = TextureUtils.createNoiseCanvas(256, 256, 'wood');
      const woodTex = new THREE.CanvasTexture(woodTexCanvas);
      woodTex.colorSpace = THREE.SRGBColorSpace;
      
      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 4, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, map: woodTex });
      
      const leavesGeo = new THREE.ConeGeometry(2, 6, 8);
      const leavesMat = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, roughness: 0.8 });

      const instancedTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
      const instancedLeaves = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount * 3);
      
      instancedTrunk.castShadow = true;
      instancedLeaves.castShadow = true;
      instancedTrunk.receiveShadow = true;
      instancedLeaves.receiveShadow = true;

      const dummy = new THREE.Object3D();

      let leafIdx = 0;
      for (let i = 0; i < treeCount; i++) {
          const r = 20 + Math.random() * 80;
          const theta = Math.random() * Math.PI * 2;
          
          const x = Math.cos(theta) * r;
          const z = Math.sin(theta) * r;

          dummy.position.set(x, 2, z);
          const s = 0.8 + Math.random() * 0.5;
          dummy.scale.set(s, s, s);
          dummy.rotation.set((Math.random()-0.5)*0.1, Math.random()*Math.PI*2, (Math.random()-0.5)*0.1);
          dummy.updateMatrix();
          instancedTrunk.setMatrixAt(i, dummy.matrix);
          
          if (r < 40) {
             const box = new THREE.Box3();
             box.setFromCenterAndSize(new THREE.Vector3(x, 0, z), new THREE.Vector3(1, 10, 1));
             this.obstacles.push(box);
          }

          for(let j=0; j<3; j++) {
              dummy.position.set(x, (3 + j*2) * s, z);
              const ls = s * (2.5 - j*0.5);
              dummy.scale.set(ls, s * 1.5, ls);
              dummy.updateMatrix();
              instancedLeaves.setMatrixAt(leafIdx++, dummy.matrix);
          }
      }
      
      this.scene.add(instancedTrunk);
      this.scene.add(instancedLeaves);
  }

  private createUndergrowth() {
      const grassCount = 8000;
      const geo = new THREE.PlaneGeometry(0.2, 1.0);
      geo.translate(0, 0.5, 0); // Pivot at base
      const grassTex = TextureUtils.createGrassBladeTexture();
      
      const mat = new THREE.MeshStandardMaterial({
          map: grassTex,
          alphaMap: grassTex,
          transparent: true,
          side: THREE.DoubleSide,
          alphaTest: 0.1,
          depthWrite: false,
          vertexColors: true
      });
      mat.onBeforeCompile = (shader) => {
          injectWindShader(shader, this.windUniforms);
      };

      const mesh = new THREE.InstancedMesh(geo, mat, grassCount);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      
      for(let i=0; i < grassCount; i++) {
          const r = 5 + Math.random() * 45;
          const theta = Math.random() * Math.PI * 2;
          dummy.position.set(Math.cos(theta)*r, 0, Math.sin(theta)*r);
          dummy.rotation.y = Math.random() * Math.PI;
          dummy.rotation.x = (Math.random() - 0.5) * 0.2;
          dummy.scale.setScalar(0.5 + Math.random() * 0.8);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          
          color.setHex(0x112211).add(new THREE.Color(0x001100).multiplyScalar(Math.random()));
          mesh.setColorAt(i, color);
      }
      mesh.instanceColor!.needsUpdate = true;
      this.scene.add(mesh);
  }

  private createTurret() {
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 3.5, 0); 
      
      const baseGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.2);
      const mat = new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.5});
      const base = new THREE.Mesh(baseGeo, mat);
      this.turretGroup.add(base);

      this.turretHead = new THREE.Group();
      this.turretHead.position.y = 0.2;
      
      const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.5);
      const head = new THREE.Mesh(headGeo, mat);
      this.turretHead.add(head);

      const barrelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({color: 0x111111}));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.4;
      this.turretHead.add(barrel);
      
      this.turretGroup.add(this.turretHead);
      this.scene.add(this.turretGroup);
  }

  private animate() {
      if (!this.isRunning || this.isDisposed) return;
      this.animationId = requestAnimationFrame(() => this.animate());

      const delta = this.clock.getDelta();
      const now = this.clock.getElapsedTime();
      
      this.windUniforms.time.value = now;

      if (this.phase !== GamePhase.DAY && Date.now() - this.monitorUpdateTimer > 50) {
        this.monitorUpdateTimer = Date.now();
        this.updateMonitor();
      }

      this.world.step(1/60, delta, 3);
      
      if (this.trauma > 0) {
          this.trauma = Math.max(0, this.trauma - delta * 0.5);
          const shake = this.trauma * this.trauma;
          const shakeX = (Math.random() - 0.5) * shake * 0.1;
          const shakeY = (Math.random() - 0.5) * shake * 0.1;
          const shakeZ = (Math.random() - 0.5) * shake * 0.1;
          
          const shookEuler = this.euler.clone();
          shookEuler.x += shakeX;
          shookEuler.y += shakeY;
          shookEuler.z += shakeZ;
          this.camera.quaternion.setFromEuler(shookEuler);
      } else {
          this.camera.quaternion.setFromEuler(this.euler);
      }

      const breathIntensity = (100 - this.stamina) / 100.0;
      this.soundManager.updateBreathing(breathIntensity);

      this.updateMovement(delta);

      if (this.phase === GamePhase.NIGHT) {
          const windX = Math.sin(now * 0.5) * 0.5;
          const windZ = Math.cos(now * 0.3) * 0.5;
          
          this.rainSystem.update(delta, this.camera.position, windX, windZ);
          this.sporeSystem.update(delta);
          
          this.lightningTimer -= delta;
          if (this.lightningTimer <= 0) {
             if (Math.random() > 0.99) {
                 this.sunLight.intensity = 20;
                 this.fog.color.setHex(COLORS.LIGHTNING);
                 this.scene.background = new THREE.Color(COLORS.LIGHTNING);
                 this.lightningDuration = 0.1 + Math.random() * 0.2;
                 this.lightningTimer = 5 + Math.random() * 15;
                 this.soundManager.playThunder();
             }
          }
          if (this.lightningDuration > 0) {
              this.lightningDuration -= delta;
              if (this.lightningDuration <= 0) {
                  this.sunLight.intensity = 0.15;
                  this.fog.color.setHex(this.isBloodMoon ? COLORS.BLOOD_MOON : COLORS.FOG);
                  this.scene.background = new THREE.Color(this.isBloodMoon ? COLORS.BLOOD_MOON : COLORS.SKY_NIGHT);
              }
          }
      }

      this.checkInteraction();
      
      if (this.isHoldingRestart && this.isGeneratorDisabled) {
         const dist = this.camera.position.distanceTo(new THREE.Vector3(-1.2, 0.5, -1.2));
         if (dist < 3) {
            this.restartProgress += delta * 0.3;
            if (this.restartProgress >= 1) {
                this.isGeneratorDisabled = false;
                this.generatorHp = 50;
                this.restartProgress = 0;
                this.flashlight.turnOn();
                this.soundManager.playClick();
            }
         } else {
             this.restartProgress = 0;
         }
      } else {
         this.restartProgress = 0;
      }
      
      const isRefilling = (Math.abs(this.camera.position.x) < 2 && Math.abs(this.camera.position.z) < 2 && this.phase === GamePhase.NIGHT);
      this.flashlight.update(delta, isRefilling && !this.isGeneratorDisabled);

      const playerPos = this.camera.position;
      const lightDir = new THREE.Vector3();
      this.camera.getWorldDirection(lightDir);
      
      this.raycaster.camera = this.camera;

      for (let i = this.enemies.length - 1; i >= 0; i--) {
          const enemy = this.enemies[i];
          if (enemy.isDead) {
              if (enemy.isFullyDissolved) {
                 this.scene.remove(enemy.mesh);
                 this.enemies.splice(i, 1);
                 if (this.phase === GamePhase.NIGHT) {
                     this.credits += 15;
                     this.totalKills++;
                     this.killsByType[enemy.type] = (this.killsByType[enemy.type] || 0) + 1;
                 }
              } else {
                  enemy.update(delta, this.camera.position);
              }
              continue;
          }

          const attackResult = enemy.update(delta, this.camera.position);

          if (this.flashlight.isLightOn()) {
              const toEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, this.camera.position).normalize();
              const angle = toEnemy.angleTo(lightDir);
              
              if (angle < this.flashlight.getEffectiveAngle() && enemy.mesh.position.distanceTo(this.camera.position) < 20) {
                  this.raycaster.set(playerPos, toEnemy);
                  const hits = this.raycaster.intersectObjects(this.scene.children, true);
                  let obstructed = false;
                  for(const hit of hits) {
                       if (hit.distance < enemy.mesh.position.distanceTo(playerPos) && hit.object !== enemy.mesh && !hit.object.name.includes('particle')) {
                           if (hit.object.name !== 'volumetric' && !enemy.mesh.getObjectById(hit.object.id)) {
                               obstructed = true; 
                               break;
                           }
                       }
                  }

                  if (!obstructed) {
                      let dmg = (50 / (enemy.mesh.position.distanceTo(playerPos) + 1)) * delta * this.damageMultiplier;
                      if(this.flashlight.isOvercharging()) {
                          dmg *= 20; // Massive damage burst
                          enemy.stun(2.0); // Stun for 2 seconds
                      }
                      if (enemy.type === EnemyType.FAST) dmg *= 2.0; 
                      if (enemy.type === EnemyType.TANK) dmg *= 0.5; 
                      enemy.takeDamage(dmg, enemy.mesh.position, new THREE.Vector3(0,1,0), this.burnTexture);
                  }
              }
          }

          if (enemy.mesh.position.distanceTo(this.camera.position) < 1.5) {
               this.soundManager.playScreamer(); 
               this.triggerDeath();
          }
          
          if (enemy.mesh.position.distanceTo(new THREE.Vector3(0,0,0)) < 3.0) {
              if (this.generatorHp > 0) {
                  this.generatorHp -= 5 * delta;
                  this.addTrauma(0.2 * delta);
                  if (this.generatorHp <= 0) {
                      this.isGeneratorDisabled = true;
                      this.generatorHp = 0;
                      this.flashlight.turnOff();
                      this.soundManager.playScreamer();
                  }
              }
          }
      }
      
      if (this.turretGroup && this.turretHead && !this.isGeneratorDisabled) {
           if (!this.turretTarget || this.turretTarget.isDead) {
               let closeDist = 40;
               this.turretTarget = null;
               for(const e of this.enemies) {
                   if (e.isDead) continue;
                   const d = e.mesh.position.distanceTo(this.turretGroup.position);
                   if (d < closeDist) {
                       closeDist = d;
                       this.turretTarget = e;
                   }
               }
           }
           
           if (this.turretTarget) {
               this.turretHead.lookAt(this.turretTarget.mesh.position);
               if (this.turretCooldown <= 0 && this.turretAmmo > 0) {
                   this.turretCooldown = 0.1;
                   this.turretAmmo--;
                   this.turretTarget.takeDamage(25);
                   this.sparkSystem.emit(this.turretTarget.mesh.position, 2);
                   this.addTrauma(0.05);
               }
           }
           if (this.turretCooldown > 0) this.turretCooldown -= delta;
      }
      
      this.activeFlares.forEach((f, i) => {
          f.update(delta, this.scene);
          if (f.life <= 0) this.activeFlares.splice(i, 1);
      });

      this.sparkSystem.update(delta);
      this.composer.render();
      
      this.onStatsUpdate(
          this.flashlight.getBattery(), this.generatorHp, this.wave, this.credits, 
          this.isGeneratorDisabled, this.restartProgress, this.totalKills, 
          this.killsByType, this.turretAmmo, this.stamina,
          this.flashlight.getOverchargeCooldown()
      );
      
      if (this.phase === GamePhase.NIGHT && this.enemies.length === 0 && this.wave > 0) {
          this.endNight();
      }
  }
  
  public dispose() {
      this.isDisposed = true;
      cancelAnimationFrame(this.animationId);
      window.removeEventListener('resize', this.boundResize);
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.domElement.removeEventListener('click', this.boundClick);
      this.domElement.removeEventListener('contextmenu', this.boundRightClick);
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
      document.removeEventListener('pointerlockerror', this.boundPointerLockError);
      this.renderer.dispose();
      if (this.soundManager.getListener().context) {
        this.soundManager.getListener().context.close();
      }
  }
}
