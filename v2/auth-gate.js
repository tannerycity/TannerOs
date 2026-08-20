import { supabase } from '/v2/shell.js';

const $ = (id) => document.getElementById(id);
const recoveryMode = new URLSearchParams(location.search).get('recovery') === '1' || /type=recovery/i.test(location.hash);

function setMessage(text='', type='error') {
  const box = $('authMessage');
  if (!box) return;
  box.textContent = text;
  box.dataset.type = type;
  box.classList.toggle('hidden', !text);
}

function normalAccessEnhancements() {
  const signup = $('signUpTab');
  const signin = $('signInTab');
  const card = document.querySelector('.auth-card');
  const muted = card?.querySelector('p.muted');
  const title = card?.querySelector('h2');
  if (signup) signup.textContent = 'Tengo invitación';
  if (title) title.textContent = 'Entra al vestidor.';
  if (muted) muted.textContent = 'Tu cuenta pertenece a Tannery City. Si eres nuevo, Presidencia debe invitarte primero.';

  const hint = document.createElement('div');
  hint.id = 'authFlowHint';
  hint.className = 'auth-flow-hint';
  hint.innerHTML = '<strong>¿Ya eres parte del equipo?</strong><span>Usa Entrar. “Tengo invitación” es solo para una cuenta nueva que Presidencia ya dio de alta.</span>';
  document.querySelector('.tabs')?.after(hint);

  const forgot = document.createElement('button');
  forgot.id = 'forgotPassword';
  forgot.className = 'auth-link-button';
  forgot.type = 'button';
  forgot.textContent = 'Olvidé mi contraseña';
  $('authForm')?.after(forgot);

  signin?.addEventListener('click', () => {
    if (muted) muted.textContent = 'Ingresa con tu cuenta del vestidor. Todos tus módulos y permisos se cargan automáticamente.';
    hint.innerHTML = '<strong>Cuenta existente</strong><span>Usa el correo con el que ya entras a TannerOS.</span>';
  });
  signup?.addEventListener('click', () => {
    if (muted) muted.textContent = 'Activa tu acceso con exactamente el mismo correo que Presidencia invitó desde Usuarios.';
    hint.innerHTML = '<strong>Primero debe existir una invitación</strong><span>Presidencia crea la invitación y asigna el rol. Después tú creas tu contraseña.</span>';
  });

  forgot.addEventListener('click', async () => {
    const email = $('email')?.value.trim();
    if (!email) {
      setMessage('Escribe primero tu correo y vuelve a tocar “Olvidé mi contraseña”.');
      $('email')?.focus();
      return;
    }
    forgot.disabled = true;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/?recovery=1`
      });
      if (error) throw error;
      setMessage('Te enviamos un correo para cambiar tu contraseña. Revisa también spam.', 'success');
    } catch (e) {
      setMessage(String(e?.message || e || 'No pudimos enviar el correo de recuperación.'));
    } finally {
      forgot.disabled = false;
    }
  });
}

async function renderRecovery() {
  const card = document.querySelector('.auth-card');
  if (!card) return;
  card.innerHTML = `
    <div class="preview-pill">Recuperar acceso</div>
    <h2>Nueva contraseña.</h2>
    <p class="muted">Elige una contraseña nueva para volver al vestidor.</p>
    <form id="recoveryForm">
      <label>Nueva contraseña<input id="newPassword" type="password" minlength="8" autocomplete="new-password" required></label>
      <label>Confirmar contraseña<input id="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label>
      <button id="savePassword" class="primary" type="submit">Guardar contraseña</button>
    </form>
    <div id="authMessage" class="message hidden"></div>
  `;

  $('recoveryForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const password = $('newPassword').value;
    const confirm = $('confirmPassword').value;
    if (password !== confirm) { setMessage('Las contraseñas no coinciden.'); return; }
    const btn = $('savePassword');
    btn.disabled = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage('Contraseña actualizada. Volviendo al vestidor…', 'success');
      setTimeout(() => location.replace('/'), 900);
    } catch (e) {
      setMessage(String(e?.message || e || 'No pudimos cambiar la contraseña.'));
      btn.disabled = false;
    }
  });
}

if (recoveryMode) {
  renderRecovery();
} else {
  normalAccessEnhancements();
  import('/v2/app.js');
}
