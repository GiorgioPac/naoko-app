// Supabase Configuration
const SUPABASE_URL = "https://rlyrberzchdiyotgellg.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ra9TBazygVyYCnog1eTVMA_1kqvFJf7";
const supabaseClient = (typeof window.supabase !== 'undefined' && window.supabase.createClient) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

// Milan Neighborhood Coordinates
const DISTRICT_COORDS = {
  'Porta Venezia & NoLo': [45.4746, 9.2054],
  'Navigli & Darsena': [45.4515, 9.1765],
  'Isola & Garibaldi': [45.4870, 9.1895],
  'Brera & Centro': [45.4714, 9.1876],
  'Tortona & P.ta Genova': [45.4530, 9.1670],
  'Lambrate': [45.4842, 9.2384]
};

let currentUser = JSON.parse(localStorage.getItem('naoko_user')) || null;
let selectedAuthRole = 'guest';
let currentDistrictFilter = 'All';
let currentCategoryFilter = 'All';
let mapInstance = null;
let mapMarkers = [];
let events = [];

document.addEventListener("DOMContentLoaded", () => {
  renderAuthHeader();
  fetchEventsFromCloud();
  lucide.createIcons();
});

// 1. Fetch Events from Supabase
async function fetchEventsFromCloud() {
  const container = document.getElementById('events-container');
  const statusPill = document.getElementById('db-status-pill');
  if (statusPill) statusPill.innerText = "Syncing...";

  if (!supabase) {
    console.error("Supabase client not initialized");
    return;
  }

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      events = data.map(dbEvt => ({
        id: dbEvt.id,
        title: dbEvt.title,
        district: dbEvt.district || 'Porta Venezia & NoLo',
        location: dbEvt.location_name || 'Milan',
        metro: dbEvt.metro || '',
        date: dbEvt.event_date || 'Tonight',
        category: dbEvt.category || 'Cocktail Bar & Aperitivo',
        cover: dbEvt.cover_url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        description: dbEvt.description || '',
        hostName: dbEvt.host_name || 'Verified Host',
        instagram: dbEvt.instagram || '',
        lat: dbEvt.lat || (DISTRICT_COORDS[dbEvt.district] ? DISTRICT_COORDS[dbEvt.district][0] : 45.4642),
        lng: dbEvt.lng || (DISTRICT_COORDS[dbEvt.district] ? DISTRICT_COORDS[dbEvt.district][1] : 9.1900),
        attendees: []
      }));
    } else {
      events = [];
    }

    if (statusPill) statusPill.innerText = "Cloud Live";
    renderEvents();
    if (mapInstance) updateMapMarkers();

  } catch (err) {
    console.error("Supabase fetch error:", err);
    if (statusPill) statusPill.innerText = "Offline Cache";
    events = JSON.parse(localStorage.getItem('naoko_milano_events')) || [];
    renderEvents();
  }
}

// 2. Publish Event to Cloud
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
    alert("Please fill in the required fields: Title, Venue/Address, and Date/Time.");
    return;
  }

  const baseCoords = DISTRICT_COORDS[district] || [45.4642, 9.1900];
  const finalLat = baseCoords[0] + (Math.random() - 0.5) * 0.008;
  const finalLng = baseCoords[1] + (Math.random() - 0.5) * 0.008;

  submitBtn.disabled = true;
  submitBtn.innerText = "Uploading to Cloud...";

  try {
    const { data, error } = await supabase
      .from('events')
      .insert([{
        title: title,
        district: district,
        location_name: location,
        metro: metro,
        event_date: date,
        category: category,
        instagram: ig,
        cover_url: cover || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        description: desc,
        host_name: currentUser ? currentUser.name : 'Verified Host',
        lat: finalLat,
        lng: finalLng
      }])
      .select();

    if (error) throw error;

    closeModal();
    document.getElementById('new-title').value = '';
    document.getElementById('new-location').value = '';
    document.getElementById('new-metro').value = '';
    document.getElementById('new-date').value = '';
    document.getElementById('new-desc').value = '';

    await fetchEventsFromCloud();
    alert("Gathering published live on Supabase! Visible to everyone.");

  } catch (err) {
    alert("Supabase error: " + err.message);
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Publish to Milan Feed";
  }
}

// 3. Render Events Feed
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
    lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(evt => {
    const isUserGoing = currentUser && evt.attendees && evt.attendees.some(a => a.name === currentUser.name);

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
                ${evt.attendees && evt.attendees.length > 0 ? evt.attendees.slice(0, 3).map(a => `
                  <img class="inline-block h-7 w-7 rounded-full ring-2 ring-neutral-900 object-cover" src="${a.avatar}" alt="${a.name}">
                `).join('') : '<span class="text-xs text-neutral-500">No RSVPs yet</span>'}
              </div>
              <span class="text-xs font-medium text-neutral-400">
                ${evt.attendees && evt.attendees.length > 0 ? `+${evt.attendees.length} going` : 'Be the first'}
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

  lucide.createIcons();
}

// 4. RSVP Handling
function attendEvent(eventId) {
  if (!currentUser) {
    alert("Please sign in or create an account to RSVP!");
    openAuthModal();
    return;
  }

  const evt = events.find(e => e.id === eventId);
  if (!evt) return;

  if (!evt.attendees) evt.attendees = [];
  const alreadyGoing = evt.attendees.some(a => a.name === currentUser.name);

  if (alreadyGoing) {
    evt.attendees = evt.attendees.filter(a => a.name !== currentUser.name);
  } else {
    evt.attendees.push({
      name: currentUser.name,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'
    });
  }

  renderEvents();
  if (mapInstance) showMapPreview(evt);
}

// 5. Views & Map
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
  lucide.createIcons();
}

function initOrResizeMap() {
  if (!mapInstance) {
    mapInstance = L.map('milano-map', { zoomControl: false }).setView([45.4654, 9.1859], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(mapInstance);
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);
  }

  setTimeout(() => {
    mapInstance.invalidateSize();
    updateMapMarkers();
  }, 200);
}

function updateMapMarkers() {
  if (!mapInstance) return;
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

// 6. Filters & Authentication
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
  if (currentUser) {
    area.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-xs text-neutral-300 font-semibold truncate max-w-[90px]">${currentUser.name}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full ${currentUser.role === 'host' ? 'bg-amber-400 text-black font-bold' : 'bg-neutral-800 text-neutral-300'}">
          ${currentUser.role === 'host' ? 'Host' : 'Guest'}
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
  lucide.createIcons();
}

function handleCreateEventClick() {
  if (!currentUser) {
    alert("An account is required to host gatherings. Sign up as a Venue/Host!");
    openAuthModal();
    selectRole('host');
    return;
  }
  if (currentUser.role !== 'host') {
    alert(`You are currently signed in as a Guest (${currentUser.name}). Only verified Venue / Host accounts can post gatherings.`);
    return;
  }
  document.getElementById('host-name-label').innerText = currentUser.name;
  document.getElementById('create-modal').classList.remove('hidden');
  lucide.createIcons();
}

function openAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); lucide.createIcons(); }
function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }
function closeModal() { document.getElementById('create-modal').classList.add('hidden'); }

function selectRole(role) {
  selectedAuthRole = role;
  const guestBtn = document.getElementById('role-btn-guest');
  const hostBtn = document.getElementById('role-btn-host');

  if (role === 'guest') {
    guestBtn.className = "py-2.5 px-2 rounded-xl border border-amber-500 bg-amber-500/10 text-white font-semibold flex flex-col items-center gap-1 transition text-center";
    guestBtn.querySelector('i').className = "w-4 h-4 text-amber-400";
    hostBtn.className = "py-2.5 px-2 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400 font-semibold flex flex-col items-center gap-1 transition text-center";
    hostBtn.querySelector('i').className = "w-4 h-4";
  } else {
    hostBtn.className = "py-2.5 px-2 rounded-xl border border-amber-500 bg-amber-500/10 text-white font-semibold flex flex-col items-center gap-1 transition text-center";
    hostBtn.querySelector('i').className = "w-4 h-4 text-amber-400";
    guestBtn.className = "py-2.5 px-2 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400 font-semibold flex flex-col items-center gap-1 transition text-center";
    guestBtn.querySelector('i').className = "w-4 h-4";
  }
  lucide.createIcons();
}

function completeAuth() {
  const name = document.getElementById('auth-name').value.trim();
  if (!name) {
    alert("Please enter a name or venue title.");
    return;
  }
  currentUser = { name, role: selectedAuthRole };
  localStorage.setItem('naoko_user', JSON.stringify(currentUser));
  closeAuthModal();
  renderAuthHeader();
  renderEvents();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('naoko_user');
  renderAuthHeader();
  renderEvents();
}

function showProfile() {
  if (!currentUser) {
    openAuthModal();
  } else {
    alert(`Naoko Profile:\nName: ${currentUser.name}\nRole: ${currentUser.role === 'host' ? 'Host / Venue' : 'Guest'}`);
  }
}
