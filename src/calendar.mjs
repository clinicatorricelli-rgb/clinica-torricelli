// Calendário mensal da agenda (segunda a domingo). Puro, testado em tests/calendar.test.mjs.
import {addDays} from './booking.mjs';
import {weekStart} from './agenda.mjs';

export const monthStart = day => `${day.slice(0, 7)}-01`;
export function shiftMonth(month, n) {
 const [y, m] = month.split('-').map(Number);
 const d = new Date(Date.UTC(y, m - 1 + n, 1));
 return d.toISOString().slice(0, 10);
}
// Dias exibidos: da segunda-feira da semana do dia 1 até o domingo da semana do último dia.
export function monthGrid(month) {
 const first = monthStart(month), last = addDays(shiftMonth(first, 1), -1);
 const start = weekStart(first);
 const dow = new Date(`${last}T12:00:00Z`).getUTCDay();
 const end = addDays(last, dow === 0 ? 0 : 7 - dow);
 const days = [];
 for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
 return days;
}
export const monthLabel = month => {
 const s = new Intl.DateTimeFormat('pt-BR', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${month}T12:00:00Z`));
 return s.charAt(0).toUpperCase() + s.slice(1);
};
