import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BAR_FROM, BAR_TO, DOOR_A, seatAngle, sideTables, TABLE_TOP } from './layout.js';
import {
  makeBrickTexture,
  makeCheckerTexture,
  makeDiscTexture,
  makeFeltTexture,
  makeNeonTexture,
  makeNeonTextTexture,
  makePosterTexture,
  makeRugTexture,
  makeWoodTexture,
} from './textures.js';

export const WOOD = '#8a5a34';

export function useDisposable(factory, deps) {
  const value = useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => (Array.isArray(value) ? value : [value]).forEach((v) => v?.dispose?.()), [value]);
  return value;
}

export function Chair({ seat, n, seatR }) {
  const a = seatAngle(seat, n);
  return (
    <group position={[Math.sin(a) * seatR, 0, Math.cos(a) * seatR]} rotation={[0, a + Math.PI, 0]}>
      <mesh position={[0, 0.41, 0.04]} castShadow receiveShadow>
        <cylinderGeometry args={[0.31, 0.31, 0.06, 32]} />
        <meshStandardMaterial color="#b5754a" roughness={0.7} />
      </mesh>
      {[[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.22], [0.2, 0.22]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.19, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.02, 0.38, 8]} />
          <meshStandardMaterial color={WOOD} roughness={0.8} />
        </mesh>
      ))}
      {/* encosto */}
      <mesh position={[0, 0.76, -0.27]} castShadow>
        <boxGeometry args={[0.5, 0.36, 0.035]} />
        <meshStandardMaterial color="#a9683f" roughness={0.7} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.6, -0.27]} castShadow>
          <boxGeometry args={[0.035, 0.36, 0.035]} />
          <meshStandardMaterial color={WOOD} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Parede de prateleiras com garrafas e copos (instanciados: 2 chamadas de desenho no total). `mirror` põe espelho no fundo. */
function ShelfWall({ roomR, from, to, mirror = false, rows = [1.7, 2.3, 2.9] }) {
  const len = to - from;
  const wallR = roomR - 0.3;
  const bottlesRef = useRef();
  const glassesRef = useRef();
  const { bottles, glasses } = useMemo(() => {
    const colors = ['#2f6b3a', '#7a3b1d', '#c98a1b', '#1f4d7a', '#8a2b2b', '#d9d2b0', '#5b2a6b'].map((c) => new THREE.Color(c));
    const count = Math.max(6, Math.round(len * 10));
    const bs = [];
    const gs = [];
    rows.forEach((y, row) => {
      for (let i = 0; i < count; i++) {
        const a = from + 0.08 + ((len - 0.16) * i) / (count - 1);
        const glass = (i + row) % 5 === 0;
        const h = glass ? 0.12 : 0.26 + ((i * 7 + row) % 4) * 0.03;
        const item = { a, y: y + h / 2 + 0.01, h, color: colors[(i * 3 + row * 5) % colors.length] };
        (glass ? gs : bs).push(item);
      }
    });
    return { bottles: bs, glasses: gs };
  }, [from, len, rows]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const fill = (ref, items, baseH) => {
      if (!ref.current) return;
      items.forEach((b, i) => {
        m.compose(new THREE.Vector3(Math.sin(b.a) * (wallR - 0.2), b.y, Math.cos(b.a) * (wallR - 0.2)), q, new THREE.Vector3(1, b.h / baseH, 1));
        ref.current.setMatrixAt(i, m);
        ref.current.setColorAt(i, b.color);
      });
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    };
    fill(bottlesRef, bottles, 1);
    fill(glassesRef, glasses, 1);
  }, [bottles, glasses, wallR]);

  return (
    <group>
      <mesh position={[0, 2.35, 0]}>
        <cylinderGeometry args={[wallR, wallR, 2.2, 32, 1, true, from, len]} />
        <meshStandardMaterial color={mirror ? '#9fb4b4' : '#4a2f1c'} metalness={mirror ? 0.6 : 0} roughness={mirror ? 0.25 : 0.8} side={THREE.BackSide} />
      </mesh>
      {/* fita de LED quente sob cada prateleira */}
      {rows.map((y) => (
        <mesh key={`led${y}`} position={[0, y - 0.03, 0]}>
          <cylinderGeometry args={[wallR - 0.38, wallR - 0.38, 0.025, 24, 1, true, from, len]} />
          <meshBasicMaterial color="#ffc980" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {rows.map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[wallR - 0.4, wallR, 24, 1, Math.PI / 2 - to, len]} />
          <meshStandardMaterial color="#5a3820" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <instancedMesh ref={bottlesRef} args={[undefined, undefined, bottles.length]}>
        <cylinderGeometry args={[0.05, 0.06, 1, 8]} />
        <meshStandardMaterial roughness={0.25} metalness={0.15} />
      </instancedMesh>
      <instancedMesh ref={glassesRef} args={[undefined, undefined, glasses.length]}>
        <cylinderGeometry args={[0.05, 0.035, 1, 8]} />
        <meshStandardMaterial color="#cfe3ea" roughness={0.2} metalness={0.15} transparent opacity={0.6} />
      </instancedMesh>
    </group>
  );
}

/** Barris e caixotes encostados na parede. */
function Barrels({ roomR }) {
  return (
    <group>
      {[6.0, 6.18, 0.3].map((a, i) => (
        <group key={a} position={[Math.sin(a) * (roomR - 0.75), 0, Math.cos(a) * (roomR - 0.75)]}>
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.34, 0.3, 0.84, 20]} />
            <meshStandardMaterial color="#7a4a26" roughness={0.8} />
          </mesh>
          {[0.2, 0.64].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[0.352, 0.31, 0.04, 20]} />
              <meshStandardMaterial color="#444" metalness={0.7} roughness={0.4} />
            </mesh>
          ))}
          {i === 1 && (
            <mesh position={[0, 1.05, 0]}>
              <boxGeometry args={[0.5, 0.4, 0.5]} />
              <meshStandardMaterial color="#9a6b3a" roughness={0.85} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/** Balcão curvo encostado na parede, com prateleiras de garrafas, banquetas e espelho. */
function BarCounter({ roomR, woodTex }) {
  const r = roomR - 2.2;
  const len = BAR_TO - BAR_FROM;
  const stools = useMemo(() => Array.from({ length: 5 }, (_, i) => BAR_FROM + 0.25 + ((len - 0.5) * i) / 4), [len]);
  return (
    <group>
      {/* frente do balcão */}
      <mesh position={[0, 0.55, 0]} receiveShadow>
        <cylinderGeometry args={[r, r, 1.1, 48, 1, true, BAR_FROM, len]} />
        <meshStandardMaterial map={woodTex} side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {/* tampo */}
      <mesh position={[0, 1.12, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[r - 0.35, r + 0.45, 48, 1, Math.PI / 2 - BAR_TO, len]} />
        <meshStandardMaterial color="#3a2217" roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <ShelfWall roomR={roomR} from={BAR_FROM} to={BAR_TO} mirror />
      {/* banquetas */}
      {stools.map((a, i) => (
        <group key={i} position={[Math.sin(a) * (r - 0.95), 0, Math.cos(a) * (r - 0.95)]}>
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.07, 20]} />
            <meshStandardMaterial color="#8c2f2f" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
            <meshStandardMaterial color="#444" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.04, 16]} />
            <meshStandardMaterial color="#444" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Letreiro de neon com leve oscilação de brilho (como lâmpada de gás). */
function NeonSign({ roomR, tex, angle, y = 2.7, w = 2.6, h = 1.3, color = '#ff3d8b', intensity = 5, lit = true }) {
  const light = useRef();
  const rr = roomR - 0.08;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + angle * 3;
    const dip = Math.sin(t * 0.9) > 0.985 ? 0.35 : 1; // queda rara, de relance
    if (lit && light.current) light.current.intensity = intensity * dip * (1 + Math.sin(t * 17) * 0.04);
  });
  return (
    <group position={[Math.sin(angle) * rr, y, Math.cos(angle) * rr]} rotation={[0, angle + Math.PI, 0]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {lit && <pointLight ref={light} position={[0, 0, 1.2]} color={color} intensity={intensity} distance={8} decay={2} />}
    </group>
  );
}

/** Luminária principal: foco quente sobre a mesa (única luz que projeta sombras) + feixe de luz visível. */
function Lamp({ wallH }) {
  const drop = 3.1;
  return (
    <group>
      <mesh position={[0, (wallH + drop) / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, wallH - drop, 6]} />
        <meshStandardMaterial color="#2b2b2b" />
      </mesh>
      <mesh position={[0, drop, 0]}>
        <coneGeometry args={[0.5, 0.34, 32, 1, true]} />
        <meshStandardMaterial color="#b8862f" side={THREE.DoubleSide} roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, drop - 0.12, 0]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshBasicMaterial color="#fff2c9" toneMapped={false} />
      </mesh>
      <spotLight
        position={[0, drop - 0.2, 0]}
        color="#ffd9a0"
        intensity={55}
        angle={0.95}
        penumbra={0.7}
        distance={12}
        decay={2}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0006}
      />
      {/* feixe de luz */}
      <mesh position={[0, drop - 0.25 - (drop - 0.45) / 2, 0]}>
        <coneGeometry args={[1.9, drop - 0.45, 24, 1, true]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.085} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.FrontSide} toneMapped={false} />
      </mesh>
    </group>
  );
}


/** Mesinhas redondas junto à parede, com cadeiras para os NPCs sentados. */
function SideTables({ roomR }) {
  const tables = useMemo(() => sideTables(roomR), [roomR]);
  return (
    <group>
      {tables.map((t) => (
        <group key={t.a}>
          <group position={[t.cx, 0, t.cz]}>
            <mesh position={[0, 0.72, 0]} receiveShadow>
              <cylinderGeometry args={[0.5, 0.5, 0.045, 32]} />
              <meshStandardMaterial color="#6b4326" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.36, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.7, 10]} />
              <meshStandardMaterial color="#2a2320" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.28, 0.3, 0.04, 20]} />
              <meshStandardMaterial color="#2a2320" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* velinha e dois copos */}
            <mesh position={[0, 0.79, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.1, 10]} />
              <meshStandardMaterial color="#f1e7d0" />
            </mesh>
            <mesh position={[0, 0.86, 0]}>
              <sphereGeometry args={[0.014, 8, 6]} />
              <meshBasicMaterial color="#ffd27a" toneMapped={false} />
            </mesh>
            {[-0.22, 0.22].map((x, i) => (
              <mesh key={x} position={[x, 0.79, 0.12]}>
                <cylinderGeometry args={[0.04, 0.032, 0.1, 10]} />
                <meshStandardMaterial color={i ? '#c98a1b' : '#e0a526'} roughness={0.3} />
              </mesh>
            ))}
          </group>
          {t.seats.map((s, i) => (
            <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.yaw, 0]}>
              <mesh position={[0, 0.41, 0.04]}>
                <cylinderGeometry args={[0.31, 0.31, 0.06, 28]} />
                <meshStandardMaterial color="#8c2f2f" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.76, -0.27]}>
                <boxGeometry args={[0.5, 0.36, 0.035]} />
                <meshStandardMaterial color="#7a2626" roughness={0.7} />
              </mesh>
              {[[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.22], [0.2, 0.22]].map(([x, z]) => (
                <mesh key={`${x}${z}`} position={[x, 0.19, z]}>
                  <cylinderGeometry args={[0.025, 0.02, 0.38, 8]} />
                  <meshStandardMaterial color="#2a2320" />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Três pendentes sobre o balcão, com lâmpadas quentes. */
function BarPendants({ roomR }) {
  const r = roomR - 2.2 + 0.05;
  const len = BAR_TO - BAR_FROM;
  return (
    <group>
      {[0.2, 0.5, 0.8].map((f) => {
        const a = BAR_FROM + len * f;
        return (
          <group key={f} position={[Math.sin(a) * r, 0, Math.cos(a) * r]}>
            <mesh position={[0, 3.65, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 1.9, 6]} />
              <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0, 2.68, 0]}>
              <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#1f4d3a" metalness={0.4} roughness={0.35} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 2.62, 0]}>
              <sphereGeometry args={[0.07, 12, 10]} />
              <meshBasicMaterial color="#ffe3a6" toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Fio de luzinhas ao redor do salão (instanciado: 1 draw call). */
function StringLights({ roomR }) {
  const ref = useRef();
  const N = 96;
  const colors = useMemo(() => ['#ffd27a', '#ffb347', '#fff0c2', '#ff9f6b'].map((c) => new THREE.Color(c)), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const frac = (i % 8) / 8;
      const y = 4.25 - Math.sin(frac * Math.PI) * 0.38;
      m.setPosition(Math.sin(a) * (roomR - 1.0), y, Math.cos(a) * (roomR - 1.0));
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, colors[i % colors.length]);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [roomR, colors]);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.material.opacity = 0.92 + Math.sin(clock.elapsedTime * 2.2) * 0.06;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <sphereGeometry args={[0.055, 8, 6]} />
      <meshBasicMaterial transparent toneMapped={false} />
    </instancedMesh>
  );
}

/** Vigas de madeira no teto. */
function CeilingBeams({ roomR, wallH, tex }) {
  return (
    <group position={[0, wallH - 0.18, 0]}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} rotation={[0, (i * Math.PI) / 6, 0]}>
          <boxGeometry args={[roomR * 1.96, 0.26, 0.26]} />
          <meshStandardMaterial map={tex} color="#7a5a40" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Quadros, relógio e alvo de dardos nas paredes. */
function WallArt({ roomR, posters, clockTex, dartTex }) {
  const rr = roomR - 0.06;
  const place = (a, y) => ({ position: [Math.sin(a) * rr, y, Math.cos(a) * rr], rotation: [0, a + Math.PI, 0] });
  const framed = [[3.2, 0], [3.5, 1], [3.8, 2], [4.95, 3], [5.25, 0], [5.55, 1]];
  return (
    <group>
      {framed.map(([a, i]) => (
        <group key={a} {...place(a, 3.98)}>
          <mesh>
            <boxGeometry args={[0.64, 0.84, 0.04]} />
            <meshStandardMaterial color="#2a1a10" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <planeGeometry args={[0.56, 0.76]} />
            <meshBasicMaterial map={posters[i]} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group {...place(DOOR_A, 3.02)}>
        <mesh>
          <circleGeometry args={[0.32, 32]} />
          <meshBasicMaterial map={clockTex} toneMapped={false} />
        </mesh>
      </group>
      <group {...place(0.62, 1.9)}>
        <mesh>
          <circleGeometry args={[0.3, 32]} />
          <meshBasicMaterial map={dartTex} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Apoio de pé em latão e friso dourado, na frente do balcão. */
function BrassRail({ roomR }) {
  const r = roomR - 2.2 - 0.14;
  const geo = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = BAR_FROM + ((BAR_TO - BAR_FROM) * i) / 24;
      pts.push(new THREE.Vector3(Math.sin(a) * r, 0.22, Math.cos(a) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.03, 8, false);
  }, [r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#c9a14a" metalness={0.9} roughness={0.25} />
    </mesh>
  );
}

export function TableDecor({ top, tableR }) {
  const cups = [0.9, 2.5, 4.2];
  const r = Math.min(tableR * 0.55, 1.1);
  return (
    <group position={[0, top, 0]}>
      {/* tigela de amendoim */}
      <mesh position={[0, 0.07, 0]} castShadow>
        <sphereGeometry args={[0.13, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#f1e7d0" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.075, 0]} scale={[1, 0.45, 1]}>
        <sphereGeometry args={[0.11, 14, 10]} />
        <meshStandardMaterial color="#b9803f" roughness={0.9} />
      </mesh>
      {/* porta-copos e xícaras */}
      {cups.map((a, i) => (
        <group key={i} position={[Math.sin(a) * r, 0, Math.cos(a) * r]}>
          <mesh position={[0, 0.004, 0]} receiveShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.008, 20]} />
            <meshStandardMaterial color="#efe5cf" />
          </mesh>
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.035, 0.09, 16]} />
            <meshStandardMaterial color={['#e0a526', '#c98a1b', '#e8b53a'][i]} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Mesa redonda de feltro (a mesa do jogo). Compartilhada por todos os cenários; as texturas vêm de fora. */
export function GameTable({ tableR, feltTex, tableWoodTex, decor = true }) {
  return (
    <group>
        <mesh position={[0, TABLE_TOP - 0.03, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[tableR, tableR, 0.06, 64]} />
          <meshStandardMaterial attach="material-0" map={tableWoodTex} roughness={0.7} />
          <meshStandardMaterial attach="material-1" map={feltTex} roughness={1} />
          <meshStandardMaterial attach="material-2" color={WOOD} roughness={0.8} />
        </mesh>
        <mesh position={[0, TABLE_TOP - 0.005, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[tableR, 0.045, 12, 72]} />
          <meshStandardMaterial color="#3a2217" roughness={0.45} />
        </mesh>
        <mesh position={[0, (TABLE_TOP - 0.06) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.3, TABLE_TOP - 0.06, 24]} />
          <meshStandardMaterial color={WOOD} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.75, 0.8, 0.06, 40]} />
          <meshStandardMaterial color={WOOD} roughness={0.7} />
        </mesh>
        {decor && <TableDecor top={TABLE_TOP} tableR={tableR} />}
      </group>
  );
}

function EnvironmentImpl({ seats, n, seatR, tableR, roomR, wallH, decor = true }) {
  const [floorTex, feltTex, brickTex, woodTex, tableWoodTex, neonTex, openTex, rugTex, clockTex, dartTex, p0, p1, p2, p3] = useDisposable(
    () => [
      makeCheckerTexture({ repeat: [roomR * 0.8, roomR * 0.8] }),
      makeFeltTexture({ repeat: [tableR, tableR] }),
      makeBrickTexture({ repeat: [16, 1.6] }),
      makeWoodTexture({ base: [92, 58, 34], planks: 6, seed: 31, repeat: [6, 1] }),
      makeWoodTexture({ base: [120, 78, 44], planks: 4, seed: 19, repeat: [3, 1] }),
      makeNeonTexture('BAR'),
      makeNeonTextTexture('OPEN', '#3de0ff', '#e8fcff'),
      makeRugTexture(),
      makeDiscTexture('clock'),
      makeDiscTexture('dart'),
      makePosterTexture(0),
      makePosterTexture(1),
      makePosterTexture(2),
      makePosterTexture(3),
    ],
    [roomR, tableR],
  );

  return (
    <group>
      {/* piso xadrez */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[roomR, 64]} />
        <meshStandardMaterial map={floorTex} roughness={0.5} />
      </mesh>

      {/* tapete sob a mesa */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <circleGeometry args={[seatR + 1.1, 64]} />
        <meshStandardMaterial map={rugTex} roughness={1} />
      </mesh>

      {/* paredes de tijolo, lambri de madeira e teto escuro */}
      <mesh position={[0, wallH / 2, 0]}>
        <cylinderGeometry args={[roomR, roomR, wallH, 64, 1, true]} />
        <meshStandardMaterial map={brickTex} side={THREE.BackSide} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[roomR - 0.03, roomR - 0.03, 1.3, 64, 1, true]} />
        <meshStandardMaterial map={woodTex} side={THREE.BackSide} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.33, 0]}>
        <cylinderGeometry args={[roomR - 0.05, roomR - 0.05, 0.08, 64, 1, true]} />
        <meshStandardMaterial color="#c9a14a" metalness={0.6} roughness={0.35} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, wallH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[roomR, 48]} />
        <meshStandardMaterial color="#2a1a12" side={THREE.DoubleSide} />
      </mesh>

      <BarCounter roomR={roomR} woodTex={woodTex} />
<NeonSign roomR={roomR} tex={neonTex} angle={4.2} />
      <NeonSign roomR={roomR} tex={openTex} angle={6.1} y={3.1} w={1.7} h={0.64} color="#3de0ff" lit={false} />
      <WallArt roomR={roomR} posters={[p0, p1, p2, p3]} clockTex={clockTex} dartTex={dartTex} />
      <BarPendants roomR={roomR} />
      <SideTables roomR={roomR} />
      <StringLights roomR={roomR} />
      <CeilingBeams roomR={roomR} wallH={wallH} tex={woodTex} />
      <BrassRail roomR={roomR} />
      <ShelfWall roomR={roomR} from={3.0} to={3.95} rows={[1.5, 2.1, 2.7]} />
      <ShelfWall roomR={roomR} from={4.65} to={5.85} rows={[1.5, 2.1, 2.7]} />
      <Barrels roomR={roomR} />

      {/* mesa redonda de feltro verde (estilo mesa de carteado) */}
      <GameTable tableR={tableR} feltTex={feltTex} tableWoodTex={tableWoodTex} decor={decor} />

      {seats.split(',').map((seat) => (
        <Chair key={seat} seat={Number(seat)} n={n} seatR={seatR} />
      ))}

      <Lamp wallH={wallH} />
    </group>
  );
}

export default memo(EnvironmentImpl);
