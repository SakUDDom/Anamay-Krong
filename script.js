// សូមដាក់ URL និង KEY របស់បងនៅទីនេះ
const SUPABASE_URL = "https://vmaujkjhpdpltjhbnntc.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_Mz9T9lEfgxvMfvnL-1I-8g_IiGZwNfP"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let map, markersGroup, polygonsGroup; 
let localHouseholdsData = [];
let zoneBordersData = []; 
let currentReportData = []; 
let currentReportZoneFilter = ''; 
let currentInteractionMode = 'view';
let currentUserRole = 'user'; 
let currentUserZone = ''; 
let currentPage = 1;
let itemsPerPage = 10;
let currentSelectedFile = null; // 🚀 រក្សាទុករូបដែលចង់ Upload ថ្មី

let isZoneColorMode = false;
let currentMapZoneFilter = '';
const ZONE_PALETTE = ['#8b5cf6', '#0ea5e9', '#ec4899', '#f59e0b', '#10b981', '#f43f5e', '#84cc16', '#06b6d4', '#d946ef'];

const khmerMonthsList = ['', 'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
function getKhmerMonthName(monthNumber) {
    const num = parseInt(monthNumber);
    if (num >= 1 && num <= 12) return `ខែ${khmerMonthsList[num]}`;
    return String(monthNumber);
}

function getZoneColor(zoneName) {
    if (!zoneName) return '#94a3b8';
    let hash = 0;
    for (let i = 0; i < zoneName.length; i++) hash = zoneName.charCodeAt(i) + ((hash << 5) - hash);
    return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length];
}

function getConvexHull(points) {
    const uniquePoints = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p.lat},${p.lng}`;
        if (!seen.has(key)) { seen.add(key); uniquePoints.push(p); }
    }
    if (uniquePoints.length <= 3) return uniquePoints;
    uniquePoints.sort((a, b) => a.lat !== b.lat ? a.lat - b.lat : a.lng - b.lng);
    const cross = (o, a, b) => (a.lat - o.lat) * (b.lng - o.lng) - (a.lng - o.lng) * (b.lat - o.lat);
    const lower = [];
    for (let i = 0; i < uniquePoints.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], uniquePoints[i]) <= 0) lower.pop();
        lower.push(uniquePoints[i]);
    }
    const upper = [];
    for (let i = uniquePoints.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], uniquePoints[i]) <= 0) upper.pop();
        upper.push(uniquePoints[i]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
}

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('nav-map')?.addEventListener('click', () => switchView('map'));
  document.getElementById('nav-report')?.addEventListener('click', () => switchView('report'));
  
  document.getElementById('point-dropdown-btn')?.addEventListener('click', (e) => {
      e.stopPropagation(); document.getElementById('point-dropdown-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', () => { document.getElementById('point-dropdown-menu')?.classList.add('hidden'); });
  
  document.getElementById('mode-add-btn')?.addEventListener('click', () => setInteractionMode('add'));
  document.getElementById('mode-delete-btn')?.addEventListener('click', () => setInteractionMode('delete'));
  document.getElementById('map-search-btn')?.addEventListener('click', handleMapSearch);
  
  document.getElementById('global-zone-select')?.addEventListener('change', (e) => {
      currentReportZoneFilter = e.target.value; calculateReports();
  });
  
  document.getElementById('map-zone-filter')?.addEventListener('change', (e) => {
      currentMapZoneFilter = e.target.value; renderMapMarkers();
      if (currentMapZoneFilter && currentUserRole === 'super admin') {
          const zonePoints = localHouseholdsData.filter(h => h.zone === currentMapZoneFilter && h.lat && h.lng);
          if (zonePoints.length > 0 && map) {
              const bounds = L.latLngBounds(zonePoints.map(p => [p.lat, p.lng]));
              map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
          }
      }
  });

  document.getElementById('toggle-color-btn')?.addEventListener('click', () => {
      isZoneColorMode = !isZoneColorMode;
      const btn = document.getElementById('toggle-color-btn');
      if (isZoneColorMode) {
          btn.innerHTML = '<i class="fa-solid fa-map text-lg"></i>'; btn.classList.replace('text-indigo-600', 'text-emerald-600');
      } else {
          btn.innerHTML = '<i class="fa-solid fa-palette text-lg"></i>'; btn.classList.replace('text-emerald-600', 'text-indigo-600');
      }
      renderMapMarkers();
  });

  document.getElementById('global-month-select')?.addEventListener('change', handleGlobalMonthChange);
  document.getElementById('global-status-select')?.addEventListener('change', handleGlobalStatusChange);
  document.getElementById('export-csv-btn')?.addEventListener('click', exportToCSV);

  document.getElementById('items-per-page')?.addEventListener('change', (e) => {
      itemsPerPage = parseInt(e.target.value); currentPage = 1; renderTablePage();
  });
  document.getElementById('prev-page-btn')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTablePage(); } });
  document.getElementById('next-page-btn')?.addEventListener('click', () => {
      const maxPage = Math.ceil(currentReportData.length / itemsPerPage); if (currentPage < maxPage) { currentPage++; renderTablePage(); }
  });
  document.getElementById('logout-btn')?.addEventListener('click', async () => await supabaseClient.auth.signOut());
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    btn.innerHTML = 'កំពុងចូល...'; btn.disabled = true;

    await supabaseClient.auth.signOut();
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) { alert("Error: " + error.message); btn.innerHTML = 'ចូល'; btn.disabled = false; } 
    else if (data && data.session) { await initApp(data.session); }
  });

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) { await initApp(session); }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
      document.getElementById('main-app').classList.add('hidden');
      document.getElementById('login-page').classList.remove('hidden');
  }
});

async function initApp(session) {
  try {
    const { data: profile } = await supabaseClient.from('Profiles_Access').select('role, zone').eq('id', session.user.id).maybeSingle();
    currentUserRole = (profile?.role || 'user').toLowerCase();
    currentUserZone = profile?.zone || '';

    const roleBadge = document.getElementById('user-role-badge');
    const reportTableContainer = document.querySelector('.bg-white.rounded-2xl.shadow-sm.border.border-slate-100.overflow-hidden');
    
    if (['admin', 'super admin'].includes(currentUserRole)) {
        roleBadge.innerHTML = currentUserRole === 'super admin' ? 'Super Admin 👑' : `Admin`; 
        roleBadge.className = currentUserRole === 'super admin' 
            ? "text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-bold border border-purple-200 shadow-sm"
            : "text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded-full font-bold border border-rose-200 shadow-sm";
            
        document.getElementById('global-month-select')?.classList.remove('hidden');
        document.getElementById('global-status-select')?.classList.remove('hidden');
        reportTableContainer?.classList.remove('hidden'); 
        
        if (currentUserRole === 'super admin') {
            document.getElementById('global-zone-select')?.classList.remove('hidden');
            document.getElementById('admin-map-tools')?.classList.remove('hidden');
            document.getElementById('admin-map-tools')?.classList.add('flex');
        } else {
            document.getElementById('global-zone-select')?.classList.add('hidden');
            document.getElementById('admin-map-tools')?.classList.add('hidden');
            document.getElementById('admin-map-tools')?.classList.remove('flex');
        }
        
    } else {
        roleBadge.innerHTML = `អ្នកប្រមូល៖ ${currentUserZone}`; 
        roleBadge.className = "text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-bold border border-emerald-200";
        document.getElementById('global-zone-select')?.classList.add('hidden');
        document.getElementById('global-month-select')?.classList.add('hidden');
        document.getElementById('global-status-select')?.classList.add('hidden');
        reportTableContainer?.classList.add('hidden'); 
        document.getElementById('admin-map-tools')?.classList.add('hidden');
        document.getElementById('admin-map-tools')?.classList.remove('flex');
    }

    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    switchView('map');
    if (!map) initLeafletMap();

    if (map && map.pm) {
        if (currentUserRole === 'super admin') {
            map.pm.addControls({
                position: 'topleft',
                drawMarker: false, drawCircleMarker: false, drawPolyline: false,
                drawRectangle: false, drawCircle: false, drawText: false,
                drawPolygon: true, editMode: true, dragMode: true, removalMode: true
            });
        } else { map.pm.removeControls(); }
    }

    fetchAndRenderData();
  } catch (e) { console.error(e); }
}

function switchView(view) {
  const vMap = document.getElementById('view-map'); const vRep = document.getElementById('view-report');
  const nMap = document.getElementById('nav-map'); const nRep = document.getElementById('nav-report');

  if (view === 'map') {
      vMap.style.display = 'block'; vRep.style.display = 'none';
      nMap.className = "px-4 py-2 text-sm font-bold bg-indigo-100 text-indigo-700 rounded-lg";
      nRep.className = "px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg";
      setTimeout(() => map?.invalidateSize(), 200);
  } else {
      vMap.style.display = 'none'; vRep.style.display = 'block';
      nRep.className = "px-4 py-2 text-sm font-bold bg-indigo-100 text-indigo-700 rounded-lg";
      nMap.className = "px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg";
      calculateReports();
  }
}

function initLeafletMap() {
  map = L.map('map', { zoomControl: false }).setView([11.5564, 104.9282], 14);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 21, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] }).addTo(map);
  
  polygonsGroup = L.layerGroup().addTo(map); 
  markersGroup = L.layerGroup().addTo(map);

  map.on('pm:create', async (e) => {
      if (currentUserRole !== 'super admin') return;
      const layer = e.layer;
      const zoneName = prompt("សូមបញ្ចូលឈ្មោះតំបន់ (Zone) សម្រាប់ព្រំដែននេះ៖");
      if (!zoneName) { map.removeLayer(layer); return; }

      const geojson = layer.toGeoJSON();
      const { error } = await supabaseClient.from('zone_borders').upsert({ zone: zoneName, geojson: geojson }).select();
      if (error) { alert("Error: " + error.message); map.removeLayer(layer); }
      else { fetchAndRenderData(); } 
  });

  map.on('pm:remove', async (e) => {
      if (currentUserRole !== 'super admin') return;
      const layer = e.layer;
      if (layer.feature && layer.feature.properties && layer.feature.properties.id) {
          if (confirm("តើអ្នកពិតជាចង់លុបព្រំដែននេះមែនទេ?")) {
              await supabaseClient.from('zone_borders').delete().eq('id', layer.feature.properties.id);
              fetchAndRenderData();
          } else { fetchAndRenderData(); }
      }
  });

  map.on('click', async (e) => {
    if (currentInteractionMode === 'add') {
      const customId = prompt("សូមបញ្ចូលលេខកូដផ្ទះ៖");
      if (!customId) return;
      let zone = ['admin', 'super admin'].includes(currentUserRole) ? prompt("តំបន់ (Zone)៖", "Zone") : currentUserZone;
      if (!zone) return;

      await supabaseClient.from('households').insert({
        lat: e.latlng.lat, lng: e.latlng.lng, custom_id: customId.toUpperCase(), status_color: 'yellow',
        monthly_fee: 10000, zone: zone, payment_month: 'ខែមករា'
      });
      setInteractionMode('view'); fetchAndRenderData();
    }
  });
}

async function fetchAndRenderData() {
    try {
        // 🚀 អាអូនដកពាក្យ 'name' ចេញ ហើយទុកតែ Column ដែលមានពិតប្រាកដ
        const { data: households, error: hError } = await supabaseClient.from('households')
            .select('id, custom_id, customer_name, lat, lng, zone, status_color, monthly_fee, payment_month, photo_url');
        
        // បើមាន Error ទាក់ទងនឹង Column វាលោតប្រាប់លើអេក្រង់ភ្លាម!
        if (hError) {
            alert("⚠️ កំហុស Supabase: " + hError.message + "\n(សូមឆែកមើលថាមាន Column 'photo_url' ក្នុង Database ឬនៅ?)");
            console.error("Supabase Households Error:", hError);
            return; // បញ្ឈប់ការរត់កូដ
        }

        const { data: borders, error: bError } = await supabaseClient.from('zone_borders').select('*'); 
        zoneBordersData = borders || [];

        // ផ្ទៀងផ្ទាត់សិទ្ធិ Zone
        if (currentUserRole === 'super admin') {
            localHouseholdsData = households || [];
            populateZoneDropdown(); 
        } else {
            const safeUserZone = (currentUserZone || '').trim().toLowerCase();
            localHouseholdsData = (households || []).filter(h => {
                const safeHouseZone = (h.zone || '').trim().toLowerCase();
                return safeHouseZone === safeUserZone;
            });
        }
        
        renderMapMarkers();
        if(document.getElementById('view-report').style.display === 'block') calculateReports();
    } catch (error) { 
        console.error("កំហុសទូទៅក្នុងការទាញទិន្នន័យ:", error); 
    }
}

function populateZoneDropdown() {
    const selReport = document.getElementById('global-zone-select');
    const selMap = document.getElementById('map-zone-filter');
    const zones = [...new Set(localHouseholdsData.map(h => h.zone).filter(Boolean))].sort();
    
    let opts = '<option value="">🗺️ គ្រប់តំបន់ទាំងអស់</option>';
    zones.forEach(z => { opts += `<option value="${z}">📍 តំបន់៖ ${z}</option>`; });
    
    if (selReport && currentUserRole === 'super admin') { selReport.innerHTML = opts; selReport.value = currentReportZoneFilter; }
    if (selMap) { selMap.innerHTML = opts; selMap.value = currentMapZoneFilter; }
}

function renderMapMarkers() {
  markersGroup.clearLayers();
  polygonsGroup.clearLayers();

  let dataToRender = localHouseholdsData;
  if (currentUserRole === 'super admin' && currentMapZoneFilter) {
      dataToRender = dataToRender.filter(h => h.zone === currentMapZoneFilter);
  }

  const manualZones = [];
  if (currentUserRole === 'super admin') {
      zoneBordersData.forEach(border => {
          if (!border.geojson) return;
          manualZones.push(border.zone);
          const zColor = getZoneColor(border.zone);

          try {
              const layer = L.geoJSON(border.geojson, {
                  style: { color: zColor, weight: 3, fillOpacity: isZoneColorMode ? 0.3 : 0.05, dashArray: '5, 8' }
              }).bindTooltip(`តំបន់៖ <b>${border.zone}</b>`, {sticky: true, className: 'font-bold text-sm'});

              layer.eachLayer(l => {
                  l.feature = { properties: { id: border.id, zone: border.zone } };
                  const savePolygonUpdates = async () => {
                      const updatedGeoJson = l.toGeoJSON();
                      await supabaseClient.from('zone_borders').update({ geojson: updatedGeoJson }).eq('id', border.id);
                  };
                  l.on('pm:update', savePolygonUpdates);  
                  l.on('pm:dragend', savePolygonUpdates); 
                  l.on('pm:edit', savePolygonUpdates);    
                  l.on('pm:cut', savePolygonUpdates);     
              });
              polygonsGroup.addLayer(layer);
          } catch (geoError) {}
      });
  }

  if (currentUserRole === 'super admin') {
      const zoneGroups = {};
      dataToRender.forEach(h => {
          if (!h.zone || !h.lat || !h.lng || manualZones.includes(h.zone)) return; 
          if (!zoneGroups[h.zone]) zoneGroups[h.zone] = [];
          zoneGroups[h.zone].push(h);
      });

      for (const zone in zoneGroups) {
          const points = zoneGroups[zone];
          if (points.length >= 3) {
              const hull = getConvexHull(points);
              const latlngs = hull.map(p => [p.lat, p.lng]);
              const zColor = getZoneColor(zone);
              L.polygon(latlngs, {
                  color: zColor, weight: 3, opacity: 0.8, fillColor: zColor, fillOpacity: isZoneColorMode ? 0.2 : 0.05, dashArray: '5, 8'
              }).addTo(polygonsGroup).bindTooltip(`តំបន់៖ <b>${zone} (Auto)</b>`, {sticky: true, className: 'font-bold text-sm'});
          }
      }
  }

  dataToRender.forEach(h => {
    if (!h.lat || !h.lng) return;
    let colorHex = '#f59e0b'; 
    if (isZoneColorMode && currentUserRole === 'super admin') {
        colorHex = getZoneColor(h.zone);
    } else {
        if (h.status_color === 'blue') colorHex = '#2563eb';
        else if (h.status_color === 'red') colorHex = '#dc2626';
        else if (h.status_color === 'black') colorHex = '#020617';
    }

    const marker = L.circleMarker([h.lat, h.lng], { 
        radius: (isZoneColorMode && currentUserRole === 'super admin') ? 7 : 9, fillColor: colorHex, color: '#ffffff', weight: 2, fillOpacity: 0.95 
    }).addTo(markersGroup);
    
    marker.on('click', async (e) => {
      L.DomEvent.stopPropagation(e);
      if (currentInteractionMode === 'delete') {
        if (confirm(`តើអ្នកពិតជាចង់លុបផ្ទះ ${h.custom_id} រួមទាំងប្រវត្តិបង់ប្រាក់ទាំងអស់របស់គាត់មែនទេ?`)) {
          try {
             await supabaseClient.from('payments').delete().eq('household_id', h.id);
             const { error } = await supabaseClient.from('households').delete().eq('id', h.id);
             if (error) throw error;
             setInteractionMode('view'); fetchAndRenderData(); closeSidePanel();
          } catch(err) { alert("មានបញ្ហាក្នុងការលុប៖ " + err.message); }
        }
      } else { showSidePanel(h); }
    });
  });
}

window.closeSidePanel = () => { 
    const p = document.getElementById('side-panel'); 
    p.classList.add('hidden'); p.classList.remove('flex'); 
    currentSelectedFile = null; // Reset ពេលបិទផ្ទាំង
}

function showSidePanel(h) {
    const months = ['ខែមករា','ខែកកុម្ភៈ','ខែមីនា','ខែមេសា','ខែឧសភា','ខែមិថុនា','ខែកក្កដា','ខែសីហា','ខែកញ្ញា','ខែតុលា','ខែវិច្ឆិកា','ខែធ្នូ'];
    let nextUnpaidMonthIndex = months.indexOf(h.payment_month);
    let nextUnpaidMonthHtml = (nextUnpaidMonthIndex === -1) ? 'គ្មានព័ត៌មាន' : months[nextUnpaidMonthIndex];
    let mOpts = months.map(m => `<option value="${m}" ${h.payment_month === m ? 'selected' : ''}>${m}</option>`).join('');
    
    let currentStatusHtml = '';
    if (h.status_color === 'blue') {
        currentStatusHtml = `<div class="w-full mt-3 p-3 rounded-xl font-bold bg-emerald-50 text-emerald-700 text-sm border border-emerald-100 flex items-center justify-center gap-2 shadow-sm"><i class="fa-solid fa-check-circle text-lg"></i> បានបង់រួចរាល់ (ខែបន្ទាប់៖ ${nextUnpaidMonthHtml})</div>`;
    } else {
        currentStatusHtml = `<div class="w-full mt-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm border border-amber-100 shadow-sm"><div class="font-bold flex items-center justify-center gap-2 mb-2"><i class="fa-solid fa-clock text-lg"></i> ស្ថានភាពបច្ចុប្បន្ន</div><div class="text-center font-bold text-amber-700">${nextUnpaidMonthHtml} (មិនទាន់បានបង់)</div></div>`;
    }

    let quickPayBtnHtml = '';
    if (h.status_color !== 'blue') {
        quickPayBtnHtml = `<div class="mt-4 p-4 rounded-xl border border-indigo-100 bg-white shadow-sm"><label class="block text-sm font-bold text-slate-700 mb-2">ចុចបង់ប្រាក់រហ័ស៖</label><div class="flex items-center gap-3"><input type="number" id="pay-num-months" value="1" min="1" max="12" class="w-20 border px-3 py-2.5 rounded-lg font-bold text-lg text-center outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 bg-white shadow-inner"><button onclick="quickPay('${h.id}')" id="quick-pay-btn" class="flex-1 bg-amber-500 text-white font-bold py-3 rounded-lg hover:bg-amber-600 transition-colors shadow-md flex justify-center items-center gap-2 text-base"><i class="fa-solid fa-hand-holding-dollar"></i> បង់ប្រាក់</button></div></div>`;
    }

    let manualEditHtml = '';
    if (['admin', 'super admin'].includes(currentUserRole)) {
        manualEditHtml = `
          <details class="mt-4 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-sm">
              <summary class="p-3 font-bold text-slate-700 text-sm cursor-pointer hover:bg-slate-200 outline-none flex items-center gap-2 transition-colors">
                  <i class="fa-solid fa-sliders text-indigo-500"></i> ជម្រើសកែប្រែដោយដៃ (Manual Edit)
              </summary>
              <div class="p-4 border-t border-slate-200 space-y-3 bg-white">
                  <div><label class="block text-xs font-bold mb-1 text-slate-500">ខែត្រូវបង់បន្ទាប់៖</label><select id="p-month" class="w-full border px-3 py-2 rounded-lg font-bold text-indigo-700 bg-slate-50 outline-none">${mOpts}</select></div>
                  <div><label class="block text-xs font-bold mb-1 text-slate-500">ស្ថានភាពបង់ប្រាក់៖</label>
                      <select id="p-status" class="w-full border px-3 py-2 rounded-lg bg-slate-50 font-medium outline-none">
                          <option value="blue" ${h.status_color==='blue'?'selected':''}>🔵 បានបង់</option>
                          <option value="yellow" ${h.status_color==='yellow'?'selected':''}>🟡 មិនទាន់បានបង់</option>
                          <option value="red" ${h.status_color==='red'?'selected':''}>🔴 ទីតាំងបិទ</option>
                          <option value="black" ${h.status_color==='black'?'selected':''}>⚫ បានបង់តែទុកសិន</option>
                      </select>
                  </div>
              </div>
          </details>
        `;
    } else {
        manualEditHtml = `
          <div class="hidden">
              <select id="p-month">${mOpts}</select>
              <select id="p-status">
                  <option value="blue" ${h.status_color==='blue'?'selected':''}>🔵 បានបង់</option>
                  <option value="yellow" ${h.status_color==='yellow'?'selected':''}>🟡 មិនទាន់បានបង់</option>
                  <option value="red" ${h.status_color==='red'?'selected':''}>🔴 ទីតាំងបិទ</option>
                  <option value="black" ${h.status_color==='black'?'selected':''}>⚫ បានបង់តែទុកសិន</option>
              </select>
          </div>
        `;
    }

    const historyBtnHtml = `<button onclick="showHistory('${h.id}')" class="w-full mt-3 py-3 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-sm flex justify-center items-center gap-2 text-base"><i class="fa-solid fa-clock-rotate-left"></i> មើលប្រវត្តិបង់ប្រាក់</button>`;

    // 🚀 ប្រើ photo_url ជំនួស photo_base64
    document.getElementById('panel-content').innerHTML = `
      <div class="space-y-4">
          <div class="mb-4">
              <label class="block text-sm font-bold text-slate-700 mb-2">📸 រូបថត៖</label>
              <input type="file" onchange="previewImage(this, '${h.id}')" accept="image/*" class="w-full border p-1 rounded text-sm mb-2">
              <div class="w-full h-48 bg-slate-100 rounded-lg overflow-hidden border flex items-center justify-center">
                  <img id="p-img-${h.id}" class="w-full h-full object-cover ${h.photo_url?'':'hidden'}" src="${h.photo_url||''}">
                  <span id="p-img-txt-${h.id}" class="text-slate-400 text-sm ${h.photo_url?'hidden':''}">គ្មានរូបថត</span>
              </div>
          </div>
          <div><label class="block text-xs font-bold mb-1">លេខកូដផ្ទះ៖</label><input type="text" id="p-id" value="${h.custom_id||''}" class="w-full border px-3 py-2 rounded-lg font-bold bg-slate-50"></div>
          <div><label class="block text-xs font-bold mb-1">ឈ្មោះអតិថិជន៖</label><input type="text" id="p-name" value="${h.customer_name || h.name ||''}" class="w-full border px-3 py-2 rounded-lg"></div>
          <div><label class="block text-xs font-bold mb-1">តម្លៃសេវា (៛)៖</label><input type="number" id="p-fee" value="${h.monthly_fee||0}" class="w-full border px-3 py-2 rounded-lg font-bold text-emerald-700"></div>
          <div><label class="block text-xs font-bold mb-1">តំបន់ (Zone)៖</label><input type="text" id="p-zone" value="${h.zone||''}" ${currentUserRole==='user'?'disabled':''} class="w-full border px-3 py-2 rounded-lg bg-slate-50"></div>
          
          ${currentStatusHtml}
          ${quickPayBtnHtml}
          ${manualEditHtml}
          ${historyBtnHtml}
          
          <div class="flex gap-2 mt-4">
              <button onclick="savePanelData('${h.id}')" id="save-panel-btn" class="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><i class="fa-solid fa-save mr-1"></i> រក្សាទុក</button>
              <button onclick="printBill('${h.id}')" class="flex-1 bg-sky-600 text-white font-bold py-3 rounded-lg hover:bg-sky-700 shadow-md transition-colors"><i class="fa-solid fa-print mr-1"></i> បោះពុម្ព</button>
          </div>
      </div>
    `;
    const p = document.getElementById('side-panel'); p.classList.remove('hidden'); p.classList.add('flex');
}

window.quickPay = async (id) => {
    const numMonthsInput = document.getElementById('pay-num-months');
    const numMonths = parseInt(numMonthsInput.value);
    
    if (isNaN(numMonths) || numMonths < 1 || numMonths > 12) { alert("សូមបញ្ចូលចំនួនខែចាប់ពី ១ ដល់ ១២"); return; }
    if (!confirm(`តើអ្នកប្រាកដជាចង់បង់ប្រាក់ចំនួន ${numMonths} ខែក្នុងពេលតែមួយមែនទេ?`)) return;

    const customId = document.getElementById('p-id').value.toUpperCase();
    const cusName = document.getElementById('p-name').value;
    const fee = parseFloat(document.getElementById('p-fee').value) || 0;
    const zone = document.getElementById('p-zone').value;
    const months = ['ខែមករា','ខែកកុម្ភៈ','ខែមីនា','ខែមេសា','ខែឧសភា','ខែមិថុនា','ខែកក្កដា','ខែសីហា','ខែកញ្ញា','ខែតុលា','ខែវិច្ឆិកា','ខែធ្នូ'];

    let startMonthIndex = months.indexOf(document.getElementById('p-month').value);
    if (startMonthIndex === -1) { alert("មានបញ្ហា! រកខែមិនឃើញ!"); return; }

    const recordsToInsert = [];
    let lastPaidMonthIndex = startMonthIndex;
    const now = new Date();

    for (let i = 0; i < numMonths; i++) {
        let targetMonthIndex = (startMonthIndex + i) % 12;
        let targetMonthNumber = targetMonthIndex + 1; 
        let targetYear = now.getFullYear();
        if (startMonthIndex + i > 11) { targetYear += Math.floor((startMonthIndex + i) / 12); }
        lastPaidMonthIndex = targetMonthIndex;
        
        recordsToInsert.push({ 
            household_id: id, custom_id: customId, customer_name: cusName, amount: fee, 
            month: targetMonthNumber, year: targetYear, status: 'paid', zone: zone, 
            collected_by: currentUserZone, paid_at: now.toISOString()
        });
    }

    const btn = document.getElementById('quick-pay-btn');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> កំពុងបង់ប្រាក់...'; }

    await supabaseClient.from('payments').insert(recordsToInsert);
    
    let nextUnpaidMonth = months[(lastPaidMonthIndex + 1) % 12];
    await supabaseClient.from('households').update({ status_color: 'blue', custom_id: customId, customer_name: cusName, monthly_fee: fee, payment_month: nextUnpaidMonth }).eq('id', id);

    fetchAndRenderData();
    const { data: house } = await supabaseClient.from('households').select('*').eq('id', id).single();
    if(house) showSidePanel(house);
}

// 🚀 មុខងារចាប់យករូបភាពដែលទើបជ្រើសរើស
window.previewImage = (input, id) => {
  const file = input.files[0];
  if (file) {
    currentSelectedFile = file; // រក្សាទុកក្នុង Memory ដើម្បីចាំ Upload ពេលចុច Save
    const reader = new FileReader();
    reader.onload = e => { 
        const img = document.getElementById(`p-img-${id}`); 
        img.src = e.target.result; 
        img.classList.remove('hidden'); 
        document.getElementById(`p-img-txt-${id}`).classList.add('hidden'); 
    }; 
    reader.readAsDataURL(file);
  }
}

// 🚀 មុខងាររក្សាទុក និង Upload រូបភាពចូល Storage 
window.savePanelData = async (id) => {
    const btn = document.getElementById('save-panel-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> កំពុងរក្សាទុក...';
    btn.disabled = true;

    let finalPhotoUrl = document.getElementById(`p-img-${id}`).src; 
    
    // បើមានជ្រើសរើសរូបថ្មី យើងត្រូវ Upload ចូល Storage សិន
    if (currentSelectedFile) {
        const fileExt = currentSelectedFile.name.split('.').pop();
        const fileName = `${id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('households')
            .upload(fileName, currentSelectedFile, { upsert: true });

        if (!uploadError) {
            const { data } = supabaseClient.storage.from('households').getPublicUrl(fileName);
            finalPhotoUrl = data.publicUrl; // យក Link មកប្រើ
        } else {
            console.error("Upload Image Error:", uploadError);
        }
    } else {
        const house = localHouseholdsData.find(h => h.id === id);
        finalPhotoUrl = house ? house.photo_url : '';
    }

    const updateData = { 
        custom_id: document.getElementById('p-id').value.toUpperCase(), 
        customer_name: document.getElementById('p-name').value, 
        monthly_fee: parseFloat(document.getElementById('p-fee').value)||0, 
        status_color: document.getElementById('p-status').value,
        payment_month: document.getElementById('p-month').value, 
        photo_url: finalPhotoUrl // 🚀 Save តែ Link ទេ!
    };

    if (['admin', 'super admin'].includes(currentUserRole)) updateData.zone = document.getElementById('p-zone').value;
    
    await supabaseClient.from('households').update(updateData).eq('id', id);
    
    currentSelectedFile = null; // លាងសម្អាត Memory
    closeSidePanel(); 
    fetchAndRenderData();
}

window.showHistory = async (householdId) => {
    const modal = document.getElementById('history-modal'); const content = document.getElementById('history-content');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-indigo-500"></i><p class="font-bold">កំពុងទាញយកទិន្នន័យ...</p></div>';

    try {
        const { data, error } = await supabaseClient.from('payments').select('*').eq('household_id', householdId).order('paid_at', { ascending: false });
        if (error) throw error;

        const currentYear = new Date().getFullYear();
        let html = `<div class="text-center mb-4 text-sm font-bold text-slate-600 bg-white py-2 rounded-lg border border-slate-200 shadow-sm">ប្រវត្តិបង់ប្រាក់ចុងក្រោយ</div>`;
        
        if (!data || data.length === 0) {
            html += `<div class="text-center text-slate-500 font-bold py-5">មិនមានប្រវត្តិបង់ប្រាក់ទេ</div>`;
        } else {
            data.slice(0, 12).forEach(record => {
                const dateObj = new Date(record.paid_at || record.created_at);
                const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth()+1).toString().padStart(2, '0')}/${dateObj.getFullYear()} - ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
                const khmerMonthDisplay = getKhmerMonthName(record.month);
                const yearDisplay = record.year || currentYear;
                
                let undoBtnHtml = '';
                if (['admin', 'super admin'].includes(currentUserRole)) {
                    undoBtnHtml = `<button onclick="undoPayment('${record.id}', '${householdId}', '${khmerMonthDisplay}')" class="w-8 h-8 flex items-center justify-center rounded-full bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-200 transition-colors shadow-sm" title="លុបការបង់ប្រាក់ខែនេះ"><i class="fa-solid fa-rotate-left"></i></button>`;
                }

                html += `<div class="flex justify-between items-center p-4 bg-white border-l-4 border-emerald-500 rounded-xl shadow-sm mb-3"><div><div class="font-bold text-slate-800 text-base">${khmerMonthDisplay} ឆ្នាំ ${yearDisplay}</div><div class="text-xs text-slate-500 font-medium mt-1"><i class="fa-regular fa-clock"></i> ${formattedDate}</div><div class="text-sm font-bold text-emerald-600 mt-1">៛ ${parseFloat(record.amount || 0).toLocaleString()}</div></div><div class="flex items-center gap-2"><div class="text-emerald-600 font-bold bg-emerald-50 px-3 py-1.5 rounded-full text-xs border border-emerald-100 flex items-center"><i class="fa-solid fa-check-circle mr-1 text-sm"></i> បានបង់</div>${undoBtnHtml}</div></div>`;
            });
        }
        content.innerHTML = html;
    } catch (e) { content.innerHTML = '<div class="text-center text-rose-500 font-bold py-10">មានបញ្ហាក្នុងការទាញយកទិន្នន័យ!</div>'; }
}

window.undoPayment = async (historyId, householdId, month) => {
    if (!['admin', 'super admin'].includes(currentUserRole)) return; 
    if(!confirm(`តើអ្នកពិតជាចង់ "បោះបង់" ការបង់ប្រាក់សម្រាប់ ${month} នេះមែនទេ?\n\n(ទិន្នន័យនឹងត្រូវលុបពីប្រវត្តិ ហើយផ្ទះនេះនឹងក្លាយជា "មិនទាន់បានបង់" វិញ)`)) return;

    await supabaseClient.from('payments').delete().eq('id', historyId);
    const { data: house } = await supabaseClient.from('households').select('*').eq('id', householdId).single();
    if (house) {
        await supabaseClient.from('households').update({ status_color: 'yellow', payment_month: month }).eq('id', householdId);
        showHistory(householdId); fetchAndRenderData();
        house.status_color = 'yellow'; house.payment_month = month; showSidePanel(house);
    }
}

window.closeHistoryModal = () => { document.getElementById('history-modal').classList.add('hidden'); }

window.printBill = (id) => {
    const customId = document.getElementById('p-id').value, cusName = document.getElementById('p-name').value;
    const month = document.getElementById('p-month').value, fee = document.getElementById('p-fee').value, rawStatus = document.getElementById('p-status').value;
    const imgElement = document.getElementById(`p-img-${id}`); let customerImgSrc = '';
    if (imgElement && !imgElement.classList.contains('hidden')) customerImgSrc = imgElement.src;
    const logoSrc = new URL('logo/logo.JPEG', window.location.href).href; 
    let statusText = rawStatus === 'blue' ? "បានបង់" : (rawStatus === 'red' ? "ទីតាំងបិទ" : (rawStatus === 'black' ? "បានបង់តែទុកសិន" : "មិនទាន់បានបង់"));
    const today = new Date(); const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    const printContent = `<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8"><title>វិក្កយបត្រ - ${customId}</title><style>@import url('https://fonts.googleapis.com/css2?family=Khmer+OS+Battambang&display=swap'); body { font-family: 'Khmer OS Battambang', sans-serif; padding: 20px; color: #000; } .bill-container { max-width: 700px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; border-radius: 10px; } .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; } .logo-box { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; overflow: hidden; } .logo-box img { width: 100%; height: 100%; object-fit: contain; } .header { flex: 1; text-align: center; padding-top: 10px; } .header h1 { font-size: 26px; margin: 0; font-weight: bold; } .header h3 { font-size: 18px; margin: 5px 0 20px 0; font-weight: normal; } .spacer { width: 100px; } .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; line-height: 1.8; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #000; padding: 10px; text-align: center; } .total-row { font-weight: bold; } .status { margin-bottom: 30px; font-weight: bold; } .footer-box { border: 1px solid #000; border-radius: 15px; padding: 15px; display: inline-flex; align-items: center; width: 300px; justify-content: space-around; } .footer-photo { border: 1px solid #000; width: 90px; height: 110px; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: #f8fafc; } .footer-photo img { width: 100%; height: 100%; object-fit: cover; } .footer-photo span { font-size: 12px; color: #666; } @media print { .bill-container { border: none; } }</style></head><body><div class="bill-container"><div class="header-container"><div class="logo-box"><img src="${logoSrc}" alt="Logo" onerror="this.style.display='none';"></div><div class="header"><h1>អនាម័យក្រុង</h1><h3>វិក្កយបត្រសេវាកម្មប្រមូលសំរាម</h3></div><div class="spacer"></div></div><div class="info-section"><div><div><b>លេខសម្គាល់អតិថិជនៈ</b> ${customId}</div><div><b>ឈ្មោះអតិថិជនៈ</b> ${cusName || 'មិនបញ្ជាក់'}</div></div><div><div><b>លេខវិក្កយបត្រ:</b> ${customId}</div><div><b>អ្នកទទួលប្រាក់:</b> ${currentUserZone}</div><div><b>ថ្ងៃចេញវិក្កយបត្រ:</b> ${dateStr}</div></div></div><table><thead><tr><th>បរិយាយ</th><th>ប្រចាំខែ</th><th>ចំនួនទឹកប្រាក់</th></tr></thead><tbody><tr><td>សេវាកម្មប្រមូលសំរាម</td><td>${month}</td><td>${parseInt(fee).toLocaleString()} ៛</td></tr><tr class="total-row"><td colspan="2" style="text-align: right; padding-right: 20px;">ទឹកប្រាក់ទូទាត់</td><td>${parseInt(fee).toLocaleString()} ៛</td></tr></tbody></table><div class="status">ស្ថានភាពបង់ប្រាក់: ${statusText}</div><div class="footer-box"><div class="footer-photo">${customerImgSrc ? `<img src="${customerImgSrc}" alt="Customer Photo">` : `<span>គ្មានរូបថត</span>`}</div><div><b style="font-size: 18px;">សូមអរគុណ!</b></div></div></div><script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 800); };</script></body></html>`;
    const printWindow = window.open('', '_blank'); printWindow.document.write(printContent); printWindow.document.close();
}

async function calculateReports() {
    const filterZone = (currentUserRole !== 'super admin') ? currentUserZone : currentReportZoneFilter;
    if (filterZone) { currentReportData = localHouseholdsData.filter(h => h.zone === filterZone); } 
    else { currentReportData = [...localHouseholdsData]; }

    const total = currentReportData.length, paid = currentReportData.filter(h => h.status_color === 'blue').length;
    const pending = currentReportData.filter(h => h.status_color === 'yellow').length, closed = currentReportData.filter(h => h.status_color === 'red').length;

    document.getElementById('stat-total').innerText = total; document.getElementById('stat-paid').innerText = paid;
    document.getElementById('stat-pending').innerText = pending; document.getElementById('stat-closed').innerText = closed;

    try {
        const now = new Date();
        let query = supabaseClient.from('payments').select('amount, zone').eq('month', now.getMonth() + 1).eq('year', now.getFullYear());
        if (filterZone) query = query.eq('zone', filterZone);

        const { data: paymentsInMonth } = await query;
        let totalMonthlyRevenue = 0;
        if (paymentsInMonth) paymentsInMonth.forEach(p => { totalMonthlyRevenue += parseFloat(p.amount || 0); });
        document.getElementById('stat-revenue').innerText = totalMonthlyRevenue.toLocaleString() + " ៛";
    } catch (err) { console.error("កំហុសគណនាចំណូល:", err); }

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        let queryDaily = supabaseClient.from('payments').select('amount, zone, paid_at');
        if (filterZone) queryDaily = queryDaily.eq('zone', filterZone);
        
        const { data: historyData } = await queryDaily;
        let dailyTotal = 0;
        if (historyData) {
            historyData.forEach(record => {
                const recordDateStr = (record.paid_at || record.created_at || '').split('T')[0];
                if (recordDateStr === todayStr) { dailyTotal += parseFloat(record.amount || 0); }
            });
        }
        document.getElementById('stat-daily-revenue').innerText = dailyTotal.toLocaleString() + " ៛";
    } catch (err) { console.error("គណនាចំណូលប្រចាំថ្ងៃមានបញ្ហា:", err); }
    currentPage = 1; renderTablePage();
}

function renderTablePage() {
    const tbody = document.getElementById('report-table-body'), prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn'), pageInfo = document.getElementById('page-info');
    if (!tbody) return; tbody.innerHTML = '';
    const totalItems = currentReportData.length, maxPage = Math.ceil(totalItems / itemsPerPage);
    
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === maxPage || maxPage === 0;

    if (totalItems === 0) { tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400 font-bold">មិនមានទិន្នន័យឡើយ។</td></tr>`; if (pageInfo) pageInfo.innerText = "មិនមានទិន្នន័យ"; return; }

    const startIndex = (currentPage - 1) * itemsPerPage, endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    if (pageInfo) pageInfo.innerText = `កំពុងបង្ហាញ ${startIndex + 1} - ${endIndex} នៃ ${totalItems} ផ្ទះ`;
    
    currentReportData.slice(startIndex, endIndex).forEach(h => {
        let icon = h.status_color==='blue' ? '🔵' : (h.status_color==='red' ? '🔴' : (h.status_color==='black' ? '⚫' : '🟡'));
        tbody.innerHTML += `<tr class="hover:bg-indigo-50 transition-colors"><td class="px-6 py-4 font-bold text-slate-700">${h.custom_id || '—'}</td><td class="px-6 py-4 font-medium text-slate-600">${h.customer_name || '—'}</td><td class="px-6 py-4 text-slate-500">${h.zone || '—'}</td><td class="px-6 py-4 text-indigo-600 font-bold">${h.payment_month || '—'}</td><td class="px-6 py-4">${icon}</td></tr>`;
    });
}

function handleMapSearch() {
  const val = document.getElementById('map-search-input').value.trim().toUpperCase();
  const found = localHouseholdsData.find(h => h.custom_id === val);
  if (found) { map.flyTo([found.lat, found.lng], 19); showSidePanel(found); } else alert(`រកមិនឃើញកូដផ្ទះ "${val}"!`);
}

function setInteractionMode(mode) {
  currentInteractionMode = mode; const badge = document.getElementById('mode-badge'), mapEl = document.getElementById('map');
  document.getElementById('point-dropdown-menu').classList.add('hidden'); 
  if (mode === 'add') { badge.className = "mt-2 p-2 text-xs font-bold rounded-lg shadow-md text-center bg-emerald-100 text-emerald-800 border block"; badge.innerHTML = "👉 ចុចលើផែនទីដើម្បីបន្ថែម"; mapEl.style.cursor = 'crosshair'; closeSidePanel();
  } else if (mode === 'delete') { badge.className = "mt-2 p-2 text-xs font-bold rounded-lg shadow-md text-center bg-rose-100 text-rose-800 border block"; badge.innerHTML = "👉 ចុចចំលើផ្ទះដើម្បីលុប"; mapEl.style.cursor = 'pointer'; closeSidePanel();
  } else { badge.classList.add('hidden'); mapEl.style.cursor = ''; }
}

async function handleGlobalMonthChange(e) {
  if (!['admin', 'super admin'].includes(currentUserRole)) return; const val = e.target.value; if (!val) return;
  if(confirm(`ប្តូរខែត្រូវបង់សម្រាប់ផ្ទះក្នុងតំបន់របស់អ្នកទៅជា « ${val} » ?`)) { 
      if (currentUserRole === 'super admin') await supabaseClient.from('households').update({ payment_month: val }).not('id', 'is', null); 
      else await supabaseClient.from('households').update({ payment_month: val }).eq('zone', currentUserZone);
      fetchAndRenderData(); 
  }
  e.target.value = "";
}

async function handleGlobalStatusChange(e) {
  if (!['admin', 'super admin'].includes(currentUserRole)) return; const val = e.target.value; if (!val) return;
  if(confirm(`ប្តូរស្ថានភាពសម្រាប់ផ្ទះក្នុងតំបន់របស់អ្នកមែនទេ?`)) { 
      if (currentUserRole === 'super admin') await supabaseClient.from('households').update({ status_color: val }).not('id', 'is', null); 
      else await supabaseClient.from('households').update({ status_color: val }).eq('zone', currentUserZone);
      fetchAndRenderData(); 
  }
  e.target.value = "";
}

window.exportToCSV = () => {
    let csv = "\uFEFFលេខកូដ,ឈ្មោះ,តម្លៃត្រូវបង់,ខែត្រូវបង់,តំបន់\n"; 
    currentReportData.forEach(h => { csv += `"${h.custom_id}","${h.customer_name||''}","${h.monthly_fee||0}","${h.payment_month||''}","${h.zone||''}"\n`; });
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `Anamay_Report.csv`; link.click();
}