'use strict';
/* Telas: acesso, painel, lotação, necessidades e solicitações. */
const TELAS = {}, PARTES = {};
const MENU = [
  ['Geral', [['painel', 'Painel', 'admin diretor gestor'], ['alertas', 'Alertas', 'admin gestor']]],
  ['Lotação', [['lotacao', 'Servidores', 'admin diretor gestor'], ['necessidades', 'Necessidades', 'admin diretor gestor'], ['solicitacoes', 'Solicitações', 'admin diretor'], ['reposicao', 'Reposição', 'admin'], ['escolas', 'Escolas', 'admin gestor']]],
  ['Folha', [['conferencia', 'Conferência mensal', 'admin diretor'], ['folha', 'Folha de pagamento', 'admin gestor'], ['conciliacao', 'Conciliação', 'admin gestor']]],
  ['Gestão', [['relatorios', 'Relatórios', 'admin diretor gestor'], ['admin', 'Administração', 'admin']]]
];
const CAMPOS = [
  ['matricula', 'Matrícula', 'text'], ['nome', 'Nome completo', 'text', 'c2'], ['cpf', 'CPF', 'text'],
  ['vinculo', 'Tipo de vínculo', 'vinculos'], ['situacao', 'Situação', 'situacoes'], ['tipo_lotacao', 'Tipo de lotação', 'tipos_lotacao'],
  ['cargo', 'Cargo efetivo', 'cargos'], ['funcao', 'Função exercida', 'funcoes'], ['escola', 'Escola atual', 'escolas'],
  ['turno', 'Turno', 'turnos'], ['serie', 'Série/Etapa', 'series'], ['carga', 'Carga horária', 'cargas'],
  ['nivel', 'Nível/Habilitação', 'habilitacoes'], ['disciplina', 'Disciplina/Área', 'text'], ['dobra', 'Dobra', 'bool'],
  ['outros_orgaos', 'Outros órgãos/localidades', 'outros_orgaos'], ['orgao_permuta', 'Órgão permuta', 'orgaos_permuta'], ['local_lotacao', 'Local de lotação', 'text'],
  ['admissao', 'Data de admissão', 'date'], ['vencimento', 'Vencimento do contrato', 'date'], ['segmento_folha', 'Segmento na folha', 'segmentos'],
  ['obs', 'Observações', 'textarea', 'c3']
];
const rotuloCampo = k => (CAMPOS.find(c => c[0] === k) || [k, k])[1];
const dominio = k => k === 'escolas' ? state.escolas.map(e => e.nome) : k === 'segmentos' ? SEGMENTOS : (state.dominios[k] || []);

const App = {
  pode(tela) { return MENU.some(g => g[1].some(i => i[0] === tela && i[2].split(' ').includes(Sess.perfil))); },
  nav() {
    const pend = state.solicitacoes.filter(s => s.status === 'pendente' && (!ehDiretor() || s.escola === Sess.escola)).length;
    $('#nav').innerHTML = MENU.map(g => {
      const its = g[1].filter(i => i[2].split(' ').includes(Sess.perfil));
      return its.length ? '<div class="grp">' + g[0] + '</div>' + its.map(i => '<a class="' + (UI.tela === i[0] ? 'at' : '') + '" onclick="App.ir(\'' + i[0] + '\')"><span>' + i[1] + '</span>' + (i[0] === 'solicitacoes' && pend ? '<span class="cont">' + pend + '</span>' : '') + '</a>').join('') : '';
    }).join('');
  },
  ir(tela) {
    if (!App.pode(tela)) tela = 'painel';
    UI.tela = tela; history.replaceState(null, '', '#' + tela);
    App.nav(); TELAS[tela](); window.scrollTo(0, 0);
  },
  redesenhar() { App.nav(); TELAS[UI.tela](); },
  f(tela, k, v) { UI[tela][k] = v; UI[tela].pg = 1; PARTES[tela](); },
  pg(tela, d) { UI[tela].pg += d; PARTES[tela](); },

  /* ---------- servidores ---------- */
  ficha(id) {
    const s = state.servidores.find(x => x.id === id); if (!s) return;
    formServidor(s, ehAdmin() ? 'admin' : ehDiretor() ? 'solic' : 'ler');
  },
  novoServidor(pre) {
    UI.repPend = null;
    const base = Object.assign({ id: null, matricula: '', nome: '', cpf: '', vinculo: '', situacao: 'Ativo', tipo_lotacao: 'Interna', dobra: false, escola: ehDiretor() ? Sess.escola : '' }, pre || {});
    formServidor(base, ehAdmin() ? 'admin' : 'solic');
  },
  salvarServidor(id) {
    const d = lerForm(); if (!d.nome) return toast('Informe o nome do servidor.', true);
    if (id == null) {
      d.id = novoId(); if (UI.repPend) { d.reposicao = UI.repPend.origem; }
      state.servidores.push(d); DB.log('Inclusão', 'servidor', d.id, d.nome + ' — ' + (d.escola || 'sem escola'));
      if (UI.repPend) { state.candStatus[UI.repPend.cand] = { status: 'lotado', nec: UI.repPend.nec, escola: d.escola, em: agora() }; DB.log('Reposição', 'candidato', UI.repPend.cand, 'Lotado: ' + d.nome + ' em ' + d.escola); UI.repPend = null; }
    } else {
      const s = state.servidores.find(x => x.id === id), dif = diffServ(s, d);
      if (!Object.keys(dif).length) { fecharModal(); return; }
      DB.log(dif.escola !== undefined ? 'Remanejamento' : 'Alteração', 'servidor', id, s.nome + ' — ' + descDiff(s, dif));
      Object.assign(s, dif);
    }
    DB.salvar(); fecharModal(); toast('Servidor salvo.'); App.redesenhar();
  },
  excluirServidor(id) {
    const s = state.servidores.find(x => x.id === id);
    if (!confirm('Excluir definitivamente o registro de lotação de ' + s.nome + '?\n\nPara desligamentos, prefira alterar a Situação para "Rescindido".')) return;
    state.servidores = state.servidores.filter(x => x.id !== id);
    DB.log('Exclusão', 'servidor', id, s.nome + ' (mat. ' + (s.matricula || '—') + ')'); DB.salvar(); fecharModal(); toast('Registro excluído.'); App.redesenhar();
  },
  enviarSolic(id) {
    const d = lerForm(), just = $('#sol-just').value.trim();
    if (!d.nome) return toast('Informe o nome do servidor.', true);
    if (!just) return toast('Escreva a justificativa da solicitação.', true);
    const s = id == null ? null : state.servidores.find(x => x.id === id);
    const dif = s ? diffServ(s, d) : d;
    if (s && !Object.keys(dif).length) return toast('Nenhum campo foi alterado.', true);
    const antes = {}; if (s) Object.keys(dif).forEach(k => antes[k] = s[k]);
    const tipo = !s ? 'Inclusão de servidor' : dif.escola !== undefined ? 'Remanejamento' : dif.situacao === 'Rescindido' ? 'Desligamento' : 'Alteração de dados';
    state.solicitacoes.unshift({ id: novoId(), servidor_id: s ? s.id : null, servidor_nome: d.nome, escola: Sess.escola, solicitante: Sess.nome, tipo, dados: dif, antes, justificativa: just, status: 'pendente', parecer: '', criada_em: agora() });
    DB.log('Solicitação', 'solicitacao', d.nome, tipo + ' — ' + d.nome); DB.salvar(); fecharModal();
    toast('Solicitação enviada para aprovação da SEME.'); App.redesenhar();
  },
  exportarLotacao() {
    const l = filtrarLotacao();
    csv('lotacao_' + hoje(), ['Matrícula', 'Nome', 'CPF', 'Vínculo', 'Situação', 'Tipo de Lotação', 'Dobra', 'Cargo Efetivo', 'Função Exercida', 'Turno', 'Série/Etapa', 'Nível', 'Disciplina', 'Escola', 'Outros Órgãos', 'Carga Horária', 'Órgão Permuta', 'Local de Lotação', 'Admissão', 'Vencimento', 'Segmento Folha', 'Observações'],
      l.map(s => [s.matricula, s.nome, ehAdmin() ? fCpf(s.cpf) : cpfMasc(s.cpf), s.vinculo, s.situacao, s.tipo_lotacao, s.dobra ? 'Sim' : 'Não', s.cargo, s.funcao, s.turno, s.serie, s.nivel, s.disciplina, s.escola, s.outros_orgaos, s.carga, s.orgao_permuta, s.local_lotacao, fData(s.admissao), fData(s.vencimento), segmento(s), s.obs]));
  },

  /* ---------- necessidades ---------- */
  necQtd(id, v) {
    const n = state.necessidades.find(x => x.id === id), q = Math.max(0, parseInt(v, 10) || 0);
    if (n.qtd === q) return;
    DB.log('Alteração', 'necessidade', id, n.escola + ' · ' + n.funcao + ' ' + [n.turno, n.serie].filter(Boolean).join(' ') + ': qtd ' + n.qtd + ' → ' + q);
    n.qtd = q; DB.salvar(); PARTES.nec();
  },
  necForm(id) {
    const n = id ? state.necessidades.find(x => x.id === id) : { escola: UI.nec.escola || '', funcao: '', turno: '', serie: '', qtd: 1, prioridade: '', obs: '' };
    const F = (k, r, lista) => '<div class="fld"><label>' + r + '</label><select data-f="' + k + '">' + opts(lista, n[k]) + '</select></div>';
    modal(id ? 'Editar necessidade' : 'Nova necessidade',
      '<div class="form">' + F('escola', 'Escola', dominio('escolas')) + F('funcao', 'Cargo/Função necessária', dominio('funcoes')) + F('turno', 'Turno (opcional)', dominio('turnos')) + F('serie', 'Série/Etapa (opcional)', dominio('series')) +
      '<div class="fld"><label>Qtd. necessária</label><input type="number" min="0" data-f="qtd" value="' + n.qtd + '"></div>' + F('prioridade', 'Prioridade', dominio('prioridades')) +
      '<div class="fld c3"><label>Observações</label><textarea data-f="obs">' + esc(n.obs) + '</textarea></div></div>',
      (id ? '<button class="btn r" onclick="App.necExcluir(' + id + ')">Excluir</button>' : '') + '<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn p" onclick="App.necSalvar(' + (id || 'null') + ')">Salvar</button>');
  },
  necSalvar(id) {
    const d = lerForm(); d.qtd = Math.max(0, parseInt(d.qtd, 10) || 0);
    if (!d.escola || !d.funcao) return toast('Escola e função são obrigatórias.', true);
    const dup = state.necessidades.find(x => x.id !== id && x.escola === d.escola && x.funcao === d.funcao && x.turno === d.turno && x.serie === d.serie);
    if (dup) return toast('Já existe necessidade para esta combinação Escola + Função + Turno + Série.', true);
    if (id) { Object.assign(state.necessidades.find(x => x.id === id), d); DB.log('Alteração', 'necessidade', id, d.escola + ' · ' + d.funcao + ' = ' + d.qtd); }
    else { d.id = novoId(); state.necessidades.push(d); DB.log('Inclusão', 'necessidade', d.id, d.escola + ' · ' + d.funcao + ' = ' + d.qtd); }
    DB.salvar(); fecharModal(); PARTES.nec();
  },
  necExcluir(id) {
    if (!confirm('Excluir esta necessidade?')) return;
    const n = state.necessidades.find(x => x.id === id);
    state.necessidades = state.necessidades.filter(x => x.id !== id); DB.log('Exclusão', 'necessidade', id, n.escola + ' · ' + n.funcao); DB.salvar(); fecharModal(); PARTES.nec();
  },
  exportarNec() {
    csv('necessidades_' + hoje(), ['Escola', 'Polo', 'Cargo/Função', 'Turno', 'Série/Etapa', 'Qtd. Necessária', 'Qtd. Lotada', 'Saldo', '% Atendimento', 'Status', 'Prioridade', 'Observações'],
      filtrarNec().map(x => [x.n.escola, (escolaPorNome(x.n.escola) || {}).polo, x.n.funcao, x.n.turno, x.n.serie, x.n.qtd, x.i.lotada, x.i.saldo, x.i.pct == null ? '' : Math.round(x.i.pct * 100) + '%', x.i.status, x.n.prioridade, x.n.obs]));
  },

  /* ---------- solicitações ---------- */
  solVer(id) {
    const s = state.solicitacoes.find(x => x.id === id);
    const linhas = Object.keys(s.dados).filter(k => k !== 'id').map(k => '<tr><td>' + esc(rotuloCampo(k)) + '</td><td>' + esc(fmtCampo(k, s.antes[k])) + '</td><td><b>' + esc(fmtCampo(k, s.dados[k])) + '</b></td></tr>');
    const pend = s.status === 'pendente';
    modal('Solicitação — ' + s.tipo,
      '<p><b>' + esc(s.servidor_nome) + '</b><br><span class="nota">Escola solicitante: ' + esc(s.escola) + ' · por ' + esc(s.solicitante) + ' em ' + fDataHora(s.criada_em) + '</span></p>' +
      tabela(['Campo', s.servidor_id ? 'Situação atual' : '—', 'Proposto'], linhas) +
      '<p><b>Justificativa:</b> ' + esc(s.justificativa) + '</p>' +
      (pend && ehAdmin() ? '<div class="fld"><label>Parecer da SEME (obrigatório para rejeitar)</label><textarea id="sol-par"></textarea></div>' :
        '<p><b>Situação:</b> ' + tagSol(s.status) + (s.decidida_em ? ' <span class="nota">por ' + esc(s.decidida_por) + ' em ' + fDataHora(s.decidida_em) + '</span>' : '') + (s.parecer ? '<br><b>Parecer:</b> ' + esc(s.parecer) : '') + '</p>'),
      pend && ehAdmin() ? '<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn r" onclick="App.solDecidir(' + id + ',false)">Rejeitar</button><button class="btn g" onclick="App.solDecidir(' + id + ',true)">Aprovar e efetivar</button>' : '<button class="btn" onclick="fecharModal()">Fechar</button>');
  },
  solDecidir(id, ok) {
    const s = state.solicitacoes.find(x => x.id === id), par = $('#sol-par').value.trim();
    if (!ok && !par) return toast('Informe o parecer para rejeitar.', true);
    if (ok) {
      if (s.servidor_id == null) { const n = Object.assign({}, s.dados, { id: novoId() }); state.servidores.push(n); s.servidor_id = n.id; }
      else { const sv = state.servidores.find(x => x.id === s.servidor_id); if (!sv) return toast('O servidor desta solicitação não existe mais na lotação.', true); Object.assign(sv, s.dados); }
    }
    s.status = ok ? 'aprovada' : 'rejeitada'; s.parecer = par; s.decidida_em = agora(); s.decidida_por = Sess.nome;
    DB.log(ok ? 'Aprovação' : 'Rejeição', 'solicitacao', id, s.tipo + ' — ' + s.servidor_nome + (par ? ' · ' + par : '')); DB.salvar(); fecharModal();
    toast(ok ? 'Solicitação aprovada e efetivada na lotação.' : 'Solicitação rejeitada.'); App.redesenhar();
  }
};

/* ---------- auxiliares de formulário ---------- */
const fmtCampo = (k, v) => k === 'dobra' ? (v ? 'Sim' : 'Não') : (k === 'admissao' || k === 'vencimento') ? fData(v) : (v == null ? '' : v);
const tagSol = st => tag(st === 'pendente' ? 'Pendente' : st === 'aprovada' ? 'Aprovada' : 'Rejeitada', st === 'pendente' ? 'warn' : st === 'aprovada' ? 'ok' : 'err');
function lerForm() {
  const o = {};
  $$('#modal [data-f]').forEach(el => { o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
  return o;
}
function diffServ(s, d) {
  const dif = {};
  CAMPOS.forEach(c => { const k = c[0]; if (!(k in d)) return; const a = s[k] == null ? (c[2] === 'bool' ? false : '') : s[k]; if (a !== d[k]) dif[k] = d[k]; });
  return dif;
}
const descDiff = (s, dif) => Object.keys(dif).map(k => rotuloCampo(k) + ': ' + (fmtCampo(k, s[k]) || '—') + ' → ' + (fmtCampo(k, dif[k]) || '—')).join('; ');
function formServidor(s, modo) {
  const ler = modo === 'ler', novo = s.id == null, comp = compAtual();
  const campo = c => {
    const k = c[0], v = s[k] == null ? '' : s[k], dis = (ler || (modo === 'solic' && k === 'segmento_folha') || (modo === 'solic' && novo && k === 'escola')) ? ' disabled' : '';
    let inp;
    if (c[2] === 'text') inp = '<input data-f="' + k + '" value="' + esc(k === 'cpf' && !ehAdmin() && !novo ? cpfMasc(v) : v) + '"' + (k === 'cpf' && !ehAdmin() && !novo ? ' disabled data-skip' : dis) + '>';
    else if (c[2] === 'textarea') inp = '<textarea data-f="' + k + '"' + dis + '>' + esc(v) + '</textarea>';
    else if (c[2] === 'date') inp = (v === '' || isIso(v)) ? '<input type="date" data-f="' + k + '" value="' + esc(v) + '"' + dis + '>' : '<input data-f="' + k + '" value="' + esc(v) + '"' + dis + ' title="Data inválida na planilha de origem — corrija para AAAA-MM-DD" style="border-color:#d99a00">';
    else if (c[2] === 'bool') return '<div class="fld chk"><input type="checkbox" id="f-' + k + '" data-f="' + k + '"' + (v ? ' checked' : '') + dis + '><label for="f-' + k + '" style="margin:0">' + c[1] + ' (segundo vínculo/turno)</label></div>';
    else inp = '<select data-f="' + k + '"' + dis + '>' + opts(dominio(c[2]), v, k === 'segmento_folha' ? 'Automático: ' + segDerivado(s) : '') + '</select>';
    return '<div class="fld ' + (c[3] || '') + '"><label>' + c[1] + '</label>' + inp + '</div>';
  };
  let topo = '';
  if (!novo) {
    const st = statusConc(s, comp), al = alertaContrato(s);
    topo = '<div class="acoes" style="margin-bottom:12px">' + tag(st.t, st.cls) + tag('Bloco da folha: ' + (BLOCOS.find(b => b.id === blocoId(s)) || {}).titulo) + (al ? tag('Contrato: ' + al.t, al.cls) : '') + (s.reposicao ? tag('Reposição — ' + s.reposicao, 'info') : '') + '</div>';
  }
  const just = modo === 'solic' ? '<div class="box info" style="margin-top:14px">Como diretor(a), você não altera a lotação diretamente: as mudanças abaixo serão enviadas como <b>solicitação</b> e só valem após aprovação da SEME.</div><div class="fld"><label>Justificativa da solicitação</label><textarea id="sol-just"></textarea></div>' : '';
  const idArg = novo ? 'null' : s.id;
  const rod = ler ? '<button class="btn" onclick="fecharModal()">Fechar</button>' :
    modo === 'solic' ? '<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn p" onclick="App.enviarSolic(' + idArg + ')">Enviar solicitação</button>' :
      (novo ? '' : '<button class="btn r" onclick="App.excluirServidor(' + s.id + ')">Excluir</button>') + '<button class="btn" onclick="fecharModal();UI.repPend=null">Cancelar</button><button class="btn p" onclick="App.salvarServidor(' + idArg + ')">Salvar</button>';
  modal(novo ? (modo === 'solic' ? 'Solicitar inclusão de servidor' : 'Novo servidor') : s.nome, topo + '<div class="form">' + CAMPOS.map(campo).join('') + '</div>' + just, rod);
  $$('#modal [data-skip]').forEach(el => el.removeAttribute('data-f'));
}

/* ---------- PAINEL ---------- */
TELAS.painel = () => {
  const V = servidoresVisiveis(), comp = compAtual();
  const necs = state.necessidades.filter(n => !ehDiretor() || n.escola === Sess.escola).map(n => ({ n, i: necInfo(n) })).filter(x => x.n.qtd > 0);
  const deficit = necs.reduce((a, x) => a + (x.i.saldo < 0 ? -x.i.saldo : 0), 0);
  const cont = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x) || '(não informado)'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const barras = (pares, max) => pares.slice(0, max || 12).map(p => '<div class="barra"><span>' + esc(p[0]) + '</span><div class="tr"><i style="width:' + Math.max(2, Math.round(p[1] / pares[0][1] * 100)) + '%"></i></div><b>' + p[1] + '</b></div>').join('');
  const pend = state.solicitacoes.filter(s => s.status === 'pendente' && (!ehDiretor() || s.escola === Sess.escola)).length;
  const naFolha = V.filter(s => elegivelFolha(s, comp)).length;
  const alertas = V.map(alertaContrato).filter(a => a && (a.cls === 'err' || a.cls === 'warn')).length;
  const k = (v, t, c) => '<div class="kpi ' + (c || '') + '"><b>' + v + '</b><span>' + t + '</span></div>';
  let html = '<div class="topo"><div><h1>Painel ' + (ehDiretor() ? '— ' + esc(Sess.escola) : 'da rede municipal') + '</h1><p>Competência em andamento: <b>' + (comp ? compRotulo(comp) : 'nenhuma') + '</b> · Extrato oficial em uso: ' + (extratoComp(comp) ? compRotulo(extratoComp(comp)) : '—') + '</p></div></div>' +
    '<div class="kpis">' + k(V.length, 'Registros de lotação') + k(V.filter(s => s.situacao === 'Ativo').length, 'Ativos', 'ok') + k(V.filter(s => s.vinculo === 'C. Efetivo').length, 'Efetivos') + k(V.filter(s => s.vinculo === 'C. Temporário').length, 'Temporários') +
    k(naFolha, 'Elegíveis na folha SEME', 'ok') + k(deficit, 'Vagas em déficit', deficit ? 'err' : 'ok') + k(pend, 'Solicitações pendentes', pend ? 'warn' : '') + k(alertas, 'Contratos a vencer', alertas ? 'warn' : '') + '</div>';
  if (!ehDiretor()) {
    const linhas = state.escolas.map(e => {
      const ns = necs.filter(x => x.n.escola === e.nome), nec = ns.reduce((a, x) => a + x.n.qtd, 0), lot = ns.reduce((a, x) => a + Math.min(x.i.lotada, x.n.qtd), 0), def = ns.reduce((a, x) => a + (x.i.saldo < 0 ? -x.i.saldo : 0), 0);
      const sv = state.servidores.filter(s => s.escola === e.nome).length, c = comp && confConcluida(comp, e.codigo);
      return '<tr><td><b>' + esc(e.nome) + '</b></td><td>' + esc(e.polo) + '</td><td class="n">' + sv + '</td><td class="n">' + nec + '</td><td class="n">' + lot + '</td><td class="n">' + (def ? '<b style="color:var(--err)">-' + def + '</b>' : '0') + '</td><td>' + (nec === 0 ? tag('Sem demanda') : def === 0 ? tag('Suprida', 'ok') : lot === 0 ? tag('Não atendida', 'err') : tag('Parcial', 'warn')) + '</td><td>' + (c ? tag('Conferida', 'ok') : tag('Pendente', 'warn')) + '</td></tr>';
    });
    html += '<div class="card"><h2>Situação por escola</h2>' + tabela(['Escola', 'Polo', { t: 'Servidores', n: 1 }, { t: 'Necessária', n: 1 }, { t: 'Atendida', n: 1 }, { t: 'Déficit', n: 1 }, 'Necessidades', 'Conferência ' + (comp ? compRotulo(comp) : '')], linhas) + '</div>';
  }
  html += '<div class="g2"><div class="card"><h2>Servidores por situação</h2>' + barras(cont(V, s => s.situacao)) + '</div><div class="card"><h2>Servidores por função (12 maiores)</h2>' + barras(cont(V, s => s.funcao)) + '</div></div>' +
    '<div class="g2"><div class="card"><h2>Tipo de lotação</h2>' + barras(cont(V, s => s.tipo_lotacao)) + '</div><div class="card"><h2>Maiores déficits</h2>' +
    (necs.filter(x => x.i.saldo < 0).sort((a, b) => a.i.saldo - b.i.saldo).slice(0, 10).map(x => '<div class="barra" style="grid-template-columns:1fr 46px"><span>' + esc(x.n.escola + ' · ' + x.n.funcao + (x.n.turno ? ' · ' + x.n.turno : '') + (x.n.serie ? ' · ' + x.n.serie : '')) + '</span><b style="color:var(--err)">' + x.i.saldo + '</b></div>').join('') || '<div class="nota">Nenhum déficit registrado.</div>') + '</div></div>';
  $('#main').innerHTML = html;
};

/* ---------- LOTAÇÃO ---------- */
function filtrarLotacao() {
  const u = UI.lot, b = norm(u.busca), comp = compAtual();
  return servidoresVisiveis().filter(s =>
    (!b || norm(s.nome).includes(b) || normMat(s.matricula).includes(b.toUpperCase()) || (ehAdmin() && cpfDig(s.cpf).includes(b.replace(/\D/g, '') || '§'))) &&
    (!u.escola || (u.escola === '(sem escola)' ? !escolaPorNome(s.escola) : s.escola === u.escola)) && (!u.funcao || s.funcao === u.funcao) && (!u.vinculo || s.vinculo === u.vinculo) &&
    (!u.situacao || s.situacao === u.situacao) && (!u.tipo || s.tipo_lotacao === u.tipo) && (!u.folha || (u.folha === 'sim') === elegivelFolha(s, comp))
  ).sort((a, b2) => ordNome(a.nome, b2.nome));
}
TELAS.lotacao = () => {
  UI.lot = UI.lot || { busca: '', escola: '', funcao: '', vinculo: '', situacao: '', tipo: '', folha: '', pg: 1 };
  const u = UI.lot, sel = (k, lista, rot) => '<select onchange="App.f(\'lot\',\'' + k + '\',this.value)">' + opts(lista, u[k], rot) + '</select>';
  $('#main').innerHTML = '<div class="topo"><div><h1>Servidores e lotação</h1><p>' + (ehDiretor() ? 'Servidores lotados em ' + esc(Sess.escola) + '. Alterações são feitas por solicitação.' : 'Base central de todos os servidores da rede. Clique em um servidor para abrir a ficha.') + '</p></div><div class="acoes">' +
    '<button class="btn" onclick="App.exportarLotacao()">Exportar (Excel/CSV)</button>' + (ehAdmin() ? '<button class="btn p" onclick="App.novoServidor()">+ Novo servidor</button>' : ehDiretor() ? '<button class="btn p" onclick="App.novoServidor()">+ Solicitar inclusão</button>' : '') + '</div></div>' +
    '<div class="filtros"><input type="search" placeholder="Buscar por nome' + (ehAdmin() ? ', matrícula ou CPF' : ' ou matrícula') + '…" value="' + esc(u.busca) + '" oninput="App.f(\'lot\',\'busca\',this.value)">' +
    (ehDiretor() ? '' : sel('escola', dominio('escolas').concat(['(sem escola)']), 'Todas as escolas')) + sel('funcao', dominio('funcoes'), 'Todas as funções') + sel('vinculo', dominio('vinculos'), 'Todos os vínculos') + sel('situacao', dominio('situacoes'), 'Todas as situações') + sel('tipo', dominio('tipos_lotacao'), 'Todos os tipos de lotação') +
    '<select onchange="App.f(\'lot\',\'folha\',this.value)"><option value="">Folha: todos</option><option value="sim"' + (u.folha === 'sim' ? ' selected' : '') + '>Elegíveis na folha</option><option value="nao"' + (u.folha === 'nao' ? ' selected' : '') + '>Fora da folha</option></select></div><div id="lot-tab"></div>';
  PARTES.lot();
};
PARTES.lot = () => {
  const comp = compAtual(), p = paginar(filtrarLotacao(), 'lot');
  $('#lot-tab').innerHTML = tabela(['Mat.', 'Nome', 'Vínculo', 'Situação', 'Função exercida', 'Turno', 'Série/Etapa', 'Escola / Local', 'C.H.', 'Folha'], p.itens.map(s => {
    const st = statusConc(s, comp);
    return '<tr class="cl" onclick="App.ficha(' + s.id + ')"><td>' + esc(s.matricula) + '</td><td><b>' + esc(s.nome) + '</b>' + (s.dobra ? ' ' + tag('Dobra', 'info') : '') + '</td><td>' + esc(s.vinculo) + '</td><td>' + tag(s.situacao || '—', s.situacao === 'Ativo' ? 'ok' : s.situacao === 'Rescindido' ? 'err' : 'warn') + '</td><td>' + esc(s.funcao) + '</td><td>' + esc(s.turno) + '</td><td>' + esc(s.serie) + '</td><td>' + esc(s.escola || s.outros_orgaos || '—') + '</td><td>' + esc(s.carga) + '</td><td>' + tag(st.t === 'Na folha' ? 'Sim' : st.t, st.cls) + '</td></tr>';
  })) + p.html;
};

/* ---------- NECESSIDADES ---------- */
function filtrarNec() {
  const u = UI.nec;
  return state.necessidades.filter(n => (!u.escola || n.escola === u.escola) && (!u.funcao || n.funcao === u.funcao) && (!u.polo || (escolaPorNome(n.escola) || {}).polo === u.polo))
    .map(n => ({ n, i: necInfo(n) })).filter(x => (!u.demanda || x.n.qtd > 0 || x.i.lotada > 0) && (!u.status || x.i.status === u.status));
}
TELAS.necessidades = () => {
  UI.nec = UI.nec || { escola: '', polo: '', funcao: '', status: '', demanda: true, pg: 1 };
  if (ehDiretor()) UI.nec.escola = Sess.escola;
  const u = UI.nec, sel = (k, lista, rot) => '<select onchange="App.f(\'nec\',\'' + k + '\',this.value)">' + opts(lista, u[k], rot) + '</select>';
  $('#main').innerHTML = '<div class="topo"><div><h1>Necessidade × Lotação</h1><p>Demanda por escola, função, turno e série. A quantidade lotada conta servidores em situação Ativo ou Desvio de função.</p></div><div class="acoes"><button class="btn" onclick="App.exportarNec()">Exportar (Excel/CSV)</button>' + (ehAdmin() ? '<button class="btn p" onclick="App.necForm()">+ Nova necessidade</button>' : '') + '</div></div>' +
    '<div class="filtros">' + (ehDiretor() ? '' : sel('escola', dominio('escolas'), 'Todas as escolas') + sel('polo', [...new Set(state.escolas.map(e => e.polo))], 'Todos os polos')) + sel('funcao', dominio('funcoes'), 'Todas as funções') + sel('status', ['Suprida', 'Parcial', 'Não Atendida', 'Excedente', 'Sem demanda'], 'Todos os status') +
    '<label><input type="checkbox"' + (u.demanda ? ' checked' : '') + ' onchange="App.f(\'nec\',\'demanda\',this.checked)"> Ocultar linhas sem demanda e sem lotação</label></div><div id="nec-tab"></div>';
  PARTES.nec();
};
PARTES.nec = () => {
  const l = filtrarNec(), tn = l.reduce((a, x) => a + x.n.qtd, 0), tl = l.reduce((a, x) => a + x.i.lotada, 0), def = l.reduce((a, x) => a + (x.n.qtd > 0 && x.i.saldo < 0 ? -x.i.saldo : 0), 0), exc = l.reduce((a, x) => a + (x.n.qtd > 0 && x.i.saldo > 0 ? x.i.saldo : 0), 0);
  const p = paginar(l, 'nec', 100);
  $('#nec-tab').innerHTML = '<div class="kpis"><div class="kpi"><b>' + tn + '</b><span>Qtd. necessária</span></div><div class="kpi ok"><b>' + tl + '</b><span>Qtd. lotada</span></div><div class="kpi ' + (def ? 'err' : 'ok') + '"><b>' + def + '</b><span>Déficit (vagas em aberto)</span></div><div class="kpi"><b>' + exc + '</b><span>Excedente</span></div></div>' +
    tabela(['Escola', 'Cargo/Função', 'Turno', 'Série/Etapa', { t: 'Necessária', n: 1 }, { t: 'Lotada', n: 1 }, { t: 'Saldo', n: 1 }, { t: '% Atend.', n: 1 }, 'Status', 'Prioridade', 'Observações', ''], p.itens.map(x => {
      const n = x.n, i = x.i;
      return '<tr><td><b>' + esc(n.escola) + '</b></td><td>' + esc(n.funcao) + '</td><td>' + esc(n.turno) + '</td><td>' + esc(n.serie) + '</td><td class="n">' + (ehAdmin() ? '<input class="num" type="number" min="0" value="' + n.qtd + '" onchange="App.necQtd(' + n.id + ',this.value)">' : n.qtd) + '</td><td class="n">' + i.lotada + '</td><td class="n"><b style="color:' + (i.saldo < 0 ? 'var(--err)' : i.saldo > 0 ? 'var(--info)' : 'inherit') + '">' + i.saldo + '</b></td><td class="n">' + (i.pct == null ? '—' : Math.round(i.pct * 100) + '%') + '</td><td>' + (i.status === '—' ? '—' : tag(i.status, i.cls)) + '</td><td>' + esc(n.prioridade) + '</td><td>' + esc(n.obs) + '</td><td>' + (ehAdmin() ? '<button class="btn sm" onclick="App.necForm(' + n.id + ')">Editar</button>' : '') + '</td></tr>';
    })) + p.html;
};

/* ---------- SOLICITAÇÕES ---------- */
TELAS.solicitacoes = () => {
  UI.sol = UI.sol || { status: 'pendente', pg: 1 };
  $('#main').innerHTML = '<div class="topo"><div><h1>Solicitações de alteração</h1><p>' + (ehAdmin() ? 'Fila de aprovação: ao aprovar, a mudança é efetivada na lotação e registrada na auditoria.' : 'Acompanhe as solicitações da sua escola. Para abrir uma nova, acesse Servidores e abra a ficha do servidor.') + '</p></div>' +
    (ehDiretor() ? '<div class="acoes"><button class="btn p" onclick="App.ir(\'lotacao\')">Nova solicitação</button></div>' : '') + '</div>' +
    '<div class="filtros"><select onchange="App.f(\'sol\',\'status\',this.value)">' + ['pendente', 'aprovada', 'rejeitada', ''].map(v => '<option value="' + v + '"' + (UI.sol.status === v ? ' selected' : '') + '>' + (v ? v[0].toUpperCase() + v.slice(1) + 's' : 'Todas') + '</option>').join('') + '</select></div><div id="sol-tab"></div>';
  PARTES.sol();
};
PARTES.sol = () => {
  const l = state.solicitacoes.filter(s => (!ehDiretor() || s.escola === Sess.escola) && (!UI.sol.status || s.status === UI.sol.status));
  const p = paginar(l, 'sol');
  $('#sol-tab').innerHTML = tabela(['Data', 'Tipo', 'Servidor', 'Escola solicitante', 'Solicitante', 'Situação', ''], p.itens.map(s =>
    '<tr class="cl" onclick="App.solVer(' + s.id + ')"><td>' + fDataHora(s.criada_em) + '</td><td>' + esc(s.tipo) + '</td><td><b>' + esc(s.servidor_nome) + '</b></td><td>' + esc(s.escola) + '</td><td>' + esc(s.solicitante) + '</td><td>' + tagSol(s.status) + '</td><td><button class="btn sm">' + (s.status === 'pendente' && ehAdmin() ? 'Analisar' : 'Ver') + '</button></td></tr>'), 'Nenhuma solicitação nesta situação.') + p.html;
};
