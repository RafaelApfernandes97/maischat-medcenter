// Visualizador de senha: alterna mostrar/ocultar nos campos com .toggle-senha.
const ICON_OLHO =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_OLHO_OFF =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

function ligarTogglesSenha() {
  document.querySelectorAll('.toggle-senha').forEach((btn) => {
    const alvo = document.getElementById(btn.dataset.target);
    if (!alvo) return;
    btn.innerHTML = ICON_OLHO;
    btn.addEventListener('click', () => {
      const revelar = alvo.type === 'password';
      alvo.type = revelar ? 'text' : 'password';
      btn.innerHTML = revelar ? ICON_OLHO_OFF : ICON_OLHO;
      btn.setAttribute('aria-label', revelar ? 'Ocultar senha' : 'Mostrar senha');
    });
  });
}
ligarTogglesSenha();

// Painel admin: 1) valida a senha de admin; 2) define login/senha do app.
const loginForm = document.getElementById('admin-login-form');
const loginErro = document.getElementById('admin-login-erro');
const credForm = document.getElementById('cred-form');
const credErro = document.getElementById('cred-erro');
const credOk = document.getElementById('cred-ok');
const novoLogin = document.getElementById('novo-login');

// Mostra o formulario de credenciais e carrega o login atual.
async function abrirPainel() {
  loginForm.classList.add('hidden');
  credForm.classList.remove('hidden');
  try {
    const resp = await fetch('/api/admin/credenciais');
    if (resp.ok) {
      const data = await resp.json();
      novoLogin.value = data.login || '';
    }
  } catch {
    /* silencioso: admin pode digitar do zero */
  }
}

// Se ja existe sessao de admin valida, pula o gate.
(async () => {
  try {
    const me = await fetch('/api/auth/me').then((r) => r.json());
    if (me.admin) abrirPainel();
  } catch {
    /* ignora */
  }
})();

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErro.textContent = '';
  const botao = loginForm.querySelector('button[type="submit"]');
  botao.disabled = true;
  try {
    const resp = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: document.getElementById('admin-senha').value }),
    });
    if (resp.ok) {
      abrirPainel();
      return;
    }
    const data = await resp.json().catch(() => ({}));
    loginErro.textContent = data.erro || 'Senha incorreta.';
  } catch {
    loginErro.textContent = 'Erro de conexão.';
  } finally {
    botao.disabled = false;
  }
});

credForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  credErro.textContent = '';
  credOk.classList.add('hidden');
  const botao = credForm.querySelector('button[type="submit"]');
  botao.disabled = true;
  try {
    const resp = await fetch('/api/admin/credenciais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: novoLogin.value.trim(),
        senha: document.getElementById('nova-senha').value,
      }),
    });
    if (resp.ok) {
      credOk.classList.remove('hidden');
      document.getElementById('nova-senha').value = '';
      return;
    }
    const data = await resp.json().catch(() => ({}));
    credErro.textContent = data.erro || 'Não foi possível salvar.';
  } catch {
    credErro.textContent = 'Erro de conexão.';
  } finally {
    botao.disabled = false;
  }
});
