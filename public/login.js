(() => {
  'use strict';
  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const message = document.getElementById('loginMessage');
  const button = document.getElementById('loginButton');
  const toggle = document.getElementById('togglePassword');

  const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>';

  fetch('/api/auth/session', { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => { if (data.authenticated) location.replace('/'); })
    .catch(() => {});

  if (toggle) {
    toggle.innerHTML = EYE_OPEN;
    toggle.addEventListener('click', () => {
      const showing = password.type === 'text';
      password.type = showing ? 'password' : 'text';
      toggle.innerHTML = showing ? EYE_OPEN : EYE_OFF;
      toggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.hidden = true;
    if (!email.value.trim() || !password.value) {
      showError('Preencha o e-mail e a senha.');
      return;
    }
    button.disabled = true;
    button.querySelector('span').textContent = 'A entrar...';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      location.replace('/');
    } catch (error) {
      showError(error.message);
      password.select();
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Entrar no AuraEX';
    }
  });

  function showError(text) {
    message.textContent = text;
    message.hidden = false;
  }
})();
