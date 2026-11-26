import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';

/**
 * Congela as matrizes do cenário fixo (paredes, balcão, prateleiras…): o three recalcula a matriz de CADA objeto a
 * cada quadro, mesmo dos que nunca se mexem. O que anima no ambiente é só intensidade de luz e opacidade, não posição.
 * Quando as props mudam (jogadores/assentos), descongela, deixa o React aplicar e congela de novo.
 */
export function FreezeStatic({ freezeKey, children }) {
  const ref = useRef();
  const frames = useRef(0);
  const frozen = useRef(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.traverse((o) => {
      o.matrixAutoUpdate = true;
      o.matrixWorldNeedsUpdate = true;
    });
    frames.current = 0;
    frozen.current = false;
  }, [freezeKey]);
  useFrame(() => {
    if (frozen.current || ++frames.current < 3) return; // 3 quadros: matrizes recalculadas com os valores novos
    frozen.current = true;
    ref.current?.traverse((o) => {
      if (o.isLight || o.isCamera) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
  });
  return <group ref={ref}>{children}</group>;
}
