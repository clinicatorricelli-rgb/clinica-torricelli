// Aviso de privacidade e termos de uso. Texto puro (sem rede), usado pelas páginas do site
// e pelo rascunho de revisão. Mudou o conteúdo? Suba LEGAL_VERSION: o aceite gravado no
// cadastro aponta para a versão aceita.
export const LEGAL_VERSION = 'legal-2026-11-v1';
export const LEGAL_DATE = '20 de novembro de 2026';

export const controller = {
 name: 'Eduarda Campos Torriceli',
 brand: 'Clínica Torricelli',
 kind: 'profissional autônoma (pessoa física)',
 address: "Rua Argentina, 526, Jardim Belo Horizonte, Santa Bárbara d'Oeste – SP, CEP 13450-181",
 email: 'clinicatorricelli@gmail.com',
 site: 'https://clinicatorricelli.com.br',
 retentionYears: 5,
};

const c = controller;

export const privacy = {
 title: 'Aviso de privacidade',
 intro: `Este aviso explica quais dados pessoais a ${c.brand} usa, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).`,
 sections: [
  {title: 'Quem cuida dos seus dados', blocks: [
   `A responsável pelos seus dados é ${c.name}, ${c.kind}, que atende com o nome ${c.brand}, em ${c.address}.`,
   `Para qualquer assunto sobre seus dados, escreva para ${c.email}.`,
  ]},
  {title: 'Quais dados usamos', blocks: [
   {list: [
    'Cadastro: nome, e-mail, número de WhatsApp e senha. A senha fica guardada de forma cifrada pelo serviço de login e nem a clínica consegue lê-la.',
    'Agendamentos: serviço, data e hora, remarcações, cancelamentos, faltas, taxas e pagamentos de taxa, e o registro de que você aceitou a regra de faltas (versão e data).',
    'Ficha de extensão de cílios: data de nascimento, sexo e endereço (opcionais), respostas sobre a sua saúde ligadas ao procedimento (gestação ou amamentação, procedimentos anteriores nos olhos, alergias a cosméticos, condições dos olhos, tratamento oncológico) e as autorizações que você marcar. As respostas de saúde são dados sensíveis e recebem cuidado redobrado.',
    'Dados técnicos do procedimento, anotados pela profissional, e fotos de acompanhamento, só quando você autorizar.',
    'Preferências de aviso: se você quer receber avisos de novas vagas e por qual canal.',
    'Conversas e mensagens com a clínica pelo WhatsApp e por e-mail.',
    'Registros de segurança: data e hora de acesso, endereço IP e dados do navegador, guardados pelos serviços que mantêm o site no ar, e a verificação de que quem usa o formulário não é um robô.',
   ]},
  ]},
  {title: 'Para que usamos', blocks: [
   {list: [
    'Criar e manter a sua conta, agendar, remarcar e cancelar atendimentos e prestar o serviço contratado. Base legal: execução de contrato (art. 7º, V, da LGPD).',
    'Avaliar se o procedimento é seguro para você, a partir da ficha. Base legal: o seu consentimento específico, dado ao marcar a autorização na ficha (art. 11, I). Sem a ficha, os procedimentos de extensão de cílios não podem ser agendados.',
    'Enviar mensagens sobre o seu atendimento: confirmação, lembretes e avisos de taxa. Base legal: execução de contrato. Pelo WhatsApp, só se você aceitar receber.',
    'Enviar avisos de novas vagas, se você pedir. Base legal: consentimento (art. 7º, I). Você pode desligar quando quiser em Minha conta.',
    'Registrar a regra de faltas aceita, cobrar taxas confirmadas e guardar o histórico para responder a dúvidas ou reclamações. Base legal: exercício regular de direitos (art. 7º, VI, e art. 11, II, d).',
    'Proteger o site contra fraudes, ataques e robôs. Base legal: legítimo interesse (art. 7º, IX).',
   ]},
   'A clínica não vende dados pessoais, não usa seus dados para publicidade e não toma decisões automáticas sobre você. Quem decide sobre procedimentos e taxas é sempre a profissional.',
  ]},
  {title: 'Com quem compartilhamos', blocks: [
   'Os dados ficam em serviços contratados para manter o site funcionando, que só podem usá-los para isso:',
   {list: [
    'Supabase: banco de dados, login e arquivos, com servidores em São Paulo.',
    'Cloudflare: hospedagem do site, proteção contra ataques e verificação contra robôs.',
    'Resend: envio dos e-mails do site.',
    '360dialog e Meta (WhatsApp): envio e recebimento das mensagens de WhatsApp.',
   ]},
   'Algumas dessas empresas ficam no exterior e podem tratar dados fora do Brasil (transferência internacional, art. 33 da LGPD), sempre com contratos que exigem proteção dos dados.',
   'Também podemos informar dados a autoridades quando a lei ou uma ordem judicial exigir.',
  ]},
  {title: 'Por quanto tempo guardamos', blocks: [
   {list: [
    `Ficha, histórico de atendimentos e taxas: até ${c.retentionYears} anos depois do seu último atendimento, que é o prazo para reclamar de um serviço na Justiça (art. 27 do Código de Defesa do Consumidor).`,
    'Cadastro: enquanto a sua conta existir. Se você pedir a exclusão, apagamos o que não precisa ser guardado; o restante fica bloqueado até o fim do prazo acima.',
    'Avisos de novas vagas: até você desligar.',
    'Registros de segurança: pelo tempo necessário para proteger o site, em geral até 6 meses.',
   ]},
  ]},
  {title: 'Seus direitos', blocks: [
   'Você pode pedir, a qualquer momento:',
   {list: [
    'a confirmação de que tratamos seus dados e uma cópia deles;',
    'a correção de dados incompletos ou errados (nome e WhatsApp você mesma corrige em Minha conta);',
    'a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei;',
    'a portabilidade dos dados para outro prestador;',
    'a informação sobre com quem compartilhamos seus dados;',
    'a revogação do consentimento e a exclusão dos dados tratados com base nele, ressalvado o que a lei manda guardar.',
   ]},
   `Para isso, escreva para ${c.email}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
  ]},
  {title: 'Menores de idade', blocks: [
   'Adolescentes de 12 a 17 anos podem fazer o próprio cadastro. Crianças com menos de 12 anos só podem ser atendidas com cadastro feito e consentimento dado por um dos pais ou pelo responsável legal, como exige o art. 14 da LGPD.',
  ]},
  {title: 'Segurança', blocks: [
   'Usamos conexão cifrada, senha com pelo menos 12 caracteres, regras no banco de dados que só deixam cada cliente ver os próprios dados, acesso da profissional com segundo fator de autenticação e verificação contra robôs. Nenhum sistema é totalmente imune a falhas; se acontecer um incidente que possa trazer risco a você, avisaremos você e a ANPD.',
  ]},
  {title: 'Cookies e armazenamento no navegador', blocks: [
   'O site guarda no seu navegador só o necessário para manter você conectada e para a verificação contra robôs. Não usamos cookies de publicidade nem ferramentas que acompanham você em outros sites.',
  ]},
  {title: 'Mudanças neste aviso', blocks: [
   `Se este aviso mudar, publicamos a nova versão aqui e, quando a mudança for importante, avisamos e pedimos novo aceite. Versão em vigor desde ${LEGAL_DATE}.`,
  ]},
 ],
};

export const terms = {
 title: 'Termos de uso',
 intro: `Estes termos valem para o uso do site ${c.site.replace('https://', '')} e para os agendamentos feitos por ele com a ${c.brand}, atendimento de ${c.name}, ${c.address}.`,
 sections: [
  {title: 'Conta', blocks: [
   {list: [
    'Use dados verdadeiros e mantenha nome e WhatsApp atualizados em Minha conta.',
    'A conta é pessoal. Não compartilhe a sua senha.',
    'O cadastro próprio é a partir de 12 anos. Crianças com menos de 12 anos só pelo pai, mãe ou responsável legal.',
   ]},
  ]},
  {title: 'Agendamento', blocks: [
   {list: [
    'Não há pagamento para agendar. O atendimento é pago na clínica.',
    'O horário só está marcado quando aparece como confirmado em Minha conta. Consultar horários não reserva nada.',
    'O valor do serviço é o mostrado no momento do agendamento.',
    'Para extensão de cílios, a ficha precisa estar preenchida antes de agendar.',
    'Pode haver limite de agendamentos futuros por cliente e antecedência mínima para agendar, informados na tela de agendamento.',
   ]},
  ]},
  {title: 'Remarcação, cancelamento e faltas', blocks: [
   'Antes de cada agendamento você lê e aceita a regra em vigor, que fica registrada com a data do aceite. Em resumo:',
   {list: [
    'Com pelo menos 24 horas de antecedência, você remarca ou cancela sem custo, pelo site.',
    'Se desistir em até 1 hora depois de marcar, também não há custo.',
    'Cancelamento com menos de 24 horas ou falta sem justificativa podem gerar uma taxa de 30% do valor do serviço.',
    'A taxa só é cobrada depois que a Eduarda avalia a justificativa e confirma. Os lembretes de pagamento vão para o WhatsApp ou o e-mail do cadastro, no máximo três.',
    'Enquanto houver taxa confirmada em aberto, novos agendamentos pelo site ficam bloqueados. A baixa é feita pela clínica depois de conferir o pagamento.',
   ]},
   'Se a clínica precisar cancelar, avisamos o quanto antes e não há taxa para você.',
  ]},
  {title: 'Ficha e atendimento', blocks: [
   {list: [
    'Responda a ficha com sinceridade e avise a profissional sobre qualquer mudança antes de cada atendimento.',
    'A profissional pode adiar ou recusar um procedimento quando ele não for seguro para você.',
    'A ficha não substitui avaliação médica.',
   ]},
  ]},
  {title: 'Mensagens', blocks: [
   'Você recebe por e-mail as mensagens de acesso à conta e, se aceitar, confirmações e lembretes pelo WhatsApp. Avisos de novas vagas são opcionais e podem ser desligados em Minha conta.',
  ]},
  {title: 'Disponibilidade do site', blocks: [
   'O site pode ficar fora do ar por manutenção ou falhas de terceiros. Nesses casos, fale com a clínica pelo WhatsApp. Serviços, preços e horários podem mudar, sem afetar os agendamentos já confirmados.',
  ]},
  {title: 'Encerrar a conta', blocks: [
   `Para encerrar a sua conta, escreva para ${c.email}. Os dados que a lei manda guardar ficam bloqueados pelo prazo do Aviso de privacidade.`,
  ]},
  {title: 'Mudanças nestes termos', blocks: [
   `Avisamos quando estes termos mudarem e, se a mudança for importante, pedimos novo aceite. Versão em vigor desde ${LEGAL_DATE}.`,
  ]},
  {title: 'Lei e foro', blocks: [
   'Valem as leis brasileiras, em especial o Código de Defesa do Consumidor. Qualquer disputa pode ser levada ao foro da cidade onde você mora.',
  ]},
 ],
};

export const legalDocs = {privacidade: privacy, termos: terms};
