/**
 * @file The activity field on Today and Live (spec 7.13, "What alive looks like").
 *
 * Three lanes of dark water, one per pipeline (Personal, Development, Maintenance). Each running
 * task is a bright particle drifting along its lane at a speed that follows its token rate; queued
 * work gathers at the lane's left edge; faint particles drift everywhere so an idle system looks
 * like still water rather than a dead screen.
 *
 * Budget (7.17): particles are capped (120 on a phone, 300 wider), the loop stops while the tab is
 * hidden or the field is scrolled off screen, and with reduced motion the field draws one still
 * frame. This module pulls in three.js, so pages load it lazily and only Today and Live do.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  OrthographicCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from "three";
import { useEffect, useRef, useState } from "react";
import type { LiveTask } from "../api/types";

const LANES: LiveTask["lane"][] = ["personal", "development", "maintenance"];
const LANE_NAMES = ["Personal", "Development", "Maintenance"];

/** Field coordinates run 0..1 across and 0..3 down, one unit per lane. */
interface Particle {
  x: number;
  y: number;
  speed: number;
}

/** Ambient drift, scaled down as more tasks run so a busy field still looks orderly (7.13). */
function ambientCount(width: number, running: number): number {
  const cap = width < 600 ? 120 : 300;
  return Math.max(0, Math.round(cap * (1 - Math.min(running, 10) / 20)) - running);
}

function laneOf(task: LiveTask): number {
  return Math.max(0, LANES.indexOf(task.lane));
}

/** Places running tasks along their lanes and queued ones at the left edge. */
function taskParticles(tasks: LiveTask[], previous: Particle[]): Particle[] {
  return tasks.map((task, index) => {
    const lane = laneOf(task);
    const speed =
      task.queued || task.paused ? 0 : 0.02 + Math.min(task.tokens_per_second ?? 4, 80) / 1200;
    const kept = previous[index];
    const x = task.queued ? 0.03 + index * 0.012 : (kept?.x ?? 0.15 + ((index * 0.37) % 0.7));
    return { x, y: lane + 0.5 + ((index % 3) - 1) * 0.12, speed };
  });
}

function ambientParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random() * 3,
    speed: 0.002 + Math.random() * 0.006,
  }));
}

/** Moves every particle along its lane, wrapping at the right edge. */
function step(particles: Particle[], seconds: number, positions: Float32Array): void {
  particles.forEach((particle, index) => {
    particle.x = (particle.x + particle.speed * seconds) % 1;
    positions[index * 3] = particle.x;
    positions[index * 3 + 1] = 3 - particle.y;
  });
}

function cssColor(name: string): Color {
  return new Color(
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888",
  );
}

/** One set of points sharing a size and color. */
function pointLayer(count: number, size: number, color: Color, opacity: number) {
  const positions = new Float32Array(count * 3);
  // BufferAttribute keeps this array (Float32BufferAttribute would copy it), so writing to
  // `positions` each frame moves the points.
  const attribute = new BufferAttribute(positions, 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", attribute);
  const material = new PointsMaterial({
    size,
    color,
    transparent: true,
    opacity,
    sizeAttenuation: false,
  });
  return { points: new Points(geometry, material), positions, attribute, geometry };
}

type Layer = ReturnType<typeof pointLayer>;

/** Builds the renderer and scene, and runs the loop until disposed. */
function startField(canvas: HTMLCanvasElement, tasks: () => LiveTask[], still: boolean) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const camera = new OrthographicCamera(0, 1, 3, 0, -1, 1);
  const scene = new Scene();
  const width = canvas.clientWidth;
  const ambient = ambientParticles(ambientCount(width, tasks().length));
  const haze = pointLayer(ambient.length, 2, cssColor("--field-muted"), 0.35);
  let active: Particle[] = [];
  let bright: Layer | null = null;
  scene.add(haze.points);

  const sync = () => {
    active = taskParticles(tasks(), active);
    if (bright?.positions.length !== active.length * 3) {
      if (bright) scene.remove(bright.points);
      bright?.geometry.dispose();
      bright = pointLayer(active.length, 7, cssColor("--data-1"), 0.95);
      scene.add(bright.points);
    }
  };

  let frame = 0;
  let last = performance.now();
  let visible = true;
  const draw = (now: number) => {
    const seconds = Math.min((now - last) / 1000, 0.1);
    last = now;
    sync();
    step(ambient, seconds, haze.positions);
    if (bright) step(active, seconds, bright.positions);
    haze.attribute.needsUpdate = true;
    if (bright) bright.attribute.needsUpdate = true;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.render(scene, camera);
    if (!still && visible && !document.hidden) frame = requestAnimationFrame(draw);
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    last = performance.now();
    frame = requestAnimationFrame(draw);
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && !still) resume();
  });
  observer.observe(canvas);
  const onVisibility = () => !document.hidden && !still && resume();
  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    haze.geometry.dispose();
    bright?.geometry.dispose();
    renderer.dispose();
  };
}

/** Whether this browser can draw WebGL at all; without it the lanes show as plain bands. */
function canUseWebGl(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/** Without WebGL, each task is a still dot in its lane, so the field still says who is where. */
function StillDots({ tasks }: { tasks: LiveTask[] }) {
  return (
    <>
      {taskParticles(tasks, []).map((particle, index) => (
        <span
          key={tasks[index]?.id ?? index}
          className="field-dot"
          style={{ left: `${particle.x * 100}%`, top: `${(particle.y / 3) * 100}%` }}
        />
      ))}
    </>
  );
}

/** The lanes and their particles. Words beside it carry the same facts for screen readers. */
export default function ActivityField({ tasks }: { tasks: LiveTask[] }) {
  const [webGl] = useState(canUseWebGl);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(tasks);
  useEffect(() => {
    latest.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (!canvas.current || !webGl) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return startField(canvas.current, () => latest.current, still);
  }, [webGl]);

  return (
    <div className="activity-field" aria-hidden="true">
      {webGl ? <canvas ref={canvas} className="field-canvas" /> : <StillDots tasks={tasks} />}
      <div className="field-lanes">
        {LANE_NAMES.map((name) => (
          <span key={name} className="field-lane">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
