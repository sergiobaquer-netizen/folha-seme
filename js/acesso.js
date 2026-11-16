'use strict';
/* Acesso: login com e-mail e senha, primeiro acesso, troca de senha e gestão de usuários. */
const caixaLogin = corpo => '<div class="login-box" style="max-width:480px"><div class="org">Prefeitura Municipal de Porto Acre · Secretaria Municipal de Educação</div><h1>Sistema de Gestão da Folha de Pagamento</h1>' + corpo + '</div>';
const campoL = (id, rot, tipo, auto) => '<div class="fld" style="margin-top:10px"><label for="' + id + '">' + rot + '</label><input id="' + id + '" type="' + tipo + '" autocomplete="' + auto + '" required></div>';

Object.assign(App, {
  async iniciar() {
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    $('#login').innerHTML = caixaLogin('<p class="nota">Carregando…</p>');
    try {
      const u = await Nuvem.usuario();
      if (!u) return App.telaLogin((await Nuvem.iniciado()) ? 'entrar' : 'primeiro');
      if (u.semPerfil) return App.telaLogin('semperfil');
      Sess = { id: u.id, perfil: u.perfil, nome: u.nome, escola_codigo: u.escola_codigo || '', escola: '' };
      await Nuvem.carregar();
      App.entrar();
    } catch (e) {
      Sess = null;
      $('#login').innerHTML = caixaLogin('<div class="box warn" style="margin-top:14px">Não foi possível conectar ao banco de dados: ' + esc(e.message) + '</div><button class="btn p" onclick="App.iniciar()">Tentar de novo</button>');
    }
  },
  telaLogin(modo) {
    let h;
    if (modo === 'primeiro') {
      h = '<div class="box info" style="margin-top:14px"><b>Configuração inicial.</b> O sistema ainda não tem usuários. Crie agora a conta do <b>Administrador SEME</b>; os demais usuários são criados depois, em Administração → Usuários.</div>' +
        '<form onsubmit="App.primeiroAcesso(event)">' + campoL('pa-nome', 'Nome completo', 'text', 'name') + campoL('pa-email', 'E-mail', 'email', 'username') + campoL('pa-senha', 'Senha (mínimo 8 caracteres)', 'password', 'new-password') + campoL('pa-senha2', 'Repita a senha', 'password', 'new-password') +
        '<div class="acoes" style="margin-top:16px"><button class="btn p" id="bt-entrar">Criar administrador e entrar</button></div></form>';
    } else if (modo === 'semperfil') {
      h = '<div class="box warn" style="margin-top:14px">Sua conta existe, mas ainda não tem perfil de acesso neste sistema. Procure o administrador da SEME.</div><button class="btn" onclick="App.sair()">Sair</button>';
    } else {
      h = '<p class="nota">Lotação, conferência mensal e folha da rede municipal de ensino.</p><form onsubmit="App.login(event)">' + campoL('lg-email', 'E-mail', 'email', 'username') + campoL('lg-senha', 'Senha', 'password', 'current-password') +
        '<div class="acoes" style="margin-top:16px"><button class="btn p" id="bt-entrar">Entrar</button></div></form><p class="nota" style="margin-top:14px">Esqueceu a senha? Peça ao administrador da SEME para redefinir.</p>';
    }
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#login').innerHTML = caixaLogin(h);
  },
  async login(ev) {
    ev.preventDefault(); const b = $('#bt-entrar'); b.disabled = true;
    try { await Nuvem.entrar($('#lg-email').value.trim(), $('#lg-senha').value); await App.iniciar(); }
    catch (e) { b.disabled = false; toast(e.message, true); }
  },
  async primeiroAcesso(ev) {
    ev.preventDefault();
    const nome = $('#pa-nome').value.trim(), email = $('#pa-email').value.trim(), senha = $('#pa-senha').value;
    if (senha.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', true);
    if (senha !== $('#pa-senha2').value) return toast('As duas senhas não são iguais.', true);
    const b = $('#bt-entrar'); b.disabled = true;
    try { await Nuvem.fn({ acao: 'primeiro_acesso', nome, email, senha }); await Nuvem.entrar(email, senha); await App.iniciar(); }
    catch (e) { b.disabled = false; toast(e.message, true); }
  },
  async sair() {
    if (Nuvem.pendente() && !confirm('Ainda há alterações sendo gravadas. Sair mesmo assim?')) return;
    try { await Nuvem.sair(); } catch (e) { /* segue para a tela de entrada */ }
    Sess = null; state = null; App._cand = null; Object.keys(UI).forEach(k => delete UI[k]); App.iniciar();
  },
  entrar() {
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    $('#quem').innerHTML = '<b>' + esc(Sess.nome) + '</b>' + esc(PERFIS[Sess.perfil].nome) + (Sess.escola ? '<br>' + esc(Sess.escola) : '') +
      '<div id="sinc" style="margin-top:6px;opacity:.65">Tudo salvo no banco</div><button onclick="App.atualizar()">Atualizar dados</button> <button onclick="App.minhaSenha()">Alterar senha</button> <button onclick="App.sair()">Sair</button>';
    const h = location.hash.slice(1);
    App.ir(App.pode(h) ? h : 'painel');
  },
  async atualizar() {
    if (Nuvem.pendente()) return toast('Aguarde o término da gravação.', true);
    try { await Nuvem.carregar(); App._cand = null; if (UI.adm) UI.adm.usuarios = null; App.redesenhar(); toast('Dados atualizados.'); } catch (e) { toast('Não foi possível atualizar: ' + e.message, true); }
  },
  minhaSenha() {
    modal('Alterar minha senha', '<div class="fld"><label>Nova senha (mínimo 8 caracteres)</label><input id="ms-1" type="password" autocomplete="new-password"></div><div class="fld" style="margin-top:10px"><label>Repita a nova senha</label><input id="ms-2" type="password" autocomplete="new-password"></div>',
      '<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn p" onclick="App.minhaSenhaSalvar()">Salvar</button>', true);
  },
  async minhaSenhaSalvar() {
    const s = $('#ms-1').value; if (s.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', true);
    if (s !== $('#ms-2').value) return toast('As duas senhas não são iguais.', true);
    try { await Nuvem.trocarSenha(s); fecharModal(); toast('Senha alterada.'); } catch (e) { toast(e.message, true); }
  },

  /* ---------- usuários (Administração) ---------- */
  usuariosHtml() {
    if (!UI.adm.usuarios) {
      Nuvem.usuarios().then(l => { UI.adm.usuarios = l; if (UI.tela === 'admin' && UI.adm.aba === 'usu') App.redesenhar(); }, e => toast('Não foi possível listar os usuários: ' + e.message, true));
      return '<div class="vazio">Carregando usuários…</div>';
    }
    const esc_ = c => (state.escolas.find(e => e.codigo === c) || {}).nome || '';
    return '<div class="box info">Cada pessoa entra com o próprio e-mail e senha. Você define uma senha provisória e a pessoa troca em "Alterar senha" no primeiro acesso. O diretor enxerga apenas a escola indicada aqui.</div>' +
      '<div class="acoes" style="margin-bottom:10px"><button class="btn p" onclick="App.usuForm()">+ Novo usuário</button></div>' +
      tabela(['Nome', 'E-mail', 'Perfil', 'Escola', ''], UI.adm.usuarios.map(u => '<tr><td><b>' + esc(u.nome) + '</b>' + (u.id === Sess.id ? ' ' + tag('você', 'info') : '') + '</td><td>' + esc(u.email) + '</td><td>' + esc(PERFIS[u.perfil].nome) + '</td><td>' + esc(esc_(u.escola_codigo)) + '</td><td><button class="btn sm" onclick="App.usuForm(\'' + u.id + '\')">Editar</button></td></tr>'));
  },
  usuForm(id) {
    const u = id ? UI.adm.usuarios.find(x => x.id === id) : { nome: '', email: '', perfil: 'diretor', escola_codigo: '' };
    modal(id ? 'Editar usuário' : 'Novo usuário',
      '<div class="form"><div class="fld c2"><label>Nome completo</label><input id="us-nome" value="' + esc(u.nome) + '"></div>' +
      '<div class="fld"><label>Perfil</label><select id="us-perfil">' + Object.keys(PERFIS).map(k => '<option value="' + k + '"' + (u.perfil === k ? ' selected' : '') + '>' + PERFIS[k].nome + '</option>').join('') + '</select></div>' +
      '<div class="fld c2"><label>E-mail (usado para entrar)</label><input id="us-email" type="email" autocomplete="off" value="' + esc(u.email) + '"' + (id ? ' disabled' : '') + '></div>' +
      '<div class="fld"><label>Escola (somente diretor)</label><select id="us-escola"><option value=""></option>' + state.escolas.map(e => '<option value="' + e.codigo + '"' + (u.escola_codigo === e.codigo ? ' selected' : '') + '>' + esc(e.nome) + '</option>').join('') + '</select></div>' +
      (id ? '' : '<div class="fld c3"><label>Senha provisória (mínimo 8 caracteres) — informe-a à pessoa por um canal seguro</label><input id="us-senha" type="text" autocomplete="off"></div>') + '</div>',
      (id && id !== Sess.id ? '<button class="btn r" onclick="App.usuExcluir(\'' + id + '\')">Excluir</button><button class="btn" onclick="App.usuSenha(\'' + id + '\')">Redefinir senha</button>' : '') +
      '<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn p" id="us-salvar" onclick="App.usuSalvar(' + (id ? '\'' + id + '\'' : 'null') + ')">Salvar</button>');
  },
  async usuAcao(corpo, msg, registro) {
    try { await Nuvem.fn(corpo); UI.adm.usuarios = null; fecharModal(); toast(msg); DB.log(registro[0], 'usuario', corpo.id || corpo.email, registro[1]); App.redesenhar(); }
    catch (e) { toast(e.message, true); const b = $('#us-salvar'); if (b) b.disabled = false; }
  },
  usuSalvar(id) {
    const c = { acao: id ? 'atualizar' : 'criar', id, nome: $('#us-nome').value.trim(), email: $('#us-email').value.trim(), perfil: $('#us-perfil').value, escola_codigo: $('#us-escola').value };
    if (!id) c.senha = $('#us-senha').value;
    $('#us-salvar').disabled = true;
    App.usuAcao(c, id ? 'Usuário atualizado.' : 'Usuário criado.', [id ? 'Alteração' : 'Inclusão', c.nome + ' — ' + PERFIS[c.perfil].nome]);
  },
  usuSenha(id) {
    const u = UI.adm.usuarios.find(x => x.id === id);
    modal('Redefinir senha — ' + u.nome, '<div class="fld"><label>Nova senha provisória (mínimo 8 caracteres)</label><input id="us-nova" type="text" autocomplete="off"></div>',
      '<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn p" onclick="App.usuAcao({acao:\'senha\',id:\'' + id + '\',senha:$(\'#us-nova\').value},\'Senha redefinida.\',[\'Senha redefinida\',\'\'])">Redefinir</button>', true);
  },
  usuExcluir(id) {
    const u = UI.adm.usuarios.find(x => x.id === id);
    if (confirm('Excluir o acesso de ' + u.nome + '? A pessoa não conseguirá mais entrar no sistema.')) App.usuAcao({ acao: 'excluir', id }, 'Usuário excluído.', ['Exclusão', u.nome]);
  }
});
