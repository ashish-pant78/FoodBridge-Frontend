(function () {
  'use strict';
  const API_BASE = window.FOODBRIDGE_API_BASE || 'http://localhost:5000/api';
  const token = localStorage.getItem('foodbridgeToken');
  const mapEl = document.getElementById('food-map');
  const statusEl = document.getElementById('mapStatus');
  if (!mapEl || typeof L === 'undefined') return;

  const map = L.map('food-map').setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const layers = L.featureGroup().addTo(map);

  function headers() { return token ? { Authorization: 'Bearer ' + token } : {}; }
  function validPoint(lat, lng) { return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)); }
  function addMarker(lat, lng, title, body, kind) {
    if (!validPoint(lat, lng)) return;
    const icon = L.divIcon({ className: '', html: '<div style="width:28px;height:28px;border-radius:50%;background:' + (kind === 'receiver' ? '#7c4dff' : '#2f9e46') + ';border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">' + (kind === 'receiver' ? '❤' : '🍱') + '</div>', iconSize: [28,28], iconAnchor:[14,14] });
    L.marker([Number(lat), Number(lng)], { icon }).addTo(layers).bindPopup('<b>' + title + '</b><br>' + body);
  }

  async function load() {
    if (!token) { statusEl.textContent = 'Please log in to view live FoodBridge locations.'; return; }
    try {
      const role = String((JSON.parse(localStorage.getItem('foodbridgeCurrentUser') || '{}').role || '')).toLowerCase();
      const endpoint = role === 'donor' ? API_BASE + '/donations/my' : API_BASE + '/donations';
      const response = await fetch(endpoint, { headers: headers() });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load donations');
      const donations = data.donations || [];
      let count = 0;
      donations.forEach(function (d) {
        if (!validPoint(d.pickupLatitude, d.pickupLongitude)) return;
        count++;
        addMarker(d.pickupLatitude, d.pickupLongitude, '🍱 ' + (d.foodName || 'Food Donation'), '<b>Location:</b> ' + (d.pickupLocation || 'Saved coordinates') + '<br><b>Status:</b> ' + (d.status || 'available'), 'donor');
      });
      if (count) map.fitBounds(layers.getBounds().pad(0.18));
      statusEl.textContent = count ? count + ' food location(s) loaded from the backend.' : 'No mapped food locations yet. Use “Use Current Location” or enter a real address when posting food.';
    } catch (e) {
      console.error(e);
      statusEl.textContent = 'Could not load live map data. Make sure the backend is running on port 5000.';
    }
  }

  document.getElementById('myLocation')?.addEventListener('click', function () {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (p) { map.setView([p.coords.latitude, p.coords.longitude], 16); L.circleMarker([p.coords.latitude, p.coords.longitude], { radius:8 }).addTo(map).bindPopup('Your current location').openPopup(); });
  });
  load();
})();
