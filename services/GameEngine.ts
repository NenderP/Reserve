
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
import { Enemy, NormalEnemy, FastEnemy, TankEnemy, GlitcherEnemy, DrainerEnemy, PhantomEnemy, ShriekerBoss, ForestHeartBoss, SpitterEnemy, LeviathanBoss } from './EnemySystem';
import { SoundManager } from './SoundManager';
import { COLORS, GAME_CONFIG } from '../constants';
import { GamePhase, EnemyType, SaveData, FlashlightMode } from '../types';
import { HorrorColorGradeShader, injectWindShader, ChromaticAberrationShader } from './Shaders';
import gsap from 'gsap';

// --- Weather Systems ---

class RainSystem {
    private particles: THREE.Points;
    private count: number = 400; // optimized further from 800 per user request

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
    private count = 1500; // Increased for better effect

    constructor(scene: THREE.Scene) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.count * 3);
        for(let i=0; i<this.count; i++) {
            positions[i*3] = (Math.random()-0.5) * 100;
            positions[i*3+1] = Math.random() * 10;
            positions[i*3+2] = (Math.random()-0.5) * 100;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Create a soft circle texture for spores
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(150, 255, 150, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);

        const mat = new THREE.PointsMaterial({
            color: 0x88ff88,
            size: 0.25,
            map: texture,
            transparent: true,
            opacity: 0.6,
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
        this.light.castShadow = false; // Turn off shadows for flares to save massive performance
        this.mesh.add(this.light);

        const pCount = 20; // Reduced particles
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

class LootDrop {
    public mesh: THREE.Group;
    public type: 'battery' | 'health' | 'credits';
    public value: number;
    public life: number = 30; // 30 seconds to pick up

    constructor(pos: THREE.Vector3, type: 'battery' | 'health' | 'credits', value: number) {
        this.type = type;
        this.value = value;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(pos);
        this.mesh.position.y = 0.5;

        const geo = new THREE.OctahedronGeometry(0.2, 0);
        let color = 0x00ff00;
        if (type === 'battery') color = 0x00ffff;
        if (type === 'health') color = 0xff0000;
        if (type === 'credits') color = 0xffff00;

        const mat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8
        });
        const crystal = new THREE.Mesh(geo, mat);
        this.mesh.add(crystal);
        
        // Removed PointLight to save performance. Emissive material on crystal is enough.
    }

    public update(delta: number) {
        this.life -= delta;
        this.mesh.rotation.y += delta * 2;
        this.mesh.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.1;
    }
}

class Mine {
    public mesh: THREE.Group;
    public isTriggered: boolean = false;
    public isArmed: boolean = false;
    public radius: number = 4.0;
    public damage: number = 500;
    private light: THREE.PointLight;
    private beepTimer: number = 0;
    private armTimer: number = 2.0;

    constructor(pos: THREE.Vector3) {
        this.mesh = new THREE.Group();
        this.mesh.position.copy(pos);
        this.mesh.position.y = 0.05; // Slightly above ground

        const baseGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        this.mesh.add(base);

        const buttonGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 16);
        const buttonMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0x550000 });
        const button = new THREE.Mesh(buttonGeo, buttonMat);
        this.mesh.add(button);

        this.light = new THREE.PointLight(0xff0000, 0, 2);
        this.light.position.y = 0.2;
        this.mesh.add(this.light);
    }

    public update(delta: number) {
        if (this.isTriggered) return;
        
        if (!this.isArmed) {
            this.armTimer -= delta;
            if (this.armTimer <= 0) {
                this.isArmed = true;
            }
            // Fast beeping while arming
            this.beepTimer += delta;
            if (this.beepTimer > 0.2) {
                this.beepTimer = 0;
                this.light.intensity = 2;
                this.light.color.setHex(0xffff00); // Yellow while arming
            } else if (this.beepTimer > 0.1) {
                this.light.intensity = 0;
            }
            return;
        }

        this.beepTimer += delta;
        if (this.beepTimer > 1.0) {
            this.beepTimer = 0;
            this.light.intensity = 2;
            this.light.color.setHex(0xff0000); // Red when armed
        } else if (this.beepTimer > 0.1) {
            this.light.intensity = 0;
        }
    }
}

// --- Procedural Texture Utils ---
export class TextureUtils {
    static createNoiseCanvas(width: number, height: number, type: 'wood' | 'concrete' | 'monitor' | 'metal' | 'grass' | 'flesh' | 'leaf' | 'plastic' | 'ceramic' | 'rust' | 'dirty-concrete'): HTMLCanvasElement {
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
            } else if (type === 'rust') {
                val = Math.random() * 60 + 40;
            } else if (type === 'dirty-concrete') {
                val = Math.random() * 80 + 30;
            } else if (type === 'monitor') {
                 val = 0; 
            } else if (type === 'grass' || type === 'leaf') {
                 val = Math.random() * 60 + 40;
            } else if (type === 'flesh') {
                 val = Math.random() * 40 + 60;
            } else if (type === 'plastic' || type === 'ceramic') {
                 val = Math.random() * 20 + 200;
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
        } else if (type === 'rust') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(0,0,width,height);
            for(let i=0; i<30; i++) {
                ctx.fillStyle = `rgba(165, 42, 42, ${Math.random() * 0.4})`;
                ctx.beginPath();
                ctx.arc(Math.random()*width, Math.random()*height, Math.random()*20, 0, Math.PI*2);
                ctx.fill();
            }
        } else if (type === 'dirty-concrete') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#333333';
            ctx.fillRect(0,0,width,height);
            for(let i=0; i<40; i++) {
                ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
                ctx.beginPath();
                ctx.arc(Math.random()*width, Math.random()*height, Math.random()*40, 0, Math.PI*2);
                ctx.fill();
            }
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
        } else if (type === 'grass' || type === 'leaf') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = type === 'grass' ? '#11cc11' : '#1e4c2d'; // Bright green variations for grass
            ctx.fillRect(0,0,width,height);
            
            // Add lighter and darker patches for organic look
            ctx.globalCompositeOperation = 'source-over';
            for(let i=0; i<150; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? `rgba(60, 200, 40, ${Math.random() * 0.15})` : `rgba(20, 100, 10, ${Math.random() * 0.15})`;
                ctx.beginPath();
                ctx.arc(Math.random()*width, Math.random()*height, Math.random()*30 + 5, 0, Math.PI*2);
                ctx.fill();
            }
        } else if (type === 'flesh') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#4a1111'; // Dark red/brown
            ctx.fillRect(0,0,width,height);
            // Add veins/splotches
            ctx.globalCompositeOperation = 'source-over';
            for(let i=0; i<50; i++) {
                ctx.fillStyle = `rgba(20, 0, 0, ${Math.random() * 0.2})`;
                ctx.beginPath();
                ctx.arc(Math.random()*width, Math.random()*height, Math.random()*15, 0, Math.PI*2);
                ctx.fill();
            }
        } else if (type === 'plastic') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#222222';
            ctx.fillRect(0,0,width,height);
        } else if (type === 'ceramic') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = '#dddddd';
            ctx.fillRect(0,0,width,height);
        }

        return canvas;
    }

    static createGrassBladeTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        
        // Clear background to transparent
        ctx.clearRect(0, 0, 64, 128);

        const grad = ctx.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#44aa44'); // Brighter green
        grad.addColorStop(0.5, '#228822'); 
        grad.addColorStop(1, '#054405');
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
        // Ensure alpha is used
        tex.premultiplyAlpha = false;
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
    private maxParticles = 50; // Reduced from 200
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

export class EnemyProjectile {
    public mesh: THREE.Mesh;
    public velocity: THREE.Vector3;
    public life: number = 5;
    public damage: number = 10;
    
    constructor(pos: THREE.Vector3, dir: THREE.Vector3) {
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshStandardMaterial({color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2})
        );
        this.mesh.position.copy(pos);
        this.velocity = dir.multiplyScalar(15); // Speed of projectile
    }
    
    update(delta: number) {
        this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
        this.life -= delta;
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
  private damageTexts: { sprite: THREE.Sprite, life: number, velocity: THREE.Vector3 }[] = [];
  public materials: Record<string, THREE.Material> = {};
  
  private world: CANNON.World;
  private physicsObjects: { mesh: THREE.Mesh, body: CANNON.Body }[] = [];
  private playerPhysicsBody: CANNON.Body;

  private onStatsUpdate: (bat: number, hp: number, wave: number, credits: number, genDisabled: boolean, restartProgress: number, totalKills: number, killsByType: Record<string, number>, ammo: number, stamina: number, overcharge: number, dash: number, hitMarker: number, isAimingEnemy: boolean, isBloodMoon: boolean, nearestDist: number | null, fMode: FlashlightMode, tText: string | null, rMsg: string | null) => void;
  private onPhaseChange: (phase: GamePhase) => void;
  private onInteract: (target: string) => void;
  private onHover: (isHovering: boolean, text: string) => void;
  private onDeathSequenceStart: () => void; 

  private generatorHp: number = 100;
  private maxGeneratorHp: number = 150;
  private wave: number = 0; 
  private isTutorial: boolean = false;
  private tutorialStep: number = 0;
  private tutorialTimer: number = 0;
  private tutorialText: string | null = null;
  private credits: number = 50; 
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
  private hitMarkerTrigger: number = 0;
  
  private isGeneratorDisabled: boolean = false;
  private restartProgress: number = 0;
  private isHoldingRestart: boolean = false;
  private hasAutoRepair: boolean = false;
  private sparkSystem: SparkSystem;
  private sparkTimer: number = 0;
  
  private turretGroup: THREE.Group | null = null;
  private turretHead: THREE.Object3D | null = null;
  private turretLevel: number = 0;
  private turretAmmo: number = 200;
  private turretCooldown: number = 0;
  private turretTarget: Enemy | null = null;
  
  private dashLevel: number = 0;
  private adrenalineLevel: number = 0;
  private dashCooldown: number = 0;
  private isDashing: boolean = false;
  private dashTimer: number = 0;
  private footstepTimer: number = 0;
  
  private rainSystem: RainSystem;
  private sporeSystem: SporeSystem;
  private activeFlares: Flare[] = [];
  public flaresCount: number = 0;
  private activeMines: Mine[] = [];
  public minesCount: number = 0;
  private activeLoot: LootDrop[] = [];
  private activeProjectiles: EnemyProjectile[] = [];
  private nearestEnemyDistance: number | null = null;
  private lightningTimer: number = 0;
  private lightningDuration: number = 0;
  private hallucinationTimer: number = 0;
  
  public currentRadioMessage: string | null = null;
  private radioMessageTimer: number = 0;
  private statsUpdateTimer: number = 0;
  
  public isBlackout: boolean = false;
  private blackoutTimer: number = 0;
  private blackoutDuration: number = 0;

  private teslaMesh: THREE.Group | null = null;
  private teslaLevel: number = 0;
  private teslaCooldown: number = 0;
  
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
  private emergencyLight: THREE.PointLight;
  private generatorPulse: number = 0;
  private genScreenCanvas!: HTMLCanvasElement;
  private genScreenCtx!: CanvasRenderingContext2D;
  private genScreenTex!: THREE.CanvasTexture;
  
  private walls: THREE.Box3[] = [];
  private obstacles: THREE.Box3[] = [];
  private occlusionObjects: THREE.Object3D[] = [];
  private boothGroup: THREE.Group = new THREE.Group();
  private boothLightFixture: THREE.Mesh | null = null;
  
  private moveForward: boolean = false;
  private moveBackward: boolean = false;
  private moveLeft: boolean = false;
  private moveRight: boolean = false;
  private isSprinting: boolean = false; 
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private shookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private zeroVec = new THREE.Vector3(0, 0, 0);
  private tempVec3 = new THREE.Vector3();
  private tempVec3Alt = new THREE.Vector3();
  private tempVec2 = new THREE.Vector2();
  private lastEnemyDistCheck: number = 0;
  
  // Pre-cached resources for optimization
  private damageTextPool: THREE.Sprite[] = [];
  private damageTextTexture: THREE.CanvasTexture | null = null;
  private tempVec3_2 = new THREE.Vector3();
  private playerBox = new THREE.Box3();
  private playerSize = new THREE.Vector3(0.8, 2, 0.8);
  private PI_2 = Math.PI / 2;

  private windUniforms: { time: { value: number } };
  private burnTexture: THREE.Texture;

  private boundResize: () => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
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
    onStatsUpdate: (bat: number, hp: number, wave: number, credits: number, genDisabled: boolean, restartProgress: number, totalKills: number, killsByType: Record<string, number>, ammo: number, stamina: number, overcharge: number, dash: number, hitMarker: number, isAimingEnemy: boolean, isBloodMoon: boolean, nearestDist: number | null, fMode: FlashlightMode, tText: string | null, rMsg: string | null) => void,
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
    this.sunLight.shadow.mapSize.width = 1024; 
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.bias = -0.0005; 
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);

    this.boothLight = new THREE.PointLight(0xffddaa, 20.0, 45); // Halved for ACES
    this.boothLight.position.set(0, 2.8, 0);
    this.boothLight.castShadow = true;
    this.boothLight.shadow.mapSize.width = 512;
    this.boothLight.shadow.mapSize.height = 512;
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // Faster than PCFSoft
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.domElement = this.renderer.domElement;

    // Post Processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    
    // Removed HorrorColorGradeShader (sepia filter) per user request
    // const horrorPass = new ShaderPass(HorrorColorGradeShader);
    // this.composer.addPass(horrorPass);

    // Removed aberrationPass for performance optimization

    this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), // Half-res bloom
        1.0, 0.4, 0.8
    );
    this.bloomPass.threshold = 0.5; 
    this.bloomPass.strength = 1.0;   
    this.bloomPass.radius = 0.5;
    this.composer.addPass(this.bloomPass);

    // @ts-ignore
    const filmPass = new (FilmPass as any)(0.35, 0.05, 648, 0); 
    this.composer.addPass(filmPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
    this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
    this.composer.addPass(this.fxaaPass);

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
    this.createTeslaCoil();

    this.sparkSystem = new SparkSystem(this.scene);
    this.rainSystem = new RainSystem(this.scene);
    this.sporeSystem = new SporeSystem(this.scene);
    
    this.boundResize = this.onWindowResize.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundPointerLockError = this.onPointerLockError.bind(this);

    window.addEventListener('resize', this.boundResize);
    document.addEventListener('mousemove', this.boundMouseMove);
    this.domElement.addEventListener('mousedown', this.boundMouseDown);
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
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

  private onMouseDown(e: MouseEvent) {
      if (!this.isLocking) {
          if (this.phase !== GamePhase.MENU && this.phase !== GamePhase.GAME_OVER && !this.isUIOpen) {
              this.requestLockImmediate();
          }
          return;
      }

      if (e.button === 0) { // Left Click
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
      } else if (e.button === 2) { // Right Click
          if (this.phase === GamePhase.NIGHT) {
              const overchargeSuccessful = this.flashlight.triggerOvercharge();
              if(overchargeSuccessful) {
                  this.soundManager.playOverchargeStart();
                  // Screen flash effect
                  gsap.to(this.bloomPass, { strength: 4, duration: 0.1, yoyo: true, repeat: 1 });

                  // Apply Overcharge Effect to Enemies
                  const playerPos = this.camera.position;
                  const playerDir = new THREE.Vector3();
                  this.camera.getWorldDirection(playerDir);
                  playerDir.y = 0; 
                  playerDir.normalize();

                  const range = 30; // Increased range
                  const coneAngle = Math.PI / 2; // Wider cone (90 degrees)

                  this.enemies.forEach(enemy => {
                      if (enemy.isDead || enemy.isDying) return;

                      const toEnemy = enemy.mesh.position.clone().sub(playerPos);
                      const dist = toEnemy.length();

                      if (dist < range) {
                          const toEnemyDir = toEnemy.clone().normalize();
                          toEnemyDir.y = 0; 
                          toEnemyDir.normalize();
                          
                          const angle = playerDir.angleTo(toEnemyDir);
                          if (angle < coneAngle / 2) {
                              // Hit!
                              enemy.stun(4.0);
                              const { died, damage, isCritical } = enemy.takeDamage(500, enemy.mesh.position.clone(), toEnemyDir.negate(), this.burnTexture);
                              if (damage > 0) this.spawnDamageText(damage, enemy.mesh.position, isCritical);
                              if (died) this.soundManager.playHitMarker();
                              
                              // Knockback
                              const push = toEnemyDir.multiplyScalar(5.0);
                              enemy.mesh.position.add(push);
                          }
                      }
                  });
              }
          }
      }
  }

  private triggerDash() {
      if (this.dashLevel > 0 && this.dashCooldown <= 0 && this.stamina >= 30 && this.phase === GamePhase.NIGHT) {
          this.isDashing = true;
          this.dashTimer = 0.2;
          this.dashCooldown = Math.max(0.5, 2.0 - (this.dashLevel * 0.5));
          this.stamina -= 30;
          this.soundManager.playClick(); 
          this.addTrauma(0.1);
          
          // Visual feedback
          gsap.to(this.camera, { fov: 85, duration: 0.1, yoyo: true, repeat: 1, onUpdate: () => this.camera.updateProjectionMatrix() });
          this.shakeIntensity = 0.1;
          
          // Flash effect
          gsap.to(this.renderer, { toneMappingExposure: 2.0, duration: 0.1, yoyo: true, repeat: 1 });
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
          case 'KeyX': this.flashlight.cycleMode(); this.soundManager.playClick(); break;
          case 'KeyG': this.throwFlare(); break;
          case 'KeyV': this.placeMine(); break;
          case 'Space': this.triggerDash(); break;
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
      // Stubbed out based on user request to remove stress system
  }

  private spawnDamageText(amount: number, position: THREE.Vector3, isCritical: boolean) {
      // PERF FIX: Reuse textures and sprites to prevent random lag spikes (GPU uploads)
      if (!this.damageTextTexture) {
          const canvas = document.createElement('canvas');
          canvas.width = 128; // Smaller for performance
          canvas.height = 128;
          const ctx = canvas.getContext('2d')!;
          ctx.font = 'bold 64px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('!', 64, 64);
          this.damageTextTexture = new THREE.CanvasTexture(canvas);
      }

      let sprite = this.damageTextPool.find(s => !s.visible);
      if (!sprite) {
          const material = new THREE.SpriteMaterial({ 
              map: this.damageTextTexture, 
              transparent: true, 
              depthTest: false 
          });
          sprite = new THREE.Sprite(material);
          this.damageTextPool.push(sprite);
          this.scene.add(sprite);
      }
      
      sprite.visible = true;
      sprite.position.copy(position);
      sprite.position.x += (Math.random() - 0.5) * 1.5;
      sprite.position.y += 1.0 + Math.random() * 1.0;
      sprite.position.z += (Math.random() - 0.5) * 1.5;
      sprite.scale.set(1.5, 0.75, 1);
      if (isCritical) sprite.scale.set(2.5, 1.25, 1);
      
      this.damageTexts.push({
          sprite,
          life: 1.0,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2)
      });
  }

  private throwFlare() {
      if (this.flaresCount > 0 && (this.phase === GamePhase.NIGHT || this.isTutorial)) {
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

  private placeMine() {
      if (this.minesCount > 0 && this.phase === GamePhase.NIGHT) {
          this.minesCount--;
          const direction = new THREE.Vector3();
          this.camera.getWorldDirection(direction);
          const pos = this.camera.position.clone().add(direction.multiplyScalar(2));
          pos.y = 0;
          const mine = new Mine(pos);
          this.scene.add(mine.mesh);
          this.activeMines.push(mine);
      }
  }

  // Updated spawnWave logic remains same, used in startNight
  private spawnWave(waveNumber: number) {
      // Balanced challenge: harder than before, but still accessible
      let points = 16 + waveNumber * 5.0 + Math.pow(waveNumber, 1.35);
      
      // Narrative Dispatcher
      if (waveNumber === 1) {
          this.playRadioMessage("Внимание, Страж... Сектор 4 зафиксировал аномальное сжатие. Тени начали материализацию. Фактор риска: умеренный.");
      } else if (waveNumber === 3) {
          this.playRadioMessage("Обнаружен всплеск электромагнитных помех. Что-то крупное движется из Глубины. Защищайте Ядро любой ценой.");
      } else if (waveNumber === 5) {
          this.playRadioMessage("Протоколы эвакуации изменены. Командование приказало извлечь Ядро... персонал считается избыточным. Продержись до 10-го цикла.");
      } else if (waveNumber === 10) {
          this.playRadioMessage("Ядро стабилизировано. Извлечение завершено. Точка эвакуации в километре к северу. Беги, пока лес не поглотил нас всех.");
      }

      if (waveNumber % 3 === 0) {
          this.isBloodMoon = true;
          points *= 1.15; // Reduced blood moon multiplier
      } else {
          this.isBloodMoon = false;
      }

      if (waveNumber > 0 && waveNumber % 15 === 0) {
          const boss = new LeviathanBoss();
          const angle = Math.random() * Math.PI * 2;
          boss.mesh.position.set(Math.cos(angle) * 50, 0, Math.sin(angle) * 50);
          this.enemies.push(boss);
          this.scene.add(boss.mesh);
          points += 100; // Extra points to spawn minions (reduced from 300)
      } else if (waveNumber > 0 && waveNumber % 10 === 0) {
          const boss = new ForestHeartBoss();
          const angle = Math.random() * Math.PI * 2;
          boss.mesh.position.set(Math.cos(angle) * 40, 0, Math.sin(angle) * 40);
          this.enemies.push(boss);
          this.scene.add(boss.mesh);
          points += 50;
      } else if (waveNumber > 0 && waveNumber % 5 === 0) {
          const boss = new ShriekerBoss();
          const angle = Math.random() * Math.PI * 2;
          boss.mesh.position.set(Math.cos(angle) * 30, 1.5, Math.sin(angle) * 30);
          this.enemies.push(boss);
          this.scene.add(boss.mesh);
          points += 25;
      }

      const spawn = (Cls: any, cost: number) => {
          if (points >= cost) {
              const enemy = new Cls();
              const angle = Math.random() * Math.PI * 2;
              const r = 25 + Math.random() * 20; 
              enemy.mesh.position.set(Math.cos(angle) * r, 1, Math.sin(angle) * r);
              
              if (this.isBloodMoon) {
                  enemy.speed *= 1.15; 
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
      while (points > 3 && attempts < 300) {
          attempts++;
          const roll = Math.random();
          let spawned = false;
          
          if (waveNumber >= 12 && roll < 0.1) spawned = spawn(ShriekerBoss, 80); // Minibosses!
          else if (waveNumber >= 10 && roll < 0.15) spawned = spawn(SpitterEnemy, 12);
          else if (waveNumber >= 6 && roll < 0.25) spawned = spawn(GlitcherEnemy, 12);
          else if (waveNumber >= 5 && roll < 0.35) spawned = spawn(PhantomEnemy, 10);
          else if (waveNumber >= 4 && roll < 0.45) spawned = spawn(DrainerEnemy, 10);
          else if (waveNumber >= 3 && roll < 0.55) spawned = spawn(SpitterEnemy, 12);
          else if (waveNumber >= 3 && roll < 0.70) spawned = spawn(TankEnemy, 15);
          else if (waveNumber >= 2 && roll < 0.85) spawned = spawn(FastEnemy, 8);
          else spawned = spawn(NormalEnemy, 5);
          
          if (!spawned && points < 5) break; 
      }
  }

  public startTutorial() {
      this.turretTarget = null;
      this.enemies.forEach(e => this.scene.remove(e.mesh));
      this.enemies = []; 
      
      this.phase = GamePhase.NIGHT;
      this.wave = 0;
      this.isTutorial = true;
      this.tutorialStep = 0;
      this.tutorialTimer = 0;
      this.tutorialText = "СМЕНА 0: ОБУЧЕНИЕ\nИспользуйте [W][A][S][D] для перемещения.";
      
      this.onPhaseChange(GamePhase.NIGHT);
      this.flashlight.turnOff();
      
      this.sunLight.intensity = 0.15;
      this.hemiLight.intensity = 0.25;
      this.scene.background = new THREE.Color(COLORS.SKY_NIGHT);
      this.fog.color.setHex(COLORS.FOG);
      this.fog.near = 2;
      this.fog.far = 40;
      this.sunLight.color.setHex(0xaaaaaa);
      
      this.camera.position.set(0, 1.6, 5);
      this.euler.set(0, 0, 0);
      this.camera.quaternion.setFromEuler(this.euler);
  }

  public triggerRadio(message: string, duration: number = 6.0) {
      this.currentRadioMessage = message;
      this.radioMessageTimer = duration;
      // Also turn on the physical radio prop for visual/audio effect
      if (this.radioMesh && this.radioMesh.children.length > 4) {
          const mat = this.radioMesh.children[4] as THREE.Mesh;
          if(mat.material instanceof THREE.MeshBasicMaterial) {
              mat.material.color.setHex(0x00ff00);
              mat.material.opacity = 1.0;
          }
      }
      if (this.radioAudio && !this.radioAudio.isPlaying) {
          this.radioAudio.play();
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
      
      if (this.wave === 1) {
          this.triggerRadio("HQ: Смена началась. Держи Гелиос-9 заряженным. Следи за лесом.");
      } else if (this.isBloodMoon) {
          this.triggerRadio("HQ: Внимание. Гравитационные аномалии. 'Кровавая луна'. Их активность повышена.");
      } else if (this.wave === 5) {
          this.triggerRadio("HQ: Радары фиксируют крупный биологический объект. Крикун. Закрой уши.");
      } else if (this.wave === 10) {
          this.triggerRadio("HQ: Наши приборы слепнут! Огромная структура формируется над землей! Уничтожь её!");
      } else if (this.wave === 15) {
          this.triggerRadio("HQ: ...они прорвали периметр. Проект Тень... Левиафан на свободе. Прости нас. Эвакуации не будет.");
      } else if (this.wave > 15) {
          this.triggerRadio("HQ: [СИГНАЛ ПОТЕРЯН] ...");
      }

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
          this.bloomPass.strength = 0.8;
          this.bloomPass.threshold = 0.85;
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
      } else if (id === 'mine_pack') {
          this.minesCount++;
      } else if (id === 'turret_build') {
          this.turretLevel++;
      } else if (id === 'turret_ammo') {
          this.turretAmmo += 100;
      } else if (id === 'tesla_coil') {
          this.teslaLevel++;
          if (this.teslaLevel === 1 && this.teslaMesh) {
              this.teslaMesh.visible = true;
          }
      } else if (id === 'dash_boots') {
          this.dashLevel++;
      } else if (id === 'adrenaline') {
          this.adrenalineLevel++;
          this.stamina = 100;
      } else if (id === 'advanced_optics') {
          this.damageMultiplier *= 1.3;
          this.flashlight.setRangeMultiplier(1.2);
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

  private updateTutorial(delta: number) {
      if (!this.isTutorial) return;

      this.tutorialTimer += delta;
      this.flashlight.setBattery(100); // Keep battery full during tutorial

      switch (this.tutorialStep) {
          case 0: // Learn to walk
              if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
                  if (this.tutorialTimer > 3) {
                      this.tutorialStep++;
                      this.tutorialTimer = 0;
                      this.tutorialText = "Нажмите [ЛКМ] или [F], чтобы включить фонарь.\nСвет - ваше единственное оружие.";
                  }
              } else {
                  this.tutorialTimer = 0; // Reset if they stop moving before 3 seconds
              }
              break;
          case 1: // Learn flashlight
              if (this.flashlight.isLightOn()) {
                  this.tutorialStep++;
                  this.tutorialTimer = 0;
                  this.tutorialText = "Отлично. Свет отпугивает и сжигает теней.\nОжидайте появления врага.";
              }
              break;
          case 2: // Wait for enemy
              if (this.tutorialTimer > 4) {
                  this.tutorialStep++;
                  this.tutorialTimer = 0;
                  this.tutorialText = "Наведите фонарь на тень, чтобы уничтожить её.";
                  // Spawn one normal enemy
                  const enemy = new NormalEnemy();
                  enemy.mesh.position.set(0, 0, -15);
                  this.scene.add(enemy.mesh);
                  this.enemies.push(enemy);
              }
              break;
          case 3: // Kill enemy
              if (this.enemies.length === 0) {
                  this.tutorialStep++;
                  this.tutorialTimer = 0;
                  this.tutorialText = "Тень уничтожена.\nНажмите [ПКМ], чтобы активировать ПЕРЕГРУЗКУ фонаря.";
              }
              break;
          case 4: // Overcharge
              if (this.flashlight.isOvercharging()) {
                  this.tutorialStep++;
                  this.tutorialTimer = 0;
                  this.tutorialText = "Перегрузка ослепляет всех врагов вокруг.\nИспользуйте её в критических ситуациях.";
                  this.flaresCount = 1; // Give 1 flare
              }
              break;
          case 5: // Wait for overcharge text
              if (this.tutorialTimer > 4) {
                  this.tutorialStep++;
                  this.tutorialTimer = 0;
                  this.tutorialText = "Нажмите [G], чтобы бросить флаер.\nОн создает безопасную зону света.";
              }
              break;
          case 6: // Throw flare
              if (this.activeFlares.length > 0) {
                  this.tutorialStep++;
                  this.tutorialTimer = 0;
                  this.tutorialText = "Отлично. Обучение пройдено.\nВы готовы к смене.";
              }
              break;
          case 7: // End tutorial
              if (this.tutorialTimer > 4) {
                  this.isTutorial = false;
                  this.tutorialText = null;
                  this.endNight();
              }
              break;
      }
  }

  private updateMovement(delta: number) {
      if (!this.isLocking || this.isTransitioning || this.isUIOpen) return;

      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;

      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();

      let speed = this.isSprinting ? GAME_CONFIG.PLAYER_RUN_SPEED : GAME_CONFIG.PLAYER_SPEED;
      if (this.isDashing) speed *= 5.0;

      if (this.moveForward || this.moveBackward) this.velocity.z += this.direction.z * 400.0 * delta * 0.1; 
      if (this.moveLeft || this.moveRight) this.velocity.x += this.direction.x * 400.0 * delta * 0.1;

      const currentSpeed = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
      if (currentSpeed > 0.1) {
          const maxSpeedRef = this.isDashing ? 10.0 : (this.isSprinting ? 2.5 : 1.5); 
          if (currentSpeed > maxSpeedRef) {
              const ratio = maxSpeedRef / currentSpeed;
              this.velocity.x *= ratio;
              this.velocity.z *= ratio;
          }
      }

      if (this.isDashing) {
          this.dashTimer -= delta;
          if (this.dashTimer <= 0) this.isDashing = false;
      }
      if (this.dashCooldown > 0) this.dashCooldown -= delta;

      const isMoving = currentSpeed > 0.1;
      if (this.isSprinting && isMoving) {
          const sprintDrain = this.stamina > 0 ? 25 : 0;
          this.stamina -= delta * sprintDrain; 
          if (this.stamina <= 0) {
              this.stamina = 0;
              this.isSprinting = false;
          }
      } else {
          let recoveryRate = isMoving ? 10 : 25;
          // Adrenaline effect: faster recovery if upgraded
          recoveryRate += this.adrenalineLevel * 10;
          
          if (this.stamina < 100) {
              this.stamina += delta * recoveryRate;
              if (this.stamina > 100) this.stamina = 100;
          }
      }

      const moveX = this.velocity.x * delta * speed;
      const moveZ = -this.velocity.z * delta * speed;
      this.camera.translateX(moveX);
      this.camera.translateZ(moveZ);

      const targetTilt = this.moveLeft ? 0.03 : (this.moveRight ? -0.03 : 0);
      this.euler.z = THREE.MathUtils.lerp(this.euler.z, targetTilt, delta * 5);

      if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
          this.bobTimer += delta * (this.isSprinting ? 18 : 12);
          this.camera.position.y = 1.6 + Math.sin(this.bobTimer) * 0.05;
          
          this.footstepTimer += delta * (this.isSprinting ? 1.5 : 1.0);
          if (this.footstepTimer > 0.4) {
              this.soundManager.playFootstep();
              this.footstepTimer = 0;
          }
      } else {
          // Subtle breathing effect when standing still
          this.bobTimer += delta * 2;
          this.camera.position.y = 1.6 + Math.sin(this.bobTimer) * 0.015;
          this.footstepTimer = 0.3; // Reset so next step happens soon
      }

      // FOV Sprint Effect
      if (!this.isDashing) {
          const targetFov = (this.isSprinting && isMoving) ? 85 : 75;
          this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 5);
          this.camera.updateProjectionMatrix();
      }

      // Apply Screen Shake
      if (this.shakeIntensity > 0) {
          this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
          this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
          this.shakeIntensity *= 0.9; // Decay
          if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
      }
      
      const PLAYER_RADIUS = 0.4;
      this.playerBox.setFromCenterAndSize(this.camera.position, this.playerSize);

      for(const wall of this.walls) {
          if (wall.intersectsBox(this.playerBox)) {
               wall.getCenter(this.tempVec3);
               wall.getSize(this.tempVec3_2);
               const dx = this.camera.position.x - this.tempVec3.x;
               const dz = this.camera.position.z - this.tempVec3.z;
               const safeX = this.tempVec3_2.x/2 + PLAYER_RADIUS + 0.01;
               const safeZ = this.tempVec3_2.z/2 + PLAYER_RADIUS + 0.01;
               if (Math.abs(dx / this.tempVec3_2.x) > Math.abs(dz / this.tempVec3_2.z)) {
                   this.camera.position.x = this.tempVec3.x + (dx > 0 ? safeX : -safeX);
               } else {
                   this.camera.position.z = this.tempVec3.z + (dz > 0 ? safeZ : -safeZ);
               }
          }
      }
      for(const obs of this.obstacles) {
          if (obs.intersectsBox(this.playerBox)) {
              obs.getCenter(this.tempVec3);
              obs.getSize(this.tempVec3_2);
              const dx = this.camera.position.x - this.tempVec3.x;
              const dz = this.camera.position.z - this.tempVec3.z;
              const safeX = this.tempVec3_2.x/2 + PLAYER_RADIUS + 0.01;
              const safeZ = this.tempVec3_2.z/2 + PLAYER_RADIUS + 0.01;
              if (Math.abs(dx / this.tempVec3_2.x) > Math.abs(dz / this.tempVec3_2.z)) {
                  this.camera.position.x = this.tempVec3.x + (dx > 0 ? safeX : -safeX);
              } else {
                  this.camera.position.z = this.tempVec3.z + (dz > 0 ? safeZ : -safeZ);
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
              const dist = this.camera.position.distanceTo(this.tempVec3.set(-1.4, 0.5, -1.4));
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

  private updateGeneratorScreen() {
      if (!this.genScreenCtx || !this.genScreenTex) return;
      const ctx = this.genScreenCtx;
      const w = this.genScreenCanvas.width;
      const h = this.genScreenCanvas.height;

      ctx.fillStyle = '#001100';
      ctx.fillRect(0, 0, w, h);

      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.isGeneratorDisabled) {
          ctx.fillStyle = '#ff0000';
          ctx.fillText('OFFLINE', w/2, h/2 - 10);
          ctx.font = '16px monospace';
          ctx.fillText('RESTART REQ', w/2, h/2 + 20);
      } else {
          ctx.fillStyle = '#00ff00';
          ctx.fillText('ONLINE', w/2, h/3);
          
          // Draw HP bar
          const hpPercent = Math.max(0, this.generatorHp / this.maxGeneratorHp);
          ctx.fillStyle = '#004400';
          ctx.fillRect(20, h*0.6, w - 40, 30);
          ctx.fillStyle = hpPercent > 0.3 ? '#00ff00' : '#ffaa00';
          ctx.fillRect(20, h*0.6, (w - 40) * hpPercent, 30);
          
          ctx.strokeStyle = '#00ff00';
          ctx.strokeRect(20, h*0.6, w - 40, 30);
      }
      this.genScreenTex.needsUpdate = true;
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
      this.minesCount = 0;
      this.stamina = 100;
      this.teslaLevel = 0;
      if (this.teslaMesh) this.teslaMesh.visible = false;
      this.activeFlares.forEach(f => this.scene.remove(f.mesh));
      this.activeFlares = [];
      this.activeMines.forEach(m => this.scene.remove(m.mesh));
      this.activeMines = [];
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
      this.minesCount = data.mines || 0;
      this.turretAmmo = data.turretAmmo || 0;
      this.phase = GamePhase.DAY; 
      
      this.isUIOpen = false;
      this.isTransitioning = false;
      this.isDeathSequence = false;
      this.isGeneratorDisabled = false;

      data.upgrades.forEach(up => {
          if (up.id === 'flare_pack' || up.id === 'mine_pack' || up.id === 'turret_ammo') return;
          for(let i=0; i < up.level; i++) {
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
      
      // Improved Mug with handle
      const mugGroup = new THREE.Group();
      const mugGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.1, 16);
      const mugMat = new THREE.MeshStandardMaterial({ 
          color: 0xffffff,
          map: new THREE.CanvasTexture(TextureUtils.createNoiseCanvas(128, 128, 'ceramic'))
      });
      mugMat.map!.colorSpace = THREE.SRGBColorSpace;
      const mugBodyMesh = new THREE.Mesh(mugGeo, mugMat);
      mugBodyMesh.castShadow = true;
      mugGroup.add(mugBodyMesh);
      
      const handleGeo = new THREE.TorusGeometry(0.03, 0.008, 8, 16);
      const handleMesh = new THREE.Mesh(handleGeo, mugMat);
      handleMesh.position.set(0.05, 0, 0);
      handleMesh.castShadow = true;
      mugGroup.add(handleMesh);
      
      this.materials.ceramic = mugMat;
      this.scene.add(mugGroup);
      
      const mugBody = new CANNON.Body({ mass: 0.5 });
      mugBody.addShape(new CANNON.Cylinder(0.05, 0.04, 0.1, 8));
      const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
      mugBody.quaternion = q;
      mugBody.position.set(1.5, 1.2, -0.2);
      this.world.addBody(mugBody);
      this.physicsObjects.push({mesh: mugGroup, body: mugBody});
      
      // Create exterior props (crates, barrels, sandbags)
      const propGroup = new THREE.Group();
      
      const crateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const crateMat = new THREE.MeshStandardMaterial({color: 0x5a4a3a, roughness: 0.9});
      const crate1 = new THREE.Mesh(crateGeo, crateMat);
      crate1.position.set(-2.6, 0.4, 2.0);
      crate1.castShadow = true;
      crate1.receiveShadow = true;
      propGroup.add(crate1);
      this.obstacles.push(new THREE.Box3().setFromObject(crate1));
      
      const crate2 = new THREE.Mesh(crateGeo, crateMat);
      crate2.position.set(-2.8, 0.4, 1.2);
      crate2.rotation.y = 0.2;
      crate2.castShadow = true;
      crate2.receiveShadow = true;
      propGroup.add(crate2);
      this.obstacles.push(new THREE.Box3().setFromObject(crate2));
      
      const crate3 = new THREE.Mesh(crateGeo, crateMat);
      crate3.position.set(-2.5, 1.2, 1.6);
      crate3.rotation.y = -0.1;
      crate3.rotation.z = 0.05;
      crate3.castShadow = true;
      crate3.receiveShadow = true;
      propGroup.add(crate3);
      this.obstacles.push(new THREE.Box3().setFromObject(crate3));
      
      const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16);
      const barrelMat = new THREE.MeshStandardMaterial({color: 0x2233aa, roughness: 0.6, metalness: 0.5});
      const barrel1 = new THREE.Mesh(barrelGeo, barrelMat);
      barrel1.position.set(2.5, 0.45, 1.5);
      barrel1.castShadow = true;
      barrel1.receiveShadow = true;
      propGroup.add(barrel1);
      this.obstacles.push(new THREE.Box3().setFromObject(barrel1));

      const barrel2 = new THREE.Mesh(barrelGeo, barrelMat);
      barrel2.position.set(2.8, 0.45, 2.0);
      barrel2.castShadow = true;
      barrel2.receiveShadow = true;
      propGroup.add(barrel2);
      this.obstacles.push(new THREE.Box3().setFromObject(barrel2));
      
      this.scene.add(propGroup);
  }

  // UPDATED: More detailed environments
  private createEnvironment() {
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundTexCanvas = TextureUtils.createNoiseCanvas(1024, 1024, 'grass');
    const groundNormal = TextureUtils.generateNormalMap(groundTexCanvas);
    const groundTex = new THREE.CanvasTexture(groundTexCanvas);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(10, 10);
    
    const groundMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x11aa11, // Much brighter and greener base
        roughness: 0.9,
        metalness: 0.0,
        normalMap: groundNormal,
        map: groundTex
    });
    this.materials.ground = groundMat;
    
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
    this.materials.wood = woodMat;
    
    const metalDiffuse = TextureUtils.createNoiseCanvas(256, 256, 'metal');
    const metalNormal = TextureUtils.generateNormalMap(metalDiffuse);
    const metalMat = new THREE.MeshStandardMaterial({ 
        color: 0x777777, 
        roughness: 0.4, 
        metalness: 0.8, 
        normalMap: metalNormal, 
        map: new THREE.CanvasTexture(metalDiffuse) 
    });
    this.materials.metal = metalMat;
    
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.05,
        transmission: 0.99,
        thickness: 0.1,
        transparent: true,
        opacity: 0.02, // Ultra transparent as requested
        ior: 1.45
    });
    this.materials.glass = glassMat;
    
    this.boothGroup = new THREE.Group();
    const boothGroup = this.boothGroup;
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
    frontPanelR.position.set(1.5, 1.5, -1.95);
    boothGroup.add(frontPanelR);
    this.walls.push(new THREE.Box3(new THREE.Vector3(1.0, 0, -2.1), new THREE.Vector3(2.0, 3, -1.8)));

    // --- BOOTH DETAILS ---
    // Posters
    const posterGeo = new THREE.PlaneGeometry(0.5, 0.7);
    const posterMat = new THREE.MeshStandardMaterial({ 
        color: 0x999999,
        roughness: 0.8,
        map: new THREE.CanvasTexture(TextureUtils.createNoiseCanvas(256, 256, 'flesh')) // reused for some paper-like texture
    });
    const poster1 = new THREE.Mesh(posterGeo, posterMat);
    poster1.position.set(-1.2, 2.0, 1.89);
    boothGroup.add(poster1);
    
    // Scraps on floor
    const scrapGeo = new THREE.PlaneGeometry(0.2, 0.2);
    for(let i=0; i<5; i++) {
        const scrap = new THREE.Mesh(scrapGeo, new THREE.MeshStandardMaterial({color: 0xeeeeee, transparent: true, opacity: 0.7}));
        scrap.position.set((Math.random()-0.5)*3, 0.21, (Math.random()-0.5)*3);
        scrap.rotation.x = -Math.PI/2;
        scrap.rotation.z = Math.random()*Math.PI;
        boothGroup.add(scrap);
    }

    // Overhead Light Fixture
    const ceilingCableGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.5);
    const ceilingCable = new THREE.Mesh(ceilingCableGeo, metalMat);
    ceilingCable.position.set(0, 3.0, 0);
    boothGroup.add(ceilingCable);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshStandardMaterial({emissive: 0xffffaa, emissiveIntensity: 1}));
    bulb.position.set(0, 2.75, 0);
    boothGroup.add(bulb);
    this.boothLightFixture = bulb;

    // --- SCI-FI GENERATOR ---
    this.generatorGroup = new THREE.Group();
    this.generatorGroup.position.set(-1.4, 0.2, -1.4); // Standard position
    
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.5 });
    const metalAccentMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 2 });
    const warningMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.5 });

    // Main Base
    const baseGeo = new THREE.BoxGeometry(0.8, 0.3, 0.8);
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, 0.15, 0);
    this.generatorGroup.add(baseMesh);

    // Core Cylinder
    const coreGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.6, 16);
    this.engineBlock = new THREE.Mesh(coreGeo, metalAccentMat); // Use engineBlock for animation
    this.engineBlock.position.set(0, 0.6, 0);
    this.generatorGroup.add(this.engineBlock);

    // Glowing Inner Core
    const innerCoreGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.65, 16);
    const innerCore = new THREE.Mesh(innerCoreGeo, glowMat);
    this.engineBlock.add(innerCore);

    // Cooling Fins
    const finGeo = new THREE.BoxGeometry(0.6, 0.05, 0.6);
    for (let i = 0; i < 5; i++) {
        const fin = new THREE.Mesh(finGeo, baseMat);
        fin.position.set(0, -0.2 + i * 0.1, 0);
        this.engineBlock.add(fin);
    }

    // Top Cap
    const capGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
    const topCap = new THREE.Mesh(capGeo, baseMat);
    topCap.position.set(0, 0.95, 0);
    this.generatorGroup.add(topCap);

    // Control Panel
    const panelGeo = new THREE.BoxGeometry(0.4, 0.3, 0.1);
    const panel = new THREE.Mesh(panelGeo, metalAccentMat);
    panel.position.set(0, 0.6, 0.35);
    panel.rotation.x = -Math.PI / 6;
    
    // Screen on panel
    this.genScreenCanvas = document.createElement('canvas');
    this.genScreenCanvas.width = 256;
    this.genScreenCanvas.height = 128;
    this.genScreenCtx = this.genScreenCanvas.getContext('2d')!;
    this.genScreenTex = new THREE.CanvasTexture(this.genScreenCanvas);
    this.genScreenTex.colorSpace = THREE.SRGBColorSpace;

    const genScreenGeo = new THREE.PlaneGeometry(0.3, 0.15);
    const screen = new THREE.Mesh(genScreenGeo, new THREE.MeshBasicMaterial({ map: this.genScreenTex }));
    screen.position.set(0, 0, 0.051);
    panel.add(screen);
    this.generatorGroup.add(panel);

    // Warning Stripes
    const genStripeGeo = new THREE.BoxGeometry(0.82, 0.05, 0.82);
    const stripe1 = new THREE.Mesh(genStripeGeo, warningMat);
    stripe1.position.set(0, 0.15, 0);
    this.generatorGroup.add(stripe1);

    // Power Cables
    const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const cable1 = new THREE.Mesh(cableGeo, cableMat);
    cable1.position.set(0.2, 0.4, -0.3);
    cable1.rotation.x = Math.PI / 4;
    this.generatorGroup.add(cable1);
    
    const cable2 = new THREE.Mesh(cableGeo, cableMat);
    cable2.position.set(-0.2, 0.4, -0.3);
    cable2.rotation.x = Math.PI / 4;
    this.generatorGroup.add(cable2);

    this.emergencyLight = new THREE.PointLight(0xff0000, 0, 10);
    this.emergencyLight.position.set(0, 1.5, 0);
    this.generatorGroup.add(this.emergencyLight);

    boothGroup.add(this.generatorGroup);
    
    this.soundManager.setupGeneratorSound(this.generatorGroup);
    this.obstacles.push(new THREE.Box3(new THREE.Vector3(-1.9, 0, -1.9), new THREE.Vector3(-0.9, 2, -0.9)));
    
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
    const fanBaseGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.05, 16);
    const fanBase = new THREE.Mesh(fanBaseGeo, metalMat);
    this.fanMesh.add(fanBase);
    
    const fanStemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8);
    const fanStem = new THREE.Mesh(fanStemGeo, metalMat);
    fanStem.position.y = 0.15;
    this.fanMesh.add(fanStem);
    
    const fanMotorGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 16);
    const fanMotor = new THREE.Mesh(fanMotorGeo, new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.8}));
    fanMotor.rotation.x = Math.PI / 2;
    fanMotor.position.set(0, 0.28, -0.05);
    this.fanMesh.add(fanMotor);

    const bladeGroup = new THREE.Group();
    bladeGroup.position.set(0, 0.28, 0.05);
    
    const bladeCenterGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16);
    const bladeCenter = new THREE.Mesh(bladeCenterGeo, metalMat);
    bladeCenter.rotation.x = Math.PI / 2;
    bladeGroup.add(bladeCenter);

    const bladeGeo = new THREE.BoxGeometry(0.06, 0.35, 0.01);
    const bladeMat = new THREE.MeshStandardMaterial({color: 0x222222, roughness: 0.5});
    const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
    const blade2 = blade1.clone(); blade2.rotation.z = Math.PI / 2;
    bladeGroup.add(blade1, blade2);
    
    // Fan cage
    const cageGeo = new THREE.TorusGeometry(0.2, 0.01, 8, 32);
    const cageMat = new THREE.MeshStandardMaterial({color: 0x888888, metalness: 0.8, roughness: 0.2});
    const cageFront = new THREE.Mesh(cageGeo, cageMat);
    cageFront.position.set(0, 0.28, 0.08);
    const cageBack = new THREE.Mesh(cageGeo, cageMat);
    cageBack.position.set(0, 0.28, 0.02);
    this.fanMesh.add(cageFront, cageBack);

    this.fanMesh.add(bladeGroup);
    this.fanMesh.userData.blades = bladeGroup;
    this.fanMesh.position.set(1.5, 1.05, 1.0);
    this.fanMesh.rotation.y = -Math.PI / 4;
    this.fanMesh.name = "fan";
    
    // Add invisible hit box for easier interaction
    const fanHitBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), new THREE.MeshBasicMaterial({visible: false}));
    fanHitBox.position.y = 0.25;
    fanHitBox.name = "fan";
    this.fanMesh.add(fanHitBox);
    
    boothGroup.add(this.fanMesh);
    
    this.fanAudio = this.soundManager.setupInteractableSound(this.fanMesh, 'fan');
    if (this.fanAudio) this.fanAudio.setVolume(this.isFanOn ? 0.2 : 0);

    // Radio
    this.radioMesh = new THREE.Group();
    
    // Main body
    const radioMat = new THREE.MeshStandardMaterial({
        color: 0x331111, // Dark red/brown wood-like color
        roughness: 0.9,
        map: new THREE.CanvasTexture(TextureUtils.createNoiseCanvas(128, 128, 'plastic'))
    });
    radioMat.map!.colorSpace = THREE.SRGBColorSpace;
    const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.15), radioMat);
    this.radioMesh.add(radioBox);
    
    // Speaker grill
    const grillGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const grillMat = new THREE.MeshStandardMaterial({color: 0x111111, wireframe: true});
    const grill = new THREE.Mesh(grillGeo, grillMat);
    grill.position.set(-0.08, 0, 0.076);
    this.radioMesh.add(grill);
    
    // Dials
    const dialGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.02, 16);
    const dialMat = new THREE.MeshStandardMaterial({color: 0x888888, metalness: 0.5});
    const dial1 = new THREE.Mesh(dialGeo, dialMat);
    dial1.rotation.x = Math.PI / 2;
    dial1.position.set(0.12, 0.04, 0.075);
    this.radioMesh.add(dial1);
    
    const dial2 = dial1.clone();
    dial2.position.set(0.12, -0.04, 0.075);
    this.radioMesh.add(dial2);
    
    // Frequency display
    const displayGeo = new THREE.PlaneGeometry(0.15, 0.04);
    const displayMat = new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.5});
    const display = new THREE.Mesh(displayGeo, displayMat);
    display.position.set(0.08, 0.05, 0.076);
    this.radioMesh.add(display);

    // Antenna
    const antennaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.05), metalMat);
    antennaBase.position.set(0.15, 0.1, -0.05);
    this.radioMesh.add(antennaBase);
    
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.5), metalMat);
    antenna.position.set(0.15, 0.35, -0.05);
    antenna.rotation.z = -Math.PI / 8;
    this.radioMesh.add(antenna);
    
    // Invisible hit box
    const radioHitBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.15), new THREE.MeshBasicMaterial({visible: false}));
    radioHitBox.name = "radio";
    this.radioMesh.add(radioHitBox);

    this.radioMesh.position.set(1.5, 1.1, -0.1);
    this.radioMesh.rotation.y = Math.PI / 6;
    this.radioMesh.name = "radio";
    boothGroup.add(this.radioMesh);
    this.radioAudio = this.soundManager.setupInteractableSound(this.radioMesh, 'radio');

    this.scene.add(boothGroup);
    this.occlusionObjects.push(boothGroup);
    this.createForest();
    this.createUndergrowth();
  }

  private createForest() {
      const treeCount = 200; // Restored count but kept shadow optimizations
      
      const woodTexCanvas = TextureUtils.createNoiseCanvas(256, 256, 'wood');
      const woodTex = new THREE.CanvasTexture(woodTexCanvas);
      woodTex.colorSpace = THREE.SRGBColorSpace;
      
      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 4, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, map: woodTex });
      this.materials.trunk = trunkMat;
      
      const leavesTex = new THREE.CanvasTexture(TextureUtils.createNoiseCanvas(256, 256, 'leaf'));
      leavesTex.colorSpace = THREE.SRGBColorSpace;
      const leavesGeo = new THREE.ConeGeometry(2, 6, 8);
      const leavesMat = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, roughness: 0.8, map: leavesTex });
      this.materials.leaves = leavesMat;

      const instancedTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
      const instancedLeaves = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount * 3);
      
      instancedTrunk.castShadow = false;
      instancedLeaves.castShadow = false;
      instancedTrunk.receiveShadow = false; // Disable receive shadow
      instancedLeaves.receiveShadow = false; // Disable receive shadow

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
      this.occlusionObjects.push(instancedTrunk);
      this.occlusionObjects.push(instancedLeaves);
  }

  private createUndergrowth() {
      const grassCount = 10000; // Restored count but kept shadow optimizations
      const geo = new THREE.PlaneGeometry(0.2, 0.35);
      geo.translate(0, 0.175, 0); // Pivot at base
      const grassTex = TextureUtils.createGrassBladeTexture();
      
      const mat = new THREE.MeshBasicMaterial({ // optimization
          map: grassTex,
          transparent: true,
          side: THREE.DoubleSide,
          alphaTest: 0.5, // Increase alphaTest to discard black pixels
          depthWrite: false,
          vertexColors: true
      });
      mat.onBeforeCompile = (shader) => {
          injectWindShader(shader, this.windUniforms);
      };

      const mesh = new THREE.InstancedMesh(geo, mat, grassCount);
      mesh.castShadow = false; // Add this
      mesh.receiveShadow = false; // Add this
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      
      for(let i=0; i < grassCount; i++) {
          const r = 5 + Math.random() * 45;
          const theta = Math.random() * Math.PI * 2;
          dummy.position.set(Math.cos(theta)*r, 0, Math.sin(theta)*r);
          dummy.rotation.y = Math.random() * Math.PI;
          dummy.rotation.x = (Math.random() - 0.5) * 0.2;
          dummy.scale.setScalar(0.6 + Math.random() * 0.6);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          
          color.setHex(0x22aa22).add(new THREE.Color(0x004400).multiplyScalar(Math.random()));
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
      
      // Laser Sight
      const laserGeo = new THREE.CylinderGeometry(0.01, 0.01, 20);
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
      const laser = new THREE.Mesh(laserGeo, laserMat);
      laser.rotation.x = Math.PI / 2;
      laser.position.z = 10.4; // Offset to start from barrel
      this.turretHead.add(laser);

      this.turretGroup.add(this.turretHead);
      this.scene.add(this.turretGroup);
  }

  private createTeslaCoil() {
      this.teslaMesh = new THREE.Group();
      this.teslaMesh.position.set(1.5, 3.5, 1.5); // On roof corner
      
      const mat = new THREE.MeshStandardMaterial({color: 0x444444, metalness: 0.8, roughness: 0.2});
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2), mat);
      this.teslaMesh.add(base);
      
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0), mat);
      stem.position.y = 0.6;
      this.teslaMesh.add(stem);
      
      const toroidMat = new THREE.MeshStandardMaterial({color: 0x888888, metalness: 0.9, roughness: 0.1});
      const toroid = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 16, 32), toroidMat);
      toroid.rotation.x = Math.PI / 2;
      toroid.position.y = 1.1;
      this.teslaMesh.add(toroid);
      
      this.teslaMesh.visible = false;
      this.scene.add(this.teslaMesh);
  }

  private playRadioMessage(msg: string) {
      this.currentRadioMessage = msg;
      this.radioMessageTimer = 8.0; // Play for 8 seconds
      
      if (this.radioMesh && this.radioMesh.children.length > 4) {
          const mat = this.radioMesh.children[4] as THREE.Mesh;
          if(mat.material instanceof THREE.MeshBasicMaterial) {
              mat.material.color.setHex(0x00ff00); // highlight
              mat.material.opacity = 1.0;
          }
      }
      if (this.radioAudio) {
          this.radioAudio.setVolume(1.0);
          if (this.radioAudio.isPlaying) this.radioAudio.stop();
          this.radioAudio.play();
      }
  }

  private animate() {
      if (!this.isRunning || this.isDisposed) return;
      this.animationId = requestAnimationFrame(() => this.animate());

      const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta to prevent teleportation lags
      const now = this.clock.getElapsedTime();
      
      this.windUniforms.time.value = now;

      if (this.phase !== GamePhase.DAY && Date.now() - this.monitorUpdateTimer > 100) {
        this.monitorUpdateTimer = Date.now();
        this.updateMonitor();
      }

      // Physics stepping
      this.world.step(1/60, delta, 3);
      
      this.camera.quaternion.setFromEuler(this.euler);

      const breathIntensity = (100 - this.stamina) / 100.0;
      this.soundManager.updateBreathing(breathIntensity);
      
      if (this.dashCooldown > 0) this.dashCooldown -= delta;
      if (this.isDashing) {
          this.dashTimer -= delta;
          if (this.dashTimer <= 0) this.isDashing = false;
      }

      this.updateMovement(delta);
      this.updateTutorial(delta);

      const isNight = this.phase === GamePhase.NIGHT;
      const isNightOrTut = isNight || this.isTutorial;

      if (isNightOrTut) {
          if (this.radioMessageTimer > 0) {
              this.radioMessageTimer -= delta;
              if (this.radioMessageTimer <= 0) {
                  this.currentRadioMessage = null;
                  if (this.radioMesh && this.radioMesh.children.length > 4) {
                      const mat = this.radioMesh.children[4] as THREE.Mesh;
                      if(mat.material instanceof THREE.MeshBasicMaterial) {
                          mat.material.color.setHex(0x002200); 
                          mat.material.opacity = 0.5;
                      }
                  }
                  if (this.radioAudio && this.radioAudio.isPlaying) {
                      this.radioAudio.stop();
                  }
              }
          }

          // Global floor clamp for Enemies
          for (const enemy of this.enemies) {
              if (enemy.isDead) continue;
              // Floor clamp
              if (enemy.mesh.position.y < 0) enemy.mesh.position.y = 0;
          }

          if (this.wave >= 4 && !this.isGeneratorDisabled && !this.isBlackout) {
              this.blackoutTimer -= delta;
              if (this.blackoutTimer <= 0 && Math.random() < 0.05 * delta) {
                  this.isBlackout = true;
                  this.blackoutDuration = 2 + Math.random() * 5;
                  this.soundManager.playScreamer(); 
                  if (!this.isBloodMoon) this.sunLight.intensity = 0;
                  this.boothLight.intensity = 0;
                  this.flashlight.flicker(this.blackoutDuration);
              }
          }

          if (this.isBlackout) {
              this.blackoutDuration -= delta;
              if (this.blackoutDuration <= 0) {
                  this.isBlackout = false;
                  this.blackoutTimer = 30 + Math.random() * 60; 
                  this.sunLight.intensity = 0.15;
                  this.boothLight.intensity = 20.0;
              }
          }
          
          if (!this.isBlackout) {
              const baseDist = 45;
              const targetDist = Math.max(15, baseDist - (this.wave * 1.5));
              this.boothLight.distance += (targetDist - this.boothLight.distance) * delta;
          }

          const windX = Math.sin(now * 0.5) * 0.5;
          const windZ = Math.cos(now * 0.3) * 0.5;
          
          this.rainSystem.update(delta, this.camera.position, windX, windZ);
          this.sporeSystem.update(delta);
          
          // Industrial Light Flickering
          if (this.boothLightFixture && !this.isBlackout && !this.isGeneratorDisabled) {
              const flicker = Math.random() > 0.98 ? 0.2 : 0.6;
              const flicker2 = 0.5 + Math.sin(now * 20) * 0.1;
              if (this.boothLightFixture.material instanceof THREE.MeshStandardMaterial) {
                  this.boothLightFixture.material.emissiveIntensity = flicker * flicker2;
              }
          }

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

      // Update Damage Texts - Optimized visibility toggle instead of dispose
      for (let i = this.damageTexts.length - 1; i >= 0; i--) {
          const dt = this.damageTexts[i];
          dt.life -= delta;
          if (dt.life <= 0) {
              dt.sprite.visible = false;
              this.damageTexts.splice(i, 1);
          } else {
              dt.sprite.position.add(this.tempVec3.copy(dt.velocity).multiplyScalar(delta));
              dt.velocity.y -= 5.0 * delta; // Gravity
              dt.sprite.material.opacity = dt.life; // Fade out
          }
      }

      this.checkInteraction();
      
      if (this.isHoldingRestart && this.isGeneratorDisabled) {
         const dist = this.camera.position.distanceTo(new THREE.Vector3(-1.4, 0.5, -1.4));
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
      const lightDir = this.tempVec3.set(0,0,0);
      this.camera.getWorldDirection(lightDir);
      
      this.raycaster.camera = this.camera;
      const targetPos = this.isGeneratorDisabled ? this.camera.position : new THREE.Vector3(0, 0, 0);
      const genPos = new THREE.Vector3(-1.4, 0.2, -1.4);
      
      const doorNode = new THREE.Vector3(0, 0, -3.5);
      const entranceNode = new THREE.Vector3(0, 0, -2.1);
      const centerNode = new THREE.Vector3(0, 0, 0); // Mandatory nav point before core
      const stagingNodeFront = new THREE.Vector3(0, 0, -10.0);

      for (let i = this.enemies.length - 1; i >= 0; i--) {
          const enemy = this.enemies[i];
          
          let currentEnemyTarget = this.isGeneratorDisabled ? this.camera.position : genPos;
          const ex = enemy.mesh.position.x;
          const ez = enemy.mesh.position.z;

          // Sequential pathing logic for enemies hitting the generator
      if (!this.isGeneratorDisabled && enemy.type !== EnemyType.DRAINER) {
          const isInside = Math.abs(ex) <= 1.9 && ez >= -1.9 && ez <= 1.9;

          if (!isInside) {
              if (ez > 2.0 && Math.abs(ex) < 3.0) {
                  // Right behind the booth. Move to the sides first.
                  currentEnemyTarget = ex < 0 ? new THREE.Vector3(-4.0, 0, 2.5) : new THREE.Vector3(4.0, 0, 2.5);
              } else if (Math.abs(ex) > 1.2 && ez > -2.1) {
                  // On the left/right sides. Go to the front corners to clear the walls.
                  currentEnemyTarget = ex < 0 ? new THREE.Vector3(-3.0, 0, -3.5) : new THREE.Vector3(3.0, 0, -3.5);
              } else if (Math.abs(ex) > 0.8 && ez <= -2.1) {
                  // In the front area, but too far left or right (would hit the front panels). Go to doorLine.
                  currentEnemyTarget = new THREE.Vector3(0, 0, -3.5);
              } else {
                  // Directly in front of the door line. Enter.
                  currentEnemyTarget = new THREE.Vector3(0, 0, -2.1);
              }
          } else {
              // Enforce stepping into the center before reaching the generator 
              // to prevent clipping the side walls while turning.
              if (ez < -0.8 && Math.abs(ex) < 1.0) {
                  currentEnemyTarget = new THREE.Vector3(0, 0, 0);
              } else {
                  currentEnemyTarget = genPos;
              }
          }
      }

          // SLIDING COLLISION (Improved)
          // Front Wall Snap (Prevent clipping from outside)
          if (ez < -1.85 && ez > -2.1 && Math.abs(ex) > 1.0 && Math.abs(ex) < 2.1) {
              enemy.mesh.position.z = ez < -2.0 ? -2.15 : -1.82;
          }
          // Back Wall Snap
          if (ez > 1.85 && ez < 2.15 && Math.abs(ex) < 2.1) {
              enemy.mesh.position.z = ez < 2.0 ? 1.82 : 2.18;
          }
          // Side Walls Snap
          if (Math.abs(ex) > 1.85 && Math.abs(ex) < 2.15 && Math.abs(ez) < 2.1) {
              const dir = ex < 0 ? -1 : 1;
              enemy.mesh.position.x = ex * dir < 1.95 ? 1.82 * dir : 2.18 * dir;
          }

          if (enemy.isDead) {
              if (enemy.isFullyDissolved) {
                 this.scene.remove(enemy.mesh);
                 this.enemies.splice(i, 1);
                 if (this.phase === GamePhase.NIGHT) {
                     this.credits += 35; // Increased from 25 to make game easier
                     this.totalKills++;
                     this.killsByType[enemy.type] = (this.killsByType[enemy.type] || 0) + 1;
                     
                     // Loot drop chance increased from 0.35 to 0.5 to make game easier
                     if (Math.random() < 0.5) {
                         const types: ('battery' | 'health' | 'credits')[] = ['battery', 'health', 'credits'];
                         const type = types[Math.floor(Math.random() * types.length)];
                         const value = type === 'credits' ? 100 : 35; // Increased credits and battery/hp restores
                         const loot = new LootDrop(enemy.mesh.position, type, value);
                         this.scene.add(loot.mesh);
                         this.activeLoot.push(loot);
                     }
                 }
              } else {
                  enemy.update(delta, currentEnemyTarget);
              }
              continue;
          }

          const attackResult = enemy.update(delta, currentEnemyTarget);
          
          if (attackResult === 'shriek') {
               this.addTrauma(0.4);
               this.soundManager.playScreamer(); 
               if (enemy.mesh.position.distanceTo(this.camera.position) < 8) {
                   this.generatorHp -= 5;
               }
          } else if (attackResult === 'spawn') {
               const minion = new NormalEnemy();
               minion.mesh.position.copy(enemy.mesh.position).add(new THREE.Vector3((Math.random()-0.5)*5, 0, (Math.random()-0.5)*5));
               this.enemies.push(minion);
               this.scene.add(minion.mesh);
          } else if (attackResult === 'stomp') {
               this.addTrauma(0.6);
               this.soundManager.playThunder(); // loud boom for stomp
               // Massive screen shake from stomp
               this.velocity.y += 2.0; 
               if (this.generatorHp > 0) {
                   this.generatorHp -= 5; // Reduced stomp damage per user request
               }
          }

          if (enemy.type === EnemyType.SPITTER) {
              const spitter = enemy as any;
              spitter.lastShot += delta;
              if (spitter.lastShot > 3.0 && !spitter.isDead && !this.isGeneratorDisabled) {
                  // Check line of sight to player
                  this.raycaster.set(spitter.mesh.position, this.tempVec3Alt.subVectors(this.camera.position, spitter.mesh.position).normalize());
                  const hits = this.raycaster.intersectObjects(this.occlusionObjects, true);
                  let obstructed = false;
                  for (const hit of hits) {
                      if (hit.distance < spitter.mesh.position.distanceTo(this.camera.position)) {
                          obstructed = true;
                          break;
                      }
                  }
                  if (!obstructed) {
                      spitter.lastShot = 0;
                      const dir = new THREE.Vector3().subVectors(this.camera.position, spitter.mesh.position).normalize();
                      const proj = new EnemyProjectile(spitter.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), dir);
                      this.scene.add(proj.mesh);
                      this.activeProjectiles.push(proj);
                      this.soundManager.playSpitSound(this.scene, spitter.mesh.position);
                  }
              }
          }

          if (this.flashlight.isLightOn()) {
              const toEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, this.camera.position).normalize();
              const angle = toEnemy.angleTo(lightDir);
              
              if (angle < this.flashlight.getEffectiveAngle() && enemy.mesh.position.distanceTo(this.camera.position) < 20) {
                  this.raycaster.set(playerPos, toEnemy);
                  const hits = this.raycaster.intersectObjects(this.occlusionObjects, true);
                  let obstructed = false;
                  for(const hit of hits) {
                       if (hit.distance < enemy.mesh.position.distanceTo(playerPos)) {
                           // Ignore transparent objects like windows
                           const mat = (hit.object as THREE.Mesh).material as any;
                           if (mat && mat.transparent && mat.opacity < 0.5) continue;
                           
                           if (Math.abs(playerPos.x) < 2.5 && Math.abs(playerPos.z) < 2.5 && (hit.object.parent === this.boothGroup || hit.object === this.boothGroup)) continue;

                           obstructed = true; 
                           break;
                       }
                  }

                  if (!obstructed) {
                      let dmg = (200 / (enemy.mesh.position.distanceTo(playerPos) + 1)) * delta * this.damageMultiplier;
                      if(this.flashlight.isOvercharging()) {
                          dmg *= 20; // Massive damage burst
                          enemy.stun(2.0); // Stun for 2 seconds
                      }

                      const mode = this.flashlight.getMode();
                      if (mode === FlashlightMode.UV && enemy.type === EnemyType.PHANTOM) {
                          dmg *= 5.0; // UV melts Phantoms
                          enemy.stun(0.5);
                      } else if (mode === FlashlightMode.STROBE) {
                          enemy.stun(0.2); // Constant micro-stuns
                          dmg *= 0.5; // Less damage in strobe mode
                      }

                      if (enemy.type === EnemyType.FAST) dmg *= 2.0; 
                      if (enemy.type === EnemyType.TANK) dmg *= 0.5; 
                      const { died, damage, isCritical } = enemy.takeDamage(dmg, enemy.mesh.position, new THREE.Vector3(0,1,0), this.burnTexture);
                      if (damage > 0) this.spawnDamageText(damage, enemy.mesh.position, isCritical);
                      if (died) {
                          if (enemy.isHallucination) {
                              this.soundManager.playHallucinationVanish();
                              this.addTrauma(0.2); // Taking out a hallucination still stresses you
                          } else {
                              this.soundManager.playHitMarker();
                              this.hitMarkerTrigger++;
                          }
                      }
                  }
              }
          }

          const killRadius = 1.0 + (enemy.mesh.scale.x * 0.5);
          if (enemy.mesh.position.distanceTo(this.camera.position) < killRadius) {
               if (!this.isTutorial) {
                   if (enemy.isHallucination) {
                       enemy.takeDamage(9999); // Instantly kill hallucination
                       this.soundManager.playHallucinationVanish();
                       this.addTrauma(0.5); // Big stress spike
                   } else {
                       this.soundManager.playScreamer(); 
                       this.triggerDeath();
                   }
               }
          }
          
          const genRadius = 2.0 + (enemy.mesh.scale.x * 0.5); // Increased radius for reliable attack
          const distToGen = enemy.mesh.position.distanceTo(genPos);
          const enemyInBooth = Math.abs(ex) < 2.0 && ez > -2.0 && ez < 2.0;

          if (distToGen < genRadius && enemyInBooth) {
              if (this.generatorHp > 0 && !this.isTutorial) {
                  let dps = 5;
                  if (enemy.type === EnemyType.TANK || enemy.type === EnemyType.LEVIATHAN || enemy.type === EnemyType.FOREST_HEART) dps = 20;
                  this.generatorHp -= dps * delta;
                  this.addTrauma(0.5 * delta);
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
           this.turretGroup.visible = this.turretLevel > 0;
           
           if (this.turretLevel > 0) {
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
                        const fireRate = Math.max(0.1, 1.2 - (this.turretLevel * 0.2)); 
                        const damage = 2 + (this.turretLevel * 3); 
                        
                        this.turretCooldown = fireRate;
                        this.turretAmmo--;
                        const { died, damage: dmgDealt, isCritical } = this.turretTarget.takeDamage(damage);
                        if (dmgDealt > 0) this.spawnDamageText(dmgDealt, this.turretTarget.mesh.position, isCritical);
                        if (died) {
                            this.soundManager.playHitMarker();
                            this.hitMarkerTrigger++;
                        }
                        this.sparkSystem.emit(this.turretTarget.mesh.position, 2);
                        this.soundManager.playTurretShoot();
                        
                        // Small recoil effect on turret head
                        this.turretHead.position.z = -0.1;
                        gsap.to(this.turretHead.position, { z: 0, duration: 0.1 });
                        this.addTrauma(0.02 * this.turretLevel);
                    }
                }
               if (this.turretCooldown > 0) this.turretCooldown -= delta;
           }
      }
      
      if (this.teslaMesh && this.teslaLevel > 0 && !this.isGeneratorDisabled) {
          if (this.teslaCooldown > 0) this.teslaCooldown -= delta;
          if (this.teslaCooldown <= 0) {
              let hitAny = false;
              const range = 5 + (this.teslaLevel * 2);
              const dmg = 15 + (this.teslaLevel * 10);
              
              for (const e of this.enemies) {
                  if (e.isDead) continue;
                  if (e.mesh.position.distanceTo(this.teslaMesh.position) < range) {
                      const { died, damage: dmgDealt, isCritical } = e.takeDamage(dmg);
                      if (dmgDealt > 0) this.spawnDamageText(dmgDealt, e.mesh.position, isCritical);
                      e.stun(1.0); // Stun for 1 second
                      
                      // Draw lightning
                      const points = [this.teslaMesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), e.mesh.position.clone().add(new THREE.Vector3(0, 1, 0))];
                      const geo = new THREE.BufferGeometry().setFromPoints(points);
                      const mat = new THREE.LineBasicMaterial({color: 0xaaccff, linewidth: 2});
                      const line = new THREE.Line(geo, mat);
                      this.scene.add(line);
                      setTimeout(() => this.scene.remove(line), 100);
                      
                      this.soundManager.playTeslaZap(this.scene, this.teslaMesh.position);
                      hitAny = true;
                  }
              }
              if (hitAny) {
                  this.teslaCooldown = Math.max(1.0, 3.0 - (this.teslaLevel * 0.5));
              }
          }
      }
      
      for (let i = this.activeFlares.length - 1; i >= 0; i--) {
          const f = this.activeFlares[i];
          f.update(delta, this.scene);
          if (f.life <= 0) this.activeFlares.splice(i, 1);
      }

      for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
          const p = this.activeProjectiles[i];
          p.update(delta);
          
          // Check collision with player
          if (p.mesh.position.distanceTo(this.camera.position) < 1.0) {
              this.addTrauma(0.5);
              this.soundManager.playScreamer();
              // Small damage to generator if hit
              if (this.generatorHp > 0) {
                  this.generatorHp -= p.damage;
                  if (this.generatorHp <= 0) {
                      this.isGeneratorDisabled = true;
                      this.generatorHp = 0;
                      this.flashlight.turnOff();
                  }
              }
              this.scene.remove(p.mesh);
              this.activeProjectiles.splice(i, 1);
              continue;
          }
          
          if (p.life <= 0) {
              this.scene.remove(p.mesh);
              this.activeProjectiles.splice(i, 1);
          }
      }

      for (let i = this.activeMines.length - 1; i >= 0; i--) {
          const m = this.activeMines[i];
          m.update(delta);
          if (m.isTriggered) {
              this.activeMines.splice(i, 1);
          } else if (m.isArmed) {
              for (const enemy of this.enemies) {
                  if (!enemy.isDead && enemy.mesh.position.distanceTo(m.mesh.position) < m.radius) {
                      m.isTriggered = true;
                      this.soundManager.playThunder(); // Re-use thunder sound for explosion
                      this.sparkSystem.emit(m.mesh.position, 50);
                      this.scene.remove(m.mesh);
                      
                      // Damage all enemies in radius
                      let anyDied = false;
                      for (const e of this.enemies) {
                          if (!e.isDead && e.mesh.position.distanceTo(m.mesh.position) < m.radius * 1.5) {
                              const { died, damage, isCritical } = e.takeDamage(m.damage, e.mesh.position, new THREE.Vector3(0,1,0), this.burnTexture);
                              if (damage > 0) this.spawnDamageText(damage, e.mesh.position, isCritical);
                              if (died) {
                                  anyDied = true;
                                  this.hitMarkerTrigger++;
                              }
                              e.stun(3.0);
                          }
                      }
                      if (anyDied) this.soundManager.playHitMarker();
                      break;
                  }
              }
          }
      }

      this.sparkSystem.update(delta);
      this.updateGeneratorScreen();
      
      const hpRatio = this.generatorHp / this.maxGeneratorHp;
      this.soundManager.updateGeneratorSound(hpRatio, this.isGeneratorDisabled);

      // Fan animation
      if (this.fanMesh && this.fanMesh.userData.blades) {
          if (this.isFanOn && !this.isGeneratorDisabled) {
              this.fanSpeed = Math.min(this.fanSpeed + delta * 5, 20);
          } else {
              this.fanSpeed = Math.max(this.fanSpeed - delta * 2, 0);
          }
          this.fanMesh.userData.blades.rotation.z += this.fanSpeed * delta;
      }

      // Generator light flickering based on HP
      if (this.isGeneratorDisabled) {
          this.boothLight.intensity = 0;
          this.emergencyLight.intensity = (Math.sin(now * 8) > 0) ? 15 : 0;
          
          this.sparkTimer += delta;
          if (this.sparkTimer > 0.5) {
              this.sparkSystem.emit(this.generatorGroup.position.clone().add(new THREE.Vector3(0, 1, 0)), 5);
              this.sparkTimer = 0;
          }
      } else {
          this.emergencyLight.intensity = 0;
          const hpRatio = this.generatorHp / this.maxGeneratorHp;
          if (hpRatio < 0.5) {
              const flickerChance = (0.5 - hpRatio) * 2; 
              if (Math.random() < flickerChance * 0.2) {
                  this.boothLight.intensity = Math.random() * 5;
              } else {
                  this.boothLight.intensity = 20.0;
              }
              
              this.sparkTimer += delta;
              if (this.sparkTimer > 1.5) {
                  this.sparkSystem.emit(this.generatorGroup.position.clone().add(new THREE.Vector3(0, 1, 0)), 2);
                  this.sparkTimer = 0;
              }
          } else {
              this.boothLight.intensity = 20.0;
          }
      }

      // Update Stress & Trauma
      for (let i = this.activeLoot.length - 1; i >= 0; i--) {
          const loot = this.activeLoot[i];
          loot.update(delta);
          
          if (loot.mesh.position.distanceTo(this.camera.position) < 2) {
              if (loot.type === 'battery') this.flashlight.setBattery(this.flashlight.getBattery() + loot.value);
              if (loot.type === 'health') this.generatorHp = Math.min(100, this.generatorHp + loot.value);
              if (loot.type === 'credits') this.credits += loot.value;
              
              this.soundManager.playClick(); 
              this.scene.remove(loot.mesh);
              this.activeLoot.splice(i, 1);
              continue;
          }
          
          if (loot.life <= 0) {
              this.scene.remove(loot.mesh);
              this.activeLoot.splice(i, 1);
          }
      }

      let enemyNear = false;
      let minEnemyDist = Infinity;
      for(const e of this.enemies) {
          if (!e.isDead) {
              const dist = e.mesh.position.distanceTo(this.camera.position);
              if (dist < minEnemyDist) minEnemyDist = dist;
              if (dist < 10) enemyNear = true;
          }
      }
      this.nearestEnemyDistance = minEnemyDist === Infinity ? null : minEnemyDist;

      if (this.phase === GamePhase.NIGHT) {
          if (this.isBloodMoon && this.generatorHp > 0 && !this.isGeneratorDisabled) {
              // Ambient drain from the anomalous environment. Made easier per user request
              this.generatorHp -= delta * 0.2;
              if (this.generatorHp <= 0) {
                  this.generatorHp = 0;
                  this.isGeneratorDisabled = true;
                  this.flashlight.turnOff();
                  this.soundManager.playScreamer();
              }
          }
      }
      
      // Update Post-processing 
      if (this.bloomPass) {
          const pulse = Math.sin(now * 5) * 0.5 + 0.5;
          this.bloomPass.strength = 1.5;
      }

      // Check if aiming at enemy - OPTIMIZED: Only raycast against existing enemies
      let isAimingEnemy = false;
      if (this.enemies.length > 0) {
          this.raycaster.setFromCamera(this.tempVec2.set(0,0), this.camera);
          const enemyMeshes = this.enemies.map(e => e.mesh);
          const intersects = this.raycaster.intersectObjects(enemyMeshes, true);
          if (intersects.length > 0 && intersects[0].distance < 20) {
              isAimingEnemy = true;
          }
      }

      this.composer.render();
      
      // OPTIMIZED stats update: throttle to 20fps to prevent UI-driven lag
      if (Date.now() - this.statsUpdateTimer > 50) {
          this.statsUpdateTimer = Date.now();
          this.onStatsUpdate(
              this.flashlight.getBattery(), this.generatorHp, this.wave, this.credits, 
              this.isGeneratorDisabled, this.restartProgress, this.totalKills, 
              this.killsByType, this.turretAmmo, this.stamina,
              this.flashlight.getOverchargeCooldown(),
              this.dashCooldown,
              this.hitMarkerTrigger,
              isAimingEnemy,
              this.isBloodMoon,
              this.nearestEnemyDistance,
              this.flashlight.getMode(),
              this.tutorialText,
              this.currentRadioMessage
          );
      }
      
      if (this.phase === GamePhase.NIGHT && this.enemies.length === 0 && this.wave > 0) {
          this.endNight();
      }
  }
  
  public applyCustomTexture(target: string, base64: string) {
      const img = new Image();
      img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          
          if (target === 'ground' && this.materials.ground) {
              tex.repeat.set(10, 10);
              (this.materials.ground as THREE.MeshPhysicalMaterial).map = tex;
              this.materials.ground.needsUpdate = true;
          } else if (target === 'wood' && this.materials.wood) {
              (this.materials.wood as THREE.MeshStandardMaterial).map = tex;
              this.materials.wood.needsUpdate = true;
          } else if (target === 'metal' && this.materials.metal) {
              (this.materials.metal as THREE.MeshStandardMaterial).map = tex;
              this.materials.metal.needsUpdate = true;
          } else if (target === 'trunk' && this.materials.trunk) {
              (this.materials.trunk as THREE.MeshStandardMaterial).map = tex;
              this.materials.trunk.needsUpdate = true;
          } else if (target === 'leaves' && this.materials.leaves) {
              (this.materials.leaves as THREE.MeshStandardMaterial).map = tex;
              this.materials.leaves.needsUpdate = true;
          } else if (target === 'ceramic' && this.materials.ceramic) {
              (this.materials.ceramic as THREE.MeshStandardMaterial).map = tex;
              this.materials.ceramic.needsUpdate = true;
          } else if (target === 'plastic' && this.materials.plastic) {
              (this.materials.plastic as THREE.MeshStandardMaterial).map = tex;
              this.materials.plastic.needsUpdate = true;
          }
      };
      img.src = base64;
  }

  public dispose() {
      this.isDisposed = true;
      cancelAnimationFrame(this.animationId);
      window.removeEventListener('resize', this.boundResize);
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.domElement.removeEventListener('mousedown', this.boundMouseDown);
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
      document.removeEventListener('pointerlockerror', this.boundPointerLockError);
      
      if (this.container && this.renderer.domElement) {
          try {
            this.container.removeChild(this.renderer.domElement);
          } catch (e) {
              console.warn("Could not remove canvas from container", e);
          }
      }
      
      this.renderer.dispose();
  }
}
