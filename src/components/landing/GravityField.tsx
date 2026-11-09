import { useEffect, useRef, useState } from "react";
import type * as Three from "three";
import { paletteAt, sampleV, smoothstep, sphereRoles, type Role } from "@/lib/gravity/shape";

export type GravityFieldProps = {
  /** Called once, after the first rendered frame (or straight away when WebGL is unavailable). */
  onReady?: () => void;
  /** Flip to true when the loader is done: the spheres fly in from off-screen. */
  started: boolean;
  theme: "light" | "dark";
};

/**
 * The landing hero's "Gravity" field: glass and matte spheres that cluster in the hero, fall in
 * section 1, form a "V" in section 2 and fly past the camera in section 3. Scroll progress is
 * scrollY / innerHeight. Client-only: three is imported inside the effect, so SSR never loads it.
 */
export function GravityField({ onReady, started, theme }: GravityFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<GravityFieldProps>({ onReady, started, theme });
  const field = useRef<Field | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    live.current = { onReady, started, theme };
  });

  useEffect(() => {
    field.current?.update();
  }, [started, theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let mounted: Field | undefined;
    // No WebGL (three needs WebGL 2): render nothing, so the page's own gradient shows.
    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      live.current.onReady?.();
    };
    if (typeof WebGL2RenderingContext === "undefined") return fail();
    (async () => {
      const THREE = await import("three");
      if (!cancelled) field.current = mounted = mountField(THREE, canvas, live);
    })().catch(fail);
    return () => {
      cancelled = true;
      field.current = null;
      mounted?.dispose();
    };
  }, []);

  if (failed) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

type Field = { update: () => void; dispose: () => void };

type Ball = {
  mesh: Three.Mesh;
  mat: Three.MeshPhysicalMaterial;
  role: Role;
  r: number;
  m: number;
  /** Displayed radius: shrinks toward r * shapeScale in the V. */
  vs: number;
  opacity: number;
  v: Three.Vector3;
  prev: Three.Vector3;
  /** V target: x, y in [-1, 1], z jitter in world units. */
  shape: [number, number, number];
  target: Three.Vector3;
  phase: number;
  stagger: number;
  /** Walls only hold spheres that have come inside them (they fly in from off-screen). */
  inXY: boolean;
  inZ: boolean;
};

// Physics constants are per 60 Hz frame; `k` rescales them to the real frame time.
const FOV = 38;
const CAM_Z = 11;
const CENTER_ATTRACT = 0.0035;
const MOUSE_FORCE = 0.05;
const MOUSE_RADIUS = 4.4;
const REBOUND = -0.3;
const BOUNCINESS = 0.02;
const BORDER_PAD = 0.2;
const Z_BOUND = 2;
const DRIFT = 0.0006;
// Released spheres stay within ±FAR: the fly-off push grows positions exponentially.
const FAR = 50;
const MATTE = { roughness: 0.44, clearcoat: 0.24, clearcoatRoughness: 0.35 };

function mountField(
  T: typeof Three,
  canvas: HTMLCanvasElement,
  live: { current: GravityFieldProps },
): Field {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = innerWidth < 768;
  const count = mobile ? 54 : 96;
  const seg = mobile ? 32 : 48;
  let progress = scrollY / innerHeight;

  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  // three r18x folded PCFSoftShadowMap into PCFShadowMap, which now softens by shadow.radius.
  renderer.shadowMap.type = T.PCFShadowMap;
  // Refraction through the glass is soft anyway: a half-size buffer looks the same, at a quarter of the fill.
  renderer.transmissionResolutionScale = 0.5;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  const hemi = new T.HemisphereLight(0xffffff, 0xffffff, 1.6);
  const key = new T.DirectionalLight(0xffffff, 1.4);
  key.position.set(-6, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0003;
  key.shadow.radius = 12;
  const rim = new T.DirectionalLight(0xffffff, 1.25);
  rim.position.set(8, 7, -8);
  const front = new T.DirectionalLight(0xffffff, 0.4);
  front.position.set(0, 0, CAM_Z);
  const bounce = new T.DirectionalLight(0xffffff, 0.3);
  bounce.position.set(-9, -2, 4);
  scene.add(hemi, key, rim, front, bounce);

  const geometry = new T.SphereGeometry(1, seg, seg);
  const balls: Ball[] = sphereRoles(count).map((role, i) => {
    const u = Math.random();
    const f = i / count;
    const r = f < 0.3 ? 0.27 + u * 0.12 : f < 0.8 ? 0.42 + u * 0.18 : 0.66 + u * 0.21;
    const mat =
      role === "glass"
        ? new T.MeshPhysicalMaterial({
            roughness: 0.08,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
            transmission: 0.95,
            ior: 1.485,
            thickness: 2.2,
            specularColor: 0xffffff,
            specularIntensity: 1,
            attenuationDistance: 1,
            emissiveIntensity: 0.12,
            transparent: true,
          })
        : new T.MeshPhysicalMaterial({ ...MATTE, transparent: false });
    const mesh = new T.Mesh(geometry, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const [sx, sy] = sampleV();
    return {
      mesh,
      mat,
      role,
      r,
      m: r ** 3,
      vs: r,
      opacity: 1,
      v: new T.Vector3(),
      prev: new T.Vector3(),
      shape: [sx, sy, (Math.random() * 2 - 1) * 0.175],
      target: new T.Vector3(),
      phase: Math.random() * Math.PI * 2,
      stagger: (i * 0.618034) % 1,
      inXY: false,
      inZ: false,
    };
  });
  const meanRadius = balls.reduce((sum, b) => sum + b.r, 0) / count;
  // Hidden after the first compile; it keeps the transparent matte program alive, so a sphere
  // switching to it for the fly-off fade never stalls on a shader compile.
  const holder = new T.Mesh(geometry, new T.MeshPhysicalMaterial({ ...MATTE, transparent: true }));
  scene.add(holder);

  // Frustum bounds at z = 0, and the V targets that depend on them.
  let w = 1;
  let h = 1;
  let vw = 1;
  let vh = 1;
  let shapeScale = 1;
  /** Where the hero pull centres the cluster, clear of the hero copy: right half on wide
   *  screens, top on phones. */
  let anchorX = 0;
  let anchorY = 0;
  const layout = () => {
    w = canvas.clientWidth || innerWidth;
    h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    vh = 2 * Math.tan(T.MathUtils.degToRad(FOV / 2)) * CAM_Z;
    vw = vh * camera.aspect;
    // must match the `wide` variant in styles.css (copy beside the cluster)
    const wide = w >= 768 && w / h >= 1.5;
    anchorX = wide ? vw * 0.24 : 0;
    anchorY = wide ? vh * 0.02 : vh * 0.24;
    // the V sits a little right of centre on wide screens, clear of the heading on the left
    const vShift = wide ? vw * 0.05 : 0;
    const S = Math.min(vw * 0.3, vh * 0.27);
    // The V spans 2.3·S, the extent shapeScale's S·0.45/2.3 assumes.
    const half = S * 1.15;
    for (const b of balls)
      b.target.set(b.shape[0] * half + vShift, b.shape[1] * half - vh * 0.03, b.shape[2]);
    shapeScale = Math.max(0.3, Math.min(1, (S * 0.45) / 2.3 / meanRadius));
    progress = scrollY / innerHeight;
  };

  let painted = NaN;
  const paint = (p: number) => {
    if (p === painted) return;
    painted = p;
    const palette = paletteAt(p);
    hemi.groundColor.setHex(palette.medium);
    for (const b of balls) {
      if (b.role === "glass") {
        b.mat.attenuationColor.setHex(palette.pastel);
        b.mat.emissive.setHex(palette.glass);
      } else {
        b.mat.color.setHex(palette[b.role]);
        b.mat.emissive.setHex(palette[b.role]);
      }
    }
  };

  const applyTheme = () => {
    const dark = live.current.theme === "dark";
    renderer.toneMappingExposure = dark ? 1.25 : 1.15;
    for (const b of balls) if (b.role !== "glass") b.mat.emissiveIntensity = dark ? 0.14 : 0.08;
  };

  // Pointer, in NDC; off-screen until it moves. Handlers only store it, the frame reads it.
  const ndc = { x: 99, y: 99 };
  const mouse = new T.Vector3(1e5, 1e5, 0);
  const ray = new T.Vector3();
  let pointerMoved = false;
  let pointerDown = false;
  let pointerSeen = false;
  let mouseSpeed = 0;
  const readMouse = (k: number) => {
    if (!pointerMoved) {
      mouseSpeed = 0;
      return;
    }
    pointerMoved = false;
    ray.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const distance = -camera.position.z / ray.z;
    const x = camera.position.x + ray.x * distance;
    const y = camera.position.y + ray.y * distance;
    const onScreen = ndc.x !== 99;
    mouseSpeed =
      pointerSeen && onScreen ? Math.min(3, Math.hypot(x - mouse.x, y - mouse.y) / k) : 0;
    pointerSeen = onScreen;
    mouse.set(x, y, 0);
  };

  const axis = new T.Vector3();
  const spin = new T.Quaternion();
  /** One physics step at progress p, t seconds after the start. True once all have flown off. */
  const step = (k: number, t: number, p: number) => {
    const heroF = 1 - smoothstep(0.3, 0.8, p);
    const dropF = smoothstep(0.4, 0.95, p) * (1 - smoothstep(1.25, 1.75, p));
    const shapeF = smoothstep(1.4, 2.05, p) * (1 - smoothstep(2.55, 3, p));
    const flyF = smoothstep(2.7, 3.45, p);

    const entry = 1 - (1 - Math.min(1, t / 2.2)) ** 3;
    const boost = 7.5 + (1 - 7.5) * entry;
    // The pull also holds outside the hero while they fly in, so they arrive mid-page too.
    const attract = CENTER_ATTRACT * boost * Math.max(heroF, 1 - entry) * k;
    let damping = 0.91;
    damping += (0.992 - damping) * dropF;
    damping += (0.9 - damping) * shapeF;
    damping += (0.985 - damping) * flyF;
    const damp = damping ** k;
    const spring = 0.06 * shapeF * k;
    const repelRadius = MOUSE_RADIUS * (pointerDown ? 1.4 : 1);
    const repel = MOUSE_FORCE * (pointerDown ? 1.7 : 1) * (1 + mouseSpeed * 3.2) * k;
    const scaleEase = 1 - 0.88 ** k;
    let faded = true;

    for (const b of balls) {
      const pos = b.mesh.position;
      const v = b.v;
      b.prev.copy(pos);
      v.x += Math.sin(t * 0.7 + b.phase) * DRIFT * heroF * k;
      v.y += Math.cos(t * 0.55 + b.phase * 1.3) * DRIFT * heroF * k;
      v.x -= (pos.x - anchorX) * attract * 0.38;
      v.y -= (pos.y - anchorY) * attract * 1.85;
      v.z -= pos.z * attract * 1.8;
      v.y -= 0.011 * dropF * k;
      v.x += (b.target.x - pos.x) * spring;
      v.y += (b.target.y - pos.y) * spring;
      v.z += (b.target.z - pos.z) * spring;
      const fly = Math.min(1, Math.max(0, (flyF - b.stagger * 0.5) * 2)) * k;
      v.z += 0.05 * fly;
      v.x += pos.x * 0.006 * fly;
      v.y += pos.y * 0.006 * fly;
      const dx = pos.x - mouse.x;
      const dy = pos.y - mouse.y;
      const dz = (pos.z - mouse.z) * 0.12;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < repelRadius && d > 1e-4) {
        const f = (repel * (1 - smoothstep(0, repelRadius, d))) / d;
        v.x += dx * f;
        v.y += dy * f;
        v.z += dz * f;
      }
      v.multiplyScalar(damp);
      pos.addScaledVector(v, k);
      b.opacity = 1 - smoothstep(CAM_Z - 2.6, CAM_Z - 0.3, pos.z);
      if (b.opacity > 0) faded = false;
      b.vs += (b.r * (1 - (1 - shapeScale) * shapeF) - b.vs) * scaleEase;
    }

    const collide = (1 - 0.93 * shapeF) * (1 - flyF);
    const collideScale = 0.28 * collide;
    for (let s = 0; collide > 0 && s < 4; s++) {
      for (let i = 0; i < count; i++) {
        const a = balls[i];
        const pa = a.mesh.position;
        for (let j = i + 1; j < count; j++) {
          const b = balls[j];
          const pb = b.mesh.position;
          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          const dz = pa.z - pb.z;
          const min = a.vs + b.vs;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= min * min || d2 < 1e-12) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const nz = dz / d;
          // Mass-weighted push: the heavier sphere moves less.
          const shove = ((min - d) * collideScale) / (a.m + b.m);
          pa.x += nx * shove * b.m;
          pa.y += ny * shove * b.m;
          pa.z += nz * shove * b.m;
          pb.x -= nx * shove * a.m;
          pb.y -= ny * shove * a.m;
          pb.z -= nz * shove * a.m;
          const vn = (a.v.x - b.v.x) * nx + (a.v.y - b.v.y) * ny + (a.v.z - b.v.z) * nz;
          if (vn >= 0) continue;
          const impulse = ((-(1 + BOUNCINESS) * vn) / (1 / a.m + 1 / b.m)) * collide;
          a.v.x += (nx * impulse) / a.m;
          a.v.y += (ny * impulse) / a.m;
          a.v.z += (nz * impulse) / a.m;
          b.v.x -= (nx * impulse) / b.m;
          b.v.y -= (ny * impulse) / b.m;
          b.v.z -= (nz * impulse) / b.m;
        }
      }
    }

    const halfW = vw / 2 - BORDER_PAD;
    const halfH = vh / 2 - 0.05;
    const restitution = 0.3 + 0.35 * dropF;
    const friction = 0.86 ** k;
    for (const b of balls) {
      const pos = b.mesh.position;
      const v = b.v;
      const r = b.vs;
      if (flyF >= 0.5) b.inXY = false;
      else if (!b.inXY) b.inXY = Math.abs(pos.x) + r < halfW && Math.abs(pos.y) + r < halfH;
      else {
        if (pos.x + r > halfW) {
          pos.x = halfW - r;
          if (v.x > 0) v.x *= REBOUND;
        } else if (pos.x - r < -halfW) {
          pos.x = r - halfW;
          if (v.x < 0) v.x *= REBOUND;
        }
        if (pos.y + r > halfH) {
          pos.y = halfH - r;
          if (v.y > 0) v.y *= REBOUND;
        } else if (pos.y - r < -halfH) {
          pos.y = r - halfH;
          if (v.y < 0) v.y *= -restitution;
          if (dropF > 0.3) {
            v.x *= friction;
            v.z *= friction;
          }
        }
      }
      if (flyF >= 0.02) b.inZ = false;
      else if (!b.inZ) b.inZ = Math.abs(pos.z) + r < Z_BOUND;
      else if (pos.z + r > Z_BOUND) {
        pos.z = Z_BOUND - r;
        if (v.z > 0) v.z *= REBOUND;
      } else if (pos.z - r < -Z_BOUND) {
        pos.z = r - Z_BOUND;
        if (v.z < 0) v.z *= REBOUND;
      }
      if (Math.abs(pos.x) > FAR || Math.abs(pos.y) > FAR || Math.abs(pos.z) > FAR) {
        pos.clampScalar(-FAR, FAR);
        v.set(0, 0, 0);
      }
      // Rolling: turn about (dy, -dx, 0) by the distance travelled.
      const dx = pos.x - b.prev.x;
      const dy = pos.y - b.prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1e-5) {
        spin.setFromAxisAngle(axis.set(dy / len, -dx / len, 0), (len / b.r) * 0.95);
        b.mesh.quaternion.premultiply(spin);
      }
    }
    return flyF >= 1 && faded;
  };

  const sync = () => {
    for (const b of balls) {
      b.mesh.scale.setScalar(b.vs);
      b.mat.opacity = b.opacity;
      b.mesh.visible = b.opacity > 0.003;
      // Matte spheres draw opaque so the glass can refract them (three only refracts opaque
      // objects); they turn transparent just for the fly-off fade.
      const fading = b.opacity < 1;
      if (b.role !== "glass" && b.mat.transparent !== fading) {
        b.mat.transparent = fading;
        b.mat.needsUpdate = true;
      }
    }
  };

  layout();
  if (reduced) {
    // Reduced motion: settle a hero cluster up front, without drawing, and show it as a still.
    for (const b of balls) {
      b.mesh.position.set(
        anchorX + (Math.random() - 0.5) * vw * 0.5,
        anchorY + (Math.random() - 0.5) * vh * 0.4,
        Math.random() * 2 - 1,
      );
    }
    for (let n = 0; n < 600; n++) step(1, 10 + n / 60, 0);
    paint(0);
  } else {
    // Parked on a ring well outside the frustum until `started`.
    const ring = Math.max(vw, vh) * 1.5;
    balls.forEach((b, i) => {
      const angle = i * 2.39996; // golden angle: entry points spread evenly
      b.mesh.position.set(
        Math.cos(angle) * ring * 1.25,
        Math.sin(angle) * ring * 0.85,
        (Math.random() * 2 - 1) * 2,
      );
    });
    paint(progress);
  }
  applyTheme();
  sync();

  let raf = 0;
  let scrollRaf = 0;
  let last = 0;
  let startAt = -1;
  let warm = false;
  let readySent = false;
  let disposed = false;
  const ready = () => {
    if (readySent) return;
    readySent = true;
    live.current.onReady?.();
  };
  const pause = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const wake = () => {
    if (raf || !warm || disposed || reduced || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const k = last ? Math.min(3, Math.max(0.25, ((now - last) / 1000) * 60)) : 1;
    last = now;
    if (!live.current.started) {
      renderer.render(scene, camera);
      ready();
      return pause();
    }
    if (startAt < 0) {
      startAt = now;
      for (const b of balls) {
        b.v
          .copy(b.mesh.position)
          .normalize()
          .multiplyScalar(-(0.08 + Math.random() * 0.05));
      }
    }
    readMouse(k);
    paint(progress);
    const gone = step(k, (now - startAt) / 1000, progress);
    sync();
    renderer.render(scene, camera);
    ready();
    // Flown off and faded: idle until a scroll brings progress back.
    if (gone) pause();
  };
  const renderStill = () => {
    renderer.render(scene, camera);
    ready();
  };

  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      progress = scrollY / innerHeight;
      wake();
    });
  };
  const onMove = (e: PointerEvent) => {
    ndc.x = (e.clientX / w) * 2 - 1;
    ndc.y = 1 - (e.clientY / h) * 2;
    pointerMoved = true;
  };
  const onLeave = () => {
    ndc.x = ndc.y = 99;
    pointerMoved = true;
  };
  const onDown = () => {
    pointerDown = true;
  };
  const onUp = (e: PointerEvent) => {
    pointerDown = false;
    if (e.pointerType !== "mouse") onLeave();
  };
  const onVisibility = () => (document.hidden ? pause() : wake());
  const resizer = new ResizeObserver(() => {
    layout();
    pointerMoved = true;
    if (!warm) return;
    if (reduced) renderStill();
    else wake();
  });

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", onDown, { passive: true });
  addEventListener("pointerup", onUp, { passive: true });
  addEventListener("pointercancel", onUp, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", onVisibility);
  resizer.observe(canvas);

  // Compile every program before the first frame, without blocking the loader's animation.
  renderer
    .compileAsync(scene, camera)
    .catch(() => {})
    .then(() => {
      if (disposed) return;
      holder.visible = false;
      warm = true;
      if (reduced) renderStill();
      else wake();
    });

  return {
    update() {
      applyTheme();
      if (!warm) return;
      if (reduced) renderStill();
      else wake();
    },
    dispose() {
      disposed = true;
      pause();
      cancelAnimationFrame(scrollRaf);
      resizer.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      for (const b of balls) b.mat.dispose();
      holder.material.dispose();
      key.dispose();
      renderer.dispose();
    },
  };
}
