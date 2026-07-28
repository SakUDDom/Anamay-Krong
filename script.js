// សូមដាក់ URL និង KEY របស់បងនៅទីនេះ
const SUPABASE_URL = "https://vmaujkjhpdpltjhbnntc.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_Mz9T9lEfgxvMfvnL-1I-8g_IiGZwNfP"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let map, pointsGroup, roofsGroup, roadsGroup, bordersGroup, autoZonesGroup; 

let localHouseholdsData = [];
let zoneBordersData = []; 
let roadsData = [];
let currentReportData = []; 
let currentReportZoneFilter = ''; 
let currentUserRole = 'user'; 
let currentUserZone = ''; 
let currentPage = 1;
let itemsPerPage = 10;
let currentSelectedFile = null;

let isZoneColorMode = false;
let currentMapZoneFilter = '';
window.currentDrawMode = ''; 

let canEditRoof = false;
let canEditRoad = false;
let canEditBorder = false;

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

function generateNextCustomId() {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    return 'ID#' + randomCode;
}

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('nav-map')?.addEventListener('click', () => switchView('map'));
  document.getElementById('nav-report')?.addEventListener('click', () => switchView('report'));
  
  const toolsPanel = document.getElementById('custom-tools-panel');
  document.getElementById('open-tools-btn')?.addEventListener('click', () => { toolsPanel.classList.remove('-translate-x-full'); });
  document.getElementById('close-tools-btn')?.addEventListener('click', () => { toolsPanel.classList.add('-translate-x-full'); });

  document.getElementById('btn-add-point')?.addEventListener('click', () => { if(map.pm) { map.pm.disableDraw(); map.pm.enableDraw('Marker', { continueDrawing: false }); } });
  document.getElementById('btn-del-point')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalRemovalMode(); });

  document.getElementById('btn-add-roof')?.addEventListener('click', () => { window.currentDrawMode = 'roof'; if(map.pm) { map.pm.disableDraw(); map.pm.enableDraw('Polygon'); } });
  document.getElementById('btn-edit-roof')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalEditMode(); });
  document.getElementById('btn-cut-roof')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalCutMode(); });
  document.getElementById('btn-rem-roof')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalRemovalMode(); });
  document.getElementById('btn-rot-roof')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalRotateMode(); });

  document.getElementById('btn-add-road')?.addEventListener('click', () => { window.currentDrawMode = 'road'; if(map.pm) { map.pm.disableDraw(); map.pm.enableDraw('Line'); } });
  document.getElementById('btn-edit-road')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalEditMode(); });
  document.getElementById('btn-del-road')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalRemovalMode(); });

  document.getElementById('btn-add-border')?.addEventListener('click', () => { window.currentDrawMode = 'border'; if(map.pm) { map.pm.disableDraw(); map.pm.enableDraw('Polygon'); } });
  document.getElementById('btn-edit-border')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalEditMode(); });
  document.getElementById('btn-cut-border')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalCutMode(); });
  document.getElementById('btn-rem-border')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalRemovalMode(); });
  document.getElementById('btn-rot-border')?.addEventListener('click', () => { if(map.pm) map.pm.toggleGlobalRotateMode(); });

  document.getElementById('toggle-points')?.addEventListener('change', (e) => { e.target.checked ? map.addLayer(pointsGroup) : map.removeLayer(pointsGroup); });
  document.getElementById('toggle-roofs')?.addEventListener('change', (e) => { e.target.checked ? map.addLayer(roofsGroup) : map.removeLayer(roofsGroup); });
  document.getElementById('toggle-roads')?.addEventListener('change', (e) => { e.target.checked ? map.addLayer(roadsGroup) : map.removeLayer(roadsGroup); });
  document.getElementById('toggle-borders')?.addEventListener('change', (e) => { e.target.checked ? map.addLayer(bordersGroup) : map.removeLayer(bordersGroup); });
  document.getElementById('toggle-auto-zones')?.addEventListener('change', (e) => { e.target.checked ? map.addLayer(autoZonesGroup) : map.removeLayer(autoZonesGroup); });

  document.getElementById('map-search-btn')?.addEventListener('click', handleMapSearch);
  document.getElementById('global-zone-select')?.addEventListener('change', (e) => { currentReportZoneFilter = e.target.value; calculateReports(); });
  
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
    const { data: profile } = await supabaseClient.from('Profiles_Access').select('role, zone, can_edit_roof, can_edit_road, can_edit_border').eq('id', session.user.id).maybeSingle();
    
    currentUserRole = (profile?.role || 'user').toLowerCase();
    currentUserZone = profile?.zone || '';

    canEditRoof = currentUserRole === 'super admin' ? true : (profile?.can_edit_roof || false);
    canEditRoad = currentUserRole === 'super admin' ? true : (profile?.can_edit_road || false);
    canEditBorder = currentUserRole === 'super admin' ? true : (profile?.can_edit_border || false);

    const roleBadge = document.getElementById('user-role-badge');
    const reportTableContainer = document.querySelector('.bg-white.rounded-2xl.shadow-sm.border.border-slate-100.overflow-hidden');
    
    document.getElementById('open-tools-btn')?.classList.remove('hidden'); 
    
    document.getElementById('panel-section-roof')?.classList.add('hidden');
    document.getElementById('panel-section-road')?.classList.add('hidden');
    document.getElementById('panel-section-border')?.classList.add('hidden');

    if (canEditRoof) document.getElementById('panel-section-roof')?.classList.remove('hidden');
    if (canEditRoad) document.getElementById('panel-section-road')?.classList.remove('hidden');
    if (canEditBorder) document.getElementById('panel-section-border')?.classList.remove('hidden');

    if (['admin', 'super admin'].includes(currentUserRole)) {
        roleBadge.innerHTML = currentUserRole === 'super admin' ? 'Super Admin 👑' : `Admin`; 
        roleBadge.className = currentUserRole === 'super admin' ? "text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-bold border border-purple-200 shadow-sm" : "text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded-full font-bold border border-rose-200 shadow-sm";
        document.getElementById('global-month-select')?.classList.remove('hidden');
        document.getElementById('global-status-select')?.classList.remove('hidden');
        reportTableContainer?.classList.remove('hidden'); 
        
        if (currentUserRole === 'super admin') { 
            document.getElementById('global-zone-select')?.classList.remove('hidden'); 
        }
    } else {
        roleBadge.innerHTML = `អ្នកប្រមូល៖ ${currentUserZone}`; 
        roleBadge.className = "text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-bold border border-emerald-200";
    }

    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    switchView('map');
    if (!map) initLeafletMap();

    if (map && map.pm) { map.pm.removeControls(); }
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
  
  // 🚀 អាអូនបានដកពាក្យ .addTo(map) ចេញអស់ហើយ! វាមានន័យថាវាអត់បង្ហាញលើផែនទីអូតូទេ ទាល់តែអ្នកប្រើចុចបើកទើបវាចេញ!
  pointsGroup = L.featureGroup();
  roofsGroup = L.featureGroup();
  roadsGroup = L.featureGroup();
  bordersGroup = L.featureGroup();
  autoZonesGroup = L.featureGroup();

  map.on('pm:create', async (e) => {
      if(map.pm) map.pm.disableDraw();
      
      const layer = e.layer;
      const geojson = layer.toGeoJSON();
      const center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();

      if (e.shape === 'Marker') {
          const customId = generateNextCustomId();
          const zone = currentUserZone || '';
          
          const { error } = await supabaseClient.from('households').insert({
              lat: center.lat, lng: center.lng, custom_id: customId, status_color: 'yellow',
              monthly_fee: 10000, zone: zone, payment_month: 'ខែមករា', shape_type: 'point', geojson: geojson
          });
          if (error) alert("⚠️ មិនអាចបញ្ចូលទិន្នន័យបានទេ៖ " + error.message);
          
          fetchAndRenderData();
          
      } else if (e.shape === 'Line' && window.currentDrawMode === 'road') {
          if (!canEditRoad) { map.removeLayer(layer); return; }
          showRoadFormModal(layer, geojson);
          
      } else if (e.shape === 'Polygon') {
          if (window.currentDrawMode === 'roof') {
              if (!canEditRoof) { map.removeLayer(layer); return; }

              const customId = generateNextCustomId();
              const zone = currentUserZone || '';
              
              const { error } = await supabaseClient.from('households').insert({
                  lat: center.lat, lng: center.lng, custom_id: customId, status_color: 'yellow',
                  monthly_fee: 10000, zone: zone, payment_month: 'ខែមករា', shape_type: 'polygon', geojson: geojson
              });
              if (error) alert("⚠️ មិនអាចបញ្ចូលទិន្នន័យបានទេ៖ " + error.message);
              
              fetchAndRenderData();
              
          } else if (window.currentDrawMode === 'border') {
              if (!canEditBorder) { map.removeLayer(layer); return; }

              const zoneName = prompt("សូមបញ្ចូលឈ្មោះតំបន់ (Zone) សម្រាប់ព្រំដែននេះ៖");
              if (!zoneName) { map.removeLayer(layer); return; }
              const { error } = await supabaseClient.from('zone_borders').upsert({ zone: zoneName, geojson: geojson });
              if (error) alert("⚠️ កំហុស៖ " + error.message);
              
              fetchAndRenderData();
          } else {
              map.removeLayer(layer);
          }
      }
      window.currentDrawMode = '';
  });

  map.on('pm:remove', async (e) => {
      const layer = e.layer;
      if(!layer.dbId) return; 
      
      if(layer.dbType === 'road') {
          if (!canEditRoad) { fetchAndRenderData(); return; }
          if(confirm("តើអ្នកប្រាកដជាចង់លុបខ្សែផ្លូវនេះចោលមែនទេ?")) {
              const { error } = await supabaseClient.from('roads').delete().eq('id', layer.dbId);
              if (error) alert("⚠️ កំហុស៖ " + error.message);
          } 
          fetchAndRenderData(); 
      } 
      else if (layer.dbType === 'household') {
          if (confirm(`តើអ្នកពិតជាចង់លុបផ្ទះ ${layer.dbCustomId} រួមទាំងប្រវត្តិបង់ប្រាក់ទាំងអស់របស់គាត់មែនទេ?`)) {
             const { error: err1 } = await supabaseClient.from('payments').delete().eq('household_id', layer.dbId);
             const { error: err2 } = await supabaseClient.from('households').delete().eq('id', layer.dbId);
             if (err1) alert("⚠️ កំហុស (Payments)៖ " + err1.message);
             if (err2) alert("⚠️ កំហុស (Households)៖ " + err2.message);
             closeSidePanel();
          } 
          fetchAndRenderData(); 
      } 
      else if (layer.dbType === 'zone_border') {
          if (!canEditBorder) { fetchAndRenderData(); return; }
          if(confirm("តើអ្នកពិតជាចង់លុបព្រំដែនតំបន់នេះមែនទេ?")) {
              const { error } = await supabaseClient.from('zone_borders').delete().eq('id', layer.dbId);
              if (error) alert("⚠️ កំហុស៖ " + error.message);
          } 
          fetchAndRenderData(); 
      }
  });
}

window.showRoadFormModal = (layer, geojson, existingRoad = null) => {
    window.tempRoadLayer = layer;
    window.tempRoadGeojson = geojson;
    window.editRoadId = existingRoad ? existingRoad.id : null;
    
    const title = existingRoad ? "កែប្រែព័ត៌មានផ្លូវ" : "បន្ថែមផ្លូវថ្មី";
    const nameVal = existingRoad ? (existingRoad.name || "") : "";
    const widthVal = existingRoad ? (existingRoad.width || "") : "";
    const addrVal = existingRoad ? (existingRoad.address || "") : "";
    const typeVal = existingRoad ? (existingRoad.road_type || "Land road") : "Land road";

    const formHtml = `
    <div id="road-modal" class="absolute inset-0 z-[4000] bg-black/60 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform transition-all">
            <h3 class="font-bold text-indigo-800 text-lg mb-4 flex items-center"><i class="fa-solid fa-road mr-2 text-indigo-500"></i>${title}</h3>
            <label class="block text-xs font-bold text-slate-500 mb-1">ឈ្មោះផ្លូវ (Road Name):</label>
            <input type="text" id="road-name" value="${nameVal}" class="w-full border border-slate-300 p-2.5 mb-3 rounded-lg outline-none focus:border-indigo-500 font-bold">
            <label class="block text-xs font-bold text-slate-500 mb-1">ទំហំផ្លូវ (Width e.g. 5m):</label>
            <input type="text" id="road-width" value="${widthVal}" class="w-full border border-slate-300 p-2.5 mb-3 rounded-lg outline-none focus:border-indigo-500 font-bold">
            <label class="block text-xs font-bold text-slate-500 mb-1">អាសយដ្ឋាន (Address):</label>
            <input type="text" id="road-address" value="${addrVal}" class="w-full border border-slate-300 p-2.5 mb-3 rounded-lg outline-none focus:border-indigo-500 font-bold">
            <label class="block text-xs font-bold text-slate-500 mb-1">ប្រភេទផ្លូវ (Road Type):</label>
            <select id="road-type" class="w-full border border-slate-300 p-2.5 mb-5 rounded-lg outline-none focus:border-indigo-500 font-bold bg-slate-50 text-indigo-700">
                <option value="Land road" ${typeVal === 'Land road' ? 'selected' : ''}>Land road (ផ្លូវដី)</option>
                <option value="Concrete road" ${typeVal === 'Concrete road' ? 'selected' : ''}>Concrete road (ផ្លូវបេតុង)</option>
                <option value="Hight Ways road" ${typeVal === 'Hight Ways road' ? 'selected' : ''}>Hight Ways road (ផ្លូវហាយវេ)</option>
                <option value="Asphalt road" ${typeVal === 'Asphalt road' ? 'selected' : ''}>Asphalt road (ផ្លូវកៅស៊ូរ)</option>
                <option value="Nation road" ${typeVal === 'Nation road' ? 'selected' : ''}>Nation road (ផ្លូវជាតិ)</option>
            </select>
            <div class="flex gap-2">
                <button onclick="saveRoadData()" id="save-road-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white flex-1 py-3 rounded-lg font-bold shadow-md transition-colors">រក្សាទុក</button>
                <button onclick="cancelRoadData()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 flex-1 py-3 rounded-lg font-bold transition-colors">បោះបង់</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', formHtml);
};

window.saveRoadData = async () => {
    const name = document.getElementById('road-name').value;
    const width = document.getElementById('road-width').value;
    const address = document.getElementById('road-address').value;
    const type = document.getElementById('road-type').value;
    
    document.getElementById('save-road-btn').innerHTML = 'កំពុងរក្សាទុក...';
    document.getElementById('save-road-btn').disabled = true;

    if (window.editRoadId) {
        await supabaseClient.from('roads').update({
            name: name, width: width, address: address, road_type: type
        }).eq('id', window.editRoadId);
    } else {
        await supabaseClient.from('roads').insert({
            name: name, width: width, address: address, road_type: type, geojson: window.tempRoadGeojson
        });
    }
    
    document.getElementById('road-modal').remove();
    fetchAndRenderData();
};

window.cancelRoadData = () => {
    document.getElementById('road-modal').remove();
    if(window.tempRoadLayer && !window.editRoadId) {
        map.removeLayer(window.tempRoadLayer);
    }
};

async function fetchAndRenderData() {
    try {
        const { data: households, error: hError } = await supabaseClient.from('households')
            .select('id, custom_id, customer_name, lat, lng, zone, status_color, monthly_fee, payment_month, shape_type, geojson');
            
        const { data: borders, error: bError } = await supabaseClient.from('zone_borders').select('*'); 
        const { data: roads, error: rError } = await supabaseClient.from('roads').select('*');
        
        if (hError) alert("⚠️ កំហុស Supabase (Households): " + hError.message);
        
        zoneBordersData = borders || [];
        roadsData = roads || [];

        if (currentUserRole === 'super admin') {
            localHouseholdsData = households || [];
        } else {
            const safeUserZone = (currentUserZone || '').trim().toLowerCase();
            localHouseholdsData = (households || []).filter(h => {
                const safeHouseZone = (h.zone || '').trim().toLowerCase();
                return safeHouseZone === safeUserZone;
            });
        }
        
        renderMapMarkers();
        if(document.getElementById('view-report').style.display === 'block') calculateReports();
    } catch (error) { console.error("កំហុសទូទៅក្នុងការទាញទិន្នន័យ:", error); }
}

function renderMapMarkers() {
  pointsGroup.clearLayers();
  roofsGroup.clearLayers();
  roadsGroup.clearLayers();
  bordersGroup.clearLayers();
  autoZonesGroup.clearLayers();

  let dataToRender = localHouseholdsData;

  const manualZones = [];
  zoneBordersData.forEach(border => {
      if (!border.geojson) return;
      manualZones.push(border.zone);
      
      if (!canEditBorder) return;

      const zColor = getZoneColor(border.zone);
      try {
          const layer = L.geoJSON(border.geojson, {
              style: { color: zColor, weight: 4, fillOpacity: isZoneColorMode ? 0.3 : 0.05, dashArray: '8, 10' }
          }).bindTooltip(`ព្រំដែនតំបន់៖ <b>${border.zone}</b>`, {sticky: true, className: 'font-bold text-sm'});

          layer.eachLayer(l => {
              l.dbId = border.id; l.dbType = 'zone_border'; 
              const savePolygonUpdates = async () => {
                  if (!canEditBorder) return;
                  await supabaseClient.from('zone_borders').update({ geojson: l.toGeoJSON() }).eq('id', border.id);
              };
              l.on('pm:update', savePolygonUpdates);  
              l.on('pm:dragend', savePolygonUpdates); 
              
              l.on('dblclick', async () => {
                  if (!canEditBorder) return;
                  const newZoneName = prompt("កែប្រែឈ្មោះតំបន់ (Zone) សម្រាប់ព្រំដែននេះ៖", border.zone);
                  if (newZoneName && newZoneName.trim() !== "" && newZoneName !== border.zone) {
                      await supabaseClient.from('zone_borders').update({ zone: newZoneName.trim() }).eq('id', border.id);
                      fetchAndRenderData();
                  }
              });
          });
          bordersGroup.addLayer(layer);
      } catch (geoError) {}
  });

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
                  color: zColor, weight: 2, opacity: 0.5, fillColor: zColor, fillOpacity: isZoneColorMode ? 0.15 : 0.02, dashArray: '5, 5'
              }).addTo(autoZonesGroup).bindTooltip(`តំបន់៖ <b>${zone} (Auto)</b>`, {sticky: true, className: 'font-bold text-xs text-slate-500'});
          }
      }
  }

   roadsData.forEach(road => {
      if(!road.geojson) return;
      
      if (!canEditRoad) return;

      let roadColor = '#ec0404'; 
      if(road.road_type === 'Land road') roadColor = '#ec5050';
      if(road.road_type === 'Hight Ways road') roadColor = '#3b82f6';
      if(road.road_type === 'Nation road') roadColor = '#16a34a';
      if(road.road_type === 'Concrete road') roadColor = '#f6d91e';
      if(road.road_type === 'Asphalt road') roadColor = '#e01ae3';

      const rLayer = L.geoJSON(road.geojson, {
          style: { color: roadColor, weight: 6, opacity: 0.9 }
      }).bindTooltip(`<div class="text-center"><b>${road.name || 'មិនមានឈ្មោះផ្លូវ'}</b><br><span class="text-xs text-slate-500">${road.road_type} | ទំហំ: ${road.width || 'មិនបញ្ជាក់'}</span></div>`, {sticky: true, className: 'font-bold'});
      
      rLayer.eachLayer(l => {
          l.dbId = road.id; l.dbType = 'road';
          const saveRoadUpdate = async () => { 
              if (!canEditRoad) return;
              await supabaseClient.from('roads').update({geojson: l.toGeoJSON()}).eq('id', road.id); 
          };
          l.on('pm:update', saveRoadUpdate);
          l.on('pm:dragend', saveRoadUpdate);
          
          l.on('dblclick', () => {
              if(canEditRoad) {
                  showRoadFormModal(l, road.geojson, road);
              }
          });
      });
      roadsGroup.addLayer(rLayer);
  });

  dataToRender.forEach(h => {
    let colorHex = '#f59e0b'; 
    if (isZoneColorMode && currentUserRole === 'super admin') {
        colorHex = getZoneColor(h.zone);
    } else {
        if (h.status_color === 'blue') colorHex = '#2563eb';
        else if (h.status_color === 'red') colorHex = '#dc2626';
        else if (h.status_color === 'black') colorHex = '#020617';
    }

    const handleHouseholdClick = async (e, layer) => {
        if (map.pm && map.pm.globalRemovalModeEnabled()) return; 

        L.DomEvent.stopPropagation(e);
        const btnPanel = document.getElementById('panel-content');
        if(btnPanel) btnPanel.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-indigo-500 font-bold mt-20"><i class="fa-solid fa-spinner fa-spin text-4xl mb-4"></i>កំពុងទាញយកទិន្នន័យ...</div>';
        const p = document.getElementById('side-panel'); p.classList.remove('hidden'); p.classList.add('flex');
        
        const { data: houseDetails } = await supabaseClient.from('households').select('photo_url').eq('id', h.id).single();
        h.photo_url = houseDetails ? houseDetails.photo_url : '';
        showSidePanel(h); 
    };

    if (h.shape_type === 'polygon' && h.geojson) {
        if (!canEditRoof) return;

        const roofLayer = L.geoJSON(h.geojson, {
            style: { color: '#ffffff', weight: 1.5, fillColor: colorHex, fillOpacity: 0.85 }
        }).bindTooltip(`<b>${h.custom_id}</b>`, {permanent: false, direction: 'center', className: 'text-xs font-bold bg-transparent border-none shadow-none text-white outline-none'});
        
        roofLayer.eachLayer(l => {
            l.dbId = h.id; l.dbType = 'household'; l.dbCustomId = h.custom_id;
            l.on('click', (e) => handleHouseholdClick(e, l));
            
            const saveRoofUpdate = async () => {
                if (!canEditRoof) return;
                const center = l.getBounds().getCenter();
                const { error } = await supabaseClient.from('households').update({geojson: l.toGeoJSON(), lat: center.lat, lng: center.lng}).eq('id', h.id);
                if (error) alert("⚠️ កំហុស: " + error.message);
            };
            l.on('pm:update', saveRoofUpdate);
            l.on('pm:dragend', saveRoofUpdate);
        });
        roofsGroup.addLayer(roofLayer);
        
    } else if (h.lat && h.lng) {
        const marker = L.circleMarker([h.lat, h.lng], { 
            radius: (isZoneColorMode && currentUserRole === 'super admin') ? 7 : 9, fillColor: colorHex, color: '#ffffff', weight: 2, fillOpacity: 0.95 
        });
        marker.dbId = h.id; marker.dbType = 'household'; marker.dbCustomId = h.custom_id;
        marker.on('click', (e) => handleHouseholdClick(e, marker));
        
        const savePointUpdate = async () => {
            const { error } = await supabaseClient.from('households').update({lat: marker.getLatLng().lat, lng: marker.getLatLng().lng}).eq('id', h.id);
            if (error) alert("⚠️ កំហុស: " + error.message);
        };
        marker.on('pm:dragend', savePointUpdate);
        
        pointsGroup.addLayer(marker);
    }
  });
}

window.closeSidePanel = () => { 
    const p = document.getElementById('side-panel'); 
    p.classList.add('hidden'); p.classList.remove('flex'); 
    currentSelectedFile = null; 
}

function showSidePanel(h) {
    const months = ['ខែមករា','ខែកកុម្ភៈ','ខែមីនា','ខែមេសា','ខែឧសភា','ខែមិថុនា','ខែកក្កដា','ខែសីហា','ខែកញ្ញា','ខែតុលា','ខែវិច្ឆិកា','ខែធ្នូ'];
    let nextUnpaidMonthIndex = months.indexOf(h.payment_month);
    let nextUnpaidMonthHtml = (nextUnpaidMonthIndex === -1) ? 'គ្មានព័ត៌មាន' : months[nextUnpaidMonthIndex];
    let mOpts = months.map(m => `<option value="${m}" ${h.payment_month === m ? 'selected' : ''}>${m}</option>`).join('');
    let mOptsQuickPay = months.map(m => `<option value="${m}" ${h.payment_month === m ? 'selected' : ''}>បង់ចាប់ពី៖ ${m}</option>`).join('');
    
    let currentStatusHtml = '';
    if (h.status_color === 'blue') {
        currentStatusHtml = `<div class="w-full mt-3 p-3 rounded-xl font-bold bg-emerald-50 text-emerald-700 text-sm border border-emerald-100 flex items-center justify-center gap-2 shadow-sm"><i class="fa-solid fa-check-circle text-lg"></i> បានបង់រួចរាល់ (ខែបន្ទាប់៖ ${nextUnpaidMonthHtml})</div>`;
    } else {
        currentStatusHtml = `<div class="w-full mt-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm border border-amber-100 shadow-sm"><div class="font-bold flex items-center justify-center gap-2 mb-2"><i class="fa-solid fa-clock text-lg"></i> ស្ថានភាពបច្ចុប្បន្ន</div><div class="text-center font-bold text-amber-700">${nextUnpaidMonthHtml} (មិនទាន់បានបង់)</div></div>`;
    }

    let quickPayBtnHtml = '';
    if (h.status_color !== 'blue') {
        quickPayBtnHtml = `<div class="mt-4 p-4 rounded-xl border border-indigo-100 bg-indigo-50 shadow-sm"><label class="block text-sm font-bold text-indigo-700 mb-2">បង់ប្រាក់ (រើសខែ និងចំនួនខែ)៖</label><select id="quick-pay-month" class="w-full mb-3 border border-indigo-200 px-3 py-2 rounded-lg font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-400">${mOptsQuickPay}</select><div class="flex items-center gap-3"><input type="number" id="pay-num-months" value="1" min="1" max="12" class="w-20 border border-indigo-200 px-3 py-2.5 rounded-lg font-bold text-lg text-center outline-none focus:ring-2 focus:ring-amber-400 bg-white shadow-inner"><button onclick="quickPay('${h.id}')" id="quick-pay-btn" class="flex-1 bg-amber-500 text-white font-bold py-3 rounded-lg hover:bg-amber-600 transition-colors shadow-md flex justify-center items-center gap-2 text-base"><i class="fa-solid fa-hand-holding-dollar"></i> បង់ប្រាក់</button></div></div>`;
    }

    let manualEditHtml = '';
    if (['admin', 'super admin'].includes(currentUserRole)) {
        manualEditHtml = `<details class="mt-4 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-sm"><summary class="p-3 font-bold text-slate-700 text-sm cursor-pointer hover:bg-slate-200 outline-none flex items-center gap-2 transition-colors"><i class="fa-solid fa-sliders text-indigo-500"></i> ជម្រើសកែប្រែដោយដៃ (Manual Edit)</summary><div class="p-4 border-t border-slate-200 space-y-3 bg-white"><div><label class="block text-xs font-bold mb-1 text-slate-500">ខែត្រូវបង់បន្ទាប់៖</label><select id="p-month" class="w-full border px-3 py-2 rounded-lg font-bold text-indigo-700 bg-slate-50 outline-none">${mOpts}</select></div><div><label class="block text-xs font-bold mb-1 text-slate-500">ស្ថានភាពបង់ប្រាក់៖</label><select id="p-status" class="w-full border px-3 py-2 rounded-lg bg-slate-50 font-medium outline-none"><option value="blue" ${h.status_color==='blue'?'selected':''}>🔵 បានបង់</option><option value="yellow" ${h.status_color==='yellow'?'selected':''}>🟡 មិនទាន់បានបង់</option><option value="red" ${h.status_color==='red'?'selected':''}>🔴 ទីតាំងបិទ</option><option value="black" ${h.status_color==='black'?'selected':''}>⚫ បានបង់តែទុកសិន</option></select></div></div></details>`;
    } else {
        manualEditHtml = `<div class="hidden"><select id="p-month">${mOpts}</select><select id="p-status"><option value="blue" ${h.status_color==='blue'?'selected':''}>🔵 បានបង់</option><option value="yellow" ${h.status_color==='yellow'?'selected':''}>🟡 មិនទាន់បានបង់</option><option value="red" ${h.status_color==='red'?'selected':''}>🔴 ទីតាំងបិទ</option><option value="black" ${h.status_color==='black'?'selected':''}>⚫ បានបង់តែទុកសិន</option></select></div>`;
    }

    const historyBtnHtml = `<button onclick="showHistory('${h.id}')" class="w-full mt-3 py-3 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-sm flex justify-center items-center gap-2 text-base"><i class="fa-solid fa-clock-rotate-left"></i> មើលប្រវត្តិបង់ប្រាក់</button>`;

    const idInputDisabled = currentUserRole !== 'super admin' ? 'disabled' : '';
    const idInputClass = currentUserRole !== 'super admin' ? 'bg-slate-200 cursor-not-allowed text-slate-500 opacity-70' : 'bg-white';

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
          <div><label class="block text-xs font-bold mb-1">លេខកូដផ្ទះ៖</label><input type="text" id="p-id" value="${h.custom_id||''}" ${idInputDisabled} class="w-full border px-3 py-2 rounded-lg font-bold ${idInputClass}"></div>
          <div><label class="block text-xs font-bold mb-1">ឈ្មោះអតិថិជន៖</label><input type="text" id="p-name" value="${h.customer_name || ''}" class="w-full border px-3 py-2 rounded-lg"></div>
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

    let startMonthIndex = months.indexOf(document.getElementById('quick-pay-month').value);
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

    const { error } = await supabaseClient.from('payments').insert(recordsToInsert);
    if (error) alert("⚠️ កំហុស: " + error.message);
    
    let nextUnpaidMonth = months[(lastPaidMonthIndex + 1) % 12];
    await supabaseClient.from('households').update({ status_color: 'blue', custom_id: customId, customer_name: cusName, monthly_fee: fee, payment_month: nextUnpaidMonth }).eq('id', id);

    fetchAndRenderData();
    const { data: house } = await supabaseClient.from('households').select('*').eq('id', id).single();
    if(house) showSidePanel(house);
}

window.previewImage = (input, id) => {
  const file = input.files[0];
  if (file) {
    currentSelectedFile = file; 
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

window.savePanelData = async (id) => {
    const btn = document.getElementById('save-panel-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> កំពុងរក្សាទុក...';
    btn.disabled = true;

    let finalPhotoUrl = document.getElementById(`p-img-${id}`).src; 
    
    if (currentSelectedFile) {
        const fileExt = currentSelectedFile.name.split('.').pop();
        const fileName = `${id}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('households')
            .upload(fileName, currentSelectedFile, { upsert: true });

        if (!uploadError) {
            const { data } = supabaseClient.storage.from('households').getPublicUrl(fileName);
            finalPhotoUrl = data.publicUrl; 
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
        photo_url: finalPhotoUrl 
    };

    if (['admin', 'super admin'].includes(currentUserRole)) updateData.zone = document.getElementById('p-zone').value;
    
    const { error } = await supabaseClient.from('households').update(updateData).eq('id', id);
    if (error) alert("⚠️ កំហុស: " + error.message);
    
    currentSelectedFile = null; 
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
    const logoSrc = new URL('logo/Map_Ark.png', window.location.href).href; 
    let statusText = rawStatus === 'blue' ? "បានបង់" : (rawStatus === 'red' ? "ទីតាំងបិទ" : (rawStatus === 'black' ? "បានបង់តែទុកសិន" : "មិនទាន់បានបង់"));
    const today = new Date(); const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    const printContent = `<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8"><title>វិក្កយបត្រ - ${customId}</title><style>@import url('https://fonts.googleapis.com/css2?family=Khmer+OS+Battambang&display=swap'); body { font-family: 'Khmer OS Battambang', sans-serif; padding: 20px; color: #000; } .bill-container { max-width: 700px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; border-radius: 10px; } .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; } .logo-box { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; overflow: hidden; } .logo-box img { width: 100%; height: 100%; object-fit: contain; } .header { flex: 1; text-align: center; padding-top: 10px; } .header h1 { font-size: 26px; margin: 0; font-weight: bold; } .header h3 { font-size: 18px; margin: 5px 0 20px 0; font-weight: normal; } .spacer { width: 100px; } .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; line-height: 1.8; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #000; padding: 10px; text-align: center; } .total-row { font-weight: bold; } .status { margin-bottom: 30px; font-weight: bold; } .footer-box { border: 1px solid #000; border-radius: 15px; padding: 15px; display: inline-flex; align-items: center; width: 300px; justify-content: space-around; } .footer-photo { border: 1px solid #000; width: 90px; height: 110px; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: #f8fafc; } .footer-photo img { width: 100%; height: 100%; object-fit: cover; } .footer-photo span { font-size: 12px; color: #666; } @media print { .bill-container { border: none; } }</style></head><body><div class="bill-container"><div class="header-container"><div class="logo-box"><img src="${logoSrc}" alt="Logo" onerror="this.style.display='none';"></div><div class="header"><h1>Maps Ark</h1><h3>វិក្កយបត្រសេវាកម្មប្រមូលសំរាម</h3></div><div class="spacer"></div></div><div class="info-section"><div><div><b>លេខសម្គាល់អតិថិជនៈ</b> ${customId}</div><div><b>ឈ្មោះអតិថិជនៈ</b> ${cusName || 'មិនបញ្ជាក់'}</div></div><div><div><b>លេខវិក្កយបត្រ:</b> ${customId}</div><div><b>អ្នកទទួលប្រាក់:</b> ${currentUserZone}</div><div><b>ថ្ងៃចេញវិក្កយបត្រ:</b> ${dateStr}</div></div></div><table><thead><tr><th>បរិយាយ</th><th>ប្រចាំខែ</th><th>ចំនួនទឹកប្រាក់</th></tr></thead><tbody><tr><td>សេវាកម្មប្រមូលសំរាម</td><td>${month}</td><td>${parseInt(fee).toLocaleString()} ៛</td></tr><tr class="total-row"><td colspan="2" style="text-align: right; padding-right: 20px;">ទឹកប្រាក់ទូទាត់</td><td>${parseInt(fee).toLocaleString()} ៛</td></tr></tbody></table><div class="status">ស្ថានភាពបង់ប្រាក់: ${statusText}</div><div class="footer-box"><div class="footer-photo">${customerImgSrc ? `<img src="${customerImgSrc}" alt="Customer Photo">` : `<span>គ្មានរូបថត</span>`}</div><div><b style="font-size: 18px;">សូមអរគុណ!</b></div></div></div><script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 800); };</script></body></html>`;
    const printWindow = window.open('', '_blank'); printWindow.document.write(printContent); printWindow.document.close();
}

function handleMapSearch() {
  const val = document.getElementById('map-search-input').value.trim().toUpperCase();
  const found = localHouseholdsData.find(h => h.custom_id === val);
  if (found) { map.flyTo([found.lat, found.lng], 19); showSidePanel(found); } else alert(`រកមិនឃើញកូដផ្ទះ "${val}"!`);
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
    link.download = `Maps_Ark_Report.csv`; link.click();
}