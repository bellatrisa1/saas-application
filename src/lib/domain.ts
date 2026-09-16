import { z } from "zod";
export const roles = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof roles)[number];
export const statuses = [
  "backlog",
  "todo",
  "in-progress",
  "in-review",
  "done",
] as const;
export const priorities = ["urgent", "high", "medium", "low", "none"] as const;
export type Status = (typeof statuses)[number];
export function can(role: Role, action: "read" | "issue" | "manage" | "owner") {
  return (
    roles.includes(role) &&
    roles.indexOf(role) <= { read: 3, issue: 2, manage: 1, owner: 0 }[action]
  );
}
export const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(2).max(80).optional(),
});
export const issueInput = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20000).default(""),
  projectId: z.uuid(),
  status: z.enum(statuses).default("todo"),
  priority: z.enum(priorities).default("medium"),
  assigneeId: z.uuid().nullable().default(null),
  dueDate: z.iso.date().nullable().default(null),
  labels: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
export const issuePatch = z.object({
  title: issueInput.shape.title.optional(),
  projectId: issueInput.shape.projectId.optional(),
  description: issueInput.shape.description.removeDefault().optional(),
  status: issueInput.shape.status.removeDefault().optional(),
  priority: issueInput.shape.priority.removeDefault().optional(),
  assigneeId: issueInput.shape.assigneeId.removeDefault().optional(),
  dueDate: issueInput.shape.dueDate.removeDefault().optional(),
  labels: issueInput.shape.labels.removeDefault().optional(),
  version: z.number().int().positive(),
});
export type Issue = {
  id: string;
  workspace_id: string;
  project_id: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  priority: (typeof priorities)[number];
  assignee_id: string | null;
  assignee_name: string | null;
  reporter_name: string;
  due_date: string | null;
  labels: string[];
  version: number;
  created_at: string;
  project_name: string;
  project_key: string;
};
export type Project = {
  id: string;
  name: string;
  key: string;
  description: string;
  archived: boolean;
};
export type Member = {
  user_id: string;
  name: string;
  email: string;
  role: Role;
};
export type Workspace = { id: string; name: string; role: Role };
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export type Search = {
  text: string;
  status?: string;
  priority?: string;
  assignee?: string;
  label?: string;
  due?: string;
};
export function parseSearch(input: string): Search {
  const result: Search = { text: "" };
  const words: string[] = [];
  for (const match of input.matchAll(/(?:[^\s"]+|"[^"]*")+/g)) {
    const token = match[0];
    const separator = token.indexOf(":");
    if (separator < 0) {
      words.push(token.replaceAll('"', ""));
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1).replaceAll('"', "");
    if (key === "status") {
      if (!statuses.includes(value as Status))
        throw new AppError(422, "Unknown status filter");
      result.status = value;
    } else if (key === "priority") {
      if (!priorities.includes(value as (typeof priorities)[number]))
        throw new AppError(422, "Unknown priority filter");
      result.priority = value;
    } else if (key === "assignee" || key === "label") {
      result[key] = value;
    } else if (key === "due") {
      if (
        !/^<\d{4}-\d{2}-\d{2}$/.test(value) ||
        !z.iso.date().safeParse(value.slice(1)).success
      )
        throw new AppError(422, "Use due:<YYYY-MM-DD");
      result.due = value.slice(1);
    } else throw new AppError(422, `Unknown filter: ${key}`);
  }
  result.text = words.join(" ");
  return result;
}
