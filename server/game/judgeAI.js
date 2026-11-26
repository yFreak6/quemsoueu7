// Julgadora de IA (modo "O JULGADOR (IA)"): gera temas e escolhe a melhor resposta chamando uma IA de verdade
// (API de mensagens da Anthropic), SEMPRE a partir do servidor. Não há lista de temas nem de respostas.
//
// Configuração (variáveis de ambiente do servidor; nada disso vai para o cliente):
//   ANTHROPIC_API_KEY         obrigatória: sem ela o modo fica indisponível (o lobby avisa o que falta)
//   ANTHROPIC_BASE_URL        opcional (padrão https://api.anthropic.com)
//   JUDGE_AI_MODEL            opcional (padrão claude-sonnet-5-5)
//   JUDGE_AI_SEARCH           'off' desliga a busca na web nos temas objetivos (padrão: ligada)
//   JUDGE_AI_SEARCH_TOOL      versão da ferramenta de busca do servidor da API (padrão web_search_20250305)
//   JUDGE_AI_TIMEOUT_MS       tempo máximo de cada chamada (padrão 60000)
//
// A IA só recebe o TEMA e os TEXTOS das respostas com suas letras (A, B, C…): nunca nomes, ids nem ordem de envio.

export class AIError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AIError';
    this.cause = cause;
  }
}

const SYSTEM_THEME = `Você cria os temas de um jogo de festa entre amigos (em português do Brasil). Em cada rodada os jogadores escrevem UMA resposta curta e uma Julgadora escolhe a melhor.

REGRA PRINCIPAL: toda resposta é o NOME DE UM PERSONAGEM (ou figura). O tema precisa SEMPRE abrir espaço para responder com um personagem: real ou fictício (pessoas famosas, históricas, atletas, músicos, youtubers, personagens de desenho, anime, filme, série, jogo, quadrinhos, livros, folclore, mitologia etc.). Nunca crie pergunta cuja resposta seja uma coisa, um lugar, uma ação, um objeto, uma situação ou uma opinião (como "pior superpoder", "melhor comida", "o que fazer em…").

Crie UM tema NOVO e original, do zero, no formato de um pedido curto que peça um personagem, por exemplo "Personagem mais engraçado", "Personagem que você não gostaria de encontrar sozinho à noite" ou "Personagem mais alto do desenho Bob Esponja". Não copie esses exemplos: eles só mostram o formato.
Regras:
- Varie bastante de uma rodada para outra: mude a característica (engraçado, forte, esperto, rápido, alto, assustador, rico, azarado, melhor líder, pior vizinho, mais carismático, mais teimoso…) e o universo (desenhos, animações, filmes, séries, jogos, anime, pessoas conhecidas, história, esportes, música, internet, mitologia).
- Pode ser geral (qualquer personagem) ou específico (de um universo, época ou tipo de personagem), siga a instrução "estilo" recebida.
- Apropriado para amigos, criativo, claro e respondível em poucas palavras. Nada ofensivo, sexual ou que exponha pessoas comuns (só figuras públicas ou fictícias).
- Nunca repita nem reformule levemente um tema da lista "já usados".
- Responda SOMENTE com JSON: {"theme":"..."} (máximo de 100 caracteres, sem ponto final).`;

const SYSTEM_JUDGE = `Você é a Julgadora de um jogo de festa entre amigos (português do Brasil). Recebe um TEMA e respostas anônimas rotuladas com letras; cada resposta é o nome de um personagem (real ou fictício). Escolha UMA resposta vencedora pelo CONTEÚDO; você não sabe nem deve tentar adivinhar quem escreveu cada uma.

Primeiro classifique o tema:
- SUBJETIVO (não há resposta oficialmente correta: engraçado, assustador, melhor líder, personalidade…): use seu próprio julgamento, com critérios claros baseados em características conhecidas dos personagens ou coisas citadas e na ligação delas com o tema. Não finja que existe resposta oficial.
- OBJETIVO (dá para verificar com fatos: mais alto, mais velho, mais rápido, maior fortuna…): busque a maior precisão. Se não tiver certeza, use a ferramenta de busca na web (priorize fontes confiáveis), compare os fatos com as respostas e considere diferenças entre versões, universos e adaptações. Não invente informações. Se não houver dados suficientes para concluir com segurança, use o melhor julgamento e marque "uncertain": true.

Responda SOMENTE com JSON, sem texto fora dele:
{"winner":"<letra>","kind":"objective"|"subjective","justification":"<no máximo 2 frases curtas em português do Brasil>","uncertain":true|false}`;

const parseJson = (text) => {
  const m = String(text ?? '').match(/\{[\s\S]*\}/g);
  if (!m) throw new AIError('A IA não devolveu JSON.');
  for (let i = m.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(m[i]);
    } catch {
      /* tenta o bloco anterior */
    }
  }
  throw new AIError('JSON da IA inválido.');
};

/**
 * Cria o cliente da Julgadora. `fetchImpl` e `env` são injetáveis (os testes usam um servidor HTTP local para
 * conferir o pedido enviado e o formato da resposta, sem precisar de chave real).
 */
export function createJudgeAI({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const apiKey = String(env.ANTHROPIC_API_KEY ?? '').trim();
  const baseUrl = String(env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  const model = env.JUDGE_AI_MODEL || 'claude-sonnet-5-5';
  const searchOn = String(env.JUDGE_AI_SEARCH ?? '').toLowerCase() !== 'off';
  const searchTool = env.JUDGE_AI_SEARCH_TOOL || 'web_search_20250305';
  const timeoutMs = Number(env.JUDGE_AI_TIMEOUT_MS) || 60_000;

  async function call({ system, user, maxTokens, tools, temperature }) {
    if (!apiKey) throw new AIError('IA não configurada (falta ANTHROPIC_API_KEY no servidor).');
    const messages = [{ role: 'user', content: user }];
    let text = '';
    // ferramentas do servidor (busca na web) podem pausar o turno: continua até 4 vezes
    for (let i = 0; i < 4; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, ...(tools ? { tools } : {}), ...(temperature != null ? { temperature } : {}) }),
        });
      } catch (e) {
        throw new AIError(e?.name === 'AbortError' ? 'A IA demorou demais para responder.' : 'Não foi possível falar com a IA.', e);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.json())?.error?.message ?? '';
        } catch {
          /* corpo não era JSON */
        }
        throw new AIError(`A IA recusou o pedido (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`);
      }
      const data = await res.json();
      const content = Array.isArray(data.content) ? data.content : [];
      text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (data.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content });
        continue;
      }
      return text;
    }
    return text;
  }

  return {
    available: !!apiKey,
    model,

    /** Cria um tema novo. `used` = temas já usados na partida (a IA deve evitá-los); `style` = 'geral' | 'específico'. */
    async generateTheme({ used = [], style = 'geral', seed = Math.random().toString(36).slice(2, 8) } = {}) {
      const user = `Estilo desta rodada: ${style}.\nSemente de variação (ignore o valor, só varie): ${seed}.\nJá usados nesta partida (não repetir): ${used.length ? used.map((t) => `"${t}"`).join('; ') : 'nenhum'}.\nCrie o tema.`;
      const out = parseJson(await call({ system: SYSTEM_THEME, user, maxTokens: 300, temperature: 1 }));
      const theme = String(out.theme ?? '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
      if (theme.length < 3) throw new AIError('A IA devolveu um tema vazio.');
      return theme.slice(0, 120);
    },

    /** Escolhe a melhor resposta. `answers` = [{ label, text }] (anônimas). Devolve { winner, kind, justification, uncertain }. */
    async judge({ theme, answers }) {
      const labels = answers.map((a) => a.label);
      const list = answers.map((a) => `${a.label}) ${a.text}`).join('\n');
      const user = `TEMA: ${theme}\n\nRESPOSTAS:\n${list}\n\nEscolha a vencedora (letras válidas: ${labels.join(', ')}).`;
      const tools = searchOn ? [{ type: searchTool, name: 'web_search', max_uses: 3 }] : undefined;
      const out = parseJson(await call({ system: SYSTEM_JUDGE, user, maxTokens: 2000, tools }));
      const winner = String(out.winner ?? '').trim().toUpperCase().slice(0, 1);
      if (!labels.includes(winner)) throw new AIError('A IA escolheu uma resposta que não existe.');
      return {
        winner,
        kind: out.kind === 'objective' ? 'objective' : 'subjective',
        justification: String(out.justification ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
        uncertain: out.uncertain === true,
      };
    },
  };
}
