// Tema dos menus (claro/escuro). Guardado no navegador; sem preferência salva, segue o sistema.
const KEY = 'qse-theme';
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* armazenamento bloqueado: segue o sistema */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current = read();
const apply = () => {
  document.documentElement.classList.toggle('dark', current === 'dark');
  document.documentElement.style.colorScheme = current;
};
apply();

export const getTheme = () => current;
export function setTheme(t) {
  current = t === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem(KEY, current); } catch { /* ignora */ }
  apply();
  listeners.forEach((l) => l(current));
}
export const subscribeTheme = (l) => { listeners.add(l); return () => listeners.delete(l); };
