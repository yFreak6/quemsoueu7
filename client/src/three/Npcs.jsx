import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BAR_FROM, BAR_TO, DOOR_A } from './layout.js';
import { makeNeonTextTexture } from './textures.js';
import { createNpcs, stepNpc } from './npcSim.js';

const damp = THREE.MathUtils.damp;
const SKIN = '#f6f6f3';

// Geometrias e materiais compartilhados entre todos os NPCs (antes cada malha criava os seus:
// ~450 geometrias e ~200 materiais na GPU). Vivem até o fim da página, então não há dispose.
const GEO = new Map();
const GEO_CLASS = {
  capsule: THREE.CapsuleGeometry,
  sphere: THREE.SphereGeometry,
  box: THREE.BoxGeometry,
  plane: THREE.PlaneGeometry,
  cone: THREE.ConeGeometry,
  cylinder: THREE.CylinderGeometry,
  torus: THREE.TorusGeometry,
};
function geo(type, args) {
  const key = `${type}:${args.join(',')}`;
  let g = GEO.get(key);
  if (!g) {
    const Cls = GEO_CLASS[type];
    if (!Cls) throw new Error(`Npcs: geometria "${type}" não registrada em GEO_CLASS`);
    g = new Cls(...args);
    GEO.set(key, g);
  }
  return g;
}
const MAT = new Map();
function std(color, roughness = 0.8) {
  const key = `${color}:${roughness}`;
  let m = MAT.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness });
    MAT.set(key, m);
  }
  return m;
}


function Hair({ style, color, accent }) {
  const mat = <primitive object={std(color, 0.85)} attach="material" />;
  switch (style) {
    case 'long':
      return (
        <group>
          <mesh position={[0, 0.14, -0.01]} rotation={[-0.25, 0, 0]}>
            <primitive object={geo('sphere', [0.162, 14, 8, 0, Math.PI * 2, 0, 1.2])} attach="geometry" />
            {mat}
          </mesh>
          <mesh position={[0, 0.04, -0.1]} scale={[1, 1.5, 0.6]}>
            <primitive object={geo('sphere', [0.12, 14, 10])} attach="geometry" />
            {mat}
          </mesh>
        </group>
      );
    case 'cap':
      return (
        <group>
          <mesh position={[0, 0.13, 0]} rotation={[-0.15, 0, 0]}>
            <primitive object={geo('sphere', [0.165, 20, 12, 0, Math.PI * 2, 0, 1.2])} attach="geometry" />
            {mat}
          </mesh>
          <mesh position={[0, 0.15, 0.17]} rotation={[0.1, 0, 0]}>
            <primitive object={geo('box', [0.2, 0.02, 0.14])} attach="geometry" />
            {mat}
          </mesh>
        </group>
      );
    case 'bun':
      return (
        <group>
          <mesh position={[0, 0.14, -0.01]} rotation={[-0.25, 0, 0]}>
            <primitive object={geo('sphere', [0.162, 14, 8, 0, Math.PI * 2, 0, 1.15])} attach="geometry" />
            {mat}
          </mesh>
          <mesh position={[0, 0.3, -0.07]}>
            <primitive object={geo('sphere', [0.06, 12, 10])} attach="geometry" />
            {mat}
          </mesh>
        </group>
      );
    case 'beanie':
      return (
        <group>
          <mesh position={[0, 0.13, 0]}>
            <primitive object={geo('sphere', [0.17, 20, 12, 0, Math.PI * 2, 0, 1.35])} attach="geometry" />
            {mat}
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <primitive object={geo('sphere', [0.04, 10, 8])} attach="geometry" />
            <primitive object={std(accent, 1)} attach="material" />
          </mesh>
        </group>
      );
    case 'hat':
      return (
        <group>
          <mesh position={[0, 0.25, 0]}>
            <primitive object={geo('cylinder', [0.21, 0.21, 0.02, 20])} attach="geometry" />
            {mat}
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <primitive object={geo('cylinder', [0.11, 0.12, 0.14, 18])} attach="geometry" />
            {mat}
          </mesh>
        </group>
      );
    default: // short
      return (
        <mesh position={[0, 0.14, -0.01]} rotation={[-0.25, 0, 0]}>
          <primitive object={geo('sphere', [0.162, 14, 8, 0, Math.PI * 2, 0, 1.15])} attach="geometry" />
          {mat}
        </mesh>
      );
  }
}

/** Boneco em pé ou sentado, com roupa própria (camisa, calça, sapato, cabelo, acessório). */
function Npc({ n, all }) {
  const o = n.outfit;
  const root = useRef();
  const head = useRef();
  const body = useRef();
  const armR = useRef();
  const armL = useRef();
  const legR = useRef();
  const legL = useRef();
  const kneeR = useRef();
  const kneeL = useRef();
  const tray = useRef();

  const mats = useMemo(
    () => ({
      shirt: std(o.shirt, 0.75),
      sleeve: std(o.acc === 'vest' ? o.shirt : o.jacket || o.shirt, 0.75),
      jacket: std(o.jacket || o.shirt, 0.7),
      pants: std(o.pants, 0.8),
      shoes: std(o.shoes, 0.6),
      skin: std(SKIN, 0.55),
    }),
    [o],
  );

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    stepNpc(n, all, dt, t);
    const p = n.pose;
    const g = root.current;
    if (!g) return;
    g.visible = n.visible;
    if (!n.visible) return;
    g.position.set(n.x, 0, n.z);
    g.rotation.y = n.yaw;

    const seated = p.seated;
    const swing = p.moving ? Math.sin(n.phase) * 0.55 : 0;
    const thigh = seated ? -1.5 : 0;
    legR.current.rotation.x = damp(legR.current.rotation.x, thigh + swing, 12, dt);
    legL.current.rotation.x = damp(legL.current.rotation.x, thigh - swing, 12, dt);
    const knee = seated ? 1.5 : 0;
    kneeR.current.rotation.x = knee;
    kneeL.current.rotation.x = knee;
    kneeR.current.scale.y = kneeL.current.scale.y = seated ? 1.25 : 1;

    armR.current.rotation.x = damp(armR.current.rotation.x, p.armR !== 0 ? p.armR : p.moving ? -swing * 0.8 : Math.sin(t * 1.5 + n.id) * 0.03, 10, dt);
    armL.current.rotation.x = damp(armL.current.rotation.x, p.armL !== 0 ? p.armL : p.moving ? swing * 0.8 : 0, 10, dt);
    body.current.position.y = seated ? -0.18 : p.moving ? Math.abs(Math.sin(n.phase)) * 0.025 : Math.sin(t * 1.6 + n.id) * 0.006;
    head.current.rotation.y = damp(head.current.rotation.y, p.headY, 5, dt);
    head.current.rotation.x = damp(head.current.rotation.x, p.headX, 5, dt);
    if (tray.current) tray.current.visible = p.carrying;
  });

  const leg = (x, ref, kref) => (
    <group key={x} ref={ref} position={[x, 0.62, 0]}>
      <mesh position={[0, -0.15, 0]} material={mats.pants}>
        <primitive object={geo('capsule', [0.078, 0.15, 2, 8])} attach="geometry" />
      </mesh>
      <group ref={kref} position={[0, -0.3, 0]}>
        <mesh position={[0, -0.16, 0]} material={mats.pants}>
          <primitive object={geo('capsule', [0.07, 0.18, 2, 8])} attach="geometry" />
        </mesh>
        <mesh position={[0, -0.33, 0.04]} material={mats.shoes}>
          <primitive object={geo('box', [0.11, 0.07, 0.22])} attach="geometry" />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={root}>
      <group ref={body}>
        {leg(-0.1, legL, kneeL)}
        {leg(0.1, legR, kneeR)}

        <mesh position={[0, 0.92, 0]} material={mats.shirt}>
          <primitive object={geo('capsule', [0.18, 0.36, 3, 10])} attach="geometry" />
        </mesh>
        {o.jacket && (
          <mesh position={[0, 0.9, -0.012]} material={mats.jacket}>
            <primitive object={geo('capsule', [0.193, 0.3, 3, 10])} attach="geometry" />
          </mesh>
        )}
        {o.jacket && o.acc !== 'vest' && (
          <mesh position={[0, 0.93, 0.19]}>
            <primitive object={geo('box', [0.09, 0.36, 0.02])} attach="geometry" />
            <primitive object={std(o.shirt, 1)} attach="material" />
          </mesh>
        )}
        {o.acc === 'vest' && (
          <mesh position={[0, 0.93, 0.19]}>
            <primitive object={geo('box', [0.1, 0.36, 0.02])} attach="geometry" />
            <primitive object={std('#f4f1ea', 1)} attach="material" />
          </mesh>
        )}
        {o.acc === 'bowtie' && (
          <group position={[0, 1.15, 0.18]}>
            <mesh position={[-0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <primitive object={geo('cone', [0.03, 0.06, 4])} attach="geometry" />
              <primitive object={std('#c0392b', 1)} attach="material" />
            </mesh>
            <mesh position={[0.04, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <primitive object={geo('cone', [0.03, 0.06, 4])} attach="geometry" />
              <primitive object={std('#c0392b', 1)} attach="material" />
            </mesh>
          </group>
        )}
        {o.acc === 'scarf' && (
          <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <primitive object={geo('torus', [0.15, 0.05, 8, 20])} attach="geometry" />
            <primitive object={std(o.shoes, 0.9)} attach="material" />
          </mesh>
        )}

        {/* braços (pivô no ombro): manga colorida, mão branca; a direita segura um copo */}
        <group ref={armR} position={[0.24, 1.12, 0]}>
          <mesh position={[0, -0.2, 0]} material={mats.sleeve}>
            <primitive object={geo('capsule', [0.058, 0.24, 2, 6])} attach="geometry" />
          </mesh>
          <mesh position={[0, -0.41, 0]} material={mats.skin}>
            <primitive object={geo('sphere', [0.05, 10, 8])} attach="geometry" />
          </mesh>
          <mesh position={[0, -0.5, 0.04]}>
            <primitive object={geo('cylinder', [0.04, 0.032, 0.1, 10])} attach="geometry" />
            <primitive object={std('#e0a526', 0.3)} attach="material" />
          </mesh>
        </group>
        <group ref={armL} position={[-0.24, 1.12, 0]}>
          <mesh position={[0, -0.2, 0]} material={mats.sleeve}>
            <primitive object={geo('capsule', [0.058, 0.24, 2, 6])} attach="geometry" />
          </mesh>
          <mesh position={[0, -0.41, 0]} material={mats.skin}>
            <primitive object={geo('sphere', [0.05, 10, 8])} attach="geometry" />
          </mesh>
        </group>

        {n.kind === 'waiter' && (
          <group ref={tray} position={[0, 1.0, 0.5]}>
            <mesh>
              <primitive object={geo('cylinder', [0.24, 0.24, 0.02, 20])} attach="geometry" />
              <meshStandardMaterial color="#c9ccd1" metalness={0.8} roughness={0.25} />
            </mesh>
            {[[-0.09, 0], [0.09, 0.03], [0, -0.09]].map(([x, z], i) => (
              <mesh key={i} position={[x, 0.06, z]}>
                <primitive object={geo('cylinder', [0.04, 0.032, 0.1, 10])} attach="geometry" />
                <primitive object={std(['#e0a526', '#c0392b', '#e8f2f5'][i], 0.3)} attach="material" />
              </mesh>
            ))}
          </group>
        )}

        <group ref={head} position={[0, 1.3, 0]}>
          <mesh position={[0, 0.12, 0]} material={mats.skin}>
            <primitive object={geo('sphere', [0.15, 14, 10])} attach="geometry" />
          </mesh>
          <Hair style={o.hairStyle} color={o.hair} accent={o.shirt} />
          {o.acc === 'glasses' && (
            <group position={[0, 0.14, 0.135]}>
              {[-0.055, 0.055].map((x) => (
                <mesh key={x} position={[x, 0, 0]}>
                  <primitive object={geo('torus', [0.04, 0.008, 6, 16])} attach="geometry" />
                  <primitive object={std('#1b1b1b', 1)} attach="material" />
                </mesh>
              ))}
              <mesh>
                <primitive object={geo('box', [0.03, 0.008, 0.008])} attach="geometry" />
                <primitive object={std('#1b1b1b', 1)} attach="material" />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </group>
  );
}


/** Porta de entrada/saída: abre quando algum NPC passa por ela. Atrás dela, a noite lá fora. */
function Door({ sim, roomR }) {
  const leaf = useRef();
  const sign = useMemo(() => makeNeonTextTexture('SAÍDA', '#3dff8b', '#eafff2'), []);
  useEffect(() => () => sign.dispose(), [sign]);
  const open = useRef(0);
  useFrame(({ clock }, dt) => {
    const target = clock.elapsedTime < sim.doorUntil ? 1 : 0;
    open.current = damp(open.current, target, 5, Math.min(dt, 0.05));
    if (leaf.current) leaf.current.rotation.y = -open.current * 1.45;
  });
  const wood = '#4a2f1c';
  return (
    <group position={[Math.sin(DOOR_A) * (roomR - 0.06), 0, Math.cos(DOOR_A) * (roomR - 0.06)]} rotation={[0, DOOR_A + Math.PI, 0]}>
      {/* noite lá fora, vista pela porta aberta */}
      <mesh position={[0, 1.08, 0.005]}>
        <primitive object={geo('plane', [1.0, 2.16])} attach="geometry" />
        <meshBasicMaterial color="#0d1830" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.02, 0.01]}>
        <primitive object={geo('plane', [1.0, 0.04])} attach="geometry" />
        <meshBasicMaterial color="#e9c47a" toneMapped={false} />
      </mesh>
      {/* batente */}
      <mesh position={[-0.56, 1.14, 0.03]}>
        <primitive object={geo('box', [0.1, 2.28, 0.1])} attach="geometry" />
        <primitive object={std(wood, 0.7)} attach="material" />
      </mesh>
      <mesh position={[0.56, 1.14, 0.03]}>
        <primitive object={geo('box', [0.1, 2.28, 0.1])} attach="geometry" />
        <primitive object={std(wood, 0.7)} attach="material" />
      </mesh>
      <mesh position={[0, 2.3, 0.03]}>
        <primitive object={geo('box', [1.22, 0.12, 0.1])} attach="geometry" />
        <primitive object={std(wood, 0.7)} attach="material" />
      </mesh>
      {/* folha da porta, articulada à esquerda, abre para dentro do salão */}
      <group ref={leaf} position={[-0.5, 0, 0.05]}>
        <mesh position={[0.5, 1.08, 0]}>
          <primitive object={geo('box', [1.0, 2.16, 0.05])} attach="geometry" />
          <primitive object={std('#6b4326', 0.65)} attach="material" />
        </mesh>
        {[1.55, 0.6].map((y) => (
          <mesh key={y} position={[0.5, y, 0.03]}>
            <primitive object={geo('box', [0.7, 0.7, 0.012])} attach="geometry" />
            <primitive object={std('#7d5230', 0.6)} attach="material" />
          </mesh>
        ))}
        <mesh position={[0.88, 1.05, 0.05]}>
          <primitive object={geo('sphere', [0.045, 12, 10])} attach="geometry" />
          <meshStandardMaterial color="#c9a14a" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
      {/* sinal de saída */}
      <mesh position={[0, 2.56, 0.1]}>
        <primitive object={geo('plane', [0.8, 0.3])} attach="geometry" />
        <meshBasicMaterial map={sign} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function NpcsImpl({ seatR, roomR }) {
  const sim = useMemo(() => createNpcs({ seatR, roomR, barFrom: BAR_FROM, barTo: BAR_TO }), [seatR, roomR]);
  return (
    <>
      <Door sim={sim} roomR={roomR} />
      {sim.map((n) => (
        <Npc key={n.id} n={n} all={sim} />
      ))}
    </>
  );
}

export default memo(NpcsImpl);
