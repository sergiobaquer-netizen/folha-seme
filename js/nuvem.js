'use strict';
/* Ligação com o banco de dados (Supabase): login, carga dos dados e gravação do que mudou. */
const sb = window.supabase.createClient(CFG.url, CFG.key);

const Nuvem = (() => {
  const COLS = {
    escolas: ['codigo', 'nome', 'polo', 'zona', 'niveis', 'endereco', 'diretor', 'contato', 'status'],
    servidores: ['id', 'matricula', 'nome', 'cpf', 'vinculo', 'situacao', 'tipo_lotacao', 'dobra', 'cargo', 'funcao', 'turno', 'serie', 'nivel', 'disciplina', 'escola', 'outros_orgaos', 'carga', 'orgao_permuta', 'local_lotacao', 'admissao', 'vencimento', 'obs', 'segmento_folha', 'reposicao'],
    necessidades: ['id', 'escola', 'funcao', 'turno', 'serie', 'qtd', 'lotada_origem', 'prioridade', 'obs'],
    dominios: ['tipo', 'valores'],
    competencias: ['id', 'status', 'aberta_em'],
    lancamentos: ['comp', 'servidor_id', 'faltas', 'compl', 'he', 'ferias', 'info'],
    conferencias: ['comp', 'unidade', 'status', 'por', 'em'],
    folhas: ['comp', 'linhas', 'fechada_em', 'por'],
    solicitacoes: ['id', 'servidor_id', 'servidor_nome', 'escola', 'solicitante', 'tipo', 'dados', 'antes', 'justificativa', 'status', 'parecer', 'criada_em', 'decidida_em', 'decidida_por'],
    cand_status: ['cand_id', 'status', 'nec', 'escola', 'em'],
    organograma: ['bloco', 'codigo']
  };
  const PK = { escolas: ['codigo'], servidores: ['id'], necessidades: ['id'], dominios: ['tipo'], competencias: ['id'], lancamentos: ['comp', 'servidor_id'], conferencias: ['comp', 'unidade'], folhas: ['comp'], solicitacoes: ['id'], cand_status: ['cand_id'], organograma: ['bloco'] };
  // tabelas que cada perfil grava (o banco confere de novo, pelas regras de acesso)
  const ESCREVE = { admin: Object.keys(COLS), diretor: ['solicitacoes', 'lancamentos', 'conferencias'], gestor: [] };
  const NAO_TEXTO = ['id', 'qtd', 'lotada_origem', 'servidor_id', 'dados', 'antes', 'solicitante_id', 'dobra', 'valores', 'linhas', 'nec', 'cand_id'];
  let snap = {}, fila = Promise.resolve(), pend = 0, carregadoEm = 0, recarregando = false;

  const falhou = e => new Error((e && (e.message || e.error_description)) || 'erro desconhecido');
  async function todos(tabela, ordem, desc, limite) {
    let out = [], de = 0;
    for (;;) {
      let q = sb.from(tabela).select('*');
      [].concat(ordem).forEach(o => { q = q.order(o, { ascending: !desc }); });
      const ate = limite ? Math.min(de + 999, limite - 1) : de + 999;
      const { data, error } = await q.range(de, ate);
      if (error) throw falhou(error);
      out = out.concat(data);
      if (data.length < 1000 || (limite && out.length >= limite)) break;
      de += 1000;
    }
    return out;
  }
  const limpa = r => { Object.keys(r).forEach(k => { if (r[k] === null && !NAO_TEXTO.includes(k)) r[k] = ''; }); if ('dobra' in r) r.dobra = !!r.dobra; return r; };

  // linhas de cada tabela a partir do estado em memória
  function linhas(t) {
    const s = state, out = [];
    if (t === 'dominios') return Object.keys(s.dominios).map(k => ({ tipo: k, valores: s.dominios[k] }));
    if (t === 'lancamentos') { Object.keys(s.lancamentos).forEach(c => Object.keys(s.lancamentos[c]).forEach(id => { const l = s.lancamentos[c][id]; out.push({ comp: c, servidor_id: +id, faltas: String(l.faltas == null ? '' : l.faltas), compl: l.compl || '', he: l.he || '', ferias: l.ferias || '', info: l.info || '' }); })); return out; }
    if (t === 'conferencias') { Object.keys(s.conferencias).forEach(c => Object.keys(s.conferencias[c]).forEach(u => out.push(Object.assign({ comp: c, unidade: u }, s.conferencias[c][u])))); return out; }
    if (t === 'folhas') return Object.keys(s.folhas).map(c => Object.assign({ comp: c }, s.folhas[c]));
    if (t === 'cand_status') return Object.keys(s.candStatus).map(id => Object.assign({ cand_id: +id }, s.candStatus[id]));
    if (t === 'organograma') return Object.keys(s.organograma).map(b => ({ bloco: b, codigo: s.organograma[b] }));
    return s[t];
  }
  const escolhe = (t, r) => { const o = {}; COLS[t].forEach(c => { o[c] = r[c] === undefined ? null : r[c]; }); return o; };
  const chave = (t, r) => PK[t].map(k => r[k]).join('|');
  function foto(tabs) { const m = {}; tabs.forEach(t => { m[t] = {}; linhas(t).forEach(r => { const o = escolhe(t, r); m[t][chave(t, o)] = JSON.stringify(o); }); }); return m; }

  function indicador() { const el = $('#sinc'); if (el) { el.textContent = pend ? 'Salvando…' : 'Tudo salvo no banco'; el.style.opacity = pend ? 1 : .65; } }
  function enfileira(fn) {
    pend++; indicador();
    fila = fila.then(fn).then(() => { pend--; indicador(); }, async e => {
      pend--; indicador();
      toast('Não foi possível gravar no banco: ' + falhou(e).message + '. Os dados foram recarregados.', true);
      if (!recarregando) { recarregando = true; try { await carregar(); App.redesenhar(); } catch (x) { /* mantém a tela */ } recarregando = false; }
    });
  }
  const lotes = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
  const ok = r => { if (r.error) throw falhou(r.error); };

  function sincronizar() {
    if (!Sess || !state) return;
    const tabs = ESCREVE[Sess.perfil], nova = foto(tabs);
    tabs.forEach(t => {
      const ant = snap[t] || {}, at = nova[t], ins = [], upd = [], del = [];
      Object.keys(at).forEach(k => { if (!(k in ant)) ins.push(JSON.parse(at[k])); else if (ant[k] !== at[k]) upd.push(JSON.parse(at[k])); });
      Object.keys(ant).forEach(k => { if (!(k in at)) del.push(JSON.parse(ant[k])); });
      snap[t] = at;
      if (!ins.length && !upd.length && !del.length) return;
      enfileira(async () => {
        for (const l of lotes(ins, 500)) ok(await sb.from(t).insert(l));
        for (const l of lotes(upd, 500)) ok(await sb.from(t).upsert(l, { onConflict: PK[t].join(',') }));
        if (del.length) {
          if (PK[t].length === 1) for (const l of lotes(del.map(r => r[PK[t][0]]), 200)) ok(await sb.from(t).delete().in(PK[t][0], l));
          else for (const r of del) { const m = {}; PK[t].forEach(k => { m[k] = r[k]; }); ok(await sb.from(t).delete().match(m)); }
        }
      });
    });
  }

  async function carregar() {
    const dir = Sess.perfil === 'diretor', vazio = Promise.resolve([]);
    const [escolas, dominios, competencias, necessidades, lanc, conf, sol, servidores, extrato, folhas, cst, org, log] = await Promise.all([
      todos('escolas', 'codigo'), todos('dominios', 'tipo'), todos('competencias', 'id'), todos('necessidades', 'id'),
      todos('lancamentos', ['comp', 'servidor_id']), todos('conferencias', ['comp', 'unidade']), todos('solicitacoes', 'id', true),
      dir ? sb.rpc('servidores_escola').then(r => { ok(r); return r.data; }) : todos('servidores', 'id'),
      dir ? vazio : todos('extrato', 'id'), dir ? vazio : todos('folhas', 'comp'), dir ? vazio : todos('cand_status', 'cand_id'),
      dir ? vazio : todos('organograma', 'bloco'), dir ? vazio : todos('log', 'id', true, 1000)
    ]);
    const s = { v: 1, origem: 'vrs14_22MAR26', escolas: escolas.map(limpa), servidores: servidores.map(limpa), necessidades: necessidades.map(limpa), dominios: {}, extratos: {}, competencias: competencias.map(limpa), lancamentos: {}, conferencias: {}, folhas: {}, solicitacoes: sol.map(limpa), candStatus: {}, organograma: {}, log: log.map(limpa) };
    dominios.forEach(d => { s.dominios[d.tipo] = d.valores || []; });
    extrato.forEach(x => { (s.extratos[x.comp] = s.extratos[x.comp] || []).push({ matricula: x.matricula || '', nome: x.nome || '', cpf: x.cpf || '', cargo: x.cargo || '' }); });
    lanc.forEach(l => { (s.lancamentos[l.comp] = s.lancamentos[l.comp] || {})[l.servidor_id] = { faltas: l.faltas || '', compl: l.compl || '', he: l.he || '', ferias: l.ferias || '', info: l.info || '' }; });
    conf.forEach(c => { (s.conferencias[c.comp] = s.conferencias[c.comp] || {})[c.unidade] = { status: c.status, por: c.por || '', em: c.em || '' }; });
    folhas.forEach(f => { s.folhas[f.comp] = { linhas: f.linhas || [], fechada_em: f.fechada_em || '', por: f.por || '' }; });
    cst.forEach(c => { s.candStatus[c.cand_id] = { status: c.status, nec: c.nec, escola: c.escola || '', em: c.em || '' }; });
    org.forEach(o => { s.organograma[o.bloco] = o.codigo || ''; });
    s.solicitacoes.forEach(x => { x.antes = x.antes || {}; });
    state = s; cacheExt = {}; snap = foto(Object.keys(COLS)); carregadoEm = Date.now();
    if (dir) Sess.escola = (s.escolas.find(e => e.codigo === Sess.escola_codigo) || {}).nome || '';
  }

  async function fn(corpo) {
    const { data, error } = await sb.functions.invoke('usuarios', { body: corpo });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }

  window.addEventListener('beforeunload', e => { if (pend) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('focus', async () => {
    if (!Sess || !state || pend || recarregando || Date.now() - carregadoEm < 120000 || !$('#modal').classList.contains('hidden')) return;
    recarregando = true; try { await carregar(); App.redesenhar(); } catch (e) { /* tenta de novo no próximo foco */ } recarregando = false;
  });

  return {
    todos, carregar, sincronizar, fn,
    pendente: () => pend,
    log(l) { enfileira(async () => ok(await sb.from('log').insert(l))); },
    extrato(comp, lista) {
      enfileira(async () => {
        ok(await sb.from('extrato').delete().eq('comp', comp));
        for (const l of lotes(lista.map(x => Object.assign({ comp }, x)), 500)) ok(await sb.from('extrato').insert(l));
      });
    },
    async iniciado() { const r = await sb.rpc('sistema_iniciado'); ok(r); return !!r.data; },
    async usuario() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      const r = await sb.from('usuarios').select('*').eq('id', session.user.id).maybeSingle(); ok(r);
      return r.data || { semPerfil: true };
    },
    async entrar(email, senha) { const r = await sb.auth.signInWithPassword({ email, password: senha }); if (r.error) throw new Error(/Invalid login/i.test(r.error.message) ? 'E-mail ou senha incorretos.' : r.error.message); },
    async sair() { await sb.auth.signOut(); },
    async trocarSenha(senha) { const r = await sb.auth.updateUser({ password: senha }); ok(r); },
    async usuarios() { const r = await sb.from('usuarios').select('*').order('nome'); ok(r); return r.data; }
  };
})();
