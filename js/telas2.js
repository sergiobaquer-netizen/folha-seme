'use strict';
/* Telas: conferência mensal, folha, conciliação, reposição, escolas, alertas, relatórios e administração. */

/* ---------- impressão no layout da folha ---------- */
const ORG = 'PREFEITURA MUNICIPAL DE PORTO ACRE — SECRETARIA MUNICIPAL DE EDUCAÇÃO';
function paginaFolha(titulo, esq, dir, linhas, comFerias, colExtra) {
  const cab = ['MAT.', 'SERVIDOR(A)', 'CONTRATO', 'ADMISSÃO', 'SEGMENTO', 'LOTAÇÃO', 'CARGO DE CONTRATO', 'FUNÇÃO', 'C.H.', 'FALTAS', 'COMPLEMENTAÇÕES SALARIAIS', 'HORAS EXTRAS'].concat(comFerias ? ['FÉRIAS'] : [], ['INFORMAÇÕES COMPLEMENTARES'], colExtra ? [colExtra] : []);
  const corpo = linhas.map(l => {
    const info = comFerias || !l.ferias ? l.info : [l.info, 'Férias: ' + l.ferias].filter(Boolean).join(' | ');
    return '<tr>' + [l.mat, l.nome, l.contrato, l.admissao, l.segmento, l.lotacao, l.cargo, l.funcao, l.ch, l.faltas, l.compl, l.he].concat(comFerias ? [l.ferias] : [], [info], colExtra ? [l.extra] : []).map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>';
  }).join('');
  return '<div class="pg"><div class="cab"><div class="o">' + ORG + '</div><div class="tit">' + esc(titulo) + '</div><div class="sub"><span>' + esc(esq) + '</span><span>' + esc(dir) + '</span></div></div>' +
    '<table><thead><tr>' + cab.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + corpo + '</tbody></table>' +
    '<div class="rod"><span>Total de servidores: ' + linhas.length + '</span><span>Emitido em ' + new Date().toLocaleDateString('pt-BR') + ' por ' + esc(Sess.nome) + '</span></div>' +
    '<div class="ass"><div>Responsável pela conferência</div><div>Secretário(a) Municipal de Educação</div></div></div>';
}
function paginaRelatorio(titulo, cab, linhas) {
  return '<div class="pg"><div class="cab"><div class="o">' + ORG + '</div><div class="tit">' + esc(titulo) + '</div></div><table><thead><tr>' + cab.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
    linhas.map(r => '<tr>' + r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table><div class="rod"><span>' + linhas.length + ' registro(s)</span><span>Emitido em ' + new Date().toLocaleDateString('pt-BR') + '</span></div></div>';
}
const cargoChave = c => {
  c = norm(c);
  const m = [['mediador', 'mediador'], ['aee', 'aee'], ['assistente de creche', 'ass-creche'], ['creche', 'prof-creche'], ['pre', 'prof-pre'], ['eja', 'eja'], ['fund', 'prof-fund'], ['assistente educacional', 'ass-edu'], ['desenvolvimento infantil', 'adi'], ['servicos gerais', 'asg'], ['vigia', 'vigia'], ['tecnico administrativo', 'tec-adm'], ['monitor', 'monitor'], ['motorista', 'motorista'], ['merend', 'merenda'], ['psicolog', 'psico'], ['assistente social', 'as-social'], ['nutricion', 'nutri'], ['portaria', 'portaria']];
  for (const p of m) if (c.includes(p[0])) return p[1];
  return c;
};
const candidatos = () => App._cand || [];
const candSt = id => (state.candStatus[id] || {}).status || 'disponível';

Object.assign(App, {
  /* ---------- conferência ---------- */
  lanc(sid, campo, v) {
    const c = UI.conf.comp; state.lancamentos[c] = state.lancamentos[c] || {};
    const l = state.lancamentos[c][sid] = state.lancamentos[c][sid] || {};
    l[campo] = campo === 'faltas' ? (parseInt(v, 10) > 0 ? parseInt(v, 10) : '') : v.trim();
    DB.salvar();
  },
  confConcluir() {
    const u = UI.conf, un = unidades().find(x => x.codigo === u.unidade);
    if (!confirm('Concluir a conferência de ' + un.nome + ' em ' + compRotulo(u.comp) + '?\n\nApós concluir, os lançamentos ficam bloqueados e a unidade entra na folha consolidada.')) return;
    state.conferencias[u.comp] = state.conferencias[u.comp] || {};
    state.conferencias[u.comp][u.unidade] = { status: 'concluida', por: Sess.nome, em: agora() };
    DB.log('Conferência concluída', 'conferencia', u.comp + '/' + u.unidade, un.nome + ' — ' + compRotulo(u.comp)); DB.salvar(); toast('Conferência concluída.'); App.redesenhar();
  },
  confReabrir(comp, cod) {
    if (!confirm('Reabrir a conferência desta unidade?')) return;
    delete state.conferencias[comp][cod]; DB.log('Conferência reaberta', 'conferencia', comp + '/' + cod, ''); DB.salvar(); App.redesenhar();
  },
  confImprimir() {
    const u = UI.conf, un = unidades().find(x => x.codigo === u.unidade);
    const linhas = servDaUnidade(u.unidade).sort((a, b) => ordNome(a.nome, b.nome)).map(s => Object.assign(linhaFolha(s, u.comp), { extra: elegivelFolha(s, u.comp) ? 'Sim' : 'Não' }));
    imprimir(paginaFolha('CONFERÊNCIA MENSAL DA FOLHA — ' + compRotulo(u.comp), 'UNIDADE: ' + un.nome.toUpperCase(), confConcluida(u.comp, u.unidade) ? 'CONFERÊNCIA CONCLUÍDA' : 'RASCUNHO — CONFERÊNCIA EM ABERTO', linhas, true, 'NA FOLHA SEME'));
  },
  confAbrir(comp, cod) { UI.conf = { comp, unidade: cod }; App.ir('conferencia'); },

  /* ---------- folha / competências ---------- */
  compAbrir() {
    const v = $('#nova-comp').value; if (!/^\d{4}-\d{2}$/.test(v)) return toast('Escolha o mês da competência.', true);
    if (compObj(v)) return toast('Esta competência já existe.', true);
    state.competencias.push({ id: v, status: 'aberta', aberta_em: agora() }); UI.folha.comp = v;
    DB.log('Competência aberta', 'competencia', v, compRotulo(v)); DB.salvar(); App.redesenhar();
  },
  compFechar() {
    const c = UI.folha.comp, pend = unidades().filter(u => servDaUnidade(u.codigo).length && !confConcluida(c, u.codigo));
    if (!confirm('Fechar a competência ' + compRotulo(c) + '?\n\n' + (pend.length ? 'ATENÇÃO: ' + pend.length + ' unidade(s) sem conferência concluída ficarão FORA da folha: ' + pend.map(u => u.nome).join(', ') + '.\n\n' : '') + 'A folha será congelada como está agora; mudanças posteriores na lotação não a alteram.')) return;
    const linhas = folhaLinhas(c, false);
    state.folhas[c] = { linhas, fechada_em: agora(), por: Sess.nome }; compObj(c).status = 'fechada';
    DB.log('Competência fechada', 'competencia', c, linhas.length + ' servidor(es) na folha'); DB.salvar(); toast('Competência fechada e folha congelada.'); App.redesenhar();
  },
  compReabrir() {
    const c = UI.folha.comp; if (!confirm('Reabrir ' + compRotulo(c) + '? A folha congelada será descartada e recalculada a partir da lotação atual.')) return;
    delete state.folhas[c]; compObj(c).status = 'aberta'; DB.log('Competência reaberta', 'competencia', c, ''); DB.salvar(); App.redesenhar();
  },
  folhaPdf() {
    const c = UI.folha.comp, l = folhaLinhas(c, UI.folha.previa);
    if (!l.length) return toast('Não há servidores na folha: conclua a conferência de ao menos uma unidade ou marque a opção de prévia.', true);
    const tit = 'FOLHA DE PAGAMENTO DO MÊS DE ' + compRotulo(c) + (state.folhas[c] ? '' : UI.folha.previa ? ' — PRÉVIA' : '');
    imprimir(BLOCOS.map(b => { const ls = l.filter(x => x.bloco === b.id); return ls.length ? paginaFolha(tit, 'CATEGORIA/SEGMENTO: ' + b.titulo.toUpperCase(), 'ORGANOGRAMA: ' + (state.organograma[b.id] || '____________'), ls, b.seg === 'Bolsistas') : ''; }).join(''));
  },
  folhaCsv() {
    const c = UI.folha.comp, tit = Object.fromEntries(BLOCOS.map(b => [b.id, b.titulo]));
    csv('folha_' + c, ['Bloco', 'Organograma', 'Mat.', 'Servidor(a)', 'Contrato', 'Admissão', 'Segmento', 'Lotação', 'Cargo de contrato', 'Função', 'Carga horária', 'Faltas', 'Complementações salariais', 'Horas extras', 'Férias', 'Informações complementares'],
      folhaLinhas(c, UI.folha.previa).sort((a, b) => BLOCOS.findIndex(x => x.id === a.bloco) - BLOCOS.findIndex(x => x.id === b.bloco)).map(l => [tit[l.bloco], state.organograma[l.bloco] || '', l.mat, l.nome, l.contrato, l.admissao, l.segmento, l.lotacao, l.cargo, l.funcao, l.ch, l.faltas, l.compl, l.he, l.ferias, l.info]));
  },

  /* ---------- conciliação / extrato ---------- */
  extratoImportar(inp) {
    const comp = $('#ext-comp').value, f = inp.files[0]; inp.value = '';
    if (!/^\d{4}-\d{2}$/.test(comp)) return toast('Informe a competência do extrato antes de escolher o arquivo.', true);
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let rows = lerCsv(r.result), ci = { m: 0, n: 1, c: 2, g: 3 };
      const hi = rows.findIndex(x => x.some(c => /matr/i.test(c)));
      if (hi >= 0) { const h = rows[hi].map(norm); ci = { m: h.findIndex(c => c.includes('matr')), n: h.findIndex(c => c.includes('servidor') || c.includes('nome')), c: h.findIndex(c => c.includes('cpf')), g: h.findIndex(c => c.includes('cargo')) }; rows = rows.slice(hi + 1); }
      const lista = rows.map(x => ({ matricula: (x[ci.m] || '').trim(), nome: (x[ci.n] || '').trim(), cpf: cpfDig(x[ci.c]), cargo: ci.g >= 0 ? (x[ci.g] || '').trim() : '' })).filter(x => x.matricula && x.nome);
      if (!lista.length) return toast('Nenhuma linha válida encontrada. O CSV precisa das colunas Matrícula, Servidor/Nome, CPF e Cargo.', true);
      if (state.extratos[comp] && !confirm('Já existe extrato de ' + compRotulo(comp) + ' (' + state.extratos[comp].length + ' linhas). Substituir por ' + lista.length + ' linhas?')) return;
      state.extratos[comp] = lista; cacheExt = {}; Nuvem.extrato(comp, lista);
      DB.log('Importação de extrato', 'folha_extrato', comp, lista.length + ' matrícula(s) — arquivo ' + f.name); DB.salvar(); toast('Extrato de ' + compRotulo(comp) + ' importado: ' + lista.length + ' matrículas.'); App.redesenhar();
    };
    r.readAsText(f, 'utf-8');
  },
  concCsv() {
    const c = UI.conc.comp;
    if (UI.conc.aba === 'ext') csv('extrato_sem_lotacao_' + c, ['Matrícula', 'Servidor(a)', 'CPF', 'Cargo (extrato)'], extratoSemLotacao(c).map(x => [x.matricula, x.nome, fCpf(x.cpf), x.cargo]));
    else csv('conciliacao_' + c, ['Matrícula', 'Servidor(a)', 'Tipo de Lotação', 'Escola', 'Status da conciliação'], state.servidores.map(s => [s.matricula, s.nome, s.tipo_lotacao, s.escola, statusConc(s, c).t]));
  },
  criarDoExtrato(i) {
    const x = extratoSemLotacao(UI.conc.comp)[i]; if (!x) return;
    App.novoServidor({ matricula: x.matricula, nome: x.nome, cpf: fCpf(x.cpf), tipo_lotacao: 'Sem Lotação', obs: 'Incluído a partir do extrato — cargo no extrato: ' + x.cargo });
  },

  /* ---------- reposição ---------- */
  repSt(id, st) {
    const c = candidatos().find(x => x.id === id), n = state.necessidades.find(x => x.id === UI.rep.nec);
    if (st === 'disponível') delete state.candStatus[id];
    else state.candStatus[id] = { status: st, nec: n ? n.id : null, escola: n ? n.escola : '', em: agora() };
    DB.log('Reposição', 'candidato', id, c.nome + ' → ' + st + (n && st === 'convocado' ? ' para ' + n.escola + ' · ' + n.funcao : '')); DB.salvar(); PARTES.rep();
  },
  repLotar(id) {
    const c = candidatos().find(x => x.id === id), cs = state.candStatus[id] || {}, n = state.necessidades.find(x => x.id === (cs.nec || UI.rep.nec));
    if (!n) return toast('Selecione a vaga a ser preenchida.', true);
    App.novoServidor({ nome: c.nome.toUpperCase(), vinculo: 'C. Temporário', cargo: n.funcao, funcao: n.funcao, turno: n.turno, serie: n.serie, escola: n.escola, obs: 'Reposição — ' + c.origem + ', inscrição ' + c.inscricao + ', classificação ' + c.classificacao });
    UI.repPend = { cand: id, nec: n.id, origem: c.origem };
  },

  /* ---------- escolas ---------- */
  escForm(cod) {
    const e = cod ? state.escolas.find(x => x.codigo === cod) : { codigo: 'E' + String(state.escolas.length + 1).padStart(3, '0'), nome: '', polo: '', zona: '', niveis: '', endereco: '', diretor: '', contato: '', status: 'Ativa' };
    const T = (k, r, cl) => '<div class="fld ' + (cl || '') + '"><label>' + r + '</label><input data-f="' + k + '" value="' + esc(e[k]) + '"' + (k === 'codigo' && cod ? ' disabled' : '') + '></div>';
    const S = (k, r, lista) => '<div class="fld"><label>' + r + '</label><select data-f="' + k + '">' + opts(lista, e[k]) + '</select></div>';
    const n = cod ? state.servidores.filter(s => s.escola === e.nome).length : 0;
    modal(cod ? 'Editar escola' : 'Nova escola', '<div class="form">' + T('codigo', 'Código') + T('nome', 'Nome da escola', 'c2') + S('polo', 'Polo', [...new Set(state.escolas.map(x => x.polo))]) + S('zona', 'Zona', ['Zona Urbana', 'Zona Rural']) + S('status', 'Status', ['Ativa', 'Anexo', 'Inativa']) + T('niveis', 'Níveis atendidos', 'c3') + T('endereco', 'Endereço', 'c3') + T('diretor', 'Diretor(a)', 'c2') + T('contato', 'Contato') + '</div>',
      (cod && !n ? '<button class="btn r" onclick="App.escExcluir(\'' + cod + '\')">Excluir</button>' : '') + '<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn p" onclick="App.escSalvar(' + (cod ? '\'' + cod + '\'' : 'null') + ')">Salvar</button>');
  },
  escSalvar(cod) {
    const d = lerForm(); if (!d.nome || !d.codigo) return toast('Código e nome são obrigatórios.', true);
    if (state.escolas.some(x => x.codigo !== (cod || '') && (x.nome === d.nome || x.codigo === d.codigo))) return toast('Já existe escola com este nome ou código.', true);
    if (cod) {
      const e = state.escolas.find(x => x.codigo === cod), ant = e.nome;
      if (ant !== d.nome) { state.servidores.forEach(s => { if (s.escola === ant) s.escola = d.nome; }); state.necessidades.forEach(n => { if (n.escola === ant) n.escola = d.nome; }); state.solicitacoes.forEach(s => { if (s.escola === ant) s.escola = d.nome; }); }
      Object.assign(e, d, { codigo: cod }); DB.log('Alteração', 'escola', cod, d.nome + (ant !== d.nome ? ' (antes: ' + ant + ')' : ''));
    } else { state.escolas.push(d); DB.log('Inclusão', 'escola', d.codigo, d.nome); }
    DB.salvar(); fecharModal(); App.redesenhar();
  },
  escExcluir(cod) {
    const e = state.escolas.find(x => x.codigo === cod); if (!confirm('Excluir a escola ' + e.nome + ' e suas necessidades cadastradas?')) return;
    state.escolas = state.escolas.filter(x => x.codigo !== cod); state.necessidades = state.necessidades.filter(n => n.escola !== e.nome);
    DB.log('Exclusão', 'escola', cod, e.nome); DB.salvar(); fecharModal(); App.redesenhar();
  },

  /* ---------- relatórios ---------- */
  relCsv() { const r = RELS[UI.rel.tipo]; csv(UI.rel.tipo + '_' + hoje(), r.cab, r.linhas()); },
  relPdf() { const r = RELS[UI.rel.tipo]; imprimir(paginaRelatorio(r.t.toUpperCase() + (ehDiretor() ? ' — ' + Sess.escola.toUpperCase() : ''), r.cab, r.linhas())); },

  /* ---------- administração ---------- */
  domSalvar(k) {
    const l = [...new Set($('#dom-' + k).value.split('\n').map(x => x.trim()).filter(Boolean))];
    state.dominios[k] = l; DB.log('Alteração', 'dominio', k, l.length + ' valor(es)'); DB.salvar(); toast('Lista atualizada.');
  },
  orgSet(id, v) { state.organograma[id] = v.trim(); DB.salvar(); },
  backupExportar() { baixar('backup_folha_seme_' + hoje() + '.json', JSON.stringify(state), 'application/json'); DB.log('Backup exportado', 'sistema', '', ''); DB.salvar(); },
  logCsv() { csv('auditoria_' + hoje(), ['Data/hora', 'Usuário', 'Ação', 'Entidade', 'Registro', 'Detalhe'], state.log.map(l => [fDataHora(l.em), l.usuario, l.acao, l.entidade, l.ref, l.detalhe])); }
});

/* ---------- CONFERÊNCIA MENSAL ---------- */
TELAS.conferencia = () => {
  const comps = state.competencias.slice().sort((a, b) => b.id.localeCompare(a.id));
  UI.conf = UI.conf || { comp: compAtual(), unidade: '' };
  const u = UI.conf;
  if (ehDiretor()) u.unidade = escolaPorNome(Sess.escola).codigo;
  if (!u.unidade) u.unidade = state.escolas[0].codigo;
  if (!compObj(u.comp)) u.comp = compAtual();
  const c = compObj(u.comp), un = unidades().find(x => x.codigo === u.unidade), conf = confDe(u.comp, u.unidade);
  const fechada = c && c.status === 'fechada', concl = !!(conf && conf.status === 'concluida'), trav = fechada || concl;
  let html = '<div class="topo"><div><h1>Conferência mensal</h1><p>Revise os servidores da unidade e lance os dados variáveis do mês. Os lançamentos são gravados automaticamente.</p></div><div class="acoes">' +
    '<button class="btn" onclick="App.confImprimir()">Imprimir / PDF da unidade</button>' + (!trav && c ? '<button class="btn g" onclick="App.confConcluir()">Concluir conferência</button>' : '') + (concl && !fechada && ehAdmin() ? '<button class="btn" onclick="App.confReabrir(\'' + u.comp + '\',\'' + u.unidade + '\')">Reabrir</button>' : '') + '</div></div>' +
    '<div class="filtros"><select onchange="UI.conf.comp=this.value;App.redesenhar()">' + comps.map(x => '<option value="' + x.id + '"' + (x.id === u.comp ? ' selected' : '') + '>' + compRotulo(x.id) + (x.status === 'fechada' ? ' (fechada)' : '') + '</option>').join('') + '</select>' +
    (ehDiretor() ? '<b>' + esc(un.nome) + '</b>' : '<select onchange="UI.conf.unidade=this.value;App.redesenhar()">' + unidades().map(x => '<option value="' + x.codigo + '"' + (x.codigo === u.unidade ? ' selected' : '') + '>' + esc(x.nome) + (confConcluida(u.comp, x.codigo) ? ' ✔' : '') + '</option>').join('') + '</select>') +
    (fechada ? tag('Competência fechada', 'err') : concl ? tag('Conferência concluída por ' + conf.por + ' em ' + fDataHora(conf.em), 'ok') : tag('Em aberto', 'warn')) + '</div>';
  if (!c) { $('#main').innerHTML = html + '<div class="box warn">Nenhuma competência aberta. A SEME precisa abrir a competência do mês na tela Folha de pagamento.</div>'; return; }
  const lista = servDaUnidade(u.unidade).sort((a, b) => ordNome(a.nome, b.nome)), d = trav ? ' disabled' : '';
  const fora = lista.filter(s => !elegivelFolha(s, u.comp)).length;
  if (fora) html += '<div class="box info">' + fora + ' servidor(es) desta unidade não entram na folha da SEME (fora do extrato oficial ou Permutado DE). Eles aparecem abaixo para conferência da lotação.</div>';
  const inp = (s, k, l, cls) => '<input ' + (cls ? 'class="num" type="number" min="0" ' : '') + 'value="' + esc(l[k] == null ? '' : l[k]) + '"' + d + ' onchange="App.lanc(' + s.id + ',\'' + k + '\',this.value)">';
  html += tabela(['Mat.', 'Servidor(a)', 'Função', 'Turno', 'C.H.', 'Situação', 'Folha SEME', 'Faltas', 'Complementações salariais', 'Horas extras', 'Férias', 'Informações complementares'], lista.map(s => {
    const l = lanc(u.comp, s.id), st = statusConc(s, u.comp);
    return '<tr><td>' + esc(s.matricula) + '</td><td><b>' + esc(s.nome) + '</b></td><td>' + esc(s.funcao) + '</td><td>' + esc(s.turno) + '</td><td>' + esc(s.carga) + '</td><td>' + esc(s.situacao) + '</td><td>' + tag(st.t === 'Na folha' ? 'Sim' : st.t, st.cls) + '</td><td>' + inp(s, 'faltas', l, 1) + '</td><td>' + inp(s, 'compl', l) + '</td><td>' + inp(s, 'he', l) + '</td><td>' + inp(s, 'ferias', l) + '</td><td>' + inp(s, 'info', l) + '</td></tr>';
  }), 'Nenhum servidor lotado nesta unidade.');
  $('#main').innerHTML = html;
};

/* ---------- FOLHA DE PAGAMENTO ---------- */
TELAS.folha = () => {
  const comps = state.competencias.slice().sort((a, b) => b.id.localeCompare(a.id));
  UI.folha = UI.folha || { comp: compAtual(), previa: false };
  const u = UI.folha; if (!compObj(u.comp)) u.comp = compAtual();
  const c = compObj(u.comp), adm = ehAdmin();
  let html = '<div class="topo"><div><h1>Folha de pagamento</h1><p>Consolidação das unidades conferidas, no layout oficial em 16 blocos por segmento e vínculo. Entram apenas servidores presentes no extrato oficial.</p></div><div class="acoes">' +
    (adm ? '<input type="month" id="nova-comp" style="border:1px solid var(--borda);border-radius:7px;padding:6px 8px"><button class="btn" onclick="App.compAbrir()">Abrir competência</button>' : '') + '</div></div>';
  if (!c) { $('#main').innerHTML = html + '<div class="box warn">Nenhuma competência cadastrada.</div>'; return; }
  const fechada = c.status === 'fechada', us = unidades().map(x => ({ x, sv: servDaUnidade(x.codigo) })).filter(o => o.sv.length || o.x.codigo !== 'EXT');
  const comServ = us.filter(o => o.sv.length), feitas = comServ.filter(o => confConcluida(u.comp, o.x.codigo)).length;
  const linhas = folhaLinhas(u.comp, u.previa), eleg = state.servidores.filter(s => elegivelFolha(s, u.comp)).length;
  html += '<div class="filtros"><select onchange="UI.folha.comp=this.value;App.redesenhar()">' + comps.map(x => '<option value="' + x.id + '"' + (x.id === u.comp ? ' selected' : '') + '>' + compRotulo(x.id) + '</option>').join('') + '</select>' +
    (fechada ? tag('Fechada em ' + fDataHora(state.folhas[u.comp].fechada_em) + ' por ' + state.folhas[u.comp].por, 'err') : feitas === comServ.length ? tag('Todas as unidades conferidas', 'ok') : tag('Aberta — ' + feitas + ' de ' + comServ.length + ' unidades conferidas', 'warn')) +
    (fechada ? '' : '<label><input type="checkbox"' + (u.previa ? ' checked' : '') + ' onchange="UI.folha.previa=this.checked;App.redesenhar()"> Prévia: incluir unidades ainda não conferidas</label>') + '</div>' +
    '<div class="kpis"><div class="kpi ok"><b>' + linhas.length + '</b><span>Servidores na folha ' + (fechada ? '(congelada)' : u.previa ? '(prévia)' : '(unidades conferidas)') + '</span></div><div class="kpi"><b>' + eleg + '</b><span>Elegíveis hoje (no extrato)</span></div><div class="kpi"><b>' + state.servidores.filter(s => s.tipo_lotacao === 'Permutado DE').length + '</b><span>Permutado DE (fora da folha)</span></div><div class="kpi warn"><b>' + state.servidores.filter(s => statusConc(s, u.comp).cls === 'err' || statusConc(s, u.comp).t === 'Sem matrícula').length + '</b><span>Lotados fora do extrato</span></div></div>' +
    '<div class="acoes" style="margin-bottom:16px"><button class="btn p" onclick="App.folhaPdf()">Gerar PDF da folha</button><button class="btn" onclick="App.folhaCsv()">Exportar (Excel/CSV)</button>' +
    (adm ? (fechada ? '<button class="btn" onclick="App.compReabrir()">Reabrir competência</button>' : '<button class="btn g" onclick="App.compFechar()">Fechar competência</button>') : '') + '</div>' +
    '<div class="g2"><div class="card"><h2>Blocos da folha</h2>' + tabela(['Bloco (segmento + vínculo)', { t: 'Servidores', n: 1 }], BLOCOS.map(b => '<tr><td>' + esc(b.titulo) + (state.organograma[b.id] ? ' <span class="nota">· ' + esc(state.organograma[b.id]) + '</span>' : '') + '</td><td class="n">' + linhas.filter(l => l.bloco === b.id).length + '</td></tr>')) +
    '<p class="nota">O segmento de cada servidor é derivado da função, série e escola, e pode ser definido manualmente na ficha (campo "Segmento na folha"). Os códigos de organograma são cadastrados em Administração.</p></div>' +
    '<div class="card"><h2>Conferência por unidade</h2>' + tabela(['Unidade', { t: 'Servidores', n: 1 }, { t: 'Na folha', n: 1 }, 'Conferência', ''], us.map(o => {
      const cf = confDe(u.comp, o.x.codigo), ok = cf && cf.status === 'concluida';
      return '<tr><td><b>' + esc(o.x.nome) + '</b></td><td class="n">' + o.sv.length + '</td><td class="n">' + o.sv.filter(s => elegivelFolha(s, u.comp)).length + '</td><td>' + (!o.sv.length ? tag('Sem servidores') : ok ? tag('Concluída', 'ok') + ' <span class="nota">' + esc(cf.por) + '</span>' : tag('Pendente', 'warn')) + '</td><td>' + (adm && o.sv.length ? '<button class="btn sm" onclick="App.confAbrir(\'' + u.comp + '\',\'' + o.x.codigo + '\')">' + (ok || fechada ? 'Ver' : 'Conferir') + '</button>' : '') + '</td></tr>';
    })) + '</div></div>';
  $('#main').innerHTML = html;
};

/* ---------- CONCILIAÇÃO ---------- */
TELAS.conciliacao = () => {
  UI.conc = UI.conc || { comp: compAtual(), aba: 'lot', filtro: '', busca: '', pg: 1 };
  const u = UI.conc, k = extratoComp(u.comp), ext = k ? state.extratos[k] : [];
  const sts = state.servidores.map(s => statusConc(s, u.comp).t), n = t => sts.filter(x => x === t).length, sem = extratoSemLotacao(u.comp);
  $('#main').innerHTML = '<div class="topo"><div><h1>Conciliação lotação × extrato</h1><p>Extrato oficial em uso: <b>' + (k ? compRotulo(k) : 'nenhum') + '</b>. O cruzamento é feito por matrícula e, na falta dela, por CPF.</p></div><div class="acoes">' +
    (ehAdmin() ? '<input type="month" id="ext-comp" value="' + (u.comp || '') + '" style="border:1px solid var(--borda);border-radius:7px;padding:6px 8px"><label class="btn">Importar extrato (CSV)<input type="file" accept=".csv,.txt" style="display:none" onchange="App.extratoImportar(this)"></label>' : '') + '<button class="btn" onclick="App.concCsv()">Exportar (Excel/CSV)</button></div></div>' +
    '<div class="kpis"><div class="kpi"><b>' + state.servidores.length + '</b><span>Registros na lotação</span></div><div class="kpi"><b>' + ext.length + '</b><span>Matrículas no extrato</span></div><div class="kpi ok"><b>' + (ext.length - sem.length) + '</b><span>No extrato com lotação</span></div><div class="kpi warn"><b>' + sem.length + '</b><span>No extrato sem lotação</span></div><div class="kpi warn"><b>' + n('Na folha (matrícula divergente)') + '</b><span>Achados só pelo CPF (matrícula diferente)</span></div><div class="kpi"><b>' + n('Fora da folha (Permutado DE)') + '</b><span>Permutado DE</span></div><div class="kpi err"><b>' + n('Lotado fora do extrato') + '</b><span>Lotados fora do extrato</span></div><div class="kpi warn"><b>' + n('Sem matrícula') + '</b><span>Sem matrícula e fora do extrato</span></div></div>' +
    '<div class="abas"><a class="' + (u.aba === 'lot' ? 'at' : '') + '" onclick="UI.conc.aba=\'lot\';UI.conc.pg=1;App.redesenhar()">Lotação → extrato</a><a class="' + (u.aba === 'ext' ? 'at' : '') + '" onclick="UI.conc.aba=\'ext\';UI.conc.pg=1;App.redesenhar()">No extrato sem lotação (' + sem.length + ')</a></div>' +
    '<div class="filtros"><input type="search" placeholder="Buscar por nome ou matrícula…" value="' + esc(u.busca) + '" oninput="App.f(\'conc\',\'busca\',this.value)">' + (u.aba === 'lot' ? '<select onchange="App.f(\'conc\',\'filtro\',this.value)">' + opts(['Na folha', 'Na folha (matrícula divergente)', 'Fora da folha (Permutado DE)', 'Lotado fora do extrato', 'Sem matrícula'], u.filtro, 'Todos os status') + '</select>' : '') + '</div><div id="conc-tab"></div>';
  PARTES.conc();
};
PARTES.conc = () => {
  const u = UI.conc, b = norm(u.busca);
  if (u.aba === 'ext') {
    const todos = extratoSemLotacao(u.comp), l = todos.map((x, i) => ({ x, i })).filter(o => !b || norm(o.x.nome).includes(b) || normMat(o.x.matricula).includes(b.toUpperCase())), p = paginar(l, 'conc');
    $('#conc-tab').innerHTML = tabela(['Matrícula', 'Servidor(a)', 'CPF', 'Cargo no extrato', ''], p.itens.map(o => '<tr><td>' + esc(o.x.matricula) + '</td><td><b>' + esc(o.x.nome) + '</b></td><td>' + (ehAdmin() ? fCpf(o.x.cpf) : cpfMasc(o.x.cpf)) + '</td><td>' + esc(o.x.cargo) + '</td><td>' + (ehAdmin() ? '<button class="btn sm" onclick="App.criarDoExtrato(' + o.i + ')">Criar lotação</button>' : '') + '</td></tr>'), 'Todas as matrículas do extrato têm lotação.') + p.html;
    return;
  }
  const l = state.servidores.map(s => ({ s, st: statusConc(s, u.comp) })).filter(o => (!u.filtro || o.st.t === u.filtro) && (!b || norm(o.s.nome).includes(b) || normMat(o.s.matricula).includes(b.toUpperCase()))).sort((a, c) => ordNome(a.s.nome, c.s.nome)), p = paginar(l, 'conc');
  $('#conc-tab').innerHTML = tabela(['Matrícula', 'Servidor(a)', 'Tipo de lotação', 'Situação', 'Escola / Local', 'Status da conciliação'], p.itens.map(o => '<tr class="cl" onclick="App.ficha(' + o.s.id + ')"><td>' + esc(o.s.matricula) + '</td><td><b>' + esc(o.s.nome) + '</b></td><td>' + esc(o.s.tipo_lotacao) + '</td><td>' + esc(o.s.situacao) + '</td><td>' + esc(o.s.escola || o.s.outros_orgaos) + '</td><td>' + tag(o.st.t, o.st.cls) + '</td></tr>')) + p.html;
};

/* ---------- REPOSIÇÃO ---------- */
TELAS.reposicao = () => {
  UI.rep = UI.rep || { nec: null, busca: '', origem: '', st: '', todos: false, pg: 1 };
  if (!App._cand) {
    $('#main').innerHTML = '<div class="vazio">Carregando candidatos…</div>';
    Nuvem.todos('candidatos', 'id').then(r => { App._cand = r.map(c => { Object.keys(c).forEach(k => { if (c[k] === null) c[k] = ''; }); return c; }); if (UI.tela === 'reposicao') TELAS.reposicao(); }, e => toast('Não foi possível carregar os candidatos: ' + e.message, true));
    return;
  }
  const u = UI.rep, vagas = state.necessidades.map(n => ({ n, i: necInfo(n) })).filter(x => x.n.qtd > 0 && x.i.saldo < 0).sort((a, b) => ordNome(a.n.escola, b.n.escola) || ordNome(a.n.funcao, b.n.funcao));
  if (u.nec && !vagas.some(v => v.n.id === u.nec)) u.nec = null;
  $('#main').innerHTML = '<div class="topo"><div><h1>Reposição de vagas</h1><p>Vincule candidatos do PSS N001_2026 e dos Editais 006 e 007 às vagas em aberto. Fluxo: disponível → convocado → lotado (ou desistente).</p></div></div>' +
    '<div class="card"><h2>Vagas em aberto (' + vagas.reduce((a, v) => a - v.i.saldo, 0) + ')</h2><div style="max-height:300px;overflow:auto">' + tabela(['Escola', 'Função', 'Turno', 'Série/Etapa', { t: 'Necessária', n: 1 }, { t: 'Lotada', n: 1 }, { t: 'Vagas', n: 1 }, 'Convocados', ''], vagas.map(v => {
      const conv = Object.values(state.candStatus).filter(c => c.nec === v.n.id && c.status === 'convocado').length;
      return '<tr' + (u.nec === v.n.id ? ' style="background:var(--okbg)"' : '') + '><td><b>' + esc(v.n.escola) + '</b></td><td>' + esc(v.n.funcao) + '</td><td>' + esc(v.n.turno) + '</td><td>' + esc(v.n.serie) + '</td><td class="n">' + v.n.qtd + '</td><td class="n">' + v.i.lotada + '</td><td class="n"><b style="color:var(--err)">' + (-v.i.saldo) + '</b></td><td>' + (conv || '') + '</td><td><button class="btn sm' + (u.nec === v.n.id ? ' p' : '') + '" onclick="UI.rep.nec=' + v.n.id + ';UI.rep.pg=1;App.redesenhar()">Candidatos</button></td></tr>';
    }), 'Não há vagas em aberto: todas as necessidades cadastradas estão supridas.') + '</div></div>' +
    '<div class="card"><h2>Candidatos</h2><div class="filtros"><input type="search" placeholder="Buscar candidato…" value="' + esc(u.busca) + '" oninput="App.f(\'rep\',\'busca\',this.value)"><select onchange="App.f(\'rep\',\'origem\',this.value)">' + opts(['PSS N001_2026', 'Edital 006', 'Edital 007'], u.origem, 'Todas as origens') + '</select><select onchange="App.f(\'rep\',\'st\',this.value)">' + opts(['disponível', 'convocado', 'lotado', 'desistente'], u.st, 'Todos os status') + '</select>' +
    '<label><input type="checkbox"' + (u.todos ? ' checked' : '') + ' onchange="App.f(\'rep\',\'todos\',this.checked)"> Mostrar todos os cargos</label></div><div id="rep-tab"></div></div>';
  PARTES.rep();
};
PARTES.rep = () => {
  const u = UI.rep, n = state.necessidades.find(x => x.id === u.nec), chave = n ? cargoChave(n.funcao) : null, b = norm(u.busca);
  const l = candidatos().filter(c => (!u.origem || c.origem === u.origem) && (!b || norm(c.nome).includes(b)) && (!u.st || candSt(c.id) === u.st) && (u.todos || !chave || cargoChave(c.cargo) === chave))
    .sort((a, c) => ordNome(a.origem, c.origem) || (parseInt(a.classificacao, 10) || 9999) - (parseInt(c.classificacao, 10) || 9999));
  const p = paginar(l, 'rep');
  $('#rep-tab').innerHTML = (n ? '<div class="box ok">Vaga selecionada: <b>' + esc(n.escola + ' · ' + n.funcao + (n.turno ? ' · ' + n.turno : '') + (n.serie ? ' · ' + n.serie : '')) + '</b>' + (u.todos ? '' : ' — exibindo candidatos de cargo compatível.') + '</div>' : '<div class="box info">Selecione uma vaga acima para convocar candidatos de cargo compatível.</div>') +
    tabela(['Origem', 'Class.', 'Candidato', 'Cargo', 'Região / Lotação prevista', { t: 'Pontos', n: 1 }, 'Situação na origem', 'Status no sistema', ''], p.itens.map(c => {
      const st = candSt(c.id), cs = state.candStatus[c.id] || {};
      const ac = st === 'disponível' ? (n ? '<button class="btn sm p" onclick="App.repSt(' + c.id + ',\'convocado\')">Convocar</button>' : '') :
        st === 'convocado' ? '<button class="btn sm g" onclick="App.repLotar(' + c.id + ')">Lotar</button> <button class="btn sm" onclick="App.repSt(' + c.id + ',\'desistente\')">Desistente</button> <button class="btn sm" onclick="App.repSt(' + c.id + ',\'disponível\')">Desfazer</button>' :
          st === 'desistente' ? '<button class="btn sm" onclick="App.repSt(' + c.id + ',\'disponível\')">Desfazer</button>' : '';
      return '<tr><td>' + esc(c.origem) + '</td><td>' + esc(c.classificacao) + '</td><td><b>' + esc(c.nome) + '</b></td><td>' + esc(c.cargo) + '</td><td>' + esc([c.regiao, c.lotacao_prevista].filter(Boolean).join(' · ')) + '</td><td class="n">' + esc(c.pontos) + '</td><td>' + esc(c.situacao_origem) + (c.escola_lotacao ? ' · ' + esc(c.escola_lotacao) : '') + '</td><td>' + tag(st, st === 'lotado' ? 'ok' : st === 'convocado' ? 'warn' : st === 'desistente' ? 'err' : '') + (cs.escola ? ' <span class="nota">' + esc(cs.escola) + '</span>' : '') + '</td><td style="white-space:nowrap">' + ac + '</td></tr>';
    }), 'Nenhum candidato encontrado para este filtro.') + p.html;
};

/* ---------- ESCOLAS ---------- */
TELAS.escolas = () => {
  $('#main').innerHTML = '<div class="topo"><div><h1>Escolas da rede</h1><p>' + state.escolas.length + ' unidades cadastradas.</p></div>' + (ehAdmin() ? '<div class="acoes"><button class="btn p" onclick="App.escForm()">+ Nova escola</button></div>' : '') + '</div>' +
    tabela(['Código', 'Escola', 'Polo', 'Zona', 'Níveis atendidos', 'Diretor(a)', 'Contato', 'Status', { t: 'Servidores', n: 1 }], state.escolas.map(e =>
      '<tr' + (ehAdmin() ? ' class="cl" onclick="App.escForm(\'' + e.codigo + '\')"' : '') + '><td>' + esc(e.codigo) + '</td><td><b>' + esc(e.nome) + '</b></td><td>' + esc(e.polo) + '</td><td>' + esc(e.zona) + '</td><td>' + esc(e.niveis) + '</td><td>' + esc(e.diretor) + '</td><td>' + esc(e.contato) + '</td><td>' + tag(e.status, e.status === 'Ativa' ? 'ok' : '') + '</td><td class="n">' + state.servidores.filter(s => s.escola === e.nome).length + '</td></tr>'));
};

/* ---------- ALERTAS ---------- */
TELAS.alertas = () => {
  const comp = compAtual(), S = state.servidores;
  const sec = (titulo, nota, cab, itens, f) => '<div class="card"><h2>' + titulo + ' (' + itens.length + ')</h2>' + (nota ? '<p class="nota">' + nota + '</p>' : '') + (itens.length ? '<div style="max-height:340px;overflow:auto">' + tabela(cab, itens.map(s => '<tr class="cl" onclick="App.ficha(' + s.id + ')">' + f(s).map(v => '<td>' + v + '</td>').join('') + '</tr>')) + '</div>' : '<div class="nota">Nada a apontar.</div>') + '</div>';
  const venc = S.map(s => ({ s, a: alertaContrato(s) })).filter(o => o.a && (o.a.cls === 'err' || o.a.cls === 'warn')).sort((a, b) => a.a.dias - b.a.dias).map(o => Object.assign({ _a: o.a }, o.s));
  const semV = S.filter(s => { const a = alertaContrato(s); return a && a.dias === null; });
  const base = s => [esc(s.matricula), '<b>' + esc(s.nome) + '</b>', esc(s.funcao), esc(s.escola || s.outros_orgaos)];
  const prob = s => [!normMat(s.matricula) && 'sem matrícula', !cpfDig(s.cpf) && 'sem CPF', s.admissao && !isIso(s.admissao) && 'data de admissão inválida (' + s.admissao + ')', !s.funcao && 'sem função', !s.vinculo && 'sem vínculo', s.tipo_lotacao === 'Interna' && !escolaPorNome(s.escola) && 'lotação interna sem escola cadastrada'].filter(Boolean);
  $('#main').innerHTML = '<div class="topo"><div><h1>Alertas</h1><p>Situações que requerem atenção. Clique em uma linha para abrir a ficha.</p></div></div>' +
    sec('Contratos temporários vencidos ou a vencer', 'Urgente: até 30 dias · Atenção: até 90 dias.', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Vencimento', 'Alerta'], venc, s => base(s).concat([fData(s.vencimento), tag(s._a.t, s._a.cls)])) +
    sec('Temporários sem data de vencimento informada', 'Sem a data, o sistema não consegue alertar sobre o fim do contrato.', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Admissão'], semV, s => base(s).concat([esc(fData(s.admissao))])) +
    sec('Lotados fora do extrato oficial', 'Servidores com lotação que não constam no extrato de ' + compRotulo(extratoComp(comp)) + ' — não entram na folha.', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Situação', 'Status'], S.filter(s => ['Lotado fora do extrato', 'Sem matrícula'].includes(statusConc(s, comp).t)), s => base(s).concat([esc(s.situacao), tag(statusConc(s, comp).t, statusConc(s, comp).cls)])) +
    sec('No extrato com matrícula diferente da lotação', 'O CPF consta no extrato, mas sob outra matrícula. Confira e corrija a matrícula na ficha.', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Matrícula no extrato'], S.filter(s => statusConc(s, comp).extMat), s => base(s).concat(['<b>' + esc(statusConc(s, comp).extMat) + '</b>'])) +
    sec('Matrícula confere, mas o CPF difere do extrato', 'Possível erro de digitação do CPF ou matrícula trocada.', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Nome no extrato', 'CPF na lotação', 'CPF no extrato'], S.filter(s => { const x = extIdx(comp).mat.get(normMat(s.matricula)); return x && cpfDig(s.cpf) && cpfDig(x.cpf) !== cpfDig(s.cpf); }), s => { const x = extIdx(comp).mat.get(normMat(s.matricula)); return base(s).concat([esc(x.nome), fCpf(s.cpf), fCpf(x.cpf)]); }) +
    sec('Servidores em situação especial', 'Situação diferente de "Ativo".', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Situação', 'Observações'], S.filter(s => s.situacao !== 'Ativo'), s => base(s).concat([tag(s.situacao || '—', 'warn'), esc(s.obs)])) +
    sec('Inconsistências cadastrais', 'Dados incompletos ou inválidos herdados da planilha.', ['Mat.', 'Servidor(a)', 'Função', 'Escola', 'Problema'], S.filter(s => prob(s).length), s => base(s).concat([esc(prob(s).join('; '))]));
};

/* ---------- RELATÓRIOS ---------- */
const RELS = {
  quadro: { t: 'Quadro de servidores por escola', cab: ['Escola', 'Matrícula', 'Servidor(a)', 'Vínculo', 'Situação', 'Função', 'Turno', 'Série/Etapa', 'C.H.'], linhas: () => servidoresVisiveis().slice().sort((a, b) => ordNome(a.escola || 'zzz', b.escola || 'zzz') || ordNome(a.nome, b.nome)).map(s => [s.escola || '(sem escola)', s.matricula, s.nome, s.vinculo, s.situacao, s.funcao, s.turno, s.serie, s.carga]) },
  deficit: { t: 'Déficits por escola e função', cab: ['Escola', 'Polo', 'Função', 'Turno', 'Série/Etapa', 'Necessária', 'Lotada', 'Saldo', 'Status', 'Prioridade'], linhas: () => state.necessidades.filter(n => !ehDiretor() || n.escola === Sess.escola).map(n => ({ n, i: necInfo(n) })).filter(x => x.n.qtd > 0 && x.i.saldo < 0).map(x => [x.n.escola, (escolaPorNome(x.n.escola) || {}).polo || '', x.n.funcao, x.n.turno, x.n.serie, x.n.qtd, x.i.lotada, x.i.saldo, x.i.status, x.n.prioridade]) },
  disponiveis: { t: 'Servidores disponíveis para lotação', cab: ['Matrícula', 'Servidor(a)', 'Vínculo', 'Cargo', 'Situação', 'Tipo de lotação', 'Nível', 'C.H.', 'Observações'], linhas: () => servidoresVisiveis().filter(s => ['Sem Lotação', 'Dobra - Disponível'].includes(s.tipo_lotacao) || /Dispon|Aguardando/.test(s.situacao || '')).map(s => [s.matricula, s.nome, s.vinculo, s.cargo, s.situacao, s.tipo_lotacao, s.nivel, s.carga, s.obs]) },
  temporarios: { t: 'Contratos temporários', cab: ['Matrícula', 'Servidor(a)', 'Função', 'Escola', 'Situação', 'Admissão', 'Vencimento', 'Alerta'], linhas: () => servidoresVisiveis().filter(s => s.vinculo === 'C. Temporário').sort((a, b) => ordNome(a.nome, b.nome)).map(s => [s.matricula, s.nome, s.funcao, s.escola, s.situacao, fData(s.admissao), fData(s.vencimento), (alertaContrato(s) || { t: '—' }).t]) },
  especiais: { t: 'Servidores em situação especial', cab: ['Matrícula', 'Servidor(a)', 'Cargo', 'Situação', 'Escola', 'Vínculo', 'Observações'], linhas: () => servidoresVisiveis().filter(s => s.situacao !== 'Ativo').map(s => [s.matricula, s.nome, s.cargo, s.situacao, s.escola, s.vinculo, s.obs]) },
  externos: { t: 'Cedidos, permutas e lotação externa', cab: ['Matrícula', 'Servidor(a)', 'Cargo', 'Situação', 'Tipo de lotação', 'Órgão / Localidade', 'Órgão permuta', 'Observações'], linhas: () => servidoresVisiveis().filter(s => /Permut|Extern|Cedid/.test(s.tipo_lotacao || '') || /Cedido|Permuta/.test(s.situacao || '')).map(s => [s.matricula, s.nome, s.cargo, s.situacao, s.tipo_lotacao, s.outros_orgaos || s.escola, s.orgao_permuta, s.obs]) },
  resumo: { t: 'Resumo por escola e vínculo', cab: ['Escola', 'Polo', 'Efetivos', 'Temporários', 'Diretos', 'Total', 'Ativos'], linhas: () => state.escolas.filter(e => !ehDiretor() || e.nome === Sess.escola).map(e => { const l = state.servidores.filter(s => s.escola === e.nome), c = v => l.filter(s => s.vinculo === v).length; return [e.nome, e.polo, c('C. Efetivo'), c('C. Temporário'), c('C. Direto'), l.length, l.filter(s => s.situacao === 'Ativo').length]; }) }
};
TELAS.relatorios = () => {
  UI.rel = UI.rel || { tipo: 'quadro', pg: 1 };
  $('#main').innerHTML = '<div class="topo"><div><h1>Relatórios</h1><p>Relatórios dinâmicos, sempre calculados a partir dos dados atuais.</p></div><div class="acoes"><button class="btn" onclick="App.relCsv()">Exportar (Excel/CSV)</button><button class="btn p" onclick="App.relPdf()">Imprimir / PDF</button></div></div>' +
    '<div class="abas">' + Object.keys(RELS).map(k => '<a class="' + (UI.rel.tipo === k ? 'at' : '') + '" onclick="UI.rel.tipo=\'' + k + '\';UI.rel.pg=1;App.redesenhar()">' + RELS[k].t + '</a>').join('') + '</div><div id="rel-tab"></div>';
  PARTES.rel();
};
PARTES.rel = () => {
  const r = RELS[UI.rel.tipo], p = paginar(r.linhas(), 'rel', 100);
  $('#rel-tab').innerHTML = tabela(r.cab, p.itens.map(l => '<tr>' + l.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>')) + p.html;
};

/* ---------- ADMINISTRAÇÃO ---------- */
const DOM_ROT = { cargos: 'Cargos efetivos', funcoes: 'Funções exercidas', turnos: 'Turnos', series: 'Séries/Etapas', situacoes: 'Situações', vinculos: 'Vínculos', habilitacoes: 'Habilitações', cargas: 'Cargas horárias', outros_orgaos: 'Outros órgãos/localidades', tipos_lotacao: 'Tipos de lotação', orgaos_permuta: 'Órgãos de permuta', prioridades: 'Prioridades' };
TELAS.admin = () => {
  UI.adm = UI.adm || { aba: 'usu', pg: 1 };
  const abas = { usu: 'Usuários', mig: 'Verificação da migração', dom: 'Listas (domínios)', org: 'Organograma da folha', bkp: 'Backup e dados', log: 'Auditoria' };
  let h = '<div class="topo"><div><h1>Administração</h1></div></div><div class="abas">' + Object.keys(abas).map(k => '<a class="' + (UI.adm.aba === k ? 'at' : '') + '" onclick="UI.adm.aba=\'' + k + '\';UI.adm.pg=1;App.redesenhar()">' + abas[k] + '</a>').join('') + '</div>';
  if (UI.adm.aba === 'dom') {
    h += '<div class="box info">Um valor por linha. As listas alimentam os campos de seleção da ficha do servidor e das necessidades.</div><div class="g2">' + Object.keys(DOM_ROT).map(k => '<div class="card"><h2>' + DOM_ROT[k] + '</h2><div class="fld"><textarea id="dom-' + k + '" style="min-height:150px">' + esc((state.dominios[k] || []).join('\n')) + '</textarea></div><div class="acoes" style="margin-top:8px"><button class="btn p sm" onclick="App.domSalvar(\'' + k + '\')">Salvar lista</button></div></div>').join('') + '</div>';
  } else if (UI.adm.aba === 'org') {
    h += '<div class="box warn">Os códigos de organograma não constam na planilha de origem (apenas o exemplo 08.01.000 no PRD). Preencha-os aqui: eles aparecem no cabeçalho de cada bloco do PDF da folha.</div>' +
      tabela(['Bloco da folha', 'Código de organograma'], BLOCOS.map(b => '<tr><td><b>' + esc(b.titulo) + '</b></td><td><input style="max-width:200px" value="' + esc(state.organograma[b.id] || '') + '" placeholder="ex.: 08.01.000" onchange="App.orgSet(\'' + b.id + '\',this.value)"></td></tr>'));
  } else if (UI.adm.aba === 'bkp') {
    h += '<div class="card"><h2>Cópia dos dados</h2><p class="nota">Os dados ficam no banco de dados do sistema (Supabase). Aqui você baixa uma cópia completa do que está carregado, para guardar. O arquivo contém CPFs: mantenha-o em local restrito.</p><div class="acoes"><button class="btn p" onclick="App.backupExportar()">Baixar cópia dos dados (.json)</button></div></div>';
  } else if (UI.adm.aba === 'usu') {
    h += App.usuariosHtml();
  } else if (UI.adm.aba === 'log') {
    const p = paginar(state.log, 'adm', 100);
    h += '<div class="acoes" style="margin-bottom:10px"><button class="btn" onclick="App.logCsv()">Exportar (Excel/CSV)</button></div>' + tabela(['Data/hora', 'Usuário', 'Ação', 'Entidade', 'Registro', 'Detalhe'], p.itens.map(l => '<tr><td style="white-space:nowrap">' + fDataHora(l.em) + '</td><td>' + esc(l.usuario) + '</td><td>' + esc(l.acao) + '</td><td>' + esc(l.entidade) + '</td><td>' + esc(l.ref) + '</td><td>' + esc(l.detalhe) + '</td></tr>'), 'Nenhuma movimentação registrada ainda.') + p.html;
  } else {
    const comp = '2026-10', sts = state.servidores.map(s => statusConc(s, comp).t), n = t => sts.filter(x => x === t).length, sem = extratoSemLotacao(comp);
    const ex = state.extratos[comp] || [], ms = new Set(state.servidores.map(s => normMat(s.matricula)).filter(Boolean)), im = extIdx(comp).mat;
    const pm = { ext: ex.length, com: ex.filter(x => ms.has(normMat(x.matricula))).length, fora: state.servidores.filter(s => s.tipo_lotacao !== 'Permutado DE' && normMat(s.matricula) && !im.has(normMat(s.matricula))).length };
    const div = state.necessidades.filter(x => x.lotada_origem != null && qtdLotada(x) !== x.lotada_origem);
    const lin = (a, b, c, ok) => '<tr><td>' + a + '</td><td class="n"><b>' + b + '</b></td><td class="n">' + c + '</td><td>' + (ok == null ? '' : ok ? tag('Confere', 'ok') : tag('Diverge', 'warn')) + '</td></tr>';
    h += '<div class="box info">Comparação entre os dados atuais do sistema e os números da planilha de origem (' + esc(state.origem) + '). Depois que a lotação for alterada no sistema, é esperado que os números deixem de coincidir.</div>' +
      tabela(['Indicador', { t: 'No sistema', n: 1 }, { t: 'Na planilha', n: 1 }, ''], [
        lin('Registros de lotação (Consolidado)', state.servidores.length, 563, state.servidores.length === 563),
        lin('Escolas', state.escolas.length, 23, state.escolas.length === 23),
        lin('Linhas de necessidade', state.necessidades.length, 791, state.necessidades.length === 791),
        lin('Necessidades com Qtd. Lotada diferente da planilha', div.length, 0, div.length === 0),
        lin('Matrículas no extrato ' + compRotulo(comp), (state.extratos[comp] || []).length, 594, (state.extratos[comp] || []).length === 594),
        lin('No extrato com lotação (cruzando só por matrícula, como na planilha)', pm.com, 462, pm.com === 462),
        lin('No extrato sem lotação (só por matrícula)', pm.ext - pm.com, 132, pm.ext - pm.com === 132),
        lin('Permutado DE (fora da folha)', n('Fora da folha (Permutado DE)'), 24, n('Fora da folha (Permutado DE)') === 24),
        lin('Lotados com matrícula ausente do extrato (só por matrícula)', pm.fora, 41, pm.fora === 41),
        lin('→ destes, localizados no extrato pelo CPF (outra matrícula)', n('Na folha (matrícula divergente)'), '—', null),
        lin('→ no extrato sem lotação, após cruzar também por CPF', sem.length, '—', null),
        lin('Sem matrícula e fora do extrato', n('Sem matrícula'), '—', null)
      ]) + (div.length ? '<div class="card" style="margin-top:14px"><h2>Necessidades divergentes</h2>' + tabela(['Escola', 'Função', 'Turno', 'Série', { t: 'Sistema', n: 1 }, { t: 'Planilha', n: 1 }], div.slice(0, 50).map(x => '<tr><td>' + esc(x.escola) + '</td><td>' + esc(x.funcao) + '</td><td>' + esc(x.turno) + '</td><td>' + esc(x.serie) + '</td><td class="n">' + qtdLotada(x) + '</td><td class="n">' + x.lotada_origem + '</td></tr>')) + '</div>' : '');
  }
  $('#main').innerHTML = h;
};
PARTES.adm = () => TELAS.admin();
