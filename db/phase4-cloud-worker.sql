-- Conservative initial worker: up to 3 recipients per minute; no claims until Meta is configured.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
insert into public.server_settings(key,value) values('WORKER_TOKEN',encode(extensions.gen_random_bytes(32),'hex')) on conflict(key) do nothing;
select cron.schedule('imbabc-cloud-sender','* * * * *',$job$
 select net.http_post(
  url:='https://pxqpuxdpuenjbdefghpr.supabase.co/functions/v1/imbabc-api/worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',(select value from public.server_settings where key='WORKER_TOKEN')),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 ) where (select count(*) from public.server_settings where key in('META_GRAPH_API_VERSION','META_APP_SECRET','META_WEBHOOK_VERIFY_TOKEN'))=3;
$job$);
