# Configuração, segurança e recuperação

## Supabase local e produção futura

1. Em máquina com Docker e CLI oficial Supabase, executar `supabase start` e `supabase db reset` SOMENTE no ambiente local descartável. `config.toml` fixa URLs locais e confirmação de e-mail. Migrações estão em `supabase/migrations/`; a segunda contém o catálogo gerado. Não executar reset em produção.
2. Copiar URL e anon/publishable key locais para `.env.local` e reiniciar Vite. Não expor service-role. E-mails locais são consultados na caixa de testes fornecida pelo CLI.
3. Produção: criar projeto Supabase Pro na região São Paulo, aplicar migrações, configurar Site URL HTTPS e allowlist EXATA de redirects, confirmação de e-mail, TOTP, mínimo 12 caracteres, proteção contra senhas vazadas se disponível no plano, SMTP e limites de Auth. Nunca usar wildcard amplo de callback em produção. A recuperação PKCE deve ser aberta no navegador que iniciou o fluxo; não registrar query `code` em analytics/logs. A aplicação troca o código e o remove da URL.
4. Promover a conta verificada de Eduarda SOMENTE no SQL Editor por operador de confiança, após conferir o UUID no Auth. Não usar e-mail enviado pelo cliente, metadata do perfil, primeiro cadastro ou parâmetro da URL:

```sql
-- Substituir pelo UUID conferido no painel Auth. Não executar com UUID de exemplo.
insert into private.admin_members(user_id) values ('UUID-VERIFICADO-DA-EDUARDA');
```

5. Eduarda entra, acessa Eduarda, prepara o autenticador, lê QR no app TOTP e valida código. Até AAL2, RLS nega leitura administrativa. `has_admin_role()` apenas informa o papel da própria conta, para permitir enrollment. Usuários AAL1 ainda podem ler seus próprios dados pessoais. Trocar o papel no frontend não concede permissões no banco. QR é segredo, não deve ser capturado em log/screenshot. Remoção de acesso: excluir a associação em `private.admin_members`; acesso administrativo cai pela consulta ao banco em cada autorização, mesmo com JWT antigo.
6. Fluxos de recuperação de MFA e administração de emergência ficam no painel Supabase por operador autorizado; guardar códigos/procedimento em local separado. Nunca entregar service-role ao navegador. Antes de dados reais, testar recuperação e revogação de sessões. O frontend usa armazenamento padrão da biblioteca para sessão; CSP ajuda a reduzir superfície de XSS, sem eliminar esse risco.

## Abuso, arquivos e logs

Definir limites Auth/SMTP, habilitar proteção de bots e testar o CAPTCHA com token no cadastro/recovery antes de ativá-lo. CAPTCHA não está integrado nesta etapa: habilitá-lo sem adaptar o formulário bloqueará o fluxo. O rate limiting padrão do Supabase continua necessário; Cloudflare só protege o site, não a URL direta do Supabase. Futura API de agenda/webhook exige validação e limites próprios, incluindo concorrência e idempotência. Nenhuma API privilegiada existe no Pages nesta etapa.

`client-files` é privado, leitura por primeiro componente do caminho = UUID autenticado (ou admin AAL2). Uploads privados intencionalmente sem policy, até definir finalidade e retenção; não armazenar saúde. `public-gallery` separado, só admin AAL2 pode escrever. Todo objeto desse bucket é público por desenho: publicar apenas mídia aprovada para exibição pública. Validar conteúdo real e metadados no futuro upload; limite de MIME e 5 MB não substitui validação. Sem policy geral em outros buckets.

Log de edição do perfil registra ator, ação, entidade e data, sem nome, e-mail, senha ou payload. Operações futuras devem inserir auditoria na mesma transação. Não registrar tokens, OTPs, corpo integral de webhook ou segredos. Restringir acesso ao painel do provedor e rotacionar segredos após exposição.

## Backups e recuperação antes de produção

Confirmar retenção de backups no plano contratado, alertas e necessidade de PITR; não assumir configuração ativa. Definir com a clínica objetivo de perda de dados (RPO) e tempo de retorno (RTO). Guardar exportações criptografadas com acesso mínimo, separado da aplicação e com prazo de descarte. Backups do banco não substituem cópia dos objetos Storage.

Ensaio: restaurar backup em ambiente isolado, restaurar objetos separadamente, aplicar migrações faltantes, executar testes de isolamento, conciliar pagamentos com gateway antes de reabrir agenda. Registrar data/duração e resultado. Nenhum backup, restauração, monitoramento remoto ou infraestrutura foi provisionado nesta entrega.

## Fontes oficiais consultadas em 04/11/2026

- [Supabase Password Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase MFA TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Cloudflare Pages React](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [PGlite extensions](https://pglite.dev/extensions/) — PostgreSQL embarcado usado apenas para testes locais, com schemas Auth/Storage simulados.
