import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://pacnegivzgxpanphrnwp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const $ = (id) => document.getElementById(id);
const views = ['authView', 'pendingView', 'appView'];
let authMode = 'signin';
let context = null;
let currentOrganization = null;
let players = [];

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
});

function showView(id) {
  views.forEach((view) => $(view)?.classList.toggle('hidden', view !== id));
}

function setMessage(text = '', type = 'error') {
  const box = $('authMessage');
  if (!box) return;
  if (!text) {
    box.textContent = '';
    box.classList.add('hidden');
    return;
  }
  box.textContent = text;
  box.classList.remove('hidden');
  box.dataset.type = type;
}

function friendlyError(error) {
  const raw = String(error?.message || error || 'Ocurrió un error.');
  if (/invalid login credentials/i.test(raw)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(raw)) return 'Confirma tu correo antes de entrar.';
  if (/user already registered/i.test(raw)) return 'Ese correo ya tiene una cuenta. Usa “Entrar”.';
  if (/password/i.test(raw) && /characters/i.test(raw)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit/i.test(raw)) return 'Demasiados intentos. Intenta de nuevo en unos minutos.';
  if (/not authorized/i.test(raw)) return 'Tu cuenta todavía no tiene acceso a esta organización.';
  return raw;
}

function switchAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  $('signInTab')?.classList.toggle('active', !signingUp);
  $('signUpTab')?.classList.toggle('active', signingUp);
  $('nameField')?.classList.toggle('hidden', !signingUp);
  $('authSubmit').textContent = signingUp ? 'Crear cuenta' : 'Entrar';
  $('password')?.setAttribute('autocomplete', signingUp ? 'new-password' : 'current-password');
  setMessage();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setMessage();
  const email = $('email').value.trim();
  const password = $('password').value;
  const displayName = $('displayName')?.value.trim();
  const button = $('authSubmit');
  button.disabled = true;
  button.textContent = authMode === 'signup' ? 'Creando…' : 'Entrando…';

  try {
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } }
      });
      if (error) throw error;

      if (!data.session) {
        setMessage('Cuenta creada. Revisa tu correo para confirmar el acceso y después vuelve a entrar.', 'success');
        return;
      }
      await loadAuthenticatedApp();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadAuthenticatedApp();
    }
  } catch (error) {
    setMessage(friendlyError(error));
  } finally {
    button.disabled = false;
    button.textContent = authMode === 'signup' ? 'Crear cuenta' : 'Entrar';
  }
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function normalizeContext(raw) {
  if (!raw) return { profile: null, organizations: [] };
  if (Array.isArray(raw)) return raw[0] || { profile: null, organizations: [] };
  return raw;
}

async function loadAuthenticatedApp() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    showView('authView');
    return;
  }

  try {
    context = normalizeContext(await rpc('v2_my_context'));
  } catch (error) {
    console.error('Context error', error);
    $('pendingText').textContent = 'Tu sesión existe, pero todavía no pudimos resolver el acceso al club.';
    showView('pendingView');
    return;
  }

  const organizations = Array.isArray(context?.organizations) ? context.organizations : [];
  if (!organizations.length) {
    const email = userData.user.email || 'tu correo';
    $('pendingText').textContent = `La cuenta ${email} ya existe en Supabase Auth. Falta vincularla a Tannery City.`;
    showView('pendingView');
    return;
  }

  currentOrganization = organizations[0];
  await loadDashboard(userData.user);
  showView('appView');
}

function firstDayOfCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

async function loadDashboard(user) {
  const organizationId = currentOrganization.organization_id || currentOrganization.id;
  if (!organizationId) throw new Error('No se encontró el identificador de la organización.');

  const [snapshotRaw, playerRows] = await Promise.all([
    rpc('v2_collection_snapshot', {
      p_organization_id: organizationId,
      p_period: firstDayOfCurrentMonth()
    }),
    rpc('v2_players', {
      p_organization_id: organizationId,
      p_status: 'active'
    })
  ]);

  const snapshot = Array.isArray(snapshotRaw) ? snapshotRaw[0] : snapshotRaw;
  players = Array.isArray(playerRows) ? playerRows : [];

  $('orgName').textContent = currentOrganization.organization_name || currentOrganization.name || 'Tannery City FC';
  $('roleBadge').textContent = roleLabel(currentOrganization.role || 'member');
  $('welcome').textContent = `Sesión segura de ${context?.profile?.display_name || user.email || 'Tanner'}`;

  $('kpiPlayers').textContent = snapshot?.active_players ?? players.length;
  $('kpiCollection').textContent = snapshot?.collection_rate == null ? '—' : `${snapshot.collection_rate}%`;
  $('kpiCovered').textContent = snapshot?.covered == null ? '' : `${snapshot.covered}/${snapshot.collection_population} cubiertos`;
  $('kpiCurrentDebt').textContent = money.format(Number(snapshot?.current_period_receivable || 0));
  $('kpiTotalDebt').textContent = money.format(Number(snapshot?.total_receivable || 0));

  renderModules(currentOrganization.modules || []);
  renderPlayers(players);
}

function roleLabel(role) {
  const labels = {
    owner: 'Propietario', president: 'Presidencia', operations: 'Operaciones', coach: 'Formadores',
    academy: 'Academia', cashier: 'Taquilla', accounting: 'Contabilidad', commercial: 'La Quinta Fuerza',
    scouting: 'Scouting', player: 'Tanner', member: 'Miembro'
  };
  return labels[role] || role;
}

function moduleLabel(code) {
  const labels = {
    players: 'Jugadores', billing: 'Cobranza', accounting: 'Contabilidad', academies: 'Academias',
    attendance: 'Asistencia', programs: 'Programas', commerce: 'Tienda', prospects: 'Prospectos',
    scouting: 'Scouting', sponsors: 'Patrocinadores', equipment: 'Utilería', calendar: 'Calendario',
    users: 'Usuarios', admin: 'Administración', qa: 'QA'
  };
  return labels[code] || code;
}

function renderModules(modules) {
  const list = $('modulesList');
  list.innerHTML = '';
  (Array.isArray(modules) ? modules : []).forEach((item) => {
    const code = typeof item === 'string' ? item : item.code || item.module_code;
    if (!code) return;
    const chip = document.createElement('span');
    chip.className = 'module';
    chip.textContent = moduleLabel(code);
    list.appendChild(chip);
  });
  if (!list.children.length) {
    const chip = document.createElement('span');
    chip.className = 'module';
    chip.textContent = 'Sin módulos disponibles';
    list.appendChild(chip);
  }
}

function playerName(player) {
  return [player.first_name, player.last_name].filter(Boolean).join(' ').trim();
}

function renderPlayers(rows) {
  const body = $('playersBody');
  body.innerHTML = '';
  const list = Array.isArray(rows) ? rows : [];
  $('playersEmpty').classList.toggle('hidden', list.length > 0);

  list.forEach((player) => {
    const tr = document.createElement('tr');
    const review = Boolean(player.needs_review || player.billing_status === 'review');
    const cells = [
      player.code || '—',
      playerName(player) || 'Sin nombre',
      player.category || 'Sin categoría',
      player.base_monthly_fee == null ? 'Por configurar' : money.format(Number(player.base_monthly_fee)),
      review ? '<span class="status review">Revisar</span>' : '<span class="status active">Activo</span>'
    ];
    cells.forEach((value, index) => {
      const td = document.createElement('td');
      if (index === 4) td.innerHTML = value;
      else td.textContent = value;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function filterPlayers() {
  const query = $('playerSearch').value.trim().toLocaleLowerCase('es-MX');
  if (!query) return renderPlayers(players);
  renderPlayers(players.filter((player) => {
    const haystack = `${player.code || ''} ${playerName(player)} ${player.category || ''}`.toLocaleLowerCase('es-MX');
    return haystack.includes(query);
  }));
}

async function signOut() {
  await supabase.auth.signOut();
  context = null;
  currentOrganization = null;
  players = [];
  showView('authView');
  switchAuthMode('signin');
}

$('signInTab')?.addEventListener('click', () => switchAuthMode('signin'));
$('signUpTab')?.addEventListener('click', () => switchAuthMode('signup'));
$('authForm')?.addEventListener('submit', handleAuthSubmit);
$('signOut')?.addEventListener('click', signOut);
$('pendingSignOut')?.addEventListener('click', signOut);
$('refreshAccess')?.addEventListener('click', loadAuthenticatedApp);
$('playerSearch')?.addEventListener('input', filterPlayers);

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) showView('authView');
});

const { data: initialSession } = await supabase.auth.getSession();
if (initialSession?.session) {
  try {
    await loadAuthenticatedApp();
  } catch (error) {
    console.error(error);
    showView('pendingView');
    $('pendingText').textContent = friendlyError(error);
  }
} else {
  showView('authView');
  switchAuthMode('signin');
}
