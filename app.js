window.addEventListener("load",function(){if(window.pdfjsLib){pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";}});

// ════════════════════════════════════
//  APEX STUDY AI — FULL ENGINE
// ════════════════════════════════════

// ── MULTI-ENDPOINT AI + CORS-PROXY SYSTEM ──
const AI_ENDPOINTS = [
  { url: 'https://text.pollinations.ai/openai', model: 'deepseek',  name: 'DeepSeek V3.2' },
  { url: 'https://text.pollinations.ai/openai', model: 'openai',    name: 'GPT-4o Fallback' },
  { url: 'https://text.pollinations.ai/openai', model: 'mistral',   name: 'Mistral Fallback' },
];
// Detect local file:// — browsers block fetch() from local files without a proxy
const IS_LOCAL = (typeof window !== 'undefined') && window.location.protocol === 'file:';
const CORS_PROXY = 'https://corsproxy.io/?';
function resolveAIURL(url){ return IS_LOCAL ? CORS_PROXY + encodeURIComponent(url) : url; }

let ACTIVE_EP   = 0;   // index into AI_ENDPOINTS
let POLL_URL    = AI_ENDPOINTS[0].url;          // kept for legacy references
let POLL_MODEL  = AI_ENDPOINTS[0].model;        // will be updated per endpoint
function _epURL()  { return resolveAIURL(AI_ENDPOINTS[ACTIVE_EP].url); }
function _epModel(){ return AI_ENDPOINTS[ACTIVE_EP].model; }
function _epName() { return AI_ENDPOINTS[ACTIVE_EP].name; }

async function _tryNextEndpoint(attempt){
  if(ACTIVE_EP < AI_ENDPOINTS.length - 1){
    ACTIVE_EP++;
    POLL_URL   = AI_ENDPOINTS[ACTIVE_EP].url;
    POLL_MODEL = AI_ENDPOINTS[ACTIVE_EP].model;
    console.warn('[Apex AI] Switching to endpoint:', _epName());
    setAIPill('loading', `⚠️ Switching to ${_epName()}…`);
    return true;
  }
  // All endpoints exhausted — reset and retry from top on next manual attempt
  ACTIVE_EP  = 0;
  POLL_URL   = AI_ENDPOINTS[0].url;
  POLL_MODEL = AI_ENDPOINTS[0].model;
  return false;
}

let AI_READY = false;
let currentUser = null;
let decks = [];
let currentDeck = null;
let studyCards = [], studyIdx = 0, flipped = false;
let studyMode = 'flashcard';
let ss = {correct:0,hard:0,again:0,easy:0};
let studyStart = 0;
let chatHistory = [];
let genCards = [];
let matchSel = null, matchPairs = [];
let lastAcc = 0;
let settings = {SR:true,Tips:true,Voice:false,Sound:false,KB:true,timedSecs:10};
let todaySt = {cards:0,correct:0,date:''};
let weeklyData = new Array(7).fill(0);
let accData = {correct:0,hard:0,again:0,easy:0};
let cardAttempts = {};
let totalXP = 0;
let lightTheme = false;
let timedTimer = null, timedLeft = 10;
let studyCal = {};
let hintCache = {};
let earnedAchs = new Set();
let manualCards = [];
let chatPersona = 'tutor';


// ══════════════════════════════════════════════════════
// TIER SYSTEM
// FREE: 2 decks, 30 cards, basic modes, 2s AI delay
// PRO:  unlimited, all modes, fast AI
// ELITE: pro + cram + exam predictions
// ══════════════════════════════════════════════════════
const TIERS = {
  free:    { name:'Free',    emoji:'🆓', deckLimit:2,        cardLimit:30,       aiDelay:2000, modes:['flashcard','quiz'], cram:false, examPred:false },
  student: { name:'Student', emoji:'📖', deckLimit:10,       cardLimit:80,       aiDelay:500,  modes:['flashcard','quiz','type'], cram:false, examPred:false },
  pro:     { name:'Pro',     emoji:'⚡', deckLimit:Infinity, cardLimit:Infinity, aiDelay:0,    modes:['flashcard','quiz','timed','type','match'], cram:false, examPred:false },
  elite:   { name:'Elite 🔥',emoji:'🔥', deckLimit:Infinity, cardLimit:Infinity, aiDelay:0,    modes:['flashcard','quiz','timed','type','match','cram'], cram:true, examPred:true },
};
function getUserTier(){ return (currentUser?.tier) || 'free'; }
function getTier(){ return TIERS[getUserTier()]; }

function tierCanAddDeck(){
  const t = getTier();
  if(decks.length >= t.deckLimit){
    showPaywall('📚 Deck Limit Reached',`Free plan allows ${t.deckLimit} deck${t.deckLimit!==1?'s':''}. Upgrade to create unlimited decks.`,[
      '⚡ Unlimited decks','⚡ Unlimited cards','⚡ All study modes','⚡ Faster AI'
    ]);
    return false;
  }
  return true;
}
function tierCanAddCards(count){
  const t = getTier();
  if(count > t.cardLimit){
    showPaywall('🃏 Card Limit Reached',`Free plan allows up to ${t.cardLimit} cards per deck. We trimmed to ${t.cardLimit}. Upgrade for unlimited.`,[
      '⚡ Unlimited cards per deck','⚡ Higher quality AI','⚡ Faster generation'
    ]);
    return t.cardLimit;
  }
  return count;
}
function tierCanUseMode(mode){
  const t = getTier();
  if(!t.modes.includes(mode)){
    if(mode==='cram')
      showPaywall('🔥 Cram Mode is Elite Only','Cram Mode is hyper-speed review designed for last-minute exam prep. Only on Operation: Exam Day plan.',['🔥 Cram Mode','🔥 Exam Predictions','🔥 Priority AI','🔥 Battle quizzes']);
    else
      showPaywall('🔒 Mode Locked',`${mode.charAt(0).toUpperCase()+mode.slice(1)} mode is a Pro feature. Upgrade to unlock all study modes.`,[
        '⚡ Timed test','⚡ Type answer','⚡ Match game','⚡ Unlimited usage'
      ]);
    return false;
  }
  return true;
}
function tierCanExamPredict(){
  if(!getTier().examPred){
    showPaywall('🎯 Exam Predictions is Elite Only','Our AI analyzes your deck and predicts likely exam questions. Exclusive to Operation: Exam Day.',['🔥 AI Exam Predictions','🔥 Cram Mode','🔥 Priority AI']);
    return false;
  }
  return true;
}

function showPaywall(title, msg, perks){
  document.getElementById('paywallTitle').textContent = title;
  document.getElementById('paywallMsg').textContent = msg;
  document.getElementById('paywallPerks').innerHTML = perks.map(p=>`<div style="display:flex;align-items:center;gap:8px">${p}</div>`).join('');
  document.getElementById('paywallOverlay').classList.remove('hidden');
}
function closePaywall(){ document.getElementById('paywallOverlay').classList.add('hidden'); }
function openUpgrade(tier='pro'){
  const icons = {student:'📖',pro:'⚡',elite:'🔥'};
  const titles = {student:'Get Student Plan',pro:'Upgrade to Pro',elite:'Go Full Elite 🔥'};
  const msgs = {
    student:'10 decks, 80 cards per deck, faster AI, and more study modes — perfect for students on a budget.',
    pro:'Unlimited decks, unlimited cards, all study modes — no limits.',
    elite:'Everything in Pro, plus Cram Mode, Exam Predictions, and Priority AI. Because your exam is tomorrow.'
  };
  document.getElementById('upgradeIcon').textContent = icons[tier]||'⚡';
  document.getElementById('upgradeTitle').textContent = titles[tier]||'Upgrade';
  document.getElementById('upgradeMsg').textContent = msgs[tier]||'';
  document.getElementById('upgradeOverlay').classList.remove('hidden');
}
function closeUpgrade(){ document.getElementById('upgradeOverlay').classList.add('hidden'); }

function renderTierBadge(){
  const t = getUserTier();
  const badge = document.getElementById('tierBadge');
  if(!badge) return;
  const styles = {free:'var(--muted)',student:'var(--cyan)',pro:'var(--p3)',elite:'var(--yellow)'};
  badge.textContent = TIERS[t].emoji + ' ' + TIERS[t].name;
  badge.style.color = styles[t];
}

// ── AI INIT ──
async function initAI(attempt=1, epIdx=0) {
  ACTIVE_EP  = epIdx;
  POLL_URL   = AI_ENDPOINTS[epIdx].url;
  POLL_MODEL = AI_ENDPOINTS[epIdx].model;
  const label = attempt === 1 && epIdx === 0 ? '⏳ Connecting to AI…' : `⏳ Trying ${_epName()} (attempt ${attempt})…`;
  setAIPill('loading', label + (IS_LOCAL ? ' <span style="font-size:.7rem;opacity:.7">[local mode → proxy]</span>' : ''));
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 14000);
    const r = await fetch(_epURL(), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({model:_epModel(), messages:[{role:'user',content:'Hi'}], max_tokens:3}),
      signal: controller.signal
    });
    clearTimeout(tid);
    if(r.ok){
      AI_READY = true;
      setAIPill('ready', `✅ ${_epName()} — Ready · No key needed${IS_LOCAL?' · Proxy active':''}`);
      if(attempt > 1 || epIdx > 0) showToast(`⚡ AI connected via ${_epName()}!`);
    } else {
      throw new Error('HTTP '+r.status);
    }
  } catch(e) {
    AI_READY = false;
    const totalAttempts = attempt + epIdx * 2;
    if(attempt < 2){
      // retry same endpoint once
      const delay = 3000 * attempt;
      setAIPill('loading', `⚠️ Retrying ${_epName()} in ${delay/1000}s…`);
      setTimeout(() => initAI(attempt + 1, epIdx), delay);
    } else if(epIdx < AI_ENDPOINTS.length - 1){
      // try next endpoint
      setAIPill('loading', `⚠️ ${_epName()} failed — trying backup…`);
      setTimeout(() => initAI(1, epIdx + 1), 1500);
    } else {
      // all exhausted
      const localHint = IS_LOCAL ? '<br><small style="opacity:.8">💡 Tip: Host on Netlify/GitHub Pages for best reliability</small>' : '';
      setAIPill('error', `⚠️ All AI endpoints failed — check your internet connection.${localHint} <button onclick="initAI()" style="background:rgba(124,58,237,.2);border:1px solid var(--p);border-radius:6px;color:var(--p3);padding:4px 10px;cursor:pointer;font-size:.75rem;margin-left:8px">↺ Retry</button>`);
    }
  }
}

function setAIPill(type,msg){
  const p=document.getElementById('aiPill');if(!p)return;
  p.className='ai-pill '+(type==='ready'?'ready':type==='loading'?'loading':'error');
  p.innerHTML=`<div class="ai-dot ${type==='ready'?'green':type==='loading'?'yellow':'red'}"></div><div>${msg}</div>`;
}

// ── POLLINATIONS ──
// ── REQUEST MANAGEMENT ──
let _activeController = null;
const AI_TIMEOUT_MS = 30000; // 30s hard timeout
let _lastRequestTime = 0;
const MIN_REQUEST_GAP_MS = 800; // prevent hammering

async function callAI(prompt, retries=2){
  if(!AI_READY) throw new Error('AI not ready — check your connection');
  // Rate limiting
  const now = Date.now();
  const gap = now - _lastRequestTime;
  if(gap < MIN_REQUEST_GAP_MS) await new Promise(r => setTimeout(r, MIN_REQUEST_GAP_MS - gap));
  _lastRequestTime = Date.now();

  if(_activeController) _activeController.abort();
  const controller = new AbortController();
  _activeController = controller;
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const r = await fetch(_epURL(), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({model:_epModel(), messages:[{role:'user',content:prompt}], max_tokens:2500}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if(!r.ok) throw new Error('AI server error ('+r.status+'). Try again in a moment.');
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || '';
  } catch(e) {
    clearTimeout(timeoutId);
    if(e.name === 'AbortError'){
      // Timeout: try next endpoint before giving up
      if(ACTIVE_EP < AI_ENDPOINTS.length - 1){
        await _tryNextEndpoint();
        return callAI(prompt, retries);
      }
      throw new Error('Request timed out. Your connection may be slow — try again.');
    }
    if(retries > 0){
      // Retry: switch endpoint each retry for variety
      if(ACTIVE_EP < AI_ENDPOINTS.length - 1) await _tryNextEndpoint();
      await new Promise(r => setTimeout(r, 1500));
      return callAI(prompt, retries - 1);
    }
    throw e;
  } finally {
    if(_activeController === controller) _activeController = null;
  }
}

async function callAIStream(messages,onChunk){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s for streaming
  const r=await fetch(_epURL(),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:_epModel(),messages,stream:true,max_tokens:2500}),
    signal: controller.signal});
  clearTimeout(timeoutId);
  if(!r.ok)throw new Error('AI server error ('+r.status+'). Try again.');
  const reader=r.body.getReader();const dec=new TextDecoder();let full='';
  while(true){
    const{done,value}=await reader.read();if(done)break;
    const lines=dec.decode(value,{stream:true}).split('\n');
    for(const line of lines){
      if(!line.startsWith('data: '))continue;const d=line.slice(6).trim();
      if(d==='[DONE]')continue;
      try{const j=JSON.parse(d);const c=j.choices?.[0]?.delta?.content||'';if(c){full+=c;onChunk(c);}}catch{}
    }
  }
  return full;
}

// ── XP SYSTEM ──
const XP_LVLS=[0,100,250,500,900,1500,2500,4000,6000,10000];
function getLevel(xp){for(let i=XP_LVLS.length-1;i>=0;i--)if(xp>=XP_LVLS[i])return i+1;return 1;}
function getXPProg(xp){const l=getLevel(xp)-1;const c=XP_LVLS[Math.min(l,XP_LVLS.length-1)]||0;const n=XP_LVLS[Math.min(l+1,XP_LVLS.length-1)]||XP_LVLS[XP_LVLS.length-1];return{pct:n>c?Math.round((xp-c)/(n-c)*100):100,curr:xp-c,needed:n-c,level:l+1};}
function addXP(amt,lbl){totalXP+=amt;save();updateXPUI();showToast(`⭐ +${amt} XP — ${lbl}!`,2000);}
function updateXPUI(){
  const p=getXPProg(totalXP);const lvl=getLevel(totalXP);const pct=p.pct+'%';
  ['xpFill','xpAnalFill'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.width=pct;});
  const xl=document.getElementById('xpLabel');if(xl)xl.textContent=`Level ${lvl} · ${totalXP} / ${XP_LVLS[Math.min(lvl,XP_LVLS.length-1)]} XP`;
  const xn=document.getElementById('xpNext');if(xn)xn.textContent=lvl<XP_LVLS.length?`${p.needed-p.curr} XP to Level ${lvl+1}`:'Max Level!';
  ['navLevel','analyticsLevel','setLevel'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='Lvl '+lvl;});
  const xi=document.getElementById('xpInfo');if(xi)xi.textContent=`${totalXP} XP · Level ${lvl}`;
  const sx=document.getElementById('statXP');if(sx)sx.textContent=totalXP;
  const sxp=document.getElementById('setXP');if(sxp)sxp.textContent=totalXP+' XP';
  const al=document.getElementById('xpAnalLabel');if(al)al.textContent=`${totalXP} XP (Level ${lvl})`;
  const an=document.getElementById('xpAnalNext');if(an)an.textContent=lvl<XP_LVLS.length?`${p.needed-p.curr} XP to next level`:'Max Level!';
}

// ── THEME ──
function toggleTheme(){
  lightTheme=!lightTheme;
  document.body.setAttribute('data-theme',lightTheme?'light':'');
  const b=document.getElementById('themeBtn');if(b)b.textContent=lightTheme?'☀️':'🌙';
  const t=document.getElementById('toggleThemeBtn');if(t)t.classList.toggle('on',lightTheme);
  localStorage.setItem('apex_theme',lightTheme?'light':'dark');
}


// ── SAFE PASSWORD ENCODE (supports unicode) ──
// SECURITY FIX: replaced btoa (reversible base64) with PBKDF2 (one-way hash)
// Uses Web Crypto API — synchronous-style via stored hash comparison
async function safeEncode(str){
  const enc = new TextEncoder()
  // Use a fixed salt derived from a constant + the string to avoid rainbow tables
  // NOTE: For a pure localStorage app this is best-effort; use Supabase Auth for production
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(str), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', salt: enc.encode('thyroxeia-apex-salt-v1'), iterations: 100000, hash:'SHA-256' },
    keyMaterial, 256
  )
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('')
}
function safeDecode(str){ return str } // hash is one-way — no decode needed

// ── AUTH ──
function switchAuthTab(t){
  document.querySelectorAll('#authOverlay .tab-btn').forEach((b,i)=>b.classList.toggle('active',(t==='login'&&i===0)||(t==='signup'&&i===1)));
  document.getElementById('loginForm').style.display=t==='login'?'':'none';
  document.getElementById('signupForm').style.display=t==='signup'?'':'none';
}
async function doLogin(){
  const e=document.getElementById('loginEmail').value.trim();
  const p=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');err.classList.remove('show');
  if(!e||!p){err.textContent='❌ Fill all fields.';err.classList.add('show');return;}
  const users=JSON.parse(localStorage.getItem('apex_users')||'{}');
  const hashed = await safeEncode(p);
  if(!users[e]||users[e].pass!==hashed){err.textContent='❌ Invalid email or password.';err.classList.add('show');return;}
  currentUser=users[e];afterLogin();
}
async function doSignup(){
  const first=document.getElementById('sfirst').value.trim();
  const last=document.getElementById('slast').value.trim();
  const email=document.getElementById('semail').value.trim();
  const pass=document.getElementById('spass').value;
  const pass2=document.getElementById('spass2').value;
  const goal=document.getElementById('sgoal').value;
  const err=document.getElementById('signupErr');err.classList.remove('show');
  if(!first||!email||!pass){err.textContent='❌ Fill required fields.';err.classList.add('show');return;}
  if(pass!==pass2){err.textContent='❌ Passwords do not match.';err.classList.add('show');return;}
  if(pass.length<8){err.textContent='❌ Password must be 8+ chars.';err.classList.add('show');return;}
  if(!email.includes('@')){err.textContent='❌ Valid email required.';err.classList.add('show');return;}
  const users=JSON.parse(localStorage.getItem('apex_users')||'{}');
  if(users[email]){err.textContent='❌ Email already registered.';err.classList.add('show');return;}
  const hashed = await safeEncode(pass);
  currentUser={first,last,email,pass:hashed,goal,joined:new Date().toISOString()};
  users[email]=currentUser;localStorage.setItem('apex_users',JSON.stringify(users));afterLogin(true);
}
async function quickLogin(){
  const demoEmail='demo@apex.ai';
  const users=JSON.parse(localStorage.getItem('apex_users')||'{}');
  if(!users[demoEmail]){
    const hashed = await safeEncode('demo1234');
    users[demoEmail]={first:'Demo',last:'User',email:demoEmail,pass:hashed,goal:'exams',joined:new Date().toISOString()};
    localStorage.setItem('apex_users',JSON.stringify(users));
  }
  currentUser=users[demoEmail];
  afterLogin();
}
function afterLogin(isNew=false){ renderTierBadge();
  const planDescs={free:'Free — 2 decks, 30 cards/deck',student:'Student — 10 decks, 80 cards 📖',pro:'Pro — Unlimited decks & cards ⚡',elite:'Elite 🔥 — Operation: Exam Day'};
  const pd=document.getElementById('setPlanDesc'); if(pd) pd.textContent=planDescs[getUserTier()]||'Free';
  load();
  // Hide all landing pages, show app
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('authOverlay').classList.add('hidden');
  document.body.style.overflow='';
  document.getElementById('app').style.display='block';
  const f=currentUser.first||'Student';
  document.getElementById('navAv').textContent=f[0].toUpperCase();
  document.getElementById('navName').textContent=f;
  document.getElementById('uName').textContent=f;
  document.getElementById('setName').textContent=f+' '+(currentUser.last||'');
  document.getElementById('setEmail').textContent=currentUser.email;
  document.getElementById('setGoal').textContent=currentUser.goal||'Not set';
  const h=new Date().getHours();
  document.getElementById('timeGreet').textContent=h<12?'morning':h<17?'afternoon':'evening';
  localStorage.setItem('apex_lastUser',currentUser.email);
  if(lightTheme){document.body.setAttribute('data-theme','light');document.getElementById('themeBtn').textContent='☀️';document.getElementById('toggleThemeBtn')?.classList.add('on');}
  const ts=document.getElementById('timedSecsSel');if(ts)ts.value=settings.timedSecs||10;
  applySettings();updateDashboard();initChat();updateXPUI();renderAchs();checkDailyChallenge();
  if(isNew){
    showToast('🎉 Welcome to Apex AI, '+f+'!');
    // Seed a demo deck for new users so they see the app in action immediately
    if(decks.length===0){
      const demoCards=[
        {q:'What is spaced repetition?',a:'A learning technique that increases review intervals over time based on how well you know a card.',tip:'Think of it as a smart scheduler — easy cards wait longer, hard ones come back sooner.',id:'d1',ease:0,reps:0,interval:1,due:Date.now()},
        {q:'What does DeepSeek V3.2 power in Apex?',a:'All AI features: flashcard generation, AI tutor chat, hints, and explanations — powered by advanced AI with no API key.',tip:'Open source = the model weights are public!',id:'d2',ease:0,reps:0,interval:1,due:Date.now()},
        {q:'How do you rate a flashcard in Apex?',a:'Press 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy) — or swipe left/right on mobile.',tip:'Keyboard shortcuts make reviewing 3x faster!',id:'d3',ease:0,reps:0,interval:1,due:Date.now()},
        {q:'What is the Pomodoro Technique?',a:'A time management method: 25 minutes of focused work followed by a 5-minute break.',tip:'Tomato timer 🍅 — Francesco Cirillo invented it in the 1980s.',id:'d4',ease:0,reps:0,interval:1,due:Date.now()},
        {q:'What is active recall?',a:'Testing yourself on material rather than passively re-reading — the most effective study method proven by research.',tip:'If you can explain it without looking, you know it!',id:'d5',ease:0,reps:0,interval:1,due:Date.now()},
      ];
      const demoDeck={id:'demo_'+Date.now(),name:'🚀 Welcome to Apex! (Sample Deck)',subject:'General',cards:demoCards,created:new Date().toISOString()};
      decks.push(demoDeck);save();
      setTimeout(()=>showToast('📚 Demo deck added — try studying it!'),2500);
    }
    updateDashboard();
  }
  else showToast('👋 Welcome back, '+f+'!');
}
function logout(){
  if(!confirm('Log out?'))return;
  save();
  currentUser=null;decks=[];chatHistory=[];totalXP=0;earnedAchs=new Set();
  document.getElementById('app').style.display='none';
  document.getElementById('authOverlay').classList.remove('hidden');
  showPage('landingPage');
  showToast('👋 Logged out successfully');
}

// ── STORAGE ──
function save(){
  if(!currentUser)return;
  const d={decks,settings,todaySt,weeklyData,accData,cardAttempts,earned:[...earnedAchs],totalXP,studyCal,lightTheme};
  localStorage.setItem('apex_'+currentUser.email,JSON.stringify(d));
}
function load(){
  if(!currentUser)return;
  const raw=localStorage.getItem('apex_'+currentUser.email);
  if(raw){
    const d=JSON.parse(raw);
    decks=d.decks||[];settings={...{SR:true,Tips:true,Voice:false,Sound:false,KB:true,timedSecs:10},...(d.settings||{})};
    todaySt=d.todaySt||{cards:0,correct:0,date:''};weeklyData=d.weeklyData||new Array(7).fill(0);
    accData=d.accData||{correct:0,hard:0,again:0,easy:0};cardAttempts=d.cardAttempts||{};
    earnedAchs=new Set(d.earned||[]);totalXP=d.totalXP||0;studyCal=d.studyCal||{};lightTheme=d.lightTheme||false;
  }
  const today=new Date().toDateString();
  if(todaySt.date!==today){weeklyData=[todaySt.cards||0,...weeklyData.slice(0,6)];todaySt={cards:0,correct:0,date:today};save();}
}
function getStreak(){
  const k='apex_streak_'+(currentUser?.email||'');const raw=localStorage.getItem(k);
  if(!raw)return 0;const d=JSON.parse(raw);const today=new Date().toDateString();
  if(d.lastDay===today||d.lastDay===new Date(Date.now()-86400000).toDateString())return d.count;return 0;
}
function bumpStreak(){
  const k='apex_streak_'+(currentUser?.email||'');const today=new Date().toDateString();
  const raw=localStorage.getItem(k);let d=raw?JSON.parse(raw):{count:0,lastDay:''};
  if(d.lastDay!==today){const wasY=d.lastDay===new Date(Date.now()-86400000).toDateString();d.count=wasY?d.count+1:1;d.lastDay=today;localStorage.setItem(k,JSON.stringify(d));}
  studyCal[today]=(studyCal[today]||0)+1;save();
}
function allTimeCards(){return parseInt(localStorage.getItem('apex_at_'+(currentUser?.email||''))||'0');}

// ── PAGES / VIEWS ──
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');window.scrollTo(0,0);}
function goToApp(tab){
  const o=document.getElementById('authOverlay');
  o.classList.remove('hidden');
  document.body.style.overflow='hidden';
  const modal=o.querySelector('.modal');
  if(modal)modal.scrollTop=0;
  if(tab==='signup')switchAuthTab('signup');
  else switchAuthTab('login');
}
function showView(n){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.app-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(n+'View').classList.add('active');
  ['dashboard','decks','create','aiTutor','analytics','settings'].forEach((v,i)=>{if(v===n)document.querySelectorAll('.app-tab')[i]?.classList.add('active');});
  if(n==='dashboard')updateDashboard();
  if(n==='decks')renderDecks();
  if(n==='analytics')renderAnalytics();
}

// ── DASHBOARD ──
function updateDashboard(){
  const streak=getStreak();
  document.getElementById('streakNum').textContent=streak;
  document.getElementById('navStreak').textContent='🔥 '+streak;
  document.getElementById('statCards').textContent=todaySt.cards;
  document.getElementById('statDecksN').textContent=decks.length;
  document.getElementById('deckCountBadge').textContent=decks.length+' deck'+(decks.length!==1?'s':'');
  const acc=todaySt.cards>0?Math.round(todaySt.correct/todaySt.cards*100)+'%':'—';
  document.getElementById('statAcc').textContent=acc;
  document.getElementById('statAchs').textContent=earnedAchs.size;
  updateXPUI();renderStreakCal();
  const el=document.getElementById('recentDecksGrid');
  const recent=[...decks].slice(-6).reverse();
  el.innerHTML=recent.length?recent.map(d=>deckHTML(d)).join(''):'<p style="color:var(--muted);font-size:.88rem">No decks yet — create one above! 🚀</p>';
}
function renderStreakCal(){
  const el=document.getElementById('streakCal');if(!el)return;
  const today=new Date();const days=[];
  for(let i=62;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.push(d.toDateString());}
  el.innerHTML=days.map(d=>{const c=studyCal[d]||0;const l=c===0?'':c<5?'s1':c<15?'s2':'s3';const it=d===today.toDateString();return`<div class="s-day ${l}${it?' today':''}" title="${d}: ${c} cards"></div>`;}).join('');
  const s=getStreak();document.getElementById('calStreak').textContent=s+' day'+(s!==1?'s':'');
}
function checkDailyChallenge(){
  const el=document.getElementById('dailyCard');if(!el)return;
  const done=localStorage.getItem('apex_dc_'+new Date().toDateString()+'_'+(currentUser?.email||''));
  if(done){el.style.display='none';return;}
  if(decks.length>0||Object.keys(cardAttempts).length>0){
    el.style.display='';
    const weak=Object.values(cardAttempts).filter(c=>c.attempts>0&&c.misses/c.attempts>0.3);
    document.getElementById('dcDesc').textContent=weak.length>0?`Review your ${Math.min(5,weak.length)} weakest cards!`:`Study any deck today and earn +30 XP!`;
  }
}
function startDailyChallenge(){
  localStorage.setItem('apex_dc_'+new Date().toDateString()+'_'+(currentUser?.email||''),'1');
  document.getElementById('dailyCard').style.display='none';
  const weak=Object.values(cardAttempts).filter(c=>c.attempts>0&&c.misses/c.attempts>0.3).slice(0,5);
  if(weak.length>0){
    const wc=decks.flatMap(d=>d.cards).filter(c=>weak.some(w=>w.q===c.q)).slice(0,5);
    if(wc.length>0){currentDeck={name:'Daily Challenge 🎯',id:'ch'};studyMode='flashcard';studyCards=wc;ss={correct:0,hard:0,again:0,easy:0};studyStart=Date.now();studyIdx=0;showView('study');renderStudyCard();addXP(30,'Daily Challenge started!');return;}
  }
  if(decks.length>0)startQuizAll();else{showToast('❌ Create a deck first!');showView('create');}
}

// ── DECKS ──
function renderDecks(){
  const q=(document.getElementById('deckSearch')?.value||'').toLowerCase();
  const filt=decks.filter(d=>d.name.toLowerCase().includes(q)||d.subject.toLowerCase().includes(q));
  const el=document.getElementById('allDecksGrid');const noEl=document.getElementById('noDecks');
  if(!decks.length){el.innerHTML='';noEl.style.display='';return;}
  noEl.style.display='none';
  el.innerHTML=filt.length?filt.map(d=>deckHTML(d)).join(''):'<p style="color:var(--muted)">No results for that search.</p>';
  const subjs=[...new Set(decks.map(d=>d.subject))];
  document.getElementById('subjectFilters').innerHTML=subjs.map(s=>`<span style="padding:5px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:50px;font-size:.76rem;font-weight:700;cursor:pointer;transition:all .18s" onclick="document.getElementById('deckSearch').value='${s}';renderDecks()" onmouseover="this.style.borderColor='var(--p)'" onmouseout="this.style.borderColor='var(--border)'">${s}</span>`).join('');
}
function deckHTML(d){
  const total=d.cards.length;const mastered=d.cards.filter(c=>c.ease>=2).length;const pct=total>0?Math.round(mastered/total*100):0;
  return`<div class="deck-card">
    <div class="deck-subject-tag">${escH(d.subject||'General')}</div>
    <h3>${escH(d.name)}</h3>
    <div class="deck-meta">${total} card${total!==1?'s':''} · ${new Date(d.created).toLocaleDateString()}</div>
    <div class="progress-wrap"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:12px">${pct}% mastered · ${mastered}/${total}</div>
    <div class="deck-btns">
      <button class="db-study" onclick="startStudy('${d.id}','flashcard')">📖 Study</button>
      <button class="db-quiz" onclick="startStudy('${d.id}','quiz')">⚡ Quiz</button>
      <button class="db-timed" onclick="startStudy('${d.id}','timed')">⏱️</button>
      <button class="db-type" onclick="startStudy('${d.id}','type')">✏️</button>
      <button class="db-match" onclick="startStudy('${d.id}','match')">🎮</button>
      <button class="db-del" onclick="deleteDeck('${d.id}')">🗑️</button>
    </div>
  </div>`;
}
function deleteDeck(id){if(!confirm('Delete this deck?'))return;decks=decks.filter(d=>d.id!==id);save();renderDecks();updateDashboard();showToast('🗑️ Deck deleted');}
function clearAllDecks(){if(!confirm('Delete ALL decks? This cannot be undone.'))return;decks=[];save();renderDecks();updateDashboard();showToast('🗑️ All decks cleared');}

// ── CREATE ──
function switchCreateTab(tab){
  ['ai','manual','import','pdf'].forEach(function(t){
    var tabEl=document.getElementById('create'+t.charAt(0).toUpperCase()+t.slice(1)+'Tab');
    var btnEl=document.getElementById(t+'TabBtn');
    if(tabEl)tabEl.style.display=(t===tab)?'':'none';
    if(btnEl)btnEl.classList.toggle('active',t===tab);
  });
}
// ── INPUT PREPROCESSING ──
function preprocessInput(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')   // normalize line endings
    .replace(/\t/g, ' ')                               // tabs → spaces
    .replace(/[ ]{3,}/g, ' ')                           // collapse excess spaces
    .replace(/\n{4,}/g, '\n\n')                       // collapse excess blank lines
    .replace(/[\u200B-\u200D\uFEFF]/g, '')            // remove zero-width chars
    .trim()
    .slice(0, 8000);                                     // hard cap for API
}

// ── ROBUST JSON CARD PARSER ──
function parseAICards(raw) {
  let js = raw;
  // 1. Extract the JSON array portion
  const m = raw.match(/\[[\s\S]*\]/);
  if (m) js = m[0];
  // 2. Fix common AI JSON mistakes
  js = js
    .replace(/,\s*]/g, ']')           // trailing commas in array
    .replace(/,\s*}/g, '}')           // trailing commas in object
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"');     // single-quoted values

  let cards;
  try { cards = JSON.parse(js); }
  catch(e) {
    // last-ditch: try the raw response
    try { cards = JSON.parse(raw); }
    catch(e2) { throw new Error('AI returned malformed JSON. Try regenerating.'); }
  }

  // Validate + sanitize each card
  const valid = cards
    .filter(c => c && typeof c.q === 'string' && c.q.trim() && typeof c.a === 'string' && c.a.trim())
    .map(c => ({ q: c.q.trim(), a: c.a.trim(), tip: (c.tip || '').trim() }));

  if (!valid.length) throw new Error('AI returned 0 valid cards. Your input may be too short — add more text and try again.');
  return valid;
}

function resetCreate(){document.getElementById('deckName').value='';document.getElementById('aiText').value='';document.getElementById('cardPreviewList').innerHTML='';document.getElementById('genSection').style.display='none';genCards=[];}

let _genInProgress = false;
async function generateCards(){
  if(_genInProgress){showToast('⏳ Already generating — please wait…');return;}
  const rawText = document.getElementById('aiText').value;
  const text = preprocessInput(rawText);
  const cnt=document.getElementById('aiCount').value;
  const diff=document.getElementById('aiDiff').value;
  const style=document.getElementById('aiStyle').value;
  if(!text){showToast('❌ Paste notes or a topic first!');return;}
  if(text.length < 10){showToast('❌ Input too short — add more detail!');return;}
  if(!AI_READY){showToast('⏳ AI loading — please wait…');return;}
  // Free tier: add slight delay to simulate "slower generation"
  const _tierDelay = getTier().aiDelay;
  if(_tierDelay > 0){ showToast('⏳ Generating… (upgrade for instant speed)'); await new Promise(r=>setTimeout(r,_tierDelay)); }
  _genInProgress = true;
  const sec=document.getElementById('genSection');const list=document.getElementById('cardPreviewList');
  const genBtn = document.querySelector('[onclick="generateCards()"]');
  if(genBtn){genBtn.disabled=true;genBtn.textContent='⏳ Generating…';}
  sec.style.display='';
  list.innerHTML=`<div class="spinner"></div><p style="text-align:center;color:var(--muted);margin-top:10px">🧠 Generating ${cnt} cards — may take 5-15s…</p>`;
  const diffMap={beginner:'basic, accessible — assume no prior knowledge',intermediate:'intermediate, exam-level — test key concepts',advanced:'university-level, complex — deep understanding',expert:'doctoral/professional-grade — nuanced mastery'};
  const styleMap={standard:'standard question-answer pairs',definition:'definition-style "What is X?" / "X is defined as…"',fill:'fill-in-the-blank sentences with KEY TERM missing',scenario:'real-world scenario/application questions'};
  // Truncate to 6000 chars for best quality
  const inputText = text.slice(0, 6000);
  const prompt=`You are a world-class flashcard creator. Generate EXACTLY ${cnt} high-quality flashcards.

Difficulty: ${diffMap[diff]||diffMap.intermediate}
Style: ${styleMap[style]||styleMap.standard}

CRITICAL RULES:
- Handle ANY input: messy notes, abbreviations, shorthand, bullet points — extract the key ideas
- Test UNDERSTANDING, not word-for-word memorization
- Each answer must be concise (1-3 sentences max)
- Each tip must be a clever, specific mnemonic or memory trick
- Do NOT include the answer in the question
- Do NOT number the questions

Input text:
"""
${inputText}
"""

Return ONLY a valid JSON array — no markdown, no explanation before or after:
[{"q":"question here","a":"answer here","tip":"memory tip here"}]`;
  try{
    const raw=await callAI(prompt);
    genCards = parseAICards(raw);
    renderCardPreviews();
    document.getElementById('cardCountBadge').textContent=genCards.length+' cards';
    if(!document.getElementById('deckName').value){
      const autoName = text.trim().split(/\s+/).slice(0,6).join(' ');
      document.getElementById('deckName').value = autoName.length > 50 ? autoName.slice(0,50)+'…' : autoName;
    }
    showToast('⚡ '+genCards.length+' cards generated!');
  }catch(e){
    list.innerHTML=`<div style="color:var(--red);padding:16px;text-align:center">❌ ${escH(e.message)}<br/><small style="color:var(--muted)">Tip: Try shorter/cleaner input, or regenerate.</small><br/><button class="btn btn-ghost btn-xs" onclick="generateCards()" style="margin-top:10px">🔄 Try Again</button></div>`;
  }finally{
    _genInProgress = false;
    if(genBtn){genBtn.disabled=false;genBtn.textContent='🤖 Generate';}
  }
}
function renderCardPreviews(){
  document.getElementById('cardPreviewList').innerHTML=genCards.map((c,i)=>`
    <div class="card-preview">
      <div class="card-num">${i+1}</div>
      <div class="card-qa"><div class="q">❓ ${escH(c.q)}</div><div class="a">💡 ${escH(c.a)}</div>${c.tip?`<div class="tip">🧠 ${escH(c.tip)}</div>`:''}</div>
      <button class="del-c" onclick="genCards.splice(${i},1);renderCardPreviews();document.getElementById('cardCountBadge').textContent=genCards.length+' cards'">✕</button>
    </div>`).join('');
}
function saveDeck(){
  const name=document.getElementById('deckName').value.trim();
  const subj=document.getElementById('deckSubject').value;
  if(!name){showToast('❌ Enter a deck name!');return;}
  if(!genCards.length){showToast('❌ Generate cards first!');return;}
  if(!tierCanAddDeck()) return;
  const deck={id:Date.now().toString(),name,subject:subj,cards:genCards.map(c=>({...c,id:Math.random().toString(36).slice(2),ease:0,reps:0,interval:1,due:Date.now()})),created:new Date().toISOString()};
  decks.push(deck);save();checkAchs();addXP(20,'New deck created');
  showToast('🎉 "'+name+'" saved — '+deck.cards.length+' cards!');
  resetCreate();showView('decks');
}

// ── MANUAL ──
function addManualRow(){
  const list=document.getElementById('manualCardsList');const idx=manualCards.length;manualCards.push({q:'',a:''});
  const div=document.createElement('div');div.id='mr_'+idx;
  div.style.cssText='display:grid;grid-template-columns:1fr 1fr 32px;gap:8px;margin-bottom:8px;align-items:start';
  div.innerHTML=`<input placeholder="Question ${idx+1}" oninput="manualCards[${idx}].q=this.value" style="padding:10px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-size:.85rem;outline:none;font-family:'Inter',sans-serif"/><input placeholder="Answer ${idx+1}" oninput="manualCards[${idx}].a=this.value" style="padding:10px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-size:.85rem;outline:none;font-family:'Inter',sans-serif"/><button onclick="document.getElementById('mr_${idx}')?.remove()" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;color:var(--red);cursor:pointer;font-size:.9rem;height:38px;margin-top:2px">✕</button>`;
  list.appendChild(div);
}
function saveManualDeck(){
  const name=document.getElementById('manualDeckName').value.trim();
  const subj=document.getElementById('manualSubject').value;
  const cards=manualCards.filter(c=>c.q.trim()&&c.a.trim());
  if(!name){showToast('❌ Enter deck name!');return;}
  if(!cards.length){showToast('❌ Add at least one card!');return;}
  if(!tierCanAddDeck()) return;
  const deck={id:Date.now().toString(),name,subject:subj,cards:cards.map(c=>({...c,tip:'',id:Math.random().toString(36).slice(2),ease:0,reps:0,interval:1,due:Date.now()})),created:new Date().toISOString()};
  decks.push(deck);save();checkAchs();addXP(15,'Manual deck created');
  manualCards=[];document.getElementById('manualCardsList').innerHTML='';document.getElementById('manualDeckName').value='';
  showToast('🎉 "'+name+'" saved!');showView('decks');
}

// ── CSV IMPORT ──
function handleDrop(e){e.preventDefault();document.getElementById('dropArea').classList.remove('drag-over');const f=e.dataTransfer.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{document.getElementById('csvPaste').value=ev.target.result;previewImport();};r.readAsText(f);}
function handleCsvFile(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{document.getElementById('csvPaste').value=ev.target.result;previewImport();};r.readAsText(f);}
function parseCSV(text){return text.split('\n').map(line=>{const p=line.split(',');if(p.length<2)return null;const q=p[0].replace(/^"|"$/g,'').trim();const a=p.slice(1).join(',').replace(/^"|"$/g,'').trim();return q&&a?{q,a,tip:''}:null;}).filter(Boolean);}
function previewImport(){const text=document.getElementById('csvPaste').value.trim();if(!text){showToast('❌ No CSV content');return;}const cards=parseCSV(text);const pv=document.getElementById('importPreview');pv.style.display='';document.getElementById('importCount').textContent=`✅ Found ${cards.length} card${cards.length!==1?'s':''}`;document.getElementById('importPreviewList').innerHTML=cards.slice(0,5).map((c,i)=>`<div class="card-preview"><div class="card-num">${i+1}</div><div class="card-qa"><div class="q">❓ ${escH(c.q)}</div><div class="a">💡 ${escH(c.a)}</div></div></div>`).join('')+(cards.length>5?`<p style="color:var(--muted);font-size:.8rem;margin-top:6px">...and ${cards.length-5} more</p>`:'');}
function saveImport(){
  const name=document.getElementById('importName').value.trim();const subj=document.getElementById('importSubject').value;
  const text=document.getElementById('csvPaste').value.trim();if(!name){showToast('❌ Enter deck name!');return;}
  const cards=parseCSV(text);if(!cards.length){showToast('❌ No valid cards in CSV!');return;}
  const deck={id:Date.now().toString(),name,subject:subj,cards:cards.map(c=>({...c,id:Math.random().toString(36).slice(2),ease:0,reps:0,interval:1,due:Date.now()})),created:new Date().toISOString()};
  decks.push(deck);save();checkAchs();localStorage.setItem('apex_imported_'+(currentUser?.email||''),'1');addXP(25,'CSV deck imported');
  showToast('📥 "'+name+'" imported — '+deck.cards.length+' cards!');showView('decks');
}

// ── STUDY ENGINE ──
function startStudy(deckId,mode='flashcard'){
  if(!tierCanUseMode(mode)) return;
  const deck=decks.find(d=>d.id===deckId);if(!deck||!deck.cards.length){showToast('❌ No cards in this deck!');return;}
  currentDeck=deck;studyMode=mode;ss={correct:0,hard:0,again:0,easy:0};studyStart=Date.now();
  studyCards=settings.SR?[...deck.cards].sort((a,b)=>a.due-b.due):shuffleArr([...deck.cards]);
  studyIdx=0;flipped=false;hintCache={};
  showView('study');
  if(mode==='match'){renderMatch();return;}
  if(mode==='timed'){renderTimed();return;}
  renderStudyCard();bumpStreak();
}
function startQuizAll(){
  if(!decks.length){showToast('❌ Create a deck first!');showView('create');return;}
  const all=decks.flatMap(d=>d.cards);if(!all.length){showToast('❌ No cards!');return;}
  currentDeck={name:'Quick Quiz ⚡',id:'all'};studyMode='quiz';studyCards=shuffleArr(all).slice(0,20);ss={correct:0,hard:0,again:0,easy:0};studyStart=Date.now();studyIdx=0;showView('study');renderStudyCard();bumpStreak();
}
function startTimedQuiz(){
  if(!decks.length){showToast('❌ Create a deck first!');showView('create');return;}
  const all=decks.flatMap(d=>d.cards);if(!all.length){showToast('❌ No cards!');return;}
  currentDeck={name:'Timed Quiz ⏱️',id:'all'};studyMode='timed';studyCards=shuffleArr(all).slice(0,10);ss={correct:0,hard:0,again:0,easy:0};studyStart=Date.now();studyIdx=0;showView('study');renderTimed();bumpStreak();
}
function startMatchAll(){
  if(!decks.length){showToast('❌ Create a deck first!');showView('create');return;}
  const all=decks.flatMap(d=>d.cards);if(!all.length){showToast('❌ No cards!');return;}
  currentDeck={name:'Match Game 🎮',id:'all'};studyMode='match';studyCards=shuffleArr(all).slice(0,8);showView('study');renderMatch();
}

function renderStudyCard(){
  if(timedTimer){clearInterval(timedTimer);timedTimer=null;}
  const cont=document.getElementById('studyContent');
  if(studyIdx>=studyCards.length){renderSessionEnd();return;}
  const card=studyCards[studyIdx];const pct=Math.round(studyIdx/studyCards.length*100);
  if(studyMode==='quiz'){renderQuizCard(card,cont,pct);return;}
  if(studyMode==='type'){renderTypeCard(card,cont,pct);return;}
  flipped=false;
  cont.innerHTML=`
    <div class="study-hd">
      <button class="btn btn-ghost btn-xs" onclick="showView('decks')">← Back</button>
      <div class="study-prog-wrap">
        <div class="prog-labels"><span>${escH(currentDeck.name)}</span><span>${studyIdx+1}/${studyCards.length}</span></div>
        <div class="study-bar"><div class="study-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-icon btn-ghost" onclick="voiceRead()" title="Voice (V)">🔊</button>
        <button class="btn btn-icon btn-ghost" onclick="toggleShortcuts()" title="Shortcuts (?)">⌨️</button>
      </div>
    </div>
    ${renderPomoHTML()}
    <div class="flashcard-3d" id="fc3d" onclick="flipCard()">
      <div class="fc-inner" id="fcInner">
        <div class="fc-face fc-front">
          <div class="fc-label">📖 Question — tap to reveal</div>
          <div class="fc-text" id="fcQ">${escH(card.q)}</div>
          <div id="hintArea"></div>
          <div class="fc-click-hint">👆 Click · Space · or swipe left/right after flip</div>
        </div>
        <div class="fc-face fc-back">
          <div class="fc-label">💡 Answer</div>
          <div class="fc-text" id="fcA">${escH(card.a)}</div>
          ${card.tip&&settings.Tips?`<div class="fc-tip">🧠 ${escH(card.tip)}</div>`:''}
        </div>
      </div>
    </div>
    <div id="revealArea">
      <button class="reveal-btn" onclick="flipCard()">⚡ Reveal Answer <span style="opacity:.5;font-size:.72rem">[Space]</span></button>
      <button class="hint-btn" onclick="showHint()" id="hintBtn">💡 AI Hint <span style="opacity:.5;font-size:.65rem">[H]</span></button>
    </div>
    <div id="ratingArea" style="display:none">
      <p style="color:var(--muted);font-size:.82rem;margin-bottom:14px">How well did you know this?</p>
      <div class="rating-row">
        <button class="rate-btn r-again" onclick="rateCard(0)">😵 Again <span style="opacity:.5;font-size:.68rem">[1]</span></button>
        <button class="rate-btn r-hard" onclick="rateCard(1)">😓 Hard <span style="opacity:.5;font-size:.68rem">[2]</span></button>
        <button class="rate-btn r-good" onclick="rateCard(2)">😊 Good <span style="opacity:.5;font-size:.68rem">[3]</span></button>
        <button class="rate-btn r-easy" onclick="rateCard(3)">🚀 Easy <span style="opacity:.5;font-size:.68rem">[4]</span></button>
      </div>
      <button class="ai-explain-btn" onclick="aiExplain()">🤖 AI Explain <span style="opacity:.5;font-size:.65rem">[E]</span></button>
      <div id="explainArea" style="display:none"></div>
    </div>
    <div style="text-align:center;color:var(--muted2);font-size:.74rem;margin-top:10px">✅ ${ss.correct} correct · 😵 ${ss.again} again · 🔥 ${getStreak()} day streak</div>`;
  if(settings.Voice)voiceRead();
  initPomoEvents();setupTouch();
}

async function showHint(){
  if(!AI_READY){showToast('⏳ AI loading…');return;}
  const card=studyCards[studyIdx];if(!card)return;
  const btn=document.getElementById('hintBtn');if(btn){btn.disabled=true;btn.textContent='⏳ Loading…';}
  try{
    const hint=hintCache[card.q]||(hintCache[card.q]=await callAI(`Give a brief clever hint for this flashcard question WITHOUT giving away the answer. 1 sentence max. Q: "${card.q}"`));
    const area=document.getElementById('hintArea');if(area)area.innerHTML=`<div class="fc-hint">💡 ${escH(hint)}</div>`;
  }catch(e){showToast('❌ Hint unavailable');}
  if(btn){btn.disabled=false;btn.innerHTML='💡 AI Hint <span style="opacity:.5;font-size:.65rem">[H]</span>';}
}

function flipCard(){
  if(flipped)return;flipped=true;
  document.getElementById('fcInner')?.classList.add('flipped');
  document.getElementById('revealArea').style.display='none';
  setTimeout(()=>document.getElementById('ratingArea').style.display='',420);
  playSound('flip');
}

function rateCard(ease){
  const card=studyCards[studyIdx];
  card.ease=ease;card.reps=(card.reps||0)+1;
  let iv=card.interval||1;
  if(ease===0){iv=1;card.reps=0;}else if(ease===1){iv=Math.max(1,Math.round(iv*1.2));}else if(ease===2){iv=Math.round(iv*2.5);}else if(ease===3){iv=Math.round(iv*4);}
  card.interval=Math.min(iv,365);card.due=Date.now()+card.interval*24*3600*1000;
  if(ease>=2){ss.correct++;todaySt.correct++;}if(ease===0)ss.again++;if(ease===1)ss.hard++;if(ease===3)ss.easy++;
  todaySt.cards++;accData[['again','hard','correct','easy'][ease]]++;
  const cid=card.id||card.q.slice(0,20);
  if(!cardAttempts[cid])cardAttempts[cid]={q:card.q,a:card.a,attempts:0,misses:0};
  cardAttempts[cid].attempts++;if(ease===0)cardAttempts[cid].misses++;
  localStorage.setItem('apex_at_'+(currentUser?.email||''),String(allTimeCards()+1));
  // Save SM-2 data to the actual deck card (works for ALL study modes)
  const deckCard=decks.flatMap(d=>d.cards).find(c=>c.id===card.id||(c.q===card.q&&c.a===card.a));
  if(deckCard)Object.assign(deckCard,{ease:card.ease,reps:card.reps,due:card.due,interval:card.interval});
  const xpMap=[1,3,5,8];totalXP+=xpMap[ease];
  save();bumpStreak();checkAchs();studyIdx++;renderStudyCard();
}

// ── QUIZ MODE ──
function renderQuizCard(card,cont,pct){
  const others=studyCards.filter((_,i)=>i!==studyIdx).map(c=>c.a);
  const opts=shuffleArr([card.a,...shuffleArr(others).slice(0,3)]);
  cont.innerHTML=`
    <div class="study-hd">
      <button class="btn btn-ghost btn-xs" onclick="showView('decks')">← Back</button>
      <div class="study-prog-wrap"><div class="prog-labels"><span>⚡ Quiz</span><span>${studyIdx+1}/${studyCards.length}</span></div><div class="study-bar"><div class="study-bar-fill" style="width:${pct}%"></div></div></div>
      <div style="color:var(--green);font-size:.8rem;font-weight:700">✅ ${ss.correct}</div>
    </div>
    <div style="background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--r2);padding:30px;max-width:700px;margin:0 auto 24px;box-shadow:var(--glow)">
      <div class="fc-label" style="text-align:left">❓ Q ${studyIdx+1}</div>
      <div style="font-size:1.15rem;font-weight:700;line-height:1.6;margin-top:10px">${escH(card.q)}</div>
    </div>
    <div style="max-width:700px;margin:0 auto" id="quizOpts">
      ${opts.map((o,i)=>`<button class="quiz-opt" onclick="selectQuiz(this,'${escA(o)}','${escA(card.a)}')"><div class="ql">${String.fromCharCode(65+i)}</div>${escH(o)}</button>`).join('')}
    </div>
    <div id="quizFB" style="display:none;text-align:center;margin-top:18px"></div>`;
}
function selectQuiz(btn,chosen,correct){
  document.querySelectorAll('#quizOpts .quiz-opt').forEach(b=>b.disabled=true);
  const ok=chosen===correct;
  btn.classList.add(ok?'correct':'wrong');
  document.querySelectorAll('#quizOpts .quiz-opt').forEach(b=>{if(b.textContent.trim().slice(1).trim()===correct)b.classList.add('correct');});
  if(ok){ss.correct++;todaySt.correct++;totalXP+=6;}else ss.again++;
  todaySt.cards++;accData[ok?'correct':'again']++;
  localStorage.setItem('apex_at_'+(currentUser?.email||''),String(allTimeCards()+1));
  const fb=document.getElementById('quizFB');fb.style.display='';
  fb.innerHTML=ok?`<div style="color:var(--green);font-size:1.2rem;font-weight:900;margin-bottom:10px">🎯 Correct! +6 XP</div>`:`<div style="color:var(--red);font-size:1.2rem;font-weight:900;margin-bottom:8px">❌ Wrong!</div><div style="background:rgba(16,185,129,.08);border:1px solid var(--green);border-radius:10px;padding:12px;color:var(--green);font-size:.88rem;max-width:600px;margin:0 auto">${escH(correct)}</div>`;
  fb.innerHTML+=`<button class="btn btn-primary btn-sm" onclick="studyIdx++;renderStudyCard()" style="margin-top:14px">${studyIdx+1<studyCards.length?'Next →':'🏁 Finish'}</button>`;
  save();bumpStreak();checkAchs();
}

// ── TIMED QUIZ ──
function renderTimed(){
  if(timedTimer){clearInterval(timedTimer);timedTimer=null;}
  const cont=document.getElementById('studyContent');
  if(studyIdx>=studyCards.length){renderSessionEnd();return;}
  const card=studyCards[studyIdx];const pct=Math.round(studyIdx/studyCards.length*100);
  const others=studyCards.filter((_,i)=>i!==studyIdx).map(c=>c.a);
  const opts=shuffleArr([card.a,...shuffleArr(others).slice(0,3)]);
  const maxS=settings.timedSecs||10;timedLeft=maxS;
  cont.innerHTML=`
    <div class="study-hd">
      <button class="btn btn-ghost btn-xs" onclick="if(timedTimer)clearInterval(timedTimer);showView('decks')">← Back</button>
      <div class="study-prog-wrap"><div class="prog-labels"><span>⏱️ Timed</span><span>${studyIdx+1}/${studyCards.length}</span></div><div class="study-bar"><div class="study-bar-fill" style="width:${pct}%"></div></div></div>
      <div class="timed-num" id="timedNum">${maxS}</div>
    </div>
    <div class="timed-bar"><div class="timed-fill" id="timedFill" style="width:100%"></div></div>
    <div style="background:var(--surface);border:1.5px solid rgba(236,72,153,.35);border-radius:var(--r2);padding:30px;max-width:700px;margin:0 auto 20px;box-shadow:0 0 30px rgba(236,72,153,.2)">
      <div class="fc-label" style="text-align:left">⏱️ Quick! Q ${studyIdx+1}</div>
      <div style="font-size:1.15rem;font-weight:700;line-height:1.6;margin-top:10px">${escH(card.q)}</div>
    </div>
    <div style="max-width:700px;margin:0 auto" id="tOpts">
      ${opts.map((o,i)=>`<button class="quiz-opt" onclick="selectTimed(this,'${escA(o)}','${escA(card.a)}')"><div class="ql">${String.fromCharCode(65+i)}</div>${escH(o)}</button>`).join('')}
    </div>
    <div id="tFB" style="display:none;text-align:center;margin-top:18px"></div>`;
  timedTimer=setInterval(()=>{
    timedLeft--;
    const bar=document.getElementById('timedFill');const num=document.getElementById('timedNum');
    if(bar)bar.style.width=(timedLeft/maxS*100)+'%';
    if(num){num.textContent=timedLeft;if(timedLeft<=3)num.style.color='var(--red)';}
    if(timedLeft<=0){
      clearInterval(timedTimer);timedTimer=null;
      document.querySelectorAll('#tOpts .quiz-opt').forEach(b=>b.disabled=true);
      ss.again++;todaySt.cards++;
      const fb=document.getElementById('tFB');fb.style.display='';
      fb.innerHTML=`<div style="color:var(--red);font-size:1.1rem;font-weight:900;margin-bottom:8px">⏰ Time's up!</div><div style="background:rgba(16,185,129,.08);border:1px solid var(--green);border-radius:10px;padding:12px;color:var(--green);font-size:.88rem;max-width:600px;margin:0 auto">${escH(card.a)}</div>`;
      fb.innerHTML+=`<button class="btn btn-primary btn-sm" onclick="studyIdx++;renderTimed()" style="margin-top:14px">${studyIdx+1<studyCards.length?'Next →':'🏁 Finish'}</button>`;
    }
  },1000);
}
function selectTimed(btn,chosen,correct){
  if(timedTimer){clearInterval(timedTimer);timedTimer=null;}
  document.querySelectorAll('#tOpts .quiz-opt').forEach(b=>b.disabled=true);
  const ok=chosen===correct;btn.classList.add(ok?'correct':'wrong');
  document.querySelectorAll('#tOpts .quiz-opt').forEach(b=>{if(b.textContent.trim().slice(1).trim()===correct)b.classList.add('correct');});
  const bonus=ok?Math.max(1,timedLeft):0;
  if(ok){ss.correct++;todaySt.correct++;totalXP+=6+bonus;}else ss.again++;
  todaySt.cards++;accData[ok?'correct':'again']++;
  localStorage.setItem('apex_at_'+(currentUser?.email||''),String(allTimeCards()+1));
  localStorage.setItem('apex_timed_'+(currentUser?.email||''),'1');
  const fb=document.getElementById('tFB');fb.style.display='';
  fb.innerHTML=ok?`<div style="color:var(--green);font-size:1.2rem;font-weight:900;margin-bottom:10px">⚡ +${6+bonus} XP (speed bonus!)</div>`:`<div style="color:var(--red);font-size:1.2rem;font-weight:900;margin-bottom:8px">❌ Wrong! Correct: ${escH(correct)}</div>`;
  fb.innerHTML+=`<button class="btn btn-primary btn-sm" onclick="studyIdx++;renderTimed()" style="margin-top:14px">${studyIdx+1<studyCards.length?'Next →':'🏁 Finish'}</button>`;
  save();bumpStreak();checkAchs();
}

// ── TYPE ANSWER ──
function renderTypeCard(card,cont,pct){
  flipped=false;
  cont.innerHTML=`
    <div class="study-hd">
      <button class="btn btn-ghost btn-xs" onclick="showView('decks')">← Back</button>
      <div class="study-prog-wrap"><div class="prog-labels"><span>✏️ Type Answer</span><span>${studyIdx+1}/${studyCards.length}</span></div><div class="study-bar"><div class="study-bar-fill" style="width:${pct}%"></div></div></div>
    </div>
    <div class="flashcard-3d" style="cursor:default"><div class="fc-inner"><div class="fc-face fc-front" style="cursor:default">
      <div class="fc-label">✏️ Type the answer</div>
      <div class="fc-text">${escH(card.q)}</div>
    </div></div></div>
    <div class="type-wrap"><input type="text" id="typeIn" placeholder="Type your answer here..." onkeydown="if(event.key==='Enter')checkType()"/></div>
    <div style="text-align:center;margin-top:12px;display:flex;gap:10px;justify-content:center">
      <button class="btn btn-primary btn-sm" onclick="checkType()">✅ Check</button>
      <button class="btn btn-ghost btn-xs" onclick="studyIdx++;renderStudyCard()">Skip →</button>
    </div>
    <div id="typeFB" style="display:none;margin-top:16px;max-width:600px;margin-left:auto;margin-right:auto"></div>`;
  setTimeout(()=>document.getElementById('typeIn')?.focus(),100);
}
function checkType(){
  const card=studyCards[studyIdx];const inp=document.getElementById('typeIn');const typed=inp?.value.trim().toLowerCase();const correct=card.a.toLowerCase();
  if(!typed){showToast('❌ Type an answer!');return;}
  const sim=calcSim(typed,correct);const ok=sim>=0.6;
  inp?.classList.add(ok?'ok':'no');inp.disabled=true;
  const fb=document.getElementById('typeFB');fb.style.display='';
  if(ok){ss.correct++;todaySt.correct++;totalXP+=5;fb.innerHTML=`<div style="color:var(--green);text-align:center;font-weight:900;font-size:1.1rem">✅ ${sim>=0.95?'Perfect!':'Close enough!'} +5 XP</div>`;}
  else{ss.again++;fb.innerHTML=`<div style="color:var(--red);text-align:center;font-weight:700;margin-bottom:8px">❌ Not quite</div><div style="background:var(--surface2);border:1px solid var(--green);border-radius:10px;padding:14px;font-size:.88rem;text-align:left"><span style="color:var(--muted)">Correct: </span><strong>${escH(card.a)}</strong></div>`;}
  todaySt.cards++;accData[ok?'correct':'again']++;
  localStorage.setItem('apex_at_'+(currentUser?.email||''),String(allTimeCards()+1));
  fb.innerHTML+=`<div style="text-align:center;margin-top:12px"><button class="btn btn-primary btn-sm" onclick="studyIdx++;renderStudyCard()">${studyIdx+1<studyCards.length?'Next →':'🏁 Finish'}</button></div>`;
  save();bumpStreak();checkAchs();
}
function calcSim(a,b){if(a===b)return 1;if(b.includes(a)&&a.length>3)return 0.8;const wa=new Set(a.split(/\s+/)),wb=new Set(b.split(/\s+/));const inter=[...wa].filter(w=>wb.has(w)).length;return inter/Math.max(wa.size,wb.size);}

// ── MATCH GAME ──
function renderMatch(){
  matchPairs=studyCards.slice(0,8);matchSel=null;
  const qs=shuffleArr(matchPairs.map(c=>({id:c.id||c.q.slice(0,20),text:c.q,t:'q'})));
  const as=shuffleArr(matchPairs.map(c=>({id:c.id||c.q.slice(0,20),text:c.a,t:'a'})));
  const items=shuffleArr([...qs,...as]);
  document.getElementById('studyContent').innerHTML=`
    <div class="study-hd">
      <button class="btn btn-ghost btn-xs" onclick="showView('decks')">← Back</button>
      <div class="study-prog-wrap"><div class="prog-labels"><span>🎮 Match Game</span><span id="matchProg">0/${matchPairs.length} matched</span></div><div class="study-bar"><div class="study-bar-fill" id="matchBar" style="width:0%"></div></div></div>
    </div>
    <p style="text-align:center;color:var(--muted);font-size:.85rem;margin-bottom:22px">Select a card, then click its match. Questions are solid borders, answers are dashed.</p>
    <div class="match-grid" id="matchGrid">
      ${items.map(item=>`<div class="match-card${item.t==='a'?'" style="border-style:dashed':''}" data-id="${escA(item.id)}" data-t="${item.t}" onclick="selectMatch(this)">${escH(item.text)}</div>`).join('')}
    </div>`;
}
function selectMatch(el){
  if(el.classList.contains('matched'))return;
  if(!matchSel){matchSel=el;el.classList.add('sel');return;}
  if(matchSel===el){matchSel=null;el.classList.remove('sel');return;}
  const id1=matchSel.dataset.id,t1=matchSel.dataset.t,id2=el.dataset.id,t2=el.dataset.t;
  if(t1===t2){matchSel.classList.remove('sel');matchSel=el;el.classList.add('sel');return;}
  if(id1===id2){
    matchSel.classList.remove('sel');matchSel.classList.add('matched');el.classList.add('matched');
    playSound('correct');totalXP+=5;
    const done=document.querySelectorAll('.match-card.matched').length/2;
    const total=document.querySelectorAll('.match-card').length/2;
    document.getElementById('matchProg').textContent=done+'/'+total+' matched';
    document.getElementById('matchBar').style.width=(done/total*100)+'%';
    matchSel=null;
    if(done===total){checkAchs();setTimeout(()=>{launchConfetti();document.getElementById('studyContent').innerHTML=`<div class="session-end"><div class="big">🎮</div><h2>Match Complete!</h2><p style="color:var(--muted);margin:10px 0 20px">All ${total} pairs matched! +${total*5} XP</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="renderMatch()">🔄 Play Again</button><button class="btn btn-secondary btn-sm" onclick="showView('decks')">📚 My Decks</button></div></div>`;save();},400);}
  }else{el.classList.add('bad');matchSel.classList.add('bad');playSound('wrong');setTimeout(()=>{el.classList.remove('bad','sel');matchSel.classList.remove('bad','sel');matchSel=null;},700);}
}

// ── SESSION END ──
function renderSessionEnd(){
  const elapsed=Math.round((Date.now()-studyStart)/1000);
  const total=ss.correct+ss.hard+ss.again+ss.easy;
  const acc=total>0?Math.round(ss.correct/total*100):0;lastAcc=acc;
  const emoji=acc>=90?'🏆':acc>=70?'🎉':acc>=50?'👍':'💪';
  const msg=acc>=90?'Absolutely crushing it!':acc>=70?'Great work!':acc>=50?'Good effort!':'Every rep makes you stronger!';
  let bonusXP=0;if(acc===100&&total>0)bonusXP=50;
  if(bonusXP>0)totalXP+=bonusXP;save();checkAchs();updateXPUI();
  if(acc>=90)launchConfetti();
  document.getElementById('studyContent').innerHTML=`
    <div class="session-end">
      <div class="big">${emoji}</div>
      <h2>${msg}</h2>
      <p style="color:var(--muted);margin-bottom:20px">${escH(currentDeck.name)}</p>
      ${bonusXP>0?`<div style="color:var(--yellow);font-weight:900;margin-bottom:16px;font-size:1.1rem">🌟 PERFECT SCORE! +${bonusXP} Bonus XP!</div>`:''}
      <div class="score-grid">
        <div class="score-box"><div class="v" style="color:var(--green)">${acc}%</div><div class="l">Accuracy</div></div>
        <div class="score-box"><div class="v">${total}</div><div class="l">Cards</div></div>
        <div class="score-box"><div class="v" style="color:var(--green)">${ss.correct}</div><div class="l">Correct</div></div>
        <div class="score-box"><div class="v">${elapsed<60?elapsed+'s':Math.round(elapsed/60)+'m'}</div><div class="l">Time</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="startStudy('${currentDeck.id}','${studyMode}')">🔁 Study Again</button>
        <button class="btn btn-cyan btn-sm" onclick="startStudy('${currentDeck.id}','quiz')">⚡ Quiz</button>
        <button class="btn btn-secondary btn-sm" onclick="startTimedQuiz()">⏱️ Timed</button>
        <button class="btn btn-secondary btn-sm" onclick="showView('decks')">📚 Decks</button>
        <button class="btn btn-secondary btn-sm" onclick="showView('aiTutor')">🤖 AI Tutor</button>
      </div>
    </div>`;
}

async function aiExplain(){
  const card=studyCards[studyIdx];const btn=document.querySelector('.ai-explain-btn');const area=document.getElementById('explainArea');
  if(!btn||!area||!card)return;
  btn.disabled=true;btn.textContent='🤖 Thinking…';area.style.display='';area.innerHTML='<div class="spinner"></div>';
  try{
    const msgs=[{role:'system',content:'You are an expert tutor. Use **bold** for key terms. Be concise and memorable.'},{role:'user',content:`Explain this flashcard deeply:\nQ: ${card.q}\nA: ${card.a}\n\nGive: 1) Clear explanation with vivid analogy 2) Why it matters 3) One clever memory trick for this concept`}];
    const r=await fetch(_epURL(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:_epModel(),messages:msgs,max_tokens:600})});
    if(!r.ok)throw new Error('AI error');const d=await r.json();const t=d.choices?.[0]?.message?.content?.trim()||'';
    area.innerHTML=`<div class="explain-panel">${fmtMsg(t)}</div>`;
  }catch(e){area.innerHTML=`<div class="explain-panel" style="color:var(--red)">❌ ${escH(e.message)}</div>`;}
  btn.disabled=false;btn.innerHTML='🤖 AI Explain <span style="opacity:.5;font-size:.65rem">[E]</span>';
}

// ── AI CHAT ──
function initChat(){
  chatHistory=[{role:'system',content:getChatPrompt()}];
  const el=document.getElementById('chatMsgs');if(!el)return;el.innerHTML='';
  const intros={
    tutor:`Hey **${currentUser?.first||'there'}**! 👋 I'm your **Apex AI Tutor** — powered by Pollinations AI (DeepSeek V3.2). I can explain any subject, quiz you, create mnemonics, build study plans, anything! What are we mastering today? 🧠`,
    socratic:`Hello, ${currentUser?.first||'Student'}! 🤔 Socratic mode — I won't hand you answers, I'll ask powerful questions to help you **discover** them yourself. What shall we explore?`,
    simple:`Hi **${currentUser?.first||'there'}**! 😊 Simple mode activated — I'll explain everything like you're 10! No jargon, just clear understanding. What do you want to learn?`,
    exam:`Ready to **ace your exams**, ${currentUser?.first||'Student'}! 📝 Exam Prep mode — every response is designed to maximize your marks. Tell me your subject and I'll give you exactly what you need!`,
    debate:`Greetings, ${currentUser?.first||'Student'}. ⚔️ Devil's Advocate mode — prepare to **defend** everything you think you know!`,
    coach:`Hey ${currentUser?.first||'there'}! 🏅 Study Coach mode — let's build killer habits and crush your goals. What are you working towards?`
  };
  addMsg('ai',intros[chatPersona]||intros.tutor);
}
function clearChat(){initChat();showToast('🗑️ Chat cleared');}
function switchPersona(){chatPersona=document.getElementById('tutorMode')?.value||'tutor';chatHistory=[{role:'system',content:getChatPrompt()}];initChat();showToast('🎭 Mode switched!');}
function getChatPrompt(){
  const f=currentUser?.first||'Student';const g=currentUser?.goal||'learning';
  const p={tutor:`You are Apex AI ULTRA — an elite tutor powered by Pollinations AI. Brilliant, encouraging, knowledgeable across ALL subjects. Use analogies, examples, step-by-step breakdowns. Bold key terms with **. Student: ${f}, Goal: ${g}`,socratic:`You are Apex AI in Socratic mode. NEVER give direct answers. Ask powerful guiding questions. Challenge every assumption. For ${f}.`,simple:`Explain everything simply for ${f}. Short sentences, fun analogies, emojis, zero jargon.`,exam:`Exam Prep mode for ${f}. Every response laser-focused on exam success. Include key terms, common traps, mark-scoring formats. Goal: ${g}`,debate:`Devil's Advocate mode. Challenge everything ${f} says. Force them to defend their understanding.`,coach:`Study Coach for ${f}. Focus on motivation, habits, and strategies. Goal: ${g}`};
  return p[chatPersona]||p.tutor;
}

function addMsg(role,text,streaming=false){
  const el=document.getElementById('chatMsgs');if(!el)return null;
  const time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const div=document.createElement('div');div.className='msg '+role;
  const bub=document.createElement('div');bub.className='msg-bub'+(streaming?' stream-cur':'');
  bub.innerHTML=fmtMsg(text);
  const te=document.createElement('div');te.className='msg-time';te.textContent=(role==='ai'?'🤖 AI · ':'You · ')+time;
  div.appendChild(bub);div.appendChild(te);el.appendChild(div);el.scrollTop=el.scrollHeight;return{div,bub};
}
function fmtMsg(t){
  return t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre style="background:var(--surface3);padding:12px 16px;border-radius:10px;font-family:monospace;font-size:.83em;overflow-x:auto;margin:8px 0;text-align:left"><code>$2</code></pre>')
    .replace(/`(.*?)`/g,'<code style="background:var(--surface3);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:.88em">$1</code>')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm,'<strong style="font-size:1.05em;display:block;margin-top:10px">$1</strong>')
    .replace(/^[•\-]\s+(.+)$/gm,'<span style="display:block;padding-left:12px;margin-top:3px">• $1</span>')
    .replace(/^\d+\.\s+(.+)$/gm,'<span style="display:block;padding-left:12px;margin-top:3px">$&</span>')
    .replace(/\n\n/g,'<br/><br/>').replace(/\n/g,'<br/>');
}
function showTyping(){const el=document.getElementById('chatMsgs');if(!el)return;const d=document.createElement('div');d.className='msg ai';d.id='typing';d.innerHTML='<div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div>';el.appendChild(d);el.scrollTop=el.scrollHeight;}
function hideTyping(){document.getElementById('typing')?.remove();}

async function sendChat(){
  const input=document.getElementById('chatInput');const text=input.value.trim();if(!text)return;
  input.value='';addMsg('user',text);chatHistory.push({role:'user',content:text});
  showTyping();
  try{
    hideTyping();const ref=addMsg('ai','',true);let full='';
    const messages=[{role:'system',content:getChatPrompt()},...chatHistory.filter(m=>m.role!=='system').slice(-12)];
    await callAIStream(messages,(chunk)=>{full+=chunk;if(ref){ref.bub.innerHTML=fmtMsg(full);}document.getElementById('chatMsgs')?.scrollTo({top:9999,behavior:'smooth'});});
    if(ref)ref.bub.classList.remove('stream-cur');
    chatHistory.push({role:'assistant',content:full});totalXP+=2;save();checkAchs();
  }catch(e){hideTyping();addMsg('ai','❌ AI error: '+e.message);}
}
function chipMsg(t){document.getElementById('chatInput').value=t;sendChat();}

// ── POMODORO ──
let pomoSecs=25*60,pomoMode='work',pomoPaused=true,pomoTimer=null;
function renderPomoHTML(){return`<div class="pomo-wrap" id="pomoWrap"><div><div class="pomo-time ${pomoMode}" id="pomoTime">${fmtPomo(pomoSecs)}</div><div class="pomo-lbl" id="pomoLbl">${pomoMode==='work'?'🎯 Focus Session':'☕ Short Break'}</div></div><div style="display:flex;gap:8px;margin-left:auto"><button class="btn btn-ghost btn-xs" onclick="togglePomo()" id="pomoBtn">${pomoPaused?'▶ Start':'⏸ Pause'}</button><button class="btn btn-ghost btn-xs" onclick="resetPomo()">↺</button></div></div>`;}
function initPomoEvents(){if(pomoTimer)clearInterval(pomoTimer);}
function togglePomo(){pomoPaused=!pomoPaused;const btn=document.getElementById('pomoBtn');if(btn)btn.textContent=pomoPaused?'▶ Start':'⏸ Pause';if(!pomoPaused){pomoTimer=setInterval(()=>{if(pomoPaused)return;pomoSecs--;const el=document.getElementById('pomoTime');if(el)el.textContent=fmtPomo(pomoSecs);if(pomoSecs<=0){if(pomoMode==='work'){pomoMode='break';pomoSecs=5*60;showToast('🎉 Break time!');}else{pomoMode='work';pomoSecs=25*60;showToast('⚡ Back to work!');}pomoPaused=true;clearInterval(pomoTimer);}},1000);}else clearInterval(pomoTimer);}
function resetPomo(){clearInterval(pomoTimer);pomoSecs=25*60;pomoMode='work';pomoPaused=true;const el=document.getElementById('pomoTime');if(el)el.textContent=fmtPomo(pomoSecs);}
function fmtPomo(s){return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}

// ── ANALYTICS ──
function renderAnalytics(){renderWeekly();renderAcc();renderWeak();renderAchs();updateXPUI();}
function renderWeekly(){
  const c=document.getElementById('weeklyChart');if(!c)return;const ctx=c.getContext('2d');
  const W=c.width=c.offsetWidth||300,H=c.height=165;ctx.clearRect(0,0,W,H);
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const today=new Date().getDay();
  const labels=Array.from({length:7},(_,i)=>days[(today-6+i+7)%7]);
  const data=[...weeklyData.slice(0,6).reverse(),todaySt.cards];const max=Math.max(...data,1);
  const pad=30,bW=Math.floor((W-pad*2)/7*0.6),gap=Math.floor((W-pad*2)/7);
  ctx.strokeStyle='rgba(124,58,237,.15)';for(let g=0;g<=4;g++){const y=H-pad-(g/4)*(H-pad*1.5);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke();}
  data.forEach((v,i)=>{
    const x=pad+i*gap+(gap-bW)/2;const bH=(v/max)*(H-pad*1.5);const y=H-pad-bH;
    const grad=ctx.createLinearGradient(0,y,0,H-pad);grad.addColorStop(0,i===6?'rgba(168,85,247,.9)':'rgba(124,58,237,.6)');grad.addColorStop(1,'rgba(6,182,212,.25)');
    ctx.fillStyle=grad;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,bW,bH,4);else ctx.rect(x,y,bW,bH);ctx.fill();
    ctx.fillStyle='rgba(148,163,184,.65)';ctx.font=i===6?'bold 10px sans-serif':'10px sans-serif';ctx.textAlign='center';ctx.fillText(labels[i],x+bW/2,H-8);
    if(v>0){ctx.fillStyle='rgba(241,245,249,.9)';ctx.fillText(v,x+bW/2,y-4);}
  });
}
function renderAcc(){
  const c=document.getElementById('accChart');if(!c)return;const ctx=c.getContext('2d');
  const W=c.width=c.offsetWidth||300,H=c.height=165;ctx.clearRect(0,0,W,H);
  const data=[accData.correct,accData.hard,accData.again,accData.easy];
  const labels=['Correct','Hard','Again','Easy'];const colors=['rgba(16,185,129,.8)','rgba(245,158,11,.8)','rgba(239,68,68,.8)','rgba(6,182,212,.8)'];
  const total=data.reduce((a,b)=>a+b,0)||1;const cx=W/2-30,cy=H/2,r=Math.min(cx,cy)-15;
  let start=0;data.forEach((v,i)=>{const ang=v/total*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,start+ang);ctx.closePath();ctx.fillStyle=colors[i];ctx.fill();start+=ang;});
  ctx.beginPath();ctx.arc(cx,cy,r*0.52,0,Math.PI*2);ctx.fillStyle='var(--surface)';ctx.fill();
  const pct=total>0?Math.round(accData.correct/total*100):0;ctx.fillStyle='rgba(241,245,249,.9)';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(pct+'%',cx,cy+5);
  ctx.font='10px sans-serif';ctx.fillStyle='rgba(148,163,184,.65)';ctx.fillText('Correct',cx,cy+18);
  labels.forEach((l,i)=>{const lx=W-85,ly=20+i*28;ctx.fillStyle=colors[i];ctx.beginPath();if(ctx.roundRect)ctx.roundRect(lx,ly,12,12,3);else ctx.rect(lx,ly,12,12);ctx.fill();ctx.fillStyle='rgba(241,245,249,.8)';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText(l+' ('+data[i]+')',lx+16,ly+10);});
}
function renderWeak(){
  const el=document.getElementById('weakList');if(!el)return;
  const weak=Object.values(cardAttempts).filter(c=>c.attempts>0&&c.misses/c.attempts>0.3).sort((a,b)=>b.misses/b.attempts-a.misses/a.attempts).slice(0,5);
  document.getElementById('weakCount').textContent=weak.length+' cards';
  if(!weak.length){el.innerHTML='<p style="color:var(--muted);font-size:.85rem">🎉 No major weak spots yet — keep studying!</p>';return;}
  el.innerHTML=weak.map(c=>`<div class="weak-item"><div class="wq">${escH(c.q.slice(0,80))}</div><div class="wp">❌ Missed ${c.misses}/${c.attempts} times (${Math.round(c.misses/c.attempts*100)}% miss rate)</div></div>`).join('');
}

// ── ACHIEVEMENTS ──
const ACHS=[
  {id:'first_deck',icon:'📚',name:'Deck Creator',desc:'Create your first deck',check:()=>decks.length>=1},
  {id:'first_card',icon:'🎓',name:'Scholar Begins',desc:'Study your first card',check:()=>allTimeCards()>=1},
  {id:'ten_today',icon:'⚡',name:'On Fire',desc:'Study 10 cards in a day',check:()=>todaySt.cards>=10},
  {id:'fifty_cards',icon:'🚀',name:'Flashcard Warrior',desc:'Study 50 cards total',check:()=>allTimeCards()>=50},
  {id:'perfect',icon:'💎',name:'Perfectionist',desc:'100% accuracy in a session',check:()=>lastAcc===100},
  {id:'streak3',icon:'🔥',name:'On a Roll',desc:'3 day streak',check:()=>getStreak()>=3},
  {id:'streak7',icon:'🏅',name:'Week Warrior',desc:'7 day streak',check:()=>getStreak()>=7},
  {id:'five_decks',icon:'🗂️',name:'Deck Master',desc:'Create 5 decks',check:()=>decks.length>=5},
  {id:'ai_chat',icon:'🤖',name:'AI Apprentice',desc:'Send 10 messages to AI tutor',check:()=>chatHistory.filter(m=>m.role==='user').length>=10},
  {id:'level5',icon:'🌟',name:'Level 5 Scholar',desc:'Reach Level 5',check:()=>getLevel(totalXP)>=5},
  {id:'xp500',icon:'💰',name:'XP Hoarder',desc:'Earn 500 XP',check:()=>totalXP>=500},
  {id:'timed',icon:'⏱️',name:'Speed Demon',desc:'Complete a timed quiz',check:()=>!!localStorage.getItem('apex_timed_'+(currentUser?.email||''))},
  {id:'daily',icon:'📅',name:'Daily Grinder',desc:'Complete a daily challenge',check:()=>!!localStorage.getItem('apex_dc_'+new Date().toDateString()+'_'+(currentUser?.email||''))},
  {id:'import',icon:'📥',name:'Importer',desc:'Import a CSV deck',check:()=>!!localStorage.getItem('apex_imported_'+(currentUser?.email||''))},
  {id:'night',icon:'🦉',name:'Night Owl',desc:'Study after midnight',check:()=>new Date().getHours()<4},
];
function checkAchs(){let nu=[];ACHS.forEach(a=>{if(!earnedAchs.has(a.id)&&a.check()){earnedAchs.add(a.id);nu.push(a);}});if(nu.length){save();nu.forEach((a,i)=>setTimeout(()=>showBadge(a),i*1600));updateDashboard();}}
function showBadge(a){const el=document.getElementById('badgeToast');if(!el)return;document.getElementById('bpIcon').textContent=a.icon;document.getElementById('bpTitle').textContent=a.name;document.getElementById('bpDesc').textContent=a.desc;el.style.display='block';setTimeout(()=>el.style.display='none',4000);}
function renderAchs(){const el=document.getElementById('achGrid');if(!el)return;el.innerHTML=ACHS.map(a=>`<div class="ach-card${earnedAchs.has(a.id)?' earned':''}"><div class="ach-icon">${a.icon}</div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>`).join('');document.getElementById('statAchs').textContent=earnedAchs.size;}

// ── VOICE / SOUND / FX ──
function voiceRead(){if(!window.speechSynthesis)return;const card=studyCards?.[studyIdx];if(!card)return;window.speechSynthesis.cancel();const utt=new SpeechSynthesisUtterance(flipped?card.a:card.q);utt.rate=0.95;utt.pitch=1.05;window.speechSynthesis.speak(utt);}

function openTipJar(){ document.getElementById('tipJarOverlay').classList.remove('hidden'); }
function closeTipJar(){ document.getElementById('tipJarOverlay').classList.add('hidden'); }

function playSound(type){if(!settings.Sound)return;try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);if(type==='correct'){o.frequency.value=523;g.gain.value=0.07;}else if(type==='wrong'){o.frequency.value=200;g.gain.value=0.09;}else{o.frequency.value=440;g.gain.value=0.04;}o.start();g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.3);o.stop(ctx.currentTime+0.3);}catch{}}
function launchConfetti(){const colors=['#a855f7','#06b6d4','#10b981','#f59e0b','#ec4899','#f97316'];for(let i=0;i<80;i++){const el=document.createElement('div');el.className='confetti-p';el.style.cssText=`left:${Math.random()*100}vw;background:${colors[i%colors.length]};width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;border-radius:${Math.random()>.5?'50%':'2px'};animation:confetti ${1.5+Math.random()*2.5}s ${Math.random()}s linear forwards`;document.body.appendChild(el);setTimeout(()=>el.remove(),5000);}}
function setupTouch(){const fc=document.getElementById('fc3d');if(!fc)return;let sx=0,sy=0;fc.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});fc.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)<10&&!flipped){flipCard();return;}if(flipped&&Math.abs(dx)>60){if(dx<0)rateCard(0);else rateCard(3);}},{passive:true});}

// ── KEYBOARD ──
document.addEventListener('keydown',e=>{
  if(!currentUser)return;
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
  if(e.key==='?'){toggleShortcuts();return;}
  if(e.key==='t'||e.key==='T'){toggleTheme();return;}
  if(e.key==='Escape'){if(!document.getElementById('shortcuts').classList.contains('hidden')){toggleShortcuts();return;}if(document.getElementById('studyView')?.classList.contains('active')){showView('decks');return;}}
  if(!settings.KB)return;
  const inStudy=document.getElementById('studyView')?.classList.contains('active');if(!inStudy)return;
  if(e.key===' '){e.preventDefault();if(!flipped)flipCard();}
  if(e.key==='1'&&flipped)rateCard(0);if(e.key==='2'&&flipped)rateCard(1);if(e.key==='3'&&flipped)rateCard(2);if(e.key==='4'&&flipped)rateCard(3);
  if(e.key==='h'||e.key==='H')showHint();if(e.key==='e'||e.key==='E')aiExplain();if(e.key==='v'||e.key==='V')voiceRead();
});
function toggleShortcuts(){document.getElementById('shortcuts').classList.toggle('hidden');}

// ── SETTINGS ──
function toggleSetting(n){settings[n]=!settings[n];document.getElementById('toggle'+n).classList.toggle('on',settings[n]);save();}
function applySettings(){Object.keys(settings).forEach(k=>{const el=document.getElementById('toggle'+k);if(el)el.classList.toggle('on',!!settings[k]);});}
function editName(){const n=prompt('Your name:',currentUser.first);if(n?.trim()){currentUser.first=n.trim();document.getElementById('navAv').textContent=currentUser.first[0].toUpperCase();document.getElementById('navName').textContent=currentUser.first;document.getElementById('setName').textContent=currentUser.first+' '+(currentUser.last||'');save();showToast('✅ Name updated!');}}
function exportDecks(){let out='Apex Study AI — Deck Export\n'+'='.repeat(40)+'\n\n';decks.forEach(d=>{out+=`📚 ${d.name} (${d.subject})\n${'-'.repeat(30)}\n`;d.cards.forEach((c,i)=>{out+=`Q${i+1}: ${c.q}\nA: ${c.a}\n\n`;});out+='\n';});const b=new Blob([out],{type:'text/plain'});const a=document.createElement('a');const url=URL.createObjectURL(b);a.href=url;a.download='apex_decks.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('📥 Exported!');}

// ── UTILS ──
function showToast(msg,dur=3200){document.getElementById('toastMsg').textContent=msg;const t=document.getElementById('toast');t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),dur);}
function shuffleArr(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}
function escH(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escA(s=''){return String(s).replace(/'/g,'&#39;').replace(/"/g,'&quot;');}


// ==============================================
//  PDF EXTRACTION ENGINE — PDF.js (open source)
// ==============================================
var pdfGenCards = [];

function resetPdfTab() {
  pdfGenCards = [];
  ['pdfStatus','pdfExtractedSection','pdfGenOptions','pdfGenSection'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var da = document.getElementById('pdfDropArea'); if (da) da.style.display = '';
  var fi = document.getElementById('pdfFileInput'); if (fi) fi.value = '';
  var dn = document.getElementById('pdfDeckName'); if (dn) dn.value = '';
  var pc = document.getElementById('pdfCardPreviewList'); if (pc) pc.innerHTML = '';
}

function handlePdfDrop(e) {
  e.preventDefault();
  var da = document.getElementById('pdfDropArea'); if (da) da.classList.remove('drag-over');
  var file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('❌ Please drop a PDF file!'); return; }
  processPdfFile(file);
}

function handlePdfFile(input) {
  var file = input.files[0]; if (file) processPdfFile(file);
}

function processPdfFile(file) {
  var sEl = document.getElementById('pdfStatus');
  var sIcon = document.getElementById('pdfStatusIcon');
  var sTitle = document.getElementById('pdfStatusTitle');
  var sSub = document.getElementById('pdfStatusSub');
  var pBar = document.getElementById('pdfProgressBar');
  var pFill = document.getElementById('pdfProgressFill');
  var pPct = document.getElementById('pdfProgressPct');
  var dropArea = document.getElementById('pdfDropArea');
  var extSec = document.getElementById('pdfExtractedSection');
  var genOpt = document.getElementById('pdfGenOptions');
  var genSec = document.getElementById('pdfGenSection');

  genSec.style.display = 'none'; extSec.style.display = 'none';
  genOpt.style.display = 'none'; sEl.style.display = '';
  pBar.style.display = ''; pFill.style.width = '0%'; pPct.textContent = '';
  sIcon.textContent = '⏳'; sTitle.textContent = 'Loading PDF…';
  sSub.textContent = 'Parsing with PDF.js (open source)'; dropArea.style.display = 'none';

  if (!window.pdfjsLib) {
    sIcon.textContent = '❌'; sTitle.textContent = 'PDF.js not loaded';
    sSub.textContent = 'Check internet connection and refresh'; dropArea.style.display = '';
    return;
  }

  file.arrayBuffer().then(function(buf) {
    return pdfjsLib.getDocument({ data: buf }).promise;
  }).then(function(pdf) {
    var n = pdf.numPages; var fullText = ''; var pages = [];
    sTitle.textContent = 'Extracting from ' + n + ' page' + (n !== 1 ? 's' : '') + '…';
    for (var i = 1; i <= n; i++) pages.push(i);
    return pages.reduce(function(chain, pageNum) {
      return chain.then(function() {
        return pdf.getPage(pageNum).then(function(page) {
          return page.getTextContent().then(function(content) {
            fullText += content.items.map(function(it) { return it.str; }).join(' ') + '\n\n';
            var pct = Math.round(pageNum / n * 100);
            pFill.style.width = pct + '%'; pPct.textContent = pct + '%';
            sSub.textContent = 'Page ' + pageNum + ' of ' + n;
          });
        });
      });
    }, Promise.resolve()).then(function() { return fullText; });
  }).then(function(fullText) {
    fullText = fullText.trim().replace(/\s{3,}/g, '  ').replace(/\n{3,}/g, '\n\n');
    if (!fullText || fullText.length < 20) {
      sIcon.textContent = '⚠️'; sTitle.textContent = 'No text found in PDF';
      sSub.textContent = 'This PDF may be image/scanned. Try a text-based PDF.';
      pBar.style.display = 'none'; return;
    }
    sIcon.textContent = '✅';
    sTitle.textContent = 'Extracted ' + fullText.length.toLocaleString() + ' characters!';
    sSub.textContent = 'Ready for DeepSeek V3.2 flashcard generation'; pPct.textContent = '100%';
    extSec.style.display = '';
    document.getElementById('pdfFileName').textContent = '📄 ' + file.name;
    document.getElementById('pdfCharCount').textContent = fullText.length.toLocaleString() + ' chars';
    document.getElementById('pdfExtractedText').value = fullText;
    var dn = document.getElementById('pdfDeckName');
    if (dn && !dn.value) dn.value = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    genOpt.style.display = '';
    showToast('📄 PDF extracted! ' + fullText.length.toLocaleString() + ' chars ready');
  }).catch(function(err) {
    sIcon.textContent = '❌'; sTitle.textContent = 'Failed to read PDF';
    sSub.textContent = (err && err.message) || 'Unknown error';
    pBar.style.display = 'none'; dropArea.style.display = '';
  });
}

async function generateFromPdf() {
  var text = (document.getElementById('pdfExtractedText') || {}).value || '';
  text = text.trim();
  var cnt = (document.getElementById('pdfCount') || {}).value || '10';
  var diff = (document.getElementById('pdfDiff') || {}).value || 'intermediate';
  var styleVal = (document.getElementById('pdfStyle') || {}).value || 'standard';
  if (!text) { showToast('❌ Extract a PDF first!'); return; }
  if (!AI_READY) { showToast('⏳ AI loading — please wait'); return; }
  var sec = document.getElementById('pdfGenSection');
  var list = document.getElementById('pdfCardPreviewList');
  sec.style.display = '';
  list.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--muted);margin-top:10px">🧠 DeepSeek V3.2 generating ' + cnt + ' cards from your PDF…</p>';
  var diffMap = { beginner: 'basic, accessible', intermediate: 'intermediate, exam-level', advanced: 'university-level, complex', expert: 'doctoral-grade' };
  var styleMap = { standard: 'standard Q&A pairs', definition: 'definition-style', fill: 'fill-in-the-blank sentences', scenario: 'real-world scenario questions' };
  var truncated = text.slice(0, 6000);
  var prompt = [
    'You are an expert flashcard creator. Generate exactly ' + cnt + ' flashcards from the PDF content below.',
    'Difficulty: ' + (diffMap[diff] || 'intermediate'),
    'Style: ' + (styleMap[styleVal] || 'standard Q&A'),
    'Focus on KEY concepts, definitions, facts. Include a specific memory tip per card.',
    '',
    'PDF Content:',
    '"""',
    truncated,
    '"""',
    '',
    'Return ONLY valid JSON array (no markdown, no explanation):',
    '[{"q":"question","a":"answer","tip":"memory tip"}]'
  ].join('\n');
  try {
    var raw = await callAI(prompt);
    pdfGenCards = parseAICards(raw);
    document.getElementById('pdfCardCountBadge').textContent = pdfGenCards.length + ' cards';
    list.innerHTML = pdfGenCards.map(function(c, i) {
      return '<div class="card-preview"><div class="card-num">' + (i+1) + '</div><div class="card-qa"><div class="q">❓ ' + escH(c.q) + '</div><div class="a">💡 ' + escH(c.a) + '</div>' + (c.tip ? '<div class="tip">🧠 ' + escH(c.tip) + '</div>' : '') + '</div><button class="del-c" onclick="pdfGenCards.splice(' + i + ',1);this.closest(\'.card-preview\').remove();document.getElementById(\'pdfCardCountBadge\').textContent=pdfGenCards.length+\' cards\'">✕</button></div>';
    }).join('');
    showToast('⚡ ' + pdfGenCards.length + ' cards from PDF via DeepSeek V3.2!');
  } catch(e) {
    list.innerHTML = '<div style="color:var(--red);padding:16px;text-align:center">❌ ' + escH(e.message) + '<br/><button class="btn btn-ghost btn-xs" onclick="generateFromPdf()" style="margin-top:10px">🔄 Try Again</button></div>';
  }
}

function savePdfDeck() {
  var name = (document.getElementById('pdfDeckName') || {}).value || ''; name = name.trim();
  var subj = (document.getElementById('pdfSubject') || {}).value || 'General';
  if (!name) { showToast('❌ Enter a deck name!'); return; }
  if (!pdfGenCards.length) { showToast('❌ Generate cards from PDF first!'); return; }
  var deck = {
    id: Date.now().toString(), name: name, subject: subj,
    cards: pdfGenCards.map(function(c) {
      return Object.assign({}, c, { id: Math.random().toString(36).slice(2), ease: 0, reps: 0, interval: 1, due: Date.now() });
    }),
    created: new Date().toISOString(), source: 'pdf'
  };
  decks.push(deck); save(); checkAchs(); addXP(25, 'PDF deck created!');
  showToast('🎉 PDF deck "' + name + '" saved — ' + deck.cards.length + ' cards!');
  pdfGenCards = []; document.getElementById('pdfGenSection').style.display = 'none'; showView('decks');
}

// ── BOOT ──
// Simple hash for cache keys
function quickHash(str) {
  let h = 0;
  for(let i = 0; i < Math.min(str.length, 500); i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

window.addEventListener('DOMContentLoaded',async()=>{
  const st=localStorage.getItem('apex_theme');
  if(st==='light'){lightTheme=true;document.body.setAttribute('data-theme','light');const b=document.getElementById('themeBtn');if(b)b.textContent='☀️';}
  initAI().catch(e=>console.warn('AI init:',e));
  const last=localStorage.getItem('apex_lastUser');
  if(last){const users=JSON.parse(localStorage.getItem('apex_users')||'{}');if(users[last]){currentUser=users[last];afterLogin();return;}}
});


  if(window.location.protocol === 'file:'){
    document.addEventListener('DOMContentLoaded', function(){
      var b = document.getElementById('localFileBanner');
      if(b) b.style.display = 'block';
    });
  }
