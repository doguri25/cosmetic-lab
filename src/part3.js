<script>
// ===== 유틸 =====
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => String(Math.round((+n||0)*10)/10);
const ic = (n, cls='') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
const AI_LIMIT = 20;

const state = {
  screen:'home', cat:'skin', pickType:null,
  recipe:null,
  analysis:{tab:'text', raw:'', name:'', photoUrl:'', busy:false, photoErr:'', items:null, aiInfo:{}, aiSummary:'', makeType:null},
  saved: store.get('lab.saved', []),
  ai: store.get('lab.ai', {d:todayKey(), n:0}),
  palRole:'all', palQ:'',
  sample:null, limits:null, sampleReady:false, downloads:null, perms:null, aiState:'unknown',
  aiReport:{}, aiSimilar:{}, aiBusy:{}, ctl:{},
  skin: store.get('lab.skin',''), avoid: Object.assign({groups:[], ids:[]}, store.get('lab.avoid', {})), avoidQ:'', dictRole:'all', dictGrade:'all', dictQ:'', dictFn:'all', dictOrigin:'all',
  routine: Object.assign({am:[], pm:[]}, store.get('lab.routine', {})), routineSlot:'am', compare:{on:false, sel:[]},
  cloud:{db:null,user:null,uid:null,ref:null,ready:false,synced:false}, gallery:{items:null,busy:false,names:{}}, savedTab:'mine',
  hist:[], redo:[], _dragId:null, diyBatch:100, diyOpen:false,
  cfg: Object.assign({src:'', provider:'gemini', model:{}, remember:true, fontScale:'normal', theme:'system'}, store.get('lab.cfg', {})),
  keys:{}, showKey:false, modelList:{}, modelBusy:false, aiTest:null,
};
// ===== AI 공급자 (내장 claude.ai / 개인 API 키) =====
const PROVIDERS = {
  gemini:{ name:'제미나이', vendor:'Google', mark:'G', color:'#3F7BD9', keyUrl:'https://aistudio.google.com/apikey', hint:'AIza… 로 시작하는 키', def:'gemini-2.5-flash', models:['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview'], tip:'Google AI Studio에서 무료로 키를 만들 수 있고, 무료 한도 안에서는 요금이 없어요. 사진 읽기는 flash 계열이면 충분해요.' },
  openai:{ name:'GPT', vendor:'OpenAI', mark:'GPT', color:'#1F9D7A', keyUrl:'https://platform.openai.com/api-keys', hint:'sk-… 로 시작하는 키', def:'gpt-5-mini', models:['gpt-5-mini','gpt-5','gpt-5-nano','gpt-4.1-mini','gpt-4o-mini'], tip:'OpenAI 계정에 크레딧이 있어야 해요. mini 계열이 빠르고 저렴하며 사진도 읽어요.' },
  claude:{ name:'클로드', vendor:'Anthropic', mark:'C', color:'#C96A4A', keyUrl:'https://console.anthropic.com/settings/keys', hint:'sk-ant-… 로 시작하는 키', def:'claude-haiku-4-5-20251001', models:['claude-haiku-4-5-20251001','claude-sonnet-5','claude-opus-5-5'], tip:'Anthropic 콘솔에서 만든 키를 넣어요. haiku가 가장 빠르고 저렴하며 사진도 읽어요.' },
};
if (!PROVIDERS[state.cfg.provider]) state.cfg.provider='gemini';
if (!state.cfg.model || typeof state.cfg.model!=='object') state.cfg.model={};
const inClaude = () => !!(window.claude && typeof window.claude.use==='function');
const aiSrc = () => state.cfg.src || (inClaude() ? 'builtin' : 'byok');
function aiMode(){ if (aiSrc()==='builtin') return state.sample ? 'builtin' : null; return state.keys[state.cfg.provider] ? 'byok' : null; }
const aiOn = () => !!aiMode();
const curModel = () => { const m=state.cfg.model[state.cfg.provider]; return (m && m!=='__custom') ? m : PROVIDERS[state.cfg.provider].def; };
function saveCfg(){ store.set('lab.cfg', state.cfg); }
function applyScale(){ const w=innerWidth; const z = w>=1600?1.32: w>=1280?1.22: w>=900?1.12:1; const uz={small:.9,normal:1,large:1.12}[state.cfg.fontScale]||1; document.documentElement.style.setProperty('--zoom', (z*uz).toFixed(3)); }
function applyTheme(){ const t=state.cfg.theme||'system'; if (t==='system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=t; }
function loadKeys(){ let k = store.get('lab.keys', null); if (!k){ try{ const s=sessionStorage.getItem('lab.keys'); k = s?JSON.parse(s):null; }catch(e){} } state.keys = (k && typeof k==='object') ? k : {}; }
function saveKeys(){ try{ if (state.cfg.remember){ store.set('lab.keys', state.keys); sessionStorage.removeItem('lab.keys'); } else { localStorage.removeItem('lab.keys'); sessionStorage.setItem('lab.keys', JSON.stringify(state.keys)); } }catch(e){} }
loadKeys();
const SKINS = [['dry','건성'],['normal','중성'],['oily','지성'],['sens','민감']];
const skinName = () => (SKINS.find(s=>s[0]===state.skin)||[])[1] || '';
// ===== 피하는 성분 (내 피부 프로필) =====
const AVOID_GROUPS = [
  ['frag','향료·에센셜오일', g=>g.r==='frag'],
  ['a25','알레르기 유발성분 25종', g=>!!g.a25],
  ['alcohol','에탄올(변성알코올)', g=>g.ko==='에탄올'],
  ['paraben','파라벤', g=>/파라벤/.test(g.ko)],
  ['silicone','실리콘', g=>/메티콘|실록세인|실리콘/.test(g.ko)],
  ['mineral','미네랄오일·페트롤라툼', g=>/미네랄오일|페트롤라툼|파라핀/.test(g.ko)],
  ['sulfate','설페이트 세정제', g=>g.r==='surf' && /설페이트/.test(g.ko)],
  ['peg','PEG 계열', g=>/피이지|PEG/i.test(g.ko+' '+g.inci)],
  ['retinoid','레티놀 계열', g=>/^레티/.test(g.ko)],
  ['acid','AHA·BHA 산', g=>/글라이콜릭애씨드|락틱애씨드|살리실릭애씨드|만델릭애씨드|베타인살리실레이트|락토바이오닉/.test(g.ko)],
  ['menthol','멘톨·쿨링', g=>/멘톨|페퍼민트|캠퍼/.test(g.ko)],
  ['color','합성 색소', g=>g.r==='col' && /호$|호\)|카민/.test(g.ko)],
];
const AVOID_BY = Object.fromEntries(AVOID_GROUPS.map(g=>[g[0],g]));
function isAvoided(g){ if(!g) return false; const a=state.avoid; if (a.ids.includes(g.ko)) return true; return a.groups.some(k=>AVOID_BY[k] && AVOID_BY[k][2](g)); }
function avoidReasons(g){ const a=state.avoid; const out=[]; if (a.ids.includes(g.ko)) out.push('직접 고른 성분'); a.groups.forEach(k=>{ if(AVOID_BY[k]&&AVOID_BY[k][2](g)) out.push(AVOID_BY[k][1]); }); return out; }
const avoidCount = () => state.avoid.groups.length + state.avoid.ids.length;
function saveAvoid(){ store.set('lab.avoid', state.avoid); persistCloud(); }
function avoidSummaryHTML(){
  const a=state.avoid; if(!avoidCount()) return `<span class="xs muted">아직 없어요. 향료·알코올처럼 트러블이 났던 성분을 골라 두면 리포트와 분석에서 바로 표시해요.</span>`;
  return `<div class="avoid-sum">${a.groups.map(k=>`<span class="chip sm av sel" style="cursor:default">${ic('warn','xs')}${esc(AVOID_BY[k]?AVOID_BY[k][1]:k)}</span>`).join('')}${a.ids.map(id=>`<span class="ichip av" style="cursor:default;height:28px">${esc(id)}</span>`).join('')}</div>`;
}
function avoidSheetHTML(){
  const a=state.avoid; const q=norm(state.avoidQ);
  const hits = q ? DB.filter(g=>[g.ko,g.inci,...g.al].some(n=>norm(n).includes(q))).slice(0,12) : [];
  return `<div class="between"><div class="row" style="gap:8px">${ic('shield','s')}<h2 class="h2" style="font-size:18px">피하는 성분</h2></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  <p class="small muted">고른 성분이 배합이나 분석 결과에 들어 있으면 주의로 표시하고, 성분 사전과 팔레트에도 「피함」 표시가 붙어요.</p>
  <div class="set-h">자주 피하는 묶음</div>
  <div class="wrap">${AVOID_GROUPS.map(([k,n])=>`<button class="chip av ${a.groups.includes(k)?'sel':''}" data-act="avoid-group" data-v="${k}">${a.groups.includes(k)?ic('check','xs'):''}${n}</button>`).join('')}</div>
  <div class="set-h">특정 성분 추가</div>
  <div class="field"><label class="sr" for="avoidQ">성분 검색</label>${ic('search','s')}<input id="avoidQ" placeholder="한글명·INCI로 검색해 추가" value="${esc(state.avoidQ)}" autocomplete="off"></div>
  ${hits.length?`<div class="avoid-list">${hits.map(g=>`<div class="prow"><button class="info" data-act="open-ing" data-id="${esc(g.ko)}">${ingArt(g,'art xs')}<span class="t"><span class="n">${esc(g.ko)}</span><small>${esc(g.inci)} · ${ROLE[g.r].n}</small></span></button>${a.ids.includes(g.ko)?`<button class="btn text" style="min-height:36px" data-act="avoid-id" data-id="${esc(g.ko)}">빼기</button>`:`<button class="add" data-act="avoid-id" data-id="${esc(g.ko)}" aria-label="${esc(g.ko)} 피하기에 추가">${ic('plus','s')}</button>`}</div>`).join('')}</div>`:(q?`<div class="empty">맞는 성분이 없어요.</div>`:'')}
  ${a.ids.length?`<div class="wrap">${a.ids.map(id=>`<button class="ichip av" data-act="avoid-id" data-id="${esc(id)}" title="빼기">${esc(id)} ${ic('x','xs')}</button>`).join('')}</div>`:''}
  <div class="sheet-actions"><button class="btn text" data-act="avoid-clear" ${avoidCount()?'':'disabled'}>모두 지우기</button><button class="btn" data-act="close-sheets">완료</button></div>`;
}
function refreshAvoidSheet(){ const b=$('#sheetAvoidBody'); if(b) b.innerHTML=avoidSheetHTML(); }
function openAvoidSheet(){ state.avoidQ=''; refreshAvoidSheet(); openSheet('sheetAvoid'); }

if (state.ai.d !== todayKey()) state.ai = {d:todayKey(), n:0};
const aiLeft = () => aiMode()==='byok' ? Infinity : Math.max(0, AI_LIMIT - (state.ai.d===todayKey()? state.ai.n : 0));
function bumpAI(){ if(state.ai.d!==todayKey()) state.ai={d:todayKey(),n:0}; state.ai.n++; store.set('lab.ai', state.ai); }
// AI 결과 캐시: 같은 입력(해시)이면 다시 부르지 않음 (최근 60개, 이 브라우저에만)
const hashStr = s => { let h=5381; s=String(s); for (let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); };
const AI_CACHE = store.get('lab.aicache', {order:[], data:{}});
if (!AI_CACHE.order || !AI_CACHE.data){ AI_CACHE.order=[]; AI_CACHE.data={}; }
function cacheGet(k){ const e=AI_CACHE.data[k]; return e ? e.v : undefined; }
function cacheSet(k, v){ if (v===undefined) return; if (!AI_CACHE.data[k]) AI_CACHE.order.push(k); AI_CACHE.data[k]={v, at:Date.now()}; while (AI_CACHE.order.length>60){ const old=AI_CACHE.order.shift(); delete AI_CACHE.data[old]; } store.set('lab.aicache', AI_CACHE); }


const AI_ERR = {not_granted:'AI 사용이 허용되지 않았어요. 이 기능 없이도 규칙 기반 결과는 볼 수 있어요.', sampling_disabled:'이 계정에서는 AI 기능을 쓸 수 없어요.', rate_limited:'요청 한도를 넘었어요. 잠시 후 다시 시도하거나, 서비스의 요금제·크레딧을 확인해 주세요.', refused:'이 요청에는 답하지 못했어요. 내용을 바꿔 다시 시도해 주세요.', invalid_json:'답을 읽지 못했어요. 다시 시도해 주세요.', images_unavailable:'이 화면에서는 사진을 보낼 수 없어요.', image_rejected:'사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.', upstream_error:'연결이 잠시 끊겼어요. 다시 시도해 주세요.', limit:'오늘 AI 사용 횟수(20회)를 모두 썼어요. 내일 다시 쓸 수 있어요.', empty_completion:'답이 비어 있었어요. 다시 시도해 주세요.', cancelled:'',
  no_key:'설정에서 API 키를 먼저 넣어 주세요.', bad_key:'API 키가 올바르지 않거나 권한이 없어요. 설정에서 키를 다시 확인해 주세요.', bad_model:'모델 이름을 찾을 수 없어요. 설정에서 「목록 불러오기」로 모델을 골라 주세요.', bad_request:'요청을 처리하지 못했어요. 모델을 바꾸거나 잠시 후 다시 시도해 주세요.', network:'AI 서버에 연결하지 못했어요. claude.ai 안에서 열었다면 개인 키로는 외부 호출이 차단돼요. HTML 파일을 직접 열거나 웹에 올린 뒤 써 주세요.'};
const errMsg = e => { if (e && AI_ERR[e.code] !== undefined) return AI_ERR[e.code] + (e.detail && ['bad_request','bad_model','upstream_error'].includes(e.code) ? ` (${String(e.detail).slice(0,90)})` : ''); return AI_ERR.upstream_error; };
function aiCall(kind, input, opts){
  const mode = aiMode();
  if (!mode) return Promise.reject({code: aiSrc()==='byok' ? 'no_key' : 'not_granted'});
  if (mode==='byok') return byokCall(kind, input, opts||{});
  if (aiLeft() <= 0) return Promise.reject({code:'limit'});
  bumpAI();
  const pr = kind === 'json' ? state.sample.json(input, opts) : state.sample(input, opts);
  pr.then(()=>{ if(state.aiState!=='granted'){ state.aiState='granted'; } }, e=>{ if(e&&e.code==='not_granted') state.aiState='denied'; });
  return pr;
}
// --- 개인 API 키로 직접 호출 (Gemini · OpenAI · Anthropic) ---
const BYOK_SYS = '당신은 화장품 성분 학습 앱 「내 화장품 연구소」의 도우미입니다. 항상 한국어 존댓말로, 초보자가 이해할 수 있게 답합니다. 치료·완치처럼 의약품으로 들리는 표현은 쓰지 않습니다.';
async function byokCall(kind, prompt, opts){
  const p=state.cfg.provider, key=state.keys[p], model=curModel();
  if (!key) throw {code:'no_key'};
  const json = kind==='json';
  const sys = BYOK_SYS + (json ? '\n반드시 유효한 JSON만 출력합니다. 설명 문장, 마크다운 코드 펜스 없이 JSON 자체만 답합니다.' : '');
  const images = await Promise.all((opts.images||[]).map(prepImage));
  let text='';
  const onText = t => { text=t; if (opts.onText && !json) { try{ opts.onText({text}); }catch(e){} } };
  try{
    text = await BYOK[p]({key, model, sys, prompt, images, json, signal:opts.signal, onText});
  }catch(e){
    if (e && e.name==='AbortError') throw {code:'cancelled', text};
    if (e && e.code) throw e;
    if (e instanceof TypeError) throw {code:'network'};
    throw {code:'upstream_error', detail:e && e.message};
  }
  if (json){ const v=parseJSONLoose(text); if (v===undefined) throw {code:'invalid_json'}; return v; }
  if (!String(text).trim()) throw {code:'empty_completion'};
  return {text};
}
function parseJSONLoose(s){
  s=String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{ return JSON.parse(s); }catch(e){}
  const a=s.search(/[\[{]/); if (a<0) return undefined;
  const last=Math.max(s.lastIndexOf('}'), s.lastIndexOf(']')); if (last<=a) return undefined;
  try{ return JSON.parse(s.slice(a,last+1)); }catch(e){ return undefined; }
}
async function httpErr(res){
  let msg=''; try{ const j=await res.json(); msg=(j.error&&(j.error.message||j.error.type))||j.message||''; }catch(e){}
  const st=res.status;
  let code = st===401||st===403 ? 'bad_key' : st===404 ? 'bad_model' : st===429 ? 'rate_limited' : st===400 ? 'bad_request' : 'upstream_error';
  if (st===400 && /api key|permission|credential/i.test(msg)) code='bad_key';
  if (st===400 && /model/i.test(msg) && /not found|does not exist|unsupported|invalid model/i.test(msg)) code='bad_model';
  return {code, status:st, detail:msg};
}
async function readSSE(res, onEvent){
  if (!res.body || !res.body.getReader){ const t=await res.text(); t.split(/\r?\n/).forEach(l=>{ if(l.startsWith('data:')) onEvent(l.slice(5).trim()); }); return; }
  const reader=res.body.getReader(); const dec=new TextDecoder(); let buf='';
  while(true){ const {value,done}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).replace(/\r$/,''); buf=buf.slice(i+1); if(line.startsWith('data:')) onEvent(line.slice(5).trim()); } }
  const rest=buf.trim(); if (rest.startsWith('data:')) onEvent(rest.slice(5).trim());
}
const parseEv = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const BYOK = {
  async gemini({key,model,sys,prompt,images,json,signal,onText}){
    const parts=[{text:prompt}, ...images.map(im=>({inline_data:{mime_type:im.mime, data:im.data}}))];
    const body={system_instruction:{parts:[{text:sys}]}, contents:[{role:'user', parts}], generationConfig:Object.assign({temperature:0.4, maxOutputTokens:4096}, json?{responseMimeType:'application/json'}:{})};
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {method:'POST', headers:{'content-type':'application/json','x-goog-api-key':key}, body:JSON.stringify(body), signal});
    if (!res.ok) throw await httpErr(res);
    let out='', blocked=null;
    await readSSE(res, ev=>{ const j=parseEv(ev); if(!j) return; if (j.promptFeedback && j.promptFeedback.blockReason) blocked=j.promptFeedback.blockReason; const c=j.candidates&&j.candidates[0]; const ps=(c&&c.content&&c.content.parts)||[]; ps.forEach(pt=>{ if (pt.text && !pt.thought) out+=pt.text; }); if (c && c.finishReason==='SAFETY') blocked='SAFETY'; onText(out); });
    if (blocked && !out) throw {code:'refused'};
    return out;
  },
  async openai({key,model,sys,prompt,images,json,signal,onText}){
    const content=[{type:'text', text:prompt}, ...images.map(im=>({type:'image_url', image_url:{url:`data:${im.mime};base64,${im.data}`}}))];
    const body={model, stream:true, messages:[{role:'system', content:sys},{role:'user', content}], max_completion_tokens:4096};
    if (json) body.response_format={type:'json_object'};
    if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort='low';
    const res=await fetch('https://api.openai.com/v1/chat/completions', {method:'POST', headers:{'content-type':'application/json', 'authorization':'Bearer '+key}, body:JSON.stringify(body), signal});
    if (!res.ok) throw await httpErr(res);
    let out='';
    await readSSE(res, ev=>{ if (ev==='[DONE]') return; const j=parseEv(ev); if(!j) return; if (j.error) throw {code:'upstream_error', detail:j.error.message}; const d=j.choices&&j.choices[0]&&j.choices[0].delta; if (d && d.content) { out+=d.content; onText(out); } });
    return out;
  },
  async claude({key,model,sys,prompt,images,json,signal,onText}){
    const content=[...images.map(im=>({type:'image', source:{type:'base64', media_type:im.mime, data:im.data}})), {type:'text', text:prompt}];
    const body={model, max_tokens:4096, system:sys, stream:true, messages:[{role:'user', content}]};
    const res=await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'}, body:JSON.stringify(body), signal});
    if (!res.ok) throw await httpErr(res);
    let out='';
    await readSSE(res, ev=>{ const j=parseEv(ev); if(!j) return; if (j.type==='error') throw {code: j.error&&j.error.type==='rate_limit_error'?'rate_limited':'upstream_error', detail:j.error&&j.error.message}; if (j.type==='content_block_delta' && j.delta && j.delta.type==='text_delta'){ out+=j.delta.text; onText(out); } });
    return out;
  },
};
const BYOK_HDR = p => p==='openai' ? {'authorization':'Bearer '+state.keys[p]} : p==='claude' ? {'x-api-key':state.keys[p], 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'} : {'x-goog-api-key':state.keys[p]};
async function fetchModels(p){
  const h=BYOK_HDR(p);
  if (p==='gemini'){ const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {headers:h}); if(!r.ok) throw await httpErr(r); const j=await r.json(); return (j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>String(m.name).replace(/^models\//,'')).filter(n=>/gemini/.test(n) && !/embedding|tts|image|audio|live|robotics|computer-use|aqa/.test(n)); }
  if (p==='openai'){ const r=await fetch('https://api.openai.com/v1/models', {headers:h}); if(!r.ok) throw await httpErr(r); const j=await r.json(); return (j.data||[]).map(m=>m.id).filter(id=>/^(gpt-(4o|4\.1|5)|o[134])/.test(id) && !/audio|realtime|tts|transcribe|search|instruct|image|embedding|moderation|codex|chat-latest|-pro|deep-research/.test(id)).sort(); }
  const r=await fetch('https://api.anthropic.com/v1/models?limit=100', {headers:h}); if(!r.ok) throw await httpErr(r); const j=await r.json(); return (j.data||[]).map(m=>m.id);
}
async function prepImage(file){
  const dataUrl = await new Promise((ok,err)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>err({code:'image_rejected'}); r.readAsDataURL(file); });
  try{
    const img = await new Promise((ok,err)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=err; i.src=dataUrl; });
    const M=1600, s=Math.min(1, M/Math.max(img.naturalWidth||img.width, img.naturalHeight||img.height));
    if (s<1 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type||'')){ const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.naturalWidth*s)); c.height=Math.max(1,Math.round(img.naturalHeight*s)); c.getContext('2d').drawImage(img,0,0,c.width,c.height); return {mime:'image/jpeg', data:c.toDataURL('image/jpeg',0.86).split(',')[1]}; }
  }catch(e){}
  const m=/^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl); if(!m) throw {code:'image_rejected'}; return {mime:m[1], data:m[2]};
}
const soften = t => String(t||'').replace(/완치/g,'개선 도움').replace(/치료/g,'관리').replace(/재생/g,'회복 케어').replace(/항염/g,'진정').replace(/소염/g,'진정').replace(/[#*`]/g,'');

let toastTimer;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'), 2600); }
function openSheet(id){ closeSheets(); $('#'+id).classList.add('open'); $('#scrim').classList.add('show'); }
function closeSheets(){ document.querySelectorAll('.sheet').forEach(s=>s.classList.remove('open')); $('#scrim').classList.remove('show'); }
const isDesktop = () => window.matchMedia('(min-width:900px)').matches;

// ===== 레시피 =====
function newRecipe(typeId, mode){
  const t = TYPES[typeId];
  let items = mode==='base' ? t.recipe.map(([id,pct])=>({id,pct})) : (t.kind==='anhydrous' ? [] : [{id:'정제수',pct:100}]);
  return {name:`나의 ${t.name}`, typeId, items, pack:{shape:t.pack.shape, material:t.pack.material, volume:t.pack.volume, color:LABEL_COLORS[0], label:'minimal'}, auto:true};
}
function calc(items){
  const groups={water:0,oil:0,act:0,surf:0,other:0}; let total=0;
  for (const it of items){ const g=ING[it.id]; if(!g) continue; groups[groupOf(g.r)] += it.pct; total += it.pct; }
  return {groups,total};
}
function balance(r){
  if (!r.auto) return;
  const w = r.items.find(i=>i.id==='정제수'); if(!w) return;
  const others = r.items.filter(i=>i.id!=='정제수').reduce((s,i)=>s+i.pct,0);
  w.pct = Math.max(0, Math.round((100-others)*10)/10);
}
function totalOf(items){ return items.reduce((s,i)=>s+(+i.pct||0),0); }
function applyPct(id, val){
  const r=state.recipe; const it=r.items.find(i=>i.id===id); if(!it) return 0;
  let v=Math.max(0, Math.round((+val||0)*10)/10);
  const w=r.items.find(i=>i.id==='정제수');
  const others=r.items.filter(i=>i!==it && i!==w).reduce((s,i)=>s+i.pct,0);
  if (it===w){
    if (r.auto){ r.auto=false; const cb=$('#autoBal'); if(cb) cb.checked=false; toast('정제수를 직접 움직여 자동 맞춤을 껐어요.'); }
    v=Math.min(v, Math.max(0, Math.round((100-others)*10)/10));
  } else if (r.auto && w){
    v=Math.min(v, Math.max(0, Math.round((100-others)*10)/10)); it.pct=v; w.pct=Math.max(0, Math.round((100-others-v)*10)/10);
  } else {
    const wp=w?w.pct:0; v=Math.min(v, Math.max(0, Math.round((100-others-wp)*10)/10));
  }
  it.pct=v; return v;
}
function remaining(){ const r=state.recipe; return Math.max(0, Math.round((100-totalOf(r.items))*10)/10); }
function pushHist(){ const r=state.recipe; if(!r) return; state.hist.push(JSON.stringify({items:r.items,auto:r.auto})); if(state.hist.length>30) state.hist.shift(); state.redo=[]; }
function restoreHist(from, to){ const r=state.recipe; const s=from.pop(); if(!s) return; to.push(JSON.stringify({items:r.items,auto:r.auto})); const o=JSON.parse(s); r.items=o.items; r.auto=o.auto; render(); }
const OIL_W = id => /왁스/.test(id) ? 3 : /버터/.test(id) ? 5 : 8;
function recommendMix(){
  const r=state.recipe; const t=TYPES[r.typeId]; const items=r.items.filter(i=>ING[i.id]); if(!items.length){ toast('먼저 성분을 넣어 주세요.'); return; }
  pushHist();
  const w=items.find(i=>i.id==='정제수');
  const byG={water:[],oil:[],act:[],surf:[],other:[]}; items.forEach(i=>byG[groupOf(ING[i.id].r)].push(i));
  const present=Object.keys(byG).filter(g=>byG[g].length);
  const mid=g=>{ const rg=t.ranges[g]||[0,0]; return (rg[0]+rg[1])/2; };
  const target={}; let sum=0; present.forEach(g=>{ target[g]=mid(g); sum+=target[g]; });
  if (sum<=0){ present.forEach(g=>target[g]=100/present.length); sum=100; }
  present.forEach(g=>target[g]=target[g]*100/sum);
  const W={hum:3,thick:0.4,ph:0.2,chel:0.05,emul:3,antiox:0.5,cond:2,surf:10,act:1.5,uv:8,pres:1.5,frag:0.3,col:1,powder:10,water:5,etc:1};
  const weight=i=>{ const g=ING[i.id]; let v=g.r==='oil'?OIL_W(i.id):(W[g.r]||1); if(g.mx!=null&&g.mx>=0.01) v=Math.min(v,g.mx); return v; };
  const out=new Map();
  for (const g of present){ const list=byG[g], T=target[g];
    if (g==='water' && w){ let used=0; list.filter(i=>i!==w).forEach(i=>{ const v=weight(i); out.set(i.id,v); used+=v; }); out.set('정제수', Math.max(0,T-used)); }
    else { const ws=list.map(weight); const tot=ws.reduce((s,v)=>s+v,0)||1; list.forEach((i,k)=>{ let v=T*ws[k]/tot; const g2=ING[i.id]; if(g2.mx!=null&&g2.mx>=0.01) v=Math.min(v,g2.mx); out.set(i.id,v); }); }
  }
  let total=[...out.values()].reduce((s,v)=>s+v,0);
  if (w){ out.set('정제수', Math.max(0, out.get('정제수')+(100-total))); total=[...out.values()].reduce((s,v)=>s+v,0); }
  if (Math.abs(total-100)>0.05){ const f=100/total; for (const [k,v] of out){ const g2=ING[k]; let nv=v*f; if(g2.mx!=null&&g2.mx>=0.01) nv=Math.min(nv,g2.mx); out.set(k,nv); } total=[...out.values()].reduce((s,v)=>s+v,0);
    if (Math.abs(total-100)>0.05){ let big=null; for (const [k,v] of out){ const g2=ING[k]; const capped=g2.mx!=null&&g2.mx>=0.01&&v>=g2.mx-1e-9; if(!capped && (!big||v>out.get(big))) big=k; } if(!big){ for (const [k,v] of out){ if(!big||v>out.get(big)) big=k; } } out.set(big, Math.max(0,out.get(big)+(100-total))); } }
  items.forEach(i=>{ i.pct=Math.round((out.get(i.id)||0)*10)/10; });
  const drift=Math.round((100-totalOf(items))*10)/10; if (Math.abs(drift)>=0.1){ const tgt=w||items.reduce((a,b)=>a.pct>b.pct?a:b); tgt.pct=Math.max(0,Math.round((tgt.pct+drift)*10)/10); }
  r.auto=!!w; render();
  toast(`${t.name} 권장 범위에 맞춰 ${items.length}개 성분의 비율을 정했어요. 마음에 안 들면 되돌리기.`);
}
function rangesHTML(){
  const r=state.recipe; const t=TYPES[r.typeId]; const R=evaluate(r);
  const rows=Object.keys(t.ranges).filter(g=>t.ranges[g][1]>0||(R.groups[g]||0)>0).map(g=>{ const [a,b]=t.ranges[g]; const v=R.groups[g]||0; const ok=v>=a-0.5&&v<=b+0.5; return `<tr><td><span class="row" style="gap:6px"><span class="dot ${g}"></span>${GROUPN[g]}</span></td><td class="r num">${a}~${b}%</td><td class="r num" style="${ok?'color:var(--ok-fg)':'color:var(--warn-fg)'};font-weight:700">${fmt(v)}%</td></tr>`; }).join('');
  return `<div class="between" style="align-items:flex-start"><div><h2 class="h2" style="font-size:18px">${esc(t.name)} 권장 범위</h2><p class="small muted">${t.rinse?'씻어내는 제품':'바르는 제품'} · 이 앱이 정한 초보용 기준</p></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  <table class="ranges"><thead><tr><th>그룹</th><th class="r">권장</th><th class="r">지금</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="tip">${ic('info','s')}<div>수상은 물·보습제·점증제, 유상은 오일·유화제, 활성은 기능 성분과 자외선 차단제, 세정은 계면활성제, 기타는 보존제·향·색소·점토예요. 「내 성분으로 추천 비율」을 누르면 이 범위의 가운데 값에 맞춰 줘요.</div></div>
  <div class="sheet-actions"><button class="btn tonal" data-act="close-sheets">닫기</button><button class="btn" data-act="recommend">${ic('wand','s')} 추천 비율 맞추기</button></div>`;
}
function openInfoSheet(html){ $('#sheetIngBody').innerHTML=html; openSheet('sheetIng'); }
function alternativesFor(g){
  if (!g || (g.g===0 && !g.a25)) return [];
  return DB.filter(x=>x.ko!==g.ko && x.r===g.r && x.g===0 && !x.a25).map(x=>({x,score:x.b.filter(b=>g.b.includes(b)).length + (x.diy===1?0.5:0)})).sort((a,b)=>b.score-a.score).slice(0,3).map(o=>o.x);
}
const DEFAULT_PCT = {water:10,hum:3,thick:0.3,ph:0.2,chel:0.05,oil:5,emul:3,antiox:0.3,cond:1,surf:8,act:1,uv:5,pres:1,powder:10,frag:0.3,col:1,etc:0.5};
function defaultPct(g){ let p = DEFAULT_PCT[g.r] ?? 0.5; if (g.mx!=null && g.mx>=0.01 && p>g.mx) p=g.mx; return p; }
function sliderMax(g){ if (g.r==='water' && g.ko==='정제수') return 100; if (g.mx==null) return 40; return Math.min(100, Math.max(5, g.mx*2)); }

function evaluate(recipe){
  const t = TYPES[recipe.typeId];
  const items = recipe.items.filter(i=>i.pct>0 && ING[i.id]);
  const {groups,total} = calc(items);
  const has = id => items.some(i=>i.id===id);
  const pct = id => (items.find(i=>i.id===id)||{pct:0}).pct;
  const byRole = r => items.filter(i=>ING[i.id].r===r);
  const aqueous = has('정제수') || groups.water>0 || byRole('surf').length>0;
  const cautions=[], compat=[];
  if (Math.abs(total-100)>0.5) cautions.push({lv:'warn',k:'total',t:'합계 '+fmt(total)+'%',x:'100%에 맞춰 주세요. "정제수로 100% 맞추기"를 켜면 자동으로 채워요.'});
  const pres = byRole('pres');
  if (aqueous && pres.length===0) cautions.push({lv:'bad',t:'보존제가 없어요',x:'물이 들어간 배합은 며칠 안에 미생물이 자랄 수 있어요. 1,2-헥산다이올 1~2%를 넣어 주세요.'});
  else if (!aqueous) compat.push({ok:true,text:'물이 없는 무수 제형이라 보존제가 없어도 괜찮아요.'});
  else compat.push({ok:true,text:'물이 있는 배합에 보존제가 들어 있어요.'});
  if (groups.oil>=3 && groups.water>=10 && byRole('emul').length===0 && byRole('surf').length===0) cautions.push({lv:'bad',t:'유화제가 없어요',x:'물과 오일이 함께 있는데 섞어 줄 유화제가 없어 층이 분리돼요.'});
  else if (groups.oil>=3 && groups.water>=10) compat.push({ok:true,text:'물과 오일을 섞어 줄 유화제가 있어요.'});
  for (const it of items){ const g=ING[it.id]; if (t.kind==='anhydrous' && g.r==='oil') continue; if (g.mx!=null && g.mx>=0.01 && it.pct>g.mx+1e-9) cautions.push({lv:g.g===0?'warn':'bad',t:`${g.ko} ${fmt(it.pct)}%`,x:`권장 상한 ${g.mx}%를 넘었어요. ${g.d}`,ids:[g.ko]}); }
  const RET=['레티놀','레티닐팔미테이트'], ACID=['살리실릭애씨드','글라이콜릭애씨드','락틱애씨드','아젤라익애씨드','아스코빅애씨드'];
  const rIn=RET.filter(has), aIn=ACID.filter(has);
  if (rIn.length && aIn.length) cautions.push({lv:'bad',t:'레티놀 + 산 성분',x:`${rIn.join(', ')}과(와) ${aIn.join(', ')}을(를) 함께 넣었어요. 자극이 커져요. 하나는 빼거나 아침·저녁으로 나눠 쓰세요.`,ids:[...rIn,...aIn]});
  else compat.push({ok:true,text:'레티놀과 산 성분을 함께 쓰지 않았어요.'});
  if (aIn.length>=2) cautions.push({lv:'warn',t:'산 성분 '+aIn.length+'개',x:'각질 성분이 겹치면 자극이 커져요. 하나만 남기세요.',ids:aIn});
  if (pct('에탄올')>10) cautions.push({lv:'warn',t:'에탄올 '+fmt(pct('에탄올'))+'%',x:'10%가 넘으면 건조하고 따가울 수 있어요.',ids:['에탄올']});
  const fr = items.filter(i=>ING[i.id].r==='frag'); const frPct = fr.reduce((s,i)=>s+i.pct,0); const frLimit = t.rinse?2:1;
  if (frPct>frLimit) cautions.push({lv:'warn',t:'향 성분 '+fmt(frPct)+'%',x:`${t.rinse?'씻어내는':'바르는'} 제품은 ${frLimit}% 이하를 권해요.`,ids:fr.map(i=>i.id)});
  const al = items.filter(i=>ING[i.id].a25).map(i=>i.id);
  if (al.length) cautions.push({lv:'bad',t:'알레르기 유발성분 '+al.length+'개',x:al.join(', ')+' — 식약처 고시 25종에 포함돼요. 향 알레르기가 있다면 피하세요.',ids:al});
  else compat.push({ok:true,text:'알레르기 유발성분 25종이 없어요.'});
  const roleCount={}; items.forEach(i=>{ const r=ING[i.id].r; if(['water','pres','ph','chel','antiox','thick'].includes(r)) return; roleCount[r]=(roleCount[r]||0)+1; });
  for (const r in roleCount) if (roleCount[r]>=4 && !(t.kind==='anhydrous' && r==='oil')) cautions.push({lv:'warn',t:ROLE[r].n+' '+roleCount[r]+'개',x:'같은 역할은 2~3개면 충분해요. 겹치는 성분을 줄이면 배합이 단순해져요.',ids:byRole(r).map(i=>i.id)});
  for (const g in t.ranges){ const [a,b]=t.ranges[g]; const v=groups[g]||0; if (v<a-0.5 || v>b+0.5) cautions.push({lv:'warn',t:`${GROUPN[g]} ${fmt(v)}%`,x:`${t.name}은 보통 ${GROUPN[g]} ${a}~${b}%예요.`}); }
  if (byRole('uv').length) cautions.push({lv:'info',t:'자외선 차단 지수',x:'SPF·PA는 실험실 시험으로만 알 수 있어요. 집에서 만든 선크림의 차단력은 확인할 수 없어요.'});
  const grade={0:0,1:0,2:0}; items.forEach(i=>grade[ING[i.id].g]++);
  const bmap={}; items.forEach(i=>ING[i.id].b.forEach(tag=>{ (bmap[tag]=bmap[tag]||[]).push(i.id); }));
  const benefits=Object.entries(bmap).map(([tag,ids])=>({tag,ids})).sort((a,b)=>b.ids.length-a.ids.length).slice(0,4);
  const humPct = byRole('hum').reduce((s,i)=>s+i.pct,0);
  const strong = ['레티놀','레티닐팔미테이트','살리실릭애씨드','글라이콜릭애씨드','락틱애씨드','아젤라익애씨드','아스코빅애씨드'].some(has) || pct('나이아신아마이드')>3;
  const comedo = ['코코넛오일','아이소프로필미리스테이트'].some(has);
  const skin = {
    dry: (groups.oil>=15||humPct>=8) ? ['잘 맞음','g0'] : ((groups.oil<3&&humPct<3&&!t.rinse) ? ['보습 부족','g1'] : ['무난','g0']),
    normal: ['무난','g0'],
    oily: groups.oil>=15 ? ['무거움','g1'] : (comedo ? ['모공 주의','g1'] : (bmap['피지'] ? ['잘 맞음','g0'] : ['무난','g0'])),
    sens: (al.length||frPct>0||pct('에탄올')>5||strong) ? ['주의','g1'] : (bmap['진정'] ? ['잘 맞음','g0'] : ['무난','g0'])
  };
  const avoided = items.filter(i=>isAvoided(ING[i.id])).map(i=>i.id);
  if (avoided.length) cautions.push({lv:'warn',t:'피하는 성분 '+avoided.length+'개',x:`내 피부 프로필에서 피하기로 한 성분이 들어 있어요: ${avoided.join(', ')}. 다른 성분으로 바꾸거나 비율을 줄여 보세요.`});
  const order={bad:0,warn:1,info:2}; cautions.sort((a,b)=>order[a.lv]-order[b.lv]);
  return {total,groups,cautions,compat,grade,benefits,skin,allergens:al,items,avoided};
}
function benefitLead(R, t){
  if (!R.benefits.length) return `뚜렷한 기능 성분보다 기본 보습과 질감 위주의 ${t.name} 조합이에요.`;
  const top = R.benefits.slice(0,2).map(b=>BENEFIT_TXT[b.tag]||b.tag);
  return `${top.join('과 ')}에 도움을 줄 수 있는 조합이에요.`;
}

// ===== 그림 =====
function layerGeom(groups, total){ const H=97, yb=127; let y=yb; const scale = total>100 ? 100/total : 1; const out={}; for (const k of ['other','surf','act','oil','water']){ const h=Math.max(0,(groups[k]||0)*scale/100*H); y-=h; out[k]={y,h}; } return out; }
function beakerSVG(groups, total){
  const L=layerGeom(groups,total);
  const rects=['other','surf','act','oil','water'].map(k=>`<rect data-k="${k}" x="0" y="${L[k].y.toFixed(2)}" width="100" height="${L[k].h.toFixed(2)}" fill="var(--${k}-bg)"/>`).join('');
  return `<svg viewBox="0 0 100 140" fill="none" aria-hidden="true"><defs><clipPath id="bk"><path d="M28 8h44v34l18 72a10 10 0 0 1-9.6 13H19.6A10 10 0 0 1 10 114l18-72z"/></clipPath></defs><g clip-path="url(#bk)">${rects}</g><path d="M28 8h44v34l18 72a10 10 0 0 1-9.6 13H19.6A10 10 0 0 1 10 114l18-72z" stroke="var(--primary)" stroke-width="2"/><path d="M22 8h56" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/><path d="M62 60h10M62 80h10M62 100h10" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" opacity=".6"/></svg>`;
}
function darken(hex){ const n=parseInt(hex.slice(1),16); const f=c=>Math.max(0,Math.round(c*0.72)); const r=f(n>>16&255),g=f(n>>8&255),b=f(n&255); return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
let _svgUid=0;
function lighten(hex,amt=0.25){ const n=parseInt(hex.slice(1),16); const f=c=>Math.min(255,Math.round(c+(255-c)*amt)); return '#'+[f(n>>16&255),f(n>>8&255),f(n&255)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
const LABEL_STYLES = {minimal:'미니멀', botanical:'보태니컬', classic:'클래식'};
function containerSVG(pack, name, cls=''){
  const uid='c'+(++_svgUid); const mat=MATS[pack.material]||MATS.pp; const f=mat.fill, s='#B9B5AA', col=pack.color||LABEL_COLORS[0], dk=darken(col), lt=lighten(col,0.35), vol=pack.volume||'', style=pack.label||'minimal';
  const glassy = /glass|pet/.test(pack.material);
  const short = String(name||'').length>10 ? String(name).slice(0,10)+'…' : String(name||'');
  const defs = `<defs><linearGradient id="${uid}b" x1="0" x2="1"><stop offset="0" stop-color="${lighten(f,0.5)}"/><stop offset=".45" stop-color="${f}"/><stop offset="1" stop-color="${darken(f)}" stop-opacity=".9"/></linearGradient><linearGradient id="${uid}c" x1="0" x2="1"><stop offset="0" stop-color="${lt}"/><stop offset=".5" stop-color="${col}"/><stop offset="1" stop-color="${dk}"/></linearGradient><linearGradient id="${uid}h" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
  const B=`url(#${uid}b)`, C=`url(#${uid}c)`;
  const shine=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w/2}" fill="url(#${uid}h)" opacity="${glassy?.9:.55}"/>`;
  const label=(x,y,w,h,fs=9)=>{
    if (!short) return `<rect x="${x+w*0.2}" y="${y+h*0.4}" width="${w*0.6}" height="${h*0.2}" rx="3" fill="#fff" opacity=".85"/>`;
    const cx=x+w/2, fam="font-family=\"'Noto Sans KR',sans-serif\"";
    if (style==='classic') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#FFFDF7" stroke="${dk}" stroke-width="1"/><rect x="${x}" y="${y}" width="${w}" height="${h*0.42}" rx="4" fill="${col}"/><rect x="${x}" y="${y+h*0.3}" width="${w}" height="${h*0.12}" fill="${col}"/><text x="${cx}" y="${y+h*0.28}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#fff" ${fam}>${esc(short)}</text><text x="${cx}" y="${y+h*0.72}" text-anchor="middle" font-size="${fs-2}" fill="#5A5D55" ${fam}>${esc(vol)}</text><line x1="${x+w*0.3}" y1="${y+h*0.82}" x2="${x+w*0.7}" y2="${y+h*0.82}" stroke="${col}" stroke-width="1"/>`;
    if (style==='botanical') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#FBF7EE" stroke="${col}" stroke-width="1"/><path d="M${cx-7} ${y+h*0.22}q7-8 14 0q-7 5-14 0z" fill="${col}" opacity=".85"/><path d="M${cx-7} ${y+h*0.22}q7 2 14 0" stroke="#FBF7EE" stroke-width=".8"/><text x="${cx}" y="${y+h*0.55}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#2B3A2E" ${fam}>${esc(short)}</text><text x="${cx}" y="${y+h*0.55+fs+1}" text-anchor="middle" font-size="${fs-2.5}" fill="#6B7A6E" ${fam}>${esc(vol)}</text>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#fff" stroke="#E4E0D6"/><text x="${cx}" y="${y+h/2-1}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#10301C" ${fam}>${esc(short)}</text><line x1="${cx-10}" y1="${y+h/2+3}" x2="${cx+10}" y2="${y+h/2+3}" stroke="${col}" stroke-width="1.2"/><text x="${cx}" y="${y+h/2+fs+4}" text-anchor="middle" font-size="${fs-2}" fill="#5A5D55" ${fam}>${esc(vol)}</text>`;
  };
  let b='';
  switch (pack.shape){
    case 'tube': b=`<rect x="56" y="126" width="48" height="16" rx="4" fill="${C}"/><path d="M50 40Q80 26 110 40L104 126H56Z" fill="${B}" stroke="${s}" stroke-width=".8"/><path d="M50 40Q80 26 110 40" stroke="${dk}" stroke-width="3" fill="none"/>${shine(58,50,6,60)}`+label(58,64,44,42,8); break;
    case 'pump': b=`<rect x="66" y="30" width="28" height="16" rx="4" fill="${C}"/><rect x="90" y="34" width="26" height="8" rx="3" fill="${C}"/><rect x="70" y="44" width="20" height="14" fill="${dk}"/><rect x="46" y="56" width="68" height="84" rx="12" fill="${B}" stroke="${s}" stroke-width=".8"/>${shine(52,64,6,64)}`+label(54,78,52,44); break;
    case 'dropper': b=`<rect x="72" y="18" width="16" height="16" rx="7" fill="${C}"/><rect x="68" y="34" width="24" height="16" rx="3" fill="${dk}"/><rect x="52" y="50" width="56" height="88" rx="12" fill="${B}" stroke="${s}" stroke-width=".8"/><line x1="80" y1="50" x2="80" y2="128" stroke="rgba(0,0,0,.14)" stroke-width="3"/>${shine(58,58,5,66)}`+label(58,76,44,40,8); break;
    case 'spray': b=`<rect x="60" y="34" width="40" height="26" rx="6" fill="${C}"/><rect x="98" y="42" width="18" height="6" rx="3" fill="${C}"/><rect x="62" y="30" width="14" height="6" rx="2" fill="${dk}"/><rect x="52" y="60" width="56" height="80" rx="10" fill="${B}" stroke="${s}" stroke-width=".8"/>${shine(58,68,5,58)}`+label(58,80,44,40,8); break;
    case 'bottle': b=`<rect x="64" y="30" width="32" height="18" rx="4" fill="${C}"/><path d="M56 48H104V62Q112 68 112 80V128Q112 140 100 140H60Q48 140 48 128V80Q48 68 56 62Z" fill="${B}" stroke="${s}" stroke-width=".8"/>${shine(54,72,6,56)}`+label(56,80,48,44); break;
    case 'pouch': b=`<path d="M44 40H116L124 136Q124 142 118 142H42Q36 142 36 136Z" fill="${B}" stroke="${s}" stroke-width=".8"/><rect x="44" y="40" width="72" height="10" fill="${C}"/><path d="M118 62l6 3" stroke="${s}"/>${shine(48,58,6,70)}`+label(54,74,52,44); break;
    case 'stick': b=`<rect x="68" y="26" width="24" height="46" rx="5" fill="${C}"/><rect x="70" y="72" width="20" height="68" rx="4" fill="${B}" stroke="${s}" stroke-width=".8"/>${shine(73,30,3,36)}`+label(60,92,40,26,6); break;
    case 'tin': b=`<path d="M28 66V100a52 16 0 0 0 104 0V66" fill="${B}" stroke="${s}" stroke-width=".8"/><ellipse cx="80" cy="66" rx="52" ry="16" fill="${C}"/><ellipse cx="80" cy="66" rx="40" ry="11" fill="none" stroke="#fff" stroke-opacity=".35"/>`+label(52,54,56,24,8); break;
    case 'compact': b=`<rect x="34" y="44" width="92" height="92" rx="20" fill="${C}"/><rect x="42" y="52" width="76" height="76" rx="14" fill="${B}"/><line x1="34" y1="90" x2="126" y2="90" stroke="${dk}" stroke-width="2"/>${shine(46,56,5,26)}`+label(50,64,60,36,8); break;
    case 'tip': b=`<rect x="66" y="26" width="28" height="30" rx="6" fill="${C}"/><rect x="70" y="52" width="20" height="82" rx="6" fill="${B}" stroke="${s}" stroke-width=".8"/><path d="M74 134l6 12 6-12z" fill="${dk}"/>${shine(73,58,3,40)}`+label(62,76,36,30,6); break;
    default: b=`<rect x="34" y="28" width="92" height="18" rx="5" fill="${C}"/><rect x="38" y="44" width="84" height="6" fill="${dk}"/><rect x="28" y="50" width="104" height="82" rx="16" fill="${B}" stroke="${s}" stroke-width=".8"/>${shine(36,58,6,60)}`+label(44,70,72,44);
  }
  return `<svg class="${cls}" viewBox="0 0 160 160" aria-hidden="true">${defs}<ellipse cx="80" cy="149" rx="54" ry="5" fill="rgba(0,0,0,.10)"/>${b}</svg>`;
}


// ===== 천연 원료 일러스트 (사진이 등록되면 PHOTOS[한글명]의 주소로 대체) =====
const PHOTOS = {};
const NAT_RE = /추출물|오일|버터|왁스|수액|꽃수|열매수|꿀|즙|여과물|발효|점액|프로폴리스|로열젤리|캐비어|진주|해수|온천수|마유|녹두|콩|팥|잎|뿌리|씨오일|씨버터/;
function isNatural(g){ const o=originOf(g); return (o==='plant'||o==='animal') && NAT_RE.test(g.ko) && !/애씨드|피씨에이/.test(g.ko) && !/유화왁스|글리세라이드|글루코사이드|베타인|콜라겐|케라틴|실크|레시틴|아미노산|스테아레이트/.test(g.ko) && ['act','oil','water','frag','hum','powder','pres'].includes(g.r); }
const P = {
  stem:(x1,y1,x2,y2,c,w=3)=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`,
  leaf:(x,y,w,h,rot,c1,c2)=>`<g transform="rotate(${rot} ${x} ${y})"><path d="M${x} ${y-h/2} C${x+w/2} ${y-h/4} ${x+w/2} ${y+h/4} ${x} ${y+h/2} C${x-w/2} ${y+h/4} ${x-w/2} ${y-h/4} ${x} ${y-h/2}z" fill="${c1}"/><path d="M${x} ${y-h/2+5}V${y+h/2-5}" stroke="${c2}" stroke-width="1.4" opacity=".8"/></g>`,
  petals:(cx,cy,n,rx,ry,c)=>[...Array(n)].map((_,i)=>`<ellipse cx="${cx}" cy="${cy-ry}" rx="${rx}" ry="${ry}" fill="${c}" transform="rotate(${(360/n*i).toFixed(1)} ${cx} ${cy})"/>`).join(''),
  ring:(cx,cy,n,r,f)=>[...Array(n)].map((_,i)=>f(cx+r*Math.cos(2*Math.PI*i/n), cy+r*Math.sin(2*Math.PI*i/n), i)).join(''),
};
const GR=['#5FA36B','#2F6B3A'], STEM='#6B8F4E';
const BOT = {
  leaves:c=>P.stem(60,106,60,60,c[1])+P.leaf(46,66,26,44,-35,c[0],c[1])+P.leaf(74,66,26,44,35,c[0],c[1])+P.leaf(60,50,28,50,0,c[0],c[1]),
  mint:c=>P.stem(60,108,60,44,c[1])+P.leaf(44,70,24,42,-30,c[0],c[1])+P.leaf(76,70,24,42,30,c[0],c[1])+P.leaf(60,38,22,36,0,c[0],c[1])+P.leaf(46,96,16,26,-50,c[0],c[1])+P.leaf(74,96,16,26,50,c[0],c[1]),
  heart:c=>P.stem(60,110,60,66,c[1])+`<path d="M60 90C40 74 24 62 28 46c3-13 19-15 32-3 13-12 29-10 32 3 4 16-12 28-32 44z" fill="${c[0]}"/><path d="M60 46V86" stroke="${c[1]}" stroke-width="1.5" opacity=".8"/><path d="M60 62l-14-8M60 70l14-8" stroke="${c[1]}" stroke-width="1.2" opacity=".6"/>`,
  succulent:c=>[[0,0],[-22,-12],[22,12],[-38,-24],[38,24]].map(([dx,r])=>`<path d="M60 110C50 84 52 52 60 18c8 34 10 66 0 92z" fill="${c[0]}" stroke="${c[1]}" stroke-width="1" transform="rotate(${r} 60 110) translate(${dx*0.2} 0)"/>`).join('')+P.ring(60,60,0,0,()=>''),
  spike:c=>P.stem(60,112,60,52,STEM)+[...Array(7)].map((_,i)=>`<ellipse cx="${i%2?65:55}" cy="${16+i*7}" rx="6.5" ry="4.5" fill="${c[0]}"/><ellipse cx="${i%2?55:65}" cy="${20+i*7}" rx="6.5" ry="4.5" fill="${c[1]}"/>`).join('')+P.leaf(50,90,10,24,-30,'#7BA65C','#587A3E')+P.leaf(70,94,10,24,30,'#7BA65C','#587A3E'),
  daisy:c=>P.stem(60,112,60,72,STEM)+P.leaf(48,96,12,22,-40,'#7BA65C','#587A3E')+P.petals(60,56,14,7,21,c[0])+`<circle cx="60" cy="56" r="11" fill="${c[1]}"/>`,
  rose:c=>P.stem(60,112,60,76,STEM)+P.leaf(46,94,14,24,-40,'#5FA36B','#2F6B3A')+P.leaf(74,98,14,24,40,'#5FA36B','#2F6B3A')+P.petals(60,52,8,13,22,c[0])+P.petals(60,52,6,10,14,c[1])+`<circle cx="60" cy="52" r="7" fill="${c[2]||c[1]}"/>`,
  five:c=>P.stem(60,112,60,72,STEM)+P.leaf(46,96,12,22,-40,'#5FA36B','#2F6B3A')+P.petals(60,54,5,15,24,c[0])+`<circle cx="60" cy="54" r="8" fill="${c[1]}"/>`+P.ring(60,54,6,10,(x,y)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${c[2]||'#F4CE4B'}"/>`),
  needles:c=>P.stem(60,112,60,16,c[1])+[...Array(10)].map((_,i)=>`<line x1="60" y1="${24+i*8.5}" x2="${i%2?80:40}" y2="${16+i*8.5}" stroke="${c[0]}" stroke-width="3" stroke-linecap="round"/>`).join(''),
  root:c=>`<path d="M60 20c10 12 12 40 6 56s-4 24-8 32c-4-8-14-16-8-32S50 32 60 20z" fill="${c[0]}"/><path d="M58 60c-10 6-16 14-18 24M64 70c8 6 12 14 14 24M56 44c-6 2-12 0-16-4" stroke="${c[1]}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M60 20c-4-6-2-10 4-12M60 20c6-6 12-6 16-2" stroke="${STEM}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  grain:c=>P.stem(60,112,60,28,'#B7A25A')+[...Array(6)].map((_,i)=>`<ellipse cx="53" cy="${30+i*11}" rx="5" ry="8" fill="${c[0]}" transform="rotate(-22 53 ${30+i*11})"/><ellipse cx="67" cy="${36+i*11}" rx="5" ry="8" fill="${c[1]}" transform="rotate(22 67 ${36+i*11})"/>`).join(''),
  honeycomb:c=>[[60,48],[41,59],[79,59],[60,70],[41,37],[79,37],[60,26]].map(([x,y])=>`<polygon points="${[0,60,120,180,240,300].map(a=>`${(x+11*Math.cos((a+30)*Math.PI/180)).toFixed(1)},${(y+11*Math.sin((a+30)*Math.PI/180)).toFixed(1)}`).join(' ')}" fill="${c[0]}" stroke="${c[1]}" stroke-width="2"/>`).join('')+`<path d="M86 80s10 11 10 17a10 10 0 0 1-20 0c0-6 10-17 10-17z" fill="${c[1]}"/>`,
  snail:c=>`<path d="M28 88c0-8 10-14 24-14h34c9 0 14 6 14 11s-5 9-14 9H34" fill="${c[1]}"/><circle cx="66" cy="60" r="24" fill="${c[0]}" stroke="${c[1]}" stroke-width="3"/><path d="M52 60a14 14 0 1 1 14 14a8 8 0 1 1-8-8" stroke="${c[1]}" stroke-width="3" fill="none"/><path d="M30 74V60M38 74V58" stroke="${c[1]}" stroke-width="3" stroke-linecap="round"/><circle cx="30" cy="58" r="2.5" fill="${c[1]}"/><circle cx="38" cy="56" r="2.5" fill="${c[1]}"/>`,
  seaweed:c=>[[36,c[0],0],[60,c[1],1],[84,c[0],0]].map(([x,col,i])=>`<path d="M${x} 110C${x-14} 92 ${x+14} 76 ${x} 56S${x-12} 26 ${x+(i?6:-6)} 12" stroke="${col}" stroke-width="9" fill="none" stroke-linecap="round"/>`).join(''),
  slice:c=>`<circle cx="60" cy="60" r="38" fill="${c[0]}"/><circle cx="60" cy="60" r="30" fill="${c[1]}"/>`+P.ring(60,60,8,0,(x,y,i)=>`<path d="M60 60L${(60+28*Math.cos(i*0.785)).toFixed(1)} ${(60+28*Math.sin(i*0.785)).toFixed(1)}" stroke="${c[0]}" stroke-width="2"/>`)+P.ring(60,60,8,16,(x,y,i)=>`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3" ry="5" fill="${c[2]||'#F7F3E3'}" transform="rotate(${i*45+90} ${x.toFixed(1)} ${y.toFixed(1)})"/>`),
  berries:c=>[[48,58,14],[72,54,13],[60,76,14],[40,80,10],[80,78,10]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.5"/><circle cx="${x-r/3}" cy="${y-r/3}" r="${r/4}" fill="#fff" opacity=".5"/>`).join('')+P.leaf(64,36,16,26,20,'#5FA36B','#2F6B3A'),
  fruit:c=>`<path d="M60 34c-14-10-34 0-32 24 2 22 16 40 32 40s30-18 32-40c2-24-18-34-32-24z" fill="${c[0]}"/><path d="M60 34V22" stroke="#6E4522" stroke-width="3" stroke-linecap="round"/>`+P.leaf(70,26,12,20,40,'#5FA36B','#2F6B3A')+`<ellipse cx="46" cy="52" rx="6" ry="10" fill="#fff" opacity=".35"/>`,
  nut:c=>[[44,66,18,26,-20],[76,60,18,26,15],[60,88,16,22,0]].map(([x,y,rx,ry,r])=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.5" transform="rotate(${r} ${x} ${y})"/><ellipse cx="${x-4}" cy="${y-8}" rx="4" ry="7" fill="#fff" opacity=".35" transform="rotate(${r} ${x} ${y})"/>`).join(''),
  coconut:c=>`<circle cx="60" cy="62" r="36" fill="${c[1]}"/><circle cx="60" cy="62" r="28" fill="#F7F3E3"/><circle cx="60" cy="62" r="18" fill="${c[0]}"/><circle cx="60" cy="62" r="10" fill="#F7F3E3" opacity=".6"/>`,
  avocado:c=>`<path d="M60 20c-18 0-30 18-30 40 0 24 14 40 30 40s30-16 30-40c0-22-12-40-30-40z" fill="${c[1]}"/><path d="M60 28c-13 0-22 15-22 33 0 19 10 32 22 32s22-13 22-32c0-18-9-33-22-33z" fill="${c[0]}"/><circle cx="60" cy="68" r="14" fill="#8B5A2B"/>`,
  olive:c=>P.leaf(44,44,14,40,-60,'#7BA65C','#587A3E')+P.leaf(78,40,14,40,55,'#7BA65C','#587A3E')+`<ellipse cx="50" cy="78" rx="14" ry="18" fill="${c[0]}"/><ellipse cx="74" cy="72" rx="13" ry="17" fill="${c[1]}"/><ellipse cx="46" cy="72" rx="4" ry="6" fill="#fff" opacity=".35"/>`,
  sunflower:c=>P.stem(60,112,60,76,STEM)+P.petals(60,54,16,7,22,c[0])+`<circle cx="60" cy="54" r="15" fill="${c[1]}"/>`+P.ring(60,54,12,8,(x,y)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="#3B2A14"/>`),
  birch:c=>`<rect x="46" y="14" width="28" height="94" rx="6" fill="${c[0]}" stroke="#D8D2C4"/>`+[[50,26,10],[62,40,8],[52,58,12],[64,74,9],[50,92,10]].map(([x,y,w])=>`<rect x="${x}" y="${y}" width="${w}" height="3" rx="1.5" fill="${c[1]}"/>`).join('')+P.leaf(88,30,14,22,50,'#7BA65C','#587A3E'),
  bamboo:c=>`<rect x="52" y="12" width="16" height="96" rx="4" fill="${c[0]}"/>`+[36,60,84].map(y=>`<rect x="50" y="${y}" width="20" height="4" rx="2" fill="${c[1]}"/>`).join('')+P.leaf(86,40,10,28,60,'#7BA65C','#587A3E')+P.leaf(34,66,10,28,-60,'#7BA65C','#587A3E'),
  pearls:c=>[[42,52],[66,44],[80,66],[56,74],[36,80]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="12" fill="${c[0]}" stroke="${c[1]}" stroke-width="1"/><circle cx="${x-4}" cy="${y-4}" r="4" fill="#fff" opacity=".8"/>`).join(''),
  drops:c=>[[42,50,16],[74,44,14],[60,84,18]].map(([x,y,s])=>`<path d="M${x} ${y-s}s${s} ${s*1.1} ${s} ${s*1.6}a${s} ${s} 0 0 1-${2*s} 0c0-${(s*0.5).toFixed(1)} ${s} ${s*1.6} ${s} ${s*1.6}z" fill="${c[0]}"/><path d="M${x-s*0.4} ${y-s*0.1}a${s*0.5} ${s*0.5} 0 0 0-${s*0.15} ${s*0.5}" stroke="#fff" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>`).join(''),
  wax:c=>`<rect x="30" y="52" width="60" height="36" rx="6" fill="${c[0]}"/><path d="M30 58l10-14h60l-10 14z" fill="${c[1]}" opacity=".9"/><path d="M90 58l10-14v36l-10 14z" fill="${c[1]}" opacity=".6"/>`,
  butter:c=>BOT.wax(c)+`<ellipse cx="82" cy="96" rx="14" ry="10" fill="#A9743F" stroke="#6E4522" stroke-width="1.5"/>`,
  cactus:c=>`<ellipse cx="60" cy="72" rx="28" ry="34" fill="${c[0]}"/>`+[[48,58],[66,52],[56,80],[72,76],[46,90]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.5" fill="${c[1]}"/>`).join('')+`<ellipse cx="82" cy="40" rx="9" ry="12" fill="#D94F7A"/>`,
  lotus:c=>P.stem(60,112,60,80,STEM)+[-40,-20,0,20,40].map(a=>`<path d="M60 76c-10-14-8-34 0-46 8 12 10 32 0 46z" fill="${c[0]}" transform="rotate(${a} 60 76)"/>`).join('')+`<circle cx="60" cy="72" r="6" fill="${c[1]}"/>`,
  bean:c=>[[46,52,14,10,-20],[74,60,14,10,20],[56,80,14,10,10]].map(([x,y,rx,ry,r])=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c[0]}" transform="rotate(${r} ${x} ${y})"/><path d="M${x-2} ${y-3}q2 3 0 6" stroke="${c[1]}" stroke-width="2" fill="none"/>`).join(''),
  resin:c=>[[46,62,12],[70,56,11],[58,82,12],[78,80,9]].map(([x,y,r])=>`<path d="M${x} ${y-r}l${r} ${r*0.6}v${r*0.8}l-${r} ${r*0.6}l-${r}-${r*0.6}v-${r*0.8}z" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.5"/>`).join(''),
};
const ART_RULES = [
  [/알로에|용설란/,'succulent',['#6FB37A','#3E7A4A']],
  [/라벤더/,'spike',['#8E7CC3','#5B4A9E']],
  [/카렌둘라|금잔화/,'daisy',['#F2A34B','#C87A1C']],
  [/캐모마일|국화|데이지/,'daisy',['#FFFFFF','#F4CE4B']],
  [/로즈힙/,'berries',['#D9534F','#A22E2B']],
  [/로즈마리|티트리|소나무|편백|시더|유칼립투스/,'needles',['#5FA36B','#2F6B3A']],
  [/장미|로즈/,'rose',['#E58AA3','#C2506F','#A63B5B']],
  [/히비스커스/,'five',['#D9534F','#7A1F2B','#F4CE4B']],
  [/동백/,'five',['#D94F6B','#F4CE4B','#F7E27A']],
  [/벚꽃|목련|자스민|네롤리|오렌지꽃/,'five',['#F6D3DD','#F4CE4B','#E9B44C']],
  [/일랑일랑/,'five',['#F1D54B','#C99A12','#F4CE4B']],
  [/제라늄|작약/,'five',['#EE8DB0','#D94F7A','#F4CE4B']],
  [/연꽃/,'lotus',['#F4B6C8','#F4CE4B']],
  [/해바라기/,'sunflower',['#F4CE4B','#6E4522']],
  [/병풀|센텔라|마데카소사이드|아시아티코사이드/,'heart',['#5FA36B','#2F6B3A']],
  [/어성초/,'heart',['#4E8F5C','#2F6B3A']],
  [/페퍼민트|레몬밤|세이지|타임|쑥|마치현|위치하젤|귀리커넬|오트/,'mint',['#5FA36B','#2F6B3A']],
  [/감초|인삼|당귀|황금|작약뿌리|천궁|생강|우엉/,'root',['#C9A063','#8A6230']],
  [/강황|당근/,'root',['#F2A34B','#C87A1C']],
  [/귀리|쌀|보리|밀|율무|옥수수/,'grain',['#E3C46B','#C6A03F']],
  [/꿀|프로폴리스|로열젤리|비즈왁스/,'honeycomb',['#F4CE4B','#C99A12']],
  [/달팽이/,'snail',['#D9B36C','#8A6230']],
  [/해조|다시마|미역|스피룰리나|클로렐라|알지/,'seaweed',['#3E9C90','#25655D']],
  [/오이/,'slice',['#5FA36B','#DCEFC9','#F7F3E3']],
  [/레몬|유자/,'slice',['#F1D54B','#FBF0B4','#F7F3E3']],
  [/감귤|오렌지|자몽|베르가못|귤/,'slice',['#F2A34B','#FBE3B0','#F7F3E3']],
  [/토마토|석류|사과|대추/,'fruit',['#D9534F']],
  [/복숭아|살구(?!씨)|모과|망고씨버터|호박/,'fruit',['#F4A261']],
  [/배열매|무화과|카카오추출물/,'fruit',['#A9C46B']],
  [/블루베리|블랙커런트|포도열매|포도추출물/,'berries',['#5C6BC0','#3A4AA0']],
  [/코코넛/,'coconut',['#6E4522','#A9743F']],
  [/아보카도/,'avocado',['#B9D36B','#3E7A4A']],
  [/올리브/,'olive',['#7BA65C','#4E7A3A']],
  [/시어|카카오씨버터|망고씨|마유|에뮤/,'butter',['#F3E4B2','#D9C27A']],
  [/칸데릴라|카나우바/,'wax',['#E8D9A8','#C9B66E']],
  [/유향|샌달우드|파촐리|계피/,'resin',['#D9A45B','#8A5A20']],
  [/자작나무/,'birch',['#F4F1E8','#3B3A36']],
  [/대나무/,'bamboo',['#8CBF6F','#5E8F49']],
  [/진주/,'pearls',['#F4F1EA','#D6CFC0']],
  [/캐비어/,'pearls',['#2B2B2B','#111111']],
  [/선인장|백년초/,'cactus',['#6FB37A','#3E7A4A']],
  [/콩|녹두|팥|커피|카카오/,'bean',['#6B4A2B','#3E2A16']],
  [/꽃수|열매수|수액|해수|온천수|위치하젤수|녹차수/,'drops',['#7FB6E0']],
  [/씨오일|커넬오일|아르간|마카다미아|아몬드|호호바|햄프|모링가|바오밥|타마누|피마자|님|녹차씨|석류씨|포도씨|살구씨|달맞이꽃|보리지|쌀겨/,'nut',['#C9A063','#8A6230']],
  [/녹차|차잎/,'leaves',['#5FA36B','#2F6B3A']],
];
function artKind(g){ for (const [re,k,c] of ART_RULES){ if (re.test(g.ko)) return [k,c]; } return ['leaves',GR]; }
function natArt(g, cls='art'){
  if (PHOTOS[g.ko]) return `<div class="${cls} photo" aria-hidden="true"><img src="${esc(PHOTOS[g.ko])}" alt="" loading="lazy"></div>`;
  const [k,c]=artKind(g); const draw=(BOT[k]||BOT.leaves)(c);
  const bg = /oil|frag/.test(g.r) ? 'var(--oil-bg)' : g.r==='water' ? 'var(--water-bg)' : 'var(--act-bg)';
  return `<div class="${cls}" style="background:${bg}" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="64" r="44" fill="#fff" opacity=".45"/>${draw}</svg></div>`;
}
// ===== 성분 일러스트 (역할별 원리 그림 + 유래 배지) =====
function ingArt(g, cls='art'){
  if (isNatural(g)) return natArt(g, cls);
  const grp=(ROLE[g.r]||ROLE.etc).g; const fg=`var(--${grp}-fg)`, bg=`var(--${grp}-bg)`, dot=`var(--${grp}-dot)`;
  const skin = `<rect x="16" y="86" width="88" height="18" rx="5" fill="${dot}" opacity=".28"/><rect x="16" y="98" width="88" height="6" rx="3" fill="${dot}" opacity=".35"/>`;
  const S = {
    water:`<path d="M42 24h36v14l14 44a8 8 0 0 1-7.6 10.6H35.6A8 8 0 0 1 28 82l14-44z" fill="none" stroke="${fg}" stroke-width="3"/><path d="M36 62h48l9 24H27z" fill="${dot}" opacity=".45"/><path d="M44 72q6-5 12 0t12 0 8 0" stroke="${fg}" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M36 24h48" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>`,
    hum:`${skin}<path d="M60 22s20 22 20 36a20 20 0 0 1-40 0c0-14 20-36 20-36z" fill="${dot}"/><path d="M52 48a10 10 0 0 0-4 10" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/><path d="M34 70v10m0 0l-4-4m4 4l4-4M86 70v10m0 0l-4-4m4 4l4-4" stroke="${fg}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    thick:`<path d="M20 38q13-12 26 0t26 0 26 0" stroke="${fg}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M20 60q13-12 26 0t26 0 26 0" stroke="${fg}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M20 84q13-12 26 0t26 0 26 0" stroke="${dot}" stroke-width="9" fill="none" stroke-linecap="round"/>`,
    ph:`${['#E57373','#F4A261','#F1D54B','#8FD18F','#4FB3A6','#5B8FD9','#7B6BC7'].map((c,i)=>`<rect x="${18+i*12.2}" y="54" width="11" height="14" rx="2" fill="${c}"/>`).join('')}<path d="M46 48l6-9 6 9z" fill="${fg}"/><text x="60" y="86" text-anchor="middle" font-size="12" font-weight="700" fill="${fg}" font-family="'Noto Sans KR',sans-serif">pH 5.5</text>`,
    chel:`<circle cx="60" cy="62" r="9" fill="${dot}"/><path d="M60 30a32 32 0 1 1-30 20" stroke="${fg}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M30 50l-6 7M30 50l9 1" stroke="${fg}" stroke-width="4" stroke-linecap="round"/>`,
    oil:`<rect x="22" y="66" width="76" height="26" rx="7" fill="#DCEEFB"/><rect x="22" y="46" width="76" height="22" rx="7" fill="${dot}" opacity=".5"/><ellipse cx="60" cy="38" rx="15" ry="9" fill="${dot}"/><ellipse cx="54" cy="35" rx="4" ry="2" fill="#fff" opacity=".7"/>`,
    emul:`${[[38,52],[74,44],[60,80]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="10" fill="${dot}" opacity=".85"/>`+[0,60,120,180,240,300].map(a=>`<circle cx="${(x+15*Math.cos(a*Math.PI/180)).toFixed(1)}" cy="${(y+15*Math.sin(a*Math.PI/180)).toFixed(1)}" r="2.6" fill="${fg}"/>`).join('')).join('')}`,
    antiox:`<path d="M60 22l30 11v22c0 18-13 30-30 35-17-5-30-17-30-35V33z" fill="${dot}" opacity=".25" stroke="${fg}" stroke-width="3"/><path d="M48 60l9 9 16-18" stroke="${fg}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22" cy="30" r="3" fill="${fg}" opacity=".5"/><circle cx="98" cy="36" r="3" fill="${fg}" opacity=".5"/><circle cx="100" cy="82" r="3" fill="${fg}" opacity=".5"/>`,
    cond:`<path d="M30 22q12 34 0 76M50 22q12 34 0 76M70 22q12 34 0 76M90 22q12 34 0 76" stroke="${fg}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M36 44l7-9M56 44l7-9M76 44l7-9" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>`,
    surf:`<circle cx="60" cy="60" r="12" fill="${fg}" opacity=".55"/>${[...Array(12)].map((_,i)=>{const a=i*30*Math.PI/180;return `<line x1="${(60+16*Math.cos(a)).toFixed(1)}" y1="${(60+16*Math.sin(a)).toFixed(1)}" x2="${(60+26*Math.cos(a)).toFixed(1)}" y2="${(60+26*Math.sin(a)).toFixed(1)}" stroke="${fg}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${(60+30*Math.cos(a)).toFixed(1)}" cy="${(60+30*Math.sin(a)).toFixed(1)}" r="3.6" fill="${dot}"/>`;}).join('')}`,
    act:`${skin}<path d="M40 70c0-24 14-38 40-40-1 26-15 40-34 40H40z" fill="${dot}"/><path d="M42 68c8-12 18-20 30-26" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".9"/><path d="M60 72v10" stroke="${fg}" stroke-width="2.5" stroke-dasharray="3 3" stroke-linecap="round"/><path d="M88 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="${fg}"/>`,
    uv:`${skin}<circle cx="30" cy="30" r="11" fill="#F1D54B"/>${[0,30,60,90].map(a=>`<line x1="${(30+16*Math.cos(a*Math.PI/180)).toFixed(1)}" y1="${(30+16*Math.sin(a*Math.PI/180)).toFixed(1)}" x2="${(30+24*Math.cos(a*Math.PI/180)).toFixed(1)}" y2="${(30+24*Math.sin(a*Math.PI/180)).toFixed(1)}" stroke="#F1D54B" stroke-width="3" stroke-linecap="round"/>`).join('')}<path d="M44 44l30 30M58 40l24 24" stroke="#F1D54B" stroke-width="3" stroke-linecap="round" opacity=".8"/><path d="M20 76h80" stroke="${fg}" stroke-width="5" stroke-linecap="round"/><path d="M80 76l-6-6M92 76l-6-6" stroke="${fg}" stroke-width="2" opacity=".5"/>`,
    pres:`<ellipse cx="60" cy="74" rx="36" ry="14" fill="none" stroke="${fg}" stroke-width="3"/><path d="M40 70q4-4 8 0t8 0M66 78q4-4 8 0t8 0" stroke="${fg}" stroke-width="2" fill="none" opacity=".6"/><path d="M60 20l20 7v14c0 12-9 20-20 24-11-4-20-12-20-24V27z" fill="${dot}" opacity=".9"/><path d="M52 42l6 6 10-12" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    powder:`${[[30,40,5],[52,30,4],[76,38,6],[42,58,4],[66,56,5],[90,60,4],[34,78,4],[58,74,6],[82,80,5]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${dot}" opacity=".8"/>`).join('')}<path d="M22 96q38-16 76 0" stroke="${fg}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    frag:`${[0,72,144,216,288].map(a=>`<ellipse cx="${(52+14*Math.cos(a*Math.PI/180)).toFixed(1)}" cy="${(64+14*Math.sin(a*Math.PI/180)).toFixed(1)}" rx="9" ry="7" transform="rotate(${a} ${(52+14*Math.cos(a*Math.PI/180)).toFixed(1)} ${(64+14*Math.sin(a*Math.PI/180)).toFixed(1)})" fill="${dot}" opacity=".85"/>`).join('')}<circle cx="52" cy="64" r="6" fill="${fg}"/><path d="M80 44q8-8 0-16M90 50q12-12 0-24" stroke="${fg}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/>`,
    col:`<circle cx="46" cy="52" r="20" fill="#E57373" opacity=".8"/><circle cx="74" cy="52" r="20" fill="#F1D54B" opacity=".8"/><circle cx="60" cy="74" r="20" fill="#5B8FD9" opacity=".75"/>`,
    etc:`<path d="M46 24h28M50 24v20l-16 32a8 8 0 0 0 7 12h38a8 8 0 0 0 7-12L70 44V24" fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
  };
  const scene = S[g.r] || S.etc;
  const o = originOf(g);
  const OI = {plant:`<path d="M6 16c0-6 4-10 12-10 0 7-3 10-9 10H6z" fill="none" stroke="currentColor" stroke-width="1.6"/>`, mineral:`<path d="M12 4l7 7-7 9-7-9z" fill="none" stroke="currentColor" stroke-width="1.6"/>`, animal:`<circle cx="12" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="2" fill="currentColor"/><circle cx="17" cy="7" r="2" fill="currentColor"/>`, ferment:`<circle cx="9" cy="14" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>`, petro:`<path d="M8 5h8v14H8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 10h8M8 14h8" stroke="currentColor" stroke-width="1.6"/>`, synthetic:`<path d="M9 4h6M10 4v6l-4 8h12l-4-8V4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`, water:`<path d="M12 4s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10z" fill="none" stroke="currentColor" stroke-width="1.6"/>`};
  return `<div class="${cls}" style="background:${bg};color:${fg}" aria-hidden="true"><svg viewBox="0 0 120 120">${scene}<g transform="translate(88 88)"><circle cx="12" cy="12" r="14" fill="var(--surface)"/><g>${OI[o]||OI.synthetic}</g></g></svg></div>`;
}
const originBadge = g => { const o=originOf(g); return `<span class="origin">${ORIGIN_N[o]}</span>`; };

// ===== 공통 조각 =====
function topbar(title, back, right=''){
  return `<header class="topbar">${back?`<button class="iconbtn" data-act="nav" data-to="${back}" data-dir="back" aria-label="뒤로">${ic('back')}</button>`:''}<h1>${esc(title)}</h1>${right}</header>`;
}
function gradeBadges(grade){ return `<span class="badge g0">안심 ${grade[0]}</span><span class="badge g1">주의 ${grade[1]}</span><span class="badge g2">경고 ${grade[2]}</span>`; }
function ingChip(id, extra={}){
  const g = ING[id];
  if (!g) return `<button class="ichip r-none" data-act="open-ing" data-name="${esc(id)}">${esc(id)}</button>`;
  const cls = [chipClass(g.r), g.a25||g.g===2 ? 'bad' : (g.g===1 ? 'warn' : ''), extra.pos ? 'pos' : '', isAvoided(g) ? 'av' : ''].join(' ');
  return `<button class="ichip ${cls}" data-act="open-ing" data-id="${esc(id)}">${g.g===1?ic('warn','xs'):''}${g.a25?ic('warn','xs'):''}${esc(g.ko)}${extra.pct!=null?` <span class="num" style="opacity:.75">${fmt(extra.pct)}%</span>`:''}</button>`;
}
function aiCountHTML(){
  const setBtn = `<button class="btn tonal sm" data-act="settings">${ic('gear','xs')} 설정</button>`;
  if (aiSrc()==='byok'){
    const P=PROVIDERS[state.cfg.provider];
    if (state.keys[state.cfg.provider]) return `<div class="ai-count"><span class="badge g0">${ic('check','xs')} AI 켜짐</span><span style="flex:1">내 API 키 · <b>${esc(P.name)}</b> <span class="muted">${esc(curModel())}</span> · 횟수 제한 없음</span>${setBtn}</div>`;
    return `<div class="card stack" style="gap:8px;border-color:var(--primary-c)"><div class="ai-row">${ic('key','s')}<b class="small">AI 기능 켜기</b><span class="xs muted" style="flex:1">설정에서 제미나이·GPT·클로드 중 하나의 API 키를 넣으면 사진 읽기, 리포트 해설, 유사 제품 찾기가 켜져요.</span><button class="btn" data-act="settings">${ic('gear','s')} 키 넣기</button></div><span class="xs muted">키는 이 브라우저에만 저장돼요 · 배합·리포트·텍스트 분석은 키 없이도 돼요</span></div>`;
  }
  if (!state.sampleReady) return `<div class="ai-count">${ic('spark','s')}<span>AI 기능을 확인하는 중이에요…</span></div>`;
  if (!state.sample) return `<div class="ai-count">${ic('spark','s')}<span style="flex:1">여기서는 claude.ai 내장 AI를 쓸 수 없어요. 설정에서 「내 API 키」를 고르고 제미나이·GPT·클로드 키를 넣으면 AI 기능이 켜져요.</span>${setBtn}</div>`;
  if (state.aiState==='granted') return `<div class="ai-count"><span class="badge g0">${ic('check','xs')} AI 켜짐</span><span style="flex:1">오늘 남은 AI 분석 <b>${aiLeft()}회</b> · 매일 ${AI_LIMIT}회 · 사진 읽기·해설·유사 제품</span>${setBtn}</div>`;
  if (state.aiState==='denied') return `<div class="ai-count"><span class="badge g1">AI 꺼짐</span><span style="flex:1">이번에 AI 사용을 거절했어요. 페이지를 새로고침하면 다시 켤 수 있어요.</span>${setBtn}</div>`;
  return `<div class="card stack" style="gap:8px;border-color:var(--primary-c)"><div class="ai-row">${ic('spark','s')}<b class="small">AI 기능 켜기</b><span class="xs muted" style="flex:1">사진에서 전성분 읽기, 리포트 해설, 유사 제품 찾기에 Claude를 써요. 처음 한 번만 허용을 물어봐요.</span><button class="btn" data-act="ai-enable">${ic('spark','s')} 켜기</button></div><span class="xs muted">하루 ${AI_LIMIT}회까지 · 사진은 분석에만 쓰고 저장하지 않아요 · 개인 API 키는 ${ic('gear','xs')} 설정에서</span></div>`;
}
const aiName = () => aiMode()==='byok' ? PROVIDERS[state.cfg.provider].name : 'Claude';
function aiOffHTML(what, extra=''){
  const msg = !state.sampleReady && aiSrc()==='builtin' ? `${what}는 AI를 확인한 뒤 켜져요.` : (aiSrc()==='byok' ? `${what}는 설정에서 API 키를 넣으면 켜져요.` : (inClaude() ? `${what}는 홈의 「AI 기능 켜기」를 허용하면 켜져요.` : `${what}는 설정에서 「내 API 키」를 넣거나 claude.ai에서 열면 켜져요.`));
  return `<div class="row" style="flex-wrap:wrap;gap:8px"><p class="small muted" style="flex:1;min-width:0">${msg}${extra?' '+extra:''}</p><button class="btn tonal sm" style="min-height:36px;padding:0 14px;font-size:13px" data-act="settings">${ic('gear','xs')} 설정</button></div>`;
}
function aiStatusBadge(){
  const m=aiMode();
  if (m==='builtin') return `<span class="badge g0">켜짐 · claude.ai 내장</span>`;
  if (m==='byok') return `<span class="badge g0">켜짐 · ${esc(PROVIDERS[state.cfg.provider].name)}</span>`;
  return `<span class="badge g1">꺼짐</span>`;
}
// ===== 첫 실행 고지 =====
const CONSENT_V = 1;
function consentHTML(){
  return `<div class="box"><h2>${ic('shield')}시작하기 전에</h2>
  <ul>
    <li>${ic('info','s')}<span>이 앱의 성분 설명·리포트·AI 해설은 <b>정보 제공 목적</b>이에요. 피부과 진단이나 처방을 대체하지 않아요.</span></li>
    <li>${ic('flask','s')}<span>배합과 DIY 레시피는 <b>개인 사용 목적</b>이에요. 만든 화장품을 판매하거나 선물용으로 제조하려면 화장품법에 따른 제조업·책임판매업 등록이 필요해요.</span></li>
    <li>${ic('warn','s')}<span>직접 만든 제품은 처음 쓰기 전에 <b>팔 안쪽에 48시간 패치 테스트</b>를 하고, 물이 들어간 배합에는 꼭 보존제를 넣어요.</span></li>
    <li>${ic('camera','s')}<span>라벨 사진은 성분 읽기에만 쓰고 저장하지 않아요. AI 기능을 켜면 사진과 텍스트가 선택한 AI 서비스로 전송돼요.</span></li>
  </ul>
  <button class="btn" data-act="consent-ok">${ic('check','s')} 확인했어요, 시작하기</button>
  <p class="xs muted" style="text-align:center;margin:0">이 안내는 설정에서 언제든 다시 볼 수 있어요.</p></div>`;
}
function showConsent(){ const c=$('#consent'); if(!c) return; c.innerHTML=consentHTML(); c.hidden=false; }
function acceptConsent(){ store.set('lab.consent', {v:CONSENT_V, at:Date.now()}); const c=$('#consent'); if(c) c.hidden=true; }
// ===== 설정 시트 =====
function settingsHTML(){
  const c=state.cfg, p=c.provider, P=PROVIDERS[p], key=state.keys[p]||'', src=aiSrc();
  const models=(state.modelList[p]&&state.modelList[p].length)?state.modelList[p]:P.models;
  const raw=c.model[p]||''; const custom = raw==='__custom' || (!!raw && !models.includes(raw)); const cur = custom ? (raw==='__custom'?'':raw) : curModel(); const t=state.aiTest||{};
  const srcNote = src==='builtin'
    ? (inClaude() ? `<p class="xs muted">claude.ai에서 열었을 때 쓸 수 있어요. 홈의 「AI 기능 켜기」로 허용하면 하루 ${AI_LIMIT}회까지 무료로 써요.</p>` : alertHTML('info','','지금은 claude.ai 밖에서 열려 있어 내장 AI를 쓸 수 없어요. 「내 API 키」를 골라 주세요.'))
    : (inClaude() ? alertHTML('warn','','claude.ai 안에서는 보안상 외부 AI 서버 호출이 차단돼 개인 키가 동작하지 않아요. 이 앱의 HTML 파일을 내려받아 직접 열거나 웹(Vercel 등)에 올리면 동작해요. 여기서는 「claude.ai 내장 AI」를 권해요.') : `<p class="xs muted">내 API 키로 AI 서비스에 직접 요청해요. 횟수 제한이 없고, 사용 요금은 각 서비스의 내 계정에 청구돼요.</p>`);
  return `<div class="between"><div class="row" style="gap:8px">${ic('gear','s')}<h2 class="h2" style="font-size:18px">설정</h2></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  <section class="set-sec first"><div class="set-h">AI 사용 방식</div>
    <div class="seg two"><button class="${src==='builtin'?'sel':''}" data-act="set-src" data-v="builtin">${ic('spark','xs')} claude.ai 내장 AI</button><button class="${src==='byok'?'sel':''}" data-act="set-src" data-v="byok">${ic('key','xs')} 내 API 키</button></div>${srcNote}</section>
  ${src==='byok' ? `<section class="set-sec"><div class="set-h">AI 서비스</div>
    <div class="prov-grid">${Object.entries(PROVIDERS).map(([k,v])=>`<button class="prov ${k===p?'sel':''}" data-act="set-prov" data-v="${k}" aria-pressed="${k===p}"><span class="pl" style="background:${v.color}">${v.mark}</span><b>${v.name}</b><span class="xs muted">${v.vendor}</span>${state.keys[k]?`<span class="dotk" title="키 저장됨"></span>`:''}</button>`).join('')}</div>
    <div class="field box" style="margin-top:6px"><label for="apiKey">${esc(P.name)} API 키</label><input id="apiKey" type="${state.showKey?'text':'password'}" value="${esc(key)}" placeholder="${esc(P.hint)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="iconbtn sm" data-act="key-eye" aria-label="${state.showKey?'키 숨기기':'키 보이기'}">${ic(state.showKey?'eyeoff':'eye','s')}</button></div>
    <div class="between" style="flex-wrap:wrap;gap:8px"><a class="link" href="${P.keyUrl}" target="_blank" rel="noopener">${esc(P.name)} 키 발급받기 ${ic('ext','xs')}</a><label class="msw"><input type="checkbox" id="remKey" ${c.remember?'checked':''}><span class="track"><span class="thumb"></span></span><span class="small">이 브라우저에 저장</span></label></div>
    <div class="set-h" style="margin-top:4px">모델</div>
    <div class="row"><select id="modelSel" class="msel" aria-label="모델">${models.map(m=>`<option value="${esc(m)}" ${!custom&&m===cur?'selected':''}>${esc(m)}${m===P.def?' (기본)':''}</option>`).join('')}<option value="__custom" ${custom?'selected':''}>직접 입력…</option></select><button class="btn tonal" data-act="set-models" ${key&&!state.modelBusy?'':'disabled'} style="min-height:44px;padding:0 14px;white-space:nowrap">${state.modelBusy?`<span class="thinking"><i></i></span>`:ic('refresh','s')} 목록 불러오기</button></div>
    ${custom?`<div class="field box"><label for="modelIn">모델 이름</label><input id="modelIn" value="${esc(cur)}" placeholder="예: ${esc(P.def)}" autocapitalize="off" spellcheck="false"></div>`:''}
    <p class="xs muted">${esc(P.tip)}</p></section>
  <section class="set-sec"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="set-test" ${key&&!t.busy?'':'disabled'}>${t.busy?`<span class="thinking"><i></i></span> 확인 중…`:`${ic('spark','s')} 연결 테스트`}</button><button class="btn text" data-act="set-clear" ${key?'':'disabled'}>${ic('trash','s')} 키 지우기</button></div>
    ${t.st==='ok'?alertHTML('ok','연결됨',t.msg):t.st==='err'?alertHTML('bad','실패',t.msg):''}
    <p class="xs muted">키는 이 기기의 브라우저에만 저장되고, 선택한 AI 서비스 서버로만 직접 전송돼요. 다른 곳으로는 보내지 않아요.</p></section>` : ''}
  <section class="set-sec"><div class="set-h">화면</div>
    <div class="between" style="gap:10px"><span class="small">글자 크기</span><div class="seg" style="width:220px;height:36px">${[['small','작게'],['normal','보통'],['large','크게']].map(([k,n])=>`<button class="${(c.fontScale||'normal')===k?'sel':''}" data-act="set-font" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="between" style="gap:10px"><span class="small">테마</span><div class="seg" style="width:220px;height:36px">${[['system','시스템'],['light','밝게'],['dark','어둡게']].map(([k,n])=>`<button class="${(c.theme||'system')===k?'sel':''}" data-act="set-theme" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="between"><span class="small">배합 화면 안내 투어</span><button class="btn text" data-act="tour-start" style="min-height:36px">다시 보기</button></div></section>
  <section class="set-sec"><div class="set-h">앱</div><div class="between"><span class="small">버전</span><span class="badge">v1.9</span></div><div class="between"><span class="small">지금 AI 상태</span>${aiStatusBadge()}</div><div class="between"><span class="small">이용 안내·면책 고지</span><button class="btn text" data-act="consent-show" style="min-height:36px">다시 보기</button></div><p class="xs muted">배합·리포트·DIY 변환·성분 사전·용기 추천은 AI 없이도 항상 동작해요.</p></section>
  <div class="sheet-actions" style="grid-template-columns:1fr"><button class="btn" data-act="close-sheets">완료</button></div>`;
}
function refreshSettings(){ const b=$('#sheetSettingsBody'); if(b) b.innerHTML=settingsHTML(); }
function openSettings(){ state.aiTest=null; refreshSettings(); openSheet('sheetSettings'); }
async function loadModels(){
  const p=state.cfg.provider; if(!state.keys[p]||state.modelBusy) return;
  state.modelBusy=true; refreshSettings();
  try{ const list=await fetchModels(p); if(!list.length) throw {code:'bad_request', detail:'모델이 없어요'}; const P=PROVIDERS[p]; const ordered=[...P.models.filter(m=>list.includes(m)), ...list.filter(m=>!P.models.includes(m))]; state.modelList[p]=ordered; if(!ordered.includes(curModel())) { state.cfg.model[p]=ordered[0]; saveCfg(); } toast(`${P.name} 모델 ${ordered.length}개를 불러왔어요.`); state.aiTest={st:'ok', msg:`키가 유효해요 · 모델 ${ordered.length}개`}; }
  catch(e){ state.aiTest={st:'err', msg:errMsg(e)}; }
  state.modelBusy=false; refreshSettings();
}
async function testAI(){
  const p=state.cfg.provider; if(!state.keys[p]) return;
  state.aiTest={busy:true}; refreshSettings();
  const t0=Date.now(); const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(), 25000);
  try{ const {text}=await byokCall('text', '연결 확인입니다. "OK"라고만 답해 주세요.', {signal:ctl.signal}); state.aiTest={st:'ok', msg:`${PROVIDERS[p].name} · ${curModel()} · ${((Date.now()-t0)/1000).toFixed(1)}초 · 응답: ${String(text).trim().slice(0,20)}`}; }
  catch(e){ state.aiTest={st:'err', msg: e&&e.code==='cancelled' ? '25초 안에 응답이 없었어요. 네트워크나 모델을 확인해 주세요.' : errMsg(e)}; }
  clearTimeout(tm); refreshSettings(); render();
}
async function enableAI(){
  if (!state.perms){ toast('이 화면에서는 AI를 켤 수 없어요. claude.ai에서 열어 주세요.'); return; }
  try{ const res = await state.perms.request(['sample','downloads']); state.aiState = (res && res.sample) || state.aiState; if (res && res.downloads==='granted' && !state.downloads && window.claude) { try{ state.downloads = await window.claude.use('downloads'); }catch(e){} } }
  catch(e){ toast('AI를 켜지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  if (state.aiState==='granted') toast('AI 기능이 켜졌어요.'); else if (state.aiState==='denied') toast('AI 사용을 거절했어요. 새로고침하면 다시 물어봐요.');
  render();
}
function alertHTML(lv, title, text){ const icon = lv==='ok'?'check':lv==='info'?'info':'warn'; return `<div class="alert ${lv}">${ic(icon,'s')}<div>${title?`<b>${esc(title)}</b> — `:''}${esc(text)}</div></div>`; }

// ===== 화면: 홈 =====
function viewHome(){
  const recent = state.saved.slice(0,3);
  return `<header class="topbar"><div class="row" style="gap:10px;flex:1;min-width:0"><div class="rail-logo" style="width:36px;height:36px;border-radius:12px;background:var(--primary);color:var(--on-primary);display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('flask','s')}</div><h1>내 화장품 연구소</h1></div>${aiMode()?`<span class="badge g0" title="AI 켜짐">${ic('spark','xs')} AI</span>`:''}<span class="badge">v1.9</span><button class="iconbtn" data-act="settings" aria-label="설정" title="설정" style="margin-right:-8px">${ic('gear')}</button></header>
  <div class="stack">
    <div><div class="lead">오늘은 무엇을<br>만들어 볼까요?</div><p class="muted small">성분을 배합해 보고, 산 화장품도 읽어 보세요.</p></div>
    <div class="grid2 big2">
      <a href="#make" class="mk" data-act="nav" data-to="type"><div class="ic">${ic('flask')}</div><div><div class="t">만들기</div><div class="d">성분을 골라 나만의 화장품 배합</div></div></a>
      <a href="#analyze" class="an" data-act="nav" data-to="analyze"><div class="ic">${ic('camera')}</div><div><div class="t">분석하기</div><div class="d">사진 한 장으로 전성분 읽기</div></div></a>
    </div>
    <div class="section-title"><h2 class="h2">내 배합</h2>${state.saved.length?`<button class="btn text" data-act="nav" data-to="saved">전체 보기</button>`:''}</div>
    ${recent.length ? recent.map((s,i)=>savedItem(s,i)).join('') : `<div class="card tint small muted">아직 저장한 배합이 없어요. 「만들기」에서 첫 배합을 만들면 여기에 쌓여요.</div>`}
    <div class="card stack" style="gap:8px"><div class="row" style="gap:8px">${ic('face','s')}<h2 class="h3">내 피부</h2><span class="xs muted">리포트와 분석에 맞춰 표시돼요</span></div>
      <div class="skin-pick">${SKINS.map(([k,n])=>`<button class="chip ${state.skin===k?'sel':''}" data-act="skin" data-v="${k}">${state.skin===k?ic('check','xs'):''}${n}</button>`).join('')}<button class="chip ${state.skin?'':'sel'}" data-act="skin" data-v="">${state.skin?'':ic('check','xs')}선택 안 함</button></div>
      <div class="between" style="border-top:1px solid var(--line);padding-top:8px;align-items:flex-start;gap:8px"><div class="stack" style="gap:6px;flex:1;min-width:0"><b class="small">${ic('shield','xs')} 피하는 성분${avoidCount()?` <span class="muted" style="font-weight:400">${avoidCount()}개</span>`:''}</b>${avoidSummaryHTML()}</div><button class="btn tonal sm" style="min-height:34px;padding:0 12px;font-size:13px;flex-shrink:0" data-act="avoid-open">${avoidCount()?'고치기':'고르기'}</button></div></div>
    ${aiCountHTML()}
  </div>`;
}
function savedItem(s, i){
  const at = new Date(s.at); const when = `${at.getMonth()+1}/${at.getDate()}`;
  const cmp = state.compare.on && state.screen==='saved'; const picked = cmp && state.compare.sel.includes(s.at);
  const act = cmp ? `data-act="cmp-pick" data-at="${s.at}"` : `data-act="load-saved" data-i="${i}"`; const pickMark = cmp ? `<span class="chk ${picked?'on':''}">${picked?ic('check','xs'):''}</span>` : '';
  if (s.k==='recipe'){
    const t=TYPES[s.typeId]; const R=evaluate(s);
    const A=assess(s);
    return `<button class="saved-item ${picked?'picked':''}" ${act}>${pickMark}<div class="thumb">${containerSVG(s.pack, s.name)}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><div class="nm">${esc(s.name)}</div><div class="wrap" style="gap:4px"><span class="badge">${esc(t.name)}</span><span class="badge ${A.letter[0]==='A'?'g0':A.letter==='B'?'g1':'g2'}" title="완성 제품 평가">평가 ${A.letter}</span>${gradeBadges(R.grade)}</div></div><span class="xs muted">${when}</span></button>`;
  }
  return `<button class="saved-item ${picked?'picked':''}" ${act}>${pickMark}<div class="thumb">${ic('camera')}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><div class="nm">${esc(s.name)}</div><div class="xs muted">성분표 분석 · ${s.n}개 성분</div></div><span class="xs muted">${when}</span></button>`;
}

const CAT_COLOR = {skin:'#3D6B4F',cleanse:'#2F5D8A',hairbody:'#B0562A',lipcolor:'#8A4B6B',mask:'#2A9D8F'};
// ===== 화면: 종류 선택 =====
function viewType(){
  const cat = CATS.find(c=>c.id===state.cat) || CATS[0];
  const pick = state.pickType && TYPES[state.pickType];
  return topbar('무엇을 만들까요?', 'home') + `<div class="stack">
    <div class="chiprow">${CATS.map(c=>`<button class="chip ${c.id===state.cat?'sel':''}" data-act="pick-cat" data-id="${c.id}"><span class="dot" style="background:${CAT_COLOR[c.id]}"></span>${c.name}</button>`).join('')}</div>
    <div class="grid2">${(()=>{
      const COLS=2; const cards=cat.types.map(id=>{const t=TYPES[id]; return `<button class="typecard ${state.pickType===id?'sel':''}" data-act="pick-type" data-id="${id}"><span class="typeart" style="background:color-mix(in srgb, ${CAT_COLOR[t.cat]} 16%, var(--surface2))">${containerSVG({shape:t.pack.shape,material:t.pack.material,volume:'',color:CAT_COLOR[t.cat],label:'minimal'},'')}</span><span class="n">${t.name}</span><span class="d">${t.desc}</span><span class="xs muted">기본 레시피 ${t.recipe.length}개 성분</span></button>`;});
      if (pick){ const idx=cat.types.indexOf(pick.id); const at=Math.min(cards.length-1, Math.floor(idx/COLS)*COLS+COLS-1); const col=idx%COLS;
        const detail=`<div class="card stack typedetail" style="gap:12px;--caret:${((col+0.5)/COLS*100).toFixed(1)}%" id="typeDetail">
      <div class="between"><h2 class="h2">${esc(pick.name)} 기본 레시피</h2><span class="badge">${pick.rinse?'씻어내는 제품':'바르는 제품'}</span></div>
      <div class="wrap">${pick.recipe.map(([id,p])=>ingChip(id,{pct:p})).join('')}</div>
      <p class="small muted">성분 칩을 누르면 성분 카드가 열려요. 기본 레시피로 시작한 뒤 성분을 바꾸거나 더할 수 있어요.</p>
      <div class="grid2"><button class="btn outl" data-act="start" data-id="${pick.id}" data-mode="empty">빈 비커로 시작</button><button class="btn" data-act="start" data-id="${pick.id}" data-mode="base">기본 레시피로 시작</button></div>
    </div>`; cards.splice(at+1, 0, detail); }
      return cards.join(''); })()}</div>
    ${pick ? '' : `<p class="small muted">종류를 고르면 기본 레시피를 미리 볼 수 있어요.</p>`}
  </div>`;
}

// ===== 화면: 배합 =====
function viewMix(){
  const r = state.recipe; const t = TYPES[r.typeId]; const R = evaluate(r);
  const rows = r.items.map((it,idx)=>{ const g=ING[it.id]; if(!g) return '';
    return `<div class="irow" data-row="${esc(it.id)}"><span class="dot ${(ROLE[g.r]||ROLE.etc).g}"></span><button class="iname" data-act="open-ing" data-id="${esc(g.ko)}" data-ctx="recipe"><span>${esc(g.ko)}</span><small>${ROLE[g.r].n}</small></button><input type="range" id="sl-${idx}" min="0" max="${sliderMax(g)}" step="0.1" value="${it.pct}" data-slider="${esc(it.id)}" aria-label="${esc(g.ko)} 비율"><div class="pctwrap"><input type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${fmt(it.pct)}" data-pctin="${esc(it.id)}" aria-label="${esc(g.ko)} 비율 직접 입력"><span>%</span></div><button class="iconbtn sm del" data-act="remove-ing" data-id="${esc(it.id)}" aria-label="${esc(g.ko)} 빼기">${ic('x','s')}</button></div>`; }).join('');
  return topbar(`${t.name} 배합`, 'type', `${totalPillHTML(R)}<button class="iconbtn sm" data-act="undo" ${state.hist.length?'':'disabled'} aria-label="되돌리기" title="되돌리기">${ic('undo','s')}</button><button class="iconbtn sm" data-act="redo" ${state.redo.length?'':'disabled'} aria-label="다시하기" title="다시하기">${ic('redo','s')}</button><button class="btn text" data-act="save-recipe">저장</button>`) + `<div class="banner-anchor"><div class="banners" id="mixBanners"></div></div><div class="mix-grid"><div class="stack">
    <div class="row" style="flex-wrap:wrap"><span class="chip">${esc(CATS.find(c=>c.id===t.cat).name)} <span class="muted">›</span> ${esc(t.name)}</span><label class="chip" style="cursor:pointer"><input type="checkbox" id="autoBal" ${r.auto?'checked':''} style="accent-color:var(--primary);margin:0"> 정제수로 100% 맞추기</label></div>
    <div class="card beaker-card" id="beakerBox">${beakerInner(R)}</div>
    <div class="grid2"><button class="btn tonal" data-act="recommend" ${r.items.length?'':'disabled'}>${ic('wand','s')} 추천 비율 맞추기</button><button class="btn outl" data-act="ranges">${ic('info','s')} 권장 범위</button></div>
    <div class="section-title"><h2 class="h2">선택한 성분 <span class="muted" style="font-weight:500">${r.items.length}</span> <span class="xs muted" style="font-weight:400">· 숫자를 눌러 직접 입력</span></h2><button class="btn text fab-add" data-act="open-palette">${ic('plus','s')} 성분 추가</button></div>
    <div id="rows">${rows || `<div class="empty">비커가 비어 있어요. 「성분 추가」로 시작하세요.</div>`}</div>
    <div class="stack" id="warnList" style="gap:8px">${warnListHTML(R)}</div>
    <button class="btn lg wide" data-act="to-report" ${r.items.length?'':'disabled'}>${ic('leaf','s')} 효능·부작용 리포트 보기</button>
  </div><div class="palette-host" id="paletteHost">${isDesktop()?paletteHTML():''}</div></div>`;
}
function warnStripHTML(R){
  const cs=R.cautions.filter(c=>c.lv!=='info');
  if (!cs.length) return `<button class="status-strip ok" data-act="warn-all" aria-label="확인 사항 없음">${ic('check','s')}<span class="t"><b>확인 사항 없음</b> — 지금 배합은 규칙에 걸리는 게 없어요.</span>${ic('chev','xs')}</button>`;
  const c=cs[0]; const infos=R.cautions.length-cs.length;
  return `<button class="status-strip ${c.lv}" data-act="warn-all" aria-label="확인 사항 ${cs.length}개 보기">${ic('warn','s')}<span class="t"><b>${esc(c.t)}</b> — ${esc(c.x)}</span>${cs.length>1?`<span class="cnt">+${cs.length-1}</span>`:(infos?`<span class="cnt">참고 ${infos}</span>`:'')}${ic('chev','xs')}</button>`;
}
function warnAllHTML(){
  const R=evaluate(state.recipe); const cs=R.cautions.filter(c=>c.k!=='total');
  return `<div class="between" style="align-items:flex-start"><div><h2 class="h2" style="font-size:18px">확인 사항 ${cs.filter(c=>c.lv!=='info').length}개</h2><p class="small muted">비율을 바꾸면 바로 다시 계산돼요.</p></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  ${cs.length?`<div class="stack" style="gap:8px">${cs.map(c=>alertHTML(c.lv,c.t,c.x)).join('')}</div>`:alertHTML('ok','','지금 배합은 규칙에 걸리는 게 없어요.')}
  ${R.compat.length?`<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:10px"><b class="small">잘 된 점</b>${R.compat.map(c=>`<p class="small row" style="gap:6px">${ic('check','xs')} ${esc(c.text)}</p>`).join('')}</div>`:''}
  <div class="sheet-actions" style="grid-template-columns:1fr"><button class="btn tonal" data-act="close-sheets">닫기</button></div>`;
}
// 배합 화면 떠 있는 알림(맥OS 알림처럼 화면 위에 팝업) — 레이아웃을 밀지 않고, 조정 중이면 계속 보이다가 멈추면 사라짐
const MIX_AL = {shown:new Map(), timer:null, dragging:false, visible:false, userDismissed:false, flashes:[]};
const mixCautions = R => R.cautions.filter(c=>c.lv!=='info' && c.k!=='total');
const cautionKey = c => (c.ids&&c.ids.length ? c.ids.join(',')+'|' : '') + String(c.t).replace(/[\d.]+\s*%?/g,'#');
const bannerHTML = (c, extra='') => `<div class="banner ${c.lv} ${extra}" data-act="warn-all" role="status"><span class="bi">${ic(c.lv==='ok'?'check':'warn','s')}</span><div class="bt"><b>${esc(c.t)}</b> — ${esc(c.x)}</div><button class="bx" data-act="banner-close" aria-label="알림 닫기">${ic('x','xs')}</button></div>`;
function renderBanners(show){
  const box=$('#mixBanners'); if(!box) return;
  if (!show){ box.innerHTML=''; MIX_AL.visible=false; return; }
  const list=[...MIX_AL.shown.values()].sort((a,b)=>b.at-a.at);
  const top=list.slice(0,3); const more=list.length-top.length;
  box.innerHTML = [
    ...MIX_AL.flashes.map(f=>bannerHTML({lv:'ok',t:'해결됐어요',x:f.t},'flash')),
    ...top.map(c=>bannerHTML(c, c.fresh?'fresh':'')),
    more>0?`<button class="banner more" data-act="warn-all">${ic('chev','xs')} 확인 사항 ${more}개 더 보기</button>`:''
  ].join('');
  top.forEach(c=>c.fresh=false); MIX_AL.visible = !!(top.length||MIX_AL.flashes.length);
}
function hideBanners(){ const box=$('#mixBanners'); if(!box){ MIX_AL.visible=false; return; } box.querySelectorAll('.banner').forEach(el=>el.classList.add('out')); setTimeout(()=>renderBanners(false), 230); }
function scheduleBannerHide(ms=4500){ clearTimeout(MIX_AL.timer); if (MIX_AL.dragging) return; MIX_AL.timer=setTimeout(hideBanners, ms); }
function syncMixAlerts(R, opts={}){
  if (MIX_AL.dragging && !opts.force && !opts.silent) return; // 드래그 중에는 띄우지 않고, 손을 뗄 때 보여 줌
  const cs=mixCautions(R); const now=Date.now(); let changed=false;
  const keys=new Set(cs.map(cautionKey));
  for (const [k,v] of MIX_AL.shown){ if(!keys.has(k)){ MIX_AL.shown.delete(k); changed=true; if(!opts.silent){ const f={t:v.t,at:now}; MIX_AL.flashes.push(f); setTimeout(()=>{ MIX_AL.flashes=MIX_AL.flashes.filter(x=>x!==f); if (MIX_AL.visible) renderBanners(true); }, 2200); } } }
  let textChanged=false;
  cs.forEach(c=>{ const k=cautionKey(c); const p=MIX_AL.shown.get(k); if(!p){ MIX_AL.shown.set(k,{lv:c.lv,t:c.t,x:c.x,at:now,fresh:!opts.silent}); changed=true; } else if(p.lv!==c.lv){ Object.assign(p,{lv:c.lv,t:c.t,x:c.x,at:now,fresh:!opts.silent}); changed=true; } else if(p.x!==c.x||p.t!==c.t){ Object.assign(p,{t:c.t,x:c.x}); textChanged=true; } });
  if (opts.silent) return;
  if (changed) MIX_AL.userDismissed=false;
  const want = (changed || opts.force || (!MIX_AL.visible && cs.length && !MIX_AL.userDismissed));
  if (want && (cs.length||MIX_AL.flashes.length)){ renderBanners(true); scheduleBannerHide(); }
  else if (want && !cs.length && MIX_AL.visible){ renderBanners(true); scheduleBannerHide(); }
  else if (textChanged && MIX_AL.visible){ renderBanners(true); scheduleBannerHide(); }
}
function totalPillHTML(R){
  const d=R.total-100; const cls=Math.abs(d)<=0.5?'ok':d>0?'bad':'warn';
  return `<span class="badge tot ${cls}" id="totalPill" title="현재 합계${cls==='ok'?'':d>0?` · ${fmt(d)}% 초과`:` · ${fmt(-d)}% 부족`}" aria-live="polite"><span class="lbl">합계</span><b class="num">${fmt(R.total)}%</b></span>`;
}
function totalGateHTML(R){
  const r=state.recipe; const d=R.total-100; const hasW=r.items.some(i=>i.id==='정제수');
  return `<div class="between" style="align-items:flex-start"><div><h2 class="h2" style="font-size:18px">합계가 ${fmt(R.total)}%예요</h2><p class="small muted">${d>0?`${fmt(d)}% 넘쳤어요.`:`${fmt(-d)}% 모자라요.`} 합계를 100%에 맞춰야 비율 계산과 리포트가 정확해요.</p></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  <div class="stack" style="gap:8px">
    ${hasW?`<button class="btn" data-act="fix-water">${ic('drop','s')} 정제수로 100% 맞추기</button>`:''}
    <button class="btn ${hasW?'tonal':''}" data-act="recommend">${ic('wand','s')} 추천 비율로 맞추기</button>
    <button class="btn text" data-act="report-anyway">그대로 리포트 보기</button>
  </div>
  <p class="xs muted">${hasW?'「정제수로 100% 맞추기」는 다른 성분은 그대로 두고 정제수 양만 조절해요. ':''}「추천 비율」은 넣은 성분 전체를 ${esc(TYPES[r.typeId].name)} 권장 범위에 맞춰 다시 배분해요.</p>`;
}
function warnListHTML(R){
  const cs=mixCautions(R), infos=R.cautions.filter(c=>c.lv==='info');
  return `<div class="between"><h2 class="h3">확인 사항 <span class="muted" style="font-weight:500">${cs.length}</span></h2><button class="btn text" style="min-height:36px" data-act="warn-all">${ic('info','xs')} 잘 된 점까지 보기</button></div>
  ${cs.length?cs.map(c=>alertHTML(c.lv,c.t,c.x)).join(''):alertHTML('ok','','지금 배합은 규칙에 걸리는 게 없어요.')}${infos.map(c=>alertHTML('info',c.t,c.x)).join('')}`;
}
function legendHTML(R){
  const g=R.groups; const diff=R.total-100;
  const rows = ['water','oil','act','surf','other'].map(k=>`<div class="between ${g[k]>0?'':'zero'}"><span class="row" style="gap:6px"><span class="dot ${k}"></span><span class="muted">${GROUPN[k]}</span></span><strong class="num">${fmt(g[k])}%</strong></div>`).join('');
  const st = Math.abs(diff)<=0.5 ? ['ok','check','합계 100%'] : diff>0 ? ['bad','warn',`합계 ${fmt(R.total)}% · ${fmt(diff)}% 초과`] : ['warn','warn',`합계 ${fmt(R.total)}% · ${fmt(-diff)}% 부족`];
  return `<div class="legend">${rows}<div class="gauge ${st[0]}">${ic(st[1],'s')}${st[2]}</div></div>`;
}
function beakerInner(R){ return beakerSVG(R.groups,R.total)+legendHTML(R); }
const PAL_ROLES = [['all','전체'],['nat','천연 원료'],['water','수상·보습'],['oil','오일·유화'],['act','활성'],['surf','세정'],['pres','보존'],['frag','향·색']];
function palFilter(g){
  const role = state.palRole;
  if (role!=='all'){ if (role==='nat'){ if(!isNatural(g)) return false; } else if (role==='pres'){ if(!['pres','antiox','chel','ph','thick'].includes(g.r)) return false; } else if (role==='frag'){ if(!['frag','col'].includes(g.r)) return false; } else if (groupOf(g.r)!==role || ['pres','antiox','chel','ph','thick'].includes(g.r)) return false; }
  const q = norm(state.palQ); if (q && ![g.ko,g.inci,...g.al].some(n=>norm(n).includes(q))) return false;
  if (state.recipe && state.recipe.items.some(i=>i.id===g.ko)) return false;
  return true;
}
function paletteListHTML(){
  const list = DB.filter(palFilter).slice(0,40);
  if (!list.length) return `<div class="empty">맞는 성분이 없어요. 검색어를 바꿔 보세요.</div>`;
  return list.map(g=>`<div class="prow"><button class="info" data-act="open-ing" data-id="${esc(g.ko)}" data-ctx="palette">${ingArt(g,'art xs')}<span class="t"><span class="n">${esc(g.ko)}</span><small>${esc(g.inci)} · ${ROLE[g.r].n}</small></span></button>${isAvoided(g)?`<span class="av-tag">피함</span>`:''}<span class="badge g${g.g}">${GRADE[g.g]}</span><button class="add" data-act="add-ing" data-id="${esc(g.ko)}" aria-label="${esc(g.ko)} 추가">${ic('plus','s')}</button></div>`).join('');
}
function paletteHTML(){
  return `<div class="palette"><div class="between"><h2 class="h2">성분 팔레트</h2><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기" style="display:${isDesktop()?'none':'inline-flex'}">${ic('x','s')}</button></div>
  <label class="field">${ic('search','s')}<span class="sr">성분 검색</span><input type="search" id="palQ" placeholder="성분 이름 또는 INCI 검색" value="${esc(state.palQ)}" autocomplete="off"></label>
  <div class="chiprow">${PAL_ROLES.map(([k,n])=>`<button class="chip sm ${state.palRole===k?'sel':''}" data-act="pal-role" data-id="${k}">${n}</button>`).join('')}</div>
  <div class="list" id="palList">${paletteListHTML()}</div></div>`;
}
function refreshPalette(){ const l=$('#palList'); if(l) l.innerHTML=paletteListHTML(); document.querySelectorAll('[data-act="pal-role"]').forEach(b=>b.classList.toggle('sel', b.dataset.id===state.palRole)); }
function patchMix(){
  const r=state.recipe; const R=evaluate(r);
  r.items.forEach(it=>{ const p=document.querySelector(`[data-pctin="${CSS.escape(it.id)}"]`); if(p && document.activeElement!==p) p.value=fmt(it.pct); const s=document.querySelector(`[data-slider="${CSS.escape(it.id)}"]`); if(s && Math.abs(parseFloat(s.value)-it.pct)>0.001) s.value=it.pct; });
  const u=document.querySelector('[data-act="undo"]'); if(u) u.disabled=!state.hist.length; const rd=document.querySelector('[data-act="redo"]'); if(rd) rd.disabled=!state.redo.length;
  const b=$('#beakerBox'); if(b){ const L=layerGeom(R.groups,R.total); const rects=b.querySelectorAll('rect[data-k]'); if(rects.length){ rects.forEach(r=>{ const g=L[r.dataset.k]; r.style.y=g.y+'px'; r.style.height=g.h+'px'; }); const lg=b.querySelector('.legend'); if(lg) lg.outerHTML=legendHTML(R); } else b.innerHTML=beakerInner(R); }
  const tp=$('#totalPill'); if(tp) tp.outerHTML=totalPillHTML(R);
  const wl=$('#warnList'); if(wl){ const html=warnListHTML(R); if (wl.innerHTML!==html) wl.innerHTML=html; }
  syncMixAlerts(R);
}

// ===== 화면: 리포트 =====
function viewReport(){
  const r=state.recipe; const t=TYPES[r.typeId]; const R=evaluate(r); const key=recipeKey(r);
  const ai = state.aiReport[key] || cacheGet('rep|'+hashStr(key));
  return topbar('리포트', 'mix', `<button class="btn text" data-act="save-recipe">저장</button>`) + `<div class="stack">
    <div class="stack" style="gap:10px"><div class="row" style="flex-wrap:wrap"><h2 style="font-size:20px">${esc(r.name)}</h2><span class="badge">${esc(t.name)} · 성분 ${R.items.length}개</span></div>
      <div class="grade3"><div class="g0bg ${R.grade[0]?'':'zero'}"><b>${R.grade[0]}</b><span>안심</span></div><div class="g1bg ${R.grade[1]?'':'zero'}"><b>${R.grade[1]}</b><span>주의</span></div><div class="g2bg ${R.grade[2]?'':'zero'}"><b>${R.grade[2]}</b><span>경고</span></div></div></div>
    <div class="card stack" style="gap:8px"><div class="row" style="color:var(--ok-fg)">${ic('leaf','s')}<h3 class="h3">예상 효능</h3></div><p>${esc(benefitLead(R,t))}</p>
      ${R.benefits.map(b=>`<div class="stack" style="gap:4px"><span class="xs muted">${esc(BENEFIT_TXT[b.tag]||b.tag)}</span><div class="wrap" style="gap:6px">${b.ids.slice(0,4).map(id=>ingChip(id)).join('')}</div></div>`).join('')}</div>
    <div class="card stack" style="gap:10px"><div class="row" style="color:var(--warn-fg)">${ic('warn','s')}<h3 class="h3">주의할 점</h3></div>
      ${R.cautions.filter(c=>c.lv!=='info').length ? R.cautions.filter(c=>c.lv!=='info').map(c=>`<div class="row" style="align-items:flex-start"><span class="badge ${c.lv==='bad'?'g2':'g1'}" style="flex-shrink:0">${c.lv==='bad'?'경고':'주의'}</span><p class="small"><b>${esc(c.t)}</b> — ${esc(c.x)}</p></div>`).join('') : `<p class="small muted">특별히 조심할 점을 찾지 못했어요. 새 배합은 팔 안쪽에 48시간 패치 테스트를 권해요.</p>`}
      ${R.cautions.filter(c=>c.lv==='info').map(c=>alertHTML('info',c.t,c.x)).join('')}</div>
    <div class="card stack" style="gap:8px"><div class="row" style="color:var(--ok-fg)">${ic('check','s')}<h3 class="h3">성분 궁합</h3></div>${R.compat.map(c=>`<p class="small row">${ic('check','xs')} ${esc(c.text)}</p>`).join('')}</div>
    <div class="card stack" style="gap:10px"><div class="row" style="color:var(--water-fg)">${ic('drop','s')}<h3 class="h3">피부 타입별 참고</h3></div>
      <div class="skin4">${[['건성','dry'],['중성','normal'],['지성','oily'],['민감','sens']].map(([n,k])=>`<div class="${R.skin[k][1]}bg" style="${state.skin===k?'outline:2px solid var(--primary);outline-offset:1px':''}"><b>${n}</b><span>${R.skin[k][0]}</span></div>`).join('')}</div>
      ${state.skin ? `<div class="tip">${ic('face','s')}<div><b>내 피부(${skinName()})</b> — ${esc(skinAdvice(R,state.skin))}</div></div>` : `<p class="xs muted">홈에서 「내 피부」를 고르면 맞춤 안내가 붙어요.</p>`}
      <p class="xs muted">규칙 기반 참고예요. 실제 피부 반응은 사람마다 달라요.</p></div>
    <div class="card stack" style="gap:10px" id="aiReportCard"><div class="between"><div class="row" style="color:var(--primary)">${ic('spark','s')}<h3 class="h3">AI 해설</h3></div>${aiOn() ? (state.aiBusy.report ? `<button class="btn text" data-act="ai-stop" data-k="report">${ic('stop','s')} 멈추기</button>` : `<button class="btn tonal" data-act="ai-report" ${aiLeft()?'':'disabled'}>${ai?'다시 듣기':'AI에게 자세히 듣기'}</button>`) : ''}</div>
      ${aiOn() ? `<div class="ai-box" id="aiReport">${ai?esc(ai):(state.aiBusy.report?'':`성분 DB 정보와 위의 확인 사항을 근거로 ${aiName()}가 풀어서 설명해요.${aiMode()==='builtin'?' 호출 1회를 써요.':''}`)}</div>${state.aiBusy.report&&!ai?`<span class="thinking"><i></i>생각하는 중…</span>`:''}` : aiOffHTML('AI 해설')}</div>
    <p class="footnote">정보 제공 목적의 참고 자료이며 피부과 진단이나 처방을 대체하지 않아요. 실제로 만들어 쓸 때는 팔 안쪽에 48시간 패치 테스트를 먼저 해요. 성분 설명은 대한화장품협회 성분사전 명칭을 기준으로 한 요약이에요.</p>
    <div class="grid2"><button class="btn outl" data-act="nav" data-to="mix" data-dir="back">배합 수정</button><button class="btn" data-act="nav" data-to="pack">용기 고르기</button></div>
  </div>`;
}
const recipeKey = r => r.typeId+'|'+r.items.map(i=>i.id+':'+i.pct).join(',');
function skinAdvice(R, k){
  const names = ids => ids.slice(0,3).join(', ');
  const it = R.items; const has=id=>it.some(i=>i.id===id);
  if (k==='sens'){ const bad=[...R.allergens, ...it.filter(i=>ING[i.id].r==='frag'&&!ING[i.id].a25).map(i=>i.id), ...(has('에탄올')?['에탄올']:[]), ...['레티놀','글라이콜릭애씨드','살리실릭애씨드','아스코빅애씨드'].filter(has)]; return bad.length ? `${names(bad)}이(가) 자극이 될 수 있어요. 빼거나 농도를 낮추고 패치 테스트를 꼭 하세요.` : '자극 성분이 눈에 띄지 않아요. 진정 성분(판테놀·알란토인·병풀)이 있으면 더 좋아요.'; }
  if (k==='oily'){ const heavy=it.filter(i=>['시어버터','코코넛오일','페트롤라툼','미네랄오일','아이소프로필미리스테이트'].includes(i.id)).map(i=>i.id); return R.groups.oil>=15||heavy.length ? `${heavy.length?names(heavy)+' 등 ':''}유분이 ${fmt(R.groups.oil)}%로 무겁게 느껴질 수 있어요. 오일을 줄이거나 스쿠알란 같은 가벼운 오일로 바꿔 보세요.` : '유분이 가벼워 지성 피부에 무난해요.'; }
  if (k==='dry'){ return R.groups.oil>=10||it.filter(i=>ING[i.id].r==='hum').reduce((s,i)=>s+i.pct,0)>=6 ? '보습제와 유분이 충분해 건조한 피부에 잘 맞아요.' : '보습이 부족할 수 있어요. 글리세린이나 히알루론산을 더하고 오일을 조금 올려 보세요.'; }
  return '중성 피부에는 대체로 무난해요. 계절에 따라 유분을 조절해 보세요.';
}
function reportPrompt(r, R){
  const t=TYPES[r.typeId];
  const lines = R.items.map(it=>{const g=ING[it.id]; return `- ${g.ko} (${g.inci}) ${fmt(it.pct)}% · 역할: ${ROLE[g.r].n} · 앱 등급: ${GRADE[g.g]}${g.a25?' · 알레르기 유발성분 25종':''} · 메모: ${g.d}`;}).join('\n');
  return `당신은 화장품 성분을 초보자에게 쉽게 설명하는 안내자입니다. 아래는 사용자가 앱에서 가상으로 배합한 ${t.name} 레시피와, 앱이 규칙으로 찾아낸 확인 사항입니다. 이 정보만 근거로 한국어 존댓말로 설명해 주세요.\n\n[레시피: ${r.name}]\n${lines}\n합계 ${fmt(R.total)}%\n\n[앱이 찾은 확인 사항]\n${R.cautions.map(c=>'- '+c.t+': '+c.x).join('\n')||'- 없음'}\n\n[형식]\n다음 4개 소제목을 정확히 이 순서로 한 줄씩 쓰고, 각 소제목 아래 2~3문장으로 답하세요. 마크다운 기호(#, *, -)는 쓰지 마세요. 전체 600자 이내.\n예상 효능\n주의할 점\n성분 궁합\n피부 타입별 참고\n\n[규칙]\n- 근거가 되는 성분 이름을 문장 안에 함께 적으세요.\n- 치료, 완치, 재생, 항염처럼 의약품처럼 들리는 표현은 쓰지 말고 "~에 도움을 줄 수 있어요" 수준으로 쓰세요.\n- 모르는 것은 "자료 없음"이라고 하세요.\n- 마지막 줄에 "이 설명은 정보 제공 목적이며 피부과 진단을 대체하지 않아요."를 넣으세요.`;
}
async function runAIReport(){
  const r=state.recipe; const R=evaluate(r); const key=recipeKey(r);
  const ctl = new AbortController(); state.ctl.report=ctl; state.aiBusy.report=true; render();
  try{
    const {text} = await aiCall('text', reportPrompt(r,R), {signal:ctl.signal, cache:false, onText:({text})=>{ const b=$('#aiReport'); if(b){ b.textContent=soften(text); const th=b.parentElement.querySelector('.thinking'); if(th) th.remove(); } }});
    state.aiReport[key]=soften(text); cacheSet('rep|'+hashStr(key), state.aiReport[key]);
  }catch(e){ if(e.text) state.aiReport[key]=soften(e.text)+'\n(중단됨)'; if(e.code!=='cancelled') toast(errMsg(e)); }
  state.aiBusy.report=false; if(state.screen==='report') render();
}


// ===== 완성 제품 평가 (규칙 기반 점수표) =====
const AX_N = {safety:'안전성', balance:'배합 균형', efficacy:'기능성', texture:'사용감', skin:'피부 맞춤', diy:'만들기 쉬움'};
const clamp5 = v => Math.max(1, Math.min(5, Math.round(v)));
function assess(r){
  const t=TYPES[r.typeId]; const R=evaluate(r); const it=R.items; const has=id=>it.some(i=>i.id===id); const pct=id=>(it.find(i=>i.id===id)||{pct:0}).pct;
  const byRole=x=>it.filter(i=>ING[i.id].r===x); const isC=(re)=>R.cautions.filter(c=>re.test(c.t));
  const ax={}, why={}, strengths=[], fixes=[];
  // 안전성
  let v=5; const g2=it.filter(i=>ING[i.id].g===2), g1=it.filter(i=>ING[i.id].g===1);
  v-=Math.min(2,g2.length); if (g1.length>=3) v-=1; if (isC(/보존제가 없어요/).length) v-=2; if (isC(/레티놀 \+ 산/).length) v-=1;
  const over=R.cautions.filter(c=>/권장 상한/.test(c.x)); v-=Math.min(2,over.length); if (R.allergens.length>=3) v-=1; if ((R.avoided||[]).length) v-=1;
  ax.safety=clamp5(v);
  why.safety = ax.safety>=4 ? (g2.length? '경고 성분이 있지만 상한 안에서 썼어요.' : '경고 성분과 상한 초과가 없어요.') : [g2.length?`경고 성분 ${g2.length}개`:'', over.length?`상한 초과 ${over.length}개`:'', isC(/보존제가 없어요/).length?'보존제 없음':'', (R.avoided||[]).length?'피하는 성분 포함':'', R.allergens.length>=3?`알레르기 유발성분 ${R.allergens.length}개`:''].filter(Boolean).join(' · ');
  // 배합 균형
  v=5; if (Math.abs(R.total-100)>0.5) v-=2; const outR=Object.keys(t.ranges).filter(g=>{ const [a,b]=t.ranges[g]; const x=R.groups[g]||0; return x<a-0.5||x>b+0.5; }); v-=Math.min(2,outR.length);
  if (isC(/유화제가 없어요/).length) v-=2; if (R.cautions.some(c=>/같은 역할은/.test(c.x))) v-=1; if (it.length<3) v-=1;
  ax.balance=clamp5(v);
  why.balance = ax.balance>=4 ? `${t.name} 권장 범위를 ${outR.length?'거의 ':''}지켰어요.` : [Math.abs(R.total-100)>0.5?`합계 ${fmt(R.total)}%`:'', outR.length?`범위 밖 그룹 ${outR.map(g=>GROUPN[g]).join('·')}`:'', isC(/유화제가 없어요/).length?'유화제 없음':'', it.length<3?'성분이 너무 적음':''].filter(Boolean).join(' · ');
  // 기능성
  const acts=[...byRole('act'),...byRole('uv')]; const surf=byRole('surf');
  if (t.kind==='anhydrous'){ v = 3; if (byRole('antiox').length) v+=1; if (acts.length) v+=1; if (t.rinse && !byRole('emul').length && !surf.length) v-=1; }
  else if (t.kind==='wash' || surf.length>=2){ v = surf.length? 3 : 1; if (surf.length && surf.every(i=>ING[i.id].g===0)) v+=1; if (byRole('hum').length||byRole('cond').length) v+=1; }
  else { v = [1,2,3,4,5][Math.min(4,acts.length)]; if (R.benefits.length>=3 && v<5) v+=1; if (acts.length && acts.every(i=>i.pct<0.2)) v-=1; }
  ax.efficacy=clamp5(v);
  why.efficacy = acts.length ? `기능 성분 ${acts.length}개(${acts.slice(0,3).map(i=>i.id).join(', ')}${acts.length>3?' 외':''})` : (surf.length ? `세정 성분 ${surf.length}개${surf.every(i=>ING[i.id].g===0)?', 모두 순한 편':''}` : (t.kind==='anhydrous' ? `오일·왁스 ${byRole('oil').length}종${byRole('antiox').length?' + 산화방지제':''}${t.rinse?(byRole('emul').length?' + 유화제(물로 헹굼)':' · 유화제가 없어 물로 잘 안 씻겨요'):''}` : '뚜렷한 기능 성분이 없어 기본 보습 위주예요.'));
  // 사용감
  v=3; const oil=R.groups.oil||0; const heavy=['페트롤라툼','미네랄오일','시어버터','코코넛오일','라놀린'].filter(has).reduce((s,id)=>s+pct(id),0);
  const okOil = !t.ranges.oil || (oil>=t.ranges.oil[0]-0.5 && oil<=t.ranges.oil[1]+0.5); if (okOil) v+=1;
  if (t.kind==='emulsion' && (byRole('thick').length||byRole('emul').length)) v+=1; if (t.kind==='aq' && byRole('thick').length) v+=1;
  if (heavy>10 && t.kind!=='anhydrous') v-=1; if (pct('에탄올')>10) v-=1; if (byRole('frag').reduce((s,i)=>s+i.pct,0)>1) v-=1;
  ax.texture=clamp5(v);
  const tex = t.kind==='wash'||surf.length>=2 ? (surf.reduce((s,i)=>s+i.pct,0)>=15?'풍성한 거품의':'부드러운 거품의') : t.kind==='anhydrous' ? (byRole('oil').some(i=>/왁스/.test(i.id))?'단단하게 발리는 밤 타입의':'오일리하고 윤기 나는') : oil>=25?'묵직하고 리치한':oil>=12?'부드럽고 촉촉한':oil>=3?'가볍고 산뜻한':'물처럼 가벼운';
  const finish = it.some(i=>/메티콘|실록세인/.test(i.id))?' 매끄러운 마무리':(byRole('powder').length?' 보송한 마무리':(pct('에탄올')>=5?' 산뜻하지만 살짝 건조할 수 있는 마무리':''));
  why.texture = `${tex} 질감${finish?','+finish:''}${byRole('frag').length?'':' · 무향'}`;
  // 피부 맞춤
  if (state.skin){ const sk=R.skin[state.skin]; v = sk[1]==='g0' ? (sk[0]==='잘 맞음'?5:4) : 2; if ((R.avoided||[]).length) v-=1; why.skin=`내 피부(${skinName()}): ${sk[0]}${(R.avoided||[]).length?' · 피하는 성분 포함':''}`; }
  else { const good=Object.values(R.skin).filter(x=>x[1]==='g0').length; v = good>=4?4:good>=2?3:2; why.skin='홈에서 「내 피부」를 고르면 나에게 맞춰 평가해요.'; }
  ax.skin=clamp5(v);
  // 만들기 쉬움
  const diyOk=it.filter(i=>ING[i.id].diy>=1).length; const ratio=it.length?diyOk/it.length:0; v = ratio>=0.9?5:ratio>=0.7?4:ratio>=0.5?3:ratio>=0.3?2:1; if (byRole('uv').length) v=Math.min(v,2);
  ax.diy=clamp5(v);
  why.diy = byRole('uv').length ? '선크림은 차단력을 확인할 수 없어 집에서 만들기를 권하지 않아요.' : (ratio>=0.9?'모든 성분을 초보용 원료로 구할 수 있어요.':`${it.length-diyOk}개 성분은 DIY 변환에서 대체되거나 빠져요.`);
  // 종합
  const Wt={safety:.3,balance:.25,efficacy:.15,texture:.1,skin:.1,diy:.1}; const score=Object.keys(Wt).reduce((s,k)=>s+ax[k]*Wt[k],0);
  const pts=Math.round(score*20); const letter = score>=4.5?'A+':score>=4?'A':score>=3.3?'B':score>=2.5?'C':'D';
  const verdict = letter==='A+' ? `군더더기 없이 잘 짜인 ${t.name}이에요. 이대로 만들어도 좋아요.` : letter==='A' ? `균형 잡힌 ${t.name}이에요. 아래 한두 가지만 손보면 더 좋아져요.` : letter==='B' ? `쓸 만한 ${t.name}이지만 보완할 점이 있어요.` : letter==='C' ? `기본은 갖췄지만 안전성이나 균형에서 고칠 점이 여럿이에요.` : `이대로 만들기엔 위험 요소가 있어요. 「보완할 점」부터 고쳐 주세요.`;
  // 강점 · 보완
  if (ax.safety>=4) strengths.push(g2.length?'경고 성분을 상한 안에서만 썼어요':'경고 성분과 상한 초과가 없어요');
  if (R.compat.some(c=>/보존제가 들어/.test(c.text))) strengths.push('물이 있는 배합에 보존제를 갖췄어요');
  if (!R.allergens.length && byRole('frag').length===0) strengths.push('향료와 알레르기 유발성분이 없어 민감 피부에도 부담이 적어요'); else if (!R.allergens.length) strengths.push('알레르기 유발성분 25종이 없어요');
  if (ax.balance>=4) strengths.push(`${t.name} 권장 범위에 맞는 비율이에요`);
  if (acts.length>=2) strengths.push(`${acts.slice(0,3).map(i=>i.id).join('·')} 등 기능 성분이 알차요`);
  if (ax.diy>=4 && !byRole('uv').length) strengths.push('초보용 원료로 그대로 만들 수 있어요');
  if (state.skin && ax.skin>=4) strengths.push(`${skinName()} 피부에 잘 맞는 구성이에요`);
  R.cautions.filter(c=>c.lv!=='info').slice(0,4).forEach(c=>fixes.push(`${c.t} — ${c.x}`));
  if (ax.efficacy<=2 && !(t.kind==='wash'||surf.length>=2)) fixes.push(`기능 성분이 없어요 — ${t.kind==='anhydrous'?'토코페롤 0.5%(산화 방지)나 바쿠치올 같은 지용성 성분을 더해 보세요.':t.rinse?'씻어내는 제품이라도 판테놀·알란토인 같은 진정 성분을 0.5% 정도 더해 보세요.':'나이아신아마이드 2~4%나 판테놀 1% 같은 검증된 성분을 하나 더해 보세요.'}`);
  if (state.skin && ax.skin<=2) fixes.push(`내 피부(${skinName()}) — ${skinAdvice(R,state.skin)}`);
  if (!fixes.length) fixes.push('크게 고칠 점이 없어요. 만든 뒤 팔 안쪽 48시간 패치 테스트만 잊지 마세요.');
  const fit = Object.entries(R.skin).filter(([k,x])=>x[1]==='g0').map(([k])=>({dry:'건성',normal:'중성',oily:'지성',sens:'민감'}[k]));
  return {ax, why, score, pts, letter, verdict, strengths:strengths.slice(0,4), fixes:fixes.slice(0,4), texture:why.texture, fit};
}
function assessHTML(r){
  const A=assess(r); const key=recipeKey(r); const ai=state.aiEval&&state.aiEval[key] || cacheGet('eval|'+hashStr(key));
  const lcls = A.letter[0]==='A'?'g0':A.letter==='B'?'g1':'g2';
  const dots = n => `<span class="dots" aria-label="${n}점">${[1,2,3,4,5].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
  return `<div class="card stack" style="gap:12px" id="evalCard">
    <div class="row" style="gap:14px;align-items:center"><div class="eval-letter ${lcls}"><b>${A.letter}</b><span>${A.pts}점</span></div><div class="stack" style="gap:4px;flex:1;min-width:0"><h3 class="h3">완성 제품 평가</h3><p class="small">${esc(A.verdict)}</p></div></div>
    <div class="eval-axes">${Object.keys(AX_N).map(k=>`<div class="eval-ax"><span class="n">${AX_N[k]}</span>${dots(A.ax[k])}<span class="w">${esc(A.why[k])}</span></div>`).join('')}</div>
    <div class="eval-cols">
      <div class="stack" style="gap:6px"><b class="small" style="color:var(--ok-fg)">${ic('check','xs')} 강점</b>${A.strengths.length?A.strengths.map(x=>`<p class="small row" style="align-items:flex-start;gap:6px">${ic('check','xs')}<span>${esc(x)}</span></p>`).join(''):'<p class="small muted">아직 뚜렷한 강점이 없어요.</p>'}</div>
      <div class="stack" style="gap:6px"><b class="small" style="color:var(--warn-fg)">${ic('warn','xs')} 보완할 점</b>${A.fixes.map(x=>`<p class="small row" style="align-items:flex-start;gap:6px">${ic('warn','xs')}<span>${esc(x)}</span></p>`).join('')}</div>
    </div>
    <div class="tip">${ic('drop','s')}<div><b>예상 사용감</b> — ${esc(A.texture)}<br><b>잘 맞는 피부</b> — ${A.fit.length?esc(A.fit.join(', ')):'특별히 권할 피부 타입이 없어요'}</div></div>
    ${aiOn() ? `<div class="between"><span class="small muted">${ai?'AI 총평':'AI에게 한 번 더 물어볼까요?'}</span>${state.aiBusy.eval?`<button class="btn text" data-act="ai-stop" data-k="eval">${ic('stop','s')} 멈추기</button>`:`<button class="btn tonal" style="min-height:38px;padding:0 14px;font-size:13px" data-act="ai-eval" ${aiLeft()?'':'disabled'}>${ic('spark','s')} ${ai?'다시 듣기':'AI 총평 듣기'}</button>`}</div><div class="ai-box small" id="aiEval">${ai?esc(ai):''}</div>${state.aiBusy.eval&&!ai?`<span class="thinking"><i></i>평가하는 중…</span>`:''}` : ''}
    <p class="footnote">이 앱의 규칙으로 매긴 참고용 점수예요. 실제 품질은 원료 등급·제조 환경·보관에 따라 달라지고, 피부 반응은 사람마다 달라요.</p>
  </div>`;
}
function evalPrompt(r, A, R){
  const t=TYPES[r.typeId];
  return `당신은 화장품 배합을 초보자에게 평가해 주는 조제 전문가입니다. 아래는 사용자가 앱에서 가상으로 배합한 ${t.name}과, 앱이 규칙으로 매긴 점수표입니다. 이 정보만 근거로 한국어 존댓말로 총평을 써 주세요.\n\n[레시피: ${r.name}]\n${R.items.map(i=>`- ${i.id} (${ING[i.id].inci}) ${fmt(i.pct)}% · ${ROLE[ING[i.id].r].n} · 앱 등급 ${GRADE[ING[i.id].g]}`).join('\n')}\n\n[앱 점수표] 종합 ${A.letter}(${A.pts}점)\n${Object.keys(AX_N).map(k=>`- ${AX_N[k]} ${A.ax[k]}/5: ${A.why[k]}`).join('\n')}\n[강점] ${A.strengths.join(' / ')||'없음'}\n[보완할 점] ${A.fixes.join(' / ')}\n\n[형식] 소제목 없이 3개 문단, 전체 400자 이내. 1문단: 이 제품이 어떤 사람에게 어떤 느낌일지. 2문단: 가장 먼저 고칠 한 가지와 구체적인 수치. 3문단: 실제로 만들 때 주의할 점 한 가지. 마크다운 기호는 쓰지 말고, 치료·완치 같은 의약품 표현은 피하고, 모르는 것은 "자료 없음"이라고 하세요.`;
}
async function runAIEval(){
  const r=state.recipe; const R=evaluate(r); const A=assess(r); const key=recipeKey(r); const ck='eval|'+hashStr(key);
  state.aiEval=state.aiEval||{}; const ctl=new AbortController(); state.ctl.eval=ctl; state.aiBusy.eval=true; render();
  try{
    const {text}=await aiCall('text', evalPrompt(r,A,R), {signal:ctl.signal, onText:({text})=>{ const b=$('#aiEval'); if(b){ b.textContent=soften(text); const th=b.parentElement.querySelector('.thinking'); if(th) th.remove(); } }});
    state.aiEval[key]=soften(text); cacheSet(ck, state.aiEval[key]);
  }catch(e){ if(e.text) state.aiEval[key]=soften(e.text)+'\n(중단됨)'; if(e.code!=='cancelled') toast(errMsg(e)); }
  state.aiBusy.eval=false; if(state.screen==='done') render();
}
// ===== 내 화장대 (루틴 궁합 검사) =====
const ORDER_RANK = {foam:0,oil:0,micellar:0,bodywash:0,shampoo:0,treatment:0.5,washoff:0.5,toner:1,essence:2,sheet:2.5,lotion:3,bodylotion:3,cream:4,lipbalm:5,liptint:5,sun:6,cushion:7};
const NAME_RANK = [[/클렌징|폼|워시|샴푸|세안|클렌저|비누/,0],[/트리트먼트|린스|컨디셔너|워시오프|팩/,0.5],[/토너|스킨|미스트|부스터|워터/,1],[/세럼|에센스|앰플|스팟/,2],[/시트|마스크/,2.5],[/로션|에멀전|에멀젼|플루이드/,3],[/크림|밤|버터/,4],[/립/,5],[/선|썬|UV|SPF|차단/i,6],[/쿠션|파운데이션|틴트|메이크업/,7]];
function orderRank(p){ for (const [re,v] of NAME_RANK) if (re.test(p.name||'')) return v; return ORDER_RANK[p.S.guess] ?? 3; }
function analysisProducts(){ return state.saved.filter(s=>s.k==='analysis').map(s=>{ const items=parseList(s.raw).map((n,i)=>({name:n,id:findIng(n),pos:i})); return {at:s.at,name:s.name,items,S:analysisSummary(items)}; }); }
function routineSlot(slot){ const all=analysisProducts(); return (state.routine[slot]||[]).map(at=>all.find(p=>p.at===at)).filter(Boolean); }
function saveRoutine(){ store.set('lab.routine', state.routine); persistCloud(); }
const pNames = ps => ps.map(p=>`「${p.name}」`).join(', ');
function routineCheck(prods, slot){
  const issues=[]; const has=(p,re)=>p.items.some(i=>i.id&&re.test(i.id)); const hasId=(p,id)=>p.items.some(i=>i.id===id); const rinse=p=>!!(p.S.guess&&TYPES[p.S.guess]&&TYPES[p.S.guess].rinse);
  const RET=/^레티|하이드록시피나콜론/, ACID=/글라이콜릭애씨드|락틱애씨드|살리실릭애씨드|만델릭애씨드|베타인살리실레이트|락토바이오닉|아젤라익애씨드|글루코노락톤/;
  const ret=prods.filter(p=>has(p,RET)), acid=prods.filter(p=>has(p,ACID)), vitc=prods.filter(p=>hasId(p,'아스코빅애씨드')), nia=prods.filter(p=>hasId(p,'나이아신아마이드'));
  const uv=prods.filter(p=>p.items.some(i=>i.id&&ING[i.id].r==='uv')), frag=prods.filter(p=>p.items.some(i=>i.id&&(ING[i.id].r==='frag'||ING[i.id].a25))), eth=prods.filter(p=>hasId(p,'에탄올'));
  const cleansers=prods.filter(rinse), leave=prods.filter(p=>!rinse(p)); const avoided=prods.map(p=>({p,ids:p.S.avoided||[]})).filter(x=>x.ids.length);
  if (ret.length && acid.length && (ret.length+acid.length>ret.filter(p=>acid.includes(p)).length)) issues.push({lv:'bad',t:'레티놀 + 산 성분',x:`${pNames(ret)}의 레티놀 계열과 ${pNames(acid)}의 각질 성분을 같은 루틴에 쓰면 자극이 커져요. 아침·저녁으로 나누거나 격일로 쓰세요.`});
  if (acid.length>=2) issues.push({lv:'warn',t:`각질 성분 제품 ${acid.length}개`,x:`${pNames(acid)} — 각질 성분이 겹치면 장벽이 약해져요. 한 루틴엔 하나만 남기세요.`});
  if (ret.length && vitc.length && !ret.some(p=>vitc.includes(p))) issues.push({lv:'warn',t:'레티놀 + 순수 비타민C',x:`${pNames(vitc)}의 비타민C는 아침, ${pNames(ret)}의 레티놀은 저녁으로 나누는 편이 무난해요.`});
  if (slot==='am' && ret.length) issues.push({lv:'warn',t:'아침 루틴의 레티놀',x:`${pNames(ret)} — 레티놀 계열은 빛에 약하고 광과민이 있어 저녁에 쓰는 편이 좋아요. 아침에 쓴다면 자외선 차단제를 꼭 바르세요.`});
  if (slot==='pm' && uv.length) issues.push({lv:'info',t:'저녁 루틴의 자외선 차단제',x:`${pNames(uv)} — 자외선 차단제는 아침 루틴의 마지막 단계에 쓰세요.`});
  if (slot==='am' && !uv.length && leave.length) issues.push({lv:'info',t:'자외선 차단제가 없어요',x:'아침 루틴 마지막에 자외선 차단제를 더하면 미백·레티놀 성분의 효과를 지키고 자극을 줄여요.'});
  if (frag.length>=2) issues.push({lv:state.skin==='sens'?'warn':'info',t:`향 성분 제품 ${frag.length}개`,x:`${pNames(frag)} — 향료·알레르기 유발성분이 여러 제품에 겹쳐요.${state.skin==='sens'?' 민감 피부라면 하나는 무향으로 바꿔 보세요.':''}`});
  if (eth.length>=2) issues.push({lv:'info',t:`에탄올 제품 ${eth.length}개`,x:`${pNames(eth)} — 알코올이 겹치면 건조해질 수 있어요.`});
  if (nia.length>=3) issues.push({lv:'info',t:`나이아신아마이드 제품 ${nia.length}개`,x:'총량이 많아지면 붉어지거나 따가울 수 있어요. 두 개 정도면 충분해요.'});
  if (vitc.length && nia.length && !vitc.some(p=>nia.includes(p))) issues.push({lv:'info',t:'비타민C + 나이아신아마이드',x:'요즘은 함께 써도 대체로 괜찮다고 보지만, 따가우면 아침·저녁으로 나누세요.'});
  if (cleansers.length>=2) issues.push({lv:'info',t:`세정 단계 ${cleansers.length}개`,x:`${pNames(cleansers)} — 세정을 여러 번 하면 장벽이 약해질 수 있어요.${slot==='am'?' 아침엔 물 세안이나 약산성 폼 하나로 충분해요.':''}`});
  if (avoided.length) issues.push({lv:'warn',t:'피하는 성분 포함',x:avoided.map(x=>`${x.p.name}(${x.ids.join(', ')})`).join(' · ')});
  const count={}; prods.forEach(p=>{ new Set(p.items.map(i=>i.id).filter(Boolean)).forEach(id=>{ (count[id]=count[id]||[]).push(p.name); }); });
  const overlaps=Object.entries(count).filter(([id,ps])=>ps.length>=2 && id!=='정제수').map(([id,ps])=>({id,ps})).sort((a,b)=>(b.ps.length-a.ps.length)||((ING[b.id].g+(ING[b.id].a25?1:0))-(ING[a.id].g+(ING[a.id].a25?1:0)))).slice(0,10);
  const order=[...prods].sort((a,b)=>(orderRank(a)-orderRank(b))||(a.items.length-b.items.length));
  const lv = issues.some(i=>i.lv==='bad')?'bad':issues.some(i=>i.lv==='warn')?'warn':'ok';
  const head = lv==='bad'?'조심해서 조합하세요':lv==='warn'?'확인할 점이 있어요':'무난한 조합이에요';
  return {issues, overlaps, order, lv, head};
}
function routineHTML(){
  const slot=state.routineSlot||'am'; const prods=routineSlot(slot); const all=analysisProducts();
  const C=prods.length?routineCheck(prods,slot):null;
  const slotN={am:'아침',pm:'저녁'}[slot];
  return `<div class="seg two"><button class="${slot==='am'?'sel':''}" data-act="routine-slot" data-v="am">☀ 아침 루틴 <span class="muted">${(state.routine.am||[]).length}</span></button><button class="${slot==='pm'?'sel':''}" data-act="routine-slot" data-v="pm">☾ 저녁 루틴 <span class="muted">${(state.routine.pm||[]).length}</span></button></div>
  <div class="card stack" style="gap:10px"><div class="between"><h2 class="h3">${slotN}에 쓰는 제품 <span class="muted" style="font-weight:500">${prods.length}</span></h2><button class="btn tonal sm" style="min-height:34px;padding:0 12px;font-size:13px" data-act="routine-pick" data-slot="${slot}">${ic('plus','xs')} 제품 추가</button></div>
    ${prods.length ? `<ol class="routine-list">${C.order.map((p,i)=>{ const t=p.S.guess&&TYPES[p.S.guess]; const key=p.items.filter(x=>x.id&&['act','uv'].includes(ING[x.id].r)).slice(0,3); return `<li><span class="no">${i+1}</span><button class="info" data-act="routine-open" data-at="${p.at}"><b>${esc(p.name)}</b><small>${t?esc(t.name):esc(p.S.character)} · 성분 ${p.items.length}개${key.length?' · '+esc(key.map(x=>x.id).join(', ')):''}</small><span class="wrap" style="gap:3px;margin-top:2px">${gradeBadges(p.S.grade)}</span></button><button class="iconbtn sm" data-act="routine-remove" data-at="${p.at}" data-slot="${slot}" aria-label="빼기">${ic('x','s')}</button></li>`; }).join('')}</ol>
    <p class="xs muted">순서는 제형이 가벼운 것부터(세정 → 토너 → 에센스 → 로션·크림 → 밤 → 자외선 차단제) 앱이 제안한 거예요.</p>` : `<div class="empty">${all.length?`「제품 추가」로 분석해 둔 제품을 ${slotN} 루틴에 넣어 보세요.`:'먼저 「분석하기」에서 쓰는 화장품의 전성분을 읽고 저장해 두면 여기서 고를 수 있어요.'}</div>${all.length?'':`<button class="btn tonal" data-act="nav" data-to="analyze">${ic('camera','s')} 분석하러 가기</button>`}`}
  </div>
  ${C ? `<div class="card stack" style="gap:10px"><div class="row" style="gap:10px"><span class="badge ${C.lv==='ok'?'g0':C.lv==='warn'?'g1':'g2'}" style="font-size:13px;padding:4px 10px">${ic(C.lv==='ok'?'check':'warn','xs')} ${C.head}</span><span class="xs muted">${prods.length}개 제품을 함께 썼을 때</span></div>
    ${C.issues.length?C.issues.map(i=>alertHTML(i.lv,i.t,i.x)).join(''):alertHTML('ok','','제품 사이에 부딪히는 성분이 없어요.')}
    <p class="xs muted">규칙: 레티놀+산, 산 성분 중복, 레티놀+비타민C, 시간대(레티놀은 저녁·자외선 차단제는 아침), 향·알코올·나이아신아마이드 누적, 세정 단계 수, 내 피하는 성분.</p></div>
  <div class="card stack" style="gap:8px"><h3 class="h3">겹치는 성분</h3>${C.overlaps.length?`<div class="wrap">${C.overlaps.map(o=>`<span class="row" style="gap:4px">${ingChip(o.id)}<span class="badge">×${o.ps.length}</span></span>`).join('')}</div><p class="xs muted">같은 성분이 여러 제품에 들어 있어요. 기능 성분이 겹치면 농도가 더해지는 셈이라, 주의·경고 등급은 한 제품으로 줄여 보세요.</p>`:`<p class="small muted">정제수 말고는 겹치는 성분이 없어요.</p>`}</div>` : ''}
  <p class="footnote">제품 사이 궁합은 성분 이름만으로 판단한 참고 정보예요. 실제 농도와 제형에 따라 달라지고, 피부 반응은 사람마다 달라요.</p>`;
}
function routinePickHTML(slot){
  const all=analysisProducts(); const ids=new Set(state.routine[slot]||[]); const slotN={am:'아침',pm:'저녁'}[slot];
  return `<div class="between"><div><h2 class="h2" style="font-size:18px">${slotN} 루틴에 넣을 제품</h2><p class="small muted">분석해 둔 제품 ${all.length}개 중에서 고르세요.</p></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  ${all.length?`<div class="avoid-list">${all.map(p=>`<div class="prow"><button class="info" data-act="routine-toggle" data-at="${p.at}" data-slot="${slot}"><span class="chk ${ids.has(p.at)?'on':''}">${ids.has(p.at)?ic('check','xs'):''}</span><span class="t"><span class="n">${esc(p.name)}</span><small>${esc(p.S.character)} · 성분 ${p.items.length}개</small></span></button></div>`).join('')}</div>`:`<div class="empty">아직 분석해 둔 제품이 없어요.</div><button class="btn tonal" data-act="nav" data-to="analyze">${ic('camera','s')} 분석하러 가기</button>`}
  <div class="sheet-actions" style="grid-template-columns:1fr"><button class="btn" data-act="close-sheets">완료</button></div>`;
}
function slotPickHTML(at){
  return `<div class="between"><div><h2 class="h2" style="font-size:18px">언제 쓰는 제품인가요?</h2><p class="small muted">내 화장대에 넣어 두면 다른 제품과의 궁합을 확인할 수 있어요.</p></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
  <div class="stack" style="gap:8px"><button class="btn tonal" data-act="routine-put" data-at="${at}" data-slot="am">☀ 아침에 써요</button><button class="btn tonal" data-act="routine-put" data-at="${at}" data-slot="pm">☾ 저녁에 써요</button><button class="btn" data-act="routine-put" data-at="${at}" data-slot="both">아침·저녁 둘 다</button></div>`;
}
function ensureAnalysisSaved(){ const a=state.analysis; if(!a.items) return null; let s=state.saved.find(x=>x.k==='analysis'&&x.raw===a.raw); if(!s){ state.saved.unshift({k:'analysis',name:a.name||(a.items[0]?a.items[0].name+' 외 '+(a.items.length-1)+'개':'분석'),raw:a.raw,n:a.items.length,at:Date.now()}); persistSaved(); s=state.saved[0]; } return s.at; }

// ===== 배합 비교 (A/B) =====
function compareSide(s){
  if (!s) return null;
  if (s.k==='recipe'){ const R=evaluate(s); return {kind:'recipe',name:s.name,type:TYPES[s.typeId]?TYPES[s.typeId].name:'',items:R.items.map(i=>({id:i.id,pct:i.pct})),R,A:assess(s),grade:R.grade,pack:s.pack,at:s.at}; }
  const items=parseList(s.raw).map((n,i)=>({name:n,id:findIng(n),pos:i})); const S=analysisSummary(items);
  return {kind:'analysis',name:s.name,type:S.character,items:items.filter(i=>i.id).map(i=>({id:i.id,pos:i.pos})),S,grade:S.grade,at:s.at};
}
function radarSVG(A,B){
  const keys=Object.keys(AX_N); const cx=110,cy=100,r=64; const pt=(i,v)=>{ const a=-Math.PI/2+i*Math.PI*2/keys.length; const rr=r*(v/5); return [cx+Math.cos(a)*rr, cy+Math.sin(a)*rr]; };
  const poly=ax=>keys.map((k,i)=>pt(i,ax[k]).map(n=>n.toFixed(1)).join(',')).join(' ');
  const rings=[1,2,3,4,5].map(v=>`<polygon points="${keys.map((k,i)=>pt(i,v).map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="${v===5?1.2:0.6}"/>`).join('');
  const spokes=keys.map((k,i)=>{ const [x,y]=pt(i,5); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="0.6"/>`; }).join('');
  const labels=keys.map((k,i)=>{ const [x,y]=pt(i,6.15); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10.5" fill="var(--muted)">${AX_N[k]}</text>`; }).join('');
  return `<svg viewBox="0 0 220 200" class="radar" role="img" aria-label="6개 항목 비교"><g>${rings}${spokes}</g><polygon points="${poly(A.ax)}" fill="var(--primary)" fill-opacity=".22" stroke="var(--primary)" stroke-width="2"/><polygon points="${poly(B.ax)}" fill="var(--secondary)" fill-opacity=".18" stroke="var(--secondary)" stroke-width="2" stroke-dasharray="4 3"/>${labels}</svg>`;
}
function viewCompare(){
  const [sa,sb]=state.compare.sel.map(at=>state.saved.find(s=>s.at===at)); const A=compareSide(sa), B=compareSide(sb);
  if (!A||!B) return topbar('비교','saved') + `<div class="stack"><div class="empty">보관함에서 두 개를 골라 주세요.</div><button class="btn tonal" data-act="nav" data-to="saved" data-dir="back">보관함으로</button></div>`;
  const ids=(s)=>new Set(s.items.map(i=>i.id)); const ia=ids(A), ib=ids(B);
  const common=[...ia].filter(id=>ib.has(id)), onlyA=[...ia].filter(id=>!ib.has(id)), onlyB=[...ib].filter(id=>!ia.has(id));
  const pctOf=(s,id)=>{ const it=s.items.find(i=>i.id===id); return it&&it.pct!=null?fmt(it.pct)+'%':null; };
  const both=A.kind==='recipe'&&B.kind==='recipe';
  const head=(s,cls)=>`<div class="cmp-head ${cls}"><div class="tag">${cls==='a'?'A':'B'}</div><b>${esc(s.name)}</b><small>${esc(s.type)}${s.kind==='recipe'?` · 성분 ${s.items.length}개`:` · 성분 ${s.items.length}개 매칭`}</small><div class="wrap" style="gap:4px;justify-content:center">${s.A?`<span class="badge ${s.A.letter[0]==='A'?'g0':s.A.letter==='B'?'g1':'g2'}">평가 ${s.A.letter} · ${s.A.pts}점</span>`:''}${gradeBadges(s.grade)}</div></div>`;
  const dots = n => `<span class="dots">${[1,2,3,4,5].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
  const cmpChip=(id)=>{ const pa=pctOf(A,id), pb=pctOf(B,id); return `<span class="row" style="gap:4px">${ingChip(id)}${pa||pb?`<span class="badge num">${pa||'–'} / ${pb||'–'}</span>`:''}</span>`; };
  return topbar('배합 비교','saved') + `<div class="stack">
    <div class="cmp-grid">${head(A,'a')}${head(B,'b')}</div>
    ${both ? `<div class="card stack" style="gap:10px"><div class="between"><h3 class="h3">평가 6개 항목</h3><span class="xs"><span class="lg-a">━ A</span> <span class="lg-b">╌ B</span></span></div>
      <div class="cmp-radar">${radarSVG(A.A,B.A)}<div class="stack" style="gap:8px;flex:1;min-width:0">${Object.keys(AX_N).map(k=>`<div class="cmp-ax"><span class="n">${AX_N[k]}</span><span class="row" style="gap:6px"><span class="lg-a">A</span>${dots(A.A.ax[k])}</span><span class="row" style="gap:6px"><span class="lg-b">B</span>${dots(B.A.ax[k])}</span>${A.A.ax[k]!==B.A.ax[k]?`<span class="xs ${A.A.ax[k]>B.A.ax[k]?'lg-a':'lg-b'}">${A.A.ax[k]>B.A.ax[k]?'A':'B'} +${Math.abs(A.A.ax[k]-B.A.ax[k])}</span>`:`<span class="xs muted">같음</span>`}</div>`).join('')}</div></div>
      <div class="cmp-grid"><div class="tip" style="margin:0"><div><b>A</b> — ${esc(A.A.verdict)}<br><span class="muted">${esc(A.A.texture)}</span></div></div><div class="tip" style="margin:0"><div><b>B</b> — ${esc(B.A.verdict)}<br><span class="muted">${esc(B.A.texture)}</span></div></div></div></div>
    <div class="card stack" style="gap:8px"><h3 class="h3">구성 비율</h3><div class="cmp-grid"><div class="stack" style="gap:4px"><span class="xs lg-a">A</span>${compositionBar(A.R.groups)}</div><div class="stack" style="gap:4px"><span class="xs lg-b">B</span>${compositionBar(B.R.groups)}</div></div></div>` : `
    <div class="card stack" style="gap:8px"><h3 class="h3">역할 구성</h3><div class="cmp-grid"><div class="stack" style="gap:4px"><span class="xs lg-a">A</span>${A.kind==='recipe'?compositionBar(A.R.groups):compositionHTML(A.S.matched)}</div><div class="stack" style="gap:4px"><span class="xs lg-b">B</span>${B.kind==='recipe'?compositionBar(B.R.groups):compositionHTML(B.S.matched)}</div></div></div>`}
    <div class="card stack" style="gap:10px"><h3 class="h3">성분 차이 <span class="muted" style="font-weight:500">공통 ${common.length} · A만 ${onlyA.length} · B만 ${onlyB.length}</span></h3>
      <div class="stack" style="gap:6px"><b class="small">공통 ${both?'<span class="muted" style="font-weight:400">(A / B 비율)</span>':''}</b>${common.length?`<div class="wrap">${common.map(cmpChip).join('')}</div>`:'<p class="small muted">공통 성분이 없어요.</p>'}</div>
      <div class="cmp-grid"><div class="stack" style="gap:6px"><b class="small lg-a">A에만</b>${onlyA.length?`<div class="wrap">${onlyA.map(id=>{ const p=pctOf(A,id); return `<span class="row" style="gap:4px">${ingChip(id)}${p?`<span class="badge num">${p}</span>`:''}</span>`; }).join('')}</div>`:'<p class="small muted">없음</p>'}</div>
      <div class="stack" style="gap:6px"><b class="small lg-b">B에만</b>${onlyB.length?`<div class="wrap">${onlyB.map(id=>{ const p=pctOf(B,id); return `<span class="row" style="gap:4px">${ingChip(id)}${p?`<span class="badge num">${p}</span>`:''}</span>`; }).join('')}</div>`:'<p class="small muted">없음</p>'}</div></div></div>
    <div class="grid2"><button class="btn outl" data-act="load-at" data-at="${A.at}">A 열기</button><button class="btn outl" data-act="load-at" data-at="${B.at}">B 열기</button></div>
    <button class="btn text" data-act="compare-reset">다른 조합 고르기</button>
  </div>`;
}

// ===== 안내 투어 (배합 화면) =====
const TOUR_STEPS = [
  {sel:'.palette-host .palette, [data-act="open-palette"]', t:'1 · 성분 넣기', x:'여기서 성분을 검색해 비커에 넣어요. 성분 이름을 누르면 카드에서 설명을 읽고 「비커에 넣기」를 고를 수 있어요.'},
  {sel:'#rows', t:'2 · 비율 맞추기', x:'슬라이더를 끌거나 숫자를 눌러 직접 입력해요. 「정제수로 100% 맞추기」를 켜 두면 나머지를 정제수가 채워요.'},
  {sel:'#totalPill', t:'3 · 합계', x:'헤더의 합계가 100%가 되면 초록으로 바뀌어요. 손을 뗄 때 확인 사항이 이 아래에 알림으로 떠요.'},
  {sel:'[data-act="recommend"]', t:'4 · 추천 비율', x:'막막하면 이 버튼으로 넣은 성분을 권장 범위에 맞춰 자동으로 배분해요. 「권장 범위」에서 기준도 볼 수 있어요.'},
  {sel:'[data-act="to-report"]', t:'5 · 리포트 보기', x:'다 됐으면 효능·부작용 리포트 → 용기 고르기 → 완성 카드와 평가로 이어져요.'},
];
const TOUR = {i:-1};
function tourTarget(step){ return [...document.querySelectorAll(step.sel)].find(el=>el.offsetParent!==null && el.getBoundingClientRect().width>0); }
function startTour(){ TOUR.i=0; showTourStep(); }
function endTour(){ TOUR.i=-1; const o=$('#tour'); if(o) o.hidden=true; store.set('lab.tour', 1); }
function showTourStep(){
  const o=$('#tour'); if(!o) return; const step=TOUR_STEPS[TOUR.i]; if(!step){ endTour(); return; }
  const el=tourTarget(step); if(!el){ TOUR.i++; showTourStep(); return; }
  el.scrollIntoView({block:'center', behavior:'instant'});
  const r=el.getBoundingClientRect(); const pad=8; const vw=innerWidth, vh=innerHeight;
  const last=TOUR.i===TOUR_STEPS.length-1;
  o.hidden=false;
  o.innerHTML=`<div class="tour-hole" style="left:${Math.max(4,r.left-pad)}px;top:${Math.max(4,r.top-pad)}px;width:${Math.min(vw-8,r.width+pad*2)}px;height:${Math.min(vh-8,r.height+pad*2)}px"></div>
  <div class="tour-card" id="tourCard"><div class="between"><b>${esc(step.t)}</b><span class="xs muted">${TOUR.i+1} / ${TOUR_STEPS.length}</span></div><p class="small">${esc(step.x)}</p><div class="row" style="justify-content:flex-end;gap:6px"><button class="btn text" data-act="tour-skip">건너뛰기</button><button class="btn" style="min-height:40px;padding:0 16px" data-act="tour-next">${last?'시작하기':'다음'}</button></div></div>`;
  const card=$('#tourCard'); const ch=card.offsetHeight, cw=Math.min(340, vw-32);
  let top = r.bottom+pad+12; if (top+ch>vh-16) top = r.top-pad-12-ch; if (top<16) top = Math.min(vh-ch-16, Math.max(16, r.bottom+pad+12));
  let left = Math.min(vw-cw-16, Math.max(16, r.left+r.width/2-cw/2));
  card.style.top=top+'px'; card.style.left=left+'px'; card.style.width=cw+'px';
}
function maybeStartTour(){ if (state.screen!=='mix' || !state.recipe) return; if (store.get('lab.tour',0) && !state._tourAsk) return; state._tourAsk=false; setTimeout(startTour, 450); }

// ===== 화면: 용기·포장 =====
function viewPack(){
  const r=state.recipe; const t=TYPES[r.typeId]; const p=r.pack; const R=evaluate(r);
  const tips=[]; const has=id=>R.items.some(i=>i.id===id);
  const light=['아스코빅애씨드','레티놀','레티닐팔미테이트','로즈힙열매오일'].filter(has);
  if (light.length) tips.push(`빛에 약한 성분(${light.join(', ')})이 있어 불투명 용기가 좋아요.`);
  if (p.shape==='jar' && R.groups.water>0) tips.push('손이 닿는 자는 오염되기 쉬워요. 스패출러를 쓰거나 펌프를 고려하세요.');
  if (R.items.some(i=>ING[i.id].r==='frag' && /오일/.test(i.id)) && p.material==='pet') tips.push('에센셜오일은 PET를 약하게 할 수 있어요. 유리를 고려하세요.');
  if (t.kind==='anhydrous') tips.push('물이 없는 제형이라 자·틴·종이 스틱 모두 괜찮아요.');
  if (p.material==='alu' && ['시트릭애씨드','글라이콜릭애씨드','락틱애씨드','아스코빅애씨드'].some(has)) tips.push('산성 내용물은 코팅 없는 알루미늄과 반응할 수 있어요.');
  return topbar('용기·포장', 'report', `<span class="small muted">3 / 4 단계</span>`) + `<div class="stack">
    <div class="preview" style="background:color-mix(in srgb, ${p.color} 14%, var(--surface2))"><span class="tag">미리보기</span>${containerSVG(p, r.name)}</div>
    <div class="stack" style="gap:8px"><h2 class="h3">용기 형태</h2><div class="wrap">${t.pack.shapes.map(s=>`<button class="chip ${p.shape===s?'sel':''}" data-act="pack" data-k="shape" data-v="${s}">${p.shape===s?ic('check','xs'):''}${SHAPES[s]}</button>`).join('')}</div></div>
    <div class="stack" style="gap:8px"><h2 class="h3">재질</h2><div class="wrap">${t.pack.materials.map(m=>`<button class="chip ${p.material===m?'sel':''}" data-act="pack" data-k="material" data-v="${m}">${p.material===m?ic('check','xs'):''}${MATS[m].n}</button>`).join('')}</div>
      ${alertHTML('info','',MATS[p.material].why)}${tips.map(x=>alertHTML('warn','',x)).join('')}</div>
    <div class="stack" style="gap:8px"><h2 class="h3">용량</h2><div class="seg" style="grid-template-columns:repeat(${t.pack.volumes.length},minmax(0,1fr))">${t.pack.volumes.map(v=>`<button class="${p.volume===v?'sel':''}" data-act="pack" data-k="volume" data-v="${v}">${v}</button>`).join('')}</div></div>
    <div class="stack" style="gap:10px"><h2 class="h3">라벨</h2><div class="field box"><label for="nameIn">제품 이름</label><input id="nameIn" type="text" maxlength="24" value="${esc(r.name)}"></div>
      <div class="row"><span class="small muted" style="width:56px">스타일</span>${Object.entries(LABEL_STYLES).map(([k,n])=>`<button class="chip ${(p.label||'minimal')===k?'sel':''}" data-act="pack" data-k="label" data-v="${k}">${(p.label||'minimal')===k?ic('check','xs'):''}${n}</button>`).join('')}</div>
      <div class="row"><span class="small muted" style="width:56px">라벨 색</span>${LABEL_COLORS.map(c=>`<button class="sw ${p.color===c?'sel':''}" data-act="pack" data-k="color" data-v="${c}" style="background:${c}" aria-label="라벨 색 ${c}"></button>`).join('')}</div></div>
    <button class="btn lg wide" data-act="nav" data-to="done">완성 카드 만들기 ${ic('chev','s')}</button>
  </div>`;
}

// ===== 화면: 완성 =====
function viewDone(){
  const r=state.recipe; const t=TYPES[r.typeId]; const R=evaluate(r); const key=recipeKey(r);
  const keyIngs = [...R.items].filter(i=>!['water','pres','thick','ph','chel'].includes(ING[i.id].r)).sort((a,b)=>b.pct-a.pct).slice(0,4);
  const sim = state.aiSimilar[key] || cacheGet('sim|'+hashStr(key)); const diy = diyConvert(r); const offline = similarOffline(r, R);
  const q = encodeURIComponent(`${t.name} ${keyIngs.slice(0,3).map(i=>i.id).join(' ')}`);
  return topbar('완성', 'pack', `<button class="btn text" data-act="nav" data-to="home">처음으로</button>`) + `<div class="stack">
    <div class="hero" style="background:linear-gradient(165deg, color-mix(in srgb, ${r.pack.color} 22%, var(--surface)) 0%, var(--surface) 62%)">
      <div class="hero-art" style="background:radial-gradient(circle at 50% 60%, color-mix(in srgb, ${r.pack.color} 26%, transparent) 0%, transparent 70%)">${containerSVG(r.pack, r.name)}</div>
      <div class="nm">${esc(r.name)}</div>
      <div class="sub">${esc(t.name)} · ${esc(r.pack.volume)} · ${SHAPES[r.pack.shape]} · ${MATS[r.pack.material].n}</div>
      <div class="wrap" style="justify-content:center">${gradeBadges(R.grade)}</div>
      <div class="keyrow">${keyIngs.map(i=>`<button class="keying" data-act="open-ing" data-id="${esc(i.id)}">${ingArt(ING[i.id],'art xs')}<span><b>${esc(i.id)}</b><small>${fmt(i.pct)}%</small></span></button>`).join('')||'<span class="small muted">핵심 성분 없음</span>'}</div>
      <div style="width:100%;max-width:360px">${compositionBar(R.groups)}</div>
      <div class="xs muted">${new Date().getFullYear()}.${String(new Date().getMonth()+1).padStart(2,'0')}.${String(new Date().getDate()).padStart(2,'0')} · 내 화장품 연구소</div>
      <div class="grid2" style="width:100%"><button class="btn outl" data-act="nav" data-to="mix" data-dir="back">배합 수정</button><button class="btn" data-act="save-recipe">보관함에 저장</button></div>
      <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn text" data-act="copy-recipe">${ic('copy','s')} 레시피 텍스트 복사</button>${(state.downloads||!inClaude())?`<button class="btn text" data-act="save-card-image">${ic('image','s')} 카드 이미지 저장</button>`:''}${state.cloud.db&&state.cloud.uid?`<button class="btn text" data-act="gallery-publish">${ic('globe','s')} 갤러리에 공개</button>`:''}</div></div>
    <div class="row" style="justify-content:center;flex-wrap:wrap"><span class="xs muted">라벨 스타일</span>${Object.entries(LABEL_STYLES).map(([k,n])=>`<button class="chip sm ${(r.pack.label||'minimal')===k?'sel':''}" data-act="pack" data-k="label" data-v="${k}">${n}</button>`).join('')}<span class="xs muted" style="margin-left:6px">색</span>${LABEL_COLORS.map(c=>`<button class="sw ${r.pack.color===c?'sel':''}" style="background:${c};width:22px;height:22px" data-act="pack" data-k="color" data-v="${c}" aria-label="라벨 색 ${c}"></button>`).join('')}</div>
    ${assessHTML(r)}
    <div class="card stack" style="gap:10px" id="simCard"><div class="between"><div class="row">${ic('search','s')}<h3 class="h3">비슷한 시중 제품</h3></div>${aiOn()?(state.aiBusy.similar?`<span class="thinking"><i></i>찾는 중…</span>`:`<button class="btn text" data-act="ai-similar" ${aiLeft()?'':'disabled'}>${ic('spark','s')} ${sim?'AI로 다시 찾기':'AI로 더 찾기'}</button>`):''}</div>
      ${offline.length ? offline.map(s=>`<div class="sim"><div class="between"><b>${esc(s.brand)} ${esc(s.name)}</b><a class="link-out" href="https://www.google.com/search?q=${encodeURIComponent(s.brand+' '+s.name)}" target="_blank" rel="noopener">검색 ↗</a></div><p class="xs muted">${esc(TYPES[s.type]?TYPES[s.type].name:'')}${s.mine?' · 내가 분석한 제품':''} · 공통 성분 ${s.shared.length}개</p><div class="wrap">${s.shared.slice(0,5).map(id=>ingChip(id)).join('')}</div></div>`).join('') : `<p class="small muted">대표 성분이 겹치는 제품을 카탈로그에서 찾지 못했어요.</p>`}
      <p class="footnote">데모 카탈로그(${SEED_PRODUCTS.length}개 제품, 대표 성분 몇 가지 기준)와 내가 분석한 제품에서 공통 성분이 많은 순으로 골랐어요. 광고가 아니며, 정식 버전은 전성분 DB로 대체해요.</p>
      ${sim ? (sim.length ? `<div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:10px"><b class="small">${ic('spark','xs')} AI가 고른 제품</b>${sim.map(s=>`<div class="sim"><div class="between"><b>${esc(s.brand)} ${esc(s.name)}</b><a class="link-out" href="https://www.google.com/search?q=${encodeURIComponent((s.brand||'')+' '+(s.name||''))}" target="_blank" rel="noopener">검색 ↗</a></div><p class="small">${esc(s.why||'')}</p>${(s.common||[]).length?`<div class="wrap">${s.common.slice(0,5).map(n=>ingChip(findIng(n)||n)).join('')}</div>`:''}</div>`).join('')}<p class="footnote">AI 지식으로 고른 참고용이라 최신 정보와 다를 수 있어요.</p></div>` : `<p class="small muted">AI도 비슷한 제품을 찾지 못했어요.</p>`) : ''}
      <a class="link-out" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">웹에서 "${esc(t.name)} ${esc(keyIngs.slice(0,3).map(i=>i.id).join(' '))}" 검색 ↗</a></div>
    <div class="card stack" style="gap:8px"><div class="between"><div class="row">${ic('edit','s')}<h3 class="h3">라벨용 전성분 표기</h3></div><button class="btn text" data-act="copy-inci">${ic('copy','s')} 복사</button></div><p class="small" style="line-height:1.6;word-break:keep-all">${esc(inciText(r))}</p><p class="xs muted">함량이 많은 순서로 적었어요. 1% 이하 성분은 순서와 상관없이 적을 수 있고, 알레르기 유발성분은 따로 이름을 적어야 해요.</p></div>
    <details class="card" id="diyDetails" ${state.diyOpen?'open':''}><summary><span class="row">${ic('flask','s')}실제 DIY 레시피로 변환</span></summary><div class="stack" style="margin-top:12px">
      <div class="row" style="flex-wrap:wrap"><span class="xs muted">배치 용량</span><div class="seg" style="grid-template-columns:repeat(4,minmax(0,1fr));flex:1;min-width:220px">${[30,50,100,200].map(v=>`<button class="${state.diyBatch===v?'sel':''}" data-act="diy-batch" data-v="${v}">${v} g</button>`).join('')}</div></div>
      ${diyHTML(diy, t)}</div></details>
    <p class="footnote">이 카드와 레시피는 개인 사용 목적의 참고 자료예요. 만든 화장품을 판매하거나 선물용으로 제조하려면 화장품법에 따른 제조업·책임판매업 등록이 필요해요.</p>
  </div>`;
}
function similarOffline(r, R){
  const mine = new Set(R.items.filter(i=>!['water','pres','thick','ph','chel'].includes(ING[i.id].r)).map(i=>i.id));
  if (!mine.size) return [];
  const t=TYPES[r.typeId]; const cands=[];
  SEED_PRODUCTS.forEach(p=>{ const shared=p.key.filter(k=>mine.has(k)); if(!shared.length) return; const score=shared.length*2 + (p.type===r.typeId?2:(TYPES[p.type]&&TYPES[p.type].kind===t.kind?1:0)); cands.push({...p,shared,score}); });
  state.saved.filter(s=>s.k==='analysis').forEach(s=>{ const ids=[...new Set(parseList(s.raw).map(findIng).filter(Boolean))]; const shared=ids.filter(k=>mine.has(k)); if(shared.length>=2) cands.push({brand:'',name:s.name,type:'',key:ids,shared,score:shared.length*2,mine:true}); });
  return cands.sort((a,b)=>b.score-a.score).slice(0,5);
}
function recipeText(r){
  const t=TYPES[r.typeId]; const R=evaluate(r);
  return `[${r.name}] ${t.name} · ${r.pack.volume} · ${SHAPES[r.pack.shape]}(${MATS[r.pack.material].n})\n`+r.items.map(i=>`- ${i.id} ${fmt(i.pct)}% (${ROLE[ING[i.id].r].n})`).join('\n')+`\n합계 ${fmt(R.total)}% · 안심 ${R.grade[0]} 주의 ${R.grade[1]} 경고 ${R.grade[2]}\n내 화장품 연구소 데모에서 만든 가상 배합`;
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); toast('복사했어요.'); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(err){} ta.remove(); toast(ok?'복사했어요.':'복사가 막혀 있어요. 아래 텍스트를 직접 선택해 주세요.'); }
}
async function saveCardImage(){
  const r=state.recipe; const t=TYPES[r.typeId]; const R=evaluate(r);
  const W=720,H=900; const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.fillStyle='#FBF9F4'; x.fillRect(0,0,W,H); x.fillStyle='#FFFFFF'; roundRect(x,40,40,W-80,H-80,36); x.fill();
  const svg = containerSVG(r.pack, r.name).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const img = new Image(); const url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  await new Promise((res)=>{ img.onload=res; img.onerror=res; img.src=url; });
  try{ x.drawImage(img, W/2-150, 80, 300, 300); }catch(e){}
  URL.revokeObjectURL(url);
  x.fillStyle='#1B1C19'; x.textAlign='center'; x.font="700 40px 'Noto Sans KR', sans-serif"; x.fillText(r.name, W/2, 440);
  x.fillStyle='#5A5D55'; x.font="500 22px 'Noto Sans KR', sans-serif"; x.fillText(`${t.name} · ${r.pack.volume} · ${SHAPES[r.pack.shape]}`, W/2, 480);
  const keys=[...R.items].filter(i=>!['water','pres','thick','ph','chel'].includes(ING[i.id].r)).sort((a,b)=>b.pct-a.pct).slice(0,5);
  x.fillStyle='#1B1C19'; x.font="500 22px 'Noto Sans KR', sans-serif"; x.fillText('핵심 성분', W/2, 540);
  x.font="400 22px 'Noto Sans KR', sans-serif"; keys.forEach((k,i)=>x.fillText(`${k.id} ${fmt(k.pct)}%`, W/2, 578+i*34));
  const bx=[[ '안심',R.grade[0],'#DFF2E1','#1E5B23'],['주의',R.grade[1],'#FFECC7','#7A4500'],['경고',R.grade[2],'#FBE0DE','#8C1D18']];
  bx.forEach(([n,v,bg,fg],i)=>{ const px=W/2-190+i*130; x.fillStyle=bg; roundRect(x,px,760,120,64,20); x.fill(); x.fillStyle=fg; x.font="700 30px 'Noto Sans KR', sans-serif"; x.fillText(String(v), px+60, 800); x.font="500 16px 'Noto Sans KR', sans-serif"; x.fillText(n, px+60, 822); });
  x.fillStyle='#8A8D84'; x.font="400 15px 'Noto Sans KR', sans-serif"; x.fillText('내 화장품 연구소 · 가상 배합 카드 (개인 참고용)', W/2, 860);
  const blob = await new Promise(res=>c.toBlob(res,'image/png'));
  if (!state.downloads){
    try{ const u=URL.createObjectURL(blob); const el=document.createElement('a'); el.href=u; el.download=`${r.name}.png`; document.body.appendChild(el); el.click(); el.remove(); setTimeout(()=>URL.revokeObjectURL(u), 4000); toast('카드 이미지를 내려받았어요.'); }
    catch(e){ toast('저장하지 못했어요. 다시 시도해 주세요.'); }
    return;
  }
  try{ await state.downloads.save({filename:`${r.name}.png`, data:blob}); toast('카드 이미지를 저장했어요.'); }
  catch(e){ if(e&&e.code==='declined') return; toast(e&&e.code==='unavailable'?'이 화면에서는 저장할 수 없어요.':'저장하지 못했어요. 다시 시도해 주세요.'); }
}
function roundRect(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r); x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }
function similarPrompt(r, R){
  const t=TYPES[r.typeId]; const ings=R.items.slice().sort((a,b)=>b.pct-a.pct).map(i=>`${i.id}(${ING[i.id].inci}) ${fmt(i.pct)}%`).join(', ');
  return `사용자가 앱에서 가상으로 배합한 ${t.name}입니다: ${ings}.\n이 배합과 핵심 성분·제형이 비슷한, 한국에서 살 수 있는 시중 화장품을 3~5개 골라 JSON 배열로만 답하세요. 각 항목: {"brand":"브랜드","name":"제품명","why":"비슷한 이유 한 문장(40자 이내)","common":["공통 성분 한글명", ...]}.\n실제로 존재한다고 확신하는 제품만 넣고, 확실하지 않으면 개수를 줄이세요. 광고 문구와 효능 보장은 쓰지 마세요.`;
}
async function runAISimilar(){
  const r=state.recipe; const R=evaluate(r); const key=recipeKey(r);
  state.aiBusy.similar=true; render();
  try{ const arr = await aiCall('json', similarPrompt(r,R), {modelTier:'default'}); state.aiSimilar[key] = Array.isArray(arr) ? arr.filter(x=>x&&x.name).slice(0,5) : []; cacheSet('sim|'+hashStr(key), state.aiSimilar[key]); }
  catch(e){ toast(errMsg(e)); }
  state.aiBusy.similar=false; if(state.screen==='done') render();
}

// ===== DIY 변환 =====
const DIY_SUB = {pres:'1,2-헥산다이올', surf:'코코-글루코사이드', thick:'잔탄검', ph:'트로메타민', oil:'스쿠알란', hum:'글리세린', emul:'글리세릴스테아레이트'};
function diyConvert(r){
  const t=TYPES[r.typeId]; const out=new Map(); const dropped=[], swapped=[], adv=[];
  const add=(id,p)=>out.set(id,(out.get(id)||0)+p);
  for (const it of r.items){ const g=ING[it.id]; if(!g||it.pct<=0) continue;
    if (g.diy===1){ add(g.ko,it.pct); continue; }
    if (g.diy===2){ add(g.ko,it.pct); adv.push(g.ko); continue; }
    if (['uv','frag','col','cond','chel','act','powder','water'].includes(g.r)){ dropped.push({id:g.ko, why: g.r==='uv'?'자외선 차단력은 집에서 확인할 수 없어요':g.r==='frag'?'향은 넣지 않아요(원하면 라벤더오일 0.5% 이하를 마지막에)':g.r==='col'?'색소는 초보 목록에 없어요':(g.r==='act'&&g.g>=1)?'자극·안정성 문제로 초보 레시피에서 빼요':g.r==='cond'?'컨디셔닝제는 초보 목록에 없어요':g.r==='chel'?'선택 원료라 생략해요':'초보 목록에 없어요'}); continue; }
    if (g.ko==='피이지-10다이메티콘'){ dropped.push({id:g.ko,why:'W/O 유화제는 초보 목록에 없어요'}); continue; }
    let sub = DIY_SUB[g.r]; if (g.r==='emul' && /피이지/.test(g.ko)) sub='폴리소르베이트20';
    if (sub && ING[sub]){ add(sub,it.pct); swapped.push({from:g.ko,to:sub}); } else dropped.push({id:g.ko,why:'초보 목록에 없어요'});
  }
  const aqueous = out.has('정제수') || [...out.keys()].some(id=>['hum','surf'].includes(ING[id].r));
  let note='';
  if (aqueous && ![...out.keys()].some(id=>ING[id].r==='pres')){ add('1,2-헥산다이올',2); note='물이 들어가 보존제(1,2-헥산다이올 2%)를 넣었어요.'; }
  let total=[...out.values()].reduce((s,v)=>s+v,0);
  if (Math.abs(total-100)>0.05){ if (out.has('정제수')){ const others=total-out.get('정제수'); out.set('정제수', Math.max(0,100-others)); } else { for (const [k,v] of out) out.set(k, v*100/total); } }
  const items=[...out.entries()].map(([id,p])=>({id,g:Math.round(p*100)/100})).sort((a,b)=>b.g-a.g);
  const STEPS = {
    emulsion:['수상 원료(정제수·글리세린 등)를 비커에 계량해 중탕으로 70~75°C까지 데워요.','유상 원료(오일·버터·왁스·유화제)를 다른 비커에 계량해 같은 온도로 녹여요.','유상을 수상에 천천히 부으며 미니 블렌더로 2~3분 유화해요.','저어 주며 40°C 아래로 식혀요.','활성 성분·추출물·보존제·비타민E를 넣고 고루 섞어요.','pH 시험지로 5~6인지 확인하고, 소독한 용기에 담아 제조일 라벨을 붙여요.'],
    aq:['정제수에 보습제(글리세린 등)와 추출물을 넣고 섞어요.','점증제(잔탄검·카보머)는 글리세린에 먼저 갠 뒤 넣어야 뭉치지 않아요.','활성 성분과 보존제를 넣어요.','pH 시험지로 5~6인지 확인해요.','소독한 용기에 담고 제조일 라벨을 붙여요.'],
    wash:['정제수에 글리세린을 넣어요.','계면활성제를 거품이 나지 않게 천천히 섞어요.','추출물·보존제를 넣어요.','시트릭애씨드로 pH 5~6에 맞춰요.','소금을 조금씩 넣어 점도를 조절한 뒤 용기에 담아요.'],
    anhydrous:['오일·왁스·버터를 내열 비커에 계량해 중탕으로 완전히 녹여요.','불을 끄고 비타민E를 넣어 섞어요.','틀이나 용기에 붓고 실온에서 굳혀요.'],
    clay:['정제수에 글리세린과 추출물을 섞어요.','점토를 조금씩 넣으며 뭉치지 않게 저어요.','보존제를 넣고 용기에 담아요.'],
  };
  const shelf = aqueous ? '냉장 보관, 4~8주 안에 사용' : '서늘한 곳 보관, 3~6개월 안에 사용';
  const warns=['개인 사용 목적으로만 만들고, 판매·선물용 제조는 화장품법상 등록이 필요해요.','도구와 용기는 70% 에탄올로 소독하고, 손을 씻고 시작해요.','처음 쓰기 전에 팔 안쪽에 48시간 패치 테스트를 해요.'];
  if (t.kind==='emulsion'||t.kind==='anhydrous') warns.push('중탕 중 화상에 주의해요.');
  if (r.items.some(i=>ING[i.id]&&ING[i.id].r==='uv')) warns.push('선크림은 SPF를 확인할 방법이 없어 집에서 만들지 않기를 권해요.');
  return {items,dropped,swapped,adv,note,steps:STEPS[t.kind]||STEPS.aq,shelf,warns,tools:'저울(0.1 g), 내열 비커 2개, 온도계, pH 시험지, 미니 블렌더 또는 스패출러'};
}
function inciText(r){
  const items=r.items.filter(i=>ING[i.id]&&i.pct>0).slice().sort((a,b)=>b.pct-a.pct);
  const al=items.filter(i=>ING[i.id].a25).map(i=>i.id);
  return `전성분: ${items.map(i=>i.id).join(', ')}${al.length?` (알레르기 유발성분: ${al.join(', ')})`:''}`;
}
function diyHTML(d,t){
  const B=state.diyBatch||100, f=B/100;
  return `${alertHTML('warn','개인 사용 목적 레시피','판매·선물용 제조는 할 수 없어요. 초보용 원료 목록 기준으로 바꿨어요.')}
  <table class="tbl"><thead><tr><th>원료</th><th>역할</th><th class="r">${B} g 기준</th><th class="r">권장 상한</th></tr></thead><tbody>${d.items.map(i=>{const g=ING[i.id]; const over=g.mx!=null&&g.mx>=0.01&&i.g>g.mx+1e-9; return `<tr><td>${esc(i.id)}${d.adv.includes(i.id)?' <span class="badge">고급 원료</span>':''}</td><td class="muted">${ROLE[g.r].n}</td><td class="r num">${(i.g*f).toFixed(2)} g</td><td class="r num" style="${over?'color:var(--bad-fg);font-weight:700':''}">${g.mx!=null&&g.mx>=0.01?g.mx+'%':'—'}</td></tr>`;}).join('')}<tr><td colspan="2"><b>합계</b></td><td class="r num"><b>${(d.items.reduce((s,i)=>s+i.g,0)*f).toFixed(1)} g</b></td><td></td></tr></tbody></table>
  <p class="xs muted">권장 상한은 이 앱이 정한 초보용 기준이에요. 법정 한도가 있는 원료(보존제·자외선 차단제 등)는 성분 카드 설명에 적어 두었어요.</p>
  ${d.swapped.length?`<p class="small"><b>바꾼 원료</b> · ${d.swapped.map(s=>`${esc(s.from)} → ${esc(s.to)}`).join(', ')}</p>`:''}
  ${d.dropped.length?`<div class="small"><b>뺀 원료</b><ul style="margin:4px 0 0;padding-left:18px">${d.dropped.map(x=>`<li>${esc(x.id)} — ${esc(x.why)}</li>`).join('')}</ul></div>`:''}
  ${d.note?`<p class="small">${esc(d.note)}</p>`:''}
  <div><b class="small">준비물</b><p class="small muted">${esc(d.tools)}</p></div>
  <div><b class="small">만드는 순서</b><ol class="steps" style="margin-top:6px">${d.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></div>
  <div><b class="small">보관과 사용기한</b><p class="small muted">${esc(d.shelf)}</p></div>
  <div class="stack" style="gap:6px">${d.warns.map(w=>alertHTML('warn','',w)).join('')}</div>`;
}

// ===== 화면: 분석 =====
const SAMPLE_TEXT = '정제수, 글리세린, 부틸렌글라이콜, 나이아신아마이드, 판테놀, 알란토인, 카보머, 트로메타민, 1,2-헥산다이올, 에틸헥실글리세린, 다이소듐이디티에이, 향료, 리날룰, 리모넨';
function parseList(raw){
  return String(raw||'').replace(/^\s*(전성분|성분|ingredients?)\s*[:：]/im,'').split(/[,，、;\n]+/).map(s=>s.replace(/^\s*[\d.)]+\s*/,'').replace(/[.。]+$/,'').trim()).filter(s=>s && s.length<=60).slice(0,80);
}
function analyzeRaw(){
  const names = parseList(state.analysis.raw);
  state.analysis.items = names.map((n,i)=>({name:n, id:findIng(n), pos:i}));
  state.analysis.aiSummary=''; state.analysis.makeType=null;
}
function analysisSummary(items){
  const matched=items.filter(i=>i.id); const first=items.slice(0,5);
  const has=id=>matched.some(i=>i.id===id); const role=r=>matched.filter(i=>ING[i.id].r===r);
  const hasSurf=role('surf').length>0, hasUV=role('uv').length>0, waterFirst=items[0]&&items[0].id==='정제수';
  const waxy=['비즈왁스','칸데릴라왁스','카나우바왁스'].some(has); const oilsFirst=first.filter(i=>i.id&&ING[i.id].r==='oil').length>=2;
  const emulFirst=items.slice(0,8).some(i=>i.id&&['emul','oil'].includes(ING[i.id].r));
  let character, guess;
  if (hasSurf){ character='세정 제품(클렌저·샴푸·워시)'; guess=role('cond').length?'shampoo':'foam'; }
  else if (hasUV){ character='자외선 차단 제품'; guess='sun'; }
  else if (!waterFirst && (waxy||oilsFirst)){ character='오일·왁스 제형(밤·오일)'; guess=waxy?'lipbalm':'oil'; }
  else if (emulFirst){ character='로션·크림류'; guess=(has('시어버터')||waxy)?'cream':'lotion'; }
  else { character='토너·에센스류(수분 제형)'; guess=role('act').length>=2?'essence':'toner'; }
  const grade={0:0,1:0,2:0}; matched.forEach(i=>grade[ING[i.id].g]++);
  const al=matched.filter(i=>ING[i.id].a25).map(i=>i.id);
  const sentences=[];
  const mains=first.filter(i=>i.id).map(i=>i.id).slice(0,3);
  if (mains.length) sentences.push(`앞쪽 주성분은 ${mains.join('·')}이에요.`);
  const acts=role('act').slice(0,4).map(i=>`${i.id}(${ING[i.id].b[0]||'기능'})`);
  if (acts.length) sentences.push(`기능 성분: ${acts.join(', ')}.`);
  const alc=items.findIndex(i=>i.id==='에탄올');
  if (alc>-1 && alc<5) sentences.push('알코올이 앞쪽에 있어 산뜻하지만 건조할 수 있어요.'); else if (alc>-1) sentences.push('알코올이 뒤쪽에 소량 있어요.');
  if (role('frag').length){ sentences.push(al.length?`향료가 있고 알레르기 유발성분 ${al.length}개(${al.join(', ')})가 표시돼 있어요. 향 알레르기가 있다면 확인하세요.`:'향료가 있지만 알레르기 유발성분 표시는 없어요.'); } else sentences.push('향료 표시가 없어요.');
  const cau=matched.filter(i=>ING[i.id].g===1).map(i=>i.id);
  if (cau.length) sentences.push(`주의 등급: ${cau.slice(0,5).join(', ')}.`);
  const unknown=items.filter(i=>!i.id);
  if (unknown.length) sentences.push(`${unknown.length}개는 성분 DB에 없어 확인하지 못했어요.`);
  const avoided = matched.filter(i=>isAvoided(ING[i.id])).map(i=>i.id);
  return {character,guess,grade,al,sentences,unknown,matched,avoided};
}
function viewAnalyze(){
  const a=state.analysis; const S=a.items?analysisSummary(a.items):null;
  const canPhoto = aiMode()==='byok' || !!(state.sample && state.limits && state.limits.images);
  const accept = (aiMode()==='builtin' && state.limits && state.limits.images && state.limits.images.mediaTypes) ? state.limits.images.mediaTypes.join(',') : 'image/*';
  return topbar('성분표 분석', 'home', a.items?`<button class="btn text" data-act="save-analysis">저장</button>`:'') + `<div class="stack">
    <div class="card stack" style="gap:12px">
      <div class="seg two"><button class="${a.tab==='photo'?'sel':''}" data-act="atab" data-v="photo">${ic('camera','xs')} 사진으로</button><button class="${a.tab==='text'?'sel':''}" data-act="atab" data-v="text">${ic('edit','xs')} 텍스트로</button></div>
      ${a.tab==='photo' ? (canPhoto ? `<div class="row" style="gap:12px;align-items:flex-start">${a.photoUrl?`<img class="photo-thumb" src="${a.photoUrl}" alt="라벨 사진">`:''}<div class="stack" style="gap:8px;flex:1"><label class="btn tonal" style="cursor:pointer">${ic('camera','s')} 라벨 사진 고르기<input type="file" id="photoIn" accept="${esc(accept)}" hidden></label><p class="xs muted">전성분 부분이 잘 보이게 가까이 찍어 주세요. 사진은 분석에만 쓰고 저장하지 않아요.${aiMode()==='builtin'?' 호출 1회를 써요.':''}</p></div></div>${a.busy?`<span class="thinking"><i></i>사진에서 성분을 읽는 중…</span>`:''}${!a.busy&&a.photoErr?`<div class="alert warn">${ic('warn','s')}<div class="stack" style="gap:8px"><span>${esc(a.photoErr==='few'?'전성분을 찾지 못했어요. 라벨의 전성분 부분을 가까이, 흔들리지 않게 찍어 주세요.':a.photoErr)}</span><div class="row" style="flex-wrap:wrap"><label class="btn tonal" style="cursor:pointer;min-height:38px;padding:0 14px;font-size:13px">${ic('camera','xs')} 다시 찍기<input type="file" class="photo-in" accept="${esc(accept)}" hidden></label><button class="btn tonal" style="min-height:38px;padding:0 14px;font-size:13px" data-act="atab" data-v="text">${ic('edit','xs')} 텍스트로 직접 입력</button></div></div></div>`:''}${!a.busy&&!a.photoErr&&a.items&&a.raw?`<div class="between" style="flex-wrap:wrap;gap:6px"><span class="xs muted">사진에서 성분 ${a.items.length}개를 읽었어요. 잘못 읽은 게 있으면 고쳐서 다시 분석할 수 있어요.</span><button class="btn text" style="min-height:36px" data-act="atab" data-v="text">${ic('edit','xs')} 읽은 텍스트 고치기</button></div>`:''}` : aiOffHTML('사진 읽기', '텍스트로 붙여넣어 분석하는 건 지금도 돼요.')) : `<label class="sr" for="rawIn">전성분 텍스트</label><textarea id="rawIn" placeholder="전성분을 붙여넣으세요 (쉼표로 구분)&#10;예: 정제수, 글리세린, 부틸렌글라이콜, …">${esc(a.raw)}</textarea><div class="row" style="justify-content:flex-end"><button class="btn text" data-act="a-sample">예시 넣기</button><button class="btn" data-act="a-run">분석하기</button></div>`}
    </div>
    ${S ? `<div class="card stack" style="gap:10px"><div class="between" style="flex-wrap:wrap"><h2 class="h2">${esc(a.name||S.character)}</h2><div class="wrap" style="gap:4px">${gradeBadges(S.grade)}</div></div>${a.name?`<p class="xs muted">${esc(S.character)}</p>`:''}<p class="small">${esc(S.sentences.join(' '))}</p>
      ${compositionHTML(S.matched)}
      ${state.skin ? `<div class="tip">${ic('face','s')}<div><b>내 피부(${skinName()})</b> — ${esc(analysisSkinNote(S, a.items))}</div></div>` : ''}
      ${S.avoided.length ? alertHTML('warn','피하는 성분 '+S.avoided.length+'개', `내 프로필에서 피하기로 한 성분이 들어 있어요: ${S.avoided.join(', ')}`) : (avoidCount() ? alertHTML('ok','', '내가 피하기로 한 성분은 들어 있지 않아요.') : '')}
      ${aiOn()?`<div class="row" style="justify-content:flex-end">${state.aiBusy.asum?`<span class="thinking"><i></i>요약 중…</span>`:`<button class="btn text" data-act="ai-asum" ${aiLeft()?'':'disabled'}>${ic('spark','s')} AI 요약 듣기</button>`}</div>`:''}
      ${a.aiSummary?`<div class="ai-box small" style="border-top:1px solid var(--line);padding-top:8px">${esc(a.aiSummary)}</div>`:''}</div>
    <div class="stack" style="gap:10px"><div class="between"><h2 class="h3">성분 ${a.items.length}개 <span class="muted" style="font-weight:400">· 표기 순</span></h2><span class="xs muted">칩을 누르면 성분 카드</span></div>
      <div class="wrap">${a.items.map(i=> i.id ? ingChip(i.id,{pos:i.pos<5}) : unknownChip(i.name)).join('')}</div>
      ${S.unknown.length ? `<div class="row" style="flex-wrap:wrap">${alertHTML('info','',`${S.unknown.length}개 성분은 DB에 없어요.`)}${aiOn()?(state.aiBusy.unk?`<span class="thinking"><i></i>AI가 찾는 중…</span>`:(S.unknown.every(u=>a.aiInfo[u.name])?'':`<button class="btn tonal" data-act="ai-unknown" ${aiLeft()?'':'disabled'}>${ic('spark','s')} AI에게 물어보기</button>`)):''}</div>`:''}</div>
    <div class="card stack" style="gap:8px"><div class="between" style="gap:8px"><div><h3 class="h3">내 화장대에 담기</h3><p class="xs muted">아침·저녁에 같이 쓰는 제품끼리 궁합을 확인해요.</p></div><button class="btn tonal" style="min-height:40px;padding:0 14px;white-space:nowrap" data-act="routine-add-current">${ic('face','s')} 담기</button></div></div>
    <div class="card stack" style="gap:10px"><div class="between"><h3 class="h3">이 조합으로 만들기</h3>${a.makeType?'':`<button class="btn tonal" data-act="a-make">${ic('flask','s')} 비커에 담기</button>`}</div>
      ${a.makeType?`<p class="small">어떤 종류로 만들까요? <span class="muted">(추천: ${TYPES[S.guess].name})</span></p><div class="row"><select id="makeSel" style="flex:1;min-height:44px;border-radius:12px;border:1px solid var(--line2);background:var(--surface);padding:0 12px">${Object.values(TYPES).map(t=>`<option value="${t.id}" ${t.id===a.makeType?'selected':''}>${t.name}</option>`).join('')}</select><button class="btn" data-act="a-make-go">담기</button></div>`:`<p class="small muted">읽은 성분을 종류에 맞는 비율로 비커에 담아요. 비율은 표기 순서를 바탕으로 한 추정값이라 슬라이더로 조정하세요.</p>`}</div>`
    : `<div class="card tint stack" style="gap:6px"><b class="small">이렇게 써요</b><p class="small muted">1. 제품 뒷면의 「전성분」을 사진으로 찍거나 텍스트로 붙여넣어요.<br>2. 성분마다 역할 색과 안심·주의·경고 등급을 달아 줘요.<br>3. 마음에 들면 「이 조합으로 만들기」로 배합 화면에 옮겨요.</p></div>`}
    <p class="footnote">성분 등급은 이 앱이 정한 3단계(안심·주의·경고)로, 성분사전 명칭과 식약처 고시 알레르기 유발성분 25종을 기준으로 삼은 참고 정보예요.</p>
  </div>`;
}
function compositionBar(groups){
  const keys=['water','oil','act','surf','other'].filter(k=>(groups[k]||0)>0); const tot=keys.reduce((s,k)=>s+groups[k],0)||1;
  return `<div class="stack" style="gap:6px"><div class="bar">${keys.map(k=>`<span style="width:${(groups[k]/tot*100).toFixed(1)}%;background:var(--${k}-dot)"></span>`).join('')}</div><div class="legend-mini" style="justify-content:center">${keys.map(k=>`<span><span class="dot ${k}"></span>${GROUPN[k]} ${fmt(groups[k])}%</span>`).join('')}</div></div>`;
}
function compositionHTML(matched){
  const cnt={water:0,oil:0,act:0,surf:0,other:0}; matched.forEach(i=>cnt[groupOf(ING[i.id].r)]++);
  const tot=matched.length||1; const keys=Object.keys(cnt).filter(k=>cnt[k]>0); if(!keys.length) return '';
  return `<div class="stack" style="gap:6px"><div class="bar">${keys.map(k=>`<span style="width:${(cnt[k]/tot*100).toFixed(1)}%;background:var(--${k}-dot)"></span>`).join('')}</div><div class="legend-mini">${keys.map(k=>`<span><span class="dot ${k}"></span>${GROUPN[k]} ${cnt[k]}</span>`).join('')}</div></div>`;
}
function analysisSkinNote(S, items){
  const ids=S.matched.map(i=>i.id); const has=id=>ids.includes(id);
  if (state.skin==='sens'){ const bad=[...S.al, ...(has('향료')?['향료']:[]), ...(has('에탄올')?['에탄올']:[]), ...['레티놀','글라이콜릭애씨드','살리실릭애씨드','아스코빅애씨드','멘톨'].filter(has)]; return bad.length?`${[...new Set(bad)].slice(0,4).join(', ')}이(가) 들어 있어요. 민감한 날은 피하거나 소량으로 시험해 보세요.`:'눈에 띄는 자극 성분이 없어요.'; }
  if (state.skin==='oily'){ const heavy=['시어버터','코코넛오일','페트롤라툼','미네랄오일','아이소프로필미리스테이트'].filter(has); return heavy.length?`${heavy.join(', ')}이(가) 앞쪽에 있으면 무겁거나 모공을 막을 수 있어요.`:'무거운 유분 성분이 눈에 띄지 않아요.'; }
  if (state.skin==='dry'){ const hum=S.matched.filter(i=>['hum','oil'].includes(ING[i.id].r)).length; return hum>=3?'보습·유분 성분이 여럿 있어 건조한 피부에 무난해요.':'보습 성분이 적은 편이라 크림을 덧발라 주세요.'; }
  return '중성 피부에는 대체로 무난해요.';
}
function unknownChip(name){
  const info=state.analysis.aiInfo[name]; if(!info) return `<button class="ichip r-none" data-act="open-ing" data-name="${esc(name)}">${esc(name)}</button>`;
  const r=ROLE_BY_NAME[info.role]||'etc'; const g=Number(info.grade)||0;
  return `<button class="ichip ${chipClass(r)} ${info.allergen25||g===2?'bad':g===1?'warn':''}" data-act="open-ing" data-name="${esc(name)}">${g>=1?ic('warn','xs'):''}${esc(name)}</button>`;
}
function photoPrompt(){ return `이 사진은 화장품 용기나 상자의 라벨입니다. "전성분" 또는 성분 목록 부분을 찾아 성분명을 표기된 순서대로 읽어 주세요. JSON 객체로만 답하세요: {"product": "제품명(보이면, 없으면 빈 문자열)", "ingredients": ["성분1", "성분2", ...]}. 성분명은 라벨 표기(한글이면 한글) 그대로 쓰고, 쉼표로 이어진 목록을 하나씩 나누세요. 전성분이 보이지 않으면 ingredients를 빈 배열로 두세요.`; }
async function runPhoto(file){
  const a=state.analysis; if(!file) return;
  if (a.photoUrl) { try{ URL.revokeObjectURL(a.photoUrl); }catch(e){} }
  a.photoUrl = URL.createObjectURL(file); a.busy=true; a.photoErr=''; render();
  try{
    const res = await aiCall('json', photoPrompt(), {images:[file], modelTier:'default'});
    const list = Array.isArray(res) ? res : (res && Array.isArray(res.ingredients) ? res.ingredients : []);
    if (list.length<3){ a.photoErr='few'; a.busy=false; render(); return; }
    a.photoErr=''; a.raw = list.map(String).join(', '); a.name = res && res.product ? String(res.product).slice(0,40) : ''; analyzeRaw();
  }catch(e){ a.photoErr = e&&e.code==='cancelled' ? '' : (errMsg(e)||'사진을 읽지 못했어요.'); }
  a.busy=false; render();
}
function unknownPrompt(names){ return `다음 화장품 성분명 각각에 대해 JSON 배열로만 답하세요. 각 항목: {"name": 입력한 이름 그대로, "inci": INCI 영문명(모르면 ""), "role": 다음 중 하나 ["용제","보습제","오일·왁스","유화제","계면활성제","활성 성분","보존제","향료","색소","자외선 차단제","산화방지제","pH 조절제","점증제","킬레이트제","컨디셔닝제","파우더","기타"], "grade": 0(안심)/1(주의)/2(경고) 중 숫자, "allergen25": 식약처 고시 알레르기 유발성분 25종이면 true 아니면 false, "desc": 역할과 주의점을 한 문장(40자 이내)}. 확실하지 않으면 role은 "기타", desc는 "자료 없음"으로 쓰세요.\n성분: ${names.join(', ')}`; }
async function runUnknown(){
  const a=state.analysis; a.items.forEach(i=>{ if(!i.id && !a.aiInfo[i.name]){ const c=cacheGet('ing|'+hashStr(i.name)); if(c) a.aiInfo[i.name]=c; } });
  const names=[...new Set(a.items.filter(i=>!i.id && !a.aiInfo[i.name]).map(i=>i.name))].slice(0,25); if(!names.length){ render(); return; }
  state.aiBusy.unk=true; render();
  try{ const arr=await aiCall('json', unknownPrompt(names), {modelTier:'quick'}); (Array.isArray(arr)?arr:[]).forEach(o=>{ if(o&&o.name) a.aiInfo[String(o.name)]={inci:String(o.inci||''),role:String(o.role||'기타'),grade:Math.min(2,Math.max(0,Number(o.grade)||0)),allergen25:!!o.allergen25,desc:String(o.desc||'자료 없음')}; }); names.forEach(n=>{ if(!a.aiInfo[n]) a.aiInfo[n]={inci:'',role:'기타',grade:0,allergen25:false,desc:'자료 없음'}; else cacheSet('ing|'+hashStr(n), a.aiInfo[n]); }); }
  catch(e){ toast(errMsg(e)); }
  state.aiBusy.unk=false; render();
}
function asumPrompt(a,S){
  const lines=a.items.map(i=>{ if(i.id){const g=ING[i.id]; return `- ${g.ko}: ${ROLE[g.r].n}, 앱 등급 ${GRADE[g.g]}${g.a25?', 알레르기 유발성분 25종':''}, ${g.d}`;} const u=a.aiInfo[i.name]; return `- ${i.name}: ${u?u.role+', '+u.desc:'자료 없음'}`; }).join('\n');
  return `아래는 사용자가 산 화장품의 전성분(표기 순)과 앱의 성분 DB 정보입니다. 이 정보만 근거로 초보자에게 한국어 존댓말로 3~4문장으로 요약하세요: 어떤 성격의 제품인지, 눈여겨볼 기능 성분, 조심할 성분(있다면). 치료·완치 같은 의약품 표현은 쓰지 말고, 마크다운 기호 없이 200자 이내로 쓰세요.\n\n[제품] ${a.name||S.character}\n${lines}`;
}
async function runASum(){
  const a=state.analysis; const S=analysisSummary(a.items); const ck='asum|'+hashStr(a.raw); const hit=cacheGet(ck); if (hit){ a.aiSummary=hit; render(); return; }
  state.aiBusy.asum=true; render();
  try{ const {text}=await aiCall('text', asumPrompt(a,S), {modelTier:'quick'}); a.aiSummary=soften(text); cacheSet(ck, a.aiSummary); }catch(e){ toast(errMsg(e)); }
  state.aiBusy.asum=false; render();
}
function recipeFromAnalysis(items, typeId){
  const t=TYPES[typeId]; const seen=new Set(); const out=[];
  for (const it of items){ if(!it.id||seen.has(it.id)) continue; seen.add(it.id); const g=ING[it.id]; let p=defaultPct(g); if(g.r==='water'&&it.id!=='정제수') p=3; out.push({id:it.id,pct:p}); if(out.length>=16) break; }
  const n=out.length; out.forEach((o,i)=>{ if(o.id!=='정제수') o.pct=Math.round(o.pct*(1-i/(2*n+1))*10)/10; });
  const r={name:`분석한 ${t.name}`, typeId, items:out, pack:{shape:t.pack.shape,material:t.pack.material,volume:t.pack.volume,color:LABEL_COLORS[0]}, auto:true};
  const w=out.find(o=>o.id==='정제수');
  if (w){ balance(r); if (w.pct<=0){ const others=out.filter(o=>o!==w).reduce((s,o)=>s+o.pct,0); out.forEach(o=>{ if(o!==w) o.pct=Math.round(o.pct*85/others*10)/10; }); balance(r); } }
  else { const tot=out.reduce((s,o)=>s+o.pct,0)||1; out.forEach(o=>o.pct=Math.round(o.pct*100/tot*10)/10); }
  return r;
}

// ===== 화면: 보관함 =====
function viewSaved(){
  const c=state.cloud; const tab=state.savedTab;
  const recipes=state.saved.filter(s=>s.k==='recipe'), analyses=state.saved.filter(s=>s.k==='analysis');
  const cnt={}; recipes.forEach(r=>(r.items||[]).forEach(i=>{ if(ING[i.id]&&!['water','pres','thick','ph','chel'].includes(ING[i.id].r)) cnt[i.id]=(cnt[i.id]||0)+1; }));
  const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const syncBadge = c.ref ? `<span class="badge g0">${ic('cloud','xs')} 클라우드 동기화</span>` : (c.ready ? `<span class="badge">이 기기에만 저장</span>` : '');
  return topbar('보관함', 'home', syncBadge) + `<div class="stack">
    <div class="seg"><button class="${tab==='mine'?'sel':''}" data-act="saved-tab" data-v="mine">${ic('archive','xs')} 보관함</button><button class="${tab==='routine'?'sel':''}" data-act="saved-tab" data-v="routine">${ic('face','xs')} 내 화장대</button><button class="${tab==='gallery'?'sel':''}" data-act="saved-tab" data-v="gallery">${ic('globe','xs')} 갤러리</button></div>
    ${tab==='routine' ? routineHTML() : tab==='mine' ? `
    ${state.saved.length>=2?`<div class="between"><span class="small muted">${state.compare.on?`비교할 항목을 두 개 고르세요 (${state.compare.sel.length}/2)`:'두 배합이나 두 제품을 나란히 비교할 수 있어요'}</span><button class="btn ${state.compare.on?'tonal':'text'}" style="min-height:36px;padding:0 12px" data-act="compare-toggle">${ic('swap','xs')} ${state.compare.on?'비교 취소':'비교'}</button></div>`:''}
    ${state.compare.on&&state.compare.sel.length===2?`<button class="btn wide" data-act="compare-go">${ic('swap','s')} 두 개 비교하기</button>`:''}
    <div class="stat3"><div><b class="num">${recipes.length}</b><span>배합</span></div><div><b class="num">${analyses.length}</b><span>분석</span></div><div><b class="num">${top.length?top[0][1]:0}</b><span>${top.length?esc(top[0][0]):'자주 쓴 성분'}</span></div></div>
    ${top.length?`<div class="wrap" style="align-items:center"><span class="xs muted">자주 쓴 성분</span>${top.map(([id,n])=>ingChip(id,{pct:null})).join('')}</div>`:''}
    ${state.saved.length ? state.saved.map((s,i)=>`<div class="row" style="gap:6px">${savedItem(s,i)}${state.compare.on?'':`<button class="iconbtn sm" data-act="del-saved" data-i="${i}" aria-label="삭제">${ic('trash','s')}</button>`}</div>`).join('') : `<div class="empty">저장한 배합과 분석이 여기에 쌓여요.</div>`}
    <p class="footnote">${c.ref?'Claude 계정으로 클라우드에 저장돼 다른 기기에서도 같은 보관함을 봐요. 보관함은 나만 볼 수 있어요.':'이 기기의 브라우저에 저장돼요. Claude 안에서 열면 계정으로 동기화돼요.'}</p>`
    : `
    <div class="between"><p class="small muted">연구원들이 공개한 배합이에요. 마음에 들면 ♥, 비커에 담아 고쳐 볼 수 있어요.</p><button class="iconbtn sm" data-act="gallery-refresh" aria-label="새로 고침">${ic('refresh','s')}</button></div>
    ${!c.db ? alertHTML('info','', c.ready?'갤러리는 Claude 안에서 열었을 때 볼 수 있어요.':'갤러리를 준비하는 중이에요…') : (state.gallery.busy&&!state.gallery.items ? `<span class="thinking"><i></i>불러오는 중…</span>` : ((state.gallery.items||[]).length ? state.gallery.items.map(galleryItem).join('') : `<div class="empty">아직 공개된 배합이 없어요. 완성 화면에서 「갤러리에 공개」를 눌러 첫 배합을 올려 보세요.</div>`))}`}
  </div>`;
}

// ===== 화면: 성분 사전 =====
function viewDict(){
  const q=norm(state.dictQ);
  const list=DB.filter(g=>{ if(state.dictRole!=='all'){ const r=state.dictRole; if(r==='nat'){ if(!isNatural(g)) return false; } else if(r==='a25'){ if(!g.a25) return false; } else if(r==='pres'){ if(!['pres','antiox','chel','ph','thick'].includes(g.r)) return false; } else if(r==='frag'){ if(!['frag','col'].includes(g.r)) return false; } else if(groupOf(g.r)!==r||['pres','antiox','chel','ph','thick'].includes(g.r)) return false; }
    if(state.dictGrade!=='all' && g.g!==+state.dictGrade) return false;
    if(state.dictFn!=='all' && !g.b.includes(state.dictFn)) return false;
    if(state.dictOrigin!=='all' && originOf(g)!==state.dictOrigin) return false;
    if(q && ![g.ko,g.inci,...g.al].some(n=>norm(n).includes(q))) return false; return true; });
  return topbar('성분 사전','home') + `<div class="stack">
    <div class="sticky-filters">
    <label class="field">${ic('search','s')}<span class="sr">성분 검색</span><input type="search" id="dictQ" placeholder="한글명·INCI·옛 이름으로 검색" value="${esc(state.dictQ)}" autocomplete="off"></label>
    <div class="chiprow">${[...PAL_ROLES,['a25','알레르기 25종']].map(([k,n])=>`<button class="chip sm ${state.dictRole===k?'sel':''}" data-act="dict-role" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="row" style="flex-wrap:wrap"><span class="xs muted">등급</span>${[['all','전체'],['0','안심'],['1','주의'],['2','경고']].map(([k,n])=>`<button class="chip sm ${state.dictGrade===k?'sel':''}" data-act="dict-grade" data-v="${k}">${n}</button>`).join('')}<select class="msel sm" id="dictFn" aria-label="기능"><option value="all">기능 전체</option>${Object.keys(BENEFIT_TXT).map(k=>`<option value="${k}" ${state.dictFn===k?'selected':''}>${k}</option>`).join('')}</select><select class="msel sm" id="dictOrigin" aria-label="유래"><option value="all">유래 전체</option>${Object.entries(ORIGIN_N).filter(([k])=>k!=='water').map(([k,n])=>`<option value="${k}" ${state.dictOrigin===k?'selected':''}>${n}</option>`).join('')}</select><span class="xs muted" style="margin-left:auto">${list.length}개 / 전체 ${DB.length}개</span></div>
    </div>
    <div class="dict-grid" id="dictList">${list.length?list.map(g=>`<button class="dcard" data-act="open-ing" data-id="${esc(g.ko)}">${ingArt(g,'art sm')}<span class="t"><b>${esc(g.ko)}</b><small>${esc(g.inci)}</small><span class="row" style="gap:4px"><span class="badge g${g.g}">${GRADE[g.g]}</span><small>${ROLE[g.r].n}</small></span></span></button>`).join(''):`<div class="empty" style="grid-column:1/-1">맞는 성분이 없어요.</div>`}</div>
    <p class="footnote">명칭은 대한화장품협회 성분사전 표준명, 그림은 역할의 원리를 나타낸 도식이에요. 등급과 설명은 이 데모가 정한 요약이라 정식 버전 전에 검수가 필요해요.</p>
  </div>`;
}
function refreshDict(){ if(state.screen==='dict') render(); }

function usedIn(g){
  const types=Object.values(TYPES).filter(t=>t.recipe.some(([id])=>id===g.ko)).map(t=>t.name);
  const prods=SEED_PRODUCTS.filter(pr=>pr.key.includes(g.ko)).slice(0,3).map(pr=>pr.brand+' '+pr.name);
  return {types,prods};
}
function explainHTML(g){
  const e = EXT[g.ko] || (g.a25 ? A25_EXT : {});
  const what = [g.d, e.what].filter(Boolean).join(' ');
  const why = e.why || ((ROLE_WHY[g.r]||ROLE_WHY.etc) + ' ' + (ROLE_TIP[g.r]||''));
  const low = e.low || ROLE_LOW[g.r] || '—';
  const high = e.high || ((g.mx!=null&&g.mx>=0.01) ? `${g.mx}%를 넘기지 않는 게 좋아요. ${ROLE_HIGH[g.r]||''}` : (ROLE_HIGH[g.r]||'—'));
  const tip = e.tip || ROLE_USE[g.r] || '';
  const u = usedIn(g); const bene = g.b.map(b=>BENEFIT_TXT[b]||b).join(', ');
  const sec=(title,body,icon='info')=>`<div class="exp"><div class="exp-h">${ic(icon,'xs')}<b>${title}</b></div><p>${esc(body)}</p></div>`;
  return `<div class="stack" style="gap:10px">
    ${sec('무엇인가요', what, 'info')}
    ${sec('왜 넣나요', why + (bene?` 이 성분에 기대하는 역할은 ${bene}이에요.`:''), 'leaf')}
    <div class="exp"><div class="exp-h">${ic('drop','xs')}<b>적으면 · 많으면</b></div><div class="lowhigh"><div><span class="badge g0">적으면</span><p>${esc(low)}</p></div><div><span class="badge g1">많으면</span><p>${esc(high)}</p></div></div></div>
    ${tip?sec('이렇게 쓰세요', tip, 'check'):''}
    ${(u.types.length||u.prods.length)?`<div class="exp"><div class="exp-h">${ic('search','xs')}<b>어디에 쓰이나요</b></div><p>${u.types.length?`이 앱의 기본 레시피 중 ${esc(u.types.join(', '))}에 들어 있어요.`:''}${u.prods.length?` 시중 제품 예: ${esc(u.prods.join(', '))}.`:''}</p></div>`:''}
  </div>`;
}
// ===== 성분 카드 =====
function openIng(id, name, ctx){
  state._ingCtx = ctx; const g=ING[id]; const body=$('#sheetIngBody'); let html='';
  const inRecipe = !!(state.recipe && g && state.recipe.items.some(i=>i.id===g.ko));
  if (g){
    const actions = ctx==='palette' ? `<div class="sheet-actions"><button class="btn outl" data-act="back-palette">${ic('back','s')} 넣지 않기</button><button class="btn" data-act="add-from-card" data-id="${esc(g.ko)}" ${inRecipe?'disabled':''}>${ic('plus','s')} ${inRecipe?'이미 들어 있어요':'비커에 넣기'}</button></div>`
      : ctx==='recipe' ? `<div class="sheet-actions"><button class="btn outl" data-act="remove-from-card" data-id="${esc(g.ko)}">${ic('x','s')} 비커에서 빼기</button><button class="btn tonal" data-act="close-sheets">닫기</button></div>`
      : (state.recipe && !inRecipe && ['mix','type','dict'].includes(state.screen) ? `<div class="sheet-actions"><button class="btn tonal" data-act="close-sheets">닫기</button><button class="btn" data-act="add-from-card" data-id="${esc(g.ko)}" data-stay="1">${ic('plus','s')} 지금 배합에 넣기</button></div>` : '');
    html = `<div class="between" style="align-items:flex-start"><div class="row" style="gap:12px;align-items:flex-start">${ingArt(g)}<div><h2 class="h2" style="font-size:18px">${esc(g.ko)}</h2><p class="small muted">${esc(g.inci)}</p><div class="wrap" style="margin-top:6px;gap:6px"><span class="badge g${g.g}">${GRADE[g.g]}</span>${originBadge(g)}</div></div></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
    <div class="wrap"><span class="ichip ${chipClass(g.r)}" style="cursor:default">${ROLE[g.r].n}</span>${g.a25?`<span class="badge a25">${ic('warn','xs')} 알레르기 유발성분 25종</span>`:''}${g.b.map(b=>`<span class="badge">${esc(BENEFIT_TXT[b]||b)}</span>`).join('')}</div>
    ${explainHTML(g)}
    ${(()=>{ const alts=alternativesFor(g); if(!alts.length) return ''; return `<div class="stack" style="gap:6px"><b class="small">${ic('swap','xs')} 더 순한 대체 성분</b><div class="stack" style="gap:6px">${alts.map(a=>`<div class="between" style="gap:8px"><button class="ichip ${chipClass(a.r)}" data-act="open-ing" data-id="${esc(a.ko)}" data-ctx="${esc(ctx||'')}">${esc(a.ko)}</button><span class="xs muted" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.d)}</span>${inRecipe?`<button class="btn text" style="min-height:32px" data-act="swap-ing" data-from="${esc(g.ko)}" data-to="${esc(a.ko)}">바꾸기</button>`:''}</div>`).join('')}</div></div>`; })()}
    <dl class="kv" style="margin:0">${g.mx!=null&&g.mx>=0.01?`<div><dt>권장 상한(앱 기준)</dt><dd>${g.mx}%</dd></div>`:''}${g.a25?`<div><dt>표시 의무</dt><dd>씻어내지 않는 제품 0.001%, 씻어내는 제품 0.01% 초과 시</dd></div>`:''}${g.b.length?`<div><dt>기대 역할</dt><dd>${g.b.map(b=>BENEFIT_TXT[b]||b).join(', ')}</dd></div>`:''}<div><dt>DIY 레시피</dt><dd>${g.diy===1?'초보 목록에 있음':g.diy===2?'고급 원료':'초보 목록에 없음'}</dd></div></dl>
    ${g.al.length?`<p class="xs muted">다른 표기: ${esc(g.al.slice(0,5).join(', '))}</p>`:''}
    <div class="between" style="gap:8px;flex-wrap:wrap"><span class="small ${isAvoided(g)?'':'muted'}">${isAvoided(g)?`${ic('shield','xs')} 내 프로필에서 피하는 성분이에요 (${esc(avoidReasons(g).join(', '))})`:'내 피부에 안 맞았던 성분이라면'}</span><button class="btn text" style="min-height:34px;padding:0 10px" data-act="avoid-id" data-id="${esc(g.ko)}" data-card="1">${state.avoid.ids.includes(g.ko)?'피하기 해제':'피하기에 추가'}</button></div>
    <a class="link-out" href="https://www.google.com/search?q=${encodeURIComponent(g.ko+' 화장품')}" target="_blank" rel="noopener">${ic('search','xs')} 이 성분이 든 시중 제품 검색 ↗</a>
    <p class="footnote">명칭: 대한화장품협회 성분사전 표준명 기준 · 설명과 등급은 이 데모가 정한 요약이에요.</p>
    ${aiOn()?`<div class="between"><span class="small muted">더 알고 싶다면</span>${state.aiBusy.ing?`<span class="thinking"><i></i>답변 중…</span>`:`<button class="btn text" data-act="ai-ing" data-id="${esc(g.ko)}" ${aiLeft()?'':'disabled'}>${ic('spark','s')} AI에게 물어보기</button>`}</div><div class="ai-box small" id="aiIng"></div>`:''}
    ${actions}`;
  } else {
    const u=state.analysis.aiInfo[name];
    html = `<div class="between" style="align-items:flex-start"><div><h2 class="h2" style="font-size:18px">${esc(name)}</h2><p class="small muted">${u&&u.inci?esc(u.inci):'성분 DB에 없는 이름이에요'}</p></div><button class="iconbtn sm" data-act="close-sheets" aria-label="닫기">${ic('x','s')}</button></div>
    ${u?`<div class="wrap"><span class="ichip ${chipClass(ROLE_BY_NAME[u.role]||'etc')}" style="cursor:default">${esc(u.role)}</span><span class="badge g${u.grade}">${GRADE[u.grade]}</span>${u.allergen25?`<span class="badge a25">알레르기 유발성분 25종</span>`:''}</div><p>${esc(u.desc)}</p><p class="footnote">AI가 답한 내용이라 정확하지 않을 수 있어요. 성분사전에서 한 번 더 확인하세요.</p>`:`<p class="small">표기가 다르거나 이 데모의 DB(약 ${DB.length}종)에 아직 없는 성분이에요. ${aiOn()?'분석 화면의 「AI에게 물어보기」로 역할을 확인할 수 있어요.':''}</p>`}
    <a class="link-out" href="https://kcia.or.kr/cid/main/" target="_blank" rel="noopener">대한화장품협회 성분사전에서 찾기 ↗</a>`;
  }
  body.innerHTML=html; openSheet('sheetIng');
}
async function runAIIng(id){
  const g=ING[id]; const ck='ingx|'+hashStr(g.ko); const hit=cacheGet(ck); if (hit){ openIng(id, null, state._ingCtx); const b0=$('#aiIng'); if(b0) b0.textContent=hit; return; }
  state.aiBusy.ing=true; openIng(id, null, state._ingCtx);
  try{ const box=$('#aiIng'); if(box) box.innerHTML='<span class="thinking"><i></i>생각하는 중…</span>';
    const {text}=await aiCall('text', `화장품 성분 ${g.ko}(${g.inci})에 대해 초보 소비자에게 한국어 존댓말로 4문장 이내로 설명해 주세요: 주로 어떤 역할인지, 어떤 제품에 흔한지, 조심할 점이 있는지. 치료·완치 같은 의약품 표현과 마크다운 기호는 쓰지 말고, 확실하지 않은 내용은 "자료 없음"이라고 하세요.`, {modelTier:'quick', onText:({text})=>{ const b=$('#aiIng'); if(b) b.textContent=soften(text); }});
    const b=$('#aiIng'); if(b) b.textContent=soften(text); cacheSet(ck, soften(text));
  }catch(e){ const b=$('#aiIng'); if(b) b.textContent=''; toast(errMsg(e)); }
  state.aiBusy.ing=false; const btn=document.querySelector('[data-act="ai-ing"]'); if(btn) btn.disabled=!aiLeft();
}

// ===== 저장 =====
function saveRecipe(){
  const r=state.recipe; if(!r||!r.items.length){ toast('저장할 배합이 없어요.'); return; }
  const rec={k:'recipe',name:r.name,typeId:r.typeId,items:r.items.map(i=>({...i})),pack:{...r.pack},auto:r.auto,at:Date.now()};
  const idx=state.saved.findIndex(s=>s.k==='recipe'&&s.name===r.name&&s.typeId===r.typeId);
  if (idx>-1) state.saved[idx]=rec; else state.saved.unshift(rec);
  persistSaved(); toast(idx>-1?'배합을 덮어썼어요.':(state.cloud.ref?'보관함에 저장했어요 (클라우드 동기화).':'보관함에 저장했어요.'));
}
function saveAnalysis(){
  const a=state.analysis; if(!a.items) return;
  state.saved.unshift({k:'analysis',name:a.name||(a.items[0]?a.items[0].name+' 외 '+(a.items.length-1)+'개':'분석'),raw:a.raw,n:a.items.length,at:Date.now()});
  persistSaved(); toast('분석 결과를 저장했어요.');
}

// ===== 클라우드 보관함 · 갤러리 (Claude 안에서 열었을 때) =====
function persistSaved(){ state.saved=state.saved.slice(0,50); store.set('lab.saved',state.saved); persistCloud(); }
async function persistCloud(){ const c=state.cloud; if(!c.ref) return; try{ await c.ref.set({saved:state.saved, skin:state.skin, avoid:state.avoid, routine:state.routine, at:Date.now()}); c.synced=true; }catch(e){ c.synced=false; if(e&&e.code==='quota_exceeded') toast('클라우드 저장 공간이 가득 찼어요.'); } }
function mergeSaved(remote){ const map=new Map(); [...state.saved, ...(remote||[])].forEach(s=>{ if(!s||!s.at) return; const k=s.at+'|'+s.k; if(!map.has(k)) map.set(k,s); }); state.saved=[...map.values()].sort((a,b)=>b.at-a.at).slice(0,50); }
async function initCloud(){
  try{
    if (!(window.claude && typeof window.claude.use==='function')) return;
    const db = await window.claude.use('db'); if(!db) return;
    const user = await window.claude.use('user').catch(()=>null);
    const uid = user ? await user.id().catch(()=>null) : null;
    state.cloud.db=db; state.cloud.user=user; state.cloud.uid=uid;
    if (uid){
      const ref = db.doc('data/users/'+uid+'/lab'); state.cloud.ref=ref;
      const snap = await ref.get();
      if (snap.exists){ const d=snap.data()||{}; mergeSaved(d.saved); if(d.skin && !state.skin) state.skin=d.skin; if(d.avoid && !avoidCount() && (d.avoid.groups||d.avoid.ids)) { state.avoid={groups:d.avoid.groups||[], ids:d.avoid.ids||[]}; store.set('lab.avoid',state.avoid); } if(d.routine && !(state.routine.am||[]).length && !(state.routine.pm||[]).length){ state.routine={am:d.routine.am||[], pm:d.routine.pm||[]}; store.set('lab.routine',state.routine); } store.set('lab.saved',state.saved); }
      await persistCloud();
      ref.onSnapshot(s=>{ if(!s.exists||s.metadata.hasPendingWrites) return; const d=s.data()||{}; const remote=(d.saved||[]).slice(0,50); if(JSON.stringify(remote)!==JSON.stringify(state.saved)){ state.saved=remote; store.set('lab.saved',state.saved); if(['home','saved'].includes(state.screen)) render(); } }, ()=>{});
    }
  }catch(e){}
  finally{ state.cloud.ready=true; if(['home','saved','done'].includes(state.screen)) render(); }
}
async function loadGallery(){
  const c=state.cloud; if(!c.db){ state.gallery.items=[]; render(); return; }
  state.gallery.busy=true; render();
  try{
    const qs = await c.db.collection('gallery').orderBy('at','desc').limit(50).get();
    state.gallery.items = qs.docs.filter(d=>d.exists).map(d=>({id:d.id, ...(d.data()||{})}));
    const ids=[...new Set(state.gallery.items.map(i=>i.by).filter(Boolean))];
    if (c.user && ids.length){ try{ const ps=await c.user.profiles(ids); ids.forEach(id=>{ state.gallery.names[id]=(ps&&ps[id]&&ps[id].name)||''; }); }catch(e){} }
  }catch(e){ state.gallery.items=state.gallery.items||[]; toast('갤러리를 불러오지 못했어요.'); }
  state.gallery.busy=false; render();
}
async function publishToGallery(){
  const c=state.cloud; if(!c.db||!c.uid){ toast('갤러리 공개는 Claude 안에서 열었을 때 쓸 수 있어요.'); return; }
  const r=state.recipe; const R=evaluate(r);
  try{ await c.db.collection('gallery').add({name:r.name, typeId:r.typeId, items:r.items.map(i=>({id:i.id,pct:i.pct})), pack:{shape:r.pack.shape,material:r.pack.material,volume:r.pack.volume,color:r.pack.color,label:r.pack.label||'minimal'}, grade:{g0:R.grade[0],g1:R.grade[1],g2:R.grade[2]}, by:c.uid, at:Date.now(), likes:{}}); state.gallery.items=null; toast('갤러리에 공개했어요.'); }
  catch(e){ toast(e&&e.code==='quota_exceeded'?'갤러리가 가득 찼어요.':'공개하지 못했어요. 다시 시도해 주세요.'); }
}
async function toggleLike(id){
  const c=state.cloud; const it=(state.gallery.items||[]).find(g=>g.id===id); if(!it||!c.uid) return;
  const liked=!!(it.likes&&it.likes[c.uid]); it.likes={...(it.likes||{}),[c.uid]:!liked}; render();
  try{ await c.db.doc('gallery/'+id).update({likes:{[c.uid]:!liked}}); }catch(e){ toast('반영하지 못했어요.'); }
}
async function deleteGallery(id){
  try{ await state.cloud.db.doc('gallery/'+id).delete(); state.gallery.items=(state.gallery.items||[]).filter(g=>g.id!==id); render(); toast('갤러리에서 내렸어요.'); }catch(e){ toast('삭제하지 못했어요.'); }
}
function galleryItem(g){
  const c=state.cloud; const t=TYPES[g.typeId]; const likes=Object.values(g.likes||{}).filter(Boolean).length; const liked=!!(c.uid&&g.likes&&g.likes[c.uid]); const mine=c.uid&&g.by===c.uid; const who=mine?'나':(state.gallery.names[g.by]||'연구원');
  const pack={shape:(g.pack&&g.pack.shape)||(t?t.pack.shape:'jar'),material:(g.pack&&g.pack.material)||'pp',volume:(g.pack&&g.pack.volume)||'',color:(g.pack&&g.pack.color)||LABEL_COLORS[0],label:(g.pack&&g.pack.label)||'minimal'};
  const gr=g.grade||{};
  return `<div class="gcard"><div class="thumb">${containerSVG(pack,g.name||'')}</div><div class="body"><div class="between"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name||'이름 없음')}</b><span class="xs muted" style="flex-shrink:0">${esc(who)}</span></div>
    <div class="wrap" style="gap:4px"><span class="badge">${esc(t?t.name:'')}</span><span class="badge g0">안심 ${gr.g0??0}</span><span class="badge g1">주의 ${gr.g1??0}</span><span class="badge g2">경고 ${gr.g2??0}</span></div>
    <div class="wrap" style="gap:4px">${(g.items||[]).filter(i=>ING[i.id]&&!['water','pres','thick','ph','chel'].includes(ING[i.id].r)).slice(0,4).map(i=>ingChip(i.id)).join('')}</div>
    <div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button class="like ${liked?'on':''}" data-act="gallery-like" data-id="${esc(g.id)}" aria-pressed="${liked}">${ic('heart','xs')} ${likes}</button>${mine?`<button class="btn text" data-act="gallery-del" data-id="${esc(g.id)}">내리기</button>`:''}<button class="btn tonal" style="min-height:36px;padding:0 14px" data-act="gallery-open" data-id="${esc(g.id)}">비커에 담기</button></div></div></div>`;
}

// ===== 렌더 =====
const VIEWS={home:viewHome,type:viewType,mix:viewMix,report:viewReport,pack:viewPack,done:viewDone,analyze:viewAnalyze,saved:viewSaved,dict:viewDict,compare:viewCompare};
function render(){
  if (['mix','report','pack','done'].includes(state.screen) && !state.recipe) state.screen='type';
  if (state.screen!=='saved' && state.compare.on){ state.compare.on=false; }
  const anim = state._anim || 'none'; state._anim='';
  $('#main').innerHTML = `<div class="screen ${anim}">${VIEWS[state.screen]()}</div>`;
  if (state.screen==='mix' && state.recipe){ const R=evaluate(state.recipe); if (anim!=='none'){ MIX_AL.shown.clear(); MIX_AL.flashes=[]; MIX_AL.visible=false; MIX_AL.userDismissed=false; syncMixAlerts(R,{force:true}); } else { const wasVisible=MIX_AL.visible; syncMixAlerts(R,{silent:true}); if (wasVisible) renderBanners(true); } } else { clearTimeout(MIX_AL.timer); MIX_AL.visible=false; }
  const navKey = {home:'home',type:'make',mix:'make',report:'make',pack:'make',done:'make',analyze:'analyze',saved:'saved',compare:'saved',dict:'dict'}[state.screen];
  if (state.screen==='mix' && anim!=='none') maybeStartTour();
  document.querySelectorAll('.navitem').forEach(b=>b.classList.toggle('on', b.dataset.to===navKey));
  document.title = '내 화장품 연구소';
}
function go(screen, dir){ closeSheets(); state._anim = dir || 'forward'; state.screen=screen; render(); window.scrollTo({top:0}); }

// ===== 이벤트 =====
document.addEventListener('click', e=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  if (el.tagName==='A' && (el.getAttribute('href')||'').startsWith('#')) e.preventDefault();
  const act=el.dataset.act, d=el.dataset;
  switch(act){
    case 'nav': { let to=d.to; if (to==='make') to = state.recipe ? 'mix' : 'type'; const dir = d.dir || (el.closest('.bottomnav,.rail') ? 'fade' : 'forward'); if (to===state.screen && dir==='fade') { window.scrollTo({top:0,behavior:'smooth'}); break; } go(to, dir); break; }
    case 'pick-cat': state.cat=d.id; state.pickType=null; render(); break;
    case 'pick-type': state.pickType=d.id; render(); { const el=$('#typeDetail'); if(el){ const r=el.getBoundingClientRect(); if (r.bottom>innerHeight-80) el.scrollIntoView({block:'nearest',behavior:'smooth'}); } } break;
    case 'start': state.recipe=newRecipe(d.id, d.mode); state.hist=[]; state.redo=[]; state.palRole='all'; state.palQ=''; go('mix'); break;
    case 'open-palette': $('#sheetPaletteBody').innerHTML=paletteHTML(); openSheet('sheetPalette'); setTimeout(()=>{ const q=$('#sheetPalette #palQ'); if(q) q.focus(); },260); break;
    case 'close-sheets': closeSheets(); break;
    case 'pal-role': state.palRole=d.id; refreshPalette(); break;
    case 'add-ing': { const g=ING[d.id]; if(!g||!state.recipe) break; pushHist(); const room=state.recipe.auto&&state.recipe.items.some(i=>i.id==='정제수')?(state.recipe.items.find(i=>i.id==='정제수').pct):remaining(); const pct=Math.min(defaultPct(g), room); state.recipe.items.push({id:g.ko,pct}); balance(state.recipe); toast(pct<defaultPct(g)?`${g.ko} 추가 — 합계가 100%라 ${fmt(pct)}%만 넣었어요`:`${g.ko} 추가`); if(isDesktop()){ render(); } else { render(); $('#sheetPaletteBody').innerHTML=paletteHTML(); openSheet('sheetPalette'); } break; }
    case 'remove-ing': pushHist(); state.recipe.items=state.recipe.items.filter(i=>i.id!==d.id); balance(state.recipe); render(); break;
    case 'undo': restoreHist(state.hist, state.redo); break;
    case 'redo': restoreHist(state.redo, state.hist); break;
    case 'recommend': closeSheets(); recommendMix(); break;
    case 'ranges': openInfoSheet(rangesHTML()); break;
    case 'warn-all': openInfoSheet(warnAllHTML()); break;
    case 'to-report': { const R=evaluate(state.recipe); if (Math.abs(R.total-100)>0.5) openInfoSheet(totalGateHTML(R)); else go('report'); break; }
    case 'fix-water': { const r=state.recipe; pushHist(); r.auto=true; balance(r); closeSheets(); const R=evaluate(r); if (Math.abs(R.total-100)<=0.5){ toast('정제수로 100%를 맞췄어요.'); go('report'); } else { render(); toast('정제수만으로는 다 못 맞췄어요. 다른 성분을 줄이거나 추천 비율을 써 보세요.'); } break; }
    case 'report-anyway': closeSheets(); go('report'); break;
    case 'banner-close': { e.stopPropagation(); clearTimeout(MIX_AL.timer); MIX_AL.userDismissed=true; MIX_AL.flashes=[]; hideBanners(); break; }
    case 'swap-ing': { const from=d.from, to=d.to; const r=state.recipe; if(!r||!ING[to]) break; const it=r.items.find(i=>i.id===from); if(it){ pushHist(); if(r.items.some(i=>i.id===to)){ r.items=r.items.filter(i=>i!==it); } else { it.id=to; const mx=ING[to].mx; if(mx!=null&&mx>=0.01&&it.pct>mx) it.pct=mx; } balance(r); } closeSheets(); render(); toast(`${from} → ${to}(으)로 바꿨어요.`); break; }
    case 'diy-batch': state.diyBatch=+d.v; state.diyOpen=true; render(); break;
    case 'copy-inci': copyText(inciText(state.recipe)); break;
    case 'open-ing': openIng(d.id, d.name, d.ctx); break;
    case 'back-palette': closeSheets(); if(!isDesktop()){ $('#sheetPaletteBody').innerHTML=paletteHTML(); openSheet('sheetPalette'); } break;
    case 'add-from-card': { const g=ING[d.id]; if(!g||!state.recipe) break; if(!state.recipe.items.some(i=>i.id===g.ko)){ pushHist(); const room=state.recipe.auto&&state.recipe.items.some(i=>i.id==='정제수')?(state.recipe.items.find(i=>i.id==='정제수').pct):remaining(); state.recipe.items.push({id:g.ko,pct:Math.min(defaultPct(g),room)}); balance(state.recipe); } toast(`${g.ko} 넣었어요`); closeSheets(); if(d.stay){ if(state.screen==='mix') render(); else { go('mix'); } } else if(isDesktop()){ render(); } else { render(); $('#sheetPaletteBody').innerHTML=paletteHTML(); openSheet('sheetPalette'); } break; }
    case 'remove-from-card': pushHist(); state.recipe.items=state.recipe.items.filter(i=>i.id!==d.id); balance(state.recipe); closeSheets(); render(); toast('뺐어요.'); break;
    case 'copy-recipe': copyText(recipeText(state.recipe)); break;
    case 'save-card-image': saveCardImage(); break;
    case 'skin': state.skin=d.v; store.set('lab.skin',state.skin); persistCloud(); render(); break;
    case 'dict-role': state.dictRole=d.v; render(); break;
    case 'dict-grade': state.dictGrade=d.v; render(); break;
    case 'save-recipe': saveRecipe(); render(); break;
    case 'save-analysis': saveAnalysis(); break;
    case 'ai-report': runAIReport(); break;
    case 'ai-eval': runAIEval(); break;
    case 'ai-enable': enableAI(); break;
    case 'settings': openSettings(); break;
    case 'consent-ok': acceptConsent(); break;
    case 'routine-slot': state.routineSlot=d.v; render(); break;
    case 'routine-pick': $('#sheetIngBody').innerHTML=routinePickHTML(d.slot); openSheet('sheetIng'); break;
    case 'routine-toggle': { const l=state.routine[d.slot]=state.routine[d.slot]||[]; const at=+d.at; const i=l.indexOf(at); if(i>=0) l.splice(i,1); else l.push(at); saveRoutine(); $('#sheetIngBody').innerHTML=routinePickHTML(d.slot); if(state.screen==='saved') render(); break; }
    case 'routine-remove': { const l=state.routine[d.slot]||[]; const i=l.indexOf(+d.at); if(i>=0) l.splice(i,1); saveRoutine(); render(); break; }
    case 'routine-open': { const s=state.saved.find(x=>x.at===+d.at); if(!s) break; state.analysis.raw=s.raw; state.analysis.name=s.name; state.analysis.tab='text'; analyzeRaw(); go('analyze'); break; }
    case 'routine-add-current': { const at=ensureAnalysisSaved(); if(at==null){ toast('먼저 전성분을 분석해 주세요.'); break; } $('#sheetIngBody').innerHTML=slotPickHTML(at); openSheet('sheetIng'); break; }
    case 'routine-put': { const at=+d.at; const slots=d.slot==='both'?['am','pm']:[d.slot]; slots.forEach(sl=>{ const l=state.routine[sl]=state.routine[sl]||[]; if(!l.includes(at)) l.push(at); }); saveRoutine(); closeSheets(); toast(`내 화장대(${slots.map(x=>x==='am'?'아침':'저녁').join('·')})에 담았어요.`); state.savedTab='routine'; state.routineSlot=slots[0]; go('saved'); break; }
    case 'compare-toggle': state.compare.on=!state.compare.on; state.compare.sel=[]; render(); break;
    case 'cmp-pick': { const at=+d.at; const sel=state.compare.sel; const i=sel.indexOf(at); if(i>=0) sel.splice(i,1); else { if(sel.length>=2) sel.shift(); sel.push(at); } render(); break; }
    case 'compare-go': if(state.compare.sel.length===2) go('compare'); break;
    case 'compare-reset': state.compare.on=true; state.compare.sel=[]; state.savedTab='mine'; go('saved','back'); break;
    case 'load-at': { const i=state.saved.findIndex(x=>x.at===+d.at); if(i<0) break; const s=state.saved[i]; if(s.k==='recipe'){ state.recipe={name:s.name,typeId:s.typeId,items:s.items.map(x=>({...x})),pack:{...s.pack},auto:s.auto!==false}; state.pickType=s.typeId; state.cat=TYPES[s.typeId].cat; go('mix'); } else { state.analysis.raw=s.raw; state.analysis.name=s.name; state.analysis.tab='text'; analyzeRaw(); go('analyze'); } break; }
    case 'set-font': state.cfg.fontScale=d.v; saveCfg(); applyScale(); refreshSettings(); break;
    case 'set-theme': state.cfg.theme=d.v; saveCfg(); applyTheme(); refreshSettings(); break;
    case 'tour-start': closeSheets(); if(state.screen==='mix'&&state.recipe){ startTour(); } else { state._tourAsk=true; toast('배합 화면에 들어가면 안내가 시작돼요.'); if(!state.recipe) go('type'); else go('mix'); } break;
    case 'tour-next': TOUR.i++; showTourStep(); break;
    case 'tour-skip': endTour(); break;
    case 'avoid-open': openAvoidSheet(); break;
    case 'avoid-group': { const g=state.avoid.groups; const i=g.indexOf(d.v); if(i>=0) g.splice(i,1); else g.push(d.v); saveAvoid(); refreshAvoidSheet(); if(state.screen==='home') render(); break; }
    case 'avoid-id': { const ids=state.avoid.ids; const i=ids.indexOf(d.id); if(i>=0) ids.splice(i,1); else ids.push(d.id); saveAvoid(); toast(i>=0?`${d.id}을(를) 피하기에서 뺐어요.`:`${d.id}을(를) 피하는 성분에 넣었어요.`); if (d.card){ openIng(d.id, null, state._ingCtx); } else { refreshAvoidSheet(); const q=$('#avoidQ'); if(q){ q.focus(); } } if(state.screen==='home') render(); break; }
    case 'avoid-clear': state.avoid={groups:[],ids:[]}; saveAvoid(); refreshAvoidSheet(); if(state.screen==='home') render(); break;
    case 'consent-show': closeSheets(); showConsent(); break;
    case 'set-src': state.cfg.src=d.v; saveCfg(); state.aiTest=null; refreshSettings(); render(); break;
    case 'set-prov': state.cfg.provider=d.v; saveCfg(); state.aiTest=null; state.showKey=false; refreshSettings(); render(); break;
    case 'key-eye': { state.showKey=!state.showKey; const i=$('#apiKey'); if(i){ i.type=state.showKey?'text':'password'; el.innerHTML=ic(state.showKey?'eyeoff':'eye','s'); el.setAttribute('aria-label', state.showKey?'키 숨기기':'키 보이기'); i.focus(); } break; }
    case 'set-models': loadModels(); break;
    case 'set-test': testAI(); break;
    case 'set-clear': { delete state.keys[state.cfg.provider]; saveKeys(); state.aiTest=null; delete state.modelList[state.cfg.provider]; refreshSettings(); render(); toast(`${PROVIDERS[state.cfg.provider].name} 키를 지웠어요.`); break; }
    case 'ai-stop': { const c=state.ctl[d.k]; if(c) c.abort(); break; }
    case 'ai-similar': runAISimilar(); break;
    case 'ai-ing': runAIIng(d.id); break;
    case 'ai-unknown': runUnknown(); break;
    case 'ai-asum': runASum(); break;
    case 'pack': state.recipe.pack[d.k]=d.v; render(); break;
    case 'atab': state.analysis.tab=d.v; render(); break;
    case 'a-sample': state.analysis.raw=SAMPLE_TEXT; state.analysis.name=''; render(); break;
    case 'a-run': { const ta=$('#rawIn'); if(ta) state.analysis.raw=ta.value; if(!parseList(state.analysis.raw).length){ toast('전성분을 먼저 붙여넣어 주세요.'); break; } state.analysis.name=''; analyzeRaw(); render(); break; }
    case 'a-make': { const S=analysisSummary(state.analysis.items); state.analysis.makeType=S.guess; render(); break; }
    case 'a-make-go': { const sel=$('#makeSel'); const typeId=sel?sel.value:state.analysis.makeType; state.recipe=recipeFromAnalysis(state.analysis.items, typeId); state.pickType=typeId; state.cat=TYPES[typeId].cat; go('mix'); toast('비커에 담았어요. 비율을 조정해 보세요.'); break; }
    case 'load-saved': { const s=state.saved[+d.i]; if(!s) break; if(s.k==='recipe'){ state.recipe={name:s.name,typeId:s.typeId,items:s.items.map(i=>({...i})),pack:{...s.pack},auto:s.auto!==false}; state.pickType=s.typeId; state.cat=TYPES[s.typeId].cat; go('mix'); } else { state.analysis.raw=s.raw; state.analysis.name=s.name; state.analysis.tab='text'; analyzeRaw(); go('analyze'); } break; }
    case 'del-saved': state.saved.splice(+d.i,1); persistSaved(); render(); toast('삭제했어요.'); break;
    case 'saved-tab': state.savedTab=d.v; if(d.v==='gallery'&&!state.gallery.items) loadGallery(); else render(); break;
    case 'gallery-refresh': loadGallery(); break;
    case 'gallery-publish': publishToGallery(); break;
    case 'gallery-like': toggleLike(d.id); break;
    case 'gallery-del': deleteGallery(d.id); break;
    case 'gallery-open': { const g=(state.gallery.items||[]).find(x=>x.id===d.id); if(!g||!TYPES[g.typeId]) break; state.recipe={name:g.name,typeId:g.typeId,items:(g.items||[]).filter(i=>ING[i.id]).map(i=>({id:i.id,pct:+i.pct||0})),pack:{...TYPES[g.typeId].pack,...(g.pack||{})},auto:true}; delete state.recipe.pack.shapes; delete state.recipe.pack.materials; delete state.recipe.pack.volumes; state.pickType=g.typeId; state.cat=TYPES[g.typeId].cat; go('mix'); toast('갤러리 배합을 비커에 담았어요.'); break; }
  }
});
document.addEventListener('input', e=>{
  const t=e.target;
  if (t.matches('[data-slider]') && state.recipe){ const id=t.dataset.slider; MIX_AL.dragging=true; clearTimeout(MIX_AL.timer); if(state._dragId!==id){ pushHist(); state._dragId=id; if (MIX_AL.visible) hideBanners(); } const v=applyPct(id, t.value); if (Math.abs(parseFloat(t.value)-v)>0.001) t.value=v; const row=t.closest('.irow'); const y0=row?row.getBoundingClientRect().top:0; patchMix(); if(row){ const dy=row.getBoundingClientRect().top-y0; if (Math.abs(dy)>0.5) window.scrollBy(0, dy); } }
  else if (t.id==='palQ'){ state.palQ=t.value; refreshPalette(); }
  else if (t.id==='avoidQ'){ state.avoidQ=t.value; const pos=t.selectionStart; refreshAvoidSheet(); const q=$('#avoidQ'); if(q){ q.focus(); try{ q.setSelectionRange(pos,pos); }catch(e){} } }
  else if (t.id==='dictQ'){ state.dictQ=t.value; const l=$('#dictList'); if(l){ const pos=t.selectionStart; render(); const q=$('#dictQ'); if(q){ q.focus(); try{ q.setSelectionRange(pos,pos); }catch(e){} } } }
  else if (t.id==='nameIn' && state.recipe){ state.recipe.name=t.value.trim()||TYPES[state.recipe.typeId].name; const pv=document.querySelector('.preview'); if(pv){ pv.innerHTML=`<span class="tag">미리보기</span>${containerSVG(state.recipe.pack, state.recipe.name)}`; } }
  else if (t.id==='rawIn'){ state.analysis.raw=t.value; }
  else if (t.id==='apiKey'){ const p=state.cfg.provider; const v=t.value.trim(); if(v) state.keys[p]=v; else delete state.keys[p]; saveKeys(); state.aiTest=null; const has=!!v; document.querySelectorAll('#sheetSettings [data-act="set-test"],#sheetSettings [data-act="set-models"],#sheetSettings [data-act="set-clear"]').forEach(b=>b.disabled=!has); const al=document.querySelector('#sheetSettings .alert.ok,#sheetSettings .alert.bad'); if(al) al.remove(); if(state.screen==='home') render(); }
  else if (t.id==='modelIn'){ state.cfg.model[state.cfg.provider]=t.value.trim()||'__custom'; saveCfg(); state.aiTest=null; }
});
document.addEventListener('change', e=>{
  const t=e.target;
  if (t.matches('[data-slider]')){ state._dragId=null; MIX_AL.dragging=false; if (state.recipe && state.screen==='mix') syncMixAlerts(evaluate(state.recipe), {force:true}); }
  else if (t.matches('[data-pctin]') && state.recipe){ const it=state.recipe.items.find(i=>i.id===t.dataset.pctin); if(!it) return; if (fmt(it.pct)===fmt(+t.value||0)){ t.value=fmt(it.pct); return; } pushHist(); const before=Math.round((+t.value||0)*10)/10; const v=applyPct(t.dataset.pctin, t.value); t.value=fmt(v); const row=t.closest('.irow'); const y0=row?row.getBoundingClientRect().top:0; patchMix(); if(row){ const dy=row.getBoundingClientRect().top-y0; if (Math.abs(dy)>0.5) window.scrollBy(0, dy); } if (before>v+0.001) toast(`합계 100%를 넘지 않게 ${fmt(v)}%까지만 넣었어요.`); }
  else if (t.matches('#diyDetails')){ state.diyOpen=t.open; }
  if (t.id==='autoBal' && state.recipe){ state.recipe.auto=t.checked; balance(state.recipe); patchMix(); }
  else if (t.id==='photoIn' || t.classList.contains('photo-in')){ const f=t.files&&t.files[0]; if(f) runPhoto(f); }
  else if (t.id==='modelSel'){ const p=state.cfg.provider; if (t.value==='__custom'){ state.cfg.model[p]='__custom'; saveCfg(); refreshSettings(); const i=$('#modelIn'); if(i) i.focus(); } else { state.cfg.model[p]=t.value; saveCfg(); state.aiTest=null; if(state.screen==='home') render(); } }
  else if (t.id==='dictFn'){ state.dictFn=t.value; render(); }
  else if (t.id==='dictOrigin'){ state.dictOrigin=t.value; render(); }
  else if (t.id==='remKey'){ state.cfg.remember=t.checked; saveCfg(); saveKeys(); toast(t.checked?'키를 이 브라우저에 저장해요.':'키를 저장하지 않고 이 탭에서만 써요.'); }
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeSheets(); if (TOUR.i>=0) endTour(); } if(e.key==='Enter' && e.target && e.target.matches('[data-pctin]')) e.target.blur(); });
document.addEventListener('toggle', e=>{ if(e.target && e.target.id==='diyDetails') state.diyOpen=e.target.open; }, true);
let rzT; window.addEventListener('resize', ()=>{ applyScale(); if (TOUR.i>=0) showTourStep(); clearTimeout(rzT); rzT=setTimeout(()=>{ if(state.screen==='mix') render(); }, 200); });

// ===== 시작 =====
applyScale(); applyTheme();
render();
if (!(store.get('lab.consent',null)||{}).v) showConsent();
(async()=>{
  try{
    if (window.claude && typeof window.claude.use==='function'){
      try{ state.perms = await window.claude.use('permissions'); if (state.perms){ state.aiState = await state.perms.state('sample').catch(()=>'prompt'); } }catch(e){}
      state.sample = await window.claude.use('sample');
      if (state.sample && typeof state.sample.limits==='function') state.limits = await state.sample.limits().catch(()=>null);
      try{ state.downloads = await window.claude.use('downloads'); }catch(e){ state.downloads=null; }
    }
  }catch(e){ state.sample=null; }
  state.sampleReady = true; render();
  initCloud();
})();
</script>
