// Civil dates and times in America/Sao_Paulo, NOT browser timezone.
// Pure planning helper. Future server must apply the same rules transactionally.
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const overlap=(a,b,c,d)=>a<d&&c<b;
export function canFit({day,start,duration,buffer=15,weekly,restrictions=[],exceptions=[]}){
 const weekday=new Date(`${day}T12:00:00Z`).getUTCDay(),s=minute(start),end=s+duration;
 if(!weekday||!Number.isFinite(s)||duration<=0||buffer<0)return false;
 const w=weekly.find(w=>w.weekday===weekday);
 if(!w||s<minute(w.opens_at)||end>minute(w.closes_at))return false;
 const daily=exceptions.filter(e=>e.day===day);
 if(daily.some(e=>e.kind==='closed_day'))return false;
 if(daily.some(e=>e.kind==='block'&&overlap(s,end+buffer,minute(e.from_time),minute(e.until_time))))return false;
 for(const r of restrictions){
  if(day<r.from_date||(r.until_date&&day>r.until_date)||!r.weekdays.includes(weekday))continue;
  if(overlap(s,end,minute(r.from_time),minute(r.until_time))){
   const opened=daily.some(e=>e.kind==='open'&&e.overrides_restriction_id===r.id&&s>=minute(e.from_time)&&end<=minute(e.until_time));
   if(!opened)return false;
  }
 }
 return true;
}
export function overlappingAppointments({start,end,appointments}){
 const from=Date.parse(start),until=Date.parse(end);
 return appointments.filter(a=>['held','confirmed','blocked'].includes(a.status)&&overlap(from,until,Date.parse(a.starts_at),Date.parse(a.busy_until)));
}
