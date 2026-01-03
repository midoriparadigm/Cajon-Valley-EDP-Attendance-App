-- Create Staff table
create table public.staff (
  id uuid primary key, -- Should match auth.users.id if using Supabase Auth, or just random uuid
  name text not null,
  role text not null check (role in ('Lead', 'Assistant', 'Coach')),
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Students table
create table public.students (
  id uuid default gen_random_uuid() primary key,
  first_name text not null,
  last_name text not null,
  grade text not null,
  parent_name text not null,
  parent_phone text,
  parent_email text,
  elop_id text not null,
  ases_id text,
  programs text[] not null default '{}',
  has_snack boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Daily Attendance table
create table public.daily_attendance (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.students(id) not null,
  date date not null default current_date,
  program text not null check (program in ('sunrise', 'sunset')),
  status text not null check (status in ('absent', 'present', 'checked_out', 'pending_parent')),
  check_in_time time,
  check_out_time time,
  staff_id uuid references public.staff(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Behavior Logs table
create table public.behavior_logs (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.students(id) not null,
  level text not null check (level in ('green', 'yellow', 'red')),
  issues text[] default '{}',
  description text,
  staff_id uuid references public.staff(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Head Injury Logs table
create table public.head_injury_logs (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.students(id) not null,
  stage text not null check (stage in ('0min', '15min', '30min')),
  symptoms jsonb default '{}'::jsonb,
  notes text,
  staff_id uuid references public.staff(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS) - Optional for now, enabling read for all specific to this prototype 
alter table public.staff enable row level security;
alter table public.students enable row level security;
alter table public.daily_attendance enable row level security;
alter table public.behavior_logs enable row level security;
alter table public.head_injury_logs enable row level security;

-- Create policies (open for development mostly)
create policy "Enable read access for all users" on public.staff for select using (true);
create policy "Enable read access for all users" on public.students for select using (true);
create policy "Enable read access for all users" on public.daily_attendance for select using (true);
create policy "Enable read access for all users" on public.behavior_logs for select using (true);
create policy "Enable read access for all users" on public.head_injury_logs for select using (true);

-- Insert Policy examples
create policy "Enable insert for authenticated users only" on public.daily_attendance for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.daily_attendance for update using (auth.role() = 'authenticated');
