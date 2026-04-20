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

export default function TrickshotGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // HUD Refs for high-freq updates without re-renders
  const scoreRef = useRef<HTMLSpanElement>(null);
  const streakRef = useRef<HTMLSpanElement>(null);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const velyRef = useRef<HTMLSpanElement>(null);
  const velxRef = useRef<HTMLSpanElement>(null);
  const stabilityRef = useRef<HTMLSpanElement>(null);
  const apexBarRef = useRef<HTMLDivElement>(null);
  const apexStateRef = useRef<HTMLSpanElement>(null);
  const hoopStateRef = useRef<HTMLDivElement>(null);
  
  // Game State
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [pulses, setPulses] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isScored, setIsScored] = useState(false);

  // Use refs for internal physics tracking
  const stateRef = useRef({
    score: 0,
    streak: 0,
    pulses: 0,
    lastSurfaceContact: -1000,
    apexGauge: 0,
    apexActive: false,
    shakeX: 0,
    shakeY: 0,
    shakeDecay: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    hoopX: window.innerWidth * 0.65,
    hoopY: window.innerHeight * 0.38,
    hoopFloatVY: 0,
    dragTarget: false,
    hoopDragOffX: 0,
    hoopDragOffY: 0,
    keys: {} as Record<string, boolean>,
    trailPoints: [] as {x: number, y: number, s: number}[],
    notifIdCounter: 0
  });

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

    const engine = Engine.create({ gravity: { x: 0, y: 1.8, scale: 0.001 } });
    engine.gravity.y = 1.8;
    const world = engine.world;
    
    // Create bodies
    const ballRadius = 16;
    const ball = Bodies.circle(W * 0.3, H * 0.4, ballRadius, {
      restitution: 0.9, 
      friction: 0.05, 
      frictionAir: 0.008, 
      density: 0.004, 
      label: 'ball'
    });

    // Make walls and ground massive to accommodate camera zoom/pan
    const ground = Bodies.rectangle(W/2, H+25, W*10, 50, { isStatic: true, label: 'surface', restitution: 0.9 });
    const wallL = Bodies.rectangle(-25, -H*4, 50, H*10, { isStatic: true, label: 'surface', restitution: 0.9 });
    const wallR = Bodies.rectangle(W+25, -H*4, 50, H*10, { isStatic: true, label: 'surface', restitution: 0.9 });
    const ceiling = Bodies.rectangle(W/2, -H*4 - 25, W*10, 50, { isStatic: true, label: 'surface', restitution: 0.9 });
    
    const hoopSensor = Bodies.circle(stateRef.current.hoopX, stateRef.current.hoopY, 28, { 
      isSensor: true, 
      isStatic: true, 
      label: 'hoop' 
    });

    World.add(world, [ball, ground, wallL, wallR, ceiling, hoopSensor]);

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
      showNotif('SCORE!', `+${pts} · STREAK x${stateRef.current.streak}`, '#00ff88');
    };

    Events.on(engine, 'collisionStart', event => {
      event.pairs.forEach(({ bodyA, bodyB }) => {
        const isBall = bodyA.label === 'ball' || bodyB.label === 'ball';
        const isSurface = bodyA.label === 'surface' || bodyB.label === 'surface';
        const isHoop = bodyA.label === 'hoop' || bodyB.label === 'hoop';
        
        if (isBall && isSurface) {
          stateRef.current.lastSurfaceContact = Date.now();
          const vel = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
          triggerShake(Math.min(vel * 0.4, 5));
        }
        if (isBall && isHoop) scoreGoal();
      });
    });

    const resetBall = () => {
      Body.setPosition(ball, { x: W * 0.3, y: H * 0.4 });
      Body.setVelocity(ball, { x: 0, y: 0 });
      stateRef.current.streak = 0;
      setStreak(0);
    };

    const doPulse = () => {
      stateRef.current.pulses++;
      setPulses(stateRef.current.pulses);
      
      const { x: vx, y: vy } = ball.velocity;
      const sinceContact = Date.now() - stateRef.current.lastSurfaceContact;
      const keys = stateRef.current.keys;

      if (stateRef.current.apexActive) {
        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
        
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        if (dx !== 0 || dy !== 0) {
          Body.setVelocity(ball, { x: vx * 0.2 + (dx/len) * 22, y: vy * 0.2 + (dy/len) * 22 - 8 });
          triggerShake(14);
          showNotif('APEX SURGE', '3.5× DIRECTIONAL BOOST', '#ff8800');
          stateRef.current.apexGauge = 0;
          stateRef.current.apexActive = false;
          return;
        }
      }

      let mult = 1;
      if (sinceContact < 150) {
        mult = 2;
        triggerShake(7);
        showNotif('REFLEX BONUS', '2× MOMENTUM BOOST', '#00aaff');
      }

      // Snappy and predictable velocity instead of unpredictable massive applyForce
      Body.setVelocity(ball, { x: vx * 0.8, y: Math.min(vy, 0) - 14 * mult });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = true;
      if (e.code === 'Space') { 
        e.preventDefault(); 
        doPulse(); 
      }
      if (e.code === 'KeyR') resetBall();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Mouse / Touch events for Hoop Dragging
    const handleDown = (clientX: number, clientY: number) => {
      // Convert screen coords to world coords taking zoom and camera into account
      const st = stateRef.current;
      const worldX = (clientX - W/2) / st.cameraZoom + W/2 + st.cameraX;
      const worldY = (clientY - H/2) / st.cameraZoom + H/2 + st.cameraY;
      
      const dx = worldX - st.hoopX;
      const dy = worldY - st.hoopY;
      if (Math.sqrt(dx*dx + dy*dy) < 60) { 
        st.dragTarget = true; 
        st.hoopDragOffX = dx; 
        st.hoopDragOffY = dy; 
      }
    };
    const handleMove = (clientX: number, clientY: number) => {
      const st = stateRef.current;
      if (st.dragTarget) {
        const worldX = (clientX - W/2) / st.cameraZoom + W/2 + st.cameraX;
        const worldY = (clientY - H/2) / st.cameraZoom + H/2 + st.cameraY;
        st.hoopX = worldX - st.hoopDragOffX;
        st.hoopY = worldY - st.hoopDragOffY;
        Body.setPosition(hoopSensor, { x: st.hoopX, y: st.hoopY });
      }
    };
    const handleUp = () => { stateRef.current.dragTarget = false; };

    const onMouseDown = (e: MouseEvent) => handleDown(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleUp();
    
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      handleDown(t.clientX, t.clientY);
      // Only do a pulse if they aren't dragging hoop and it's mobile
      if (!stateRef.current.dragTarget) {
         // doPulse(); // We might not want screen tap pulse if spacebar is core
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (stateRef.current.dragTarget) e.preventDefault(); // prevent scrolling
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
      Body.setPosition(ground,  { x: W/2, y: H+25 });
      Body.setPosition(wallL,   { x: -25, y: -H*4 });
      Body.setPosition(wallR,   { x: W+25, y: -H*4 });
      Body.setPosition(ceiling, { x: W/2, y: -H*4 - 25 });
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
        // Horizontal Control (always active)
        let dx = 0;
        if (st.keys['KeyA'] || st.keys['ArrowLeft']) dx -= 1;
        if (st.keys['KeyD'] || st.keys['ArrowRight']) dx += 1;
        
        if (dx !== 0) {
          const sinceContact = Date.now() - st.lastSurfaceContact;
          const isAirborne = Math.abs(ball.velocity.y) > 0.5 && sinceContact > 150;
          // Different horizontal force rate: much stronger in air
          const speedFactor = isAirborne ? 0.0006 : 0.0001; 
          Body.applyForce(ball, ball.position, { x: dx * speedFactor * ball.mass, y: 0 });
        }

        Engine.update(engine, timeStep);
        accumulator -= timeStep;
      }

      // Update Hoop Float
      if (!st.dragTarget) {
        st.hoopFloatVY += (Math.sin(Date.now() * 0.001) * 0.3 - st.hoopFloatVY) * 0.05;
        st.hoopY += st.hoopFloatVY * dt * 0.016;
        st.hoopY = Math.max(80, Math.min(H - 120, st.hoopY));
        Body.setPosition(hoopSensor, { x: st.hoopX, y: st.hoopY });
      }

      // Update Apex Gauge
      const absVY = Math.abs(ball.velocity.y);
      if (absVY < 4 && ball.velocity.y < 2) st.apexGauge = Math.min(1, st.apexGauge + (1 - absVY/4) * 0.08);
      else st.apexGauge = Math.max(0, st.apexGauge - 0.04);
      st.apexActive = absVY < 1.2 && st.apexGauge > 0.7;
      
      // Update Trail
      const spd = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
      st.trailPoints.unshift({ x: ball.position.x, y: ball.position.y, s: spd });
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
      if (velyRef.current) velyRef.current.textContent = ball.velocity.y.toFixed(1);
      if (velxRef.current) velxRef.current.textContent = ball.velocity.x.toFixed(1);
      if (stabilityRef.current) stabilityRef.current.textContent = Math.max(0, Math.round(100 - spd * 2)) + '%';
      if (apexBarRef.current) {
        apexBarRef.current.style.width = `${st.apexGauge * 100}%`;
        apexBarRef.current.style.background = st.apexActive ? '#ffa500' : '#00aaff';
        apexBarRef.current.style.boxShadow = st.apexActive ? '0 0 10px #ffa500' : 'none';
      }
      if (apexStateRef.current) {
        apexStateRef.current.textContent = st.apexActive ? '⬡ GOLD' : (ball.velocity.y < 0 ? 'RISING' : 'FALLING');
        apexStateRef.current.style.color = st.apexActive ? '#ffa500' : '#4b5563';
      }
      if (hoopStateRef.current) {
        hoopStateRef.current.textContent = st.dragTarget ? 'DRAGGING' : 'FLOATING';
      }
      const dot = document.getElementById('target-state-dot');
      if (dot) {
        dot.style.backgroundColor = st.dragTarget ? '#fbbf24' : '#22d3ee';
        dot.style.boxShadow = st.dragTarget ? '0 0 8px #fbbf24' : '0 0 8px #22d3ee';
      }

      // Draw Phase

      // Update Camera (track the ball, zoom out based on height & speed)
      const targetCamX = ball.position.x - W/2;
      const targetCamY = ball.position.y - H/2;
      
      const speed = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
      // Zoom out if high up (negative Y) or moving very fast
      const heightZoomFactor = Math.max(0, (H*0.4 - ball.position.y) / 1500); 
      const speedZoomFactor = Math.min(speed / 40, 0.5);
      const targetZoom = 1 / (1 + heightZoomFactor + speedZoomFactor);

      st.cameraX += (targetCamX - st.cameraX) * 0.1;
      st.cameraY += (targetCamY - st.cameraY) * 0.1;
      st.cameraZoom += (targetZoom - st.cameraZoom) * 0.05;

      // Update background grid via pure CSS variable injection to prevent react render
      const bg = document.getElementById('bg-grid');
      if (bg) {
        bg.style.backgroundPosition = `${-st.cameraX * st.cameraZoom}px ${-st.cameraY * st.cameraZoom}px`;
        bg.style.backgroundSize = `${40 * st.cameraZoom}px ${40 * st.cameraZoom}px`;
      }

      // Clear the canvas globally before translating
      ctx.clearRect(0, 0, W, H);

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
          ctx.strokeStyle = `rgba(0,160,255,${alpha})`; 
          ctx.lineWidth = (1 - i/st.trailPoints.length) * 6;
          ctx.lineCap = 'round'; ctx.stroke();
        }
      }

      // Hoop
      const hhX = st.hoopX, hhY = st.hoopY;
      const rimW = 44, rimH = 8, backH = 60, backW = 8;
      ctx.save();
      ctx.fillStyle = '#111823'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
      ctx.fillRect(hhX + rimW/2 + 6, hhY - backH/2, backW, backH);
      ctx.strokeRect(hhX + rimW/2 + 6, hhY - backH/2, backW, backH);
      
      ctx.fillStyle = '#ea580c'; ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(hhX, hhY, rimW/2, rimH/2, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      
      const dist = Math.sqrt((ball.position.x - hhX)**2 + (ball.position.y - hhY)**2);
      if (dist < 80) {
        ctx.beginPath(); ctx.ellipse(hhX, hhY, rimW/2, rimH/2, 0, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(52, 211, 153, ${(1 - dist/80)*0.8})`; 
        ctx.lineWidth = 4; ctx.stroke();
      }
      ctx.restore();

      // Ball Update
      const spdV = Math.sqrt(ball.velocity.x**2 + ball.velocity.y**2);
      const angle = Math.atan2(ball.velocity.y, ball.velocity.x);
      const squash = 1 - Math.min(spdV * 0.015, 0.3);
      const stretch = 1 + Math.min(spdV * 0.025, 0.5);
      
      ctx.save();
      ctx.translate(ball.position.x, ball.position.y);
      ctx.rotate(angle);
      ctx.scale(stretch, squash);
      
      // Core Glow
      const glow = ctx.createRadialGradient(0,0,ballRadius*0.2, 0,0,ballRadius*1.8);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.4)'); 
      glow.addColorStop(1, 'rgba(2, 132, 199, 0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0,0,ballRadius*1.8,0,Math.PI*2); ctx.fill();
      
      // Outer
      const bgCircle = ctx.createRadialGradient(-4,-4,2, 0,0,ballRadius);
      bgCircle.addColorStop(0,'#7dd3fc'); 
      bgCircle.addColorStop(0.5,'#0284c7'); 
      bgCircle.addColorStop(1,'#0c4a6e');
      ctx.fillStyle = bgCircle; ctx.beginPath(); ctx.arc(0,0,ballRadius,0,Math.PI*2); ctx.fill();
      
      // Lines
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
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
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-[#050608] text-slate-200 font-sans overflow-hidden select-none">
      {/* Background Grid */}
      <div id="bg-grid" className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 0%, #050608 100%)' }} />

      <canvas 
        ref={canvasRef} 
        className="block touch-none relative z-10"
      />
      
      {/* Top Left: Scoring System */}
      <div className="absolute top-6 left-6 flex gap-4 z-20 pointer-events-none">
        <div className="bg-slate-900/60 border border-cyan-500/30 backdrop-blur-md rounded-lg p-4 w-40">
          <div className="text-[10px] uppercase tracking-widest text-cyan-400/60 font-bold mb-1">Current Score</div>
          <div className="text-4xl font-black text-white tabular-nums tracking-tighter shadow-sky-400">
            {score}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-orange-500/30 backdrop-blur-md rounded-lg p-4 w-32 flex flex-col justify-between hidden md:flex">
          <div className="text-[10px] uppercase tracking-widest text-orange-400/60 font-bold mb-1">Multiplier</div>
          <div className="text-4xl font-black text-orange-400 tabular-nums tracking-tighter leading-none">x{streak}</div>
        </div>
        <div className="bg-slate-900/60 border border-cyan-500/30 backdrop-blur-md rounded-lg p-4 w-32 flex flex-col justify-between hidden md:flex">
          <div className="text-[10px] uppercase tracking-widest text-cyan-400/60 font-bold mb-1">Pulses</div>
          <div className="text-4xl font-black text-cyan-400 tabular-nums tracking-tighter leading-none">{pulses}</div>
        </div>
      </div>

      {/* Top Right: Environment Telemetry */}
      <div className="absolute top-6 right-6 flex flex-col gap-2 z-20 pointer-events-none">
        <div className="bg-slate-900/60 border border-slate-700/50 backdrop-blur-md rounded-lg p-3 w-48">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">Stability Matrix</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">VEL-X</span>
              <span ref={velxRef} className="text-[11px] font-mono text-cyan-400">+0.0 m/s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">VEL-Y</span>
              <span ref={velyRef} className="text-[11px] font-mono text-cyan-400">0.0 m/s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">STABILITY</span>
              <span ref={stabilityRef} className="text-[11px] font-mono text-orange-400">100%</span>
            </div>
          </div>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-md rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-[9px] text-cyan-400 font-bold tracking-widest uppercase">Target State</span>
          <span className="text-[10px] text-white flex items-center gap-1.5">
            <span id="target-state-dot" className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
            <span ref={hoopStateRef}>FLOATING</span>
          </span>
        </div>
      </div>

      {/* Bottom Controls & Gauge */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center z-20 pointer-events-none">
        <div className="w-full max-w-xl px-12">
          <div className="flex justify-between items-end mb-2">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Apex Synchronization</div>
              <div ref={apexStateRef} className="text-xs text-amber-400 font-mono italic">ARC PEAK DETECTED</div>
            </div>
            <div id="apex-pct-label" className="text-right font-mono text-2xl text-amber-400">0%</div>
          </div>
          {/* Main Gauge */}
          <div className="h-4 w-full bg-slate-900 rounded-full p-1 border border-slate-800 shadow-inner">
            <div ref={apexBarRef} className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-400 to-amber-500 shadow-[0_0_15px_rgba(251,191,36,0.5)] transition-[width,background-color] ease-out" style={{ width: '0%', backgroundColor: '#06b6d4' }}></div>
          </div>
        </div>

        <div className="hidden md:flex gap-12 mt-8 opacity-40">
          <div className="flex flex-col items-center">
            <kbd className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-white font-sans">SPACE</kbd>
            <span className="text-[9px] uppercase tracking-tighter mt-1 text-white">AERIAL PULSE</span>
          </div>
          <div className="flex flex-col items-center">
            <kbd className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-white font-sans">WASD</kbd>
            <span className="text-[9px] uppercase tracking-tighter mt-1 text-white">VECTOR SHIFT</span>
          </div>
          <div className="flex flex-col items-center">
            <kbd className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-bold text-white font-sans">DRAG</kbd>
            <span className="text-[9px] uppercase tracking-tighter mt-1 text-white">ADJUST TARGET</span>
          </div>
        </div>
      </div>

      {/* Corner Decoration / Telemetry */}
      <div className="absolute bottom-6 left-6 font-mono text-[10px] text-slate-600 z-20 pointer-events-none hidden md:block">
        PHYSICS_RUNTIME: MATTER_0.19<br/>
        ENGINE_STATE: HIGH_PRECISION<br/>
        BUFFER: 0ms
      </div>
      <div className="absolute bottom-6 right-6 text-right font-mono text-[10px] text-slate-600 z-20 pointer-events-none hidden md:block">
        SYNC_FREQ: 60Hz<br/>
        LATENCY: 1.2ms<br/>
        INST_REFLEX: 150ms
      </div>

      {/* NOTIFICATIONS OVERLAY */}
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none w-full z-50">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div 
              key={notif.id}
              initial={{ scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.05, opacity: 0, filter: 'blur(5px)' }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="text-center absolute w-full"
            >
              <div 
                className="text-5xl md:text-6xl font-black italic tracking-tighter text-white uppercase animate-pulse"
                style={{ 
                  filter: `drop-shadow(0 0 20px ${notif.color})`
                }}
              >
                {notif.title}
              </div>
              <div 
                className="text-xs md:text-sm tracking-[0.4em] font-bold mt-2"
                style={{ color: notif.color }}
              >
                {notif.subtitle}
              </div>
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
              background: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.15) 0%, transparent 60%)'
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
