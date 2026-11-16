'use strict';
/* Núcleo: estado, armazenamento, regras de negócio e utilitários. */
const KEY = 'seme_folha_v1';
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const SEGMENTOS = ['Ens. Fundamental I', 'Pré-Escola', 'Creche', 'Edu. Especial', 'ETI Fundamental I', 'ETI Pré-Escola', 'Bolsistas', 'EJA', 'Agente Político', 'Comissionados', 'Multis', 'ADM'];
const BLOCOS = [];
SEGMENTOS.slice(0, 4).forEach(s => {
  BLOCOS.push({ id: s + '|CE', seg: s, vinc: 'CE', titulo: s + ' — CE' });
  BLOCOS.push({ id: s + '|CT', seg: s, vinc: 'CT', titulo: s + ' — CT' });
});
SEGMENTOS.slice(4).forEach(s => BLOCOS.push({ id: s, seg: s, vinc: null, titulo: s }));
const EXT = { codigo: 'EXT', nome: 'Sem escola / Externos' };
const SIT_LOTADAS = ['Ativo', 'Desvio de função'];

/* ---------- utilitários ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const isIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const fData = v => isIso(v) ? v.slice(8) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : (v || '');
const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const agora = () => new Date().toISOString();
const fDataHora = v => { if (!v) return ''; const d = new Date(v); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const compRotulo = c => c ? MESES[+c.slice(5, 7) - 1] + '/' + c.slice(0, 4) : '';
const normMat = v => String(v == null ? '' : v).trim().toUpperCase();
const cpfDig = v => { if (String(v).includes('*')) return ''; const d = String(v == null ? '' : v).replace(/\D/g, ''); return d ? d.padStart(11, '0') : ''; };
const fCpf = v => { const d = cpfDig(v); return d.length === 11 ? d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9) : (v || ''); };
const cpfMasc = v => { if (String(v).includes('*')) return v; const d = cpfDig(v); return d.length === 11 ? '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**' : (v ? '***' : ''); };
const unpack = t => t.rows.map(r => Object.fromEntries(t.cols.map((c, i) => [c, r[i]])));
const ordNome = (a, b) => String(a).localeCompare(String(b), 'pt-BR');

/* ---------- estado ---------- */
let state = null;
let Sess = null;                 // {perfil, escola, nome}
const UI = {};                   // filtros e paginação por tela
let cacheExt = {};

// Identificador novo, único mesmo com várias pessoas usando ao mesmo tempo
const novoId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
// Os dados ficam no banco (Supabase). "state" é a cópia em memória; salvar() envia só o que mudou (ver nuvem.js).
const DB = {
  salvar() { Nuvem.sincronizar(); return true; },
  log(acao, entidade, ref, detalhe) {
    const l = { usuario: Sess.nome + ' (' + PERFIS[Sess.perfil].nome + ')', acao, entidade, ref: ref == null ? '' : String(ref), detalhe: detalhe || '' };
    state.log.unshift(Object.assign({ em: agora() }, l));
    Nuvem.log(l);
  }
};
const PERFIS = {
  admin: { nome: 'Administrador SEME', desc: 'Gerencia tudo: lotação, aprovações, conferências e folha.' },
  diretor: { nome: 'Diretor(a) de escola', desc: 'Vê a própria escola, solicita alterações e faz a conferência mensal.' },
  gestor: { nome: 'Gestão / Secretário(a)', desc: 'Somente leitura: painéis, folha e relatórios.' }
};
const ehAdmin = () => Sess && Sess.perfil === 'admin';
const ehDiretor = () => Sess && Sess.perfil === 'diretor';

/* ---------- regras de negócio ---------- */
const escolaPorNome = n => state.escolas.find(e => e.nome === n);
const unidadeCod = s => { const e = escolaPorNome(s.escola); return e ? e.codigo : 'EXT'; };
const unidades = () => state.escolas.concat([EXT]);
const servidoresVisiveis = () => ehDiretor() ? state.servidores.filter(s => s.escola === Sess.escola) : state.servidores;

// Qtd. lotada: mesma regra do SUMPRODUCT da planilha (escola + função + Ativo/Desvio + turno e série quando informados)
function qtdLotada(n) {
  let c = 0;
  for (const s of state.servidores) {
    if (s.escola === n.escola && s.funcao === n.funcao && SIT_LOTADAS.includes(s.situacao) &&
      (!n.turno || s.turno === n.turno) && (!n.serie || s.serie === n.serie)) c++;
  }
  return c;
}
function necInfo(n) {
  const lot = qtdLotada(n), saldo = lot - n.qtd;
  let status = '—', cls = '';
  if (n.qtd > 0) {
    if (lot > n.qtd) { status = 'Excedente'; cls = 'info'; }
    else if (lot === n.qtd) { status = 'Suprida'; cls = 'ok'; }
    else if (lot === 0) { status = 'Não Atendida'; cls = 'err'; }
    else { status = 'Parcial'; cls = 'warn'; }
  } else if (lot > 0) { status = 'Sem demanda'; cls = ''; }
  return { lotada: lot, saldo, pct: n.qtd > 0 ? Math.min(1, lot / n.qtd) : null, status, cls };
}

// Extrato oficial: fonte de verdade de quem é pago pela SEME
function extratoComp(comp) {
  if (state.extratos[comp]) return comp;
  const ks = Object.keys(state.extratos).sort();
  const ant = ks.filter(k => k <= comp);
  return ant.length ? ant[ant.length - 1] : (ks[ks.length - 1] || null);
}
function extIdx(comp) {
  const k = extratoComp(comp);
  if (!k) return { mat: new Map(), cpf: new Map(), comp: null };
  if (!cacheExt[k]) {
    const mat = new Map(), cpf = new Map();
    state.extratos[k].forEach(x => { const m = normMat(x.matricula), c = cpfDig(x.cpf); if (m) mat.set(m, x); if (c) cpf.set(c, x); });
    cacheExt[k] = { mat, cpf, comp: k };
  }
  return cacheExt[k];
}
function constaExtrato(s, comp) {
  if (s._ext !== undefined) return !!s._ext;   // diretor: situação no extrato calculada pelo banco
  const ix = extIdx(comp), m = normMat(s.matricula), c = cpfDig(s.cpf);
  return !!((m && ix.mat.has(m)) || (c && ix.cpf.has(c)));
}
const elegivelFolha = (s, comp) => s.tipo_lotacao !== 'Permutado DE' && constaExtrato(s, comp);
function statusConc(s, comp) {
  if (s.tipo_lotacao === 'Permutado DE') return { t: 'Fora da folha (Permutado DE)', cls: 'info' };
  const ix = extIdx(comp), m = normMat(s.matricula), c = cpfDig(s.cpf);
  if (s._ext !== undefined) {
    if (s._ext && normMat(s._ext) === m) return { t: 'Na folha', cls: 'ok' };
    if (s._ext) return { t: 'Na folha (matrícula divergente)', cls: 'warn', extMat: s._ext };
    return m ? { t: 'Lotado fora do extrato', cls: 'err' } : { t: 'Sem matrícula', cls: 'warn' };
  }
  if (m && ix.mat.has(m)) return { t: 'Na folha', cls: 'ok' };
  if (c && ix.cpf.has(c)) return { t: 'Na folha (matrícula divergente)', cls: 'warn', extMat: ix.cpf.get(c).matricula };
  if (!m) return { t: 'Sem matrícula', cls: 'warn' };
  return { t: 'Lotado fora do extrato', cls: 'err' };
}
function extratoSemLotacao(comp) {
  const k = extratoComp(comp); if (!k) return [];
  const mats = new Set(), cpfs = new Set();
  state.servidores.forEach(s => { const m = normMat(s.matricula), c = cpfDig(s.cpf); if (m) mats.add(m); if (c) cpfs.add(c); });
  return state.extratos[k].filter(x => !(mats.has(normMat(x.matricula)) || (cpfDig(x.cpf) && cpfs.has(cpfDig(x.cpf)))));
}

// Segmento da folha: definido manualmente na ficha ou derivado (regra provisória — validar o de-para com a SEME)
function segDerivado(s) {
  const f = s.funcao || s.cargo || '', serie = s.serie || '', e = escolaPorNome(s.escola);
  if (/^Secretário/.test(f)) return 'Agente Político';
  if (s.vinculo === 'C. Direto' || /^Chefe de|Cargo Comissionado/.test(f)) return 'Comissionados';
  if (!e || /Sede/.test(e.nome)) return 'ADM';
  if (/Creche/.test(serie)) return 'Creche';
  if (/Pré-Escola/.test(serie)) return 'Pré-Escola';
  if (/EJA/.test(serie) || /EJA/.test(f)) return 'EJA';
  if (/Multisseriado/.test(serie)) return 'Multis';
  if (/AEE|Sala de Recursos/.test(serie) || /Mediador|AEE/.test(f)) return 'Edu. Especial';
  if (/Creche|Desenvolvimento Infantil/.test(f)) return 'Creche';
  if (/Pré-Escola/.test(f)) return 'Pré-Escola';
  if (/Fundamental/.test(f) || /Ano$/.test(serie)) return 'Ens. Fundamental I';
  const nv = e.niveis || '';
  if (/Creche/.test(nv) && !/Pré|Fundamental/.test(nv)) return 'Creche';
  if (/Pré-Escola/.test(nv) && !/Fundamental/.test(nv)) return 'Pré-Escola';
  return 'Ens. Fundamental I';
}
const segmento = s => s.segmento_folha || segDerivado(s);
function blocoId(s) {
  const seg = segmento(s);
  if (SEGMENTOS.indexOf(seg) < 4) return seg + '|' + (s.vinculo === 'C. Efetivo' ? 'CE' : 'CT');
  return seg;
}

// Alerta de contrato (apenas temporários): ≤30 dias urgente, ≤90 atenção
function alertaContrato(s) {
  if (s.vinculo !== 'C. Temporário' || ['Rescindido'].includes(s.situacao)) return null;
  if (!isIso(s.vencimento)) return { t: 'Sem vencimento informado', cls: '', dias: null };
  const dias = Math.round((new Date(s.vencimento) - new Date(hoje())) / 864e5);
  if (dias < 0) return { t: 'Vencido há ' + (-dias) + ' dia(s)', cls: 'err', dias };
  if (dias <= 30) return { t: 'Urgente — ' + dias + ' dia(s)', cls: 'err', dias };
  if (dias <= 90) return { t: 'Atenção — ' + dias + ' dia(s)', cls: 'warn', dias };
  return { t: 'OK — ' + dias + ' dia(s)', cls: 'ok', dias };
}

/* ---------- competências, conferência e folha ---------- */
const compAtual = () => { const a = state.competencias.slice().sort((x, y) => y.id.localeCompare(x.id)); return (a.find(c => c.status !== 'fechada') || a[0] || {}).id || null; };
const compObj = id => state.competencias.find(c => c.id === id);
const lanc = (comp, sid) => (state.lancamentos[comp] || {})[sid] || {};
const confDe = (comp, cod) => (state.conferencias[comp] || {})[cod] || null;
const confConcluida = (comp, cod) => { const c = confDe(comp, cod); return !!(c && c.status === 'concluida'); };
const servDaUnidade = cod => state.servidores.filter(s => unidadeCod(s) === cod);

function linhaFolha(s, comp) {
  const l = lanc(comp, s.id);
  return {
    bloco: blocoId(s), unidade: unidadeCod(s), mat: s.matricula || '', nome: s.nome, contrato: s.vinculo || '', admissao: fData(s.admissao),
    segmento: [s.serie, s.nivel].filter(Boolean).join(' · '), lotacao: s.escola || s.outros_orgaos || s.local_lotacao || '',
    cargo: s.cargo || '', funcao: s.funcao || '', ch: s.carga || '',
    faltas: l.faltas || '', compl: l.compl || '', he: l.he || '', ferias: l.ferias || '', info: l.info || s.obs || ''
  };
}
// Folha consolidada: só elegíveis (no extrato e não "Permutado DE") de unidades com conferência concluída
function folhaLinhas(comp, previa) {
  if (state.folhas[comp]) return state.folhas[comp].linhas;
  return state.servidores
    .filter(s => elegivelFolha(s, comp) && (previa || confConcluida(comp, unidadeCod(s))))
    .map(s => linhaFolha(s, comp))
    .sort((a, b) => ordNome(a.lotacao, b.lotacao) || ordNome(a.nome, b.nome));
}

/* ---------- interface: toast, modal, impressão, CSV ---------- */
let toastT = null;
function toast(msg, erro) {
  const t = $('#toast'); t.textContent = msg; t.className = erro ? 'err' : '';
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), erro ? 6000 : 2800);
}
function modal(titulo, corpo, rodape, peq) {
  $('#modal').innerHTML = '<div class="mbox' + (peq ? ' peq' : '') + '"><div class="mhead"><h2>' + esc(titulo) + '</h2><button onclick="fecharModal()" title="Fechar">×</button></div><div class="mbody">' + corpo + '</div>' + (rodape ? '<div class="mfoot">' + rodape + '</div>' : '') + '</div>';
  $('#modal').classList.remove('hidden');
}
function fecharModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function imprimir(html) { $('#print').innerHTML = html; setTimeout(() => window.print(), 50); }
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csv(nome, cab, linhas) {
  const q = v => { v = String(v == null ? '' : v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  baixar(nome + '.csv', '﻿' + [cab].concat(linhas).map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
function lerCsv(txt) {
  txt = txt.replace(/^﻿/, '');
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out.filter(r => r.some(c => c.trim() !== ''));
}
const tag = (t, cls) => '<span class="tag ' + (cls || '') + '">' + esc(t) + '</span>';
const opts = (lista, atual, vazio) => {
  const l = lista.slice(); if (atual && !l.includes(atual)) l.push(atual);
  return (vazio === false ? '' : '<option value="">' + esc(vazio || '') + '</option>') + l.map(v => '<option' + (v === atual ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
};
function tabela(cab, linhas, vazio) {
  if (!linhas.length) return '<div class="tw"><div class="vazio">' + esc(vazio || 'Nenhum registro encontrado.') + '</div></div>';
  return '<div class="tw"><table class="t"><thead><tr>' + cab.map(c => '<th' + (c.n ? ' class="n"' : '') + '>' + esc(c.t || c) + '</th>').join('') + '</tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>';
}
function paginar(lista, tela, por) {
  por = por || 50; const u = UI[tela]; const tot = Math.max(1, Math.ceil(lista.length / por));
  if (!u.pg || u.pg > tot) u.pg = 1;
  const ini = (u.pg - 1) * por;
  return {
    itens: lista.slice(ini, ini + por),
    html: '<div class="pag"><span>' + lista.length + ' registro(s)</span><span>' +
      '<button class="btn sm" ' + (u.pg <= 1 ? 'disabled' : '') + ' onclick="App.pg(\'' + tela + '\',-1)">‹ Anterior</button> Página ' + u.pg + ' de ' + tot +
      ' <button class="btn sm" ' + (u.pg >= tot ? 'disabled' : '') + ' onclick="App.pg(\'' + tela + '\',1)">Próxima ›</button></span></div>'
  };
}
