export function existingTotp(data){
 // Supabase's `totp` shortcut includes verified factors only; pending ones are in `all`.
 const factors=(data?.all??data?.totp??[]).filter(f=>f.factor_type==='totp');
 return factors.find(f=>f.status==='verified')??factors.find(f=>f.status==='unverified')??null;
}
