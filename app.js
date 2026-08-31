
let loginRole='admin', resolveId=null, ovCI=null, chatHistory=[], isBotTyping=false;
let lastEmployeeSheetModifiedAt=0, employeeSheetSyncing=false, employeeSheetPushing=false, employeeSheetPushTimer=null;
let assetSheetPushing=false, assetSheetPushTimer=null;
const ASSET_SHEET_HEADERS=[
  'recordType','companyId','companyName','assetTag','assetType','typeLabel','brandModel',
  'condition','status','employeeId','employeeCode','employeeName','department',
  'allocatedAt','returnedAt','purchaseDate','remarks','createdAt','createdBy',
  'inventoryId','employeeAssetId','otherDetail'
];
let pidNext=6;
const COMPANY={
  companyName:'Vayana Network',
  portalName:'Interlace',
  portalSubtitle:'Internal HR Portal',
  supportEmail:'hr@vayana.com',
  securityNotice:'Authorized employees only. Activity may be reviewed for HR governance.',
  showDemoCredentials:false,
  ...(window.VAYANAPULSE_COMPANY||window.HRPULSE_COMPANY||{})
};

const PORTAL_ALL_COMPANIES_ID=window.VAYANAPULSE_ALL_COMPANIES_ID||'all';
const PORTAL_COMPANIES=window.VAYANAPULSE_COMPANIES||[
  {id:'VNSPL',code:'VNSPL',name:'Vay Network Services Private Limited',shortName:'Vayana',isParent:true},
  {id:'HYLO',code:'HYLO',name:'Hylobiz Challanger Private Limited',shortName:'Hylobiz',isParent:false},
  {id:'VTX',code:'VTX',name:'Vayana IFSC Private Limited',shortName:'IFSC',isParent:false},
  {id:'Rubix',code:'Rubix',name:'Rubix Data Science Private Limited',shortName:'Rubix',isParent:false},
  {id:'VFPL',code:'VFPL',name:'Vayana Finserv Private Limited',shortName:'Finserv',isParent:false}
];
const LEGACY_COMPANY_IDS=window.VAYANAPULSE_LEGACY_COMPANY_IDS||{
  'co-vayana':'VNSPL','co-1':'VNSPL','co-2':'HYLO','co-3':'VTX','co-4':'Rubix','co-5':'VFPL'
};
const PARENT_COMPANY_ID=PORTAL_COMPANIES.find(c=>c.isParent)?.id||PORTAL_COMPANIES[0]?.id||'VNSPL';
const HRP_COMPANY_KEY='hrpulse_active_company_v1';
let activeCompanyId=localStorage.getItem(HRP_COMPANY_KEY)||PORTAL_ALL_COMPANIES_ID;
if(activeCompanyId&&activeCompanyId!==PORTAL_ALL_COMPANIES_ID){
  activeCompanyId=resolveCompanyId(activeCompanyId);
  localStorage.setItem(HRP_COMPANY_KEY,activeCompanyId);
}

function resolveCompanyId(value){
  const raw=String(value||'').trim();
  if(!raw||raw===PORTAL_ALL_COMPANIES_ID) return raw||PORTAL_COMPANIES[0]?.id||'VNSPL';
  if(LEGACY_COMPANY_IDS[raw]) return LEGACY_COMPANY_IDS[raw];
  if(PORTAL_COMPANIES.some(c=>c.id===raw)) return raw;
  const byCode=PORTAL_COMPANIES.find(c=>String(c.code||'').toLowerCase()===raw.toLowerCase());
  return byCode?.id||PORTAL_COMPANIES[0]?.id||'VNSPL';
}
function companyOptionLabel(company){
  if(!company||company.isAll||company.id===PORTAL_ALL_COMPANIES_ID) return 'All Entities';
  return company.code?`${company.code} — ${company.name}`:company.name;
}

function isAllCompaniesView(){
  return activeCompanyId===PORTAL_ALL_COMPANIES_ID;
}

function getActiveCompany(){
  if(isAllCompaniesView()){
    return {id:PORTAL_ALL_COMPANIES_ID,code:'',name:'All Entities',isAll:true};
  }
  return PORTAL_COMPANIES.find(c=>c.id===resolveCompanyId(activeCompanyId))||PORTAL_COMPANIES[0]||{id:'VNSPL',code:'VNSPL',name:COMPANY.companyName};
}

function applyActiveCompanyName(){
  const active=getActiveCompany();
  if(active?.isAll) COMPANY.companyName='All Entities';
  else if(active?.name) COMPANY.companyName=active.name;
}

function hrHeaderCompanyName(){
  if(isCompanyHrSession()){
    const name=companyNameById(lockedHrCompanyId()||PARENT_COMPANY_ID);
    return `HR · ${name}`;
  }
  const active=getActiveCompany();
  if(active?.isAll) return 'Super Admin';
  return `Super Admin · ${active?.name||'All Entities'}`;
}

function updateHrProfileChip(){
  const hrTopName=document.getElementById('hrTopName')||document.querySelector('#s-admin .topbar .uname');
  if(!hrTopName) return;
  hrTopName.textContent=hrHeaderCompanyName();
  hrTopName.title=hrHeaderCompanyName();
}

function syncAdminCompanySelect(){
  const select=document.getElementById('adminCompanySelect');
  const label=document.getElementById('adminCompanySelectLabel');
  const lockedEl=document.getElementById('adminCompanyLocked');
  const lockedName=document.getElementById('adminCompanyLockedName');
  const switchWrap=document.getElementById('adminCompanySwitch');
  if(!select) return;
  const lockedCompany=typeof isCompanyHrSession==='function'&&isCompanyHrSession();
  const lockedId=lockedCompany?(typeof lockedHrCompanyId==='function'?lockedHrCompanyId():null)||PORTAL_COMPANIES[0]?.id:'';
  const lockedCompanyMeta=lockedCompany?PORTAL_COMPANIES.find(c=>c.id===lockedId):null;
  const current=getActiveCompany();
  if(lockedCompany){
    select.innerHTML='';
    select.value='';
    select.disabled=true;
    select.hidden=true;
    if(label) label.hidden=true;
    if(lockedEl) lockedEl.hidden=false;
    if(lockedName) lockedName.textContent=lockedCompanyMeta?companyOptionLabel(lockedCompanyMeta):(companyNameById(lockedId)||'Company');
    if(switchWrap){
      switchWrap.classList.add('is-locked');
      switchWrap.title='Your assigned entity';
    }
    updateHrProfileChip();
    return;
  }
  select.hidden=false;
  select.disabled=false;
  if(label) label.hidden=false;
  if(lockedEl) lockedEl.hidden=true;
  if(switchWrap){
    switchWrap.classList.remove('is-locked');
    switchWrap.title='Switch entity';
  }
  select.innerHTML=[
    `<option value="${PORTAL_ALL_COMPANIES_ID}">All Entities</option>`,
    ...PORTAL_COMPANIES.map(c=>`<option value="${c.id}">${safeText(companyOptionLabel(c))}</option>`)
  ].join('');
  select.value=current.id;
  updateHrProfileChip();
}

window.switchAdminCompany=function(companyId){
  if(isCompanyHrSession()){
    toast('Company HR can only access their assigned company');
    syncAdminCompanySelect();
    return;
  }
  const next=companyId===PORTAL_ALL_COMPANIES_ID
    ?{id:PORTAL_ALL_COMPANIES_ID,code:'',name:'All Entities',isAll:true}
    :PORTAL_COMPANIES.find(c=>c.id===resolveCompanyId(companyId));
  if(!next) return;
  if(typeof appointmentDraftEditing!=='undefined'&&appointmentDraftEditing&&typeof toggleAppointmentDraftEdit==='function'){
    toggleAppointmentDraftEdit(false);
  }
  activeCompanyId=next.id;
  localStorage.setItem(HRP_COMPANY_KEY,activeCompanyId);
  applyActiveCompanyName();
  applyCompanyBranding();
  syncAdminCompanySelect();
  if(document.getElementById('pg-documents')?.classList.contains('act')){
    if(typeof renderAppointmentLetterPreview==='function') renderAppointmentLetterPreview();
    if(typeof renderAdminDocuments==='function') renderAdminDocuments();
  }
  if(document.getElementById('pg-assets')?.classList.contains('act')&&typeof renderAdminAssets==='function') renderAdminAssets();
  if(document.getElementById('pg-employees')?.classList.contains('act')&&typeof renderEmpTable==='function') renderEmpTable();
  if(document.getElementById('pg-salaries')?.classList.contains('act')&&typeof renderSalaries==='function') renderSalaries();
  if(typeof updateEmpSyncExcelHint==='function') updateEmpSyncExcelHint();
  if(document.getElementById('pg-hrAccess')?.classList.contains('act')&&typeof renderHrAdminList==='function') renderHrAdminList();
  if(document.getElementById('pg-announcements')?.classList.contains('act')&&typeof renderAnnouncements==='function') renderAnnouncements();
  if(document.getElementById('pg-colleagues')?.classList.contains('act')&&typeof renderColleagues==='function') renderColleagues();
  try{
    if(typeof renderOverview==='function') renderOverview();
    if(typeof renderPolicies==='function') renderPolicies();
    if(typeof renderQueries==='function') renderQueries();
  }catch(err){console.error(err);}
  toast(next.isAll?'Viewing all entities':`Switched to ${companyOptionLabel(next)}`);
};

function applyHrCompanyScopeFromUser(user){
  if(!user) return;
  const hr=(store.hrs||[]).find(h=>h.id===user.id||h.id===user.hrId||String(h.email||'').toLowerCase()===String(user.email||'').toLowerCase())||user;
  if(hasManagementAccess()||currentUser?.portal==='hr'){
    // Preserve linked employee identity — spreading hr would overwrite id with the HR login id
    const empId=currentUser?.employeeId||(employeeById(currentUser?.id)?.id)||null;
    const empCode=currentUser?.employeeCode;
    currentUser={
      ...currentUser,
      ...hr,
      portal:currentUser?.portal||'hr',
      isCentral:currentUser?.isCentral??(hr.accessRole==='central'),
      isCompanyHr:currentUser?.isCompanyHr??(hr.accessRole==='company'),
      isEmployee:currentUser?.isEmployee??true,
      isBuHead:currentUser?.isBuHead,
      roles:currentUser?.roles||[],
      hrId:hr.id||currentUser?.hrId,
      ...(empId?{id:empId,employeeId:empId}:{}),
      ...(empCode?{employeeCode:empCode}:{})
    };
  }
  if(hr.accessRole==='company'){
    activeCompanyId=hr.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL';
    localStorage.setItem(HRP_COMPANY_KEY,activeCompanyId);
  }
  applyActiveCompanyName();
  syncAdminCompanySelect();
}

applyActiveCompanyName();

const CREDS={admin:{e:'admin@company.com',p:'admin@123'},employee:{e:'priya@company.com',p:'emp123'}};

let policies=[
  {id:1,name:'Annual Leave Policy',cat:'Leave',status:'Active',date:'2024-01-01',desc:'Employees get 18 days of paid annual leave per year, accruing at 1.5 days per month. Up to 5 unused days can be carried forward to the next year.'},
  {id:2,name:'Sick Leave Policy',cat:'Leave',status:'Active',date:'2024-01-01',desc:'Up to 8 days paid sick leave per year. A medical certificate is required for absences of 3 or more consecutive days.'},
  {id:3,name:'Work from Home Policy',cat:'Remote Work',status:'Active',date:'2024-03-01',desc:'Employees may WFH up to 3 days per week with manager approval. Not available during the first 3 months of employment (probation). A stable internet connection and distraction-free workspace are required.'},
  {id:4,name:'Maternity & Paternity Leave',cat:'Benefits',status:'Draft',date:'2025-01-01',desc:'26 weeks maternity leave and 2 weeks paternity leave per statutory norms. Applicable after 6 months of continuous employment.'},
  {id:5,name:'2022 Attendance Policy',cat:'Attendance',status:'Archived',date:'2022-01-01',desc:'Legacy guidelines superseded by the 2024 policy.'},
];

let queries=[
  {id:1,emp:'Priya K.',subject:'Comp-off encashment',msg:'Can unused comp-off be encashed at year end?',status:'open',response:null,createdAt:'2026-06-18T09:10:00+05:30'},
  {id:2,emp:'Rajan M.',subject:'WFH during probation',msg:'Am I eligible for WFH during probation period?',status:'open',response:null,createdAt:'2026-06-18T09:35:00+05:30'},
  {id:3,emp:'Ananya T.',subject:'Sick leave certificate',msg:'Is a medical cert needed for a 2-day absence?',status:'pending',response:null,createdAt:'2026-06-18T10:05:00+05:30'},
  {id:4,emp:'Dev K.',subject:'Carry forward limit',msg:'How many leaves can I carry to next year?',status:'resolved',response:'Up to 5 days per Annual Leave Policy (Section 4).',createdAt:'2026-06-17T16:20:00+05:30'},
];

let lv={annual:{u:8,t:18},sick:{u:2,t:8},wfh:{u:5,t:12},comp:{u:1,t:3}};

function selRole(r){
  loginRole=r;
  document.getElementById('rt-admin').classList.toggle('sel',r==='admin');
  document.getElementById('rt-emp').classList.toggle('sel',r==='employee');
  document.getElementById('lEmail').value='';
  document.getElementById('lPass').value='';
}

function logout(){
  showScreen('s-login');
}

function aPage(pg,el){goPage(pg,el);}
function ePage(pg,el){goPage(pg,el);}

function renderPolicies(){
  const l=document.getElementById('polList');
  l.innerHTML='';
  policies.forEach(p=>{
    const d=document.createElement('div');
    d.className='row-item';
    d.innerHTML=`<div><div class="ri-name">${p.name}</div><div class="ri-meta">${p.cat} · ${p.date}</div></div><div class="ri-right"><span class="badge b-${p.status.toLowerCase()}">${p.status}</span><button class="btn sm" title="Cycle status" onclick="cycleStatus(${p.id})"><i class="ti ti-refresh" aria-hidden="true"></i></button><button class="btn sm danger" title="Delete" onclick="delPol(${p.id})"><i class="ti ti-trash" aria-hidden="true"></i></button></div>`;
    l.appendChild(d);
  });
  document.getElementById('sTot').textContent=policies.length;
  document.getElementById('sAct').textContent=policies.filter(p=>p.status==='Active').length;
  document.getElementById('sDraft').textContent=policies.filter(p=>p.status==='Draft').length;
  document.getElementById('sArch').textContent=policies.filter(p=>p.status==='Archived').length;
}

function renderQueries(){
  const l=document.getElementById('aQList');
  l.innerHTML='';
  queries.forEach(q=>{
    const d=document.createElement('div');
    d.className='row-item';
    d.style.cssText='flex-direction:column;align-items:flex-start;gap:6px';
    d.innerHTML=`<div style="display:flex;justify-content:space-between;width:100%;align-items:center"><div><div class="ri-name">${q.subject}</div><div class="ri-meta">${q.emp} · ${q.msg.slice(0,55)}${q.msg.length>55?'…':''}</div></div><span class="badge b-${q.status}">${q.status}</span></div>${q.response?`<div style="font-size:11px;color:var(--color-text-success);background:var(--color-background-success);padding:5px 8px;border-radius:4px;width:100%"><i class="ti ti-check" aria-hidden="true"></i> ${q.response}</div>`:q.status!=='resolved'?`<button class="btn sm" onclick="openResolve(${q.id})">Respond &amp; resolve</button>`:''}`;
    l.appendChild(d);
  });
  const open=queries.filter(q=>q.status!=='resolved').length;
  document.getElementById('qBadge').textContent=open;
  if(document.getElementById('ovQ')) document.getElementById('ovQ').textContent=open;
}

function renderEmpTable(){
  const emps=[
    {name:'Priya K.',dept:'Engineering',au:8,at:18,su:2,wu:5},
    {name:'Rajan M.',dept:'Finance',au:5,at:18,su:0,wu:3},
    {name:'Ananya T.',dept:'Design',au:12,at:18,su:3,wu:7},
    {name:'Dev K.',dept:'Marketing',au:2,at:18,su:1,wu:4},
  ];
  document.getElementById('eTable').innerHTML=`<thead><tr><th>Name</th><th>Dept</th><th>Annual used</th><th>Annual left</th><th>Sick used</th><th>WFH used</th></tr></thead><tbody>${emps.map(e=>{const al=e.at-e.au;return `<tr><td style="font-weight:500">${e.name}</td><td style="color:var(--color-text-secondary)">${e.dept}</td><td>${e.au}</td><td style="color:${al<5?'#A32D2D':'#3B6D11'}">${al}</td><td>${e.su}</td><td>${e.wu}</td></tr>`;}).join('')}</tbody>`;
}

function renderOverview(){
  if(document.getElementById('ovAct')) document.getElementById('ovAct').textContent=policies.filter(p=>p.status==='Active').length;
  const engagement=document.getElementById('engagementAdminStats');
  if(engagement&&store){
    const moodCount=(store.moodPulse||[]).length;
    const wallCount=(store.teamWall||[]).length;
    const completions=store.employees.reduce((sum,e)=>sum+(e.learningCompletions||[]).length,0);
    const acknowledged=store.employees.reduce((sum,e)=>sum+(e.documents||[]).filter(d=>d.acknowledgedAt).length,0);
    engagement.innerHTML=`<div class="engage-stats"><div><span>Mood check-ins</span><strong>${moodCount}</strong></div><div><span>Wall posts</span><strong>${wallCount}</strong></div><div><span>Lessons done</span><strong>${completions}</strong></div><div><span>Docs acknowledged</span><strong>${acknowledged}</strong></div></div>`;
  }
  const ctx=document.getElementById('ovChart');
  if(!ctx) return;
  if(ovCI) ovCI.destroy();
  ovCI=new Chart(ctx,{type:'bar',data:{labels:['Priya','Rajan','Ananya','Dev'],datasets:[{label:'Annual',data:[8,5,12,2],backgroundColor:'#7F77DD'},{label:'Sick',data:[2,0,3,1],backgroundColor:'#1D9E75'},{label:'WFH',data:[5,3,7,4],backgroundColor:'#EF9F27'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{stepSize:5}}}}});
}

function renderEPolicies(){
  const el=document.getElementById('ePList');
  el.innerHTML='';
  policies.filter(p=>p.status==='Active').forEach(p=>{
    const d=document.createElement('div');
    d.className='card';
    d.innerHTML=`<div class="card-hd"><div class="card-title"><i class="ti ti-file-text" aria-hidden="true"></i> ${p.name}</div><span class="badge b-active">${p.cat}</span></div><div style="font-size:13px;color:var(--color-text-secondary);line-height:1.6">${p.desc}</div><div style="font-size:11px;color:var(--color-text-tertiary);margin-top:8px">Effective ${p.date}</div>`;
    el.appendChild(d);
  });
}

function openM(id){
  if(id==='mEmp') prepareAddEmployeeModal();
  document.getElementById(id).classList.add('open');
}
function closeM(id){document.getElementById(id).classList.remove('open')}

function addPolicy(){
  if(typeof window.importPolicies==='function'){
    window.importPolicies();
    return;
  }
  toast('Policy importer is still loading. Please refresh and try again.');
}

function delPol(id){policies=policies.filter(p=>p.id!==id);renderPolicies();toast('Policy removed')}

function cycleStatus(id){
  const p=policies.find(x=>x.id===id);
  if(!p) return;
  p.status=p.status==='Active'?'Draft':p.status==='Draft'?'Archived':'Active';
  renderPolicies();toast(`Status → ${p.status}`);
}

function openResolve(id){
  resolveId=id;
  const q=queries.find(x=>x.id===id);
  document.getElementById('resDetail').innerHTML=`<strong>${q.subject}</strong><br><span style="color:var(--color-text-tertiary)">${q.emp}</span><br>${q.msg}`;
  document.getElementById('hrR').value='';
  openM('mRes');
}

function resolveQ(){
  const r=document.getElementById('hrR').value.trim();
  if(!r){toast('Enter a response');return;}
  const q=queries.find(x=>x.id===resolveId);
  if(q){q.status='resolved';q.response=r;}
  closeM('mRes');renderQueries();toast('Query resolved');
}

function applyLeave(){
  const type=document.getElementById('lvT').value;
  const days=parseInt(document.getElementById('lvD').value)||1;
  const key=type==='Annual'?'annual':type==='Sick'?'sick':type==='WFH'?'wfh':'comp';
  const b=lv[key];
  if(b.u+days>b.t){toast(`Not enough ${type} balance`);return;}
  b.u+=days;
  updateBars();
  document.getElementById('lvR').value='';
  queries.push({id:Date.now(),emp:'Priya K.',subject:`${type} leave — ${days} day(s)`,msg:`Applied for ${days} day(s) of ${type} leave.`,status:'pending',response:null});
  document.getElementById('qBadge').textContent=queries.filter(q=>q.status!=='resolved').length;
  toast(`${days} day(s) of ${type} leave submitted`);
}

function updateBars(){
  const a=lv.annual,s=lv.sick,w=lv.wfh,c=lv.comp;
  document.getElementById('eAL').textContent=a.t-a.u;
  document.getElementById('eSL').textContent=s.t-s.u;
  document.getElementById('eWL').textContent=w.t-w.u;
  document.getElementById('eCL').textContent=c.t-c.u;
  document.getElementById('aBar').style.width=Math.round(a.u/a.t*100)+'%';
  document.getElementById('skBar').style.width=Math.round(s.u/s.t*100)+'%';
  document.getElementById('wBar').style.width=Math.round(w.u/w.t*100)+'%';
  document.getElementById('cBar').style.width=Math.round(c.u/c.t*100)+'%';
  document.getElementById('aTxt').textContent=`${a.u} used · ${a.t-a.u} remaining of ${a.t}`;
  document.getElementById('skTxt').textContent=`${s.u} used · ${s.t-s.u} remaining of ${s.t}`;
  document.getElementById('wTxt').textContent=`${w.u} used · ${w.t-w.u} remaining of ${w.t}`;
  document.getElementById('cTxt').textContent=`${c.u} used · ${c.t-c.u} remaining of ${c.t}`;
}

function initChat(){
  chatHistory=[];
  document.getElementById('chatMsgs').innerHTML='';
  document.getElementById('chatErr').style.display='none';
  addBot("Hi Priya! I'm your HR assistant, powered by Claude. I know your leave balances and all active company policies. What would you like to know?");
}

function addBot(text){
  const el=document.createElement('div');
  el.className='msg bot';
  el.textContent=text;
  document.getElementById('chatMsgs').appendChild(el);
  scrollC();
}

function addUser(text){
  const el=document.createElement('div');
  el.className='msg user';
  el.textContent=text;
  document.getElementById('chatMsgs').appendChild(el);
  scrollC();
}

function showTyping(){
  const el=document.createElement('div');
  el.className='msg typing';el.id='typEl';
  el.innerHTML='<div class="dots"><span></span><span></span><span></span></div>';
  document.getElementById('chatMsgs').appendChild(el);scrollC();
}

function hideTyping(){const el=document.getElementById('typEl');if(el)el.remove();}
function scrollC(){const c=document.getElementById('chatMsgs');c.scrollTop=c.scrollHeight;}

function chipQ(q){document.getElementById('chatIn').value=q;sendChat();}

async function sendChat(){
  if(window.sendChat&&window.sendChat!==sendChat) return window.sendChat();
  return;
  const a=lv.annual,s=lv.sick,w=lv.wfh,c=lv.comp;
  const polCtx=policies.filter(p=>p.status==='Active').map(p=>`• ${p.name}: ${p.desc}`).join('\n');
  const sys=`You are a friendly HR assistant chatbot for ${COMPANY.portalName||'Interlace'}. You are chatting with Priya K., an employee.

PRIYA'S LIVE LEAVE BALANCES:
• Annual leave: ${a.u} used, ${a.t-a.u} remaining (total ${a.t})
• Sick leave: ${s.u} used, ${s.t-s.u} remaining (total ${s.t})
• Work from home: ${w.u} used, ${w.t-w.u} remaining (total ${w.t})
• Comp-off: ${c.u} used, ${c.t-c.u} remaining (total ${c.t})

ACTIVE COMPANY POLICIES:
${polCtx}

Rules:
- Be warm, concise, and helpful (2–4 sentences).
- Always cite real balances and policy details when relevant.
- If someone wants to apply for leave, tell them to use the "My leaves" tab.
- Never invent policies not listed above.`;

  hideTyping();
  isBotTyping=false;
}

function toast(msg){
  const n=document.getElementById('notif');
  n.textContent=msg;n.classList.add('show');
  setTimeout(()=>n.classList.remove('show'),2200);
}

document.querySelectorAll('.modal-bg').forEach(bg=>bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('open')}));
const policyDateInput=document.getElementById('pDt');
if(policyDateInput) policyDateInput.valueAsDate=new Date();



/* Live multi-user portal layer: localStorage keeps this frontend-only demo persistent. */
const HRP_KEY='hrpulse_live_portals_v1';
const HRP_REV_KEY=HRP_KEY+'_rev';
const HRP_GAME_KEY='hrpulse_word_wonders_progress_v1';
let backendStoreHydrated=false, backendSaveDebounceTimer=null, backendSaveInFlight=false, backendSaveQueued=false, backendStoreUpdatedAt='';
let localStoreRevision='', storeBroadcastChannel=null;
let liveRole='hr', currentUser=null, liveResolveId=null, liveChart=null, botBusy=false;
let activeColleagueId=null;
let chatEventSource=null, chatTypingTimer=null, remoteTypingEmployeeId=null;
let profileCropState={src:'',x:0,y:0,zoom:1,rotation:0,cropped:''};
const DOCUMENT_TYPES=[
  {key:'offer',label:'Offer Letter',icon:'ti-file-certificate'},
  {key:'appointment',label:'Appointment Letter',icon:'ti-briefcase'},
  {key:'payslip',label:'Payslips',icon:'ti-receipt-2'},
  {key:'tax',label:'Tax Documents',icon:'ti-file-dollar'}
];
const PERSONAL_DOCUMENT_TYPES=[
  {key:'aadhaar',label:'Aadhaar',icon:'ti-id'},
  {key:'pan',label:'PAN',icon:'ti-id-badge-2'},
  {key:'uan',label:'UAN',icon:'ti-hash'},
  {key:'passport',label:'Passport',icon:'ti-passport'},
  {key:'bank',label:'Bank document',icon:'ti-building-bank'},
  {key:'other',label:'Other',icon:'ti-file'}
];
const ASSET_TYPES=[
  {key:'laptop',label:'Laptop'},
  {key:'monitor',label:'Monitor'},
  {key:'keyboard_mouse',label:'Keyboard / Mouse'},
  {key:'id_card',label:'ID card'},
  {key:'phone',label:'Phone'},
  {key:'sim',label:'SIM'},
  {key:'access_card',label:'Access card'},
  {key:'laptop_charger',label:'Laptop & Charger'},
  {key:'dongle',label:'Dongle'},
  {key:'others',label:'Others'}
];
const EXIT_CHECKLIST=[
  {key:'resignation',label:'Resignation recorded'},
  {key:'manager_approval',label:'Manager approval'},
  {key:'notice_period',label:'Notice period'},
  {key:'knowledge_transfer',label:'Knowledge transfer'},
  {key:'asset_return',label:'Asset return'},
  {key:'access_revocation',label:'Access revocation'},
  {key:'payroll_settlement',label:'Payroll / settlement'},
  {key:'exit_interview',label:'Exit interview'},
  {key:'experience_certificate',label:'Experience certificate'},
  {key:'relieving_letter',label:'Relieving letter'},
  {key:'final_status',label:'Final status update'}
];
const TRANSFER_STATUSES=['draft','pending','approved','applied','rejected','cancelled'];
const PROBATION_STATUSES=['in_probation','confirmed','extended','exited'];

function ensureEmployeeProbation(employee){
  if(!employee||typeof employee!=='object') return employee;
  employee.probation=employee.probation&&typeof employee.probation==='object'?employee.probation:{};
  const p=employee.probation;
  const doj=employee.dateOfJoining||'';
  if(!p.startDate&&doj) p.startDate=doj;
  if(!p.endDate){
    p.endDate=employee.dateOfConfirmation||'';
    if(!p.endDate&&doj){
      try{
        const date=new Date(`${doj}T00:00:00`);
        if(!Number.isNaN(date.getTime())){
          date.setMonth(date.getMonth()+6);
          p.endDate=date.toISOString().slice(0,10);
        }
      }catch(err){/* keep empty */}
    }
  }
  if(!employee.dateOfConfirmation&&p.endDate) employee.dateOfConfirmation=p.endDate;
  p.managerFeedback=p.managerFeedback||'';
  p.performanceReview=p.performanceReview||'';
  p.confirmationStatus=p.confirmationStatus||'in_probation';
  if(p.confirmationStatus==='pending') p.confirmationStatus='in_probation';
  p.extensionRequired=Boolean(p.extensionRequired);
  p.confirmationLetter=p.confirmationLetter||'';
  p.remindersSent=Array.isArray(p.remindersSent)?p.remindersSent:[];
  p.managerDecision=p.managerDecision==='confirm'||p.managerDecision==='extend'?p.managerDecision:'';
  p.managerDecisionAt=p.managerDecisionAt||'';
  p.managerDecisionBy=p.managerDecisionBy||'';
  p.hrDecisionConfirmed=Boolean(p.hrDecisionConfirmed);
  p.hrDecisionConfirmedAt=p.hrDecisionConfirmedAt||'';
  p.hrDecisionConfirmedBy=p.hrDecisionConfirmedBy||'';
  if(employee.status==='Inactive'||employee.leavingDate){
    p.confirmationStatus='exited';
  }else if((p.confirmationStatus==='in_probation'||p.confirmationStatus==='extended')&&p.endDate&&!p.managerDecision){
    const left=typeof daysUntil==='function'?daysUntil(p.endDate):null;
    if(left!=null&&left<-30){
      p.confirmationStatus='confirmed';
      p.extensionRequired=false;
    }
  }
  return employee;
}

function isEmployeeCurrentlyOnProbation(employee){
  if(!employee||employee.status==='Inactive') return false;
  ensureEmployeeProbation(employee);
  const p=employee.probation||{};
  if(p.confirmationStatus!=='in_probation'&&p.confirmationStatus!=='extended') return false;
  if(!p.startDate||!p.endDate) return false;
  const start=new Date(`${p.startDate}T00:00:00`);
  const today=new Date();
  const now=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  if(Number.isNaN(start.getTime())) return false;
  return now>=start;
}
/**
 * Shared employee field registry for admin detail labels (and optional form wiring).
 * Add a simple scalar here for a curated label/order; unknown employee keys still
 * appear under "Other details" automatically. Nested arrays/objects have special sections.
 * Form auto-save: add <input data-emp-field="yourKey"> in add/edit employee modals —
 * saveEmployeeEdits/addEmployee pick it up via applyDataEmpFieldsFromForm.
 */
const EMPLOYEE_PROFILE_FIELDS=[
  {key:'employeeCode',label:'Employee ID'},
  {key:'status',label:'Status'},
  {key:'companyId',label:'Company',format:'company'},
  {key:'email',label:'Official email'},
  {key:'personalEmail',label:'Personal email',aliases:['personal_email']},
  {key:'profile.dob',label:'Date of birth',format:'date'},
  {key:'profile.hobbies',label:'Hobbies'},
  {key:'dateOfJoining',label:'Date of joining',format:'date',aliases:['joining','doj']},
  {key:'dateOfConfirmation',label:'Date of confirmation',format:'date'},
  {key:'leavingDate',label:'Leaving date',format:'date',aliases:['dateOfLeaving','exitDate','lastWorkingDay']},
  {key:'tenure',label:'Tenure'},
  {key:'department',label:'Department',aliases:['dept']},
  {key:'location',label:'Reporting place',aliases:['workLocation','officeLocation']},
  {key:'designation',label:'Designation / Role',aliases:['role']},
  {key:'reportingManager',label:'Reporting manager',aliases:['manager']},
  {key:'buHead',label:'BU Head'},
  {key:'bu',label:'BU',aliases:['businessUnit']},
  {key:'project',label:'Project'},
  {key:'grade',label:'Grade'},
  {key:'kmpCategory',label:'KMP / Other'},
  {key:'sbu',label:'SBU'},
  {key:'sbu1',label:'SBU 1'},
  {key:'functionGroup',label:'Function group'},
  {key:'functionalCategory',label:'Functional category'},
  {key:'ctc',label:'Current CTC',format:'ctc'},
  {key:'onboardedAt',label:'Onboarded at',format:'datetime'}
];
/** Keys never listed raw in detail (internal, secrets, or handled by special sections). */
const EMPLOYEE_DETAIL_IGNORE_KEYS=new Set([
  'id','password','mustChangePassword','hrProfileReady','policyReads','dismissedNotifications',
  'gameProgress','learningCompletions','name','salaryHistory','documents','assets','leave','bvg',
  'employmentHistory','probation','buProjectEdits','profile','companyId',
  'resignationRequest',
  'profile','photo','fileData','dept','role','manager','personal_email','dateOfLeaving','exitDate',
  'lastWorkingDay','salaryUpdatedAt','aadhar','buProjectEdits','buEditedAt','projectEditedAt',
  'dateOfJoiningEdits','dateOfJoiningEditedAt'
]);
const ENGAGE_QUIZ=[
  {id:'policy-basics',title:'Policy basics',question:'Where should you check the latest active HR rules?',options:['Company policies tab','Old chat screenshots','Ask a friend only'],answer:0},
  {id:'leave-ready',title:'Leave readiness',question:'What is the best first step before taking planned leave?',options:['Apply with reason in the portal','Disappear for a day','Tell HR after returning'],answer:0},
  {id:'doc-care',title:'Document care',question:'What should you do after HR uploads an important document?',options:['Download and acknowledge it','Ignore it','Forward it publicly'],answer:0}
];

const seedData={
  companies:PORTAL_COMPANIES.map(c=>({
    id:c.id,
    code:c.code,
    name:c.name,
    shortName:c.shortName||c.code||c.name,
    isParent:Boolean(c.isParent)
  })),
  hrs:[
    {id:'hr-1',name:'Central Admin',email:'admin@vayana.com',password:'admin@123',title:'Central Admin',role:'super_admin',accessRole:'central',companyId:'all',status:'Active'},
    {id:'hr-1-alias',name:'Central Admin',email:'admin@company.com',password:'admin@123',title:'Central Admin',role:'super_admin',accessRole:'central',companyId:'all',status:'Active'},
    {id:'hr-co-1',name:'Vay Network Services Private Limited',email:'hr@vaynetwork.example',password:'hr@123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'VNSPL',status:'Active'},
    {id:'hr-co-1-alias',name:'Vay Network Services Private Limited',email:'hr.vayana@company.com',password:'hr123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'VNSPL',status:'Active'},
    {id:'hr-co-2',name:'Hylobiz Challanger Private Limited',email:'hr@company-two.example',password:'hr@123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'HYLO',status:'Active'},
    {id:'hr-co-2-alias',name:'Hylobiz Challanger Private Limited',email:'hr.co2@company.com',password:'hr123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'HYLO',status:'Active'},
    {id:'hr-co-3',name:'Vayana IFSC Private Limited',email:'hr@company-three.example',password:'hr@123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'VTX',status:'Active'},
    {id:'hr-co-3-alias',name:'Vayana IFSC Private Limited',email:'hr.co3@company.com',password:'hr123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'VTX',status:'Active'},
    {id:'hr-co-4',name:'Rubix Data Science Private Limited',email:'hr@company-four.example',password:'hr@123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'Rubix',status:'Active'},
    {id:'hr-co-4-alias',name:'Rubix Data Science Private Limited',email:'hr.co4@company.com',password:'hr123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'Rubix',status:'Active'},
    {id:'hr-co-5',name:'Vayana Finserv Private Limited',email:'hr@company-five.example',password:'hr@123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'VFPL',status:'Active'},
    {id:'hr-co-5-alias',name:'Vayana Finserv Private Limited',email:'hr.co5@company.com',password:'hr123',title:'Company HR',role:'company_hr',accessRole:'company',companyId:'VFPL',status:'Active'}
  ],
  // Demo BU Head logins (hidden on login UI):
  // buhead@company.com / bu@123 → unit Engineering (person Amit S.) · all 5 companies
  // buhead.finance@company.com / bu@123 → unit Finance (person Meera Shah) · HYLO only
  buHeads:[
    {id:'buh-1',name:'Amit S.',email:'buhead@company.com',password:'bu@123',bu:'Engineering',personName:'Amit S.',companyId:'all',status:'Active',title:'BU Head',budget:7500000},
    {id:'buh-2',name:'Meera Shah',email:'buhead.finance@company.com',password:'bu@123',bu:'Finance',personName:'Meera Shah',companyId:'HYLO',status:'Active',title:'BU Head',budget:1200000}
  ],
  itUsers:[
    {id:'it-1',name:'IT Desk',email:'it@company.com',password:'it@123',title:'IT Asset Admin',accessRole:'it',companyId:'all',status:'Active'}
  ],
  employees:[
    {id:'emp-1',name:'Priya K.',email:'priya@company.com',password:'emp123',mustChangePassword:false,companyId:'VNSPL',employeeCode:'EMP-1001',dept:'Engineering',role:'Frontend Engineer',status:'Active',manager:'Amit S.',reportingManager:'Amit S.',bu:'Engineering',project:'Portal UI',buHead:'Amit S.',dateOfJoining:'2023-04-01',leavingDate:'',ctc:'8,50,000',assets:[{id:'ast-1',type:'laptop',typeLabel:'Laptop',serialOrTag:'VNS-LAP-1001',allocatedAt:'2023-04-05',condition:'Good',status:'allocated',remarks:'MacBook Pro 14"'},{id:'ast-2',type:'monitor',typeLabel:'Monitor',serialOrTag:'VNS-MON-882',allocatedAt:'2023-04-05',condition:'Good',status:'allocated',remarks:'27" display'}],salaryHistory:[{id:'sal-emp-1-1',type:'joining',previousCtc:0,newCtc:750000,bonusAmount:0,effectiveDate:'2023-04-01',notes:'Joining CTC',recordedAt:'2023-04-01T10:00:00+05:30',recordedBy:'HR'},{id:'sal-emp-1-2',type:'increment',previousCtc:750000,newCtc:850000,bonusAmount:0,effectiveDate:'2025-04-01',notes:'Annual increment FY25',recordedAt:'2025-04-01T10:00:00+05:30',recordedBy:'HR'}],profile:{dob:'1998-05-12',hobbies:'Reading, badminton',photo:''},leave:{annual:{u:8,t:18},sick:{u:2,t:8},wfh:{u:5,t:12},comp:{u:1,t:3}}},
    {id:'emp-2',name:'Rajan M.',email:'rajan@company.com',password:'emp123',mustChangePassword:false,companyId:'HYLO',employeeCode:'EMP-1002',dept:'Finance',role:'Analyst',status:'Active',manager:'Meera Shah',reportingManager:'Meera Shah',bu:'Finance',project:'Billing Ops',buHead:'Meera Shah',dateOfJoining:'2022-07-11',leavingDate:'',ctc:'7,20,000',assets:[{id:'ast-3',type:'laptop',typeLabel:'Laptop',serialOrTag:'HYLO-LAP-2042',allocatedAt:'2022-07-15',condition:'Fair',status:'allocated',remarks:'ThinkPad T14'}],salaryHistory:[{id:'sal-emp-2-1',type:'joining',previousCtc:0,newCtc:720000,bonusAmount:0,effectiveDate:'2022-07-11',notes:'Joining CTC',recordedAt:'2022-07-11T10:00:00+05:30',recordedBy:'HR'}],profile:{dob:'1994-06-22',hobbies:'Cricket, finance podcasts',photo:''},leave:{annual:{u:5,t:18},sick:{u:0,t:8},wfh:{u:3,t:12},comp:{u:0,t:3}}},
    {id:'emp-3',name:'Ananya T.',email:'ananya@company.com',password:'emp123',mustChangePassword:false,companyId:'VTX',employeeCode:'EMP-1003',dept:'Design',role:'Product Designer',status:'Active',manager:'Amit S.',reportingManager:'Amit S.',bu:'Design',project:'Brand System',buHead:'Amit S.',dateOfJoining:'2021-09-01',leavingDate:'',ctc:'9,10,000',salaryHistory:[{id:'sal-emp-3-1',type:'joining',previousCtc:0,newCtc:820000,bonusAmount:0,effectiveDate:'2021-09-01',notes:'Joining CTC',recordedAt:'2021-09-01T10:00:00+05:30',recordedBy:'HR'},{id:'sal-emp-3-2',type:'bonus',previousCtc:820000,newCtc:910000,bonusAmount:50000,effectiveDate:'2024-12-01',notes:'Performance bonus + CTC revision',recordedAt:'2024-12-01T10:00:00+05:30',recordedBy:'HR'}],profile:{dob:'1996-06-25',hobbies:'Sketching, travel',photo:''},leave:{annual:{u:12,t:18},sick:{u:3,t:8},wfh:{u:7,t:12},comp:{u:0,t:3}}},
    {id:'emp-4',name:'Dev K.',email:'dev@company.com',password:'emp123',mustChangePassword:false,companyId:'Rubix',employeeCode:'EMP-1004',dept:'Marketing',role:'Growth Lead',status:'Active',manager:'Nikhil Rao',reportingManager:'Nikhil Rao',bu:'Marketing',project:'Growth Engine',buHead:'Nikhil Rao',dateOfJoining:'2020-01-15',leavingDate:'',ctc:'12,00,000',salaryHistory:[{id:'sal-emp-4-1',type:'joining',previousCtc:0,newCtc:1200000,bonusAmount:0,effectiveDate:'2020-01-15',notes:'Joining CTC',recordedAt:'2020-01-15T10:00:00+05:30',recordedBy:'HR'}],profile:{dob:'1993-07-04',hobbies:'Music, football',photo:''},leave:{annual:{u:2,t:18},sick:{u:1,t:8},wfh:{u:4,t:12},comp:{u:0,t:3}}},
    {id:'emp-5',name:'Amit S.',email:'amit.s@company.com',password:'emp123',mustChangePassword:false,companyId:'VNSPL',employeeCode:'EMP-1005',dept:'Engineering',role:'Engineering Manager',status:'Active',manager:'',reportingManager:'',bu:'Engineering',project:'Platform Core',buHead:'',dateOfJoining:'2018-05-01',leavingDate:'',ctc:'18,00,000',assets:[{id:'ast-4',type:'laptop',typeLabel:'Laptop',serialOrTag:'VNS-LAP-0099',allocatedAt:'2018-05-10',condition:'Good',status:'allocated',remarks:''},{id:'ast-5',type:'id_card',typeLabel:'ID card',serialOrTag:'VNS-ID-0099',allocatedAt:'2018-05-10',condition:'Good',status:'returned',returnedAt:'2024-06-01',remarks:'Replaced with new card'}],salaryHistory:[{id:'sal-emp-5-1',type:'joining',previousCtc:0,newCtc:1800000,bonusAmount:0,effectiveDate:'2018-05-01',notes:'Joining CTC',recordedAt:'2018-05-01T10:00:00+05:30',recordedBy:'HR'}],profile:{dob:'1988-03-14',hobbies:'Mentoring, cricket',photo:''},leave:{annual:{u:3,t:18},sick:{u:0,t:8},wfh:{u:2,t:12},comp:{u:0,t:3}}},
    {id:'emp-6',name:'Meera Shah',email:'meera.shah@company.com',password:'emp123',mustChangePassword:false,companyId:'HYLO',employeeCode:'EMP-1006',dept:'Finance',role:'Finance Manager',status:'Active',manager:'',reportingManager:'',bu:'Finance',project:'Controls',buHead:'',dateOfJoining:'2019-03-01',leavingDate:'',ctc:'15,00,000',profile:{dob:'1987-09-02',hobbies:'Reading, yoga',photo:''},leave:{annual:{u:4,t:18},sick:{u:1,t:8},wfh:{u:1,t:12},comp:{u:0,t:3}}},
    {id:'emp-7',name:'Nikhil Rao',email:'nikhil.rao@company.com',password:'emp123',mustChangePassword:false,companyId:'Rubix',employeeCode:'EMP-1007',dept:'Marketing',role:'Marketing Manager',status:'Active',manager:'',reportingManager:'',bu:'Marketing',project:'Campaign Ops',buHead:'',dateOfJoining:'2019-11-01',leavingDate:'',ctc:'14,00,000',profile:{dob:'1989-11-21',hobbies:'Football, music',photo:''},leave:{annual:{u:2,t:18},sick:{u:0,t:8},wfh:{u:3,t:12},comp:{u:0,t:3}}},
    // Engineering unit shared across entities so BU Head My team shows multi-company roster
    {id:'emp-8',name:'Kavya R.',email:'kavya@company.com',password:'emp123',mustChangePassword:false,companyId:'HYLO',employeeCode:'EMP-1008',dept:'Engineering',role:'Backend Engineer',status:'Active',manager:'Amit S.',reportingManager:'Amit S.',bu:'Engineering',project:'Payments API',buHead:'Amit S.',dateOfJoining:'2023-08-14',leavingDate:'',ctc:'9,40,000',profile:{dob:'1997-01-18',hobbies:'Chess, hiking',photo:''},leave:{annual:{u:4,t:18},sick:{u:1,t:8},wfh:{u:2,t:12},comp:{u:0,t:3}}},
    {id:'emp-9',name:'Suresh P.',email:'suresh@company.com',password:'emp123',mustChangePassword:false,companyId:'VTX',employeeCode:'EMP-1009',dept:'Engineering',role:'Platform Engineer',status:'Active',manager:'Amit S.',reportingManager:'Amit S.',bu:'Engineering',project:'IFSC Core',buHead:'Amit S.',dateOfJoining:'2022-11-02',leavingDate:'',ctc:'10,20,000',profile:{dob:'1995-04-09',hobbies:'Running, podcasts',photo:''},leave:{annual:{u:6,t:18},sick:{u:0,t:8},wfh:{u:3,t:12},comp:{u:1,t:3}}},
    {id:'emp-10',name:'Neel I.',email:'neel@company.com',password:'emp123',mustChangePassword:false,companyId:'Rubix',employeeCode:'EMP-1010',dept:'Engineering',role:'Data Engineer',status:'Active',manager:'Amit S.',reportingManager:'Amit S.',bu:'Engineering',project:'Analytics Pipelines',buHead:'Amit S.',dateOfJoining:'2026-03-10',leavingDate:'',ctc:'8,80,000',profile:{dob:'1999-09-30',hobbies:'Board games, cooking',photo:''},leave:{annual:{u:3,t:18},sick:{u:1,t:8},wfh:{u:4,t:12},comp:{u:0,t:3}}},
    {id:'emp-11',name:'Isha V.',email:'isha@company.com',password:'emp123',mustChangePassword:false,companyId:'VFPL',employeeCode:'EMP-1011',dept:'Engineering',role:'QA Engineer',status:'Active',manager:'Amit S.',reportingManager:'Amit S.',bu:'Engineering',project:'Finserv QA',buHead:'Amit S.',dateOfJoining:'2023-06-05',leavingDate:'',ctc:'7,60,000',profile:{dob:'1998-12-11',hobbies:'Yoga, writing',photo:''},leave:{annual:{u:5,t:18},sick:{u:2,t:8},wfh:{u:2,t:12},comp:{u:0,t:3}}},
    {id:'neha-neha-tanksale-vayana-com',name:'Neha Tanksale',email:'neha.tanksale@vayana.com',password:'Neha_vayana',mustChangePassword:false,companyId:'VNSPL',employeeCode:'',dept:'General',role:'Employee',status:'Active',manager:'HR',reportingManager:'HR',bu:'',project:'',buHead:'',dateOfJoining:'',leavingDate:'',ctc:'',profile:{dob:'',hobbies:'',photo:''},leave:{annual:{u:0,t:18},sick:{u:0,t:8},wfh:{u:0,t:12},comp:{u:0,t:3}}}
  ],
  policies:[
    {id:1,name:'Annual Leave Policy',cat:'Leave',status:'Active',date:'2024-01-01',companyId:'all',desc:'Employees get 18 days of paid annual leave per year, accruing at 1.5 days per month. Up to 5 unused days can be carried forward to the next year.'},
    {id:2,name:'Sick Leave Policy',cat:'Leave',status:'Active',date:'2024-01-01',companyId:'all',desc:'Up to 8 days paid sick leave per year. A medical certificate is required for absences of 3 or more consecutive days.'},
    {id:3,name:'Work from Home Policy',cat:'Remote Work',status:'Active',date:'2024-03-01',companyId:'all',desc:'Employees may WFH up to 3 days per week with manager approval. Not available during the first 3 months of employment.'},
    {id:4,name:'Maternity & Paternity Leave',cat:'Benefits',status:'Draft',date:'2025-01-01',companyId:'all',desc:'26 weeks maternity leave and 2 weeks paternity leave per statutory norms. Applicable after 6 months of continuous employment.'},
    {id:5,name:'2022 Attendance Policy',cat:'Attendance',status:'Archived',date:'2022-01-01',companyId:'all',desc:'Legacy guidelines superseded by the 2024 policy.'}
  ],
  queries:[
    {id:1,empId:'emp-1',emp:'Priya K.',category:'Benefits',subject:'Comp-off encashment',msg:'Can unused comp-off be encashed at year end?',status:'open',response:null,createdAt:'2026-06-18T09:10:00+05:30'},
    {id:2,empId:'emp-2',emp:'Rajan M.',category:'Policy',subject:'WFH during probation',msg:'Am I eligible for WFH during probation period?',status:'open',response:null,createdAt:'2026-06-18T09:35:00+05:30'},
    {id:3,empId:'emp-3',emp:'Ananya T.',category:'Leave',subject:'Sick leave certificate',msg:'Is a medical cert needed for a 2-day absence?',status:'pending',response:null,createdAt:'2026-06-18T10:05:00+05:30'},
    {id:4,empId:'emp-4',emp:'Dev K.',category:'Leave',subject:'Carry forward limit',msg:'How many leaves can I carry to next year?',status:'resolved',response:'Up to 5 days per Annual Leave Policy.',createdAt:'2026-06-17T16:20:00+05:30'}
  ],
  events:[
    {id:'evt-1',title:'Quarterly Town Hall',date:'2026-06-24',time:'4:00 PM',location:'Main Auditorium',companyId:'all',desc:'Leadership updates, employee recognitions, and open Q&A.'},
    {id:'evt-2',title:'Wellness Week',date:'2026-06-27',time:'All day',location:'Campus and online',companyId:'all',desc:'Health sessions, yoga, preventive checkups, and wellness consultations.'},
    {id:'evt-3',title:'Learning Friday',date:'2026-07-03',time:'2:30 PM',location:'Training Room 2',companyId:'all',desc:'Skill-sharing session hosted by Engineering and HR.'}
  ],
  news:[
    {id:'news-1',title:'New hybrid work guideline published',date:'2026-06-18',tag:'Policy',companyId:'all',body:'Employees can review the latest WFH guidance in the Policies section.'},
    {id:'news-2',title:'Employee referral drive opens next week',date:'2026-06-19',tag:'Hiring',companyId:'all',body:'Refer candidates for open roles and track referral rewards through HR.'},
    {id:'news-3',title:'Benefits helpdesk hours extended',date:'2026-06-20',tag:'Benefits',companyId:'all',body:'HR support will be available until 7 PM through the end of the month.'}
  ],
  teamWall:[
    {id:'wall-1',empId:'emp-1',emp:'Priya K.',tag:'Shoutout',msg:'Huge thanks to Design for the quick policy poster refresh.',createdAt:'2026-06-18T11:20:00+05:30',likes:['emp-3']}
  ],
  moodPulse:[],
  directMessages:[],
  retiredEmployeeEmails:[],
  deletedEmployeeIds:[],
  deletedEmployeeEmails:[],
  leaveRequests:[],
  transferRequests:[],
  exitCases:[],
  nextPolicyId:6,
  nextQueryId:5,
  nextEmployeeId:8,
  nextLeaveRequestId:1,
  nextTransferId:1,
  nextExitId:1,
  nextAssetInventoryId:4,
  assetInventory:[
    {id:'inv-1',companyId:'VNSPL',assetTag:'VNS-LAP-2001',type:'laptop',typeLabel:'Laptop',otherDetail:'',brandModel:'Dell Latitude 5540',condition:'Good',status:'in_stock',remarks:'Ready for allocation',purchaseDate:'2025-01-10',createdAt:'2025-01-10T10:00:00+05:30',createdBy:'IT',empId:'',empName:'',employeeAssetId:'',allocatedAt:'',returnedAt:''},
    {id:'inv-2',companyId:'VNSPL',assetTag:'VNS-MON-4401',type:'monitor',typeLabel:'Monitor',otherDetail:'',brandModel:'Dell 27"',condition:'Good',status:'in_stock',remarks:'',purchaseDate:'2025-02-01',createdAt:'2025-02-01T10:00:00+05:30',createdBy:'IT',empId:'',empName:'',employeeAssetId:'',allocatedAt:'',returnedAt:''},
    {id:'inv-3',companyId:'HYLO',assetTag:'HYLO-LAP-3001',type:'laptop',typeLabel:'Laptop',otherDetail:'',brandModel:'ThinkPad T14',condition:'Good',status:'in_stock',remarks:'Spare laptop',purchaseDate:'2024-11-05',createdAt:'2024-11-05T10:00:00+05:30',createdBy:'HR',empId:'',empName:'',employeeAssetId:'',allocatedAt:'',returnedAt:''}
  ]
};

const DEFAULT_COMPANY_REPORTING_PLACES={
  VNSPL:'Pune — Shivkamal Office',
  HYLO:'Mumbai — BKC Office',
  VTX:'GIFT City, Gandhinagar',
  Rubix:'Bengaluru — Indiranagar Office',
  VFPL:'Pune — Shivkamal Office'
};
const SHARED_COMPANY_LOCATION_PRESETS=['Remote / Work from home'];
function defaultLocationsForCompany(companyId){
  const cid=resolveCompanyId(companyId);
  const list=[];
  if(DEFAULT_COMPANY_REPORTING_PLACES[cid]) list.push(DEFAULT_COMPANY_REPORTING_PLACES[cid]);
  SHARED_COMPANY_LOCATION_PRESETS.forEach(p=>list.push(p));
  return [...new Set(list.map(v=>String(v||'').trim()).filter(Boolean))];
}
function deletedCompanyLocationsMap(target=store){
  const incoming=target?.deletedCompanyLocations&&typeof target.deletedCompanyLocations==='object'&&!Array.isArray(target.deletedCompanyLocations)
    ?target.deletedCompanyLocations
    :{};
  const next={};
  PORTAL_COMPANIES.forEach(c=>{
    next[c.id]=[...new Set((Array.isArray(incoming[c.id])?incoming[c.id]:[]).map(v=>String(v||'').trim()).filter(Boolean))];
  });
  return next;
}
function rememberDeletedCompanyLocation(companyId,locationName,target=store){
  const cid=resolveCompanyId(companyId);
  const name=String(locationName||'').trim();
  if(!name) return;
  const next=deletedCompanyLocationsMap(target);
  if(!(next[cid]||[]).some(v=>v.toLowerCase()===name.toLowerCase())) next[cid]=(next[cid]||[]).concat([name]);
  target.deletedCompanyLocations=next;
}
function forgetDeletedCompanyLocation(companyId,locationName,target=store){
  const cid=resolveCompanyId(companyId);
  const needle=String(locationName||'').trim().toLowerCase();
  const next=deletedCompanyLocationsMap(target);
  next[cid]=(next[cid]||[]).filter(v=>v.toLowerCase()!==needle);
  target.deletedCompanyLocations=next;
}
function ensureCompanyLocationsStore(target=store){
  if(!target||typeof target!=='object') return {};
  const incoming=target.companyLocations&&typeof target.companyLocations==='object'&&!Array.isArray(target.companyLocations)
    ?target.companyLocations
    :{};
  const deleted=deletedCompanyLocationsMap(target);
  const next={};
  PORTAL_COMPANIES.forEach(c=>{
    const deny=new Set((deleted[c.id]||[]).map(v=>v.toLowerCase()));
    const source=Array.isArray(incoming[c.id])?incoming[c.id]:defaultLocationsForCompany(c.id);
    next[c.id]=[...new Set(source.map(v=>String(v||'').trim()).filter(v=>v&&!deny.has(v.toLowerCase())))];
  });
  target.companyLocations=next;
  target.deletedCompanyLocations=deleted;
  return next;
}
function locationsForCompany(companyId){
  const map=ensureCompanyLocationsStore();
  const cid=resolveCompanyId(companyId);
  return Array.isArray(map[cid])?map[cid].slice():[];
}
function employeeLocationPresetOptions(){
  const presets=new Set();
  Object.values(ensureCompanyLocationsStore()).forEach(list=>{
    (Array.isArray(list)?list:[]).forEach(v=>{if(v) presets.add(v);});
  });
  return [...presets].sort((a,b)=>a.localeCompare(b));
}
function employeeLocationDatalistOptionsHtml(){
  return employeeLocationPresetOptions().map(v=>`<option value="${safeText(v)}">`).join('');
}
function companyLocationEntitiesInScope(){
  if(typeof isCompanyHrSession==='function'&&isCompanyHrSession()){
    const cid=typeof lockedHrCompanyId==='function'?lockedHrCompanyId():'';
    return PORTAL_COMPANIES.filter(c=>c.id===cid);
  }
  return PORTAL_COMPANIES.slice();
}
window.renderCompanyLocations=function(){
  ensureCompanyLocationsStore();
  const list=document.getElementById('ccCompanyLocationsList');
  const companySelect=document.getElementById('ccNewLocationCompany');
  const entities=companyLocationEntitiesInScope();
  if(companySelect){
    const prev=companySelect.value;
    companySelect.innerHTML=entities.map(c=>`<option value="${c.id}">${safeText(companyOptionLabel(c))}</option>`).join('');
    if(prev&&entities.some(c=>c.id===prev)) companySelect.value=prev;
    else if(typeof isCompanyHrSession==='function'&&isCompanyHrSession()){
      companySelect.value=entities[0]?.id||'';
      companySelect.disabled=true;
    }else{
      companySelect.disabled=false;
    }
  }
  if(!list) return;
  if(!entities.length){
    list.innerHTML='<div class="empty-state">No entities in your access scope.</div>';
    return;
  }
  list.innerHTML=entities.map(c=>{
    const locs=locationsForCompany(c.id);
    const chips=locs.length
      ?locs.map(loc=>`<span class="cc-location-chip">${safeText(loc)}<button type="button" class="cc-location-remove" title="Delete location" onclick="removeCompanyLocation('${c.id}','${encodeURIComponent(loc)}',this)">Delete</button></span>`).join('')
      :'<span class="ri-meta">No locations yet</span>';
    return `<div class="cc-location-entity">
      <div class="ri-name">${safeText(c.code||c.id)} · ${safeText(c.name)}</div>
      <div class="cc-location-chips">${chips}</div>
    </div>`;
  }).join('');
};
window.addCompanyLocation=function(){
  if(typeof hasManagementAccess==='function'&&!hasManagementAccess()){toast('Only HR can add company locations');return;}
  ensureCompanyLocationsStore();
  const companyId=resolveCompanyId(document.getElementById('ccNewLocationCompany')?.value||'');
  if(typeof isCompanyHrSession==='function'&&isCompanyHrSession()&&companyId!==lockedHrCompanyId()){
    toast('You can only add locations for your entity');
    return;
  }
  if(!PORTAL_COMPANIES.some(c=>c.id===companyId)){toast('Select an entity');return;}
  const name=String(document.getElementById('ccNewLocationName')?.value||'').trim();
  if(!name){toast('Enter a location name');return;}
  const current=locationsForCompany(companyId);
  if(current.some(loc=>loc.toLowerCase()===name.toLowerCase())){toast('That location already exists for this entity');return;}
  forgetDeletedCompanyLocation(companyId,name);
  store.companyLocations[companyId]=[...current,name];
  const input=document.getElementById('ccNewLocationName');
  if(input) input.value='';
  saveStore();
  renderCompanyLocations();
  refreshLocationDependentViews();
  toast('Location added');
};
function refreshLocationDependentViews(){
  const dl=document.getElementById('editEmpLocationList');
  if(dl) dl.innerHTML=employeeLocationDatalistOptionsHtml();
  if(typeof fillAddEmpLocationOptions==='function') fillAddEmpLocationOptions();
  if(typeof populateTransferLocationSelect==='function') populateTransferLocationSelect();
  if(typeof fillTransferFromEmployee==='function'&&document.getElementById('trFromLocation')) fillTransferFromEmployee();
  if(typeof renderEmpTable==='function'&&document.getElementById('eTable')) renderEmpTable();
  if(typeof renderEmployeeHome==='function'&&document.getElementById('pg-home')?.classList.contains('act')) renderEmployeeHome();
  if(typeof renderColleagues==='function'&&document.getElementById('pg-colleagues')?.classList.contains('act')) renderColleagues();
  if(typeof renderBuHeadTeam==='function'&&document.getElementById('pg-bhTeam')?.classList.contains('act')) renderBuHeadTeam();
}
function clearDeletedLocationFromEmployees(companyId,locationName){
  const cid=resolveCompanyId(companyId);
  const target=String(locationName||'').trim().toLowerCase();
  if(!target) return 0;
  let changed=0;
  (store.employees||[]).forEach(emp=>{
    if(resolveCompanyId(emp.companyId)!==cid) return;
    ['location','workLocation','officeLocation'].forEach(key=>{
      if(String(emp[key]||'').trim().toLowerCase()===target){
        emp[key]='';
        changed+=1;
      }
    });
  });
  return changed;
}
window.removeCompanyLocation=function(companyId,locationName,btn){
  if(typeof hasManagementAccess==='function'&&!hasManagementAccess()){toast('Only HR can remove company locations');return;}
  const cid=resolveCompanyId(companyId);
  const name=decodeURIComponent(String(locationName||'')).trim();
  if(!name) return;
  if(typeof isCompanyHrSession==='function'&&isCompanyHrSession()&&cid!==lockedHrCompanyId()){
    toast('You can only change locations for your entity');
    return;
  }
  const chip=btn?.closest?.('.cc-location-chip');
  const row=chip?.closest?.('.cc-location-entity');
  if(chip) chip.remove();
  if(row&&!row.querySelector('.cc-location-chip')){
    const chips=row.querySelector('.cc-location-chips');
    if(chips) chips.innerHTML='<span class="ri-meta">No locations yet</span>';
  }
  store.companyLocations[cid]=locationsForCompany(cid).filter(loc=>loc.toLowerCase()!==name.toLowerCase());
  rememberDeletedCompanyLocation(cid,name);
  const cleared=clearDeletedLocationFromEmployees(cid,name);
  saveStore();
  refreshLocationDependentViews();
  toast(cleared?`Location deleted · cleared from ${cleared} employee field${cleared===1?'':'s'}`:'Location deleted');
};
function repairEditEmpModal(){
  const modal=document.getElementById('mEditEmp');
  if(!modal) return;
  if(!document.getElementById('editEmpLocation')){
    const statusRow=modal.querySelector('#editEmpStatus')?.closest('.fg2');
    if(statusRow){
      const locWrap=document.createElement('div');
      locWrap.className='fi';
      locWrap.innerHTML=`<label for="editEmpLocation">Employee location</label><input id="editEmpLocation" data-emp-field="location" list="editEmpLocationList" placeholder="e.g. Pune — Shivkamal Office">`;
      statusRow.appendChild(locWrap);
    }
    if(!document.getElementById('editEmpLocationList')){
      const dl=document.createElement('datalist');
      dl.id='editEmpLocationList';
      dl.innerHTML=employeeLocationDatalistOptionsHtml();
      modal.querySelector('.modal')?.appendChild(dl);
    }
  }
  if(!document.getElementById('editEmpDateOfJoining')){
    const dojRow=document.createElement('div');
    dojRow.className='fg2';
    dojRow.innerHTML=`<div class="fi"><label for="editEmpDateOfJoining">Date of joining</label><input type="date" id="editEmpDateOfJoining"></div><div class="fi"><label>Last DOJ edit</label><div id="editEmpDojEditedAt" class="hint-box" style="margin:0;padding:8px 10px;font-size:12px">Not edited yet</div></div>`;
    const hint=modal.querySelector('.hint-box');
    if(hint) hint.insertAdjacentElement('beforebegin',dojRow);
    else modal.querySelector('.modal-foot')?.insertAdjacentElement('beforebegin',dojRow);
  }
}

let store=loadStore();
initStoreSync();
const backendStoreReady=hydratePortalStore();

function initStoreSync(){
  localStoreRevision=localStorage.getItem(HRP_REV_KEY)||'';
  if(storeBroadcastChannel) return;
  try{
    storeBroadcastChannel=new BroadcastChannel('hrpulse-portal-store');
    storeBroadcastChannel.onmessage=(event)=>{
      if(event.data?.type!=='store-updated') return;
      refreshPortalStoreFromLocal(event.data.revision);
    };
  }catch(_err){}
}
function bumpLocalStoreRevision(){
  const rev=String(Date.now());
  localStorage.setItem(HRP_REV_KEY,rev);
  localStoreRevision=rev;
  try{storeBroadcastChannel?.postMessage({type:'store-updated',revision:rev});}catch(_err){}
  return rev;
}
function localPortalSavePending(){
  return Boolean(backendSaveInFlight||backendSaveQueued||backendSaveDebounceTimer);
}
function isRemoteStoreNewer(remoteUpdatedAt,localUpdatedAt){
  if(!remoteUpdatedAt) return false;
  if(!localUpdatedAt) return true;
  try{
    return BigInt(remoteUpdatedAt)>BigInt(localUpdatedAt);
  }catch(_err){
    return String(remoteUpdatedAt)>String(localUpdatedAt);
  }
}
function adoptLocalCompanyLocations(incoming){
  if(!incoming||typeof incoming!=='object') return incoming;
  const local=store?.companyLocations;
  const localOk=local&&typeof local==='object'&&!Array.isArray(local);
  if(localOk){
    const remote=incoming.companyLocations;
    const remoteOk=remote&&typeof remote==='object'&&!Array.isArray(remote);
    if(!remoteOk) incoming.companyLocations=cloneJson(local);
    else{
      PORTAL_COMPANIES.forEach(c=>{
        if(Array.isArray(local[c.id])&&!Array.isArray(remote[c.id])) remote[c.id]=local[c.id].slice();
      });
    }
  }
  const localDel=store?.deletedCompanyLocations;
  if(localDel&&typeof localDel==='object'&&!Array.isArray(localDel)){
    const remoteDel=incoming.deletedCompanyLocations&&typeof incoming.deletedCompanyLocations==='object'&&!Array.isArray(incoming.deletedCompanyLocations)
      ?incoming.deletedCompanyLocations
      :{};
    const merged={};
    PORTAL_COMPANIES.forEach(c=>{
      merged[c.id]=[...new Set([...(Array.isArray(localDel[c.id])?localDel[c.id]:[]),...(Array.isArray(remoteDel[c.id])?remoteDel[c.id]:[])].map(v=>String(v||'').trim()).filter(Boolean))];
    });
    incoming.deletedCompanyLocations=merged;
  }
  return incoming;
}
async function pushStoreToBackend(){
  if(!backendStoreHydrated||!location.protocol.startsWith('http')) return;
  if(backendSaveInFlight){
    backendSaveQueued=true;
    return;
  }
  backendSaveInFlight=true;
  backendSaveQueued=false;
  try{
    const response=await fetch('/api/portal-store',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({store})
    });
    if(!response.ok) throw new Error('Backend save failed');
    const result=await response.json();
    backendStoreUpdatedAt=result.updatedAt||backendStoreUpdatedAt;
  }catch(err){
    console.error('VayanaPulse backend save failed:',err);
  }finally{
    backendSaveInFlight=false;
    if(backendSaveQueued){
      backendSaveQueued=false;
      pushStoreToBackend();
    }
  }
}

function loadStore(){
  try{
    const raw=localStorage.getItem(HRP_KEY);
    return normalizeStore(raw?JSON.parse(raw):structuredClone(seedData));
  }catch(err){
    return normalizeStore(JSON.parse(JSON.stringify(seedData)));
  }
}
function saveStore(){
  localStorage.setItem(HRP_KEY,JSON.stringify(store));
  bumpLocalStoreRevision();
  if(!backendStoreHydrated||!location.protocol.startsWith('http')) return;
  clearTimeout(backendSaveDebounceTimer);
  backendSaveDebounceTimer=setTimeout(()=>{
    backendSaveDebounceTimer=null;
    pushStoreToBackend();
  },250);
}

function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}
function portalBackupStamp(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function buildScopedPortalStore(sourceStore){
  const full=cloneJson(sourceStore||store);
  if(!isCompanyHrSession()) return {scope:'full',companyId:PORTAL_ALL_COMPANIES_ID,store:full};
  const companyId=lockedHrCompanyId();
  const employees=(full.employees||[]).filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===companyId);
  const empIds=new Set(employees.map(e=>e.id));
  const empEmails=new Set(employees.map(e=>String(e.email||'').toLowerCase()).filter(Boolean));
  const queries=(full.queries||[]).filter(q=>{
    if(q.empId&&empIds.has(q.empId)) return true;
    return empEmails.has(String(q.empEmail||'').toLowerCase());
  });
  const leaveRequests=(full.leaveRequests||[]).filter(r=>empIds.has(r.empId)||empIds.has(r.employeeId));
  const teamWall=(full.teamWall||[]).filter(w=>empIds.has(w.empId));
  const moodPulse=(full.moodPulse||[]).filter(m=>empIds.has(m.empId));
  const directMessages=(full.directMessages||[]).filter(m=>empIds.has(m.fromId)||empIds.has(m.toId)||empIds.has(m.empId));
  const hrs=(full.hrs||[]).filter(h=>{
    if(h.accessRole==='central'||h.companyId===PORTAL_ALL_COMPANIES_ID) return true;
    return resolveCompanyId(h.companyId)===companyId;
  });
  const templates=full.appointmentLetterTemplates&&typeof full.appointmentLetterTemplates==='object'
    ?Object.fromEntries(Object.entries(full.appointmentLetterTemplates).filter(([key])=>key===companyId||key==='default'||key==='all'))
    :{};
  return {
    scope:'company',
    companyId,
    store:{
      ...full,
      hrs,
      employees,
      queries,
      leaveRequests,
      teamWall,
      moodPulse,
      directMessages,
      appointmentLetterTemplates:templates,
      // Keep tombstones so seed/Excel merge cannot resurrect admin-deleted employees after restore
      retiredEmployeeEmails:Array.isArray(full.retiredEmployeeEmails)?full.retiredEmployeeEmails.slice():[],
      deletedEmployeeIds:Array.isArray(full.deletedEmployeeIds)?full.deletedEmployeeIds.slice():[],
      deletedEmployeeEmails:Array.isArray(full.deletedEmployeeEmails)?full.deletedEmployeeEmails.slice():[]
    }
  };
}
function buildPortalBackupPayload(){
  const scoped=buildScopedPortalStore(store);
  let wordGameProgress={};
  try{wordGameProgress=JSON.parse(localStorage.getItem(HRP_GAME_KEY)||'{}');}catch(err){wordGameProgress={};}
  return {
    version:1,
    kind:'interlace-portal-backup',
    portalName:'Interlace',
    exportedAt:new Date().toISOString(),
    scope:scoped.scope,
    companyId:scoped.companyId,
    exportedBy:currentUser?.email||'',
    store:scoped.store,
    extras:{
      storeKey:HRP_KEY,
      wordGameProgress,
      activeCompanyId:activeCompanyId||PORTAL_ALL_COMPANIES_ID
    },
    includes:[
      'hrs','employees','salaries/ctc','salaryHistory','leave','policies','policySources',
      'queries','leaveRequests','events','news','teamWall','moodPulse','directMessages',
      'documents','bvg','appointmentLetterTemplates','retiredEmployeeEmails','wordGameProgress'
    ]
  };
}
function extractStoreFromBackup(data){
  if(!data||typeof data!=='object') throw new Error('Backup file is empty or invalid');
  if(data.kind==='interlace-portal-backup'&&data.store&&typeof data.store==='object') return {meta:data,incoming:data.store};
  if(data.store&&typeof data.store==='object'&&(data.updatedAt||data.version)) return {meta:{kind:'server-portal-store',scope:'full',...data},incoming:data.store};
  if(Array.isArray(data.employees)||Array.isArray(data.policies)||Array.isArray(data.hrs)) return {meta:{kind:'raw-store',scope:'full'},incoming:data};
  throw new Error('This file does not look like an Interlace portal backup');
}
function mergeCompanyBackupIntoStore(incoming,companyId){
  const cid=resolveCompanyId(companyId||lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL');
  const next=cloneJson(store);
  const keepOthers=(next.employees||[]).filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')!==cid);
  const incomingEmployees=Array.isArray(incoming.employees)?incoming.employees.map(e=>({...e,companyId:cid})):[];
  const incomingIds=new Set(incomingEmployees.map(e=>e.id));
  next.employees=[...keepOthers,...incomingEmployees];
  next.queries=(next.queries||[]).filter(q=>{
    if(!q.empId) return true;
    const emp=(store.employees||[]).find(e=>e.id===q.empId);
    if(emp&&resolveCompanyId(emp.companyId)===cid) return false;
    return !incomingIds.has(q.empId);
  }).concat(Array.isArray(incoming.queries)?incoming.queries:[]);
  next.leaveRequests=(next.leaveRequests||[]).filter(r=>{
    const empId=r.empId||r.employeeId;
    const emp=(store.employees||[]).find(e=>e.id===empId);
    if(emp&&resolveCompanyId(emp.companyId)===cid) return false;
    return !incomingIds.has(empId);
  }).concat(Array.isArray(incoming.leaveRequests)?incoming.leaveRequests:[]);
  next.teamWall=(next.teamWall||[]).filter(w=>{
    const emp=(store.employees||[]).find(e=>e.id===w.empId);
    return !(emp&&resolveCompanyId(emp.companyId)===cid);
  }).concat(Array.isArray(incoming.teamWall)?incoming.teamWall:[]);
  next.moodPulse=(next.moodPulse||[]).filter(m=>{
    const emp=(store.employees||[]).find(e=>e.id===m.empId);
    return !(emp&&resolveCompanyId(emp.companyId)===cid);
  }).concat(Array.isArray(incoming.moodPulse)?incoming.moodPulse:[]);
  if(incoming.appointmentLetterTemplates&&typeof incoming.appointmentLetterTemplates==='object'){
    next.appointmentLetterTemplates={...(next.appointmentLetterTemplates||{}),...incoming.appointmentLetterTemplates};
  }
  if(Array.isArray(incoming.policies)&&incoming.policies.length&&isCentralHrSession()){
    next.policies=incoming.policies;
  }
  return next;
}
function refreshAfterPortalBackupRestore(){
  try{
    renderOverview();
    renderEmpTable();
    if(typeof renderPolicies==='function') renderPolicies();
    if(typeof renderQueries==='function') renderQueries();
    if(typeof renderSalaries==='function') renderSalaries();
    if(typeof renderEvents==='function') renderEvents();
    if(typeof renderNews==='function') renderNews();
  }catch(err){
    console.error(err);
  }
}
window.downloadPortalBackup=function(){
  if(!currentUser||currentUser.portal!=='hr'){
    toast('Sign in as Admin/HR to download a portal backup');
    return;
  }
  const payload=buildPortalBackupPayload();
  const stamp=portalBackupStamp();
  const scopePart=payload.scope==='company'?`-${payload.companyId||'company'}`:'-full';
  const filename=`interlace-portal-backup${scopePart}-${stamp}.json`;
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  link.click();
  URL.revokeObjectURL(url);
  const meta=document.getElementById('portalBackupMeta');
  if(meta){
    const counts=payload.store||{};
    meta.textContent=`Last download: ${filename} · employees ${counts.employees?.length||0} · policies ${counts.policies?.length||0} · queries ${counts.queries?.length||0}`;
  }
  toast(payload.scope==='company'?'Company backup downloaded':'Full portal backup downloaded');
};
window.triggerPortalBackupRestore=function(){
  if(!currentUser||currentUser.portal!=='hr'){
    toast('Sign in as Admin/HR to restore a backup');
    return;
  }
  const input=document.getElementById('portalBackupFile');
  if(!input){toast('Backup restore control is missing');return;}
  input.value='';
  input.click();
};
window.restorePortalBackupFromFile=async function(input){
  const file=input?.files?.[0];
  if(!file) return;
  if(!currentUser||currentUser.portal!=='hr'){
    toast('Sign in as Admin/HR to restore a backup');
    input.value='';
    return;
  }
  let parsed;
  try{
    parsed=JSON.parse(await file.text());
  }catch(err){
    toast('Could not read that JSON backup file');
    input.value='';
    return;
  }
  let meta,incoming;
  try{
    ({meta,incoming}=extractStoreFromBackup(parsed));
  }catch(err){
    toast(err.message||'Invalid backup file');
    input.value='';
    return;
  }
  const backupScope=meta.scope||'full';
  const isCompanyBackup=backupScope==='company';
  if(isCompanyBackup){
    const companyId=resolveCompanyId(meta.companyId||lockedHrCompanyId()||incoming.employees?.[0]?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
    if(isCompanyHrSession()&&lockedHrCompanyId()!==companyId){
      toast('This backup belongs to another company');
      input.value='';
      return;
    }
    const ok=confirm(`Restore company backup for ${companyNameById(companyId)}?\n\nThis replaces that company's employees and related records in the live portal.`);
    if(!ok){input.value='';return;}
    store=normalizeStore(mergeCompanyBackupIntoStore(incoming,companyId));
  }else{
    if(!isCentralHrSession()){
      toast('Only Central Admin can restore a full portal backup');
      input.value='';
      return;
    }
    const ok=confirm('Restore FULL portal backup?\n\nThis replaces all employees, salaries, policies, queries, and other portal data currently live.');
    if(!ok){input.value='';return;}
    store=normalizeStore(incoming);
  }
  if(meta.extras?.wordGameProgress&&typeof meta.extras.wordGameProgress==='object'){
    try{localStorage.setItem(HRP_GAME_KEY,JSON.stringify(meta.extras.wordGameProgress));}catch(err){}
  }
  if(meta.extras?.activeCompanyId&&isCentralHrSession()){
    activeCompanyId=meta.extras.activeCompanyId;
    try{localStorage.setItem(HRP_COMPANY_KEY,activeCompanyId);}catch(err){}
  }
  saveStore();
  refreshAfterPortalBackupRestore();
  const metaEl=document.getElementById('portalBackupMeta');
  if(metaEl) metaEl.textContent=`Last restore: ${file.name} · ${new Date().toLocaleString()}`;
  toast('Portal backup restored');
  input.value='';
};

async function hydratePortalStore(){
  if(!location.protocol.startsWith('http')) return false;
  try{
    const response=await fetch('/api/portal-store',{cache:'no-store'});
    if(!response.ok) throw new Error('Backend store unavailable');
    const data=await response.json();
    backendStoreUpdatedAt=data.updatedAt||'';
    const remoteHadLocations=PORTAL_COMPANIES.some(c=>Array.isArray(data.store?.companyLocations?.[c.id]));
    if(data.saved&&data.store){
      store=normalizeStore(data.store);
      localStorage.setItem(HRP_KEY,JSON.stringify(store));
    }
    backendStoreHydrated=true;
    if(!data.saved||!remoteHadLocations) saveStore();
    return true;
  }catch(err){
    console.error('Using browser fallback because backend store is unavailable:',err);
    return false;
  }
}

function rebuildCurrentUserFromStore(){
  if(!currentUser?.id&&!currentUser?.email) return null;
  const signedInId=currentUser.id;
  const signedInEmail=currentUser.email;
  const employee=store.employees.find(item=>item.id===signedInId||item.email===signedInEmail);
  const hr=store.hrs.find(item=>item.id===signedInId||item.email===signedInEmail);
  const bu=(store.buHeads||[]).find(item=>item.id===signedInId||item.email===signedInEmail);
  const itUser=(store.itUsers||[]).find(item=>item.id===signedInId||item.email===signedInEmail);
  const primary=hr||bu||itUser||employee;
  if(!primary) return null;
  currentUser=buildUnifiedSession(primary);
  return primary;
}
function notifyNewDirectMessages(previousMessageIds){
  const employee=employeeById(currentUser?.id);
  if(!employee||!previousMessageIds) return;
  const incoming=(store.directMessages||[]).filter(message=>message.toId===employee.id&&!previousMessageIds.has(message.id));
  if(!incoming.length) return;
  const latest=incoming[incoming.length-1];
  const sender=employeeById(latest.fromId);
  toast(`${sender?.name||'A colleague'} sent you a new message`);
  playChatNotificationSound();
}
function syncPortalQueryBadges(){
  try{
    const open=(hasManagementAccess()&&typeof adminScopedQueries==='function'?adminScopedQueries():store.queries||[]).filter(q=>q.status!=='resolved').length;
    document.querySelectorAll('#qBadge,[id="qBadge"]').forEach(el=>{el.textContent=open;});
    const ov=document.getElementById('ovQ');
    if(ov) ov.textContent=open;
  }catch(_err){}
}
function refreshPortalChrome(){
  try{if(hasSelfServiceAccess()) updateBars();}catch(_err){}
  try{syncTeamLeavesNav();}catch(_err){}
  try{updateChatUnreadBadge();}catch(_err){}
  try{syncPortalQueryBadges();}catch(_err){}
  if(hasItAccess()) try{updateItExitReturnBadge();}catch(_err){}
  const topName=document.getElementById('empTopName');
  if(topName&&currentUser?.name) topName.textContent=currentUser.name;
  try{applyUnifiedNavVisibility();}catch(_err){}
  try{refreshUnifiedTopbar();}catch(_err){}
}
function activePortalPageId(){
  const page=document.querySelector('#s-employee .main > .pg.act');
  return page?.id?.replace(/^pg-/,'')||null;
}
function activePortalSubtabId(pageId){
  const page=document.getElementById('pg-'+pageId);
  return page?.querySelector('.pg-subpanel.act')?.getAttribute('data-subpanel')||null;
}
function refreshActivePortalViews(){
  const shell=document.getElementById('s-employee');
  if(!shell?.classList.contains('active')) return;
  const pg=activePortalPageId();
  if(!pg) return;
  const sub=activePortalSubtabId(pg);
  const run=(fn)=>{try{if(typeof fn==='function')fn();}catch(err){console.error('Live refresh failed:',pg,err);}};
  const selfPages={
    home:()=>run(renderEmployeeHome),
    me:()=>run(renderEmployeeMe),
    colleagues:()=>{run(renderColleagues);if(sub==='messages'&&activeColleagueId) run(renderColleagueConversation);},
    ePolicies:()=>run(renderEPolicies),
    eDocuments:()=>run(renderEmployeeDocuments),
    raiseQuery:()=>run(renderMyQueries),
    myLeaves:()=>{run(updateBars);run(initLeaveApplyDates);run(updateLeaveApplyPreview);run(renderMyLeaveRequests);},
    teamLeaves:()=>run(renderMyTeamPage),
    news:()=>run(renderNewsPortal),
    engage:()=>run(renderEngage),
    games:()=>run(renderGameTab)
  };
  const mgmtPages={
    policies:()=>run(renderPolicies),
    queries:()=>run(renderQueries),
    employees:()=>run(renderEmpTable),
    hrAccess:()=>{if(isCentralHrSession()) run(renderHrAdminList);run(renderBuHeadAdminList);},
    salaries:()=>run(renderSalaries),
    documents:()=>{run(renderAdminDocuments);run(renderAppointmentLetterPreview);},
    assets:()=>{run(renderAdminAssets);run(renderAdminAssetInventory);},
    transfers:()=>run(renderTransfers),
    probation:()=>run(renderProbation),
    exits:()=>run(renderExits),
    announcements:()=>run(renderAnnouncements),
    overview:()=>run(renderOverview),
    onboarding:()=>run(renderOnboardingPage),
    bhOverview:()=>run(renderBuHeadOverview),
    bhTeam:()=>run(renderBuHeadTeam)
  };
  if(selfPages[pg]) selfPages[pg]();
  else if(mgmtPages[pg]) mgmtPages[pg]();
  else if(pg==='itAssets') run(refreshAssetViews);
}
function applyRemoteStoreUpdate(nextStore,meta={}){
  const previousMessageIds=meta.previousMessageIds||new Set((store.directMessages||[]).map(message=>message.id));
  store=normalizeStore(adoptLocalCompanyLocations(nextStore));
  if(meta.backendUpdatedAt) backendStoreUpdatedAt=meta.backendUpdatedAt;
  localStorage.setItem(HRP_KEY,JSON.stringify(store));
  if(meta.revision!==undefined) localStoreRevision=String(meta.revision);
  else localStoreRevision=localStorage.getItem(HRP_REV_KEY)||localStoreRevision;
  if(typeof migrateExitAssetReturnItems==='function') migrateExitAssetReturnItems();
  if(!currentUser?.id&&!currentUser?.email) return;
  if(!rebuildCurrentUserFromStore()) return;
  notifyNewDirectMessages(previousMessageIds);
  refreshPortalChrome();
  refreshActivePortalViews();
}
function refreshPortalStoreFromLocal(forcedRevision){
  if(!currentUser?.id&&!currentUser?.email) return;
  const rev=forcedRevision!=null?String(forcedRevision):(localStorage.getItem(HRP_REV_KEY)||'');
  const raw=localStorage.getItem(HRP_KEY);
  if(!raw) return;
  if(rev&&rev===localStoreRevision) return;
  try{
    const incoming=normalizeStore(JSON.parse(raw));
    if(JSON.stringify(incoming)===JSON.stringify(store)){
      localStoreRevision=rev||('boot:'+raw.length);
      return;
    }
    applyRemoteStoreUpdate(incoming,{
      previousMessageIds:new Set((store.directMessages||[]).map(message=>message.id)),
      revision:rev||localStorage.getItem(HRP_REV_KEY)||''
    });
  }catch(err){
    console.error('VayanaPulse local store sync failed:',err);
  }
}
function handlePortalStoreStorageEvent(event){
  if(!currentUser?.id&&!currentUser?.email) return;
  if(event.key===HRP_REV_KEY||event.key===HRP_KEY){
    refreshPortalStoreFromLocal(event.key===HRP_REV_KEY?event.newValue:null);
  }
}
async function refreshPortalStore(){
  refreshPortalStoreFromLocal();
  if(!backendStoreHydrated||localPortalSavePending()||!location.protocol.startsWith('http')) return;
  try{
    const response=await fetch('/api/portal-store',{cache:'no-store'});
    if(!response.ok) return;
    const data=await response.json();
    if(!data.saved||!data.store||!data.updatedAt) return;
    if(localPortalSavePending()||!isRemoteStoreNewer(data.updatedAt,backendStoreUpdatedAt)) return;
    applyRemoteStoreUpdate(data.store,{
      backendUpdatedAt:data.updatedAt,
      revision:localStorage.getItem(HRP_REV_KEY)||'',
      previousMessageIds:new Set((store.directMessages||[]).map(message=>message.id))
    });
  }catch(err){
    console.error('VayanaPulse live refresh failed:',err);
  }
}
function normalizeStore(data){
  const base=JSON.parse(JSON.stringify(seedData));
  const merged={...base,...data};
  merged.hrs=Array.isArray(data.hrs)&&data.hrs.length?data.hrs:base.hrs;
  const hrByEmail=new Map(merged.hrs.map(user=>[String(user.email||'').toLowerCase(),user]));
  base.hrs.forEach(seedHr=>{
    const key=String(seedHr.email||'').toLowerCase();
    const existing=hrByEmail.get(key);
    if(existing){
      existing.accessRole=seedHr.accessRole||existing.accessRole;
      existing.companyId=seedHr.companyId||existing.companyId;
      existing.title=existing.title||seedHr.title;
      if(key==='admin@company.com'||key==='admin@vayana.com'||!existing.password){
        existing.password=seedHr.password;
        existing.mustChangePassword=false;
      }
    }else{
      merged.hrs.push({...seedHr});
      hrByEmail.set(key,merged.hrs[merged.hrs.length-1]);
    }
  });
  // Keep common demo admin logins working even when store has company-domain admin emails.
  merged.hrs.forEach(user=>{
    const email=String(user.email||'').toLowerCase();
    if(email==='admin@company.com'||email==='admin@vayana.com'){
      user.password='admin@123';
      user.mustChangePassword=false;
      user.accessRole='central';
      user.companyId='all';
      if(user.status==='Inactive') user.status='Active';
    }
  });
  const hasVayana=merged.hrs.some(h=>String(h.email||'').toLowerCase()==='admin@vayana.com');
  if(!hasVayana){
    merged.hrs.unshift({id:'hr-1',name:'Central Admin',email:'admin@vayana.com',password:'admin@123',title:'Central Admin',accessRole:'central',companyId:'all',status:'Active',mustChangePassword:false});
  }
  merged.employees=Array.isArray(data.employees)?data.employees:base.employees;
  const seedEmpByEmail=Object.fromEntries(base.employees.map(item=>[String(item.email||'').toLowerCase(),item]));
  const retiredEmails=new Set((Array.isArray(data.retiredEmployeeEmails)?data.retiredEmployeeEmails:[]).map(email=>String(email).toLowerCase()));
  const deletedIds=new Set((Array.isArray(data.deletedEmployeeIds)?data.deletedEmployeeIds:[]).map(id=>String(id)));
  const deletedEmails=new Set((Array.isArray(data.deletedEmployeeEmails)?data.deletedEmployeeEmails:[]).map(email=>String(email).toLowerCase()));
  merged.employees=merged.employees.filter(user=>{
    const email=String(user.email||'').toLowerCase();
    const id=String(user.id||'');
    return !(id&&deletedIds.has(id))&&!(email&&deletedEmails.has(email));
  });
  const empByEmail=new Map(merged.employees.map(user=>[String(user.email||'').toLowerCase(),user]));
  base.employees.forEach(seedEmp=>{
    const key=String(seedEmp.email||'').toLowerCase();
    const seedId=String(seedEmp.id||'');
    if(!key||retiredEmails.has(key)||deletedEmails.has(key)||(seedId&&deletedIds.has(seedId))||empByEmail.has(key)) return;
    merged.employees.push({...seedEmp});
    empByEmail.set(key,merged.employees[merged.employees.length-1]);
  });
  merged.employees=merged.employees.map(user=>{
    const seedEmp=seedEmpByEmail[String(user.email||'').toLowerCase()];
    if(seedEmp){
      // Preserve portal passwords; only fill seed password when missing.
      // Do NOT reset changed passwords back to seed on every normalize.
      const preservedPassword=String(user.password||'').length?user.password:seedEmp.password;
      return {
        ...user,
        password:preservedPassword,
        mustChangePassword:String(user.password||'').length?Boolean(user.mustChangePassword):false
      };
    }
    return user;
  });
  merged.policies=Array.isArray(data.policies)?data.policies:base.policies;
  merged.policySources=Array.isArray(data.policySources)?data.policySources:[];
  merged.queries=Array.isArray(data.queries)?data.queries:base.queries;
  merged.events=Array.isArray(data.events)?data.events:base.events;
  merged.news=Array.isArray(data.news)?data.news:base.news;
  const seedCompanies=PORTAL_COMPANIES.map(c=>({
    id:c.id,
    code:c.code,
    name:c.name,
    shortName:c.shortName||c.code||c.name,
    isParent:Boolean(c.isParent)
  }));
  merged.companies=Array.isArray(data.companies)&&data.companies.length
    ?seedCompanies.map(seed=>{
        const existing=(data.companies||[]).find(c=>resolveCompanyId(c.id)===seed.id)||{};
        return {...seed,...existing,id:seed.id,code:seed.code||existing.code,name:existing.name||seed.name,isParent:seed.isParent};
      })
    :seedCompanies;
  merged.teamWall=Array.isArray(data.teamWall)?data.teamWall:base.teamWall;
  merged.moodPulse=Array.isArray(data.moodPulse)?data.moodPulse:base.moodPulse;
  merged.directMessages=Array.isArray(data.directMessages)?data.directMessages:[];
  merged.retiredEmployeeEmails=Array.isArray(data.retiredEmployeeEmails)?data.retiredEmployeeEmails.map(email=>String(email).toLowerCase()):[];
  merged.deletedEmployeeIds=Array.isArray(data.deletedEmployeeIds)?data.deletedEmployeeIds.map(id=>String(id)): [];
  merged.deletedEmployeeEmails=Array.isArray(data.deletedEmployeeEmails)?data.deletedEmployeeEmails.map(email=>String(email).toLowerCase()):[];
  merged.appointmentLetterTemplates=(data.appointmentLetterTemplates&&typeof data.appointmentLetterTemplates==='object')?data.appointmentLetterTemplates:{};
  merged.news.forEach(n=>{
    n.reactions=n.reactions||{};
    n.companyId=normalizeRecordCompanyId(n.companyId,PORTAL_ALL_COMPANIES_ID);
  });
  merged.events.forEach(ev=>{
    ev.companyId=normalizeRecordCompanyId(ev.companyId,PORTAL_ALL_COMPANIES_ID);
  });
  merged.policies.forEach(p=>{
    p.format=p.format||'text';
    p.updatedAt=p.updatedAt||p.date||new Date().toISOString();
    p.companyId=normalizeRecordCompanyId(p.companyId,PORTAL_ALL_COMPANIES_ID);
  });
  merged.queries.forEach((q,i)=>{
    q.id=q.id||i+1;
    q.status=q.status||'open';
    q.category=q.category||'General';
    q.createdAt=q.createdAt||new Date().toISOString();
  });
  (merged.hrs||[]).forEach((h,i)=>{
    h.id=h.id||`hr-${i+1}`;
    h.password=h.password||'hr123';
    h.mustChangePassword=Boolean(h.mustChangePassword);
    if(h.role==='super_admin') h.accessRole='central';
    if(h.role==='company_hr') h.accessRole='company';
    h.accessRole=h.accessRole==='company'?'company':'central';
    h.role=h.accessRole==='company'?'company_hr':'super_admin';
    h.companyId=h.accessRole==='company'
      ?resolveCompanyId(h.companyId||PARENT_COMPANY_ID)
      :PORTAL_ALL_COMPANIES_ID;
    if(h.accessRole==='company') h.name=companyNameById(h.companyId);
  });
  merged.buHeads=Array.isArray(data.buHeads)?data.buHeads.slice():[];
  const buHeadByEmail=new Map(merged.buHeads.map(user=>[String(user.email||'').toLowerCase(),user]));
  (base.buHeads||[]).forEach(seedHead=>{
    const key=String(seedHead.email||'').toLowerCase();
    const existing=buHeadByEmail.get(key);
    if(existing){
      existing.bu=existing.bu||seedHead.bu||'';
      existing.personName=existing.personName||seedHead.personName||existing.name||'';
      existing.title=existing.title||seedHead.title||'BU Head';
      if(existing.budget==null||existing.budget==='') existing.budget=seedHead.budget??0;
      if(!existing.companyId&&seedHead.companyId) existing.companyId=seedHead.companyId;
      // Demo Engineering head: migrate legacy VNSPL-only seed → all companies
      if(key==='buhead@company.com'&&(String(seedHead.companyId||'').toLowerCase()==='all'||seedHead.companyId===PORTAL_ALL_COMPANIES_ID)&&(existing.companyId==='VNSPL'||!existing.companyId)){
        existing.companyId=PORTAL_ALL_COMPANIES_ID;
      }
      if(!existing.password) existing.password=seedHead.password;
      if(!existing.status) existing.status=seedHead.status||'Active';
    }else{
      merged.buHeads.push({...seedHead});
      buHeadByEmail.set(key,merged.buHeads[merged.buHeads.length-1]);
    }
  });
  (merged.buHeads||[]).forEach((h,i)=>{
    h.id=h.id||`buh-${i+1}`;
    h.name=h.name||h.personName||'BU Head';
    h.personName=h.personName||h.name||'';
    h.email=String(h.email||'').trim().toLowerCase();
    h.password=h.password||'bu@123';
    h.bu=String(h.bu||h.businessUnit||'').trim();
    const rawCid=String(h.companyId||'').trim();
    h.companyId=(!rawCid||rawCid.toLowerCase()==='all'||rawCid===PORTAL_ALL_COMPANIES_ID)
      ?PORTAL_ALL_COMPANIES_ID
      :resolveCompanyId(rawCid);
    h.status=h.status==='Inactive'?'Inactive':'Active';
    h.title=h.title||'BU Head';
    h.mustChangePassword=Boolean(h.mustChangePassword);
    h.accessRole='buHead';
    if(h.budget==null||h.budget==='') h.budget=0;
    else if(typeof h.budget==='string') h.budget=parseCtcAmount(h.budget)||h.budget||0;
    else h.budget=Number.isFinite(Number(h.budget))?Number(h.budget):0;
  });
  merged.itUsers=Array.isArray(data.itUsers)?data.itUsers.slice():[];
  const itUserByEmail=new Map(merged.itUsers.map(user=>[String(user.email||'').toLowerCase(),user]));
  (base.itUsers||[]).forEach(seedIt=>{
    const key=String(seedIt.email||'').toLowerCase();
    const existing=itUserByEmail.get(key);
    if(existing){
      existing.title=existing.title||seedIt.title||'IT Asset Admin';
      existing.name=existing.name||seedIt.name||'IT Desk';
      if(!existing.companyId&&seedIt.companyId) existing.companyId=seedIt.companyId;
      if(!existing.password) existing.password=seedIt.password;
      if(!existing.status) existing.status=seedIt.status||'Active';
      existing.accessRole='it';
    }else{
      merged.itUsers.push({...seedIt});
      itUserByEmail.set(key,merged.itUsers[merged.itUsers.length-1]);
    }
  });
  (merged.itUsers||[]).forEach((u,i)=>{
    u.id=u.id||`it-${i+1}`;
    u.name=u.name||'IT Desk';
    u.email=String(u.email||'').trim().toLowerCase();
    u.password=u.password||'it@123';
    u.title=u.title||'IT Asset Admin';
    u.accessRole='it';
    const rawCid=String(u.companyId||'').trim();
    u.companyId=(!rawCid||rawCid.toLowerCase()==='all'||rawCid===PORTAL_ALL_COMPANIES_ID)
      ?PORTAL_ALL_COMPANIES_ID
      :resolveCompanyId(rawCid);
    u.status=u.status==='Inactive'?'Inactive':'Active';
    u.mustChangePassword=Boolean(u.mustChangePassword);
  });
  merged.employees.forEach((e,i)=>{
    e.id=e.id||`emp-${i+1}`;
    e.employeeCode=e.employeeCode||'';
    e.companyId=resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
    e.status=e.status||'Active';
    e.password=e.password||'emp123';
    e.mustChangePassword=Boolean(e.mustChangePassword);
    e.ctc=e.ctc||'';
    e.salaryHistory=Array.isArray(e.salaryHistory)?e.salaryHistory:[];
    if(!e.salaryHistory.length&&parseCtcAmount(e.ctc)>0){
      e.salaryHistory.push({
        id:`sal-init-${e.id}`,
        type:'joining',
        previousCtc:0,
        newCtc:parseCtcAmount(e.ctc),
        bonusAmount:0,
        effectiveDate:e.dateOfJoining||e.onboardedAt||new Date().toISOString().slice(0,10),
        notes:'Initial CTC on record',
        recordedAt:new Date().toISOString(),
        recordedBy:'System'
      });
    }
    e.profile=e.profile||{};
    e.profile.dob=e.profile.dob||'';
    e.profile.hobbies=e.profile.hobbies||'';
    e.profile.photo=e.profile.photo||'';
    const seedEmployee=base.employees.find(emp=>emp.id===e.id)||base.employees.find(emp=>String(emp.email||'').toLowerCase()===String(e.email||'').toLowerCase());
    if(seedEmployee?.profile){
      e.profile.dob=e.profile.dob||seedEmployee.profile.dob||'';
      e.profile.hobbies=e.profile.hobbies||seedEmployee.profile.hobbies||'';
    }
    if(seedEmployee&&!parseCtcAmount(e.ctc)&&parseCtcAmount(seedEmployee.ctc)){
      e.ctc=seedEmployee.ctc;
    }
    if(seedEmployee&&(!e.salaryHistory||!e.salaryHistory.length)&&Array.isArray(seedEmployee.salaryHistory)&&seedEmployee.salaryHistory.length){
      e.salaryHistory=JSON.parse(JSON.stringify(seedEmployee.salaryHistory));
    }
    // Unit name (bu) + BU person (buHead) + project — keep both person and unit distinct
    if(!String(e.bu||'').trim()&&String(e.businessUnit||'').trim()) e.bu=String(e.businessUnit).trim();
    if(!String(e.bu||'').trim()&&seedEmployee?.bu) e.bu=seedEmployee.bu;
    if(!String(e.bu||'').trim()&&String(e.sbu||'').trim()) e.bu=String(e.sbu).trim();
    e.bu=String(e.bu||'').trim();
    e.buHead=e.buHead!=null?String(e.buHead):'';
    if(!e.buHead&&seedEmployee?.buHead) e.buHead=seedEmployee.buHead;
    e.project=e.project!=null?String(e.project):'';
    if(!e.project&&seedEmployee?.project) e.project=seedEmployee.project;
    e.dateOfJoining=e.dateOfJoining||seedEmployee?.dateOfJoining||'';
    e.leavingDate=e.leavingDate||e.dateOfLeaving||e.exitDate||e.lastWorkingDay||'';
    e.location=e.location||e.workLocation||e.officeLocation||'';
    if(!String(e.location||'').trim()){
      const cid=resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
      const locMap=data.companyLocations;
      const stored=locMap&&typeof locMap==='object'&&!Array.isArray(locMap)&&Array.isArray(locMap[cid])
        ?locMap[cid].map(v=>String(v||'').trim()).filter(Boolean)
        :null;
      const seedLoc=String(seedEmployee?.location||'').trim();
      const fallback=DEFAULT_COMPANY_REPORTING_PLACES[cid]||'';
      if(stored){
        if(seedLoc&&stored.includes(seedLoc)) e.location=seedLoc;
        else if(fallback&&stored.includes(fallback)) e.location=fallback;
      }else{
        e.location=seedLoc||fallback;
      }
    }
    e.tenure=e.tenure||(e.dateOfJoining?tenureFromJoining(e.dateOfJoining):'');
    e.employmentHistory=Array.isArray(e.employmentHistory)?e.employmentHistory:[];
    e.probation=e.probation&&typeof e.probation==='object'?e.probation:{};
    ensureEmployeeProbation(e);
    e.buProjectEdits=Array.isArray(e.buProjectEdits)?e.buProjectEdits:[];
    e.buEditedAt=e.buEditedAt||'';
    e.projectEditedAt=e.projectEditedAt||'';
    e.buHeadEditedAt=e.buHeadEditedAt||'';
    e.dateOfJoiningEdits=Array.isArray(e.dateOfJoiningEdits)?e.dateOfJoiningEdits:[];
    e.dateOfJoiningEditedAt=e.dateOfJoiningEditedAt||'';
    e.leave=e.leave||JSON.parse(JSON.stringify(base.employees[0].leave));
    ['annual','sick','wfh','comp'].forEach(k=>{e.leave[k]=e.leave[k]||{u:0,t:k==='annual'?18:k==='sick'?8:k==='wfh'?12:3};});
    e.policyReads=e.policyReads||{};
    e.learningCompletions=Array.isArray(e.learningCompletions)?e.learningCompletions:[];
    e.dismissedNotifications=Array.isArray(e.dismissedNotifications)?e.dismissedNotifications:[];
    e.documents=Array.isArray(e.documents)?e.documents:[];
    e.documents.forEach(doc=>{doc.acknowledgedAt=doc.acknowledgedAt||'';});
    e.assets=Array.isArray(e.assets)?e.assets:[];
    const seedEmpForAssets=seedEmpByEmail[String(e.email||'').toLowerCase()];
    if(!e.assets.length&&Array.isArray(seedEmpForAssets?.assets)&&seedEmpForAssets.assets.length){
      e.assets=JSON.parse(JSON.stringify(seedEmpForAssets.assets));
    }
    e.assets.forEach(asset=>{
      asset.id=asset.id||`asset-${e.id}-${Date.now()}`;
      asset.type=ASSET_TYPES.some(t=>t.key===asset.type)?asset.type:'others';
      asset.typeLabel=asset.typeLabel||ASSET_TYPES.find(t=>t.key===asset.type)?.label||'Others';
      asset.otherDetail=asset.otherDetail||'';
      asset.remarks=asset.remarks||'';
      asset.serialOrTag=asset.serialOrTag||'';
      asset.allocatedAt=asset.allocatedAt||'';
      asset.allocatedBy=asset.allocatedBy||'';
      asset.status=asset.status==='returned'?'returned':'allocated';
      asset.returnedAt=asset.returnedAt||null;
      asset.condition=asset.condition||'Good';
    });
    e.gameProgress=e.gameProgress||null;
    e.bvg=e.bvg||{};
    e.bvg.status=e.bvg.status||'approved';
    e.bvg.docs=e.bvg.docs||{};
    e.bvg.note=e.bvg.note||'';
    e.bvg.submittedAt=e.bvg.submittedAt||'';
    e.bvg.reviewedAt=e.bvg.reviewedAt||'';
    e.bvg.reviewedBy=e.bvg.reviewedBy||'';
  });
  merged.transferRequests=Array.isArray(merged.transferRequests)?merged.transferRequests:[];
  merged.exitCases=Array.isArray(merged.exitCases)?merged.exitCases:[];
  merged.nextTransferId=merged.nextTransferId||Math.max(1,...merged.transferRequests.map(r=>Number(String(r.id).replace(/\D/g,''))||0))+1;
  merged.nextExitId=merged.nextExitId||Math.max(1,...merged.exitCases.map(r=>Number(String(r.id).replace(/\D/g,''))||0))+1;
  merged.nextPolicyId=merged.nextPolicyId||Math.max(0,...merged.policies.map(p=>Number(p.id)||0))+1;
  merged.nextQueryId=merged.nextQueryId||Math.max(0,...merged.queries.map(q=>Number(q.id)||0))+1;
  merged.nextEmployeeId=merged.nextEmployeeId||Math.max(0,...merged.employees.map(e=>Number(String(e.id).replace(/\D/g,''))||0))+1;
  merged.leaveRequests=Array.isArray(merged.leaveRequests)?merged.leaveRequests:[];
  merged.nextLeaveRequestId=merged.nextLeaveRequestId||Math.max(0,...merged.leaveRequests.map(r=>Number(r.id)||0))+1;
  ensureCompanyLocationsStore(merged);
  ensureAssetInventoryStore(merged);
  ensureNehaEmployeeLogin(merged);
  return merged;
}
function normalizeAssetInventoryItem(item){
  if(!item||typeof item!=='object') return null;
  item.id=item.id||`inv-${Date.now()}`;
  item.companyId=resolveCompanyId(item.companyId||PARENT_COMPANY_ID);
  item.assetTag=String(item.assetTag||item.serialOrTag||'').trim();
  item.type=ASSET_TYPES.some(t=>t.key===item.type)?item.type:'others';
  item.typeLabel=item.typeLabel||ASSET_TYPES.find(t=>t.key===item.type)?.label||'Others';
  item.otherDetail=item.otherDetail||'';
  item.brandModel=item.brandModel||'';
  item.condition=item.condition||'Good';
  item.remarks=item.remarks||'';
  item.purchaseDate=item.purchaseDate||'';
  item.createdAt=item.createdAt||new Date().toISOString();
  item.createdBy=item.createdBy||'HR';
  item.empId=item.empId||'';
  item.empName=item.empName||'';
  item.employeeAssetId=item.employeeAssetId||'';
  item.allocatedAt=item.allocatedAt||'';
  item.returnedAt=item.returnedAt||'';
  const status=String(item.status||'').toLowerCase();
  item.status=['in_stock','allocated','retired'].includes(status)?status:(status==='returned'?'in_stock':'in_stock');
  if(item.empId&&item.employeeAssetId) item.status='allocated';
  return item;
}
function ensureAssetInventoryStore(merged){
  const base=JSON.parse(JSON.stringify(seedData));
  merged.assetInventory=Array.isArray(merged.assetInventory)?merged.assetInventory:[];
  if(!merged.assetInventory.length&&Array.isArray(base.assetInventory)&&base.assetInventory.length){
    merged.assetInventory=JSON.parse(JSON.stringify(base.assetInventory));
  }
  merged.assetInventory=merged.assetInventory.map(normalizeAssetInventoryItem).filter(Boolean);
  merged.nextAssetInventoryId=merged.nextAssetInventoryId||Math.max(1,...merged.assetInventory.map(i=>Number(String(i.id).replace(/\D/g,''))||0))+1;
  migrateEmployeeAssetsIntoInventory(merged);
}
function inventoryTagKey(companyId,tag){
  return `${resolveCompanyId(companyId)}::${String(tag||'').trim().toLowerCase()}`;
}
function findInventoryByEmployeeAsset(employee,asset){
  store.assetInventory=store.assetInventory||[];
  if(asset?.inventoryId){
    const byId=store.assetInventory.find(i=>i.id===asset.inventoryId);
    if(byId) return byId;
  }
  if(asset?.id){
    const byLink=store.assetInventory.find(i=>i.employeeAssetId===asset.id);
    if(byLink) return byLink;
  }
  if(asset?.serialOrTag){
    return store.assetInventory.find(i=>inventoryTagKey(i.companyId,i.assetTag)===inventoryTagKey(employee.companyId,asset.serialOrTag))||null;
  }
  return null;
}
function createInventoryFromEmployeeAsset(employee,asset,target=store){
  const nextId=target.nextAssetInventoryId||1;
  target.nextAssetInventoryId=nextId+1;
  return normalizeAssetInventoryItem({
    id:`inv-${nextId}`,
    companyId:employee.companyId,
    assetTag:asset.serialOrTag||`ASSET-${asset.id}`,
    type:asset.type,
    typeLabel:asset.typeLabel,
    otherDetail:asset.otherDetail||'',
    brandModel:'',
    condition:asset.condition||'Good',
    status:asset.status==='returned'?'in_stock':'allocated',
    remarks:asset.remarks||'',
    purchaseDate:'',
    createdAt:asset.allocatedAt?`${asset.allocatedAt}T10:00:00+05:30`:new Date().toISOString(),
    createdBy:asset.allocatedBy||'HR',
    empId:asset.status==='returned'?'':employee.id,
    empName:asset.status==='returned'?'':employee.name,
    employeeAssetId:asset.status==='returned'?'':asset.id,
    allocatedAt:asset.allocatedAt||'',
    returnedAt:asset.returnedAt||''
  });
}
function migrateEmployeeAssetsIntoInventory(merged){
  merged.assetInventory=merged.assetInventory||[];
  const byAssetId=new Map(merged.assetInventory.filter(i=>i.employeeAssetId).map(i=>[i.employeeAssetId,i]));
  const byTag=new Map();
  merged.assetInventory.forEach(item=>{
    if(item.assetTag) byTag.set(inventoryTagKey(item.companyId,item.assetTag),item);
  });
  (merged.employees||[]).forEach(employee=>{
    (employee.assets||[]).forEach(asset=>{
      let inv=byAssetId.get(asset.id);
      if(!inv&&asset.inventoryId) inv=merged.assetInventory.find(i=>i.id===asset.inventoryId);
      if(!inv&&asset.serialOrTag) inv=byTag.get(inventoryTagKey(employee.companyId,asset.serialOrTag));
      if(!inv){
        inv=createInventoryFromEmployeeAsset(employee,asset,merged);
        merged.assetInventory.push(inv);
        if(inv.assetTag) byTag.set(inventoryTagKey(inv.companyId,inv.assetTag),inv);
        byAssetId.set(asset.id,inv);
      }
      asset.inventoryId=inv.id;
      inv.employeeAssetId=asset.status==='returned'?'':asset.id;
      inv.empId=asset.status==='returned'?'':employee.id;
      inv.empName=asset.status==='returned'?'':employee.name;
      inv.status=asset.status==='returned'?'in_stock':'allocated';
      inv.allocatedAt=asset.allocatedAt||inv.allocatedAt;
      inv.returnedAt=asset.returnedAt||'';
      inv.type=asset.type||inv.type;
      inv.typeLabel=asset.typeLabel||inv.typeLabel;
      inv.condition=asset.condition||inv.condition;
      if(!inv.assetTag&&asset.serialOrTag) inv.assetTag=asset.serialOrTag;
    });
  });
}
function inventoryStatusLabel(status){
  return ({in_stock:'In stock',allocated:'Allocated',retired:'Retired'}[status]||status);
}
function inventoryStatusClass(status){
  return status==='allocated'?'b-active':status==='retired'?'b-archived':'b-pending';
}
function inventoryTypeText(item){
  return item.type==='others'&&item.otherDetail
    ?`${safeText(item.typeLabel||'Others')} — ${safeText(item.otherDetail)}`
    :safeText(item.typeLabel||assetTypeLabel(item.type));
}
function ensureNehaEmployeeLogin(target){
  const email='neha.tanksale@vayana.com';
  const id='neha-neha-tanksale-vayana-com';
  const password='Neha_vayana';
  if(!target||typeof target!=='object') return target;
  target.deletedEmployeeEmails=Array.isArray(target.deletedEmployeeEmails)
    ?target.deletedEmployeeEmails.filter(item=>String(item||'').toLowerCase()!==email)
    :[];
  target.deletedEmployeeIds=Array.isArray(target.deletedEmployeeIds)
    ?target.deletedEmployeeIds.filter(item=>{
      const value=String(item||'');
      return value!==id&&!/neha-tanksale-vayana/i.test(value);
    })
    :[];
  target.retiredEmployeeEmails=Array.isArray(target.retiredEmployeeEmails)
    ?target.retiredEmployeeEmails.filter(item=>String(item||'').toLowerCase()!==email)
    :[];
  target.employees=Array.isArray(target.employees)?target.employees:[];
  let user=target.employees.find(item=>String(item.email||'').toLowerCase()===email);
  if(!user){
    user={
      id,
      name:'Neha Tanksale',
      email,
      password,
      mustChangePassword:false,
      companyId:'VNSPL',
      employeeCode:'',
      dept:'General',
      role:'Employee',
      status:'Active',
      manager:'HR',
      reportingManager:'HR',
      bu:'',
      project:'',
      buHead:'',
      dateOfJoining:'',
      leavingDate:'',
      ctc:'',
      salaryHistory:[],
      profile:{dob:'',hobbies:'',photo:''},
      leave:{annual:{u:0,t:18},sick:{u:0,t:8},wfh:{u:0,t:12},comp:{u:0,t:3}},
      policyReads:{},
      dismissedNotifications:[],
      documents:[],
      assets:[],
      learningCompletions:[],
      bvg:{status:'approved',docs:{},note:'',submittedAt:'',reviewedAt:'',reviewedBy:''},
      gameProgress:null
    };
    target.employees.push(user);
  }else{
    user.id=user.id||id;
    user.name=user.name||'Neha Tanksale';
    user.email=email;
    // Keep Neha's known working password unless she already changed it in-portal.
    if(!user.passwordChangedInPortal) user.password=password;
    else if(!String(user.password||'').length) user.password=password;
    user.status='Active';
    user.mustChangePassword=false;
    user.companyId=user.companyId||'VNSPL';
    user.dept=user.dept||'General';
    user.role=user.role||'Employee';
  }
  return target;
}
function initials(name){return name.split(/\s+/).map(p=>p[0]).join('').slice(0,2).toUpperCase();}
function employeeById(id){return store.employees.find(e=>e.id===id);}
/** Linked employee profile for self-service (home, colleagues, chat) — not the HR/BU login id. */
function currentSelfServiceEmployee(){
  if(!currentUser) return null;
  let emp=employeeById(currentUser.employeeId)
    ||employeeById(currentUser.id)
    ||(store.employees||[]).find(e=>emailKey(e.email)===emailKey(currentUser.email)&&e.status!=='Inactive')
    ||null;
  const beforeLen=(store.employees||[]).length;
  if(!emp&&hasBuHeadAccess()){
    emp=ensureEmployeeForBuHead(currentBuHeadRecord());
  }
  if(!emp&&hasItAccess()){
    emp=ensureEmployeeForIt(currentItRecord());
  }
  if(!emp&&hasManagementAccess()){
    emp=ensureEmployeeForHr(currentHrRecord()||currentUser);
  }
  if(emp&&(store.employees||[]).length>beforeLen){
    try{saveStore();}catch(_err){/* ignore persist errors during ensure */}
  }
  if(emp&&!currentUser.employeeId){
    currentUser.employeeId=emp.id;
  }
  return emp||null;
}
function colleaguesDirectoryForUser(me){
  const active=(store.employees||[]).filter(e=>e.status==='Active'&&e.id!==me?.id);
  if(hasManagementAccess()&&isCompanyHrSession()){
    const cid=lockedHrCompanyId();
    return active.filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid);
  }
  if(hasManagementAccess()&&isCentralHrSession()){
    if(isAllCompaniesView()) return active;
    const cid=resolveCompanyId(activeCompanyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
    return active.filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid);
  }
  const myCid=resolveCompanyId(me?.companyId||currentUser?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
  return active.filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===myCid);
}
function colleagueCardAccentIndex(employee){
  const seed=String(employee?.id||employee?.name||'');
  let n=0;
  for(let i=0;i<seed.length;i++) n=(n+seed.charCodeAt(i))%3;
  return n;
}
function colleagueDirectoryTags(employee){
  const tags=[
    companyCodeById(employee.companyId),
    employee.dept||employee.department,
    employee.project,
    employeeReportingPlace(employee)
  ].map(value=>String(value||'').trim()).filter(Boolean);
  const seen=new Set();
  return tags.filter(tag=>{
    const key=tag.toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,4);
}
function colleagueDirectoryRowHtml(me,employee){
  const unread=employeeUnreadMessages(me.id).filter(message=>message.fromId===employee.id).length;
  const role=employee.role||employee.designation||'Employee';
  const dept=employee.dept||employee.department||'';
  const place=employeeReportingPlace(employee);
  const summary=[role,dept?`in ${dept}`:'',place?`· ${place}`:''].filter(Boolean).join(' ');
  const tags=colleagueDirectoryTags(employee);
  const accent=colleagueCardAccentIndex(employee);
  const icon=employee?.profile?.photo
    ? `<img src="${employee.profile.photo}" alt="">`
    : safeText(initials(employee?.name||'Employee'));
  const placeKey=String(place||'').trim().toLowerCase();
  const tagHtml=tags.length
    ? tags.map(tag=>{
        const isPlace=placeKey&&String(tag).trim().toLowerCase()===placeKey;
        return `<span class="colleague-card-tag${isPlace?' colleague-card-tag-place':''}">${safeText(tag)}</span>`;
      }).join('')
    : `<span class="colleague-card-tag">TEAM</span>`;
  return `
    <article class="colleague-card" role="button" tabindex="0" onclick="openColleagueChat('${employee.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openColleagueChat('${employee.id}')}">
      <div class="colleague-card-icon colleague-card-icon-${accent}">${icon}</div>
      <h3>${safeText(employee.name)}</h3>
      <p>${safeText(summary)}</p>
      <div class="colleague-card-tags">${tagHtml}</div>
      <div class="colleague-card-foot">
        <a class="colleague-card-more" href="mailto:${safeText(employee.email||'')}" onclick="event.stopPropagation()">EMAIL <span aria-hidden="true">→</span></a>
        <button type="button" class="colleague-card-msg" onclick="event.stopPropagation();openColleagueChat('${employee.id}')">Message${unread?` <span class="chat-row-unread">${unread}</span>`:''}</button>
      </div>
    </article>`;
}
function colleagueMessageRowHtml(me,employee){
  const unread=employeeUnreadMessages(me.id).filter(message=>message.fromId===employee.id).length;
  return `
    <button type="button" class="colleague-row colleague-message-row ${employee.id===activeColleagueId?'selected':''}" onclick="openColleagueChat('${employee.id}')">
      ${avatarHtml(employee,'av av-e')}
      <div class="colleague-identity">
        <strong>${safeText(employee.name)}</strong>
        <span>${safeText(employee.dept||employee.role||employee.email)}</span>
        ${reportingPlaceMetaHtml(employee)}
      </div>
      ${unread?`<span class="chat-row-unread">${unread}</span>`:''}
    </button>`;
}
function currentHrRecord(){
  if(!currentUser||!(currentUser.isCentral||currentUser.isCompanyHr||currentUser.portal==='hr')) return null;
  return (store.hrs||[]).find(h=>h.id===currentUser.id||h.id===currentUser.hrId||String(h.email||'').toLowerCase()===String(currentUser.email||'').toLowerCase())||(currentUser.isCentral||currentUser.isCompanyHr?currentUser:null);
}
function companyById(companyId){
  if(companyId===PORTAL_ALL_COMPANIES_ID) return {id:PORTAL_ALL_COMPANIES_ID,code:'',name:'All Entities',isAll:true};
  return PORTAL_COMPANIES.find(c=>c.id===resolveCompanyId(companyId))||PORTAL_COMPANIES[0];
}
function companyNameById(companyId){
  if(companyId===PORTAL_ALL_COMPANIES_ID) return 'All Entities';
  return companyById(companyId)?.name||PORTAL_COMPANIES[0]?.name||'Company';
}
function companyCodeById(companyId){
  if(companyId===PORTAL_ALL_COMPANIES_ID) return 'ALL';
  return companyById(companyId)?.code||'';
}
function companyLabelById(companyId){
  return companyOptionLabel(companyById(companyId));
}
function employeeCompanyName(employee){
  return companyNameById(employee?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
}
function employeeAdminLabel(employee){
  const code=companyCodeById(employee?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')||employeeCompanyName(employee);
  const name=employee?.name||'Employee';
  return `${code} — ${name}`;
}
function normalizePersonName(value){
  return String(value||'')
    .toLowerCase()
    .replace(/\./g,' ')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function employeeManagerName(employee){
  const name=String(employee?.reportingManager||employee?.manager||'').trim();
  if(!name||/^not assigned$/i.test(name)||/^hr$/i.test(name)) return '';
  return name;
}
function findManagerEmployee(employee){
  const managerName=employeeManagerName(employee);
  if(!managerName) return null;
  const target=normalizePersonName(managerName);
  return (store.employees||[]).find(m=>{
    if(m.id===employee?.id||m.status==='Inactive') return false;
    const name=normalizePersonName(m.name);
    return name===target||name.startsWith(target)||target.startsWith(name);
  })||null;
}
function employeeDirectReports(manager){
  if(!manager) return [];
  const managerNorm=normalizePersonName(manager.name);
  return (store.employees||[]).filter(e=>{
    if(e.id===manager.id||e.status==='Inactive') return false;
    const assigned=normalizePersonName(employeeManagerName(e));
    return assigned&&(assigned===managerNorm||assigned.startsWith(managerNorm)||managerNorm.startsWith(assigned));
  });
}
function teamLeaveRequestsForManager(me,options={}){
  if(!me) return [];
  const reports=employeeDirectReports(me);
  const reportIds=new Set(reports.map(r=>r.id));
  const meNorm=normalizePersonName(me.name);
  let requests=(store.leaveRequests||[]).filter(r=>
    reportIds.has(r.empId)
    ||(r.managerId&&r.managerId===me.id)
    ||normalizePersonName(r.managerName)===meNorm
  );
  if(options.status) requests=requests.filter(r=>r.status===options.status);
  return requests.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
function pendingTeamLeaveCount(me){
  return teamLeaveRequestsForManager(me,{status:'pending'}).length;
}
function syncTeamLeavesNav(){
  const nav=document.getElementById('navTeamLeaves');
  const badge=document.getElementById('teamLeaveBadge');
  if(!nav) return;
  const me=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  const reports=employeeDirectReports(me);
  const pending=pendingTeamLeaveCount(me);
  const probationDue=typeof teamProbationReviewsForManager==='function'
    ?teamProbationReviewsForManager(me).filter(e=>typeof probationNeedsManagerReview==='function'&&probationNeedsManagerReview(e)).length
    :0;
  const lwdDue=pendingTeamResignationLwdCount(me);
  const actions=pending+probationDue+lwdDue;
  nav.style.display=(reports.length||actions)?'':'none';
  if(badge){
    badge.textContent=actions>99?'99+':String(actions);
    badge.hidden=!actions;
  }
}
function pendingLeaveBalance(employeeId,leaveKey){
  return (store.leaveRequests||[])
    .filter(r=>r.empId===employeeId&&r.status==='pending'&&r.leaveKey===leaveKey)
    .reduce((sum,r)=>sum+(Number(r.days)||0),0);
}
function isCompanyHrSession(){
  if(currentUser?.isCompanyHr) return true;
  if(currentUser?.isCentral) return false;
  if(currentUser?.portal!=='hr') return false;
  const hr=currentHrRecord()||currentUser;
  if(!hr) return false;
  if(hr.accessRole==='central'||hr.companyId===PORTAL_ALL_COMPANIES_ID) return false;
  if(hr.accessRole==='company') return true;
  // Company-bound HR accounts without an explicit role stay locked to their entity.
  return PORTAL_COMPANIES.some(c=>c.id===resolveCompanyId(hr.companyId));
}
function isCentralHrSession(){
  if(currentUser?.isCentral) return true;
  if(currentUser?.isCompanyHr) return false;
  return Boolean(currentUser?.portal==='hr'&&!isCompanyHrSession());
}
/** Plan Model A alias: Super Admin === Central Admin */
function isSuperAdmin(){
  return isCentralHrSession();
}
/** Active admin company filter: 'all' | companyId (Company HR always locked). */
function adminCompanyFilter(){
  if(isCompanyHrSession()) return lockedHrCompanyId()||PARENT_COMPANY_ID;
  return activeCompanyId||PORTAL_ALL_COMPANIES_ID;
}
/** Company stamped on new HR writes (All view defaults to parent / Vayana). */
function writeTargetCompanyId(){
  if(isCompanyHrSession()) return lockedHrCompanyId()||PARENT_COMPANY_ID;
  if(isAllCompaniesView()) return PARENT_COMPANY_ID;
  return resolveCompanyId(activeCompanyId||PARENT_COMPANY_ID);
}
function normalizeRecordCompanyId(value,fallback=PARENT_COMPANY_ID){
  const raw=String(value||'').trim();
  if(!raw) return fallback;
  if(raw.toLowerCase()==='all'||raw===PORTAL_ALL_COMPANIES_ID) return PORTAL_ALL_COMPANIES_ID;
  return resolveCompanyId(raw);
}
function recordMatchesAdminCompanyScope(recordCompanyId){
  const cid=normalizeRecordCompanyId(recordCompanyId,PORTAL_ALL_COMPANIES_ID);
  if(cid===PORTAL_ALL_COMPANIES_ID) return true;
  if(isCompanyHrSession()) return cid===(lockedHrCompanyId()||PARENT_COMPANY_ID);
  if(isAllCompaniesView()) return true;
  return cid===resolveCompanyId(activeCompanyId||PARENT_COMPANY_ID);
}
function recordMatchesEmployeeCompanyScope(recordCompanyId,employee){
  const cid=normalizeRecordCompanyId(recordCompanyId,PORTAL_ALL_COMPANIES_ID);
  if(cid===PORTAL_ALL_COMPANIES_ID) return true;
  const myCid=resolveCompanyId(employee?.companyId||PARENT_COMPANY_ID);
  return cid===myCid;
}
function scopedEmployees(records=store.employees){
  return adminVisibleEmployees(records);
}
function scopedHrs(records=store.hrs||[]){
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId()||PARENT_COMPANY_ID;
    return (records||[]).filter(h=>{
      if(h.accessRole==='central'||h.companyId===PORTAL_ALL_COMPANIES_ID||h.role==='super_admin') return true;
      return resolveCompanyId(h.companyId)===cid;
    });
  }
  return [...(records||[])];
}
function scopedPolicies(records=store.policies||[]){
  return (records||[]).filter(p=>recordMatchesAdminCompanyScope(p.companyId));
}
function scopedQueries(records=store.queries||[]){
  return adminScopedQueries(records);
}
function scopedNews(records=store.news||[]){
  return (records||[]).filter(n=>recordMatchesAdminCompanyScope(n.companyId));
}
function scopedEvents(records=store.events||[]){
  return (records||[]).filter(ev=>recordMatchesAdminCompanyScope(ev.companyId));
}
function employeeScopedPolicies(employee,records=store.policies||[]){
  return (records||[]).filter(p=>recordMatchesEmployeeCompanyScope(p.companyId,employee));
}
function employeeScopedNews(employee,records=store.news||[]){
  return (records||[]).filter(n=>recordMatchesEmployeeCompanyScope(n.companyId,employee));
}
function employeeScopedEvents(employee,records=store.events||[]){
  return (records||[]).filter(ev=>recordMatchesEmployeeCompanyScope(ev.companyId,employee));
}
function hasManagementAccess(){
  return Boolean(currentUser?.isCentral||currentUser?.isCompanyHr||currentUser?.portal==='hr');
}
function hasBuHeadAccess(){
  return Boolean(currentUser?.isBuHead||currentUser?.portal==='buHead'||currentUser?.accessRole==='buHead');
}
function hasItAccess(){
  return Boolean(currentUser?.isIt||currentUser?.portal==='it'||currentUser?.accessRole==='it');
}
function currentItRecord(){
  return (store.itUsers||[]).find(u=>u.id===currentUser?.id||u.id===currentUser?.itUserId||emailKey(u.email)===emailKey(currentUser?.email))||(currentUser?.isIt?currentUser:null);
}
function itVisibleEmployees(records=store.employees){
  const active=(records||[]).filter(e=>e.status==='Active');
  const it=currentItRecord();
  if(!it) return active;
  const raw=String(it.companyId||'').trim();
  if(!raw||raw.toLowerCase()==='all'||raw===PORTAL_ALL_COMPANIES_ID) return active;
  const cid=resolveCompanyId(raw);
  return active.filter(e=>resolveCompanyId(e.companyId)===cid);
}
function hasSelfServiceAccess(){
  if(currentUser?.isEmployee) return true;
  if(currentUser?.isBuHead) return true; // BU Heads always get employee self-service in the unified portal
  if(currentUser?.isIt) return true; // IT always gets employee self-service alongside asset inventory
  if(currentUser?.isCentral||currentUser?.isCompanyHr||currentUser?.portal==='hr') return true; // HR also gets personal employee experience
  if(currentUser?.portal==='employee') return true;
  return Boolean(employeeById(currentUser?.id)||(store.employees||[]).some(e=>String(e.email||'').toLowerCase()===String(currentUser?.email||'').toLowerCase()));
}

/** Link a BU Head login to an employee profile so they get full self-service (policies, leave, docs). */
function ensureEmployeeForBuHead(bu){
  if(!bu) return null;
  store.employees=store.employees||[];
  const email=emailKey(bu.email);
  let emp=store.employees.find(e=>emailKey(e.email)===email&&e.status!=='Inactive')||null;
  if(emp) return emp;
  const person=normalizePersonName(bu.personName||bu.name||'');
  if(person){
    emp=store.employees.find(e=>normalizePersonName(e.name)===person&&e.status!=='Inactive')||null;
    if(emp) return emp;
  }
  const companyId=(!bu.companyId||String(bu.companyId).toLowerCase()==='all')
    ?(PORTAL_COMPANIES[0]?.id||'VNSPL')
    :resolveCompanyId(bu.companyId);
  emp=createEmployeeRecord({
    name:bu.personName||bu.name||'BU Head',
    email:bu.email,
    dept:bu.bu||'General',
    role:'BU Head',
    tempPass:bu.password||'bu@123',
    companyId,
    hrFields:{
      bu:bu.bu||'',
      buHead:bu.personName||bu.name||'',
      designation:'BU Head',
      department:bu.bu||'General',
      mustChangePassword:false
    }
  });
  emp.mustChangePassword=false;
  emp.password=bu.password||emp.password||'bu@123';
  store.employees.push(emp);
  return emp;
}

/** Link an IT login to an employee profile so they get full self-service (policies, leave, docs). */
function ensureEmployeeForIt(it){
  if(!it) return null;
  store.employees=store.employees||[];
  const email=emailKey(it.email);
  let emp=store.employees.find(e=>emailKey(e.email)===email&&e.status!=='Inactive')||null;
  if(emp) return emp;
  const person=normalizePersonName(it.name||'');
  if(person){
    emp=store.employees.find(e=>normalizePersonName(e.name)===person&&e.status!=='Inactive')||null;
    if(emp) return emp;
  }
  const companyId=(!it.companyId||String(it.companyId).toLowerCase()==='all'||it.companyId===PORTAL_ALL_COMPANIES_ID)
    ?(PORTAL_COMPANIES[0]?.id||'VNSPL')
    :resolveCompanyId(it.companyId);
  emp=createEmployeeRecord({
    name:it.name||'IT Desk',
    email:it.email,
    dept:'IT',
    role:it.title||'IT Asset Admin',
    tempPass:it.password||'it@123',
    companyId,
    hrFields:{
      designation:it.title||'IT Asset Admin',
      department:'IT',
      mustChangePassword:false
    }
  });
  emp.mustChangePassword=false;
  emp.password=it.password||emp.password||'it@123';
  store.employees.push(emp);
  return emp;
}

/** Link an HR/Central Admin login to an employee profile for personal self-service. */
function ensureEmployeeForHr(hr){
  if(!hr) return null;
  store.employees=store.employees||[];
  const email=emailKey(hr.email);
  let emp=store.employees.find(e=>emailKey(e.email)===email&&e.status!=='Inactive')||null;
  if(emp) return emp;
  const person=normalizePersonName(hr.name||'');
  if(person){
    emp=store.employees.find(e=>normalizePersonName(e.name)===person&&e.status!=='Inactive')||null;
    if(emp) return emp;
  }
  const isCentral=hr.accessRole==='central'||hr.companyId===PORTAL_ALL_COMPANIES_ID||String(hr.companyId||'').toLowerCase()==='all';
  const companyId=isCentral
    ?(PORTAL_COMPANIES[0]?.id||'VNSPL')
    :resolveCompanyId(hr.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
  emp=createEmployeeRecord({
    name:hr.name||(isCentral?'Central Admin':'Company HR'),
    email:hr.email,
    dept:'HR',
    role:hr.title||(isCentral?'Central Admin':'Company HR'),
    tempPass:hr.password||'hr@123',
    companyId,
    hrFields:{
      designation:hr.title||(isCentral?'Central Admin':'Company HR'),
      department:'HR',
      mustChangePassword:false
    }
  });
  emp.mustChangePassword=false;
  emp.password=hr.password||emp.password||'hr@123';
  store.employees.push(emp);
  return emp;
}
function lockedHrCompanyId(){
  if(!isCompanyHrSession()) return null;
  return resolveCompanyId(currentHrRecord()?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
}
function employeeInHrScope(employee){
  if(!employee) return false;
  if(!isCompanyHrSession()) return true;
  const cid=lockedHrCompanyId();
  return resolveCompanyId(employee.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid;
}
function assertEmployeeInHrScope(employee,action='manage'){
  if(employeeInHrScope(employee)) return true;
  toast(`You can only ${action} employees in your company`);
  return false;
}
function employeeInItScope(employee){
  if(!employee||!hasItAccess()) return false;
  if(itVisibleEmployees().some(e=>e.id===employee.id)) return true;
  const it=currentItRecord();
  if(!it) return true;
  const raw=String(it.companyId||'').trim();
  if(!raw||raw.toLowerCase()==='all'||raw===PORTAL_ALL_COMPANIES_ID) return true;
  return resolveCompanyId(employee.companyId)===resolveCompanyId(raw);
}
function assertEmployeeInItScope(employee,action='manage'){
  if(employeeInItScope(employee)) return true;
  toast(`You can only ${action} employees in your IT scope`);
  return false;
}
function assertCanManageEmployeeAssets(employee,action='manage assets for'){
  if(hasManagementAccess()) return assertEmployeeInHrScope(employee,action);
  if(hasItAccess()) return assertEmployeeInItScope(employee,action);
  toast('You do not have permission to manage assets');
  return false;
}
function refreshAssetViews(){
  if(hasManagementAccess()) try{renderAdminAssets();}catch(_err){}
  if(hasManagementAccess()) try{renderAdminAssetInventory();}catch(_err){}
  if(hasItAccess()){
    try{renderItAssets();}catch(_err){}
    try{renderItAssetInventory();}catch(_err){}
    try{renderItExitAssetReturns();}catch(_err){}
    try{updateItExitReturnBadge();}catch(_err){}
  }
}
function assetSheetScopeId(){
  if(hasItAccess()&&document.getElementById('pg-itAssets')?.classList.contains('act')){
    const it=currentItRecord();
    const raw=String(it?.companyId||'').trim();
    if(!raw||raw.toLowerCase()==='all'||raw===PORTAL_ALL_COMPANIES_ID) return 'all';
    return resolveCompanyId(raw);
  }
  return excelPushScopeId();
}
function inventoryRowToSheet(inv){
  const emp=inv.empId?employeeById(inv.empId):null;
  return {
    recordType:'Inventory',
    companyId:resolveCompanyId(inv.companyId),
    companyName:companyLabelById(inv.companyId),
    assetTag:inv.assetTag||'',
    assetType:inv.type||'',
    typeLabel:inv.typeLabel||assetTypeLabel(inv.type),
    brandModel:inv.brandModel||'',
    condition:inv.condition||'Good',
    status:inventoryStatusLabel(inv.status),
    employeeId:inv.empId||'',
    employeeCode:emp?.employeeCode||'',
    employeeName:inv.empName||emp?.name||'',
    department:emp?.dept||'',
    allocatedAt:inv.allocatedAt||'',
    returnedAt:inv.returnedAt||'',
    purchaseDate:inv.purchaseDate||'',
    remarks:inv.remarks||'',
    createdAt:inv.createdAt||'',
    createdBy:inv.createdBy||'',
    inventoryId:inv.id||'',
    employeeAssetId:inv.employeeAssetId||'',
    otherDetail:inv.otherDetail||''
  };
}
function allocationRowToSheet(employee,asset){
  return {
    recordType:'Allocation',
    companyId:resolveCompanyId(employee.companyId),
    companyName:companyLabelById(employee.companyId),
    assetTag:asset.serialOrTag||'',
    assetType:asset.type||'',
    typeLabel:asset.typeLabel||assetTypeLabel(asset.type),
    brandModel:'',
    condition:asset.condition||'Good',
    status:asset.status==='returned'?'Returned':'Allocated',
    employeeId:employee.id||'',
    employeeCode:employee.employeeCode||'',
    employeeName:employee.name||'',
    department:employee.dept||'',
    allocatedAt:asset.allocatedAt||'',
    returnedAt:asset.returnedAt||'',
    purchaseDate:'',
    remarks:asset.remarks||'',
    createdAt:asset.allocatedAt||'',
    createdBy:asset.allocatedBy||'',
    inventoryId:asset.inventoryId||'',
    employeeAssetId:asset.id||'',
    otherDetail:asset.otherDetail||''
  };
}
function assetsForExcelPush(scope=assetSheetScopeId()){
  const rows=[];
  let inventory=store.assetInventory||[];
  let employees=store.employees||[];
  if(scope!=='all'){
    const cid=resolveCompanyId(scope);
    inventory=inventory.filter(i=>resolveCompanyId(i.companyId)===cid);
    employees=employees.filter(e=>resolveCompanyId(e.companyId)===cid);
  }
  inventory.forEach(inv=>rows.push(inventoryRowToSheet(inv)));
  employees.forEach(employee=>{
    (employee.assets||[]).forEach(asset=>rows.push(allocationRowToSheet(employee,asset)));
  });
  rows.sort((a,b)=>{
    const company=(a.companyId||'').localeCompare(b.companyId||'');
    if(company) return company;
    const type=(a.recordType||'').localeCompare(b.recordType||'');
    if(type) return type;
    return String(a.assetTag||'').localeCompare(String(b.assetTag||''));
  });
  return rows;
}
function csvEscapeCell(value){
  const text=String(value??'');
  if(/[",\n\r]/.test(text)) return `"${text.replace(/"/g,'""')}"`;
  return text;
}
function assetSheetToCsv(rows){
  const header=ASSET_SHEET_HEADERS.join(',');
  const body=rows.map(row=>ASSET_SHEET_HEADERS.map(key=>csvEscapeCell(row[key])).join(',')).join('\n');
  return `\uFEFF${header}\n${body}`;
}
function scheduleAssetSheetPush(reason=''){
  if(!location.protocol.startsWith('http')) return;
  if(currentUser?.portal!=='hr'&&!currentUser?.isIt) return;
  if(assetSheetPushTimer) clearTimeout(assetSheetPushTimer);
  assetSheetPushTimer=setTimeout(()=>{
    assetSheetPushTimer=null;
    syncAssetsToBackendSheet(false,{reason}).catch(err=>console.error('Asset Excel push failed:',err));
  },700);
}
window.downloadAssetAllocationCsv=function(){
  const scope=assetSheetScopeId();
  const rows=assetsForExcelPush(scope);
  const stamp=new Date().toISOString().slice(0,10);
  const scopeLabel=scope==='all'?'all-entities':companyCodeById(scope);
  const url=URL.createObjectURL(new Blob([assetSheetToCsv(rows)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=`assets-allocation-${scopeLabel}-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${rows.length} asset row(s)`);
};
window.syncAssetsToBackendSheet=async function(manual=false,{reason=''}={}){
  if(assetSheetPushing) return;
  if(!location.protocol.startsWith('http')){
    if(manual){downloadAssetAllocationCsv();toast('Local file saved — start the portal server to write Excel backup on disk');}
    return;
  }
  if(currentUser?.portal!=='hr'&&!currentUser?.isIt&&!manual) return;
  assetSheetPushing=true;
  const resultId=manual&&document.getElementById('pg-itAssets')?.classList.contains('act')?'itAssetSheetSyncResult':'assetSheetSyncResult';
  const result=document.getElementById(resultId);
  const pushBtn=document.getElementById(manual&&document.getElementById('pg-itAssets')?.classList.contains('act')?'itAssetPushExcelBtn':'assetPushExcelBtn');
  if(pushBtn){
    pushBtn.disabled=true;
    pushBtn.dataset.prevHtml=pushBtn.innerHTML;
    pushBtn.innerHTML='<i class="ti ti-loader-2" aria-hidden="true"></i> Pushing...';
  }
  try{
    const scope=assetSheetScopeId();
    const rows=assetsForExcelPush(scope);
    if(!rows.length&&scope==='all'){
      if(manual&&result) result.innerHTML='<div class="hint-box danger-soft">No asset rows to push.</div>';
      if(manual) toast('No asset rows to push');
      return;
    }
    const scopeLabel=scope==='all'?'All Entities':companyLabelById(scope);
    const res=await fetch('/api/asset-sheet',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({rows,companyId:scope,scope})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Asset sheet could not be updated');
    const written=data.scopedWritten??data.written??rows.length;
    if(manual&&result){
      result.innerHTML=`<div class="hint-box success-soft"><strong>Pushed ${written} asset row(s) to Excel/CSV</strong> (${scopeLabel}).${data.path?`<br>File: ${safeText(data.path)}`:''}${data.backup?`<br>Backup: ${safeText(data.backup)}`:''}</div>`;
    }
    if(manual) toast(`Pushed ${written} asset row(s) to Excel backup`);
    else if(reason) console.info(`Asset Excel write-back (${reason}): ${written} rows`);
  }catch(err){
    if(manual&&result) result.innerHTML=`<div class="hint-box danger-soft">${safeText(err.message)}</div>`;
    if(manual) toast(`Asset Excel push failed: ${err.message}`);
    else console.error('Asset Excel write-back failed:',err);
  }finally{
    assetSheetPushing=false;
    if(pushBtn){
      pushBtn.disabled=false;
      pushBtn.innerHTML=pushBtn.dataset.prevHtml||'<i class="ti ti-upload" aria-hidden="true"></i> Push to Excel';
    }
  }
};
function isLeaveApplicationQuery(q){
  if(!q) return false;
  if(q.type==='leaveRequest'||q.routedTo==='manager'||q.audience==='manager') return true;
  return q.category==='Leave'&&/\bleave\s*-\s*\d+\s*day/i.test(String(q.subject||''));
}
function adminScopedQueries(records=store.queries||[]){
  const base=records.filter(q=>!isLeaveApplicationQuery(q));
  if(isCentralHrSession()&&isAllCompaniesView()) return [...base];
  const visible=adminVisibleEmployees();
  const visibleIds=new Set(visible.map(e=>e.id));
  const visibleNames=new Set(visible.map(e=>String(e.name||'').toLowerCase()));
  return base.filter(q=>{
    if(q.empId) return visibleIds.has(q.empId);
    return visibleNames.has(String(q.emp||'').toLowerCase());
  });
}
function queryInHrScope(query){
  if(!query||isLeaveApplicationQuery(query)) return false;
  if(isCentralHrSession()&&isAllCompaniesView()) return true;
  if(query.empId){
    return employeeInHrScope(employeeById(query.empId));
  }
  const visibleNames=new Set(adminVisibleEmployees().map(e=>String(e.name||'').toLowerCase()));
  return visibleNames.has(String(query.emp||'').toLowerCase());
}
function employeesForActiveCompany(records=store?.employees||[]){
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId();
    return sortedPortalEmployees(records.filter(e=>(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid));
  }
  if(isAllCompaniesView()) return sortedPortalEmployees(records);
  return sortedPortalEmployees(records.filter(e=>(e.companyId||PORTAL_COMPANIES[0]?.id)===(activeCompanyId||PORTAL_COMPANIES[0]?.id)));
}
function adminVisibleEmployees(records=store.employees){
  return employeesForActiveCompany(records);
}
function employeeUnitName(employee){
  return String(employee?.bu||employee?.businessUnit||employee?.sbu||'').trim();
}
function employeeReportingPlace(employee){
  if(!employee) return '';
  const direct=String(employee.location||employee.workLocation||employee.officeLocation||'').trim();
  if(direct) return direct;
  const cid=resolveCompanyId(employee.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
  return DEFAULT_COMPANY_REPORTING_PLACES[cid]||'';
}
function employeeReportingPlaceLabel(employee){
  return employeeReportingPlace(employee)||'Not assigned';
}
function reportingPlaceMetaHtml(employee){
  const place=employeeReportingPlace(employee);
  if(!place) return '';
  return `<span class="keka-reporting-place"><i class="ti ti-map-pin" aria-hidden="true"></i> ${safeText(place)}</span>`;
}
function currentBuHeadRecord(){
  if(!currentUser||!(hasBuHeadAccess())) return null;
  return (store.buHeads||[]).find(h=>h.id===currentUser.id||h.id===currentUser.buHeadId||String(h.email||'').toLowerCase()===String(currentUser.email||'').toLowerCase())||(currentUser.isBuHead?currentUser:null);
}
function buHeadCompanyScopeId(head){
  const raw=String(head?.companyId||'').trim();
  if(!raw||raw.toLowerCase()==='all'||raw===PORTAL_ALL_COMPANIES_ID) return PORTAL_ALL_COMPANIES_ID;
  return resolveCompanyId(raw);
}
function buHeadCompanyLabel(head){
  const scope=buHeadCompanyScopeId(head);
  if(scope===PORTAL_ALL_COMPANIES_ID) return 'All 5 companies';
  return companyLabelById(scope);
}
function employeesForBuHead(head=currentBuHeadRecord()||currentUser){
  if(!head) return [];
  const unit=String(head.bu||head.businessUnit||'').trim().toLowerCase();
  const person=normalizePersonName(head.personName||head.name||'');
  const scope=buHeadCompanyScopeId(head);
  return sortedPortalEmployees((store.employees||[]).filter(e=>{
    if(scope!==PORTAL_ALL_COMPANIES_ID){
      const eCid=resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
      if(eCid!==scope) return false;
    }
    const eUnit=employeeUnitName(e).toLowerCase();
    if(unit&&eUnit===unit) return true;
    const ePerson=normalizePersonName(e.buHead||'');
    if(person&&ePerson&&(ePerson===person||ePerson.startsWith(person)||person.startsWith(ePerson))) return true;
    return false;
  }));
}
let bhTeamCompanyFilter='all';
function filteredEmployeesForBuHead(head=currentBuHeadRecord()||currentUser){
  const team=employeesForBuHead(head);
  const scope=buHeadCompanyScopeId(head);
  // UI filter only applies when the account itself is multi-company
  if(scope!==PORTAL_ALL_COMPANIES_ID) return team;
  if(!bhTeamCompanyFilter||bhTeamCompanyFilter==='all') return team;
  const cid=resolveCompanyId(bhTeamCompanyFilter);
  return team.filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid);
}
function buHeadBudgetAmount(head=currentBuHeadRecord()||currentUser){
  return parseCtcAmount(head?.budget);
}
function usedBudgetForEmployees(employees){
  return (employees||[]).reduce((sum,e)=>sum+parseCtcAmount(e.ctc),0);
}
function displayBudgetStat(amount){
  const n=parseCtcAmount(amount);
  return n>0?displayCtc(n):'₹0';
}
function fillBuHeadBudgetStats(budgetEl,usedEl,remainEl,employees,head){
  const budget=buHeadBudgetAmount(head);
  const used=usedBudgetForEmployees(employees);
  const remaining=budget-used;
  if(budgetEl) budgetEl.textContent=displayBudgetStat(budget);
  if(usedEl) usedEl.textContent=displayBudgetStat(used);
  if(remainEl){
    if(remaining<0){
      remainEl.textContent='−'+displayBudgetStat(Math.abs(remaining));
      remainEl.style.color='#D92D20';
      remainEl.title='Over budget';
    }else{
      remainEl.textContent=displayBudgetStat(remaining);
      remainEl.style.color='#3B6D11';
      remainEl.title='';
    }
  }
}
function lastBuProjectEditAt(employee){
  const edits=Array.isArray(employee?.buProjectEdits)?employee.buProjectEdits:[];
  const fromHistory=edits.reduce((max,edit)=>{
    const t=Date.parse(edit?.editedAt||'')||0;
    return t>max?t:max;
  },0);
  const stamps=[employee?.buEditedAt,employee?.projectEditedAt,employee?.buHeadEditedAt]
    .map(v=>Date.parse(v||'')||0);
  const maxStamp=Math.max(fromHistory,...stamps,0);
  return maxStamp?new Date(maxStamp).toISOString():'';
}
function lastDateOfJoiningEditAt(employee){
  const edits=Array.isArray(employee?.dateOfJoiningEdits)?employee.dateOfJoiningEdits:[];
  const fromHistory=edits.reduce((max,edit)=>{
    const t=Date.parse(edit?.editedAt||'')||0;
    return t>max?t:max;
  },0);
  const stamp=Date.parse(employee?.dateOfJoiningEditedAt||'')||0;
  const maxStamp=Math.max(fromHistory,stamp,0);
  return maxStamp?new Date(maxStamp).toISOString():'';
}
function applyAdminDateOfJoiningChange(employee,newDoj,previousDoj){
  if(!employee) return;
  const now=new Date().toISOString();
  const editedBy=currentUser?.email||currentUser?.name||'HR';
  employee.dateOfJoiningEdits=Array.isArray(employee.dateOfJoiningEdits)?employee.dateOfJoiningEdits:[];
  employee.dateOfJoiningEdits.unshift({
    oldValue:previousDoj||'',
    newValue:newDoj||'',
    editedAt:now,
    editedBy
  });
  employee.dateOfJoiningEdits=employee.dateOfJoiningEdits.slice(0,50);
  employee.dateOfJoiningEditedAt=now;
  employee.dateOfJoining=newDoj;
  employee.tenure=newDoj?tenureFromJoining(newDoj):'';
  employee.dateOfConfirmation=newDoj?confirmationDateFromJoining(newDoj):'';
  ensureEmployeeProbation(employee);
  const probation=employee.probation;
  if(probation){
    probation.startDate=newDoj||probation.startDate;
    if(newDoj) probation.endDate=confirmationDateFromJoining(newDoj);
  }
  ensureEmployeeSalaryHistory(employee);
  const joinEntry=(employee.salaryHistory||[]).find(h=>h.type==='joining');
  if(joinEntry&&newDoj) joinEntry.effectiveDate=newDoj;
  if(typeof pushEmploymentHistory==='function'){
    pushEmploymentHistory(employee,{
      type:'date_of_joining',
      effectiveDate:newDoj||previousDoj,
      previous:{dateOfJoining:previousDoj},
      next:{dateOfJoining:newDoj},
      notes:`Joining date changed from ${previousDoj?formatDateOnly(previousDoj):'—'} to ${newDoj?formatDateOnly(newDoj):'—'}`
    });
  }
  if(newDoj) employee.hrProfileReady=true;
}
function companySelectOptions(selectedId=''){
  if(isCompanyHrSession()){
    const locked=lockedHrCompanyId();
    return PORTAL_COMPANIES.filter(c=>c.id===locked).map(c=>`<option value="${c.id}" selected>${safeText(companyOptionLabel(c))}</option>`).join('');
  }
  const selected=selectedId||(isAllCompaniesView()?PORTAL_COMPANIES[0]?.id:activeCompanyId)||PORTAL_COMPANIES[0]?.id;
  return PORTAL_COMPANIES.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${safeText(companyOptionLabel(c))}</option>`).join('');
}
function sortedPortalEmployees(records=store.employees){
  return [...records].sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'en',{sensitivity:'base'}));
}
function isEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function docTypeLabel(type){return DOCUMENT_TYPES.find(d=>d.key===type)?.label||PERSONAL_DOCUMENT_TYPES.find(d=>d.key===type)?.label||'Document';}
function docTypeIcon(type){return DOCUMENT_TYPES.find(d=>d.key===type)?.icon||PERSONAL_DOCUMENT_TYPES.find(d=>d.key===type)?.icon||'ti-file';}
function isGeneratedEmployeeDocument(doc){
  return Boolean(doc&&(doc.source==='generated'||doc.generated===true||doc.type==='generated'));
}
function isOnboardingEmployeeDocument(doc){
  return Boolean(doc&&(doc.source==='onboarding'||String(doc.id||'').startsWith('onboard-')));
}
function isPersonalEmployeeDocument(doc){
  if(!doc||isGeneratedEmployeeDocument(doc)||isOnboardingEmployeeDocument(doc)) return false;
  if(doc.source==='employee'||doc.selfUploaded) return true;
  return PERSONAL_DOCUMENT_TYPES.some(t=>t.key===doc.type);
}
function isHrEmployeeDocument(doc){
  return !!doc&&!isPersonalEmployeeDocument(doc)&&!isGeneratedEmployeeDocument(doc)&&!isOnboardingEmployeeDocument(doc);
}
function employeeDocumentFileHref(doc, {download=false}={}){
  const url=String(doc?.fileUrl||doc?.fileData||'');
  if(!url||!download||!doc?.fileUrl) return url;
  return url+(url.includes('?')?'&':'?')+'download=1';
}
function onboardingDocumentType(documentId){
  const id=String(documentId||'').toLowerCase();
  if(id.includes('aadhar')||id.includes('aadhaar')) return 'aadhaar';
  if(id==='pan'||id.startsWith('pan ')) return 'pan';
  if(id==='uan'||id.includes('uan')) return 'uan';
  if(id.includes('bank')) return 'bank';
  if(id.includes('passport size')) return 'other';
  if(id.includes('passport')) return 'passport';
  return 'onboarding';
}
function onboardDocumentRecordId(documentId, storedName){
  const slug=value=>String(value||'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'doc';
  return `onboard-${slug(documentId)}--${slug(storedName)}`;
}
function onboardingLookupParams(employee){
  const params=new URLSearchParams();
  if(employee?.id) params.set('employeeId',employee.id);
  if(employee?.email) params.set('email',employee.email);
  const code=employee?.employeeCode||employee?.empCode||'';
  if(code) params.set('employeeCode',code);
  return params;
}
async function syncOnboardingDocumentsForEmployee(employee){
  if(!employee) return false;
  const params=onboardingLookupParams(employee);
  if(![...params.keys()].length) return false;
  try{
    const res=await fetch(`/api/documents/list?${params}`,{cache:'no-store'});
    if(!res.ok) return false;
    const data=await res.json().catch(()=>({}));
    const files=Array.isArray(data.files)?data.files:[];
    employee.documents=employee.documents||[];
    const nextIds=new Set(files.map(file=>onboardDocumentRecordId(file.documentId,file.storedName)));
    let changed=false;
    const kept=[];
    employee.documents.forEach(doc=>{
      if(!isOnboardingEmployeeDocument(doc)||nextIds.has(doc.id)) kept.push(doc);
      else changed=true;
    });
    employee.documents=kept;
    files.forEach(file=>{
      const id=onboardDocumentRecordId(file.documentId,file.storedName);
      const fileUrl=`/api/documents/file?${params}&storedName=${encodeURIComponent(file.storedName)}`;
      const patch={
        id,
        type:onboardingDocumentType(file.documentId),
        title:file.title||file.documentId||'Onboarding document',
        fileName:file.fileName||file.storedName,
        fileUrl,
        uploadedAt:file.uploadedAt||new Date().toISOString(),
        uploadedBy:'Onboarding',
        source:'onboarding',
        onboardingDocumentId:file.documentId
      };
      const existing=employee.documents.find(doc=>doc.id===id);
      if(!existing){
        employee.documents.push(patch);
        changed=true;
        return;
      }
      if(existing.fileUrl!==fileUrl||existing.fileName!==patch.fileName||existing.title!==patch.title||existing.fileData){
        Object.assign(existing,patch);
        delete existing.fileData;
        changed=true;
      }
    });
    if(changed) saveStore();
    return changed;
  }catch(_err){
    return false;
  }
}
function avatarHtml(employee, cls='av av-e'){
  return employee?.profile?.photo
    ? `<img class="${cls} avatar-img" src="${employee.profile.photo}" alt="${employee.name} profile picture">`
    : `<div class="${cls}">${initials(employee?.name||'Employee')}</div>`;
}
function formatDob(value){
  if(!value) return 'Not added';
  const dt=new Date(`${value}T00:00:00`);
  if(Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function safeText(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function employeeUnreadMessages(employeeId=currentSelfServiceEmployee()?.id||currentUser?.employeeId||currentUser?.id){
  return (store.directMessages||[]).filter(message=>message.toId===employeeId&&!(message.readBy||[]).includes(employeeId));
}
function updateChatUnreadBadge(){
  const badge=document.getElementById('chatUnreadBadge');
  if(!badge) return;
  const count=employeeUnreadMessages().length;
  badge.textContent=count>99?'99+':String(count);
  badge.hidden=count===0;
}
function playChatNotificationSound(){
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass) return;
    const context=new AudioContextClass();
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    oscillator.type='sine';
    oscillator.frequency.setValueAtTime(720,context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(920,context.currentTime+.12);
    gain.gain.setValueAtTime(.0001,context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.16,context.currentTime+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime+.23);
    oscillator.addEventListener('ended',()=>context.close());
  }catch(err){
    console.warn('Chat notification sound unavailable',err);
  }
}
function confirmationDateFromJoining(value){
  if(!value) return '';
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime())) return '';
  date.setMonth(date.getMonth()+6);
  return date.toISOString().slice(0,10);
}
function tenureFromJoining(value){
  if(!value) return '';
  const start=new Date(`${value}T00:00:00`), now=new Date();
  if(Number.isNaN(start.getTime())||start>now) return '0 months';
  let months=(now.getFullYear()-start.getFullYear())*12+(now.getMonth()-start.getMonth());
  if(now.getDate()<start.getDate()) months--;
  const years=Math.floor(Math.max(0,months)/12);
  const remaining=Math.max(0,months)%12;
  return `${years?`${years} year${years===1?'':'s'} `:''}${remaining} month${remaining===1?'':'s'}`.trim();
}
function formatQueryTime(value){
  const dt=new Date(value||Date.now());
  if(Number.isNaN(dt.getTime())) return 'Time unavailable';
  return dt.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function policyUpdatedTime(policy){
  const dt=new Date(policy?.updatedAt||policy?.date||Date.now());
  return Number.isNaN(dt.getTime())?0:dt.getTime();
}
function policyReadValue(employee,policyId){
  return employee?.policyReads?.[policyId];
}
function policyReadTime(employee,policyId){
  const value=policyReadValue(employee,policyId);
  const raw=typeof value==='string'?value:value?.acknowledgedAt;
  const dt=new Date(raw||0);
  return Number.isNaN(dt.getTime())?0:dt.getTime();
}
function isPolicyAcknowledgedCurrent(employee,policy){
  const readTime=policyReadTime(employee,policy.id);
  return Boolean(readTime&&readTime>=policyUpdatedTime(policy));
}
function policyReadStats(employee){
  const active=employeeScopedPolicies(employee).filter(p=>p.status==='Active');
  const read=active.filter(p=>isPolicyAcknowledgedCurrent(employee,p)).length;
  return {read,total:active.length};
}
function policyReadDetails(employee){
  const active=employeeScopedPolicies(employee).filter(p=>p.status==='Active');
  if(!active.length) return '<div class="ri-meta">No active policies assigned</div>';
  return `<div class="policy-read-list">${active.map(p=>{
    const readAt=policyReadValue(employee,p.id);
    const current=isPolicyAcknowledgedCurrent(employee,p);
    return `<span class="policy-read-chip ${current?'done':'todo'}"><i class="ti ${current?'ti-check':'ti-clock'}" aria-hidden="true"></i> ${p.name}${current?` - ${formatQueryTime(typeof readAt==='string'?readAt:readAt?.acknowledgedAt)}`:readAt?' - updated, reread needed':' - not read'}</span>`;
  }).join('')}</div>`;
}
function portalBrand(role){
  return `<img class="brand-logo" src="assets/Vayana-Logo.svg" alt="${safeText(COMPANY.companyName||'Company')}"><span class="brand-product">${safeText(COMPANY.portalName||'Interlace')}</span>${role?` <span class="brand-role">${role}</span>`:''}`;
}
function applyCompanyBranding(){
  applyActiveCompanyName();
  document.title=`${COMPANY.portalName} - ${COMPANY.companyName}`;
  const srOnly=document.querySelector('.sr-only');
  if(srOnly) srOnly.textContent=`${COMPANY.portalName} — Unified portal`;
  const loginBrand=document.querySelector('.login-brand');
  if(loginBrand){
    const product=loginBrand.querySelector('.brand-product');
    const logo=loginBrand.querySelector('.brand-logo');
    if(product) product.textContent=COMPANY.portalName||'Interlace';
    if(!logo) loginBrand.insertAdjacentHTML('afterbegin',`<img class="brand-logo" src="assets/Vayana-Logo.svg" alt="${safeText(COMPANY.companyName||'Vayana')}">`);
    else logo.src='assets/Vayana-Logo.svg';
  }
  const loginSub=document.getElementById('loginPortalSubheading');
  if(loginSub) loginSub.textContent=`Sign in to ${COMPANY.portalName} — one portal for employees, HR, and BU Heads.`;
  const notice=document.getElementById('securityNotice');
  if(notice) notice.textContent=COMPANY.securityNotice;
  const hint=document.getElementById('loginHint');
  if(hint){
    hint.hidden=false;
    hint.style.display='';
    hint.innerHTML=`<strong>Demo logins</strong><br>Super Admin: <code>admin@company.com</code> / <code>admin@123</code><br>Company HR (Vayana): <code>hr.vayana@company.com</code> / <code>hr123</code><br>Employee: <code>priya@company.com</code> / <code>emp123</code>`;
  }
  const adminBrand=document.querySelector('#s-admin .brand');
  if(adminBrand) adminBrand.innerHTML=portalBrand('Admin');
  const empBrand=document.querySelector('#s-employee .brand');
  if(empBrand) empBrand.innerHTML=portalBrand('');
  const buBrand=document.querySelector('#s-buHead .brand');
  if(buBrand) buBrand.innerHTML=portalBrand('BU Head');
  syncAdminCompanySelect();
  document.querySelectorAll('.portal-footer').forEach(el=>el.remove());
  document.querySelectorAll('#s-employee .main').forEach(main=>{
    main.insertAdjacentHTML('beforeend',`<div class="portal-footer">${COMPANY.portalName} · ${COMPANY.companyName} ${COMPANY.portalSubtitle} - Support: ${COMPANY.supportEmail}</div>`);
  });
}
function policySummary(p){
  return p.desc||'No description added yet.';
}
function policyAttachmentLink(p){
  const source=p.sourceId?(store.policySources||[]).find(s=>s.id===p.sourceId):null;
  const fileData=p.fileData||p.sourceFileData||source?.fileData;
  if(!fileData) return '';
  const fileName=p.fileName||p.sourceFileName||source?.fileName||`${p.name}.pdf`;
  return `<a class="policy-file-link" href="${fileData}" target="_blank" rel="noopener" download="${fileName}"><i class="ti ti-file" aria-hidden="true"></i> Source: ${fileName}</a>`;
}
function policyFormatLabel(p){
  if(p.format==='master-document') return 'Imported';
  return (p.format||'text').toUpperCase();
}
function activePolicies(){return scopedPolicies().filter(p=>p.status==='Active');}
function employeeQueries(employee){return store.queries.filter(q=>q.empId===employee?.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
function unreadPolicies(employee){return employeeScopedPolicies(employee).filter(p=>p.status==='Active'&&!isPolicyAcknowledgedCurrent(employee,p));}
const POLICY_ACK_DAYS=14;
function policyAckDeadline(policy){
  const base=policy?.ackDueDate||policy?.updatedAt||policy?.date;
  if(policy?.ackDueDate) return String(policy.ackDueDate).slice(0,10);
  const dt=new Date(base||Date.now());
  if(Number.isNaN(dt.getTime())) return '';
  dt.setDate(dt.getDate()+POLICY_ACK_DAYS);
  return dt.toISOString().slice(0,10);
}
function policyEmployeeBucket(employee,policy){
  if(isPolicyAcknowledgedCurrent(employee,policy)) return 'read';
  const readAt=policyReadTime(employee,policy.id);
  if(readAt&&readTimeBeforePolicyUpdate(readAt,policy)) return 'stale';
  const deadline=policyAckDeadline(policy);
  if(deadline){
    const today=new Date(); today.setHours(0,0,0,0);
    const due=new Date(`${deadline}T00:00:00`);
    if(!Number.isNaN(due.getTime())&&due<today) return 'overdue';
  }
  return 'required';
}
function readTimeBeforePolicyUpdate(readTime,policy){
  return Boolean(readTime&&readTime<policyUpdatedTime(policy));
}
function policyBucketLabel(bucket){
  return ({overdue:'Overdue',required:'Required',read:'Read',stale:'Re-read needed',all:'All'}[bucket]||bucket);
}
let employeePolicyFilter='required';
window.setEmployeePolicyFilter=function(filter){
  employeePolicyFilter=filter||'all';
  renderEPolicies();
};
function leaveTypeKey(type){
  return type==='Annual'?'annual':type==='Sick'?'sick':type==='WFH'?'wfh':'comp';
}
function localDateInputValue(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function leaveDaysFromRange(from,to){
  const start=new Date(`${from}T00:00:00`);
  const end=new Date(`${to}T00:00:00`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())) return 1;
  return Math.max(1,Math.round((end-start)/86400000)+1);
}
function leaveDateRangeLabel(r){
  if(r?.fromDate&&r?.toDate) return `${formatDateOnly(r.fromDate)} – ${formatDateOnly(r.toDate)}`;
  if(r?.fromDate) return formatDateOnly(r.fromDate);
  return '';
}
function initLeaveApplyDates({reset=false}={}){
  const fromEl=document.getElementById('lvFrom');
  const toEl=document.getElementById('lvTo');
  if(!fromEl||!toEl) return;
  const today=localDateInputValue();
  if(reset||!fromEl.value) fromEl.value=today;
  if(reset||!toEl.value) toEl.value=fromEl.value||today;
  updateLeaveApplyDates();
}
window.updateLeaveApplyDates=function(){
  const fromEl=document.getElementById('lvFrom');
  const toEl=document.getElementById('lvTo');
  const daysEl=document.getElementById('lvD');
  if(!fromEl||!toEl||!daysEl) return;
  const from=fromEl.value;
  let to=toEl.value;
  if(from&&!to){
    toEl.value=from;
    to=from;
  }
  if(from&&to&&to<from){
    toEl.value=from;
    to=from;
  }
  if(from&&to){
    const days=leaveDaysFromRange(from,to);
    daysEl.value=String(Math.min(Math.max(1,days),parseInt(daysEl.max,10)||10));
  }
  if(typeof updateLeaveApplyPreview==='function') updateLeaveApplyPreview();
};
function leaveRequestTimelineHtml(r){
  const steps=[
    {key:'submitted',label:'Submitted',done:true,time:r.createdAt},
    {key:'review',label:'Manager review',done:r.status!=='pending',time:r.status!=='pending'?(r.respondedAt||r.createdAt):''},
    {key:'done',label:r.status==='approved'?'Approved':r.status==='rejected'?'Rejected':'Decision',done:r.status==='approved'||r.status==='rejected',time:r.respondedAt}
  ];
  return `<div class="leave-timeline" aria-label="Leave request progress">${steps.map((s,i)=>`<div class="leave-timeline-step ${s.done?'done':''} ${r.status==='rejected'&&s.key==='done'?'rejected':''}">
    <span class="leave-timeline-dot" aria-hidden="true"></span>
    <div><strong>${s.label}</strong><span>${s.time?formatQueryTime(s.time):(s.done?'':'Pending')}</span></div>
  </div>${i<steps.length-1?'<span class="leave-timeline-line" aria-hidden="true"></span>':''}`).join('')}</div>`;
}
window.updateLeaveApplyPreview=function(){
  const e=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  const preview=document.getElementById('leaveApplyPreview');
  const hint=document.getElementById('leaveTeamHint');
  if(!e||!preview) return;
  const type=document.getElementById('lvT')?.value||'Annual';
  const days=parseInt(document.getElementById('lvD')?.value,10)||1;
  const fromDate=document.getElementById('lvFrom')?.value||'';
  const toDate=document.getElementById('lvTo')?.value||'';
  const key=leaveTypeKey(type);
  const b=e.leave?.[key]||{u:0,t:0};
  const pending=pendingLeaveBalance(e.id,key);
  const left=(b.t||0)-(b.u||0)-pending;
  const after=left-days;
  const datePart=fromDate&&toDate?` · ${formatDateOnly(fromDate)} to ${formatDateOnly(toDate)}`:'';
  preview.innerHTML=`<strong>${type}</strong>${datePart}: ${b.u||0} used · ${pending} pending · <strong>${Math.max(0,left)}</strong> available now${days?` → <strong>${Math.max(0,after)}</strong> after this request`:''}${after<0?` <span style="color:#A32D2D">(insufficient balance)</span>`:''}`;
  if(hint){
    const colleagues=colleaguesOnLeaveHint(e,type);
    if(colleagues.length){
      hint.hidden=false;
      hint.innerHTML=`<i class="ti ti-info-circle" aria-hidden="true"></i> ${colleagues.length} teammate${colleagues.length===1?' is':'s are'} already on ${type==='WFH'?'WFH':type.toLowerCase()} leave recently: ${colleagues.slice(0,3).map(c=>safeText(c.name)).join(', ')}${colleagues.length>3?'…':''}.`;
    }else hint.hidden=true;
  }
};
function colleaguesOnLeaveHint(employee,leaveType){
  const manager=findManagerEmployee(employee);
  const peers=manager?employeeDirectReports(manager).filter(p=>p.id!==employee.id):(store.employees||[]).filter(p=>p.id!==employee.id&&p.companyId===employee.companyId);
  const key=leaveTypeKey(leaveType);
  return peers.filter(p=>{
    return (store.leaveRequests||[]).some(r=>r.empId===p.id&&r.status==='approved'&&r.leaveKey===key);
  });
}
function renderTeamRoster(manager){
  const list=document.getElementById('teamRosterList');
  if(!list) return;
  const reports=employeeDirectReports(manager);
  if(!reports.length){
    list.innerHTML='<div class="empty-state">No direct reports assigned to you yet.</div>';
    return;
  }
  list.innerHTML=`<div class="keka-people-list">${reports.map(r=>`<div class="keka-person-row">
    ${avatarHtml(r,'av av-e')}
    <div><strong>${safeText(r.name)}</strong><span>${safeText(r.role||'Employee')} · ${safeText(r.dept||'General')}${employeeReportingPlace(r)?` · ${safeText(employeeReportingPlace(r))}`:''}</span></div>
    <button type="button" class="btn sm" onclick="openColleagueChat('${r.id}')"><i class="ti ti-message-circle" aria-hidden="true"></i> Message</button>
  </div>`).join('')}</div>`;
}
function renderTeamAwayToday(manager){
  const list=document.getElementById('teamAwayTodayList');
  if(!list) return;
  const reports=employeeDirectReports(manager);
  if(!reports.length){
    list.innerHTML='<div class="empty-state">No direct reports assigned.</div>';
    return;
  }
  const reportIds=new Set(reports.map(r=>r.id));
  const away=(store.leaveRequests||[]).filter(r=>reportIds.has(r.empId)&&r.status==='approved'&&leaveRequestCoversToday(r));
  if(!away.length){
    list.innerHTML='<div class="empty-state">Everyone on your team is working today.</div>';
    return;
  }
  list.innerHTML=away.map(r=>{
    const emp=employeeById(r.empId);
    const dateLabel=leaveDateRangeLabel(r);
    return `<div class="row-item"><div>${avatarHtml(emp||{name:r.emp},'av av-e')}<div><div class="ri-name">${safeText(r.emp)}</div><div class="ri-meta">${safeText(r.leaveType)} · ${r.days} day(s)${dateLabel?` · ${dateLabel}`:''}</div></div></div></div>`;
  }).join('');
}
function renderTeamResignations(manager){
  const card=document.getElementById('teamResignCard');
  const list=document.getElementById('teamResignList');
  if(!list) return;
  const reports=employeeDirectReports(manager);
  const rows=reports.filter(r=>employeeHasPendingResignation(r));
  if(card) card.hidden=!rows.length;
  if(!rows.length){
    list.innerHTML='';
    return;
  }
  list.innerHTML=rows.map(emp=>{
    const r=emp.resignationRequest||{};
    const waiting=r.managerApprovalStatus==='pending';
    const badge=waiting?'Manager LWD review':(resignationReadyForHr(emp)?'Awaiting HR':'Awaiting approval');
    const actions=waiting
      ?`<div class="table-actions"><button class="btn sm pri" onclick="decideTeamResignationLwd('${emp.id}','approved')"><i class="ti ti-check" aria-hidden="true"></i> Approve date</button><button class="btn sm danger" onclick="decideTeamResignationLwd('${emp.id}','rejected')"><i class="ti ti-x" aria-hidden="true"></i> Reject date</button></div>`
      :'';
    return `<div class="row-item" style="flex-wrap:wrap;gap:10px"><div style="flex:1"><div class="ri-name">${safeText(emp.name)} <span class="badge b-pending">${badge}</span></div><div class="ri-meta">Submitted ${r.submittedAt?formatQueryTime(r.submittedAt):'—'} · Policy LWD ${formatDateOnly(r.policyLastWorkingDay)||'—'} · Requested LWD ${formatDateOnly(r.lastWorkingDay)||'—'} · ${r.noticeDays?`${r.noticeDays}-day notice`:''}</div></div>${actions}</div>`;
  }).join('');
}
function renderMyTeamPage(){
  renderTeamLeaveRequests();
  const me=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  if(!me) return;
  renderTeamRoster(me);
  renderTeamAwayToday(me);
  renderTeamResignations(me);
  if(typeof renderTeamProbationReviews==='function') renderTeamProbationReviews(me);
  const reports=employeeDirectReports(me);
  const pending=pendingTeamLeaveCount(me)+pendingTeamResignationLwdCount(me);
  const away=(store.leaveRequests||[]).filter(r=>reports.some(rep=>rep.id===r.empId)&&r.status==='approved'&&leaveRequestCoversToday(r)).length;
  if(document.getElementById('teamReportCount')) document.getElementById('teamReportCount').textContent=String(reports.length);
  if(document.getElementById('teamPendingCount')) document.getElementById('teamPendingCount').textContent=String(pending);
  if(document.getElementById('teamAwayCount')) document.getElementById('teamAwayCount').textContent=String(away);
}
function formatDateOnly(value){
  const dt=new Date(`${value}T00:00:00`);
  if(Number.isNaN(dt.getTime())) return value||'Date pending';
  return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function sortedEvents(employee=null){
  const source=employee?employeeScopedEvents(employee):(hasManagementAccess()?scopedEvents():(store.events||[]));
  return source.slice().sort((a,b)=>new Date(`${a.date}T00:00:00`)-new Date(`${b.date}T00:00:00`));
}
function upcomingEvents(employee=null){
  const today=new Date();
  const start=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  return sortedEvents(employee).filter(ev=>{
    const dt=new Date(`${ev.date}T00:00:00`);
    return !Number.isNaN(dt.getTime())&&dt>=start;
  });
}
function latestNews(employee=null){
  const today=new Date();
  const start=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const source=employee?employeeScopedNews(employee):(hasManagementAccess()?scopedNews():(store.news||[]));
  return source
    .filter(item=>{
      const dt=new Date(`${item.date}T00:00:00`);
      return !Number.isNaN(dt.getTime())&&dt>=start;
    })
    .slice()
    .sort((a,b)=>new Date(`${a.date}T00:00:00`)-new Date(`${b.date}T00:00:00`));
}
function nextBirthdayDate(dob){
  if(!dob) return null;
  const parts=dob.split('-').map(Number);
  if(parts.length<3||!parts[1]||!parts[2]) return null;
  const today=new Date();
  const start=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  let next=new Date(today.getFullYear(),parts[1]-1,parts[2]);
  if(next<start) next=new Date(today.getFullYear()+1,parts[1]-1,parts[2]);
  return next;
}
function upcomingBirthdays(employee){
  const peers=colleaguesDirectoryForUser(employee);
  return peers
    .filter(emp=>emp.status==='Active'&&emp.profile?.dob)
    .map(emp=>({employee:emp,date:nextBirthdayDate(emp.profile.dob)}))
    .filter(item=>item.date&&!Number.isNaN(item.date.getTime()))
    .sort((a,b)=>a.date-b.date);
}
function shortDateFromDate(date){
  return date.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
}
function leaveTotals(employee){
  const l=employee.leave;
  const keys=['annual','sick','wfh','comp'];
  return keys.reduce((acc,k)=>{acc.total+=l[k].t; acc.used+=l[k].u; acc.left+=l[k].t-l[k].u; return acc;},{total:0,used:0,left:0});
}
function profileCompletion(employee){
  const checks=[employee.profile?.photo,employee.profile?.dob,employee.profile?.hobbies,employee.role,employee.manager];
  return Math.round((checks.filter(Boolean).length/checks.length)*100);
}
function employeeBadges(employee){
  const pr=policyReadStats(employee);
  const docs=(employee.documents||[]);
  const gamePoints=Number(employee.gameProgress?.points)||0;
  const wallPosts=(store.teamWall||[]).filter(p=>p.empId===employee.id).length;
  return [
    {title:'Policy Champion',icon:'ti-shield-check',earned:pr.total>0&&pr.read===pr.total,meta:`${pr.read}/${pr.total} policies`},
    {title:'Profile Pro',icon:'ti-user-check',earned:profileCompletion(employee)>=80,meta:`${profileCompletion(employee)}% complete`},
    {title:'Document Ready',icon:'ti-folder-check',earned:docs.length>0&&docs.every(d=>d.acknowledgedAt),meta:`${docs.filter(d=>d.acknowledgedAt).length}/${docs.length||0} acknowledged`},
    {title:'Word Wizard',icon:'ti-trophy',earned:gamePoints>=100,meta:`${gamePoints} game points`},
    {title:'Team Voice',icon:'ti-speakerphone',earned:wallPosts>0,meta:`${wallPosts} wall post${wallPosts===1?'':'s'}`}
  ];
}
function currentMood(employee){
  const week=new Date().toISOString().slice(0,10);
  return (store.moodPulse||[]).find(m=>m.empId===employee.id&&m.week===week);
}
const MOOD_OPTIONS=[
  {key:'Great',emoji:'😃',label:'Great'},
  {key:'Good',emoji:'🙂',label:'Good'},
  {key:'Okay',emoji:'😐',label:'Okay'},
  {key:'Confused',emoji:'😕',label:'Confused'},
  {key:'Stressed',emoji:'😵‍💫',label:'Stressed'}
];
function moodMeta(mood){
  return MOOD_OPTIONS.find(item=>item.key===mood)||{key:mood,emoji:'💬',label:mood||'Not selected'};
}
function leavePlannerSuggestion(employee){
  const annualLeft=(employee.leave?.annual?.t||0)-(employee.leave?.annual?.u||0);
  if(annualLeft>=5) return 'You can plan a full week off or split it into two long weekends.';
  if(annualLeft>=2) return 'A short recharge break is available. Consider pairing with a weekend.';
  return 'Annual leave is low. Use WFH or comp-off if applicable.';
}
function openEmployeePage(pg){
  const item=[...document.querySelectorAll('#eSidebar .ni')].find(n=>n.getAttribute('onclick')?.includes(`'${pg}'`));
  if(item) goPage(pg,item);
  else goPage(pg);
}
function startOfLocalDay(d=new Date()){
  return new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function leaveRequestCoversToday(request){
  if(!request||request.status!=='approved') return false;
  const today=startOfLocalDay();
  if(request.fromDate){
    const start=startOfLocalDay(new Date(`${request.fromDate}T00:00:00`));
    if(Number.isNaN(start.getTime())) return false;
    const end=request.toDate
      ?startOfLocalDay(new Date(`${request.toDate}T00:00:00`))
      :new Date(start);
    if(!request.toDate){
      const days=Math.max(1,Number(request.days)||1);
      end.setDate(end.getDate()+days-1);
    }
    if(Number.isNaN(end.getTime())) return false;
    return today>=start&&today<=end;
  }
  const days=Math.max(1,Number(request.days)||1);
  const anchor=new Date(request.respondedAt||request.createdAt||Date.now());
  if(Number.isNaN(anchor.getTime())) return false;
  const start=startOfLocalDay(anchor);
  const end=new Date(start);
  end.setDate(end.getDate()+days-1);
  return today>=start&&today<=end;
}
function peersForHomeWidgets(me){
  const active=(store.employees||[]).filter(emp=>emp.status==='Active'&&emp.id!==me?.id);
  if(hasBuHeadAccess()&&!hasManagementAccess()){
    const teamIds=new Set(employeesForBuHead().map(x=>x.id));
    return active.filter(emp=>teamIds.has(emp.id));
  }
  if(isCompanyHrSession()||isCentralHrSession()){
    return colleaguesDirectoryForUser(me);
  }
  const myCid=resolveCompanyId(me?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
  return active.filter(emp=>resolveCompanyId(emp.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===myCid);
}
function peopleOnLeaveToday(me,{remote=false}={}){
  const peerIds=new Set(peersForHomeWidgets(me).map(p=>p.id));
  peerIds.add(me?.id);
  return (store.leaveRequests||[])
    .filter(r=>{
      if(!leaveRequestCoversToday(r)) return false;
      if(!peerIds.has(r.empId)) return false;
      const isWfh=String(r.leaveKey||'').toLowerCase()==='wfh'||String(r.leaveType||'').toLowerCase()==='wfh';
      return remote?isWfh:!isWfh;
    })
    .map(r=>{
      const emp=employeeById(r.empId);
      return {
        id:r.empId,
        name:emp?.name||r.emp||'Employee',
        dept:emp?.dept||'',
        leaveType:r.leaveType||(remote?'WFH':'Leave'),
        employee:emp
      };
    });
}
function recentJoinersForHome(me,limit=6){
  const today=startOfLocalDay();
  const month=today.getMonth();
  const year=today.getFullYear();
  return peersForHomeWidgets(me)
    .concat(me?[]:[])
    .concat(me?[me]:[])
    .filter((emp,idx,arr)=>emp&&arr.findIndex(x=>x.id===emp.id)===idx)
    .filter(emp=>{
      if(!emp.dateOfJoining) return false;
      const doj=new Date(`${emp.dateOfJoining}T00:00:00`);
      if(Number.isNaN(doj.getTime())||doj>today) return false;
      return doj.getMonth()===month&&doj.getFullYear()===year;
    })
    .sort((a,b)=>new Date(`${b.dateOfJoining}T00:00:00`)-new Date(`${a.dateOfJoining}T00:00:00`))
    .slice(0,limit);
}
function holidayEventsForHome(limit=5){
  const events=upcomingEvents();
  const holidays=events.filter(ev=>/holiday|leave|festival|diwali|holi|christmas|republic|independence|gandhi/i.test(`${ev.title||''} ${ev.desc||''}`));
  return (holidays.length?holidays:events).slice(0,limit);
}
function homePeopleListHtml(people,{empty='Nobody today.'}={}){
  if(!people.length) return `<div class="empty-state keka-widget-empty">${empty}</div>`;
  return `<div class="keka-people-list">${people.map(p=>{
    const emp=p.employee||{};
    const meta=[p.dept||p.leaveType||emp.dept,employeeReportingPlace(emp)].filter(Boolean).join(' · ');
    return `
    <div class="keka-person-row">
      ${avatarHtml(emp.name?emp:{name:p.name},'av av-e')}
      <div><strong>${safeText(p.name)}</strong><span>${safeText(meta)}</span></div>
    </div>`}).join('')}</div>`;
}
function renderEmployeeHome(){
  const e=currentSelfServiceEmployee()||employeeById(currentUser?.id)||store.employees[0];
  if(!e||!document.getElementById('pg-home')) return;
  updateChatUnreadBadge();
  const pr=policyReadStats(e);
  const totals=leaveTotals(e);
  const mine=employeeQueries(e);
  const openQ=mine.filter(q=>q.status!=='resolved').length;
  const replies=mine.filter(q=>q.response).length;
  const unread=unreadPolicies(e);
  const score=Math.round(((pr.total?pr.read/pr.total:1)*40)+((openQ===0?1:0)*25)+((totals.left>0?1:0)*20)+((replies>0?1:0)*15));
  const homeTitle=document.getElementById('homeTitle');
  if(homeTitle) homeTitle.innerHTML=`<i class="ti ti-home" aria-hidden="true"></i> Welcome, ${safeText(e.name.split(' ')[0])}`;
  const homeSub=document.getElementById('homeSub');
  if(homeSub) homeSub.textContent=`${e.role||'Employee'} · ${e.dept||'General'} · ${employeeReportingPlaceLabel(e)}`;
  const homeScore=document.getElementById('homeScore');
  if(homeScore) homeScore.textContent=`${score}%`;
  const profileCard=document.getElementById('profileCard');
  if(profileCard) profileCard.innerHTML=`<div class="profile-top">${avatarHtml(e,'av av-e profile-photo')}<div><div class="ri-name">${e.name}</div><div class="ri-meta">${e.email}</div></div></div>
    ${hrEmploymentProfileHtml(e)}
    <div class="profile-grid">
      <div><span>Date of birth</span><strong>${formatDob(e.profile?.dob)}</strong></div>
      <div><span>Hobbies</span><strong>${e.profile?.hobbies||'Not added'}</strong></div>
    </div><button class="btn sm profile-edit-btn" onclick="openEmployeeProfileEditor()"><i class="ti ti-pencil" aria-hidden="true"></i> Edit personal profile</button>`;
  const now=new Date();
  const quickToday=document.getElementById('homeQuickToday');
  if(quickToday){
    quickToday.innerHTML=`<div class="keka-quick-date"><strong>${now.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short',year:'numeric'})}</strong><span>${now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div>
      <div class="keka-hours-placeholder"><span>Hours today</span><strong>—</strong><small>Timesheet not connected</small></div>`;
  }
  const onLeave=peopleOnLeaveToday(e,{remote:false});
  const remote=peopleOnLeaveToday(e,{remote:true});
  const onLeaveEl=document.getElementById('homeOnLeaveToday');
  if(onLeaveEl) onLeaveEl.innerHTML=homePeopleListHtml(onLeave,{empty:'No one is on leave today.'});
  const remoteEl=document.getElementById('homeWorkingRemote');
  const remoteCard=document.getElementById('homeRemoteCard');
  if(remoteEl){
    remoteEl.innerHTML=homePeopleListHtml(remote,{empty:'No one is working remotely today.'});
    if(remoteCard) remoteCard.hidden=!remote.length&&!onLeave.length?false:false;
  }
  const attendanceEl=document.getElementById('homeAttendance');
  if(attendanceEl){
    attendanceEl.innerHTML=`<div class="keka-attendance keka-attendance-compact">
      <div class="keka-attendance-clock"><strong>${now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</strong><span>${now.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short'})}</span></div>
      <button type="button" class="btn sm pri" onclick="openEmployeePage('myLeaves')"><i class="ti ti-calendar" aria-hidden="true"></i> Open My Leaves</button>
    </div>`;
  }
  const reportingEl=document.getElementById('homeReportingPlace');
  if(reportingEl){
    const place=employeeReportingPlace(e);
    reportingEl.innerHTML=`<div class="keka-reporting-place-card">
      <strong>${safeText(place||'Not assigned')}</strong>
      <span>${safeText(companyLabelById(e.companyId)||'Company')} · ${safeText(e.reportingManager||e.manager||'No manager listed')}</span>
    </div>`;
  }
  const financeBody=document.getElementById('homeFinanceBody');
  if(financeBody){
    const salaryOpen=isEmployeeSalaryTabVisible();
    financeBody.innerHTML=`<p class="keka-attendance-note">${salaryOpen?'Salary details are unlocked for this session.':'Salary details stay private until you choose to view them.'}</p>
      <button type="button" class="btn sm pri" onclick="viewEmployeeSalary()"><i class="ti ti-currency-rupee" aria-hidden="true"></i> View salary</button>`;
  }
  const holidaysEl=document.getElementById('homeHolidays');
  if(holidaysEl){
    const holidays=holidayEventsForHome();
    holidaysEl.innerHTML=holidays.length?`<div class="keka-holiday-list">${holidays.map(ev=>`
      <div class="keka-holiday-row">
        <div class="event-date"><strong>${String(ev.date||'').slice(8,10)||'—'}</strong><span>${new Date(`${ev.date}T00:00:00`).toLocaleDateString('en-IN',{month:'short'})}</span></div>
        <div><strong>${safeText(ev.title)}</strong><span>${safeText(ev.location||ev.time||'Company event')}</span></div>
      </div>`).join('')}</div>`:'<div class="empty-state keka-widget-empty">No upcoming holidays or events.</div>';
  }
  const bdayEl=document.getElementById('homeBirthdays');
  if(bdayEl){
    const birthdays=upcomingBirthdays(e).slice(0,6);
    bdayEl.innerHTML=birthdays.length?`<div class="keka-people-list">${birthdays.map(item=>{
      const place=employeeReportingPlace(item.employee);
      const meta=[shortDateFromDate(item.date),item.employee.dept,place].filter(Boolean).join(' · ');
      return `
      <div class="keka-person-row birthday-item">
        ${avatarHtml(item.employee,'av av-e')}
        <div><strong>${safeText(item.employee.name)}</strong><span>${safeText(meta)}</span></div>
      </div>`}).join('')}</div>`:'<div class="empty-state keka-widget-empty">No upcoming birthdays on file.</div>';
  }
  const eventNotes=upcomingEvents().slice(0,2).map(ev=>({id:`event-${ev.id}`,icon:'ti-calendar-event',title:`Event: ${ev.title}`,meta:`${formatDateOnly(ev.date)} - ${ev.time||'Time pending'}`}));
  const birthdayNotes=upcomingBirthdays(e).slice(0,2).map(item=>({id:`birthday-${item.employee.id}-${shortDateFromDate(item.date)}`,icon:'ti-cake',title:`Birthday: ${item.employee.name}`,meta:`${shortDateFromDate(item.date)} - ${item.employee.dept||'Team'}`}));
  const newsNotes=latestNews().slice(0,2).map(item=>({id:`news-${item.id}`,icon:'ti-news',title:item.title,meta:`${item.tag||'News'} - ${formatDateOnly(item.date)}`}));
  const overduePolicyNotes=employeeScopedPolicies(e).filter(p=>p.status==='Active'&&policyEmployeeBucket(e,p)==='overdue').slice(0,3).map(p=>({id:`policy-overdue-${p.id}`,icon:'ti-alert-triangle',title:`Overdue policy: ${p.name}`,meta:`Acknowledge by ${formatDateOnly(policyAckDeadline(p))||'ASAP'}`}));
  const requiredPolicyNotes=unread.filter(p=>policyEmployeeBucket(e,p)!=='overdue').slice(0,2).map(p=>({id:`policy-${p.id}`,icon:'ti-file-alert',title:`Unread policy: ${p.name}`,meta:p.cat}));
  const probationNotes=(typeof teamProbationReviewsForManager==='function'?teamProbationReviewsForManager(e):[])
    .filter(emp=>typeof probationNeedsManagerReview==='function'&&probationNeedsManagerReview(emp))
    .slice(0,5)
    .map(emp=>{
      const left=typeof daysUntil==='function'?daysUntil(emp.probation?.endDate):null;
      const leftLabel=left==null?'due soon':(left<0?`${Math.abs(left)} day(s) overdue`:`${left} day(s) left`);
      return {
        id:`probation-review-${emp.id}-${emp.probation?.endDate||''}`,
        icon:'ti-hourglass',
        title:`Probation ending: ${emp.name}`,
        meta:`${leftLabel} · Add feedback in My Team`,
        page:'teamLeaves',
        subtab:'probation'
      };
    });
  const resignLwdNotes=employeeDirectReports(e).filter(emp=>resignationAwaitingManagerLwd(emp)).slice(0,5).map(emp=>{
    const r=emp.resignationRequest||{};
    return {
      id:`resign-lwd-${emp.id}-${r.submittedAt||''}`,
      icon:'ti-door-exit',
      title:`Resignation date: ${emp.name}`,
      meta:`Preferred last day ${formatDateOnly(r.lastWorkingDay)||'—'} · Approve in My Team`,
      page:'teamLeaves'
    };
  });
  const allNotifications=[
    ...resignLwdNotes,
    ...probationNotes,
    ...overduePolicyNotes,
    ...newsNotes,
    ...eventNotes,
    ...birthdayNotes,
    ...mine.filter(q=>q.response).slice(0,2).map(q=>({id:`reply-${q.id}-${q.resolvedAt||q.createdAt}`,icon:'ti-message-check',title:`HR replied: ${q.subject}`,meta:formatQueryTime(q.resolvedAt||q.createdAt)})),
    ...requiredPolicyNotes,
    ...mine.filter(q=>q.status!=='resolved').slice(0,2).map(q=>({id:`query-${q.id}-${q.status}`,icon:'ti-clock',title:`Query pending: ${q.subject}`,meta:formatQueryTime(q.createdAt)}))
  ];
  const dismissed=e.dismissedNotifications||[];
  const notifications=allNotifications.filter(n=>!dismissed.includes(n.id)).slice(0,8);
  window.visibleNotificationIds=notifications.map(n=>n.id);
  window.allNotificationIds=allNotifications.map(n=>n.id);
  const clearBtn=document.getElementById('clearNotifBtn');
  if(clearBtn) clearBtn.disabled=!notifications.length;
  const notifList=document.getElementById('notificationList');
  if(notifList) notifList.innerHTML=notifications.length?notifications.map(n=>{
    const openAttr=n.page?` role="button" tabindex="0" onclick="try{sessionStorage.setItem('hrp_subtab_${n.page}','${n.subtab||''}')}catch(_e){}openEmployeePage('${n.page}')"`:'';
    return `<div class="notify-item">
      <div class="notify-item-main"${openAttr}${n.page?' style="cursor:pointer"':''}><i class="ti ${n.icon}"></i><div><div>${safeText(n.title)}</div><span>${safeText(n.meta)}</span></div></div>
      <button type="button" class="notify-dismiss" data-id="${safeText(n.id)}" title="Clear this notification" aria-label="Clear this notification" onclick="event.stopPropagation();dismissNotification(this.getAttribute('data-id'))"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>`;
  }).join(''):'<div class="empty-state">No pending notifications.</div>';
  const homeNews=document.getElementById('homeNewsList');
  if(homeNews){
    const posts=latestNews().slice(0,3);
    homeNews.innerHTML=posts.length?posts.map(item=>`<div class="news-post"><div class="news-post-top"><span class="news-tag">${item.tag||'News'}</span><span>${formatDateOnly(item.date)}</span></div><h3>${item.title}</h3><p>${item.body||''}</p></div>`).join(''):'<div class="empty-state">No company news has been posted yet.</div>';
  }
  const achievements=[
    {done:pr.total&&pr.read===pr.total,title:'All policies acknowledged',meta:'Compliance ready'},
    {done:openQ===0,title:'No pending HR queries',meta:'Inbox clear'},
    {done:totals.left>0,title:'Leave plan updated',meta:`${totals.left} days available`},
    {done:profileCompletion(e)>=80,title:'Profile completion',meta:`${profileCompletion(e)}% ready`}
  ];
  const achievementList=document.getElementById('achievementList');
  if(achievementList) achievementList.innerHTML=achievements.map(a=>`<div class="achievement ${a.done?'done':''}"><i class="ti ${a.done?'ti-circle-check':'ti-circle'}"></i><div><div>${a.title}</div><span>${a.meta}</span></div></div>`).join('');
  const homeTimeline=document.getElementById('homeTimeline');
  if(homeTimeline) homeTimeline.innerHTML=mine.length?mine.slice(0,4).map(q=>`<div class="timeline-item"><span class="timeline-dot ${q.status==='resolved'?'done':''}"></span><div><div class="ri-name">${q.subject}</div><div class="ri-meta">${q.status==='resolved'?'Resolved':'Raised'} - ${formatQueryTime(q.resolvedAt||q.createdAt)}</div><div class="query-msg">${q.response||q.msg}</div></div></div>`).join(''):'<div class="empty-state">No queries yet.</div>';
  renderLeaveCalendar(e);
}

window.renderColleagues=function(){
  const me=currentSelfServiceEmployee();
  const dirList=document.getElementById('colleagueDirectoryList');
  const msgList=document.getElementById('colleagueMessageList');
  if(!dirList&&!msgList) return;
  const sub=document.getElementById('colleaguesSub');
  if(sub){
    const companyLabel=me?companyLabelById(me.companyId):'your company';
    if(hasManagementAccess()&&isCentralHrSession()&&isAllCompaniesView()) sub.textContent='Directory across all entities — browse colleagues and send messages';
    else if(hasManagementAccess()&&(isCompanyHrSession()||isCentralHrSession())) sub.textContent=`Company directory for ${companyLabel} — browse colleagues and send messages`;
    else sub.textContent=`Colleagues at ${companyLabel} — browse your company directory or send a message`;
  }
  const emptyHtml='<div class="empty-state">No employee profile linked to this login.</div>';
  if(!me){
    if(dirList){
      dirList.classList.remove('colleague-card-grid');
      dirList.innerHTML=emptyHtml;
    }
    if(msgList) msgList.innerHTML=emptyHtml;
    return;
  }
  const search=(document.getElementById('colleagueSearch')?.value||'').trim().toLowerCase();
  const colleagues=colleaguesDirectoryForUser(me)
    .filter(employee=>`${employee.name} ${employee.email} ${employee.dept||''} ${employeeReportingPlace(employee)}`.toLowerCase().includes(search))
    .sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  updateChatUnreadBadge();
  const noneHtml='<div class="empty-state">No matching colleagues in your company.</div>';
  if(dirList){
    dirList.classList.toggle('colleague-card-grid',Boolean(colleagues.length));
    dirList.innerHTML=colleagues.length?colleagues.map(employee=>colleagueDirectoryRowHtml(me,employee)).join(''):noneHtml;
  }
  if(msgList) msgList.innerHTML=colleagues.length?colleagues.map(employee=>colleagueMessageRowHtml(me,employee)).join(''):noneHtml;
  if(activeColleagueId) renderColleagueConversation();
};

window.openColleagueChat=function(employeeId){
  const me=currentSelfServiceEmployee();
  if(!me||!employeeById(employeeId)||employeeId===me.id) return;
  activeColleagueId=employeeId;
  let changed=false;
  (store.directMessages||[]).forEach(message=>{
    if(message.fromId===employeeId&&message.toId===me.id&&!(message.readBy||[]).includes(me.id)){
      message.readBy=[...(message.readBy||[]),me.id];
      changed=true;
    }
  });
  if(changed) saveStore();
  const page=document.getElementById('pg-colleagues');
  const msgBtn=page?.querySelector('.pg-subtab[data-subtab="messages"]');
  if(msgBtn) goSubtab('colleagues','messages',msgBtn);
  renderColleagues();
  document.getElementById('colleagueMessageInput')?.focus();
};

function renderColleagueConversation(){
  const me=currentSelfServiceEmployee();
  const colleague=employeeById(activeColleagueId);
  const empty=document.getElementById('colleagueChatEmpty');
  const panel=document.getElementById('colleagueChatPanel');
  if(!me||!colleague||!panel) return;
  let newlyRead=false;
  (store.directMessages||[]).forEach(message=>{
    if(message.fromId===colleague.id&&message.toId===me.id&&!(message.readBy||[]).includes(me.id)){
      message.readBy=[...(message.readBy||[]),me.id];
      newlyRead=true;
    }
  });
  if(newlyRead){
    saveStore();
    updateChatUnreadBadge();
  }
  empty.hidden=true;
  panel.hidden=false;
  document.getElementById('colleagueChatHead').innerHTML=`${avatarHtml(colleague,'av av-e')}<div><strong>${safeText(colleague.name)}</strong><span>${remoteTypingEmployeeId===colleague.id?'typing…':safeText(colleague.email)}</span>${reportingPlaceMetaHtml(colleague)}</div>`;
  const messages=(store.directMessages||[])
    .filter(message=>(message.fromId===me.id&&message.toId===colleague.id)||(message.fromId===colleague.id&&message.toId===me.id))
    .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const container=document.getElementById('colleagueMessages');
  container.innerHTML=messages.length?messages.map(message=>`
    <div class="direct-message ${message.fromId===me.id?'sent':'received'}">
      <div>${safeText(message.text)}</div><span>${formatQueryTime(message.createdAt)}</span>
    </div>`).join(''):'<div class="empty-state">No messages yet. Say hello!</div>';
  container.scrollTop=container.scrollHeight;
}

window.sendColleagueMessage=async function(){
  const me=currentSelfServiceEmployee();
  const colleague=employeeById(activeColleagueId);
  const input=document.getElementById('colleagueMessageInput');
  const text=input?.value.trim();
  if(!me||!colleague||!text) return;
  const message={id:`dm-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,fromId:me.id,toId:colleague.id,text,createdAt:new Date().toISOString(),readBy:[]};
  store.directMessages.push(message);
  input.value='';
  renderColleagueConversation();
  try{
    const response=await fetch('/api/chat-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
    if(!response.ok) throw new Error('Message delivery failed');
    const result=await response.json();
    backendStoreUpdatedAt=result.updatedAt||backendStoreUpdatedAt;
    notifyColleagueTyping(false);
  }catch(err){
    store.directMessages=store.directMessages.filter(item=>item.id!==message.id);
    renderColleagueConversation();
    toast('Message could not be delivered');
  }
};

function connectLiveColleagueChat(){
  const me=currentSelfServiceEmployee();
  if(!me?.id||!window.EventSource||!location.protocol.startsWith('http')) return;
  if(chatEventSource) chatEventSource.close();
  chatEventSource=new EventSource(`/api/chat-stream?employeeId=${encodeURIComponent(me.id)}`);
  chatEventSource.onmessage=event=>{
    let payload;
    try{payload=JSON.parse(event.data);}catch(err){return;}
    if(payload.type==='message'&&payload.message){
      if(!(store.directMessages||[]).some(item=>item.id===payload.message.id)) store.directMessages.push(payload.message);
      const sender=employeeById(payload.message.fromId);
      toast(`${sender?.name||'A colleague'} sent you a new message`);
      playChatNotificationSound();
      updateChatUnreadBadge();
      if(document.getElementById('pg-colleagues')?.classList.contains('act')) renderColleagues();
    }
    if(payload.type==='typing'){
      remoteTypingEmployeeId=payload.typing?payload.fromId:null;
      if(activeColleagueId===payload.fromId) renderColleagueConversation();
    }
  };
}

window.notifyColleagueTyping=function(isTyping=true){
  const me=currentSelfServiceEmployee();
  if(!me?.id||!activeColleagueId) return;
  fetch('/api/chat-typing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromId:me.id,toId:activeColleagueId,typing:Boolean(isTyping)})}).catch(()=>{});
  clearTimeout(chatTypingTimer);
  if(isTyping) chatTypingTimer=setTimeout(()=>notifyColleagueTyping(false),1200);
};
window.dismissNotification=function(id){
  const e=employeeById(currentUser?.id);
  if(!e||!id){toast('Please sign in again');return;}
  e.dismissedNotifications=[...new Set([...(e.dismissedNotifications||[]),id])];
  saveStore();
  renderEmployeeHome();
};
window.clearNotifications=function(){
  const e=employeeById(currentUser?.id);
  if(!e){toast('Please sign in again');return;}
  const ids=Array.isArray(window.allNotificationIds)?window.allNotificationIds:[];
  if(!ids.length){toast('No notifications to clear');return;}
  e.dismissedNotifications=[...new Set([...(e.dismissedNotifications||[]),...ids])];
  saveStore();
  renderEmployeeHome();
  toast('Notifications cleared');
};
window.renderNewsPortal=function(){
  const e=employeeById(currentUser?.id)||currentSelfServiceEmployee()||store.employees[0];
  const eventList=document.getElementById('eventList');
  const birthdayList=document.getElementById('birthdayList');
  const newsList=document.getElementById('companyNewsList');
  if(eventList){
    const events=upcomingEvents(e);
    eventList.innerHTML=events.length?events.map(ev=>`<div class="news-item event-item"><div class="event-date"><strong>${formatDateOnly(ev.date).slice(0,2)}</strong><span>${formatDateOnly(ev.date).slice(3,6)}</span></div><div><div class="ri-name">${ev.title}</div><div class="news-meta"><i class="ti ti-clock" aria-hidden="true"></i> ${ev.time||'Time pending'} <i class="ti ti-map-pin" aria-hidden="true"></i> ${ev.location||'Location pending'}</div><p>${ev.desc||'Details will be shared soon.'}</p></div></div>`).join(''):'<div class="empty-state">No special events announced yet.</div>';
  }
  if(birthdayList){
    const birthdays=upcomingBirthdays(e);
    birthdayList.innerHTML=birthdays.length?birthdays.map(item=>`<div class="news-item birthday-item">${avatarHtml(item.employee,'av av-e')}<div><div class="ri-name">${item.employee.name}</div><div class="news-meta">${item.employee.dept||'Team'} - ${shortDateFromDate(item.date)}</div><p>Wish ${item.employee.name.split(' ')[0]} on their birthday.</p></div></div>`).join(''):'<div class="empty-state">No colleague birthdays available. Employees can add DOB from Edit profile.</div>';
  }
  if(newsList){
    const posts=latestNews(e);
    newsList.innerHTML=posts.length?posts.map(item=>`<div class="news-post"><div class="news-post-top"><span class="news-tag">${item.tag||'News'}</span><span>${formatDateOnly(item.date)}</span></div><h3>${item.title}</h3><p>${item.body||''}</p><div class="reaction-row"><button class="btn sm" onclick="reactNews('${item.id}','like')"><i class="ti ti-thumb-up" aria-hidden="true"></i> ${(item.reactions?.like||[]).length}</button><button class="btn sm" onclick="reactNews('${item.id}','love')"><i class="ti ti-heart" aria-hidden="true"></i> ${(item.reactions?.love||[]).length}</button><button class="btn sm" onclick="reactNews('${item.id}','seen')"><i class="ti ti-check" aria-hidden="true"></i> ${(item.reactions?.seen||[]).length}</button></div></div>`).join(''):'<div class="empty-state">No company news has been posted yet.</div>';
  }
};
window.reactNews=function(newsId,type){
  const item=store.news.find(n=>n.id===newsId);
  const empId=currentUser?.id;
  if(!item||!empId) return;
  item.reactions=item.reactions||{};
  item.reactions[type]=item.reactions[type]||[];
  if(item.reactions[type].includes(empId)){
    toast('Already acknowledged');
    return;
  }
  item.reactions[type].push(empId);
  saveStore();
  if(type==='love') showHeartPop();
  renderNewsPortal();
  renderEmployeeHome();
};

function showHeartPop(){
  const heart=document.createElement('div');
  heart.className='heart-pop';
  heart.innerHTML='<i class="ti ti-heart-filled" aria-hidden="true"></i>';
  document.body.appendChild(heart);
  setTimeout(()=>heart.remove(),900);
}
window.renderAdminDocuments=function(){
  const apptSelect=document.getElementById('apptEmp');
  if(!apptSelect) return;
  syncAppointmentTemplateCompanySelect();
  const search=(document.getElementById('apptEmpSearch')?.value||'').trim().toLowerCase();
  let employees=adminVisibleEmployees();
  if(search){
    employees=employees.filter(e=>{
      const name=String(e.name||'').toLowerCase();
      const code=String(e.employeeCode||e.empId||e.id||'').toLowerCase();
      const email=String(e.email||'').toLowerCase();
      const label=String(typeof employeeAdminLabel==='function'?employeeAdminLabel(e):e.name||'').toLowerCase();
      return name.includes(search)||code.includes(search)||email.includes(search)||label.includes(search);
    });
  }
  const options=employees.map(e=>`<option value="${e.id}">${safeText(employeeAdminLabel(e))} - ${e.employeeCode||'No ID'} - ${e.dept||'General'}</option>`).join('');
  const previous=apptSelect.value;
  apptSelect.innerHTML=options||`<option value="">${search?'No employees match your search':'No employees available'}</option>`;
  if(previous&&[...apptSelect.options].some(opt=>opt.value===previous)) apptSelect.value=previous;
  if(!document.getElementById('apptDate')?.value) document.getElementById('apptDate').value=new Date().toISOString().slice(0,10);
  const selected=apptSelect.value;
  if(selected&&apptSelect.dataset.filledEmpId!==selected) fillAppointmentDraftFromEmployee();
  else{
    updateAppointmentTemplateStatus();
    renderAppointmentLetterPreview();
  }
};

function assetTypeLabel(type){
  return ASSET_TYPES.find(t=>t.key===type)?.label||'Others';
}
function formatAssetDate(value){
  if(!value) return '—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDob(value);
  const formatted=formatQueryTime(value);
  return formatted==='Time unavailable'?'—':formatted;
}
function collectEmployeeAssets(employees=adminVisibleEmployees()){
  const rows=[];
  employees.forEach(employee=>{
    (employee.assets||[]).forEach(asset=>{
      rows.push({employee,asset});
    });
  });
  return rows.sort((a,b)=>{
    const da=new Date(a.asset.allocatedAt||0).getTime();
    const db=new Date(b.asset.allocatedAt||0).getTime();
    return (Number.isFinite(db)?db:0)-(Number.isFinite(da)?da:0);
  });
}
window.onAssetTypeChange=function(){
  const type=document.getElementById('assetType')?.value;
  const row=document.getElementById('assetOtherRow');
  if(row) row.hidden=type!=='others';
};
window.onItAssetTypeChange=function(){
  const type=document.getElementById('itAssetType')?.value;
  const row=document.getElementById('itAssetOtherRow');
  if(row) row.hidden=type!=='others';
};
function pushEmployeeAssetRecord(employee,fields){
  employee.assets=Array.isArray(employee.assets)?employee.assets:[];
  const asset={
    id:`asset-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    type:fields.type,
    typeLabel:fields.typeLabel,
    otherDetail:fields.otherDetail||'',
    remarks:fields.remarks||'',
    condition:fields.condition||'Good',
    allocatedAt:fields.allocatedAt,
    allocatedBy:fields.allocatedBy||currentUser?.name||'HR',
    status:'allocated',
    returnedAt:null,
    serialOrTag:fields.serialOrTag||'',
    inventoryId:fields.inventoryId||''
  };
  employee.assets.push(asset);
  if(fields.inventoryId){
    const inv=(store.assetInventory||[]).find(i=>i.id===fields.inventoryId);
    if(inv&&inv.status==='in_stock'){
      asset.serialOrTag=asset.serialOrTag||inv.assetTag;
      asset.type=inv.type;
      asset.typeLabel=inv.typeLabel;
      asset.otherDetail=inv.otherDetail||asset.otherDetail;
      asset.condition=inv.condition||asset.condition;
    }
  }
  syncInventoryForEmployeeAsset(employee,asset);
  return asset;
}
window.renderAdminAssets=function(){
  const empSelect=document.getElementById('assetEmp');
  const filterSelect=document.getElementById('assetFilterEmp');
  const table=document.getElementById('assetTable');
  if(!empSelect||!table) return;
  const visible=adminVisibleEmployees();
  const empOptions=visible.map(e=>`<option value="${e.id}">${safeText(employeeAdminLabel(e))} - ${e.employeeCode||'No ID'}</option>`).join('');
  const previousEmp=empSelect.value;
  empSelect.innerHTML=empOptions||'<option value="">No employees available</option>';
  if(previousEmp&&[...empSelect.options].some(opt=>opt.value===previousEmp)) empSelect.value=previousEmp;
  if(filterSelect){
    const previousFilter=filterSelect.value;
    filterSelect.innerHTML=`<option value="">All employees</option>${empOptions}`;
    if(previousFilter&&[...filterSelect.options].some(opt=>opt.value===previousFilter)) filterSelect.value=previousFilter;
  }
  const dateInput=document.getElementById('assetDate');
  if(dateInput&&!dateInput.value) dateInput.value=new Date().toISOString().slice(0,10);
  onAssetTypeChange();
  const filterEmp=filterSelect?.value||'';
  const filterStatus=document.getElementById('assetFilterStatus')?.value||'all';
  let rows=collectEmployeeAssets(visible);
  if(filterEmp) rows=rows.filter(r=>r.employee.id===filterEmp);
  if(filterStatus==='allocated'||filterStatus==='returned') rows=rows.filter(r=>r.asset.status===filterStatus);
  const showCompany=isCentralHrSession()||isAllCompaniesView()||!isCompanyHrSession();
  const head=`<thead><tr>${showCompany?'<th>Company</th>':''}<th>Employee</th><th>Asset type</th><th>Serial</th><th>Allocated</th><th>Condition</th><th>Status</th><th>Remarks</th><th>Action</th></tr></thead>`;
  if(!rows.length){
    table.innerHTML=`${head}<tbody><tr><td colspan="${showCompany?9:8}" style="text-align:center;color:var(--color-text-secondary)">No asset records yet.</td></tr></tbody>`;
    return;
  }
  table.innerHTML=`${head}<tbody>${rows.map(({employee,asset})=>{
    const typeText=asset.type==='others'&&asset.otherDetail
      ?`${safeText(asset.typeLabel||'Others')} — ${safeText(asset.otherDetail)}`
      :safeText(asset.typeLabel||assetTypeLabel(asset.type));
    const statusClass=asset.status==='returned'?'b-archived':'b-active';
    const statusLabel=asset.status==='returned'
      ?`Returned${asset.returnedAt?` (${formatAssetDate(asset.returnedAt)})`:''}`
      :'Allocated';
    const actions=asset.status==='allocated'
      ?`<div class="table-actions"><button class="btn sm" onclick="returnEmployeeAsset('${employee.id}','${asset.id}')"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Mark returned</button><button class="btn sm danger" onclick="deleteEmployeeAsset('${employee.id}','${asset.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button></div>`
      :`<div class="table-actions"><button class="btn sm danger" onclick="deleteEmployeeAsset('${employee.id}','${asset.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button></div>`;
    return `<tr>
      ${showCompany?`<td style="color:var(--color-text-secondary);font-weight:600">${safeText(employeeCompanyName(employee))}</td>`:''}
      <td style="font-weight:500">${safeText(employee.name)}</td>
      <td>${typeText}</td>
      <td>${safeText(asset.serialOrTag||'—')}</td>
      <td>${formatAssetDate(asset.allocatedAt)}</td>
      <td>${safeText(asset.condition||'Good')}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${safeText(asset.remarks||'—')}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('')}</tbody>`;
};
function renderAssetInventoryTable(opts){
  const {
    tableId,statTotalId,statStockId,statAllocId,statRetiredId,
    searchId,filterStatusId,filterTypeId,companySelectId,otherRowId,
    scopeFn,showCompany,employeesForAllocate
  }=opts;
  const table=document.getElementById(tableId);
  if(!table) return;
  let items=[...(scopeFn||visibleAssetInventoryForHr)()];
  const search=(document.getElementById(searchId)?.value||'').trim().toLowerCase();
  const filterStatus=document.getElementById(filterStatusId)?.value||'all';
  const filterType=document.getElementById(filterTypeId)?.value||'';
  if(filterStatus!=='all') items=items.filter(i=>i.status===filterStatus);
  if(filterType) items=items.filter(i=>i.type===filterType);
  if(search){
    items=items.filter(i=>{
      const hay=[i.assetTag,i.typeLabel,i.brandModel,i.remarks,i.empName,companyLabelById(i.companyId)].join(' ').toLowerCase();
      return hay.includes(search);
    });
  }
  items.sort((a,b)=>String(a.assetTag||'').localeCompare(String(b.assetTag||'')));
  const total=items.length;
  const inStock=items.filter(i=>i.status==='in_stock').length;
  const allocated=items.filter(i=>i.status==='allocated').length;
  const retired=items.filter(i=>i.status==='retired').length;
  if(document.getElementById(statTotalId)) document.getElementById(statTotalId).textContent=String(total);
  if(document.getElementById(statStockId)) document.getElementById(statStockId).textContent=String(inStock);
  if(document.getElementById(statAllocId)) document.getElementById(statAllocId).textContent=String(allocated);
  if(document.getElementById(statRetiredId)) document.getElementById(statRetiredId).textContent=String(retired);
  const companySelect=document.getElementById(companySelectId);
  if(companySelect){
    const prev=companySelect.value;
    companySelect.innerHTML=companySelectOptions(writeTargetCompanyId());
    companySelect.disabled=isCompanyHrSession();
    if(prev&&[...companySelect.options].some(o=>o.value===prev)) companySelect.value=prev;
  }
  if(otherRowId) onInventoryTypeChange(otherRowId.replace('OtherRow','Type'));
  const head=`<thead><tr>${showCompany?'<th>Company</th>':''}<th>Asset tag</th><th>Type</th><th>Brand / model</th><th>Condition</th><th>Status</th><th>Assigned to</th><th>Since</th><th>Action</th></tr></thead>`;
  const colSpan=showCompany?9:8;
  if(!items.length){
    table.innerHTML=`${head}<tbody><tr><td colspan="${colSpan}" style="text-align:center;color:var(--color-text-secondary)">No inventory items match your filters.</td></tr></tbody>`;
    return;
  }
  const empOptions=(employeesForAllocate||[]).map(e=>`<option value="${e.id}">${safeText(employeeAdminLabel(e))}</option>`).join('');
  table.innerHTML=`${head}<tbody>${items.map(item=>{
    const assigned=item.status==='allocated'&&item.empName?safeText(item.empName):'—';
    const since=item.status==='allocated'?formatAssetDate(item.allocatedAt):item.status==='in_stock'?formatAssetDate(item.purchaseDate||item.createdAt):'—';
    let actions='';
    if(item.status==='in_stock'){
      actions=`<div class="table-actions inv-allocate-wrap">
        <select class="inv-allocate-emp" id="allocEmp-${item.id}" aria-label="Employee for ${safeText(item.assetTag)}">${empOptions}</select>
        <button type="button" class="btn sm pri" onclick="allocateInventoryItem('${item.id}','${opts.mode||'hr'}',document.getElementById('allocEmp-${item.id}')?.value)"><i class="ti ti-user-plus" aria-hidden="true"></i> Allocate</button>
        <button type="button" class="btn sm" onclick="retireInventoryItem('${item.id}')"><i class="ti ti-archive" aria-hidden="true"></i> Retire</button>
      </div>`;
    }else if(item.status==='allocated'&&item.empId&&item.employeeAssetId){
      actions=`<button type="button" class="btn sm" onclick="returnEmployeeAsset('${item.empId}','${item.employeeAssetId}')"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Mark returned</button>`;
    }else if(item.status==='retired'){
      actions='—';
    }
    return `<tr>
      ${showCompany?`<td style="color:var(--color-text-secondary);font-weight:600">${safeText(companyLabelById(item.companyId))}</td>`:''}
      <td style="font-weight:600">${safeText(item.assetTag||'—')}</td>
      <td>${inventoryTypeText(item)}</td>
      <td>${safeText(item.brandModel||'—')}</td>
      <td>${safeText(item.condition||'Good')}</td>
      <td><span class="badge ${inventoryStatusClass(item.status)}">${inventoryStatusLabel(item.status)}</span></td>
      <td>${assigned}</td>
      <td>${since}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('')}</tbody>`;
}
function visibleAssetInventoryForHr(){
  store.assetInventory=store.assetInventory||[];
  if(isCentralHrSession()&&isAllCompaniesView()) return store.assetInventory;
  const cid=resolveCompanyId(adminCompanyFilter());
  if(cid===PORTAL_ALL_COMPANIES_ID) return store.assetInventory;
  return store.assetInventory.filter(i=>resolveCompanyId(i.companyId)===cid);
}
function visibleAssetInventoryForIt(){
  store.assetInventory=store.assetInventory||[];
  const it=currentItRecord();
  const raw=String(it?.companyId||'').trim();
  if(!raw||raw.toLowerCase()==='all'||raw===PORTAL_ALL_COMPANIES_ID) return store.assetInventory;
  const cid=resolveCompanyId(raw);
  return store.assetInventory.filter(i=>resolveCompanyId(i.companyId)===cid);
}
window.onInventoryTypeChange=function(typeId){
  const type=document.getElementById(typeId)?.value;
  const rowId=typeId.replace('Type','OtherRow');
  const row=document.getElementById(rowId);
  if(row) row.hidden=type!=='others';
};
window.onAssetInvTypeChange=function(){onInventoryTypeChange('assetInvType');};
window.onItInvTypeChange=function(){onInventoryTypeChange('itInvType');};
function registerInventoryItem(mode){
  const prefix=mode==='it'?'itInv':'assetInv';
  const companyId=isCompanyHrSession()
    ?(lockedHrCompanyId()||writeTargetCompanyId())
    :(document.getElementById(`${prefix}Company`)?.value||writeTargetCompanyId());
  const type=document.getElementById(`${prefix}Type`)?.value||'laptop';
  const typeMeta=ASSET_TYPES.find(t=>t.key===type)||ASSET_TYPES[0];
  const otherDetail=(document.getElementById(`${prefix}OtherDetail`)?.value||'').trim();
  if(type==='others'&&!otherDetail){toast('Describe the asset for Others');return;}
  const assetTag=(document.getElementById(`${prefix}Tag`)?.value||'').trim();
  if(!assetTag){toast('Asset tag / serial is required');return;}
  store.assetInventory=store.assetInventory||[];
  const dup=store.assetInventory.some(i=>inventoryTagKey(i.companyId,i.assetTag)===inventoryTagKey(companyId,assetTag)&&i.status!=='retired');
  if(dup){toast('An active inventory item already uses this asset tag');return;}
  store.assetInventory.push(normalizeAssetInventoryItem({
    id:`inv-${store.nextAssetInventoryId++}`,
    companyId,
    assetTag,
    type:typeMeta.key,
    typeLabel:typeMeta.label,
    otherDetail:type==='others'?otherDetail:'',
    brandModel:(document.getElementById(`${prefix}Brand`)?.value||'').trim(),
    condition:document.getElementById(`${prefix}Condition`)?.value||'Good',
    status:'in_stock',
    remarks:(document.getElementById(`${prefix}Remarks`)?.value||'').trim(),
    purchaseDate:document.getElementById(`${prefix}Purchase`)?.value||'',
    createdAt:new Date().toISOString(),
    createdBy:currentUser?.name||currentUser?.email||(mode==='it'?'IT':'HR')
  }));
  ['Tag','Brand','Remarks','OtherDetail'].forEach(k=>{const el=document.getElementById(`${prefix}${k}`);if(el) el.value='';});
  saveStore();
  refreshAssetViews();
  scheduleAssetSheetPush('register-inventory');
  toast('Asset added to company inventory');
}
window.registerAdminInventoryItem=function(){registerInventoryItem('hr');};
window.registerItInventoryItem=function(){registerInventoryItem('it');};
window.allocateInventoryItem=function(invId,mode,empId){
  const inv=(store.assetInventory||[]).find(i=>i.id===invId);
  const employee=employeeById(empId);
  if(!inv||inv.status!=='in_stock'){toast('Inventory item not available');return;}
  if(!employee){toast('Select an employee');return;}
  if(!assertCanManageEmployeeAssets(employee,'allocate assets for')) return;
  if(resolveCompanyId(employee.companyId)!==resolveCompanyId(inv.companyId)){toast('Employee must belong to the same company as the asset');return;}
  pushEmployeeAssetRecord(employee,{
    inventoryId:inv.id,
    type:inv.type,
    typeLabel:inv.typeLabel,
    otherDetail:inv.otherDetail||'',
    remarks:inv.remarks||'',
    serialOrTag:inv.assetTag,
    allocatedAt:new Date().toISOString().slice(0,10),
    condition:inv.condition||'Good',
    allocatedBy:currentUser?.name||currentUser?.email||(mode==='it'?'IT':'HR')
  });
  saveStore();
  refreshAssetViews();
  scheduleAssetSheetPush('allocate-inventory');
  toast(`Allocated ${inv.assetTag} to ${employee.name}`);
};
window.retireInventoryItem=function(invId){
  const inv=(store.assetInventory||[]).find(i=>i.id===invId);
  if(!inv||inv.status!=='in_stock'){toast('Only in-stock items can be retired');return;}
  if(!confirm(`Retire ${inv.assetTag} from company inventory?`)) return;
  inv.status='retired';
  saveStore();
  refreshAssetViews();
  scheduleAssetSheetPush('retire-inventory');
  toast('Asset retired from inventory');
};
window.renderAdminAssetInventory=function(){
  renderAssetInventoryTable({
    mode:'hr',
    tableId:'assetInventoryTable',
    statTotalId:'assetInvStatTotal',
    statStockId:'assetInvStatStock',
    statAllocId:'assetInvStatAllocated',
    statRetiredId:'assetInvStatRetired',
    searchId:'assetInvSearch',
    filterStatusId:'assetInvFilterStatus',
    filterTypeId:'assetInvFilterType',
    companySelectId:'assetInvCompany',
    otherRowId:'assetInvOtherRow',
    scopeFn:visibleAssetInventoryForHr,
    showCompany:isCentralHrSession()&&isAllCompaniesView(),
    employeesForAllocate:adminVisibleEmployees()
  });
};
window.renderItAssetInventory=function(){
  const it=currentItRecord();
  const scopedCompany=it&&it.companyId&&it.companyId!==PORTAL_ALL_COMPANIES_ID&&String(it.companyId).toLowerCase()!=='all';
  renderAssetInventoryTable({
    mode:'it',
    tableId:'itAssetInventoryTable',
    statTotalId:'itInvStatTotal',
    statStockId:'itInvStatStock',
    statAllocId:'itInvStatAllocated',
    statRetiredId:'itInvStatRetired',
    searchId:'itInvSearch',
    filterStatusId:'itInvFilterStatus',
    filterTypeId:'itInvFilterType',
    companySelectId:'itInvCompany',
    otherRowId:'itInvOtherRow',
    scopeFn:visibleAssetInventoryForIt,
    showCompany:!scopedCompany,
    employeesForAllocate:itVisibleEmployees()
  });
};
window.renderItExitAssetReturns=function(){
  const list=document.getElementById('itExitReturnsList');
  if(!list) return;
  if(!hasItAccess()){
    list.innerHTML='<div class="empty-state">IT access required.</div>';
    return;
  }
  if(typeof migrateExitAssetReturnItems==='function') migrateExitAssetReturnItems();
  const cases=(window.exitCasesNeedingItAssetReturn||[])();
  if(!cases.length){
    list.innerHTML='<div class="empty-state">No pending exit asset returns. When HR starts an exit, open allocations appear here for IT confirmation.</div>';
    return;
  }
  list.innerHTML=cases.map(ex=>{
    window.ensureExitAssetReturnItems(ex);
    const employee=employeeById(ex.empId);
    const pending=ex.assetReturnItems.filter(i=>!i.confirmed);
    const done=ex.assetReturnItems.length-pending.length;
    const rows=ex.assetReturnItems.map(item=>{
      const label=item.typeLabel||'Asset';
      const serial=item.serialOrTag?` · ${item.serialOrTag}`:'';
      if(item.confirmed){
        return `<div class="row-item" style="margin:4px 0;opacity:.9">
          <div><div class="ri-name"><i class="ti ti-circle-check" style="color:#3B6D11"></i> ${safeText(label)}${safeText(serial)}</div>
          <div class="ri-meta">Confirmed by ${safeText(item.confirmedBy||'IT')}${item.confirmedAt?` · ${formatAssetDate(String(item.confirmedAt).slice(0,10))}`:''}</div></div>
        </div>`;
      }
      return `<div class="row-item" style="margin:4px 0">
        <div><div class="ri-name">${safeText(label)}${safeText(serial)}</div><div class="ri-meta">Pending physical return</div></div>
        <button type="button" class="btn sm pri" onclick="confirmExitAssetReturn('${ex.id}','${item.assetId}')"><i class="ti ti-check" aria-hidden="true"></i> Confirm returned</button>
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:12px">
      <div class="card-hd">
        <div>
          <div class="ri-name">${safeText(ex.empName)}</div>
          <div class="ri-meta">Last working day ${safeText(ex.lastWorkingDay||'—')} · ${safeText(employee?.dept||'—')} · ${safeText(employeeCompanyName(employee)||'—')}</div>
          <div class="ri-meta">Exit started by ${safeText(ex.startedBy||'HR')}${ex.reason?` · ${safeText(ex.reason)}`:''}</div>
        </div>
        <div class="ri-right">
          <span class="badge ${pending.length?'b-pending':'b-active'}">${done}/${ex.assetReturnItems.length} confirmed</span>
        </div>
      </div>
      <div style="margin-top:8px">${rows}</div>
    </div>`;
  }).join('');
};
window.updateItExitReturnBadge=function(){
  const nav=document.querySelector('#eSidebar .ni[onclick*="itAssets"]');
  if(!nav) return;
  const count=typeof window.itPendingExitAssetReturnCount==='function'?window.itPendingExitAssetReturnCount():0;
  let badge=nav.querySelector('.nbadge.it-exit-badge');
  if(count>0){
    if(!badge){
      badge=document.createElement('span');
      badge.className='nbadge it-exit-badge';
      nav.appendChild(badge);
    }
    badge.textContent=String(count);
    badge.hidden=false;
  }else if(badge){
    badge.hidden=true;
  }
};
window.renderItAssets=function(){
  const table=document.getElementById('itAssetTable');
  if(!table) return;
  const visible=itVisibleEmployees();
  const empSelect=document.getElementById('itAssetEmp');
  const empOptions=visible.map(e=>`<option value="${e.id}">${safeText(employeeAdminLabel(e))} - ${e.employeeCode||'No ID'}</option>`).join('');
  if(empSelect){
    const previousEmp=empSelect.value;
    empSelect.innerHTML=empOptions||'<option value="">No employees available</option>';
    if(previousEmp&&[...empSelect.options].some(opt=>opt.value===previousEmp)) empSelect.value=previousEmp;
  }
  const dateInput=document.getElementById('itAssetDate');
  if(dateInput&&!dateInput.value) dateInput.value=new Date().toISOString().slice(0,10);
  onItAssetTypeChange();
  const filterEmp=document.getElementById('itAssetFilterEmp')?.value||'';
  const filterStatus=document.getElementById('itAssetFilterStatus')?.value||'all';
  const filterType=document.getElementById('itAssetFilterType')?.value||'';
  const search=(document.getElementById('itAssetSearch')?.value||'').trim().toLowerCase();
  const filterSelect=document.getElementById('itAssetFilterEmp');
  if(filterSelect){
    const previous=filterSelect.value;
    filterSelect.innerHTML=`<option value="">All employees</option>${empOptions}`;
    if(previous&&[...filterSelect.options].some(opt=>opt.value===previous)) filterSelect.value=previous;
  }
  let rows=collectEmployeeAssets(visible);
  if(filterEmp) rows=rows.filter(r=>r.employee.id===filterEmp);
  if(filterStatus==='allocated'||filterStatus==='returned') rows=rows.filter(r=>r.asset.status===filterStatus);
  if(filterType) rows=rows.filter(r=>r.asset.type===filterType);
  if(search){
    rows=rows.filter(({employee,asset})=>{
      const hay=[
        employee.name,
        employee.employeeCode,
        employee.dept,
        employee.email,
        asset.serialOrTag,
        asset.typeLabel,
        asset.remarks,
        employeeCompanyName(employee)
      ].join(' ').toLowerCase();
      return hay.includes(search);
    });
  }
  const total=rows.length;
  const allocated=rows.filter(r=>r.asset.status==='allocated').length;
  const returned=rows.filter(r=>r.asset.status==='returned').length;
  const statTotal=document.getElementById('itAssetStatTotal');
  const statAlloc=document.getElementById('itAssetStatAllocated');
  const statRet=document.getElementById('itAssetStatReturned');
  if(statTotal) statTotal.textContent=String(total);
  if(statAlloc) statAlloc.textContent=String(allocated);
  if(statRet) statRet.textContent=String(returned);
  const it=currentItRecord();
  const scopedCompany=it&&it.companyId&&it.companyId!==PORTAL_ALL_COMPANIES_ID&&String(it.companyId).toLowerCase()!=='all';
  const showCompany=!scopedCompany;
  const head=`<thead><tr>${showCompany?'<th>Company</th>':''}<th>Employee</th><th>Employee ID</th><th>Department</th><th>Asset type</th><th>Serial / tag</th><th>Allocated</th><th>Condition</th><th>Status</th><th>Returned</th><th>Remarks</th><th>Action</th></tr></thead>`;
  const colSpan=showCompany?12:11;
  if(!rows.length){
    table.innerHTML=`${head}<tbody><tr><td colspan="${colSpan}" style="text-align:center;color:var(--color-text-secondary)">No asset records match your filters.</td></tr></tbody>`;
    return;
  }
  table.innerHTML=`${head}<tbody>${rows.map(({employee,asset})=>{
    const typeText=asset.type==='others'&&asset.otherDetail
      ?`${safeText(asset.typeLabel||'Others')} — ${safeText(asset.otherDetail)}`
      :safeText(asset.typeLabel||assetTypeLabel(asset.type));
    const statusClass=asset.status==='returned'?'b-archived':'b-active';
    const statusLabel=asset.status==='returned'?'Returned':'Allocated';
    const actions=asset.status==='allocated'
      ?`<div class="table-actions"><button class="btn sm" onclick="returnEmployeeAsset('${employee.id}','${asset.id}')"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Mark returned</button><button class="btn sm danger" onclick="deleteEmployeeAsset('${employee.id}','${asset.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button></div>`
      :`<div class="table-actions"><button class="btn sm danger" onclick="deleteEmployeeAsset('${employee.id}','${asset.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button></div>`;
    return `<tr>
      ${showCompany?`<td style="color:var(--color-text-secondary);font-weight:600">${safeText(employeeCompanyName(employee))}</td>`:''}
      <td style="font-weight:500">${safeText(employee.name)}</td>
      <td>${safeText(employee.employeeCode||'—')}</td>
      <td>${safeText(employee.dept||'—')}</td>
      <td>${typeText}</td>
      <td>${safeText(asset.serialOrTag||'—')}</td>
      <td>${formatAssetDate(asset.allocatedAt)}</td>
      <td>${safeText(asset.condition||'Good')}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${asset.status==='returned'?formatAssetDate(asset.returnedAt):'—'}</td>
      <td>${safeText(asset.remarks||'—')}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('')}</tbody>`;
};
window.allocateItEmployeeAsset=function(){
  const empId=document.getElementById('itAssetEmp')?.value;
  const employee=employeeById(empId);
  if(!employee){toast('Select an employee');return;}
  if(!assertCanManageEmployeeAssets(employee,'allocate assets for')) return;
  const type=document.getElementById('itAssetType')?.value||'laptop';
  const typeMeta=ASSET_TYPES.find(t=>t.key===type)||ASSET_TYPES[0];
  const otherDetail=(document.getElementById('itAssetOtherDetail')?.value||'').trim();
  if(type==='others'&&!otherDetail){toast('Describe the asset for Others');return;}
  const serialOrTag=(document.getElementById('itAssetSerial')?.value||'').trim();
  const remarks=(document.getElementById('itAssetRemarks')?.value||'').trim();
  const allocatedAt=document.getElementById('itAssetDate')?.value||new Date().toISOString().slice(0,10);
  pushEmployeeAssetRecord(employee,{
    type:typeMeta.key,
    typeLabel:typeMeta.label,
    otherDetail:type==='others'?otherDetail:'',
    remarks,
    serialOrTag,
    allocatedAt,
    condition:document.getElementById('itAssetCondition')?.value||'Good',
    allocatedBy:currentUser?.name||'IT'
  });
  if(document.getElementById('itAssetOtherDetail')) document.getElementById('itAssetOtherDetail').value='';
  if(document.getElementById('itAssetSerial')) document.getElementById('itAssetSerial').value='';
  if(document.getElementById('itAssetRemarks')) document.getElementById('itAssetRemarks').value='';
  saveStore();
  refreshAssetViews();
  scheduleAssetSheetPush('allocate-asset');
  toast(`Allocated ${typeMeta.label} to ${employee.name}`);
};
window.allocateEmployeeAsset=function(){
  const empId=document.getElementById('assetEmp')?.value;
  const employee=employeeById(empId);
  if(!employee){toast('Select an employee');return;}
  if(!assertCanManageEmployeeAssets(employee,'allocate assets for')) return;
  const type=document.getElementById('assetType')?.value||'laptop_charger';
  const typeMeta=ASSET_TYPES.find(t=>t.key===type)||ASSET_TYPES[0];
  const otherDetail=(document.getElementById('assetOtherDetail')?.value||'').trim();
  if(type==='others'&&!otherDetail){toast('Describe the asset for Others');return;}
  const serialOrTag=(document.getElementById('assetSerial')?.value||'').trim();
  const remarks=(document.getElementById('assetRemarks')?.value||'').trim();
  const allocatedAt=document.getElementById('assetDate')?.value||new Date().toISOString().slice(0,10);
  pushEmployeeAssetRecord(employee,{
    type:typeMeta.key,
    typeLabel:typeMeta.label,
    otherDetail:type==='others'?otherDetail:'',
    remarks,
    serialOrTag,
    allocatedAt,
    condition:(document.getElementById('assetConditionMain')?.value||document.getElementById('assetCondition')?.value||'Good'),
    allocatedBy:currentUser?.name||'HR'
  });
  if(document.getElementById('assetOtherDetail')) document.getElementById('assetOtherDetail').value='';
  if(document.getElementById('assetSerial')) document.getElementById('assetSerial').value='';
  if(document.getElementById('assetRemarks')) document.getElementById('assetRemarks').value='';
  saveStore();
  refreshAssetViews();
  scheduleAssetSheetPush('allocate-asset');
  toast(`Allocated ${typeMeta.label} to ${employee.name}`);
};
window.returnEmployeeAsset=function(empId,assetId){
  const employee=employeeById(empId);
  if(!employee) return;
  if(!assertCanManageEmployeeAssets(employee,'update assets for')) return;
  const asset=(employee.assets||[]).find(a=>a.id===assetId);
  if(!asset){toast('Asset record not found');return;}
  if(asset.status==='returned'){toast('Already marked returned');return;}
  asset.status='returned';
  asset.returnedAt=new Date().toISOString().slice(0,10);
  asset.returnedBy=currentUser?.name||currentUser?.email||'IT';
  syncInventoryOnAssetReturn(employee,asset);
  if(typeof syncExitCaseAfterAssetReturn==='function') syncExitCaseAfterAssetReturn(employee,assetId);
  saveStore();
  refreshAssetViews();
  if(typeof renderItExitAssetReturns==='function') renderItExitAssetReturns();
  if(typeof renderExits==='function') renderExits();
  if(typeof updateItExitReturnBadge==='function') updateItExitReturnBadge();
  scheduleAssetSheetPush('return-asset');
  toast(`${asset.typeLabel||'Asset'} marked returned`);
};
window.deleteEmployeeAsset=function(empId,assetId){
  const employee=employeeById(empId);
  if(!employee) return;
  if(!assertCanManageEmployeeAssets(employee,'delete assets for')) return;
  const asset=(employee.assets||[]).find(a=>a.id===assetId);
  if(!asset) return;
  if(!confirm(`Delete this ${asset.typeLabel||'asset'} record for ${employee.name}?`)) return;
  syncInventoryOnAssetDelete(employee,asset);
  employee.assets=(employee.assets||[]).filter(a=>a.id!==assetId);
  saveStore();
  refreshAssetViews();
  scheduleAssetSheetPush('delete-asset');
  toast('Asset record deleted');
};

function appointmentTemplateCompanyId(){
  if(isCompanyHrSession()) return lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
  const selected=document.getElementById('apptTemplateCompany')?.value;
  if(selected) return resolveCompanyId(selected);
  const employee=employeeById(document.getElementById('apptEmp')?.value);
  if(employee?.companyId) return resolveCompanyId(employee.companyId);
  if(!isAllCompaniesView()) return resolveCompanyId(activeCompanyId);
  return PORTAL_COMPANIES[0]?.id||'VNSPL';
}
function syncAppointmentTemplateCompanySelect(){
  const select=document.getElementById('apptTemplateCompany');
  if(!select) return;
  const previous=select.value;
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
    select.innerHTML=`<option value="${cid}">${safeText(companyLabelById(cid))}</option>`;
    select.value=cid;
    select.disabled=true;
  }else{
    select.disabled=false;
    select.innerHTML=PORTAL_COMPANIES.map(c=>`<option value="${c.id}">${safeText(companyOptionLabel(c))}</option>`).join('');
    const preferred=previous
      ||(employeeById(document.getElementById('apptEmp')?.value)?.companyId)
      ||(!isAllCompaniesView()?activeCompanyId:null)
      ||PORTAL_COMPANIES[0]?.id;
    const next=resolveCompanyId(preferred||PORTAL_COMPANIES[0]?.id||'VNSPL');
    if([...select.options].some(opt=>opt.value===next)) select.value=next;
  }
  updateAppointmentTemplateStatus();
}
function updateAppointmentTemplateStatus(){
  const status=document.getElementById('apptTemplateStatus');
  if(!status) return;
  const companyId=appointmentTemplateCompanyId();
  const saved=store.appointmentLetterTemplates?.[companyId];
  const hasCustom=typeof saved==='string'&&saved.trim();
  status.textContent=hasCustom
    ?`Custom wording saved for ${companyLabelById(companyId)}`
    :`Using shared default wording for ${companyLabelById(companyId)} (save a draft to customize)`;
}
window.onAppointmentTemplateCompanyChange=function(){
  if(appointmentDraftEditing) toggleAppointmentDraftEdit(false);
  updateAppointmentTemplateStatus();
  renderAppointmentLetterPreview();
};

function appointmentDraftValues(){
  const val=id=>(document.getElementById(id)?.value||'').trim();
  const orPlaceholder=(v,label)=>v||`[${label}]`;
  const ctc=val('apptCtc');
  const mirror=document.getElementById('apptCtcMirror');
  if(mirror) mirror.value=ctc;
  return {
    name:orPlaceholder(val('apptName'),'Employee Name'),
    employeeCode:orPlaceholder(val('apptEmpId'),'Employee ID'),
    aadhaar:orPlaceholder(val('apptAadhaar'),'Aadhaar Number'),
    uan:orPlaceholder(val('apptUan'),'UAN Number'),
    companyName:orPlaceholder(val('apptCompany'),'Company Name'),
    role:orPlaceholder(val('apptRole'),'Role / Designation'),
    ctc:orPlaceholder(ctc,'CTC'),
    date:val('apptDate')||new Date().toISOString().slice(0,10),
    businessUnit:orPlaceholder(val('apptBu'),'Business Unit'),
    functionName:orPlaceholder(val('apptFunction'),'Function'),
    reportingManager:orPlaceholder(val('apptManager'),'Reporting Manager'),
    location:orPlaceholder(val('apptLocation')||'Pune','Location'),
    basicMonthly:orPlaceholder(val('apptBasicM'),'Basic /m'),
    basicAnnual:orPlaceholder(val('apptBasicA'),'Basic /y'),
    hraMonthly:orPlaceholder(val('apptHraM'),'HRA /m'),
    hraAnnual:orPlaceholder(val('apptHraA'),'HRA /y'),
    bonusMonthly:orPlaceholder(val('apptBonusM'),'Bonus /m'),
    bonusAnnual:orPlaceholder(val('apptBonusA'),'Bonus /y'),
    specialMonthly:orPlaceholder(val('apptSpecialM'),'Special /m'),
    specialAnnual:orPlaceholder(val('apptSpecialA'),'Special /y'),
    grossMonthly:orPlaceholder(val('apptGrossM'),'Gross /m'),
    grossAnnual:orPlaceholder(val('apptGrossA'),'Gross /y'),
    erPfMonthly:orPlaceholder(val('apptErPfM'),'ER PF /m'),
    erPfAnnual:orPlaceholder(val('apptErPfA'),'ER PF /y'),
    erEsicMonthly:orPlaceholder(val('apptErEsicM'),'ER ESIC /m'),
    erEsicAnnual:orPlaceholder(val('apptErEsicA'),'ER ESIC /y'),
    eePfMonthly:orPlaceholder(val('apptEePfM'),'EE PF /m'),
    eePfAnnual:orPlaceholder(val('apptEePfA'),'EE PF /y'),
    eeEsicMonthly:orPlaceholder(val('apptEeEsicM'),'EE ESIC /m'),
    eeEsicAnnual:orPlaceholder(val('apptEeEsicA'),'EE ESIC /y'),
    ctcMonthly:orPlaceholder(val('apptCtcM'),'CTC /m')
  };
}

function parseCtcAmount(value){
  const n=Number(String(value||'').replace(/[^0-9.]/g,''));
  return Number.isFinite(n)?n:0;
}

function formatCtcAmount(n){
  if(!Number.isFinite(n)||n<=0) return '';
  return Math.round(n).toLocaleString('en-IN');
}
function displayCtc(value){
  const amount=parseCtcAmount(value);
  return amount>0?`₹${formatCtcAmount(amount)}`:'Not set';
}
function formatCtcTableNum(n,decimals=1){
  const v=Number(n)||0;
  return v.toLocaleString('en-IN',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}

/** CTC structure: Basic = 50% of Gross For Basic; PF/ESIC/Gross via non-circular solver. */
function computeCtcBreakdown(annualCtc,opts={}){
  const annual=Math.max(0,parseCtcAmount(annualCtc));
  const fixedAnnual=Math.max(0,parseCtcAmount(opts.fixedBonus));
  const variableAnnual=Math.max(0,parseCtcAmount(opts.variableBonus));
  const ctcMonthly=annual/12;
  const fixedMonthly=fixedAnnual/12;
  const PF_CAP=1800;
  const ESIC_BASIC_LIMIT=21000;
  const STAT_BONUS_BASIC_LIMIT=21000;
  const STAT_BONUS_RATE=0.0833;
  const ER_ESIC_RATE=0.0325;
  const EE_ESIC_RATE=0.0075;
  const round2=n=>Math.round(n*100)/100;

  // Gross For Basic = monthly CTC (+ fixed bonus / 12). Basic = 50% of this (non-circular).
  const grossForBasic=ctcMonthly+fixedMonthly;
  let basic=0.5*grossForBasic;
  let erPf=0;
  let erEsic=0;
  let eePf=0;
  let eeEsic=0;
  let gross=0;
  const solverSteps=[];

  for(let step=0;step<4;step++){
    const basicPrev=basic;
    erPf=Math.min(PF_CAP,0.12*basicPrev);
    eePf=erPf;
    const esicApplies=basicPrev<=ESIC_BASIC_LIMIT;
    erEsic=esicApplies?ER_ESIC_RATE*basicPrev:0;
    eeEsic=esicApplies?EE_ESIC_RATE*basicPrev:0;
    gross=grossForBasic-erPf-erEsic;
    // Basic (new) = 50% × (Gross + ER PF + ER ESIC + Fixed/12) = 50% × Gross For Basic
    basic=0.5*(gross+erPf+erEsic+fixedMonthly);
    solverSteps.push({
      step,
      basicPrev:round2(basicPrev),
      erPf:round2(erPf),
      erEsic:round2(erEsic),
      gross:round2(gross),
      grossForBasic:round2(grossForBasic),
      basicNew:round2(basic)
    });
  }

  const statutoryBonus=basic<=STAT_BONUS_BASIC_LIMIT?basic*STAT_BONUS_RATE:0;
  let hra=0.5*basic;
  let special=gross-basic-hra-statutoryBonus;
  if(special<0){
    hra=777;
    special=gross-basic-hra-statutoryBonus;
  }

  const round1=n=>Math.round(n*10)/10;
  return {
    annual,
    basic:round1(basic),
    hra:round1(hra),
    statutoryBonus:round1(statutoryBonus),
    special:round1(special),
    gross:round1(gross),
    erPf:round1(erPf),
    erEsic:round1(erEsic),
    eePf:round1(eePf),
    eeEsic:round1(eeEsic),
    fixedAnnual:round1(fixedAnnual),
    variableAnnual:round1(variableAnnual),
    ctcMonthly:round1(ctcMonthly),
    ctcAnnual:round1(annual),
    grossForBasic:round1(grossForBasic),
    solverSteps
  };
}

function ctcBreakdownRows(b){
  return [
    {label:'Basic',monthly:b.basic,annual:b.basic*12,formula:'50% of (Monthly Gross + Monthly Employer PF + Monthly Employer ESIC + Fixed bonus / 12). Derived via Gross For Basic solver.',total:false},
    {label:'HRA',monthly:b.hra,annual:b.hra*12,formula:'50% of Basic; capped to 777 if that would push Special Allowance negative.',total:false},
    {label:'Statutory Bonus',monthly:b.statutoryBonus,annual:b.statutoryBonus*12,formula:'Applied only if Basic is less than or equal to 21k.',total:false},
    {label:'Special Allowance',monthly:b.special,annual:b.special*12,formula:'Gross Monthly Salary - Basic - HRA - Statutory Bonus',total:false},
    {label:'Gross Salary',monthly:b.gross,annual:b.gross*12,formula:'Gross For Basic − Employer PF − Employer ESIC.',total:true},
    {label:'Employer PF',monthly:b.erPf,annual:b.erPf*12,formula:'12% of Basic, capped at ₹1,800.',total:false},
    {label:'Employer ESIC',monthly:b.erEsic,annual:b.erEsic*12,formula:'3.25% of Basic when Basic ≤ ₹21,000.',total:false},
    {label:'Employee PF',monthly:b.eePf,annual:b.eePf*12,formula:'12% of Basic, capped at ₹1,800.',total:false},
    {label:'Employee ESIC',monthly:b.eeEsic,annual:b.eeEsic*12,formula:'0.75% of Basic when Basic ≤ ₹21,000.',total:false},
    {label:'Annual Fixed Bonus',monthly:0,annual:b.fixedAnnual,formula:'Based on input; paid as a lump sum and not part of the monthly gross.',total:false},
    {label:'Annual Variable Bonus',monthly:0,annual:b.variableAnnual,formula:'Based on input; paid as a lump sum and not part of the monthly gross.',total:false},
    {label:'CTC Monthly',monthly:b.ctcMonthly,annual:b.ctcAnnual,formula:'Gross + Employer contributions',total:true}
  ];
}

function renderCtcFormulaTableHtml(annualCtc,opts={}){
  const annual=parseCtcAmount(annualCtc);
  if(!annual){
    return '<div class="hint-box" style="margin:0">Set annual CTC to see the component table.</div>';
  }
  const breakdown=computeCtcBreakdown(annual,opts);
  const rows=ctcBreakdownRows(breakdown);
  const body=rows.map((r,i)=>`<tr class="${r.total?'ctc-row-total':(i%2?'ctc-row-alt':'')}">
      <td>${r.total?`<strong>${safeText(r.label)}</strong>`:safeText(r.label)}</td>
      <td class="num">${r.total?`<strong>${formatCtcTableNum(r.monthly)}</strong>`:formatCtcTableNum(r.monthly)}</td>
      <td class="num">${r.total?`<strong>${formatCtcTableNum(r.annual,0)}</strong>`:formatCtcTableNum(r.annual,0)}</td>
      <td class="ctc-formula">${safeText(r.formula)}</td>
    </tr>`).join('');
  return `<div class="ctc-formula-wrap"><table class="ctc-formula-table">
    <thead><tr><th>Component</th><th>Per Month (₹)</th><th>Per Annum (₹)</th><th>Formula (Reference)</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}
function ensureEmployeeSalaryHistory(employee){
  if(!employee) return [];
  employee.salaryHistory=Array.isArray(employee.salaryHistory)?employee.salaryHistory:[];
  const current=parseCtcAmount(employee.ctc);
  if(!employee.salaryHistory.length&&current>0){
    employee.salaryHistory.push({
      id:`sal-init-${employee.id}-${Date.now()}`,
      type:'joining',
      previousCtc:0,
      newCtc:current,
      bonusAmount:0,
      effectiveDate:employee.dateOfJoining||new Date().toISOString().slice(0,10),
      notes:'Initial CTC on record',
      recordedAt:new Date().toISOString(),
      recordedBy:currentUser?.name||'HR'
    });
  }
  employee.salaryHistory.forEach(entry=>{
    if(!entry.recordedAt) entry.recordedAt=entry.effectiveDate?`${entry.effectiveDate}T00:00:00`:(employee.salaryUpdatedAt||new Date().toISOString());
  });
  if(!employee.salaryUpdatedAt&&employee.salaryHistory.length){
    const latest=[...employee.salaryHistory].sort((a,b)=>new Date(b.recordedAt||b.effectiveDate)-new Date(a.recordedAt||a.effectiveDate))[0];
    if(latest?.recordedAt) employee.salaryUpdatedAt=latest.recordedAt;
  }
  return employee.salaryHistory;
}
function recordEmployeeSalaryChange(employee,{type='increment',newCtc,bonusAmount=0,effectiveDate='',notes=''}={}){
  if(!employee) return null;
  ensureEmployeeSalaryHistory(employee);
  const previous=parseCtcAmount(employee.ctc);
  const next=parseCtcAmount(newCtc);
  const bonus=parseCtcAmount(bonusAmount);
  if(type!=='bonus'&&next<=0) throw new Error('Enter a valid new CTC');
  if(type==='bonus'&&bonus<=0&&next<=0) throw new Error('Enter a bonus amount or new CTC');
  const appliedCtc=type==='bonus'&&next<=0?previous:next;
  const entry={
    id:`sal-${Date.now()}`,
    type,
    previousCtc:previous,
    newCtc:appliedCtc,
    bonusAmount:bonus,
    effectiveDate:effectiveDate||new Date().toISOString().slice(0,10),
    notes:notes||'',
    recordedAt:new Date().toISOString(),
    recordedBy:currentUser?.name||'HR'
  };
  employee.salaryHistory.push(entry);
  if(appliedCtc>0) employee.ctc=formatCtcAmount(appliedCtc);
  employee.salaryUpdatedAt=entry.recordedAt;
  return entry;
}
function formatSalaryEditTime(value){
  const raw=value&&typeof value==='object'?(value.recordedAt||value.effectiveDate):value;
  if(!raw) return '—';
  const formatted=formatQueryTime(raw);
  return formatted==='Time unavailable'?'—':formatted;
}
function formatSalaryEditTimestamp(entry){
  return formatSalaryEditTime(entry);
}
let expandedSalaryEmpId=null;

window.toggleSalaryEmployeeDetail=function(empId){
  expandedSalaryEmpId=expandedSalaryEmpId===empId?null:empId;
  renderSalaries();
};

window.renderSalaries=function(){
  const list=document.getElementById('salaryList');
  if(!list) return;
  const allEmployees=adminVisibleEmployees();
  const search=(document.getElementById('salarySearch')?.value||'').trim().toLowerCase();
  const employees=search
    ? allEmployees.filter(e=>{
        const name=String(e.name||'').toLowerCase();
        const code=String(e.employeeCode||e.empId||e.id||'').toLowerCase();
        const email=String(e.email||'').toLowerCase();
        return name.includes(search)||code.includes(search)||email.includes(search);
      })
    : allEmployees;
  const withCtc=allEmployees.filter(e=>parseCtcAmount(e.ctc)>0);
  const historyCount=allEmployees.reduce((sum,e)=>sum+(Array.isArray(e.salaryHistory)?e.salaryHistory.length:0),0);
  const totalCtc=withCtc.reduce((sum,e)=>sum+parseCtcAmount(e.ctc),0);
  if(document.getElementById('salEmpCount')) document.getElementById('salEmpCount').textContent=allEmployees.length;
  if(document.getElementById('salWithCtc')) document.getElementById('salWithCtc').textContent=withCtc.length;
  if(document.getElementById('salHistoryCount')) document.getElementById('salHistoryCount').textContent=historyCount;
  if(document.getElementById('salTotalCtc')) document.getElementById('salTotalCtc').textContent=totalCtc?`₹${formatCtcAmount(totalCtc)}`:'—';
  if(!allEmployees.length){
    list.innerHTML='<div class="empty-state">No employees in this view yet.</div>';
    return;
  }
  if(!employees.length){
    list.innerHTML=`<div class="empty-state">No employees match “${safeText(document.getElementById('salarySearch')?.value||'')}”.</div>`;
    return;
  }
  list.innerHTML=employees.map(e=>{
    ensureEmployeeSalaryHistory(e);
    const history=[...(e.salaryHistory||[])].sort((a,b)=>new Date(b.effectiveDate||b.recordedAt)-new Date(a.effectiveDate||a.recordedAt));
    const prevLabel=history.length>1?displayCtc(history[1]?.newCtc||history[0]?.previousCtc):'—';
    const lastEdited=e.salaryUpdatedAt||history[0]?.recordedAt||'';
    const expanded=expandedSalaryEmpId===e.id;
    const historyRows=history.length?history.map(h=>`<tr>
      <td>${safeText(h.effectiveDate||'—')}</td>
      <td><span class="badge b-pending">${safeText(h.type||'update')}</span></td>
      <td>${displayCtc(h.previousCtc)}</td>
      <td><strong>${displayCtc(h.newCtc)}</strong></td>
      <td>${parseCtcAmount(h.bonusAmount)>0?displayCtc(h.bonusAmount):'—'}</td>
      <td>${safeText(h.notes||'—')}</td>
      <td>${safeText(formatSalaryEditTime(h.recordedAt))}</td>
      <td>${safeText(h.recordedBy||'HR')}</td>
    </tr>`).join(''):`<tr><td colspan="8" style="text-align:center;color:var(--color-text-secondary)">No salary history yet.</td></tr>`;
    const detail=expanded?`
      <div class="salary-emp-detail" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-border-tertiary,#e5e7eb)">
        <div class="card-title" style="margin:0 0 8px;font-size:13px"><i class="ti ti-table" aria-hidden="true"></i> CTC breakdown</div>
        ${renderCtcFormulaTableHtml(e.ctc,{fixedBonus:e.fixedBonus,variableBonus:e.variableBonus})}
        <div class="hint-box" style="margin:8px 0 0">To enter monthly amounts manually, use <strong>Appointment letter → CTC breakdown</strong> (annual = monthly × 12).</div>
        <div style="overflow-x:auto;margin-top:12px">
          <table class="etable">
            <thead><tr><th>Effective</th><th>Type</th><th>Previous CTC</th><th>New CTC</th><th>Bonus</th><th>Notes</th><th>Edited at</th><th>Recorded by</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>`:'';
    return `<div class="card salary-emp-card${expanded?' is-expanded':''}" style="margin-bottom:12px">
      <div class="card-hd">
        <div>
          <div class="ri-name">
            <span class="emp-company-tag">${safeText(employeeCompanyName(e))}</span>
            <button type="button" class="emp-name-link" onclick="toggleSalaryEmployeeDetail('${e.id}')" title="${expanded?'Hide salary breakdown':'View salary breakdown'}">${safeText(e.name)}</button>
          </div>
          <div class="ri-meta">${safeText(e.employeeCode||'No ID')} · ${safeText(e.role||e.designation||'Employee')} · ${safeText(e.email||'')}${lastEdited?` · Last salary edit ${formatSalaryEditTime(lastEdited)}`:''}${expanded?'':' · Click name for CTC breakdown'}</div>
        </div>
        <div class="ri-right">
          <button class="btn sm" onclick="openSalaryChangeModal('${e.id}','increment')"><i class="ti ti-trending-up" aria-hidden="true"></i> Increment</button>
          <button class="btn sm" onclick="openSalaryChangeModal('${e.id}','bonus')"><i class="ti ti-gift" aria-hidden="true"></i> Bonus</button>
          <button class="btn sm pri" onclick="openSalaryChangeModal('${e.id}','correction')"><i class="ti ti-pencil" aria-hidden="true"></i> Update CTC</button>
        </div>
      </div>
      <div class="stats" style="margin:10px 0 0">
        <div class="stat"><div class="stat-l">Current CTC</div><div class="stat-v" style="color:#3B6D11">${displayCtc(e.ctc)}</div></div>
        <div class="stat"><div class="stat-l">Previous CTC</div><div class="stat-v">${prevLabel}</div></div>
        <div class="stat"><div class="stat-l">History</div><div class="stat-v" style="color:#534AB7">${history.length}</div></div>
      </div>
      ${detail}
    </div>`;
  }).join('');
};
window.openSalaryChangeModal=function(empId,prefType='increment'){
  const employee=employeeById(empId);
  if(!employee){toast('Employee not found');return;}
  if(!assertEmployeeInHrScope(employee,'update salary for')) return;
  ensureEmployeeSalaryHistory(employee);
  document.getElementById('salaryEmpId').value=employee.id;
  document.getElementById('salaryModalTitle').textContent=`Update salary — ${employee.name}`;
  document.getElementById('salaryChangeType').value=prefType||'increment';
  document.getElementById('salaryEffectiveDate').value=new Date().toISOString().slice(0,10);
  document.getElementById('salaryPreviousCtc').value=parseCtcAmount(employee.ctc)?formatCtcAmount(parseCtcAmount(employee.ctc)):'Not set';
  document.getElementById('salaryNewCtc').value=parseCtcAmount(employee.ctc)?formatCtcAmount(parseCtcAmount(employee.ctc)):'';
  document.getElementById('salaryBonusAmount').value='';
  document.getElementById('salaryNotes').value='';
  document.getElementById('salaryPrevHint').textContent=`Previous CTC ${displayCtc(employee.ctc)} will remain visible in history after this change.`;
  openM('mSalary');
};
window.saveSalaryChange=function(){
  const empId=document.getElementById('salaryEmpId')?.value;
  const employee=employeeById(empId);
  if(!employee){toast('Employee not found');return;}
  if(!assertEmployeeInHrScope(employee,'update salary for')) return;
  try{
    recordEmployeeSalaryChange(employee,{
      type:document.getElementById('salaryChangeType')?.value||'increment',
      newCtc:document.getElementById('salaryNewCtc')?.value,
      bonusAmount:document.getElementById('salaryBonusAmount')?.value,
      effectiveDate:document.getElementById('salaryEffectiveDate')?.value,
      notes:document.getElementById('salaryNotes')?.value.trim()
    });
  }catch(err){
    toast(err.message||'Could not save salary change');
    return;
  }
  saveStore();
  closeM('mSalary');
  renderSalaries();
  scheduleEmployeeSheetPush('salary-change');
  toast('Salary change saved. Previous CTC kept in history.');
};

window.syncCtcAnnualFromMonthly=function(monthlyId,annualId){
  const monthlyEl=document.getElementById(monthlyId);
  const annualEl=document.getElementById(annualId);
  if(!monthlyEl||!annualEl) return;
  const monthly=parseCtcAmount(monthlyEl.value);
  annualEl.value=monthly?formatCtcAmount(monthly*12):(monthlyEl.value===''||monthlyEl.value==='0'?'0':'');
  if(annualId==='apptCtc'){
    const mirror=document.getElementById('apptCtcMirror');
    if(mirror) mirror.value=annualEl.value;
    const topCtc=document.getElementById('apptCtc');
    if(topCtc&&topCtc!==annualEl) topCtc.value=annualEl.value;
  }
};

window.recalculateApptCtcMonthly=function(){
  const amountOf=id=>parseCtcAmount(document.getElementById(id)?.value);
  const setMonthly=(mId,aId,n)=>{
    const el=document.getElementById(mId);
    if(!el) return;
    el.value=n?formatCtcAmount(n):(n===0?'0':'');
    syncCtcAnnualFromMonthly(mId,aId);
  };
  const partSum=amountOf('apptBasicM')+amountOf('apptHraM')+amountOf('apptBonusM')+amountOf('apptSpecialM');
  if(partSum>0) setMonthly('apptGrossM','apptGrossA',partSum);
  const gross=amountOf('apptGrossM');
  // CTC Monthly = Gross + Employer PF + Employer ESIC (employer cost of fields above)
  const ctcMonthly=gross+amountOf('apptErPfM')+amountOf('apptErEsicM');
  setMonthly('apptCtcM','apptCtc',ctcMonthly);
};

window.autoFillCtcPerAnnum=function(){
  recalculateApptCtcMonthly();
  const pairs=[
    ['apptBasicM','apptBasicA'],
    ['apptHraM','apptHraA'],
    ['apptBonusM','apptBonusA'],
    ['apptSpecialM','apptSpecialA'],
    ['apptGrossM','apptGrossA'],
    ['apptErPfM','apptErPfA'],
    ['apptErEsicM','apptErEsicA'],
    ['apptEePfM','apptEePfA'],
    ['apptEeEsicM','apptEeEsicA'],
    ['apptCtcM','apptCtc']
  ];
  let filled=0;
  pairs.forEach(([mId,aId])=>{
    const monthly=parseCtcAmount(document.getElementById(mId)?.value);
    if(!monthly&&document.getElementById(mId)?.value!=='0') return;
    if(!document.getElementById(mId)?.value) return;
    syncCtcAnnualFromMonthly(mId,aId);
    filled+=1;
  });
  renderAppointmentLetterPreview();
  if(!filled){toast('Enter at least one monthly amount first');return;}
  toast('Per annum filled as monthly × 12');
};

window.autoFillCtcBreakdown=window.autoFillCtcPerAnnum;

function appointmentLetterLongDate(value){
  const dt=new Date(`${value}T00:00:00`);
  if(Number.isNaN(dt.getTime())) return formatDateOnly(value);
  return dt.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
}

function appointmentLetterFirstName(name){
  const cleaned=String(name||'').trim();
  if(!cleaned||cleaned.startsWith('[')) return cleaned||'[Name]';
  return cleaned.split(/\s+/)[0];
}

function appointmentLetterStyles(){
  return `
  @page{size:A4 portrait;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#7f858c}
  body{
    font-family:Georgia,'Times New Roman',serif;
    color:#1a1a1a;
    line-height:1.55;
    font-size:12pt;
    padding:28px 16px 40px;
  }
  .letter-page{
    width:210mm;
    height:297mm;
    padding:18mm 20mm 14mm;
    margin:0 auto 18px;
    background:#fff;
    border:1px solid #6b7178;
    box-shadow:0 6px 22px rgba(0,0,0,.28);
    display:flex;
    flex-direction:column;
    overflow:hidden;
    page-break-after:always;
    break-after:page;
  }
  .letter-page:last-child{page-break-after:auto;break-after:auto;margin-bottom:0}
  .letter-page-header{
    flex:0 0 auto;
    min-height:16mm;
    margin:0 0 8mm;
    padding-bottom:4mm;
    border-bottom:1px solid #e5e7eb;
    display:flex;
    align-items:center;
  }
  .letter-page-body{flex:1 1 auto;overflow:hidden;min-height:0}
  .letter-page-footer{
    flex:0 0 auto;
    margin-top:6mm;
    padding-top:3mm;
    border-top:1px solid #e5e7eb;
    text-align:center;
    font-size:10pt;
    color:#6b7280;
    font-family:Calibri,Arial,sans-serif;
  }
  .letter-logo{height:14mm;width:auto;max-width:60mm;object-fit:contain;display:block}
  .letter-logo-header,.letter-page-body .letter-logo-header{display:none!important}
  .letter-title{text-align:center;font-size:14pt;font-weight:700;margin:0 0 6mm;letter-spacing:.03em;text-transform:uppercase}
  .letter-date{margin:0 0 4mm}
  .letter-sign{margin-top:8mm}
  .letter-clause{margin:0 0 3.2mm;text-align:justify}
  .letter-sub{margin:0 0 2.8mm;text-align:justify}
  .letter-section{padding:0;margin:0;border:none;background:transparent;box-shadow:none}
  h3{font-size:12pt;margin:5mm 0 2.5mm}
  table.ctc-table{width:100%;border-collapse:collapse;margin:3mm 0;font-size:10pt}
  table.ctc-table th,table.ctc-table td{border:1px solid #c9d0da;padding:4px 6px;text-align:left;vertical-align:top}
  table.ctc-table th{background:#f3f6fb}
  table.ctc-table td.num{text-align:right;white-space:nowrap}
  table.ctc-table tr.total th,table.ctc-table tr.total td{font-weight:700;background:#f3f6fb}
  .muted{color:#4b5568}
  ul{margin:2.5mm 0 3mm 6mm;padding:0}
  li{margin:1.2mm 0}
  @media print{
    html,body{background:#fff;padding:0}
    .letter-page{
      box-shadow:none;
      border:none;
      margin:0;
      width:210mm;
      height:297mm;
      page-break-after:always;
      break-after:page;
    }
    .letter-page:last-child{page-break-after:auto;break-after:auto}
  }`;
}

function appointmentLetterSheetEl(){
  return document.getElementById('appointmentLetterSheet')||document.getElementById('appointmentLetterPreview');
}

function appointmentLetterPagesEl(){
  return document.getElementById('appointmentLetterPages');
}

function unwrapAppointmentLetterHtml(html){
  const wrap=document.createElement('div');
  wrap.innerHTML=String(html||'').trim();
  const sheet=wrap.querySelector('.letter-sheet, .letter-sheet-edit');
  if(sheet) return sheet.innerHTML;
  const pages=wrap.querySelector('.letter-pages');
  if(pages){
    // Rehydrate editable body from page bodies (best-effort)
    return [...pages.querySelectorAll('.letter-page-body')].map(p=>p.innerHTML).join('\n');
  }
  return wrap.innerHTML;
}

function appointmentLetterBodyHtml(values=appointmentDraftValues()){
  return fillAppointmentTemplate(getAppointmentLetterTemplate(),values);
}

function appointmentLetterMmToPx(mm){
  const probe=document.createElement('div');
  probe.style.cssText=`position:absolute;left:-9999px;top:0;width:${mm}mm;height:0;visibility:hidden;pointer-events:none`;
  document.body.appendChild(probe);
  const px=probe.offsetWidth;
  probe.remove();
  return px||(mm*3.78);
}

function collectAppointmentLetterBlocks(bodyHtml){
  const root=document.createElement('div');
  root.innerHTML=String(bodyHtml||'');
  root.querySelectorAll('.letter-logo-header').forEach(el=>el.remove());
  const blocks=[];
  const sections=[...root.querySelectorAll('.letter-section')];
  if(!sections.length){
    [...root.children].forEach(child=>blocks.push({kind:'block',html:child.outerHTML}));
    return blocks;
  }
  sections.forEach((section,idx)=>{
    if(idx>0) blocks.push({kind:'page-break'});
    [...section.children].forEach(child=>{
      if(child.classList?.contains('letter-logo-header')) return;
      blocks.push({kind:'block',html:child.outerHTML});
    });
  });
  return blocks;
}

function paginateAppointmentLetterBody(bodyHtml){
  const blocks=collectAppointmentLetterBlocks(bodyHtml);
  if(!blocks.length) return [''];
  const maxHeight=Math.max(280, appointmentLetterMmToPx(237));
  const measure=document.createElement('div');
  measure.className='letter-paginate-measure';
  document.body.appendChild(measure);
  const pages=[];
  let current=[];
  const flush=()=>{
    if(!current.length) return;
    pages.push(current.join(''));
    current=[];
  };
  blocks.forEach(block=>{
    if(block.kind==='page-break'){
      flush();
      return;
    }
    current.push(block.html);
    measure.innerHTML=current.join('');
    if(measure.scrollHeight>maxHeight&&current.length>1){
      const overflow=current.pop();
      flush();
      current.push(overflow);
      measure.innerHTML=current.join('');
      // If a single block is taller than a page, keep it alone (table etc.)
      if(measure.scrollHeight>maxHeight){
        flush();
      }
    }
  });
  flush();
  measure.remove();
  return pages.length?pages:[''];
}

function appointmentLetterLiveBodyHtml(values=appointmentDraftValues()){
  if(appointmentDraftEditing){
    const sheet=appointmentLetterSheetEl();
    if(sheet&&!sheet.hidden) return sheet.innerHTML;
  }
  return appointmentLetterBodyHtml(values);
}

function buildAppointmentLetterPagesHtml(values=appointmentDraftValues(), bodyHtml=null){
  const html=bodyHtml!=null?bodyHtml:appointmentLetterLiveBodyHtml(values);
  const logoUrl=appointmentLogoUrl();
  const companyName=safeText(values.companyName||COMPANY.companyName||'Company');
  const pageBodies=paginateAppointmentLetterBody(html);
  const total=pageBodies.length;
  return pageBodies.map((pageHtml,idx)=>`<div class="letter-page">
  <div class="letter-page-header"><img class="letter-logo" src="${logoUrl}" alt="${companyName}"></div>
  <div class="letter-page-body">${pageHtml}</div>
  <div class="letter-page-footer"><span>${idx+1} / ${total}</span></div>
</div>`).join('');
}

function appointmentLetterHtml(values=appointmentDraftValues()){
  return `<div class="letter-pages">${buildAppointmentLetterPagesHtml(values)}</div>`;
}

function appointmentLogoUrl(companyId){
  const id=resolveCompanyId(companyId||(typeof appointmentTemplateCompanyId==='function'?appointmentTemplateCompanyId():null)||PORTAL_COMPANIES[0]?.id||'VNSPL');
  const company=PORTAL_COMPANIES.find(c=>c.id===id);
  const relative=company?.logo||COMPANY.logoUrl||COMPANY.logo||'assets/Vayana-Logo.svg';
  try{return new URL(relative,location.href).href;}catch(err){return relative;}
}

let appointmentDraftEditing=false;

function defaultAppointmentLetterTemplate(){
  return `
<div class="letter-section">
  <div class="letter-logo-header"><img class="letter-logo" src="{{logoUrl}}" alt="{{companyName}}"></div>
  <p class="letter-date">{{longDate}}</p>
  <p><strong>{{name}}</strong>, (Emp Code:{{employeeCode}})</p>
  <p>Dear {{firstName}},</p>
  <p class="letter-clause">We, at {{companyName}} believe that our People and our Customers are our greatest assets. We hire talented and entrepreneurial individuals through a rigorous selection process. There is no question in our minds that our high caliber team will be the foundation to our future across a broad and deep global franchise.</p>
  <p class="letter-clause">We believe that you are an exceptional individual who fulfils the high expectations that we have for each other. We are confident that you possess the world-class skills we seek and can work well with the existing brain trust at {{companyName}} as we continue to create an environment where extraordinary people accomplish great things.</p>
  <p class="letter-clause">In consonance with the above, we take pleasure in informing you of your appointment as “{{role}}”. Your annual CTC will be {{ctc}} as detailed in Annexure III. Your Key Result Areas and Key Performance Areas would be mutually derived and communicated to you on a periodic basis. Additionally, you will also be entitled to ESOP as per Company Policy. Stock options will be awarded after one year of employment subject to approval.</p>
  <p class="letter-clause">Your primary work location will be {{location}}. However, based on business requirements, the Company may transfer or assign you to any of its offices, client locations, or project sites within India.</p>
  <p class="letter-clause">We are excited about you joining our team to build together a unique and rewarding future. Please let us know your acceptance of the terms and conditions mentioned in the Annexure by signing on the duplicate copy of this Letter of Appointment.</p>
  <p class="letter-clause">We are confident that we will offer you many challenges and rewards and we know that you bring superior talent and ideas to us as well. We are looking forward to having you as a valuable member of the {{companyName}} team.</p>
  <div class="letter-sign">
    <p>Sincerely,</p>
    <p>For {{companyName}},</p>
    <p><strong>Mr. Vinod Parmar</strong><br>Group CFO</p>
    <p class="muted">Enclosures:<br>Annexure I: Employee Agreement<br>Annexure II: Roles and Responsibilities<br>Annexure III: Compensation and Benefits</p>
  </div>
</div>

<div class="letter-section">
  <div class="letter-logo-header"><img class="letter-logo" src="{{logoUrl}}" alt="{{companyName}}"></div>
  <div class="letter-title">Annexure I — Employment Agreement</div>
  <p class="letter-clause">This EMPLOYMENT AGREEMENT (hereinafter referred to as the “Agreement”) is made on this: {{longDate}}</p>
  <p class="letter-clause"><strong>BETWEEN</strong></p>
  <p class="letter-clause">{{companyName}}, a private limited company incorporated under the Companies Act, 1956 having its registered office at Shivkamal, 3rd Floor, 1076/5, Vidya Vihar Colony, Shivaji Nagar, Pune-411016, (hereinafter referred to as the “Company”, which expression shall, unless it be repugnant to the context or meaning thereof, be deemed to mean and include its successors and permitted assigns), of the FIRST PART;</p>
  <p class="letter-clause"><strong>AND</strong></p>
  <p class="letter-clause">{{name}}, (Emp Code:{{employeeCode}}) (Aadhaar No.:{{aadhaar}}) (UAN:{{uan}}) (hereinafter referred to as the "Employee"), of the SECOND PART.</p>
  <p class="letter-clause">In this Agreement, the Company and the Employee may be collectively referred to as the "Parties" and individually as a "Party".</p>
  <h3>WHEREAS:</h3>
  <p class="letter-clause">A. The Company is presently engaged in the business of providing services in the area of short-term trade finance and GSP (“the Business”).</p>
  <p class="letter-clause">B. The Employee confirms and acknowledges that he/she will come to be in possession of trade secrets and confidential information belonging to the Company and, therefore, if the Employee directly or indirectly becomes interested in any profit-making business activity/business competing with the Business of the Company, there would be a breach of his/her obligations of confidentiality contained herein below.</p>
  <p class="letter-clause">C. The Company is desirous of availing the services of the Employee, and the Employee is desirous of providing services to the Company, on the terms and conditions contained herein.</p>

  <h3>1. GENERAL CONDITIONS OF SERVICE</h3>
  <p class="letter-clause">The Company hereby employs the Employee, and the Employee hereby accepts employment with the Company, upon the terms and conditions set forth in this Agreement, the letter of appointment of even date and in the Company Employee Manual. The Employee shall report to such person as may be nominated by the Company. The Employment hereunder will commence on {{longDate}} (the “Effective Date”).</p>
  <p class="letter-clause">2. The Employee agrees and accepts that:</p>
  <p class="letter-sub">2.1 He/She shall perform such duties as may be assigned by the Company, which are more specifically listed in Annexure II, and shall comply with such written instructions/directions issued by the Company from time to time, which are in consonance with the duties listed in Annexure II. Any duties that the Employee is requested to perform, that are not listed in Annexure II shall be mutually agreed in writing between the Company and the Employee.</p>
  <p class="letter-sub">2.2 He/She shall carry out his/her duties with diligence and loyalty at all times, keeping the Company’s interests paramount.</p>
  <p class="letter-sub">2.3 He/She shall devote his/her whole time and attention to the business of the Company and shall use his/her best endeavors to promote its interests and welfare.</p>
  <p class="letter-sub">2.4 He/She shall not directly or indirectly engage in any business activity, having a profit-making motive or business or trade or profession or undertake any other employment, full or part-time, while in the employment of the Company.</p>
  <p class="letter-sub">2.5 He/She shall be bound by the Company’s rules and regulations of employment, including such rules and regulations as may be described in the Company employee handbook, and Employee agrees to adhere to these rules and regulations.</p>
  <p class="letter-sub">2.6 He/She shall not, under any circumstances either directly or indirectly, receive or accept for his/her own benefit any commission, rebate, discount, gratuity or profit in any manner whatsoever from any person, company, or firm having business transactions with the Company, arising out of the performance of any work or services to such person, company or firm during the Term of this Agreement, provided however the Employee may receive any payments arising out of any services performed and/or employee stock options vested in the Employee, prior to the Effective Date.</p>
  <p class="letter-sub">2.7 Subject to the other provisions of this Agreement and the general duties of the Employee as set out in this Agreement, the Employee shall not undertake any obligation for and on behalf of the Company without prior written consent/authorization of the Company.</p>

  <h3>3. COMPENSATION AND BENEFITS</h3>
  <p class="letter-clause">3.1 The Compensation and Benefits are detailed in Annexure III.</p>

  <h3>4. CONFIDENTIALITY</h3>
  <p class="letter-clause">4.1 The Employee shall during the Term of this Agreement and for a period of three years thereafter hold all Confidential Information of the Company (as defined below) in confidence and shall not disclose, use, copy, publish, summarize, or remove from the premises of the Company any Confidential Information, except: (a) as necessary to carry out his/her assigned responsibilities, and (b) upon written request or authorization by the Company (c) such information as has come into the public domain otherwise than as a result of direct or indirect disclosure by the Employee, (d) if required to be disclosed in order to comply with any law, order or regulation applicable to the Company, with prompt written notice of such request so that the Company may seek an appropriate protective order or other appropriate remedy; and (e) or is required to be disclosed for the business of the Company with the prior written consent of the Company, which consent may be communicated to the Employee in any written, electronic or other mode of communication. “Confidential Information” means all confidential and proprietary information and materials of the Company and the Company’s affiliates/subsidiaries to which the Employee gains access, and/or disclosed by the Company or otherwise observed or learned by the Employee, including without limitation all business, customer, and financial information, training materials, business and marketing plans, flow charts, methods, contracts, procedures, employee and contractor information, and all other data or information with respect to the Company and the Company’s affiliates/subsidiaries or their participants, regardless of form, but excludes Technical Information (as defined hereinafter).</p>
  <p class="letter-clause">4.2 The Employee shall during the Term of this Agreement and even thereafter at all times hold all Technical Information of the Company (as defined below) in confidence and will not disclose, use, copy, publish, summarize, or remove from the premises of the Company any Technical Information, except: (a) as necessary to carry out her/his assigned responsibilities, (b) upon written request or authorization by the Company (c) if such information has come into the public domain otherwise than as a result of direct or indirect disclosure by the Employee, (d) if required to be disclosed in order to comply with any law, order or regulation applicable to the Company, with prompt written notice of such request so that the Company may seek an appropriate protective order or other appropriate remedy; and (e) or is required to be disclosed for the business of the Company with the prior written consent of the Company, which consent may be communicated to the Employee in any written, electronic or other mode of communication. The Company shall immediately notify the Employee when any of its Technical Information is disclosed to third parties or has come into the public domain. “Technical Information” means all technical know-how or trade secret information and materials, source codes and software owned and developed by the Company and the Company’s affiliates/subsidiaries to which the Employee gains access, and/or disclosed by the Company or otherwise observed or learned by the Employee, but excludes Confidential Information.</p>
  <p class="letter-clause">4.3.1 The Company shall not divulge the terms of this Agreement to any third party without the prior approval and consent of the Employee, which shall not be unreasonably withheld, unless disclosure is required in order to comply with any law, order or regulation applicable to the Company in India or abroad. Provided however, that the Company may disclose the terms of this Agreement to a third party with whom it is entering into a merger, amalgamation or joint venture transaction, or if such third party proposes to invest a significant amount in the Company subject to the condition that the Company shall ensure that such third party shall execute such agreements and undertakings as may be required to keep the information disclosed to it, confidential at all times.</p>

  <h3>5. PROBATION</h3>
  <p class="letter-clause">5.1 You will be on probation for six (6) months from your date of joining, during which your performance and suitability will be assessed. Upon satisfactory completion, you may be confirmed in writing at the Company’s discretion. The probation period may be extended based on performance, with prior intimation. During probation, either party may terminate employment by giving thirty (30) days’ written notice or salary in lieu thereof. The Company reserves the right to terminate employment without notice in cases of proven misconduct or policy violation.</p>

  <h3>6. TERMINATION</h3>
  <p class="letter-clause">6.1 This Agreement may be terminated by the Employee or the Company at any time by giving the other party 60 (sixty) days prior written notice (“Notice Period”) or salary in lieu thereof. The period of notice shall be reduced to 30 (thirty) days if the Employee is on probation.</p>
  <p class="letter-clause">6.2 In case of deployment for overseas assignments, further to the period mentioned in clause 5.1, employee needs to give an additional notice period of one calendar month or forego one calendar month’s salary in lieu of the above said notice period in the event the employee terminates this agreement within 12 months of returning from the overseas assignment.</p>
  <p class="letter-clause">6.3 In the event of termination of service pursuant to Clause 5.1 hereinabove, the Employee shall be entitled to receive the amounts due under Clauses 3 of this Agreement (which shall necessarily include all approved expenses and accrued salary) up to the date of termination of this Agreement. Provided however, the Company shall be entitled to retain from the monies due to the Employee at the termination of this Agreement, any amount which is due to the Company from the Employee pursuant to any loans or advances disbursed/granted by the Company to the Employee. Subject to the aforesaid proviso, for the removal of any doubt, it is clarified that the Employee shall not be liable to refund any amount already paid to the Employee under any of the provisions contained in this Agreement.</p>
  <p class="letter-clause">6.4 The Company shall be entitled to terminate the Employee’s employment with immediate effect in any of the following cases:</p>
  <p class="letter-sub">(i) if the Employee is guilty of dishonesty or serious misconduct or, if the Employee without reasonable cause, grossly neglects or refuses to attend to his/her duties or habitually fails to perform any of the obligations hereunder or habitually fails to comply with reasonable written instructions/directions issued by the Company, or displays consistent poor performance, or persistently fails to observe the Company’s disciplinary rules or any other regulations of the Company in force from time to time;</p>
  <p class="letter-sub">(ii) Employee’s commission of a felony or an illegal act involving moral turpitude or fraud or Employee’s other actions that may reasonably be expected to have a material adverse effect on the Company;</p>
  <p class="letter-sub">(iii) if the Employee has been found to be of unsound mind by a court;</p>
  <p class="letter-sub">(iv) If the Employee is an undischarged insolvent or commits any other act of insolvency.</p>
  <p class="letter-clause">6.5 The Company shall be entitled to terminate the Employee’s employment upon giving 60 (sixty) days prior written notice if the Employee be prevented for an aggregate period of 60 (Sixty) days or for a continuous period of 30 (Thirty) days in any period of 12 (twelve) consecutive calendar months, by ill health or accident or any physical or mental disability from performing his/her duties/responsibilities under this Agreement and which in the reasonable judgment of the Company requires the replacement of the Employee.</p>
  <p class="letter-clause">6.6 Upon termination of this Agreement, the Employee shall return to the Company, without any delay, protest or demur all material and documents belonging to the Company, including the Confidential Information and Technical Information, which the Employee had obtained during the course of his/her employment and shall not keep any copies thereof. In the event the Employee is a director on the Company, upon termination of this Agreement, the Employee shall automatically cease to be a director of the Company, and the Company shall undertake all necessary steps in this regard, including the necessary filings with the Registrar of Companies.</p>

  <h3>7. NON-SOLICITATION AND NON-COMPETITION</h3>
  <p class="letter-clause">7.1 The Employee shall not during the continuance of this Agreement and at any time for a period of 2 years after termination of the employment (for any reason whatsoever including but not limited to dismissal, discharge simpliciter, resignation or otherwise howsoever) directly or indirectly solicit or entice away or attempt to solicit or entice away from the Company (including its subsidiaries), any employee, technical/technology consultant, client or customer in relation to the Business of the Company (including its subsidiaries) who shall have been an employee, technical/technology consultant, customer or client of the Business of the Company (including its subsidiaries) at the time of termination of employment. Provided however, that nothing in this Agreement shall restrict the ability of the Employee to directly or indirectly solicit any part-time consultants, suppliers, customers or clients of the Company in relation to any activity or business other than the Business of the Company.</p>
  <p class="letter-clause">7.2 The Employee undertakes not to directly or indirectly engage in any activity or business in whatsoever capacity which competes with the Business, for a period of 2 (Two) years after the termination of his/her employment hereunder for whatsoever reason. The Employee acknowledges that any breach of this covenant shall be deemed to be a breach of the confidentiality obligations of the Employee hereunder.</p>

  <h3>8. INTELLECTUAL PROPERTY RIGHTS</h3>
  <p class="letter-clause">8.1 Employees agree and acknowledge that title to all the Intellectual Property Rights in the Information, Products, Processes and Documentation will be and remain the absolute property of and will vest and remain vested with the Company.</p>
  <p class="letter-clause">8.2 If at any time during the course of his/her employment with the Company, on and from the date of this Agreement, the Employee, makes or discovers or participates in the making or discovery of any intellectual property (including any patent) relating to or capable of being used in the Business, he/she shall immediately assign any rights he/she may have with regard to such intellectual property (“Intellectual Property”) to the Company and full details of the Intellectual Property shall immediately be communicated by him/her to the Company, and such Intellectual Property shall belong absolutely to the Company.</p>
  <p class="letter-clause">8.3 At the request and expense of the Company the Employee shall give and supply all such information, data, drawings and assistance as may be required to enable the Company to exploit the Intellectual Property to the best advantage, and shall execute all documents and do all things which may be necessary or desirable for obtaining registration or other protection for the Intellectual Property in such parts of the world as may be specified by the Company and for vesting the same in the Company or as it may direct.</p>

  <h3>9. MISCELLANEOUS</h3>
  <p class="letter-clause"><strong>9.1 Governing Law</strong><br>This Agreement will be governed by the laws of India. Notwithstanding the arbitration provision recorded hereunder, the courts at Pune shall have exclusive jurisdiction to entertain all disputes under this Agreement.</p>
  <p class="letter-clause"><strong>9.2 Arbitration</strong><br>All disputes arising in connection with this Agreement shall, to the extent possible, be settled amicably by prompt good faith negotiations between the representatives of the Parties. In the event the dispute cannot be settled through such amicable settlement within thirty (30) days of the commencement of discussions, the dispute shall be settled under the Arbitration and Conciliation Act, 1996 by a sole arbitrator to be mutually appointed by the Parties hereto, whose decision the parties shall recognize and respect as final and binding. Any such arbitration proceeding shall be held at Chennai in the English language. Each Party shall co-operate in good faith to expedite (to the maximum extent practicable) the conduct of any arbitration proceedings commenced under this Agreement. The costs and expenses of the arbitration, including, without limitation, the fees of the arbitration and the arbitrators, shall be borne equally by each Party to the dispute or claim and each Party shall pay its own fees, disbursements and other charges of its counsel, except as may be determined otherwise by the arbitrator(s). The arbitrator(s) would have the power to award interest on any sum awarded pursuant to the arbitration proceedings and such sum would carry interest, if awarded, until the actual payment of such amounts. The arbitrator shall have the power to issue interim orders and interim directions to prevent any breach of this Agreement.</p>
  <p class="letter-clause"><strong>9.3 Waiver</strong><br>No failure or delay by any party to exercise any right hereunder or to insist upon the strict and punctual performance of any term hereof shall operate as a waiver thereof. Further, a single or partial exercise of any right shall not preclude an additional or further exercise thereof or the exercise of any other right. To be effective, each waiver of any right hereunder must be in writing and signed by the party waiving its right, and such waiver may be made subject to any conditions specified therein.</p>
  <p class="letter-clause"><strong>9.4 Exclusive Agreement and Amendment</strong><br>This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, negotiations, correspondence and undertakings, whether verbal or written, express or implied. This Agreement cannot be changed, amended, modified or terminated except by a written instrument executed by the Parties. The Employee expressly represents that he/she is not restricted in any manner whatsoever, whether under the terms of any prior agreement with another entity or otherwise under contract or by law, from accepting employment from the Company as contemplated under this Agreement.</p>
  <p class="letter-clause"><strong>9.5 Notice</strong><br>Any notice or other communication hereunder shall be in writing in the English language, signed by the Party giving notice, delivered or sent to the other Party at its address (or such other address as a Party has by five business days' prior written notice specified to the other Party). E-mail ID of Employer: {{supportEmail}}.</p>
  <p class="letter-clause"><strong>9.6 Partial Invalidity</strong><br>In the event any provision of this Agreement is declared by a judicial or Government authority to be legally invalid, non-binding or unenforceable, such term shall be deemed deleted herefrom and shall neither affect the Agreement in other respects nor the validity and enforceability of the remaining terms.</p>
  <p class="letter-clause"><strong>9.7 Equitable Relief</strong><br>The parties to this Agreement acknowledge that a breach of any of the terms or conditions of this Agreement will result in irrevocable harm and that the remedies at law for such breach may not adequately compensate for damages suffered. Accordingly, the parties agree that in the event of such breach, the non-breaching party shall be entitled to injunctive relief or such other equitable remedy. Nothing contained herein will be construed to limit the Company’s right to any remedies at law, including the recovery of damages for breach of this Agreement.</p>
  <p class="letter-clause"><strong>9.8 Miscellaneous</strong><br>This Agreement shall be binding upon and inure to the benefit of Company and its successors and assigns. Due to the personal nature of this Agreement, the Employee shall not have the right to assign the Employee’s rights or obligations under this Agreement without the prior written consent of Company. The Annexures attached hereto are incorporated herein by this reference.</p>
  <p class="letter-clause"><strong>9.9 Survival</strong><br>Notwithstanding anything to the contrary contained in this Agreement, the provisions contained in Clauses 4, 5.3, 6 and 8 shall continue to remain valid and binding on the Parties after the expiry or termination of this Agreement.</p>
  <p class="letter-clause">IN WITNESS WHEREOF, the parties hereto have signed this Agreement in 2 (two) original copies as of the date first set forth above.</p>
  <div class="letter-sign">
    <p><strong>{{companyName}}</strong></p>
    <p>Name: Mr. Vinod Parmar<br>Title: Group CFO<br>Date: {{longDate}}</p>
    <p>Name: {{name}} (Emp Code:{{employeeCode}})<br>Title: {{role}}<br>Date: {{longDate}}</p>
  </div>
</div>

<div class="letter-section">
  <div class="letter-logo-header"><img class="letter-logo" src="{{logoUrl}}" alt="{{companyName}}"></div>
  <div class="letter-title">Annexure II — Roles and Responsibilities</div>
  <p class="letter-clause">“Roles &amp; Responsibility” shall be separately communicated by reporting manager.</p>
</div>

<div class="letter-section">
  <div class="letter-logo-header"><img class="letter-logo" src="{{logoUrl}}" alt="{{companyName}}"></div>
  <div class="letter-title">Annexure III — Compensation and Benefits</div>
  <table class="ctc-table">
    <tr><th>Name of the Employee</th><td>{{name}}</td><th>Employee ID</th><td>{{employeeCode}}</td></tr>
    <tr><th>Company</th><td>{{companyName}}</td><th>Designation</th><td>{{role}}</td></tr>
    <tr><th>Business Unit</th><td>{{businessUnit}}</td><th>Function</th><td>{{functionName}}</td></tr>
    <tr><th>Reporting Manager</th><td>{{reportingManager}}</td><th>Location</th><td>{{location}}</td></tr>
  </table>
  <table class="ctc-table">
    <tr><th>CTC Component</th><th>Per Month</th><th>Per Annum</th></tr>
    <tr><td>Basic</td><td class="num">{{basicMonthly}}</td><td class="num">{{basicAnnual}}</td></tr>
    <tr><td>HRA</td><td class="num">{{hraMonthly}}</td><td class="num">{{hraAnnual}}</td></tr>
    <tr><td>Statutory Bonus</td><td class="num">{{bonusMonthly}}</td><td class="num">{{bonusAnnual}}</td></tr>
    <tr><td>Special Allowance</td><td class="num">{{specialMonthly}}</td><td class="num">{{specialAnnual}}</td></tr>
    <tr class="total"><th>Gross Salary</th><td class="num">{{grossMonthly}}</td><td class="num">{{grossAnnual}}</td></tr>
    <tr><td>Employer PF</td><td class="num">{{erPfMonthly}}</td><td class="num">{{erPfAnnual}}</td></tr>
    <tr><td>Employer ESIC</td><td class="num">{{erEsicMonthly}}</td><td class="num">{{erEsicAnnual}}</td></tr>
    <tr><td>Employee PF</td><td class="num">{{eePfMonthly}}</td><td class="num">{{eePfAnnual}}</td></tr>
    <tr><td>Employee ESIC</td><td class="num">{{eeEsicMonthly}}</td><td class="num">{{eeEsicAnnual}}</td></tr>
    <tr class="total"><th>CTC</th><td class="num">{{ctcMonthly}}</td><td class="num">{{ctc}}</td></tr>
  </table>
  <p class="muted">Note:</p>
  <ul>
    <li>Employee PF contribution is capped as Rs.1800 per month or 12% of Basic whichever is lower.</li>
    <li>The Company offers medical insurance for you and your dependents to the limit of Rs.5 Lacs (including cover for pre-existing conditions).</li>
    <li>The information in this sheet is confidential in nature and should not be disclosed under any circumstances.</li>
    <li>The Statutory contributions are subject to changes as per the regulatory amendments from time to time.</li>
  </ul>
</div>`;
}

function normalizeAppointmentLetterTemplate(saved){
  let text=String(saved||'');
  if(!text.trim()) return defaultAppointmentLetterTemplate();
  if(text.includes('Detailed component-wise breakup')||!text.includes('{{basicMonthly}}')){
    const annexure=defaultAppointmentLetterTemplate().match(/<div class="letter-section">\s*<div class="letter-title">Annexure III[\s\S]*$/i);
    if(annexure) text=text.replace(/<div class="letter-section">\s*<div class="letter-title">Annexure III[\s\S]*$/i, annexure[0]);
    else return defaultAppointmentLetterTemplate();
  }
  if(!text.includes('{{companyName}}')){
    text=text
      .replace(/Vay Network Services Private Limited\.?/gi,'{{companyName}}')
      .replace(/Vayana Network team/gi,'{{companyName}} team')
      .replace(/\bat Vayana\b/gi,'at {{companyName}}')
      .replace(/brain trust at Vayana/gi,'brain trust at {{companyName}}');
  }
  if(!text.includes('{{employeeCode}}')){
    text=text.replace(/\(Emp Code:[^)]*\)/gi,'(Emp Code:{{employeeCode}})');
  }
  if(!text.includes('{{aadhaar}}')||!text.includes('{{uan}}')){
    text=text.replace(
      /(\{\{name\}\},\s*\(Emp Code:\{\{employeeCode\}\}\))(\s*\(hereinafter referred to as the "Employee"\),\s*of the SECOND PART\.)/i,
      '$1 (Aadhaar No.:{{aadhaar}}) (UAN:{{uan}})$2'
    );
    if(!text.includes('{{aadhaar}}')||!text.includes('{{uan}}')){
      text=text.replace(
        /(\{\{name\}\},\s*\(Emp Code:\{\{employeeCode\}\}\))\s*\(hereinafter referred to as the "Employee"\),\s*of the SECOND PART\./i,
        '{{name}}, (Emp Code:{{employeeCode}}) (Aadhaar No.:{{aadhaar}}) (UAN:{{uan}}) (hereinafter referred to as the "Employee"), of the SECOND PART.'
      );
    }
  }
  if(!/Employee ID<\/th>\s*<td>\{\{employeeCode\}\}/i.test(text)&&text.includes('Annexure III')){
    text=text.replace(
      /(<div class="letter-title">Annexure III[\s\S]*?<table class="ctc-table">\s*)<tr><th>Name of the Employee<\/th><td>\{\{name\}\}<\/td><th>Designation<\/th><td>\{\{role\}\}<\/td><\/tr>/i,
      '$1<tr><th>Name of the Employee</th><td>{{name}}</td><th>Employee ID</th><td>{{employeeCode}}</td></tr>\n    <tr><th>Company</th><td>{{companyName}}</td><th>Designation</th><td>{{role}}</td></tr>'
    );
  }
  if(!text.includes('letter-logo-header')||!text.includes('{{logoUrl}}')){
    text=text.replace(
      /<div class="letter-section">/g,
      '<div class="letter-section">\n  <div class="letter-logo-header"><img class="letter-logo" src="{{logoUrl}}" alt="{{companyName}}"></div>'
    );
    // Avoid duplicate headers if some sections already had one
    text=text.replace(
      /(<div class="letter-logo-header">[\s\S]*?<\/div>\s*){2,}/g,
      '<div class="letter-logo-header"><img class="letter-logo" src="{{logoUrl}}" alt="{{companyName}}"></div>\n  '
    );
  }
  return text;
}

function getAppointmentLetterTemplate(){
  store.appointmentLetterTemplates=store.appointmentLetterTemplates||{};
  const companyId=appointmentTemplateCompanyId();
  let saved=store.appointmentLetterTemplates[companyId];
  if(typeof saved==='string'&&saved.trim()){
    const normalized=normalizeAppointmentLetterTemplate(saved);
    if(normalized!==saved){
      store.appointmentLetterTemplates[companyId]=normalized;
      saveStore();
    }
    return normalized;
  }
  return defaultAppointmentLetterTemplate();
}

function fillAppointmentTemplate(template,values=appointmentDraftValues()){
  const logoUrl=appointmentLogoUrl();
  const map={
    name:safeText(values.name),
    employeeCode:safeText(values.employeeCode),
    aadhaar:safeText(values.aadhaar),
    uan:safeText(values.uan),
    role:safeText(values.role),
    ctc:safeText(values.ctc),
    date:safeText(values.date),
    longDate:safeText(appointmentLetterLongDate(values.date)),
    firstName:safeText(appointmentLetterFirstName(values.name)),
    supportEmail:safeText(COMPANY.supportEmail||'hr@vayana.com'),
    companyName:safeText(values.companyName||COMPANY.companyName||''),
    logoUrl,
    businessUnit:safeText(values.businessUnit),
    functionName:safeText(values.functionName),
    reportingManager:safeText(values.reportingManager),
    location:safeText(values.location),
    basicMonthly:safeText(values.basicMonthly),
    basicAnnual:safeText(values.basicAnnual),
    hraMonthly:safeText(values.hraMonthly),
    hraAnnual:safeText(values.hraAnnual),
    bonusMonthly:safeText(values.bonusMonthly),
    bonusAnnual:safeText(values.bonusAnnual),
    specialMonthly:safeText(values.specialMonthly),
    specialAnnual:safeText(values.specialAnnual),
    grossMonthly:safeText(values.grossMonthly),
    grossAnnual:safeText(values.grossAnnual),
    erPfMonthly:safeText(values.erPfMonthly),
    erPfAnnual:safeText(values.erPfAnnual),
    erEsicMonthly:safeText(values.erEsicMonthly),
    erEsicAnnual:safeText(values.erEsicAnnual),
    eePfMonthly:safeText(values.eePfMonthly),
    eePfAnnual:safeText(values.eePfAnnual),
    eeEsicMonthly:safeText(values.eeEsicMonthly),
    eeEsicAnnual:safeText(values.eeEsicAnnual),
    ctcMonthly:safeText(values.ctcMonthly)
  };
  return String(template||'').replace(/\{\{(\w+)\}\}/g,(_,key)=>Object.prototype.hasOwnProperty.call(map,key)?map[key]:'');
}

function appointmentHtmlToTemplate(html,values=appointmentDraftValues()){
  const longDate=appointmentLetterLongDate(values.date);
  const firstName=appointmentLetterFirstName(values.name);
  const logoUrl=appointmentLogoUrl();
  html=unwrapAppointmentLetterHtml(html);
  const pairs=[
    [logoUrl,'{{logoUrl}}'],
    [values.name,'{{name}}'],
    [safeText(values.name),'{{name}}'],
    [values.employeeCode,'{{employeeCode}}'],
    [safeText(values.employeeCode),'{{employeeCode}}'],
    [values.aadhaar,'{{aadhaar}}'],
    [safeText(values.aadhaar),'{{aadhaar}}'],
    [values.uan,'{{uan}}'],
    [safeText(values.uan),'{{uan}}'],
    [values.role,'{{role}}'],
    [safeText(values.role),'{{role}}'],
    [values.ctc,'{{ctc}}'],
    [safeText(values.ctc),'{{ctc}}'],
    [longDate,'{{longDate}}'],
    [safeText(longDate),'{{longDate}}'],
    [firstName,'{{firstName}}'],
    [safeText(firstName),'{{firstName}}'],
    [COMPANY.supportEmail||'hr@vayana.com','{{supportEmail}}'],
    [safeText(COMPANY.supportEmail||'hr@vayana.com'),'{{supportEmail}}'],
    [values.companyName,'{{companyName}}'],
    [safeText(values.companyName),'{{companyName}}'],
    [values.businessUnit,'{{businessUnit}}'],
    [values.functionName,'{{functionName}}'],
    [values.reportingManager,'{{reportingManager}}'],
    [values.location,'{{location}}'],
    [values.basicMonthly,'{{basicMonthly}}'],
    [values.basicAnnual,'{{basicAnnual}}'],
    [values.hraMonthly,'{{hraMonthly}}'],
    [values.hraAnnual,'{{hraAnnual}}'],
    [values.bonusMonthly,'{{bonusMonthly}}'],
    [values.bonusAnnual,'{{bonusAnnual}}'],
    [values.specialMonthly,'{{specialMonthly}}'],
    [values.specialAnnual,'{{specialAnnual}}'],
    [values.grossMonthly,'{{grossMonthly}}'],
    [values.grossAnnual,'{{grossAnnual}}'],
    [values.erPfMonthly,'{{erPfMonthly}}'],
    [values.erPfAnnual,'{{erPfAnnual}}'],
    [values.erEsicMonthly,'{{erEsicMonthly}}'],
    [values.erEsicAnnual,'{{erEsicAnnual}}'],
    [values.eePfMonthly,'{{eePfMonthly}}'],
    [values.eePfAnnual,'{{eePfAnnual}}'],
    [values.eeEsicMonthly,'{{eeEsicMonthly}}'],
    [values.eeEsicAnnual,'{{eeEsicAnnual}}'],
    [values.ctcMonthly,'{{ctcMonthly}}']
  ].filter(([from])=>from&&!String(from).startsWith('['));
  pairs.sort((a,b)=>String(b[0]).length-String(a[0]).length);
  let out=String(html||'');
  const seen=new Set();
  pairs.forEach(([from,token])=>{
    if(seen.has(from)) return;
    seen.add(from);
    out=out.split(from).join(token);
  });
  out=out.replace(/src="[^"]*Vayana-Logo\.svg[^"]*"/gi,'src="{{logoUrl}}"');
  out=out.replace(/src='[^']*Vayana-Logo\.svg[^']*'/gi,"src='{{logoUrl}}'");
  return out;
}

function syncAppointmentDraftEditButtons(){
  const editBtn=document.getElementById('apptEditBtn');
  const saveBtn=document.getElementById('apptSaveDraftBtn');
  const cancelBtn=document.getElementById('apptCancelEditBtn');
  const toolbar=document.getElementById('apptFormatToolbar');
  if(editBtn) editBtn.style.display=appointmentDraftEditing?'none':'inline-flex';
  if(saveBtn) saveBtn.style.display=appointmentDraftEditing?'inline-flex':'none';
  if(cancelBtn) cancelBtn.style.display=appointmentDraftEditing?'inline-flex':'none';
  if(toolbar) toolbar.hidden=!appointmentDraftEditing;
}

window.formatAppointmentDraft=function(command,value=null){
  const sheet=appointmentLetterSheetEl();
  if(!sheet||!appointmentDraftEditing) return;
  sheet.focus();
  let arg=value;
  if(command==='formatBlock'){
    arg=value?`<${value}>`:undefined;
  }
  if(command==='createLink'){
    const url=window.prompt('Enter link URL','https://');
    if(!url) return;
    arg=url;
  }
  if(command==='hiliteColor'||command==='backColor'){
    try{
      document.execCommand('styleWithCSS',false,true);
      document.execCommand('hiliteColor',false,arg);
    }catch(err){
      document.execCommand('backColor',false,arg);
    }
    return;
  }
  try{
    document.execCommand('styleWithCSS',false,true);
    document.execCommand(command,false,arg);
  }catch(err){
    console.error('Format command failed:',command,err);
  }
};

window.toggleAppointmentDraftEdit=function(enable){
  const preview=document.getElementById('appointmentLetterPreview');
  const sheet=appointmentLetterSheetEl();
  const pages=appointmentLetterPagesEl();
  const toolbar=document.getElementById('apptFormatToolbar');
  if(!preview||!sheet) return;
  if(enable&&typeof goSubtab==='function') goSubtab('documents','preview');
  appointmentDraftEditing=Boolean(enable);
  preview.classList.toggle('is-editing',appointmentDraftEditing);
  if(appointmentDraftEditing){
    if(pages) pages.hidden=true;
    sheet.hidden=false;
    sheet.innerHTML=appointmentLetterBodyHtml();
    sheet.contentEditable='true';
    sheet.spellcheck=true;
  }else{
    sheet.contentEditable='false';
    sheet.hidden=true;
    if(pages) pages.hidden=false;
  }
  if(toolbar&&!toolbar.dataset.bound){
    toolbar.addEventListener('mousedown',e=>{
      if(e.target.closest('button,select,input')) e.preventDefault();
    });
    toolbar.dataset.bound='1';
  }
  syncAppointmentDraftEditButtons();
  if(!appointmentDraftEditing) renderAppointmentLetterPreview();
  else{
    sheet.focus();
    toast('Editing continuous draft — Save to refresh Word page layout');
  }
};

window.saveAppointmentLetterDraft=function(){
  const sheet=appointmentLetterSheetEl();
  if(!sheet) return;
  const template=appointmentHtmlToTemplate(sheet.innerHTML,appointmentDraftValues());
  if(!template.trim()){toast('Draft cannot be empty');return;}
  const companyId=appointmentTemplateCompanyId();
  store.appointmentLetterTemplates=store.appointmentLetterTemplates||{};
  store.appointmentLetterTemplates[companyId]=template;
  saveStore();
  appointmentDraftEditing=false;
  sheet.contentEditable='false';
  sheet.hidden=true;
  document.getElementById('appointmentLetterPreview')?.classList.remove('is-editing');
  const pages=appointmentLetterPagesEl();
  if(pages) pages.hidden=false;
  syncAppointmentDraftEditButtons();
  updateAppointmentTemplateStatus();
  renderAppointmentLetterPreview();
  toast(`Draft wording saved for ${companyLabelById(companyId)}`);
};

window.resetAppointmentLetterDraft=function(){
  if(appointmentDraftEditing) toggleAppointmentDraftEdit(false);
  const companyId=appointmentTemplateCompanyId();
  store.appointmentLetterTemplates=store.appointmentLetterTemplates||{};
  delete store.appointmentLetterTemplates[companyId];
  saveStore();
  updateAppointmentTemplateStatus();
  renderAppointmentLetterPreview();
  toast(`Draft reset to default for ${companyLabelById(companyId)}`);
};

window.fillAppointmentDraftFromEmployee=function(){
  if(appointmentDraftEditing) return;
  const apptSelect=document.getElementById('apptEmp');
  const employee=employeeById(apptSelect?.value);
  if(!employee){
    if(apptSelect) apptSelect.dataset.filledEmpId='';
    updateAppointmentTemplateStatus();
    renderAppointmentLetterPreview();
    return;
  }
  const templateSelect=document.getElementById('apptTemplateCompany');
  if(templateSelect&&!templateSelect.disabled&&employee.companyId){
    const cid=resolveCompanyId(employee.companyId);
    if([...templateSelect.options].some(opt=>opt.value===cid)) templateSelect.value=cid;
  }
  document.getElementById('apptName').value=employee.name||'';
  document.getElementById('apptEmpId').value=employee.employeeCode||'';
  document.getElementById('apptRole').value=employee.role||employee.designation||'';
  const aadhaarEl=document.getElementById('apptAadhaar');
  if(aadhaarEl) aadhaarEl.value=employee.aadhaar||employee.aadhar||employee.aadhaarNumber||'';
  const uanEl=document.getElementById('apptUan');
  if(uanEl) uanEl.value=employee.uan||employee.uanNumber||'';
  const companyEl=document.getElementById('apptCompany');
  if(companyEl) companyEl.value=employeeCompanyName(employee)||companyNameById(employee.companyId)||'';
  const ctcEl=document.getElementById('apptCtc');
  if(ctcEl) ctcEl.value=employee.ctc||'';
  if(!document.getElementById('apptDate')?.value) document.getElementById('apptDate').value=employee.dateOfJoining||new Date().toISOString().slice(0,10);
  const managerEl=document.getElementById('apptManager');
  if(managerEl) managerEl.value=employee.manager||employee.reportingManager||'';
  const locEl=document.getElementById('apptLocation');
  if(locEl) locEl.value=employee.location||employee.reportingPlace||locEl.value||'Pune';
  const mirror=document.getElementById('apptCtcMirror');
  if(mirror) mirror.value=document.getElementById('apptCtc')?.value||'';
  if(apptSelect) apptSelect.dataset.filledEmpId=employee.id;
  updateAppointmentTemplateStatus();
  renderAppointmentLetterPreview();
};

window.renderAppointmentLetterPreview=function(){
  if(appointmentDraftEditing) return;
  const preview=document.getElementById('appointmentLetterPreview');
  const sheet=appointmentLetterSheetEl();
  const pages=appointmentLetterPagesEl();
  if(!preview) return;
  preview.classList.remove('is-editing');
  if(sheet){
    sheet.contentEditable='false';
    sheet.hidden=true;
  }
  if(pages){
    pages.hidden=false;
    pages.innerHTML=buildAppointmentLetterPagesHtml();
  }else if(sheet){
    sheet.hidden=false;
    sheet.innerHTML=appointmentLetterBodyHtml();
  }
  syncAppointmentDraftEditButtons();
};

function printHtmlDocument(html,blockedToast='Allow pop-ups to print'){
  const runPrint=(win,cleanup)=>{
    let started=false;
    let done=false;
    const finish=()=>{
      if(done) return;
      done=true;
      try{cleanup?.();}catch(_e){}
    };
    const trigger=()=>{
      if(started) return;
      started=true;
      try{
        win.focus();
        win.print();
      }catch(_err){
        finish();
        return;
      }
      try{win.addEventListener('afterprint',finish,{once:true});}catch(_e){}
      setTimeout(finish,2000);
    };
    const doc=win.document;
    const imgs=[...doc.images];
    if(!imgs.length||imgs.every(img=>img.complete)){
      setTimeout(trigger,120);
      return;
    }
    let left=imgs.length;
    const mark=()=>{
      left-=1;
      if(left<=0) setTimeout(trigger,80);
    };
    imgs.forEach(img=>{
      if(img.complete) mark();
      else{
        img.addEventListener('load',mark,{once:true});
        img.addEventListener('error',mark,{once:true});
      }
    });
    setTimeout(()=>{if(!done) trigger();},2500);
  };
  try{
    const iframe=document.createElement('iframe');
    iframe.setAttribute('aria-hidden','true');
    iframe.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const doc=iframe.contentDocument||iframe.contentWindow?.document;
    if(!doc){
      iframe.remove();
    }else{
      doc.open();
      doc.write(html);
      doc.close();
      runPrint(iframe.contentWindow,()=>iframe.remove());
      return;
    }
  }catch(_err){}
  const win=window.open('','_blank','width=900,height=700');
  if(!win){toast(blockedToast);return;}
  win.document.open();
  win.document.write(html);
  win.document.close();
  runPrint(win,()=>{});
}

window.printAppointmentLetter=function(){
  const values=appointmentDraftValues();
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Appointment Letter - ${safeText(values.name)}</title>
  <style>${appointmentLetterStyles()}</style></head><body>${buildAppointmentLetterPagesHtml(values)}</body></html>`;
  printHtmlDocument(html,'Allow pop-ups to print the letter');
};

window.saveAppointmentLetterToEmployee=async function(){
  const empId=document.getElementById('apptEmp')?.value;
  const employee=employeeById(empId);
  if(!employee){toast('Select an employee');return;}
  if(!assertEmployeeInHrScope(employee,'issue letters for')) return;
  const values=appointmentDraftValues();
  if(!values.name||values.name.startsWith('[')){toast('Enter employee name');return;}
  if(!values.employeeCode||values.employeeCode.startsWith('[')){toast('Enter employee ID');return;}
  if(!values.companyName||values.companyName.startsWith('[')){toast('Enter company name');return;}
  if(!values.role||values.role.startsWith('[')){toast('Enter role / designation');return;}
  if(!values.ctc||values.ctc.startsWith('[')){toast('Enter CTC');return;}
  const previousCtc=parseCtcAmount(employee.ctc);
  const nextCtc=parseCtcAmount(values.ctc);
  if(nextCtc>0&&nextCtc!==previousCtc){
    try{
      recordEmployeeSalaryChange(employee,{
        type:previousCtc>0?'correction':'joining',
        newCtc:nextCtc,
        effectiveDate:values.date||new Date().toISOString().slice(0,10),
        notes:'Updated from appointment letter'
      });
    }catch(err){
      employee.ctc=values.ctc;
    }
  }else{
    employee.ctc=values.ctc;
  }
  employee.documents=employee.documents||[];
  const fileName=`Appointment-Letter-${values.employeeCode}.html`;
  const fullHtml=`<!doctype html><html><head><meta charset="utf-8"><title>Appointment Letter - ${safeText(values.name)}</title>
  <style>${appointmentLetterStyles()}</style></head>
  <body>${buildAppointmentLetterPagesHtml(values)}</body></html>`;
  const fileData=`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
  employee.documents.push({
    id:`doc-${Date.now()}`,
    type:'appointment',
    title:`Appointment Letter - ${values.name}`,
    fileName,
    fileData,
    uploadedAt:new Date().toISOString(),
    uploadedBy:currentUser?.name||'HR',
    meta:{employeeCode:values.employeeCode,role:values.role,ctc:values.ctc,appointmentDate:values.date}
  });
  saveStore();
  renderAdminDocuments();
  scheduleEmployeeSheetPush('appointment-ctc');
  toast('Appointment letter saved to employee documents. Sending email...');
  await notifyAppointmentLetterReady(employee);
};

window.addEmployeeDocument=async function(){
  const empId=document.getElementById('docEmp')?.value;
  const employee=employeeById(empId);
  const type=document.getElementById('docType')?.value||'offer';
  const title=document.getElementById('docTitle')?.value.trim()||docTypeLabel(type);
  const file=document.getElementById('docFile')?.files[0];
  if(!employee){toast('Select an employee');return;}
  if(!assertEmployeeInHrScope(employee,'upload documents for')) return;
  if(!file){toast('Upload a document file');return;}
  if(file.size>3*1024*1024){toast('Document must be under 3 MB');return;}
  const fileData=await fileToDataUrl(file);
  employee.documents=employee.documents||[];
  employee.documents.push({id:`doc-${Date.now()}`,type,title,fileName:file.name,fileData,uploadedAt:new Date().toISOString(),uploadedBy:currentUser?.name||'HR'});
  document.getElementById('docTitle').value='';
  document.getElementById('docFile').value='';
  saveStore();
  renderAdminDocuments();
  toast('Document added');
  if(type==='appointment') await notifyAppointmentLetterReady(employee);
};
window.deleteEmployeeDocument=function(empId,docId){
  const employee=employeeById(empId);
  if(!employee) return;
  employee.documents=(employee.documents||[]).filter(doc=>doc.id!==docId);
  saveStore();
  renderAdminDocuments();
  toast('Document removed');
};
/* Employee Document Generator — plug real templates into EMPLOYEE_DOC_TEMPLATES later */
const EMPLOYEE_DOC_TEMPLATES={
  loan:{
    id:'loan',
    label:'Loan document',
    fields:[
      {key:'employeeName',label:'Employee name',type:'text'},
      {key:'employeeCode',label:'Employee code',type:'text'},
      {key:'amount',label:'Loan amount (₹)',type:'text',placeholder:'e.g. 50,000'},
      {key:'purpose',label:'Purpose / remarks',type:'textarea',placeholder:'Brief purpose of the loan'},
      {key:'date',label:'Date',type:'date'}
    ],
    buildHtml(values){
      const company=safeText(values.companyName||COMPANY.companyName||'Company');
      const portal=safeText(COMPANY.portalName||'Interlace');
      const name=safeText(values.employeeName||'');
      const code=safeText(values.employeeCode||'');
      const amount=safeText(values.amount||'');
      const purpose=safeText(values.purpose||'');
      const date=safeText(values.date||'');
      return `<div class="emp-doc-body">
  <p class="emp-doc-draft">DRAFT / template pending — placeholder wording only. Final loan document text will be provided later.</p>
  <h1>Loan document</h1>
  <p class="emp-doc-meta">${portal} · ${company}</p>
  <p>Date: <strong>${date||'—'}</strong></p>
  <p>This is a draft loan document for <strong>${name||'—'}</strong> (Employee code: <strong>${code||'—'}</strong>).</p>
  <p>Requested loan amount: <strong>₹ ${amount||'—'}</strong></p>
  <p>Purpose / remarks:</p>
  <p>${purpose?purpose.replace(/\n/g,'<br>'):'—'}</p>
  <p>I acknowledge that this draft is for preview only and is not a final approved loan agreement until HR issues the official template.</p>
  <div class="emp-doc-sign">
    <p>Employee signature: ____________________</p>
    <p>Name: ${name||'—'}</p>
    <p>Date: ${date||'—'}</p>
  </div>
</div>`;
    }
  },
  experience:{
    id:'experience',
    label:'Experience letter (placeholder)',
    fields:[
      {key:'employeeName',label:'Employee name',type:'text'},
      {key:'employeeCode',label:'Employee code',type:'text'},
      {key:'role',label:'Designation',type:'text'},
      {key:'date',label:'Date',type:'date'},
      {key:'purpose',label:'Notes',type:'textarea',placeholder:'Optional notes'}
    ],
    buildHtml(values){
      const company=safeText(values.companyName||COMPANY.companyName||'Company');
      const portal=safeText(COMPANY.portalName||'Interlace');
      const name=safeText(values.employeeName||'');
      const code=safeText(values.employeeCode||'');
      const role=safeText(values.role||'');
      const date=safeText(values.date||'');
      const notes=safeText(values.purpose||'');
      return `<div class="emp-doc-body">
  <p class="emp-doc-draft">DRAFT / template pending — placeholder wording only.</p>
  <h1>Experience letter</h1>
  <p class="emp-doc-meta">${portal} · ${company}</p>
  <p>Date: <strong>${date||'—'}</strong></p>
  <p>This draft confirms that <strong>${name||'—'}</strong> (Employee code: <strong>${code||'—'}</strong>) has been associated with ${company} in the capacity of <strong>${role||'—'}</strong>.</p>
  ${notes?`<p>Notes: ${notes.replace(/\n/g,'<br>')}</p>`:''}
  <p>Official experience-letter wording will replace this placeholder later.</p>
</div>`;
    }
  }
};

function employeeDocTemplate(id){
  return EMPLOYEE_DOC_TEMPLATES[id]||EMPLOYEE_DOC_TEMPLATES.loan;
}

function employeeDocDefaultValues(employee){
  const e=employee||employeeById(currentUser?.id)||{};
  return {
    employeeName:e.name||'',
    employeeCode:e.employeeCode||'',
    amount:'',
    purpose:'',
    role:e.role||e.designation||'',
    date:new Date().toISOString().slice(0,10),
    companyName:employeeCompanyName(e)||companyNameById(e.companyId)||COMPANY.companyName||''
  };
}

function employeeDocFieldValue(key){
  const el=document.getElementById('empDocField_'+key);
  return el?String(el.value||'').trim():'';
}

function employeeDocFormValues(){
  const typeId=document.getElementById('empDocType')?.value||'loan';
  const tpl=employeeDocTemplate(typeId);
  const employee=employeeById(currentUser?.id);
  const defaults=employeeDocDefaultValues(employee);
  const values={...defaults};
  (tpl.fields||[]).forEach(f=>{values[f.key]=employeeDocFieldValue(f.key);});
  values.companyName=defaults.companyName;
  return {typeId,tpl,values};
}

function employeeDocStyles(){
  return `body{margin:0;padding:24px;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.55;background:#fff}
.emp-doc-body{max-width:720px;margin:0 auto}
.emp-doc-draft{background:#fff3bf;border:1px solid #e8d48b;padding:8px 10px;font-size:12px;margin:0 0 16px}
.emp-doc-body h1{font-size:20pt;margin:0 0 8px;text-align:center;text-transform:uppercase;letter-spacing:.03em}
.emp-doc-meta{text-align:center;color:#555;margin:0 0 18px;font-size:11pt}
.emp-doc-sign{margin-top:32px}
@media print{body{padding:12mm}}`;
}

function employeeDocFullHtml(tpl,values){
  const title=safeText(tpl.label||'Document');
  const name=safeText(values.employeeName||'Employee');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} - ${name}</title>
<style>${employeeDocStyles()}</style></head><body>${tpl.buildHtml(values)}</body></html>`;
}

window.renderEmployeeDocGenerator=function(){
  const employee=employeeById(currentUser?.id);
  if(!employee){toast('Employee session required');return;}
  const select=document.getElementById('empDocType');
  const fieldsWrap=document.getElementById('empDocFields');
  if(!select||!fieldsWrap) return;
  const current=select.value||'loan';
  select.innerHTML=Object.values(EMPLOYEE_DOC_TEMPLATES).map(t=>`<option value="${t.id}" ${t.id===current?'selected':''}>${safeText(t.label)}</option>`).join('')
    +`<option value="" disabled>More templates coming soon</option>`;
  if(!EMPLOYEE_DOC_TEMPLATES[select.value]) select.value='loan';
  onEmployeeDocTypeChange();
};

window.onEmployeeDocTypeChange=function(){
  const employee=employeeById(currentUser?.id);
  const typeId=document.getElementById('empDocType')?.value||'loan';
  const tpl=employeeDocTemplate(typeId);
  const defaults=employeeDocDefaultValues(employee);
  const fieldsWrap=document.getElementById('empDocFields');
  if(!fieldsWrap) return;
  const rows=[];
  const fields=tpl.fields||[];
  for(let i=0;i<fields.length;i+=2){
    const a=fields[i], b=fields[i+1];
    if(a?.type==='textarea'||b?.type==='textarea'){
      [a,b].filter(Boolean).forEach(f=>{
        const val=safeText(defaults[f.key]??'');
        if(f.type==='textarea'){
          rows.push(`<div class="fi"><label for="empDocField_${f.key}">${safeText(f.label)}</label><textarea id="empDocField_${f.key}" rows="3" placeholder="${safeText(f.placeholder||'')}">${val}</textarea></div>`);
        }else{
          rows.push(`<div class="fi"><label for="empDocField_${f.key}">${safeText(f.label)}</label><input id="empDocField_${f.key}" type="${f.type||'text'}" value="${val}" placeholder="${safeText(f.placeholder||'')}"></div>`);
        }
      });
    }else if(b){
      rows.push(`<div class="fg2">${[a,b].map(f=>`<div class="fi"><label for="empDocField_${f.key}">${safeText(f.label)}</label><input id="empDocField_${f.key}" type="${f.type||'text'}" value="${safeText(defaults[f.key]??'')}" placeholder="${safeText(f.placeholder||'')}"></div>`).join('')}</div>`);
    }else{
      rows.push(`<div class="fi"><label for="empDocField_${a.key}">${safeText(a.label)}</label><input id="empDocField_${a.key}" type="${a.type||'text'}" value="${safeText(defaults[a.key]??'')}" placeholder="${safeText(a.placeholder||'')}"></div>`);
    }
  }
  fieldsWrap.innerHTML=rows.join('');
  const empty=document.getElementById('empDocPreviewEmpty');
  const sheet=document.getElementById('empDocSheet');
  if(empty) empty.hidden=false;
  if(sheet){sheet.hidden=true;sheet.innerHTML='';}
};

window.previewEmployeeDoc=function(){
  const {tpl,values}=employeeDocFormValues();
  if(!values.employeeName){toast('Enter employee name');return;}
  const empty=document.getElementById('empDocPreviewEmpty');
  const sheet=document.getElementById('empDocSheet');
  if(empty) empty.hidden=true;
  if(sheet){
    sheet.hidden=false;
    sheet.innerHTML=tpl.buildHtml(values);
  }
  const saved=saveGeneratedEmployeeDocument(tpl,values);
  toast(saved?'Preview updated and saved to My documents':'Preview updated');
};

window.downloadEmployeeDoc=function(){
  const {tpl,values}=employeeDocFormValues();
  if(!values.employeeName){toast('Enter employee name');return;}
  saveGeneratedEmployeeDocument(tpl,values);
  const fullHtml=employeeDocFullHtml(tpl,values);
  const blob=new Blob([fullHtml],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const code=(values.employeeCode||'employee').replace(/[^\w-]+/g,'_');
  a.href=url;
  a.download=`${tpl.id}-${code}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
  toast('Downloaded and saved to My documents');
};

window.printEmployeeDoc=function(){
  const {tpl,values}=employeeDocFormValues();
  if(!values.employeeName){toast('Enter employee name');return;}
  saveGeneratedEmployeeDocument(tpl,values);
  printHtmlDocument(employeeDocFullHtml(tpl,values),'Allow pop-ups to print the document');
};

function saveGeneratedEmployeeDocument(tpl,values){
  const employee=employeeById(currentUser?.id);
  if(!employee||!tpl) return null;
  const fullHtml=employeeDocFullHtml(tpl,values);
  const fileData=`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
  const now=new Date().toISOString();
  const code=(values.employeeCode||'employee').replace(/[^\w-]+/g,'_');
  const fileName=`${tpl.id}-${code}.html`;
  employee.documents=employee.documents||[];
  const recent=employee.documents.find(d=>isGeneratedEmployeeDocument(d)&&d.templateId===tpl.id&&(Date.now()-new Date(d.uploadedAt||0).getTime())<10*60*1000);
  const payload={
    type:'generated',
    templateId:tpl.id,
    title:tpl.label||'Generated document',
    fileName,
    fileData,
    htmlBody:fullHtml,
    uploadedAt:now,
    generatedAt:now,
    uploadedBy:employee.name||currentUser?.name||'Employee',
    source:'generated',
    generated:true
  };
  if(recent){
    Object.assign(recent,payload);
    try{saveStore();}catch(_err){toast('Could not save to My documents');return null;}
    return recent;
  }
  const doc={id:`doc-gen-${Date.now()}`,...payload};
  employee.documents.push(doc);
  try{saveStore();}catch(_err){
    employee.documents=employee.documents.filter(d=>d.id!==doc.id);
    toast('Could not save to My documents. Browser storage may be full.');
    return null;
  }
  return doc;
}

function employeeDocumentStamp(doc){
  const raw=doc?.generatedAt||doc?.uploadedAt;
  const stamp=formatQueryTime(raw);
  const dateOnly=raw?formatDateOnly(String(raw).slice(0,10))||'':'';
  if(dateOnly&&stamp&&!stamp.toLowerCase().includes(String(dateOnly).toLowerCase().slice(0,6))){
    return `${dateOnly} · ${stamp}`;
  }
  return stamp;
}

function htmlFromDocumentFileData(doc){
  if(doc?.htmlBody) return String(doc.htmlBody);
  const source=String(doc?.fileData||'');
  if(!source.startsWith('data:text/html')) return '';
  const comma=source.indexOf(',');
  if(comma<0) return '';
  const payload=source.slice(comma+1);
  try{
    return source.includes(';base64,')?atob(payload):decodeURIComponent(payload);
  }catch(_err){
    return '';
  }
}

window.previewStoredEmployeeDocument=function(docId){
  const employee=employeeById(currentUser?.id);
  const doc=(employee?.documents||[]).find(d=>d.id===docId);
  const source=employeeDocumentFileHref(doc);
  if(!source){toast('Document is not available');return;}
  repairEmpDocPreviewModal();
  const title=document.getElementById('empStoredDocPreviewTitle');
  const meta=document.getElementById('empStoredDocPreviewMeta');
  const body=document.getElementById('empStoredDocPreviewBody');
  const download=document.getElementById('empStoredDocPreviewDownload');
  if(!title||!body||!download){
    window.open(source,'_blank','noopener');
    return;
  }
  title.textContent=doc.title||doc.fileName||'Document';
  if(meta) meta.textContent=`${doc.fileName||'File'} · ${employeeDocumentStamp(doc)}${doc.uploadedBy?` · ${doc.uploadedBy}`:''}`;
  download.href=employeeDocumentFileHref(doc,{download:true});
  download.download=doc.fileName||`${doc.title||'document'}.html`;
  const fileName=(doc.fileName||'').toLowerCase();
  const mime=(String(source).match(/^data:([^;]+);/)||[])[1]||'';
  const html=htmlFromDocumentFileData(doc);
  if(html||mime.includes('text/html')||fileName.endsWith('.html')||fileName.endsWith('.htm')){
    body.innerHTML=`<iframe class="bvg-preview-frame" title="${safeText(doc.title||'Document preview')}"></iframe>`;
    const frame=body.querySelector('iframe');
    if(frame) frame.srcdoc=html||'<p>Preview unavailable.</p>';
  }else if(mime.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(fileName)){
    body.innerHTML=`<img class="bvg-preview-img" src="${source}" alt="${safeText(doc.title||'Document')} preview">`;
  }else if(mime==='application/pdf'||fileName.endsWith('.pdf')||(doc.fileUrl&&!fileName)){
    body.innerHTML=`<iframe class="bvg-preview-frame" src="${source}" title="${safeText(doc.title||'Document preview')}"></iframe>`;
  }else if(doc.fileUrl){
    body.innerHTML=`<iframe class="bvg-preview-frame" src="${source}" title="${safeText(doc.title||'Document preview')}"></iframe>`;
  }else{
    body.innerHTML=`<div class="empty-state"><i class="ti ti-file-download" aria-hidden="true"></i><strong>Open the download to read this file type.</strong><span>${safeText(doc.fileName||'Document')} · ${employeeDocumentStamp(doc)}</span></div>`;
  }
  openM('mEmpDocPreview');
};

function repairEmpDocPreviewModal(){
  if(document.getElementById('mEmpDocPreview')) return;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg" id="mEmpDocPreview">
    <div class="modal" style="max-width:920px">
      <div class="modal-hd"><span id="empStoredDocPreviewTitle">Document</span> <button class="btn sm" onclick="closeM('mEmpDocPreview')" style="border:none"><i class="ti ti-x" aria-hidden="true"></i></button></div>
      <div class="ri-meta" id="empStoredDocPreviewMeta" style="margin:0 0 10px"></div>
      <div class="bvg-preview-body" id="empStoredDocPreviewBody"></div>
      <div class="modal-foot"><a class="btn pri" id="empStoredDocPreviewDownload" download><i class="ti ti-download" aria-hidden="true"></i> Download</a><button class="btn" onclick="closeM('mEmpDocPreview')">Close</button></div>
    </div>
  </div>`);
  document.getElementById('mEmpDocPreview')?.addEventListener('click',e=>{if(e.target.id==='mEmpDocPreview') closeM('mEmpDocPreview');});
}

const EMP_DOCS_TAB_KEYS={
  salary:'employeeDocsTabVisible_salary',
  myDocs:'employeeDocsTabVisible_my',
  shared:'employeeDocsTabVisible_shared',
  generate:'employeeDocsTabVisible_generate'
};
const EMP_DOCS_TAB_LABELS={
  salary:'My Salary',
  myDocs:'My Documents',
  shared:'Shared Documents',
  generate:'Generate Documents'
};
const EMP_DOCS_TABS=['salary','myDocs','shared','generate'];
const EMP_SALARY_TAB_KEY_LEGACY='employeeSalaryTabVisible';
let employeeDocsActiveTab='';

function isEmployeeDocsTabVisible(tab){
  const key=EMP_DOCS_TAB_KEYS[tab];
  if(!key) return false;
  try{
    if(sessionStorage.getItem(key)==='true') return true;
    // Migrate older salary-only unlock flag for this session
    if(tab==='salary'&&sessionStorage.getItem(EMP_SALARY_TAB_KEY_LEGACY)==='true'){
      sessionStorage.setItem(key,'true');
      return true;
    }
  }catch(_err){/* ignore */}
  return false;
}
function setEmployeeDocsTabVisible(tab,visible){
  const key=EMP_DOCS_TAB_KEYS[tab];
  if(!key) return;
  try{
    sessionStorage.setItem(key,visible?'true':'false');
    if(tab==='salary') sessionStorage.setItem(EMP_SALARY_TAB_KEY_LEGACY,visible?'true':'false');
  }catch(_err){/* ignore */}
}
function isEmployeeSalaryTabVisible(){
  return isEmployeeDocsTabVisible('salary');
}
function unlockedEmployeeDocsTabs(){
  return EMP_DOCS_TABS.filter(tab=>isEmployeeDocsTabVisible(tab));
}
function firstUnlockedEmployeeDocsTab(){
  return unlockedEmployeeDocsTabs()[0]||'';
}

function syncEmployeeDocsTabs(){
  const unlocked=unlockedEmployeeDocsTabs();
  if(employeeDocsActiveTab&&!isEmployeeDocsTabVisible(employeeDocsActiveTab)){
    employeeDocsActiveTab=firstUnlockedEmployeeDocsTab();
  }
  if(!employeeDocsActiveTab&&unlocked.length) employeeDocsActiveTab=unlocked[0];

  const tabsEl=document.getElementById('eDocsTabs');
  if(tabsEl) tabsEl.hidden=!unlocked.length;

  const gate=document.getElementById('eDocsGate');
  const lockedCount=EMP_DOCS_TABS.length-unlocked.length;
  if(gate){
    gate.hidden=lockedCount===0;
    gate.classList.toggle('e-docs-gate-compact',unlocked.length>0&&lockedCount>0);
  }

  EMP_DOCS_TABS.forEach(tab=>{
    const visible=isEmployeeDocsTabVisible(tab);
    const tabBtn=document.getElementById(`eDocsTab-${tab}`);
    const panel=document.getElementById(`eDocsPanel-${tab}`);
    const viewBtn=document.getElementById(`eDocsView-${tab}`);
    const isAct=!!employeeDocsActiveTab&&employeeDocsActiveTab===tab&&visible;
    if(tabBtn){
      tabBtn.hidden=!visible;
      tabBtn.classList.toggle('act',isAct);
      tabBtn.setAttribute('aria-selected',isAct?'true':'false');
    }
    if(panel){
      panel.hidden=!isAct;
      panel.classList.toggle('act',isAct);
    }
    if(viewBtn) viewBtn.hidden=visible;
  });
}

window.switchEmployeeDocsTab=function(tab){
  if(!EMP_DOCS_TABS.includes(tab)||!isEmployeeDocsTabVisible(tab)) return;
  employeeDocsActiveTab=tab;
  syncEmployeeDocsTabs();
  if(tab==='generate'&&typeof renderEmployeeDocGenerator==='function') renderEmployeeDocGenerator();
};

window.viewEmployeeDocsTab=function(tab){
  if(!EMP_DOCS_TABS.includes(tab)) return;
  setEmployeeDocsTabVisible(tab,true);
  employeeDocsActiveTab=tab;
  try{closeM('mProfileView');}catch(_err){/* ignore */}
  openEmployeePage('eDocuments');
  syncEmployeeDocsTabs();
  renderEmployeeDocuments();
  if(tab==='salary'&&typeof renderEmployeeHome==='function') renderEmployeeHome();
  toast(`${EMP_DOCS_TAB_LABELS[tab]} unlocked for this session`);
};

window.hideEmployeeDocsTab=function(tab){
  if(!EMP_DOCS_TABS.includes(tab)) return;
  setEmployeeDocsTabVisible(tab,false);
  if(employeeDocsActiveTab===tab) employeeDocsActiveTab=firstUnlockedEmployeeDocsTab();
  syncEmployeeDocsTabs();
  renderEmployeeDocuments();
  if(tab==='salary'&&typeof renderEmployeeHome==='function') renderEmployeeHome();
  toast(`${EMP_DOCS_TAB_LABELS[tab]} hidden`);
};

window.viewEmployeeSalary=function(){
  viewEmployeeDocsTab('salary');
};

window.hideEmployeeSalary=function(){
  hideEmployeeDocsTab('salary');
};

function renderEmployeeSharedDocuments(){
  const list=document.getElementById('employeeSharedDocList');
  if(!list) return;
  const rows=[];
  const seen=new Set();
  (store.policySources||[]).forEach(src=>{
    if(!src?.fileData) return;
    const key=`source-${src.id||src.fileName}`;
    if(seen.has(key)) return;
    seen.add(key);
    rows.push({
      title:src.fileName||'Shared HR document',
      meta:`Company shared file${src.uploadedAt?` · ${formatQueryTime(src.uploadedAt)}`:''}`,
      summary:'',
      fileName:src.fileName||'document',
      fileData:src.fileData,
      icon:'ti-folder-share'
    });
  });
  list.innerHTML=rows.length?`<div class="document-grid">${rows.map(doc=>`
    <div class="card document-card">
      <div class="card-title" style="margin-bottom:.8rem"><i class="ti ${doc.icon}" aria-hidden="true"></i> ${safeText(doc.title)}</div>
      <div class="document-row compact">
        <div>
          <div class="ri-name">${safeText(doc.fileName)}</div>
          <div class="ri-meta">${safeText(doc.meta)}</div>
          ${doc.summary?`<div class="ri-meta">${safeText(doc.summary)}</div>`:''}
        </div>
        <div class="table-actions">
          ${doc.fileData?`<a class="btn sm" href="${doc.fileData}" download="${safeText(doc.fileName)}" target="_blank" rel="noopener"><i class="ti ti-download" aria-hidden="true"></i> Download</a>`:''}
        </div>
      </div>
    </div>`).join('')}</div>`:'<div class="empty-state">No shared company documents yet. When HR uploads shared files, they appear here.</div>';
}

function personalDocTypeOptionsHtml(selected='aadhaar'){
  return PERSONAL_DOCUMENT_TYPES.map(t=>`<option value="${t.key}"${t.key===selected?' selected':''}>${safeText(t.label)}</option>`).join('');
}

function renderEmployeeDocUploadForm(){
  const typeSelect=document.getElementById('myDocType');
  if(!typeSelect) return;
  const previous=typeSelect.value||'aadhaar';
  typeSelect.innerHTML=personalDocTypeOptionsHtml(previous);
}

function employeeDocRowsHtml(docs,{allowDelete=false,clickPreview=true}={}){
  if(!docs.length) return '<div class="empty-state">No documents uploaded yet.</div>';
  return docs.map(doc=>{
    const stamp=employeeDocumentStamp(doc);
    const href=employeeDocumentFileHref(doc);
    const downloadHref=employeeDocumentFileHref(doc,{download:true});
    const canPreview=Boolean(href);
    return `<div class="document-row compact">
    <div${canPreview&&clickPreview?` role="button" tabindex="0" style="cursor:pointer" onclick="previewStoredEmployeeDocument('${doc.id}')"`:''}>
      <div class="ri-name">${safeText(doc.title||docTypeLabel(doc.type))}</div>
      <div class="ri-meta">${safeText(doc.fileName||'Attached document')} · ${stamp}</div>
      ${isHrEmployeeDocument(doc)?`<div class="ri-meta">${doc.acknowledgedAt?`Acknowledged ${formatQueryTime(doc.acknowledgedAt)}`:'Awaiting acknowledgement'}</div>`:''}
    </div>
    <div class="table-actions">
      ${canPreview?`<button type="button" class="btn sm" onclick="previewStoredEmployeeDocument('${doc.id}')"><i class="ti ti-eye" aria-hidden="true"></i> Preview</button>`:''}
      ${downloadHref?`<a class="btn sm" href="${safeText(downloadHref)}" download="${safeText(doc.fileName||doc.title||docTypeLabel(doc.type))}" target="_blank" rel="noopener"><i class="ti ti-download" aria-hidden="true"></i> Download</a>`:''}
      ${isHrEmployeeDocument(doc)?`<button type="button" class="btn sm ${doc.acknowledgedAt?'':'pri'}" onclick="acknowledgeDocument('${doc.id}')"><i class="ti ti-check" aria-hidden="true"></i> ${doc.acknowledgedAt?'Acknowledged':'Acknowledge'}</button>`:''}
      ${allowDelete&&isPersonalEmployeeDocument(doc)?`<button type="button" class="btn sm" onclick="deleteMyDocument('${doc.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Remove</button>`:''}
    </div>
  </div>`;
  }).join('');
}

window.uploadMyDocument=async function(){
  const employee=employeeById(currentUser?.id);
  const type=document.getElementById('myDocType')?.value||'aadhaar';
  const title=document.getElementById('myDocTitle')?.value.trim()||docTypeLabel(type);
  const file=document.getElementById('myDocFile')?.files?.[0];
  if(!employee){toast('Sign in as an employee to upload documents');return;}
  if(!file){toast('Choose a file to upload');return;}
  if(file.size>3*1024*1024){toast('Document must be under 3 MB');return;}
  const fileData=await fileToDataUrl(file);
  employee.documents=employee.documents||[];
  employee.documents.push({
    id:`doc-${Date.now()}`,
    type,
    title,
    fileName:file.name,
    fileData,
    uploadedAt:new Date().toISOString(),
    uploadedBy:employee.name||currentUser?.name||'Employee',
    source:'employee',
    selfUploaded:true
  });
  const titleInput=document.getElementById('myDocTitle');
  const fileInput=document.getElementById('myDocFile');
  if(titleInput) titleInput.value='';
  if(fileInput) fileInput.value='';
  saveStore();
  renderEmployeeDocuments();
  toast('Document uploaded');
};

window.deleteMyDocument=function(docId){
  const employee=employeeById(currentUser?.id);
  if(!employee) return;
  const doc=(employee.documents||[]).find(d=>d.id===docId);
  if(!doc||!isPersonalEmployeeDocument(doc)){toast('You can only remove your own uploads');return;}
  employee.documents=(employee.documents||[]).filter(d=>d.id!==docId);
  saveStore();
  renderEmployeeDocuments();
  toast('Document removed');
};

window.renderEmployeeDocuments=function(){
  const employee=employeeById(currentUser?.id)||store.employees[0];
  const list=document.getElementById('employeeDocList');
  if(!employee) return;
  syncEmployeeDocsTabs();
  if(typeof ensureEmployeeSalaryHistory==='function') ensureEmployeeSalaryHistory(employee);
  const history=[...(employee.salaryHistory||[])].sort((a,b)=>new Date(b.effectiveDate||b.recordedAt)-new Date(a.effectiveDate||a.recordedAt));
  const prevLabel=history.length>1?displayCtc(history[1]?.newCtc||history[0]?.previousCtc):'—';
  if(document.getElementById('empSalCurrent')) document.getElementById('empSalCurrent').textContent=displayCtc(employee.ctc);
  if(document.getElementById('empSalPrevious')) document.getElementById('empSalPrevious').textContent=prevLabel;
  if(document.getElementById('empSalChanges')) document.getElementById('empSalChanges').textContent=String(history.length);
  const historyBody=document.getElementById('employeeSalaryHistoryBody');
  if(historyBody){
    historyBody.innerHTML=history.length?history.map(h=>`<tr>
      <td>${safeText(h.effectiveDate||'—')}</td>
      <td><span class="badge b-pending">${safeText(h.type||'update')}</span></td>
      <td>${displayCtc(h.previousCtc)}</td>
      <td><strong>${displayCtc(h.newCtc)}</strong></td>
      <td>${parseCtcAmount(h.bonusAmount)>0?displayCtc(h.bonusAmount):'—'}</td>
      <td>${safeText(h.notes||'—')}</td>
      <td>${safeText(formatSalaryEditTime(h.recordedAt))}</td>
    </tr>`).join(''):`<tr><td colspan="7" style="text-align:center;color:var(--color-text-secondary)">No salary history yet.</td></tr>`;
  }
  if(list){
    employee.documents=employee.documents||[];
    const generatedDocs=employee.documents.filter(doc=>isGeneratedEmployeeDocument(doc)).sort((a,b)=>new Date(b.generatedAt||b.uploadedAt)-new Date(a.generatedAt||a.uploadedAt));
    const onboardingDocs=employee.documents.filter(doc=>isOnboardingEmployeeDocument(doc)).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
    const personalDocs=employee.documents.filter(doc=>isPersonalEmployeeDocument(doc)&&!doc.shared);
    const hrDocs=employee.documents.filter(doc=>isHrEmployeeDocument(doc)&&!isGeneratedEmployeeDocument(doc)&&!doc.shared);
    const generatedCard=generatedDocs.length?`<div class="e-docs-subsection"><div class="card-title" style="margin:14px 0 10px"><i class="ti ti-files" aria-hidden="true"></i> Generated documents</div><div class="document-grid"><div class="card document-card"><div class="card-title" style="margin-bottom:.8rem"><i class="ti ti-file-text" aria-hidden="true"></i> From Generate documents</div>${employeeDocRowsHtml(generatedDocs)}</div></div></div>`:'';
    const onboardingCard=`<div class="e-docs-subsection"><div class="card-title" style="margin:14px 0 10px"><i class="ti ti-file-check" aria-hidden="true"></i> Onboarding documents</div><div class="document-grid"><div class="card document-card"><div class="card-title" style="margin-bottom:.8rem"><i class="ti ti-files" aria-hidden="true"></i> Uploaded during onboarding</div>${employeeDocRowsHtml(onboardingDocs)}</div></div></div>`;
    const personalCards=PERSONAL_DOCUMENT_TYPES.map(type=>{
      const docs=personalDocs.filter(doc=>doc.type===type.key).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt));
      return `<div class="card document-card"><div class="card-title" style="margin-bottom:.8rem"><i class="ti ${type.icon}" aria-hidden="true"></i> ${type.label}</div>${employeeDocRowsHtml(docs,{allowDelete:true})}</div>`;
    }).join('');
    const hrCards=hrDocs.length?`<div class="e-docs-subsection"><div class="card-title" style="margin:4px 0 10px"><i class="ti ti-briefcase" aria-hidden="true"></i> From HR</div><div class="document-grid">${DOCUMENT_TYPES.map(type=>{
      const docs=hrDocs.filter(doc=>doc.type===type.key).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt));
      if(!docs.length) return '';
      return `<div class="card document-card"><div class="card-title" style="margin-bottom:.8rem"><i class="ti ${type.icon}" aria-hidden="true"></i> ${type.label}</div>${employeeDocRowsHtml(docs)}</div>`;
    }).join('')}</div></div>`:'';
    list.innerHTML=`<div class="e-docs-upload card">
      <div class="card-title" style="margin-bottom:.8rem"><i class="ti ti-upload" aria-hidden="true"></i> Upload document</div>
      <div class="hint-box" style="margin-top:0;margin-bottom:12px">Add your personal documents here — Aadhaar, PAN, UAN, passport, bank proof, and more. PDF or image files up to 3 MB.</div>
      <div class="fg2">
        <div class="fi"><label for="myDocType">Document type</label><select id="myDocType">${personalDocTypeOptionsHtml()}</select></div>
        <div class="fi"><label for="myDocFile">File</label><input type="file" id="myDocFile" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"></div>
      </div>
      <div class="fi"><label for="myDocTitle">Title (optional)</label><input type="text" id="myDocTitle" placeholder="Defaults to document type"></div>
      <button type="button" class="btn pri" onclick="uploadMyDocument()"><i class="ti ti-upload" aria-hidden="true"></i> Upload document</button>
    </div>
    <div class="e-docs-subsection"><div class="card-title" style="margin:14px 0 10px"><i class="ti ti-folder" aria-hidden="true"></i> My uploads</div><div class="document-grid">${personalCards}</div></div>
    ${onboardingCard}
    ${generatedCard}
    ${hrCards}`;
  }
  renderEmployeeSharedDocuments();
  if(typeof renderEmployeeDocGenerator==='function') renderEmployeeDocGenerator();
  if(employee&&!renderEmployeeDocuments._syncing){
    renderEmployeeDocuments._syncing=true;
    syncOnboardingDocumentsForEmployee(employee).then(changed=>{
      renderEmployeeDocuments._syncing=false;
      if(changed) renderEmployeeDocuments();
    }).catch(()=>{renderEmployeeDocuments._syncing=false;});
  }
};
window.acknowledgeDocument=function(docId){
  const employee=employeeById(currentUser?.id);
  const doc=employee?.documents?.find(d=>d.id===docId);
  if(!doc) return;
  doc.acknowledgedAt=doc.acknowledgedAt||new Date().toISOString();
  saveStore();
  renderEmployeeDocuments();
  renderEmployeeHome();
  toast('Document acknowledged');
};
window.renderEngage=function(){
  const employee=employeeById(currentUser?.id)||store.employees[0];
  if(!employee) return;
  const badges=employeeBadges(employee);
  const badgeList=document.getElementById('badgeList');
  if(badgeList) badgeList.innerHTML=`<div class="badge-grid">${badges.map(b=>`<div class="engage-badge ${b.earned?'earned':''}"><i class="ti ${b.icon}" aria-hidden="true"></i><strong>${b.title}</strong><span>${b.meta}</span></div>`).join('')}</div>`;
  const mood=currentMood(employee);
  const moodBox=document.getElementById('moodPulseBox');
  if(moodBox){
    const selectedMood=moodMeta(mood?.mood);
    moodBox.innerHTML=`<div class="mood-buttons">${MOOD_OPTIONS.map(item=>`<button class="btn sm mood-btn ${mood?.mood===item.key?'pri':''}" onclick="submitMood('${item.key}')"><span class="mood-emoji" aria-hidden="true">${item.emoji}</span><span>${item.label}</span></button>`).join('')}</div><div class="ri-meta mood-status">${mood?`You seem to be feeling ${selectedMood.emoji} ${selectedMood.label} on ${formatQueryTime(mood.createdAt)}`:'Choose how you feel this week.'}</div>`;
  }
  const quizBox=document.getElementById('learningQuizBox');
  const done=new Set(employee.learningCompletions||[]);
  const quiz=ENGAGE_QUIZ.find(q=>!done.has(q.id))||ENGAGE_QUIZ[0];
  if(quizBox) quizBox.innerHTML=`<div class="ri-name">${quiz.title}</div><p class="query-msg">${quiz.question}</p><div class="quiz-options">${quiz.options.map((opt,i)=>`<button class="btn sm" onclick="answerQuiz('${quiz.id}',${i})">${opt}</button>`).join('')}</div><div class="ri-meta" style="margin-top:8px">${done.size}/${ENGAGE_QUIZ.length} lessons completed</div>`;
  const planner=document.getElementById('leavePlannerBox');
  if(planner) planner.innerHTML=`<div class="planner-box"><strong>${leavePlannerSuggestion(employee)}</strong><span>Annual left: ${(employee.leave.annual.t-employee.leave.annual.u)} days</span><button class="btn sm" onclick="openEmployeePage('myLeaves')"><i class="ti ti-calendar-plus" aria-hidden="true"></i> Apply leave</button></div>`;
  renderTeamWall();
};
window.submitMood=function(mood){
  const employee=employeeById(currentUser?.id);
  if(!employee) return;
  const week=new Date().toISOString().slice(0,10);
  store.moodPulse=store.moodPulse||[];
  const existing=store.moodPulse.find(m=>m.empId===employee.id&&m.week===week);
  if(existing){existing.mood=mood;existing.createdAt=new Date().toISOString();}
  else store.moodPulse.push({id:`mood-${Date.now()}`,empId:employee.id,emp:employee.name,week,mood,createdAt:new Date().toISOString()});
  saveStore();
  renderEngage();
  toast('Mood pulse saved');
};
window.answerQuiz=function(quizId,choice){
  const employee=employeeById(currentUser?.id);
  const quiz=ENGAGE_QUIZ.find(q=>q.id===quizId);
  if(!employee||!quiz) return;
  if(choice!==quiz.answer){toast('Try again. Read the option carefully.');return;}
  employee.learningCompletions=[...new Set([...(employee.learningCompletions||[]),quizId])];
  saveStore();
  renderEngage();
  renderEmployeeHome();
  toast('Lesson completed');
};
window.addWallPost=function(){
  const employee=employeeById(currentUser?.id);
  const input=document.getElementById('wallMsg');
  const msg=input?.value.trim();
  if(!employee||!msg){toast('Write a team wall message');return;}
  store.teamWall=store.teamWall||[];
  store.teamWall.unshift({id:`wall-${Date.now()}`,empId:employee.id,emp:employee.name,tag:document.getElementById('wallTag')?.value||'Shoutout',msg,createdAt:new Date().toISOString(),likes:[]});
  input.value='';
  saveStore();
  renderEngage();
  toast('Posted on team wall');
};
window.likeWallPost=function(id){
  const post=(store.teamWall||[]).find(p=>p.id===id);
  const empId=currentUser?.id;
  if(!post||!empId) return;
  post.likes=post.likes||[];
  if(post.likes.includes(empId)){
    toast('Already acknowledged');
    return;
  }
  post.likes=[...post.likes,empId];
  saveStore();
  showHeartPop();
  renderTeamWall();
};
function renderTeamWall(){
  const list=document.getElementById('teamWallList');
  if(!list) return;
  const posts=(store.teamWall||[]).slice(0,8);
  list.innerHTML=posts.length?posts.map(p=>`<div class="wall-post"><div><span class="news-tag">${p.tag}</span><strong>${p.emp}</strong><span>${formatQueryTime(p.createdAt)}</span></div><p>${p.msg}</p><button class="btn sm" onclick="likeWallPost('${p.id}')"><i class="ti ti-heart" aria-hidden="true"></i> ${(p.likes||[]).length}</button></div>`).join(''):'<div class="empty-state">No team wall posts yet.</div>';
}
window.renderAnnouncements=function(){
  const eventList=document.getElementById('adminEventList');
  const newsList=document.getElementById('adminNewsList');
  if(eventList){
    const events=sortedEvents();
    eventList.innerHTML=events.length?events.map(ev=>`<div class="row-item policy-row"><div><div class="ri-name">${ev.title}</div><div class="ri-meta">${formatDateOnly(ev.date)} - ${ev.time||'Time pending'} - ${ev.location||'Location pending'}${ev.companyId&&ev.companyId!==PORTAL_ALL_COMPANIES_ID?` - ${safeText(companyCodeById(ev.companyId))}`:''}</div><div class="query-msg">${ev.desc||'No description added.'}</div></div><button class="btn sm danger" title="Delete event" onclick="deleteCompanyEvent('${ev.id}')"><i class="ti ti-trash" aria-hidden="true"></i></button></div>`).join(''):'<div class="empty-state">No special events published yet.</div>';
  }
  if(newsList){
    const posts=latestNews();
    newsList.innerHTML=posts.length?posts.map(item=>`<div class="row-item policy-row"><div><div class="ri-name">${item.title}</div><div class="ri-meta">${item.tag||'News'} - ${formatDateOnly(item.date)} - Likes ${(item.reactions?.like||[]).length}, Loves ${(item.reactions?.love||[]).length}, Seen ${(item.reactions?.seen||[]).length}${item.companyId&&item.companyId!==PORTAL_ALL_COMPANIES_ID?` - ${safeText(companyCodeById(item.companyId))}`:''}</div><div class="query-msg">${item.body||'No post text added.'}</div></div><button class="btn sm danger" title="Delete news" onclick="deleteCompanyNews('${item.id}')"><i class="ti ti-trash" aria-hidden="true"></i></button></div>`).join(''):'<div class="empty-state">No news posts published yet.</div>';
  }
};
window.addCompanyEvent=function(){
  const title=document.getElementById('eventTitle').value.trim();
  const date=document.getElementById('eventDate').value;
  if(!title||!date){toast('Enter event title and date');return;}
  store.events.push({
    id:`evt-${Date.now()}`,
    title,
    date,
    time:document.getElementById('eventTime').value.trim()||'Time pending',
    location:document.getElementById('eventLocation').value.trim()||'Location pending',
    desc:document.getElementById('eventDesc').value.trim(),
    companyId:writeTargetCompanyId()
  });
  ['eventTitle','eventDate','eventTime','eventLocation','eventDesc'].forEach(id=>document.getElementById(id).value='');
  saveStore();
  renderAnnouncements();
  if(document.getElementById('pg-news')?.classList.contains('act')) renderNewsPortal();
  toast('Event notification published');
};
window.addCompanyNews=function(){
  const title=document.getElementById('newsTitle').value.trim();
  const body=document.getElementById('newsBody').value.trim();
  if(!title||!body){toast('Enter news headline and post');return;}
  store.news.push({
    id:`news-${Date.now()}`,
    title,
    date:document.getElementById('newsDate').value||new Date().toISOString().slice(0,10),
    tag:document.getElementById('newsTag').value.trim()||'News',
    body,
    companyId:writeTargetCompanyId()
  });
  ['newsTitle','newsDate','newsTag','newsBody'].forEach(id=>document.getElementById(id).value='');
  saveStore();
  renderAnnouncements();
  if(document.getElementById('pg-news')?.classList.contains('act')) renderNewsPortal();
  toast('News post published');
};
window.deleteCompanyEvent=function(id){
  store.events=store.events.filter(ev=>ev.id!==id);
  saveStore();
  renderAnnouncements();
  toast('Event removed');
};
window.deleteCompanyNews=function(id){
  store.news=store.news.filter(item=>item.id!==id);
  saveStore();
  renderAnnouncements();
  toast('News removed');
};
function renderLeaveCalendar(e){
  const el=document.getElementById('leaveCalendar');
  if(!el) return;
  const l=e.leave;
  const cells=[
    ['Annual',l.annual.u,l.annual.t,'#534AB7'],
    ['Sick',l.sick.u,l.sick.t,'#1D9E75'],
    ['WFH',l.wfh.u,l.wfh.t,'#BA7517'],
    ['Comp-off',l.comp.u,l.comp.t,'#D4537E']
  ];
  el.innerHTML=`<div class="calendar-grid">${cells.map(([label,used,total,color])=>`<div class="calendar-cell"><span>${label}</span><strong style="color:${color}">${used}</strong><small>${total-used} left</small></div>`).join('')}</div><div class="calendar-note">Used leave days by category for the current year.</div>`;
}
window.togglePolicyFormat=function(){
  return;
};
function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
function resetProfileCropEditor(){
  profileCropState={src:'',x:0,y:0,zoom:1,rotation:0,cropped:''};
  const editor=document.getElementById('profileCropEditor');
  const img=document.getElementById('profileCropImage');
  const zoom=document.getElementById('profileZoom');
  if(editor) editor.style.display='none';
  if(img) img.removeAttribute('src');
  if(zoom) zoom.value='1';
}
function updateProfileCropTransform(){
  const img=document.getElementById('profileCropImage');
  if(!img) return;
  img.style.transform=`translate(calc(-50% + ${profileCropState.x}px), calc(-50% + ${profileCropState.y}px)) scale(${profileCropState.zoom}) rotate(${profileCropState.rotation}deg)`;
}
window.loadProfileCrop=async function(event){
  const file=event.target.files[0];
  if(!file){resetProfileCropEditor();return;}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
    toast('Use a PNG, JPG, or WEBP image');
    event.target.value='';
    resetProfileCropEditor();
    return;
  }
  if(file.size>1024*1024){
    toast('Profile picture must be under 1 MB');
    event.target.value='';
    resetProfileCropEditor();
    return;
  }
  const src=await fileToDataUrl(file);
  profileCropState={src,x:0,y:0,zoom:1,rotation:0,cropped:''};
  const img=document.getElementById('profileCropImage');
  document.getElementById('profileCropEditor').style.display='block';
  document.getElementById('profileZoom').value='1';
  img.src=src;
  updateProfileCropTransform();
  document.getElementById('profilePreview').innerHTML='<span>Adjust the photo, then click Apply crop.</span>';
};
window.setProfileZoom=function(value){
  profileCropState.zoom=Number(value)||1;
  profileCropState.cropped='';
  updateProfileCropTransform();
};
window.nudgeProfileCrop=function(dx,dy){
  profileCropState.x+=dx;
  profileCropState.y+=dy;
  profileCropState.cropped='';
  updateProfileCropTransform();
};
window.rotateProfileCrop=function(deg){
  profileCropState.rotation=(profileCropState.rotation+deg)%360;
  profileCropState.cropped='';
  updateProfileCropTransform();
};
function createProfileCropDataUrl(){
  const img=document.getElementById('profileCropImage');
  const frame=document.getElementById('profileCropFrame');
  if(!img?.src||!frame) return '';
  const out=512;
  const frameSize=frame.clientWidth||180;
  const canvas=document.createElement('canvas');
  canvas.width=out;
  canvas.height=out;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,out,out);
  const scaleToCover=Math.max(out/img.naturalWidth,out/img.naturalHeight)*profileCropState.zoom;
  const offsetScale=out/frameSize;
  ctx.translate(out/2+profileCropState.x*offsetScale,out/2+profileCropState.y*offsetScale);
  ctx.rotate(profileCropState.rotation*Math.PI/180);
  ctx.drawImage(img,-img.naturalWidth*scaleToCover/2,-img.naturalHeight*scaleToCover/2,img.naturalWidth*scaleToCover,img.naturalHeight*scaleToCover);
  return canvas.toDataURL('image/jpeg',0.9);
}
window.applyProfileCrop=function(){
  if(!profileCropState.src){toast('Choose a photo first');return;}
  profileCropState.cropped=createProfileCropDataUrl();
  if(!profileCropState.cropped){toast('Could not crop this image');return;}
  document.getElementById('profilePreview').innerHTML=`<img src="${profileCropState.cropped}" alt="Cropped profile picture"><span>Cropped photo ready.</span>`;
  toast('Crop applied');
};
function resetPolicyForm(){
  ['pN','pDs'].forEach(id=>document.getElementById(id).value='');
  const master=document.getElementById('pMasterDoc');
  if(master) master.value='';
  const preview=document.getElementById('policyTokenPreview');
  if(preview) preview.innerHTML='';
}

function cleanPolicyTitle(title,fallback='Company Policy'){
  const cleaned=String(title||'')
    .replace(/^#+\s*/,'')
    .replace(/^\d+[\).\-\s]+/,'')
    .replace(/^policy\s*[:\-]\s*/i,'')
    .trim();
  return cleaned||fallback;
}

function isPolicyHeading(line){
  const text=line.trim();
  if(!text||text.length>110) return false;
  if(/^[-*•]/.test(text)) return false;
  if(/^(section|chapter|part)?\s*\d+[\).\-\s]+.{3,}$/i.test(text)) return true;
  if(/\bpolicy\b/i.test(text)&&text.split(/\s+/).length<=12) return true;
  if(/^[A-Z0-9\s&/(),.-]{8,}$/.test(text)&&/[A-Z]/.test(text)) return true;
  return false;
}

function tokenizePolicyDocument(text,fallbackName='Company Policy'){
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  const sections=[];
  let current=null;
  lines.forEach(raw=>{
    const line=raw.trim();
    if(isPolicyHeading(line)){
      if(current&&current.body.join('\n').trim()) sections.push(current);
      current={title:cleanPolicyTitle(line,fallbackName),body:[]};
      return;
    }
    if(!current) current={title:fallbackName,body:[]};
    current.body.push(raw);
  });
  if(current&&current.body.join('\n').trim()) sections.push(current);
  const unique=new Map();
  sections.forEach((section,index)=>{
    const title=cleanPolicyTitle(section.title,`${fallbackName} ${index+1}`);
    const desc=section.body.join('\n').replace(/\n{3,}/g,'\n\n').trim();
    if(!desc) return;
    const key=title.toLowerCase();
    const finalTitle=unique.has(key)?`${title} ${index+1}`:title;
    unique.set(finalTitle.toLowerCase(),{name:finalTitle,desc});
  });
  return [...unique.values()];
}

async function extractPolicyMasterText(file,fileData){
  if(/\.(txt|md|csv)$/i.test(file.name)||file.type.startsWith('text/')){
    return await file.text();
  }
  const res=await fetch('/api/extract-policy-document',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fileName:file.name,fileData})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Could not extract text from policy document');
  return data.text||'';
}
function employeeStatusHtml(e){
  const status=String(e?.status||'Active').trim();
  const lower=status.toLowerCase();
  if(lower==='awaiting approval') return '<span class="badge b-pending">Awaiting approval</span>';
  if(lower==='active') return '<span class="badge b-active">Active</span>';
  if(/inactive|left|exited|terminated/i.test(lower)) return '<span class="badge b-archived">Inactive</span>';
  return `<span class="badge b-pending">${safeText(status)}</span>`;
}
function isoTodayLocal(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addCalendarDaysIso(iso,days){
  const d=new Date(`${iso}T00:00:00`);
  if(Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate()+Number(days)||0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function resignationNoticeDays(employee){
  return (typeof isEmployeeCurrentlyOnProbation==='function'&&isEmployeeCurrentlyOnProbation(employee))?30:60;
}
function policyLastWorkingDay(employee,fromDate){
  return addCalendarDaysIso(fromDate||isoTodayLocal(),resignationNoticeDays(employee));
}
function resignationAwaitingManagerLwd(employee){
  const r=employee?.resignationRequest;
  return employeeHasPendingResignation(employee)&&r?.managerApprovalStatus==='pending';
}
function resignationReadyForHr(employee){
  if(!employeeHasPendingResignation(employee)) return false;
  const r=employee.resignationRequest||{};
  if(r.managerApprovalStatus==='pending') return false;
  if(r.managerApprovalStatus==='approved'||r.lwdConfirmed||r.managerApprovalStatus==='not_required') return true;
  return true;
}
function pendingTeamResignationLwdCount(me){
  return employeeDirectReports(me).filter(r=>resignationAwaitingManagerLwd(r)).length;
}

function employeeHasPendingResignation(employee){
  if(!employee) return false;
  if(String(employee.status||'').toLowerCase()==='awaiting approval') return true;
  return employee.resignationRequest?.status==='pending';
}
function pendingResignationEmployees(){
  const visible=new Set((typeof adminVisibleEmployees==='function'?adminVisibleEmployees():store.employees||[]).map(e=>e.id));
  return (store.employees||[]).filter(e=>visible.has(e.id)&&employeeHasPendingResignation(e));
}
function resignationsAwaitingHrApproval(){
  return pendingResignationEmployees().filter(e=>resignationReadyForHr(e));
}

function buildEmployeeMeResignBlock(employee){
  const pendingResign=employeeHasPendingResignation(employee);
  const exitOpen=(store.exitCases||[]).some(c=>c.empId===employee.id&&c.status==='open');
  if(pendingResign){
    const r=employee.resignationRequest||{};
    const waitingMgr=r.managerApprovalStatus==='pending';
    const hint=waitingMgr
      ?'Your preferred last working day is <strong>awaiting manager approval</strong>. HR will see it after your manager confirms the date.'
      :'Your resignation is submitted and <strong>awaiting HR approval</strong>. HR will contact you about next steps.';
    return `<div class="card me-resign-card">
      <div class="card-title" style="margin-bottom:.6rem"><i class="ti ti-hourglass" aria-hidden="true"></i> Resignation status</div>
      <div class="hint-box" style="margin-top:0;margin-bottom:10px">${hint}</div>
      <div class="profile-detail-grid">
        <div><span>Status</span><strong>${employeeStatusHtml(employee)}</strong></div>
        <div><span>Submitted</span><strong>${r.submittedAt?formatQueryTime(r.submittedAt):'—'}</strong></div>
        <div><span>Notice period</span><strong>${r.noticeDays?`${r.noticeDays} days`: '—'}</strong></div>
        <div><span>Last working day</span><strong>${formatDateOnly(r.lastWorkingDay)||'—'}</strong></div>
        <div><span>Date confirmation</span><strong>${r.lwdConfirmed?'Confirmed policy date':(waitingMgr?'Preferred date — manager review':'Manager approved')}</strong></div>
        <div><span>Reason</span><strong>${safeText(r.reason||'—')}</strong></div>
      </div>
    </div>`;
  }
  if(exitOpen){
    return `<div class="card me-resign-card"><div class="hint-box" style="margin:0">Your exit is already in progress with HR.</div></div>`;
  }
  if(typeof ensureEmployeeProbation==='function') ensureEmployeeProbation(employee);
  const onProbation=typeof isEmployeeCurrentlyOnProbation==='function'&&isEmployeeCurrentlyOnProbation(employee);
  const noticeDays=resignationNoticeDays(employee);
  const policyDay=policyLastWorkingDay(employee);
  return `<div class="card me-resign-card">
    <div class="card-title" style="margin-bottom:.6rem"><i class="ti ti-door-exit" aria-hidden="true"></i> Resign</div>
    <div class="hint-box" style="margin-top:0;margin-bottom:12px">Notice period is <strong>${noticeDays} days</strong> ${onProbation?'because you are on probation':'for confirmed employees'}. Last working day is set to <strong>${formatDateOnly(policyDay)}</strong> (${noticeDays} days from today). Confirm that date, or choose another date for manager approval.</div>
    <input type="hidden" id="resignPolicyLastDay" value="${safeText(policyDay)}">
    <div class="fi"><label>Policy last working day</label><div class="hint-box" style="margin:0">${formatDateOnly(policyDay)} · ${noticeDays}-day notice</div></div>
    <div class="fi"><label>Do you confirm this last working day?</label>
      <div class="table-actions" style="gap:16px;margin-top:6px">
        <label class="show-password-control" style="margin:0"><input type="radio" name="resignConfirmLwd" id="resignConfirmLwdYes" value="yes" onchange="syncResignLwdChoice()"> Yes, confirm</label>
        <label class="show-password-control" style="margin:0"><input type="radio" name="resignConfirmLwd" id="resignConfirmLwdNo" value="no" onchange="syncResignLwdChoice()"> No, choose another date</label>
      </div>
    </div>
    <div id="resignPreferredWrap" hidden>
      <div class="fi"><label for="resignLastDay">Preferred last working day</label><input type="date" id="resignLastDay"></div>
    </div>
    <div class="fi"><label for="resignReason">Reason (optional)</label><input type="text" id="resignReason" placeholder="Brief reason for leaving"></div>
    <button type="button" class="btn danger" onclick="submitEmployeeResignation()"><i class="ti ti-door-exit" aria-hidden="true"></i> Submit resignation</button>
  </div>`;
}

window.switchMeSubtab=function(subtabId,btn){
  const page=document.getElementById('pg-me');
  if(!page) return;
  page.querySelectorAll('.me-subtabs .pg-subtab').forEach(tab=>{
    const on=tab.getAttribute('data-subtab')===subtabId;
    tab.classList.toggle('act',on);
    tab.setAttribute('aria-selected',on?'true':'false');
  });
  page.querySelectorAll('.me-subpanel').forEach(panel=>{
    const on=panel.getAttribute('data-subpanel')===subtabId;
    panel.classList.toggle('act',on);
    panel.hidden=!on;
  });
  try{sessionStorage.setItem('hrp_subtab_me',subtabId);}catch(_err){}
  resetPortalScroll();
};

window.renderEmployeeMe=function(){
  const body=document.getElementById('employeeMeBody');
  const employee=employeeById(currentUser?.id);
  if(!body||!employee) return;
  if(typeof ensureEmployeeProbation==='function') ensureEmployeeProbation(employee);
  const overview=employeeDetailOverviewHtml(employee,{selfService:true});
  const otherHtml=empDetailOtherFieldsSection(employee,overview.consumedKeys);
  const assetsHtml=empDetailAssetsSection(employee)||'<div class="empty-state">No assets allocated.</div>';
  const probationHtml=empDetailProbationSection(employee)||'<div class="empty-state">No probation record on file.</div>';
  const historyHtml=empDetailEmploymentHistorySection(employee)||'<div class="empty-state">No employment history yet.</div>';
  const sections=[
    {id:'profile',label:'Profile',html:`<div class="card me-detail-card">${overview.html}${otherHtml}</div>`},
    {id:'salary',label:'Salary',html:`<div class="card me-detail-card">${empDetailSalarySection(employee)}</div>`},
    {id:'documents',label:'Documents',html:`<div class="card me-detail-card">${empDetailDocumentsSection(employee)}</div>`},
    {id:'assets',label:'Assets',html:`<div class="card me-detail-card">${assetsHtml}</div>`},
    {id:'leave',label:'Leave',html:`<div class="card me-detail-card">${empDetailLeaveSection(employee)||'<div class="empty-state">No leave balances on file.</div>'}</div>`},
    {id:'probation',label:'Probation',html:`<div class="card me-detail-card">${probationHtml}</div>`},
    {id:'history',label:'History',html:`<div class="card me-detail-card">${historyHtml}</div>`},
    {id:'resign',label:'Resign',html:buildEmployeeMeResignBlock(employee)}
  ];
  let activeTab='profile';
  try{
    const saved=sessionStorage.getItem('hrp_subtab_me');
    if(saved&&sections.some(s=>s.id===saved)) activeTab=saved;
  }catch(_err){}
  body.innerHTML=`<div class="pg-subtabs me-subtabs" role="tablist" aria-label="Me sections">
    ${sections.map(s=>`<button type="button" class="pg-subtab${s.id===activeTab?' act':''}" data-subtab="${s.id}" role="tab" aria-selected="${s.id===activeTab?'true':'false'}" onclick="switchMeSubtab('${s.id}',this)">${s.label}</button>`).join('')}
  </div>
  ${sections.map(s=>`<div class="pg-subpanel me-subpanel${s.id===activeTab?' act':''}" data-subpanel="${s.id}" role="tabpanel"${s.id===activeTab?'':' hidden'}>${s.html}</div>`).join('')}`;
};

window.syncResignLwdChoice=function(){
  const no=document.getElementById('resignConfirmLwdNo')?.checked;
  const wrap=document.getElementById('resignPreferredWrap');
  if(wrap) wrap.hidden=!no;
};

window.submitEmployeeResignation=function(){
  const employee=employeeById(currentUser?.id);
  if(!employee){toast('Please sign in again');return;}
  if(/inactive|left|exited|terminated/i.test(String(employee.status||''))){toast('Your employment is already inactive');return;}
  if(employeeHasPendingResignation(employee)){toast('Resignation already submitted');return;}
  if((store.exitCases||[]).some(c=>c.empId===employee.id&&c.status==='open')){toast('Exit is already in progress with HR');return;}
  const yes=document.getElementById('resignConfirmLwdYes')?.checked;
  const no=document.getElementById('resignConfirmLwdNo')?.checked;
  if(!yes&&!no){toast('Confirm the last working day, or choose No to pick another date');return;}
  const noticeDays=resignationNoticeDays(employee);
  const policyDay=document.getElementById('resignPolicyLastDay')?.value||policyLastWorkingDay(employee);
  const reason=(document.getElementById('resignReason')?.value||'').trim();
  let lastWorking=policyDay;
  let lwdConfirmed=true;
  let managerApprovalStatus='not_required';
  let preferredLastWorkingDay='';
  if(no){
    lastWorking=(document.getElementById('resignLastDay')?.value||'').trim();
    if(!lastWorking){toast('Choose your preferred last working day');return;}
    preferredLastWorkingDay=lastWorking;
    lwdConfirmed=lastWorking===policyDay;
    managerApprovalStatus=lwdConfirmed?'not_required':'pending';
    if(!confirm(lwdConfirmed
      ?`This matches the policy last working day (${formatDateOnly(policyDay)}). Submit resignation?`
      :`Send preferred last working day ${formatDateOnly(lastWorking)} to your manager for approval?`)) return;
  }else if(!confirm(`Confirm last working day as ${formatDateOnly(policyDay)} (${noticeDays}-day notice) and submit resignation?`)){
    return;
  }
  employee.resignationRequest={
    status:'pending',
    submittedAt:new Date().toISOString(),
    resignationDate:isoTodayLocal(),
    noticeDays,
    policyLastWorkingDay:policyDay,
    lastWorkingDay:lastWorking,
    preferredLastWorkingDay:preferredLastWorkingDay||lastWorking,
    lwdConfirmed,
    managerApprovalStatus,
    reason:reason||'Voluntary resignation'
  };
  employee.status='Awaiting approval';
  if(typeof pushEmploymentHistory==='function'){
    pushEmploymentHistory(employee,{
      type:'resignation_submitted',
      effectiveDate:lastWorking,
      notes:lwdConfirmed
        ?`Employee confirmed ${noticeDays}-day notice last working day ${lastWorking}`
        :`Employee requested preferred last working day ${lastWorking} (policy ${policyDay}) — manager approval required`
    });
  }
  saveStore();
  try{sessionStorage.setItem('hrp_subtab_me','resign');}catch(_err){}
  renderEmployeeMe();
  renderEmployeeHome();
  if(typeof syncTeamLeavesNav==='function') syncTeamLeavesNav();
  toast(managerApprovalStatus==='pending'
    ?'Resignation submitted — preferred last working day sent to your manager'
    :'Resignation submitted with confirmed last working day — awaiting HR');
};

window.decideTeamResignationLwd=function(empId,decision){
  const me=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  const employee=employeeById(empId);
  if(!me||!employee||!resignationAwaitingManagerLwd(employee)){toast('No last working day waiting for you');return;}
  const reports=employeeDirectReports(me);
  if(!reports.some(r=>r.id===employee.id)){toast('You can only action last working day for your direct reports');return;}
  const r=employee.resignationRequest;
  if(decision==='approved'){
    r.managerApprovalStatus='approved';
    r.managerApprovedAt=new Date().toISOString();
    r.managerApprovedBy=me.name;
    r.lastWorkingDay=r.preferredLastWorkingDay||r.lastWorkingDay;
    if(typeof pushEmploymentHistory==='function'){
      pushEmploymentHistory(employee,{type:'resignation_lwd_approved',effectiveDate:r.lastWorkingDay,notes:`Manager approved preferred last working day ${r.lastWorkingDay}`});
    }
    if(typeof syncOpenExitChecklistsForEmployee==='function') syncOpenExitChecklistsForEmployee(employee.id);
  }else{
    const note=prompt('Reason for rejecting this last working day','Please discuss dates with me and resubmit.')||'Rejected';
    if(typeof pushEmploymentHistory==='function'){
      pushEmploymentHistory(employee,{type:'resignation_lwd_rejected',effectiveDate:r.lastWorkingDay,notes:`Manager rejected preferred last working day: ${note}`});
    }
    delete employee.resignationRequest;
    employee.status='Active';
  }
  saveStore();
  renderMyTeamPage();
  renderEmployeeHome();
  if(typeof syncTeamLeavesNav==='function') syncTeamLeavesNav();
  toast(decision==='approved'?'Last working day approved — HR can now prep exit':'Preferred date rejected — employee can resubmit resignation');
};

window.openEmployeeProfileDetails=function(){
  goPage('me');
};
window.openProfileEditFromDetails=function(){
  openEmployeeProfileEditor();
};
window.openEmployeeProfileEditor=function(){
  const employee=employeeById(currentUser?.id);
  if(!employee){toast('Please sign in again');return;}
  document.getElementById('profileDob').value=employee.profile?.dob||'';
  document.getElementById('profileHobbies').value=employee.profile?.hobbies||'';
  document.getElementById('profilePic').value='';
  resetProfileCropEditor();
  document.getElementById('profilePreview').innerHTML=employee.profile?.photo?`<img src="${employee.profile.photo}" alt="Current profile picture">`:'No profile picture selected';
  openM('mProfile');
};
window.saveEmployeeProfile=async function(){
  const employee=employeeById(currentUser?.id);
  if(!employee){toast('Please sign in again');return;}
  employee.profile=employee.profile||{};
  employee.profile.dob=document.getElementById('profileDob').value;
  employee.profile.hobbies=document.getElementById('profileHobbies').value.trim();
  if(profileCropState.src){
    employee.profile.photo=profileCropState.cropped||createProfileCropDataUrl();
  }
  saveStore();
  currentUser=buildUnifiedSession(employee);
  const avatar=document.getElementById('empAvatar');
  if(avatar){
    avatar.outerHTML=avatarHtml(employee,'av av-e');
    document.querySelector('#s-employee .topbar .av, #s-employee .topbar .avatar-img').id='empAvatar';
  }
  closeM('mProfile');
  renderEmployeeMe();
  renderEmployeeHome();
  toast('Profile updated');
};

/* ===== Unified portal (login, shell, roles, onboarding) ===== */
const VINCEPT_ORIGIN=window.VINCEPT_ORIGIN||`${location.origin}/onboarding`;
const VINCEPT_PROXY='/api';
const ONBOARDING_ADMIN_URL=`${VINCEPT_ORIGIN.replace(/\/$/,'')}/index.html?login=admin`;
const ONBOARDING_CANDIDATE_URL=`${VINCEPT_ORIGIN.replace(/\/$/,'')}/index.html?login=candidate`;
let vinceptRecordsCache=[];
let onboardingTab='workspace';

function emailKey(value){return String(value||'').trim().toLowerCase();}

function ensureCentralAdminAccounts(){
  store.hrs=store.hrs||[];
  const ensure=(email,name)=>{
    const key=emailKey(email);
    let row=store.hrs.find(h=>emailKey(h.email)===key);
    if(!row){
      row={id:email==='admin@vayana.com'?'hr-1':`hr-${Date.now()}`,name,email,password:'admin@123',title:'Central Admin',accessRole:'central',companyId:'all',status:'Active',mustChangePassword:false};
      store.hrs.push(row);
    }
    row.accessRole='central';
    row.companyId='all';
    row.title=row.title||'Central Admin';
    row.name=row.name||name;
    if(row.status==='Inactive') row.status='Active';
    if(!row.password||emailKey(row.email)==='admin@vayana.com'||emailKey(row.email)==='admin@company.com'){
      row.password=row.password||'admin@123';
      if(emailKey(row.email)==='admin@vayana.com'||emailKey(row.email)==='admin@company.com'){
        row.password='admin@123';
        row.mustChangePassword=false;
      }
    }
  };
  ensure('admin@vayana.com','Central Admin');
  ensure('admin@company.com','Central Admin');
}

function buildUnifiedSession(primaryAccount){
  const email=emailKey(primaryAccount?.email);
  const hr=(store.hrs||[]).find(h=>emailKey(h.email)===email&&h.status!=='Inactive')||null;
  const bu=(store.buHeads||[]).find(h=>emailKey(h.email)===email&&h.status!=='Inactive')||null;
  const it=(store.itUsers||[]).find(h=>emailKey(h.email)===email&&h.status!=='Inactive')||null;
  let emp=(store.employees||[]).find(e=>emailKey(e.email)===email&&e.status!=='Inactive')||null;
  // BU Head / HR / IT logins often use a portal email different from their employee row — link by person name or provision.
  if(!emp&&bu) emp=ensureEmployeeForBuHead(bu);
  if(!emp&&hr) emp=ensureEmployeeForHr(hr);
  if(!emp&&it) emp=ensureEmployeeForIt(it);
  const isCentral=Boolean(hr&&(hr.accessRole==='central'||hr.companyId===PORTAL_ALL_COMPANIES_ID||String(hr.companyId||'').toLowerCase()==='all'));
  const isCompanyHr=Boolean(hr&&!isCentral&&(hr.accessRole==='company'||PORTAL_COMPANIES.some(c=>c.id===resolveCompanyId(hr.companyId))));
  const isBuHead=Boolean(bu);
  const isIt=Boolean(it)||primaryAccount?.accessRole==='it';
  const isEmployee=Boolean(emp)||isBuHead||Boolean(hr)||isIt;
  const base=emp||hr||bu||it||primaryAccount;
  const roles=[];
  if(isEmployee) roles.push('employee');
  if(isCentral) roles.push('central');
  if(isCompanyHr) roles.push('companyHr');
  if(isBuHead) roles.push('buHead');
  if(isIt) roles.push('it');
  let portal='employee';
  if(isCentral||isCompanyHr) portal='hr';
  else if(isBuHead) portal='buHead';
  else if(isIt) portal='it';
  return {
    ...base,
    ...(hr?{hrId:hr.id,accessRole:hr.accessRole||(isCentral?'central':'company'),companyId:hr.companyId||base.companyId,title:hr.title||base.title,password:primaryAccount.password||hr.password}:{}),
    ...(bu?{buHeadId:bu.id,bu:bu.bu,personName:bu.personName||bu.name,budget:bu.budget,companyId:bu.companyId||base.companyId||emp?.companyId}:{}),
    ...(it?{itUserId:it.id,accessRole:'it',companyId:it.companyId||base.companyId,title:it.title||base.title,password:primaryAccount.password||it.password}:{}),
    ...(emp?{id:emp.id,employeeCode:emp.employeeCode,employeeId:emp.id}:{}),
    email:primaryAccount.email||base.email,
    name:hr?.name||bu?.personName||bu?.name||it?.name||base.name||primaryAccount.name,
    portal,
    roles,
    isCentral,
    isCompanyHr,
    isBuHead,
    isIt,
    isEmployee
  };
}

function findUnifiedLogin(email,pass){
  const key=emailKey(email);
  const pools=[
    {kind:'it',list:store.itUsers||[]},
    {kind:'hr',list:store.hrs||[]},
    {kind:'buHead',list:store.buHeads||[]},
    {kind:'employee',list:store.employees||[]}
  ];
  for(const pool of pools){
    const hit=pool.list.find(u=>emailKey(u.email)===key&&String(u.password||'')===pass&&u.status!=='Inactive');
    if(hit) return hit;
  }
  return null;
}

function assembleUnifiedShell(){
  if(window.__unifiedShellAssembled) return;
  const shell=document.getElementById('s-employee');
  const admin=document.getElementById('s-admin');
  const bu=document.getElementById('s-buHead');
  if(!shell) return;
  const main=shell.querySelector('.main');
  const topLeft=document.getElementById('unifiedTopLeft');
  if(admin){
    const switcher=admin.querySelector('#adminCompanySwitch');
    if(switcher&&topLeft&&!document.getElementById('adminCompanySelect')){
      topLeft.appendChild(switcher);
    }else if(switcher&&topLeft&&!topLeft.contains(switcher)){
      topLeft.appendChild(switcher);
    }
    admin.querySelectorAll('.main > .pg').forEach(pg=>{
      if(main&&!document.getElementById(pg.id)) main.appendChild(pg);
      else if(main&&pg.parentElement!==main) main.appendChild(pg);
    });
    admin.style.display='none';
    admin.setAttribute('aria-hidden','true');
    admin.classList.remove('active');
  }
  if(bu){
    bu.querySelectorAll('.main > .pg').forEach(pg=>{
      if(main&&!document.getElementById(pg.id)) main.appendChild(pg);
      else if(main&&pg.parentElement!==main) main.appendChild(pg);
    });
    bu.style.display='none';
    bu.setAttribute('aria-hidden','true');
    bu.classList.remove('active');
  }
  if(main&&!document.getElementById('pg-onboarding')){
    main.insertAdjacentHTML('beforeend',`<div class="pg" id="pg-onboarding">
      <div class="pg-title">Onboarding</div>
      <div class="pg-sub">Manage joiners in the same Interlace portal (same origin). Candidates use <code>/onboarding</code> on this host.</div>
      <div class="stats">
        <div class="stat"><div class="stat-l">Candidates</div><div class="stat-v" id="obStatCandidates">0</div></div>
        <div class="stat"><div class="stat-l">Onboarded</div><div class="stat-v" style="color:#3B6D11" id="obStatOnboarded">0</div></div>
        <div class="stat"><div class="stat-l">Onboarding</div><div class="stat-v" style="font-size:16px" id="obStatServer">—</div></div>
      </div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title"><i class="ti ti-plug-connected" aria-hidden="true"></i> Onboarding workspace</div>
          <div class="table-actions">
            <button class="btn sm" onclick="refreshVinceptOnboarding(true)"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh</button>
            <button class="btn sm" onclick="openVinceptAdmin()"><i class="ti ti-external-link" aria-hidden="true"></i> Open onboarding</button>
            <button class="btn" onclick="syncEmployeesFromBackendSheet(true)"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Sync Excel</button>
          </div>
        </div>
        <div class="hint-box" id="obServerHint" style="margin-top:0;margin-bottom:10px">Onboarding runs inside Interlace on this same URL. Candidate invite link: <a href="${ONBOARDING_CANDIDATE_URL}" target="_blank" rel="noopener">${ONBOARDING_CANDIDATE_URL}</a></div>
        <div class="table-actions" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
          <button class="btn sm pri" id="obTabWorkspace" onclick="setOnboardingTab('workspace')">Workspace</button>
          <button class="btn sm" id="obTabCandidates" onclick="setOnboardingTab('candidates')">Candidates</button>
          <button class="btn sm" id="obTabOnboarded" onclick="setOnboardingTab('onboarded')">Onboarded</button>
        </div>
        <div id="obEmbedPanel">
          <iframe id="obVinceptFrame" title="Onboarding admin" style="width:100%;min-height:70vh;border:1px solid var(--color-border-tertiary);border-radius:10px;background:#fff"></iframe>
        </div>
        <div id="obListPanel" hidden></div>
      </div>
      <div class="card">
        <div class="card-hd"><div class="card-title"><i class="ti ti-user-plus" aria-hidden="true"></i> Quick joiner (Interlace)</div></div>
        <div class="hint-box" style="margin-top:0;margin-bottom:10px">Fallback only: create/update a portal employee here when you need Interlace access without the full onboarding flow.</div>
        <div class="fg2">
          <div class="fi"><label>Full name</label><input id="obJoinName" placeholder="Joiner name"></div>
          <div class="fi"><label>Work email</label><input id="obJoinEmail" type="email" placeholder="name@company.com"></div>
        </div>
        <div class="fg2">
          <div class="fi"><label>Employee ID</label><input id="obJoinCode" placeholder="e.g. EMP-2001"></div>
          <div class="fi"><label>Status</label><select id="obJoinStatus"><option>Candidate</option><option>Joined</option><option selected>Active</option></select></div>
        </div>
        <div class="fg2">
          <div class="fi"><label>Department</label><input id="obJoinDept" placeholder="Engineering"></div>
          <div class="fi"><label>Role</label><input id="obJoinRole" placeholder="Engineer"></div>
        </div>
        <div class="fg2">
          <div class="fi"><label>Company</label><select id="obJoinCompany"></select></div>
          <div class="fi"><label>Temp password</label><input id="obJoinPass" value="emp123"></div>
        </div>
        <div class="modal-foot" style="justify-content:flex-start;padding-top:8px">
          <button class="btn pri" onclick="saveInterlaceJoiner()"><i class="ti ti-device-floppy" aria-hidden="true"></i> Save to Interlace employees</button>
        </div>
      </div>
    </div>`);
  }
  // Hide legacy sidebars if still present
  document.getElementById('aSidebar')?.setAttribute('hidden','');
  document.getElementById('bhSidebar')?.setAttribute('hidden','');
  window.__unifiedShellAssembled=true;
}

function applyUnifiedNavVisibility(){
  const showSelf=hasSelfServiceAccess();
  const showMgmt=hasManagementAccess();
  const showBu=hasBuHeadAccess();
  const showIt=hasItAccess();
  const showCentral=isCentralHrSession();
  document.querySelectorAll('#eSidebar [data-nav-sec="self"], #eSidebar [data-nav="self"]').forEach(el=>{
    if(el.id==='navTeamLeaves') return;
    el.hidden=!showSelf;
    if(el.style) el.style.display=showSelf?'':'none';
  });
  document.querySelectorAll('#eSidebar [data-nav-sec="mgmt"], #eSidebar [data-nav="mgmt"]').forEach(el=>{
    const centralOnly=el.getAttribute('data-central-only')==='1';
    const visible=showMgmt&&(!centralOnly||showCentral);
    el.hidden=!visible;
    if(el.style) el.style.display=visible?'':'none';
  });
  document.querySelectorAll('#eSidebar [data-nav-sec="bu"], #eSidebar [data-nav="bu"]').forEach(el=>{
    el.hidden=!showBu;
    if(el.style) el.style.display=showBu?'':'none';
  });
  document.querySelectorAll('#eSidebar [data-nav-sec="it"]').forEach(el=>{
    const visible=showIt||showMgmt;
    el.hidden=!visible;
    if(el.style) el.style.display=visible?'':'none';
  });
  document.querySelectorAll('#eSidebar [data-nav="it"]').forEach(el=>{
    const forRole=el.getAttribute('data-it-for')||'it';
    const visible=forRole==='hr'?showMgmt:showIt;
    el.hidden=!visible;
    if(el.style) el.style.display=visible?'':'none';
  });
  const pwdBtn=document.getElementById('unifiedChangePwdBtn');
  if(pwdBtn) pwdBtn.style.display=(showMgmt||showIt)?'':'none';
  const unitLabel=document.getElementById('buHeadUnitLabel');
  if(unitLabel){
    if(showBu){
      const head=currentBuHeadRecord();
      unitLabel.style.display='';
      unitLabel.textContent=head?.bu?`Unit: ${head.bu}`:'BU Head';
    }else{
      unitLabel.style.display='none';
    }
  }
  const suffix=document.getElementById('unifiedBrandSuffix');
  if(suffix){
    if(showMgmt&&showSelf) suffix.textContent='Portal';
    else if(showMgmt) suffix.textContent=showCentral?'Central':'HR';
    else if(showBu&&showSelf) suffix.textContent='BU + Employee';
    else if(showBu) suffix.textContent='BU Head';
    else if(showIt&&showSelf) suffix.textContent='IT + Employee';
    else if(showIt) suffix.textContent='IT';
    else suffix.textContent='Employee';
  }
  const companySwitch=document.getElementById('adminCompanySwitch');
  if(companySwitch){
    companySwitch.style.display=showMgmt?'':'none';
    companySwitch.hidden=!showMgmt;
  }
  document.body.classList.toggle('is-employee-only',showSelf&&!showMgmt&&!showBu&&!showIt);
  document.body.classList.toggle('is-hr-portal',showMgmt);
  document.body.classList.toggle('is-bu-portal',showBu&&!showMgmt);
  document.body.classList.toggle('is-it-portal',showIt&&!showMgmt);
  if(typeof updateItExitReturnBadge==='function') updateItExitReturnBadge();
}

function defaultUnifiedPage(){
  // HR/Central land on management first; self-service stays in the sidebar
  if(hasManagementAccess()) return 'overview';
  if(hasSelfServiceAccess()) return 'home';
  if(hasBuHeadAccess()) return 'bhTeam';
  if(hasItAccess()) return 'itAssets';
  return 'home';
}

function setupPageSubtabs(pageId,tabs){
  const page=document.getElementById('pg-'+pageId);
  if(!page||page.dataset.subtabsReady==='1'||!tabs?.length) return;
  const anchor=page.querySelector(':scope > .pg-sub')
    ||page.querySelector(':scope > .home-dash-head')
    ||page.querySelector(':scope > .e-docs-head')
    ||page.querySelector(':scope > .pg-title');
  if(!anchor) return;
  // Resolve all picks before moving nodes — otherwise slice indices shift mid-setup.
  const panelPlans=tabs.map(tab=>({
    tab,
    nodes:((typeof tab.pick==='function'?tab.pick(page):[])||[]).filter(n=>n&&n.parentElement)
  })).filter(plan=>plan.nodes.length);
  if(!panelPlans.length) return;
  const bar=document.createElement('div');
  bar.className='pg-subtabs';
  bar.setAttribute('role','tablist');
  bar.setAttribute('aria-label',`${page.querySelector('.pg-title')?.textContent||pageId} sections`);
  const builtPanels=[];
  panelPlans.forEach(({tab,nodes},i)=>{
    const panel=document.createElement('div');
    panel.className='pg-subpanel'+(i===0?' act':'');
    panel.dataset.subpanel=tab.id;
    panel.hidden=i!==0;
    nodes.forEach(node=>panel.appendChild(node));
    builtPanels.push(panel);
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='pg-subtab'+(i===0?' act':'');
    btn.dataset.subtab=tab.id;
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-selected',i===0?'true':'false');
    btn.textContent=tab.label;
    btn.onclick=()=>goSubtab(pageId,tab.id,btn);
    bar.appendChild(btn);
  });
  anchor.insertAdjacentElement('afterend',bar);
  let insertAfter=bar;
  builtPanels.forEach(panel=>{
    insertAfter.insertAdjacentElement('afterend',panel);
    insertAfter=panel;
  });
  page.dataset.subtabsReady='1';
}

function repairHomeDashboardSubtabs(){
  const page=document.getElementById('pg-home');
  if(!page) return;
  const bar=page.querySelector(':scope > .pg-subtabs');
  if(bar){
    const panels=[...page.querySelectorAll(':scope > .pg-subpanel')];
    panels.forEach(panel=>{
      const frag=document.createDocumentFragment();
      while(panel.firstChild) frag.appendChild(panel.firstChild);
      bar.parentElement.insertBefore(frag,bar);
      panel.remove();
    });
    bar.remove();
    delete page.dataset.subtabsReady;
  }
}

function repairAssetInventorySubtab(pageId,cardId){
  const page=document.getElementById(pageId);
  if(!page||page.querySelector('.pg-subtab[data-subtab="inventory"]')) return;
  const card=page.querySelector(`#${cardId}`);
  const bar=page.querySelector(':scope > .pg-subtabs');
  if(!card||!bar) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='pg-subtab';
  btn.dataset.subtab='inventory';
  btn.setAttribute('role','tab');
  btn.setAttribute('aria-selected','false');
  btn.textContent='Company inventory';
  btn.onclick=()=>goSubtab(pageId.replace('pg-',''),'inventory',btn);
  const exitBtn=bar.querySelector('[data-subtab="exitReturns"]');
  if(exitBtn) bar.insertBefore(btn,exitBtn);
  else bar.appendChild(btn);
  const panel=document.createElement('div');
  panel.className='pg-subpanel';
  panel.dataset.subpanel='inventory';
  panel.hidden=true;
  if(card.parentElement) panel.appendChild(card);
  const registerPanel=page.querySelector(':scope > .pg-subpanel[data-subpanel="register"]');
  if(registerPanel) registerPanel.insertAdjacentElement('afterend',panel);
  else bar.insertAdjacentElement('afterend',panel);
}

function repairItAssetsExitReturnsSubtab(){
  const page=document.getElementById('pg-itAssets');
  if(!page||page.querySelector('.pg-subtab[data-subtab="exitReturns"]')) return;
  const card=page.querySelector('#itExitReturnsCard');
  const bar=page.querySelector(':scope > .pg-subtabs');
  if(!card||!bar) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='pg-subtab';
  btn.dataset.subtab='exitReturns';
  btn.setAttribute('role','tab');
  btn.setAttribute('aria-selected','false');
  btn.textContent='Exit asset returns';
  btn.onclick=()=>goSubtab('itAssets','exitReturns',btn);
  bar.appendChild(btn);
  const panel=document.createElement('div');
  panel.className='pg-subpanel';
  panel.dataset.subpanel='exitReturns';
  panel.hidden=true;
  if(card.parentElement) panel.appendChild(card);
  const lastPanel=page.querySelector(':scope > .pg-subpanel:last-of-type');
  if(lastPanel) lastPanel.insertAdjacentElement('afterend',panel);
  else bar.insertAdjacentElement('afterend',panel);
}

function repairExitsExitedSubtab(){
  const page=document.getElementById('pg-exits');
  if(!page) return;
  let exitedCard=document.getElementById('exitExitedList')?.closest('.card');
  if(!exitedCard){
    exitedCard=document.createElement('div');
    exitedCard.className='card';
    exitedCard.style.marginTop='14px';
    exitedCard.innerHTML=`<div class="card-hd"><div class="card-title"><i class="ti ti-user-off" aria-hidden="true"></i> Exited employees</div></div><div id="exitExitedList"></div>`;
    page.appendChild(exitedCard);
  }
  if(page.querySelector('.pg-subtab[data-subtab="exited"]')) return;
  const bar=page.querySelector(':scope > .pg-subtabs');
  if(!bar||!exitedCard) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='pg-subtab';
  btn.dataset.subtab='exited';
  btn.setAttribute('role','tab');
  btn.setAttribute('aria-selected','false');
  btn.textContent='Exited';
  btn.onclick=()=>goSubtab('exits','exited',btn);
  bar.appendChild(btn);
  const panel=document.createElement('div');
  panel.className='pg-subpanel';
  panel.dataset.subpanel='exited';
  panel.hidden=true;
  if(exitedCard.parentElement===page) panel.appendChild(exitedCard);
  const lastPanel=page.querySelector(':scope > .pg-subpanel:last-of-type');
  if(lastPanel) lastPanel.insertAdjacentElement('afterend',panel);
  else bar.insertAdjacentElement('afterend',panel);
}

function repairOverviewLocationsSubtab(){
  const page=document.getElementById('pg-overview');
  if(!page) return;
  let card=document.getElementById('ccCompanyLocationsCard');
  if(!card){
    card=document.createElement('div');
    card.className='card';
    card.id='ccCompanyLocationsCard';
    card.style.marginTop='14px';
    card.innerHTML=`<div class="card-hd"><div class="card-title"><i class="ti ti-map-pin" aria-hidden="true"></i> Company locations</div></div>
      <div class="hint-box" style="margin-top:0;margin-bottom:12px">Office locations for all 5 entities. New locations can be used when transferring employees or setting reporting place.</div>
      <div class="fg2"><div class="fi"><label for="ccNewLocationCompany">Entity</label><select id="ccNewLocationCompany"></select></div>
      <div class="fi"><label for="ccNewLocationName">New location</label><input id="ccNewLocationName" placeholder="e.g. Pune — Magarpatta Office" onkeydown="if(event.key==='Enter')addCompanyLocation()"></div></div>
      <button type="button" class="btn pri" onclick="addCompanyLocation()"><i class="ti ti-plus" aria-hidden="true"></i> Add location</button>
      <div id="ccCompanyLocationsList" style="margin-top:14px"></div>`;
    page.appendChild(card);
  }
  if(page.querySelector('.pg-subtab[data-subtab="locations"]')) return;
  const bar=page.querySelector(':scope > .pg-subtabs');
  if(!bar) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='pg-subtab';
  btn.dataset.subtab='locations';
  btn.setAttribute('role','tab');
  btn.setAttribute('aria-selected','false');
  btn.textContent='Company locations';
  btn.onclick=()=>goSubtab('overview','locations',btn);
  const analyticsBtn=bar.querySelector('[data-subtab="analytics"]');
  if(analyticsBtn) bar.insertBefore(btn,analyticsBtn);
  else bar.appendChild(btn);
  const panel=document.createElement('div');
  panel.className='pg-subpanel';
  panel.dataset.subpanel='locations';
  panel.hidden=true;
  if(card.parentElement===page) panel.appendChild(card);
  const queuesPanel=page.querySelector(':scope > .pg-subpanel[data-subpanel="queues"]');
  if(queuesPanel) queuesPanel.insertAdjacentElement('afterend',panel);
  else bar.insertAdjacentElement('afterend',panel);
}

function repairHrAccessItCard(){
  const page=document.getElementById('pg-hrAccess');
  if(!page) return;
  let card=document.getElementById('itAdminList')?.closest('.card');
  if(!card){
    card=document.createElement('div');
    card.className='card';
    card.style.marginTop='14px';
    card.innerHTML=`<div class="card-hd"><div class="card-title"><i class="ti ti-device-laptop" aria-hidden="true"></i> IT portal access</div>
            <button class="btn pri" id="addItBtn" onclick="openAddItFromAccess()"><i class="ti ti-user-plus" aria-hidden="true"></i> Add IT</button>
          </div>
          <div class="hint-box" style="margin-top:0;margin-bottom:10px">IT logins see asset inventory, allocations, and exit asset returns. Company IT is limited to one entity; All Entities covers every company.</div>
          <div id="itAdminList"></div>`;
    page.appendChild(card);
  }
  if(page.querySelector('.pg-subtab[data-subtab="it"]')) return;
  const bar=page.querySelector(':scope > .pg-subtabs');
  if(!bar||!card) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='pg-subtab';
  btn.dataset.subtab='it';
  btn.setAttribute('role','tab');
  btn.setAttribute('aria-selected','false');
  btn.textContent='IT access';
  btn.onclick=()=>goSubtab('hrAccess','it',btn);
  bar.appendChild(btn);
  const panel=document.createElement('div');
  panel.className='pg-subpanel';
  panel.dataset.subpanel='it';
  panel.hidden=true;
  if(card.parentElement===page) panel.appendChild(card);
  const lastPanel=page.querySelector(':scope > .pg-subpanel:last-of-type');
  if(lastPanel) lastPanel.insertAdjacentElement('afterend',panel);
  else bar.insertAdjacentElement('afterend',panel);
}

function initAllPageSubtabs(){
  repairHomeDashboardSubtabs();
  repairEditEmpModal();
  repairExitsExitedSubtab();
  repairOverviewLocationsSubtab();
  repairAssetInventorySubtab('pg-assets','assetInventoryCard');
  repairAssetInventorySubtab('pg-itAssets','itAssetInventoryCard');
  repairItAssetsExitReturnsSubtab();
  repairHrAccessItCard();
  if(typeof repairEmpDocPreviewModal==='function') repairEmpDocPreviewModal();
  const cards=(page)=>[...page.querySelectorAll(':scope > .card')];
  const stats=(page)=>[...page.querySelectorAll(':scope > .stats')].filter(el=>el.style.display!=='none');
  const layouts=(page)=>[...page.querySelectorAll(':scope > .news-layout')];
  const grids=(page)=>[...page.querySelectorAll(':scope > .engage-grid')];

  setupPageSubtabs('policies',[
    {id:'summary',label:'Summary',pick:p=>stats(p)},
    {id:'list',label:'All policies',pick:p=>cards(p).slice(0,1)}
  ]);
  setupPageSubtabs('queries',[
    {id:'inbox',label:'All queries',pick:p=>cards(p).slice(0,1)}
  ]);
  setupPageSubtabs('salaries',[
    {id:'summary',label:'Summary',pick:p=>stats(p)},
    {id:'list',label:'Employee salaries',pick:p=>cards(p).slice(0,1)}
  ]);
  setupPageSubtabs('assets',[
    {id:'allocate',label:'Allocate asset',pick:p=>cards(p).slice(0,1)},
    {id:'register',label:'Allocation register',pick:p=>cards(p).slice(1,2)},
    {id:'inventory',label:'Company inventory',pick:p=>[p.querySelector('#assetInventoryCard')].filter(Boolean)}
  ]);
  setupPageSubtabs('itAssets',[
    {id:'allocate',label:'Allocate asset',pick:p=>cards(p).slice(0,1)},
    {id:'register',label:'Allocation register',pick:p=>{
      const s=stats(p)[0];
      const reg=cards(p).slice(1,2);
      return [s,...reg].filter(Boolean);
    }},
    {id:'inventory',label:'Company inventory',pick:p=>[p.querySelector('#itAssetInventoryCard')].filter(Boolean)},
    {id:'exitReturns',label:'Exit asset returns',pick:p=>[p.querySelector('#itExitReturnsCard')].filter(Boolean)}
  ]);
  setupPageSubtabs('transfers',[
    {id:'initiate',label:'Initiate transfer',pick:p=>cards(p).slice(0,1)},
    {id:'queue',label:'Transfer queue',pick:p=>cards(p).slice(1,2)}
  ]);
  setupPageSubtabs('probation',[
    {id:'summary',label:'Summary',pick:p=>stats(p)},
    {id:'list',label:'Employees in probation',pick:p=>cards(p).slice(0,1)}
  ]);
  setupPageSubtabs('exits',[
    {id:'start',label:'Start exit',pick:p=>cards(p).slice(0,1)},
    {id:'cases',label:'Exit cases',pick:p=>cards(p).slice(1,2)},
    {id:'exited',label:'Exited',pick:p=>cards(p).slice(2,3)}
  ]);
  setupPageSubtabs('announcements',[
    {id:'publish',label:'Publish',pick:p=>layouts(p).slice(0,1)},
    {id:'current',label:'Current posts',pick:p=>layouts(p).slice(1,2)}
  ]);
  setupPageSubtabs('overview',[
    {id:'summary',label:'Summary',pick:p=>stats(p)},
    {id:'queues',label:'Queues',pick:p=>{
      const nl=layouts(p);
      const exitCard=[...cards(p)].find(c=>c.querySelector('#ccOpenExits'));
      return [...nl.slice(0,1),exitCard].filter(Boolean);
    }},
    {id:'locations',label:'Company locations',pick:p=>[p.querySelector('#ccCompanyLocationsCard')].filter(Boolean)},
    {id:'analytics',label:'Analytics',pick:p=>{
      return [...cards(p)].filter(c=>c.querySelector('#ovChart')||c.id==='engagementAdminStats');
    }},
    {id:'backup',label:'Backup',pick:p=>[...cards(p)].filter(c=>c.id==='portalBackupCard')}
  ]);
  setupPageSubtabs('hrAccess',[
    {id:'hr',label:'HR access',pick:p=>cards(p).slice(0,1)},
    {id:'bu',label:'BU Head access',pick:p=>cards(p).slice(1,2)},
    {id:'it',label:'IT access',pick:p=>cards(p).slice(2,3)}
  ]);
  setupPageSubtabs('myLeaves',[
    {id:'balance',label:'Balance',pick:p=>[...stats(p),...cards(p).slice(0,1)].filter(Boolean)},
    {id:'apply',label:'Apply for leave',pick:p=>cards(p).slice(1,2)},
    {id:'history',label:'My requests',pick:p=>cards(p).slice(2,3)}
  ]);
  setupPageSubtabs('raiseQuery',[
    {id:'new',label:'New query',pick:p=>cards(p).slice(0,1)},
    {id:'mine',label:'My queries',pick:p=>cards(p).slice(1,2)}
  ]);
  setupPageSubtabs('engage',[
    {id:'badges',label:'Badges & mood',pick:p=>grids(p).slice(0,1)},
    {id:'learning',label:'Learning & planner',pick:p=>grids(p).slice(1,2)},
    {id:'wall',label:'Team wall',pick:p=>cards(p).slice(0,1)}
  ]);
  setupPageSubtabs('teamLeaves',[
    {id:'approvals',label:'Approvals',pick:p=>[p.querySelector('#teamSummaryStats'),...cards(p).slice(0,1)].filter(Boolean)},
    {id:'probation',label:'Probation',pick:p=>[p.querySelector('#teamProbationCard')].filter(Boolean)},
    {id:'roster',label:'Team roster',pick:p=>cards(p).filter(c=>c.querySelector('#teamRosterList')).slice(0,1)},
    {id:'today',label:'On leave today',pick:p=>cards(p).filter(c=>c.querySelector('#teamAwayTodayList')).slice(0,1)},
    {id:'resignations',label:'Resignations',pick:p=>[p.querySelector('#teamResignCard')].filter(Boolean)}
  ]);
  setupPageSubtabs('aiChat',[
    {id:'chat',label:'Ask HR AI',pick:p=>cards(p).slice(0,1)}
  ]);
  setupPageSubtabs('ePolicies',[
    {id:'policies',label:'Policies',pick:p=>[p.querySelector('.policy-summary-card'),p.querySelector('#ePList')].filter(Boolean)}
  ]);
  setupPageSubtabs('games',[
    {id:'play',label:'Play',pick:p=>[p.querySelector('.game-shell')].filter(Boolean)}
  ]);
  setupPageSubtabs('news',[
    {id:'feed',label:'News feed',pick:p=>cards(p)}
  ]);
  setupPageSubtabs('bhOverview',[
    {id:'overview',label:'BU overview',pick:p=>[...stats(p),...cards(p)].filter(Boolean)}
  ]);
  setupPageSubtabs('bhTeam',[
    {id:'team',label:'My team',pick:p=>[...stats(p),...cards(p)].filter(Boolean)}
  ]);

  // Appointment letter: split draft fields vs preview
  const docPage=document.getElementById('pg-documents');
  if(docPage&&docPage.dataset.subtabsReady!=='1'){
    const card=docPage.querySelector(':scope > .card');
    const previewWrap=docPage.querySelector('#appointmentLetterPreviewWrap');
    const previewChrome=docPage.querySelector('.letter-preview-chrome');
    const preview=docPage.querySelector('#appointmentLetterPreview');
    const previewBlock=previewWrap||preview;
    if(card&&previewBlock&&previewBlock.parentElement===card){
      const previewPanel=document.createElement('div');
      previewPanel.className='pg-subpanel';
      previewPanel.dataset.subpanel='preview';
      previewPanel.hidden=true;
      if(previewWrap){
        previewPanel.appendChild(previewWrap);
      }else{
        if(previewChrome) previewPanel.appendChild(previewChrome);
        if(preview) previewPanel.appendChild(preview);
      }
      const anchor=docPage.querySelector(':scope > .pg-sub')||docPage.querySelector(':scope > .pg-title');
      if(anchor){
        const bar=document.createElement('div');
        bar.className='pg-subtabs';
        bar.setAttribute('role','tablist');
        bar.innerHTML=`<button type="button" class="pg-subtab act" data-subtab="draft" role="tab">Letter draft</button><button type="button" class="pg-subtab" data-subtab="preview" role="tab">Preview</button>`;
        bar.querySelectorAll('.pg-subtab').forEach(btn=>{
          btn.onclick=()=>goSubtab('documents',btn.dataset.subtab,btn);
        });
        anchor.insertAdjacentElement('afterend',bar);
        const draftPanel=document.createElement('div');
        draftPanel.className='pg-subpanel act';
        draftPanel.dataset.subpanel='draft';
        draftPanel.appendChild(card);
        bar.insertAdjacentElement('afterend',draftPanel);
        draftPanel.insertAdjacentElement('afterend',previewPanel);
        docPage.dataset.subtabsReady='1';
      }
    }
  }

  initColleaguesSubtabs();
  repairItAssetsExitReturnsSubtab();
  initEmployeesPageSubtabs();
  initOnboardingSubtabs();
  if(typeof migrateExitAssetReturnItems==='function') migrateExitAssetReturnItems();
  if(typeof updateItExitReturnBadge==='function') updateItExitReturnBadge();
}

function repairColleaguesDirectoryLayout(){
  const page=document.getElementById('pg-colleagues');
  if(!page) return;
  if(page.querySelector('#colleagueDirectoryList')) return;
  const legacyList=page.querySelector('#colleagueList');
  if(legacyList){
    legacyList.id='colleagueDirectoryList';
    legacyList.closest('.colleague-directory')?.classList.add('colleague-directory-full');
  }
  page.dataset.subtabsReady='1';
}

function initColleaguesSubtabs(){
  repairColleaguesDirectoryLayout();
}

function initEmployeesPageSubtabs(){
  setupPageSubtabs('employees',[
    {id:'summary',label:'Summary',pick:p=>[p.querySelector(':scope > .stats')].filter(Boolean)},
    {id:'directory',label:'Directory',pick:p=>[...p.querySelectorAll(':scope > .card')].filter(c=>c.querySelector('#eTable'))},
    {id:'sync',label:'Sync Excel',pick:p=>[p.querySelector('#empSyncExcelCard')].filter(Boolean)},
    {id:'bulk',label:'Bulk upload',pick:p=>[...p.querySelectorAll(':scope > .card')].filter(c=>!c.querySelector('#eTable')&&c.id!=='empSyncExcelCard')}
  ]);
}

function initOnboardingSubtabs(){
  const page=document.getElementById('pg-onboarding');
  if(!page||page.dataset.subtabsReady==='1') return;
  const statsEl=page.querySelector(':scope > .stats');
  const cards=[...page.querySelectorAll(':scope > .card')];
  const workspaceCard=cards[0];
  const joinerCard=cards[1];
  if(!workspaceCard) return;
  const anchor=page.querySelector(':scope > .pg-sub')||page.querySelector(':scope > .pg-title');
  if(!anchor) return;
  const bar=document.createElement('div');
  bar.className='pg-subtabs';
  bar.setAttribute('role','tablist');
  const defs=[
    {id:'workspace',label:'Workspace'},
    {id:'candidates',label:'Candidates'},
    {id:'onboarded',label:'Onboarded'},
    {id:'joiner',label:'Quick joiner'}
  ];
  const panels=defs.map((def,i)=>{
    const panel=document.createElement('div');
    panel.className='pg-subpanel'+(i===0?' act':'');
    panel.dataset.subpanel=def.id;
    panel.hidden=i!==0;
    if(def.id==='workspace'){
      if(statsEl) panel.appendChild(statsEl);
      panel.appendChild(workspaceCard);
    }else if(def.id==='joiner'){
      if(joinerCard) panel.appendChild(joinerCard);
    }else{
      const listHost=document.createElement('div');
      listHost.id=def.id==='candidates'?'obListPanelCandidates':'obListPanelOnboarded';
      listHost.className='ob-subtab-list';
      const card=document.createElement('div');
      card.className='card';
      card.appendChild(listHost);
      panel.appendChild(card);
    }
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='pg-subtab'+(i===0?' act':'');
    btn.dataset.subtab=def.id;
    btn.textContent=def.label;
    btn.onclick=()=>goSubtab('onboarding',def.id,btn);
    bar.appendChild(btn);
    return panel;
  });
  anchor.insertAdjacentElement('afterend',bar);
  panels.forEach(panel=>bar.insertAdjacentElement('afterend',panel));
  page.dataset.subtabsReady='1';
  const oldList=document.getElementById('obListPanel');
  if(oldList) oldList.remove();
  workspaceCard.querySelector('#obTabWorkspace')?.closest('.table-actions')?.setAttribute('hidden','');
}

window.goSubtab=function(pageId,subtabId,btn){
  const page=document.getElementById('pg-'+pageId);
  if(!page) return;
  if(pageId==='colleagues'){
    page.querySelectorAll('.pg-subtab').forEach(tab=>{
      const on=tab.getAttribute('data-subtab')===subtabId;
      tab.classList.toggle('act',on);
      tab.setAttribute('aria-selected',on?'true':'false');
    });
    page.querySelectorAll('.pg-subpanel').forEach(panel=>{
      const on=panel.getAttribute('data-subpanel')===subtabId;
      panel.classList.toggle('act',on);
      panel.hidden=!on;
    });
    try{sessionStorage.setItem('hrp_subtab_colleagues',subtabId);}catch(_err){}
    if(subtabId==='messages'&&activeColleagueId) renderColleagueConversation();
    resetPortalScroll();
    return;
  }
  page.querySelectorAll('.pg-subtab').forEach(tab=>{
    const on=tab.getAttribute('data-subtab')===subtabId;
    tab.classList.toggle('act',on);
    tab.setAttribute('aria-selected',on?'true':'false');
  });
  page.querySelectorAll('.pg-subpanel').forEach(panel=>{
    const on=panel.getAttribute('data-subpanel')===subtabId;
    panel.classList.toggle('act',on);
    panel.hidden=!on;
  });
  try{sessionStorage.setItem('hrp_subtab_'+pageId,subtabId);}catch(_err){}
  if(pageId==='onboarding') setOnboardingTab(subtabId,true);
  if(pageId==='itAssets'){
    refreshAssetViews();
    if(subtabId==='exitReturns'&&typeof renderItExitAssetReturns==='function') renderItExitAssetReturns();
  }else if(pageId==='assets') refreshAssetViews();
  if(pageId==='transfers'&&typeof renderTransfers==='function') renderTransfers();
  if(pageId==='overview'&&typeof renderCompanyLocations==='function') renderCompanyLocations();
  if(pageId==='employees'&&typeof renderEmpTable==='function') renderEmpTable();
  resetPortalScroll();
};

window.restorePageSubtab=function(pageId,fallbackId){
  const page=document.getElementById('pg-'+pageId);
  if(!page) return;
  if(pageId==='colleagues'&&page.querySelector('.pg-subpanel[data-subpanel]')){
    let subtabId=fallbackId||'directory';
    try{
      let saved=sessionStorage.getItem('hrp_subtab_colleagues');
      if(saved==='chat') saved='messages';
      if(saved&&page.querySelector(`.pg-subpanel[data-subpanel="${saved}"]`)) subtabId=saved;
    }catch(_err){}
    const btn=page.querySelector(`.pg-subtab[data-subtab="${subtabId}"]`)||page.querySelector('.pg-subtab');
    goSubtab('colleagues',subtabId,btn);
    return;
  }
  if(!page.querySelector('.pg-subpanel')) return;
  let subtabId=fallbackId;
  try{
    const saved=sessionStorage.getItem('hrp_subtab_'+pageId);
    if(saved&&page.querySelector(`.pg-subpanel[data-subpanel="${saved}"]`)) subtabId=saved;
  }catch(_err){}
  if(!subtabId){
    subtabId=page.querySelector('.pg-subpanel')?.getAttribute('data-subpanel');
  }
  const btn=page.querySelector(`.pg-subtab[data-subtab="${subtabId}"]`)
    ||page.querySelector('.pg-subtab');
  if(subtabId) goSubtab(pageId,subtabId,btn);
};

window.goPage=function(pg,el){
  resetPortalScroll();
  const shell=document.getElementById('s-employee');
  if(!shell) return;
  const mgmtPages=new Set(['onboarding','policies','queries','employees','hrAccess','salaries','documents','transfers','probation','exits','assets','announcements','overview']);
  const buPages=new Set(['bhOverview','bhTeam']);
  const itPages=new Set(['itAssets']);
  if(itPages.has(pg)&&!hasItAccess()){
    toast('That area is for IT only');
    pg=defaultUnifiedPage();
    el=document.querySelector(`#eSidebar .ni[onclick*="'${pg}'"]`);
  }
  if(mgmtPages.has(pg)&&!hasManagementAccess()){
    toast('That area is for HR / Admin only');
    pg=defaultUnifiedPage();
    el=document.querySelector(`#eSidebar .ni[onclick*="'${pg}'"]`);
  }
  if(buPages.has(pg)&&!hasBuHeadAccess()){
    toast('That area is for BU Heads only');
    pg=defaultUnifiedPage();
    el=document.querySelector(`#eSidebar .ni[onclick*="'${pg}'"]`);
  }
  shell.querySelectorAll('.pg').forEach(p=>p.classList.remove('act'));
  document.querySelectorAll('#eSidebar .ni').forEach(n=>n.classList.remove('act'));
  const page=document.getElementById('pg-'+pg);
  if(page) page.classList.add('act');
  if(el) el.classList.add('act');
  else{
    const nav=[...document.querySelectorAll('#eSidebar .ni')].find(n=>n.getAttribute('onclick')?.includes(`'${pg}'`));
    if(nav) nav.classList.add('act');
  }
  if(pg==='home') renderEmployeeHome();
  if(pg==='me') renderEmployeeMe();
  if(pg==='colleagues') renderColleagues();
  if(pg==='ePolicies') renderEPolicies();
  if(pg==='eDocuments') renderEmployeeDocuments();
  if(pg==='raiseQuery') renderMyQueries();
  if(pg==='myLeaves'){updateBars();initLeaveApplyDates();updateLeaveApplyPreview();renderMyLeaveRequests();}
  if(pg==='teamLeaves') renderMyTeamPage();
  if(pg==='news') renderNewsPortal();
  if(pg==='engage') renderEngage();
  if(pg==='games') renderGameTab();
  if(pg==='policies') renderPolicies();
  if(pg==='queries') renderQueries();
  if(pg==='employees') renderEmpTable();
  if(pg==='hrAccess'){ if(!isCentralHrSession()){toast('Only Central Admin can manage access');goPage(defaultUnifiedPage());return;} renderHrAdminList(); }
  if(pg==='salaries') renderSalaries();
  if(pg==='documents') renderAdminDocuments();
  if(pg==='assets'){renderAdminAssets();renderAdminAssetInventory();}
  if(pg==='transfers') renderTransfers();
  if(pg==='probation') renderProbation();
  if(pg==='exits') renderExits();
  if(pg==='announcements') renderAnnouncements();
  if(pg==='overview') renderOverview();
  if(pg==='bhOverview') renderBuHeadOverview();
  if(pg==='bhTeam') renderBuHeadTeam();
  if(pg==='onboarding'){ if(!hasManagementAccess()){toast('Onboarding is for Central Admin and Company HR');goPage(defaultUnifiedPage());return;} renderOnboardingPage(); }
  restorePageSubtab(pg);
  if(pg==='itAssets'){
    repairItAssetsExitReturnsSubtab();
    renderItAssets();
    renderItAssetInventory();
    renderItExitAssetReturns();
    updateItExitReturnBadge();
    if(typeof itPendingExitAssetReturnCount==='function'&&itPendingExitAssetReturnCount()>0){
      const itPage=document.getElementById('pg-itAssets');
      const btn=itPage?.querySelector('.pg-subtab[data-subtab="exitReturns"]');
      if(btn) goSubtab('itAssets','exitReturns',btn);
    }
  }
  resetPortalScroll();
};
window.aPage=window.goPage;
window.ePage=window.goPage;
window.bhPage=function(pg,el){goPage(pg,el);};

window.openUnifiedProfile=function(){
  if(hasSelfServiceAccess()&&employeeById(currentUser?.id)){
    goPage('me');
    return;
  }
  toast(currentUser?.email||'Signed in');
};

function fillObJoinCompanyOptions(){
  const select=document.getElementById('obJoinCompany');
  if(!select) return;
  const locked=isCompanyHrSession()?lockedHrCompanyId():null;
  const selected=locked||activeCompanyId||PORTAL_COMPANIES[0]?.id||'VNSPL';
  select.innerHTML=PORTAL_COMPANIES.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${safeText(companyOptionLabel(c))}</option>`).join('');
  if(locked){ select.value=locked; select.disabled=true; }
  else select.disabled=false;
}

function isVinceptOnboarded(rec){
  return String(rec?.onboardingStatus||'').toLowerCase()==='onboarded'||Boolean(rec?.onboardedAt);
}

function vinceptScopedRecords(records){
  const list=Array.isArray(records)?records:[];
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId();
    return list.filter(r=>resolveCompanyId(r.companyId||PORTAL_COMPANIES[0]?.id)===cid);
  }
  if(isCentralHrSession()&&!isAllCompaniesView()){
    return list.filter(r=>resolveCompanyId(r.companyId||PORTAL_COMPANIES[0]?.id)===(activeCompanyId||PORTAL_COMPANIES[0]?.id));
  }
  return list;
}

function isPythonDevServerHeader(serverHeader){
  return /python|basehttp/i.test(String(serverHeader||''));
}

async function probeOnboardingHost(){
  const urls=['/onboarding/','/onboarding/index.html'];
  let last={kind:'unknown',status:0,server:''};
  for(const url of urls){
    try{
      const res=await fetch(url,{cache:'no-store'});
      const server=res.headers.get('server')||'';
      last={kind:'unknown',status:res.status,server};
      if(isPythonDevServerHeader(server)) return {kind:'python',status:res.status,server};
      if(res.ok) return {kind:'node',status:res.status,server};
      if(res.status===404) last={kind:isPythonDevServerHeader(server)?'python':'missing',status:404,server};
    }catch(err){
      last={kind:'unreachable',status:0,server:'',error:err?.message||'unreachable'};
    }
  }
  return last;
}

async function fetchVinceptEmployees(){
  const urls=[`${VINCEPT_PROXY}/employees`];
  let lastErr=null;
  let lastServer='';
  for(const url of urls){
    try{
      const res=await fetch(url,{cache:'no-store'});
      lastServer=res.headers.get('server')||'';
      if(!res.ok){
        const err=new Error(`HTTP ${res.status}`);
        err.serverHeader=lastServer;
        err.status=res.status;
        throw err;
      }
      const data=await res.json();
      return {ok:true,records:Array.isArray(data.records)?data.records:[],source:url,server:lastServer};
    }catch(err){ lastErr=err; if(err?.serverHeader) lastServer=err.serverHeader; }
  }
  return {ok:false,records:[],error:lastErr?.message||'unreachable',server:lastServer||lastErr?.serverHeader||'',status:lastErr?.status||0};
}

window.refreshVinceptOnboarding=async function(manual=false){
  const hint=document.getElementById('obServerHint');
  const serverStat=document.getElementById('obStatServer');
  const result=await fetchVinceptEmployees();
  if(result.ok){
    vinceptRecordsCache=result.records;
    if(serverStat) serverStat.textContent='Online';
    if(hint) hint.innerHTML=`Onboarding connected (${safeText(result.source)}). Company scope applies below. Candidates: <a href="${ONBOARDING_CANDIDATE_URL}" target="_blank" rel="noopener">${ONBOARDING_CANDIDATE_URL}</a>`;
    if(manual) toast('Onboarding candidates refreshed');
  }else{
    vinceptRecordsCache=[];
    if(serverStat) serverStat.textContent='Offline';
    const probe=await probeOnboardingHost();
    const onPython=isPythonDevServerHeader(result.server)||probe.kind==='python'||isPythonDevServerHeader(probe.server);
    if(hint){
      if(onPython){
        hint.innerHTML=`You're on the wrong server — Python <code>dev-server.py</code> is running on :5500 (no Onboarding). Close that window and run <code>start-live-site.bat</code> (or <code>start-one-portal.cmd</code>) so Node <code>server.js</code> serves the single portal.`;
      }else{
        hint.innerHTML=`Onboarding API unreachable (${safeText(result.error)}). Restart Interlace with <code>start-live-site.bat</code> / <code>node server.js</code> on :5500, or use Quick joiner + Sync Excel below.`;
      }
    }
    if(manual) toast(onPython?'Wrong server — run start-live-site.bat':'Onboarding API unreachable — restart Interlace server');
  }
  renderOnboardingLists();
};

window.setOnboardingTab=function(tab,fromSubtab){
  const valid=['workspace','candidates','onboarded','joiner'];
  onboardingTab=valid.includes(tab)?tab:'workspace';
  if(!fromSubtab){
    const btn=document.querySelector(`#pg-onboarding .pg-subtab[data-subtab="${onboardingTab}"]`);
    if(btn) goSubtab('onboarding',onboardingTab,btn);
    return;
  }
  const embed=document.getElementById('obEmbedPanel');
  if(onboardingTab==='workspace'){
    if(embed){
      embed.hidden=false;
      const frame=document.getElementById('obVinceptFrame');
      if(frame&&(!frame.src||frame.src==='about:blank')) frame.src=ONBOARDING_ADMIN_URL;
    }
  }else if(onboardingTab==='candidates'||onboardingTab==='onboarded'){
    if(embed) embed.hidden=true;
    renderOnboardingLists();
  }else if(onboardingTab==='joiner'){
    if(embed) embed.hidden=true;
  }
};

window.openVinceptAdmin=function(){
  window.open(ONBOARDING_ADMIN_URL,'_blank','noopener');
};

function renderOnboardingLists(){
  const scoped=vinceptScopedRecords(vinceptRecordsCache);
  const candidates=scoped.filter(r=>!isVinceptOnboarded(r));
  const onboarded=scoped.filter(isVinceptOnboarded);
  if(document.getElementById('obStatCandidates')) document.getElementById('obStatCandidates').textContent=candidates.length;
  if(document.getElementById('obStatOnboarded')) document.getElementById('obStatOnboarded').textContent=onboarded.length;
  if(onboardingTab!=='candidates'&&onboardingTab!=='onboarded') return;
  const panelId=onboardingTab==='onboarded'?'obListPanelOnboarded':'obListPanelCandidates';
  const panel=document.getElementById(panelId);
  if(!panel) return;
  const rows=onboardingTab==='onboarded'?onboarded:candidates;
  if(!rows.length){
    panel.innerHTML=`<div class="empty-state">${onboardingTab==='onboarded'?'No onboarded candidates in scope.':'No ongoing candidates in scope.'}</div>`;
    return;
  }
  panel.innerHTML=`<div style="overflow-x:auto"><table class="etable"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Status</th></tr></thead><tbody>${rows.map(r=>{
    const status=isVinceptOnboarded(r)?'Onboarded':(r.offerStatus==='declined'?'Declined':(r.onboardingStatus||'Candidate'));
    return `<tr><td>${safeText(r.name||'—')}</td><td>${safeText(r.email||r.candidateId||'—')}</td><td>${safeText(companyLabelById(r.companyId||PORTAL_COMPANIES[0]?.id))}</td><td>${safeText(r.role||r.designation||'—')}</td><td><span class="badge ${isVinceptOnboarded(r)?'b-active':'b-pending'}">${safeText(status)}</span></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

window.renderOnboardingPage=function(){
  fillObJoinCompanyOptions();
  const valid=['workspace','candidates','onboarded','joiner'];
  setOnboardingTab(valid.includes(onboardingTab)?onboardingTab:'workspace');
  refreshVinceptOnboarding(false);
};

window.saveInterlaceJoiner=function(){
  if(!hasManagementAccess()){toast('Only Central Admin or Company HR can add joiners');return;}
  const name=document.getElementById('obJoinName')?.value.trim();
  const email=emailKey(document.getElementById('obJoinEmail')?.value);
  const code=document.getElementById('obJoinCode')?.value.trim();
  const status=document.getElementById('obJoinStatus')?.value||'Active';
  const dept=document.getElementById('obJoinDept')?.value.trim()||'General';
  const role=document.getElementById('obJoinRole')?.value.trim()||'Employee';
  let companyId=document.getElementById('obJoinCompany')?.value||PORTAL_COMPANIES[0]?.id||'VNSPL';
  const pass=document.getElementById('obJoinPass')?.value||'emp123';
  if(isCompanyHrSession()) companyId=lockedHrCompanyId();
  if(!name||!email||!email.includes('@')){toast('Name and valid email are required');return;}
  let emp=(store.employees||[]).find(e=>emailKey(e.email)===email);
  if(emp){
    if(!assertEmployeeInHrScope(emp,'update')) return;
    emp.name=name;
    emp.employeeCode=code||emp.employeeCode;
    emp.status=status;
    emp.dept=dept;
    emp.role=role;
    emp.companyId=companyId;
    if(!emp.password) emp.password=pass;
    emp.onboardingStatus=status;
  }else{
    emp={
      id:`emp-ob-${Date.now()}`,
      name,email,password:pass,mustChangePassword:true,companyId,employeeCode:code||'',
      dept,role,status,manager:'',reportingManager:'',bu:'',project:'',buHead:'',
      dateOfJoining:status==='Candidate'?'':new Date().toISOString().slice(0,10),leavingDate:'',ctc:'',
      onboardingStatus:status,profile:{dob:'',hobbies:'',photo:''},
      leave:{annual:{u:0,t:18},sick:{u:0,t:8},wfh:{u:0,t:12},comp:{u:0,t:3}}
    };
    store.employees.push(emp);
  }
  saveStore();
  toast(`${name} saved in Interlace employees (${status})`);
  if(typeof renderEmpTable==='function') renderEmpTable();
};

function refreshUnifiedTopbar(){
  const nameEl=document.getElementById('empTopName');
  const avatar=document.getElementById('empAvatar');
  const emp=employeeById(currentUser?.id)||(store.employees||[]).find(e=>emailKey(e.email)===emailKey(currentUser?.email));
  if(nameEl) nameEl.textContent=currentUser?.name||'User';
  if(avatar){
    if(emp){
      avatar.outerHTML=avatarHtml(emp,'av av-e');
      const next=document.querySelector('#s-employee .topbar .av, #s-employee .topbar .avatar-img');
      if(next) next.id='empAvatar';
    }else if(avatar.tagName==='DIV'){
      avatar.textContent=initials(currentUser?.name||'U');
      avatar.className='av av-a';
    }
  }
  const hrAvatar=document.getElementById('hrAvatar');
  const hrTopName=document.getElementById('hrTopName');
  if(hrAvatar&&hasManagementAccess()) hrAvatar.textContent=initials(typeof hrHeaderCompanyName==='function'?hrHeaderCompanyName():(currentUser?.name||'HR'));
  if(hrTopName&&hasManagementAccess()) hrTopName.textContent=currentUser?.name||'HR';
}

function enhanceUI(){
  try{
  assembleUnifiedShell();
  ensureCentralAdminAccounts();
  applyCompanyBranding();
  const adminBrand=document.querySelector('#s-admin .brand');
  if(adminBrand) adminBrand.innerHTML=portalBrand('HR Admin');
  const empBrand=document.querySelector('#s-employee .brand');
  if(empBrand) empBrand.innerHTML=portalBrand('');
  const empSub=document.querySelector('#pg-employees .pg-sub');
  if(empSub) empSub.textContent='Directory, login access, and leave balances across the team';
  const empPage=document.getElementById('pg-employees');
  if(empPage){
    delete empPage.dataset.subtabsReady;
    empPage.innerHTML=`<div class="pg-title">Employees</div><div class="pg-sub">Directory, login access, and leave balances across the team</div>
    <div class="stats">
      <div class="stat"><div class="stat-l">Total employees</div><div class="stat-v" id="empTotal">0</div></div>
      <div class="stat"><div class="stat-l">Active</div><div class="stat-v" style="color:#3B6D11" id="empActive">0</div></div>
      <div class="stat"><div class="stat-l">HR admins</div><div class="stat-v" style="color:#534AB7" id="hrTotal">0</div></div>
      <div class="stat"><div class="stat-l">Open queries</div><div class="stat-v" style="color:#854F0B" id="empOpenQ">0</div></div>
    </div>
    <div class="card" id="empSyncExcelCard">
      <div class="card-hd">
        <div class="card-title"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Sync Excel</div>
        <div class="table-actions">
          <button class="btn pri" id="empSyncExcelBtn" onclick="syncEmployeesFromBackendSheet(true)"><i class="ti ti-refresh" aria-hidden="true"></i> Sync Excel</button>
          <button class="btn" id="empPushExcelBtn" onclick="syncEmployeesToBackendSheet(true)"><i class="ti ti-upload" aria-hidden="true"></i> Push to Excel</button>
        </div>
      </div>
      <div class="hint-box" style="margin-top:0;margin-bottom:8px" id="empSyncExcelHint">Pull employee rows from the onboarding Excel/CSV into this portal, or push portal employee details back to Excel. Deleted employees are removed from Excel and are not restored by Sync unless you Add employee again. Pre-existing Excel emails (that were never deleted) get portal access on Sync Excel (temp password from sheet or emp123). Company HR syncs only their entity. Central Admin syncs the selected entity, or all entities when All Entities is selected. Portal passwords are never overwritten from Excel. Portal passwords are not written to Excel.</div>
      <div id="sheetSyncResult" class="bulk-result"></div>
    </div>
    <div class="card">
      <div class="card-hd"><div class="card-title"><i class="ti ti-upload" aria-hidden="true"></i> Bulk employee upload</div><div class="table-actions"><button class="btn sm" onclick="downloadEmployeeCsvTemplate()"><i class="ti ti-download" aria-hidden="true"></i> CSV template</button></div></div>
      <div class="fg2">
        <div class="fi"><label>Upload CSV or Excel</label><input id="empBulkFile" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
        <div class="fi"><label>Default temporary password</label><input id="empBulkDefaultPass" value="emp123" placeholder="Used only for new accounts when file password is blank"></div>
      </div>
      <div class="hint-box" style="margin-top:0">CSV/Excel columns: name, email, department, role, tempPassword, companyId. Temporary passwords apply only to new employees. Existing account passwords stay in the portal. Portal passwords are not written to Excel.</div>
      <div class="modal-foot" style="justify-content:flex-start;padding-top:10px"><button class="btn pri" onclick="bulkUploadEmployees()"><i class="ti ti-upload" aria-hidden="true"></i> Upload employees & send emails</button></div>
      <div id="bulkEmpResult" class="bulk-result"></div>
    </div>
    <div class="card"><div class="card-hd"><div class="card-title"><i class="ti ti-users" aria-hidden="true"></i> Employee management</div><button class="btn pri" onclick="openM('mEmp')"><i class="ti ti-user-plus" aria-hidden="true"></i> Add employee</button></div>
      <div class="fi" style="margin-bottom:12px"><label for="employeeSearch">Search employee</label><input id="employeeSearch" placeholder="Search by name or employee ID" oninput="renderEmpTable()"></div>
      <div style="overflow-x:auto"><table class="etable" id="eTable"></table></div>
    </div>`;
  }
  if(empPage&&typeof updateEmpSyncExcelHint==='function') updateEmpSyncExcelHint();
  let hrAccessPage=document.getElementById('pg-hrAccess');
  if(!hrAccessPage&&empPage){
    empPage.insertAdjacentHTML('afterend',`<div class="pg" id="pg-hrAccess"></div>`);
    hrAccessPage=document.getElementById('pg-hrAccess');
  }
  if(hrAccessPage){
    delete hrAccessPage.dataset.subtabsReady;
    hrAccessPage.innerHTML=`<div class="pg-title">Access management</div>
      <div class="pg-sub">Central Admin only — manage Central Admins, Company HR, and BU Head access</div>
      <div class="card">
        <div class="card-hd">
          <div class="card-title"><i class="ti ti-shield-lock" aria-hidden="true"></i> Central & Company HR access</div>
          <button class="btn pri" id="addHrBtn" onclick="openAddHrModal()"><i class="ti ti-user-plus" aria-hidden="true"></i> Add HR</button>
        </div>
        <div class="hint-box" style="margin-top:0;margin-bottom:10px">Only Central Admin can add, edit, or remove Central Admins, Company HRs, or BU Heads. Company HR cannot manage access lists.</div>
        <div id="hrAdminList"></div>
      </div>
      <div class="card" style="margin-top:14px">
        <div class="card-hd">
          <div class="card-title"><i class="ti ti-building" aria-hidden="true"></i> BU Head access</div>
          <button class="btn pri" id="addBuHeadBtn" onclick="openAddBuHeadModal()"><i class="ti ti-user-plus" aria-hidden="true"></i> Add BU Head</button>
        </div>
        <div class="hint-box" style="margin-top:0;margin-bottom:10px">Only Central Admin can add or edit BU Head logins. Scope by unit name, BU person, and company (one entity or all 5). Demo: buhead@company.com / bu@123 (Engineering · all companies).</div>
        <div id="buHeadAdminList"></div>
      </div>`;
  }
  // Unified nav already includes Access management + Salaries; skip legacy aSidebar injection.
  if(!document.getElementById('pg-salaries')){
    const hrAccessPage=document.getElementById('pg-hrAccess');
    if(hrAccessPage){
      hrAccessPage.insertAdjacentHTML('afterend',`<div class="pg" id="pg-salaries">
        <div class="pg-title">Salaries</div>
        <div class="pg-sub">Current CTC and salary history for increments and bonuses</div>
        <div class="stats">
          <div class="stat"><div class="stat-l">Employees</div><div class="stat-v" id="salEmpCount">0</div></div>
          <div class="stat"><div class="stat-l">With CTC</div><div class="stat-v" style="color:#3B6D11" id="salWithCtc">0</div></div>
          <div class="stat"><div class="stat-l">History entries</div><div class="stat-v" style="color:#534AB7" id="salHistoryCount">0</div></div>
          <div class="stat"><div class="stat-l">Total CTC</div><div class="stat-v" style="color:#854F0B" id="salTotalCtc">—</div></div>
        </div>
        <div class="card"><div class="card-hd"><div class="card-title"><i class="ti ti-currency-rupee" aria-hidden="true"></i> Employee salaries</div></div><div class="hint-box" style="margin-top:0;margin-bottom:10px">Previous CTC stays in history when you record an increment or bonus. Click an employee name to open CTC breakdown and salary history.</div><div class="fi" style="margin-bottom:12px"><label for="salarySearch">Search employee</label><input id="salarySearch" placeholder="Search by name or employee ID" oninput="renderSalaries()"></div><div id="salaryList"></div></div>
      </div>`);
    }
  }
  const ovEmp=document.querySelector('#pg-overview .stats .stat:first-child .stat-v');
  if(ovEmp) ovEmp.id='ovEmp';
  const empAv=document.querySelector('#s-employee .topbar .av');
  if(empAv) empAv.id='empAvatar';
  const empName=document.querySelector('#s-employee .topbar .uname');
  if(empName) empName.id='empTopName';
  const hrAv=document.querySelector('#s-admin .topbar .av');
  if(hrAv) hrAv.id='hrAvatar';
  const hrName=document.querySelector('#s-admin .topbar .uname');
  if(hrName) hrName.id='hrTopName';
  const aiSub=document.querySelector('#pg-aiChat .pg-sub');
  if(aiSub) aiSub.textContent='Ask about policies, leaves, benefits, or any HR question';
  const resModal=document.getElementById('mRes');
  if(resModal && !document.getElementById('mEmp')){
  resModal.insertAdjacentHTML('afterend',`
    <div class="modal-bg" id="mEmp">
      <div class="modal">
        <div class="modal-hd"><span id="empModalTitle">Add employee</span> <button class="btn sm" onclick="closeM('mEmp')" style="border:none"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <div class="fi"><label>Access type</label><select id="empAccessType" onchange="syncAddEmpAccessType()"><option value="employee">Employee</option><option value="buHead">BU Head</option><option value="hr">HR</option><option value="it">IT</option></select></div>
        <div class="fg2"><div class="fi"><label>Full name</label><input id="empName" placeholder="e.g. Neha S." oninput="onAddEmpNameInput()"></div><div class="fi"><label>Company email</label><input id="empEmail" type="email" placeholder="name@yourcompany.com"></div></div>
        <div class="fi"><label>Temporary password</label><input id="empPass" value="" placeholder="Auto-generated (HR can override)" autocomplete="new-password"></div>
        <div id="empFieldsEmployee">
          <div class="fg2"><div class="fi"><label>Employee ID</label><input id="empEmployeeCode" placeholder="e.g. VAY0001"></div><div class="fi"><label>Department</label><input id="empDept" placeholder="Engineering" list="empDeptList"><datalist id="empDeptList"><option value="IT"><option value="Engineering"><option value="HR"><option value="Finance"><option value="Design"><option value="Marketing"></datalist></div></div>
          <div class="fg2"><div class="fi"><label>Role</label><input id="empRole" placeholder="Product Manager"></div><div class="fi"><label>Company</label><select id="empCompany" onchange="fillAddEmpLocationOptions()"></select></div></div>
          <div class="fi"><label>Location</label><select id="empLocation" data-emp-field="location"></select></div>
        </div>
        <div id="empFieldsBuHead" style="display:none">
          <div class="fg2"><div class="fi"><label>Unit name (BU)</label><input id="empBuUnit" placeholder="e.g. Engineering"></div><div class="fi"><label>BU person name</label><input id="empBuPersonName" placeholder="Defaults to full name" oninput="this.dataset.touched='1'"></div></div>
          <div class="fg2"><div class="fi"><label>Company scope</label><select id="empBuCompanyScope"></select></div><div class="fi"><label>Budget (optional)</label><input id="empBuBudget" placeholder="e.g. 7500000"></div></div>
        </div>
        <div id="empFieldsHr" style="display:none">
          <div class="fg2"><div class="fi"><label>Title</label><input id="empHrTitle" placeholder="Company HR" value="Company HR" oninput="this.dataset.touched='1'"></div><div class="fi"><label>Access</label><select id="empHrAccessRole" onchange="syncAddEmpHrAccessFields()"><option value="company">Company HR</option><option value="central">Central Admin</option></select></div></div>
          <div class="fi" id="empHrCompanyField"><label>Company</label><select id="empHrCompany"></select></div>
        </div>
        <div id="empFieldsIt" style="display:none">
          <div class="fg2"><div class="fi"><label>Title</label><input id="empItTitle" placeholder="IT Asset Admin" value="IT Asset Admin"></div><div class="fi"><label>Company scope</label><select id="empItCompanyScope"></select></div></div>
        </div>
        <div class="hint-box" id="empModalHint" style="margin-top:0;margin-bottom:8px">The employee will use this temporary password once, then create a new private password on first login.</div>
        <div class="modal-foot"><button class="btn" onclick="closeM('mEmp')">Cancel</button><button class="btn pri" id="empModalSaveBtn" onclick="addEmployee()">Create login</button></div>
      </div>
    </div>
    <div class="modal-bg" id="mEditEmp">
      <div class="modal">
        <div class="modal-hd">Edit employee <button class="btn sm" onclick="closeM('mEditEmp')" style="border:none"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <input id="editEmpId" type="hidden">
        <div class="fg2"><div class="fi"><label>Full name</label><input id="editEmpName"></div><div class="fi"><label>Company email</label><input id="editEmpEmail" type="email"></div></div>
        <div class="fg2"><div class="fi"><label>Employee ID</label><input id="editEmpEmployeeCode" placeholder="e.g. VAY0001"></div><div class="fi"><label>Company</label><select id="editEmpCompany"></select></div></div>
        <div class="fg2"><div class="fi"><label>Status</label><select id="editEmpStatus"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div><div class="fi"><label>Employee location</label><input id="editEmpLocation" data-emp-field="location" list="editEmpLocationList" placeholder="e.g. Pune — Shivkamal Office"></div></div>
        <datalist id="editEmpLocationList">${employeeLocationPresetOptions().map(v=>`<option value="${String(v).replace(/"/g,'&quot;')}">`).join('')}</datalist>
        <div class="fg2"><div class="fi"><label for="editEmpDateOfJoining">Date of joining</label><input type="date" id="editEmpDateOfJoining"></div><div class="fi"><label>Last DOJ edit</label><div id="editEmpDojEditedAt" class="hint-box" style="margin:0;padding:8px 10px;font-size:12px">Not edited yet</div></div></div>
        <div class="hint-box" style="margin-top:0;margin-bottom:8px">Employee location appears as reporting place on home, directory, and team views. Joining date can be corrected here — changes are timestamped for audit and update tenure and probation automatically.</div>
        <div class="modal-foot"><button class="btn" onclick="closeM('mEditEmp')">Cancel</button><button class="btn pri" onclick="saveEmployeeEdits()">Save changes</button></div>
      </div>
    </div>
    <div class="modal-bg" id="mHr">
      <div class="modal">
        <div class="modal-hd"><span id="hrModalTitle">Add HR (Admin portal)</span> <button class="btn sm" onclick="closeM('mHr')" style="border:none"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <input type="hidden" id="hrEditId" value="">
        <div class="fg2"><div class="fi"><label>Full name</label><input id="hrName" placeholder="e.g. Neha HR"></div><div class="fi"><label>Title</label><input id="hrTitle" placeholder="Company HR" value="Company HR"></div></div>
        <div class="fg2"><div class="fi"><label>Admin email</label><input id="hrEmail" type="email" placeholder="hr@company.com"></div><div class="fi"><label id="hrPassLabel">Temporary password</label><input id="hrPass" value="hr@123"></div></div>
        <div class="fg2"><div class="fi"><label>Access type</label><select id="hrAccessRole" onchange="syncHrAccessRoleFields()"><option value="company">Company HR</option><option value="central">Central Admin (all entities)</option></select></div><div class="fi" id="hrCompanyField"><label>Company access</label><select id="hrCompany"></select></div></div>
        <div class="hint-box" id="hrModalHint" style="margin-top:0;margin-bottom:8px">This login opens the Admin portal for the selected company only.</div>
        <div class="modal-foot"><button class="btn" onclick="closeM('mHr')">Cancel</button><button class="btn pri" id="hrModalSaveBtn" onclick="saveHrAdmin()">Create HR login</button></div>
      </div>
    </div>`);
  }else if(resModal && !document.getElementById('mHr')){
    resModal.insertAdjacentHTML('afterend',`
    <div class="modal-bg" id="mHr">
      <div class="modal">
        <div class="modal-hd"><span id="hrModalTitle">Add HR (Admin portal)</span> <button class="btn sm" onclick="closeM('mHr')" style="border:none"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <input type="hidden" id="hrEditId" value="">
        <div class="fg2"><div class="fi"><label>Full name</label><input id="hrName" placeholder="e.g. Neha HR"></div><div class="fi"><label>Title</label><input id="hrTitle" placeholder="Company HR" value="Company HR"></div></div>
        <div class="fg2"><div class="fi"><label>Admin email</label><input id="hrEmail" type="email" placeholder="hr@company.com"></div><div class="fi"><label id="hrPassLabel">Temporary password</label><input id="hrPass" value="hr@123"></div></div>
        <div class="fg2"><div class="fi"><label>Access type</label><select id="hrAccessRole" onchange="syncHrAccessRoleFields()"><option value="company">Company HR</option><option value="central">Central Admin (all entities)</option></select></div><div class="fi" id="hrCompanyField"><label>Company access</label><select id="hrCompany"></select></div></div>
        <div class="hint-box" id="hrModalHint" style="margin-top:0;margin-bottom:8px">This login opens the Admin portal for the selected company only.</div>
        <div class="modal-foot"><button class="btn" onclick="closeM('mHr')">Cancel</button><button class="btn pri" id="hrModalSaveBtn" onclick="saveHrAdmin()">Create HR login</button></div>
      </div>
    </div>`);
  }
  document.querySelectorAll('.modal-bg').forEach(bg=>bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('open')}));
  window.addEventListener('storage',handlePortalStoreStorageEvent);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') refreshPortalStore();
  });
  window.setInterval(refreshPortalStore,2000);
  window.setInterval(()=>{
    if(hasManagementAccess()) syncOnboardingHandoff({manual:false});
  },8000);
  syncOnboardingHandoff({manual:false}).catch(err=>console.error('Initial onboarding sync failed:',err));
  initAllPageSubtabs();
  }catch(err){
    console.error('VayanaPulse UI enhance failed:',err);
  }
}

function prepareLoginFields(){
  document.querySelectorAll('.login-empty-field').forEach((input)=>{
    input.removeAttribute('readonly');
    input.disabled=false;
    delete input.dataset.userTyped;
  });
}

function bindLoginEmptyFields(){
  prepareLoginFields();
  document.querySelectorAll('.login-empty-field').forEach((input)=>{
    input.addEventListener('input',()=>{ input.dataset.userTyped='1'; });
  });
}

function clearLoginCardFields(){
  document.querySelectorAll('.login-empty-field').forEach((input)=>{
    if(input.dataset.userTyped==='1') return;
    input.value='';
  });
}

function scheduleLoginFieldClear(){
  window.setTimeout(()=>clearLoginCardFields(),0);
}

window.selRole=function(r){
  if(r==='buHead'){
    liveRole='buHead';
    loginRole='buHead';
  }else if(r==='admin'||r==='hr'){
    liveRole='hr';
    loginRole='admin';
  }else{
    liveRole='employee';
    loginRole='employee';
  }
  const showPassword=document.getElementById('showLoginPassword');
  if(showPassword) showPassword.checked=false;
  const passInput=document.getElementById('lPass');
  if(passInput) passInput.type='password';
  document.getElementById('rt-admin')?.classList.toggle('sel',liveRole==='hr');
  document.getElementById('rt-emp')?.classList.toggle('sel',liveRole==='employee');
  document.getElementById('rt-buHead')?.classList.toggle('sel',liveRole==='buHead');
  const emailEl=document.getElementById('lEmail');
  const passEl=document.getElementById('lPass');
  if(emailEl){ emailEl.dataset.userTyped=''; emailEl.value=''; }
  if(passEl){ passEl.dataset.userTyped=''; passEl.value=''; }
  const loginHint=document.getElementById('loginHint');
  if(loginHint){
    loginHint.hidden=false;
    loginHint.style.display='';
    loginHint.innerHTML=`<strong>Demo logins</strong><br>Super Admin: <code>admin@company.com</code> / <code>admin@123</code><br>Company HR (Vayana): <code>hr.vayana@company.com</code> / <code>hr123</code><br>Employee: <code>priya@company.com</code> / <code>emp123</code>`;
  }
};

window.openAdminPasswordModal=function(){
  if(!hasManagementAccess()){
    toast('Please sign in with an HR account first');
    return;
  }
  document.getElementById('adminCurrentPass').value='';
  document.getElementById('adminNewPass1').value='';
  document.getElementById('adminNewPass2').value='';
  document.getElementById('adminPwdErr').style.display='none';
  openM('mAdminPwd');
};

window.saveAdminPassword=function(){
  const currentPass=document.getElementById('adminCurrentPass').value;
  const newPass1=document.getElementById('adminNewPass1').value;
  const newPass2=document.getElementById('adminNewPass2').value;
  const err=document.getElementById('adminPwdErr');
  const hr=store.hrs.find(user=>user.email.toLowerCase()===String(currentUser?.email||'').toLowerCase());

  if(!hr || hr.password!==currentPass || newPass1.length<6 || newPass1!==newPass2){
    err.style.display='block';
    return;
  }

  hr.password=newPass1;
  hr.mustChangePassword=false;
  hr.passwordChangedInPortal=true;
  currentUser=buildUnifiedSession(hr);
  saveStore();
  closeM('mAdminPwd');
  toast('Admin password updated');
  if(document.getElementById('lPass')) document.getElementById('lPass').value=newPass1;
};

async function syncEmployeesBeforeLogin(){
  let rows=[];
  try{
    const response=await fetch('/api/employee-sheet',{cache:'no-store'});
    if(response.ok){
      const data=await response.json();
      rows=Array.isArray(data.employees)?data.employees:[];
      if(data.modifiedAt) lastEmployeeSheetModifiedAt=data.modifiedAt;
    }
  }catch{
    // The deployed static site falls back to its bundled employee CSV.
  }
  if(!rows.length){
    try{
      const response=await fetch(`/employees.csv?ts=${Date.now()}`,{cache:'no-store'});
      if(response.ok) rows=parseEmployeeCsv(await response.text());
    }catch{
      // Existing browser records remain available when neither source can be reached.
    }
  }
  if(rows.length) await applyEmployeeRows(rows,{source:'onboarding employee master',sendEmails:false,preserveHrFields:true});
}

async function syncAdminsFromBackend(){
  try{
    const response=await fetch('/api/admin-access',{cache:'no-store'});
    if(!response.ok) return;
    const data=await response.json();
    const admins=Array.isArray(data.admins)?data.admins:[];
    if(!admins.length) return;
    store.hrs=store.hrs||[];
    admins.forEach(admin=>{
      const email=String(admin.email||'').trim().toLowerCase();
      if(!email||!admin.password) return;
      const existing=store.hrs.find(h=>String(h.email||'').toLowerCase()===email);
      const rawRole=String(admin.accessRole||'').toLowerCase();
      const accessRole=rawRole==='company'||rawRole==='central'
        ?rawRole
        :(existing?.accessRole==='company'?'company':'central');
      const companyId=accessRole==='company'
        ?resolveCompanyId(admin.companyId||existing?.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')
        :PORTAL_ALL_COMPANIES_ID;
      const displayName=accessRole==='company'?companyNameById(companyId):(admin.name||existing?.name||'Central Admin');
      if(existing){
        existing.name=displayName;
        // Never overwrite an existing portal password from Excel/CSV.
        existing.title=admin.title||existing.title;
        existing.accessRole=accessRole;
        existing.companyId=companyId;
        if(existing.status==='Inactive') existing.status='Active';
      }else{
        store.hrs.push({
          id:admin.id||`hr-${Date.now()}`,
          name:displayName,
          email,
          password:admin.password,
          title:admin.title||(accessRole==='company'?'Company HR':'Central Admin'),
          accessRole,
          companyId,
          mustChangePassword:false,
          status:'Active'
        });
      }
    });
    if(hasManagementAccess()){
      const refreshed=(store.hrs||[]).find(h=>h.id===currentUser.id||h.id===currentUser.hrId||String(h.email||'').toLowerCase()===String(currentUser.email||'').toLowerCase());
      if(refreshed) currentUser=buildUnifiedSession(refreshed);
    }
    saveStore();
  }catch(err){
    console.error('Admin access sync failed:',err);
  }
}

async function syncOnboardingHandoff({manual=false}={}){
  await syncAdminsFromBackend();
  if(manual) await syncEmployeesFromBackendSheet(true);
  else await syncEmployeesBeforeLogin();
  if(hasManagementAccess()){
    applyHrCompanyScopeFromUser(currentUser);
    try{
      if(typeof renderEmpTable==='function') renderEmpTable();
      if(typeof renderOverview==='function') renderOverview();
      if(typeof renderQueries==='function') renderQueries();
      if(typeof renderAdminBvg==='function') renderAdminBvg();
      if(document.getElementById('pg-onboarding')?.classList.contains('act')) renderOnboardingPage();
    }catch(err){console.error(err);}
  }
}

window.doLogin=async function(){
  try{
    await Promise.race([
      backendStoreReady,
      new Promise(resolve=>setTimeout(resolve,2500))
    ]);
    await Promise.race([
      syncOnboardingHandoff({manual:false}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Onboarding sync timed out')),8000))
    ]).catch(err=>{
      console.warn('Login sync warning:',err);
    });
    ensureCentralAdminAccounts();
    const email=document.getElementById('lEmail').value.trim().toLowerCase();
    const pass=String(document.getElementById('lPass').value||'').replace(/^\s+|\s+$/g,'');
    const err=document.getElementById('lErr');
    const user=findUnifiedLogin(email,pass);
    if(!user){
      // Candidate credentials belong on the same-origin onboarding SPA
      try{
        const res=await fetch('/api/employees',{cache:'no-store'});
        if(res.ok){
          const data=await res.json();
          const records=Array.isArray(data.records)?data.records:[];
          const candidate=records.find(r=>{
            const id=String(r.candidateId||r.email||'').trim().toLowerCase();
            const pwd=String(r.candidatePassword||'');
            return id===email&&pwd===pass&&!r.candidateAccessRevoked;
          });
          if(candidate){
            location.assign(`/onboarding/index.html?login=candidate&email=${encodeURIComponent(email)}`);
            return;
          }
        }
      }catch(_err){ /* fall through to normal error */ }
      const anyEmail=[...(store.hrs||[]),...(store.buHeads||[]),...(store.itUsers||[]),...(store.employees||[])].filter(u=>emailKey(u.email)===email);
      if(!anyEmail.length){
        err.textContent='Account not found for this email. Ask HR to add you. Candidates: use Candidate onboarding link.';
      }else if(anyEmail.some(u=>u.status==='Inactive')&&!anyEmail.some(u=>u.status!=='Inactive')){
        err.textContent='This account is Inactive. Contact HR to reactivate it.';
      }else{
        err.textContent='Wrong password for this email. Use Forgot password, or ask HR to reset it.';
      }
      err.style.display='block';
      return;
    }
    currentUser=buildUnifiedSession(user);
    liveRole=currentUser.portal==='hr'?'hr':(currentUser.portal==='buHead'?'buHead':(currentUser.portal==='it'?'it':'employee'));
    document.getElementById('lErr').style.display='none';
    if(hasManagementAccess()) applyHrCompanyScopeFromUser(currentUser);
    if(user.mustChangePassword||(currentUser.isEmployee&&employeeById(currentUser.id)?.mustChangePassword)){
      const pass1=document.getElementById('newPass1');
      const pass2=document.getElementById('newPass2');
      const pwdErr=document.getElementById('pwdErr');
      if(pass1&&pass2&&document.getElementById('mPwd')){
        pass1.value='';
        pass2.value='';
        if(pwdErr) pwdErr.style.display='none';
        openM('mPwd');
        return;
      }
    }
    enterPortal();
  }catch(err){
    console.error('Login failed:',err);
    document.getElementById('lErr').style.display='block';
    toast('Login failed. Please refresh and try again.');
  }
};

window.openForgotPassword=function(){
  document.getElementById('forgotHint').textContent='Enter your portal email. We will reset your password and email a temporary one.';
  document.getElementById('forgotEmail').value=(document.getElementById('lEmail').value||'').trim();
  document.getElementById('forgotErr').style.display='none';
  const ok=document.getElementById('forgotOk');
  ok.style.display='none';
  ok.textContent='';
  document.getElementById('forgotSubmitBtn').disabled=false;
  openM('mForgot');
};

async function sendResetPasswordEmail(user,tempPass,portalLabel){
  const res=await fetch('/api/send-reset-password-email',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      companyName:COMPANY.companyName,
      portalName:COMPANY.portalName,
      portalUrl:location.origin+'/index.html',
      portalLabel,
      user:{name:user.name,email:user.email,tempPassword:tempPass}
    })
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Email could not be sent');
  return data;
}

window.submitForgotPassword=async function(){
  await backendStoreReady;
  const email=document.getElementById('forgotEmail').value.trim().toLowerCase();
  const err=document.getElementById('forgotErr');
  const ok=document.getElementById('forgotOk');
  const btn=document.getElementById('forgotSubmitBtn');
  err.style.display='none';
  ok.style.display='none';
  ok.textContent='';

  if(!isEmail(email)){
    err.textContent='Enter a valid email registered for this portal.';
    err.style.display='block';
    return;
  }

  const list=[...(store.hrs||[]),...(store.buHeads||[]),...(store.itUsers||[]),...(store.employees||[])];
  const user=list.find(u=>u.email.toLowerCase()===email&&u.status!=='Inactive');
  if(!user){
    err.textContent='No active account found for this email.';
    err.style.display='block';
    return;
  }

  const tempPass=tempPassword();
  user.password=tempPass;
  user.mustChangePassword=true;
  user.passwordChangedInPortal=false;
  saveStore();

  const portalLabel=store.hrs.some(h=>emailKey(h.email)===email)?'admin':(store.buHeads||[]).some(h=>emailKey(h.email)===email)?'BU Head':(store.itUsers||[]).some(h=>emailKey(h.email)===email)?'IT':'employee';
  btn.disabled=true;
  try{
    await sendResetPasswordEmail(user,tempPass,portalLabel);
    ok.textContent=`A temporary password was emailed to ${user.email}. Sign in with it, then create a new password.`;
    ok.style.display='block';
    toast('Temporary password sent by email');
  }catch(e){
    ok.textContent=`Password reset. Email could not be sent (${e.message}). Temporary password: ${tempPass}. Sign in, then create a new password.`;
    ok.style.display='block';
    toast('Password reset (email unavailable)');
  }finally{
    btn.disabled=false;
    document.getElementById('lEmail').value='';
    document.getElementById('lPass').value='';
  }
};

function resetPortalScroll(){
  window.scrollTo(0,0);
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
}

function showScreen(screenId){
  resetPortalScroll();
  const unifiedId=(screenId==='s-admin'||screenId==='s-buHead'||screenId==='s-app')?'s-employee':screenId;
  document.body.classList.toggle('portal-open',unifiedId!=='s-login');
  document.body.classList.toggle('is-admin-app',false);
  document.body.classList.toggle('is-employee-app',unifiedId==='s-employee');
  document.body.classList.toggle('is-buhead-app',false);
  document.body.classList.toggle('is-unified-app',unifiedId==='s-employee');
  if(unifiedId==='s-login'){
    document.body.classList.remove('login-admin','login-employee','login-buhead');
    document.body.classList.add('login-unified');
    const roleTabs=document.getElementById('loginRoleTabs')||document.querySelector('.role-tabs');
    if(roleTabs){ roleTabs.hidden=true; roleTabs.style.display='none'; }
    const emailEl=document.getElementById('lEmail');
    const passEl=document.getElementById('lPass');
    if(emailEl){ emailEl.value=''; delete emailEl.dataset.userTyped; emailEl.removeAttribute('readonly'); }
    if(passEl){ passEl.value=''; passEl.type='password'; delete passEl.dataset.userTyped; passEl.removeAttribute('readonly'); }
    prepareLoginFields();
    const showPassword=document.getElementById('showLoginPassword');
    if(showPassword) showPassword.checked=false;
  }else{
    document.body.classList.remove('login-admin','login-employee','login-buhead','login-unified');
  }
  document.querySelectorAll('.screen').forEach(screen=>{
    screen.classList.remove('active');
    screen.style.display='none';
    screen.style.minHeight='0';
    screen.style.height='0';
  });
  const active=document.getElementById(unifiedId);
  if(active){
    active.classList.add('active');
    active.style.display='flex';
    active.style.minHeight='100vh';
    active.style.height='auto';
  }
  resetPortalScroll();
  requestAnimationFrame(resetPortalScroll);
  setTimeout(resetPortalScroll,0);
  setTimeout(resetPortalScroll,120);
}

function enterPortal(){
  resetPortalScroll();
  assembleUnifiedShell();
  ensureCentralAdminAccounts();
  if(typeof applyDueTransfers==='function'){
    if(applyDueTransfers()) saveStore();
  }
  // Persist any auto-linked BU Head / HR / IT employee profile created during session build
  if((currentUser?.isBuHead||currentUser?.isCentral||currentUser?.isCompanyHr||currentUser?.isIt)&&currentUser?.id) saveStore();
  showScreen('s-employee');
  applyUnifiedNavVisibility();
  refreshUnifiedTopbar();
  if(hasManagementAccess()){
    applyHrCompanyScopeFromUser(currentUser);
    syncOnboardingHandoff({manual:false}).then(()=>{
      try{renderPolicies();renderQueries();renderEmpTable();renderOverview();renderBuHeadAdminList();}catch(err){console.error(err);}
    }).catch(err=>{
      console.error(err);
      try{renderPolicies();renderQueries();renderEmpTable();renderOverview();renderBuHeadAdminList();}catch(renderErr){console.error(renderErr);}
    });
  }
  if(hasSelfServiceAccess()){
    try{updateBars();initChat();renderEmployeeHome();renderMyLeaveRequests();syncTeamLeavesNav();connectLiveColleagueChat();}catch(err){console.error(err);}
    const selfEmp=employeeById(currentUser?.id);
    if(selfEmp){
      syncOnboardingDocumentsForEmployee(selfEmp).then(changed=>{
        if(changed&&document.getElementById('pg-eDocuments')?.classList.contains('act')) renderEmployeeDocuments();
      }).catch(()=>{});
    }
  }
  if(hasBuHeadAccess()){
    try{renderBuHeadOverview();renderBuHeadTeam();}catch(err){console.error(err);}
  }
  if(hasItAccess()){
    try{renderItAssets();}catch(err){console.error(err);}
  }
  const start=defaultUnifiedPage();
  goPage(start,document.querySelector(`#eSidebar .ni[onclick*="'${start}'"]`));
  refreshPortalStore();
}

window.saveNewPassword=function(){
  const p1=document.getElementById('newPass1').value;
  const p2=document.getElementById('newPass2').value;
  const err=document.getElementById('pwdErr');
  if(p1.length<6||p1!==p2){
    err.style.display='block';
    return;
  }
  const email=emailKey(currentUser?.email);
  const accounts=[
    ...(store.hrs||[]).filter(u=>emailKey(u.email)===email),
    ...(store.buHeads||[]).filter(u=>emailKey(u.email)===email),
    ...(store.itUsers||[]).filter(u=>emailKey(u.email)===email),
    ...(store.employees||[]).filter(u=>emailKey(u.email)===email||u.id===currentUser?.id)
  ];
  if(!accounts.length){toast('Please sign in again');closeM('mPwd');return;}
  accounts.forEach(account=>{
    account.password=p1;
    account.mustChangePassword=false;
    account.passwordChangedInPortal=true;
  });
  currentUser=buildUnifiedSession(accounts[0]);
  liveRole=currentUser.portal==='hr'?'hr':(currentUser.portal==='buHead'?'buHead':(currentUser.portal==='it'?'it':'employee'));
  saveStore();
  closeM('mPwd');
  toast('Password updated');
  enterPortal();
};

window.logout=function(){
  if(chatEventSource){chatEventSource.close();chatEventSource=null;}
  currentUser=null;
  showScreen('s-login');
};

window.renderPolicies=function(){
  const l=document.getElementById('polList');
  l.innerHTML='';
  const policies=scopedPolicies();
  policies.forEach(p=>{
    const d=document.createElement('div');
    d.className='row-item';
    const companyMeta=p.companyId&&p.companyId!==PORTAL_ALL_COMPANIES_ID?` - ${safeText(companyCodeById(p.companyId))}`:'';
    d.innerHTML=`<div><div class="ri-name">${p.name}</div><div class="ri-meta">${p.cat} - ${p.date} - ${policyFormatLabel(p)}${companyMeta}</div><div class="query-msg">${policySummary(p)}</div>${policyAttachmentLink(p)}</div><div class="ri-right"><span class="badge b-${p.status.toLowerCase()}">${p.status}</span><button class="btn sm" title="Cycle status" onclick="cycleStatus(${p.id})"><i class="ti ti-refresh" aria-hidden="true"></i></button><button class="btn sm danger" title="Delete" onclick="delPol(${p.id})"><i class="ti ti-trash" aria-hidden="true"></i></button></div>`;
    l.appendChild(d);
  });
  document.getElementById('sTot').textContent=policies.length;
  document.getElementById('sAct').textContent=policies.filter(p=>p.status==='Active').length;
  document.getElementById('sDraft').textContent=policies.filter(p=>p.status==='Draft').length;
  document.getElementById('sArch').textContent=policies.filter(p=>p.status==='Archived').length;
};

window.importPolicies=async function(){
  const button=document.getElementById('policyTokenizeBtn');
  const preview=document.getElementById('policyTokenPreview');
  const setPreview=(msg,type='info')=>{
    if(preview) preview.innerHTML=`<div class="token-message token-${type}">${msg}</div>`;
  };
  const previousButtonText=button?.innerHTML;
  if(button){
    button.disabled=true;
    button.innerHTML='<i class="ti ti-loader-2" aria-hidden="true"></i> Tokenizing...';
  }
  try{
    const fallbackName=document.getElementById('pN').value.trim()||'Company Policy';
    const file=document.getElementById('pMasterDoc')?.files?.[0];
    let text=document.getElementById('pDs').value.trim();
    let fileData='', fileName='', sourceId='';
    if(file){
      if(file.size>4*1024*1024){
        setPreview('This file is too large for browser storage. Please upload a file under 4 MB or paste the policy text.', 'error');
        toast('Policy document must be under 4 MB');
        return;
      }
      try{
        fileName=file.name;
        setPreview(`Reading ${fileName}...`);
        fileData=await fileToDataUrl(file);
        text=await extractPolicyMasterText(file,fileData);
      }catch(err){
        setPreview(err.message||'Could not read master policy document', 'error');
        toast(err.message||'Could not read master policy document');
        return;
      }
    }
    if(!text){
      setPreview('Upload a master policy document or paste policy text.', 'error');
      toast('Upload a master policy document or paste policy text');
      return;
    }
    const tokens=tokenizePolicyDocument(text,fallbackName);
    if(!tokens.length){
      setPreview('No policy sections were found. Add clear headings like "Annual Leave Policy" or paste each policy under a heading.', 'error');
      toast('No policy sections found');
      return;
    }
    setPreview(`Found ${tokens.length} policy section${tokens.length===1?'':'s'}: ${tokens.slice(0,5).map(t=>t.name).join(', ')}${tokens.length>5?'...':''}`);
    const cat=document.getElementById('pC').value;
    const status=document.getElementById('pSt').value;
    const date=document.getElementById('pDt').value||new Date().toISOString().slice(0,10);
    const now=new Date().toISOString();
    const beforePolicies=store.policies.slice();
    const beforeSources=(store.policySources||[]).slice();
    const beforeNextPolicyId=store.nextPolicyId;
    if(fileData){
      sourceId=`policy-source-${Date.now()}`;
      store.policySources=store.policySources||[];
      store.policySources.unshift({id:sourceId,fileName,fileData,uploadedAt:now});
    }
    const imported=tokens.map(token=>({
      id:store.nextPolicyId++,
      name:token.name,
      cat,
      status,
      date,
      format:file?'master-document':'text',
      desc:token.desc,
      sourceFileName:fileName,
      sourceId,
      updatedAt:now,
      companyId:writeTargetCompanyId()
    }));
    store.policies.push(...imported);
    try{
      saveStore();
    }catch(err){
      store.policies=beforePolicies;
      store.policySources=beforeSources;
      store.nextPolicyId=beforeNextPolicyId;
      setPreview('The policies were tokenized, but the browser could not save them. Try a smaller document or paste plain text.', 'error');
      toast('Could not save imported policies');
      return;
    }
    closeM('mPol');
    resetPolicyForm();
    renderPolicies();
    toast(`${imported.length} polic${imported.length===1?'y':'ies'} created from master document`);
  }finally{
    if(button){
      button.disabled=false;
      button.innerHTML=previousButtonText||'<i class="ti ti-wand" aria-hidden="true"></i> Tokenize & save policies';
    }
  }
};
window.addPolicy=window.importPolicies;
window.delPol=function(id){store.policies=store.policies.filter(p=>p.id!==id);saveStore();renderPolicies();toast('Policy removed');};
window.cycleStatus=function(id){
  const p=store.policies.find(x=>x.id===id);
  if(!p) return;
  p.status=p.status==='Active'?'Draft':p.status==='Draft'?'Archived':'Active';
  p.updatedAt=new Date().toISOString();
  saveStore();renderPolicies();toast(`Status changed to ${p.status}`);
};

window.renderQueries=function(){
  const l=document.getElementById('aQList');
  l.innerHTML='';
  const scopedQueries=adminScopedQueries();
  [...scopedQueries].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).forEach(q=>{
    const d=document.createElement('div');
    d.className='row-item';
    d.style.cssText='flex-direction:column;align-items:flex-start;gap:6px';
    d.innerHTML=`<div style="display:flex;justify-content:space-between;width:100%;align-items:center;gap:10px"><div><div class="ri-name">${q.subject}</div><div class="ri-meta">${q.emp} - ${q.category||'General'} - Raised ${formatQueryTime(q.createdAt)}</div><div class="query-msg">${q.msg}</div></div><span class="badge b-${q.status}">${q.status}</span></div>${q.response?`<div style="font-size:11px;color:#27500A;background:#EAF3DE;padding:5px 8px;border-radius:4px;width:100%"><i class="ti ti-check" aria-hidden="true"></i> ${q.response}</div>`:q.status!=='resolved'?`<button class="btn sm" onclick="openResolve(${q.id})">Respond &amp; resolve</button>`:''}`;
    l.appendChild(d);
  });
  const open=scopedQueries.filter(q=>q.status!=='resolved').length;
  document.getElementById('qBadge').textContent=open;
  const ov=document.getElementById('ovQ'); if(ov) ov.textContent=open;
};

window.openResolve=function(id){
  liveResolveId=id;
  const q=store.queries.find(x=>x.id===id);
  if(!queryInHrScope(q)){toast('You can only respond to queries from your company');return;}
  document.getElementById('resDetail').innerHTML=`<strong>${q.subject}</strong><br><span style="color:var(--color-text-tertiary)">${q.emp}</span><br>${q.msg}`;
  document.getElementById('hrR').value='';
  openM('mRes');
};
window.resolveQ=function(){
  const r=document.getElementById('hrR').value.trim();
  if(!r){toast('Enter a response');return;}
  const q=store.queries.find(x=>x.id===liveResolveId);
  if(!queryInHrScope(q)){toast('You can only respond to queries from your company');return;}
  if(q){q.status='resolved';q.response=r; q.resolvedAt=new Date().toISOString();}
  saveStore();closeM('mRes');renderQueries();
  if(document.getElementById('myQueryList')) renderMyQueries();
  toast('Query resolved');
};

function bvgStats(employee){
  const docs=employee?.bvg?.docs||{};
  const uploaded=BVG_DOCUMENTS.filter(doc=>docs[doc.key]?.fileData).length;
  return {uploaded,total:BVG_DOCUMENTS.length,complete:uploaded===BVG_DOCUMENTS.length};
}

function bvgStatusLabel(status){
  if(status==='approved') return 'Approved';
  if(status==='rejected') return 'Changes requested';
  if(status==='submitted') return 'Submitted to HR';
  return 'Pending upload';
}

function renderPreboardingPortal(){
  const employee=employeeById(currentUser?.id);
  const area=document.getElementById('preboardingPortal');
  if(!employee||!area) return;
  employee.bvg=employee.bvg||{status:'pending',docs:{}};
  employee.bvg.docs=employee.bvg.docs||{};
  const stats=bvgStats(employee);
  const status=document.getElementById('preboardingStatus');
  if(status){
    status.textContent=bvgStatusLabel(employee.bvg.status);
    status.className=`preboarding-status ${employee.bvg.status}`;
  }
  const avatar=document.getElementById('preAvatar');
  const name=document.getElementById('preName');
  if(avatar) avatar.textContent=initials(employee.name);
  if(name) name.textContent=employee.name;
  const locked=employee.bvg.status==='submitted';
  const rejected=employee.bvg.status==='rejected';
  area.innerHTML=`
    <div class="stats">
      <div class="stat"><div class="stat-l">Documents uploaded</div><div class="stat-v">${stats.uploaded}/${stats.total}</div></div>
      <div class="stat"><div class="stat-l">BVG status</div><div class="stat-v" style="font-size:18px">${bvgStatusLabel(employee.bvg.status)}</div></div>
      <div class="stat"><div class="stat-l">Portal access</div><div class="stat-v" style="font-size:18px">${employee.bvg.status==='approved'?'Unlocked':'Locked'}</div></div>
    </div>
    ${rejected&&employee.bvg.note?`<div class="hint-box danger-soft"><strong>HR requested changes:</strong><br>${employee.bvg.note}</div>`:''}
    <div class="bvg-grid">
      ${BVG_DOCUMENTS.map(doc=>{
        const uploaded=employee.bvg.docs[doc.key];
        return `<div class="bvg-card ${uploaded?'done':''}">
          <div class="bvg-icon"><i class="ti ${uploaded?'ti-check':'ti-upload'}" aria-hidden="true"></i></div>
          <div>
            <div class="ri-name">${doc.label}</div>
            <div class="ri-meta">${doc.hint}</div>
            ${uploaded?`<div class="ri-meta">Uploaded ${formatQueryTime(uploaded.uploadedAt)} - ${uploaded.fileName}</div>`:''}
          </div>
          <div class="bvg-actions">
            ${uploaded?`<a class="btn sm" href="${uploaded.fileData}" download="${uploaded.fileName}" target="_blank" rel="noopener"><i class="ti ti-download" aria-hidden="true"></i> View</a>`:''}
            <label class="btn sm ${locked?'disabled':''}"><i class="ti ti-file-upload" aria-hidden="true"></i> ${uploaded?'Replace':'Upload'}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" ${locked?'disabled':''} onchange="uploadBvgDocument('${doc.key}',this.files[0])" hidden></label>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-hd"><div class="card-title"><i class="ti ti-lock-check" aria-hidden="true"></i> Submit for HR approval</div></div>
      <div class="hint-box" style="margin-top:0">You can access the full employee portal only after HR approves all BVG documents.</div>
      <button class="btn pri" onclick="submitBvgForReview()" ${!stats.complete||locked?'disabled':''}><i class="ti ti-send" aria-hidden="true"></i> ${locked?'Submitted to HR':'Submit documents'}</button>
    </div>`;
}

window.uploadBvgDocument=async function(key,file){
  const employee=employeeById(currentUser?.id);
  if(!employee||!file) return;
  if(file.size>3*1024*1024){toast('Document must be under 3 MB');return;}
  employee.bvg=employee.bvg||{status:'pending',docs:{}};
  employee.bvg.docs=employee.bvg.docs||{};
  try{
    employee.bvg.docs[key]={fileName:file.name,fileData:await fileToDataUrl(file),uploadedAt:new Date().toISOString()};
    if(employee.bvg.status==='rejected'){
      employee.bvg.status='pending';
      employee.bvg.note='';
    }
    saveStore();
    renderPreboardingPortal();
    toast('Document uploaded');
  }catch(err){
    toast('Could not read document');
  }
};

window.submitBvgForReview=function(){
  const employee=employeeById(currentUser?.id);
  if(!employee) return;
  if(!bvgStats(employee).complete){toast('Upload all required BVG documents first');return;}
  employee.bvg.status='submitted';
  employee.bvg.submittedAt=new Date().toISOString();
  saveStore();
  renderPreboardingPortal();
  toast('Submitted to HR for approval');
};

function renderAdminBvg(){
  const area=document.getElementById('adminBvgList');
  if(!area) return;
  const employees=adminVisibleEmployees().sort((a,b)=>{
    const order={submitted:0,rejected:1,pending:2,approved:3};
    return (order[a.bvg?.status]??9)-(order[b.bvg?.status]??9)||a.name.localeCompare(b.name);
  });
  area.innerHTML=`
    <div class="stats">
      <div class="stat"><div class="stat-l">Submitted</div><div class="stat-v">${employees.filter(e=>e.bvg?.status==='submitted').length}</div></div>
      <div class="stat"><div class="stat-l">Pending</div><div class="stat-v">${employees.filter(e=>['pending','rejected'].includes(e.bvg?.status)).length}</div></div>
      <div class="stat"><div class="stat-l">Approved</div><div class="stat-v">${employees.filter(e=>e.bvg?.status==='approved').length}</div></div>
    </div>
    <div class="card">
      <div class="card-hd"><div class="card-title"><i class="ti ti-shield-check" aria-hidden="true"></i> Candidate BVG queue</div></div>
      ${employees.map(employee=>{
        const stats=bvgStats(employee);
        const docs=employee.bvg?.docs||{};
        return `<div class="row-item bvg-admin-row">
          <div>
            <div class="ri-name">${employee.name}</div>
            <div class="ri-meta">${employee.email} - ${employee.dept||'General'} - ${stats.uploaded}/${stats.total} documents</div>
            <div class="bvg-doc-links">${BVG_DOCUMENTS.map(doc=>{
              const uploaded=docs[doc.key];
              return uploaded?.fileData
                ? `<div class="bvg-doc-chip"><span><i class="ti ti-file" aria-hidden="true"></i> ${doc.label}</span><button type="button" onclick="viewBvgDocument('${employee.id}','${doc.key}')"><i class="ti ti-eye" aria-hidden="true"></i> View</button><a href="${uploaded.fileData}" download="${uploaded.fileName}"><i class="ti ti-download" aria-hidden="true"></i> Download</a></div>`
                : `<span>${doc.label}: missing</span>`;
            }).join('')}</div>
            ${employee.bvg?.note?`<div class="read-time warning">${employee.bvg.note}</div>`:''}
          </div>
          <div class="ri-right">
            <span class="badge ${employee.bvg?.status==='approved'?'b-active':employee.bvg?.status==='submitted'?'b-pending':'b-archived'}">${bvgStatusLabel(employee.bvg?.status)}</span>
            <button class="btn sm pri" onclick="approveBvg('${employee.id}')" ${employee.bvg?.status==='approved'||!stats.complete?'disabled':''}><i class="ti ti-check" aria-hidden="true"></i> Approve</button>
            <button class="btn sm danger" onclick="rejectBvg('${employee.id}')" ${employee.bvg?.status==='approved'?'disabled':''}><i class="ti ti-x" aria-hidden="true"></i> Request changes</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

window.viewBvgDocument=function(employeeId,docKey){
  const employee=employeeById(employeeId);
  if(!assertEmployeeInHrScope(employee,'view documents for')) return;
  const docMeta=BVG_DOCUMENTS.find(item=>item.key===docKey);
  const uploaded=employee?.bvg?.docs?.[docKey];
  if(!uploaded?.fileData){
    toast('Document is not available');
    return;
  }
  const title=document.getElementById('bvgPreviewTitle');
  const body=document.getElementById('bvgPreviewBody');
  const download=document.getElementById('bvgPreviewDownload');
  if(!title||!body||!download){
    window.open(uploaded.fileData,'_blank','noopener');
    return;
  }
  title.textContent=`${employee.name} - ${docMeta?.label||'BVG document'}`;
  download.href=uploaded.fileData;
  download.download=uploaded.fileName||`${docKey}-document`;
  const source=uploaded.fileData;
  const fileName=(uploaded.fileName||'').toLowerCase();
  const mime=(source.match(/^data:([^;]+);/)||[])[1]||'';
  if(mime.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(fileName)){
    body.innerHTML=`<img class="bvg-preview-img" src="${source}" alt="${docMeta?.label||'BVG document'} preview">`;
  }else if(mime==='application/pdf'||fileName.endsWith('.pdf')){
    body.innerHTML=`<iframe class="bvg-preview-frame" src="${source}" title="${docMeta?.label||'BVG document'} preview"></iframe>`;
  }else{
    body.innerHTML=`<div class="empty-state"><i class="ti ti-file-download" aria-hidden="true"></i><strong>Preview is not available for this file type.</strong><span>${uploaded.fileName||'Uploaded document'} can be downloaded and opened on your computer.</span></div>`;
  }
  openM('mBvgPreview');
};

window.approveBvg=function(id){
  const employee=employeeById(id);
  if(!employee) return;
  if(!assertEmployeeInHrScope(employee,'approve BVG for')) return;
  employee.bvg=employee.bvg||{docs:{}};
  if(!bvgStats(employee).complete){toast('All BVG documents are required before approval');return;}
  employee.bvg.status='approved';
  employee.bvg.reviewedAt=new Date().toISOString();
  employee.bvg.reviewedBy=currentUser?.name||'HR';
  employee.bvg.note='';
  saveStore();
  renderAdminBvg();
  renderEmpTable();
  toast(`${employee.name} can now access the employee portal`);
};

window.rejectBvg=function(id){
  const employee=employeeById(id);
  if(!employee) return;
  if(!assertEmployeeInHrScope(employee,'request changes for')) return;
  const note=prompt(`What should ${employee.name} correct or re-upload?`,'Please re-upload the unclear document.');
  if(note===null) return;
  employee.bvg=employee.bvg||{docs:{}};
  employee.bvg.status='rejected';
  employee.bvg.note=note.trim()||'Please review and re-upload the required BVG documents.';
  employee.bvg.reviewedAt=new Date().toISOString();
  employee.bvg.reviewedBy=currentUser?.name||'HR';
  saveStore();
  renderAdminBvg();
  toast('Changes requested');
};

function canManageHrAdmins(){
  return isCentralHrSession();
}
function centralAdminCount(){
  return (store.hrs||[]).filter(h=>h.accessRole!=='company'&&h.status!=='Inactive').length;
}
function isSelfHrAccount(hr){
  if(!hr||!currentUser) return false;
  return currentUser.id===hr.id||String(currentUser.email||'').toLowerCase()===String(hr.email||'').toLowerCase();
}
function hrCompanyLabel(hr){
  if(!hr) return 'Company';
  if(hr.accessRole!=='company'||hr.companyId===PORTAL_ALL_COMPANIES_ID) return 'All Entities';
  return companyLabelById(hr.companyId);
}
function fillHrCompanyOptions(selectedId=''){
  const companySelect=document.getElementById('hrCompany');
  if(!companySelect) return;
  const selected=selectedId||(isAllCompaniesView()?PORTAL_COMPANIES[0]?.id:activeCompanyId)||PORTAL_COMPANIES[0]?.id;
  companySelect.innerHTML=PORTAL_COMPANIES.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${safeText(companyOptionLabel(c))}</option>`).join('');
}
window.syncHrAccessRoleFields=function(){
  const role=document.getElementById('hrAccessRole')?.value||'company';
  const companyField=document.getElementById('hrCompanyField');
  const hint=document.getElementById('hrModalHint');
  const titleInput=document.getElementById('hrTitle');
  if(companyField) companyField.style.display=role==='company'?'':'none';
  if(hint){
    hint.textContent=role==='central'
      ?'Central Admin can view all entities and manage HR access for every company.'
      :'Company HR can open the Admin portal for the selected entity only.';
  }
  if(titleInput&&!document.getElementById('hrEditId')?.value){
    if(role==='central'&&(!titleInput.value||titleInput.value==='Company HR')) titleInput.value='Central Admin';
    if(role==='company'&&(!titleInput.value||titleInput.value==='Central Admin')) titleInput.value='Company HR';
  }
};
function visibleHrAdmins(){
  const hrs=store.hrs||[];
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId();
    return hrs.filter(h=>h.accessRole==='company'&&h.companyId===cid);
  }
  if(isAllCompaniesView()) return hrs;
  return hrs.filter(h=>(h.accessRole==='company'?h.companyId:PORTAL_ALL_COMPANIES_ID)===(activeCompanyId||PORTAL_ALL_COMPANIES_ID)||h.accessRole!=='company');
}
function nextHrId(){
  const max=Math.max(0,...(store.hrs||[]).map(h=>Number(String(h.id||'').replace(/\D/g,''))||0));
  return `hr-${max+1}`;
}
function refreshHrAccessViews(){
  if(typeof renderHrAdminList==='function') renderHrAdminList();
  if(typeof renderItAdminList==='function') renderItAdminList();
  if(document.getElementById('empTotal')&&typeof renderEmpTable==='function'){
    try{renderEmpTable();}catch(err){console.error(err);}
  }
}

window.openAddHrModal=function(){
  if(!canManageHrAdmins()){
    toast('Only central Admin can add HR logins');
    return;
  }
  document.getElementById('hrEditId').value='';
  document.getElementById('hrModalTitle').textContent='Add HR (Admin portal)';
  document.getElementById('hrPassLabel').textContent='Temporary password';
  document.getElementById('hrModalSaveBtn').textContent='Create HR login';
  document.getElementById('hrAccessRole').value='company';
  fillHrCompanyOptions();
  document.getElementById('hrName').value='';
  document.getElementById('hrTitle').value='Company HR';
  document.getElementById('hrEmail').value='';
  document.getElementById('hrEmail').disabled=false;
  document.getElementById('hrPass').value='hr@123';
  syncHrAccessRoleFields();
  openM('mHr');
};

window.openEditHrModal=function(hrId){
  if(!canManageHrAdmins()){
    toast('Only central Admin can change HR access');
    return;
  }
  const hr=(store.hrs||[]).find(h=>h.id===hrId);
  if(!hr){toast('HR login not found');return;}
  const role=hr.accessRole==='company'?'company':'central';
  document.getElementById('hrEditId').value=hr.id;
  document.getElementById('hrModalTitle').textContent='Edit HR access';
  document.getElementById('hrPassLabel').textContent='Password (leave blank to keep)';
  document.getElementById('hrModalSaveBtn').textContent='Save access';
  document.getElementById('hrAccessRole').value=role;
  fillHrCompanyOptions(hr.companyId);
  document.getElementById('hrName').value=hr.name||'';
  document.getElementById('hrTitle').value=hr.title||(role==='central'?'Central Admin':'Company HR');
  document.getElementById('hrEmail').value=hr.email||'';
  document.getElementById('hrEmail').disabled=true;
  document.getElementById('hrPass').value='';
  syncHrAccessRoleFields();
  openM('mHr');
};

window.saveHrAdmin=function(){
  if(!canManageHrAdmins()){toast('Only central Admin can manage HR logins');return;}
  const editId=(document.getElementById('hrEditId')?.value||'').trim();
  const name=(document.getElementById('hrName')?.value||'').trim();
  const accessRole=document.getElementById('hrAccessRole')?.value==='central'?'central':'company';
  const title=(document.getElementById('hrTitle')?.value||'').trim()||(accessRole==='central'?'Central Admin':'Company HR');
  const email=(document.getElementById('hrEmail')?.value||'').trim().toLowerCase();
  const password=(document.getElementById('hrPass')?.value||'').trim();
  const companyId=accessRole==='central'
    ?PORTAL_ALL_COMPANIES_ID
    :(document.getElementById('hrCompany')?.value||PORTAL_COMPANIES[0]?.id||'VNSPL');
  if(!name||!isEmail(email)){toast('Enter a valid HR name and email');return;}
  if(accessRole==='company'&&!PORTAL_COMPANIES.some(c=>c.id===companyId)){toast('Select a valid company');return;}

  if(editId){
    const hr=(store.hrs||[]).find(h=>h.id===editId);
    if(!hr){toast('HR login not found');return;}
    if(password&&password.length<4){toast('Password must be at least 4 characters');return;}
    const wasCentral=hr.accessRole!=='company';
    if(wasCentral&&accessRole==='company'&&centralAdminCount()<=1){
      toast('Keep at least one Central Admin account');
      return;
    }
    if(isSelfHrAccount(hr)&&accessRole==='company'){
      toast('You cannot demote your own Central Admin access');
      return;
    }
    hr.name=name;
    hr.title=title;
    hr.accessRole=accessRole;
    hr.companyId=companyId;
    if(password){
      hr.password=password;
      hr.mustChangePassword=true;
      hr.passwordChangedInPortal=true;
    }
    saveStore();
    closeM('mHr');
    refreshHrAccessViews();
    toast(accessRole==='central'?'Central Admin access updated':`HR access updated to ${companyLabelById(companyId)}`);
    return;
  }

  if(password.length<4){toast('Password must be at least 4 characters');return;}
  if([...(store.hrs||[]),...(store.employees||[]),...(store.buHeads||[]),...(store.itUsers||[])].some(u=>String(u.email||'').toLowerCase()===email)){
    toast('Email already exists');
    return;
  }
  store.hrs.push({
    id:nextHrId(),
    name,
    email,
    password,
    title,
    accessRole,
    companyId,
    mustChangePassword:true,
    status:'Active'
  });
  saveStore();
  closeM('mHr');
  refreshHrAccessViews();
  toast(accessRole==='central'?'Central Admin login created':`HR login created for ${companyLabelById(companyId)}`);
};
window.addHrAdmin=window.saveHrAdmin;

window.deleteHrAdmin=function(hrId){
  if(!canManageHrAdmins()){toast('Only central Admin can remove HRs');return;}
  const hr=(store.hrs||[]).find(h=>h.id===hrId);
  if(!hr) return;
  if(isSelfHrAccount(hr)){
    toast('You cannot delete your own login');
    return;
  }
  if(hr.accessRole!=='company'&&centralAdminCount()<=1){
    toast('Keep at least one Central Admin account');
    return;
  }
  const label=hr.accessRole==='company'?companyLabelById(hr.companyId):'Central / All Entities';
  if(!confirm(`Remove Admin portal access for ${hr.name} (${label})?`)) return;
  store.hrs=store.hrs.filter(h=>h.id!==hrId);
  saveStore();
  refreshHrAccessViews();
  toast('HR login removed');
};

window.renderHrAdminList=function(){
  const list=document.getElementById('hrAdminList');
  const addBtn=document.getElementById('addHrBtn');
  if(addBtn) addBtn.style.display=canManageHrAdmins()?'inline-flex':'none';
  if(!list) return;
  if(!isCentralHrSession()){
    list.innerHTML='<div class="empty-state">Access management is available to Central Admin only. Company HR cannot add, edit, or remove Central Admins, HRs, or BU Heads.</div>';
    const buList=document.getElementById('buHeadAdminList');
    if(buList) buList.innerHTML='';
    const itList=document.getElementById('itAdminList');
    if(itList) itList.innerHTML='';
    if(addBtn) addBtn.style.display='none';
    const addBu=document.getElementById('addBuHeadBtn');
    if(addBu) addBu.style.display='none';
    const addIt=document.getElementById('addItBtn');
    if(addIt) addIt.style.display='none';
    return;
  }
  const hrs=visibleHrAdmins().slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'en',{sensitivity:'base'}));
  if(!hrs.length){
    list.innerHTML='<div class="empty-state">No HR admins for this view yet.</div>';
    return;
  }
  list.innerHTML=hrs.map(hr=>{
    const company=hrCompanyLabel(hr);
    const canManage=canManageHrAdmins();
    const isSelf=isSelfHrAccount(hr);
    return `<div class="row-item policy-row"><div><div class="ri-name"><span class="emp-company-tag">${safeText(company)}</span> ${safeText(hr.name)}${isSelf?' <span class="badge b-active">You</span>':''}</div><div class="ri-meta">${safeText(hr.email)} - ${safeText(hr.title||'HR')} - ${hr.accessRole==='company'?'Company access':'Central / All Entities'}</div></div><div class="ri-right"><span class="badge ${hr.accessRole==='company'?'b-pending':'b-active'}">${hr.accessRole==='company'?'Company HR':'Central'}</span>${canManage?`<button class="btn sm" onclick="openEditHrModal('${hr.id}')"><i class="ti ti-edit" aria-hidden="true"></i> Edit access</button>${isSelf?'':`<button class="btn sm danger" onclick="deleteHrAdmin('${hr.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Remove</button>`}`:''}</div></div>`;
  }).join('');
  renderBuHeadAdminList();
  renderItAdminList();
};

function nextBuHeadId(){
  const max=Math.max(0,...(store.buHeads||[]).map(h=>Number(String(h.id||'').replace(/\D/g,''))||0));
  return `buh-${max+1}`;
}
function fillBuHeadCompanyScope(selectedId=''){
  const select=document.getElementById('buHeadCompanyScope');
  if(!select) return;
  const selected=(!selectedId||selectedId===PORTAL_ALL_COMPANIES_ID||String(selectedId).toLowerCase()==='all')
    ?PORTAL_ALL_COMPANIES_ID
    :resolveCompanyId(selectedId);
  select.innerHTML=[
    `<option value="${PORTAL_ALL_COMPANIES_ID}">All 5 companies</option>`,
    ...PORTAL_COMPANIES.map(c=>`<option value="${c.id}">${safeText(companyOptionLabel(c))}</option>`)
  ].join('');
  select.value=selected;
}
function emailTakenByOther(email,excludeId=''){
  const key=String(email||'').trim().toLowerCase();
  if(!key) return false;
  const pools=[...(store.hrs||[]),...(store.employees||[]),...(store.buHeads||[]),...(store.itUsers||[])];
  return pools.some(u=>{
    if(excludeId&&u.id===excludeId) return false;
    return String(u.email||'').toLowerCase()===key;
  });
}

window.openAddBuHeadModal=function(){
  if(!canManageHrAdmins()){
    toast('Only central Admin can add BU Head logins');
    return;
  }
  document.getElementById('buHeadEditId').value='';
  document.getElementById('buHeadModalTitle').textContent='Add BU Head';
  document.getElementById('buHeadPassLabel').textContent='Temporary password';
  document.getElementById('buHeadModalSaveBtn').textContent='Create BU Head';
  document.getElementById('buHeadName').value='';
  document.getElementById('buHeadPersonName').value='';
  document.getElementById('buHeadEmail').value='';
  document.getElementById('buHeadEmail').disabled=false;
  document.getElementById('buHeadPass').value='bu@123';
  document.getElementById('buHeadUnit').value='';
  document.getElementById('buHeadBudget').value='';
  document.getElementById('buHeadStatus').value='Active';
  fillBuHeadCompanyScope(PORTAL_ALL_COMPANIES_ID);
  const hint=document.getElementById('buHeadModalHint');
  if(hint) hint.textContent='Team roster matches employees by unit name and/or BU person name. Company scope stores All Entities or a single entity.';
  openM('mBuHeadAdmin');
};

window.openEditBuHeadModal=function(headId){
  if(!canManageHrAdmins()){
    toast('Only central Admin can edit BU Head logins');
    return;
  }
  const head=(store.buHeads||[]).find(h=>h.id===headId);
  if(!head){toast('BU Head login not found');return;}
  document.getElementById('buHeadEditId').value=head.id;
  document.getElementById('buHeadModalTitle').textContent='Edit BU Head';
  document.getElementById('buHeadPassLabel').textContent='Password (leave blank to keep)';
  document.getElementById('buHeadModalSaveBtn').textContent='Save BU Head';
  document.getElementById('buHeadName').value=head.name||'';
  document.getElementById('buHeadPersonName').value=head.personName||head.name||'';
  document.getElementById('buHeadEmail').value=head.email||'';
  document.getElementById('buHeadEmail').disabled=true;
  document.getElementById('buHeadPass').value='';
  document.getElementById('buHeadUnit').value=head.bu||'';
  const budgetAmt=parseCtcAmount(head.budget);
  document.getElementById('buHeadBudget').value=budgetAmt>0?formatCtcAmount(budgetAmt):'';
  document.getElementById('buHeadStatus').value=head.status==='Inactive'?'Inactive':'Active';
  fillBuHeadCompanyScope(head.companyId||PORTAL_ALL_COMPANIES_ID);
  const hint=document.getElementById('buHeadModalHint');
  if(hint) hint.textContent='Leave password blank to keep the current one. Unit and BU person name control My team matching.';
  openM('mBuHeadAdmin');
};

window.saveBuHeadAdmin=function(){
  if(!canManageHrAdmins()){toast('Only central Admin can manage BU Head logins');return;}
  const editId=(document.getElementById('buHeadEditId')?.value||'').trim();
  const name=(document.getElementById('buHeadName')?.value||'').trim();
  const personName=(document.getElementById('buHeadPersonName')?.value||'').trim()||name;
  const email=(document.getElementById('buHeadEmail')?.value||'').trim().toLowerCase();
  const password=(document.getElementById('buHeadPass')?.value||'').trim();
  const bu=(document.getElementById('buHeadUnit')?.value||'').trim();
  const budgetRaw=(document.getElementById('buHeadBudget')?.value||'').trim();
  const budget=budgetRaw===''?0:parseCtcAmount(budgetRaw);
  const status=document.getElementById('buHeadStatus')?.value==='Inactive'?'Inactive':'Active';
  const rawCompany=(document.getElementById('buHeadCompanyScope')?.value||PORTAL_ALL_COMPANIES_ID).trim();
  const companyId=(!rawCompany||rawCompany===PORTAL_ALL_COMPANIES_ID||rawCompany.toLowerCase()==='all')
    ?PORTAL_ALL_COMPANIES_ID
    :resolveCompanyId(rawCompany);
  if(!name||!isEmail(email)){toast('Enter a valid name and email');return;}
  if(!bu){toast('Enter a unit name (BU)');return;}
  if(budgetRaw!==''&&budget<0){toast('Budget cannot be negative');return;}
  if(companyId!==PORTAL_ALL_COMPANIES_ID&&!PORTAL_COMPANIES.some(c=>c.id===companyId)){
    toast('Select a valid company scope');
    return;
  }

  if(editId){
    const head=(store.buHeads||[]).find(h=>h.id===editId);
    if(!head){toast('BU Head login not found');return;}
    if(password&&password.length<4){toast('Password must be at least 4 characters');return;}
    head.name=name;
    head.personName=personName;
    head.bu=bu;
    head.budget=budget;
    head.companyId=companyId;
    head.status=status;
    head.title=head.title||'BU Head';
    head.accessRole='buHead';
    if(password){
      head.password=password;
      head.mustChangePassword=true;
    }
    saveStore();
    closeM('mBuHeadAdmin');
    renderBuHeadAdminList();
    toast('BU Head access updated');
    return;
  }

  if(password.length<4){toast('Password must be at least 4 characters');return;}
  if(emailTakenByOther(email)){toast('Email already exists');return;}
  if(!store.buHeads) store.buHeads=[];
  store.buHeads.push({
    id:nextBuHeadId(),
    name,
    email,
    password,
    bu,
    budget,
    personName,
    companyId,
    status,
    title:'BU Head',
    accessRole:'buHead',
    mustChangePassword:true
  });
  saveStore();
  closeM('mBuHeadAdmin');
  renderBuHeadAdminList();
  toast(`BU Head login created for ${bu}`);
};

window.deleteBuHeadAdmin=function(headId){
  if(!canManageHrAdmins()){toast('Only central Admin can remove BU Heads');return;}
  const head=(store.buHeads||[]).find(h=>h.id===headId);
  if(!head) return;
  if(!confirm(`Remove BU Head portal access for ${head.name||head.email} (${head.bu||'unit'})?`)) return;
  store.buHeads=(store.buHeads||[]).filter(h=>h.id!==headId);
  saveStore();
  renderBuHeadAdminList();
  toast('BU Head login removed');
};

window.renderBuHeadAdminList=function(){
  const list=document.getElementById('buHeadAdminList');
  const addBtn=document.getElementById('addBuHeadBtn');
  if(addBtn) addBtn.style.display=canManageHrAdmins()?'inline-flex':'none';
  if(!list) return;
  const heads=(store.buHeads||[]).slice().sort((a,b)=>String(a.bu||'').localeCompare(String(b.bu||''),'en',{sensitivity:'base'}));
  if(!heads.length){
    list.innerHTML='<div class="empty-state">No BU Head accounts yet.</div>';
    return;
  }
  const canManage=canManageHrAdmins();
  list.innerHTML=heads.map(h=>{
    const company=buHeadCompanyLabel(h);
    const status=h.status==='Inactive'?'Inactive':'Active';
    const budgetLabel=displayBudgetStat(h.budget);
    return `<div class="row-item policy-row"><div><div class="ri-name"><span class="emp-company-tag">${safeText(company)}</span> ${safeText(h.personName||h.name||'BU Head')}</div><div class="ri-meta">${safeText(h.email)} · Unit: ${safeText(h.bu||'—')} · Budget: ${safeText(budgetLabel)} · ${status}</div></div><div class="ri-right"><span class="badge ${status==='Active'?'b-active':'b-pending'}">${status==='Active'?'BU Head':'Inactive'}</span>${canManage?`<button class="btn sm" onclick="openEditBuHeadModal('${h.id}')"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button><button class="btn sm danger" onclick="deleteBuHeadAdmin('${h.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Remove</button>`:''}</div></div>`;
  }).join('');
};

function nextItUserId(){
  const max=Math.max(0,...(store.itUsers||[]).map(h=>Number(String(h.id||'').replace(/\D/g,''))||0));
  return `it-${max+1}`;
}
function itCompanyLabel(user){
  return buHeadCompanyLabel(user);
}
window.openAddItFromAccess=function(){
  if(!canManageHrAdmins()){
    toast('Only central Admin can add IT logins from Access');
    return;
  }
  prepareAddEmployeeModal();
  const sel=document.getElementById('empAccessType');
  if(sel){
    if(![...sel.options].some(o=>o.value==='it')) fillAddEmpAccessTypeOptions();
    sel.value='it';
  }
  syncAddEmpAccessType();
  openM('mEmp');
};
window.renderItAdminList=function(){
  const list=document.getElementById('itAdminList');
  const addBtn=document.getElementById('addItBtn');
  if(addBtn) addBtn.style.display=canManageHrAdmins()?'inline-flex':'none';
  if(!list) return;
  if(!isCentralHrSession()){
    list.innerHTML='';
    if(addBtn) addBtn.style.display='none';
    return;
  }
  const users=(store.itUsers||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'en',{sensitivity:'base'}));
  if(!users.length){
    list.innerHTML='<div class="empty-state">No IT accounts yet.</div>';
    return;
  }
  const canManage=canManageHrAdmins();
  list.innerHTML=users.map(u=>{
    const company=itCompanyLabel(u);
    const status=u.status==='Inactive'?'Inactive':'Active';
    return `<div class="row-item policy-row"><div><div class="ri-name"><span class="emp-company-tag">${safeText(company)}</span> ${safeText(u.name||'IT')}</div><div class="ri-meta">${safeText(u.email)} · ${safeText(u.title||'IT Asset Admin')} · ${status}</div></div><div class="ri-right"><span class="badge ${status==='Active'?'b-active':'b-pending'}">${status==='Active'?'IT':'Inactive'}</span>${canManage?`<button class="btn sm danger" onclick="deleteItAdmin('${u.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Remove</button>`:''}</div></div>`;
  }).join('');
};
window.deleteItAdmin=function(itId){
  if(!canManageHrAdmins()){toast('Only central Admin can remove IT logins');return;}
  const user=(store.itUsers||[]).find(h=>h.id===itId);
  if(!user) return;
  if(!confirm(`Remove IT portal access for ${user.name||user.email}?`)) return;
  store.itUsers=(store.itUsers||[]).filter(h=>h.id!==itId);
  saveStore();
  renderItAdminList();
  toast('IT login removed');
};

window.bhPage=function(pg,el){
  goPage(pg,el);
};

window.renderBuHeadOverview=function(){
  const team=employeesForBuHead();
  const head=currentBuHeadRecord()||currentUser;
  const active=team.filter(e=>e.status==='Active').length;
  const scope=buHeadCompanyScopeId(head);
  const companyCount=new Set(team.map(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL'))).size;
  if(document.getElementById('bhStatTotal')) document.getElementById('bhStatTotal').textContent=team.length;
  if(document.getElementById('bhStatActive')) document.getElementById('bhStatActive').textContent=active;
  if(document.getElementById('bhStatUnit')) document.getElementById('bhStatUnit').textContent=head?.bu||'—';
  fillBuHeadBudgetStats(
    document.getElementById('bhStatBudget'),
    document.getElementById('bhStatUsedBudget'),
    document.getElementById('bhStatRemaining'),
    team,
    head
  );
  if(document.getElementById('bhOverviewSub')){
    const scopeText=scope===PORTAL_ALL_COMPANIES_ID
      ?`across all companies${companyCount?` · ${companyCount} entit${companyCount===1?'y':'ies'}`:''}`
      :`· ${buHeadCompanyLabel(head)}`;
    document.getElementById('bhOverviewSub').textContent=`Unit “${head?.bu||'—'}” ${scopeText}${head?.personName?` · BU person ${head.personName}`:''}`;
  }
};

window.setBhTeamCompanyFilter=function(value){
  bhTeamCompanyFilter=value||'all';
  renderBuHeadTeam();
};

window.renderBuHeadTeam=function(){
  const table=document.getElementById('bhTeamTable');
  if(!table) return;
  const head=currentBuHeadRecord()||currentUser;
  const scope=buHeadCompanyScopeId(head);
  const team=filteredEmployeesForBuHead(head);
  const filterWrap=document.querySelector('#s-buHead .bh-team-filter');
  const filterEl=document.getElementById('bhTeamCompanyFilter');
  if(filterWrap) filterWrap.style.display=scope===PORTAL_ALL_COMPANIES_ID?'':'none';
  if(filterEl&&scope===PORTAL_ALL_COMPANIES_ID){
    const options=['<option value="all">All companies</option>']
      .concat(PORTAL_COMPANIES.map(c=>`<option value="${c.id}">${safeText(c.code||c.name)}</option>`));
    filterEl.innerHTML=options.join('');
    if(bhTeamCompanyFilter!=='all'&&!PORTAL_COMPANIES.some(c=>c.id===bhTeamCompanyFilter)) bhTeamCompanyFilter='all';
    filterEl.value=bhTeamCompanyFilter;
  }
  if(document.getElementById('bhTeamSub')){
    const scopeText=scope===PORTAL_ALL_COMPANIES_ID
      ?'across all companies (filter by company optional)'
      :`in ${buHeadCompanyLabel(head)}`;
    document.getElementById('bhTeamSub').textContent=`Unit “${head?.bu||'—'}” ${scopeText}; also matched by BU person when listed`;
  }
  if(document.getElementById('bhTeamCount')) document.getElementById('bhTeamCount').textContent=team.length;
  fillBuHeadBudgetStats(
    document.getElementById('bhTeamStatBudget'),
    document.getElementById('bhTeamStatUsedBudget'),
    document.getElementById('bhTeamStatRemaining'),
    team,
    head
  );
  table.innerHTML=`<thead><tr>
    <th>Name</th><th>Company</th><th>Start date</th><th>End date</th><th>Tenure</th><th>ID</th><th>Salary</th>
    <th>BU Head (person)</th><th>Unit name</th><th>Project</th><th>Status</th><th>Last edited</th><th></th>
  </tr></thead><tbody>${team.map(e=>{
    const start=e.dateOfJoining||'';
    const tenure=e.tenure||tenureFromJoining(start)||'—';
    const lastEdit=lastBuProjectEditAt(e);
    const salary=displayCtc(e.ctc);
    const companyCode=companyCodeById(e.companyId)||'—';
    return `<tr>
      <td style="font-weight:500">${safeText(e.name||'')}</td>
      <td><span class="emp-company-tag" title="${safeText(employeeCompanyName(e))}">${safeText(companyCode)}</span></td>
      <td>${safeText(formatDateOnly(start)||'—')}</td>
      <td>${safeText(e.leavingDate?formatDateOnly(e.leavingDate):'—')}</td>
      <td>${safeText(tenure)}</td>
      <td>${safeText(e.employeeCode||e.id||'—')}</td>
      <td>${safeText(salary)}</td>
      <td>${safeText(e.buHead||'—')}</td>
      <td>${safeText(employeeUnitName(e)||'—')}</td>
      <td>${safeText(e.project||'—')}</td>
      <td><span class="badge ${e.status==='Active'?'b-active':'b-archived'}">${safeText(e.status||'Active')}</span></td>
      <td style="color:var(--color-text-secondary);font-size:10px">${lastEdit?safeText(formatQueryTime(lastEdit)):'—'}</td>
      <td><button class="btn sm" onclick="openBuHeadEmpEdit('${e.id}')"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button></td>
    </tr>`;
  }).join('')||`<tr><td colspan="13" style="text-align:center;color:var(--color-text-secondary)">No employees in this BU yet.</td></tr>`}</tbody>`;
};

window.openBuHeadEmpEdit=function(empId){
  if(currentUser?.portal!=='buHead'){toast('BU Head sign-in required');return;}
  const emp=employeeById(empId);
  if(!emp||!employeesForBuHead().some(e=>e.id===empId)){toast('Employee is outside your BU scope');return;}
  document.getElementById('bhEditEmpId').value=emp.id;
  document.getElementById('bhEditEmpName').textContent=emp.name||'Employee';
  document.getElementById('bhEditBuHead').value=emp.buHead||'';
  document.getElementById('bhEditBu').value=employeeUnitName(emp)||'';
  document.getElementById('bhEditProject').value=emp.project||'';
  const last=lastBuProjectEditAt(emp);
  document.getElementById('bhEditLastAt').textContent=last?formatQueryTime(last):'Not edited yet';
  openM('mBuHeadEdit');
};

window.saveBuHeadEmpEdit=function(){
  if(currentUser?.portal!=='buHead'){toast('BU Head sign-in required');return;}
  const empId=document.getElementById('bhEditEmpId').value;
  const emp=employeeById(empId);
  if(!emp||!employeesForBuHead().some(e=>e.id===empId)){toast('Employee is outside your BU scope');return;}
  const nextBuHead=String(document.getElementById('bhEditBuHead').value||'').trim();
  const nextBu=String(document.getElementById('bhEditBu').value||'').trim();
  const nextProject=String(document.getElementById('bhEditProject').value||'').trim();
  const now=new Date().toISOString();
  const editedBy=currentUser?.email||currentUser?.name||'BU Head';
  emp.buProjectEdits=Array.isArray(emp.buProjectEdits)?emp.buProjectEdits:[];
  const pushEdit=(field,oldValue,newValue)=>{
    if(String(oldValue||'')===String(newValue||'')) return;
    emp.buProjectEdits.unshift({field,oldValue:oldValue||'',newValue:newValue||'',editedAt:now,editedBy});
  };
  pushEdit('buHead',emp.buHead||'',nextBuHead);
  pushEdit('bu',employeeUnitName(emp)||'',nextBu);
  pushEdit('project',emp.project||'',nextProject);
  if(String(emp.buHead||'')!==nextBuHead) emp.buHeadEditedAt=now;
  if(String(employeeUnitName(emp)||'')!==nextBu) emp.buEditedAt=now;
  if(String(emp.project||'')!==nextProject) emp.projectEditedAt=now;
  emp.buHead=nextBuHead;
  emp.bu=nextBu;
  emp.businessUnit=nextBu;
  emp.project=nextProject;
  emp.buProjectEdits=emp.buProjectEdits.slice(0,50);
  saveStore();
  closeM('mBuHeadEdit');
  renderBuHeadTeam();
  renderBuHeadOverview();
  scheduleEmployeeSheetPush('bu-project-edit');
  toast('BU / Project updated');
};

window.renderEmpTable=function(){
  const allEmployees=adminVisibleEmployees();
  const search=(document.getElementById('employeeSearch')?.value||'').trim().toLowerCase();
  const alphabeticalEmployees=search
    ? allEmployees.filter(e=>{
        const name=String(e.name||'').toLowerCase();
        const code=String(e.employeeCode||e.empId||e.id||'').toLowerCase();
        const email=String(e.email||'').toLowerCase();
        return name.includes(search)||code.includes(search)||email.includes(search);
      })
    : allEmployees;
  if(document.getElementById('empTotal')) document.getElementById('empTotal').textContent=allEmployees.length;
  if(document.getElementById('empActive')) document.getElementById('empActive').textContent=allEmployees.filter(e=>e.status==='Active').length;
  if(document.getElementById('hrTotal')) document.getElementById('hrTotal').textContent=visibleHrAdmins().length;
  if(document.getElementById('empOpenQ')) document.getElementById('empOpenQ').textContent=adminScopedQueries().filter(q=>q.status!=='resolved').length;
  if(document.getElementById('eTable')) document.getElementById('eTable').innerHTML=`<thead><tr><th>Company</th><th>Name</th><th>Employee ID</th><th>Company email</th><th>Dept</th><th>Role</th><th>Policy read</th><th>Annual left</th><th>Sick left</th><th>WFH left</th><th>Password</th><th>Status</th><th>Action</th></tr></thead><tbody>${alphabeticalEmployees.map(e=>{const l=e.leave||{annual:{u:0,t:18},sick:{u:0,t:8},wfh:{u:0,t:12}}, pr=policyReadStats(e);return `<tr><td style="color:var(--color-text-secondary);font-weight:600">${safeText(employeeCompanyName(e))}</td><td style="font-weight:500"><button type="button" class="emp-name-link" onclick="openEmployeeDetail('${e.id}')" title="View full employee details">${safeText(e.name)}</button></td><td>${e.employeeCode||'Not assigned'}</td><td>${e.email}</td><td style="color:var(--color-text-secondary)">${e.dept}</td><td>${e.role||'-'}</td><td><span class="badge ${pr.total&&pr.read===pr.total?'b-active':'b-pending'}">${pr.read}/${pr.total}</span></td><td>${l.annual.t-l.annual.u}</td><td>${l.sick.t-l.sick.u}</td><td>${l.wfh.t-l.wfh.u}</td><td><span class="badge ${e.mustChangePassword?'b-pending':'b-active'}">${e.mustChangePassword?'Reset required':'Private'}</span></td><td><span class="badge ${e.status==='Active'?'b-active':'b-archived'}">${e.status}</span></td><td><div class="table-actions"><button class="btn sm" onclick="openEmployeeEditor('${e.id}')"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button><button class="btn sm" onclick="toggleEmployee('${e.id}')">${e.status==='Active'?'Deactivate':'Activate'}</button><button class="btn sm danger" onclick="deleteEmployee('${e.id}')" title="Delete employee"><i class="ti ti-trash" aria-hidden="true"></i></button></div></td></tr>`;}).join('')||`<tr><td colspan="13" style="text-align:center;color:var(--color-text-secondary)">${search?'No employees match your search.':'No employees for this company yet.'}</td></tr>`}</tbody>`;
  updateEmpSyncExcelHint();
  renderHrAdminList();
};

window.updateEmpSyncExcelHint=function(){
  const hint=document.getElementById('empSyncExcelHint');
  if(!hint) return;
  const deleteNote='Deleted employees are removed from Excel and are not restored by Sync unless you Add employee again.';
  const passwordNote='Pre-existing Excel emails (that were never deleted) get portal access on Sync Excel (temp password from sheet or emp123). Portal passwords are never overwritten from Excel. Portal passwords are not written to Excel (existing sheet tempPassword values are preserved; changed portal passwords stay portal-only).';
  if(isCompanyHrSession()){
    hint.textContent=`Sync Excel pulls rows for ${companyLabelById(lockedHrCompanyId())} only. Push to Excel writes that company's portal employee details back to the sheet. ${deleteNote} ${passwordNote}`;
  }else if(isAllCompaniesView()){
    hint.textContent=`Sync Excel pulls rows for all entities. Push to Excel writes all portal employees back to the sheet. ${deleteNote} ${passwordNote}`;
  }else{
    hint.textContent=`Sync Excel pulls rows for ${companyLabelById(activeCompanyId)} (selected entity). Push to Excel writes that entity only — switch to All Entities to push everyone. ${deleteNote} ${passwordNote}`;
  }
};

function tempPassword(){
  return `HRP${Math.random().toString(36).slice(2,8).toUpperCase()}${Math.floor(10+Math.random()*90)}`;
}

function createEmployeeRecord({id,employeeCode,name,email,dept,role,tempPass,companyId,hrFields={}}={}){
  const employeeId=id&&!store.employees.some(employee=>employee.id===id)?id:`emp-${store.nextEmployeeId++}`;
  const dateOfJoining=hrFields.dateOfJoining||'';
  const resolvedCompany=isCompanyHrSession()
    ?(lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL')
    :(companyId||hrFields.companyId||(isAllCompaniesView()?PORTAL_COMPANIES[0]?.id:activeCompanyId)||PORTAL_COMPANIES[0]?.id||'VNSPL');
  return {
    id:employeeId,
    employeeCode:employeeCode||hrFields.employeeCode||'',
    companyId:resolvedCompany,
    name,
    email,
    password:tempPass,
    mustChangePassword:true,
    dept:dept||hrFields.department||'General',
    department:hrFields.department||dept||'General',
    role:role||hrFields.designation||'Employee',
    designation:hrFields.designation||role||'Employee',
    status:'Active',
    manager:hrFields.reportingManager||currentUser?.name||'HR',
    reportingManager:hrFields.reportingManager||'',
    ctc:hrFields.ctc||'',
    salaryHistory:Array.isArray(hrFields.salaryHistory)?hrFields.salaryHistory:[],
    buHead:hrFields.buHead||'',
    bu:hrFields.bu||hrFields.businessUnit||'',
    project:hrFields.project||'',
    buProjectEdits:Array.isArray(hrFields.buProjectEdits)?hrFields.buProjectEdits:[],
    kmpCategory:hrFields.kmpCategory||'Other',
    grade:hrFields.grade||'',
    sbu:hrFields.sbu||'',
    sbu1:hrFields.sbu1||'',
    functionGroup:hrFields.functionGroup||'',
    functionalCategory:hrFields.functionalCategory||'',
    location:hrFields.location||hrFields.workLocation||hrFields.officeLocation||'',
    dateOfJoining,
    dateOfConfirmation:hrFields.dateOfConfirmation||confirmationDateFromJoining(dateOfJoining),
    tenure:hrFields.tenure||tenureFromJoining(dateOfJoining),
    leavingDate:hrFields.leavingDate||hrFields.dateOfLeaving||'',
    personalEmail:hrFields.personalEmail||'',
    onboardedAt:hrFields.onboardedAt||'',
    profile:{dob:hrFields.dob||'',hobbies:hrFields.hobbies||'',photo:'',personalEmail:hrFields.personalEmail||''},
    hrProfileReady:Boolean(hrFields.onboardedAt||dateOfJoining||hrFields.hrProfileReady),
    policyReads:{},
    dismissedNotifications:[],
    documents:[],
    gameProgress:null,
    bvg:{status:'pending',docs:{},note:'',submittedAt:'',reviewedAt:'',reviewedBy:''},
    leave:{annual:{u:0,t:18},sick:{u:0,t:8},wfh:{u:0,t:12},comp:{u:0,t:3}}
  };
}

function applyHrEmploymentFields(employee,row={}, {overwrite=true}={}){
  if(!employee||!row) return employee;
  const pick=(key, aliases=[])=>{
    if(row[key]!=null&&String(row[key]).trim()!=='') return String(row[key]).trim();
    for(const alias of aliases){
      if(row[alias]!=null&&String(row[alias]).trim()!=='') return String(row[alias]).trim();
    }
    return '';
  };
  const setIf=(field,value)=>{
    if(!value) return;
    if(overwrite||!employee[field]) employee[field]=value;
  };
  setIf('employeeCode',pick('employeeCode',['employeecode','code']));
  if(!isCompanyHrSession()){
    setIf('companyId',pick('companyId',['company']));
    if(!employee.companyId&&row.companyName){
      const name=String(row.companyName).trim().toLowerCase();
      const matched=PORTAL_COMPANIES.find(c=>c.name.toLowerCase()===name||String(c.code||'').toLowerCase()===name);
      if(matched) employee.companyId=matched.id;
    }
  }else{
    employee.companyId=lockedHrCompanyId()||employee.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL';
  }
  if(employee.companyId) employee.companyId=resolveCompanyId(employee.companyId);
  const doj=pick('dateOfJoining',['joining','doj']);
  setIf('dateOfJoining',doj);
  setIf('dateOfConfirmation',pick('dateOfConfirmation')||(doj?confirmationDateFromJoining(doj):''));
  setIf('reportingManager',pick('reportingManager',['manager']));
  if(pick('reportingManager',['manager'])) employee.manager=pick('reportingManager',['manager']);
  setIf('buHead',pick('buHead'));
  setIf('bu',pick('bu',['businessUnit','unit','businessunit']));
  setIf('project',pick('project'));
  setIf('department',pick('department',['dept']));
  if(pick('department',['dept'])&&overwrite) employee.dept=pick('department',['dept']);
  setIf('designation',pick('designation',['role']));
  if(pick('designation',['role'])&&overwrite) employee.role=pick('designation',['role']);
  setIf('kmpCategory',pick('kmpCategory',['kmp']));
  setIf('grade',pick('grade'));
  setIf('sbu',pick('sbu'));
  setIf('sbu1',pick('sbu1'));
  setIf('functionGroup',pick('functionGroup'));
  setIf('functionalCategory',pick('functionalCategory'));
  setIf('location',pick('location',['workLocation','officeLocation']));
  setIf('tenure',pick('tenure')||(employee.dateOfJoining?tenureFromJoining(employee.dateOfJoining):''));
  setIf('leavingDate',pick('leavingDate',['dateofleaving','exitdate','lastworkingday','leaving']));
  setIf('personalEmail',pick('personalEmail',['personal_email','alternateemail','personalmail']));
  setIf('ctc',pick('ctc',['currentCtc','annualCtc','salary']));
  const status=pick('status',['employmentStatus']);
  if(status&&(overwrite||!employee.status)){
    employee.status=/inactive|left|exited|terminated/i.test(status)?'Inactive':(/active/i.test(status)?'Active':status);
  }
  if(employee.personalEmail){
    employee.profile=employee.profile||{};
    if(overwrite||!employee.profile.personalEmail) employee.profile.personalEmail=employee.personalEmail;
  }
  setIf('onboardedAt',pick('onboardedAt'));
  if(employee.onboardedAt||employee.dateOfJoining) employee.hrProfileReady=true;
  return employee;
}

function hasEmployeeHrProfile(employee){
  return Boolean(employee?.hrProfileReady||employee?.onboardedAt||employee?.dateOfJoining);
}

function humanizeEmpFieldKey(key){
  const known=EMPLOYEE_PROFILE_FIELDS.find(f=>f.key===key||(f.aliases||[]).includes(key));
  if(known) return known.label;
  return String(key||'')
    .replace(/\./g,' ')
    .replace(/([a-z])([A-Z])/g,'$1 $2')
    .replace(/[_-]+/g,' ')
    .replace(/\b\w/g,c=>c.toUpperCase())
    .trim()||'Field';
}
function getEmployeeNestedValue(obj,path){
  if(!obj||!path) return undefined;
  return String(path).split('.').reduce((cur,part)=>cur==null?undefined:cur[part],obj);
}
function getEmployeeFieldRaw(employee,field){
  if(typeof field.get==='function') return field.get(employee);
  const paths=[field.key,...(field.aliases||[])];
  for(const path of paths){
    const val=path.includes('.')?getEmployeeNestedValue(employee,path):employee?.[path];
    if(val!=null&&val!=='') return val;
  }
  if(field.key==='personalEmail') return employee?.profile?.personalEmail||'';
  if(field.key==='dateOfJoining'){
    const history=employee?.salaryHistory||[];
    const joinEntry=history.find(h=>h.type==='joining'&&h.effectiveDate);
    return joinEntry?.effectiveDate||'';
  }
  if(field.key==='dateOfConfirmation'){
    const doj=getEmployeeFieldRaw(employee,{key:'dateOfJoining',aliases:['joining','doj']});
    return confirmationDateFromJoining(doj)||'';
  }
  if(field.key==='tenure'){
    const doj=getEmployeeFieldRaw(employee,{key:'dateOfJoining',aliases:['joining','doj']});
    return tenureFromJoining(doj)||'';
  }
  return '';
}
function isEmpDetailBlobValue(value){
  if(typeof value!=='string') return false;
  if(value.startsWith('data:')) return true;
  return value.length>400;
}
function formatEmpDetailScalar(value,format,employee){
  if(value==null||value==='') return '';
  if(typeof value==='boolean') return value?'Yes':'No';
  if(format==='company') return employeeCompanyName(employee)||String(value);
  if(format==='ctc') return displayCtc(value);
  if(format==='date') return formatDateOnly(value)||String(value);
  if(format==='datetime'){
    const formatted=formatSalaryEditTime(value);
    return formatted&&formatted!=='—'&&formatted!=='Time unavailable'?formatted:String(value);
  }
  if(isEmpDetailBlobValue(value)) return 'Attached file data (hidden)';
  if(typeof value==='object') return '';
  return String(value);
}
function empDetailGridCell(label,display,opts={}){
  const empty=display==null||display==='';
  const text=empty?(opts.empty||'—'):display;
  const style=opts.strongStyle?` style="${opts.strongStyle}"`:'';
  return `<div><span>${safeText(label)}</span><strong${style}>${opts.raw?text:safeText(text)}</strong></div>`;
}
function empDetailSectionTitle(icon,title){
  return `<div class="card-title emp-detail-section-title"><i class="ti ${icon}" aria-hidden="true"></i> ${safeText(title)}</div>`;
}
function formatEmpDetailObjectSummary(value,depth=0){
  if(value==null||value==='') return '—';
  if(typeof value!=='object') return isEmpDetailBlobValue(String(value))?'Attached file data (hidden)':String(value);
  if(Array.isArray(value)){
    if(!value.length) return 'None';
    if(value.every(item=>item==null||['string','number','boolean'].includes(typeof item))){
      return value.map(v=>String(v)).join(', ');
    }
    return `${value.length} item${value.length===1?'':'s'}`;
  }
  if(depth>1) return 'Object';
  const parts=Object.keys(value).filter(k=>{
    if(k==='fileData'||k==='photo') return false;
    const v=value[k];
    return v!=null&&v!==''&&typeof v!=='function'&&!isEmpDetailBlobValue(String(v));
  }).slice(0,8).map(k=>`${humanizeEmpFieldKey(k)}: ${formatEmpDetailObjectSummary(value[k],depth+1)}`);
  return parts.length?parts.join(' · '):'—';
}
function empDetailSalarySection(e){
  ensureEmployeeSalaryHistory(e);
  const history=[...(e.salaryHistory||[])].sort((a,b)=>new Date(b.effectiveDate||b.recordedAt)-new Date(a.effectiveDate||a.recordedAt));
  const historyRows=history.length?history.slice(0,12).map(h=>`<tr>
      <td>${safeText(h.effectiveDate||'—')}</td>
      <td>${safeText(h.type||'update')}</td>
      <td>${displayCtc(h.previousCtc)}</td>
      <td><strong>${displayCtc(h.newCtc)}</strong></td>
      <td>${parseCtcAmount(h.bonusAmount)>0?displayCtc(h.bonusAmount):'—'}</td>
      <td>${safeText(h.notes||'—')}</td>
      <td>${safeText(formatSalaryEditTime(h.recordedAt))}</td>
      <td>${safeText(h.recordedBy||'HR')}</td>
    </tr>`).join(''):`<tr><td colspan="8" style="text-align:center;color:var(--color-text-secondary)">No salary history yet.</td></tr>`;
  return `${empDetailSectionTitle('ti-currency-rupee','Salary history')}
    <div style="overflow-x:auto">
      <table class="etable">
        <thead><tr><th>Effective</th><th>Type</th><th>Previous CTC</th><th>New CTC</th><th>Bonus</th><th>Notes</th><th>Edited at</th><th>Recorded by</th></tr></thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>`;
}
function empDetailDocumentsSection(e){
  const docs=Array.isArray(e.documents)?e.documents:[];
  const rows=docs.length?docs.map(doc=>{
    const typeLabel=isGeneratedEmployeeDocument(doc)?'Generated':docTypeLabel(doc.type);
    const stamp=formatSalaryEditTime(doc.generatedAt||doc.uploadedAt);
    return `<tr>
      <td>${safeText(typeLabel)}</td>
      <td>${safeText(doc.title||doc.fileName||'Untitled')}</td>
      <td>${safeText(doc.fileName||'—')}</td>
      <td>${safeText(stamp)}</td>
      <td>${safeText(doc.uploadedBy||'—')}</td>
      <td>${doc.acknowledgedAt?safeText(formatSalaryEditTime(doc.acknowledgedAt)):(isGeneratedEmployeeDocument(doc)?'—':'Pending')}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="6" style="text-align:center;color:var(--color-text-secondary)">No documents on file.</td></tr>`;
  return `${empDetailSectionTitle('ti-files',`Documents (${docs.length})`)}
    <div style="overflow-x:auto">
      <table class="etable">
        <thead><tr><th>Type</th><th>Title</th><th>File</th><th>Uploaded</th><th>By</th><th>Ack</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function empDetailAssetsSection(e){
  const assets=Array.isArray(e.assets)?e.assets:[];
  if(!assets.length) return '';
  const rows=assets.map(asset=>{
    const typeText=asset.type==='others'&&asset.otherDetail
      ?`${asset.typeLabel||'Others'} — ${asset.otherDetail}`
      :(asset.typeLabel||assetTypeLabel(asset.type));
    const statusLabel=asset.status==='returned'
      ?`Returned${asset.returnedAt?` (${formatAssetDate(asset.returnedAt)})`:''}`
      :'Allocated';
    return `<tr>
      <td>${safeText(typeText)}</td>
      <td>${safeText(asset.serialOrTag||'—')}</td>
      <td>${safeText(formatAssetDate(asset.allocatedAt))}</td>
      <td>${safeText(asset.allocatedBy||'—')}</td>
      <td><span class="badge ${asset.status==='returned'?'b-archived':'b-active'}">${safeText(statusLabel)}</span></td>
      <td>${safeText(asset.remarks||'—')}</td>
    </tr>`;
  }).join('');
  return `${empDetailSectionTitle('ti-device-laptop',`Assets allocation (${assets.length})`)}
    <div style="overflow-x:auto">
      <table class="etable">
        <thead><tr><th>Asset type</th><th>Serial</th><th>Allocated</th><th>Allocated by</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function empDetailLeaveSection(e){
  const leave=e.leave;
  if(!leave||typeof leave!=='object') return '';
  const buckets=['annual','sick','wfh','comp'];
  const labels={annual:'Annual',sick:'Sick',wfh:'WFH',comp:'Comp-off'};
  const cells=buckets.map(key=>{
    const b=leave[key]||{u:0,t:0};
    const left=(b.t||0)-(b.u||0);
    return empDetailGridCell(`${labels[key]||humanizeEmpFieldKey(key)} leave`,`${left} left (${b.u||0}/${b.t||0} used)`);
  }).join('');
  const extras=Object.keys(leave).filter(k=>!buckets.includes(k)).map(k=>
    empDetailGridCell(humanizeEmpFieldKey(k),formatEmpDetailObjectSummary(leave[k]))
  ).join('');
  return `${empDetailSectionTitle('ti-beach','Leave balances')}<div class="profile-detail-grid">${cells}${extras}</div>`;
}
function empDetailBvgSection(e){
  const bvg=e.bvg;
  if(!bvg||typeof bvg!=='object') return '';
  const docs=bvg.docs&&typeof bvg.docs==='object'?bvg.docs:{};
  const docEntries=Object.entries(docs);
  const uploaded=docEntries.filter(([,doc])=>doc&&(doc.fileData||doc.fileName)).length;
  const knownList=typeof BVG_DOCUMENTS!=='undefined'&&Array.isArray(BVG_DOCUMENTS)?BVG_DOCUMENTS:null;
  const total=knownList?knownList.length:Math.max(uploaded,docEntries.length);
  const cells=[
    empDetailGridCell('BVG status',bvgStatusLabel(bvg.status||'pending')),
    empDetailGridCell('Documents uploaded',`${uploaded}${total?` / ${total}`:''}`),
    empDetailGridCell('Submitted at',bvg.submittedAt?formatSalaryEditTime(bvg.submittedAt):'—'),
    empDetailGridCell('Reviewed at',bvg.reviewedAt?formatSalaryEditTime(bvg.reviewedAt):'—'),
    empDetailGridCell('Reviewed by',bvg.reviewedBy||'—'),
    empDetailGridCell('HR note',bvg.note||'—')
  ].join('');
  let docRows='';
  if(knownList&&knownList.length){
    docRows=knownList.map(meta=>{
      const doc=docs[meta.key];
      return `<tr><td>${safeText(meta.label)}</td><td>${doc?.fileName?safeText(doc.fileName):(doc?.fileData?'Uploaded':'Not uploaded')}</td><td>${doc?.uploadedAt?safeText(formatSalaryEditTime(doc.uploadedAt)):'—'}</td></tr>`;
    }).join('');
  }else if(docEntries.length){
    docRows=docEntries.map(([key,doc])=>`<tr><td>${safeText(humanizeEmpFieldKey(key))}</td><td>${doc?.fileName?safeText(doc.fileName):(doc?.fileData?'Uploaded':'—')}</td><td>${doc?.uploadedAt?safeText(formatSalaryEditTime(doc.uploadedAt)):'—'}</td></tr>`).join('');
  }
  const table=docRows?`<div style="overflow-x:auto;margin-top:8px"><table class="etable"><thead><tr><th>Document</th><th>File</th><th>Uploaded</th></tr></thead><tbody>${docRows}</tbody></table></div>`:'';
  return `${empDetailSectionTitle('ti-shield-check','BVG / Preboarding')}<div class="profile-detail-grid">${cells}</div>${table}`;
}
function empDetailOtherFieldsSection(e,consumedKeys){
  const rows=[];
  Object.keys(e||{}).forEach(key=>{
    if(consumedKeys.has(key)||EMPLOYEE_DETAIL_IGNORE_KEYS.has(key)) return;
    const value=e[key];
    if(typeof value==='function') return;
    if(value==null||value==='') return;
    if(isEmpDetailBlobValue(String(value))){
      rows.push(empDetailGridCell(humanizeEmpFieldKey(key),'Attached file data (hidden)'));
      return;
    }
    if(typeof value==='object'){
      rows.push(empDetailGridCell(humanizeEmpFieldKey(key),formatEmpDetailObjectSummary(value)));
      return;
    }
    rows.push(empDetailGridCell(humanizeEmpFieldKey(key),String(value)));
  });
  const profile=e.profile&&typeof e.profile==='object'?e.profile:{};
  Object.keys(profile).forEach(key=>{
    if(key==='dob'||key==='hobbies'||key==='photo'||key==='personalEmail'||key==='fileData') return;
    const value=profile[key];
    if(value==null||value===''||typeof value==='function') return;
    if(isEmpDetailBlobValue(String(value))){
      rows.push(empDetailGridCell(`Profile · ${humanizeEmpFieldKey(key)}`,'Attached file data (hidden)'));
      return;
    }
    rows.push(empDetailGridCell(`Profile · ${humanizeEmpFieldKey(key)}`,typeof value==='object'?formatEmpDetailObjectSummary(value):String(value)));
  });
  if(!rows.length) return '';
  return `${empDetailSectionTitle('ti-list-details','Other details')}<div class="profile-detail-grid">${rows.join('')}</div>
    <div class="hint-box" style="margin-top:10px">New simple fields saved on the employee object appear here automatically — no detail HTML edit needed.</div>`;
}
/** Apply any [data-emp-field="key"] inputs inside a form root onto the employee record. */
function applyDataEmpFieldsFromForm(employee,root){
  if(!employee||!root) return;
  root.querySelectorAll('[data-emp-field]').forEach(el=>{
    const key=(el.getAttribute('data-emp-field')||'').trim();
    if(!key||EMPLOYEE_DETAIL_IGNORE_KEYS.has(key)||key==='id'||key==='password') return;
    const raw=el.type==='checkbox'?el.checked:String(el.value??'').trim();
    if(key.includes('.')){
      const parts=key.split('.');
      let cur=employee;
      for(let i=0;i<parts.length-1;i++){
        const part=parts[i];
        if(!cur[part]||typeof cur[part]!=='object') cur[part]={};
        cur=cur[part];
      }
      cur[parts[parts.length-1]]=raw;
    }else{
      employee[key]=raw;
    }
  });
}
function empDetailProbationSection(e){
  if(typeof ensureEmployeeProbation==='function') ensureEmployeeProbation(e);
  const p=e.probation;
  if(!p||typeof p!=='object') return '';
  const cells=[
    empDetailGridCell('Probation status',humanizeEmpFieldKey(p.confirmationStatus||'in_probation')),
    empDetailGridCell('Start date',formatDateOnly(p.startDate)||'—'),
    empDetailGridCell('End date',formatDateOnly(p.endDate)||'—'),
    empDetailGridCell('Extension required',p.extensionRequired?'Yes':'No'),
    empDetailGridCell('Manager feedback',p.managerFeedback||'—'),
    empDetailGridCell('Manager decision',p.managerDecision==='confirm'?'Confirm employment':(p.managerDecision==='extend'?'Extend probation':'—')),
    empDetailGridCell('HR confirmation',p.hrDecisionConfirmed?'Confirmed':(p.managerDecision?'Awaiting HR':'Waiting for manager')),
    empDetailGridCell('Performance review',p.performanceReview||'—')
  ].join('');
  return `${empDetailSectionTitle('ti-hourglass','Probation')}<div class="profile-detail-grid">${cells}</div>`;
}
function empDetailEmploymentHistorySection(e){
  const history=Array.isArray(e.employmentHistory)?[...e.employmentHistory].slice().reverse():[];
  if(!history.length) return '';
  const rows=history.slice(0,24).map(h=>{
    const note=h.notes||formatEmpDetailObjectSummary(h.previous||h.next||h);
    return `<tr>
      <td>${safeText(humanizeEmpFieldKey(h.type||'update'))}</td>
      <td>${safeText(formatDateOnly(h.effectiveDate)||'—')}</td>
      <td>${safeText(note||'—')}</td>
      <td>${safeText(formatSalaryEditTime(h.recordedAt||h.at))}</td>
    </tr>`;
  }).join('');
  return `${empDetailSectionTitle('ti-history','Employment history')}
    <div style="overflow-x:auto">
      <table class="etable">
        <thead><tr><th>Event</th><th>Effective</th><th>Details</th><th>Recorded</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function empDetailDateOfJoiningEditsSection(e){
  const edits=Array.isArray(e.dateOfJoiningEdits)?e.dateOfJoiningEdits:[];
  if(!edits.length) return '';
  const rows=edits.slice(0,20).map(edit=>`<tr>
      <td>${safeText(formatDateOnly(edit.oldValue)||'—')}</td>
      <td><strong>${safeText(formatDateOnly(edit.newValue)||'—')}</strong></td>
      <td>${safeText(formatQueryTime(edit.editedAt))}</td>
      <td>${safeText(edit.editedBy||'HR')}</td>
    </tr>`).join('');
  return `${empDetailSectionTitle('ti-calendar-event','Joining date edits')}
    <div style="overflow-x:auto">
      <table class="etable">
        <thead><tr><th>Previous</th><th>New</th><th>Edited at</th><th>Edited by</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function employeeDetailOverviewHtml(e,opts={}){
  ensureEmployeeSalaryHistory(e);
  const leave=e.leave||{annual:{u:0,t:18},sick:{u:0,t:8},wfh:{u:0,t:12},comp:{u:0,t:3}};
  const pr=policyReadStats(e);
  const history=[...(e.salaryHistory||[])].sort((a,b)=>new Date(b.effectiveDate||b.recordedAt)-new Date(a.effectiveDate||a.recordedAt));
  const prevCtc=history.length>1?displayCtc(history[1]?.newCtc||history[0]?.previousCtc):'—';
  const consumedKeys=new Set(['name']);
  const curatedCells=EMPLOYEE_PROFILE_FIELDS.map(field=>{
    const rootKey=field.key.includes('.')?field.key.split('.')[0]:field.key;
    consumedKeys.add(rootKey);
    (field.aliases||[]).forEach(a=>consumedKeys.add(a.includes('.')?a.split('.')[0]:a));
    if(field.key==='status'){
      return empDetailGridCell(field.label,employeeStatusHtml(e),{raw:true,empty:'—'});
    }
    if(field.key==='location'){
      return empDetailGridCell(field.label,employeeReportingPlaceLabel(e),{empty:'Not assigned'});
    }
    if(field.key==='dateOfJoining'){
      const rawDoj=getEmployeeFieldRaw(e,field);
      const dojDisplay=formatEmpDetailScalar(rawDoj,'date',e)||'Not set';
      const lastEdit=lastDateOfJoiningEditAt(e);
      const editNote=lastEdit?`<div style="font-size:11px;color:var(--color-text-tertiary);font-weight:400;margin-top:2px">Last edited ${safeText(formatQueryTime(lastEdit))}</div>`:'';
      return `<div><span>${safeText(field.label)}</span><strong>${safeText(dojDisplay)}</strong>${editNote}</div>`;
    }
    const raw=getEmployeeFieldRaw(e,field);
    let display=formatEmpDetailScalar(raw,field.format,e);
    if(field.key==='tenure'&&!display) display='Not available';
    if(field.key==='ctc'){
      return empDetailGridCell(field.label,display||'—',{strongStyle:'color:#3B6D11',empty:'—'});
    }
    return empDetailGridCell(field.label,display,{empty:field.format==='date'?'Not set':'—'});
  }).join('');
  const computedCells=[
    empDetailGridCell('Previous CTC',prevCtc),
    empDetailGridCell('Last salary edit',formatSalaryEditTime(e.salaryUpdatedAt||history[0]?.recordedAt)),
    empDetailGridCell('Annual leave left',String((leave.annual?.t||0)-(leave.annual?.u||0))),
    empDetailGridCell('Sick leave left',String((leave.sick?.t||0)-(leave.sick?.u||0))),
    empDetailGridCell('WFH left',String((leave.wfh?.t||0)-(leave.wfh?.u||0))),
    empDetailGridCell('Comp-off left',String((leave.comp?.t||0)-(leave.comp?.u||0))),
    empDetailGridCell('Policies read',`${pr.read}/${pr.total}`),
    empDetailGridCell('Documents on file',String((e.documents||[]).length)),
    empDetailGridCell('Assets allocated',String((e.assets||[]).filter(a=>a.status!=='returned').length))
  ].join('');
  const headMeta=opts.selfService
    ?`${safeText(e.email||'')} · ${safeText(employeeCompanyName(e))} · ${safeText(e.designation||e.role||'Employee')}`
    :`${safeText(employeeCompanyName(e))} · ${safeText(e.designation||e.role||'Employee')}`;
  const headStatus=opts.selfService?`<div style="margin-top:6px">${employeeStatusHtml(e)}</div>`:'';
  return {
    consumedKeys,
    html:`<div class="profile-detail-head">${avatarHtml(e,'av av-e profile-detail-photo')}<div><div class="ri-name">${safeText(e.name)}</div><div class="ri-meta">${headMeta}</div>${headStatus}</div></div>
    <div class="profile-detail-grid">${curatedCells}${computedCells}</div>`
  };
}
function adminEmployeeDetailHtml(e,opts={}){
  const overview=employeeDetailOverviewHtml(e,opts);
  return `${overview.html}
    ${empDetailSalarySection(e)}
    ${empDetailDocumentsSection(e)}
    ${empDetailAssetsSection(e)}
    ${empDetailLeaveSection(e)}
    ${empDetailProbationSection(e)}
    ${empDetailDateOfJoiningEditsSection(e)}
    ${empDetailEmploymentHistorySection(e)}
    ${empDetailBvgSection(e)}
    ${empDetailOtherFieldsSection(e,overview.consumedKeys)}`;
}

window.openEmployeeDetail=function(empId){
  const employee=employeeById(empId);
  if(!employee){toast('Employee not found');return;}
  if(!assertEmployeeInHrScope(employee,'view details for')) return;
  const body=document.getElementById('empDetailBody');
  const title=document.getElementById('empDetailTitle');
  if(title) title.textContent=`Employee details — ${employee.name}`;
  if(body) body.innerHTML=adminEmployeeDetailHtml(employee);
  const editBtn=document.getElementById('empDetailEditBtn');
  const salBtn=document.getElementById('empDetailSalaryBtn');
  if(editBtn) editBtn.setAttribute('data-emp-id',employee.id);
  if(salBtn) salBtn.setAttribute('data-emp-id',employee.id);
  openM('mEmpDetail');
};

window.openEmployeeEditorFromDetail=function(){
  const id=document.getElementById('empDetailEditBtn')?.getAttribute('data-emp-id');
  if(!id) return;
  closeM('mEmpDetail');
  openEmployeeEditor(id);
};

window.openSalaryFromDetail=function(){
  const id=document.getElementById('empDetailSalaryBtn')?.getAttribute('data-emp-id');
  if(!id) return;
  closeM('mEmpDetail');
  if(typeof openSalaryChangeModal==='function') openSalaryChangeModal(id,'correction');
  else toast('Salaries module unavailable');
};

function hrEmploymentProfileHtml(e){
  const identity=`
    <div class="profile-grid">
      <div><span>Employee ID</span><strong>${e.employeeCode||'Not assigned'}</strong></div>
      <div><span>Official Email</span><strong>${e.email||'Not assigned'}</strong></div>
    </div>`;
  if(!hasEmployeeHrProfile(e)){
    return `${identity}<div class="hint-box">Full employment details are filled during onboarding and appear here after handoff.</div>`;
  }
  return `${identity}<div class="profile-grid">
      <div><span>Date of Joining</span><strong>${formatDateOnly(e.dateOfJoining)||'Not set'}</strong></div>
      <div><span>Date of Confirmation</span><strong>${formatDateOnly(e.dateOfConfirmation||confirmationDateFromJoining(e.dateOfJoining))||'Not set'}</strong></div>
      <div><span>Reporting Manager</span><strong>${e.reportingManager||e.manager||'Not assigned'}</strong></div>
      <div><span>Reporting place</span><strong>${employeeReportingPlaceLabel(e)}</strong></div>
      <div><span>BU Head (person)</span><strong>${e.buHead||'Not assigned'}</strong></div>
      <div><span>Unit name (BU)</span><strong>${employeeUnitName(e)||'Not assigned'}</strong></div>
      <div><span>Project</span><strong>${e.project||'Not assigned'}</strong></div>
      <div><span>Department</span><strong>${e.department||e.dept||'Not assigned'}</strong></div>
      <div><span>Designation</span><strong>${e.designation||e.role||'Employee'}</strong></div>
      <div><span>KMP / Other</span><strong>${e.kmpCategory||'Other'}</strong></div>
      <div><span>Grade</span><strong>${e.grade||'Not assigned'}</strong></div>
      <div><span>SBU</span><strong>${e.sbu||'Not assigned'}</strong></div>
      <div><span>SBU 1</span><strong>${e.sbu1||'Not assigned'}</strong></div>
      <div><span>Function Group</span><strong>${e.functionGroup||'Not assigned'}</strong></div>
      <div><span>Functional Category</span><strong>${e.functionalCategory||'Not assigned'}</strong></div>
      <div><span>Tenure</span><strong>${e.tenure||tenureFromJoining(e.dateOfJoining)||'Not available'}</strong></div>
      <div><span>Status</span><strong>${employeeStatusHtml(e)}</strong></div>
    </div>`;
}

async function sendAppointmentLetterReadyEmail(employee){
  const res=await fetch('/api/send-appointment-letter-email',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      companyName:COMPANY.companyName,
      portalName:COMPANY.portalName,
      portalUrl:location.origin+'/index.html',
      employee:{name:employee.name,email:employee.email}
    })
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Email could not be sent');
  return data;
}

async function notifyAppointmentLetterReady(employee){
  const email=String(employee?.email||'').trim();
  if(!email||!email.includes('@')){
    toast('Appointment letter saved. No employee email on file, so no notification was sent.');
    return;
  }
  try{
    await sendAppointmentLetterReadyEmail(employee);
    toast(`Appointment letter saved. Email sent to ${email}.`);
  }catch(err){
    toast(`Letter saved, but email failed (${err.message}).`);
  }
}

async function sendEmployeeWelcomeEmail(employee,tempPass){
  const res=await fetch('/api/send-welcome-email',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      companyName:COMPANY.companyName,
      portalName:COMPANY.portalName,
      portalUrl:location.origin,
      employee:{name:employee.name,email:employee.email,tempPassword:tempPass}
    })
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Email could not be sent');
  return data;
}

function clearEmployeeDeleteTombstones(email,rowId=''){
  const normalizedEmail=String(email||'').trim().toLowerCase();
  const normalizedId=String(rowId||'').trim();
  let cleared=false;
  store.deletedEmployeeEmails=Array.isArray(store.deletedEmployeeEmails)?store.deletedEmployeeEmails:[];
  store.deletedEmployeeIds=Array.isArray(store.deletedEmployeeIds)?store.deletedEmployeeIds:[];
  if(normalizedEmail&&store.deletedEmployeeEmails.includes(normalizedEmail)){
    store.deletedEmployeeEmails=store.deletedEmployeeEmails.filter(item=>item!==normalizedEmail);
    cleared=true;
  }
  if(normalizedId&&store.deletedEmployeeIds.includes(normalizedId)){
    store.deletedEmployeeIds=store.deletedEmployeeIds.filter(item=>item!==normalizedId);
    cleared=true;
  }
  return cleared;
}

function ensurePortalLoginPassword(employee,{sheetPass='',defaultPass='emp123'}={}){
  if(!employee) return;
  const existingPass=String(employee.password||'').trim();
  if(existingPass) return;
  const fallback=(String(sheetPass||'').trim()||String(defaultPass||'').trim()||'emp123');
  employee.password=fallback.length>=4?fallback:'emp123';
  employee.mustChangePassword=true;
}

async function applyEmployeeRows(rows,{resultId='bulkEmpResult',manual=false,source='upload',sendEmails=true,preserveHrFields=false}={}){
  const result=document.getElementById(resultId);
  const knownEmails=new Set([...store.employees,...store.hrs].map(user=>String(user.email||'').toLowerCase()));
  const created=[];
  const updated=[];
  const skipped=[];
  const scopedRows=filterEmployeeRowsForHrScope(rows);

  scopedRows.forEach(row=>{
    const email=(row.email||'').trim().toLowerCase();
    const sheetPass=String(row.tempPass||row.tempPassword||'').trim();
    const defaultPass=(document.getElementById('empBulkDefaultPass')?.value||'emp123').trim()||'emp123';
    if(!row.name||!isEmail(email)){
      skipped.push(`Line ${row.line||'?'}: invalid name or email`);
      return;
    }
    if((store.retiredEmployeeEmails||[]).includes(email)){
      skipped.push(`Line ${row.line||'?'}: ${email} was replaced by HR and is no longer an active login`);
      return;
    }
    const rowId=String(row.employeeId||'').trim();
    // Deleted employees stay gone: Sync Excel / sheet ensure / seed / bulk never clear tombstones
    // or recreate. Only Admin/HR Add employee (or explicit restore) clears the email tombstone.
    if((store.deletedEmployeeEmails||[]).includes(email)){
      skipped.push(`Line ${row.line||'?'}: ${email} was deleted and will not be recreated (use Add employee to restore)`);
      return;
    }
    const idTombstoned=Boolean(rowId&&(store.deletedEmployeeIds||[]).includes(rowId));
    if(idTombstoned&&!store.employees.some(employee=>String(employee.email||'').toLowerCase()===email)){
      skipped.push(`Line ${row.line||'?'}: ${email} was deleted and will not be recreated (use Add employee to restore)`);
      return;
    }
    const existing=store.employees.find(employee=>String(employee.email||'').toLowerCase()===email)
      || (!idTombstoned&&row.employeeId&&store.employees.find(employee=>employee.id===row.employeeId))
      || (row.employeeCode&&store.employees.find(employee=>(employee.employeeCode||'').toLowerCase()===String(row.employeeCode).toLowerCase()));
    if(existing){
      if(isCompanyHrSession()&&!employeeInHrScope(existing)){
        skipped.push(`Line ${row.line||'?'}: ${email} belongs to another company`);
        return;
      }
      existing.name=row.name;
      if(email&&String(existing.email||'').toLowerCase()!==email){
        store.retiredEmployeeEmails=store.retiredEmployeeEmails||[];
        const previous=String(existing.email||'').toLowerCase();
        if(previous&&!store.retiredEmployeeEmails.includes(previous)) store.retiredEmployeeEmails.push(previous);
        existing.email=email;
      }
      if(!preserveHrFields){
        existing.dept=row.dept||existing.dept||'General';
        existing.role=row.role||existing.role||'Employee';
      }
      // Employment handoff from onboarding/CSV always refreshes HR profile fields when present
      applyHrEmploymentFields(existing,row,{overwrite:true});
      if(row.dept&&!preserveHrFields) existing.department=row.dept;
      // Sheet presence means this person should have portal access.
      existing.status='Active';
      // Never overwrite a portal password from Excel once the account exists.
      // Only fill blank/missing passwords so pre-existing emails can log in.
      ensurePortalLoginPassword(existing,{sheetPass:'',defaultPass:'emp123'});
      updated.push(existing);
      return;
    }
    const pass=(sheetPass||defaultPass||'emp123').trim();
    if(pass.length<4){
      skipped.push(`Line ${row.line||'?'}: temporary password too short`);
      return;
    }
    if(knownEmails.has(email)){
      skipped.push(`Line ${row.line||'?'}: ${email} already exists`);
      return;
    }
    knownEmails.add(email);
    const employee=createEmployeeRecord({
      id:idTombstoned?undefined:row.employeeId,
      employeeCode:row.employeeCode,
      name:row.name,
      email,
      dept:row.dept,
      role:row.role,
      tempPass:pass,
      companyId:row.companyId,
      hrFields:row
    });
    applyHrEmploymentFields(employee,row,{overwrite:true});
    store.employees.push(employee);
    created.push({employee,tempPass:pass,line:row.line});
  });

  if(!created.length&&!updated.length){
    if(manual&&result) result.innerHTML=`<div class="hint-box danger-soft">No employee changes found.${skipped.length?`<br>${skipped.slice(0,8).join('<br>')}`:''}</div>`;
    return {created,updated,skipped,emailResults:[]};
  }

  try{
    saveStore();
  }catch(err){
    const createdIds=new Set(created.map(item=>item.employee.id));
    store.employees=store.employees.filter(employee=>!createdIds.has(employee.id));
    toast('Employees could not be saved. Browser storage may be full.');
    return {created:[],updated:[],skipped:[...skipped,'Browser storage may be full'],emailResults:[]};
  }

  renderEmpTable();
  if(created.length) toast(`${created.length} new employee(s) created from ${source}.${sendEmails?' Sending emails...':''}`);

  const emailResults=[];
  for(const item of sendEmails?created:[]){
    try{
      await sendEmployeeWelcomeEmail(item.employee,item.tempPass);
      emailResults.push({ok:true,email:item.employee.email});
    }catch(err){
      emailResults.push({ok:false,email:item.employee.email,error:err.message});
    }
  }

  const sent=emailResults.filter(item=>item.ok).length;
  const failed=emailResults.filter(item=>!item.ok);
  if(result&&(manual||created.length||updated.length)){
    result.innerHTML=`<div class="hint-box ${failed.length?'':'success-soft'}"><strong>${created.length} created, ${updated.length} updated.</strong><br>${sent} welcome emails sent.${failed.length?`<br>${failed.length} email(s) failed: ${failed.slice(0,5).map(item=>`${item.email} - ${item.error}`).join('<br>')}`:''}${skipped.length?`<br><br>Skipped rows:<br>${skipped.slice(0,8).join('<br>')}`:''}<br><br>Changed portal passwords were not updated from Excel. New accounts use sheet tempPassword or emp123. Deleted employees are not restored by Sync.</div>`;
  }
  if(manual) toast(failed.length?`${sent}/${created.length} emails sent. Check sync summary.`:`${source} sync complete.`);
  const fromExcel=/excel sync|onboarding employee master/i.test(String(source||''));
  if(!fromExcel&&(created.length||updated.length)) scheduleEmployeeSheetPush('employee-rows');
  return {created,updated,skipped,emailResults};
}

function filterEmployeeRowsForHrScope(rows=[]){
  if(!Array.isArray(rows)||!rows.length) return [];
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId();
    return rows.filter(row=>{
      const rowCompany=row.companyId||inferCompanyIdFromRow(row);
      return (rowCompany||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid;
    });
  }
  if(isCentralHrSession()&&!isAllCompaniesView()){
    const cid=activeCompanyId||PORTAL_COMPANIES[0]?.id;
    return rows.filter(row=>{
      const rowCompany=row.companyId||inferCompanyIdFromRow(row);
      return (rowCompany||PORTAL_COMPANIES[0]?.id||'VNSPL')===cid;
    });
  }
  return rows;
}

function inferCompanyIdFromRow(row={}){
  if(row.companyId){
    const resolved=resolveCompanyId(row.companyId);
    if(PORTAL_COMPANIES.some(c=>c.id===resolved)) return resolved;
  }
  if(row.companyName){
    const matched=PORTAL_COMPANIES.find(c=>c.name.toLowerCase()===String(row.companyName).trim().toLowerCase()||String(c.code||'').toLowerCase()===String(row.companyName).trim().toLowerCase());
    if(matched) return matched.id;
  }
  return row.companyId?resolveCompanyId(row.companyId):'';
}

window.syncEmployeesFromBackendSheet=async function(manual=false){
  if(employeeSheetSyncing) return;
  employeeSheetSyncing=true;
  const result=document.getElementById('sheetSyncResult');
  const syncBtn=document.getElementById('empSyncExcelBtn');
  if(syncBtn){
    syncBtn.disabled=true;
    syncBtn.dataset.prevHtml=syncBtn.innerHTML;
    syncBtn.innerHTML='<i class="ti ti-loader-2" aria-hidden="true"></i> Syncing...';
  }
  try{
    const res=await fetch('/api/employee-sheet',{cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Employee sheet could not be read');
    if(!manual&&data.modifiedAt&&data.modifiedAt===lastEmployeeSheetModifiedAt) return;
    lastEmployeeSheetModifiedAt=data.modifiedAt||Date.now();
    const rows=Array.isArray(data.employees)?data.employees:[];
    if(!rows.length){
      if(manual&&result) result.innerHTML=`<div class="hint-box">Connected to ${data.path||'employee sheet'}, but no employee rows were found.</div>`;
      if(manual) toast('Employee sheet has no rows');
      return;
    }
    const scopeLabel=isCompanyHrSession()
      ?companyLabelById(lockedHrCompanyId())
      :(isAllCompaniesView()?'All Entities':companyLabelById(activeCompanyId));
    await applyEmployeeRows(rows,{resultId:'sheetSyncResult',manual,source:`Excel sync (${scopeLabel})`,sendEmails:false,preserveHrFields:true});
  }catch(err){
    if(manual&&result) result.innerHTML=`<div class="hint-box danger-soft">${err.message}</div>`;
    if(manual) toast(`Excel sync failed: ${err.message}`);
  }finally{
    employeeSheetSyncing=false;
    if(syncBtn){
      syncBtn.disabled=false;
      syncBtn.innerHTML=syncBtn.dataset.prevHtml||'<i class="ti ti-refresh" aria-hidden="true"></i> Sync Excel';
    }
  }
};

function excelPushScopeId(){
  if(currentUser?.portal==='buHead'){
    const scope=buHeadCompanyScopeId(currentBuHeadRecord()||currentUser);
    return scope===PORTAL_ALL_COMPANIES_ID?'all':scope;
  }
  if(isCompanyHrSession()) return lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
  if(isCentralHrSession()&&!isAllCompaniesView()) return activeCompanyId||PORTAL_COMPANIES[0]?.id||'VNSPL';
  return 'all';
}

function employeesForExcelPush(){
  const scope=excelPushScopeId();
  const all=store.employees||[];
  if(scope==='all') return sortedPortalEmployees(all);
  return sortedPortalEmployees(all.filter(e=>resolveCompanyId(e.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')===scope));
}

function employeeToSheetRow(employee){
  // Never map employee.password (or any portal secret) into the sheet payload.
  return {
    employeeId:employee.id||'',
    employeeCode:employee.employeeCode||'',
    name:employee.name||'',
    email:String(employee.email||'').trim().toLowerCase(),
    department:employee.dept||employee.department||'',
    dept:employee.dept||employee.department||'',
    role:employee.role||employee.designation||'',
    tempPassword:'',
    companyId:employee.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL',
    companyName:employeeCompanyName(employee),
    status:employee.status||'Active',
    dateOfJoining:employee.dateOfJoining||'',
    leavingDate:employee.leavingDate||employee.dateOfLeaving||'',
    bu:employeeUnitName(employee)||'',
    buHead:employee.buHead||'',
    project:employee.project||'',
    ctc:employee.ctc||''
  };
}

function scheduleEmployeeSheetPush(reason=''){
  if(employeeSheetSyncing) return;
  if(employeeSheetPushTimer) clearTimeout(employeeSheetPushTimer);
  employeeSheetPushTimer=setTimeout(()=>{
    employeeSheetPushTimer=null;
    syncEmployeesToBackendSheet(false,{reason}).catch(err=>console.error('Excel push failed:',err));
  },700);
}

window.syncEmployeesToBackendSheet=async function(manual=false,{reason=''}={}){
  if(employeeSheetPushing) return;
  if(currentUser?.portal!=='hr'&&currentUser?.portal!=='buHead'&&!manual) return;
  employeeSheetPushing=true;
  const result=document.getElementById('sheetSyncResult');
  const pushBtn=document.getElementById('empPushExcelBtn');
  if(pushBtn){
    pushBtn.disabled=true;
    pushBtn.dataset.prevHtml=pushBtn.innerHTML;
    pushBtn.innerHTML='<i class="ti ti-loader-2" aria-hidden="true"></i> Pushing...';
  }
  try{
    const scope=excelPushScopeId();
    const employees=employeesForExcelPush().map(employeeToSheetRow).filter(row=>row.email&&row.name);
    if(!employees.length&&scope==='all'){
      if(manual&&result) result.innerHTML='<div class="hint-box danger-soft">No employees to push. Refusing to wipe the Excel sheet.</div>';
      if(manual) toast('No employees to push');
      return;
    }
    const scopeLabel=scope==='all'?'All Entities':companyLabelById(scope);
    const res=await fetch('/api/employee-sheet',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({employees,companyId:scope,scope})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Employee sheet could not be updated');
    if(data.modifiedAt) lastEmployeeSheetModifiedAt=data.modifiedAt;
    const written=data.scopedWritten??data.written??employees.length;
    if(manual&&result){
      result.innerHTML=`<div class="hint-box success-soft"><strong>Pushed ${written} employee row(s) to Excel</strong> (${scopeLabel}).${data.backup?`<br>Backup: ${safeText(data.backup)}`:''}<br>Portal passwords were not written to the sheet.</div>`;
    }
    if(manual) toast(`Pushed ${written} employee(s) to Excel`);
    else if(reason) console.info(`Excel write-back (${reason}): ${written} rows`);
  }catch(err){
    if(manual&&result) result.innerHTML=`<div class="hint-box danger-soft">${err.message}</div>`;
    if(manual) toast(`Push to Excel failed: ${err.message}`);
    else console.error('Excel write-back failed:',err);
  }finally{
    employeeSheetPushing=false;
    if(pushBtn){
      pushBtn.disabled=false;
      pushBtn.innerHTML=pushBtn.dataset.prevHtml||'<i class="ti ti-upload" aria-hidden="true"></i> Push to Excel';
    }
  }
};

function parseEmployeeCsv(text){
  const rows=[];
  let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i],next=text[i+1];
    if(char==='"'&&quoted&&next==='"'){
      cell+='"';
      i++;
    }else if(char==='"'){
      quoted=!quoted;
    }else if(char===','&&!quoted){
      row.push(cell.trim());
      cell='';
    }else if((char==='\n'||char==='\r')&&!quoted){
      if(char==='\r'&&next==='\n') i++;
      row.push(cell.trim());
      if(row.some(value=>value)) rows.push(row);
      row=[];
      cell='';
    }else{
      cell+=char;
    }
  }
  row.push(cell.trim());
  if(row.some(value=>value)) rows.push(row);
  if(!rows.length) return [];
  const header=rows[0].map(value=>value.toLowerCase().replace(/\s+/g,''));
  const hasHeader=header.includes('email')||header.includes('companyemail')||header.includes('name')||header.includes('fullname');
  const dataRows=hasHeader?rows.slice(1):rows;
  const indexOf=(names, fallback)=>names.map(name=>header.indexOf(name)).find(index=>index>=0) ?? fallback;
  const indexes={
    employeeId:hasHeader?indexOf(['employeeid','id'],0):-1,
    employeeCode:hasHeader?indexOf(['employeecode','empid','hremployeeid','employeecodeid'],-1):-1,
    name:hasHeader?indexOf(['name','fullname','employee'],0):0,
    email:hasHeader?indexOf(['email','companyemail','officialemail','loginid','mail'],1):1,
    dept:hasHeader?indexOf(['department','dept'],2):2,
    role:hasHeader?indexOf(['role','designation','jobtitle'],3):3,
    tempPass:hasHeader?indexOf(['temppassword','temporarypassword','password','temppass'],4):4,
    dateOfJoining:hasHeader?indexOf(['dateofjoining','joiningdate','doj'],-1):-1,
    dateOfConfirmation:hasHeader?indexOf(['dateofconfirmation','confirmationdate'],-1):-1,
    reportingManager:hasHeader?indexOf(['reportingmanager','manager'],-1):-1,
    buHead:hasHeader?indexOf(['buhead'],-1):-1,
    bu:hasHeader?indexOf(['bu','businessunit','unit','businessunitname'],-1):-1,
    project:hasHeader?indexOf(['project'],-1):-1,
    designation:hasHeader?indexOf(['designation'],-1):-1,
    kmpCategory:hasHeader?indexOf(['kmpcategory','kmpother','kmp'],-1):-1,
    grade:hasHeader?indexOf(['grade'],-1):-1,
    sbu:hasHeader?indexOf(['sbu'],-1):-1,
    sbu1:hasHeader?indexOf(['sbu1','sbu_1'],-1):-1,
    functionGroup:hasHeader?indexOf(['functiongroup'],-1):-1,
    functionalCategory:hasHeader?indexOf(['functionalcategory'],-1):-1,
    tenure:hasHeader?indexOf(['tenure'],-1):-1,
    leavingDate:hasHeader?indexOf(['leavingdate','dateofleaving','exitdate','lastworkingday','leaving'],-1):-1,
    personalEmail:hasHeader?indexOf(['personalemail','personal_email','alternateemail','personalmail'],-1):-1,
    onboardedAt:hasHeader?indexOf(['onboardedat'],-1):-1,
    location:hasHeader?indexOf(['location','worklocation','officelocation','reportingplace'],-1):-1,
    status:hasHeader?indexOf(['status','employmentstatus'],-1):-1,
    ctc:hasHeader?indexOf(['ctc','currentctc','annualctc','salary'],-1):-1,
    companyId:hasHeader?indexOf(['companyid'],-1):-1,
    companyName:hasHeader?indexOf(['companyname'],-1):-1
  };
  const cellAt=(cells,index)=>index>=0?(cells[index]||'').trim():'';
  return dataRows.map((cells,line)=>({
    line:hasHeader?line+2:line+1,
    employeeId:cellAt(cells,indexes.employeeId),
    employeeCode:cellAt(cells,indexes.employeeCode),
    name:cellAt(cells,indexes.name),
    email:cellAt(cells,indexes.email).toLowerCase(),
    dept:cellAt(cells,indexes.dept),
    role:cellAt(cells,indexes.role),
    tempPass:cellAt(cells,indexes.tempPass),
    dateOfJoining:cellAt(cells,indexes.dateOfJoining),
    dateOfConfirmation:cellAt(cells,indexes.dateOfConfirmation),
    reportingManager:cellAt(cells,indexes.reportingManager),
    buHead:cellAt(cells,indexes.buHead),
    bu:cellAt(cells,indexes.bu),
    project:cellAt(cells,indexes.project),
    designation:cellAt(cells,indexes.designation)||cellAt(cells,indexes.role),
    kmpCategory:cellAt(cells,indexes.kmpCategory),
    grade:cellAt(cells,indexes.grade),
    sbu:cellAt(cells,indexes.sbu),
    sbu1:cellAt(cells,indexes.sbu1),
    functionGroup:cellAt(cells,indexes.functionGroup),
    functionalCategory:cellAt(cells,indexes.functionalCategory),
    tenure:cellAt(cells,indexes.tenure),
    leavingDate:cellAt(cells,indexes.leavingDate),
    personalEmail:cellAt(cells,indexes.personalEmail),
    onboardedAt:cellAt(cells,indexes.onboardedAt),
    location:cellAt(cells,indexes.location),
    status:cellAt(cells,indexes.status),
    ctc:cellAt(cells,indexes.ctc),
    companyId:cellAt(cells,indexes.companyId),
    companyName:cellAt(cells,indexes.companyName)
  }));
}

async function parseEmployeeUploadFile(file){
  if(/\.(csv)$/i.test(file.name)||file.type==='text/csv'){
    return parseEmployeeCsv(await file.text());
  }
  const fileData=await fileToDataUrl(file);
  const res=await fetch('/api/parse-employee-upload',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fileName:file.name,fileData})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Employee file could not be parsed');
  return Array.isArray(data.employees)?data.employees:[];
}

window.downloadEmployeeCsvTemplate=function(){
  const csv='name,email,department,role,tempPassword\nAarav Mehta,aarav@company.com,Engineering,Developer,\nNisha Rao,nisha@company.com,Finance,Analyst,Welcome123';
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='hrpulse-employee-bulk-template.csv';
  link.click();
  URL.revokeObjectURL(url);
};

window.bulkUploadEmployees=async function(){
  const file=document.getElementById('empBulkFile')?.files?.[0];
  const defaultPass=(document.getElementById('empBulkDefaultPass')?.value||'emp123').trim();
  const result=document.getElementById('bulkEmpResult');
  if(!file){toast('Choose a CSV or Excel file');return;}
  if(defaultPass.length<4){toast('Default temporary password must be at least 4 characters');return;}
  let rows=[];
  try{
    if(result) result.innerHTML='<div class="hint-box">Reading employee file...</div>';
    rows=await parseEmployeeUploadFile(file);
  }catch(err){
    if(result) result.innerHTML=`<div class="hint-box danger-soft">${err.message}</div>`;
    toast(err.message);
    return;
  }
  if(!rows.length){toast('File has no employee rows');return;}
  rows.forEach(row=>{ if(!row.tempPass) row.tempPass=defaultPass; });
  await applyEmployeeRows(rows,{resultId:'bulkEmpResult',manual:true,source:file.name});
  document.getElementById('empBulkFile').value='';
};

function fillAddEmpAccessTypeOptions(){
  const sel=document.getElementById('empAccessType');
  if(!sel) return;
  const current=sel.value||'employee';
  const opts=[{v:'employee',l:'Employee'}];
  if(isCentralHrSession()||isCompanyHrSession()) opts.push({v:'buHead',l:'BU Head'});
  if(canManageHrAdmins()) opts.push({v:'hr',l:'HR'});
  if(isCentralHrSession()||isCompanyHrSession()) opts.push({v:'it',l:'IT'});
  sel.innerHTML=opts.map(o=>`<option value="${o.v}">${o.l}</option>`).join('');
  sel.value=opts.some(o=>o.v===current)?current:'employee';
}
function fillAddEmpBuCompanyScope(selectedId=''){
  const select=document.getElementById('empBuCompanyScope');
  if(!select) return;
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
    const company=PORTAL_COMPANIES.find(c=>c.id===cid);
    select.innerHTML=`<option value="${cid}">${safeText(company?companyOptionLabel(company):cid)}</option>`;
    select.value=cid;
    select.disabled=true;
    return;
  }
  const selected=(!selectedId||selectedId===PORTAL_ALL_COMPANIES_ID||String(selectedId).toLowerCase()==='all')
    ?PORTAL_ALL_COMPANIES_ID
    :resolveCompanyId(selectedId);
  select.innerHTML=[
    `<option value="${PORTAL_ALL_COMPANIES_ID}">All Entities</option>`,
    ...PORTAL_COMPANIES.map(c=>`<option value="${c.id}">${safeText(companyOptionLabel(c))}</option>`)
  ].join('');
  select.value=selected;
  select.disabled=false;
}
function fillAddEmpHrCompany(selectedId=''){
  const companySelect=document.getElementById('empHrCompany');
  if(!companySelect) return;
  const selected=selectedId||(isAllCompaniesView()?PORTAL_COMPANIES[0]?.id:activeCompanyId)||PORTAL_COMPANIES[0]?.id;
  companySelect.innerHTML=PORTAL_COMPANIES.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${safeText(companyOptionLabel(c))}</option>`).join('');
}
function fillAddEmpItCompanyScope(selectedId=''){
  const select=document.getElementById('empItCompanyScope');
  if(!select) return;
  if(isCompanyHrSession()){
    const cid=lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
    const company=PORTAL_COMPANIES.find(c=>c.id===cid);
    select.innerHTML=`<option value="${cid}">${safeText(company?companyOptionLabel(company):cid)}</option>`;
    select.value=cid;
    select.disabled=true;
    return;
  }
  const selected=(!selectedId||selectedId===PORTAL_ALL_COMPANIES_ID||String(selectedId).toLowerCase()==='all')
    ?PORTAL_ALL_COMPANIES_ID
    :resolveCompanyId(selectedId);
  select.innerHTML=[
    `<option value="${PORTAL_ALL_COMPANIES_ID}">All Entities</option>`,
    ...PORTAL_COMPANIES.map(c=>`<option value="${c.id}">${safeText(companyOptionLabel(c))}</option>`)
  ].join('');
  select.value=selected;
  select.disabled=false;
}
function repairAddEmpItFields(){
  if(document.getElementById('empFieldsIt')) return;
  const hr=document.getElementById('empFieldsHr');
  if(!hr) return;
  hr.insertAdjacentHTML('afterend',`<div id="empFieldsIt" style="display:none"><div class="fg2"><div class="fi"><label>Title</label><input id="empItTitle" placeholder="IT Asset Admin" value="IT Asset Admin"></div><div class="fi"><label>Company scope</label><select id="empItCompanyScope"></select></div></div></div>`);
}
function addEmployeeLocationCompanyId(){
  if(typeof isCompanyHrSession==='function'&&isCompanyHrSession()){
    return lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
  }
  return resolveCompanyId(
    document.getElementById('empCompany')?.value
    ||(typeof isAllCompaniesView==='function'&&isAllCompaniesView()?PORTAL_COMPANIES[0]?.id:activeCompanyId)
    ||PORTAL_COMPANIES[0]?.id
    ||'VNSPL'
  );
}
function repairAddEmpLocationField(){
  const wrap=document.getElementById('empFieldsEmployee');
  if(!wrap||document.getElementById('empLocation')) return;
  wrap.insertAdjacentHTML('beforeend','<div class="fi"><label>Location</label><select id="empLocation" data-emp-field="location"></select></div>');
  const companySelect=document.getElementById('empCompany');
  if(companySelect&&!companySelect.getAttribute('onchange')){
    companySelect.setAttribute('onchange','fillAddEmpLocationOptions()');
  }
}
window.fillAddEmpLocationOptions=function(selected=''){
  repairAddEmpLocationField();
  const sel=document.getElementById('empLocation');
  if(!sel) return;
  const cid=addEmployeeLocationCompanyId();
  const options=locationsForCompany(cid);
  const keep=String(selected||sel.value||'').trim();
  const list=keep&&!options.includes(keep)?[keep,...options]:options.slice();
  sel.innerHTML='<option value="">Select location</option>'+list.map(loc=>`<option value="${safeText(loc)}">${safeText(loc)}</option>`).join('');
  if(keep&&list.includes(keep)) sel.value=keep;
};
function resetAddEmployeeFormFields(){
  ['empName','empEmail','empEmployeeCode','empDept','empRole','empBuUnit','empBuPersonName','empBuBudget','empHrTitle','empItTitle'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value='';
  });
  const locSel=document.getElementById('empLocation');
  if(locSel) locSel.value='';
  const person=document.getElementById('empBuPersonName');
  if(person) delete person.dataset.touched;
  const title=document.getElementById('empHrTitle');
  if(title){
    delete title.dataset.touched;
    title.value='Company HR';
  }
  const itTitle=document.getElementById('empItTitle');
  if(itTitle) itTitle.value='IT Asset Admin';
  const hrAccess=document.getElementById('empHrAccessRole');
  if(hrAccess) hrAccess.value='company';
  const passInput=document.getElementById('empPass');
  if(passInput) passInput.value=tempPassword();
}
function prepareAddEmployeeModal(){
  repairAddEmpItFields();
  fillAddEmpAccessTypeOptions();
  const typeSel=document.getElementById('empAccessType');
  if(typeSel) typeSel.value='employee';
  resetAddEmployeeFormFields();
  const companySelect=document.getElementById('empCompany');
  if(companySelect){
    companySelect.innerHTML=companySelectOptions();
    companySelect.disabled=isCompanyHrSession();
    if(!companySelect.getAttribute('onchange')) companySelect.setAttribute('onchange','fillAddEmpLocationOptions()');
  }
  fillAddEmpLocationOptions('');
  fillAddEmpBuCompanyScope(isCompanyHrSession()?(lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id):PORTAL_ALL_COMPANIES_ID);
  fillAddEmpHrCompany();
  fillAddEmpItCompanyScope(isCompanyHrSession()?(lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id):PORTAL_ALL_COMPANIES_ID);
  syncAddEmpAccessType();
}
window.onAddEmpNameInput=function(){
  const name=document.getElementById('empName')?.value||'';
  const person=document.getElementById('empBuPersonName');
  if(person&&person.dataset.touched!=='1') person.value=name;
};
window.syncAddEmpHrAccessFields=function(){
  const role=document.getElementById('empHrAccessRole')?.value||'company';
  const companyField=document.getElementById('empHrCompanyField');
  if(companyField) companyField.style.display=role==='company'?'':'none';
  const title=document.getElementById('empHrTitle');
  if(title&&title.dataset.touched!=='1'){
    title.value=role==='central'?'Central Admin':'Company HR';
  }
};
window.syncAddEmpAccessType=function(){
  repairAddEmpItFields();
  const type=document.getElementById('empAccessType')?.value||'employee';
  const empFields=document.getElementById('empFieldsEmployee');
  const buFields=document.getElementById('empFieldsBuHead');
  const hrFields=document.getElementById('empFieldsHr');
  const itFields=document.getElementById('empFieldsIt');
  if(empFields) empFields.style.display=type==='employee'?'':'none';
  if(buFields) buFields.style.display=type==='buHead'?'':'none';
  if(hrFields) hrFields.style.display=type==='hr'?'':'none';
  if(itFields) itFields.style.display=type==='it'?'':'none';
  const title=document.getElementById('empModalTitle');
  const saveBtn=document.getElementById('empModalSaveBtn');
  const hint=document.getElementById('empModalHint');
  if(type==='buHead'){
    if(title) title.textContent='Add BU Head';
    if(saveBtn) saveBtn.textContent='Create BU Head';
    if(hint) hint.textContent='Creates a BU Head login (Access management) plus a self-service employee profile. Temporary password is used once on first login.';
    fillAddEmpBuCompanyScope(document.getElementById('empBuCompanyScope')?.value||'');
    onAddEmpNameInput();
  }else if(type==='hr'){
    if(title) title.textContent='Add HR';
    if(saveBtn) saveBtn.textContent='Create HR login';
    if(hint) hint.textContent='Creates an HR/Admin portal login plus a self-service employee profile. Only Central Admin can create HR accounts.';
    syncAddEmpHrAccessFields();
  }else if(type==='it'){
    if(title) title.textContent='Add IT';
    if(saveBtn) saveBtn.textContent='Create IT login';
    if(hint) hint.textContent='Creates an IT portal login for asset inventory, allocations, and exit asset returns, plus a self-service employee profile in the IT department.';
    fillAddEmpItCompanyScope(document.getElementById('empItCompanyScope')?.value||'');
    const itTitle=document.getElementById('empItTitle');
    if(itTitle&&!itTitle.value) itTitle.value='IT Asset Admin';
  }else{
    if(title) title.textContent='Add employee';
    if(saveBtn) saveBtn.textContent='Create login';
    if(hint) hint.textContent='The employee will use this temporary password once, then create a new private password on first login.';
  }
};

async function addEmployeeAsBuHead(){
  if(!(isCentralHrSession()||isCompanyHrSession())){
    toast('Only HR can create BU Head logins');
    return;
  }
  const name=(document.getElementById('empName')?.value||'').trim();
  const email=(document.getElementById('empEmail')?.value||'').trim().toLowerCase();
  const personName=(document.getElementById('empBuPersonName')?.value||'').trim()||name;
  const bu=(document.getElementById('empBuUnit')?.value||'').trim();
  const budgetRaw=(document.getElementById('empBuBudget')?.value||'').trim();
  const budget=budgetRaw===''?0:parseCtcAmount(budgetRaw);
  const passInput=document.getElementById('empPass');
  let tempPass=String(passInput?.value||'').trim();
  if(!tempPass){
    tempPass=tempPassword();
    if(passInput) passInput.value=tempPass;
  }
  let companyId;
  if(isCompanyHrSession()){
    companyId=lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
  }else{
    const rawCompany=(document.getElementById('empBuCompanyScope')?.value||PORTAL_ALL_COMPANIES_ID).trim();
    companyId=(!rawCompany||rawCompany===PORTAL_ALL_COMPANIES_ID||rawCompany.toLowerCase()==='all')
      ?PORTAL_ALL_COMPANIES_ID
      :resolveCompanyId(rawCompany);
  }
  if(!name||!isEmail(email)){toast('Enter a valid name and email');return;}
  if(!bu){toast('Enter a unit name (BU)');return;}
  if(tempPass.length<4){toast('Temporary password must be at least 4 characters');return;}
  if(budgetRaw!==''&&budget<0){toast('Budget cannot be negative');return;}
  if(companyId!==PORTAL_ALL_COMPANIES_ID&&!PORTAL_COMPANIES.some(c=>c.id===companyId)){
    toast('Select a valid company scope');
    return;
  }
  if(emailTakenByOther(email)){toast('Email already exists');return;}
  if(!store.buHeads) store.buHeads=[];
  const head={
    id:nextBuHeadId(),
    name,
    email,
    password:tempPass,
    bu,
    budget,
    personName,
    companyId,
    status:'Active',
    title:'BU Head',
    accessRole:'buHead',
    mustChangePassword:true
  };
  store.buHeads.push(head);
  const empLenBefore=(store.employees||[]).length;
  const emp=ensureEmployeeForBuHead(head);
  const createdEmp=Boolean(emp&&(store.employees||[]).length>empLenBefore);
  if(emp){
    emp.password=tempPass;
    emp.mustChangePassword=true;
    clearEmployeeDeleteTombstones(email,emp.id);
  }
  try{
    saveStore();
  }catch(err){
    store.buHeads=(store.buHeads||[]).filter(h=>h.id!==head.id);
    if(createdEmp) store.employees=(store.employees||[]).filter(e=>e.id!==emp.id);
    toast('BU Head could not be saved. Browser storage may be full.');
    return;
  }
  closeM('mEmp');
  resetAddEmployeeFormFields();
  if(typeof renderEmpTable==='function') renderEmpTable();
  if(typeof renderBuHeadAdminList==='function') renderBuHeadAdminList();
  toast(`BU Head created for ${bu}. Sending welcome email...`);
  try{
    await sendEmployeeWelcomeEmail(emp||{name:personName||name,email},tempPass);
    toast(`Welcome email sent to ${email}.`);
  }catch(err){
    const msg=`BU Head saved, but welcome email failed (${err.message}). Share this temporary password manually: ${tempPass}`;
    toast(msg);
    window.alert(msg);
  }
}

async function addEmployeeAsHr(){
  if(!canManageHrAdmins()){
    toast('Only central Admin can create HR logins');
    return;
  }
  const name=(document.getElementById('empName')?.value||'').trim();
  const email=(document.getElementById('empEmail')?.value||'').trim().toLowerCase();
  const accessRole=document.getElementById('empHrAccessRole')?.value==='central'?'central':'company';
  const title=(document.getElementById('empHrTitle')?.value||'').trim()||(accessRole==='central'?'Central Admin':'Company HR');
  const companyId=accessRole==='central'
    ?PORTAL_ALL_COMPANIES_ID
    :(document.getElementById('empHrCompany')?.value||PORTAL_COMPANIES[0]?.id||'VNSPL');
  const passInput=document.getElementById('empPass');
  let tempPass=String(passInput?.value||'').trim();
  if(!tempPass){
    tempPass=tempPassword();
    if(passInput) passInput.value=tempPass;
  }
  if(!name||!isEmail(email)){toast('Enter a valid HR name and email');return;}
  if(tempPass.length<4){toast('Temporary password must be at least 4 characters');return;}
  if(accessRole==='company'&&!PORTAL_COMPANIES.some(c=>c.id===companyId)){toast('Select a valid company');return;}
  if(emailTakenByOther(email)){toast('Email already exists');return;}
  store.hrs=store.hrs||[];
  const hr={
    id:nextHrId(),
    name,
    email,
    password:tempPass,
    title,
    accessRole,
    companyId,
    mustChangePassword:true,
    status:'Active'
  };
  store.hrs.push(hr);
  const empLenBefore=(store.employees||[]).length;
  const emp=ensureEmployeeForHr(hr);
  const createdEmp=Boolean(emp&&(store.employees||[]).length>empLenBefore);
  if(emp){
    emp.password=tempPass;
    emp.mustChangePassword=true;
    clearEmployeeDeleteTombstones(email,emp.id);
  }
  try{
    saveStore();
  }catch(err){
    store.hrs=(store.hrs||[]).filter(h=>h.id!==hr.id);
    if(createdEmp) store.employees=(store.employees||[]).filter(e=>e.id!==emp.id);
    toast('HR login could not be saved. Browser storage may be full.');
    return;
  }
  closeM('mEmp');
  resetAddEmployeeFormFields();
  if(typeof renderEmpTable==='function') renderEmpTable();
  if(typeof refreshHrAccessViews==='function') refreshHrAccessViews();
  const createdLabel=accessRole==='central'?'Central Admin':'HR';
  const scopeLabel=accessRole==='central'?'All Entities':companyLabelById(companyId);
  toast(`${createdLabel} created (${scopeLabel}). Sending welcome email...`);
  try{
    await sendEmployeeWelcomeEmail(emp||{name,email},tempPass);
    toast(`Welcome email sent to ${email}.`);
  }catch(err){
    const msg=`HR saved, but welcome email failed (${err.message}). Share this temporary password manually: ${tempPass}`;
    toast(msg);
    window.alert(msg);
  }
}

async function addEmployeeAsIt(){
  if(!(isCentralHrSession()||isCompanyHrSession())){
    toast('Only HR can create IT logins');
    return;
  }
  repairAddEmpItFields();
  const name=(document.getElementById('empName')?.value||'').trim();
  const email=(document.getElementById('empEmail')?.value||'').trim().toLowerCase();
  const title=(document.getElementById('empItTitle')?.value||'').trim()||'IT Asset Admin';
  const passInput=document.getElementById('empPass');
  let tempPass=String(passInput?.value||'').trim();
  if(!tempPass){
    tempPass=tempPassword();
    if(passInput) passInput.value=tempPass;
  }
  let companyId;
  if(isCompanyHrSession()){
    companyId=lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL';
  }else{
    const rawCompany=(document.getElementById('empItCompanyScope')?.value||PORTAL_ALL_COMPANIES_ID).trim();
    companyId=(!rawCompany||rawCompany===PORTAL_ALL_COMPANIES_ID||rawCompany.toLowerCase()==='all')
      ?PORTAL_ALL_COMPANIES_ID
      :resolveCompanyId(rawCompany);
  }
  if(!name||!isEmail(email)){toast('Enter a valid IT name and email');return;}
  if(tempPass.length<4){toast('Temporary password must be at least 4 characters');return;}
  if(companyId!==PORTAL_ALL_COMPANIES_ID&&!PORTAL_COMPANIES.some(c=>c.id===companyId)){
    toast('Select a valid company scope');
    return;
  }
  if(emailTakenByOther(email)){toast('Email already exists');return;}
  store.itUsers=store.itUsers||[];
  const it={
    id:nextItUserId(),
    name,
    email,
    password:tempPass,
    title,
    accessRole:'it',
    companyId,
    mustChangePassword:true,
    status:'Active'
  };
  store.itUsers.push(it);
  const empLenBefore=(store.employees||[]).length;
  const emp=ensureEmployeeForIt(it);
  const createdEmp=Boolean(emp&&(store.employees||[]).length>empLenBefore);
  if(emp){
    emp.password=tempPass;
    emp.mustChangePassword=true;
    emp.dept='IT';
    emp.department='IT';
    emp.role=title;
    emp.designation=title;
    clearEmployeeDeleteTombstones(email,emp.id);
  }
  try{
    saveStore();
  }catch(err){
    store.itUsers=(store.itUsers||[]).filter(h=>h.id!==it.id);
    if(createdEmp) store.employees=(store.employees||[]).filter(e=>e.id!==emp.id);
    toast('IT login could not be saved. Browser storage may be full.');
    return;
  }
  closeM('mEmp');
  resetAddEmployeeFormFields();
  if(typeof renderEmpTable==='function') renderEmpTable();
  if(typeof renderItAdminList==='function') renderItAdminList();
  const scopeLabel=companyId===PORTAL_ALL_COMPANIES_ID?'All Entities':companyLabelById(companyId);
  toast(`IT login created (${scopeLabel}). Sending welcome email...`);
  try{
    await sendEmployeeWelcomeEmail(emp||{name,email},tempPass);
    toast(`Welcome email sent to ${email}.`);
  }catch(err){
    const msg=`IT saved, but welcome email failed (${err.message}). Share this temporary password manually: ${tempPass}`;
    toast(msg);
    window.alert(msg);
  }
}

window.addEmployee=async function(){
  const accessType=document.getElementById('empAccessType')?.value||'employee';
  if(accessType==='buHead') return addEmployeeAsBuHead();
  if(accessType==='hr') return addEmployeeAsHr();
  if(accessType==='it') return addEmployeeAsIt();

  const name=document.getElementById('empName').value.trim(), email=document.getElementById('empEmail').value.trim().toLowerCase();
  const employeeCode=document.getElementById('empEmployeeCode').value.trim();
  const passInput=document.getElementById('empPass');
  let tempPass=String(passInput?.value||'').trim();
  if(!tempPass){
    tempPass=tempPassword();
    if(passInput) passInput.value=tempPass;
  }
  if(!name||!isEmail(email)){toast('Enter a valid employee name and email');return;}
  if(!employeeCode){toast('Employee ID is required');return;}
  if(!/^[A-Za-z0-9_-]+$/.test(employeeCode)){toast('Employee ID can contain only letters, numbers, hyphens and underscores');return;}
  if(store.employees.some(item=>(item.employeeCode||'').toLowerCase()===employeeCode.toLowerCase())){toast('Employee ID already exists');return;}
  if(tempPass.length<4){toast('Temporary password must be at least 4 characters');return;}
  if(emailTakenByOther(email)){toast('Email already exists');return;}
  const employee=createEmployeeRecord({
    employeeCode,
    name,
    email,
    tempPass,
    dept:document.getElementById('empDept').value.trim(),
    role:document.getElementById('empRole').value.trim(),
    companyId:isCompanyHrSession()
      ?(lockedHrCompanyId()||PORTAL_COMPANIES[0]?.id||'VNSPL')
      :(document.getElementById('empCompany')?.value||undefined),
    hrFields:{location:(document.getElementById('empLocation')?.value||'').trim()}
  });
  if(!assertEmployeeInHrScope(employee,'add')) return;
  applyDataEmpFieldsFromForm(employee,document.getElementById('mEmp'));
  // Explicit Add employee is the only path that clears delete tombstones for this email.
  clearEmployeeDeleteTombstones(email,employee.id);
  store.employees.push(employee);
  try{
    saveStore();
  }catch(err){
    store.employees=store.employees.filter(e=>e.id!==employee.id);
    toast('Employee could not be saved. Browser storage may be full.');
    return;
  }
  closeM('mEmp');
  resetAddEmployeeFormFields();
  renderEmpTable();
  scheduleEmployeeSheetPush('add-employee');
  toast('Employee login created. Sending welcome email...');
  try{
    await sendEmployeeWelcomeEmail(employee,tempPass);
    toast(`Welcome email sent to ${email}.`);
  }catch(err){
    const msg=`Employee saved, but welcome email failed (${err.message}). Share this temporary password manually: ${tempPass}`;
    toast(msg);
    window.alert(msg);
  }
};
window.toggleEmployee=function(id){
  const e=employeeById(id);
  if(!e) return;
  if(!assertEmployeeInHrScope(e,'update')) return;
  e.status=e.status==='Active'?'Inactive':'Active';
  saveStore();renderEmpTable();
  scheduleEmployeeSheetPush('toggle-status');
  toast(`${e.name} is now ${e.status}`);
};

window.openEmployeeEditor=function(id){
  const employee=employeeById(id);
  if(!employee||currentUser?.portal!=='hr') return;
  if(!assertEmployeeInHrScope(employee,'edit')) return;
  document.getElementById('editEmpId').value=employee.id;
  document.getElementById('editEmpName').value=employee.name||'';
  document.getElementById('editEmpEmail').value=employee.email||'';
  document.getElementById('editEmpEmployeeCode').value=employee.employeeCode||'';
  const companySelect=document.getElementById('editEmpCompany');
  if(companySelect){
    companySelect.innerHTML=companySelectOptions(employee.companyId);
    companySelect.disabled=isCompanyHrSession();
  }
  document.getElementById('editEmpStatus').value=employee.status||'Active';
  const locEl=document.getElementById('editEmpLocation');
  if(locEl) locEl.value=employeeReportingPlace(employee)||employee.location||'';
  const dojEl=document.getElementById('editEmpDateOfJoining');
  if(dojEl) dojEl.value=employee.dateOfJoining||'';
  const dojEditedEl=document.getElementById('editEmpDojEditedAt');
  if(dojEditedEl){
    const lastEdit=lastDateOfJoiningEditAt(employee);
    dojEditedEl.textContent=lastEdit?formatQueryTime(lastEdit):'Not edited yet';
  }
  openM('mEditEmp');
};

window.saveEmployeeEdits=function(){
  const employee=employeeById(document.getElementById('editEmpId').value);
  if(!employee||currentUser?.portal!=='hr') return;
  if(!assertEmployeeInHrScope(employee,'edit')) return;
  const name=document.getElementById('editEmpName').value.trim();
  const email=document.getElementById('editEmpEmail').value.trim().toLowerCase();
  const employeeCode=document.getElementById('editEmpEmployeeCode').value.trim();
  if(!name||!isEmail(email)){toast('Enter a valid employee name and email');return;}
  if(!employeeCode){toast('Employee ID is required');return;}
  if(!/^[A-Za-z0-9_-]+$/.test(employeeCode)){toast('Employee ID can contain only letters, numbers, hyphens and underscores');return;}
  if(store.employees.some(item=>item.id!==employee.id&&(item.employeeCode||'').toLowerCase()===employeeCode.toLowerCase())){toast('Another employee already uses this Employee ID');return;}
  const duplicate=store.employees.some(item=>item.id!==employee.id&&item.email.toLowerCase()===email);
  if(duplicate){toast('Another employee already uses this email');return;}
  const previousEmail=(employee.email||'').trim().toLowerCase();
  const password=employee.password;
  employee.name=name;
  employee.email=email;
  employee.employeeCode=employeeCode;
  employee.companyId=isCompanyHrSession()
    ?(lockedHrCompanyId()||employee.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL')
    :(document.getElementById('editEmpCompany')?.value||employee.companyId||PORTAL_COMPANIES[0]?.id||'VNSPL');
  employee.password=password;
  store.retiredEmployeeEmails=store.retiredEmployeeEmails||[];
  if(previousEmail&&previousEmail!==email&&!store.retiredEmployeeEmails.includes(previousEmail)){
    store.retiredEmployeeEmails.push(previousEmail);
  }
  store.retiredEmployeeEmails=store.retiredEmployeeEmails.filter(item=>item!==email);
  employee.status=document.getElementById('editEmpStatus').value;
  const dojEl=document.getElementById('editEmpDateOfJoining');
  if(dojEl){
    const nextDoj=dojEl.value.trim();
    const prevDoj=String(employee.dateOfJoining||'').trim();
    if(nextDoj!==prevDoj){
      if(nextDoj&&Number.isNaN(new Date(`${nextDoj}T00:00:00`).getTime())){
        toast('Enter a valid joining date');
        return;
      }
      applyAdminDateOfJoiningChange(employee,nextDoj,prevDoj);
    }
  }
  applyDataEmpFieldsFromForm(employee,document.getElementById('mEditEmp'));
  saveStore();
  closeM('mEditEmp');
  renderEmpTable();
  renderOverview();
  if(typeof renderBuHeadTeam==='function') renderBuHeadTeam();
  scheduleEmployeeSheetPush('edit-employee');
  toast(previousEmail!==email?'Email login updated; existing password retained':'Employee details updated');
};

window.deleteEmployee=async function(id){
  const employee=employeeById(id);
  if(!employee) return;
  if(!assertEmployeeInHrScope(employee,'delete')) return;
  const ok=confirm(`Delete ${employee.name} permanently?\n\nTheir login and leave balance will be removed. Existing HR queries will be kept for record history. They will also be removed from Excel immediately.`);
  if(!ok) return;
  const email=String(employee.email||'').trim().toLowerCase();
  const name=employee.name||email||id;
  store.deletedEmployeeIds=Array.isArray(store.deletedEmployeeIds)?store.deletedEmployeeIds:[];
  store.deletedEmployeeEmails=Array.isArray(store.deletedEmployeeEmails)?store.deletedEmployeeEmails:[];
  if(id&&!store.deletedEmployeeIds.includes(id)) store.deletedEmployeeIds.push(id);
  if(email&&!store.deletedEmployeeEmails.includes(email)) store.deletedEmployeeEmails.push(email);
  store.employees=store.employees.filter(e=>e.id!==id);
  store.queries.forEach(q=>{
    if(q.empId===id){
      q.empId=null;
      q.emp=`${name} (deleted)`;
    }
  });
  saveStore();
  renderEmpTable();
  if(document.getElementById('ovEmp')) document.getElementById('ovEmp').textContent=adminVisibleEmployees().length;
  // Immediate Excel write-back so the CSV row is removed (do not wait for debounced push).
  if(employeeSheetPushTimer){
    clearTimeout(employeeSheetPushTimer);
    employeeSheetPushTimer=null;
  }
  toast(`${name} deleted. Removing from Excel...`);
  try{
    await syncEmployeesToBackendSheet(false,{reason:'delete-employee'});
    toast(`${name} deleted and removed from Excel`);
  }catch(err){
    toast(`${name} deleted in portal, but Excel write-back failed: ${err.message||err}`);
  }
};

window.renderOverview=function(){
  const visible=scopedEmployees();
  document.getElementById('ovEmp').textContent=visible.length;
  document.getElementById('ovAct').textContent=scopedPolicies().filter(p=>p.status==='Active').length;
  const scopedQ=scopedQueries();
  document.getElementById('ovQ').textContent=scopedQ.filter(q=>q.status!=='resolved').length;
  const backupHint=document.getElementById('portalBackupHint');
  if(backupHint){
    backupHint.textContent=isCompanyHrSession()
      ?`Download a JSON backup of your company's portal data (employees, salaries/CTC, leave, documents, queries, and related records). Restore updates only your company. Server also keeps automatic snapshots under data/backups/ when running with the local server.`
      :`Download a full JSON copy of everything stored in the portal (employees, salaries, leave, policies, queries, documents, appointment templates, HR accounts, and more). Keep the file somewhere safe. Restore replaces live portal data. While the local server is running, every save also creates an automatic snapshot under data/backups/.`;
  }
  const engagement=document.getElementById('engagementAdminStats');
  if(engagement){
    const visibleIds=new Set(visible.map(e=>e.id));
    const moodCount=(store.moodPulse||[]).filter(m=>visibleIds.has(m.empId)).length;
    const wallCount=(store.teamWall||[]).filter(w=>visibleIds.has(w.empId)).length;
    const completions=visible.reduce((sum,e)=>sum+(e.learningCompletions||[]).length,0);
    const acknowledged=visible.reduce((sum,e)=>sum+(e.documents||[]).filter(d=>d.acknowledgedAt).length,0);
    engagement.innerHTML=`<div class="engage-stats"><div><span>Mood check-ins</span><strong>${moodCount}</strong></div><div><span>Wall posts</span><strong>${wallCount}</strong></div><div><span>Lessons done</span><strong>${completions}</strong></div><div><span>Docs acknowledged</span><strong>${acknowledged}</strong></div></div>`;
  }
  const ctx=document.getElementById('ovChart');
  if(!ctx||typeof Chart==='undefined') return;
  if(liveChart) liveChart.destroy();
  const chartEmployees=visible;
  liveChart=new Chart(ctx,{type:'bar',data:{labels:chartEmployees.map(e=>e.name.split(' ')[0]),datasets:[{label:'Annual',data:chartEmployees.map(e=>e.leave.annual.u),backgroundColor:'#7F77DD'},{label:'Sick',data:chartEmployees.map(e=>e.leave.sick.u),backgroundColor:'#1D9E75'},{label:'WFH',data:chartEmployees.map(e=>e.leave.wfh.u),backgroundColor:'#EF9F27'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{stepSize:5}}}}});
};

window.updateBars=function(){
  const e=employeeById(currentUser?.id)||store.employees[0], l=e.leave;
  document.querySelector('#pg-myLeaves .pg-title').textContent=`${e.name}'s leave tracker`;
  document.getElementById('eAL').textContent=l.annual.t-l.annual.u;
  document.getElementById('eSL').textContent=l.sick.t-l.sick.u;
  document.getElementById('eWL').textContent=l.wfh.t-l.wfh.u;
  document.getElementById('eCL').textContent=l.comp.t-l.comp.u;
  [['a',l.annual],['sk',l.sick],['w',l.wfh],['c',l.comp]].forEach(([id,b])=>{
    document.getElementById(id+'Bar').style.width=Math.round(b.u/b.t*100)+'%';
  });
  document.getElementById('aTxt').textContent=`${l.annual.u} used - ${l.annual.t-l.annual.u} remaining of ${l.annual.t}`;
  document.getElementById('skTxt').textContent=`${l.sick.u} used - ${l.sick.t-l.sick.u} remaining of ${l.sick.t}`;
  document.getElementById('wTxt').textContent=`${l.wfh.u} used - ${l.wfh.t-l.wfh.u} remaining of ${l.wfh.t}`;
  document.getElementById('cTxt').textContent=`${l.comp.u} used - ${l.comp.t-l.comp.u} remaining of ${l.comp.t}`;
  if(typeof updateLeaveApplyPreview==='function') updateLeaveApplyPreview();
};

window.applyLeave=function(){
  const e=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  if(!e){toast('Please sign in again');return;}
  const managerName=employeeManagerName(e);
  if(!managerName){
    toast('No reporting manager assigned. Ask HR to set your manager first.');
    return;
  }
  const type=document.getElementById('lvT').value;
  const fromDate=document.getElementById('lvFrom')?.value||'';
  const toDate=document.getElementById('lvTo')?.value||'';
  if(!fromDate||!toDate){toast('Select from and to dates');return;}
  if(toDate<fromDate){toast('End date cannot be before start date');return;}
  const days=leaveDaysFromRange(fromDate,toDate);
  const key=type==='Annual'?'annual':type==='Sick'?'sick':type==='WFH'?'wfh':'comp';
  const b=e.leave[key];
  const pendingDays=pendingLeaveBalance(e.id,key);
  if(b.u+pendingDays+days>b.t){toast(`Not enough ${type} balance (including pending requests)`);return;}
  const manager=findManagerEmployee(e);
  const reason=document.getElementById('lvR').value.trim()||`Applied for ${days} day(s) of ${type} leave from ${formatDateOnly(fromDate)} to ${formatDateOnly(toDate)}.`;
  store.leaveRequests=store.leaveRequests||[];
  store.leaveRequests.push({
    id:store.nextLeaveRequestId++,
    empId:e.id,
    emp:e.name,
    companyId:e.companyId,
    managerName,
    managerId:manager?.id||'',
    leaveType:type,
    leaveKey:key,
    days,
    fromDate,
    toDate,
    reason,
    status:'pending',
    response:null,
    createdAt:new Date().toISOString(),
    respondedAt:''
  });
  saveStore();
  updateBars();
  renderMyLeaveRequests();
  renderEmployeeHome();
  syncTeamLeavesNav();
  renderMyTeamPage();
  document.getElementById('lvR').value='';
  initLeaveApplyDates({reset:true});
  toast(`Leave request sent to your manager (${managerName})`);
};

window.renderMyLeaveRequests=function(){
  const list=document.getElementById('myLeaveRequestList');
  const managerHint=document.getElementById('leaveManagerHint');
  const e=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  if(managerHint){
    const managerName=employeeManagerName(e);
    managerHint.textContent=managerName
      ?`Leave requests go to your manager: ${managerName}. HR does not approve leave.`
      :'No reporting manager assigned yet. Ask HR to set your manager before applying.';
  }
  if(!list||!e) return;
  const statusFilter=document.getElementById('leaveFilterStatus')?.value||'all';
  const typeFilter=document.getElementById('leaveFilterType')?.value||'all';
  let mine=(store.leaveRequests||[]).filter(r=>r.empId===e.id);
  if(statusFilter!=='all') mine=mine.filter(r=>r.status===statusFilter);
  if(typeFilter!=='all') mine=mine.filter(r=>r.leaveType===typeFilter);
  mine.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  list.innerHTML=mine.length?mine.map(r=>{
    const statusClass=r.status==='approved'?'b-active':r.status==='rejected'?'b-archived':'b-pending';
    const dateLabel=leaveDateRangeLabel(r);
    return `<div class="row-item leave-request-item"><div style="display:flex;justify-content:space-between;width:100%;gap:10px;align-items:flex-start"><div style="flex:1"><div class="ri-name">${safeText(r.leaveType)} leave - ${r.days} day(s)${dateLabel?` · ${dateLabel}`:''}</div><div class="ri-meta">Manager: ${safeText(r.managerName||'Not assigned')} · Submitted ${formatQueryTime(r.createdAt)}</div><div class="query-msg">${safeText(r.reason||'')}</div></div><span class="badge ${statusClass}">${r.status}</span></div>${leaveRequestTimelineHtml(r)}${r.response?`<div class="hr-reply"><div class="reply-label"><i class="ti ti-check" aria-hidden="true"></i> Manager reply ${r.respondedAt?`- ${formatQueryTime(r.respondedAt)}`:''}</div><div>${safeText(r.response)}</div></div>`:r.status==='pending'?`<div class="reply-pending"><i class="ti ti-clock" aria-hidden="true"></i> Waiting for manager approval</div>`:''}</div>`;
  }).join(''):'<div class="empty-state">No leave requests match your filters.</div>';
  updateLeaveApplyPreview();
};

window.renderTeamLeaveRequests=function(){
  const list=document.getElementById('teamLeaveRequestList');
  const me=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  if(!list||!me) return;
  const reports=employeeDirectReports(me);
  const filter=document.getElementById('teamLeaveFilter')?.value||'pending';
  let requests=teamLeaveRequestsForManager(me,filter==='pending'?{status:'pending'}:{});
  syncTeamLeavesNav();
  if(!requests.length&&!reports.length){
    list.innerHTML='<div class="empty-state">No direct reports are assigned to you yet.</div>';
    return;
  }
  list.innerHTML=requests.length?requests.map(r=>{
    const statusClass=r.status==='approved'?'b-active':r.status==='rejected'?'b-archived':'b-pending';
    const actions=r.status==='pending'
      ?`<div class="table-actions"><button class="btn sm pri" onclick="decideLeaveRequest(${r.id},'approved')"><i class="ti ti-check" aria-hidden="true"></i> Approve</button><button class="btn sm danger" onclick="decideLeaveRequest(${r.id},'rejected')"><i class="ti ti-x" aria-hidden="true"></i> Reject</button></div>`
      :'';
    const dateLabel=leaveDateRangeLabel(r);
    return `<div class="row-item leave-request-item"><div style="display:flex;justify-content:space-between;width:100%;gap:10px"><div style="flex:1"><div class="ri-name">${safeText(r.emp)} - ${safeText(r.leaveType)} leave - ${r.days} day(s)${dateLabel?` · ${dateLabel}`:''}</div><div class="ri-meta">Submitted ${formatQueryTime(r.createdAt)}</div><div class="query-msg">${safeText(r.reason||'')}</div></div><span class="badge ${statusClass}">${r.status}</span></div>${leaveRequestTimelineHtml(r)}${r.response?`<div class="hr-reply"><div class="reply-label">Your reply</div><div>${safeText(r.response)}</div></div>`:''}${actions}</div>`;
  }).join(''):`<div class="empty-state">${filter==='pending'?'No pending leave requests from your team.':'No leave requests from your team yet.'}</div>`;
};

window.decideLeaveRequest=function(id,decision){
  const me=currentSelfServiceEmployee()||employeeById(currentUser?.id);
  const request=(store.leaveRequests||[]).find(r=>r.id===id);
  if(!me||!request||request.status!=='pending') return;
  const reports=employeeDirectReports(me);
  const canDecide=reports.some(r=>r.id===request.empId)||request.managerId===me.id||normalizePersonName(request.managerName)===normalizePersonName(me.name);
  if(!canDecide){toast('You can only action leave for your direct reports');return;}
  const note=decision==='approved'
    ?(prompt('Optional note for the employee','Approved')||'Approved')
    :(prompt('Reason for rejection','Please revise dates or discuss with me.')||'Rejected');
  if(decision==='approved'){
    const employee=employeeById(request.empId);
    if(!employee){toast('Employee not found');return;}
    const bucket=employee.leave?.[request.leaveKey];
    if(!bucket){toast('Leave type not found');return;}
    if(bucket.u+request.days>bucket.t){toast('Employee does not have enough leave balance');return;}
    bucket.u+=request.days;
  }
  request.status=decision;
  request.response=note.trim();
  request.respondedAt=new Date().toISOString();
  request.respondedBy=me.name;
  saveStore();
  renderMyTeamPage();
  renderMyLeaveRequests();
  updateBars();
  syncTeamLeavesNav();
  toast(decision==='approved'?'Leave approved':'Leave rejected');
};

window.renderMyQueries=function(){
  const e=employeeById(currentUser?.id);
  const list=document.getElementById('myQueryList');
  if(!list||!e) return;
  const mine=store.queries.filter(q=>q.empId===e.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  list.innerHTML=mine.length?mine.map(q=>`<div class="row-item" style="flex-direction:column;align-items:flex-start;gap:6px"><div style="display:flex;justify-content:space-between;width:100%;gap:10px"><div><div class="ri-name">${q.subject}</div><div class="ri-meta">${q.category||'General'} - Raised ${formatQueryTime(q.createdAt)}</div><div class="query-msg">${q.msg}</div></div><span class="badge b-${q.status}">${q.status}</span></div>${q.response?`<div class="hr-reply"><div class="reply-label"><i class="ti ti-check" aria-hidden="true"></i> HR reply ${q.resolvedAt?`- ${formatQueryTime(q.resolvedAt)}`:''}</div><div>${q.response}</div></div>`:`<div class="reply-pending"><i class="ti ti-clock" aria-hidden="true"></i> Waiting for HR response</div>`}</div>`).join(''):'<div class="empty-state">No queries raised yet.</div>';
};

window.raiseEmployeeQuery=function(){
  const e=employeeById(currentUser?.id);
  if(!e){toast('Please sign in again');return;}
  const subject=document.getElementById('rqSubject').value.trim();
  const msg=document.getElementById('rqMsg').value.trim();
  const category=document.getElementById('rqCategory').value;
  if(!subject||!msg){toast('Enter a subject and question');return;}
  store.queries.push({id:store.nextQueryId++,empId:e.id,emp:e.name,category,subject,msg,status:'open',response:null,createdAt:new Date().toISOString()});
  saveStore();
  const openCount=store.queries.filter(q=>q.status!=='resolved').length;
  if(document.getElementById('qBadge')) document.getElementById('qBadge').textContent=openCount;
  if(document.getElementById('ovQ')) document.getElementById('ovQ').textContent=openCount;
  document.getElementById('rqSubject').value='';
  document.getElementById('rqMsg').value='';
  renderMyQueries();
  renderEmployeeHome();
  toast('Query submitted to HR');
};

window.renderEPolicies=function(){
  const el=document.getElementById('ePList');
  const summaryEl=document.getElementById('ePolicySummary');
  if(!el) return;
  el.innerHTML='';
  const employee=employeeById(currentUser?.id)||currentSelfServiceEmployee();
  const activePoliciesList=employeeScopedPolicies(employee).filter(p=>p.status==='Active');
  const buckets={overdue:0,required:0,read:0,stale:0};
  activePoliciesList.forEach(p=>{
    const b=policyEmployeeBucket(employee,p);
    if(b==='read') buckets.read++;
    else if(b==='overdue') buckets.overdue++;
    else if(b==='stale') buckets.stale++;
    else buckets.required++;
  });
  document.querySelectorAll('[id^="ePolicyFilter-"]').forEach(btn=>{
    const f=btn.id.replace('ePolicyFilter-','');
    btn.classList.toggle('pri',f===employeePolicyFilter);
  });
  if(summaryEl){
    summaryEl.innerHTML=`<div class="policy-summary-stats">
      <span><strong>${buckets.overdue}</strong> overdue</span>
      <span><strong>${buckets.required+buckets.stale}</strong> required</span>
      <span><strong>${buckets.read}</strong> read</span>
      <span><strong>${activePoliciesList.length}</strong> total</span>
    </div>
    <div class="hint-box" style="margin-top:10px;margin-bottom:0">Acknowledge required policies within <strong>${POLICY_ACK_DAYS} days</strong> of publish or update. Overdue policies appear on home notifications.</div>`;
  }
  let filtered=activePoliciesList.map(p=>({policy:p,bucket:policyEmployeeBucket(employee,p)}));
  if(employeePolicyFilter==='required') filtered=filtered.filter(x=>x.bucket==='required'||x.bucket==='stale');
  else if(employeePolicyFilter==='overdue') filtered=filtered.filter(x=>x.bucket==='overdue');
  else if(employeePolicyFilter==='read') filtered=filtered.filter(x=>x.bucket==='read');
  filtered.sort((a,b)=>{
    const rank={overdue:0,stale:1,required:2,read:3};
    return (rank[a.bucket]??9)-(rank[b.bucket]??9)||policyUpdatedTime(b.policy)-policyUpdatedTime(a.policy);
  });
  if(!filtered.length){
    el.innerHTML=`<div class="empty-state">${employeePolicyFilter==='all'?'No active policies available.':'No policies in this filter.'}</div>`;
    return;
  }
  filtered.forEach(({policy:p,bucket})=>{
    const d=document.createElement('div');
    d.className='card';
    const readValue=policyReadValue(employee,p.id);
    const readAt=typeof readValue==='string'?readValue:readValue?.acknowledgedAt;
    const current=bucket==='read';
    const stale=bucket==='stale';
    const overdue=bucket==='overdue';
    const badgeClass=overdue?'b-archived':stale?'b-pending':current?'b-active':'b-pending';
    const due=policyAckDeadline(p);
    d.innerHTML=`<div class="card-hd"><div class="card-title"><i class="ti ti-file-text" aria-hidden="true"></i> ${safeText(p.name)}</div><span class="badge ${badgeClass}">${policyBucketLabel(bucket)}</span></div>
      <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.6">${policySummary(p)}</div>
      ${policyAttachmentLink(p)}
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:8px">Effective ${safeText(p.date)} · Acknowledge by ${due?formatDateOnly(due):'—'} · Updated ${formatQueryTime(p.updatedAt||p.date)}</div>
      <label class="policy-read ${current?'locked':''}"><input type="checkbox" ${current?'checked disabled':''} onchange="togglePolicyRead(${p.id},this.checked)"> ${current?'Policy acknowledged and locked':'I have read and understood this policy'}</label>
      ${current?`<div class="read-time">Acknowledged ${formatQueryTime(readAt)}.</div>`:''}
      ${overdue?`<div class="read-time warning"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Overdue — please read and acknowledge today.</div>`:''}
      ${stale?`<div class="read-time warning">Policy was updated after your last acknowledgement. Please read and acknowledge again.</div>`:''}`;
    el.appendChild(d);
  });
};

window.togglePolicyRead=function(policyId,checked){
  const employee=employeeById(currentUser?.id);
  if(!employee){toast('Please sign in again');return;}
  const policy=store.policies.find(p=>String(p.id)===String(policyId));
  if(!policy){toast('Policy not found');return;}
  employee.policyReads=employee.policyReads||{};
  if(!checked&&isPolicyAcknowledgedCurrent(employee,policy)){
    renderEPolicies();
    toast('Acknowledged policies are locked until HR updates them');
    return;
  }
  if(checked) employee.policyReads[policyId]=new Date().toISOString();
  else if(!isPolicyAcknowledgedCurrent(employee,policy)) delete employee.policyReads[policyId];
  saveStore();
  renderEPolicies();
  renderEmployeeHome();
  toast(checked?'Policy marked as read':'Policy acknowledgement removed');
};

window.initChat=function(){
  chatHistory=[];
  document.getElementById('chatMsgs').innerHTML='';
  document.getElementById('chatErr').style.display='none';
  const e=employeeById(currentUser?.id)||store.employees[0];
  addBot(`Hi ${e.name.split(' ')[0]}! I search the uploaded HR policies and your ${COMPANY.portalName} data locally before answering. What would you like to know?`);
  setAiStatus('live','Local policy RAG active');
};

function setAiStatus(state,text){
  const el=document.getElementById('aiStatus');
  if(!el) return;
  el.className=`ai-status ${state}`;
  el.innerHTML=`<i class="ti ${state==='live'?'ti-circle-check':state==='thinking'?'ti-loader-2':'ti-alert-circle'}" aria-hidden="true"></i> ${text}`;
}

const RAG_STOPWORDS=new Set('about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with you your yours yourself yourselves'.split(' '));
const RAG_SYNONYMS={
  wfh:'work from home remote hybrid',
  remote:'wfh work from home hybrid',
  leave:'annual sick casual paid time off pto holiday vacation',
  pto:'leave annual paid time off vacation',
  salary:'payroll compensation payslip',
  pay:'payroll compensation payslip',
  maternity:'parental pregnancy',
  paternity:'parental',
  benefit:'insurance wellness allowance reimbursements'
};

function normalizeRagText(value){
  return String(value||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function expandRagQuery(value){
  const base=String(value||'');
  const extras=normalizeRagText(base).split(' ').flatMap(token=>RAG_SYNONYMS[token]?.split(' ')||[]);
  return `${base} ${extras.join(' ')}`;
}

function ragTokens(value){
  return normalizeRagText(value)
    .split(' ')
    .filter(token=>token.length>2&&!RAG_STOPWORDS.has(token));
}

function chunkPolicyText(text,maxLength=720){
  const cleaned=String(text||'').replace(/\r/g,'').trim();
  if(!cleaned) return [];
  const parts=cleaned
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z0-9])/)
    .map(part=>part.trim())
    .filter(Boolean);
  const chunks=[];
  let current='';
  parts.forEach(part=>{
    if(!current){
      current=part;
    }else if((current.length+part.length+1)<=maxLength){
      current=`${current} ${part}`;
    }else{
      chunks.push(current);
      current=part;
    }
  });
  if(current) chunks.push(current);
  return chunks.length?chunks:[cleaned.slice(0,maxLength)];
}

function policyRagChunks(){
  return activePolicies().flatMap(policy=>{
    const body=policySummary(policy);
    const textChunks=chunkPolicyText(body);
    return textChunks.map((text,index)=>({
      id:`${policy.id}-${index}`,
      policyId:policy.id,
      name:policy.name,
      cat:policy.cat,
      date:policy.date,
      updatedAt:policy.updatedAt||policy.date,
      status:policy.status,
      text,
      sourceFileName:policy.fileName||policy.sourceFileName||'',
      score:0
    }));
  });
}

function scoreRagChunk(question,chunk){
  const expanded=expandRagQuery(question);
  const qTokens=ragTokens(expanded);
  if(!qTokens.length) return 0;
  const chunkText=normalizeRagText(`${chunk.name} ${chunk.cat} ${chunk.text}`);
  const chunkTokens=new Set(ragTokens(chunkText));
  const title=normalizeRagText(chunk.name);
  const category=normalizeRagText(chunk.cat);
  let score=0;
  qTokens.forEach(token=>{
    if(chunkTokens.has(token)) score+=2;
    if(title.includes(token)) score+=4;
    if(category.includes(token)) score+=2;
    if(chunkText.includes(token)) score+=0.5;
  });
  const phrase=normalizeRagText(question);
  if(phrase&&chunkText.includes(phrase)) score+=10;
  return score;
}

function retrievePolicyContext(question,limit=5){
  const chunks=policyRagChunks()
    .map(chunk=>({...chunk,score:scoreRagChunk(question,chunk)}))
    .sort((a,b)=>b.score-a.score);
  const top=chunks.filter(chunk=>chunk.score>0).slice(0,limit);
  return top.length?top:chunks.slice(0,Math.min(limit,chunks.length));
}

function ragSourceNames(chunks){
  return [...new Set((chunks||[]).map(chunk=>chunk.name).filter(Boolean))];
}

function withRagSources(answer,chunks){
  const names=ragSourceNames(chunks);
  if(!names.length||/sources?:/i.test(answer||'')) return answer;
  return `${answer}\n\nSources: ${names.join(', ')}`;
}

function ragFallbackAnswer(question,chunks){
  if(!chunks?.length) return '';
  const first=chunks[0];
  const excerpt=first.text.length>520?`${first.text.slice(0,520).trim()}...`:first.text;
  return withRagSources(`From ${first.name}: ${excerpt}`,chunks.slice(0,3));
}

function aiPayload(question,employee){
  const docs=(employee.documents||[]).map(doc=>({type:doc.type,title:doc.title,fileName:doc.fileName,uploadedAt:doc.uploadedAt,acknowledgedAt:doc.acknowledgedAt||''}));
  const ragContext=retrievePolicyContext(question,5);
  return {
    question,
    retrievalMode:'local-policy-rag',
    ragContext,
    ragSources:ragSourceNames(ragContext),
    employee:{
      name:employee.name,
      email:employee.email,
      dept:employee.dept,
      role:employee.role,
      manager:employee.manager,
      leave:employee.leave,
      profileCompletion:profileCompletion(employee),
      gameProgress:employee.gameProgress||null,
      learningCompletions:employee.learningCompletions||[]
    },
    policies:ragContext.map(chunk=>({id:chunk.policyId,name:chunk.name,cat:chunk.cat,date:chunk.date,status:chunk.status,desc:chunk.text,score:chunk.score})),
    activePolicyCount:activePolicies().length,
    unreadPolicies:unreadPolicies(employee).map(p=>({id:p.id,name:p.name,cat:p.cat})),
    queries:employeeQueries(employee).slice(0,8),
    documents:docs,
    events:upcomingEvents().slice(0,5),
    news:latestNews().slice(0,5),
    history:chatHistory.slice(-8)
  };
}

window.checkAiStatus=function(){
  setAiStatus('live','Local policy RAG active');
  toast('Using local RAG only');
};

window.sendChat=async function(){
  if(botBusy) return;
  const inp=document.getElementById('chatIn'), msg=inp.value.trim();
  if(!msg) return;
  inp.value='';addUser(msg);botBusy=true;showTyping();setAiStatus('thinking',`Searching ${COMPANY.portalName} policies...`);
  const e=employeeById(currentUser?.id)||store.employees[0];
  const payload=aiPayload(msg,e);
  const answer=localReply(msg,payload.ragContext);
  chatHistory.push({role:'user',content:msg},{role:'assistant',content:answer});
  hideTyping();
  botBusy=false;
  document.getElementById('chatErr').style.display='none';
  setAiStatus('live','Local policy RAG active');
  addBot(answer);
};

function localReply(msg,ragContext=[]){
  const e=employeeById(currentUser?.id)||store.employees[0], l=e.leave, m=msg.toLowerCase();
  if(m.includes('unread')) {
    const unread=unreadPolicies(e);
    return unread.length?`You still need to read ${unread.length} active policy/policies: ${unread.map(p=>p.name).join(', ')}.`:'You have acknowledged all active policies.';
  }
  if(m.includes('pending action')||m.includes('action is pending')){
    const unread=unreadPolicies(e).length, open=employeeQueries(e).filter(q=>q.status!=='resolved').length;
    return `Pending actions: ${unread} unread policies and ${open} open HR query/query(s).`;
  }
  if(m.includes('annual')) return `You have ${l.annual.t-l.annual.u} annual leave day(s) left out of ${l.annual.t}. The Annual Leave Policy allows up to 5 unused days to be carried forward.`;
  if(m.includes('sick')) return `You have ${l.sick.t-l.sick.u} sick leave day(s) left. A medical certificate is required only for 3 or more consecutive sick days.`;
  if(m.includes('wfh')||m.includes('work from home')) return `You have ${l.wfh.t-l.wfh.u} WFH day(s) left. The active WFH policy allows up to 3 days per week with manager approval.`;
  if(m.includes('carry')) return 'The Annual Leave Policy allows up to 5 unused annual leave days to be carried forward to the next year.';
  const ragAnswer=ragFallbackAnswer(msg,ragContext);
  if(ragAnswer) return ragAnswer;
  if(m.includes('benefit')) return 'I could not find a matching benefits policy excerpt in the uploaded active policies. Please check the Policies tab or contact HR.';
  return `I found ${activePolicies().length} active policies and your live balances: annual ${l.annual.t-l.annual.u}, sick ${l.sick.t-l.sick.u}, WFH ${l.wfh.t-l.wfh.u}, comp-off ${l.comp.t-l.comp.u}. For requests, use the My leaves tab.`;
}

/*game*/
let currentQuestion = 0;

let scores = {
    empathy: 0,
    strategy: 0,
    innovation: 0,
    speed: 0
};

const scenarios = [

{
title:"Employee Leave Request",
question:"Your top performer asks for 2 weeks leave during a critical project.",
choices:[
{
text:"Reject the leave",
effects:{strategy:10,speed:10}
},
{
text:"Approve immediately",
effects:{empathy:15}
},
{
text:"Discuss alternative dates",
effects:{strategy:10,empathy:10}
}
]
},

{
title:"Remote Work Policy",
question:"Employees want more flexibility.",
choices:[
{
text:"Keep existing rules",
effects:{strategy:10}
},
{
text:"Allow hybrid work",
effects:{innovation:15,empathy:10}
},
{
text:"Allow complete freedom",
effects:{innovation:20}
}
]
},

{
title:"Team Conflict",
question:"Two team members are constantly arguing.",
choices:[
{
text:"Ignore it",
effects:{speed:10}
},
{
text:"Conduct mediation",
effects:{empathy:15}
},
{
text:"Reassign responsibilities",
effects:{strategy:15}
}
]
},

{
title:"Budget Cut",
question:"Budget reduced by 20%.",
choices:[
{
text:"Lay off employees",
effects:{strategy:15}
},
{
text:"Reduce expenses elsewhere",
effects:{innovation:15,empathy:10}
},
{
text:"Freeze hiring",
effects:{strategy:10}
}
]
},

{
title:"New Technology",
question:"A new AI tool can automate tasks.",
choices:[
{
text:"Ignore it",
effects:{speed:10}
},
{
text:"Pilot test it",
effects:{innovation:20}
},
{
text:"Deploy immediately",
effects:{innovation:15,speed:10}
}
]
}

];
function startMaze(){

currentQuestion = 0;

scores = {
    empathy:0,
    strategy:0,
    innovation:0,
    speed:0
};

showQuestion();
}

function showQuestion(){

const q = scenarios[currentQuestion];

let html = `
<h2>${q.title}</h2>
<p style="margin-bottom:20px">
${q.question}
</p>
`;

q.choices.forEach((choice,index)=>{

html += `
<button
class="btn"
style="display:block;width:100%;margin-bottom:10px"
onclick="chooseOption(${index})"
>
${choice.text}
</button>
`;

});

document.getElementById("gameArea").innerHTML = html;
}

function chooseOption(index){

const choice =
scenarios[currentQuestion].choices[index];

for(let key in choice.effects){

scores[key] += choice.effects[key];

}

currentQuestion++;

if(currentQuestion >= scenarios.length){

showResult();

}else{

showQuestion();

}
}
function showResult(){

const maxTrait =
Object.keys(scores).reduce((a,b)=>
scores[a] > scores[b] ? a : b
);

let profile = "";

switch(maxTrait){

case "empathy":
profile =
"🤝 The People Leader";
break;

case "strategy":
profile =
"📊 The Strategic Thinker";
break;

case "innovation":
profile =
"🚀 The Visionary Innovator";
break;

case "speed":
profile =
"⚡ The Fast Decision Maker";
break;

}

document.getElementById("gameArea").innerHTML = `

<h2>🎉 Your Leadership Profile</h2>

<div style="text-align:left;margin-top:20px">

<p><b>Empathy:</b> ${scores.empathy}</p>

<p><b>Strategy:</b> ${scores.strategy}</p>

<p><b>Innovation:</b> ${scores.innovation}</p>

<p><b>Decision Speed:</b> ${scores.speed}</p>

</div>

<h3 style="margin-top:20px">
${profile}
</h3>

<p style="margin-top:15px">
Your decisions reveal how you approach
leadership and workplace challenges.
</p>

<button
class="btn pri"
onclick="startMaze()"
>
Play Again
</button>

`;
}
const wordWonderLevels=[
  {theme:'Team basics',letters:['T','E','A','M'],words:['TEAM','MEAT','MATE','TAME','TEA','EAT','ATE','MET']},
  {theme:'Leave desk',letters:['L','E','A','V','E'],words:['LEAVE','VEAL','VALE','ALE','EEL','EVE']},
  {theme:'Policy room',letters:['P','O','L','I','C','Y'],words:['POLICY','COPY','CLIP','OIL','ICY']},
  {theme:'Work mode',letters:['W','O','R','K'],words:['WORK','ROW','WOK']},
  {theme:'Growth track',letters:['G','R','O','W','T','H'],words:['GROWTH','GROW','WORTH','ROW','HOT','TOW']},
  {theme:'Payroll desk',letters:['P','A','Y','R','O','L','L'],words:['PAYROLL','PAY','ROLL','PLAY','LOYAL','RAY','LAY']},
  {theme:'Culture club',letters:['C','U','L','T','U','R','E'],words:['CULTURE','CURE','TRUE','RULE','CUTE','LURE']},
  {theme:'Talent room',letters:['T','A','L','E','N','T'],words:['TALENT','LATE','LEAN','TENT','ANT','LANE','TEAL']},
  {theme:'Benefits bay',letters:['B','E','N','E','F','I','T'],words:['BENEFIT','FIT','NET','TEN','BITE','FINE','BEET']},
  {theme:'Office flow',letters:['O','F','F','I','C','E'],words:['OFFICE','ICE','OFF','FOE','FIFE','COIF']}
];
const wordWonderGeneratedLevels=[
  {theme:'Career climb',letters:['C','A','R','E','E','R'],words:['CAREER','CARE','RACE','ACRE','RARE','EAR','ERA']},
  {theme:'Hiring round',letters:['H','I','R','I','N','G'],words:['HIRING','RING','GRIN','GIRN','HIN','GIN']},
  {theme:'Mentor map',letters:['M','E','N','T','O','R'],words:['MENTOR','METRO','TENOR','TONER','MORE','ROTE','TONE']},
  {theme:'Bonus lane',letters:['B','O','N','U','S'],words:['BONUS','SNOB','ONUS','BUN','SUN','NUB']},
  {theme:'Review desk',letters:['R','E','V','I','E','W'],words:['REVIEW','VIEW','VEER','WIRE','WEIR','EVER']},
  {theme:'Skill lab',letters:['S','K','I','L','L'],words:['SKILL','SILK','KILL','ILL','SKI']},
  {theme:'Training hub',letters:['T','R','A','I','N'],words:['TRAIN','RAIN','RANT','TARN','ANTI','AIR','TIN']},
  {theme:'Reward room',letters:['R','E','W','A','R','D'],words:['REWARD','DRAW','WARD','WARE','DEAR','DARE','READ']},
  {theme:'Sprint board',letters:['S','P','R','I','N','T'],words:['SPRINT','PRINT','STRIP','TRIPS','TINS','RIP','PIN']},
  {theme:'Project pod',letters:['P','R','O','J','E','C','T'],words:['PROJECT','PRO','JET','TOE','COT','CORE','ROPE']},
  {theme:'Meeting mode',letters:['M','E','E','T','I','N','G'],words:['MEETING','MEET','MINE','TIME','TINGE','ITEM','TEN']},
  {theme:'Survey stack',letters:['S','U','R','V','E','Y'],words:['SURVEY','SURE','USER','VERY','RUE','YES']},
  {theme:'Roster route',letters:['R','O','S','T','E','R'],words:['ROSTER','ROSE','ROTE','REST','SORE','TORE','ERR']},
  {theme:'Notice nook',letters:['N','O','T','I','C','E'],words:['NOTICE','NOTE','TONE','CITE','COIN','ICON','ICE']},
  {theme:'Salary suite',letters:['S','A','L','A','R','Y'],words:['SALARY','SLAY','RAYS','LAY','SAY','RAY']},
  {theme:'Holiday hill',letters:['H','O','L','I','D','A','Y'],words:['HOLIDAY','DAILY','IDOL','HOLD','LOAD','LADY','DAY']},
  {theme:'Wellness wave',letters:['W','E','L','L','N','E','S','S'],words:['WELLNESS','WELL','SELL','LESS','NEW','SEWN','SEW']},
  {theme:'Portal path',letters:['P','O','R','T','A','L'],words:['PORTAL','PLOT','ALTO','ORAL','TARP','RAPT','LAP']},
  {theme:'Ticket trail',letters:['T','I','C','K','E','T'],words:['TICKET','TICK','KITE','KITT','CITE','TIE','KIT']},
  {theme:'Query quest',letters:['Q','U','E','R','Y'],words:['QUERY','RUE','RYE','YER','QUE']},
  {theme:'Finance flow',letters:['F','I','N','A','N','C','E'],words:['FINANCE','FINE','CAFE','CANE','NICE','FACE','FAN']},
  {theme:'Admin arena',letters:['A','D','M','I','N'],words:['ADMIN','MAIN','MIND','MAID','DAM','AID']},
  {theme:'People pulse',letters:['P','E','O','P','L','E'],words:['PEOPLE','PEEL','POLE','LOPE','PLOP','PEEP']},
  {theme:'Health help',letters:['H','E','A','L','T','H'],words:['HEALTH','HEAL','HEAT','HATE','LATE','TEAL','EAT']},
  {theme:'Target track',letters:['T','A','R','G','E','T'],words:['TARGET','GREAT','GRATE','TREAT','GEAR','RATE','TEAR']},
  {theme:'Budget bay',letters:['B','U','D','G','E','T'],words:['BUDGET','BUDGE','DEBUT','TUBE','DUET','GET','BET']},
  {theme:'Office orbit',letters:['O','R','B','I','T'],words:['ORBIT','TRIO','RIOT','BRIO','BIT','ROB']},
  {theme:'Report ridge',letters:['R','E','P','O','R','T'],words:['REPORT','PORT','ROPE','TORE','POET','REPO','TOP']},
  {theme:'Growth grid',letters:['G','R','I','D'],words:['GRID','GIRD','RID','DIG','RIG']},
  {theme:'Annual arc',letters:['A','N','N','U','A','L'],words:['ANNUAL','ANNAL','LUNA','ULAN','NUN','ALAN']},
  {theme:'Policy peak',letters:['P','E','A','K'],words:['PEAK','PEA','APE','AKE']},
  {theme:'Shift shine',letters:['S','H','I','F','T'],words:['SHIFT','FISH','HITS','SIFT','HIS','FIT']},
  {theme:'Bonus bridge',letters:['B','R','I','D','G','E'],words:['BRIDGE','BRIE','BIRD','RIDE','GRID','DIRE','BIG']},
  {theme:'Culture curve',letters:['C','U','R','V','E'],words:['CURVE','CURE','RUE','REV','CUE']},
  {theme:'Vision vault',letters:['V','I','S','I','O','N'],words:['VISION','IONS','VINO','SON','SIN','ION']},
  {theme:'Mission map',letters:['M','I','S','S','I','O','N'],words:['MISSION','MISS','IONS','MINI','MOSS','SIM','ION']},
  {theme:'Payroll path',letters:['P','A','T','H'],words:['PATH','HAT','PAT','TAP','APT']},
  {theme:'Workplace way',letters:['W','A','Y'],words:['WAY','YAW','AW']},
  {theme:'Benefit beam',letters:['B','E','A','M'],words:['BEAM','MAE','ABE','AM','ME']},
  {theme:'Feedback field',letters:['F','I','E','L','D'],words:['FIELD','FILE','LIED','DELI','LID','DIE']}
];
let wordWonderLevel=0;
let wordWonderFound=[];
let wordWonderPoints=0;
let wordWonderLetters=[];
let wordWonderStarted=false;

function getWordWonderLevel(){
  if(wordWonderLevel<wordWonderLevels.length){
    const fixed=wordWonderLevels[wordWonderLevel];
    return {
      theme:fixed.theme,
      letters:[...fixed.letters],
      words:[...fixed.words]
    };
  }
  const generatedIndex=(wordWonderLevel-wordWonderLevels.length)%wordWonderGeneratedLevels.length;
  const cycle=Math.floor((wordWonderLevel-wordWonderLevels.length)/wordWonderGeneratedLevels.length);
  const base=wordWonderGeneratedLevels[generatedIndex];
  const words=[...base.words];
  if(cycle){
    const rotateBy=cycle%words.length;
    words.push(...words.splice(0,rotateBy));
  }
  return {
    theme:cycle?`${base.theme} ${cycle+1}`:base.theme,
    letters:[...base.letters],
    words
  };
}

function sameWordLetterBag(left=[],right=[]){
  if(left.length!==right.length) return false;
  const normalize=letters=>[...letters].map(letter=>String(letter).toUpperCase()).sort().join('');
  return normalize(left)===normalize(right);
}

function currentGameEmployee(){
  return employeeById(currentUser?.id);
}

function wordWonderStorageId(employee=currentGameEmployee()){
  return employee?.id||currentUser?.id||currentUser?.email||'guest';
}

function getSavedWordWonderProgress(employee=currentGameEmployee()){
  let cached=null;
  try{
    const all=JSON.parse(localStorage.getItem(HRP_GAME_KEY)||'{}');
    cached=all[wordWonderStorageId(employee)]||null;
  }catch(err){
    cached=null;
  }
  const embedded=employee?.gameProgress?.game==='words-of-wonders'?employee.gameProgress:null;
  if(cached&&embedded){
    const cachedTime=new Date(cached.updatedAt||0).getTime();
    const embeddedTime=new Date(embedded.updatedAt||0).getTime();
    return cachedTime>=embeddedTime?cached:embedded;
  }
  return cached||embedded;
}

function loadWordWonderProgress(){
  const employee=currentGameEmployee();
  const progress=getSavedWordWonderProgress(employee);
  if(!progress||progress.game!=='words-of-wonders'){
    wordWonderStarted=false;
    wordWonderLevel=0;
    wordWonderFound=[];
    wordWonderPoints=0;
    wordWonderLetters=[...getWordWonderLevel().letters];
    return;
  }
  wordWonderStarted=Boolean(progress.started);
  wordWonderLevel=Number.isInteger(progress.level)?progress.level:0;
  const level=getWordWonderLevel();
  wordWonderFound=Array.isArray(progress.found)?progress.found.filter(word=>level.words.includes(word)):[];
  wordWonderPoints=Number(progress.points)||0;
  wordWonderLetters=Array.isArray(progress.letters)&&sameWordLetterBag(progress.letters,level.letters)?progress.letters:[...level.letters];
}

function saveWordWonderProgress(){
  const employee=currentGameEmployee();
  if(!employee) return;
  const progress={
    game:'words-of-wonders',
    started:wordWonderStarted,
    level:wordWonderLevel,
    found:[...wordWonderFound],
    points:wordWonderPoints,
    letters:[...wordWonderLetters],
    updatedAt:new Date().toISOString()
  };
  employee.gameProgress=progress;
  try{
    const all=JSON.parse(localStorage.getItem(HRP_GAME_KEY)||'{}');
    all[wordWonderStorageId(employee)]=progress;
    localStorage.setItem(HRP_GAME_KEY,JSON.stringify(all));
  }catch(err){}
  saveStore();
}

function renderWordWonderLeaderboard(options={}){
  const includeTitle=options.includeTitle!==false;
  const currentId=currentUser?.id;
  const leaders=store.employees
    .map(employee=>{
      const progress=getSavedWordWonderProgress(employee);
      return {
        id:employee.id,
        name:(employee.name||'Employee').trim(),
        email:employee.email||'',
        points:Number(progress?.points)||0,
        level:Number.isInteger(progress?.level)?progress.level:0,
        found:Array.isArray(progress?.found)?progress.found.length:0
      };
    })
    .sort((a,b)=>b.points-a.points||b.level-a.level||b.found-a.found||a.name.localeCompare(b.name))
    .slice(0,5);
  return `<div class="word-leaderboard ${includeTitle?'':'word-leaderboard-body-only'}">
    ${includeTitle?`<div class="word-leaderboard-title"><i class="ti ti-trophy" aria-hidden="true"></i> Leaderboard</div>`:''}
    ${leaders.map((player,index)=>`<div class="leader-row ${player.id===currentId?'me':''}">
      <span class="leader-rank">#${index+1}</span>
      <span class="leader-name"><strong>${player.name}</strong><small>${player.email}</small></span>
      <span class="leader-meta">Level ${player.level+1}</span>
      <strong>${player.points}</strong>
    </div>`).join('')}
  </div>`;
}

function updateWordWonderStatus(){
  const level=getWordWonderLevel();
  const foundEl=document.getElementById('wordsFound');
  const pointsEl=document.getElementById('wordPoints');
  if(foundEl) foundEl.textContent=`${wordWonderFound.length}/${level.words.length}`;
  if(pointsEl) pointsEl.textContent=wordWonderPoints;
}

function renderWordWonderIntro(){
  const area=document.getElementById('gameArea');
  if(!area) return;
  const saved=getSavedWordWonderProgress();
  const hasSavedGame=saved?.game==='words-of-wonders'&&saved.started;
  updateWordWonderStatus();
  area.innerHTML=`<div class="word-game"><div class="word-game-main"><div class="game-intro"><i class="ti ti-letters-case" aria-hidden="true"></i><h2>Words of Wonders</h2><p>Make as many valid words as you can from the given letters. Complete the list to move to the next level.</p><button class="btn pri" onclick="${hasSavedGame?'resumeWordGame()':'startWordGame()'}"><i class="ti ti-player-play" aria-hidden="true"></i> ${hasSavedGame?`Resume Level ${Number(saved.level||0)+1}`:'Start Game'}</button>${hasSavedGame?'<button class="btn sm" onclick="startWordGame(true)" style="margin-left:8px"><i class="ti ti-refresh" aria-hidden="true"></i> New game</button>':''}</div></div>${renderWordWonderLeaderboard()}</div>`;
}

function renderWordWonderRound(message=''){
  const area=document.getElementById('gameArea');
  if(!area) return;
  const level=getWordWonderLevel();
  const complete=wordWonderFound.length===level.words.length;
  updateWordWonderStatus();
  area.innerHTML=`
    <div class="word-game word-game-playing">
      <div class="word-game-topbar">
        <div class="game-progress">Level ${wordWonderLevel+1} - ${level.theme}</div>
        <div class="word-leaderboard-title"><i class="ti ti-trophy" aria-hidden="true"></i> Leaderboard</div>
      </div>
      <div class="word-game-body">
        <div class="word-game-main">
          <h2>Find the hidden words</h2>
          <div class="word-letters">${wordWonderLetters.map(letter=>`<span class="word-letter">${letter}</span>`).join('')}</div>
          <div class="word-entry">
            <input id="wordGuess" autocomplete="off" placeholder="Type a word" onkeydown="if(event.key==='Enter') submitWonderWord()">
            <button class="btn pri" onclick="submitWonderWord()"><i class="ti ti-check" aria-hidden="true"></i> Submit</button>
          </div>
          <div class="word-actions">
            <button class="btn sm" onclick="shuffleWonderLetters()"><i class="ti ti-arrows-shuffle" aria-hidden="true"></i> Shuffle</button>
            ${complete?`<button class="btn pri sm" onclick="nextWonderLevel()"><i class="ti ti-arrow-right" aria-hidden="true"></i> Next level</button>`:''}
          </div>
          ${message?`<div class="word-message ${complete?'good':''}">${message}</div>`:''}
          <div class="word-hints">${level.words.map(word=>`<span>${wordWonderFound.includes(word)?word:word.length+' letters'}</span>`).join('')}</div>
          <div class="found-words">${wordWonderFound.length?wordWonderFound.map(word=>`<span class="found-word">${word}</span>`).join(''):'<span class="empty-word">No words found yet</span>'}</div>
        </div>
        ${renderWordWonderLeaderboard({includeTitle:false})}
      </div>
    </div>`;
  const input=document.getElementById('wordGuess');
  if(input) input.focus();
}

function canBuildWord(word,letters){
  const available=[...letters];
  for(const char of word){
    const index=available.indexOf(char);
    if(index<0) return false;
    available.splice(index,1);
  }
  return true;
}

window.renderGameTab=function(){
  const area=document.getElementById('gameArea');
  if(!area) return;
  loadWordWonderProgress();
  if(wordWonderStarted) renderWordWonderRound();
  else renderWordWonderIntro();
};

window.startWordGame=function(forceNew=false){
  if(!forceNew){
    const saved=getSavedWordWonderProgress();
    if(saved?.game==='words-of-wonders'&&saved.started){
      window.resumeWordGame();
      return;
    }
  }
  wordWonderStarted=true;
  wordWonderLevel=0;
  wordWonderFound=[];
  wordWonderPoints=0;
  wordWonderLetters=[...getWordWonderLevel().letters];
  saveWordWonderProgress();
  renderWordWonderRound('Level started. Find every word to move ahead.');
};

window.resumeWordGame=function(){
  loadWordWonderProgress();
  wordWonderStarted=true;
  saveWordWonderProgress();
  renderWordWonderRound(`Resumed Level ${wordWonderLevel+1}. Continue from where you left.`);
};

window.submitWonderWord=function(){
  const input=document.getElementById('wordGuess');
  const guess=(input?.value||'').trim().toUpperCase();
  const level=getWordWonderLevel();
  if(!guess){
    renderWordWonderRound('Type a word first.');
    return;
  }
  if(wordWonderFound.includes(guess)){
    renderWordWonderRound('You already found that word.');
    return;
  }
  if(!canBuildWord(guess,level.letters)){
    renderWordWonderRound('Use only the letters shown in this level.');
    return;
  }
  if(!level.words.includes(guess)){
    renderWordWonderRound('Nice try. That word is not in this puzzle list.');
    return;
  }
  wordWonderFound.push(guess);
  wordWonderPoints+=guess.length*10;
  saveWordWonderProgress();
  const complete=wordWonderFound.length===level.words.length;
  renderWordWonderRound(complete?'Level complete. Move to the next word wonder.':`Good one. ${guess.length*10} points added.`);
};

window.shuffleWonderLetters=function(){
  wordWonderLetters=[...wordWonderLetters].sort(()=>Math.random()-.5);
  saveWordWonderProgress();
  renderWordWonderRound('Letters shuffled.');
};

window.nextWonderLevel=function(){
  wordWonderLevel++;
  wordWonderFound=[];
  wordWonderLetters=[...getWordWonderLevel().letters];
  saveWordWonderProgress();
  renderWordWonderRound('New level unlocked.');
};

function bindPolicyImporter(){
  const button=document.getElementById('policyTokenizeBtn');
  if(!button) return;
  button.onclick=event=>{
    event.preventDefault();
    window.importPolicies();
  };
}

enhanceUI();
bindPolicyImporter();
if('scrollRestoration' in history) history.scrollRestoration='manual';
ensureCentralAdminAccounts();
try{saveStore();}catch(err){console.error(err);}
showScreen('s-login');
document.body.classList.remove('is-admin-app','is-employee-app','is-buhead-app');
document.body.classList.add('login-unified');
const roleTabs=document.querySelector('.role-tabs');
if(roleTabs){ roleTabs.style.display='none'; roleTabs.hidden=true; }
const heading=document.getElementById('loginPortalHeading');
if(heading) heading.textContent='Welcome back';
const subheading=document.getElementById('loginPortalSubheading');
if(subheading) subheading.textContent=`Sign in to ${COMPANY.portalName} — one portal for employees, HR, and BU Heads.`;
const accessParams=new URLSearchParams(location.search);
const requestedPortal=(accessParams.get('portal')||'').toLowerCase();
if(requestedPortal==='candidate'||requestedPortal==='onboarding'){
  const email=accessParams.get('email');
  location.replace(email
    ?`/onboarding/index.html?login=candidate&email=${encodeURIComponent(email)}`
    :'/onboarding/index.html?login=candidate');
}
const requestedEmail=accessParams.get('email');
bindLoginEmptyFields();
document.getElementById('lEmail').value='';
document.getElementById('lPass').value='';
scheduleLoginFieldClear();
if(requestedEmail){
  const forgot=document.getElementById('forgotEmail');
  if(forgot&&!forgot.value) forgot.value=requestedEmail;
}
