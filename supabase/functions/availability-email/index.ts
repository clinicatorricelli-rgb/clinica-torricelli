import postgres from 'npm:postgres@3.4.7';
import { createAvailabilityEmailHandler } from '../_shared/availability-email.mjs';
import { createResendWebhookHandler } from '../_shared/resend-webhook.mjs';
import { createWhatsappStatusHandler } from '../_shared/whatsapp-status.mjs';

// Server-only configuration. No request can choose a recipient or message.
const connection = Deno.env.get('SUPABASE_DB_URL');
const sql = connection ? postgres(connection, {max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: 'require'}) : null;

const db = {
  async markProviderReady(ready: boolean) {
    if (!sql) throw new Error('database_not_configured');
    await sql`update private.availability_email_settings set provider_ready=${ready},last_worker_at=now() where id`;
  },
  async enqueue() {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.enqueue_availability_emails()`;
  },
  async preparePayloadTransaction(run: (tx: unknown) => Promise<unknown>) {
    if (!sql) throw new Error('database_not_configured');
    return await sql.begin(async tx => run({
      async prepare() {
        const [row] = await tx`select private.prepare_availability_email() as job`;
        return row.job;
      },
      async freezePayload(id: string, payload: Parameters<typeof tx.json>[0]) {
        const [row] = await tx`update private.availability_email_deliveries set payload=coalesce(payload,${tx.json(payload)}) where id=${id}::uuid returning payload`;
        return row.payload;
      },
    }));
  },
  async withDeliveryTransaction(run: (tx: unknown) => Promise<unknown>) {
    if (!sql) throw new Error('database_not_configured');
    return await sql.begin(async tx => run({
      async claim(id: string) {
        const [row] = await tx`select private.claim_availability_email(${id}::uuid) as job`;
        return row.job;
      },
      async finish(id: string, outcome: string, providerId: string | null, code: string | null) {
        await tx`select private.finish_availability_email(${id}::uuid,${outcome}::text,${providerId}::text,${code}::text)`;
      },
    }));
  },
  // E-mails de agendamento (cliente e clínica). Cada chamada é uma transação curta.
  async prepareBookingEmail() {
    if (!sql) throw new Error('database_not_configured');
    const [row] = await sql`select private.prepare_booking_email() as job`;
    return row.job;
  },
  async finishBookingEmail(id: string, outcome: string, providerId: string | null, code: string | null) {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.finish_booking_email(${id}::uuid,${outcome}::text,${providerId}::text,${code}::text)`;
  },
  // Agenda do dia para a clínica (6h30, segunda a sábado).
  async prepareDailyAgenda() {
    if (!sql) throw new Error('database_not_configured');
    const [row] = await sql`select private.prepare_daily_agenda() as job`;
    return row.job;
  },
  async finishDailyAgenda(day: string, outcome: string, providerId: string | null, code: string | null) {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.finish_daily_agenda(${day}::date,${outcome}::text,${providerId}::text,${code}::text)`;
  },
  // Alertas da Eduarda no WhatsApp particular dela.
  async markOwnerWhatsappProvider(ready: boolean) {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.mark_owner_whatsapp_provider(${ready})`;
  },
  async enqueueOwnerDailyWhatsapp() {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.enqueue_owner_daily_whatsapp()`;
  },
  async prepareOwnerWhatsapp() {
    if (!sql) throw new Error('database_not_configured');
    const [row] = await sql`select private.prepare_owner_whatsapp() as job`;
    return row.job;
  },
  async finishOwnerWhatsapp(id: string, outcome: string, providerId: string | null, code: string | null) {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.finish_owner_whatsapp(${id}::uuid,${outcome}::text,${providerId}::text,${code}::text)`;
  },
  // Confirmação e lembretes das clientes no WhatsApp.
  async prepareClientWhatsapp() {
    if (!sql) throw new Error('database_not_configured');
    const [row] = await sql`select private.prepare_client_whatsapp() as job`;
    return row.job;
  },
  async finishClientWhatsapp(id: string, outcome: string, providerId: string | null, code: string | null) {
    if (!sql) throw new Error('database_not_configured');
    await sql`select private.finish_client_whatsapp(${id}::uuid,${outcome}::text,${providerId}::text,${code}::text)`;
  },
  async unsubscribe(token: string) {
    if (!sql) throw new Error('database_not_configured');
    const [row] = await sql`select private.unsubscribe_availability_email(${token}::text) as revoked`;
    return row.revoked;
  },
};

const webhookHandler=createResendWebhookHandler({
  secret: Deno.env.get('RESEND_WEBHOOK_SECRET'),
  async recordEvent(event: {eventId:string,emailId:string,type:string}) {
    if(!sql) throw new Error('database_not_configured');
    await sql`select private.record_availability_email_event(${event.eventId}::text,${event.emailId}::text,${event.type}::text)`;
  },
});

// Retorno de status do WhatsApp: o banco confere o segredo e grava só status, erro e hora.
const whatsappStatusHandler = createWhatsappStatusHandler({
  async record(secret: string, statuses: unknown[]) {
    if (!sql) throw new Error('database_not_configured');
    const [row] = await sql`select private.record_whatsapp_statuses(${secret}::text, ${sql.json(statuses)}) as n`;
    return row.n;
  },
});

Deno.serve(createAvailabilityEmailHandler({
  db,
  cronSecret: Deno.env.get('AVAILABILITY_CRON_SECRET'),
  resendKey: Deno.env.get('RESEND_API_KEY'),
  whatsappKey: Deno.env.get('WHATSAPP_360_API_KEY'),
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  webhookHandler,
  whatsappStatusHandler,
}));
