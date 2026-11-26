import { useFrame } from '@react-three/fiber';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Chair, GameTable, useDisposable } from '../Environment.jsx';
import { seatAngle } from '../layout.js';
import { FreezeStatic } from '../sceneUtils.jsx';
import { makeFeltTexture, makeWoodTexture } from '../textures.js';
import { buildClouds, buildStrip, LANE, PALETTE, ROAD_HALF, ROAD_Y, SIDEWALK, stripOffset, TRAFFIC, truckDims } from './truckLayout.js';

/**
 * Cenário 'truck': a mesa e as cadeiras dentro da caçamba de uma caminhonete que anda por uma rodovia de cidade.
 *
 * DESEMPENHO (pensado para PCs fracos):
 *  - tudo o que é fixo (caminhonete, pista, mesa, cadeiras) fica congelado (FreezeStatic), como no bar;
 *  - a rodovia "infinita" NÃO é gerada: é UM trecho de 30 m (prédios, árvores, postes, faixas) repetido em 3 cópias e
 *    deslizando em ciclo; o trecho é periódico, então a volta é imperceptível. Custa 1 grupo mexendo por quadro;
 *  - prédios/árvores/postes/faixas/nuvens são instanciados (7 chamadas de desenho no total), sem sombra própria;
 *  - 1 luz direcional (a única com sombra) + ambiente + hemisférica; céu é uma esfera com textura 1×256 px.
 *
 * ORIENTAÇÃO: cada cliente vê da própria cadeira, então o ambiente (caminhonete + estrada) é girado para que a
 * frente da caminhonete fique sempre ATRÁS da mesa, do ponto de vista de quem olha (como na imagem de referência).
 * Os bonecos, a mesa e as cadeiras ficam nos lugares de sempre; só o ambiente gira.
 *
 * AJUSTES RÁPIDOS: cores e medidas em truckLayout.js (PALETTE, LANE, SPEED, PERIOD, truckDims); luzes e névoa abaixo.
 */

const FOG = '#efc4a0';
const SKY_R = 52;

// ---------- texturas pequenas (desenhadas uma vez) ----------
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5f9fd0'); // zênite
  grad.addColorStop(0.36, '#a9c9df');
  grad.addColorStop(0.5, '#f6cfa8'); // horizonte
  grad.addColorStop(0.52, FOG);
  grad.addColorStop(1, FOG);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fachada de prédio: base clara (tingida por instância) + grade de janelas. */
function makeFacadeTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 4; col++) {
      g.fillStyle = rnd() < 0.18 ? '#f0d9a0' : '#59687a';
      g.fillRect(6 + col * 15, 8 + r * 15, 9, 10);
    }
  }
  g.fillStyle = 'rgba(0,0,0,.16)';
  g.fillRect(0, 120, 64, 8); // térreo mais escuro
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- instanciamento ----------
/** `place(obj, item)` posiciona o Object3D auxiliar e devolve (opcional) a cor da instância. Roda uma única vez. */
function Instances({ items, place, children, castShadow = false }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      const color = place(o, it);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (color) mesh.setColorAt(i, col.set(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, place]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false} castShadow={castShadow}>
      {children}
    </instancedMesh>
  );
}

// ---------- a paisagem que passa ----------
const placeBuilding = (o, b) => {
  o.position.set(b.x, b.y, b.z);
  o.scale.set(b.w, b.h, b.d);
  return b.color;
};
const placeTrunk = (o, t) => {
  o.position.set(t.x, t.trunkH / 2, t.z);
  o.scale.set(1, t.trunkH, 1);
};
const placeCrown = (o, t) => {
  o.position.set(t.x, t.trunkH + t.crownR * 0.65, t.z);
  o.scale.set(t.crownR, t.crownR * 0.95, t.crownR);
  o.rotation.y = t.z * 0.7; // cada copa gira um pouco: parecem diferentes
  return PALETTE.crown[t.tint];
};
const placePole = (o, l) => o.position.set(l.x, 3.1, l.z);
const placeLampHead = (o, l) => o.position.set(l.x - l.side * 0.7, 6.15, l.z);
const placeDash = (o, d) => o.position.set(d.x, 0.012, d.z);

/** Trecho de rodovia que desliza: o deslocamento é feito por UM grupo, em ciclo de PERIOD metros. */
function MovingStrip({ facade }) {
  const mov = useRef();
  const strip = useMemo(() => buildStrip(), []);
  useFrame(({ clock }) => {
    if (mov.current) mov.current.position.z = stripOffset(clock.elapsedTime);
  });
  return (
    <group ref={mov}>
      <Instances items={strip.buildings} place={placeBuilding}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial map={facade} />
      </Instances>
      <Instances items={strip.trees} place={placeTrunk}>
        <cylinderGeometry args={[0.14, 0.2, 1, 6]} />
        <meshLambertMaterial color="#6b4630" />
      </Instances>
      <Instances items={strip.trees} place={placeCrown}>
        <icosahedronGeometry args={[1, 0]} />
        <meshLambertMaterial flatShading />
      </Instances>
      <Instances items={strip.lamps} place={placePole}>
        <cylinderGeometry args={[0.07, 0.09, 6.2, 6]} />
        <meshLambertMaterial color="#4d535a" />
      </Instances>
      <Instances items={strip.lamps} place={placeLampHead}>
        <boxGeometry args={[1.3, 0.12, 0.34]} />
        <meshBasicMaterial color="#ffe6a8" />
      </Instances>
      <Instances items={strip.dashes} place={placeDash}>
        <boxGeometry args={[0.18, 0.02, 3]} />
        <meshBasicMaterial color={PALETTE.line} />
      </Instances>
    </group>
  );
}

const placeCloud = (o, c) => {
  o.position.set(c.x, c.y, c.z);
  o.scale.set(c.sx, c.sy, c.sz);
};
function Clouds() {
  const clouds = useMemo(() => buildClouds(), []);
  return (
    <Instances items={clouds} place={placeCloud}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="#fff1e2" fog={false} toneMapped={false} />
    </Instances>
  );
}

function Sky() {
  const tex = useDisposable(makeSkyTexture, []);
  return (
    <mesh renderOrder={-2}>
      <sphereGeometry args={[SKY_R, 24, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// ---------- pista fixa e carros à frente ----------
function Car({ x, z, color }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.8, 0.75, 4.2]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.25, 0.25]}>
        <boxGeometry args={[1.6, 0.6, 2.2]} />
        <meshLambertMaterial color={PALETTE.glass} />
      </mesh>
      <mesh position={[0, 0.7, 2.12]}>
        <boxGeometry args={[1.5, 0.16, 0.04]} />
        <meshBasicMaterial color="#ff4a3a" />
      </mesh>
    </group>
  );
}

function RoadStatic() {
  const L = 420; // comprimento do asfalto (m): a névoa esconde o fim
  const zc = -L / 2 + 40;
  const sx = SIDEWALK.from + SIDEWALK.width / 2;
  return (
    <>
      <mesh position={[0, -0.07, zc]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[900, L + 200]} />
        <meshLambertMaterial color={PALETTE.ground} />
      </mesh>
      <mesh position={[0, -0.05, zc]}>
        <boxGeometry args={[ROAD_HALF * 2, 0.1, L]} />
        <meshLambertMaterial color={PALETTE.asphalt} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * sx, SIDEWALK.h / 2 - 0.02, zc]}>
            <boxGeometry args={[SIDEWALK.width, SIDEWALK.h, L]} />
            <meshLambertMaterial color={PALETTE.sidewalk} />
          </mesh>
          <mesh position={[s * (ROAD_HALF - 0.4), 0.012, zc]}>
            <boxGeometry args={[0.16, 0.02, L]} />
            <meshBasicMaterial color={PALETTE.line} />
          </mesh>
        </group>
      ))}
      {TRAFFIC.map((c, i) => (
        <Car key={i} {...c} />
      ))}
    </>
  );
}

// ---------- a caminhonete ----------
function Truck({ seatR }) {
  const d = truckDims(seatR);
  const { hw, half, wallH, wallT, gateH } = d;
  const floorTex = useDisposable(() => makeWoodTexture({ base: [74, 54, 44], planks: 7, seed: 5, repeat: [Math.max(2, hw), Math.max(2, half)] }), [hw, half]);
  const W = 2 * hw;
  const Ln = 2 * half;
  const red = PALETTE.truck;
  const front = -half - wallT; // face traseira da cabine
  return (
    <group>
      {/* chassi + piso da caçamba (topo do piso = y 0, o mesmo chão do bar) */}
      <mesh position={[0, -0.52, 0]}>
        <boxGeometry args={[W + 0.2, 0.9, Ln + 0.2]} />
        <meshStandardMaterial color={PALETTE.truckDark} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[W, 0.1, Ln]} />
        <meshStandardMaterial map={floorTex} roughness={0.9} />
      </mesh>

      {/* laterais: casca vermelha por fora, forro escuro por dentro e friso no topo */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (hw + wallT / 2), wallH / 2, 0]} castShadow>
            <boxGeometry args={[wallT, wallH, Ln + wallT]} />
            <meshStandardMaterial color={red} roughness={0.55} />
          </mesh>
          <mesh position={[s * (hw - 0.02), wallH / 2 - 0.04, 0]} receiveShadow>
            <boxGeometry args={[0.04, wallH - 0.08, Ln]} />
            <meshStandardMaterial color={PALETTE.bedInside} roughness={0.9} />
          </mesh>
          <mesh position={[s * (hw + wallT / 2), wallH + 0.035, 0]}>
            <boxGeometry args={[wallT + 0.1, 0.07, Ln + wallT + 0.1]} />
            <meshStandardMaterial color="#d4493a" roughness={0.45} />
          </mesh>
          {/* rodas (2 por lado) */}
          {[-(half + 3.1), half - 1.6].map((z) => (
            <mesh key={z} position={[s * (hw + 0.12), -0.55, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.55, 0.55, 0.42, 14]} />
              <meshStandardMaterial color={PALETTE.tire} roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}

      {/* tampa traseira (baixa, para a câmera enxergar a estrada) */}
      <mesh position={[0, gateH / 2, half + wallT / 2]} castShadow>
        <boxGeometry args={[W + 2 * wallT, gateH, wallT]} />
        <meshStandardMaterial color={red} roughness={0.55} />
      </mesh>

      {/* parede dianteira da caçamba, cabine com o vidro traseiro e capô */}
      <mesh position={[0, 0.45, -half - wallT / 2]} castShadow>
        <boxGeometry args={[W + 2 * wallT, 0.9, wallT]} />
        <meshStandardMaterial color={red} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.525, front - 1.1]}>
        <boxGeometry args={[W + 2 * wallT + 0.1, 1.45, 2.2]} />
        <meshStandardMaterial color={red} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.08, front + 0.012]}>
        <boxGeometry args={[W * 0.72, 0.36, 0.02]} />
        <meshStandardMaterial color={PALETTE.glass} roughness={0.2} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.2, front - 3.5]}>
        <boxGeometry args={[W + 0.1, 0.8, 2.6]} />
        <meshStandardMaterial color={red} roughness={0.55} />
      </mesh>
    </group>
  );
}

function TruckSceneryImpl({ n, seatKey, seatR, layout, camSeat, sheetOn }) {
  const { tableR } = layout;
  const { roadScale } = truckDims(seatR);
  const yaw = seatAngle(camSeat, n); // gira o ambiente para a frente da caminhonete ficar atrás da mesa de quem olha
  const [feltTex, tableWoodTex, facade] = useDisposable(
    () => [makeFeltTexture({ repeat: [tableR, tableR] }), makeWoodTexture({ base: [120, 78, 44], planks: 4, seed: 19, repeat: [3, 1] }), makeFacadeTexture()],
    [tableR],
  );
  const sun = Math.ceil(seatR + 2);

  return (
    <>
      <color attach="background" args={[FOG]} />
      <fog attach="fog" args={[FOG, 24, 58]} />

      {/* fim de tarde: ambiente quente + céu/chão + sol baixo (única luz com sombra) */}
      <ambientLight intensity={0.55} color="#ffe2c4" />
      <hemisphereLight args={['#ffe9d2', '#7a6a5c', 0.75]} />

      <Sky />
      <Clouds />

      <FreezeStatic freezeKey={`${seatKey}|${n}|${camSeat}|${sheetOn}`}>
        <group rotation={[0, yaw, 0]}>
          <directionalLight
            position={[-7, 10, 8]}
            intensity={1.35}
            color="#ffd2a0"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-sun}
            shadow-camera-right={sun}
            shadow-camera-top={sun}
            shadow-camera-bottom={-sun}
            shadow-camera-near={1}
            shadow-camera-far={30}
            shadow-bias={-0.0005}
          />
          <Truck seatR={seatR} />
          <group position={[0, ROAD_Y, 0]} scale={roadScale}>
            <RoadStatic />
          </group>
        </group>
        <GameTable tableR={tableR} feltTex={feltTex} tableWoodTex={tableWoodTex} decor={!sheetOn} />
        {seatKey.split(',').map((seat) => (
          <Chair key={seat} seat={Number(seat)} n={n} seatR={seatR} />
        ))}
      </FreezeStatic>

      {/* o que se mexe fica fora do congelamento */}
      <group rotation={[0, yaw, 0]}>
        <group position={[0, ROAD_Y, 0]} scale={roadScale}>
          <MovingStrip facade={facade} />
        </group>
      </group>
    </>
  );
}

export default memo(TruckSceneryImpl);
