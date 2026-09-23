/*
  FoodBridge - Single shared frontend application
  All pages use this shared frontend application. Backend APIs provide the real account, donation, request and delivery data.
  Local storage is used only for session/UI continuity; backend data remains the source of truth for live workflows.
*/
(function () {
  'use strict';

  // Authentication flow: a fresh visitor starts at Login/Signup.
  // Signup is verified by the backend through email OTP before a session is created.
  (function enforceAuthFlow() {
    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const authPages = ['login.html', 'signup.html'];
    const verificationPage = page === 'verify-otp.html';
    const user = localStorage.getItem('foodbridgeCurrentUser');
    if (!user && !authPages.includes(page) && !verificationPage) {
      window.location.replace('login.html');
      return;
    }
    if (user && authPages.includes(page)) {
      window.location.replace('index.html');
    }
    if (verificationPage && !localStorage.getItem('foodbridgePendingSignupEmail')) {
      window.location.replace('signup.html');
    }
  })();

  const KEYS = {
    foods: 'foodbridgeAvailableFood',
    donations: 'foodbridgeDonations',
    notifications: 'foodbridgeNotifications',
    savedFoods: 'foodbridgeSavedFoods',
    unread: 'foodbridgeUnreadCount',
    user: 'foodbridgeCurrentUser',
    users: 'foodbridgeUsers',
    newsletter: 'foodbridgeNewsletter',
    messageReads: 'foodbridgeMessageReads',
    deletedDemoFoods: 'foodbridgeDeletedDemoFoods'
  };

  const DEMO_NOTIFICATIONS = [];

  const ROLE_INFO = {
    Restaurant: {
      icon: 'fa-shop',
      title: 'Restaurant Partner',
      text: 'Post surplus meals, manage donations, coordinate NGO pickups and track your food-waste impact.',
      dashboardRole: 'Restaurant',
      name: 'Riya Sharma',
      initials: 'RS'
    },
    NGO: {
      icon: 'fa-hands-holding-child',
      title: 'NGO Partner',
      text: 'Discover nearby food donations, request suitable meals, coordinate pickups and help families in need.',
      dashboardRole: 'NGO',
      name: 'Asha Foundation',
      initials: 'AF'
    },
    Volunteer: {
      icon: 'fa-user',
      title: 'Volunteer',
      text: 'Help collect and deliver surplus food, manage assigned pickups and contribute to community impact.',
      dashboardRole: 'Volunteer',
      name: 'Aman Verma',
      initials: 'AV'
    },
    Admin: {
      icon: 'fa-shield-halved',
      title: 'Administrator',
      text: 'Monitor platform activity, verify users, manage reports and keep the FoodBridge community safe.',
      dashboardRole: 'Admin',
      name: 'FoodBridge Admin',
      initials: 'FB'
    }
  };


  // Public/demo food catalogue used everywhere a user can browse available food.
  // User-posted donations are merged with these items so every food card remains functional.
  const DEMO_FOODS = [];

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function go(page) {
    window.location.href = page;
  }

  function toast(message) {
    let el = document.getElementById('foodBridgeToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'foodBridgeToast';
      el.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:99999;background:#173b25;color:#fff;padding:13px 18px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);font:600 13px Inter,Arial,sans-serif;opacity:0;transform:translateY(10px);transition:.22s;max-width:360px;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
    }, 2600);
  }

  function formatDate(value) {
    if (!value) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeRange(from, until) {
    if (!from && !until) return 'Pickup time not specified';
    return (from || '--') + ' - ' + (until || '--');
  }

  function getFoods() { return read(KEYS.foods, []); }
  function saveFoods(foods) { write(KEYS.foods, foods); }
  function getAllAvailableFoods() { return getFoods(); }

  function deleteDemoFood(id) {
    const item = DEMO_FOODS.find(function(f){ return f.id === id; });
    if (!item) return;
    if (!window.confirm('Delete "' + item.name + '" from Available Food?')) return;
    const deleted = read(KEYS.deletedDemoFoods, []);
    if (deleted.indexOf(id) === -1) deleted.push(id);
    write(KEYS.deletedDemoFoods, deleted);
    toast('Food item deleted.');
    renderPostedFoods();
    setupStaticPublicFood();
    refreshStaticFoodCards();
  }

  function deleteAvailableFood(id, name) {
    const posted = getFoods().find(function(f){ return f.id === id || (name && String(f.name).toLowerCase() === String(name).toLowerCase()); });
    if (posted) { deleteFood(posted.id); return; }
    const demo = DEMO_FOODS.find(function(f){ return f.id === id || (name && f.name.toLowerCase() === String(name).toLowerCase()); });
    if (demo) deleteDemoFood(demo.id);
  }
  function getDonations() { return read(KEYS.donations, []); }
  function saveDonations(items) { write(KEYS.donations, items); }

  // ===== BACKEND DATA SYNC (Step 2) =====
  const API_BASE = window.FOODBRIDGE_API_BASE || 'https://foodbridge-backend-udfx.onrender.com/api';
  function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const token = localStorage.getItem('foodbridgeToken');
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  // Free OpenStreetMap/Nominatim location helpers. No Google Maps key is required.
  async function geocodeAddress(address) {
    const text = String(address || '').trim();
    if (!text) return null;
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=' + encodeURIComponent(text);
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error('Location search failed');
    const rows = await response.json();
    if (!rows.length) return null;
    return { latitude: Number(rows[0].lat), longitude: Number(rows[0].lon), displayName: rows[0].display_name || text };
  }

  async function reverseGeocode(latitude, longitude) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + encodeURIComponent(latitude) + '&lon=' + encodeURIComponent(longitude);
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error('Address lookup failed');
    const row = await response.json();
    return row.display_name || '';
  }

  function getCurrentLocation() {
    return new Promise(function(resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by this browser.'));
      navigator.geolocation.getCurrentPosition(
        function(pos) { resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
        function(err) { reject(new Error(err.code === 1 ? 'Location permission was denied.' : 'Unable to get your current location.')); },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  function setLocationButtonState(button, text) {
    if (button) { button.disabled = false; button.innerHTML = '<i class=\"fa-solid fa-location-crosshairs\"></i> ' + escapeHtml(text); }
  }

  async function useCurrentLocationForFields(button, addressInput, latInput, lngInput) {
    try {
      if (button) { button.disabled = true; button.innerHTML = '<i class=\"fa-solid fa-spinner fa-spin\"></i> Locating...'; }
      const pos = await getCurrentLocation();
      if (latInput) latInput.value = pos.latitude;
      if (lngInput) lngInput.value = pos.longitude;
      if (addressInput) {
        try { addressInput.value = await reverseGeocode(pos.latitude, pos.longitude); } catch (_) {}
      }
      setLocationButtonState(button, 'Location Added');
      toast('Current location added successfully.');
    } catch (error) {
      setLocationButtonState(button, 'Use Current Location');
      toast(error.message || 'Unable to get your location.');
    }
  }

  function mapBackendDonation(donation) {
    const donor = donation && donation.donor && typeof donation.donor === 'object' ? donation.donor : {};
    const type = donation.foodType === 'non-veg' ? 'Non-Vegetarian' : (donation.foodType || 'veg');
    return {
      id: donation._id,
      name: donation.foodName,
      type: type,
      category: inferCategory(donation.foodName),
      quantity: String(donation.quantity || ''),
      servings: String(donation.quantity || '') + ' ' + String(donation.quantityUnit || 'meals'),
      donor: donor.name || 'FoodBridge Partner',
      donorRole: 'Restaurant',
      address: donation.pickupLocation || '',
      latitude: donation.pickupLatitude,
      longitude: donation.pickupLongitude,
      preparedDate: donation.preparedAt,
      bestBefore: donation.expiryAt,
      description: donation.description || '',
      image: donation.imageData || '',
      createdAt: donation.createdAt ? new Date(donation.createdAt).getTime() : Date.now(),
      status: donation.status || 'available',
      time: donation.expiryAt ? 'Available until ' + formatDate(donation.expiryAt) : 'Available',
      left: donation.status === 'available' ? 'Available' : String(donation.status || '')
    };
  }

  async function syncBackendFoodData() {
    const token = localStorage.getItem('foodbridgeToken');
    if (!token) return;
    const rawUser = read(KEYS.user, null) || {};
    const role = String(rawUser.role || '').toLowerCase();
    const endpoint = role === 'donor' ? API_BASE + '/donations/my' : API_BASE + '/donations';
    try {
      const response = await fetch(endpoint, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok || !data.success) {
        console.error('Food sync error:', data);
        return;
      }
      const donations = Array.isArray(data.donations) ? data.donations.map(mapBackendDonation) : [];
      saveFoods(donations);
      saveDonations(donations);
      renderPostedFoods();
      renderMyDonations();
      setupStaticPublicFood();
      refreshStaticFoodCards();
      if (typeof renderListForRequestPage === 'function') renderListForRequestPage();
    } catch (error) {
      console.error('Food backend connection error:', error);
    }
  }

  async function syncMyRequests() {
    const token = localStorage.getItem('foodbridgeToken');
    if (!token) return;
    const list = document.getElementById('requestList');
    if (!list) return;
    const role = String((read(KEYS.user, null) || {}).role || '').toLowerCase();
    if (role !== 'ngo' && role !== 'receiver') return;
    try {
      const response = await fetch(API_BASE + '/requests/my', { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok || !data.success) return;
      list.innerHTML = '';
      if (!data.requests || !data.requests.length) {
        list.innerHTML = '<div id="noRequests" class="request-empty"><b>No requests found</b><span>You have not requested any food donations yet.</span></div>';
        return;
      }
      data.requests.forEach(function(request) {
        const donation = request.donation || {};
        const donor = donation.donor || {};
        const status = request.status || 'pending';
        const card = document.createElement('div');
        card.className = 'request-card';
        card.dataset.status = status;
        card.dataset.requestId = request._id;
        card.innerHTML = '<div class="request-avatar">' + escapeHtml((donor.name || 'FB').substring(0,2).toUpperCase()) + '</div>' +
          '<div class="request-info"><div class="request-title"><h3>' + escapeHtml(donor.name || 'FoodBridge Partner') + '</h3><span class="request-status ' + escapeHtml(status) + '">' + escapeHtml(status.charAt(0).toUpperCase()+status.slice(1)) + '</span></div>' +
          '<p class="requested-food"><i class="fa-solid fa-utensils"></i> ' + escapeHtml(donation.foodName || 'Food Donation') + '</p>' +
          '<p><i class="fa-solid fa-box"></i> Requested ' + escapeHtml(request.requestedQuantity || '') + ' ' + escapeHtml(donation.quantityUnit || 'meals') + '</p>' +
          '<p><i class="fa-solid fa-location-dot"></i> ' + escapeHtml(donation.pickupLocation || 'Pickup location not specified') + '</p>' +
          (status === 'pending' || status === 'approved' ? '<div class="request-actions"><button onclick="cancelMyRequest(this)">Cancel</button></div>' : '') + '</div>';
        list.appendChild(card);
      });
    } catch (error) { console.error('My requests sync error:', error); }
  }

  async function cancelMyRequest(el) {
    const card = el && el.closest('.request-card');
    const id = card && card.dataset.requestId;
    const token = localStorage.getItem('foodbridgeToken');
    if (!id || !token) return;
    try {
      const response = await fetch(API_BASE + '/requests/' + id + '/cancel', { method:'PATCH', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok || !data.success) { toast(data.message || 'Unable to cancel request.'); return; }
      toast('Request cancelled.');
      await syncMyRequests();
    } catch (_) { toast('Unable to connect to the backend.'); }
  }

  function getNotifications() {
    let items = read(KEYS.notifications, null);
    if (!Array.isArray(items)) {
      items = [];
      write(KEYS.notifications, items);
    }
    return items;
  }

  function saveNotifications(items) {
  write(KEYS.notifications, items);
  updateNotificationBadge();
}

async function loadBackendNotifications() {
    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        return;
    }

    try {
        const response = await fetch(
            API_BASE + '/notifications',
            {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Notification Fetch Error:', data);
            return;
        }

        const notifications = data.notifications.map(function (n) {
            return {
                id: n._id,
                title: n.title,
                message: n.message,
                time: new Date(n.createdAt).toLocaleString(),
                unread: !n.isRead
            };
        });

        saveNotifications(notifications);
        renderNotifications();

    } catch (error) {
        console.error('Notification Fetch Error:', error);
    }
}

  function unreadCount() {
    return getNotifications().filter(function (n) { return n.unread; }).length;
  }

  function updateNotificationBadge() {
    const count = unreadCount();
    localStorage.setItem(KEYS.unread, String(count));
    document.querySelectorAll('.bell-dot,.notification-count,.notification-badge,.notify-count,#notificationCount').forEach(function (badge) {
      badge.textContent = count ? String(count) : '';
      badge.style.display = count ? 'flex' : 'none';
    });
    const total = document.getElementById('totalCount');
    const unread = document.getElementById('unreadCount');
    if (total) total.textContent = getNotifications().length;
    if (unread) unread.textContent = count;
  }

  function addNotification(title, message) {
    const items = getNotifications();
    items.unshift({ id: uid('note'), title: title, message: message, time: 'Just now', unread: true });
    saveNotifications(items);
  }

  function selectedRole(container) {
    const active = (container || document).querySelector('.role-opt.active');
    if (!active) return 'Restaurant';
    return (active.textContent || '').replace(/\s+/g, ' ').trim().split(' ')[0] || 'Restaurant';
  }

  function renderPublicAuthNav() {
    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const user = read(KEYS.user, null);
    const isAuthPage = page === 'login.html' || page === 'signup.html';
    if (isAuthPage) {
      // Auth screens intentionally show ONLY the Login / Sign Up actions.
      // Do not render the logged-in profile here, even if an old session exists.
      document.querySelectorAll('.navbar .nav-links, .navbar .hamburger, .navbar .nav-right > .icon-btn').forEach(function(el){ el.style.display='none'; });
      document.querySelectorAll('.navbar .nav-right').forEach(function(nav) {
        const loginBtn = Array.from(nav.querySelectorAll('button')).find(function(btn){ return /login/i.test(btn.textContent || '') && !/sign up/i.test(btn.textContent || ''); });
        const signupBtn = Array.from(nav.querySelectorAll('button')).find(function(btn){ return /sign up/i.test(btn.textContent || ''); });
        if (loginBtn) loginBtn.style.display = '';
        if (signupBtn) signupBtn.style.display = '';
        const profile = nav.querySelector('.public-profile-wrap');
        if (profile) profile.remove();
      });
      return;
    }
    document.querySelectorAll('.navbar .nav-right').forEach(function(nav) {
      if (!nav) return;
      const loginBtn = Array.from(nav.querySelectorAll('button')).find(function(btn){ return /login/i.test(btn.textContent || '') && !/sign up/i.test(btn.textContent || ''); });
      const signupBtn = Array.from(nav.querySelectorAll('button')).find(function(btn){ return /sign up/i.test(btn.textContent || ''); });
      if (!user) {
        if (nav.querySelector('.public-profile-wrap')) nav.querySelector('.public-profile-wrap').remove();
        if (loginBtn) loginBtn.style.display = '';
        if (signupBtn) signupBtn.style.display = '';
        return;
      }

      if (loginBtn) loginBtn.style.display = 'none';
      if (signupBtn) signupBtn.style.display = 'none';

      let wrap = nav.querySelector('.public-profile-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'public-profile-wrap';
        wrap.style.cssText = 'position:relative;display:flex;align-items:center;';
        nav.insertBefore(wrap, nav.querySelector('.hamburger') || null);
      }
      const name = user.name || 'FoodBridge User';
      const role = user.role || 'User';
      const initials = user.initials || name.split(/\s+/).slice(0,2).map(function(x){return x[0];}).join('').toUpperCase();
      wrap.innerHTML = '<button type="button" class="public-profile-btn" aria-expanded="false"><span class="public-profile-avatar">' + escapeHtml(initials) + '</span><span class="public-profile-text"><b>' + escapeHtml(name) + '</b><small>' + escapeHtml(role) + '</small></span><i class="fa-solid fa-chevron-down"></i></button>' +
        '<div class="public-profile-menu" style="display:none;position:absolute;right:0;top:calc(100% + 10px);z-index:10000;min-width:210px;background:var(--card,#fff);border:1px solid var(--border);border-radius:14px;box-shadow:0 16px 35px rgba(0,0,0,.14);padding:8px;">' +
        '<div style="padding:10px 11px 9px;border-bottom:1px solid var(--border);margin-bottom:6px;"><strong style="display:block;font-size:13px;">' + escapeHtml(name) + '</strong><span style="display:block;margin-top:2px;font-size:11px;color:var(--text-soft);">Logged in as ' + escapeHtml(role) + '</span></div>' +
        '<button type="button" class="public-menu-item" data-profile-action="dashboard"><i class="fa-solid fa-gauge-high"></i><span>Dashboard</span></button>' +
        '<button type="button" class="public-menu-item logout" data-profile-action="logout"><i class="fa-solid fa-right-from-bracket"></i><span>Log Out</span></button>' +
        '</div>';

      const btn = wrap.querySelector('.public-profile-btn');
      const menu = wrap.querySelector('.public-profile-menu');
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        const open = menu.style.display === 'block';
        document.querySelectorAll('.public-profile-menu').forEach(function(m){m.style.display='none';});
        menu.style.display = open ? 'none' : 'block';
        btn.setAttribute('aria-expanded', String(!open));
      });
      wrap.querySelector('[data-profile-action="dashboard"]').addEventListener('click', function(){ go('dashboard.html'); });
      wrap.querySelector('[data-profile-action="logout"]').addEventListener('click', function(){ logoutAccount(); });
    });
    if (!window._foodBridgeProfileOutsideClick) {
      window._foodBridgeProfileOutsideClick = true;
      document.addEventListener('click', function(){ document.querySelectorAll('.public-profile-menu').forEach(function(m){m.style.display='none';}); });
    }
  }

  function applyUserProfile() {
    const user = read(KEYS.user, null);
    if (!user) return;
    const info = ROLE_INFO[user.role] || ROLE_INFO.Restaurant;
    const displayName = user.name || info.name;
    const displayRole = user.role || info.dashboardRole;
    const initials = user.initials || displayName.split(/\s+/).slice(0, 2).map(function(x){ return x[0]; }).join('').toUpperCase() || info.initials;

    document.querySelectorAll('.dash-profile').forEach(function (profile) {
      const b = profile.querySelector('b');
      const span = profile.querySelector('span');
      const avatar = profile.querySelector('.dash-avatar');
      if (b) b.textContent = displayName;
      if (span) span.textContent = displayRole;
      if (avatar) avatar.textContent = initials;
    });

    const welcome = document.querySelector('.dash-hero span');
    if (welcome && /Welcome back/i.test(welcome.textContent)) {
      welcome.textContent = 'Welcome back, ' + displayName + '! 👋';
    }

    // Keep Settings/Profile information synced with the currently logged-in user.
    const fullName = document.getElementById('fullName');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const address = document.getElementById('address');
    const organization = document.getElementById('restaurant');
    const profileAvatar = document.getElementById('profileAvatar');
    const profileHeading = document.querySelector('#profile .profile-top h4');
    const profileRole = document.querySelector('#profile .profile-top p');
    if (fullName) fullName.value = displayName;
    if (email && user.email) email.value = user.email;
    if (phone && user.phone) phone.value = user.phone;
    if (address && user.address) address.value = user.address;
    if (organization && user.organization) organization.value = user.organization;
    if (profileAvatar) profileAvatar.textContent = initials;
    if (profileHeading) profileHeading.textContent = displayName;
    if (profileRole) profileRole.textContent = displayRole + ' Account';
  }

  function selectRole(el) {
    if (!el || !el.parentElement) return;
    el.parentElement.querySelectorAll('.role-opt').forEach(function (o) { o.classList.remove('active'); });
    el.classList.add('active');
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const role = ['Restaurant', 'NGO', 'Volunteer', 'Admin'].find(function (r) { return text.indexOf(r) !== -1; }) || 'Restaurant';
    localStorage.setItem('foodbridgeSelectedRole', role);
    updateRoleDetails(role);
  }

  function updateRoleDetails(role) {
    const info = ROLE_INFO[role] || ROLE_INFO.Restaurant;
    const grid = document.querySelector('.role-grid');
    if (!grid) return;
    let box = document.getElementById('roleDetails');
    if (!box) {
      box = document.createElement('div');
      box.id = 'roleDetails';
      box.style.cssText = 'margin:12px 0 16px;padding:11px 13px;border:1px solid var(--border);border-radius:10px;background:var(--bg-light,#f7faf7);display:flex;gap:10px;align-items:flex-start;';
      grid.insertAdjacentElement('afterend', box);
    }
    box.innerHTML = '<i class="fa-solid ' + info.icon + '" style="color:var(--green);margin-top:2px;"></i><div><strong style="font-size:12.5px;display:block;margin-bottom:2px;">' + escapeHtml(info.title) + '</strong><span style="font-size:11.5px;color:var(--text-soft);line-height:1.5;display:block;">' + escapeHtml(info.text) + '</span></div>';
    renderRoleFields(role);
    updateSignupBaseLabels(role);
  }

  function toggleMobileNav() {
    const el = document.getElementById('mobileNav');
    if (el) el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
  }

  function toggleTheme() {
    document.body.classList.toggle('dark-preview');
    localStorage.setItem('foodbridgeDarkMode', document.body.classList.contains('dark-preview') ? '1' : '0');
  }

  function handleNewsletterSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const box = e && e.target ? e.target.closest('.footer-newsletter') || e.target.parentElement : null;
    const input = box ? box.querySelector('input') : document.querySelector('.footer-newsletter input');
    const email = input ? input.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Please enter a valid email address.');
      return false;
    }
    const emails = read(KEYS.newsletter, []);
    if (emails.indexOf(email) === -1) emails.push(email);
    write(KEYS.newsletter, emails);
    if (input) input.value = '';
    toast('Successfully subscribed to FoodBridge updates!');
    return false;
  }

  function handleContactSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.target) e.target.reset();
    toast('Message sent! Our support team will contact you soon.');
    return false;
  }

  const ROLE_FIELDS = {
    Restaurant: [
      { id:'roleOrgName', label:'Restaurant Name', placeholder:'Enter restaurant name', icon:'fa-shop', required:true },
      { id:'roleBusinessType', label:'Business Type', placeholder:'e.g. Restaurant, Cafe, Hotel', icon:'fa-utensils', required:true },
      { id:'roleLocation', label:'Restaurant Location', placeholder:'City / Area', icon:'fa-location-dot', required:true }
    ],
    NGO: [
      { id:'roleOrgName', label:'NGO / Organization Name', placeholder:'Enter NGO name', icon:'fa-hands-holding-child', required:true },
      { id:'roleRegistration', label:'NGO Registration Number', placeholder:'Enter registration number', icon:'fa-id-card', required:true },
      { id:'roleServiceArea', label:'Service Area', placeholder:'City / Area you serve', icon:'fa-location-dot', required:true }
    ],
    Volunteer: [
      { id:'roleVolunteerArea', label:'Preferred Service Area', placeholder:'City / Area', icon:'fa-location-dot', required:true },
      { id:'roleAvailability', label:'Availability', placeholder:'e.g. Weekends / Evenings', icon:'fa-clock', required:true },
      { id:'roleVolunteerSkill', label:'Volunteer Skill', placeholder:'e.g. Delivery, Pickup, Event Support', icon:'fa-hand-holding-heart', required:true }
    ],
    Admin: [
      { id:'roleAdminId', label:'Admin ID', placeholder:'Enter admin ID', icon:'fa-id-badge', required:true },
      { id:'roleDepartment', label:'Department', placeholder:'e.g. Operations, Verification', icon:'fa-building', required:true },
      { id:'roleAccessCode', label:'Access Code', placeholder:'Enter access code', icon:'fa-key', required:true }
    ]
  };

  function renderRoleFields(role) {
    const info = ROLE_FIELDS[role] || ROLE_FIELDS.Restaurant;
    ['roleDetails','roleFields'].forEach(function(id){ const old=document.getElementById(id); if(id==='roleFields' && old) old.remove(); });
    const grid = document.querySelector('.role-grid');
    if (!grid) return;
    const box=document.createElement('div');
    box.id='roleFields';
    box.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 16px;';
    const isLogin=!!document.querySelector('form[onsubmit*="handleLoginSubmit"]');
    // Login only needs the registered email/password. Role-specific registration
    // details are collected and saved during signup and restored automatically.
    if (isLogin) return;
    info.forEach(function(f){
      const wrap=document.createElement('div');
      wrap.className='field';
      const locationField = /Location|Area/.test(f.label);
      wrap.innerHTML='<label>'+escapeHtml(f.label)+'</label><div class="input-wrap"><i class="fa-solid '+f.icon+'"></i><input id="'+f.id+'" name="'+f.id+'" placeholder="'+escapeHtml(f.placeholder)+'" '+(f.required?'required':'')+'></div>' + (locationField ? '<div style=\"display:flex;gap:8px;margin-top:7px;\"><button type=\"button\" class=\"btn btn-outline btn-sm role-current-location\"><i class=\"fa-solid fa-location-crosshairs\"></i> Use Current Location</button><span style=\"font-size:10px;color:var(--text-soft);align-self:center;\">or enter address/area</span></div><input type=\"hidden\" id=\"'+f.id+'Latitude\"><input type=\"hidden\" id=\"'+f.id+'Longitude\">' : '');
      box.appendChild(wrap);
      if (locationField) {
        const btn = wrap.querySelector('.role-current-location');
        const input = wrap.querySelector('#'+f.id);
        const lat = wrap.querySelector('#'+f.id+'Latitude');
        const lng = wrap.querySelector('#'+f.id+'Longitude');
        btn.addEventListener('click', function(){ useCurrentLocationForFields(btn, input, lat, lng); });
        input.addEventListener('input', function(){ lat.value=''; lng.value=''; });
      }
    });
    grid.insertAdjacentElement('afterend',box);
    if (isLogin) {
      box.style.gridTemplateColumns='1fr 1fr';
    }
  }

  function updateSignupBaseLabels(role) {
    const form=document.querySelector('form[onsubmit*="handleSignupSubmit"]'); if(!form)return;
    const label=form.querySelector('.field-row .field label');
    if(label) label.textContent=role==='Restaurant'?'Owner / Manager Name':role==='NGO'?'Contact Person Name':role==='Volunteer'?'Full Name':'Administrator Name';
  }

  function collectRoleFields(validate) {
    const role=localStorage.getItem('foodbridgeSelectedRole') || 'Restaurant';
    const data={}; let valid=true;
    (ROLE_FIELDS[role] || []).forEach(function(f){
      const el=document.getElementById(f.id);
      if(el){ data[f.id]=el.value.trim(); if(validate && f.required && !data[f.id]){el.style.borderColor='#e05252'; valid=false;} else {el.style.borderColor='';} }
    });
    if(validate && !valid) toast('Please fill all '+role+' details.');
    return validate ? {data:data,valid:valid} : data;
  }

  async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const form = e && e.target ? e.target : document.querySelector('form');

  const role = localStorage.getItem('foodbridgeSelectedRole') || 'Restaurant';

  const roleMap = {
    Restaurant: 'donor',
    NGO: 'receiver',
    Volunteer: 'volunteer',
    Admin: 'admin'
  };

  const backendRole = roleMap[role];

  const emailInput = form ? form.querySelector('input[type="email"]') : null;
  const passwordInput = form ? form.querySelector('input[placeholder="Enter your password"]') : null;

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email) {
    toast('Please enter your email address.');
    return false;
  }

  if (!password) {
    toast('Please enter your password.');
    return false;
  }

  try {
    const response = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      toast(data.message || 'Login failed.');
      return false;
    }

    if (data.user.role !== backendRole) {
      toast('This account does not match the selected role.');
      return false;
    }

    localStorage.setItem('foodbridgeToken', data.token);
    localStorage.setItem('foodbridgeCurrentUser', JSON.stringify(data.user));

    write(KEYS.user, data.user);

    addNotification(
      'Welcome back',
      'You logged in as ' + role + '.'
    );

    const destinationByRole = {
      donor: 'dashboard.html',
      receiver: 'dashboard.html',
      volunteer: 'dashboard.html',
      admin: 'admin-dashboard.html'
    };
    go(destinationByRole[backendRole] || 'index.html');

  } catch (error) {
    console.error('Login Error:', error);
    toast('Cannot connect to FoodBridge server.');
  }

  return false;
}
  async function handleSignupSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const form = e && e.target ? e.target : document.querySelector('form');
    const role = localStorage.getItem('foodbridgeSelectedRole') || 'Restaurant';
    const roleMap = { Restaurant: 'donor', NGO: 'receiver', Volunteer: 'volunteer' };
    const backendRole = roleMap[role];

    if (!backendRole) {
      toast('Admin accounts cannot be created from public signup.');
      return false;
    }

    const inputs = form ? Array.from(form.querySelectorAll('input')) : [];
    const fullName = inputs.find(function (i) {
      return i.type !== 'checkbox' && i.type !== 'email' && i.type !== 'password' && i.type !== 'tel';
    });
    const emailInput = form ? form.querySelector('input[type="email"]') : null;
    const phoneInput = form ? form.querySelector('input[type="tel"]') : null;
    const passwords = form ? form.querySelectorAll('input[type="password"]') : [];

    const name = fullName ? fullName.value.trim() : '';
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const password = passwords.length ? passwords[0].value : '';

    if (!name || !email || !password) {
      toast('Please fill all required fields.');
      return false;
    }
    if (password.length < 6) {
      toast('Password must be at least 6 characters.');
      return false;
    }
    if (passwords.length >= 2 && passwords[0].value !== passwords[1].value) {
      toast('Passwords do not match.');
      return false;
    }

    const roleResult = collectRoleFields(true);
    if (!roleResult.valid) return false;
    const roleData = roleResult.data;

    const locationText = roleData.roleLocation || roleData.roleServiceArea || roleData.roleVolunteerArea || '';
    let locationCoordinates = null;
    const coordField = role === 'Restaurant' ? 'roleLocation' : (role === 'NGO' ? 'roleServiceArea' : 'roleVolunteerArea');
    const latEl = document.getElementById(coordField + 'Latitude');
    const lngEl = document.getElementById(coordField + 'Longitude');
    if (latEl && lngEl && latEl.value && lngEl.value) {
      locationCoordinates = { latitude: Number(latEl.value), longitude: Number(lngEl.value) };
    } else if (locationText) {
      try {
        locationCoordinates = await geocodeAddress(locationText);
        if (!locationCoordinates) toast('Location could not be mapped; you can still continue with the typed address.');
      } catch (_) {
        // Signup should not fail just because the free geocoder is unavailable.
      }
    }

    const payload = {
      name, email, password, phone, role: backendRole,
      organization: roleData.roleOrgName || '',
      businessType: roleData.roleBusinessType || '',
      location: locationText,
      latitude: locationCoordinates ? locationCoordinates.latitude : null,
      longitude: locationCoordinates ? locationCoordinates.longitude : null,
      registrationNumber: roleData.roleRegistration || '',
      serviceArea: roleData.roleServiceArea || roleData.roleVolunteerArea || '',
      availability: roleData.roleAvailability || '',
      volunteerSkill: roleData.roleVolunteerSkill || ''
    };

    try {
      const response = await fetch(API_BASE + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.success) {
        toast(data.message || 'Signup failed.');
        return false;
      }

      localStorage.setItem('foodbridgePendingSignupEmail', data.email || email);
      localStorage.setItem('foodbridgePendingSignupRole', role);
      toast('OTP sent to ' + (data.email || email));
      window.location.href = 'verify-otp.html';
    } catch (error) {
      console.error('Signup Error:', error);
      toast('Cannot connect to FoodBridge server.');
    }

    return false;
  }

  async function verifySignupOTP(e) {
    if (e && e.preventDefault) e.preventDefault();

    const email = localStorage.getItem('foodbridgePendingSignupEmail');
    const otpInput = document.getElementById('signupOtp');
    const otp = otpInput ? otpInput.value.trim() : '';

    if (!email) {
      window.location.href = 'signup.html';
      return false;
    }
    if (!/^\d{6}$/.test(otp)) {
      toast('Enter the 6-digit OTP.');
      return false;
    }

    try {
      const response = await fetch(API_BASE + '/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = await response.json().catch(function () { return {}; });

      if (!response.ok || !data.success) {
        toast(data.message || 'OTP verification failed.');
        return false;
      }

      localStorage.setItem('foodbridgeToken', data.token);
      localStorage.setItem('foodbridgeCurrentUser', JSON.stringify(data.user));
      write(KEYS.user, data.user);
      localStorage.removeItem('foodbridgePendingSignupEmail');
      localStorage.removeItem('foodbridgePendingSignupRole');
      addNotification('Account Verified', 'Your FoodBridge account is verified successfully.');
      window.location.href = 'index.html';
    } catch (error) {
      console.error('OTP Verification Error:', error);
      toast('Cannot connect to FoodBridge server.');
    }
    return false;
  }

  async function resendSignupOTP(e) {
    if (e && e.preventDefault) e.preventDefault();
    const email = localStorage.getItem('foodbridgePendingSignupEmail');
    if (!email) {
      window.location.href = 'signup.html';
      return false;
    }

    try {
      const response = await fetch(API_BASE + '/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json().catch(function () { return {}; });
      toast(data.message || (response.ok ? 'OTP sent again.' : 'Unable to resend OTP.'));
    } catch (error) {
      console.error('Resend OTP Error:', error);
      toast('Cannot connect to FoodBridge server.');
    }
    return false;
  }

  function foodFromCard(card) {
    if (!card) return null;
    const id = card.dataset.foodId || '';
    const name = card.dataset.name || (card.querySelector('h3,h4') ? card.querySelector('h3,h4').textContent.trim() : 'Food Item');
    const existing = getAllAvailableFoods().find(function(f){ return (id && f.id === id) || String(f.name).trim().toLowerCase() === name.trim().toLowerCase(); });
    if (existing) return existing;
    const img = card.querySelector('img');
    const meta = card.querySelector('.meta');
    const timeEl = card.querySelector('.food-time');
    const servingsEl = card.querySelector('.servings');
    const donorEl = card.querySelector('.donation-info .ngo-name, .donation-info p:nth-of-type(3), [data-donor]');
    const typeEl = card.querySelector('.food-tag');
    return {
      id: id || ('card-' + name.toLowerCase().replace(/[^a-z0-9]+/g,'-')),
      name: name,
      type: typeEl ? typeEl.textContent.trim() : (card.textContent.toLowerCase().indexOf('non-veg') !== -1 ? 'Non-Veg' : 'Veg'),
      category: card.dataset.category || (typeEl ? typeEl.textContent.trim() : 'Food'),
      donor: card.dataset.donor || (donorEl ? donorEl.textContent.replace(/\s+/g,' ').trim() : 'FoodBridge Partner'),
      address: card.dataset.location || (meta ? (meta.textContent.match(/(?:location-dot|map-marker-alt)?[^\n]*$/i) || ['Dehradun'])[0].replace(/\s+/g,' ').trim() : 'Dehradun'),
      distance: card.dataset.distance || 'Nearby',
      time: card.dataset.time || (timeEl ? timeEl.textContent.replace(/\s+/g,' ').trim() : 'Today'),
      servings: card.dataset.servings || (servingsEl ? servingsEl.textContent.replace(/\s+/g,' ').trim() : 'Available'),
      left: card.dataset.left || 'Available',
      description: card.dataset.description || 'Fresh surplus food available for community distribution.',
      image: img ? img.src : ''
    };
  }

  function findFoodByNameOrCard(name) {
    const target = String(name || '').trim().toLowerCase();
    const item = getAllAvailableFoods().find(function(f){ return String(f.name || '').trim().toLowerCase() === target; });
    if (item) return item;
    const cards = Array.from(document.querySelectorAll('.food-card,.food-list-item'));
    for (const card of cards) {
      const cardName = card.dataset.name || (card.querySelector('h3,h4') ? card.querySelector('h3,h4').textContent.trim() : '');
      if (cardName.toLowerCase() === target) return foodFromCard(card);
    }
    return null;
  }

  function viewFoodDetails(name) {
    const item = findFoodByNameOrCard(name);
    if (item) { openFoodModal(item); return; }
    toast('Food details are not available for this item.');
  }

  function fillModal(food) {
    const set = function (id, value) { const el = document.getElementById(id); if (el) el.textContent = value || '—'; };
    set('modalFoodName', food.name);
    set('modalFoodDonor', food.donor || 'FoodBridge Partner');
    set('modalFoodType', food.type || food.category || 'Food');
    const typeBadge = document.getElementById('modalFoodType');
    if (typeBadge) {
      typeBadge.classList.remove('tag-veg','tag-nonveg');
      typeBadge.classList.add(String(food.type || '').toLowerCase().indexOf('non') !== -1 ? 'tag-nonveg' : 'tag-veg');
    }
    set('modalFoodCategory', food.category || 'Food');
    set('modalFoodServings', food.servings || food.quantity || '—');
    set('modalFoodLocation', food.address || food.location || 'Dehradun');
    set('modalFoodDistance', food.distance || 'Nearby');
    set('modalFoodTime', food.time || formatTimeRange(food.pickupFrom, food.pickupUntil) || 'Today');
    set('modalFoodLeft', food.left || 'Available');
    set('modalFoodDescription', food.description || 'Fresh surplus food available for verified community partners.');
    set('modalFoodStatus', food.status ? String(food.status).charAt(0).toUpperCase() + String(food.status).slice(1) : 'Available');
    const img = document.getElementById('modalFoodImage');
    if (img) { img.src = food.image || 'https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=600&auto=format&fit=crop'; img.alt = food.name || 'Food donation'; }
  }

  function openFoodModal(food) {
    let modal = document.getElementById('foodDetailsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'foodDetailsModal';
      modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:99998;background:rgba(15,31,22,.62);align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML = '<div style="width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--card,#fff);border-radius:22px;box-shadow:0 24px 70px rgba(0,0,0,.25);position:relative;overflow-x:hidden;">' +
        '<button type="button" id="closeFoodModal" aria-label="Close" style="position:absolute;right:16px;top:16px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.94);font-size:22px;cursor:pointer;color:#425047;z-index:2;box-shadow:0 4px 15px rgba(0,0,0,.12);">&times;</button>' +
        '<img id="modalFoodImage" style="width:100%;height:220px;object-fit:cover;display:block;" alt="Food donation">' +
        '<div style="padding:24px 26px 26px;">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><span class="food-tag tag-veg" id="modalFoodType">Food</span><span id="modalFoodCategory" style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:6px;background:#eef7ef;color:#26783a;">Category</span></div>' +
        '<h2 id="modalFoodName" style="margin:10px 0 4px;font-size:24px;"></h2>' +
        '<p id="modalFoodDonor" style="margin:0 0 18px;color:var(--text-soft);font-size:13px;"></p>' +
        '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">' +
        '<div style="padding:13px;border:1px solid var(--border);border-radius:12px;background:#fbfdfb;"><small style="display:block;color:var(--text-soft);font-size:10px;">Servings</small><b id="modalFoodServings" style="font-size:13px;"></b></div>' +
        '<div style="padding:13px;border:1px solid var(--border);border-radius:12px;background:#fbfdfb;"><small style="display:block;color:var(--text-soft);font-size:10px;">Location</small><b id="modalFoodLocation" style="font-size:13px;"></b></div>' +
        '<div style="padding:13px;border:1px solid var(--border);border-radius:12px;background:#fbfdfb;"><small style="display:block;color:var(--text-soft);font-size:10px;">Distance</small><b id="modalFoodDistance" style="font-size:13px;"></b></div>' +
        '<div style="padding:13px;border:1px solid var(--border);border-radius:12px;background:#fbfdfb;"><small style="display:block;color:var(--text-soft);font-size:10px;">Pickup</small><b id="modalFoodTime" style="font-size:13px;"></b></div>' +
        '</div>' +
        '<div style="margin-top:15px;padding:14px 15px;border-radius:12px;background:#f4faf5;"><small style="display:block;color:var(--text-soft);font-size:10px;margin-bottom:3px;">Availability</small><b id="modalFoodLeft" style="color:#26783a;font-size:13px;"></b></div>' +
        '<p id="modalFoodDescription" style="margin:17px 0 0;font-size:13px;line-height:1.65;color:var(--text-soft);"></p>' +
        '<div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#f7f9f7;"><small style="display:block;color:var(--text-soft);font-size:10px;margin-bottom:3px;">Status</small><b id="modalFoodStatus" style="font-size:13px;"></b></div>' +
        '<div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;"><button type="button" id="requestFoodBtn" class="btn btn-green"><i class="fa-solid fa-hand-holding-heart"></i> Request Food</button><button type="button" id="modalSaveBtn" class="btn btn-outline"><i class="fa-regular fa-bookmark"></i> Save Food</button></div>' +
        '</div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#closeFoodModal').addEventListener('click', closeFoodModal);
      modal.addEventListener('click', function(e){ if(e.target===modal) closeFoodModal(); });
    }
    fillModal(food);
    modal.dataset.foodId = food.id || '';
    modal.dataset.foodName = food.name || '';
    modal.style.display = 'flex';
    const req = modal.querySelector('#requestFoodBtn');
    if(req){ req.onclick=function(){ localStorage.setItem('foodbridgeRequestItem', JSON.stringify(food)); modal.style.display='none'; go('request-food.html'); }; }
    const save = modal.querySelector('#modalSaveBtn');
    if(save){ save.onclick=function(){ toggleSaved({dataset:{name:food.name}}, save); }; }
  }

  function closeFoodModal() {
    const modal = document.getElementById('foodDetailsModal');
    if (modal) modal.style.display = 'none';
  }

  function resetFoodForm() {
    const form = document.getElementById('foodDonationForm');
    if (form) form.reset();
    const preview = document.getElementById('uploadPreview');
    if (preview) preview.innerHTML = '';
    const imageInput = document.getElementById('foodImage');
    if (imageInput) delete imageInput.dataset.imageData;
    const success = document.getElementById('successMessage');
    if (success) success.style.display = 'none';
  }

  function inferCategory(name) {
    const n = String(name || '').toLowerCase();
    if (/fruit|vegetable|sabzi|apple|banana|mango|orange/.test(n)) return 'Fruits';
    if (/bread|bun|cake|pastry|bakery|roti|chapati/.test(n)) return 'Bakery';
    if (/juice|drink|beverage|milk|tea|coffee|water/.test(n)) return 'Beverages';
    if (/rice|dal|curry|biryani|meal|paneer|pasta|noodle|food|chicken|roti/.test(n)) return 'Cooked Meal';
    return 'Grocery';
  }

  function postFood(e) {
    if (e && e.preventDefault) e.preventDefault();

    const form = document.getElementById('foodDonationForm');
    if (!form) return false;

    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }

    const val = function (id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    const typeEl = form.querySelector('input[name="foodType"]:checked');
    const file = document.getElementById('foodImage');

    const selectedImage = file && file.dataset.imageData ? file.dataset.imageData : '';

    const finish = async function (imageData) {
        const user = read(KEYS.user, {
            name: 'Riya Sharma',
            role: 'Restaurant'
        });

        const token = localStorage.getItem('foodbridgeToken');

        if (!token) {
            toast('Please login again.');
            return;
        }

        const quantityValue = parseFloat(val('quantity')) || 0;

        let pickupCoordinates = null;
        const latInput = document.getElementById('pickupLatitude');
        const lngInput = document.getElementById('pickupLongitude');
        if (latInput && lngInput && latInput.value && lngInput.value) {
          pickupCoordinates = { latitude: Number(latInput.value), longitude: Number(lngInput.value) };
        } else {
          try { pickupCoordinates = await geocodeAddress(val('address')); } catch (_) {}
        }

        const backendDonation = {
          foodName: val('foodName'),
          foodType: (typeEl && typeEl.value === 'Non-Vegetarian' ? 'non-veg' : (typeEl && typeEl.value === 'Vegan' ? 'vegan' : 'veg')),
          quantity: (parseFloat(val('servings')) || quantityValue),
          quantityUnit: 'meals',
          description: val('description'),
          pickupLocation: val('address'),
          pickupLatitude: pickupCoordinates ? pickupCoordinates.latitude : null,
          pickupLongitude: pickupCoordinates ? pickupCoordinates.longitude : null,
          preparedAt: val('preparedDate'),
          expiryAt: val('bestBefore'),
          imageData: imageData || ''
      }; 
          
      

        try {
            const response = await fetch(
                API_BASE + '/donations',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(backendDonation)
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                console.error('Create Donation Error:', data);
                toast(data.message || 'Unable to post food donation.');
                return;
            }

            const food = {
                id: data.donation._id,
                name: data.donation.foodName,
                type: data.donation.foodType,
                category: inferCategory(data.donation.foodName),
                quantity: String(data.donation.quantity),
                servings: val('servings') || String(data.donation.quantity),
                preparedDate: data.donation.preparedAt,
                bestBefore: data.donation.expiryAt,
                description: data.donation.description || '',
                address: data.donation.pickupLocation,
                pickupFrom: val('pickupFrom'),
                pickupUntil: val('pickupUntil'),
                donor: user.name || 'Restaurant',
                donorRole: user.role || 'Restaurant',
                image: imageData || '',
                createdAt: Date.now(),
                status: data.donation.status || 'available',
                time: formatTimeRange(val('pickupFrom'), val('pickupUntil')),
                left: 'New'
            };

            const foods = getFoods();
            foods.unshift(food);
            saveFoods(foods);

            const donations = getDonations();
            donations.unshift(food);
            saveDonations(donations);

            addNotification(
                'Food Donation Posted',
                food.name + ' has been added to Available Food.'
            );

            const success = document.getElementById('successMessage');

            if (success) {
                success.textContent =
                    'Food donation posted successfully! It is now available to NGOs.';
                success.style.display = 'flex';
            }

            toast('Food donation posted successfully!');

            setTimeout(function () {
                go('dashboard-available-food.html');
            }, 650);

        } catch (error) {
            console.error('Create Donation Error:', error);
            toast('Unable to connect to the backend.');
        }
    };

    if (file && file.files && file.files[0]) {
        const selected = file.files[0];

        if (selected.size > 5 * 1024 * 1024) {
            toast('Image must be smaller than 5MB.');
            return false;
        }

        if (!/^image\/(jpeg|png|webp)$/.test(selected.type)) {
            toast('Please upload JPG, PNG or WEBP.');
            return false;
        }

        const reader = new FileReader();

        reader.onload = function () {
            finish(reader.result);
        };

        reader.readAsDataURL(selected);
    } else {
        finish('');
    }

    return false;
}

function renderPostedFoods() {
    const list = document.getElementById('foodList');
    if (!list) return;
    list.querySelectorAll('[data-user-food="true"]').forEach(function (el) { el.remove(); });
    const foods = getFoods().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    foods.forEach(function (food) {
      const card = document.createElement('div');
      card.className = 'df-item food-card';
      card.dataset.userFood = 'true';
      card.dataset.foodId = food.id;
      card.dataset.category = food.category || 'Cooked Meal';
      card.dataset.name = food.name;
      card.dataset.donor = food.donor || '';
      card.dataset.location = food.address || '';
      card.dataset.time = food.time || '';
      card.dataset.servings = food.servings || '';
      card.dataset.left = food.left || 'New';
      const tagClass = food.type === 'Non-Vegetarian' ? 'tag-nonveg' : 'tag-veg';
      const image = food.image || 'https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=500&auto=format&fit=crop';
      card.innerHTML = '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(food.name) + '">' +
        '<div style="flex:1;">' +
        '<span class="food-tag ' + tagClass + '" style="background:#fdeecb;color:#c9840a;">' + escapeHtml(food.category || 'Cooked Meal') + '</span>' +
        '<h4>' + escapeHtml(food.name) + '</h4>' +
        '<div style="font-size:12.5px;color:var(--text-soft);">' + escapeHtml(food.donor || 'Restaurant') + ' <i class="fa-solid fa-circle-check" style="color:var(--green);font-size:10px;"></i></div>' +
        '<div class="meta"><i class="fa-solid fa-location-dot"></i> ' + escapeHtml(food.address || 'Pickup location') + ' &nbsp; <i class="fa-regular fa-clock"></i> ' + escapeHtml(food.time || 'Pickup time') + '</div>' +
        '</div>' +
        '<div class="servings"><b>' + escapeHtml(food.servings || '—') + '</b>Servings</div>' +
        '<div class="food-time"><i class="fa-regular fa-clock"></i><br>' + escapeHtml(food.left || 'New') + '</div>' +
        '<div class="actions"><button class="btn btn-green btn-sm view-food-btn" data-action="view-food">View Details</button><button class="btn btn-outline btn-sm save-food-btn" data-action="save-food"><i class="fa-regular fa-heart"></i> Save</button><button class="btn btn-outline btn-sm delete-food-btn" data-action="delete-food" title="Delete your posted food"><i class="fa-solid fa-trash"></i></button></div>';
      list.insertBefore(card, list.firstChild);
    });
    initSavedFoodButtons();
  }

  function renderMyDonations() {
    const list = document.getElementById('donationList');
    if (!list) return;
    list.querySelectorAll('[data-user-donation="true"]').forEach(function (el) { el.remove(); });
    const items = getDonations().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    items.forEach(function (food) {
      const card = document.createElement('div');
      card.className = 'donation-card';
      card.dataset.userDonation = 'true';
      card.dataset.status = food.status || 'pending';
      card.dataset.name = food.name;
      card.dataset.foodId = food.id;
      const status = food.status || 'pending';
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
      card.innerHTML = '<div class="food-icon"><i class="fa-solid fa-bowl-food"></i></div>' +
        '<div class="donation-info"><div class="donation-title-row"><h3>' + escapeHtml(food.name) + '</h3><span class="status-badge ' + escapeHtml(status) + '">' + escapeHtml(statusLabel) + '</span></div>' +
        '<p><i class="fa-solid fa-box"></i> ' + escapeHtml(food.quantity) + ' &nbsp; • &nbsp; ' + escapeHtml(food.servings) + ' servings</p>' +
        '<p><i class="fa-regular fa-calendar"></i> Posted on ' + escapeHtml(formatDate(food.createdAt)) + '</p>' +
        '<p class="ngo-name"><i class="fa-solid fa-location-dot"></i> Waiting for NGO request</p></div>' +
        '<div class="donation-action"><button data-action="view-donation" data-food-id="' + escapeHtml(food.id) + '">View Details</button><button data-action="delete-donation" data-food-id="' + escapeHtml(food.id) + '" style="margin-left:8px;color:#c0392b;">Delete</button></div>';
      list.insertBefore(card, list.firstChild);
    });
    updateDonationStats();
    filterDonations();
  }

  function updateDonationStats() {
    const items = getDonations();
    const total = document.getElementById('totalDonations');
    const pending = document.getElementById('pendingDonations');
    const completed = document.getElementById('completedDonations');
    if (total) total.textContent = String(items.length);
    if (pending) pending.textContent = String(items.filter(function (x) { return ['available','requested','accepted','pending'].indexOf(String(x.status || '').toLowerCase()) !== -1; }).length);
    if (completed) completed.textContent = String(items.filter(function (x) { return ['delivered','completed'].indexOf(String(x.status || '').toLowerCase()) !== -1; }).length);
  }

  async function deleteFood(id) {
    const foods = getFoods();
    const item = foods.find(function (f) { return f.id === id; });
    if (!item) return;
    if (!window.confirm('Cancel "' + item.name + '" donation?')) return;
    const token = localStorage.getItem('foodbridgeToken');
    if (!token) { toast('Please login again.'); return; }
    try {
      const response = await fetch(API_BASE + '/donations/' + encodeURIComponent(id) + '/cancel', {
        method: 'PATCH', headers: authHeaders()
      });
      const data = await response.json();
      if (!response.ok || !data.success) { toast(data.message || 'Unable to cancel donation.'); return; }
      saveFoods(foods.filter(function (f) { return f.id !== id; }));
      saveDonations(getDonations().filter(function (f) { return f.id !== id; }));
      renderPostedFoods();
      renderMyDonations();
      toast('Food donation cancelled.');
    } catch (error) {
      console.error('Cancel Donation Error:', error);
      toast('Unable to connect to the backend.');
    }
  }

  function deleteDonation(id) {
    deleteFood(id);
  }

  function getSavedFoods() { return read(KEYS.savedFoods, []); }
  function saveSavedFoods(items) { write(KEYS.savedFoods, items); }

  function initSavedFoodButtons() {
    const saved = getSavedFoods();
    document.querySelectorAll('.save-food-btn').forEach(function (btn) {
      const card = btn.closest('.food-card');
      if (!card) return;
      const name = card.dataset.name;
      if (saved.indexOf(name) !== -1) {
        btn.classList.add('saved');
        btn.innerHTML = '<i class="fa-solid fa-heart"></i> Saved';
      }
    });
  }

  function toggleSaved(card, button) {
    if (!card || !button) return;
    const name = card.dataset.name;
    const saved = getSavedFoods();
    const index = saved.indexOf(name);
    if (index === -1) {
      saved.push(name);
      button.classList.add('saved');
      button.innerHTML = '<i class="fa-solid fa-heart"></i> Saved';
      toast('Food saved to your list.');
    } else {
      saved.splice(index, 1);
      button.classList.remove('saved');
      button.innerHTML = '<i class="fa-regular fa-heart"></i> Save';
      toast('Food removed from saved list.');
    }
    saveSavedFoods(saved);
  }

  function searchRoute(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    if (/food|meal|restaurant|donation|biryani|rice|dal|paneer|curry|grocery|fruit|bakery|beverage/.test(q)) return 'dashboard-available-food.html';
    if (/request|ngo/.test(q)) return 'dashboard-requests.html';
    if (/pickup|delivery|truck/.test(q)) return 'dashboard-my-pickups.html';
    if (/message|chat/.test(q)) return 'dashboard-messages.html';
    if (/notification|alert/.test(q)) return 'dashboard-notifications.html';
    if (/impact|co2|meal shared/.test(q)) return 'dashboard-my-impact.html';
    if (/setting|profile|security/.test(q)) return 'dashboard-settings.html';
    if (/help|support/.test(q)) return 'dashboard-help.html';
    return null;
  }

  function performSearch(input) {
    if (!input) return;
    const q = input.value.trim();
    if (!q) { toast('Type something to search.'); input.focus(); return; }
    const current = location.pathname.split('/').pop();
    if (current === 'dashboard-available-food.html' || current === 'available-food.html') {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const anyVisible = Array.from(document.querySelectorAll('.food-card,.food-list-item')).some(function (c) { return c.style.display !== 'none'; });
      if (!anyVisible) toast('No food found for "' + q + '".');
      return;
    }
    if (current === 'dashboard-my-donations.html') {
      filterDonations();
      return;
    }
    const target = searchRoute(q);
    if (target) go(target); else toast('No matching section found. Try food, requests, pickups, messages or settings.');
  }

  function setupSearch() {
    document.querySelectorAll('.dash-search input,.search-field input').forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.id === 'donationSearch') { filterDonations(); return; }
        if (input.id === 'foodSearch' || input.closest('.search-field')) filterFoodLists(input.value);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); performSearch(input); } });
      const wrapper = input.parentElement;
      const icon = wrapper ? wrapper.querySelector('.fa-magnifying-glass') : null;
      if (icon) {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', function () { performSearch(input); });
      }
    });
  }

  function filterFoodLists(query) {
    const q = String(query || '').trim().toLowerCase();
    const activeTab = document.querySelector('.food-tab.active');
    const category = activeTab ? (activeTab.dataset.category || 'All') : 'All';
    let visible = 0;
    document.querySelectorAll('.food-card,.food-list-item').forEach(function (card) {
      const hay = (card.dataset.name || card.textContent || '').toLowerCase();
      const cardCategory = card.dataset.category || '';
      const matchesCategory = category === 'All' || cardCategory === category;
      const matchesSearch = !q || hay.indexOf(q) !== -1;
      const show = matchesCategory && matchesSearch;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const no = document.getElementById('noFoodMessage');
    if (no) no.style.display = visible ? 'none' : 'block';
    const empty = document.getElementById('noFoodResults');
    if (empty) empty.style.display = visible ? 'none' : 'block';
  }

  function filterDonations() {
    const list = document.getElementById('donationList');
    if (!list) return;
    const qEl = document.getElementById('donationSearch');
    const q = qEl ? qEl.value.trim().toLowerCase() : '';
    const active = document.querySelector('.filter-btn.active');
    const status = active ? active.dataset.filter : 'all';
    let visible = 0;
    list.querySelectorAll('.donation-card').forEach(function (card) {
      const matchesStatus = status === 'all' || card.dataset.status === status;
      const matchesText = !q || (card.textContent || '').toLowerCase().indexOf(q) !== -1;
      card.style.display = matchesStatus && matchesText ? '' : 'none';
      if (matchesStatus && matchesText) visible++;
    });
    const no = document.getElementById('noDonations');
    if (no) no.style.display = visible ? 'none' : 'block';
  }

  function viewDonation(name) {
    let item = getDonations().find(function (f) { return String(f.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase(); });
    if (!item) {
      const card = Array.from(document.querySelectorAll('.donation-card')).find(function(c){
        const n = c.dataset.name || (c.querySelector('h3') ? c.querySelector('h3').textContent.trim() : '');
        return n.toLowerCase() === String(name || '').trim().toLowerCase();
      });
      if (card) item = foodFromCard(card);
    }
    if (!item) { toast('Donation details are not available for this item.'); return; }
    item = Object.assign({ category: 'Donation', status: 'Available', description: 'Food donation details from FoodBridge.' }, item);
    openFoodModal(item);
  }

  function filterFoodTabs() {
    const tabs = document.querySelectorAll('.food-tab');
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      if (tab.dataset.foodTabsReady === '1') return;
      tab.dataset.foodTabsReady = '1';
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        const input = document.getElementById('foodSearch') || document.querySelector('.search-field input');
        filterFoodLists(input ? input.value : '');
      });
    });
    const active = document.querySelector('.food-tab.active') || tabs[0];
    if (active && !active.classList.contains('active')) active.classList.add('active');
    const input = document.getElementById('foodSearch');
    if (input) filterFoodLists(input.value);
  }

  function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    list.querySelectorAll('[data-user-notification="true"]').forEach(function (el) { el.remove(); });
    const items = getNotifications();
    const existingTitles = new Set(Array.from(list.children).map(function (x) { const t = x.querySelector('h4,h3,strong'); return t ? t.textContent.trim() : ''; }));
    items.slice().reverse().forEach(function (n) {
      if (existingTitles.has(n.title) && String(n.id).indexOf('demo-') === 0) return;
      const item = document.createElement('div');
      item.setAttribute('data-user-notification', 'true');
      item.dataset.notificationId = n.id;
      item.style.cssText = 'display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);';
      item.innerHTML = '<div style="width:38px;height:38px;border-radius:50%;background:#e9f7ec;display:flex;align-items:center;justify-content:center;flex:0 0 auto;"><i class="fa-solid fa-bell" style="color:var(--green);"></i></div><div style="flex:1;"><strong style="font-size:13px;display:block;">' + escapeHtml(n.title) + '</strong><p style="font-size:12px;color:var(--text-soft);margin:3px 0;">' + escapeHtml(n.message) + '</p><small style="color:var(--text-soft);">' + escapeHtml(n.time || 'Recently') + '</small></div><button data-action="delete-notification" title="Delete notification" style="border:0;background:transparent;color:#c0392b;cursor:pointer;"><i class="fa-solid fa-trash"></i></button>';
      list.insertBefore(item, list.firstChild);
    });
    updateNotificationBadge();
    filterNotifications();
  }

  function filterNotifications() {
    const list=document.getElementById('notificationList'); if(!list)return;
    const filter=document.getElementById('notificationFilter'); const value=filter?filter.value:'all';
    const search=((document.querySelector('#dashboard-notifications .dash-search input')||{}).value||'').toLowerCase().trim();
    let visible=0;
    Array.from(list.children).forEach(function(item){
      const id=item.dataset?item.dataset.notificationId:''; const stored=getNotifications().find(function(n){return n.id===id;});
      const unread=stored?stored.unread:!item.classList.contains('read'); const text=(item.textContent||'').toLowerCase();
      const okStatus=value==='all'||(value==='unread'&&unread)||(value==='read'&&!unread); const okSearch=!search||text.indexOf(search)!==-1;
      item.style.display=okStatus&&okSearch?'':'none'; if(okStatus&&okSearch)visible++;
    });
    const empty=document.getElementById('notificationEmpty'); if(empty)empty.style.display=visible?'none':'block';
  }

  function markAllRead() {
    const items = getNotifications().map(function (n) { n.unread = false; return n; });
    saveNotifications(items);
    renderNotifications();
    toast('All notifications marked as read.');
  }

  function clearNotifications() {
    if (!window.confirm('Clear all notifications?')) return;
    saveNotifications([]);
    renderNotifications();
    toast('Notifications cleared.');
  }

  function deleteNotification(el) {
    const item = el && el.closest('[data-notification-id]');
    if (!item) return;
    const id = item.dataset.notificationId;
    saveNotifications(getNotifications().filter(function (n) { return n.id !== id; }));
    item.remove();
    updateNotificationBadge();
    toast('Notification deleted.');
  }

  async function filterRequests(status) {
    const list = document.getElementById('requestList');
    if (!list) return;

    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        console.log('No FoodBridge login token found.');
        return;
    }

    try {
        const currentUser = read(KEYS.user, {}) || {};
        const role = String(currentUser.role || '').toLowerCase();
        const endpoint = role === 'receiver' || role === 'ngo' ? API_BASE + '/requests/my' : API_BASE + '/requests/donations';
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Donation Requests Error:', data);
            return;
        }

        list.innerHTML = '';

        if (!data.requests || data.requests.length === 0) {
            list.innerHTML = `
                <div id="noRequests" class="request-empty">
                    <b>No requests found</b>
                    <span>There are currently no requests for your donations.</span>
                </div>
            `;
            return;
        }

        data.requests.forEach(function (request) {
            const receiver = request.receiver || {};
            const donation = request.donation || {};

            const statusText = request.status || 'pending';

            const card = document.createElement('div');
            card.className = 'request-card';
            card.dataset.status = statusText;
            card.dataset.requestId = request._id;

            card.innerHTML = `
                <div class="request-avatar">
                    ${(receiver.name || 'NG').substring(0, 2).toUpperCase()}
                </div>

                <div class="request-info">
                    <div class="request-title">
                        <h3>${receiver.name || 'NGO'}</h3>
                        <span class="request-status ${statusText}">
                            ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                        </span>
                    </div>

                    <p class="requested-food">
                        <i class="fa-solid fa-utensils"></i>
                        ${donation.foodName || 'Food Donation'}
                    </p>

                    <p>
                        <i class="fa-solid fa-box"></i>
                        Requesting ${request.requestedQuantity || donation.quantity || ''} ${donation.quantityUnit || 'servings'}
                    </p>

                    <p>
                        <i class="fa-solid fa-location-dot"></i>
                        ${donation.pickupLocation || 'Pickup location not specified'}
                    </p>

                    ${
                        statusText === 'pending'
                        ? `
                            <div class="request-actions">
                                <button onclick="acceptRequest(this)">
                                    Accept
                                </button>
                                <button onclick="declineRequest(this)">
                                    Decline
                                </button>
                            </div>
                          `
                        : ''
                    }
                </div>
            `;

            list.appendChild(card);
        });

    } catch (error) {
        console.error('Donation Requests Error:', error);
    }
}
  async function acceptRequest(el) {
    const card = el && el.closest('.request-card');
    if (!card) return;

    const requestId = card.dataset.requestId;
    const token = localStorage.getItem('foodbridgeToken');

    if (!requestId || !token) {
      alert('Request information or login session missing.');
      return;
    }

    try {
      const response = await fetch(
        API_BASE + '/requests/' + requestId + '/approve',
        {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + token
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('Approve Request Error:', data);
        alert(data.message || 'Unable to accept request.');
        return;
      }

      alert('Request accepted successfully.');
      await filterRequests();

    } catch (error) {
      console.error('Approve Request Error:', error);
      alert('Unable to connect to the backend.');
    }
  }

  async function declineRequest(el) {
    const card = el && el.closest('.request-card');
    const requestId = card && card.dataset.requestId;
    const token = localStorage.getItem('foodbridgeToken');
    if (!requestId || !token) return;
    try {
      const response = await fetch(API_BASE + '/requests/' + requestId + '/reject', { method:'PATCH', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok || !data.success) { toast(data.message || 'Unable to reject request.'); return; }
      toast('Request rejected.');
      await filterRequests();
    } catch (_) { toast('Unable to connect to the backend.'); }
  }

  function viewRequest(name) { toast('Request details: ' + name); }

  async function filterPickups(status) {
    const select = document.getElementById('pickupStatus');

    if (select && status) {
        select.value = status;
    }

    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        console.log('No FoodBridge login token found.');
        return;
    }

    try {
        const pickupEndpoint =
            window.location.pathname.includes('dashboard-my-pickups.html')
                ? API_BASE + '/pickups/my'
                : API_BASE + '/pickups/available';
            
        const currentUser = read(KEYS.user, null) || {};
        const role = String(currentUser.role || '').toLowerCase();
        const isVolunteer = role === 'volunteer';
        const isReceiver = role === 'receiver';

        // Volunteers need to see both: pickups already accepted by them and
        // newly assigned/unclaimed pickups waiting for any volunteer.
        let data;
        if (isReceiver && window.location.pathname.includes('dashboard-my-pickups.html')) {
            const response = await fetch(API_BASE + '/pickups/receiver', { method:'GET', headers: authHeaders() });
            data = await response.json();
            if (!response.ok || !data.success) {
                console.error('Receiver Delivery Tracking Error:', data);
                return;
            }
        } else if (isVolunteer && window.location.pathname.includes('dashboard-my-pickups.html')) {
            const [mineResponse, availableResponse] = await Promise.all([
                fetch(API_BASE + '/pickups/my', { method:'GET', headers: authHeaders() }),
                fetch(API_BASE + '/pickups/available', { method:'GET', headers: authHeaders() })
            ]);
            const mine = await mineResponse.json();
            const available = await availableResponse.json();
            if (!mineResponse.ok || !mine.success || !availableResponse.ok || !available.success) {
                console.error('Volunteer Pickups Error:', { mine, available });
                return;
            }
            const mineIds = new Set((mine.pickups || []).map(p => String(p._id)));
            data = { success:true, pickups:[...(mine.pickups || []), ...(available.pickups || []).filter(p => !mineIds.has(String(p._id)))] };
        } else {
            const response = await fetch(
                pickupEndpoint,
                { method: 'GET', headers: authHeaders() }
            );
            data = await response.json();
            if (!response.ok || !data.success) {
                console.error('Available Pickups Error:', data);
                return;
            }
        }

        const pickupList = document.getElementById('pickupList');
        if (!pickupList) return;
        pickupList.innerHTML = '';

        const pickupsForStats = data.pickups || [];
        const availableCountEl = document.getElementById('pickupAvailableCount');
        const progressCountEl = document.getElementById('pickupProgressCount');
        const completedCountEl = document.getElementById('pickupCompletedCount');
        const foodCountEl = document.getElementById('pickupFoodCount');
        if (availableCountEl) availableCountEl.textContent = isReceiver ? pickupsForStats.filter(p => p.status === 'assigned').length : pickupsForStats.filter(p => p.status === 'assigned' && !p.volunteer).length;
        if (progressCountEl) progressCountEl.textContent = pickupsForStats.filter(p => ['accepted','picked_up','in_transit'].includes(String(p.status || '').toLowerCase())).length;
        if (completedCountEl) completedCountEl.textContent = pickupsForStats.filter(p => p.status === 'delivered').length;
        if (foodCountEl) foodCountEl.textContent = pickupsForStats.reduce((sum,p) => sum + (Number(p.donation?.quantity) || 0), 0);

        if (isReceiver && window.location.pathname.includes('dashboard-my-pickups.html')) {
            const header = document.querySelector('.pickup-header h2');
            const subtitle = document.querySelector('.pickup-header p');
            const cardHeader = document.querySelector('.pickup-card-header h3');
            const cardSub = document.querySelector('.pickup-card-header p');
            if (header) header.textContent = 'Delivery Tracking';
            if (subtitle) subtitle.textContent = 'Track approved food requests and the volunteer delivery status.';
            if (cardHeader) cardHeader.textContent = 'My Deliveries';
            if (cardSub) cardSub.textContent = 'Live delivery status for your approved food requests.';
            const statLabels = document.querySelectorAll('.pickup-stat span');
            if (statLabels[0]) statLabels[0].textContent = 'Awaiting Pickup';
            if (statLabels[1]) statLabels[1].textContent = 'In Progress';
            if (statLabels[2]) statLabels[2].textContent = 'Delivered';
            if (statLabels[3]) statLabels[3].textContent = 'Food';
        }

        if (!data.pickups || data.pickups.length === 0) {
            pickupList.innerHTML = `
                <div class="pickup-empty">
                    <b>${isReceiver ? 'No deliveries yet' : 'No pickups available right now'}</b>
                    <span>${isReceiver ? 'Approved requests will appear here once a delivery pickup is created.' : 'When a restaurant approves an NGO request, the pickup will appear here for volunteers.'}</span>
                </div>
            `;
            return;
        }

        data.pickups.forEach(function (pickup) {
            const donation = pickup.donation || {};

            const row = document.createElement('div');
            row.className = 'pickup-row';
            row.dataset.status = pickup.status || 'assigned';

           const isMyPickupsPage =
    window.location.pathname.includes('dashboard-my-pickups.html');

let actionButton = '';

const isUnclaimed = pickup.status === 'assigned' && !pickup.volunteer;

if (isVolunteer && isUnclaimed) {
    // Every volunteer sees the same unclaimed pickup. The first volunteer
    // who clicks Accept wins it atomically on the backend.
    actionButton = `
        <button class="view-pickup"
            onclick="acceptAvailablePickup('${pickup._id}')">
            <i class="fa-solid fa-hand"></i> Accept Pickup
        </button>
    `;
} else if (isVolunteer && isMyPickupsPage) {
    if (pickup.status === 'accepted') {
        actionButton = `
            <button class="view-pickup"
                onclick="markPickupPickedUp('${pickup._id}')">
                Picked Up
            </button>
        `;
    } else if (pickup.status === 'picked_up') {
        actionButton = `
            <button class="view-pickup"
                onclick="markPickupInTransit('${pickup._id}')">
                In Transit
            </button>
        `;
    } else if (pickup.status === 'in_transit') {
        actionButton = `
            <button class="view-pickup"
                onclick="completePickupDelivery('${pickup._id}')">
                Deliver
            </button>
        `;
    }
}

const receiver = pickup.request && pickup.request.receiver ? pickup.request.receiver : {};
const donor = donation.donor && typeof donation.donor === 'object' ? donation.donor : {};
const pickupCoords = Number.isFinite(Number(pickup.pickupLatitude)) && Number.isFinite(Number(pickup.pickupLongitude))
    ? Number(pickup.pickupLatitude).toFixed(5) + ', ' + Number(pickup.pickupLongitude).toFixed(5)
    : 'Coordinates not saved';
const deliveryCoords = Number.isFinite(Number(pickup.deliveryLatitude)) && Number.isFinite(Number(pickup.deliveryLongitude))
    ? Number(pickup.deliveryLatitude).toFixed(5) + ', ' + Number(pickup.deliveryLongitude).toFixed(5)
    : 'Coordinates not saved';

row.innerHTML = `
    <div class="pickup-food-icon">
        <i class="fa-solid fa-utensils"></i>
    </div>

    <div class="pickup-info" style="flex:1;min-width:240px;">
        <h4>${donation.foodName || 'Food Donation'}</h4>
        <p>${donation.quantity || ''} ${donation.quantityUnit || ''}</p>
        <p><strong>📦 Pickup:</strong> ${donor.name || 'Restaurant'} — ${pickup.pickupLocation || donation.pickupLocation || 'Location not specified'}</p>
        <p style="font-size:11px;color:#718078;">📍 ${pickupCoords}</p>
        <p><strong>🏢 Delivery:</strong> ${receiver.name || receiver.organization || 'NGO / Receiver'} — ${pickup.deliveryLocation || receiver.location || 'Location not specified'}</p>
        <p style="font-size:11px;color:#718078;">📍 ${deliveryCoords}</p>
    </div>

    <span class="pickup-status ${pickup.status || 'pending'}">
        ${isReceiver ? (pickup.status || 'Pending') : (isMyPickupsPage ? (pickup.status || 'Accepted') : 'Available')}
    </span>

    ${actionButton}
    ${(isVolunteer && !isUnclaimed && (pickup.status === 'accepted' || pickup.status === 'picked_up' || pickup.status === 'in_transit')) ? '<button class="view-pickup" onclick="location.href=\'delivery-map.html?pickupId=' + pickup._id + '\'"><i class="fa-solid fa-map-location-dot"></i> Map</button>' : ''}
`;

            pickupList.appendChild(row);
        });

    } catch (error) {
        console.error('Available Pickups Error:', error);
    }
}
let volunteerPickupRefreshTimer = null;
function startVolunteerPickupAutoRefresh() {
    if (volunteerPickupRefreshTimer || !window.location.pathname.includes('dashboard-my-pickups.html')) return;
    const currentUser = read(KEYS.user, null) || {};
    if (String(currentUser.role || '').toLowerCase() !== 'volunteer') return;
    volunteerPickupRefreshTimer = setInterval(function () {
        if (typeof filterPickups === 'function') filterPickups('all');
    }, 10000);
}

async function acceptAvailablePickup(pickupId) {
    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        alert('Please login again.');
        return;
    }

    try {
        const response = await fetch(
            API_BASE + '/pickups/' + pickupId + '/accept',
            {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Accept Pickup Error:', data);
            alert(data.message || 'Unable to accept pickup.');
            return;
        }

        alert('Pickup accepted successfully.');

        await filterPickups();

    } catch (error) {
        console.error('Accept Pickup Error:', error);
        alert('Unable to connect to the backend.');
    }
}
async function markPickupPickedUp(pickupId) {
    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        alert('Please login again.');
        return;
    }

    try {
        const response = await fetch(
            API_BASE + '/pickups/' + pickupId + '/picked-up',
            {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Mark Picked Up Error:', data);
            alert(data.message || 'Unable to mark pickup as picked up.');
            return;
        }

        alert('Pickup marked as picked up successfully.');

        await filterPickups();

    } catch (error) {
        console.error('Mark Picked Up Error:', error);
        alert('Unable to connect to backend.');
    }
}
async function markPickupInTransit(pickupId) {
    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        alert('Please login again.');
        return;
    }

    try {
        const response = await fetch(
            API_BASE + '/pickups/' + pickupId + '/in-transit',
            {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Mark In Transit Error:', data);
            alert(data.message || 'Unable to mark pickup as in transit.');
            return;
        }

        alert('Pickup marked as in transit successfully.');

        await filterPickups();

    } catch (error) {
        console.error('Mark In Transit Error:', error);
        alert('Unable to connect to backend.');
    }
}


async function completePickupDelivery(pickupId) {
    const token = localStorage.getItem('foodbridgeToken');

    if (!token) {
        alert('Please login again.');
        return;
    }

    const otp = prompt('Enter the delivery OTP from the NGO:');

    if (!otp) {
        return;
    }

    try {
        const response = await fetch(
            API_BASE + '/pickups/' + pickupId + '/deliver',
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    otp: otp.trim()
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Complete Delivery Error:', data);
            alert(data.message || 'Unable to complete delivery.');
            return;
        }

        alert('Delivery completed successfully.');

        await filterPickups();

    } catch (error) {
        console.error('Complete Delivery Error:', error);
        alert('Unable to connect to backend.');
    }
}

  function viewPickup(food, restaurant, quantity, time, status) {
    const map = { modalFood: food, modalRestaurant: restaurant, modalQuantity: quantity, modalTime: time, modalStatus: status, modalId: 'FB-PK-' + String(Date.now()).slice(-4) };
    Object.keys(map).forEach(function (id) { const el = document.getElementById(id); if (el) el.textContent = map[id]; });
    const modal = document.getElementById('pickupModal');
    if (modal) modal.style.display = 'flex'; else toast(food + ' pickup: ' + status);
  }

  function closePickup() { const m = document.getElementById('pickupModal'); if (m) m.style.display = 'none'; }
  function trackPickup() { toast('Pickup tracking updated.'); }

  function newMessage() { const m = document.getElementById('messageModal'); if (m) m.style.display = 'flex'; else toast('New message window opened.'); }
  function sendNewMessage() { const text = document.getElementById('newMessageText'); if (!text || !text.value.trim()) { toast('Please write a message.'); return; } addNotification('New Message Sent', 'Your message was sent successfully.'); if (text) text.value = ''; const m = document.getElementById('messageModal'); if (m) m.style.display = 'none'; toast('Message sent successfully.'); }
  function sendMessage() { const input = document.getElementById('messageInput'); if (!input || !input.value.trim()) { toast('Please type a message.'); return; } const box = document.getElementById('chatMessages'); if (box) { const div = document.createElement('div'); div.style.cssText = 'padding:8px 12px;margin:6px 0;background:#eaf7ed;border-radius:10px;max-width:75%;margin-left:auto;font-size:12px;'; div.textContent = input.value.trim(); box.appendChild(div); } input.value = ''; }
  function getMessageReads() { return read(KEYS.messageReads, {}); }
  function saveMessageReads(value) { write(KEYS.messageReads, value); }
  function getMessageUnreadCount() {
    const reads = getMessageReads();
    const demoNames = ['Hope Foundation', 'Helping Hands NGO', 'FoodBridge Support', 'Care & Share NGO'];
    // The first two demo conversations start unread, matching the Messages page.
    return demoNames.filter(function(name, index){
      return index < 2 && !reads[name];
    }).length;
  }

  function updateConversationUnreadCount() {
    const list = document.getElementById('conversationList');
    const reads = getMessageReads();
    let count = getMessageUnreadCount();

    // If the Messages page is open, calculate from the actual visible conversation badges.
    if (list) {
      count = 0;
      list.querySelectorAll('.conversation').forEach(function(c){
        const name = c.dataset.name || '';
        const badge = c.querySelector('em');
        if (badge && !reads[name] && c.style.display !== 'none') count += 1;
      });
    }

    const label = document.querySelector('.conversation-top span');
    if (label) label.textContent = count + ' unread message' + (count === 1 ? '' : 's');
    // Keep every Messages count in sync across Dashboard and Messages pages.
    document.querySelectorAll('.dash-nav a[href="dashboard-messages.html"] .pill-status, .dash-nav a[href="dashboard-messages.html"] .message-count, #messageUnreadCount').forEach(function(badge){
      badge.textContent = count;
      badge.style.display = count ? '' : 'none';
    });
    return count;
  }
  function markConversationSeen(name) {
    const reads = getMessageReads();
    reads[name] = true;
    saveMessageReads(reads);
    const conversation = Array.from(document.querySelectorAll('#conversationList .conversation')).find(function(c){
      return (c.dataset.name || '').toLowerCase() === String(name || '').toLowerCase();
    });
    if (conversation) {
      conversation.classList.add('read');
      const badge = conversation.querySelector('em');
      if (badge) badge.remove();
    }
    updateConversationUnreadCount();
  }

  function openChat(name, initials) {
    const n = document.getElementById('chatName');
    const a = document.getElementById('chatAvatar');
    if (n) n.textContent = name;
    if (a) a.textContent = initials || name.slice(0,2).toUpperCase();

    // Opening a conversation marks it as seen and permanently removes its unread badge.
    markConversationSeen(name);
    toast('Opened chat with ' + name + ' — marked as seen.');
  }
  function closeMessage() { const m = document.getElementById('messageModal'); if (m) m.style.display = 'none'; }
  function startCall() { toast('Calling is available in the frontend demo.'); }

  function saveProfile() {
    const user = read(KEYS.user, { role: 'Restaurant', name: 'Riya Sharma' });
    const name = document.getElementById('fullName');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const restaurant = document.getElementById('restaurant');
    const address = document.getElementById('address');
    if (name) user.name = name.value.trim() || user.name;
    if (email) user.email = email.value.trim();
    if (phone) user.phone = phone.value.trim();
    if (restaurant) user.organization = restaurant.value.trim();
    if (address) user.address = address.value.trim();
    user.initials = (user.name || 'FB').split(/\s+/).slice(0,2).map(function(x){return x[0];}).join('').toUpperCase();
    write(KEYS.user, user);
    // Keep the registered account record in sync so future logins restore
    // the latest saved profile instead of an older signup snapshot.
    const users = read(KEYS.users, []);
    const idx = users.findIndex(function(u){ return u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase() && u.role === user.role; });
    if (idx !== -1) {
      const savedPassword = users[idx].password;
      users[idx] = Object.assign({}, users[idx], user);
      if (savedPassword) users[idx].password = savedPassword;
      write(KEYS.users, users);
    }
    applyUserProfile();
    toast('Profile saved successfully.');
  }

  function savePreferences() { toast('Preferences saved successfully.'); }
  function saveNotificationsSettings() { toast('Notification settings saved.'); }
  function changePassword() {
    const a = document.getElementById('currentPassword'); const b = document.getElementById('newPassword'); const c = document.getElementById('confirmPassword');
    if (b && c && b.value !== c.value) { toast('New passwords do not match.'); return; }
    if (!b || !b.value) { toast('Enter a new password.'); return; }
    if (a) a.value = ''; if (b) b.value = ''; if (c) c.value = ''; toast('Password changed successfully.');
  }

  function logoutAccount() {
    localStorage.removeItem(KEYS.user);
    localStorage.removeItem('foodbridgeSelectedRole');
    go('login.html');
  }
  function showSetting(id, el) { document.querySelectorAll('.setting-section').forEach(function(s){s.style.display='none';}); const target=document.getElementById(id); if(target) target.style.display='block'; if(el && el.parentElement){el.parentElement.querySelectorAll('.setting-nav-item').forEach(function(x){x.classList.remove('active');});el.classList.add('active');} }
  function showHelpToast(msg) { toast(msg || 'Help information opened.'); }
  function toggleFAQ(el) { const ans = el ? el.nextElementSibling : null; if (ans) ans.style.display = ans.style.display === 'none' ? 'block' : 'none'; }
  function filterFAQ(category, el) { if (el && el.parentElement) el.parentElement.querySelectorAll('button').forEach(function(b){b.classList.remove('active');}); if (el) el.classList.add('active'); document.querySelectorAll('.faq-item').forEach(function(item){ item.style.display = category === 'all' || (item.dataset.category || '').toLowerCase() === category ? '' : 'none'; }); }
  function openSupport(){ go('contact.html'); }
  function closeSupport(){ const m=document.getElementById('supportModal'); if(m)m.style.display='none'; }
  function submitSupport(){ const m=document.getElementById('supportModal'); if(m)m.style.display='none'; toast('Support request submitted.'); }

  async function compressFoodImage(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function() {
        const img = new Image();
        img.onerror = reject;
        img.onload = function() {
          const maxSide = 1200;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let quality = 0.82;
          let data = canvas.toDataURL('image/jpeg', quality);
          while (data.length > 1400000 && quality > 0.55) {
            quality -= 0.07;
            data = canvas.toDataURL('image/jpeg', quality);
          }
          if (data.length > 1500000) return reject(new Error('Image too large'));
          resolve(data);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function initPostFood() {
    const form = document.getElementById('foodDonationForm');
    if (!form) return;
    const address = document.getElementById('address');
    if (address && !document.getElementById('pickupLocationControls')) {
      const controls = document.createElement('div');
      controls.id = 'pickupLocationControls';
      controls.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;';
      controls.innerHTML = '<button type=\"button\" class=\"btn btn-outline btn-sm\" id=\"useCurrentPickupLocation\"><i class=\"fa-solid fa-location-crosshairs\"></i> Use Current Location</button><span style=\"font-size:10.5px;color:var(--text-soft);\">Or enter the real pickup address manually.</span><input type=\"hidden\" id=\"pickupLatitude\"><input type=\"hidden\" id=\"pickupLongitude\">';
      address.parentElement.appendChild(controls);
      const btn = document.getElementById('useCurrentPickupLocation');
      btn.addEventListener('click', function(){ useCurrentLocationForFields(btn, address, document.getElementById('pickupLatitude'), document.getElementById('pickupLongitude')); });
      address.addEventListener('input', function(){ document.getElementById('pickupLatitude').value=''; document.getElementById('pickupLongitude').value=''; });
    }
    form.addEventListener('submit', postFood);
    const image = document.getElementById('foodImage');
    const preview = document.getElementById('uploadPreview');
    if (image && preview) {
      image.addEventListener('change', async function () {
        preview.innerHTML = '';
        const file = image.files && image.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { toast('Please upload JPG, PNG or WEBP.'); image.value=''; return; }
        if (file.size > 5 * 1024 * 1024) { toast('Image must be smaller than 5MB.'); image.value=''; return; }
        try {
          const compressed = await compressFoodImage(file);
          image.dataset.imageData = compressed;
          const img = document.createElement('img');
          img.style.cssText = 'max-width:100%;max-height:150px;border-radius:8px;object-fit:cover;margin-top:8px;';
          img.src = compressed;
          preview.appendChild(img);
          const note = document.createElement('div');
          note.style.cssText = 'margin-top:5px;color:#3d7048;font-size:10px;';
          note.textContent = '✓ Your uploaded photo will be saved with this donation.';
          preview.appendChild(note);
        } catch (err) {
          image.value='';
          delete image.dataset.imageData;
          toast('Could not process this image. Please choose another photo.');
        }
      });
    }
  }

  function initDonationFilters() {
    document.querySelectorAll('.filter-btn').forEach(function(btn){ btn.addEventListener('click', function(){ document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); filterDonations(); }); });
    const sort = document.getElementById('sortDonations');
    if (sort) sort.addEventListener('change', function(){ const list=document.getElementById('donationList'); if(!list)return; const cards=Array.from(list.querySelectorAll('.donation-card')); cards.sort(function(a,b){const av=a.dataset.name||'';const bv=b.dataset.name||'';return sort.value==='oldest'?av.localeCompare(bv):bv.localeCompare(av);}); cards.forEach(function(c){list.appendChild(c);}); });
  }

  function initNotificationPage() {
    const filter = document.getElementById('notificationFilter');
    if (filter) filter.addEventListener('change', filterNotifications);
  }

  function initRolePage() {
    const savedRole = localStorage.getItem('foodbridgeSelectedRole') || 'Restaurant';
    const grid = document.querySelector('.role-grid');
    if (!grid) return;
    const options = Array.from(grid.querySelectorAll('.role-opt'));
    options.forEach(function(opt){
      const role = ['Restaurant','NGO','Volunteer','Admin'].find(function(r){ return (opt.textContent || '').indexOf(r) !== -1; });
      if (role === savedRole) { options.forEach(function(o){o.classList.remove('active');}); opt.classList.add('active'); }
      opt.addEventListener('click', function(){ selectRole(opt); });
    });
    updateRoleDetails(savedRole);
  }

  function initRequestFoodPage() {
    // Request Food must remain a request form only. Remove any old Available Food
    // block if an older cached HTML version still contains it.
    document.querySelectorAll('#requestFoodList, .request-side-list, [data-request-available-food]').forEach(function(el){ el.remove(); });
    const form = document.getElementById('foodRequestForm');
    const list = document.getElementById('requestFoodList');
    const selectedBox = document.getElementById('selectedFoodBox');
    const search = document.getElementById('requestFoodSearch');
    const category = document.getElementById('requestFoodCategory');
    const countEl = document.getElementById('requestFoodCount');
    let selected = null;

    try {
      const raw = localStorage.getItem('foodbridgeRequestItem');
      const item = raw ? JSON.parse(raw) : null;
      if (item) selected = getAllAvailableFoods().find(function (f) { return f.id === item.id; }) || item;
    } catch (_) { selected = null; }

    function showSelected(food) {
      if (!selectedBox || !food) return;
      selectedBox.innerHTML = '<div class="selected-food-inner">' +
        '<img class="selected-food-image" src="' + escapeHtml(food.image || 'https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=500&auto=format&fit=crop') + '" alt="' + escapeHtml(food.name) + '">' +
        '<div class="selected-food-info"><div class="selected-food-title"><div><span class="food-tag tag-veg">' + escapeHtml(food.type || food.category || 'Food') + '</span><h3>' + escapeHtml(food.name) + '</h3></div><i class="fa-solid fa-circle-check"></i></div>' +
        '<p>' + escapeHtml(food.donor || 'FoodBridge Partner') + '</p><div class="selected-food-meta"><span><i class="fa-solid fa-location-dot"></i>' + escapeHtml(food.address || 'Dehradun') + '</span><span><i class="fa-solid fa-utensils"></i>' + escapeHtml(food.servings || food.quantity || 'Available') + '</span><span><i class="fa-regular fa-clock"></i>' + escapeHtml(food.time || 'Today') + '</span></div></div></div>';
      selectedBox.style.display = 'block';
      const hidden = document.getElementById('requestFoodId');
      if (hidden) hidden.value = food.id || '';
    }
    if (selected) showSelected(selected);

    function renderList() {
      if (!list) return;
      const q = (search ? search.value : '').trim().toLowerCase();
      const cat = category ? category.value : 'all';
      const foods = getAllAvailableFoods().slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});
      const filtered = foods.filter(function(food){
        const hay = [food.name, food.address, food.donor, food.category, food.type].join(' ').toLowerCase();
        const matchesSearch = !q || hay.indexOf(q) !== -1;
        const matchesCategory = cat === 'all' || String(food.category || 'Grocery').toLowerCase() === cat.toLowerCase();
        return matchesSearch && matchesCategory;
      });
      if (countEl) countEl.textContent = filtered.length;
      list.innerHTML = '';
      if (!filtered.length) {
        list.innerHTML='<div class="request-empty"><i class="fa-solid fa-bowl-food"></i><p>No matching food donations found.</p><span style="display:block;font-size:10.5px;margin-top:5px;">Try another food name or category.</span></div>';
        return;
      }
      filtered.forEach(function(food){
        const card=document.createElement('div');
        card.className='df-item food-card request-food-option' + (selected && selected.id === food.id ? ' selected' : '');
        card.dataset.name=food.name; card.dataset.category=food.category || 'Grocery'; card.dataset.foodId=food.id;
        const isSelected = selected && selected.id === food.id;
        card.innerHTML='<img class="request-food-image" src="'+escapeHtml(food.image || 'https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=500&auto=format&fit=crop')+'" alt="'+escapeHtml(food.name)+'">' +
          '<div class="food-content"><div class="request-food-top"><span class="food-tag '+(String(food.type||'').toLowerCase().indexOf('non')!==-1?'tag-nonveg':'tag-veg')+'">'+escapeHtml(food.type || 'Veg')+'</span><span class="request-available"><i class="fa-solid fa-circle"></i> Available</span></div><h3>'+escapeHtml(food.name)+'</h3>' +
          '<p class="request-donor">'+escapeHtml(food.donor || 'FoodBridge Partner')+'</p>' +
          '<div class="food-meta"><span><i class="fa-solid fa-location-dot"></i>'+escapeHtml(food.address || 'Dehradun')+'</span><span><i class="fa-solid fa-utensils"></i>'+escapeHtml(food.servings || food.quantity || 'Available')+'</span><span><i class="fa-regular fa-clock"></i>'+escapeHtml(food.time || 'Today')+'</span></div>' +
          '<p class="request-food-description">'+escapeHtml(food.description || 'Fresh surplus food ready for community distribution.')+'</p></div>' +
          '<div class="request-food-actions"><button type="button" class="btn btn-outline btn-sm" data-request-details="'+escapeHtml(food.id)+'"><i class="fa-regular fa-eye"></i> Details</button><button type="button" class="btn '+(isSelected?'btn-outline':'btn-green')+' btn-sm" data-request-select="'+escapeHtml(food.id)+'">'+(isSelected?'Selected':'Select')+'</button></div>';
        list.appendChild(card);
      });
    }
    renderList();
    if (search && !search.dataset.ready) { search.dataset.ready='1'; search.addEventListener('input', renderList); }
    if (category && !category.dataset.ready) { category.dataset.ready='1'; category.addEventListener('change', renderList); }

    if (form && !form.dataset.ready) {
      form.dataset.ready='1';
      form.addEventListener('submit', async function(e){
  e.preventDefault();

  const id = (document.getElementById('requestFoodId') || {}).value;
  let food = getAllAvailableFoods().find(function(f){
    return f.id === id;
  });

  if (!food) {
    try {
      const raw = localStorage.getItem('foodbridgeRequestItem');
      const item = raw ? JSON.parse(raw) : null;
      if (item && (item.id === id || item.name)) food = item;
    } catch (_) {}
  }

  if (!food) {
    toast('Please select a food item first.');
    return;
  }

  const token = localStorage.getItem('foodbridgeToken');

  if (!token) {
    toast('Please login again.');
    return;
  }

  const quantity = Number(
    (document.getElementById('requestQuantity') || {}).value || 1
  );

  const message =
    (document.getElementById('requestNote') || {}).value || '';

  try {
    const response = await fetch(
      API_BASE + '/requests',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          donationId: food.id,
          requestedQuantity: quantity,
          message: message
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('Food Request Error:', data);
      toast(data.message || 'Unable to send food request.');
      return;
    }

    addNotification(
      'Food Request Sent',
      'Your request for ' + food.name + ' has been sent to the donor.'
    );

    const success = document.getElementById('requestSuccess');

    if (success) {
      success.textContent =
        'Food request sent successfully! The donor will be notified.';
      success.style.display = 'flex';
    }

    form.reset();
    selected = null;
    localStorage.removeItem('foodbridgeRequestItem');

    const hidden = document.getElementById('requestFoodId');
    if (hidden) hidden.value = '';

    if (selectedBox) selectedBox.style.display = 'none';

    renderList();

  } catch (error) {
    console.error('Food Request Error:', error);
    toast('Unable to connect to the backend.');
  }
});
      
    }
  }

  function initLiveMapLink() {
    document.querySelectorAll('.dash-nav').forEach(function(nav){
      if (nav.querySelector('[data-live-map-link]')) return;
      const link = document.createElement('a');
      link.href = 'map.html';
      link.dataset.liveMapLink = '1';
      link.innerHTML = '<i class=\"fa-solid fa-map-location-dot\"></i> Live Map';
      nav.appendChild(link);
    });
  }

  function initDashboardProfileMenus() {
    document.querySelectorAll('.dash-profile').forEach(function(profile){
      if (profile.dataset.profileMenuReady === '1') return;
      profile.dataset.profileMenuReady = '1';
      profile.style.cursor = 'pointer';
      const parent = profile.parentElement;
      if (!parent) return;
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      const user = read(KEYS.user, null) || {};
      const name = user.name || 'FoodBridge User';
      const role = user.role || 'User';
      const menu = document.createElement('div');
      menu.className = 'dashboard-profile-menu';
      menu.style.cssText = 'display:none;position:absolute;right:0;top:calc(100% + 10px);z-index:10050;min-width:215px;background:var(--card,#fff);border:1px solid var(--border);border-radius:15px;box-shadow:0 18px 42px rgba(0,0,0,.14);padding:8px;';
      menu.innerHTML = '<div style="padding:10px 11px 9px;border-bottom:1px solid var(--border);margin-bottom:6px;"><strong style="display:block;font-size:13px;">' + escapeHtml(name) + '</strong><span style="display:block;margin-top:2px;font-size:11px;color:var(--text-soft);">' + escapeHtml(role) + '</span></div>' +
        '<button type="button" data-dashboard-profile-action="dashboard" style="width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:10px 11px;border-radius:10px;cursor:pointer;text-align:left;font:600 12px Inter,Arial,sans-serif;color:var(--text,#1f2937);"><i class="fa-solid fa-gauge-high" style="width:16px;color:var(--green);"></i>Dashboard</button>' +
        '<button type="button" data-dashboard-profile-action="logout" style="width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:10px 11px;border-radius:10px;cursor:pointer;text-align:left;font:600 12px Inter,Arial,sans-serif;color:#d64b4b;"><i class="fa-solid fa-right-from-bracket" style="width:16px;"></i>Log Out</button>';
      parent.appendChild(menu);
    });
    if (!window._foodBridgeDashProfileOutsideClick) {
      window._foodBridgeDashProfileOutsideClick = true;
      document.addEventListener('click', function(e){
        if (!e.target.closest('.dash-profile') && !e.target.closest('.dashboard-profile-menu')) {
          document.querySelectorAll('.dashboard-profile-menu').forEach(function(m){m.style.display='none';});
        }
      });
    }
  }

  function initGlobalButtons() {
    document.addEventListener('click', function (e) {
      // Dashboard's original/static cards use these classes instead of data-action.
      const legacyView = e.target.closest('.view-food-btn');
      if (legacyView) {
        e.preventDefault();
        const card = legacyView.closest('.food-card,.df-item,.food-list-item');
        const item = foodFromCard(card);
        if (item) openFoodModal(item); else toast('Food details are not available for this item.');
        return;
      }
      const legacySave = e.target.closest('.save-food-btn');
      if (legacySave) {
        e.preventDefault();
        const card = legacySave.closest('.food-card,.df-item,.food-list-item');
        if (card) toggleSaved(card, legacySave);
        return;
      }
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === 'view-food') { const card=actionEl.closest('.food-card,.df-item,.food-list-item'); const item=foodFromCard(card); if(item) openFoodModal(item); else if(card) viewFoodDetails(card.dataset.name); return; }
        if (action === 'view-public-food') { const card=actionEl.closest('.food-list-item,.food-card,.df-item'); const item=foodFromCard(card); if(item) openFoodModal(item); else if(card) viewFoodDetails(card.dataset.name); return; }
        if (action === 'save-food') { toggleSaved(actionEl.closest('.food-card,.food-list-item'), actionEl); return; }
        if (action === 'delete-food') { const card=actionEl.closest('.food-card,.df-item,.food-list-item'); if(card) deleteAvailableFood(card.dataset.foodId || '', card.dataset.name || (card.querySelector('h3,h4') ? card.querySelector('h3,h4').textContent.trim() : '')); return; }
        if (action === 'view-donation') { const id=actionEl.dataset.foodId; const item=getDonations().find(function(f){return f.id===id;}); if(item)viewDonation(item.name); return; }
        if (action === 'delete-donation') { deleteDonation(actionEl.dataset.foodId); return; }
        if (action === 'delete-notification') { deleteNotification(actionEl); return; }
      }
      const bell = e.target.closest('.bell-wrap');
      if (bell) { e.preventDefault(); go('dashboard-notifications.html'); return; }
      const dashProfileAction = e.target.closest('[data-dashboard-profile-action]');
      if (dashProfileAction) {
        e.preventDefault();
        const action = dashProfileAction.dataset.dashboardProfileAction;
        document.querySelectorAll('.dashboard-profile-menu').forEach(function(m){m.style.display='none';});
        if (action === 'dashboard') go('dashboard.html');
        if (action === 'logout') logoutAccount();
        return;
      }
      const profile = e.target.closest('.dash-profile');
      if (profile) {
        e.preventDefault();
        const menu = profile.parentElement ? profile.parentElement.querySelector('.dashboard-profile-menu') : null;
        if (menu) {
          const open = menu.style.display === 'block';
          document.querySelectorAll('.dashboard-profile-menu').forEach(function(m){m.style.display='none';});
          menu.style.display = open ? 'none' : 'block';
        }
        return;
      }
      const support = e.target.closest('#contactSupportBtn');
      if (support) { e.preventDefault(); go('dashboard-help.html'); return; }
      const impact = e.target.closest('#viewImpactBtn');
      if (impact) { e.preventDefault(); go('dashboard-my-impact.html'); return; }
      const close = e.target.closest('#closeFoodModal');
      if (close) { closeFoodModal(); return; }
      if (e.target.id === 'foodDetailsModal') closeFoodModal();
      const request = e.target.closest('#requestFoodBtn');
      if (request) {
        const modal=document.getElementById('foodDetailsModal');
        const id=modal ? modal.dataset.foodId : '';
        const item=getAllAvailableFoods().find(function(f){return f.id===id;});
        if (item) localStorage.setItem('foodbridgeRequestItem', JSON.stringify(item));
        if (modal) modal.style.display='none';
        go('request-food.html');
        return;
      }
      const modalSave = e.target.closest('#modalSaveBtn');
      if (modalSave) { const modal=document.getElementById('foodDetailsModal'); const item=getAllAvailableFoods().find(function(f){return f.id===(modal?modal.dataset.foodId:'');}); if(item) toggleSaved({dataset:{name:item.name}},modalSave); return; }
      const requestDetails = e.target.closest('[data-request-details]');
      if (requestDetails) {
        const food = getAllAvailableFoods().find(function(f){ return f.id === requestDetails.dataset.requestDetails; });
        if (food) openFoodModal(food);
        return;
      }
      const requestSelect = e.target.closest('[data-request-select]');
      if (requestSelect) {
        const id=requestSelect.dataset.requestSelect;
        const food=getAllAvailableFoods().find(function(f){return f.id===id;});
        if(food){ localStorage.setItem('foodbridgeRequestItem', JSON.stringify(food)); const hidden=document.getElementById('requestFoodId'); if(hidden) hidden.value=id; document.querySelectorAll('.request-food-option').forEach(function(c){ c.classList.toggle('selected', c.dataset.foodId===id); const b=c.querySelector('[data-request-select]'); if(b) b.textContent=c.dataset.foodId===id?'Selected':'Select'; }); const box=document.getElementById('selectedFoodBox'); if(box){box.style.display='block'; box.innerHTML='<div class="df-item food-card" style="display:flex;align-items:center;gap:16px;"><div class="food-icon"><i class="fa-solid fa-bowl-food"></i></div><div style="flex:1;"><span class="food-tag tag-veg">'+escapeHtml(food.category||'Food')+'</span><h3 style="margin:5px 0;">'+escapeHtml(food.name)+'</h3><p style="margin:0;color:var(--text-soft);font-size:13px;">'+escapeHtml(food.servings||food.quantity||'Available')+' servings • '+escapeHtml(food.address||'Pickup location')+'</p></div></div>';}}
        toast('Food selected. Complete the request form.');
        return;
      }
      const genericHash = e.target.closest('a[href="#"]');
      if (genericHash) { e.preventDefault(); toast('This section is available in the frontend demo.'); }
    });
  }

  function searchFAQ() {
    const input=document.getElementById('faqSearch'); if(!input)return;
    const q=input.value.toLowerCase().trim(); let count=0;
    document.querySelectorAll('.faq-item').forEach(function(item){const ok=!q||(item.textContent||'').toLowerCase().indexOf(q)!==-1;item.style.display=ok?'':'none';if(ok)count++;});
    const empty=document.getElementById('faqEmpty'); if(empty)empty.style.display=count?'none':'';
  }

  function initAllPageFilters() {
    document.querySelectorAll('.request-filter').forEach(function(btn){
      if(btn.dataset.filterReady==='1')return; btn.dataset.filterReady='1';
      btn.addEventListener('click',function(){
        document.querySelectorAll('.request-filter').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active'); filterRequests();
      });
    });
    const requestSearch=document.getElementById('requestSearch'); if(requestSearch)requestSearch.addEventListener('input',filterRequests);
    const requestSort=document.getElementById('requestSort'); if(requestSort)requestSort.addEventListener('change',function(){
      const list=document.getElementById('requestList'); if(!list)return; const cards=Array.from(list.querySelectorAll('.request-card,[data-status]'));
      cards.sort(function(a,b){return (requestSort.value==='oldest'?1:-1)*((a.textContent||'').localeCompare(b.textContent||''));}); cards.forEach(function(c){list.appendChild(c);}); filterRequests();
    });
    const pickupStatus=document.getElementById('pickupStatus'); if(pickupStatus)pickupStatus.addEventListener('change',function(){filterPickups();});
    const pickupSearch=document.querySelector('#dashboard-my-pickups .dash-search input'); if(pickupSearch)pickupSearch.addEventListener('input',function(){filterPickups();});
    const foodApply=document.getElementById('applyFoodFilters');
    const foodReset=document.getElementById('resetFoodFilters');
    function advancedFoodFilter(){
      const loc=(document.getElementById('foodLocation')||{}).value||'';
      const type=(document.getElementById('foodType')||{}).value||'';
      const time=(document.getElementById('foodTime')||{}).value||'';
      const dist=(document.getElementById('foodDistance')||{}).value||'';
      document.querySelectorAll('#foodList .food-card').forEach(function(card){
        const text=(card.textContent||'').toLowerCase();
        const category=(card.dataset.category||'').toLowerCase();
        const okLoc=!loc||/all locations/i.test(loc)||text.indexOf(loc.toLowerCase().replace('connaught place, dehradun','connaught place').replace('lajpat nagar, dehradun','lajpat nagar').replace('saket, dehradun','saket').replace('dwarka, dehradun','dwarka'))!==-1;
        const okType=!type||/all types/i.test(type)||category===type.toLowerCase()||text.indexOf(type.toLowerCase())!==-1;
        const okTime=!time||/anytime/i.test(time)||text.indexOf(time.toLowerCase())!==-1;
        card.style.display=okLoc&&okType&&okTime?'':'none';
      });
      filterFoodLists((document.getElementById('foodSearch')||{}).value||'');
      toast('Food filters applied.');
    }
    if(foodApply)foodApply.addEventListener('click',advancedFoodFilter);
    if(foodReset)foodReset.addEventListener('click',function(e){e.preventDefault();['foodLocation','foodDistance','foodType','foodTime'].forEach(function(id){const x=document.getElementById(id);if(x)x.selectedIndex=0;}); document.querySelectorAll('#foodList .food-card').forEach(function(c){c.style.display='';}); filterFoodLists((document.getElementById('foodSearch')||{}).value||''); toast('Food filters reset.');});
    const faqInput=document.getElementById('faqSearch'); if(faqInput)faqInput.addEventListener('input',searchFAQ);
    const notifSearch=document.querySelector('#dashboard-notifications .dash-search input'); if(notifSearch)notifSearch.addEventListener('input',function(){filterNotifications();});
    const notifFilter=document.getElementById('notificationFilter'); if(notifFilter)notifFilter.addEventListener('change',filterNotifications);
    const convoSearch=document.getElementById('conversationSearch'); if(convoSearch)convoSearch.addEventListener('input',function(){const q=convoSearch.value.toLowerCase().trim();document.querySelectorAll('#conversationList .conversation').forEach(function(c){c.style.display=!q||(c.textContent||'').toLowerCase().indexOf(q)!==-1?'':'none';});});
    const impactSearch=document.getElementById('impactSearch'); if(impactSearch)impactSearch.addEventListener('input',function(){const q=impactSearch.value.toLowerCase().trim();document.querySelectorAll('.impact-card,.impact-item,.impact-row').forEach(function(c){c.style.display=!q||(c.textContent||'').toLowerCase().indexOf(q)!==-1?'':'none';});});
    const blogButtons=document.querySelectorAll('.blog-filters > button'); const blogSearch=document.querySelector('.blog-search input');
    function blogFilter(){const active=Array.from(blogButtons).find(function(b){return b.classList.contains('active');});const label=(active?active.textContent:'All Posts').toLowerCase();const q=blogSearch?blogSearch.value.toLowerCase().trim():'';document.querySelectorAll('.blog-card').forEach(function(card){const text=(card.textContent||'').toLowerCase();const okCat=label.indexOf('all posts')!==-1||text.indexOf(label.replace(' stories',' story'))!==-1||text.indexOf(label.replace(' & guides',''))!==-1;card.style.display=okCat&&(!q||text.indexOf(q)!==-1)?'':'none';});}
    blogButtons.forEach(function(btn){btn.addEventListener('click',function(){blogButtons.forEach(function(b){b.classList.remove('active');});btn.classList.add('active');blogFilter();});}); if(blogSearch)blogSearch.addEventListener('input',blogFilter);
    const publicSearch=document.querySelector('.filter-bar .search-field input'); const publicSelects=document.querySelectorAll('.filter-bar select'); const publicFilterBtn=document.querySelector('.filter-bar button');
    function publicFoodFilter(){const q=publicSearch?publicSearch.value.toLowerCase().trim():'';const vals=Array.from(publicSelects).map(function(s){return (s.value||'').toLowerCase();});document.querySelectorAll('.food-layout .food-list-item').forEach(function(card){const t=(card.textContent||'').toLowerCase();const okQ=!q||t.indexOf(q)!==-1;const okType=!vals[1]||vals[1].indexOf('all')===0||t.indexOf(vals[1].replace('veg','veg'))!==-1;const okCat=!vals[2]||vals[2].indexOf('all')===0||t.indexOf(vals[2].replace('cooked meals','cooked'))!==-1||t.indexOf(vals[2].replace('fruits','fruit'))!==-1;card.style.display=okQ&&okType&&okCat?'':'none';});}
    if(publicSearch)publicSearch.addEventListener('input',publicFoodFilter); publicSelects.forEach(function(s){s.addEventListener('change',publicFoodFilter);}); if(publicFilterBtn)publicFilterBtn.addEventListener('click',function(e){e.preventDefault();publicFoodFilter();toast('Food filters applied.');});
  }

  function initInlineFeatures() {
    const passwordEyes = document.querySelectorAll('.eye');
    passwordEyes.forEach(function (eye) { eye.style.cursor='pointer'; eye.addEventListener('click', function(){ const input=eye.parentElement.querySelector('input'); if(!input)return; input.type=input.type==='password'?'text':'password'; eye.classList.toggle('fa-eye-slash'); }); });
    const newsletterButtons = document.querySelectorAll('.footer-newsletter button');
    newsletterButtons.forEach(function(btn){ if(!btn.getAttribute('onclick')) btn.addEventListener('click', handleNewsletterSubmit); });
    document.querySelectorAll('form').forEach(function(form){ if(form.id !== 'foodDonationForm' && /contact|message|support/i.test(form.className+' '+form.id)) form.addEventListener('submit', handleContactSubmit); });
  }

  function refreshStaticFoodCards() {
    const deleted = new Set(read(KEYS.deletedDemoFoods, []));
    document.querySelectorAll('.food-list-item,.df-layout .food-card').forEach(function(card){
      const name = card.dataset.name || (card.querySelector('h4,h3') ? card.querySelector('h4,h3').textContent.trim() : '');
      const demo = DEMO_FOODS.find(function(f){ return f.name.toLowerCase() === name.toLowerCase(); });
      if (demo && deleted.has(demo.id)) card.remove();
    });
    document.querySelectorAll('.food-list-item,.df-layout .food-card').forEach(function(card){
      if (card.querySelector('[data-action=delete-food]')) return;
      const actions = card.querySelector('.actions') || card.querySelector('.food-time + div');
      if (!actions) return;
      const btn=document.createElement('button');
      btn.type='button'; btn.className='btn btn-outline btn-sm'; btn.dataset.action='delete-food';
      btn.title='Delete food'; btn.innerHTML='<i class="fa-solid fa-trash"></i> Delete';
      actions.appendChild(btn);
    });
  }

  function setupStaticPublicFood() {
    const input = document.querySelector('.search-field input');
    const host = document.querySelector('.food-layout > div:first-child');
    if (host) {
      host.querySelectorAll('[data-public-user-food="true"]').forEach(function (el) { el.remove(); });
      getFoods().slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);}).forEach(function(food){
        const item = document.createElement('div');
        item.className = 'food-list-item';
        item.dataset.publicUserFood = 'true';
        item.dataset.name = food.name;
        item.dataset.category = food.category || 'Grocery';
        item.innerHTML = '<img src="' + escapeHtml(food.image || 'https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=500&auto=format&fit=crop') + '" alt="' + escapeHtml(food.name) + '"><div style="flex:1;"><span class="food-tag tag-veg">' + escapeHtml(food.type || 'Veg') + '</span><h4>' + escapeHtml(food.name) + '</h4><div style="font-size:12.5px;color:var(--text-soft);">' + escapeHtml(food.donor || 'FoodBridge Restaurant') + ' <i class="fa-solid fa-circle-check" style="color:var(--green);font-size:10px;"></i></div><div class="meta"><span><i class="fa-solid fa-location-dot"></i> ' + escapeHtml(food.address || 'Pickup location') + '</span><span><i class="fa-regular fa-clock"></i> Pickup: ' + escapeHtml(food.time || 'Today') + '</span></div></div><div class="food-time">Pickup by<br><b>' + escapeHtml(food.pickupUntil || 'Today') + '</b><br><span style="color:var(--text);">' + escapeHtml(food.servings || food.quantity || 'Available') + '</span></div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;"><button class="btn btn-green btn-sm" data-action="view-public-food">View Details</button><button class="btn btn-outline btn-sm" data-action="save-food"><i class="fa-regular fa-bookmark"></i> Save</button><button class="btn btn-outline btn-sm" data-action="delete-food"><i class="fa-solid fa-trash"></i> Delete</button></div>';
        host.insertBefore(item, host.firstChild);
      });
    }
    refreshStaticFoodCards();
    if (!input) return;
    const list = Array.from(document.querySelectorAll('.food-list-item'));
    input.addEventListener('input', function(){ const q=input.value.toLowerCase().trim(); list.forEach(function(c){c.style.display=!q || c.textContent.toLowerCase().indexOf(q)!==-1?'':'none';}); });
  }

  function init() {
    if (localStorage.getItem('foodbridgeDarkMode') === '1') document.body.classList.add('dark-preview');
    getNotifications();
    updateNotificationBadge();
    applyUserProfile();
    renderPublicAuthNav();
    initDashboardProfileMenus();
    initLiveMapLink();
    initRolePage();
    setupSearch();
    setupStaticPublicFood();
    refreshStaticFoodCards();
    filterFoodTabs();
    initPostFood();
    initRequestFoodPage();
    initDonationFilters();
    initNotificationPage();
    initGlobalButtons();
    initAllPageFilters();
    initInlineFeatures();
    renderPostedFoods();
    renderMyDonations();
    renderNotifications();
    loadBackendNotifications();
    filterRequests();
    filterPickups();
    syncBackendFoodData();
    syncMyRequests();
    (function restoreReadConversations(){
      const reads=getMessageReads();
      document.querySelectorAll('#conversationList .conversation').forEach(function(c){
        const name=c.dataset.name || '';
        if(reads[name]){ c.classList.add('read'); const badge=c.querySelector('em'); if(badge) badge.remove(); }
      });
      updateConversationUnreadCount();
    })();
    document.querySelectorAll('.notification-list .notification-item').forEach(function(item){ item.addEventListener('click',function(){ const id=item.dataset.notificationId; if(id){const ns=getNotifications();const n=ns.find(function(x){return x.id===id;});if(n){n.unread=false;saveNotifications(ns);}} }); });
    const bell = document.getElementById('notificationBell');
    if (bell) bell.style.cursor='pointer';
    const modal = document.getElementById('foodDetailsModal');
    if (modal) modal.style.display = 'none';
    window.addEventListener('storage', function(e){ if([KEYS.foods,KEYS.donations,KEYS.notifications,KEYS.user].indexOf(e.key)!==-1){updateNotificationBadge();applyUserProfile();renderPublicAuthNav();initDashboardProfileMenus();renderPostedFoods();renderMyDonations();renderNotifications();} });
  }

  // Public functions used by existing inline HTML handlers.
  Object.assign(window, {
    toggleMobileNav: toggleMobileNav,
    toggleTheme: toggleTheme,
    selectRole: selectRole,
    handleNewsletterSubmit: handleNewsletterSubmit,
    handleContactSubmit: handleContactSubmit,
    handleLoginSubmit: handleLoginSubmit,
    handleSignupSubmit: handleSignupSubmit,
    verifySignupOTP: verifySignupOTP,
    resendSignupOTP: resendSignupOTP,
    viewFoodDetails: viewFoodDetails,
    resetFoodForm: resetFoodForm,
    viewDonation: viewDonation,
    markAllRead: markAllRead,
    clearNotifications: clearNotifications,
    deleteNotification: deleteNotification,
    acceptRequest: acceptRequest,
    declineRequest: declineRequest,
    cancelMyRequest: cancelMyRequest,
    filterRequests: filterRequests,
    viewRequest: viewRequest,
    filterPickups: filterPickups,
    acceptAvailablePickup: acceptAvailablePickup,
    markPickupPickedUp: markPickupPickedUp,
    markPickupInTransit: markPickupInTransit,
    completePickupDelivery: completePickupDelivery,
    searchFAQ: searchFAQ,
    viewPickup: viewPickup,
    closePickup: closePickup,
    trackPickup: trackPickup,
    newMessage: newMessage,
    sendNewMessage: sendNewMessage,
    sendMessage: sendMessage,
    openChat: openChat,
    closeMessage: closeMessage,
    startCall: startCall,
    saveProfile: saveProfile,
    savePreferences: savePreferences,
    saveNotifications: saveNotificationsSettings,
    changePassword: changePassword,
    logoutAccount: logoutAccount,
    showSetting: showSetting,
    showHelpToast: showHelpToast,
    toggleFAQ: toggleFAQ,
    filterFAQ: filterFAQ,
    openSupport: openSupport,
    closeSupport: closeSupport,
    submitSupport: submitSupport
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


document.addEventListener('DOMContentLoaded', function () {
    if (typeof startVolunteerPickupAutoRefresh === 'function') startVolunteerPickupAutoRefresh();
});


// Role-based dashboard navigation/access for every dashboard sub-page.
// This prevents donor/NGO users from landing on volunteer-only screens and
// keeps each role's sidebar limited to the tools that belong to that role.
document.addEventListener('DOMContentLoaded', function () {
    const userRaw = localStorage.getItem('foodbridgeCurrentUser');
    if (!userRaw) return;
    let u = {};
    try { u = JSON.parse(userRaw) || {}; } catch (_) { return; }
    const role = String(u.role || '').toLowerCase();
    const file = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

    const nav = {
        donor: [
            ['dashboard.html','house','Dashboard'], ['dashboard-post-food.html','circle-plus','Post Food'],
            ['dashboard-my-donations.html','box','My Donations'], ['dashboard-requests.html','hand-holding-heart','Requests'],
            ['dashboard-notifications.html','bell','Notifications'], ['dashboard-my-impact.html','chart-line','FoodBridge Impact'],
            ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
        ],
        receiver: [
            ['dashboard.html','house','Dashboard'], ['dashboard-available-food.html','utensils','Available Food'],
            ['dashboard-requests.html','hand-holding-heart','My Requests'], ['dashboard-my-pickups.html','truck','Delivery Tracking'],
            ['dashboard-notifications.html','bell','Notifications'], ['dashboard-my-impact.html','chart-line','FoodBridge Impact'],
            ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
        ],
        volunteer: [
            ['dashboard.html','house','Dashboard'], ['dashboard-my-pickups.html','truck','Available Pickups'],
            ['dashboard-notifications.html','bell','Notifications'], ['dashboard-my-impact.html','chart-line','FoodBridge Impact'],
            ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
        ],
        admin: [
            ['dashboard.html','house','Dashboard'], ['dashboard-requests.html','hand-holding-heart','Requests'],
            ['dashboard-my-donations.html','box','Donations'], ['dashboard-my-pickups.html','truck','Pickups'],
            ['dashboard-notifications.html','bell','Notifications'], ['dashboard-settings.html','gear','Settings'],
            ['dashboard-help.html','circle-question','Help & Support']
        ]
    };
    const allowed = (nav[role] || []).map(x => x[0]);
    const protectedFiles = Object.values(nav).flat().map(x => x[0]);
    if (!protectedFiles.includes(file)) return;
    if (!allowed.includes(file)) {
        window.location.replace('dashboard.html');
        return;
    }
    const box = document.querySelector('.dash-nav');
    if (box) {
        box.innerHTML = (nav[role] || nav.donor).map((n) =>
            `<a href="${n[0]}" class="${n[0] === file ? 'active' : ''}"><i class="fa-solid fa-${n[1]}"></i>${n[2]}</a>`
        ).join('');
    }
});
