/* ============================================================
   TRÍADE CONEXÃO — Helpers compartilhados + Auth (matrícula)
   ============================================================ */

/* ============================================================
   AUTH — login por matrícula (8 dígitos)
   ============================================================ */

const Auth = {
  /**
   * Login por matrícula.
   * @param {string} matricula - 8 dígitos, ex: "20260001"
   * @param {string} senha
   */
  async login(matricula, senha) {
    const matriculaLimpa = String(matricula || '').replace(/\D/g, '');

    if (matriculaLimpa.length !== 8) {
      return { ok: false, erro: 'A matrícula deve ter 8 dígitos.' };
    }

    const emailFake = matriculaLimpa + '@triade.local';

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailFake,
      password: senha
    });

    if (error) {
      return { ok: false, erro: 'Matrícula ou senha inválidos.' };
    }

    const { data: perfil, error: errP } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (errP || !perfil) {
      await supabase.auth.signOut();
      return { ok: false, erro: 'Perfil não encontrado na base.' };
    }

    const sessao = this._perfilParaSessao(perfil);
    localStorage.setItem('triade_session', JSON.stringify(sessao));
    return { ok: true, usuario: sessao };
  },

  async logout() {
    await supabase.auth.signOut();
    localStorage.removeItem('triade_session');
  },

  /** Retorna sessão local (cache). Pode estar desatualizada. */
  atual() {
    try {
      return JSON.parse(localStorage.getItem('triade_session'));
    } catch {
      return null;
    }
  },

  /**
   * ⚠️ ASSÍNCRONO — use `const user = await Auth.require('admin')`.
   * Garante sessão Supabase + papel correto. Redireciona se não bater.
   */
  async require(papel) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      location.replace('login.html');
      return null;
    }

    let u = this.atual();

    if (!u || u.id !== session.user.id || u.papel !== papel) {
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!perfil || perfil.papel !== papel) {
        location.replace('login.html');
        return null;
      }

      u = this._perfilParaSessao(perfil);
      localStorage.setItem('triade_session', JSON.stringify(u));
    }

    return u;
  },

  /** Atualiza sessão local + tabela usuarios (patch parcial). */
  async atualizar(dados) {
    const u = this.atual();
    if (!u) return;

    const novo = { ...u, ...dados };
    localStorage.setItem('triade_session', JSON.stringify(novo));

    if (!novo.id) return;

    const patch = {};
    const campos = [
      'nome', 'graduacao', 'especializacao', 'celular',
      'disciplina', 'turma', 'serie', 'responsavel',
      'parentesco', 'foto'
    ];
    campos.forEach(c => {
      if (dados[c] !== undefined) patch[c] = dados[c];
    });

    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from('usuarios')
        .update(patch)
        .eq('id', novo.id);
      if (error) console.error('[Auth.atualizar]', error);
    }
  },

  /** Converte linha da tabela `usuarios` em objeto de sessão. */
  _perfilParaSessao(perfil) {
    return {
      id: perfil.id,
      matricula: perfil.matricula,
      nome: perfil.nome,
      papel: perfil.papel,
      graduacao: perfil.graduacao,
      especializacao: perfil.especializacao,
      celular: perfil.celular,
      disciplina: perfil.disciplina,
      turma: perfil.turma,
      serie: perfil.serie,
      responsavel: perfil.responsavel,
      parentesco: perfil.parentesco,
      alunosVinculados: perfil.alunos_vinculados || [],
      foto: perfil.foto
    };
  }
};

/* ============================================================
   ROTAS POR PAPEL
   ============================================================ */
const ROTAS = {
  admin:     'admin.html',
  professor: 'professor.html',
  aluno:     'aluno.html',
  pais:      'pais.html'
};

/* ============================================================
   FORMATAÇÃO
   ============================================================ */
function fmtMoeda(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

function fmtData(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-BR');
}

function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function fmtMatricula(m) {
  if (!m) return '';
  return String(m).replace(/\D/g, '').padStart(8, '0');
}

/* ============================================================
   CÁLCULOS
   ============================================================ */
function media(arr) {
  if (!arr || !arr.length) return 0;
  return +(arr.reduce((a, b) => a + Number(b), 0) / arr.length).toFixed(1);
}

function calcularMediaAluno(alunoNome, turma, bimestre = 1) {
  if (!alunoNome || !turma) return 0;
  const notas = DB.list('notas').filter(n =>
    n.aluno === alunoNome && n.turma === turma && n.bimestre === bimestre
  );
  return notas.length ? media(notas.map(n => Number(n.nota))) : 0;
}

function calcularMediaTurma(turma, bimestre = 1) {
  if (!turma) return 0;
  const notas = DB.list('notas').filter(n =>
    n.turma === turma && n.bimestre === bimestre
  );
  return notas.length ? media(notas.map(n => Number(n.nota))) : 0;
}

function calcularFrequencia(aluno, turma) {
  if (!aluno || !turma) return 100;
  const faltas = DB.list('faltas').filter(f =>
    f.aluno === aluno && f.turma === turma
  );
  if (!faltas.length) return 100;
  const presentes = faltas.filter(f => f.status === 'Presente').length;
  return Math.round((presentes / faltas.length) * 100);
}

/* ============================================================
   DONUT SVG
   ============================================================ */
function donutSVG(percent, corClasse = 'azul', texto = null) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const raio = 26;
  const circunferencia = 2 * Math.PI * raio;
  const offset = circunferencia - (p / 100) * circunferencia;
  const label = texto !== null ? texto : p.toFixed(0) + '%';
  return `
    <div class="donut">
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle class="track" cx="30" cy="30" r="${raio}"></circle>
        <circle class="bar ${corClasse}" cx="30" cy="30" r="${raio}"
                stroke-dasharray="${circunferencia.toFixed(2)}"
                stroke-dashoffset="${offset.toFixed(2)}"></circle>
      </svg>
      <div class="centro">${label}</div>
    </div>`;
}

function notaParaPct(nota) {
  return Math.max(0, Math.min(100, (Number(nota) || 0) * 10));
}

function corPorNota(nota) {
  const n = Number(nota) || 0;
  if (n >= 8) return 'verde';
  if (n >= 6) return 'azul';
  if (n >= 4) return 'amarelo';
  return 'vermelho';
}

function corPorPct(pct) {
  const p = Number(pct) || 0;
  if (p >= 80) return 'verde';
  if (p >= 60) return 'azul';
  if (p >= 40) return 'amarelo';
  return 'vermelho';
}

function donutItem({ percent, cor, texto, nome, valor }) {
  return `
    <div class="donut-item">
      ${donutSVG(percent, cor, texto)}
      <div class="donut-info">
        <div class="nome">${nome}</div>
        <div class="valor">${valor}</div>
      </div>
    </div>`;
}

/* ============================================================
   NAVEGAÇÃO POR ABAS
   ============================================================ */
function initTabs(titulos) {
  const app = document.getElementById('app');
  const pageTitle = document.getElementById('pageTitle');
  const pageSub = document.getElementById('pageSub');
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const tabs = document.querySelectorAll('.tab');

  function activateTab(key) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.tab === key));
    tabs.forEach(t => t.classList.toggle('active', t.id === 'tab-' + key));
    const [t, s] = titulos[key] || ['', ''];
    if (pageTitle) pageTitle.textContent = t;
    if (pageSub) pageSub.textContent = s;
    if (app) app.classList.remove('mobile-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navItems.forEach(n => n.addEventListener('click', () => activateTab(n.dataset.tab)));

  const chip = document.querySelector('.user-chip');
  if (chip && chip.dataset.tab) {
    chip.addEventListener('click', () => activateTab(chip.dataset.tab));
  }

  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      if (window.innerWidth <= 820) app.classList.toggle('mobile-open');
      else app.classList.toggle('collapsed');
    });
  }

  return { activateTab };
}

/* ============================================================
   HELPERS DE UI
   ============================================================ */
function abrirForm(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function fecharForm(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    const f = el.querySelector('form');
    if (f) f.reset();
  }
}

function filtrarTabela(tableId, inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const q = el.value.toLowerCase();
  document.querySelectorAll('#' + tableId + ' tbody tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ============================================================
   UPLOAD DE FOTO DE PERFIL
   ============================================================ */
function initUploadPerfil() {
  const fileInput = document.getElementById('perfilFile');
  if (!fileInput) return;
  const perfilImg = document.getElementById('perfilImg');
  const perfilInitials = document.getElementById('perfilInitials');
  const chipAvatar = document.getElementById('chipAvatar');

  const u = Auth.atual();
  if (u && u.foto) {
    if (perfilImg) { perfilImg.src = u.foto; perfilImg.style.display = 'block'; }
    if (perfilInitials) perfilInitials.style.display = 'none';
    if (chipAvatar) chipAvatar.innerHTML = '<img src="' + u.foto + '" alt="">';
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const src = ev.target.result;
      if (perfilImg) { perfilImg.src = src; perfilImg.style.display = 'block'; }
      if (perfilInitials) perfilInitials.style.display = 'none';
      if (chipAvatar) chipAvatar.innerHTML = '<img src="' + src + '" alt="">';
      await Auth.atualizar({ foto: src });
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   PREENCHER UI DO USUÁRIO
   ============================================================ */
function preencherUsuarioUI(user) {
  if (!user) return;

  const iniciais = (user.nome || 'U')
    .split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const set = (sel, txt) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = txt;
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  set('.user-chip .info strong', user.nome || 'Usuário');
  set('.user-chip .info span', user.matricula ? 'Matrícula ' + user.matricula : '');

  const chipAvatar = document.getElementById('chipAvatar');
  if (chipAvatar && !user.foto) chipAvatar.textContent = iniciais;

  set('#perfilNome', user.nome || '');
  set('#perfilEmail', user.matricula ? 'Matrícula ' + user.matricula : '');

  const perfilInitials = document.getElementById('perfilInitials');
  if (perfilInitials && !user.foto) perfilInitials.textContent = iniciais;

  setVal('pNome', user.nome);
  setVal('pGrad', user.graduacao);
  setVal('pEsp', user.especializacao);
  setVal('pTel', user.celular);
  setVal('pCargo', user.papel === 'admin' ? 'Administrador' : user.papel);
  setVal('pDisc', user.disciplina);
  setVal('pMatricula', user.matricula);
}

/* ============================================================
   LOGOUT
   ============================================================ */
async function logout() {
  if (confirm('Deseja sair da plataforma?')) {
    await Auth.logout();
    location.replace('login.html');
  }
}

/* ============================================================
   SALVAR PERFIL (com troca de senha opcional)
   ============================================================ */
async function salvarPerfil(e) {
  e.preventDefault();

  const dados = {
    nome: document.getElementById('pNome')?.value.trim(),
    graduacao: document.getElementById('pGrad')?.value.trim(),
    especializacao: document.getElementById('pEsp')?.value.trim(),
    celular: document.getElementById('pTel')?.value.trim()
  };

  try {
    await Auth.atualizar(dados);
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar perfil.', 'erro');
    return;
  }

  const campoNovaSenha = document.getElementById('pNovaSenha');
  const novaSenha = campoNovaSenha ? campoNovaSenha.value : '';

  if (novaSenha) {
    if (novaSenha.length < 6) {
      toast('A senha precisa ter pelo menos 6 caracteres.', 'erro');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: novaSenha });

    if (error) {
      console.error(error);
      toast('Erro ao trocar senha: ' + error.message, 'erro');
      return;
    }

    if (campoNovaSenha) campoNovaSenha.value = '';
    preencherUsuarioUI(Auth.atual());
    toast('Perfil e senha atualizados!');
    return;
  }

  preencherUsuarioUI(Auth.atual());
  toast('Perfil atualizado.');
}

/* ============================================================
   TOAST
   ============================================================ */
function toast(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:14px 20px; border-radius:10px; font-weight:600; font-size:14px;
    color:#fff; box-shadow:0 12px 28px rgba(0,0,0,.2);
    background:${tipo === 'ok' ? '#16A34A' : '#DC2626'};
    animation: slideIn .3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
