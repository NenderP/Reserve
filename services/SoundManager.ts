

import * as THREE from 'three';
import { EnemyType } from '../types';

export class SoundManager {
  private listener: THREE.AudioListener;
  private context: AudioContext;
  private buffers: Map<string, AudioBuffer> = new Map();
  
  // Active Sound References
  private generatorHum: THREE.PositionalAudio | null = null;
  private flashlightWhine: THREE.Audio | null = null;
  private rainAmbience: THREE.Audio | null = null;
  private breathingSound: THREE.Audio | null = null;
  private heartbeatSound: THREE.Audio | null = null;
  
  // Interactables
  private fanSound: THREE.PositionalAudio | null = null;
  private radioSound: THREE.PositionalAudio | null = null;

  private isAudioResumed: boolean = false;

  constructor() {
    this.listener = new THREE.AudioListener();
    this.context = this.listener.context;
    this.generateProceduralBuffers();
  }

  public getListener(): THREE.AudioListener {
      return this.listener;
  }

  public async resume() {
      if (!this.isAudioResumed && this.context.state === 'suspended') {
          await this.context.resume();
          this.isAudioResumed = true;
      }
  }

  private generateProceduralBuffers() {
      const sr = this.context.sampleRate;

      const createBuffer = (duration: number, fn: (t: number, i: number) => number) => {
          const buffer = this.context.createBuffer(1, sr * duration, sr);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
              data[i] = fn(i / sr, i);
          }
          return buffer;
      };

      // 1. Generator Hum
      this.buffers.set('gen_hum', createBuffer(2.0, (t) => {
          return (Math.sin(t * 100 * Math.PI * 2) * 0.6 + 
                  Math.sin(t * 115 * Math.PI * 2) * 0.2 + 
                  (Math.random() - 0.5) * 0.05) * 0.3;
      }));

      // 2. Flashlight Click
      this.buffers.set('click', createBuffer(0.05, (t) => {
          return (Math.random() - 0.5) * Math.exp(-t * 100);
      }));

      // 3. Low Battery Whine
      this.buffers.set('whine', createBuffer(1.0, (t) => {
          return Math.sin(t * 6000 * Math.PI * 2) * 0.1; 
      }));

      // 4. Forest Snap
      this.buffers.set('snap', createBuffer(0.15, (t) => {
          return (Math.random() - 0.5) * (1 - t/0.15) * (Math.sin(t * 500) > 0 ? 1 : -1);
      }));

      // 5. Rain (Pink Noise filtered)
      this.buffers.set('rain', createBuffer(2.0, (t) => {
          const white = Math.random() * 2 - 1;
          return (white * 0.1); // Simple white noise, low vol
      }));

      // 6. Thunder (Low freq impact)
      this.buffers.set('thunder', createBuffer(4.0, (t) => {
          const noise = Math.random() * 2 - 1;
          const env = Math.exp(-t * 2);
          // Low pass approximation via sine summation
          const rumble = Math.sin(t * 50 * Math.PI) * Math.sin(t * 40) * noise;
          return rumble * env * 0.8;
      }));

      // 7. Flare Hiss (High freq noise)
      this.buffers.set('flare', createBuffer(1.0, (t) => {
          return (Math.random() - 0.5) * 0.2 * (1 + Math.sin(t * 20) * 0.2);
      }));

      // 8. Player Breathing (Low frequency noise envelope)
      this.buffers.set('player_breath', createBuffer(3.0, (t) => {
          const phase = Math.sin(t * Math.PI * 0.66); // 1.5 sec in, 1.5 sec out
          const noise = (Math.random() - 0.5);
          // Filter noise to be lower freq (soft)
          return noise * (phase * 0.5 + 0.5) * 0.5;
      }));

      // 8.5 Heartbeat
      this.buffers.set('heartbeat', createBuffer(1.0, (t) => {
          const thump1 = Math.exp(-t * 20) * Math.sin(t * 40 * Math.PI);
          const thump2 = t > 0.3 ? Math.exp(-(t - 0.3) * 20) * Math.sin((t - 0.3) * 40 * Math.PI) : 0;
          return (thump1 + thump2) * 0.8;
      }));

      // 9. Hit Marker (Sharp tick)
      this.buffers.set('hit_marker', createBuffer(0.05, (t) => {
          return (Math.random() - 0.5) * Math.exp(-t * 200) * 0.5;
      }));

      // 10. Turret Shoot (Pew)
      this.buffers.set('turret_shoot', createBuffer(0.1, (t) => {
          const freq = 800 * Math.exp(-t * 30);
          return Math.sin(t * freq * Math.PI * 2) * Math.exp(-t * 20) * 0.4;
      }));

      // 11. Fan Whir
      this.buffers.set('fan', createBuffer(1.0, (t) => {
          const noise = Math.random() * 0.1;
          const hum = Math.sin(t * 200 * Math.PI) * 0.1;
          return noise + hum;
      }));

      // 10. Radio Static
      this.buffers.set('radio', createBuffer(2.0, (t) => {
          const noise = (Math.random() - 0.5) * 0.3;
          // Occasional beep
          const beep = Math.sin(t * 2000 * Math.PI) * (Math.sin(t * 10) > 0.95 ? 0.2 : 0);
          return noise + beep;
      }));

      // Enemy sounds...
      this.buffers.set('step_fast', createBuffer(0.4, (t) => {
          const beat = (t * 7.5) % 1; 
          const env = Math.exp(-beat * 10);
          return (Math.random() - 0.5) * env;
      }));

      this.buffers.set('breath', createBuffer(3.0, (t) => {
          const phase = Math.sin(t * Math.PI * 0.66);
          const noise = (Math.random() - 0.5);
          return noise * (phase * 0.5 + 0.5) * 0.8;
      }));

      this.buffers.set('static', createBuffer(0.5, (t) => {
          const glitch = Math.random() > 0.9 ? 0 : (Math.random() - 0.5);
          return glitch * 0.3;
      }));

      this.buffers.set('screamer', createBuffer(2.0, (t) => {
          const s1 = (t * 400) % 1; 
          const s2 = (t * 630) % 1; 
          const n = (Math.random() - 0.5);
          return (s1 + s2 + n) * (1.0 - t/2.0) * 0.8; 
      }));

      this.buffers.set('bird', createBuffer(0.4, (t) => {
          const freq = 2000 + Math.sin(t * 50) * 500 - (t * 4000); 
          const osc = Math.sin(t * freq * Math.PI * 2);
          const env = Math.max(0, 1 - t/0.3);
          return osc * env * 0.1;
      }));

      // FIX: Add overcharge sound buffer
      this.buffers.set('overcharge_start', createBuffer(0.5, (t) => {
        const risingTone = Math.sin(t * (1000 + t * 8000) * Math.PI * 2);
        const noise = (Math.random() - 0.5) * 0.5;
        const env = Math.exp(-t * 5);
        return (risingTone + noise) * env * 0.7;
      }));
  }

  public setupGeneratorSound(mesh: THREE.Object3D) {
      if (!this.buffers.has('gen_hum')) return;
      this.generatorHum = new THREE.PositionalAudio(this.listener);
      this.generatorHum.setBuffer(this.buffers.get('gen_hum')!);
      this.generatorHum.setRefDistance(3);
      this.generatorHum.setMaxDistance(15);
      this.generatorHum.setLoop(true);
      this.generatorHum.setVolume(0.025); 
      mesh.add(this.generatorHum);
      this.generatorHum.play();
  }

  public setupInteractableSound(mesh: THREE.Object3D, type: 'fan' | 'radio'): THREE.PositionalAudio | null {
      if (!this.buffers.has(type)) return null;
      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(this.buffers.get(type)!);
      sound.setRefDistance(1);
      sound.setMaxDistance(5);
      sound.setLoop(true);
      sound.setVolume(0); // Start silent
      mesh.add(sound);
      return sound;
  }

  public setupPlayerBreathing(camera: THREE.Camera) {
      if (!this.buffers.has('player_breath')) return;
      this.breathingSound = new THREE.Audio(this.listener);
      this.breathingSound.setBuffer(this.buffers.get('player_breath')!);
      this.breathingSound.setLoop(true);
      this.breathingSound.setVolume(0);
      camera.add(this.breathingSound as any);
      this.breathingSound.play();
  }

  public updateBreathing(intensity: number) {
      if (!this.breathingSound) return;
      // intensity 0 to 1
      const targetVol = Math.max(0, Math.min(1, intensity)) * 0.3;
      // Smooth transition
      const current = this.breathingSound.getVolume();
      this.breathingSound.setVolume(current + (targetVol - current) * 0.1);
      
      // Speed up playback slightly when stressed
      const targetRate = 1.0 + (intensity * 0.3);
      const currentRate = this.breathingSound.playbackRate;
      this.breathingSound.setPlaybackRate(currentRate + (targetRate - currentRate) * 0.1);
  }

  public updateHeartbeat(stress: number) {
      if (!this.isAudioResumed) return;
      if (!this.heartbeatSound) {
          this.heartbeatSound = new THREE.Audio(this.listener);
          this.heartbeatSound.setBuffer(this.buffers.get('heartbeat')!);
          this.heartbeatSound.setLoop(true);
          this.heartbeatSound.setVolume(0);
          this.heartbeatSound.play();
      }
      
      if (stress > 0.3) {
          const factor = (stress - 0.3) / 0.7; // 0 to 1
          const targetVol = factor * 1.0;
          const current = this.heartbeatSound.getVolume();
          this.heartbeatSound.setVolume(current + (targetVol - current) * 0.1);
          
          const targetRate = 1.0 + factor * 0.5;
          const currentRate = this.heartbeatSound.playbackRate;
          this.heartbeatSound.setPlaybackRate(currentRate + (targetRate - currentRate) * 0.1);
      } else {
          const current = this.heartbeatSound.getVolume();
          this.heartbeatSound.setVolume(current * 0.9);
      }
  }

  // FIX: Add overcharge sound player
  public playOverchargeStart() {
      if (!this.buffers.has('overcharge_start')) return;
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(this.buffers.get('overcharge_start')!);
      sound.setVolume(0.5);
      sound.setLoop(false);
      sound.play();
  }

  public playClick() {
      if (!this.buffers.has('click')) return;
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(this.buffers.get('click')!);
      sound.setVolume(0.2); 
      sound.play();
  }

  public playScreamer() {
      if (!this.buffers.has('screamer')) return;
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(this.buffers.get('screamer')!);
      sound.setVolume(0.6); 
      sound.setLoop(false);
      sound.play();
  }

  public playThunder() {
      if (!this.buffers.has('thunder')) return;
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(this.buffers.get('thunder')!);
      sound.setVolume(1.0);
      // Randomize playback rate for different thunder sounds
      sound.setPlaybackRate(0.8 + Math.random() * 0.4);
      sound.play();
  }

  public toggleRain(enable: boolean) {
      if (enable) {
          if (!this.rainAmbience && this.buffers.has('rain')) {
              this.rainAmbience = new THREE.Audio(this.listener);
              this.rainAmbience.setBuffer(this.buffers.get('rain')!);
              this.rainAmbience.setLoop(true);
              this.rainAmbience.setVolume(0.15);
              this.rainAmbience.play();
          }
      } else {
          if (this.rainAmbience) {
              this.rainAmbience.stop();
              this.rainAmbience = null;
          }
      }
  }

  public playHitMarker() {
      if (!this.buffers.has('hit_marker')) return;
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(this.buffers.get('hit_marker')!);
      sound.setVolume(0.8);
      sound.play();
  }

  public playTurretShoot() {
      if (!this.buffers.has('turret_shoot')) return;
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(this.buffers.get('turret_shoot')!);
      sound.setVolume(0.4);
      sound.play();
  }

  public createFlareSound(mesh: THREE.Object3D): THREE.PositionalAudio | null {
      if (!this.buffers.has('flare')) return null;
      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(this.buffers.get('flare')!);
      sound.setRefDistance(5);
      sound.setLoop(true);
      sound.setVolume(0.5);
      mesh.add(sound);
      sound.play();
      return sound;
  }

  public setupFlashlightWhine(camera: THREE.Camera) {
      if (!this.buffers.has('whine')) return;
      this.flashlightWhine = new THREE.Audio(this.listener);
      this.flashlightWhine.setBuffer(this.buffers.get('whine')!);
      this.flashlightWhine.setLoop(true);
      this.flashlightWhine.setVolume(0);
      camera.add(this.flashlightWhine as any); 
      this.flashlightWhine.play();
  }

  public updateFlashlightWhine(battery: number) {
      if (!this.flashlightWhine) return;
      if (battery < 20 && battery > 0) {
          const intensity = (1.0 - (battery / 20.0)); 
          this.flashlightWhine.setVolume(intensity * 0.03);
          this.flashlightWhine.setPlaybackRate(1.0 - (intensity * 0.1)); 
      } else {
          this.flashlightWhine.setVolume(0);
      }
  }

  public attachEnemySound(enemyMesh: THREE.Mesh, type: EnemyType) {
      let bufferName = '';
      let refDist = 5;
      let volume = 1.0;

      switch(type) {
          case EnemyType.FAST: 
              bufferName = 'step_fast'; 
              refDist = 10; 
              volume = 0.4;
              break;
          case EnemyType.TANK: 
              bufferName = 'breath'; 
              refDist = 15; 
              volume = 0.6;
              break;
          case EnemyType.GLITCHER: 
              bufferName = 'static'; 
              refDist = 8; 
              volume = 0.3;
              break;
          default: return; 
      }

      if (this.buffers.has(bufferName)) {
          const sound = new THREE.PositionalAudio(this.listener);
          sound.setBuffer(this.buffers.get(bufferName)!);
          sound.setRefDistance(refDist);
          sound.setLoop(true);
          sound.setVolume(volume);
          sound.play();
          enemyMesh.add(sound);
      }
  }

  public playRandomForestSound(scene: THREE.Scene, playerPos: THREE.Vector3) {
      if (!this.buffers.has('snap')) return;

      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(this.buffers.get('snap')!);
      sound.setRefDistance(10);
      sound.setVolume(0.5);

      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 15;
      sound.position.set(
          playerPos.x + Math.cos(angle) * dist,
          Math.random() * 5, 
          playerPos.z + Math.sin(angle) * dist
      );

      scene.add(sound);
      sound.play();

      setTimeout(() => {
          if (sound.parent) sound.parent.remove(sound);
      }, 500); 
  }

  public playBirdSound(scene: THREE.Scene, playerPos: THREE.Vector3) {
      if (!this.buffers.has('bird')) return;

      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(this.buffers.get('bird')!);
      sound.setRefDistance(20);
      sound.setVolume(0.3);

      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 20;
      sound.position.set(
          playerPos.x + Math.cos(angle) * dist,
          5 + Math.random() * 5, 
          playerPos.z + Math.sin(angle) * dist
      );

      scene.add(sound);
      sound.play();
      
      setTimeout(() => {
          if (sound.parent) sound.parent.remove(sound);
      }, 1000); 
  }
}