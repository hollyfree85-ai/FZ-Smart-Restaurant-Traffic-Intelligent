const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const DAY_MS=864e5;
const CT_DATE=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});

export function eventToday(){return CT_DATE.format(new Date())}
export function addEventDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function eventDateDiff(a,b){return Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/DAY_MS)}

export async function fetchLocalEvents(settings={},options={}){
  const endpoint=String(settings.eventEndpoint||'/api/local-events').trim();
  if(!endpoint)return{ok:false,configured:false,error:'Local event endpoint not configured'};
  try{
    const u=new URL(endpoint,location.href);
    u.searchParams.set('date',eventToday());
    if(options?.force)u.searchParams.set('manual','1');
    const r=await fetch(u.toString(),{cache:options?.force?'reload':'default',headers:{Accept:'application/json'}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)return{ok:false,configured:true,error:j.error||`Local Events HTTP ${r.status}`,fetchedAt:Date.now(),events:j.events||[]};
    const age=Number(r.headers.get('age'));
    return{...j,ok:true,configured:true,edgeAgeSeconds:Number.isFinite(age)?age:null};
  }catch(e){return{ok:false,configured:true,error:e.message||String(e),fetchedAt:Date.now(),events:[]}}
}

export function eventsForDate(signal,date){return(signal?.events||[]).filter(e=>e.date===date)}
export function upcomingEvents(signal,startDate=eventToday(),days=7){const end=addEventDays(startDate,days-1);return(signal?.events||[]).filter(e=>e.date>=startDate&&e.date<=end).sort((a,b)=>a.date.localeCompare(b.date)||(a.startMinute??9999)-(b.startMinute??9999)||String(a.title).localeCompare(String(b.title)))}
export function eventDaySummary(signal,date){const ev=eventsForDate(signal,date),max=ev.slice().sort((a,b)=>(b.impactScore||0)-(a.impactScore||0))[0]||null;return{date,count:ev.length,events:ev,maxImpact:max?.impactLabel||'None',maxScore:max?.impactScore||0,maxUpliftPct:max?.upliftPct||0,top:max}}

function recompute(f,slots){
  const peak=Math.max(.1,...slots.map(s=>s.tables));
  slots=slots.map(s=>{const trafficIndex=Math.round(clamp(s.tables/peak*100,0,100)),level=trafficIndex>=96?'Peak':trafficIndex>=78?'Very Busy':trafficIndex>=58?'Busy':trafficIndex>=34?'Normal':'Slow';return{...s,trafficIndex,level}});
  const hm=new Map;
  for(const s of slots){const h=Math.floor(s.start/60),x=hm.get(h)||{hour:h,tables:0,guests:0,reservations:0,confidence:0,n:0};x.tables+=s.tables;x.guests+=s.guests;x.reservations+=s.reservations||0;x.confidence+=s.confidence||f.confidence;x.n++;hm.set(h,x)}
  const hourly=[...hm.values()].sort((a,b)=>a.hour-b.hour).map(x=>({...x,label:`${x.hour%12||12}:00 ${x.hour<12?'AM':'PM'}`,confidence:Math.round(x.confidence/x.n)}));
  const peakSlot=slots.slice().sort((a,b)=>b.tables-a.tables||b.guests-a.guests)[0]||null,slowSlot=slots.filter(x=>x.tables>0).sort((a,b)=>a.tables-b.tables)[0]||null;
  return{...f,slots,hourly,totalTables:slots.reduce((a,s)=>a+s.tables,0),totalGuests:slots.reduce((a,s)=>a+s.guests,0),peakSlot,slowSlot,confidence:Math.round(slots.reduce((a,s)=>a+(s.confidence||0),0)/Math.max(1,slots.length))};
}

function eventFactorForSlot(events,start,maxPct){
  let pct=0,active=[];
  for(const e of events){
    const a=Number.isFinite(e.impactStart)?e.impactStart:null,b=Number.isFinite(e.impactEnd)?e.impactEnd:null;
    if(a==null||b==null)continue;
    if(start>=a&&start<=b){pct+=Number(e.upliftPct)||0;active.push(e)}
  }
  pct=clamp(pct,0,maxPct);
  return{factor:1+pct/100,pct,active};
}

export function blendForecastWithEvents(f,signal,settings={}){
  const maxPct=clamp(Number(settings.eventMaxUpliftPct??12),0,25),events=eventsForDate(signal,f.date);
  if(!f||!signal?.ok||!events.length)return{...f,eventImpact:{connected:Boolean(signal?.ok),applied:false,count:events.length,events,maxImpact:'None',maxScore:0,maxUpliftPct:0}};
  let appliedSlots=0,maxApplied=0;
  const slots=f.slots.map(s=>{const fx=eventFactorForSlot(events,s.start,maxPct);if(fx.pct>0){appliedSlots++;maxApplied=Math.max(maxApplied,fx.pct)}return{...s,tables:s.tables*fx.factor,guests:s.guests*fx.factor,rangeLow:s.rangeLow*fx.factor,rangeHigh:s.rangeHigh*fx.factor,eventFactor:fx.factor,eventUpliftPct:fx.pct,eventTitles:fx.active.map(e=>e.title)}});
  const max=events.slice().sort((a,b)=>(b.impactScore||0)-(a.impactScore||0))[0]||null,r=recompute(f,slots);
  return{...r,eventImpact:{connected:true,applied:appliedSlots>0,count:events.length,events,maxImpact:max?.impactLabel||'Low',maxScore:max?.impactScore||0,maxUpliftPct:maxApplied,top:max,source:signal.source,fetchedAt:signal.fetchedAt}};
}
