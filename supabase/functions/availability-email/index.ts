import postgres from 'npm:postgres@3.4.7';
import { createAvailabilityEmailHandler } from '../_shared/availability-email.mjs';
import { createResendWebhookHandler } from '../_shared/resend-webhook.mjs';

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

Deno.serve(createAvailabilityEmailHandler({
  db,
  cronSecret: Deno.env.get('AVAILABILITY_CRON_SECRET'),
  resendKey: Deno.env.get('RESEND_API_KEY'),
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  webhookHandler,
}));
