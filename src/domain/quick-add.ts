import type { TaskPriority } from "./types";

/**
 * Natural-language quick-add parser for task capture.
 *
 * Recognizes, in Russian, inside a free-form title:
 *  - priority: `!высокий` / `!high` / `!1` (and medium/low variants)
 *  - project: `#name` (matched by project name; falls back to a tag)
 *  - tag: `@name`
 *  - date: `сегодня`, `завтра`, `послезавтра`, weekday (`пн`..`вс`),
 *          `через N дней/недель`, `через неделю`, and `DD.MM(.YYYY)`
 *
 * Recognized tokens are stripped from the returned `title`.
 */
export interface QuickAddContext {
  projects: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  now?: Date;
}

export interface QuickAddResult {
  title: string;
  dueDate: string | null;
  priority: TaskPriority | null;
  projectId: string | null;
  tagIds: string[];
}

const PRIORITY_TOKENS: Record<string, TaskPriority> = {
  high: "high",
  высокий: "high",
  hi: "high",
  "1": "high",
  medium: "medium",
  средний: "medium",
  med: "medium",
  "2": "medium",
  low: "low",
  низкий: "low",
  "3": "low",
};

const WEEKDAYS: Record<string, number> = {
  вс: 0,
  воскресенье: 0,
  пн: 1,
  понедельник: 1,
  вт: 2,
  вторник: 2,
  ср: 3,
  среда: 3,
  чт: 4,
  четверг: 4,
  пт: 5,
  пятница: 5,
  сб: 6,
  суббота: 6,
};

export function parseQuickAdd(input: string, context: QuickAddContext): QuickAddResult {
  const now = context.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const projectByName = new Map(context.projects.map((project) => [project.name.toLowerCase(), project.id]));
  const tagByName = new Map(context.tags.map((tag) => [tag.name.toLowerCase(), tag.id]));

  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const remaining: string[] = [];
  let dueDate: string | null = null;
  let priority: TaskPriority | null = null;
  let projectId: string | null = null;
  const tagIds: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    if (token.startsWith("!") && token.length > 1) {
      const mapped = PRIORITY_TOKENS[lower.slice(1)];
      if (priority === null && mapped) {
        priority = mapped;
        continue;
      }
    }

    if (token.startsWith("#") && token.length > 1) {
      const name = lower.slice(1);
      if (projectByName.has(name)) {
        projectId ??= projectByName.get(name) ?? null;
        continue;
      }
      const tagId = tagByName.get(name);
      if (tagId) {
        if (!tagIds.includes(tagId)) {
          tagIds.push(tagId);
        }
        continue;
      }
      remaining.push(token.slice(1));
      continue;
    }

    if (token.startsWith("@") && token.length > 1) {
      const tagId = tagByName.get(lower.slice(1));
      if (tagId) {
        if (!tagIds.includes(tagId)) {
          tagIds.push(tagId);
        }
        continue;
      }
      remaining.push(token.slice(1));
      continue;
    }

    if (dueDate === null) {
      const single = parseSingleDateToken(lower, today);
      if (single) {
        dueDate = single;
        continue;
      }
      if (lower === "через") {
        const relative = parseRelativeDate(tokens.slice(i + 1, i + 3), today);
        if (relative) {
          dueDate = relative.date;
          i += relative.extraTokens;
          continue;
        }
      }
      const explicit = parseExplicitDate(lower, today);
      if (explicit) {
        dueDate = explicit;
        continue;
      }
    }

    remaining.push(token);
  }

  return { title: remaining.join(" ").trim(), dueDate, priority, projectId, tagIds };
}

function parseSingleDateToken(lower: string, today: Date): string | null {
  if (lower === "сегодня") {
    return formatDateKey(today);
  }
  if (lower === "завтра") {
    return formatDateKey(addDays(today, 1));
  }
  if (lower === "послезавтра") {
    return formatDateKey(addDays(today, 2));
  }
  if (lower in WEEKDAYS) {
    let delta = (WEEKDAYS[lower] - today.getDay() + 7) % 7;
    if (delta === 0) {
      delta = 7; // the next occurrence, not today
    }
    return formatDateKey(addDays(today, delta));
  }
  return null;
}

function parseRelativeDate(rest: string[], today: Date): { date: string; extraTokens: number } | null {
  const [first, second] = rest;
  if (first === "неделю") {
    return { date: formatDateKey(addDays(today, 7)), extraTokens: 1 };
  }
  const count = Number(first);
  if (Number.isInteger(count) && count > 0 && second) {
    if (second.startsWith("дн")) {
      return { date: formatDateKey(addDays(today, count)), extraTokens: 2 };
    }
    if (second.startsWith("недел")) {
      return { date: formatDateKey(addDays(today, count * 7)), extraTokens: 2 };
    }
  }
  return null;
}

function parseExplicitDate(lower: string, today: Date): string | null {
  const match = lower.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const hasYear = Boolean(match[3]);
  let year = hasYear ? Number(match[3]) : today.getFullYear();
  if (hasYear && match[3]!.length === 2) {
    year += 2000;
  }

  let date = new Date(year, month - 1, day);
  if (!hasYear && date.getTime() < today.getTime()) {
    date = new Date(year + 1, month - 1, day); // roll a bare past date into next year
  }
  return formatDateKey(date);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
