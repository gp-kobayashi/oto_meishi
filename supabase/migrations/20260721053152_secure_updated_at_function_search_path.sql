do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    execute 'alter function public.update_updated_at_column() set search_path = ''''';
  end if;
end
$$;
