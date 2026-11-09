-- Trusted operator, test project only. All personal/health answers are fictitious.
-- No messages or medical decisions. Every fixture/change is rolled back.
begin;
set local statement_timeout='30s';
do $$
declare
 customer uuid:=gen_random_uuid();other_customer uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();
 data jsonb;answers jsonb;question text;record public.client_intake_current;technical public.client_intake_procedure;rejected boolean;
begin
 insert into auth.users(id,email,email_confirmed_at) values
 (customer,'fixture-intake-'||customer::text||'@example.test',now()),
 (other_customer,'fixture-intake-'||other_customer::text||'@example.test',now()),
 (admin_id,'fixture-intake-'||admin_id::text||'@example.test',now());
 insert into private.admin_members(user_id) values(admin_id);
 answers:='{}'::jsonb;
 foreach question in array array['pregnant_or_breastfeeding','previous_eye_procedure','cosmetic_allergy','eye_condition','cancer_treatment','wearing_mascara'] loop
  answers:=answers||jsonb_build_object(question,jsonb_build_object('value','discuss','details','Resposta fictícia de teste'));
 end loop;
 data:=jsonb_build_object('birth_date','2000-01-01','sex','prefer_not_to_say','answers',answers,'signed_name','Pessoa Fictícia','privacy_accepted',true,'declaration_accepted',true,'procedure_authorized',false,'photo_record_authorized',false);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated','aal','aal1')::text,true);
 set local role authenticated;
 select * into record from public.save_client_intake(data,0);
 assert record.customer_id=customer and record.revision=1 and record.notice_version='client-intake-v1','Intake attribution/version failed';
 assert not record.procedure_authorized and not record.photo_record_authorized,'Authorization choices changed';
 rejected:=false;begin perform public.save_client_intake(data||jsonb_build_object('customer_id',other_customer),1);exception when raise_exception then rejected:=true;end;
 assert rejected,'Forged customer field accepted';
 select * into record from public.save_client_intake(data||jsonb_build_object('procedure_authorized',true),1);
 rejected:=false;begin perform public.save_client_intake(data,1);exception when sqlstate 'PT409' then rejected:=true;end;
 assert rejected and record.revision=2,'Stale intake overwrote current revision';
 assert (select count(*)=1 from public.client_intake_current where customer_id=customer),'Own intake hidden';
 rejected:=false;begin update public.client_intake_current set signed_name='Forged' where customer_id=customer;exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Direct intake mutation exposed';
 rejected:=false;begin perform 1 from private.client_intake_revisions;exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Private history exposed';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_customer,'role','authenticated','aal','aal1')::text,true);
 assert not exists(select 1 from public.client_intake_current where customer_id=customer),'Other customer read intake';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1')::text,true);
 assert not exists(select 1 from public.client_intake_current where customer_id=customer),'Admin AAL1 bypass';
 rejected:=false;begin perform public.save_client_intake_procedure(customer,'{}',0,2);exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Admin procedure bypass without MFA';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
 assert exists(select 1 from public.client_intake_current where customer_id=customer),'Admin AAL2 denied';
 rejected:=false;begin perform public.save_client_intake_procedure(customer,'{}',0,1);exception when sqlstate 'PT409' then rejected:=true;end;
 assert rejected,'Stale source intake accepted';
 select * into technical from public.save_client_intake_procedure(customer,'{"style":"Estilo fictício","notes":"Anotação fictícia"}',0,2);
 assert technical.customer_id=customer and technical.revision=1 and technical.intake_revision=2 and technical.updated_by=admin_id,'Technical attribution failed';
 reset role;
 assert (select count(*)=2 from private.client_intake_revisions where customer_id=customer and kind='intake'),'Intake revisions lost';
 assert (select count(*)=1 from private.client_intake_revisions where customer_id=customer and kind='procedure'),'Technical revision lost';
 assert not has_function_privilege('anon','public.save_client_intake(jsonb,integer)','EXECUTE'),'Anonymous intake exposed';
end $$;
rollback;
select true as smoke_passed;
