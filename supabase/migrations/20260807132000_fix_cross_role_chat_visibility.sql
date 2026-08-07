begin;

alter table public.chat_messages
  add column if not exists sender_display_name text,
  add column if not exists sender_username text;

update public.chat_messages m
set sender_display_name=p.display_name,
    sender_username=p.username
from public.profiles p
where p.id=m.sender_id
  and (m.sender_display_name is distinct from p.display_name or m.sender_username is distinct from p.username);

create or replace function public.apply_chat_sender_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  select p.display_name,p.username
  into new.sender_display_name,new.sender_username
  from public.profiles p
  where p.id=new.sender_id and p.organisation_id=new.organisation_id;
  if new.sender_display_name is null then raise exception 'Chat sender is not part of this organisation'; end if;
  return new;
end
$function$;

drop trigger if exists chat_messages_sender_identity on public.chat_messages;
create trigger chat_messages_sender_identity
before insert or update of sender_id,organisation_id on public.chat_messages
for each row execute function public.apply_chat_sender_identity();

revoke all on function public.apply_chat_sender_identity() from public, anon, authenticated;

grant select(sender_display_name,sender_username) on public.chat_messages to authenticated;

commit;
