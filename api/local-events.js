const AREA='Huntsville, Alabama, United States';
const QUERY='events in Huntsville Madison Alabama this week next week concerts festivals expos conventions sports fairs';
const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const CT_DATE=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});

function ctToday(){return CT_DATE.format(new Date())}
function toIso(y,m,d){return`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function parseEventDate(v,baseDate){
  const s=String(v||'').replace(/^[A-Za-z]{3,9},\s*/,'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m=s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?/i);if(!m)return null;
  const base=new Date(baseDate+'T12:00:00Z'),mon=MONTHS[m[1].slice(0,3).toLowerCase()],day=+m[2];let year=m[3]?+m[3]:base.getUTCFullYear();let iso=toIso(year,mon,day);if(!m[3]&&Date.parse(iso+'T12:00:00Z')<Date.parse(baseDate+'T12:00:00Z')-45*864e5)iso=toIso(year+1,mon,day);return iso;
}
function parseMinute(...vals){
  for(const v of vals){const s=String(v||'');const m=s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);if(!m)continue;let h=+m[1]%12;if(m[3].toUpperCase()==='PM')h+=12;return h*60+(+m[2]||0)}return null;
}
function venueName(v){return typeof v==='string'?v:String(v?.name||'')}
function textOf(e){return [e.title,e.type,e.description,venueName(e.venue),...(Array.isArray(e.address)?e.address:[])].filter(Boolean).join(' ')}
function categoryFor(e){const t=textOf(e).toLowerCase();if(/expo|exhibition|trade show|convention|conference|showcase/.test(t))return'Expo / Convention';if(/concert|live music|music performance|band|singer|orchestra|comedy|theater|theatre|performance/.test(t))return'Concert / Show';if(/festival|fair|fest|market|parade|celebration/.test(t))return'Festival / Fair';if(/baseball|football|basketball|soccer|hockey|game|match|tournament|championship|race|sports?/.test(t))return'Sports';return'Local Event'}
function impactFor(e,category){
  const t=textOf(e).toLowerCase();let score=category==='Expo / Convention'?56:category==='Concert / Show'?54:category==='Festival / Fair'?48:category==='Sports'?46:30;
  if(/orion amphitheater/.test(t))score+=28;
  if(/von braun center|\bvbc\b|propst arena|mars music hall|mark c\. smith concert hall/.test(t))score+=27;
  if(/toyota field/.test(t))score+=22;
  if(/joe davis stadium/.test(t))score+=20;
  if(/midcity|the camp/.test(t))score+=16;
  if(/stovehouse|huntsville botanical garden|university of alabama in huntsville|\buah\b/.test(t))score+=10;
  if(/huntsville/.test(t))score+=10;else if(/madison/.test(t))score+=9;else score+=4;
  if(/expo|convention|festival|concert|championship|tournament|opening night|sold out/.test(t))score+=7;
  score=Math.min(95,score);
  const impactLabel=score>=72?'High':score>=50?'Medium':'Low';
  const upliftPct=impactLabel==='High'?Math.min(12,8+Math.round((score-72)/8)):impactLabel==='Medium'?Math.min(7,4+Math.round((score-50)/10)):score>=38?2:0;
  return{impactScore:score,impactLabel,upliftPct};
}
function impactWindow(category,startMinute){
  if(startMinute==null){if(category==='Expo / Convention'||category==='Festival / Fair')return{impactStart:11*60,impactEnd:20*60};return{impactStart:null,impactEnd:null}}
  if(category==='Expo / Convention')return{impactStart:Math.max(0,startMinute-60),impactEnd:Math.min(23*60+45,startMinute+240)};
  if(category==='Festival / Fair')return{impactStart:Math.max(0,startMinute-90),impactEnd:Math.min(23*60+45,startMinute+180)};
  return{impactStart:Math.max(0,startMinute-150),impactEnd:Math.min(23*60+45,startMinute+45)};
}
function areaFor(e){const t=textOf(e).toLowerCase();if(/madison/.test(t))return'Madison';if(/huntsville/.test(t))return'Huntsville';if(/athens/.test(t))return'Athens';if(/decatur/.test(t))return'Decatur';return'North Alabama / nearby'}
function normalize(e,baseDate){
  const rawDate=typeof e.date==='object'?e.date?.start_date:e.date,date=parseEventDate(rawDate,baseDate);if(!date)return null;
  const startMinute=parseMinute(e.time,e.date?.start_time,e.date?.when),category=categoryFor(e),impact=impactFor(e,category),window=impactWindow(category,startMinute),venue=venueName(e.venue)||String((e.address||[])[0]||''),address=Array.isArray(e.address)?e.address.join(' • '):String(e.address||'');
  return{id:String(e.link||`${e.title}|${date}|${venue}`),title:String(e.title||'Local event'),date,startMinute,when:String(e.date?.when||e.time||''),venue,address,area:areaFor(e),category,...impact,...window,description:String(e.description||''),link:String(e.link||''),thumbnail:String(e.thumbnail||'')};
}
function dedupe(rows){const m=new Map;for(const e of rows){const k=(e.title+'|'+e.date+'|'+e.venue).toLowerCase();const old=m.get(k);if(!old||e.impactScore>old.impactScore)m.set(k,e)}return[...m.values()].sort((a,b)=>a.date.localeCompare(b.date)||(a.startMinute??9999)-(b.startMinute??9999)||b.impactScore-a.impactScore)}

export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  // Stable daily endpoint lets Vercel CDN share one event lookup across devices.
  res.setHeader('Cache-Control','s-maxage=43200, stale-while-revalidate=21600');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  const key=process.env.SERPAPI_KEY;if(!key)return res.status(503).json({ok:false,error:'SERPAPI_KEY is not configured on the server'});
  const baseDate=/^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date||''))?String(req.query.date):ctToday();
  try{
    const u=new URL('https://serpapi.com/search.json');u.searchParams.set('engine','google');u.searchParams.set('q',QUERY);u.searchParams.set('location',AREA);u.searchParams.set('google_domain','google.com');u.searchParams.set('gl','us');u.searchParams.set('hl','en');u.searchParams.set('api_key',key);if(String(req.query?.manual||'')==='1')u.searchParams.set('no_cache','true');
    const r=await fetch(u,{headers:{Accept:'application/json'}}),raw=await r.json().catch(()=>({}));if(!r.ok||raw?.error)return res.status(r.ok?502:r.status).json({ok:false,error:raw?.error||`SerpApi HTTP ${r.status}`});
    const rows=dedupe((raw?.events_results||[]).map(e=>normalize(e,baseDate)).filter(Boolean));
    return res.status(200).json({ok:true,source:'Google Search local event results via SerpApi',provider:'serpapi',query:QUERY,area:'Huntsville • Madison • nearby North Alabama',events:rows,fetchedAt:Date.now(),searchId:raw?.search_metadata?.id||null,note:'Event impact is a planning heuristic, not an attendance count.'});
  }catch(e){return res.status(502).json({ok:false,error:e?.message||String(e),events:[]})}
}
