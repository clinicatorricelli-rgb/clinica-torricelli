const options = [
 ['Lash Lifting','Aplicação',150,60],
 ['Efeito Rímel','Aplicação',170,90],['Efeito Rímel','Manutenção',120,60,15,25],
 ['Volume Europeu','Aplicação',150,60],['Volume Europeu','Manutenção',100,60,15,25],
 ['Volume Brasileiro','Aplicação',150,60],['Volume Brasileiro','Manutenção',100,60,15,25],
 ['Volume Egípcio','Aplicação',150,60],['Volume Egípcio','Manutenção',100,60,15,25],
 ['Fox Eyes','Aplicação',170,90],['Fox Eyes','Manutenção',120,60,15,25],
 ['Capping Cleópatra','Aplicação',195,120],['Capping Cleópatra','Manutenção',135,90,25,30],
 ['Capping Brasileiro','Aplicação',195,120],['Capping Brasileiro','Manutenção',135,90,25,30],
 ['Brow Lamination','Sessão',150,60],['Limpeza de Pele','Sessão',180,80],
 ['Design de Sobrancelha','Sessão',50,30],['Design com Henna','Sessão',60,50],
 ['Hydra Gloss','Sessão',100,40],['Micropigmentação Labial','Sessão',500,120],
 ['Remoção de cílios','Aplicados pela Eduarda',20,30],['Remoção de cílios','De outra profissional',50,30]
];
export const catalog = options.map(([name,variant,reais,duration_minutes,maintenance_min_days,maintenance_max_days],i)=>({id:i+1,name,variant,price_cents:reais*100,duration_minutes,maintenance_min_days,maintenance_max_days}));
export const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const deposit = cents => Math.floor((cents*30+50)/100);
