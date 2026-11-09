# Cadastro de cliente controlado — 05/11/2026

**Validação real pelo usuário:** após informar que realizou o cadastro, consulta confiável e somente leitura confirmou conta criada, e-mail confirmado, perfil criado e ausência de papel administrativo. Nenhum token, endereço ou senha foi registrado neste documento. Falta o usuário conferir/salvar seus dados e preferências na interface; reservas e pagamentos continuam indisponíveis.

**Preferências validadas:** o usuário informou ter ativado WhatsApp e e-mail. Consulta somente leitura confirmou ambos os campos ativos, eventos de autorização registrados para os dois canais e nome/telefone preenchidos, sem copiar seus valores. O telefone preenchido ainda não representa destino WhatsApp verificado. Foram registradas preferências; não houve disparo de mensagens nem ativação dos provedores de avisos.

SMTP próprio recebido e confirmado pelo usuário. Foi autorizado privadamente o segundo endereço fornecido nesta conversa, por sete dias, para cadastro de CLIENTE. Nenhuma conta real foi criada pelo operador, nenhuma senha foi escolhida e nenhum papel administrativo foi atribuído. O usuário realizará o cadastro e a confirmação pelo site.

Publicado na URL estável https://clinica-torriceli-previa.pages.dev/ . Deployment https://636d845e.clinica-torriceli-previa.pages.dev/ . Homepage e bundle `index-Dh7gMEaH.js` retornaram HTTP 200; SHA-256 do bundle público corresponde ao build local. Texto de cadastro controlado presente, endereço pessoal ausente do bundle, CSP e noindex preservados.

## Controle no servidor

Migração `202611050001_controlled_signup.sql` aplicada no projeto dedicado de testes em São Paulo. Hook oficial Before User Created habilitado antes de ativar signup no Auth. Função com SECURITY INVOKER; somente `supabase_auth_admin` executa e lê a tabela privada de autorizações. Guarda hash normalizado do endereço e expiração; não há endereços reais no código, documentação ou bundle. A autorização não depende de metadata fornecida pelo navegador e não concede administração.

Endereços não autorizados são recusados pelo hook antes da criação e do envio. Confirmação de e-mail permanece obrigatória. O papel administrativo continua separado, atribuído apenas por operador confiável e protegido por TOTP/AAL2. Reservas e pagamentos continuam indisponíveis. E-mails transacionais de autenticação não ativam avisos de novas vagas nem WhatsApp.

## Publicar e testar

Build conectado para este teste restrito: `node scripts/build-staging.mjs --signup-test`. Sem essa opção, o formulário de cadastro permanece desabilitado no build. A opção não substitui o hook no servidor. Preservar o hook até uma abertura pública futura com proteções de abuso revisadas.

1. Abrir a prévia em janela anônima para não usar a sessão administrativa.
2. Minha conta → Criar conta; informar o endereço previamente autorizado e escolher senha com pelo menos 12 caracteres.
3. Manter a janela aberta. Abrir o link de confirmação no mesmo navegador e na mesma sessão anônima, pois o cadastro usa PKCE.
4. Conferir Minha conta, salvar nome/telefone opcional e testar preferências de aviso. Cada canal começa desligado. Não informar dados de saúde.
5. Confirmar que a conta de cliente não tem administração. Não tentar reserva ou pagamento nesta etapa.

## Evidências e limites

- 12 testes locais passaram, incluindo RLS, permissão mínima do hook, normalização, expiração e recusa de bypass por metadata.
- Cinco testes de integração passaram no Supabase hospedado: isolamento entre clientes, administração/MFA/revogação, disponibilidade, links Auth e novo controle de cadastro.
- Tentativa real pela API pública com endereço sintético não autorizado foi negada especificamente pelo hook. Cadastro sintético autorizado via generateLink exigiu confirmação, acessou apenas o próprio perfil e não obteve papel ou dados administrativos. GenerateLink não envia e-mail. Fixtures e autorizações sintéticas removidas.
- Build staging e verificação contra chaves privilegiadas no bundle passaram. A chegada do novo e-mail de confirmação e o percurso no navegador dependem agora da ação do usuário; não foram declarados concluídos.
- Não houve nova inspeção visual automatizada. Capturas anteriores não representam esta versão do formulário.

Referências oficiais consultadas: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook e https://supabase.com/docs/guides/auth/auth-hooks . Nenhum plano pago contratado.
