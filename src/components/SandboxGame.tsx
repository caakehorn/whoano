import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { motion, AnimatePresence } from 'motion/react';
import { Crosshair, Target, Zap, Activity, Info, Trophy } from 'lucide-react';

const { Engine, Bodies, Body, Events, World } = Matter;

type Notification = {
  id: number;
  title: string;
  subtitle: string;
  color: string;
};

export default function SandboxGame({ onExit }: { onExit?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // HUD Refs for high-freq updates without re-renders
  const scoreRef = useRef<HTMLSpanElement>(null);
  const streakRef = useRef<HTMLSpanElement>(null);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const velyRef = useRef<HTMLSpanElement>(null);
  const velxRef = useRef<HTMLSpanElement>(null);
  const stabilityRef = useRef<HTMLSpanElement>(null);
  
  // Game State
  const [levelType, setLevelType] = useState<'SANDBOX' | 'DOWNHILL_30' | 'DYNAMIC_HILLS' | 'SONIC_PROTOTYPE'>('SANDBOX');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [pulses, setPulses] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isScored, setIsScored] = useState(false);

  // Use refs for internal physics tracking
  const stateRef = useRef({
    score: 0,
    streak: 1,
    charge: 0,
    lastTapTime: 0,
    lastTapKey: '',
    pulses: 0,
    lastSurfaceContact: -1000,
    wasAirborne: false,
    apexGauge: 0,
    apexActive: false,
    shakeX: 0,
    shakeY: 0,
    shakeDecay: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    keys: {} as Record<string, boolean>,
    trailPoints: [] as {x: number, y: number, s: number, color?: string}[],
    notifIdCounter: 0,
    isDrawing: false,
    drawStartX: 0, drawStartY: 0, drawCurrX: 0, drawCurrY: 0,
    customBodies: [] as Matter.Body[],
    particles: [] as {x: number, y: number, vx: number, vy: number, life: number, maxLife: number, color: string}[],
    chainCount: 0,
    currentTrick: null as string | null,
    trickStartTime: 0,
    psychedelia: 0
  });

  const bgEffectRef = useRef<HTMLDivElement>(null);

  const showNotif = (title: string, subtitle: string, color: string) => {
    stateRef.current.notifIdCounter++;
    const newNotif = {
      id: stateRef.current.notifIdCounter,
      title,
      subtitle,
      color
    };
    setNotifications(prev => [...prev.slice(-2), newNotif]); // Keep max 3 on screen
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotif.id));
    }, 2000); // clear after 2 seconds
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    let W = window.innerWidth;
    let H = window.innerHeight;
    canvasRef.current.width = W;
    canvasRef.current.height = H;

    // Increased Gravity for Downhill Speed
    const engine = Engine.create({ gravity: { x: 0, y: levelType === 'SANDBOX' ? 2 : 8, scale: 0.001 } });
    const world = engine.world;
    
    // Create bodies
    const ballRadius = 20; // Slightly larger for downhill
    const ball = Bodies.circle(W * 0.1, -H * 0.5, ballRadius, {
      restitution: 0.75, // Higher for snappy, explosive bounces
      friction: 0.001, 
      frictionAir: 0.001, // Extremely low for minimal drag
      density: 0.015,     // Higher density for more weight/punchiness
      label: 'ball'
    });

    // Generate Terrain based on levelType
    const terrain = [];
    let currY = 0; // Maintain scope for reset check
    
    if (levelType === 'SANDBOX') {
        currY = window.innerHeight; // baseline for reset
        const ground = Bodies.rectangle(W/2, H+25, W*10, 50, { isStatic: true, label: 'surface', restitution: 0.1, friction: 0.001 });
        const wallL = Bodies.rectangle(-25, -H*4, 50, H*10, { isStatic: true, label: 'surface', restitution: 0.1, friction: 0.001 });
        const wallR = Bodies.rectangle(W*2+25, -H*4, 50, H*10, { isStatic: true, label: 'surface', restitution: 0.1, friction: 0.001 });
        const ceiling = Bodies.rectangle(W/2, -H*4 - 25, W*10, 50, { isStatic: true, label: 'surface', restitution: 0.1, friction: 0.001 });
        
        // Static Trick Ramps
        const rampL = Bodies.rectangle(W * 0.1, H * 0.7, 500, 30, { isStatic: true, angle: -Math.PI / 8, label: 'surface', restitution: 0.1, friction: 0.001, chamfer: { radius: 10 } });
        const rampR = Bodies.rectangle(W * 0.9, H * 0.5, 400, 30, { isStatic: true, angle: Math.PI / 6, label: 'surface', restitution: 0.1, friction: 0.001, chamfer: { radius: 10 } });
        const rampM = Bodies.rectangle(W * 0.5, H * 0.2, 300, 20, { isStatic: true, angle: 0, label: 'surface', restitution: 0.1, friction: 0.001, chamfer: { radius: 10 } });
        const bowlL = Bodies.circle(W * 0.3, H, 300, { isStatic: true, label: 'surface', restitution: 0.1, friction: 0.001 });
        
        terrain.push(ground, wallL, wallR, ceiling, rampL, rampR, rampM, bowlL);
        
        Body.setPosition(ball, { x: W * 0.3, y: H * 0.4 });
    } else {
        // Procedural generation
        const segments = 200;
        const segWidth = 400;
        let currX = -500;
        currY = 0;
        
        for (let i = 0; i < segments; i++) {
            let angle = 0;
            if (levelType === 'DOWNHILL_30') {
               angle = Math.PI / 6; // strictly ~30 degrees downhill
            } else if (levelType === 'SONIC_PROTOTYPE') {
                // Loops, steep drops, and speed sections
                if (i % 20 === 0) angle = Math.PI / 2; // Steep drop
                else if (i % 20 < 5) angle = 0; // Flat speed
                else if (i % 20 < 10) angle = -Math.PI / 4; // Loop up
                else angle = Math.PI / 8; // Gentle downhill
            } else {
               // DYNAMIC_HILLS
               angle = Math.PI / 16 + Math.random() * 0.1; 
               if (i % 6 === 0) angle = -Math.PI / 8; // ramp up
               else if (i % 7 === 0) angle = Math.PI / 4; // steep drop
            }
            
            const dx = Math.cos(angle) * segWidth;
            const dy = Math.sin(angle) * segWidth;
            const midX = currX + dx / 2;
            const midY = currY + dy / 2;
            
            const rect = Bodies.rectangle(midX, midY, segWidth + 20, 60, { 
                isStatic: true, 
                angle: angle, 
                label: 'surface', 
                restitution: 0.25, // Increased bounciness for better launch
                friction: 0.005,    // Slightly higher friction to allow grip for the jump
            });
            terrain.push(rect);
            
            const circle = Bodies.circle(currX, currY, 15, { // Smaller radius joiner
                isStatic: true,
                label: 'surface',
                restitution: 0.25,
                friction: 0.005
            });
            terrain.push(circle);
            
            currX += dx;
            currY += dy;
        }
        Body.setPosition(ball, { x: W * 0.1, y: -H * 0.5 });
    }

    stateRef.current.customBodies = terrain;

    // Remove Hoop
    // const hoopSensor = ...

    World.add(world, [ball, ...terrain]);

    const triggerShake = (amount: number) => {
      stateRef.current.shakeX = (Math.random()-0.5) * amount * 2;
      stateRef.current.shakeY = (Math.random()-0.5) * amount * 2;
      stateRef.current.shakeDecay = amount;
    };

    let scoredLock = false;
    const scoreGoal = () => {
      if (scoredLock) return;
      scoredLock = true;
      setIsScored(true);
      setTimeout(() => { 
        scoredLock = false; 
        setIsScored(false); 
      }, 800);
      
      stateRef.current.streak++;
      const pts = 100 * stateRef.current.streak;
      stateRef.current.score += pts;
      
      setScore(stateRef.current.score);
      setStreak(stateRef.current.streak);
      
      triggerShake(8);
      showNotif('SCORE!', `+${pts}`, '#00ff88');
    };

    Events.on(engine, 'collisionStart', event => {
      event.pairs.forEach(pair => {
        const { bodyA, bodyB, collision } = pair;
        const isBall = bodyA.label === 'ball' || bodyB.label === 'ball';
        const isSurface = bodyA.label === 'surface' || bodyB.label === 'surface';
        const isBouncy = bodyA.label === 'bouncy_pad' || bodyB.label === 'bouncy_pad';
        
        if (isBall && (isSurface || isBouncy)) {
          const st = stateRef.current;
          st.lastSurfaceContact = Date.now();
          
          // Momentum Transfer Calculation (Slope Alignment)
          // Only apply if landing (moving down) to avoid killing speed on ramp uphills/grazes
          if (collision && collision.normal && ball.velocity.y > 2) {
              const normal = collision.normal;
              const surfaceAngle = Math.atan2(normal.y, normal.x);
              const velAngle = Math.atan2(ball.velocity.y, ball.velocity.x);
              const angleDiff = Math.abs(velAngle - (surfaceAngle + Math.PI/2));
              const momentumTransfer = Math.max(0.4, 1 - Math.abs(angleDiff) / Math.PI);
              
              Body.setVelocity(ball, { 
                  x: ball.velocity.x * momentumTransfer, 
                  y: ball.velocity.y * momentumTransfer 
              });
          }

          // Bounce Bonus
          stateRef.current.streak++;
          const pts = 50 * stateRef.current.streak;
          stateRef.current.score += pts;
          setScore(stateRef.current.score);
          setStreak(stateRef.current.streak);

          const vel = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
          const color = isBouncy ? '#f43f5e' : '#94a3b8';
          const intensity = isBouncy ? 0.6 : 0.4;
          triggerShake(Math.min(vel * intensity, isBouncy ? 8 : 5));
          if (vel > 5) {
             for(let i=0; i< (isBouncy ? 15 : 8); i++) {
                stateRef.current.particles.push({
                   x: ball.position.x, y: ball.position.y + (isBouncy?0:10),
                   vx: (Math.random()-0.5)*vel * (isBouncy?1.5:1), vy: (isBouncy ? (Math.random()-0.5)*vel*1.5 : -Math.random()*vel),
                   life: 1, maxLife: 0.5 + Math.random(),
                   color
                });
             }
          }
        }
      });
    });

    const resetBall = () => {
      if (levelType === 'SANDBOX') {
        Body.setPosition(ball, { x: W * 0.3, y: H * 0.4 });
      } else if (levelType === 'SONIC_PROTOTYPE') {
        Body.setPosition(ball, { x: W * 0.1, y: -H * 0.2 });
      } else {
        Body.setPosition(ball, { x: W * 0.1, y: -H * 0.5 });
      }
      Body.setVelocity(ball, { x: 0, y: 0 });
      stateRef.current.streak = 1;
      stateRef.current.currentTrick = null;
      setStreak(1);

      // Clean up custom bouncy pads 
      const bouncies = stateRef.current.customBodies.filter(b => b.label === 'bouncy_pad');
      World.remove(world, bouncies);
      stateRef.current.customBodies = stateRef.current.customBodies.filter(b => b.label !== 'bouncy_pad');
    };

    const evaluateTrick = () => {
        const st = stateRef.current;
        if (!st.currentTrick) return;
        
        const vy = ball.velocity.y;
        const absVY = Math.abs(vy);
        const trickName = st.currentTrick;
        
        let quality = '';
        let color = '';
        let points = 0;
        
        if (absVY < 2.0) {
            quality = 'PERFECT';
            color = '#10b981'; // emerald
            points = 1000;
            triggerShake(10);
            st.psychedelia = 1.0;
        } else if (absVY < 6.0) {
            quality = 'GOOD';
            color = '#38bdf8'; // sky
            points = 500;
            triggerShake(4);
            st.psychedelia = 0.4;
        } else {
            quality = 'SLOPPY';
            color = '#f59e0b'; // amber
            points = 100;
        }
        
        st.chainCount++;
        st.streak = st.chainCount;
        setStreak(st.streak);
        
        const totalPts = points * st.streak;
        st.score += totalPts;
        setScore(st.score);
        
        showNotif(`${trickName}!`, `${quality} +${totalPts}`, color);
        
        // Explosion particles
        for(let i=0; i< (points/50); i++) {
           st.particles.push({
             x: ball.position.x, y: ball.position.y,
             vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15,
             life: 1, maxLife: 1, color: color
           });
        }
        
        st.currentTrick = null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const st = stateRef.current;
      st.keys[e.code] = true;
      if (e.code === 'KeyR') resetBall();
      
      // Sonic Spin Dash Charge
      if (e.code === 'KeyS' || e.code === 'ArrowDown') {
          st.charge = 0;
      }
      if ((e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') && (st.keys['KeyS'] || st.keys['ArrowDown'])) {
          const now = Date.now();
          if (now - st.lastTapTime < 200 && st.lastTapKey !== e.code) {
              st.charge = Math.min(st.charge + 5, 20); // Charge up
              st.lastTapTime = now;
              st.lastTapKey = e.code;
              // Visual feedback
              triggerShake(st.charge / 2);
          } else if (now - st.lastTapTime < 500) {
              st.lastTapTime = now;
              st.lastTapKey = e.code;
          }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const st = stateRef.current;
      // Sonic Spin Dash Release
      if ((e.code === 'KeyS' || e.code === 'ArrowDown') && st.charge > 0) {
          Body.applyForce(ball, ball.position, { x: st.charge * 0.005, y: 0 });
          st.charge = 0;
      }
      st.keys[e.code] = false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Mouse / Touch events for drawing bouncy pads
    const handleDown = (clientX: number, clientY: number) => {
      // Convert screen coords to world coords taking zoom and camera into account
      const st = stateRef.current;
      const worldX = (clientX - W/2) / st.cameraZoom + W/2 + st.cameraX;
      const worldY = (clientY - H/2) / st.cameraZoom + H/2 + st.cameraY;
      
      st.isDrawing = true;
      st.drawStartX = worldX;
      st.drawStartY = worldY;
      st.drawCurrX = worldX;
      st.drawCurrY = worldY;
    };
    const handleMove = (clientX: number, clientY: number) => {
      const st = stateRef.current;
      if (st.isDrawing) {
        const worldX = (clientX - W/2) / st.cameraZoom + W/2 + st.cameraX;
        const worldY = (clientY - H/2) / st.cameraZoom + H/2 + st.cameraY;
        st.drawCurrX = worldX;
        st.drawCurrY = worldY;
      }
    };
    const handleUp = () => { 
      const st = stateRef.current;
      if (st.isDrawing) {
        st.isDrawing = false;
        const dx = st.drawCurrX - st.drawStartX;
        const dy = st.drawCurrY - st.drawStartY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 30) {
          const cx = st.drawStartX + dx/2;
          const cy = st.drawStartY + dy/2;
          const angle = Math.atan2(dy, dx);
          const thickness = 14;
          const pad = Bodies.rectangle(cx, cy, dist, thickness, {
            isStatic: true,
            angle: angle,
            restitution: 1.5,
            friction: 0.05,
            label: 'bouncy_pad'
          });
          World.add(world, pad);
          st.customBodies.push(pad);
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => handleDown(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleUp();
    
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      handleDown(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => handleUp();

    const cvs = canvasRef.current;
    cvs.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    cvs.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    const handleResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      if (canvasRef.current) {
        canvasRef.current.width = W;
        canvasRef.current.height = H;
      }
    };
    window.addEventListener('resize', handleResize);

    const ctx = cvs.getContext('2d')!;
    
    let reqId: number;
    let lastTime = performance.now();

    let accumulator = 0;
    const timeStep = 1000 / 60; // Fixed 60fps physics step for extreme smoothness

    const loop = (time: number) => {
      const dt = Math.min(time - lastTime, 100); // cap max dt to avoid spiral of death
      lastTime = time;
      accumulator += dt;

      const st = stateRef.current;

      while (accumulator >= timeStep) {
        const sinceContact = Date.now() - st.lastSurfaceContact;
        const isAirborne = Math.abs(ball.velocity.y) > 0.5 && sinceContact > 150;
        
        // Apply Psychedelia Decay
        if (st.psychedelia > 0) {
           st.psychedelia -= timeStep / 1000;
           if (st.psychedelia < 0) st.psychedelia = 0;
           if (bgEffectRef.current) {
              if (st.psychedelia > 0) {
                 const p = Math.min(1, st.psychedelia);
                 bgEffectRef.current.style.opacity = p.toString();
                 const spin = Date.now() * 0.1;
                 // Using transform instead of filter to maintain 60fps easily
                 bgEffectRef.current.style.transform = `scale(${1 + p*0.2}) rotate(${spin}deg)`;
              } else {
                 bgEffectRef.current.style.opacity = '0';
              }
           }
        }

        // Horizontal/Dash and Jump (always active)
        let dx = 0;
        if (st.keys['KeyA'] || st.keys['ArrowLeft']) dx = -1;
        if (st.keys['KeyD'] || st.keys['ArrowRight']) dx = 1;
        
        // Horizontal Dash
        if (dx !== 0) {
            Body.applyForce(ball, ball.position, { x: dx * 0.001 * ball.mass, y: 0 });
        }

        // Jump (Apply impulse upward)
        if (!isAirborne && st.keys['Space']) {
            Body.applyForce(ball, ball.position, { x: 0, y: -0.06 * ball.mass });
        }

        if (isAirborne) {
            // Air Rotation (Active skill)
            if (dx !== 0) {
                Body.setAngularVelocity(ball, ball.angularVelocity + dx * 0.05);
            }
            // Fast Fall
            if (st.keys['KeyS'] || st.keys['ArrowDown']) {
                Body.applyForce(ball, ball.position, { x: 0, y: 0.003 * ball.mass });
            }
        }
        
        st.wasAirborne = isAirborne;
        
        Engine.update(engine, timeStep);
        accumulator -= timeStep;
      }

      // Downhill resets automatically if you fall way off
      if (ball.position.y > currY + 2000) {
          resetBall();
      }

      // Update Trail
      const spd = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
      let trickColor = 'rgba(14, 165, 233, 1)'; // Base sky-500
      if (st.currentTrick) trickColor = 'rgba(244, 63, 94, 1)'; // Active trick rose-500

      st.trailPoints.unshift({ x: ball.position.x, y: ball.position.y, s: spd, color: trickColor });
      const maxLen = Math.floor(Math.min(spd * 3, 30));
      if (st.trailPoints.length > maxLen + 1) st.trailPoints.length = maxLen + 1;

      // Update Shake
      if (st.shakeDecay > 0.1) {
        st.shakeX = (Math.random()-0.5) * st.shakeDecay;
        st.shakeY = (Math.random()-0.5) * st.shakeDecay;
        st.shakeDecay *= 0.85;
      } else { 
        st.shakeX = 0; st.shakeY = 0; st.shakeDecay = 0; 
      }

      // Fast DOM Updates
      const speedStr = spd.toFixed(1);
      if (velyRef.current) velyRef.current.textContent = speedStr;
      if (velxRef.current) velxRef.current.textContent = speedStr;
      if (stabilityRef.current) stabilityRef.current.textContent = Math.max(0, Math.round(100 - spd * 2)) + '%';

      // Draw Phase
      const targetCamX = ball.position.x - W/2;
      const targetCamY = ball.position.y - H/2;
      
      const speedZoomFactor = Math.min(spd / 40, 0.4);
      const targetZoom = 1 / (0.8 + speedZoomFactor);

      st.cameraX += (targetCamX - st.cameraX) * 0.1;
      st.cameraY += (targetCamY - st.cameraY) * 0.1;
      st.cameraZoom += (targetZoom - st.cameraZoom) * 0.05;

      // Clear the canvas globally before translating
      // Use plain background for better performance and aesthetic
      ctx.fillStyle = '#f8fafc'; // bg-slate-50 plain background
      ctx.fillRect(0, 0, W, H);

      // Setup Camera Transform
      ctx.save();
      // Apply shake
      ctx.translate(st.shakeX, st.shakeY);
      // Center for scale
      ctx.translate(W/2, H/2);
      ctx.scale(st.cameraZoom, st.cameraZoom);
      ctx.translate(-W/2, -H/2);
      // Pan camera
      ctx.translate(-st.cameraX, -st.cameraY);

      // Trail
      if (st.trailPoints.length >= 2) {
        for (let i = 1; i < st.trailPoints.length; i++) {
          const p0 = st.trailPoints[i-1], p1 = st.trailPoints[i];
          const alpha = (1 - i/st.trailPoints.length) * Math.min(p0.s/20, 1) * 0.7;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = p0.color ? p0.color.replace(', 1)', `, ${alpha})`) : `rgba(14, 165, 233, ${alpha})`;
          ctx.lineWidth = (1 - i/st.trailPoints.length) * 6;
          ctx.lineCap = 'round'; ctx.stroke();
        }
      }

      // Draw custom bouncy pads and ramps
      st.customBodies.forEach(b => {
        if (b.label === 'bouncy_pad' || b.label === 'surface') {
           ctx.beginPath();
           ctx.moveTo(b.vertices[0].x, b.vertices[0].y);
           for(let j=1; j<b.vertices.length; j++) ctx.lineTo(b.vertices[j].x, b.vertices[j].y);
           ctx.closePath();
           ctx.fillStyle = b.label === 'bouncy_pad' ? '#f43f5e' : '#cbd5e1'; 
           ctx.fill();
        }
      });

      // Draw Drawing state
      if (st.isDrawing) {
         ctx.beginPath();
         ctx.moveTo(st.drawStartX, st.drawStartY);
         ctx.lineTo(st.drawCurrX, st.drawCurrY);
         ctx.strokeStyle = '#f43f5e';
         ctx.lineWidth = 14;
         ctx.lineCap = 'round';
         ctx.globalAlpha = 0.5;
         ctx.stroke();
         ctx.globalAlpha = 1.0;
      }

      // Particles
      ctx.globalCompositeOperation = 'lighter';
      for(let i = 0; i < st.particles.length; i++) {
        const p = st.particles[i];
        p.x += p.vx; 
        p.y += p.vy;
        p.vy += 0.5; // gravity
        p.life -= 0.03;
      }
      
      const activeParticles = [];
      for(let i = 0; i < st.particles.length; i++) {
        const p = st.particles[i];
        if (p.life > 0) {
           activeParticles.push(p);
           ctx.fillStyle = p.color;
           ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
           ctx.beginPath(); 
           ctx.arc(p.x, p.y, Math.max(1, (p.life / p.maxLife) * 6), 0, Math.PI*2); 
           ctx.fill();
        }
      }
      st.particles = activeParticles;
      
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';

      // Ball Update
      const spdV = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
      const angle = Math.atan2(ball.velocity.y, ball.velocity.x);
      const squash = 1 - Math.min(spdV * 0.015, 0.3);
      const stretch = 1 + Math.min(spdV * 0.025, 0.5);
      
      ctx.save();
      ctx.translate(ball.position.x, ball.position.y);
      ctx.rotate(angle);
      ctx.scale(stretch, squash);
      
      // Core Glow (Blue on White background)
      const glow = ctx.createRadialGradient(0,0,ballRadius*0.2, 0,0,ballRadius*1.8);
      glow.addColorStop(0, 'rgba(14, 165, 233, 0.6)'); 
      glow.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0,0,ballRadius*1.8,0,Math.PI*2); ctx.fill();
      
      // Outer
      const bgCircle = ctx.createRadialGradient(-4,-4,2, 0,0,ballRadius);
      bgCircle.addColorStop(0,'#38bdf8'); 
      bgCircle.addColorStop(0.5,'#0ea5e9'); 
      bgCircle.addColorStop(1,'#0284c7');
      ctx.fillStyle = bgCircle; ctx.beginPath(); ctx.arc(0,0,ballRadius,0,Math.PI*2); ctx.fill();
      
      // Lines
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0,0,ballRadius*0.7,-0.5,2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-ballRadius,0); ctx.lineTo(ballRadius,0); ctx.stroke();
      ctx.restore();

      ctx.restore();
      reqId = requestAnimationFrame(loop);
    };
    
    reqId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(reqId);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      cvs.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      cvs.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', handleResize);
      World.clear(world, false);
      Engine.clear(engine);
    };
  }, [levelType]);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden select-none">
      
      {/* PSYCHEDELIA BACKGROUND LAYER */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div 
             ref={bgEffectRef} 
             className="absolute -inset-[100%] pointer-events-none mix-blend-color-dodge opacity-0 origin-center will-change-transform"
             style={{
                background: 'conic-gradient(from 0deg, #ff00a0, #00ffff, #ff00a0, #00ffff, #ff00a0)',
             }}
          />
      </div>
      
      <canvas 
        ref={canvasRef} 
        className="block touch-none relative z-10"
      />
      
      {/* Top Left: Scoring System (Minimalist) */}
      <div className="absolute top-6 left-6 flex gap-4 z-20 pointer-events-none">
        
        {/* ESCAPE BUTTON */}
        {onExit && (
          <button 
            onClick={onExit}
            className="pointer-events-auto bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-xs shadow-md transition-colors"
          >
            ← Leave
          </button>
        )}

        <div className="flex flex-col drop-shadow-md">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-0">Score</div>
          <div className="text-3xl font-black text-slate-800 tabular-nums tracking-tighter leading-none">
            {score}
          </div>
        </div>
        <div className="flex flex-col drop-shadow-md ml-4">
          <div className="text-[10px] uppercase tracking-widest text-orange-500 font-bold mb-0">Multiplier</div>
          <div className="text-3xl font-black text-orange-500 tabular-nums tracking-tighter leading-none">
            x{streak}
          </div>
        </div>
      </div>

      {/* Top Center: Level Selector */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex gap-2 drop-shadow-md bg-slate-800/80 p-2 rounded-xl border border-slate-700/50 backdrop-blur-sm">
         <button 
           onClick={() => setLevelType('SANDBOX')}
           className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-colors ${levelType === 'SANDBOX' ? 'bg-fuchsia-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
         >
           Skatepark
         </button>
         <button 
           onClick={() => setLevelType('DYNAMIC_HILLS')}
           className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-colors ${levelType === 'DYNAMIC_HILLS' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
         >
           Dynamic Hills
         </button>
         <button 
           onClick={() => setLevelType('DOWNHILL_30')}
           className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-colors ${levelType === 'DOWNHILL_30' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
         >
           30º Slope
         </button>
         <button 
           onClick={() => setLevelType('SONIC_PROTOTYPE')}
           className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-colors ${levelType === 'SONIC_PROTOTYPE' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
         >
           Sonic Prototype
         </button>
      </div>

      {/* NOTIFICATIONS OVERLAY (Right Side, Brief) */}
      <div className="absolute top-[20%] right-12 flex flex-col items-end pointer-events-none w-64 z-50">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div 
              key={notif.id}
              initial={{ opacity: 0, x: 50, skewX: -15 }}
              animate={{ opacity: 1, x: 0, skewX: 0 }}
              exit={{ opacity: 0, x: 20, filter: 'blur(4px)' }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="text-right w-full mb-2"
            >
              <div 
                className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase"
                style={{ 
                  color: notif.color,
                  textShadow: `0 2px 10px ${notif.color}60`
                }}
              >
                {notif.title}
              </div>
              {notif.subtitle && (
                <div className="text-xs tracking-widest font-bold text-slate-600 drop-shadow-sm uppercase">
                  {notif.subtitle}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* SCORED FLASH */}
      <AnimatePresence>
        {isScored && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.2) 0%, transparent 60%)'
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
