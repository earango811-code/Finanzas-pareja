-- Entrada con correo + PIN de 4 dígitos.
-- El PIN no se guarda: el servidor lo convierte en una contraseña larga (HMAC con
-- un secreto del servidor) y esa es la que conoce Supabase Auth.

-- Para saber si cada uno ya creó su PIN (y mostrarle el aviso si no).
alter table public.members
  add column pin_set_at timestamptz;

-- Intentos fallidos por correo, para bloquear ataques de fuerza bruta.
-- Solo la usa el servidor (service role): RLS activo y sin políticas.
create table public.login_attempts (
  email         text primary key,
  failures      int not null default 0,
  lockouts      int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.login_attempts enable row level security;
