import { io } from 'socket.io-client';

// Mesma origem da página: em dev o Vite encaminha /socket.io para o servidor;
// em produção o próprio Express serve o cliente.
export const socket = io({ autoConnect: true });
