// Agenda da Eduarda: semana de segunda a sábado no fuso da clínica. Puro, testado em tests/agenda.test.mjs.
import {addDays} from './booking.mjs';

const tz = 'America/Sao_Paulo';
// Dia (AAAA-MM-DD) de um instante, no fuso da clínica.
export const clinicDay = iso => new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(iso));
// Segunda-feira da semana de um dia. Domingo pertence à semana que termina nele.
export function weekStart(day) {
 const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
 return addDays(day, dow === 0 ? -6 : 1 - dow);
}
export const weekDays = monday => Array.from({length: 6}, (_, i) => addDays(monday, i));
export const dayLabel = day => new Intl.DateTimeFormat('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC'}).format(new Date(`${day}T12:00:00Z`));
export const weekLabel = monday => {
 const f = d => new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit', timeZone: 'UTC'}).format(new Date(`${d}T12:00:00Z`));
 return `${f(monday)} a ${f(addDays(monday, 5))}`;
};
// Agrupa os agendamentos por dia, na ordem do horário. Cancelados vão para o fim do dia.
export function byDay(items, days) {
 const map = Object.fromEntries(days.map(d => [d, []]));
 for (const item of items || []) { const d = clinicDay(item.starts_at); if (map[d]) map[d].push(item); }
 for (const d of days) map[d].sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled') || a.starts_at.localeCompare(b.starts_at));
 return map;
}
export const activeCount = list => list.filter(i => i.status !== 'cancelled').length;
