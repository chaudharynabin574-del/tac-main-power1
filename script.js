const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let currentManualMode = true;

function qs(id){ return document.getElementById(id); }

// -------- Screen switching --------
function showLogin(){ qs('loginScreen').style.display='flex'; qs('forgotScreen').style.display='none'; qs('dashScreen').style.display='none'; }
function showForgot(){ qs('loginScreen').style.display='none'; qs('forgotScreen').style.display='flex'; }
function showDash(){ qs('loginScreen').style.display='none'; qs('forgotScreen').style.display='none'; qs('dashScreen').style.display='block'; }

// -------- API helper --------
async function api(path, method='GET', body=null){
  const opts = { method, headers:{} };
  if (body){
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch(e){}
  if (!res.ok) throw (data.error || 'Request failed');
  return data;
}

// -------- Login --------
async function doLogin(){
  qs('loginError').innerText = '';
  try{
    await api('/api/login','POST',{username:qs('loginUser').value, password:qs('loginPass').value});
    await loadStatus();
    showDash();
    startClock();
    loadSchedule();
  }catch(e){
    qs('loginError').innerText = typeof e === 'string' ? e : 'Login failed';
  }
}

async function doLogout(){
  try{ await api('/api/logout','POST'); }catch(e){}
  showLogin();
}

// -------- Forgot password / OTP --------
async function requestOtp(){
  try{
    await api('/api/otp/request','POST',{username:qs('forgotUser').value, email:qs('forgotEmail').value});
    qs('forgotStep1').style.display='none';
    qs('forgotStep2').style.display='block';
    qs('forgotMsg').style.color = 'green';
    qs('forgotMsg').innerText = 'OTP sent to email (if account exists).';
  }catch(e){ qs('forgotMsg').innerText = 'Failed to send OTP'; }
}
async function verifyOtp(){
  try{
    await api('/api/otp/verify','POST',{
      username: qs('forgotUser').value,
      otp: qs('otpCode').value,
      newPassword: qs('newPass').value
    });
    qs('forgotMsg').style.color='green';
    qs('forgotMsg').innerText = 'Password reset! Please login.';
    setTimeout(showLogin, 1500);
  }catch(e){
    qs('forgotMsg').style.color='red';
    qs('forgotMsg').innerText = typeof e === 'string' ? e : 'Reset failed';
  }
}

// -------- Status / dashboard --------
async function loadStatus(){
  const s = await api('/api/status');
  applyStatus(s);
  return s;
}

function applyStatus(s){
  currentManualMode = s.manualMode;
  setPushUI(s.relay);
  document.querySelector(`input[name=mode][value=${s.manualMode?'manual':'schedule'}]`).checked = true;
  qs('schedulePanel').style.display = s.manualMode ? 'none' : 'block';
  qs('topCompanyName').innerText = s.company;
  qs('loginCompanyName').innerText = s.company;
  if (s.logo){
    qs('topLogo').src = s.logo; qs('topLogo').style.display='inline';
    qs('loginLogo').src = s.logo; qs('loginLogo').style.display='inline';
  }
  qs('clock12h').innerText = s.time12h;
}

function setPushUI(on){
  qs('statusText').innerText = on ? 'ON' : 'OFF';
  qs('statusText').className = 'status-text ' + (on?'on':'off');
  qs('pushBtn').className = 'push-btn ' + (on?'on':'off');
  qs('pushLabel').innerText = on ? 'ON' : 'OFF';
}

async function togglePush(){
  if (!currentManualMode){ alert('Switch to Manual mode to control relay directly.'); return; }
  const s = await api('/api/status');
  const newState = !s.relay;
  await api('/api/relay','POST',{state:newState?'on':'off'});
  setPushUI(newState);
}

async function setMode(mode){
  await api('/api/mode','POST',{mode});
  currentManualMode = (mode === 'manual');
  qs('schedulePanel').style.display = currentManualMode ? 'none' : 'block';
}

function startClock(){
  setInterval(async ()=>{
    try{
      const s = await api('/api/status');
      qs('clock12h').innerText = s.time12h;
      setPushUI(s.relay);
    }catch(e){ /* session may have expired */ }
  }, 5000);
}

// -------- Schedule --------
async function loadSchedule(){
  const sch = await api('/api/schedule');
  const list = qs('scheduleList');
  list.innerHTML = '';
  sch.forEach((d, i)=>{
    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <label class="day-name">${dayNames[i]}</label>
      <input type="checkbox" ${d.enabled?'checked':''} onchange="updateDay(${i},this)">
      ON <input type="time" value="${pad(d.onHour)}:${pad(d.onMin)}" id="on_${i}">
      OFF <input type="time" value="${pad(d.offHour)}:${pad(d.offMin)}" id="off_${i}">
      <button class="btn small" onclick="saveDay(${i})">Save</button>
    `;
    list.appendChild(row);
  });
}
function pad(n){ return String(n).padStart(2,'0'); }

async function saveDay(i){
  const enabled = qs('scheduleList').children[i].querySelector('input[type=checkbox]').checked;
  const onVal = qs('on_'+i).value.split(':');
  const offVal = qs('off_'+i).value.split(':');
  await api('/api/schedule','POST',{
    day:i, enabled: enabled?'1':'0',
    onHour:onVal[0], onMin:onVal[1],
    offHour:offVal[0], offMin:offVal[1]
  });
}
function updateDay(i, cb){ /* saved when user clicks Save button */ }

// -------- Settings modal --------
function openSettings(){ qs('settingsModal').style.display='flex'; qs('setCompanyName').value = qs('topCompanyName').innerText; }
function closeSettings(){ qs('settingsModal').style.display='none'; }
function showTab(id){
  document.querySelectorAll('.tab-content').forEach(t=>t.style.display='none');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  qs(id).style.display='block';
  event.target.classList.add('active');
}

function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function saveCompany(){
  const body = { name: qs('setCompanyName').value };
  const file = qs('setLogoFile').files[0];
  if (file) body.logo = await fileToBase64(file);
  await api('/api/company','POST',body);
  await loadStatus();
  alert('Saved');
}

async function saveWifi(){
  await api('/api/wifi','POST',{ssid:qs('setSsid').value, pass:qs('setWifiPass').value});
  alert('Saving... device will reboot and reconnect to the new network.');
}

async function saveMqtt(){
  await api('/api/mqtt','POST',{
    enabled: qs('mqttEnabled').checked?'1':'0',
    server: qs('mqttServer').value,
    port: qs('mqttPort').value,
    user: qs('mqttUser').value,
    pass: qs('mqttPass').value,
    topicCmd: qs('mqttTopicCmd').value,
    topicState: qs('mqttTopicState').value
  });
  alert('MQTT settings saved');
}

async function saveNotify(){
  await api('/api/notify','POST',{
    enabled: qs('notifyEnabled').checked?'1':'0',
    email: qs('notifyEmail').value,
    smtpHost: qs('smtpHost').value,
    smtpPort: qs('smtpPort').value,
    smtpUser: qs('smtpUser').value,
    smtpPass: qs('smtpPass').value
  });
  alert('Notification settings saved');
}

async function addUser(){
  qs('userMsg').innerText='';
  try{
    await api('/api/adduser','POST',{username:qs('newUsername').value, password:qs('newUserPass').value});
    qs('userMsg').style.color='green';
    qs('userMsg').innerText='User added';
  }catch(e){
    qs('userMsg').style.color='red';
    qs('userMsg').innerText = typeof e==='string'?e:'Failed (admin only)';
  }
}

// -------- Init --------
(async function init(){
  try{
    await loadStatus();
    showDash();
    startClock();
    loadSchedule();
  }catch(e){
    showLogin();
  }
})();
