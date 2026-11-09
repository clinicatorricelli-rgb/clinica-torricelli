-- Test-clinic intake. Typed acknowledgements are records, not medical clearance.
create table public.client_intake_current (
 customer_id uuid primary key references public.profiles(id) on delete cascade,
 birth_date date,sex text check(sex in ('female','male','other','prefer_not_to_say')),address text check(length(address)<=500),
 answers jsonb not null check(jsonb_typeof(answers)='object'),
 signed_name text not null check(length(signed_name) between 1 and 100),
 privacy_accepted boolean not null check(privacy_accepted),declaration_accepted boolean not null check(declaration_accepted),
 procedure_authorized boolean not null default false,photo_record_authorized boolean not null default false,
 notice_version text not null default 'client-intake-v1' check(notice_version='client-intake-v1'),
 revision integer not null check(revision>0),submitted_at timestamptz,updated_at timestamptz not null default now()
);
create table public.client_intake_procedure (
 customer_id uuid primary key references public.client_intake_current(customer_id) on delete cascade,
 style text check(length(style)<=100),curvature text check(length(curvature)<=100),thickness text check(length(thickness)<=100),
 fiber_model text check(length(fiber_model)<=100),procedure_date date,notes text check(length(notes)<=2000),
 revision integer not null check(revision>0),intake_revision integer not null check(intake_revision>0),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table private.client_intake_revisions (
 customer_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('intake','procedure')),revision integer not null check(revision>0),
 actor_id uuid not null references auth.users(id),recorded_at timestamptz not null default now(),snapshot jsonb not null,
 primary key(customer_id,kind,revision)
);
alter table public.client_intake_current enable row level security;
alter table public.client_intake_procedure enable row level security;
alter table private.client_intake_revisions enable row level security;
revoke all on public.client_intake_current,public.client_intake_procedure,private.client_intake_revisions from public,anon,authenticated,service_role;
grant select on public.client_intake_current,public.client_intake_procedure to authenticated;
create policy intake_read on public.client_intake_current for select to authenticated using(customer_id=(select auth.uid()) or private.is_admin());
create policy intake_procedure_read on public.client_intake_procedure for select to authenticated using(private.is_admin());

create function public.save_client_intake(p_data jsonb,p_revision integer default 0)
returns public.client_intake_current language plpgsql security definer set search_path='' as $$
declare customer uuid:=auth.uid();old_revision integer;result public.client_intake_current;
 birth date;sex_value text;address_value text;signature text;answer jsonb;normalized jsonb:='{}'::jsonb;question text;
 questions constant text[]:=array['pregnant_or_breastfeeding','previous_eye_procedure','cosmetic_allergy','eye_condition','cancer_treatment','wearing_mascara'];
begin
 if customer is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid intake';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k<>all(array['birth_date','sex','address','answers','signed_name','privacy_accepted','declaration_accepted','procedure_authorized','photo_record_authorized'])) then raise exception 'Unknown intake field';end if;
 if p_data->'privacy_accepted' is distinct from 'true'::jsonb or p_data->'declaration_accepted' is distinct from 'true'::jsonb then raise exception 'Privacy and declaration acknowledgement required';end if;
 foreach question in array array['procedure_authorized','photo_record_authorized'] loop
  if p_data ? question and jsonb_typeof(p_data->question)<>'boolean' then raise exception 'Invalid authorization choice';end if;
 end loop;
 if jsonb_typeof(p_data->'signed_name') is distinct from 'string' then raise exception 'Typed name required';end if;
 signature:=btrim(p_data->>'signed_name');if length(signature) not between 1 and 100 then raise exception 'Invalid typed name';end if;
 if p_data ? 'birth_date' and p_data->'birth_date'<>'null'::jsonb then
  if jsonb_typeof(p_data->'birth_date')<>'string' or (p_data->>'birth_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid birth date';end if;
  birth:=(p_data->>'birth_date')::date;if birth>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Birth date is in the future';end if;
 end if;
 foreach question in array array['sex','address'] loop
  if p_data ? question and p_data->question<>'null'::jsonb and jsonb_typeof(p_data->question)<>'string' then raise exception 'Invalid optional intake text';end if;
 end loop;
 sex_value:=nullif(btrim(p_data->>'sex'),'');address_value:=nullif(btrim(p_data->>'address'),'');
 if length(sex_value)>60 or length(address_value)>500 then raise exception 'Intake text too long';end if;
 if sex_value is not null and sex_value<>all(array['female','male','other','prefer_not_to_say']) then raise exception 'Invalid sex choice';end if;
 if jsonb_typeof(p_data->'answers') is distinct from 'object' then raise exception 'Six intake answers required';end if;
 if (select count(*) from jsonb_object_keys(p_data->'answers'))<>6 or exists(select 1 from jsonb_object_keys(p_data->'answers') k where k<>all(questions)) then raise exception 'Six intake answers required';end if;
 foreach question in array questions loop
  answer:=p_data->'answers'->question;
  if jsonb_typeof(answer) is distinct from 'object' or jsonb_typeof(answer->'value') is distinct from 'string' or (answer->>'value')<>all(array['yes','no','discuss']) then raise exception 'Invalid intake answer';end if;
  if exists(select 1 from jsonb_object_keys(answer) k where k<>all(array['value','details'])) then raise exception 'Unknown answer field';end if;
  if answer ? 'details' and jsonb_typeof(answer->'details')<>'string' then raise exception 'Invalid answer details';end if;
  if length(coalesce(answer->>'details',''))>500 then raise exception 'Answer details too long';end if;
  normalized:=normalized||jsonb_build_object(question,jsonb_build_object('value',answer->>'value','details',coalesce(answer->>'details','')));
 end loop;
 -- Serialize first creation as well as updates; no customer UUID comes from JSON.
 perform 1 from public.profiles where id=customer for update;if not found then raise exception 'Profile required';end if;
 select revision into old_revision from public.client_intake_current where customer_id=customer for update;
 if coalesce(old_revision,0)<>p_revision then raise exception 'Intake changed; reload before saving' using errcode='40001';end if;
 insert into public.client_intake_current(customer_id,birth_date,sex,address,answers,signed_name,privacy_accepted,declaration_accepted,procedure_authorized,photo_record_authorized,revision,submitted_at,updated_at)
 values(customer,birth,sex_value,address_value,normalized,signature,true,true,coalesce((p_data->>'procedure_authorized')::boolean,false),coalesce((p_data->>'photo_record_authorized')::boolean,false),p_revision+1,now(),now())
 on conflict(customer_id) do update set birth_date=excluded.birth_date,sex=excluded.sex,address=excluded.address,answers=excluded.answers,signed_name=excluded.signed_name,
 privacy_accepted=true,declaration_accepted=true,procedure_authorized=excluded.procedure_authorized,photo_record_authorized=excluded.photo_record_authorized,revision=excluded.revision,submitted_at=excluded.submitted_at,updated_at=excluded.updated_at returning * into result;
 insert into private.client_intake_revisions(customer_id,kind,revision,actor_id,snapshot) values(customer,'intake',result.revision,customer,to_jsonb(result));
 insert into public.audit_log(actor_id,action,entity_id) values(customer,'intake.submitted',customer);
 return result;
end;$$;

create function public.save_client_intake_procedure(p_customer_id uuid,p_data jsonb,p_revision integer default 0,p_intake_revision integer default null)
returns public.client_intake_procedure language plpgsql security definer set search_path='' as $$
declare previous integer;result public.client_intake_procedure;field text;procedure_day date;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_customer_id is null or p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid procedure record';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k<>all(array['style','curvature','thickness','fiber_model','procedure_date','notes'])) then raise exception 'Unknown procedure field';end if;
 foreach field in array array['style','curvature','thickness','fiber_model','notes'] loop
  if p_data ? field and p_data->field<>'null'::jsonb and jsonb_typeof(p_data->field)<>'string' then raise exception 'Invalid procedure text';end if;
  if length(p_data->>field)>(case when field='notes' then 2000 else 100 end) then raise exception 'Procedure text too long';end if;
 end loop;
 if p_data ? 'procedure_date' and p_data->'procedure_date'<>'null'::jsonb then
  if jsonb_typeof(p_data->'procedure_date')<>'string' or (p_data->>'procedure_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid procedure date';end if;
  procedure_day:=(p_data->>'procedure_date')::date;
 end if;
 perform 1 from public.profiles where id=p_customer_id for update;if not found then raise exception 'Profile required';end if;
 if not exists(select 1 from public.client_intake_current where customer_id=p_customer_id) then raise exception 'Submitted intake required';end if;
 if p_intake_revision is distinct from (select revision from public.client_intake_current where customer_id=p_customer_id) then raise exception 'Intake changed; reload before saving procedure' using errcode='40001';end if;
 select revision into previous from public.client_intake_procedure where customer_id=p_customer_id for update;
 if coalesce(previous,0)<>p_revision then raise exception 'Procedure record changed; reload before saving' using errcode='40001';end if;
 insert into public.client_intake_procedure(customer_id,style,curvature,thickness,fiber_model,procedure_date,notes,revision,intake_revision,updated_by,updated_at)
 values(p_customer_id,nullif(btrim(p_data->>'style'),''),nullif(btrim(p_data->>'curvature'),''),nullif(btrim(p_data->>'thickness'),''),nullif(btrim(p_data->>'fiber_model'),''),procedure_day,nullif(btrim(p_data->>'notes'),''),p_revision+1,p_intake_revision,auth.uid(),now())
 on conflict(customer_id) do update set style=excluded.style,curvature=excluded.curvature,thickness=excluded.thickness,fiber_model=excluded.fiber_model,procedure_date=excluded.procedure_date,notes=excluded.notes,revision=excluded.revision,intake_revision=excluded.intake_revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at returning * into result;
 insert into private.client_intake_revisions(customer_id,kind,revision,actor_id,snapshot) values(p_customer_id,'procedure',result.revision,auth.uid(),to_jsonb(result));
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'intake.procedure_saved',p_customer_id);
 return result;
end;$$;
revoke all on function public.save_client_intake(jsonb,integer),public.save_client_intake_procedure(uuid,jsonb,integer,integer) from public,anon,service_role;
grant execute on function public.save_client_intake(jsonb,integer),public.save_client_intake_procedure(uuid,jsonb,integer,integer) to authenticated;
