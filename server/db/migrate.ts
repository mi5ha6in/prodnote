import { sql } from "drizzle-orm";
import { db } from "./client";

export async function runMigrations(): Promise<void> {
  await db.execute(sql`
    create table if not exists users (
      id uuid primary key,
      handle text not null unique,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table if not exists passkey_credentials (
      id text primary key,
      user_id uuid not null references users(id) on delete cascade,
      public_key bytea not null,
      counter integer not null default 0,
      transports jsonb not null default '[]'::jsonb,
      device_type text not null,
      backed_up boolean not null default false,
      created_at timestamptz not null
    );

    create table if not exists auth_challenges (
      id uuid primary key,
      user_id uuid references users(id) on delete cascade,
      challenge text not null,
      type text not null,
      label text,
      expires_at timestamptz not null,
      created_at timestamptz not null
    );

    create table if not exists sessions (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null
    );

    create table if not exists workspaces (
      id uuid primary key,
      user_id uuid not null unique references users(id) on delete cascade,
      schema_version integer not null,
      server_revision bigint not null default 0,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table if not exists projects (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      name text not null,
      color text not null,
      description text not null,
      archived boolean not null default false,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists tags (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      name text not null,
      color text not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists tasks (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      title text not null,
      description text not null,
      project_id text,
      status text not null,
      priority text not null,
      due_date text,
      planned_at text,
      estimate_minutes integer,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      completed_at timestamptz,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists task_tags (
      workspace_id uuid not null,
      task_id text not null,
      tag_id text not null,
      primary key (workspace_id, task_id, tag_id)
    );

    create table if not exists task_history_entries (
      workspace_id uuid not null,
      task_id text not null,
      entity_id text not null,
      at timestamptz not null,
      kind text not null,
      markdown text not null,
      primary key (workspace_id, task_id, entity_id)
    );

    create table if not exists task_subtasks (
      workspace_id uuid not null,
      task_id text not null,
      entity_id text not null,
      title text not null,
      done boolean not null default false,
      position integer not null default 0,
      primary key (workspace_id, task_id, entity_id)
    );

    create table if not exists checklist_items (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      day text not null,
      title text not null,
      done boolean not null default false,
      done_at timestamptz,
      position integer not null default 0,
      task_id text,
      rolled_from text,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists checklist_templates (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      title text not null,
      cadence text not null default 'daily',
      is_habit boolean not null default false,
      archived boolean not null default false,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists notes (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      title text not null,
      markdown text not null,
      project_id text,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists note_task_links (
      workspace_id uuid not null,
      note_id text not null,
      task_id text not null,
      primary key (workspace_id, note_id, task_id)
    );

    create table if not exists note_tags (
      workspace_id uuid not null,
      note_id text not null,
      tag_id text not null,
      primary key (workspace_id, note_id, tag_id)
    );

    create table if not exists note_edit_entries (
      workspace_id uuid not null,
      note_id text not null,
      entity_id text not null,
      edited_at timestamptz not null,
      primary key (workspace_id, note_id, entity_id)
    );

    create table if not exists time_sessions (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      task_id text not null,
      started_at timestamptz not null,
      ended_at timestamptz not null,
      duration_minutes integer not null,
      mode text not null,
      note text not null,
      pomodoro_cycle_id text,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists pomodoro_cycles (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      task_id text not null,
      focus_minutes integer not null,
      short_break_minutes integer not null,
      long_break_minutes integer not null,
      long_break_every integer not null,
      started_at timestamptz not null,
      completed_focus_count integer not null,
      completed_short_break_count integer not null default 0,
      completed_long_break_count integer not null default 0,
      status text not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists calendar_plans (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      task_id text not null,
      title text not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      kind text not null,
      created_at timestamptz not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists calendar_events (
      workspace_id uuid not null references workspaces(id) on delete cascade,
      entity_id text not null,
      task_id text,
      project_id text,
      title text not null,
      description text not null default '',
      location text not null default '',
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      all_day boolean not null default false,
      kind text not null,
      source text not null default 'manual',
      external_uid text,
      created_at timestamptz not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null,
      deleted_at timestamptz,
      primary key (workspace_id, entity_id)
    );

    create table if not exists settings (
      workspace_id uuid primary key references workspaces(id) on delete cascade,
      pomodoro_focus_minutes integer not null,
      pomodoro_short_break_minutes integer not null,
      pomodoro_long_break_minutes integer not null,
      pomodoro_long_break_every integer not null,
      week_starts_on integer not null,
      client_updated_at timestamptz not null,
      server_revision bigint not null
    );

    alter table if exists pomodoro_cycles
      add column if not exists completed_short_break_count integer not null default 0;

    alter table if exists pomodoro_cycles
      add column if not exists completed_long_break_count integer not null default 0;

    alter table if exists checklist_items
      add column if not exists template_id text;

    alter table if exists settings
      add column if not exists weekly_time_goal_minutes integer not null default 0;

    alter table if exists calendar_events
      add column if not exists project_id text;

    alter table if exists tasks
      add column if not exists recurrence text;

    alter table if exists tasks
      add column if not exists recurrence_parent_id text;

    alter table if exists settings
      add column if not exists daily_capacity_minutes integer not null default 480;

    alter table if exists notes
      add column if not exists day_key text;

    alter table if exists settings
      add column if not exists event_reminder_minutes integer not null default 15;

    alter table if exists settings
      add column if not exists all_day_reminder_hour integer not null default 9;

    alter table if exists tasks
      add column if not exists board_order double precision;

    alter table if exists checklist_items
      add column if not exists count integer not null default 0;

    alter table if exists checklist_templates
      add column if not exists target_count integer not null default 1;

    alter table if exists checklist_templates
      add column if not exists target_per_week integer;

    create table if not exists push_subscriptions (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      endpoint text not null unique,
      p256dh text not null,
      auth text not null,
      created_at timestamptz not null
    );
  `);
}
