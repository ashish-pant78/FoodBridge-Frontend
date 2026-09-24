(function(){
  'use strict';
  const API='https://foodbridge-backend-udfx.onrender.com/api';
  const token=()=>localStorage.getItem('foodbridgeToken')||'';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const role=()=>{try{return String(JSON.parse(localStorage.getItem('foodbridgeCurrentUser')||'{}').role||'').toLowerCase()}catch(_){return ''}};
  const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  const status=s=>`<span class="badge ${esc(String(s||'').toLowerCase())}">${esc(String(s||'—').replace(/_/g,' '))}</span>`;
  const cell=(v)=>`<td>${esc(v||'—')}</td>`;
  async function getDashboard(){
    const r=await fetch(API+'/admin/dashboard',{headers:{Authorization:'Bearer '+token()}});
    const d=await r.json().catch(()=>({}));
    if(r.status===401||r.status===403){localStorage.removeItem('foodbridgeToken');localStorage.removeItem('foodbridgeCurrentUser');location.href='login.html';throw new Error(d.message||'Admin access required');}
    if(!r.ok||!d.success)throw new Error(d.message||'Unable to load admin data');
    return d;
  }
  function renderCards(o){
    const cards=[
      ['users','Users',o.users.total,`Restaurants ${o.users.donors} • NGOs ${o.users.receivers} • Volunteers ${o.users.volunteers}`],
      ['store','Food Posts',o.donations.total,`Available ${o.donations.available} • Delivered ${o.donations.delivered}`],
      ['hand-holding-heart','Requests',o.requests.total,`Pending ${o.requests.pending} • Approved ${o.requests.approved} • Completed ${o.requests.completed}`],
      ['truck','Pickups',o.pickups.total,`Assigned ${o.pickups.assigned} • Accepted ${o.pickups.accepted} • Delivered ${o.pickups.completed}`]
    ];
    document.getElementById('cards').innerHTML=cards.map(x=>`<div class="admin-card"><div class="ico"><i class="fa-solid fa-${x[0]}"></i></div><div class="num">${esc(x[2])}</div><div class="label">${esc(x[1])}</div><div class="sub">${esc(x[3])}</div></div>`).join('');
  }
  function renderUsers(items){
    document.getElementById('userCount').textContent=items.length+' users';
    document.getElementById('usersBody').innerHTML=items.length?items.map(u=>`<tr>${cell(u.name)}<td>${status(u.role)}</td>${cell(u.email)}${cell(u.phone)}${cell(u.organization)}${cell(u.location)}<td>${u.isVerified?'<span class="badge delivered">Verified</span>':'<span class="badge pending">Not verified</span>'}</td>${cell(fmtDate(u.createdAt))}</tr>`).join(''):'<tr><td colspan="8" class="empty-admin">No users found in MongoDB.</td></tr>';
  }
  function renderDonations(items){
    document.getElementById('donationCount').textContent=items.length+' posts';
    document.getElementById('donationsBody').innerHTML=items.length?items.map(x=>`<tr><td><strong>${esc(x.donor?.organization||x.donor?.name||'Unknown restaurant')}</strong><br><span class="muted">${esc(x.donor?.email||'')}</span></td>${cell(x.foodName)}${cell((x.quantity||0)+' '+(x.quantityUnit||'meals'))}<td>${status(x.status)}</td>${cell(x.pickupLocation)}${cell(fmtDate(x.createdAt))}</tr>`).join(''):'<tr><td colspan="6" class="empty-admin">No restaurant food posts found.</td></tr>';
  }
  function renderRequests(items){
    document.getElementById('requestCount').textContent=items.length+' requests';
    document.getElementById('requestsBody').innerHTML=items.length?items.map(x=>{const n=x.receiver?.organization||x.receiver?.name||'Unknown NGO';const r=x.donation?.donor?.organization||x.donation?.donor?.name||'Unknown restaurant';return `<tr><td><strong>${esc(n)}</strong><br><span class="muted">${esc(x.receiver?.email||'')}</span></td><td>${esc(r)}</td>${cell(x.donation?.foodName)}${cell((x.requestedQuantity||0)+' '+(x.donation?.quantityUnit||'meals'))}<td>${status(x.status)}</td><td>${status(x.donation?.status)}</td>${cell(fmtDate(x.createdAt))}</tr>`}).join(''):'<tr><td colspan="7" class="empty-admin">No NGO requests found.</td></tr>';
  }
  function renderPickups(items){
    document.getElementById('pickupCount').textContent=items.length+' pickups';
    document.getElementById('pickupsBody').innerHTML=items.length?items.map(x=>{const d=x.donation||{};const r=d.donor?.organization||d.donor?.name||'Unknown restaurant';const n=x.request?.receiver?.organization||x.request?.receiver?.name||'Unknown NGO';const v=x.volunteer?.name||'Not accepted yet';return `<tr>${cell(d.foodName)}${cell(r)}${cell(n)}<td><strong>${esc(v)}</strong>${x.volunteer?.email?`<br><span class="muted">${esc(x.volunteer.email)}</span>`:''}</td>${cell((d.quantity||0)+' '+(d.quantityUnit||'meals'))}<td>${status(x.status)}</td>${cell(x.pickupLocation)}${cell(fmtDate(x.createdAt))}</tr>`}).join(''):'<tr><td colspan="8" class="empty-admin">No pickups found.</td></tr>';
  }
  async function loadAdminDashboard(){
    try{
      if(role()!=='admin'){location.href='login.html';return;}
      const d=await getDashboard();
      renderCards(d.overview);renderUsers(d.users||[]);renderDonations(d.donations||[]);renderRequests(d.requests||[]);renderPickups(d.pickups||[]);
      const when=new Date(d.generatedAt||Date.now());
      document.getElementById('lastUpdated').textContent='Updated '+when.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      document.getElementById('snapshotText').textContent='Live MongoDB snapshot • '+fmtDate(d.generatedAt);
    }catch(e){console.error(e);document.getElementById('cards').innerHTML=`<div class="admin-section" style="grid-column:1/-1"><div class="empty-admin"><strong>Could not load MongoDB data.</strong><br>${esc(e.message||'Start the backend and log in again.')}</div></div>`;}
  }
  function adminLogout(){localStorage.removeItem('foodbridgeToken');localStorage.removeItem('foodbridgeCurrentUser');location.href='login.html';}
  window.loadAdminDashboard=loadAdminDashboard;window.adminLogout=adminLogout;
  document.addEventListener('DOMContentLoaded',loadAdminDashboard);
  setInterval(()=>{if(document.visibilityState==='visible'&&role()==='admin')loadAdminDashboard()},15000);
})();
