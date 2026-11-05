// Supabase Configuration
const SUPABASE_URL = "https://rlyrberzchdiyotgellg.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ra9TBazygVyYCnog1eTVMA_1kqvFJf7";
const supabaseClient = (typeof window.supabase !== 'undefined' && window.supabase.createClient) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

const DISTRICT_COORDS = {
  'Porta Venezia & NoLo': [45.4746, 9.2054],
  'Navigli & Darsena': [45.4515, 9.1765],
  'Isola & Garibaldi': [45.4870, 9.1895],
  'Brera & Centro': [45.4714, 9.1876],
  'Tortona & P.ta Genova': [45.4530, 9.1670],
  'Lambrate': [45.4842, 9.2384]
};

let currentUserProfile = null; // Profilo Supabase attivo
let authMode = 'signup'; // 'signup' oppure 'signin'
let selectedAuthRole = 'guest';
let currentDistrictFilter = 'All';
let currentCategoryFilter = 'All';
let mapInstance = null;
let mapMarkers = [];
let events = [];

document.addEventListener("DOMContentLoaded", async () => {
  await initSession();
  await fetchEventsFromCloud();
  if (window.lucide) lucide.createIcons();
});

// 1. Sessione & Profilo Reale da Supabase
async function initSession() {
  if (!supabaseClient) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profile) currentUserProfile = profile;
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        currentUserProfile = profile;
      } else {
        currentUserProfile = null;
      }
      renderAuthHeader();
      renderEvents();
    });
  } catch (err) {
    console.warn("Session check error:", err);
  }

  renderAuthHeader();
}

// 2. Fetch Eventi & Partecipanti
async function fetchEventsFromCloud() {
  const statusPill = document.getElementById('db-status-pill');
  if (statusPill) statusPill.innerText = "Syncing...";

  if (!supabaseClient) return;

  try {
    const { data: eventsData, error } = await supabaseClient
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: attendeesData } = await supabaseClient
      .from('event_attendees')
      .select('event_id, user_id, profiles(display_name, avatar_url, instagram_handle)');

    events = (eventsData || []).map(evt => {
      const eventAttendees = (attendeesData || [])
        .filter(a => a.event_id === evt.id)
        .map(a => ({
          userId: a.user_id,
          name: a.profiles ? a.profiles.display_name : 'Guest',
          avatar: a.profiles ? a.profiles.avatar_url : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
          instagram: a.profiles ? a.profiles.instagram_handle : ''
        }));

      return {
        id: evt.id,
        title: evt.title,
        district: evt.district || 'Porta Venezia & NoLo',
        location: evt.location_name || 'Milan',
        metro: evt.metro || '',
        date: evt.event_date || 'Tonight',
        category: evt.category || 'Cocktail Bar & Aperitivo',
        cover: evt.cover_url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        description: evt.description || '',
        hostName: evt.host_name || 'Verified Host',
        instagram: evt.instagram || '',
        lat: evt.lat || (DISTRICT_COORDS[evt.district] ? DISTRICT_COORDS[evt.district][0] : 45.4642),
        lng: evt.lng || (DISTRICT_COORDS[evt.district] ? DISTRICT_COORDS[evt.district][1] : 9.1900),
        attendees: eventAttendees
      };
    });

    if (statusPill) statusPill.innerText = "Cloud Live";
    renderEvents();
    if (mapInstance) updateMapMarkers();

  } catch (err) {
    console.error("Fetch error:", err);
    if (statusPill) statusPill.innerText = "Offline";
    events = [];
    renderEvents();
  }
}

// 3. Gestione Modalità Autenticazione (Sign Up vs Log In)
function switchAuthMode(mode) {
  authMode = mode;
  const tabSignup = document.getElementById('auth-tab-signup');
  const tabSignin = document.getElementById('auth-tab-signin');
  const signupFields = document.getElementById('auth-signup-fields');
  const submitBtn = document.getElementById('auth-submit-btn');
  const title = document.getElementById('auth-modal-title');

  if (mode === 'signup') {
    tabSignup.className = "flex-1 py-1.5 rounded-lg bg-neutral-800 text-white font-semibold transition";
    tabSignin.className = "flex-1 py-1.5 rounded-lg text-neutral-400 hover:text-white font-semibold transition";
    signupFields.classList.remove('hidden');
    submitBtn.innerHTML = `<i data-lucide="arrow-right" class="w-4 h-4"></i> Create Account`;
    title.innerText = "Join Naoko Milan";
  } else {
    tabSignin.className = "flex-1 py-1.5 rounded-lg bg-neutral-800 text-white font-semibold transition";
    tabSignup.className = "flex-1 py-1.5 rounded-lg text-neutral-400 hover:text-white font-semibold transition";
    signupFields.classList.add('hidden');
    submitBtn.innerHTML = `<i data-lucide="log-in" class="w-4 h-4"></i> Log In`;
    title.innerText = "Welcome Back";
  }
  if (window.lucide) lucide.createIcons();
}

async function submitAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const submitBtn = document.getElementById('auth-submit-btn');

  if (!email || !password) {
    alert("Please provide both email and password.");
    return;
  }

  submitBtn.disabled = true;

  try {
    if (authMode === 'signup') {
      const name = document.getElementById('auth-name').value.trim();
      const instagram = document.getElementById('auth-instagram').value.trim();

      if (!name) {
        alert("Please enter your name or venue title.");
        submitBtn.disabled = false;
        return;
      }

      const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password });
      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabaseClient
          .from('profiles')
          .insert([{
            id: authData.user.id,
            email: email,
            display_name: name,
            role: selectedAuthRole,
            instagram_handle: instagram || null
          }]);

        if (profileError) throw profileError;
        alert(`Account created successfully as ${selectedAuthRole === 'host' ? 'Venue / Host' : 'Guest'}!`);
      }
    } else {
      const { error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
    }

    closeAuthModal();
  } catch (err) {
    alert("Authentication error: " + err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUserProfile = null;
  renderAuthHeader();
  renderEvents();
}

// 4. Selezione Ruolo (Guest vs Host con fix illuminazione)
function selectRole(role) {
  selectedAuthRole = role;
  const guestBtn = document.getElementById('role-btn-guest');
  const hostBtn = document.getElementById('role-btn-host');

  const activeClasses = "py-2.5 px-2 rounded-xl border border-amber-500 bg-amber-500/10 text-white font-semibold flex flex-col items-center gap-1 transition text-center";
  const inactiveClasses = "py-2.5 px-2 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400 font-semibold flex flex-col items-center gap-1 transition text-center";

  if (role === 'guest') {
    guestBtn.className = activeClasses;
    hostBtn.className = inactiveClasses;
  } else {
    hostBtn.className = activeClasses;
    guestBtn.className = inactiveClasses;
  }
}

// 5. Geocoding Indirizzi Reali di Milano
async function geocodeMilanAddress(address, fallbackDistrict) {
  const baseCoords = DISTRICT_COORDS[fallbackDistrict] || [45.4642, 9.1900];
  try {
    const query = encodeURIComponent(`${address}, Milano, Italy`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
    const results = await response.json();
    if (results && results.length > 0) {
      return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
    }
  } catch (err) {
    console.warn("Geocoding fallback used:", err);
  }
  return [
    baseCoords[0] + (Math.random() - 0.5) * 0.004,
    baseCoords[1] + (Math.random() - 0.5) * 0.004
  ];
}

// 6. Pubblicazione Evento Cloud
async function publishEvent() {
  const title = document.getElementById('new-title').value.trim();
  const district = document.getElementById('new-district').value;
  const location = document.getElementById('new-location').value.trim();
  const metro = document.getElementById('new-metro').value.trim();
  const date = document.getElementById('new-date').value.trim();
  const category = document.getElementById('new-category').value;
  const ig = document.getElementById('new-ig').value.trim();
  const cover = document.getElementById('new-cover').value.trim();
  const desc = document.getElementById('new-desc').value.trim();
  const submitBtn = document.getElementById('btn-publish-submit');

  if (!title || !location || !date) {
    alert("Please fill in Title, Venue/Address, and Date.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerText = "Locating address & publishing...";

  try {
    const [finalLat, finalLng] = await geocodeMilanAddress(location, district);

    const { error } = await supabaseClient
      .from('events')
      .insert([{
        title,
        district,
        location_name: location,
        metro,
        event_date: date,
        category,
        instagram: ig || (currentUserProfile ? currentUserProfile.instagram_handle : null),
        cover_url: cover || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        description: desc,
        host_name: currentUserProfile ? currentUserProfile.display_name : 'Verified Host',
        lat: finalLat,
        lng: finalLng
      }]);

    if (error) throw error;

    closeModal();
    document.getElementById('new-title').value = '';
    document.getElementById('new-location').value = '';
    document.getElementById('new-metro').value = '';
    document.getElementById('new-date').value = '';
    document.getElementById('new-desc').value = '';

    await fetchEventsFromCloud();
    alert("Gathering pinned on the Milan map & published live!");

  } catch (err) {
    alert("Error publishing event: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Publish to Milan Feed";
  }
}

// 7. Render Feed ed Eventi
function renderEvents() {
  const container = document.getElementById('events-container');
  const filtered = events.filter(e => {
    const matchesDistrict = (currentDistrictFilter === 'All') || (e.district === currentDistrictFilter);
    const matchesCategory = (currentCategoryFilter === 'All') || (e.category === currentCategoryFilter);
    return matchesDistrict && matchesCategory;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass p-8 rounded-3xl text-center space-y-2">
        <i data-lucide="map-pin-off" class="w-8 h-8 text-neutral-500 mx-auto"></i>
        <p class="text-sm font-semibold text-neutral-300">No events found for these filters</p>
        <p class="text-xs text-neutral-500">Pick another neighborhood or host the first gathering!</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(evt => {
    const isUserGoing = currentUserProfile && evt.attendees.some(a => a.userId === currentUserProfile.id);

    return `
      <div class="glass rounded-3xl overflow-hidden shadow-2xl transition hover:border-neutral-700">
        <div class="relative h-48 w-full overflow-hidden">
          <img src="${evt.cover}" alt="Cover" class="w-full h-full object-cover">
          <div class="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent"></div>
          
          <div class="absolute top-3 left-3 flex gap-1.5 flex-wrap">
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full glass text-amber-300 border border-amber-400/20">${evt.district}</span>
            <span class="text-[10px] font-semibold px-2 py-1 rounded-full glass text-neutral-300">${evt.category}</span>
          </div>

          <div class="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <div>
              <p class="text-xs font-semibold text-amber-400 uppercase tracking-wider">${evt.date}</p>
              <h2 class="text-xl font-bold leading-tight">${evt.title}</h2>
            </div>
          </div>
        </div>

        <div class="p-4 space-y-3.5">
          <div class="flex items-center justify-between text-xs text-neutral-400">
            <div class="flex items-center gap-1.5 truncate">
              <i data-lucide="map-pin" class="w-4 h-4 text-rose-400 shrink-0"></i>
              <span class="font-medium text-neutral-200 truncate">${evt.location}</span>
              ${evt.metro ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">${evt.metro}</span>` : ''}
            </div>
            ${evt.instagram ? `<span class="text-neutral-400 text-[11px] font-mono shrink-0">${evt.instagram}</span>` : ''}
          </div>

          <p class="text-xs text-neutral-300 leading-relaxed">${evt.description || 'No description provided.'}</p>

          <div class="border-t border-neutral-800/80 pt-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="flex -space-x-2 overflow-hidden">
                ${evt.attendees.length > 0 ? evt.attendees.slice(0, 3).map(a => `
                  <img title="${a.name} ${a.instagram ? '(' + a.instagram + ')' : ''}" class="inline-block h-7 w-7 rounded-full ring-2 ring-neutral-900 object-cover cursor-pointer" src="${a.avatar}" alt="${a.name}">
                `).join('') : '<span class="text-xs text-neutral-500">No RSVPs yet</span>'}
              </div>
              <span class="text-xs font-medium text-neutral-400">
                ${evt.attendees.length > 0 ? `+${evt.attendees.length} going` : 'Be the first'}
              </span>
            </div>

            <button onclick="attendEvent('${evt.id}')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${isUserGoing ? 'bg-emerald-500 text-black' : 'bg-neutral-800 hover:bg-neutral-700 text-white'}">
              <i data-lucide="${isUserGoing ? 'check' : 'calendar-plus'}" class="w-3.5 h-3.5"></i>
              <span>${isUserGoing ? 'Going ✓' : 'Join In'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// 8. RSVP Gestione Presenze Cloud
async function attendEvent(eventId) {
  if (!currentUserProfile) {
    alert("Please sign in or create an account to RSVP!");
    openAuthModal();
    return;
  }

  const evt = events.find(e => e.id === eventId);
  if (!evt) return;

  const existingIndex = evt.attendees.findIndex(a => a.userId === currentUserProfile.id);

  if (existingIndex > -1) {
    await supabaseClient
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', currentUserProfile.id);

    evt.attendees.splice(existingIndex, 1);
  } else {
    const { error } = await supabaseClient
      .from('event_attendees')
      .insert([{
        event_id: eventId,
        user_id: currentUserProfile.id
      }]);

    if (error) {
      console.error("RSVP error:", error);
      return;
    }

    evt.attendees.push({
      userId: currentUserProfile.id,
      name: currentUserProfile.display_name,
      avatar: currentUserProfile.avatar_url,
      instagram: currentUserProfile.instagram_handle
    });
  }

  renderEvents();
  if (mapInstance) showMapPreview(evt);
}

// 9. Views & Mappa
function switchView(view) {
  const feedView = document.getElementById('view-feed');
  const mapView = document.getElementById('view-map');
  const navFeed = document.getElementById('nav-btn-feed');
  const navMap = document.getElementById('nav-btn-map');

  if (view === 'feed') {
    feedView.classList.remove('hidden');
    mapView.classList.add('hidden');
    navFeed.className = "flex flex-col items-center gap-1 text-amber-400";
    navMap.className = "flex flex-col items-center gap-1 text-neutral-400 hover:text-neutral-200";
  } else {
    feedView.classList.add('hidden');
    mapView.classList.remove('hidden');
    navMap.className = "flex flex-col items-center gap-1 text-amber-400";
    navFeed.className = "flex flex-col items-center gap-1 text-neutral-400 hover:text-neutral-200";
    initOrResizeMap();
  }
  if (window.lucide) lucide.createIcons();
}

function initOrResizeMap() {
  if (!mapInstance && typeof L !== 'undefined') {
    mapInstance = L.map('milano-map', { zoomControl: false }).setView([45.4654, 9.1859], 13);
    
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapInstance);
    
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);
  }

  setTimeout(() => {
    if (mapInstance) {
      mapInstance.invalidateSize();
      updateMapMarkers();
    }
  }, 200);
}

function updateMapMarkers() {
  if (!mapInstance || typeof L === 'undefined') return;
  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];

  events.forEach(evt => {
    const coords = [evt.lat, evt.lng];
    const customIcon = L.divIcon({
      className: 'custom-pin',
      html: `
        <div class="w-8 h-8 rounded-full bg-amber-500 border-2 border-black flex items-center justify-center text-black font-extrabold shadow-lg shadow-amber-500/50 hover:scale-110 transition cursor-pointer">
          <span class="text-xs">N</span>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker(coords, { icon: customIcon }).addTo(mapInstance);
    marker.on('click', () => showMapPreview(evt));
    mapMarkers.push(marker);
  });
}

function showMapPreview(evt) {
  const card = document.getElementById('map-preview-card');
  card.innerHTML = `
    <div class="flex gap-3 items-center">
      <img src="${evt.cover}" class="w-16 h-16 rounded-xl object-cover shrink-0" />
      <div class="flex-1 min-w-0">
        <span class="text-[10px] text-amber-400 font-bold uppercase tracking-wider">${evt.district}</span>
        <h4 class="text-sm font-bold truncate text-white">${evt.title}</h4>
        <p class="text-xs text-neutral-400 truncate">${evt.location}</p>
      </div>
      <button onclick="attendEvent('${evt.id}')" class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 text-black shrink-0">
        RSVP
      </button>
    </div>
  `;
  card.classList.remove('hidden');
}

function flyToDistrict(district) {
  if (!mapInstance) return;
  const previewCard = document.getElementById('map-preview-card');
  if (previewCard) previewCard.classList.add('hidden');

  if (district === 'All') {
    mapInstance.flyTo([45.4654, 9.1859], 13, { duration: 1.2 });
  } else if (DISTRICT_COORDS[district]) {
    mapInstance.flyTo(DISTRICT_COORDS[district], 15, { duration: 1.2 });
  }
}

// 10. Filtri & Header
function filterDistrict(district, btn) {
  currentDistrictFilter = district;
  document.querySelectorAll('.district-pill').forEach(b => {
    b.className = 'district-pill px-3.5 py-1.5 rounded-full glass text-neutral-400 hover:text-white transition shrink-0';
  });
  btn.className = 'district-pill px-3.5 py-1.5 rounded-full bg-neutral-100 text-neutral-950 font-bold shadow shrink-0';
  renderEvents();
}

function filterCategory(cat, btn) {
  currentCategoryFilter = cat;
  document.querySelectorAll('.category-pill').forEach(b => {
    b.className = 'category-pill px-3 py-1 rounded-lg glass text-neutral-400 hover:text-white shrink-0';
  });
  btn.className = 'category-pill px-3 py-1 rounded-lg bg-neutral-800 text-amber-400 font-semibold shrink-0';
  renderEvents();
}

function renderAuthHeader() {
  const area = document.getElementById('auth-header-area');
  if (currentUserProfile) {
    area.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-xs text-neutral-300 font-semibold truncate max-w-[90px]">${currentUserProfile.display_name}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full ${currentUserProfile.role === 'host' ? 'bg-amber-400 text-black font-bold' : 'bg-neutral-800 text-neutral-300'}">
          ${currentUserProfile.role === 'host' ? 'Host' : 'Guest'}
        </span>
        <button onclick="logout()" class="text-neutral-500 hover:text-rose-400 text-xs ml-0.5" title="Sign out">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  } else {
    area.innerHTML = `
      <button onclick="openAuthModal()" class="text-xs px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-200 transition flex items-center gap-1.5">
        <i data-lucide="log-in" class="w-3.5 h-3.5 text-amber-400"></i>
        <span>Sign In</span>
      </button>
    `;
  }
  if (window.lucide) lucide.createIcons();
}

function handleCreateEventClick() {
  if (!currentUserProfile) {
    alert("An account is required to host gatherings. Sign up as a Venue/Host!");
    openAuthModal();
    selectRole('host');
    return;
  }
  if (currentUserProfile.role !== 'host') {
    alert(`You are currently signed in as a Guest (${currentUserProfile.display_name}). Only verified Venue / Host accounts can post gatherings.`);
    return;
  }
  document.getElementById('host-name-label').innerText = currentUserProfile.display_name;
  document.getElementById('create-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); if (window.lucide) lucide.createIcons(); }
function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }
function closeModal() { document.getElementById('create-modal').classList.add('hidden'); }

function showProfile() {
  if (!currentUserProfile) {
    openAuthModal();
  } else {
    alert(`Naoko Profile:\nName: ${currentUserProfile.display_name}\nEmail: ${currentUserProfile.email}\nInstagram: ${currentUserProfile.instagram_handle || 'Not connected'}\nRole: ${currentUserProfile.role === 'host' ? 'Host / Venue' : 'Guest'}`);
  }
}
