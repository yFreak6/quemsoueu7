import { useEffect, useRef } from 'react';
import { useCountdown, useGame } from '../game/GameContext.jsx';
import { sfx } from './sfx.js';

/**
 * Liga os eventos do jogo aos sons. Cada som é guardado por um identificador
 * (id do turno, segundo restante, id do evento), então toca uma única vez por evento,
 * mesmo que o estado seja reenviado ou o componente renderize de novo.
 */
export function useGameSounds() {
  const { state, lastEvent, serverNow } = useGame();
  const youId = state?.you.id;
  const turn = state?.turn;
  const turnId = turn?.id;
  const turnPlayer = turn?.playerId;
  const left = useCountdown(turn?.step === 'action' ? turn.deadline : null);

  // início do turno (não toca ao recarregar a página no meio de um turno)
  const seenTurn = useRef(null);
  useEffect(() => {
    if (!turnId || seenTurn.current === turnId) return;
    const firstLook = seenTurn.current === null;
    seenTurn.current = turnId;
    if (firstLook && serverNow() - (turn.deadline - turn.duration) > 1500) return;
    sfx.turnStart(turnPlayer === youId);
  }, [turnId, turnPlayer, youId, serverNow, turn]);

  // tique-taque: só nos últimos 5 segundos do turno
  const lastTick = useRef('');
  useEffect(() => {
    if (!turnId || turn?.step !== 'action' || left < 1 || left > 5) return;
    const key = `${turnId}:${left}`;
    if (lastTick.current === key) return;
    lastTick.current = key;
    sfx.tick(left, turnPlayer === youId);
  }, [turnId, turn?.step, left, turnPlayer, youId]);

  // eventos do servidor
  const lastEventKey = useRef('');
  useEffect(() => {
    if (!lastEvent) return;
    const key = `${lastEvent.id}:${lastEvent.at}`;
    if (lastEventKey.current === key) return;
    lastEventKey.current = key;

    if (lastEvent.type === 'wrong-guess') {
      const mine = lastEvent.playerId === youId;
      if (mine) sfx.error();
      sfx.lifeLost(mine ? 0.14 : 0); // erro e impacto em sequência, sem se atropelar
      if (lastEvent.eliminated) sfx.eliminated(0.75);
    }
    if (lastEvent.type === 'vote-start') sfx.turnStart(true);
    if (lastEvent.type === 'judg-theme') sfx.turnStart(true);
    if (lastEvent.type === 'judg-answers') sfx.turnStart(false);
    if (lastEvent.type === 'judg-result') sfx.victory(lastEvent.playerId === youId);
    if (lastEvent.type === 'judg-annul') sfx.error();
    if (lastEvent.type === 'vote-result') {
      if (lastEvent.eliminatedId) sfx.eliminated(0);
      else sfx.error();
    }
    if (lastEvent.type === 'game-end' && lastEvent.side) sfx.victory(true);
    else if (lastEvent.type === 'game-end') {
      if (lastEvent.endRule === 'last') {
        if (lastEvent.loserId === youId || !lastEvent.loserId) sfx.defeat();
        else sfx.victory(true);
      } else if (lastEvent.playerId) sfx.victory(lastEvent.playerId === youId);
      else sfx.defeat();
    }
  }, [lastEvent, youId]);
}
