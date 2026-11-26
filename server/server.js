import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createGameServer } from './net/gameServer.js';
import { createJudgeAI } from './game/judgeAI.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Em desenvolvimento o Vite faz proxy, então CORS nem é usado. Em produção,
  // defina CORS_ORIGIN (separado por vírgulas) se o cliente ficar em outro domínio.
  cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true },
});

// IA do modo O JULGADOR (IA): só funciona com ANTHROPIC_API_KEY definida no servidor (veja game/judgeAI.js)
const judgeAI = createJudgeAI();
console.log(judgeAI.available ? `Julgadora de IA ativa (modelo ${judgeAI.model}).` : 'Julgadora de IA desativada: defina ANTHROPIC_API_KEY para habilitar o modo O JULGADOR (IA).');
const game = createGameServer(io, { judgeAI });
setInterval(() => game.sweep(), 60_000).unref();

app.get('/health', (_req, res) => res.json({ ok: true, rooms: game.rooms.size }));

// Em produção, serve o cliente compilado (npm run build)
const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  // gzip em memória para JS/CSS (o bundle do three.js é grande) + cache longo nos arquivos com hash
  const gz = new Map();
  app.get(/^\/assets\/.+\.(js|css)$/, (req, res, next) => {
    if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
    const file = path.join(dist, req.path);
    if (!file.startsWith(dist) || !fs.existsSync(file)) return next();
    let buf = gz.get(file);
    if (!buf) gz.set(file, (buf = zlib.gzipSync(fs.readFileSync(file), { level: 9 })));
    res.set({
      'Content-Encoding': 'gzip',
      'Content-Type': req.path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      Vary: 'Accept-Encoding',
    });
    res.send(buf);
  });
  app.use(express.static(dist, { setHeaders: (res, f) => { if (f.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, () => console.log(`Servidor em http://localhost:${PORT}`));
