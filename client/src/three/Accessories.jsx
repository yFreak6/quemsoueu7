// Acessórios do boneco (chapéu na cabeça, cachecol/gravata no pescoço). Peças simples e baratas:
// geometrias e materiais compartilhados entre todos os bonecos.
import * as THREE from 'three';
import { outfitHex } from '../game/look.js';

const mat = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });
const M = {
  cap: mat('#d6453d'),
  beanie: mat('#3b6fd6', 0.9),
  pom: mat('#f4f1e8', 0.9),
  top: mat('#1d1d22', 0.5),
  band: mat('#c0392b'),
  gold: new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.35, metalness: 0.6 }),
  party: mat('#e84fa0'),
  scarf: mat('#e0a526', 0.9),
  bow: mat('#c0392b', 0.6),
  jGold: new THREE.MeshStandardMaterial({ color: '#f0ad2e', roughness: 0.22, metalness: 0.75 }),
  jBand: new THREE.MeshStandardMaterial({ color: '#e0562b', roughness: 0.35, metalness: 0.3 }),
};
const G = {
  dome: new THREE.SphereGeometry(0.185, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  brimBack: new THREE.BoxGeometry(0.2, 0.012, 0.11),
  pom: new THREE.SphereGeometry(0.04, 10, 8),
  topCyl: new THREE.CylinderGeometry(0.1, 0.105, 0.2, 18),
  topBrim: new THREE.CylinderGeometry(0.19, 0.19, 0.018, 20),
  topBand: new THREE.CylinderGeometry(0.106, 0.106, 0.03, 18),
  crownRing: new THREE.CylinderGeometry(0.13, 0.12, 0.07, 16, 1, true),
  crownTip: new THREE.ConeGeometry(0.03, 0.07, 6),
  partyCone: new THREE.ConeGeometry(0.085, 0.26, 14),
  scarfRing: new THREE.TorusGeometry(0.175, 0.05, 8, 20),
  scarfTail: new THREE.BoxGeometry(0.07, 0.22, 0.035),
  bowWing: new THREE.ConeGeometry(0.07, 0.11, 10),
  bowKnot: new THREE.SphereGeometry(0.03, 8, 8),
  jRing: new THREE.CylinderGeometry(0.16, 0.135, 0.1, 20, 1, true),
  jTip: new THREE.ConeGeometry(0.036, 0.11, 8),
  jBall: new THREE.SphereGeometry(0.03, 10, 8),
  jBand: new THREE.TorusGeometry(0.139, 0.016, 8, 24),
};
/**
 * Onde fica o bilhete (y, z no grupo da cabeça): na testa e na FRENTE do chapéu (z maior que a aba/cúpula,
 * que chegam a 0.19), então o chapéu nunca cobre o papel. Com óculos o papel sobe para não cobrir os olhos.
 */
export const paperPose = (hat, face) => [face === 'glasses' || face === 'sunglasses' ? 0.34 : 0.25, hat && hat !== 'none' ? 0.235 : 0.17];

// roupas: um material por cor, compartilhado entre bonecos
const OUTFIT_MATS = new Map();
export function outfitMat(id) {
  let m = OUTFIT_MATS.get(id);
  if (!m) OUTFIT_MATS.set(id, (m = new THREE.MeshStandardMaterial({ color: outfitHex(id), roughness: 0.8 })));
  return m;
}
const OG = {
  tie: new THREE.BoxGeometry(0.05, 0.28, 0.02),
  collar: new THREE.BoxGeometry(0.15, 0.05, 0.022),
  hoodRing: new THREE.TorusGeometry(0.16, 0.06, 8, 20),
  pocket: new THREE.BoxGeometry(0.22, 0.09, 0.02),
  apron: new THREE.BoxGeometry(0.31, 0.44, 0.02),
  strap: new THREE.BoxGeometry(0.04, 0.2, 0.02),
};
const OM = { tie: mat('#b3262e', 0.6), white: mat('#f4f4f0', 0.7) };

/** Peças extras da roupa (o corpo da roupa e as mangas são desenhados no Doll, que tem o Limb). */
export function OutfitExtras({ outfit, color }) {
  const m = outfitMat(color);
  if (outfit === 'suit') {
    return (
      <>
        <mesh geometry={OG.collar} material={OM.white} position={[0, 1.1, 0.205]} />
        <mesh geometry={OG.tie} material={OM.tie} position={[0, 0.96, 0.21]} />
      </>
    );
  }
  if (outfit === 'hoodie') {
    return (
      <>
        <mesh geometry={OG.hoodRing} material={m} position={[0, 1.13, -0.02]} rotation={[Math.PI / 2 - 0.25, 0, 0]} />
        <mesh geometry={OG.pocket} material={m} position={[0, 0.76, 0.212]} />
      </>
    );
  }
  if (outfit === 'apron') {
    return (
      <>
        <mesh geometry={OG.apron} material={m} position={[0, 0.88, 0.205]} />
        <mesh geometry={OG.strap} material={m} position={[0, 1.12, 0.19]} />
      </>
    );
  }
  return null;
}

const FACE_MAT = { dark: mat('#1c1c20', 0.4), lens: mat('#0d0d10', 0.25), hair: mat('#3a2a1a', 0.9) };
const FG = {
  rim: new THREE.TorusGeometry(0.05, 0.009, 8, 18),
  bridge: new THREE.BoxGeometry(0.035, 0.01, 0.01),
  lens: new THREE.SphereGeometry(0.056, 12, 8),
  stache: new THREE.CapsuleGeometry(0.014, 0.06, 3, 8),
};
/** Rosto (grupo da cabeça): óculos, óculos escuros ou bigode. O bilhete fica acima, então não cobre nada. */
export function Face({ face }) {
  if (face === 'glasses') {
    return (
      <group position={[0, 0.17, 0.156]}>
        <mesh geometry={FG.rim} material={FACE_MAT.dark} position={[-0.068, 0, 0]} />
        <mesh geometry={FG.rim} material={FACE_MAT.dark} position={[0.068, 0, 0]} />
        <mesh geometry={FG.bridge} material={FACE_MAT.dark} position={[0, 0.005, 0.004]} />
      </group>
    );
  }
  if (face === 'sunglasses') {
    return (
      <group position={[0, 0.17, 0.152]}>
        <mesh geometry={FG.lens} material={FACE_MAT.lens} position={[-0.068, 0, 0]} scale={[1, 0.72, 0.3]} />
        <mesh geometry={FG.lens} material={FACE_MAT.lens} position={[0.068, 0, 0]} scale={[1, 0.72, 0.3]} />
        <mesh geometry={FG.bridge} material={FACE_MAT.dark} position={[0, 0.005, 0.006]} />
      </group>
    );
  }
  if (face === 'mustache') {
    return (
      <group position={[0, 0.085, 0.158]}>
        <mesh geometry={FG.stache} material={FACE_MAT.hair} position={[-0.034, 0, 0]} rotation={[0, 0, Math.PI / 2 - 0.3]} />
        <mesh geometry={FG.stache} material={FACE_MAT.hair} position={[0.034, 0, 0]} rotation={[0, 0, -Math.PI / 2 + 0.3]} />
      </group>
    );
  }
  return null;
}

const CROWN_TIPS = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2);

const JUDGE_TIPS = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2);

/** Posição local: centro da esfera da cabeça em y = 0.14, raio 0.17 (grupo da cabeça no pescoço). */
export function Hat({ hat }) {
  switch (hat) {
    case 'cap':
      return (
        <group position={[0, 0.15, 0]} rotation={[-0.12, 0, 0]}>
          <mesh geometry={G.dome} material={M.cap} />
          <mesh geometry={G.brimBack} material={M.cap} position={[0, 0.01, -0.2]} /> {/* aba para trás: não cobre o papel */}
        </group>
      );
    case 'beanie':
      return (
        <group position={[0, 0.15, 0]}>
          <mesh geometry={G.dome} material={M.beanie} />
          <mesh geometry={G.pom} material={M.pom} position={[0, 0.19, 0]} />
        </group>
      );
    case 'tophat':
      return (
        <group position={[0, 0.33, -0.01]}>
          <mesh geometry={G.topBrim} material={M.top} />
          <mesh geometry={G.topCyl} material={M.top} position={[0, 0.11, 0]} />
          <mesh geometry={G.topBand} material={M.band} position={[0, 0.03, 0]} />
        </group>
      );
    case 'crown':
      return (
        <group position={[0, 0.34, -0.01]}>
          <mesh geometry={G.crownRing} material={M.gold} />
          {CROWN_TIPS.map((r) => (
            <mesh key={r} geometry={G.crownTip} material={M.gold} position={[Math.sin(r) * 0.125, 0.065, Math.cos(r) * 0.125]} />
          ))}
        </group>
      );
    case 'judge': // coroa dourada brilhante com bolinhas nas pontas (visual fixo do Julgador)
      return (
        <group position={[0, 0.355, -0.01]}>
          <mesh geometry={G.jRing} material={M.jGold} side={THREE.DoubleSide} />
          <mesh geometry={G.jBand} material={M.jBand} position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]} />
          {JUDGE_TIPS.map((r) => (
            <group key={r} position={[Math.sin(r) * 0.15, 0.05, Math.cos(r) * 0.15]}>
              <mesh geometry={G.jTip} material={M.jGold} position={[0, 0.055, 0]} />
              <mesh geometry={G.jBall} material={M.jGold} position={[0, 0.13, 0]} />
            </group>
          ))}
        </group>
      );
    case 'party':
      return <mesh geometry={G.partyCone} material={M.party} position={[0, 0.44, -0.02]} rotation={[-0.15, 0, 0.18]} />;
    default:
      return null;
  }
}

/** Posição local: grupo interno do tronco (y do pescoço ≈ 1.2). */
export function Neck({ neck, shift = 0 }) {
  if (neck === 'scarf') {
    return (
      <group position={[0, 1.19, 0]}>
        <mesh geometry={G.scarfRing} material={M.scarf} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={G.scarfTail} material={M.scarf} position={[0.1, -0.1, 0.19]} rotation={[0, 0, 0.12]} />
      </group>
    );
  }
  if (neck === 'bowtie') {
    return (
      <group position={[0, 1.15, 0.2 + shift]}>
        <mesh geometry={G.bowWing} material={M.bow} position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        <mesh geometry={G.bowWing} material={M.bow} position={[0.06, 0, 0]} rotation={[0, 0, -Math.PI / 2]} />
        <mesh geometry={G.bowKnot} material={M.bow} />
      </group>
    );
  }
  return null;
}
