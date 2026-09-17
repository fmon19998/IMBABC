create unique index if not exists account_profiles_single_super_admin on public.account_profiles (role) where role = 'SUPER_ADMIN';
