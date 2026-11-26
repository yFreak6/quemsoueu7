import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TABLE_TOP, seatAngle } from './layout.js';

/**
 * A Julgadora (IA) do modo "O JULGADOR (IA)": robô de cabeça de TV em pé no centro da mesa, de frente para quem olha.
 * Dois estados, trocados sozinhos pela etapa da partida:
 *   PARADO     → carinha na tela (dois olhos em traço e a boca curva, com um espaço entre eles)
 *   COMPUTANDO → círculo tracejado girando na tela (animado quadro a quadro) enquanto a IA analisa
 *
 * Tudo que se ajusta fica em CFG (cores, medidas, posições). As peças são componentes pequenos e independentes:
 * Leg, Arm, Neck, Torso (com ChestPanel), TvHead (com Antennas, Vents e Face/Ring).
 * Detalhes retrô inspirados no robô de referência: isoladores em anéis, cilindros avermelhados, juntas e pescoço metálico.
 */
export const CFG = {
  scale: 0.46,
  color: {
    body: '#8b8b8b', // corpo cinza (como o boneco do logo)
    screen: '#27b34e', // tela verde
    screenGlow: '#1d8a3b',
    ink: '#14221a', // olhos, boca, círculo e antenas
    red: '#b4483c', // cilindros avermelhados
    ring: '#a9b8b0', // anéis isoladores (cinza-esverdeado)
    metal: '#cfd3d6', // pescoço / juntas metálicas
    joint: '#6f7f8f', // miolo dos braços
    panel: '#e9845f', // visor do peito
    panelFrame: '#1c1c1c',
  },
  head: { y: 1.12, w: 0.62, h: 0.52, d: 0.44, screenW: 0.5, screenH: 0.4 },
  // rosto: olhos na parte de cima da tela; a boca desce, deixando um vão claro entre os dois
  face: { eyeY: 0.085, eyeX: 0.12, eyeW: 0.022, eyeH: 0.1, mouthApexY: -0.085, mouthR: 0.3, mouthArc: 0.9, mouthTube: 0.012 },
  torso: { y: 0.58, r: 0.19, len: 0.3, depth: 0.78 },
  neck: { y: 0.9, rTop: 0.15, rBottom: 0.085, h: 0.12 },
  leg: { x: 0.1, y: 0.17, rings: 2 },
  arm: { x: 0.26, y: 0.72, segments: 3, tilt: 0.28 },
  panel: { y: 0.62, z: 0.152, w: 0.11, h: 0.15 },
};

const TAU = Math.PI * 2;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

const G = {
  bezel: new THREE.BoxGeometry(CFG.head.w, CFG.head.h, CFG.head.d),
  screen: new THREE.PlaneGeometry(CFG.head.screenW, CFG.head.screenH),
  eye: new THREE.BoxGeometry(CFG.face.eyeW, CFG.face.eyeH, 0.01),
  mouth: new THREE.TorusGeometry(CFG.face.mouthR, CFG.face.mouthTube, 6, 28, CFG.face.mouthArc),
  dash: new THREE.TorusGeometry(0.135, 0.014, 8, 20, 1.15),
  antenna: new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6),
  knob: new THREE.SphereGeometry(0.026, 10, 8),
  vent: new THREE.BoxGeometry(0.045, 0.012, 0.012),
  torso: new THREE.CapsuleGeometry(CFG.torso.r, CFG.torso.len, 6, 14),
  neck: new THREE.CylinderGeometry(CFG.neck.rTop, CFG.neck.rBottom, CFG.neck.h, 18),
  legCore: new THREE.CylinderGeometry(0.058, 0.058, 0.26, 14),
  ring: new THREE.CylinderGeometry(0.092, 0.092, 0.026, 18),
  foot: new THREE.BoxGeometry(0.17, 0.05, 0.21),
  toe: new THREE.SphereGeometry(0.014, 6, 6),
  armCore: new THREE.CylinderGeometry(0.043, 0.043, 0.34, 12),
  armRing: new THREE.CylinderGeometry(0.066, 0.066, 0.024, 16),
  shoulder: new THREE.SphereGeometry(0.075, 14, 10),
  hand: new THREE.SphereGeometry(0.058, 12, 10),
  panel: new THREE.BoxGeometry(CFG.panel.w, CFG.panel.h, 0.012),
  panelGlass: new THREE.PlaneGeometry(CFG.panel.w - 0.02, CFG.panel.h - 0.02),
  stripe: new THREE.BoxGeometry(0.012, 0.3, 0.008),
};

function useBotMaterials() {
  return useMemo(
    () => ({
      body: mat(CFG.color.body),
      screen: mat(CFG.color.screen, { emissive: new THREE.Color(CFG.color.screenGlow), emissiveIntensity: 0.45, roughness: 0.4 }),
      ink: mat(CFG.color.ink, { roughness: 0.5 }),
      red: mat(CFG.color.red, { roughness: 0.45 }),
      ring: mat(CFG.color.ring, { roughness: 0.5 }),
      metal: mat(CFG.color.metal, { roughness: 0.25, metalness: 0.6 }),
      joint: mat(CFG.color.joint, { roughness: 0.55 }),
      panel: mat(CFG.color.panel, { emissive: new THREE.Color(CFG.color.panel), emissiveIntensity: 0.35, roughness: 0.4 }),
      panelFrame: mat(CFG.color.panelFrame, { roughness: 0.6 }),
    }),
    [],
  );
}

/** Perna: miolo vermelho com anéis isoladores empilhados e um pé com "dedinhos". */
function Leg({ m, x }) {
  const { y, rings } = CFG.leg;
  return (
    <group position={[x, y, 0]}>
      <mesh geometry={G.legCore} material={m.red} castShadow />
      {Array.from({ length: rings }, (_, i) => (
        <mesh key={i} geometry={G.ring} material={m.ring} position={[0, -0.075 + i * 0.15, 0]} castShadow />
      ))}
      <mesh geometry={G.foot} material={m.ring} position={[0, -0.145, 0.03]} castShadow />
      {[-0.05, 0, 0.05].map((tx) => (
        <mesh key={tx} geometry={G.toe} material={m.ink} position={[tx, -0.135, 0.14]} />
      ))}
    </group>
  );
}

/** Braço: ombro em cúpula, miolo azul-acinzentado com anéis alternados (cinza/vermelho) e mão redonda. */
function Arm({ m, side }) {
  const { x, y, segments, tilt } = CFG.arm;
  return (
    <group position={[side * x, y, 0.02]} rotation={[0.1, 0, side * tilt]}>
      <mesh geometry={G.shoulder} material={m.metal} castShadow />
      <mesh geometry={G.armCore} material={m.joint} position={[0, -0.19, 0]} castShadow />
      {Array.from({ length: segments }, (_, i) => (
        <mesh key={i} geometry={G.armRing} material={i % 2 ? m.red : m.ring} position={[0, -0.1 - i * 0.085, 0]} castShadow />
      ))}
      <mesh geometry={G.hand} material={m.body} position={[0, -0.39, 0]} castShadow />
    </group>
  );
}

/** Pescoço metálico em funil, ligando a TV ao tronco. */
function Neck({ m }) {
  return <mesh geometry={G.neck} material={m.metal} position={[0, CFG.neck.y, 0]} castShadow />;
}

/** Visor do peito (rosado/alaranjado) com moldura escura e uma faixa clara ao lado, como no robô de referência. */
function ChestPanel({ m }) {
  const { y, z, w } = CFG.panel;
  return (
    <group position={[0, y, z]}>
      <mesh geometry={G.panel} material={m.panelFrame} />
      <mesh geometry={G.panelGlass} material={m.panel} position={[0, 0, 0.008]} />
      <mesh geometry={G.stripe} material={m.ring} position={[-(w / 2 + 0.05), 0.02, -0.004]} />
    </group>
  );
}

function Torso({ m }) {
  const { y, depth } = CFG.torso;
  return (
    <group>
      <mesh geometry={G.torso} material={m.body} position={[0, y, 0]} scale={[1, 1, depth]} castShadow />
      <ChestPanel m={m} />
    </group>
  );
}

function Antennas({ m }) {
  return (
    <group>
      <mesh geometry={G.antenna} material={m.ink} position={[-0.09, 0.4, 0]} rotation={[0, 0, 0.5]} />
      <mesh geometry={G.antenna} material={m.ink} position={[0.1, 0.4, 0]} rotation={[0, 0, -0.38]} />
      <mesh geometry={G.knob} material={m.ink} position={[0.19, 0.54, 0]} />
    </group>
  );
}

/** Grelha de ventilação sob a TV (detalhe retrô). */
function Vents({ m }) {
  return (
    <group position={[0, -CFG.head.h / 2 + 0.03, CFG.head.d / 2 + 0.002]}>
      {[-0.2, -0.1, 0, 0.1, 0.2].map((vx) => (
        <mesh key={vx} geometry={G.vent} material={m.ink} position={[vx, 0, 0]} />
      ))}
    </group>
  );
}

/** PARADO: dois olhos em traço no alto da tela e a boca curva mais embaixo, com vão claro entre eles. */
const Face = ({ m, faceRef }) => {
  const f = CFG.face;
  return (
    <group ref={faceRef} position={[0, 0, 0.226]}>
      <mesh geometry={G.eye} material={m.ink} position={[-f.eyeX, f.eyeY, 0]} />
      <mesh geometry={G.eye} material={m.ink} position={[f.eyeX, f.eyeY, 0]} />
      <mesh geometry={G.mouth} material={m.ink} position={[0, f.mouthApexY - f.mouthR, 0]} rotation={[0, 0, Math.PI / 2 - f.mouthArc / 2]} />
    </group>
  );
};

/** COMPUTANDO: círculo tracejado (4 arcos) que gira. */
const Ring = ({ m, ringRef, spinRef }) => (
  <group ref={ringRef} position={[0, 0, 0.228]}>
    <group ref={spinRef}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={G.dash} material={m.ink} rotation={[0, 0, (i * TAU) / 4]} />
      ))}
    </group>
  </group>
);

function TvHead({ m, headRef, faceRef, ringRef, spinRef }) {
  return (
    <group ref={headRef} position={[0, CFG.head.y, 0]}>
      <mesh geometry={G.bezel} material={m.body} castShadow />
      <mesh geometry={G.screen} material={m.screen} position={[0, 0, 0.222]} />
      <Antennas m={m} />
      <Vents m={m} />
      <Face m={m} faceRef={faceRef} />
      <Ring m={m} ringRef={ringRef} spinRef={spinRef} />
    </group>
  );
}

function JudgeBotImpl({ n, camSeat, computing }) {
  const m = useBotMaterials();
  const root = useRef();
  const head = useRef();
  const face = useRef();
  const ring = useRef();
  const spin = useRef();
  const k = useRef(computing ? 1 : 0); // 0 = parado, 1 = computando
  const yaw = seatAngle(camSeat, n); // de frente para o assento de quem olha

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    k.current = THREE.MathUtils.damp(k.current, computing ? 1 : 0, 7, dt);
    const c = k.current;
    if (face.current) {
      const s = Math.max(0.001, 1 - c);
      face.current.scale.setScalar(s);
      face.current.visible = s > 0.01;
    }
    if (ring.current) {
      const pulse = 1 + Math.sin(t * 5) * 0.04 * c;
      const s = Math.max(0.001, c) * pulse;
      ring.current.scale.setScalar(s);
      ring.current.visible = c > 0.01;
    }
    if (spin.current) spin.current.rotation.z -= dt * (2.6 + c * 1.2);
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.9) * 0.025 + Math.sin(t * 17) * 0.012 * c;
      head.current.rotation.y = Math.sin(t * 0.5) * 0.12 * (1 - c);
    }
    if (root.current) root.current.position.y = TABLE_TOP + Math.sin(t * 1.3) * 0.006;
  });

  return (
    <group ref={root} position={[0, TABLE_TOP, 0]} rotation={[0, yaw, 0]} scale={CFG.scale}>
      <Leg m={m} x={-CFG.leg.x} />
      <Leg m={m} x={CFG.leg.x} />
      <Torso m={m} />
      <Arm m={m} side={-1} />
      <Arm m={m} side={1} />
      <Neck m={m} />
      <TvHead m={m} headRef={head} faceRef={face} ringRef={ring} spinRef={spin} />
    </group>
  );
}

export default memo(JudgeBotImpl);
