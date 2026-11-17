import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FLICK_SPEED, useDragRotate } from '../../hooks/useDragRotate';
import type { StageProps } from './types';

/** Value on each box face, in three.js material order (+x, -x, +y, -y, +z, -z). Opposite faces sum to 7. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const UP = new THREE.Vector3(0, 1, 0);
const RADIUS = 0.13; // rounded edge radius; the die is 1 unit wide
const DURATION = 2600;

const C = 0.27; // pip offset from the face edge, in face units
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[1 - C, C], [C, 1 - C]],
  3: [[1 - C, C], [0.5, 0.5], [C, 1 - C]],
  4: [[C, C], [1 - C, C], [C, 1 - C], [1 - C, 1 - C]],
  5: [[C, C], [1 - C, C], [0.5, 0.5], [C, 1 - C], [1 - C, 1 - C]],
  6: [[C, C], [1 - C, C], [C, 0.5], [1 - C, 0.5], [C, 1 - C], [1 - C, 1 - C]],
};

/** A face texture: off-white plastic with drilled pips (dark centre, light lower lip). */
function faceTexture(value: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, size, size);
  const r = size * 0.085;
  for (const [u, v] of PIPS[value]) {
    const x = u * size;
    const y = v * size;
    const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r);
    g.addColorStop(0, '#050505');
    g.addColorStop(0.75, '#1c1c1c');
    g.addColorStop(1, '#3a3836');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = size * 0.006;
    ctx.beginPath();
    ctx.arc(x, y, r + size * 0.003, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Height of the die's centre above the floor when resting on its lowest point (rounded box = small box + sphere). */
function restingHeight(q: THREE.Quaternion): number {
  const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const ez = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return (0.5 - RADIUS) * (Math.abs(ex.y) + Math.abs(ey.y) + Math.abs(ez.y)) + RADIUS;
}

/** Three decaying bounces over t ∈ [0, 1]; returns height above resting. */
function bounce(t: number): number {
  const hops: [number, number, number][] = [
    [0, 0.42, 1.15],
    [0.42, 0.68, 0.4],
    [0.68, 0.85, 0.12],
  ];
  for (const [a, b, peak] of hops) {
    if (t >= a && t < b) {
      const u = (t - a) / (b - a);
      return 4 * peak * u * (1 - u);
    }
  }
  return 0;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Motion =
  | { kind: 'roll'; t0: number; qStart: THREE.Quaternion; qEnd: THREE.Quaternion; axis: THREE.Vector3; turns: number; drift: number; runId: number }
  | { kind: 'snap'; t0: number; qStart: THREE.Quaternion; qEnd: THREE.Quaternion };

/** The die is a real 3D object (three.js). The winning value always lands facing up. */
export function DiceRoll({ ideas, phase, winnerId, runId, reducedMotion, dropRef, onStart, onDone }: StageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dieRef = useRef<THREE.Mesh | null>(null);
  const motion = useRef<Motion | null>(null);
  const glOk = useRef(true);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const selecting = phase === 'selecting';
  const winnerIndex = ideas.findIndex((i) => i.id === winnerId);

  // Scene setup, render loop and teardown.
  useEffect(() => {
    const mount = mountRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      glOk.current = false; // no WebGL: rolls still resolve, just without the 3D die
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const target = new THREE.Vector3(0, 0.8, 0);
    const viewDir = new THREE.Vector3(0, 0.62, 0.78).normalize(); // looking down ~38°, so the top face reads clearly

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(2.2, 6, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 6;
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
    scene.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const textures = FACE_VALUES.map(faceTexture);
    const materials = textures.map(
      (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    );
    const geometry = new RoundedBoxGeometry(1, 1, 1, 6, RADIUS);
    const die = new THREE.Mesh(geometry, materials);
    die.castShadow = true;
    die.quaternion.setFromAxisAngle(UP, THREE.MathUtils.degToRad(28)); // a 1 up, turned so two sides show
    scene.add(die);
    dieRef.current = die;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false); // CSS sizes the canvas; letting it set its own size feeds back into layout

      camera.aspect = w / h;
      // Narrow screens: pull back so the die and its bounce still fit across.
      camera.position.copy(viewDir).multiplyScalar(w / h < 1 ? 5.6 / (w / h) : 5.6).add(target);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const spin = new THREE.Quaternion();
    let raf = 0;
    const tick = (now: number) => {
      const m = motion.current;
      let hop = 0;
      if (m) {
        const t = Math.min(1, (now - m.t0) / (m.kind === 'roll' ? DURATION : 380));
        if (m.kind === 'roll') {
          // Head for the final orientation while spinning whole turns around a random axis that die away.
          const e = easeOut(Math.min(1, t / 0.88));
          die.quaternion.slerpQuaternions(m.qStart, m.qEnd, e).multiply(spin.setFromAxisAngle(m.axis, m.turns * Math.PI * 2 * (1 - e)));
          hop = bounce(t);
          die.position.x = m.drift * Math.sin(Math.PI * t);
        } else {
          die.quaternion.slerpQuaternions(m.qStart, m.qEnd, easeOut(t));
        }
        if (t >= 1) {
          motion.current = null;
          die.quaternion.copy(m.qEnd);
          die.position.x = 0;
          if (m.kind === 'roll') doneRef.current(m.runId);
        }
      }
      die.position.y = restingHeight(die.quaternion) + hop;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geometry.dispose();
      materials.forEach((mat) => mat.dispose());
      textures.forEach((tex) => tex.dispose());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      dieRef.current = null;
    };
  }, []);

  // A roll: the winner was decided before this runs; the die only animates to show it on top.
  useEffect(() => {
    if (!selecting) return;
    const die = dieRef.current;
    if (!glOk.current || !die) {
      const t = setTimeout(() => onDone(runId), 300);
      return () => clearTimeout(t);
    }
    const winnerNormal = FACE_NORMALS[FACE_VALUES.indexOf(winnerIndex + 1)];
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(Math.random() * 90 - 45));
    const qEnd = yaw.multiply(new THREE.Quaternion().setFromUnitVectors(winnerNormal, UP));

    if (reducedMotion) {
      motion.current = null;
      die.quaternion.copy(qEnd);
      const t = setTimeout(() => onDone(runId), 300);
      return () => clearTimeout(t);
    }

    motion.current = {
      kind: 'roll',
      t0: performance.now(),
      qStart: die.quaternion.clone(),
      qEnd,
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      turns: 3,
      drift: (Math.random() < 0.5 ? -1 : 1) * 0.35,
      runId,
    };
    return () => {
      if (motion.current?.kind === 'roll') motion.current = null;
    };
  }, [selecting, runId]);

  // Drag to turn the die; let go and it settles on whichever face is nearest the top. Throw it to roll.
  const dragHandlers = useDragRotate({
    enabled: !selecting,
    onDrag: (dx, dy) => {
      const die = dieRef.current;
      if (!die) return;
      motion.current = null;
      die.quaternion
        .premultiply(new THREE.Quaternion().setFromAxisAngle(UP, dx * 0.012))
        .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.012));
    },
    onRelease: (vx, vy) => {
      const die = dieRef.current;
      if (!die) return;
      const ups = FACE_NORMALS.map((n) => n.clone().applyQuaternion(die.quaternion));
      const top = ups.reduce((best, n) => (n.y > best.y ? n : best));
      const qEnd = new THREE.Quaternion().setFromUnitVectors(top, UP).multiply(die.quaternion);
      motion.current = { kind: 'snap', t0: performance.now(), qStart: die.quaternion.clone(), qEnd };
      if (Math.hypot(vx, vy) > FLICK_SPEED) onStart();
    },
  });

  const won = phase === 'result';
  return (
    <>
      <div className="stage-visual dice-stage" ref={dropRef}>
        <div className={`dice-3d ${selecting ? '' : 'grabbable'}`} ref={mountRef} {...dragHandlers} />
      </div>
      <ol className="legend dice-legend">
        {ideas.map((idea, i) => (
          <li key={idea.id} className={won && idea.id === winnerId ? 'win' : ''} title={idea.text}>
            <b>{i + 1}</b>
            <span>{idea.text}</span>
          </li>
        ))}
      </ol>
      <div className="stage-actions">
        <button className="primary" onClick={onStart} disabled={selecting}>
          {selecting ? 'Rolling…' : won ? 'Roll again' : 'Roll the dice'}
        </button>
      </div>
      {!selecting && <p className="hint">Drag the die to turn it, or throw it to roll. The face that lands on top wins.</p>}
    </>
  );
}
