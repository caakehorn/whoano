import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';

const { Engine, Bodies, Body, Events, World } = Matter;

type SandboxGameProps = {
  onExit?: () => void;
};

export default function SandboxGame({ onExit }: SandboxGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    const world = engine.world;

    const wallThickness = 60;
    const floor = Bodies.rectangle(width / 2, height + wallThickness / 2, width + wallThickness * 2, wallThickness, {
      isStatic: true,
      label: 'surface',
      restitution: 0.1,
      friction: 0.8,
    });
    const ceiling = Bodies.rectangle(width / 2, -wallThickness / 2, width + wallThickness * 2, wallThickness, {
      isStatic: true,
      label: 'surface',
    });
    const leftWall = Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height + wallThickness * 2, {
      isStatic: true,
      label: 'surface',
    });
    const rightWall = Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height + wallThickness * 2, {
      isStatic: true,
      label: 'surface',
    });

    const ballRadius = 20;
    const ball = Bodies.circle(width / 2, height / 2, ballRadius, {
      label: 'ball',
      restitution: 0,
      friction: 0.005,
      frictionAir: 0.015,
      density: 0.002,
    });

    World.add(world, [floor, ceiling, leftWall, rightWall, ball]);

    const state = {
      grounded: false,
      keys: {} as Record<string, boolean>,
      jumpQueued: false,
    };

    const maxHorizontalSpeed = 10;
    const moveForce = 0.0018;
    const jumpSpeed = 11;

    const resetBall = () => {
      Body.setPosition(ball, { x: width / 2, y: height / 2 });
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
      Body.setAngle(ball, 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      state.keys[event.code] = true;

      if (event.code === 'Space') {
        event.preventDefault();
        state.jumpQueued = true;
      }

      if (event.code === 'KeyR') {
        resetBall();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      state.keys[event.code] = false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    Events.on(engine, 'beforeUpdate', () => {
      const moveLeft = state.keys.KeyA || state.keys.ArrowLeft;
      const moveRight = state.keys.KeyD || state.keys.ArrowRight;

      if (moveLeft && !moveRight) {
        if (ball.velocity.x > -maxHorizontalSpeed) {
          Body.applyForce(ball, ball.position, { x: -moveForce * ball.mass, y: 0 });
        }
      } else if (moveRight && !moveLeft) {
        if (ball.velocity.x < maxHorizontalSpeed) {
          Body.applyForce(ball, ball.position, { x: moveForce * ball.mass, y: 0 });
        }
      }

      if (state.jumpQueued && state.grounded) {
        Body.setVelocity(ball, { x: ball.velocity.x, y: -jumpSpeed });
      }
      state.jumpQueued = false;
    });

    const evaluateGrounded = () => {
      const touchingSurface = ball.position.y + ballRadius >= height - wallThickness - 1;
      const nearStillVertical = Math.abs(ball.velocity.y) < 2;
      state.grounded = touchingSurface && nearStillVertical;
    };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const delta = Math.min(now - last, 33.3);
      last = now;

      Engine.update(engine, delta);
      evaluateGrounded();

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Ground reference line only.
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height - wallThickness);
      ctx.lineTo(width, height - wallThickness);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, ballRadius, 0, Math.PI * 2);
      ctx.fill();

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;

      Body.setPosition(floor, { x: width / 2, y: height + wallThickness / 2 });
      Body.setPosition(ceiling, { x: width / 2, y: -wallThickness / 2 });
      Body.setPosition(leftWall, { x: -wallThickness / 2, y: height / 2 });
      Body.setPosition(rightWall, { x: width + wallThickness / 2, y: height / 2 });
      Body.setVertices(
        floor,
        Bodies.rectangle(width / 2, height + wallThickness / 2, width + wallThickness * 2, wallThickness, { isStatic: true }).vertices,
      );
      Body.setVertices(
        ceiling,
        Bodies.rectangle(width / 2, -wallThickness / 2, width + wallThickness * 2, wallThickness, { isStatic: true }).vertices,
      );
      Body.setVertices(
        leftWall,
        Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height + wallThickness * 2, { isStatic: true }).vertices,
      );
      Body.setVertices(
        rightWall,
        Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height + wallThickness * 2, { isStatic: true }).vertices,
      );
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      World.clear(world, false);
      Engine.clear(engine);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-white text-slate-700 select-none">
      {onExit && (
        <button
          onClick={onExit}
          className="absolute top-4 left-4 z-20 rounded bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Leave
        </button>
      )}

      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded border border-slate-200 bg-white/90 px-3 py-2 text-xs shadow-sm">
        Move: A/D or ←/→ · Jump: Space · Reset: R
      </div>
    </div>
  );
}
