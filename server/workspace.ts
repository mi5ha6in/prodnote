import type postgres from "postgres";
import { createDefaultSettings } from "../src/domain/defaults";
import { SCHEMA_VERSION, type Workspace } from "../src/domain/types";
import { createUuid } from "./crypto";
import { sqlClient } from "./db/client";
import { toSqlTimestamp } from "./db/timestamps";

export type DeletedEntityType =
  | "project"
  | "tag"
  | "task"
  | "note"
  | "checklistItem"
  | "checklistTemplate"
  | "session"
  | "pomodoroCycle"
  | "plan"
  | "event";

export interface DeletedEntity {
  type: DeletedEntityType;
  id: string;
  deletedAt: string;
}

export interface SyncedWorkspace {
  schemaVersion: number;
  serverRevision: number;
  workspace: Workspace;
  /** Tombstones newer than the client's `since` revision, so other devices drop deleted entities. */
  deletedEntities: DeletedEntity[];
}

export interface PutWorkspaceResult {
  schemaVersion: number;
  serverRevision: number;
}

type Row = Record<string, unknown>;

export async function getSyncedWorkspace(userId: string, sinceRevision = 0): Promise<SyncedWorkspace> {
  const workspaceRecord = await ensureWorkspace(userId, SCHEMA_VERSION);
  const workspaceId = workspaceRecord.id;
  const [
    projects,
    tags,
    tasks,
    taskTags,
    taskHistory,
    taskSubtasks,
    checklist,
    checklistTemplates,
    notes,
    noteTaskLinks,
    noteTags,
    noteEdits,
    sessions,
    cycles,
    plans,
    events,
    settingsRows,
  ] = await Promise.all([
    sqlClient<Row[]>`select * from projects where workspace_id = ${workspaceId} and deleted_at is null order by created_at desc`,
    sqlClient<Row[]>`select * from tags where workspace_id = ${workspaceId} and deleted_at is null order by name asc`,
    sqlClient<Row[]>`select * from tasks where workspace_id = ${workspaceId} and deleted_at is null order by created_at desc`,
    sqlClient<Row[]>`select * from task_tags where workspace_id = ${workspaceId}`,
    sqlClient<Row[]>`select * from task_history_entries where workspace_id = ${workspaceId} order by at desc`,
    sqlClient<Row[]>`select * from task_subtasks where workspace_id = ${workspaceId} order by position asc`,
    sqlClient<Row[]>`select * from checklist_items where workspace_id = ${workspaceId} and deleted_at is null order by day asc, position asc`,
    sqlClient<Row[]>`select * from checklist_templates where workspace_id = ${workspaceId} and deleted_at is null order by created_at asc`,
    sqlClient<Row[]>`select * from notes where workspace_id = ${workspaceId} and deleted_at is null order by created_at desc`,
    sqlClient<Row[]>`select * from note_task_links where workspace_id = ${workspaceId}`,
    sqlClient<Row[]>`select * from note_tags where workspace_id = ${workspaceId}`,
    sqlClient<Row[]>`select * from note_edit_entries where workspace_id = ${workspaceId} order by edited_at desc`,
    sqlClient<Row[]>`select * from time_sessions where workspace_id = ${workspaceId} and deleted_at is null order by ended_at desc`,
    sqlClient<Row[]>`select * from pomodoro_cycles where workspace_id = ${workspaceId} and deleted_at is null order by started_at desc`,
    sqlClient<Row[]>`select * from calendar_plans where workspace_id = ${workspaceId} and deleted_at is null order by starts_at asc`,
    sqlClient<Row[]>`select * from calendar_events where workspace_id = ${workspaceId} and deleted_at is null order by starts_at asc`,
    sqlClient<Row[]>`select * from settings where workspace_id = ${workspaceId}`,
  ]);

  const deletedRows = await sqlClient<Row[]>`
    select 'project' as entity_type, entity_id, deleted_at from projects
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'tag', entity_id, deleted_at from tags
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'task', entity_id, deleted_at from tasks
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'note', entity_id, deleted_at from notes
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'checklistItem', entity_id, deleted_at from checklist_items
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'checklistTemplate', entity_id, deleted_at from checklist_templates
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'session', entity_id, deleted_at from time_sessions
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'pomodoroCycle', entity_id, deleted_at from pomodoro_cycles
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'plan', entity_id, deleted_at from calendar_plans
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
    union all
    select 'event', entity_id, deleted_at from calendar_events
      where workspace_id = ${workspaceId} and deleted_at is not null and server_revision > ${sinceRevision}
  `;

  const taskTagsByTask = groupValues(taskTags, "task_id", "tag_id");
  const taskHistoryByTask = groupRows(taskHistory, "task_id");
  const taskSubtasksByTask = groupRows(taskSubtasks, "task_id");
  const noteTasksByNote = groupValues(noteTaskLinks, "note_id", "task_id");
  const noteTagsByNote = groupValues(noteTags, "note_id", "tag_id");
  const noteEditsByNote = groupRows(noteEdits, "note_id");
  const settings = settingsRows[0];

  return {
    schemaVersion: Number(workspaceRecord.schemaVersion),
    serverRevision: Number(workspaceRecord.serverRevision),
    deletedEntities: deletedRows.map((row) => ({
      type: asString(row.entity_type) as DeletedEntityType,
      id: asString(row.entity_id),
      deletedAt: toIso(row.deleted_at),
    })),
    workspace: {
      schemaVersion: Number(workspaceRecord.schemaVersion),
      exportedAt: null,
      projects: projects.map((project) => ({
        id: asString(project.entity_id),
        name: asString(project.name),
        color: asString(project.color),
        description: asString(project.description),
        archived: Boolean(project.archived),
        createdAt: toIso(project.created_at),
        updatedAt: toIso(project.updated_at),
      })),
      tags: tags.map((tag) => ({
        id: asString(tag.entity_id),
        name: asString(tag.name),
        color: asString(tag.color),
      })),
      tasks: tasks.map((task) => ({
        id: asString(task.entity_id),
        title: asString(task.title),
        description: asString(task.description),
        projectId: asNullableString(task.project_id),
        status: asString(task.status) as Workspace["tasks"][number]["status"],
        priority: asString(task.priority) as Workspace["tasks"][number]["priority"],
        tagIds: taskTagsByTask.get(asString(task.entity_id)) ?? [],
        dueDate: asNullableString(task.due_date),
        plannedAt: asNullableString(task.planned_at),
        estimateMinutes: asNullableNumber(task.estimate_minutes),
        subtasks: (taskSubtasksByTask.get(asString(task.entity_id)) ?? []).map((sub) => ({
          id: asString(sub.entity_id),
          title: asString(sub.title),
          done: Boolean(sub.done),
        })),
        history: (taskHistoryByTask.get(asString(task.entity_id)) ?? []).map((entry) => ({
          id: asString(entry.entity_id),
          at: toIso(entry.at),
          kind: asString(entry.kind) as Workspace["tasks"][number]["history"][number]["kind"],
          markdown: asString(entry.markdown),
        })),
        createdAt: toIso(task.created_at),
        updatedAt: toIso(task.updated_at),
        completedAt: task.completed_at ? toIso(task.completed_at) : null,
        recurrence: parseRecurrence(task.recurrence),
        recurrenceParentId: asNullableString(task.recurrence_parent_id),
      })),
      notes: notes.map((note) => ({
        id: asString(note.entity_id),
        title: asString(note.title),
        markdown: asString(note.markdown),
        projectId: asNullableString(note.project_id),
        linkedTaskIds: noteTasksByNote.get(asString(note.entity_id)) ?? [],
        tagIds: noteTagsByNote.get(asString(note.entity_id)) ?? [],
        editHistory: (noteEditsByNote.get(asString(note.entity_id)) ?? []).map((entry) => ({
          id: asString(entry.entity_id),
          editedAt: toIso(entry.edited_at),
        })),
        dayKey: asNullableString(note.day_key),
        createdAt: toIso(note.created_at),
        updatedAt: toIso(note.updated_at),
      })),
      checklist: checklist.map((item) => ({
        id: asString(item.entity_id),
        day: asString(item.day),
        title: asString(item.title),
        done: Boolean(item.done),
        doneAt: item.done_at ? toIso(item.done_at) : null,
        order: Number(item.position ?? 0),
        taskId: asNullableString(item.task_id),
        templateId: asNullableString(item.template_id),
        rolledFrom: asNullableString(item.rolled_from),
        createdAt: toIso(item.created_at),
        updatedAt: toIso(item.updated_at),
      })),
      checklistTemplates: checklistTemplates.map((template) => ({
        id: asString(template.entity_id),
        title: asString(template.title),
        cadence: asString(template.cadence) as Workspace["checklistTemplates"][number]["cadence"],
        isHabit: Boolean(template.is_habit),
        archived: Boolean(template.archived),
        createdAt: toIso(template.created_at),
        updatedAt: toIso(template.updated_at),
      })),
      sessions: sessions.map((session) => ({
        id: asString(session.entity_id),
        taskId: asString(session.task_id),
        startedAt: toIso(session.started_at),
        endedAt: toIso(session.ended_at),
        durationMinutes: Number(session.duration_minutes),
        mode: asString(session.mode) as Workspace["sessions"][number]["mode"],
        note: asString(session.note),
        pomodoroCycleId: asNullableString(session.pomodoro_cycle_id),
      })),
      pomodoroCycles: cycles.map((cycle) => ({
        id: asString(cycle.entity_id),
        taskId: asString(cycle.task_id),
        focusMinutes: Number(cycle.focus_minutes),
        shortBreakMinutes: Number(cycle.short_break_minutes),
        longBreakMinutes: Number(cycle.long_break_minutes),
        longBreakEvery: Number(cycle.long_break_every),
        startedAt: toIso(cycle.started_at),
        completedFocusCount: Number(cycle.completed_focus_count),
        completedShortBreakCount: Number(cycle.completed_short_break_count ?? 0),
        completedLongBreakCount: Number(cycle.completed_long_break_count ?? 0),
        status: asString(cycle.status) as Workspace["pomodoroCycles"][number]["status"],
      })),
      plans: plans.map((plan) => ({
        id: asString(plan.entity_id),
        taskId: asString(plan.task_id),
        title: asString(plan.title),
        startsAt: toIso(plan.starts_at),
        endsAt: toIso(plan.ends_at),
        kind: asString(plan.kind) as Workspace["plans"][number]["kind"],
        createdAt: toIso(plan.created_at),
      })),
      events: events.map((event) => ({
        id: asString(event.entity_id),
        title: asString(event.title),
        description: asString(event.description),
        location: asString(event.location),
        startsAt: toIso(event.starts_at),
        endsAt: toIso(event.ends_at),
        allDay: Boolean(event.all_day),
        kind: asString(event.kind) as Workspace["events"][number]["kind"],
        taskId: asNullableString(event.task_id),
        projectId: asNullableString(event.project_id),
        source: asString(event.source) as Workspace["events"][number]["source"],
        externalUid: asNullableString(event.external_uid),
        createdAt: toIso(event.created_at),
        updatedAt: toIso(event.updated_at),
      })),
      settings: settings
        ? {
            pomodoroFocusMinutes: Number(settings.pomodoro_focus_minutes),
            pomodoroShortBreakMinutes: Number(settings.pomodoro_short_break_minutes),
            pomodoroLongBreakMinutes: Number(settings.pomodoro_long_break_minutes),
            pomodoroLongBreakEvery: Number(settings.pomodoro_long_break_every),
            weekStartsOn: Number(settings.week_starts_on) === 7 ? 7 : 1,
            weeklyTimeGoalMinutes: Number(settings.weekly_time_goal_minutes ?? 0),
            dailyCapacityMinutes: Number(settings.daily_capacity_minutes ?? 480),
          }
        : createDefaultSettings(),
    },
  };
}

export async function putSyncedWorkspace(
  userId: string,
  workspace: Workspace,
  deletedEntities: DeletedEntity[] = [],
): Promise<PutWorkspaceResult> {
  let resultRevision = 0;
  await sqlClient.begin(async (transaction) => {
    const workspaceRecord = await ensureWorkspace(userId, workspace.schemaVersion);
    const workspaceId = workspaceRecord.id;
    const nextRevision = Number(workspaceRecord.serverRevision) + 1;
    resultRevision = nextRevision;
    const now = toSqlTimestamp(new Date());

    await transaction`
      update workspaces
      set schema_version = ${workspace.schemaVersion}, server_revision = ${nextRevision}, updated_at = ${now}
      where id = ${workspaceId}
    `;

    for (const entity of deletedEntities) {
      await markDeleted(transaction, workspaceId, entity, nextRevision);
    }

    for (const project of workspace.projects) {
      await transaction`
        insert into projects (
          workspace_id, entity_id, name, color, description, archived, created_at, updated_at,
          client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${project.id}, ${project.name}, ${project.color}, ${project.description}, ${project.archived},
          ${toSqlTimestamp(project.createdAt)}, ${toSqlTimestamp(project.updatedAt)}, ${toSqlTimestamp(project.updatedAt)}, ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set name = excluded.name, color = excluded.color, description = excluded.description, archived = excluded.archived,
          created_at = excluded.created_at, updated_at = excluded.updated_at, client_updated_at = excluded.client_updated_at,
          server_revision = excluded.server_revision, deleted_at = null
        where projects.client_updated_at < excluded.client_updated_at or projects.deleted_at is not null
      `;
    }

    for (const tag of workspace.tags) {
      await transaction`
        insert into tags (workspace_id, entity_id, name, color, client_updated_at, server_revision, deleted_at)
        values (${workspaceId}, ${tag.id}, ${tag.name}, ${tag.color}, ${now}, ${nextRevision}, null)
        on conflict (workspace_id, entity_id) do update
        set name = excluded.name, color = excluded.color, client_updated_at = excluded.client_updated_at,
          server_revision = excluded.server_revision, deleted_at = null
      `;
    }

    for (const task of workspace.tasks) {
      await transaction`
        insert into tasks (
          workspace_id, entity_id, title, description, project_id, status, priority, due_date, planned_at,
          estimate_minutes, recurrence, recurrence_parent_id, created_at, updated_at, completed_at,
          client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${task.id}, ${task.title}, ${task.description}, ${task.projectId}, ${task.status}, ${task.priority},
          ${task.dueDate}, ${task.plannedAt}, ${task.estimateMinutes}, ${task.recurrence ? JSON.stringify(task.recurrence) : null},
          ${task.recurrenceParentId}, ${toSqlTimestamp(task.createdAt)}, ${toSqlTimestamp(task.updatedAt)},
          ${toSqlTimestamp(task.completedAt)}, ${toSqlTimestamp(task.updatedAt)}, ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set title = excluded.title, description = excluded.description, project_id = excluded.project_id, status = excluded.status,
          priority = excluded.priority, due_date = excluded.due_date, planned_at = excluded.planned_at,
          estimate_minutes = excluded.estimate_minutes, recurrence = excluded.recurrence,
          recurrence_parent_id = excluded.recurrence_parent_id, created_at = excluded.created_at, updated_at = excluded.updated_at,
          completed_at = excluded.completed_at, client_updated_at = excluded.client_updated_at,
          server_revision = excluded.server_revision, deleted_at = null
        where tasks.client_updated_at < excluded.client_updated_at or tasks.deleted_at is not null
      `;
      await transaction`delete from task_tags where workspace_id = ${workspaceId} and task_id = ${task.id}`;
      for (const tagId of task.tagIds) {
        await transaction`insert into task_tags (workspace_id, task_id, tag_id) values (${workspaceId}, ${task.id}, ${tagId}) on conflict do nothing`;
      }
      await transaction`delete from task_history_entries where workspace_id = ${workspaceId} and task_id = ${task.id}`;
      for (const entry of task.history) {
        await transaction`
          insert into task_history_entries (workspace_id, task_id, entity_id, at, kind, markdown)
          values (${workspaceId}, ${task.id}, ${entry.id}, ${toSqlTimestamp(entry.at)}, ${entry.kind}, ${entry.markdown})
          on conflict do nothing
        `;
      }
      await transaction`delete from task_subtasks where workspace_id = ${workspaceId} and task_id = ${task.id}`;
      for (const [position, sub] of task.subtasks.entries()) {
        await transaction`
          insert into task_subtasks (workspace_id, task_id, entity_id, title, done, position)
          values (${workspaceId}, ${task.id}, ${sub.id}, ${sub.title}, ${sub.done}, ${position})
          on conflict do nothing
        `;
      }
    }

    for (const item of workspace.checklist) {
      await transaction`
        insert into checklist_items (
          workspace_id, entity_id, day, title, done, done_at, position, task_id, template_id, rolled_from,
          created_at, updated_at, client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${item.id}, ${item.day}, ${item.title}, ${item.done}, ${toSqlTimestamp(item.doneAt)},
          ${item.order}, ${item.taskId}, ${item.templateId}, ${item.rolledFrom}, ${toSqlTimestamp(item.createdAt)}, ${toSqlTimestamp(item.updatedAt)},
          ${toSqlTimestamp(item.updatedAt)}, ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set day = excluded.day, title = excluded.title, done = excluded.done, done_at = excluded.done_at,
          position = excluded.position, task_id = excluded.task_id, template_id = excluded.template_id, rolled_from = excluded.rolled_from,
          created_at = excluded.created_at, updated_at = excluded.updated_at,
          client_updated_at = excluded.client_updated_at, server_revision = excluded.server_revision, deleted_at = null
        where checklist_items.client_updated_at < excluded.client_updated_at or checklist_items.deleted_at is not null
      `;
    }

    for (const template of workspace.checklistTemplates) {
      await transaction`
        insert into checklist_templates (
          workspace_id, entity_id, title, cadence, is_habit, archived,
          created_at, updated_at, client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${template.id}, ${template.title}, ${template.cadence}, ${template.isHabit}, ${template.archived},
          ${toSqlTimestamp(template.createdAt)}, ${toSqlTimestamp(template.updatedAt)}, ${toSqlTimestamp(template.updatedAt)},
          ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set title = excluded.title, cadence = excluded.cadence, is_habit = excluded.is_habit, archived = excluded.archived,
          created_at = excluded.created_at, updated_at = excluded.updated_at,
          client_updated_at = excluded.client_updated_at, server_revision = excluded.server_revision, deleted_at = null
        where checklist_templates.client_updated_at < excluded.client_updated_at or checklist_templates.deleted_at is not null
      `;
    }

    for (const note of workspace.notes) {
      await transaction`
        insert into notes (
          workspace_id, entity_id, title, markdown, project_id, day_key, created_at, updated_at, client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${note.id}, ${note.title}, ${note.markdown}, ${note.projectId}, ${note.dayKey ?? null}, ${toSqlTimestamp(note.createdAt)},
          ${toSqlTimestamp(note.updatedAt)}, ${toSqlTimestamp(note.updatedAt)}, ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set title = excluded.title, markdown = excluded.markdown, project_id = excluded.project_id, day_key = excluded.day_key,
          created_at = excluded.created_at, updated_at = excluded.updated_at, client_updated_at = excluded.client_updated_at,
          server_revision = excluded.server_revision, deleted_at = null
        where notes.client_updated_at < excluded.client_updated_at or notes.deleted_at is not null
      `;
      await transaction`delete from note_task_links where workspace_id = ${workspaceId} and note_id = ${note.id}`;
      for (const taskId of note.linkedTaskIds) {
        await transaction`insert into note_task_links (workspace_id, note_id, task_id) values (${workspaceId}, ${note.id}, ${taskId}) on conflict do nothing`;
      }
      await transaction`delete from note_tags where workspace_id = ${workspaceId} and note_id = ${note.id}`;
      for (const tagId of note.tagIds) {
        await transaction`insert into note_tags (workspace_id, note_id, tag_id) values (${workspaceId}, ${note.id}, ${tagId}) on conflict do nothing`;
      }
      await transaction`delete from note_edit_entries where workspace_id = ${workspaceId} and note_id = ${note.id}`;
      for (const entry of note.editHistory) {
        await transaction`
          insert into note_edit_entries (workspace_id, note_id, entity_id, edited_at)
          values (${workspaceId}, ${note.id}, ${entry.id}, ${toSqlTimestamp(entry.editedAt)})
          on conflict do nothing
        `;
      }
    }

    for (const session of workspace.sessions) {
      await transaction`
        insert into time_sessions (
          workspace_id, entity_id, task_id, started_at, ended_at, duration_minutes, mode, note,
          pomodoro_cycle_id, client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${session.id}, ${session.taskId}, ${toSqlTimestamp(session.startedAt)}, ${toSqlTimestamp(session.endedAt)},
          ${session.durationMinutes}, ${session.mode}, ${session.note}, ${session.pomodoroCycleId},
          ${toSqlTimestamp(session.endedAt)}, ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set task_id = excluded.task_id, started_at = excluded.started_at, ended_at = excluded.ended_at,
          duration_minutes = excluded.duration_minutes, mode = excluded.mode, note = excluded.note,
          pomodoro_cycle_id = excluded.pomodoro_cycle_id, client_updated_at = excluded.client_updated_at,
          server_revision = excluded.server_revision, deleted_at = null
        where time_sessions.client_updated_at < excluded.client_updated_at or time_sessions.deleted_at is not null
      `;
    }

    for (const cycle of workspace.pomodoroCycles) {
      await transaction`
        insert into pomodoro_cycles (
          workspace_id, entity_id, task_id, focus_minutes, short_break_minutes, long_break_minutes,
          long_break_every, started_at, completed_focus_count, completed_short_break_count, completed_long_break_count,
          status, client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${cycle.id}, ${cycle.taskId}, ${cycle.focusMinutes}, ${cycle.shortBreakMinutes},
          ${cycle.longBreakMinutes}, ${cycle.longBreakEvery}, ${toSqlTimestamp(cycle.startedAt)}, ${cycle.completedFocusCount},
          ${cycle.completedShortBreakCount}, ${cycle.completedLongBreakCount}, ${cycle.status}, ${toSqlTimestamp(cycle.startedAt)},
          ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set task_id = excluded.task_id, focus_minutes = excluded.focus_minutes,
          short_break_minutes = excluded.short_break_minutes, long_break_minutes = excluded.long_break_minutes,
          long_break_every = excluded.long_break_every, completed_focus_count = excluded.completed_focus_count,
          completed_short_break_count = excluded.completed_short_break_count,
          completed_long_break_count = excluded.completed_long_break_count,
          status = excluded.status, client_updated_at = excluded.client_updated_at,
          server_revision = excluded.server_revision, deleted_at = null
      `;
    }

    for (const plan of workspace.plans) {
      await transaction`
        insert into calendar_plans (
          workspace_id, entity_id, task_id, title, starts_at, ends_at, kind, created_at,
          client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${plan.id}, ${plan.taskId}, ${plan.title}, ${toSqlTimestamp(plan.startsAt)}, ${toSqlTimestamp(plan.endsAt)},
          ${plan.kind}, ${toSqlTimestamp(plan.createdAt)}, ${toSqlTimestamp(plan.createdAt)}, ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set task_id = excluded.task_id, title = excluded.title, starts_at = excluded.starts_at,
          ends_at = excluded.ends_at, kind = excluded.kind, created_at = excluded.created_at,
          client_updated_at = excluded.client_updated_at, server_revision = excluded.server_revision, deleted_at = null
      `;
    }

    for (const event of workspace.events) {
      await transaction`
        insert into calendar_events (
          workspace_id, entity_id, task_id, project_id, title, description, location, starts_at, ends_at, all_day,
          kind, source, external_uid, created_at, client_updated_at, server_revision, deleted_at
        )
        values (
          ${workspaceId}, ${event.id}, ${event.taskId}, ${event.projectId}, ${event.title}, ${event.description}, ${event.location},
          ${toSqlTimestamp(event.startsAt)}, ${toSqlTimestamp(event.endsAt)}, ${event.allDay}, ${event.kind},
          ${event.source}, ${event.externalUid}, ${toSqlTimestamp(event.createdAt)}, ${toSqlTimestamp(event.updatedAt)},
          ${nextRevision}, null
        )
        on conflict (workspace_id, entity_id) do update
        set task_id = excluded.task_id, project_id = excluded.project_id, title = excluded.title, description = excluded.description,
          location = excluded.location, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
          all_day = excluded.all_day, kind = excluded.kind, source = excluded.source,
          external_uid = excluded.external_uid, created_at = excluded.created_at,
          client_updated_at = excluded.client_updated_at, server_revision = excluded.server_revision, deleted_at = null
        where calendar_events.client_updated_at < excluded.client_updated_at or calendar_events.deleted_at is not null
      `;
    }

    await transaction`
      insert into settings (
        workspace_id, pomodoro_focus_minutes, pomodoro_short_break_minutes, pomodoro_long_break_minutes,
        pomodoro_long_break_every, week_starts_on, weekly_time_goal_minutes, daily_capacity_minutes,
        client_updated_at, server_revision
      )
      values (
        ${workspaceId}, ${workspace.settings.pomodoroFocusMinutes}, ${workspace.settings.pomodoroShortBreakMinutes},
        ${workspace.settings.pomodoroLongBreakMinutes}, ${workspace.settings.pomodoroLongBreakEvery},
        ${workspace.settings.weekStartsOn}, ${workspace.settings.weeklyTimeGoalMinutes},
        ${workspace.settings.dailyCapacityMinutes ?? 480}, ${now}, ${nextRevision}
      )
      on conflict (workspace_id) do update
      set pomodoro_focus_minutes = excluded.pomodoro_focus_minutes,
        pomodoro_short_break_minutes = excluded.pomodoro_short_break_minutes,
        pomodoro_long_break_minutes = excluded.pomodoro_long_break_minutes,
        pomodoro_long_break_every = excluded.pomodoro_long_break_every,
        week_starts_on = excluded.week_starts_on,
        weekly_time_goal_minutes = excluded.weekly_time_goal_minutes,
        daily_capacity_minutes = excluded.daily_capacity_minutes,
        client_updated_at = excluded.client_updated_at,
        server_revision = excluded.server_revision
    `;
  });

  // Pushes are frequent (debounced per commit); avoid re-reading the whole workspace.
  return { schemaVersion: workspace.schemaVersion, serverRevision: resultRevision };
}

async function ensureWorkspace(userId: string, schemaVersion: number): Promise<{ id: string; schemaVersion: number; serverRevision: number }> {
  const existing = await sqlClient<Row[]>`
    select id, schema_version, server_revision from workspaces where user_id = ${userId} limit 1
  `;
  if (existing[0]) {
    return {
      id: asString(existing[0].id),
      schemaVersion: Number(existing[0].schema_version),
      serverRevision: Number(existing[0].server_revision),
    };
  }

  const workspaceId = createUuid();
  const now = toSqlTimestamp(new Date());
  await sqlClient`
    insert into workspaces (id, user_id, schema_version, server_revision, created_at, updated_at)
    values (${workspaceId}, ${userId}, ${schemaVersion}, 0, ${now}, ${now})
  `;
  return { id: workspaceId, schemaVersion, serverRevision: 0 };
}

async function markDeleted(
  transaction: postgres.TransactionSql,
  workspaceId: string,
  entity: DeletedEntity,
  revision: number,
): Promise<void> {
  const deletedAt = toSqlTimestamp(entity.deletedAt);
  if (entity.type === "project") {
    await transaction`update projects set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "tag") {
    await transaction`update tags set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "task") {
    await transaction`update tasks set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "note") {
    await transaction`update notes set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "checklistItem") {
    await transaction`update checklist_items set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "checklistTemplate") {
    await transaction`update checklist_templates set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "session") {
    await transaction`update time_sessions set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "pomodoroCycle") {
    await transaction`update pomodoro_cycles set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else if (entity.type === "plan") {
    await transaction`update calendar_plans set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  } else {
    await transaction`update calendar_events set deleted_at = ${deletedAt}, server_revision = ${revision} where workspace_id = ${workspaceId} and entity_id = ${entity.id}`;
  }
}

function groupValues(rows: Row[], groupField: string, valueField: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const group = asString(row[groupField]);
    const values = map.get(group) ?? [];
    values.push(asString(row[valueField]));
    map.set(group, values);
  }
  return map;
}

function groupRows(rows: Row[], groupField: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const group = asString(row[groupField]);
    const values = map.get(group) ?? [];
    values.push(row);
    map.set(group, values);
  }
  return map;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asNullableString(value: unknown): string | null {
  return value === null || typeof value === "undefined" ? null : asString(value);
}

function asNullableNumber(value: unknown): number | null {
  return value === null || typeof value === "undefined" ? null : Number(value);
}

/** Recurrence is stored as a JSON text column; tolerate null and legacy rows. */
function parseRecurrence(value: unknown): Workspace["tasks"][number]["recurrence"] {
  if (value === null || typeof value === "undefined") {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Workspace["tasks"][number]["recurrence"];
    } catch {
      return null;
    }
  }
  return value as Workspace["tasks"][number]["recurrence"];
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(asString(value)).toISOString();
}
