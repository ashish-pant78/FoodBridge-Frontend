(function () {
  'use strict';

const API='https://foodbridge-backend-udfx.onrender.com/api';
  const token = () => localStorage.getItem('foodbridgeToken') || '';
  const user = () => { try { return JSON.parse(localStorage.getItem('foodbridgeCurrentUser') || '{}'); } catch (_) { return {}; } };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moneySafeDate = (v) => v ? new Date(v) : null;
  const timeAgo = (v) => {
    const d = moneySafeDate(v); if (!d || Number.isNaN(d.getTime())) return 'Recently';
    const mins = Math.max(1, Math.floor((Date.now() - d.getTime()) / 60000));
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + ' hr ago';
    const days = Math.floor(hrs / 24); return days + ' day' + (days > 1 ? 's' : '') + ' ago';
  };
  const fmtStatus = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  async function get(path) {
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.message || 'Request failed');
    return d;
  }

  function setProfile() {
    const u = user();
    const name = u.name || u.organization || 'FoodBridge User';
    const roleMap = { donor: 'Restaurant / Donor', receiver: 'NGO / Receiver', volunteer: 'Volunteer', admin: 'Admin' };
    const role = roleMap[String(u.role || '').toLowerCase()] || u.role || 'User';
    const initials = name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
    const p = document.querySelector('.dash-profile');
    if (p) {
      const b=p.querySelector('b'), s=p.querySelector('span'), a=p.querySelector('.dash-avatar');
      if (b) b.textContent=name; if(s) s.textContent=role; if(a) a.textContent=initials || 'FB';
    }
  }

  const nav = {
    donor: [
      ['dashboard.html','house','Dashboard'], ['dashboard-post-food.html','circle-plus','Post Food'], ['dashboard-my-donations.html','box','My Donations'], ['dashboard-requests.html','hand-holding-heart','Requests'], ['dashboard-notifications.html','bell','Notifications'], ['dashboard-my-impact.html','chart-line','FoodBridge Impact'], ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
    ],
    receiver: [
      ['dashboard.html','house','Dashboard'], ['dashboard-available-food.html','utensils','Available Food'], ['dashboard-requests.html','hand-holding-heart','My Requests'], ['dashboard-my-pickups.html','truck','Delivery Tracking'], ['dashboard-notifications.html','bell','Notifications'], ['dashboard-my-impact.html','chart-line','FoodBridge Impact'], ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
    ],
    volunteer: [
      ['dashboard.html','house','Dashboard'], ['dashboard-my-pickups.html','truck','Available Pickups'], ['dashboard-notifications.html','bell','Notifications'], ['dashboard-my-impact.html','chart-line','FoodBridge Impact'], ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
    ],
    admin: [
      ['dashboard.html','house','Dashboard'], ['dashboard-requests.html','hand-holding-heart','Requests'], ['dashboard-my-donations.html','box','Donations'], ['dashboard-my-pickups.html','truck','Pickups'], ['dashboard-notifications.html','bell','Notifications'], ['dashboard-settings.html','gear','Settings'], ['dashboard-help.html','circle-question','Help & Support']
    ]
  };

  function renderNav(role) {
    const box = document.querySelector('.dash-nav'); if (!box) return;
    box.innerHTML = (nav[role] || nav.donor).map((n,i) => `<a href="${n[0]}" class="${i===0?'active':''}"><i class="fa-solid fa-${n[1]}"></i>${esc(n[2])}</a>`).join('');
  }

  function stat(icon, num, label, sub='') {
    return `<div class="dstat"><i class="fa-solid fa-${icon}"></i><div class="num">${esc(num)}</div><div class="lbl">${esc(label)}</div>${sub?`<div class="delta">${esc(sub)}</div>`:''}</div>`;
  }
  function panel(title, link, body) {
    return `<div class="dash-panel"><div class="head"><h4>${esc(title)}</h4>${link?`<a href="${link}">View All</a>`:''}</div>${body}</div>`;
  }
  function empty(text, sub) { return `<div class="activity-row"><i class="fa-solid fa-circle-info"></i><div><b>${esc(text)}</b><span>${esc(sub || '')}</span></div></div>`; }
  function activity(icon, title, desc, date) { return `<div class="activity-row"><i class="fa-solid fa-${icon}"></i><div><b>${esc(title)}</b><span>${esc(desc)}</span><br><span>${esc(timeAgo(date))}</span></div></div>`; }

  function hero(role, u) {
    const name = u.name || u.organization || 'there';
    const data = {
      donor: ['Manage your surplus food and see exactly where your donations stand.', 'Post Food', 'dashboard-post-food.html', 'Your real donation data is shown below.'],
      receiver: ['Find available food, request what your organisation needs and track approved deliveries.', 'Find Food', 'dashboard-available-food.html', 'Your requests and available food come directly from FoodBridge.'],
      volunteer: ['Choose an available pickup yourself. The first volunteer to accept gets the pickup.', 'View Pickups', 'dashboard-my-pickups.html', 'Pickup availability and your delivery status are live.'],
      admin: ['Monitor live FoodBridge activity and platform operations.', 'View Requests', 'dashboard-requests.html', 'Platform figures below come from the connected backend.']
    }[role] || [];
    return `<div class="dash-hero"><div><span style="font-size:13px;color:#cfe0d4;">Welcome back, ${esc(name)}! 👋</span><h2>${esc(data[0])}</h2><p>${esc(data[3])}</p></div><button class="btn btn-white" onclick="location.href='${data[2]}'"><i class="fa-solid fa-arrow-right"></i> ${esc(data[1])}</button></div>`;
  }

  async function renderDonor() {
    const [d, r] = await Promise.all([get('/donations/my'), get('/requests/donations')]);
    const donations=d.donations||[], requests=r.requests||[];
    const delivered=donations.filter(x=>['delivered','completed'].includes(String(x.status||'').toLowerCase()));
    const active=donations.filter(x=>!['delivered','completed','cancelled','expired'].includes(String(x.status||'').toLowerCase()));
    const pending=requests.filter(x=>x.status==='pending');
    const meals=donations.reduce((a,x)=>a+(Number(x.quantity)||0),0);
    const activities=[];
    donations.slice(0,3).forEach(x=>activities.push(activity('box','Donation: '+(x.foodName||'Food'),fmtStatus(x.status||'available')+' • '+(x.quantity||0)+' '+(x.quantityUnit||'meals'),x.createdAt)));
    requests.slice(0,2).forEach(x=>activities.push(activity('hand-holding-heart','Request for '+(x.donation?.foodName||'food'),fmtStatus(x.status),x.createdAt)));
    document.querySelector('.dash-content').innerHTML = hero('donor',user()) + `<div class="dash-stats">${stat('box',donations.length,'Total Donations','Live from your account')}${stat('bowl-food',meals,'Meals Donated','Based on posted quantity')}${stat('box-open',active.length,'Active Donations','Currently in progress')}${stat('check-circle',delivered.length,'Completed Donations','Delivered / completed')}${stat('hand-holding-heart',pending.length,'Pending Requests','Waiting for your action')}</div><div class="dash-cols">${panel('Quick Actions','',`<div class="qa-grid"><div class="qa-item" onclick="location.href='dashboard-post-food.html'"><i class="fa-solid fa-circle-plus"></i><h5>Post Surplus Food</h5><p>Add a real food donation</p></div><div class="qa-item" onclick="location.href='dashboard-requests.html'"><i class="fa-solid fa-hand-holding-heart"></i><h5>Review Requests</h5><p>${pending.length} pending request${pending.length===1?'':'s'}</p></div><div class="qa-item" onclick="location.href='dashboard-my-donations.html'"><i class="fa-solid fa-box"></i><h5>My Donations</h5><p>${donations.length} total</p></div><div class="qa-item" onclick="location.href='dashboard-my-impact.html'"><i class="fa-solid fa-chart-line"></i><h5>FoodBridge Impact</h5><p>See your donation history</p></div></div>`)}${panel('Recent Activity','dashboard-my-donations.html',activities.length?activities.slice(0,5).join(''):empty('No donation activity yet','Post your first donation to see live activity here.'))}${panel('Requests Requiring Attention','dashboard-requests.html',requests.slice(0,4).map(x=>activity('hand-holding-heart',(x.donation?.foodName||'Food request'),(x.receiver?.name||'NGO')+' • '+fmtStatus(x.status),x.createdAt)).join('')||empty('No requests yet','New NGO requests will appear here.'))}</div>`;
  }

  async function renderReceiver() {
    const [foods, req] = await Promise.all([get('/donations'), get('/requests/my')]);
    const donations=foods.donations||[], requests=req.requests||[];
    const pending=requests.filter(x=>x.status==='pending'), approved=requests.filter(x=>x.status==='approved');
    const received=requests.filter(x=>['delivered','completed'].includes(String(x.status||'').toLowerCase()));
    const meals=requests.reduce((a,x)=>a+(Number(x.requestedQuantity)||0),0);
    const activities=requests.slice(0,5).map(x=>activity('hand-holding-heart','Request: '+(x.donation?.foodName||'Food'),fmtStatus(x.status)+' • '+(x.requestedQuantity||0)+' '+(x.donation?.quantityUnit||'meals'),x.createdAt));
    document.querySelector('.dash-content').innerHTML = hero('receiver',user()) + `<div class="dash-stats">${stat('utensils',donations.length,'Available Donations','Live available food')}${stat('hand-holding-heart',requests.length,'My Requests','All your requests')}${stat('clock',pending.length,'Pending Requests','Waiting for donor')}${stat('truck',approved.length,'Approved','Pickup / delivery pending')}${stat('check-circle',received.length,'Completed','Delivered requests')}</div><div class="dash-cols">${panel('Quick Actions','',`<div class="qa-grid"><div class="qa-item" onclick="location.href='dashboard-available-food.html'"><i class="fa-solid fa-utensils"></i><h5>Find Available Food</h5><p>${donations.length} donation${donations.length===1?'':'s'} available</p></div><div class="qa-item" onclick="location.href='dashboard-requests.html'"><i class="fa-solid fa-list-check"></i><h5>My Requests</h5><p>${pending.length} pending</p></div><div class="qa-item" onclick="location.href='dashboard-my-pickups.html'"><i class="fa-solid fa-truck"></i><h5>Track Delivery</h5><p>${approved.length} approved</p></div><div class="qa-item" onclick="location.href='dashboard-my-impact.html'"><i class="fa-solid fa-chart-line"></i><h5>FoodBridge Impact</h5><p>${meals} meals requested</p></div></div>`)}${panel('Recent Requests','dashboard-requests.html',activities.length?activities.join(''):empty('No requests yet','Request available food to start your workflow.'))}${panel('Available Food Now','dashboard-available-food.html',donations.slice(0,4).map(x=>activity('bowl-food',x.foodName||'Food',`${x.quantity||0} ${x.quantityUnit||'meals'} • ${x.pickupLocation||'Pickup location'}`,x.createdAt)).join('')||empty('No food available','There are no live donations available right now.'))}</div>`;
  }

  async function renderVolunteer() {
    const [available, mine] = await Promise.all([get('/pickups/available'), get('/pickups/my')]);
    const a=available.pickups||[], m=mine.pickups||[];
    const active=m.filter(x=>!['delivered','cancelled'].includes(String(x.status||'').toLowerCase()));
    const completed=m.filter(x=>x.status==='delivered');
    const activities=[...m.slice(0,4).map(x=>activity('truck',x.donation?.foodName||'Pickup',fmtStatus(x.status),x.updatedAt||x.createdAt)),...a.slice(0,3).map(x=>activity('hand', 'Pickup available',x.donation?.foodName||'Food donation',x.createdAt))];
    document.querySelector('.dash-content').innerHTML = hero('volunteer',user()) + `<div class="dash-stats">${stat('truck',a.length,'Available Pickups','Anyone can accept')}${stat('hand',active.length,'My Active Pickups','Accepted by you')}${stat('check-circle',completed.length,'Completed Deliveries','Your delivered pickups')}${stat('bowl-food',m.reduce((s,x)=>s+(Number(x.donation?.quantity)||0),0),'Meals Delivered','From your pickup data')}${stat('route',a.length+active.length,'Tasks Visible','Live pickup queue')}</div><div class="dash-cols">${panel('Quick Actions','',`<div class="qa-grid"><div class="qa-item" onclick="location.href='dashboard-my-pickups.html'"><i class="fa-solid fa-hand"></i><h5>Accept a Pickup</h5><p>${a.length} available right now</p></div><div class="qa-item" onclick="location.href='dashboard-my-pickups.html'"><i class="fa-solid fa-truck"></i><h5>My Pickups</h5><p>${active.length} active</p></div><div class="qa-item" onclick="location.href='dashboard-my-pickups.html'"><i class="fa-solid fa-map-location-dot"></i><h5>Open Map</h5><p>Map appears after you accept</p></div><div class="qa-item" onclick="location.href='dashboard-my-impact.html'"><i class="fa-solid fa-chart-line"></i><h5>FoodBridge Impact</h5><p>${completed.length} completed delivery${completed.length===1?'':'ies'}</p></div></div>`)}${panel('Pickup Activity','dashboard-my-pickups.html',activities.length?activities.slice(0,6).join(''):empty('No pickup activity','Available jobs will appear after an approved NGO request.'))}${panel('Available for You','dashboard-my-pickups.html',a.slice(0,5).map(x=>activity('hand',x.donation?.foodName||'Food pickup',`${x.donation?.quantity||0} ${x.donation?.quantityUnit||'meals'} • ${x.pickupLocation||x.donation?.pickupLocation||'Pickup location'}`,x.createdAt)).join('')||empty('No available pickups','When a donor approves an NGO request, the pickup will appear here.'))}</div>`;
  }

  async function renderAdmin() {
    const [foods, req, pickups] = await Promise.all([get('/donations'), get('/requests/donations'), get('/pickups/available')]);
    document.querySelector('.dash-content').innerHTML = hero('admin',user()) + `<div class="dash-stats">${stat('utensils',foods.donations?.length||0,'Available Donations','Live')}${stat('hand-holding-heart',req.requests?.length||0,'Donation Requests','Live')}${stat('truck',pickups.pickups?.length||0,'Unclaimed Pickups','Live')}${stat('chart-line',(foods.donations?.reduce((s,x)=>s+(Number(x.quantity)||0),0)||0),'Available Meals','Current quantity')}</div><div class="dash-cols">${panel('Platform Snapshot','',empty('Admin monitoring','Use the Requests, Donations and Pickups sections for live operational data.'))}${panel('Available Donations','dashboard-available-food.html',(foods.donations||[]).slice(0,5).map(x=>activity('bowl-food',x.foodName||'Food',`${x.quantity||0} ${x.quantityUnit||'meals'} • ${x.pickupLocation||'Location'}`,x.createdAt)).join('')||empty('No available donations',''))}${panel('Unclaimed Pickups','dashboard-my-pickups.html',(pickups.pickups||[]).slice(0,5).map(x=>activity('truck',x.donation?.foodName||'Pickup',x.pickupLocation||'Pickup location',x.createdAt)).join('')||empty('No unclaimed pickups',''))}</div>`;
  }

  async function init() {
    const role=String(user().role||'donor').toLowerCase();
    setProfile(); renderNav(role);
    const search=document.querySelector('.dash-search input'); if(search) search.placeholder=role==='volunteer'?'Search pickups or deliveries...':role==='receiver'?'Search food or requests...':'Search donations or requests...';
    try {
      if(role==='receiver') await renderReceiver();
      else if(role==='volunteer') await renderVolunteer();
      else if(role==='admin') await renderAdmin();
      else await renderDonor();
    } catch (e) {
      console.error('Role dashboard error:',e);
      document.querySelector('.dash-content').innerHTML = hero(role,user()) + `<div class="dash-panel" style="margin-top:20px"><div class="head"><h4>Live data unavailable</h4></div>${empty('Could not load dashboard data','Make sure the FoodBridge backend is running on localhost:5000 and log in again.')}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
