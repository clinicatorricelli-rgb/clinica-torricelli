// WhatsApp brasileiro: a cliente digita só DDD + número; o banco guarda no padrão
// internacional (+55...). Puro, testado em tests/phone.test.mjs.

// Só os dígitos, sem o 55 do Brasil quando a pessoa colar o número completo.
function localDigits(input) {
 let d = String(input || '').replace(/\D/g, '');
 if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
 if (d.startsWith('0')) d = d.replace(/^0+/, ''); // 019... (discagem com zero)
 return d.slice(0, 11);
}
// "(19) 98385-1726" enquanto digita.
export function maskPhone(input) {
 const d = localDigits(input);
 if (d.length <= 2) return d.length ? `(${d}` : '';
 const ddd = d.slice(0, 2), rest = d.slice(2);
 const split = rest.length > 8 ? 5 : 4;
 return rest.length > split ? `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}` : `(${ddd}) ${rest}`;
}
// "+5519983851726" ou null se não for um número brasileiro válido (DDD + 8 ou 9 dígitos).
export function toE164(input) {
 const d = localDigits(input);
 if (!/^[1-9][1-9]\d{8,9}$/.test(d)) return null;
 if (d.length === 11 && d[2] !== '9') return null; // celular: 9 dígitos começando com 9
 if (d.length === 10 && !/[2-5]/.test(d[2])) return null; // 8 dígitos só para fixo (2 a 5); celular sem o 9 é recusado
 return `+55${d}`;
}
// Mostra um número salvo no formato brasileiro, sem o +55.
export const formatPhone = e164 => (e164 && e164.startsWith('+55') ? maskPhone(e164.slice(3)) : (e164 || ''));
