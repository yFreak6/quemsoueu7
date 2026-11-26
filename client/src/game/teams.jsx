// Cores e nomes dos dois times (usados no lobby, no HUD, na tela final e nos bonecos 3D).
export const TEAM = {
  1: { name: 'Time 1', color: '#ef4444', soft: '#fee2e2', ink: '#991b1b', paper: '#ff9a9a' }, // vermelho
  2: { name: 'Time 2', color: '#0ea5e9', soft: '#e0f2fe', ink: '#075985', paper: '#8fd3ff' }, // azul
};
export const teamOf = (state, playerId) => state.players.find((p) => p.id === playerId)?.team ?? null;
export const teamsAvailable = (n) => n === 2 || (n >= 4 && n <= 10);

/** Etiqueta colorida do time de um jogador. */
export function TeamTag({ team, className = '' }) {
  if (!team) return null;
  const t = TEAM[team];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${className}`} style={{ background: t.soft, color: t.ink }}>
      {t.name}
    </span>
  );
}
