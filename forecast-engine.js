const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const z=n=>String(n).padStart(2,'0');
const HM_FMT=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const NOW_FMT=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const CACHE=new WeakMap();

export const DEFAULT_SETTINGS={
  avgDiningMinutes:75,targetTablesPerServer:4,recencyHalfLifeDays:56,liveUpdateMinutes:15,forecastDays:30,
  weekdayAM:2,weekdayPM:5,fridayAM:2,fridayPM:8,saturdayAM:5,saturdayPM:9,sundayAM:5,sundayPM:7,externalEndpoint:'/api/google-live',externalRefreshMinutes:15,externalPatternWeight:18,externalLiveWeight:35
};

export function dayOfWeek(date){const[y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12)).getUTCDay()}
export function dayName(date){return['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek(date)]}
export function dayGroup(date){const w=dayOfWeek(date);return w===0?'Sunday':w===5||w===6?'Fri–Sat':'Mon–Thu'}
export function operatingWindow(date){const w=dayOfWeek(date);return{open:10*60+45,close:(w===5||w===6)?23*60:22*60}}
export function restaurantNow(){const p=Object.fromEntries(NOW_FMT.formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,hour:+p.hour,minute:+p.minute,total:+p.hour*60+(+p.minute)}}
export function formatMinute(min){min=((Math.round(min)%1440)+1440)%1440;const h=Math.floor(min/60),m=min%60;return`${h%12||12}:${z(m)} ${h<12?'AM':'PM'}`}

function parseTime(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?(+m[1]*60+(+m[2])):null}
function slotStarts(date){const w=operatingWindow(date),out=[];for(let m=w.open;m<w.close;m+=15)out.push(m);return out}
function eventMinute(e){
  if(e.seatedAt){const p=Object.fromEntries(HM_FMT.formatToParts(new Date(e.seatedAt)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return(+p.hour)*60+(+p.minute)}
  const h=Number(e.hour);return Number.isInteger(h)?h*60:null;
}
function slotIndex(min){return Math.floor(min/15)*15}
function dateDiffDays(a,b){return Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/864e5)}

function indexData(data){
  if(CACHE.has(data))return CACHE.get(data);
  const byDate=new Map(),reservationsByDate=new Map();
  for(const e of(data?.events||[])){
    if(!e?.date)continue;
    let d=byDate.get(e.date);if(!d){d={events:[],tables:0,guests:0,slots:new Map(),hours:new Map()};byDate.set(e.date,d)}
    const min=eventMinute(e),people=+e.people||0,h=Number.isInteger(+e.hour)?+e.hour:(min==null?null:Math.floor(min/60));
    d.events.push({e,min});d.tables++;d.guests+=people;
    if(min!=null){const s=slotIndex(min),x=d.slots.get(s)||{tables:0,guests:0};x.tables++;x.guests+=people;d.slots.set(s,x)}
    if(Number.isInteger(h)){const x=d.hours.get(h)||{hour:h,tables:0,guests:0};x.tables++;x.guests+=people;d.hours.set(h,x)}
  }
  for(const r of(data?.reservations||[])){
    if(!r?.date)continue;const min=parseTime(r.time);if(min==null)continue;
    let d=reservationsByDate.get(r.date);if(!d){d=new Map();reservationsByDate.set(r.date,d)}
    const s=slotIndex(min),x=d.get(s)||{tables:0,guests:0,count:0};x.tables++;x.guests+=+r.people||0;x.count++;d.set(s,x);
  }
  const idx={byDate,reservationsByDate,dates:[...byDate.keys()].sort()};CACHE.set(data,idx);return idx;
}
function dateRec(data,date){return indexData(data).byDate.get(date)||{events:[],tables:0,guests:0,slots:new Map(),hours:new Map()}}
function dailyStats(data,date){const d=dateRec(data,date);return{tables:d.tables,guests:d.guests}}
function slotStats(data,date,start){return dateRec(data,date).slots.get(start)||{tables:0,guests:0}}
function weightedMean(rows,key){let sw=0,s=0;for(const r of rows){sw+=r.w;s+=r.w*r[key]}return sw?s/sw:0}
function weightedSd(rows,key,mean){let sw=0,s=0;for(const r of rows){sw+=r.w;s+=r.w*(r[key]-mean)**2}return sw?Math.sqrt(s/sw):0}

function candidateDates(data,target){
  const targetW=dayOfWeek(target),targetG=dayGroup(target),dates=indexData(data).dates.filter(d=>d<target);
  const exact=dates.filter(d=>dayOfWeek(d)===targetW),group=dates.filter(d=>dayGroup(d)===targetG&&dayOfWeek(d)!==targetW);
  return{exact,group,all:dates,targetW,targetG};
}
function trendFactor(data,target){
  const dates=indexData(data).dates.filter(d=>d<target&&dayGroup(d)===dayGroup(target)),recent=[],prior=[];
  for(const d of dates){const age=dateDiffDays(target,d),v=dailyStats(data,d).tables;if(age<=28)recent.push(v);else if(age<=56)prior.push(v)}
  if(recent.length<3||prior.length<3)return 1;const ratio=avg(recent)/Math.max(.5,avg(prior));return clamp(1+(ratio-1)*.5,.82,1.20);
}
function seasonFactor(data,target){
  const month=target.slice(5,7),wd=dayOfWeek(target),dates=indexData(data).dates.filter(d=>d<target&&dayOfWeek(d)===wd),same=dates.filter(d=>d.slice(5,7)===month).map(d=>dailyStats(data,d).tables),all=dates.map(d=>dailyStats(data,d).tables);
  if(same.length<2||all.length<4)return 1;const ratio=avg(same)/Math.max(.5,avg(all));return clamp(1+(ratio-1)*.35,.86,1.15);
}
function baselineContext(data,target){return{c:candidateDates(data,target),trend:trendFactor(data,target),season:seasonFactor(data,target)}}
function baselineSlot(data,target,start,settings,ctx){
  const{c,trend,season}=ctx,rows=[];
  const add=(dates,type)=>dates.forEach(d=>{const age=Math.max(1,dateDiffDays(target,d)),st=slotStats(data,d,start),recency=Math.exp(-age/settings.recencyHalfLifeDays),sameMonth=d.slice(5,7)===target.slice(5,7)?1.08:1,groupWeight=type==='exact'?1:(type==='all'?.18:(c.exact.length<3?.55:c.exact.length<6?.35:.12));rows.push({...st,w:recency*sameMonth*groupWeight,type,d})});
  add(c.exact.slice(-16),'exact');add(c.group.slice(-24),'group');if(!rows.length)add(c.all.slice(-20),'all');
  let tables=weightedMean(rows,'tables'),guests=weightedMean(rows,'guests'),sd=weightedSd(rows,'tables',tables);tables*=trend*season;guests*=trend*season;
  return{tables,guests,sd,exactDays:c.exact.length,groupDays:c.group.length,trend,season,samples:rows.length};
}
function reservationFloor(data,target,start){return indexData(data).reservationsByDate.get(target)?.get(start)||{tables:0,guests:0,count:0}}
function baseDay(data,date,settings){
  const ctx=baselineContext(data,date);
  return slotStarts(date).map(start=>{const b=baselineSlot(data,date,start,settings,ctx),r=reservationFloor(data,date,start);let tables=Math.max(0,b.tables),guests=Math.max(0,b.guests);if(r.tables){tables=Math.max(tables,r.tables*.92);guests=Math.max(guests,r.guests*.92)}return{start,label:formatMinute(start),...b,reservations:r.count,reservationGuests:r.guests,tables,guests}});
}
function liveFactors(data,base,date){
  const now=restaurantNow();if(date!==now.date)return{pace:1,momentum:1,actualToNow:0,expectedToNow:0,last60Actual:0,last60Expected:0};
  const ev=dateRec(data,date).events,actualToNow=ev.filter(x=>x.min!=null&&x.min<=now.total).length,expectedToNow=base.filter(x=>x.start<=now.total).reduce((s,x)=>s+x.tables,0),last60Actual=ev.filter(x=>x.min!=null&&x.min>now.total-60&&x.min<=now.total).length,last60Expected=base.filter(x=>x.start>now.total-60&&x.start<=now.total).reduce((s,x)=>s+x.tables,0);
  const ratio=actualToNow/Math.max(1,expectedToNow),shrink=expectedToNow/(expectedToNow+8),pace=clamp(1+(ratio-1)*shrink,.68,1.45),mr=last60Actual/Math.max(1,last60Expected),msh=last60Expected/(last60Expected+4),momentum=clamp(1+(mr-1)*msh,.62,1.55);
  return{pace,momentum,actualToNow,expectedToNow,last60Actual,last60Expected};
}
function confidenceFor(date,slot){const now=restaurantNow(),horizon=Math.max(0,dateDiffDays(date,now.date)),dataScore=Math.min(30,slot.exactDays*3.5)+Math.min(8,slot.groupDays*.45),recent=slot.samples?5:0,liveBoost=date===now.date?6:0,resBoost=slot.reservations?3:0;return Math.round(clamp(43+dataScore+recent+liveBoost+resBoost-horizon*.7,35,94))}
function classify(index){if(index>=96)return'Peak';if(index>=78)return'Very Busy';if(index>=58)return'Busy';if(index>=34)return'Normal';return'Slow'}
function hourlyFromSlots(slots){const map=new Map;for(const s of slots){const h=Math.floor(s.start/60),x=map.get(h)||{hour:h,tables:0,guests:0,reservations:0,confidence:0,n:0};x.tables+=s.tables;x.guests+=s.guests;x.reservations+=s.reservations;x.confidence+=s.confidence;x.n++;map.set(h,x)}return[...map.values()].sort((a,b)=>a.hour-b.hour).map(x=>({...x,label:formatMinute(x.hour*60),confidence:Math.round(x.confidence/x.n)}))}

export function forecastDay(data,date,settings={}){
  settings={...DEFAULT_SETTINGS,...settings};const base=baseDay(data,date,settings),live=liveFactors(data,base,date),now=restaurantNow();
  let slots=base.map(s=>{let lf=1;if(date===now.date&&s.start>now.total){const horizon=s.start-now.total;if(horizon<=90)lf=.55*live.pace+.45*live.momentum;else lf=1+(live.pace-1)*Math.exp(-horizon/240)}const tables=s.tables*lf,guests=s.guests*lf,range=Math.max(1,s.sd*1.25);return{...s,tables,guests,liveFactor:lf,rangeLow:Math.max(0,tables-range),rangeHigh:tables+range,confidence:confidenceFor(date,s)}});
  const peak=Math.max(.1,...slots.map(x=>x.tables));slots=slots.map(s=>{const trafficIndex=Math.round(clamp(s.tables/peak*100,0,100));return{...s,trafficIndex,level:classify(trafficIndex)}});
  const hourly=hourlyFromSlots(slots),totalTables=slots.reduce((s,x)=>s+x.tables,0),totalGuests=slots.reduce((s,x)=>s+x.guests,0),peakSlot=slots.slice().sort((a,b)=>b.tables-a.tables||b.guests-a.guests)[0]||null,slowSlot=slots.filter(x=>x.tables>0).sort((a,b)=>a.tables-b.tables)[0]||null,confidence=Math.round(avg(slots.map(x=>x.confidence)));
  return{date,dayName:dayName(date),dayGroup:dayGroup(date),slots,hourly,totalTables,totalGuests,peakSlot,slowSlot,confidence,live,trend:slots[0]?.trend||1,season:slots[0]?.season||1,recordedExactDays:slots[0]?.exactDays||0,recordedGroupDays:slots[0]?.groupDays||0};
}

export function modeledFloor(data,forecast,targetMinute,settings={}){
  settings={...DEFAULT_SETTINGS,...settings};const total=data?.floor?.total||0;if(!total)return null;const now=restaurantNow(),sameToday=forecast.date===now.date;let occupied=0;
  if(sameToday){for(const t of(data.floor.active||[])){const age=t.updatedAt?Math.max(0,(Date.now()-Number(t.updatedAt))/60000):settings.avgDiningMinutes*.45;if(age+(targetMinute-now.total)<settings.avgDiningMinutes)occupied++}if(targetMinute>=now.total){for(const s of forecast.slots){if(s.start<=now.total||s.start>targetMinute)continue;if(targetMinute-s.start<settings.avgDiningMinutes)occupied+=s.tables}}}
  else for(const s of forecast.slots){if(s.start>targetMinute||targetMinute-s.start>=settings.avgDiningMinutes)continue;occupied+=s.tables}
  occupied=clamp(occupied,0,total);return{occupied,load:occupied/total,total};
}
export function baselineServerTarget(date,minute,settings={}){settings={...DEFAULT_SETTINGS,...settings};const w=dayOfWeek(date),switchMin=(w===0||w===5||w===6)?15*60+30:16*60,isAM=minute<switchMin;if(w>=1&&w<=4)return isAM?settings.weekdayAM:settings.weekdayPM;if(w===5)return isAM?settings.fridayAM:settings.fridayPM;if(w===6)return isAM?settings.saturdayAM:settings.saturdayPM;return isAM?settings.sundayAM:settings.sundayPM}
export function staffingRecommendation(data,forecast,minute,settings={}){settings={...DEFAULT_SETTINGS,...settings};const floor=modeledFloor(data,forecast,minute,settings),baseline=baselineServerTarget(forecast.date,minute,settings),loadNeed=floor?Math.ceil(floor.occupied/settings.targetTablesPerServer):0,recommended=Math.max(baseline,loadNeed),active=data?.staff?.active||0,diff=active-recommended;return{baseline,loadNeed,recommended,active,diff,status:diff<0?'UNDER TARGET':diff>1?'ABOVE FORECAST NEED':'ON TARGET',floor}}
export function advisor(data,forecast,settings={}){settings={...DEFAULT_SETTINGS,...settings};const now=restaurantNow(),start=forecast.date===now.date?Math.max(now.total,12*60):12*60,peak=forecast.peakSlot?.start||18*60;let breakAt=null,cutAt=null;for(const s of forecast.slots){if(s.start<start||s.start>peak-45)continue;const f=modeledFloor(data,forecast,s.start,settings);if(s.trafficIndex<=45&&(!f||f.load<.62)){const n=forecast.slots.find(x=>x.start===s.start+15),nf=n&&modeledFloor(data,forecast,n.start,settings);if(n&&n.trafficIndex<=52&&(!nf||nf.load<.68)){breakAt=s.start;break}}}for(const s of forecast.slots){if(s.start<peak+75||s.start<19*60)continue;const f=modeledFloor(data,forecast,s.start,settings);if(s.trafficIndex<48&&(!f||f.load<.62)){const next=forecast.slots.find(x=>x.start===s.start+15);if(next&&next.trafficIndex<52){cutAt=s.start;break}}}return{breakAt,cutAt,breakText:breakAt!=null?`${formatMinute(breakAt)} – ${formatMinute(breakAt+30)}`:'No strong break window detected',cutText:cutAt!=null?`After ${formatMinute(cutAt)}`:'No safe cut window detected'}}
export function forecastRange(data,startDate,days,settings={}){const out=[],d=new Date(startDate+'T12:00:00Z');for(let i=0;i<days;i++){const date=d.toISOString().slice(0,10);out.push(forecastDay(data,date,settings));d.setUTCDate(d.getUTCDate()+1)}return out}
export function actualHourly(data,date){return[...dateRec(data,date).hours.values()].sort((a,b)=>a.hour-b.hour).map(x=>({...x}))}
export function actualSlotCount(data,date,start){return dateRec(data,date).slots.get(start)?.tables||0}

export function saveForecastSnapshot(forecast){
  const key='fztraffic_forecast_snapshots_v1';let rows=[];try{rows=JSON.parse(localStorage.getItem(key)||'[]')||[]}catch{}
  const now=restaurantNow(),madeAt=Date.now(),bucket=Math.floor(madeAt/(15*60000)),items=forecast.slots.filter(s=>s.start>now.total&&s.start<=now.total+180).map(s=>({date:forecast.date,start:s.start,predicted:s.tables,confidence:s.confidence,leadMinutes:s.start-now.total}));
  if(items.length){const snap={madeAt,bucket,date:forecast.date,items},i=rows.findIndex(x=>x.bucket===bucket&&x.date===forecast.date);if(i>=0)rows[i]=snap;else rows.push(snap)}
  rows=rows.filter(x=>madeAt-x.madeAt<45*864e5).slice(-500);localStorage.setItem(key,JSON.stringify(rows));
}
export function accuracyReport(data){
  let rows=[];try{rows=JSON.parse(localStorage.getItem('fztraffic_forecast_snapshots_v1')||'[]')||[]}catch{}
  const now=restaurantNow(),done=[];for(const snap of rows)for(const i of snap.items||[]){if(i.date>now.date||i.date===now.date&&i.start+15>now.total)continue;const actual=actualSlotCount(data,i.date,i.start),error=Math.abs(actual-i.predicted);done.push({...i,actual,error,madeAt:snap.madeAt})}
  const metrics=arr=>{const sumActual=arr.reduce((s,x)=>s+x.actual,0),sumError=arr.reduce((s,x)=>s+x.error,0),wape=arr.length?sumError/Math.max(1,sumActual):null,mae=arr.length?avg(arr.map(x=>x.error)):null;return{count:arr.length,wape,mae,accuracy:wape==null?null:clamp(1-wape,0,1)}};
  const all=metrics(done),byHorizon=[['≤30 min',0,30],['31–60 min',31,60],['61–90 min',61,90],['91–180 min',91,180]].map(([label,a,b])=>({label,...metrics(done.filter(x=>(x.leadMinutes??999)>=a&&(x.leadMinutes??999)<=b))}));
  return{rows:done.slice(-250).reverse(),...all,byHorizon};
}
