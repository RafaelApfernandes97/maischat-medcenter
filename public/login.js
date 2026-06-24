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

// Tela de login: envia login/senha e, em caso de sucesso, vai para o app.
const form = document.getElementById('login-form');
const erro = document.getElementById('login-erro');
const botao = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erro.textContent = '';
  botao.disabled = true;
  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: document.getElementById('login').value.trim(),
        senha: document.getElementById('senha').value,
      }),
    });
    if (resp.ok) {
      window.location.href = '/';
      return;
    }
    const data = await resp.json().catch(() => ({}));
    erro.textContent = data.erro || 'Não foi possível entrar.';
  } catch {
    erro.textContent = 'Erro de conexão. Tente novamente.';
  } finally {
    botao.disabled = false;
  }
});
