// Catálogo na tela: agrupa as opções do mesmo serviço (aplicação e manutenção) num cartão,
// mostra só os destaques e deixa o resto para a busca. Puro, testado em tests/services-view.test.mjs.

// Ordem em que os destaques aparecem. Nomes iguais aos do catálogo.
export const FEATURED = ['Lash Lifting', 'Efeito Rímel', 'Volume Brasileiro', 'Brow Lamination', 'Design de Sobrancelha'];

// "Cleópatra" e "cleopatra", "Remoção" e "remocao" encontram a mesma coisa.
export const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Palavras que a cliente usa para procurar e que não estão no nome do serviço.
const KEYWORDS = {
 'Lash Lifting': 'cílios', 'Efeito Rímel': 'cílios extensão', 'Volume Europeu': 'cílios extensão',
 'Volume Brasileiro': 'cílios extensão', 'Volume Egípcio': 'cílios extensão', 'Fox Eyes': 'cílios extensão',
 'Capping Cleópatra': 'cílios extensão', 'Capping Brasileiro': 'cílios extensão', 'Remoção de cílios': 'extensão',
 'Brow Lamination': 'sobrancelha', 'Design de Sobrancelha': '', 'Design com Henna': 'sobrancelha',
 'Limpeza de Pele': 'rosto facial', 'Hydra Gloss': 'lábios boca hidratação', 'Micropigmentação Labial': 'lábios boca',
};

export function groupServices(rows) {
 const groups = new Map();
 for (const row of Array.isArray(rows) ? rows : []) {
  if (!groups.has(row.name)) groups.set(row.name, {name: row.name, options: []});
  groups.get(row.name).options.push(row);
 }
 return [...groups.values()].map(g => ({...g, fromCents: Math.min(...g.options.map(o => o.price_cents))}));
}

// Com busca: todos os cartões cujo nome ou opção contém cada palavra digitada.
// Sem busca: os destaques, na ordem de FEATURED (ou todos, se pedido).
export function visibleGroups(groups, query = '', {showAll = false, featured = FEATURED} = {}) {
 const words = normalize(query).split(/\s+/).filter(Boolean);
 if (words.length) return groups.filter(g => {
  const text = normalize([g.name, KEYWORDS[g.name] || '', ...g.options.map(o => o.variant)].join(' '));
  return words.every(w => text.includes(w));
 });
 if (showAll) return groups;
 const picked = featured.map(name => groups.find(g => g.name === name)).filter(Boolean);
 return picked.length ? picked : groups.slice(0, 5);
}
