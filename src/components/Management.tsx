"use client";
import { useState } from "react";
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/client";
import { can, type Workspace, type Member, type Project } from "@/lib/domain";
import { Modal } from "./Modal";
import ui from "./ui.module.scss";
import s from "./workspace.module.scss";
export function ManagementDialog({
  kind,
  workspace,
  project,
  onClose,
  onCreated,
}: {
  kind: "workspace" | "invite" | "project" | "settings";
  workspace?: Workspace;
  project?: Project;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const client = useQueryClient();
  const [invite, setInvite] = useState("");
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api<{ id?: string; url?: string }>(
        kind === "workspace"
          ? "/api/workspaces"
          : `/api/w/${workspace?.id}/${kind === "project" ? "projects" : kind}`,
        "POST",
        data,
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries();
      if (result.url) setInvite(result.url);
      else {
        if (result.id) onCreated?.(result.id);
        onClose();
      }
    },
  });
  return (
    <Modal
      title={
        kind === "workspace"
          ? "Create workspace"
          : kind === "invite"
            ? "Invite a teammate"
            : kind === "project"
              ? project
                ? "Project settings"
                : "Create project"
              : "Workspace settings"
      }
      onClose={onClose}
    >
      {invite ? (
        <div className={ui.form}>
          <p>
            Invitation created. Share this private link with the invited person.
            It expires in 7 days.
          </p>
          <input
            aria-label="Invitation link"
            readOnly
            value={invite}
            onFocus={(e) => e.target.select()}
          />
          <small>
            Email delivery is not configured; this link is shown only now.
          </small>
        </div>
      ) : (
        <form
          className={ui.form}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const data = Object.fromEntries(f);
            mutation.mutate(
              kind === "project"
                ? {
                    ...data,
                    archived: f.get("archived") === "on",
                    ...(project ? { id: project.id } : {}),
                  }
                : data,
            );
          }}
        >
          {kind === "invite" ? (
            <>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="teammate@company.com"
                />
              </label>
              <label>
                Role
                <select name="role" defaultValue="member">
                  <option value="member">
                    Member — create and manage issues
                  </option>
                  <option value="viewer">Viewer — read only</option>
                  {workspace?.role === "owner" && (
                    <option value="admin">Admin — manage the workspace</option>
                  )}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Name
                <input
                  aria-label={
                    kind === "project" ? "Project name" : "Workspace name"
                  }
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={
                    project?.name ??
                    (kind === "settings" ? workspace?.name : "")
                  }
                  placeholder={
                    kind === "project" ? "Website redesign" : "Acme Studio"
                  }
                />
              </label>
              {kind === "project" && (
                <>
                  <label>
                    Identifier
                    <input
                      name="key"
                      aria-label="Project identifier"
                      required
                      pattern="[A-Z][A-Z0-9]{1,7}"
                      maxLength={8}
                      defaultValue={project?.key}
                      placeholder="WEB"
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={project?.description}
                      placeholder="What are we building?"
                    />
                  </label>
                  {project && (
                    <label>
                      <span>
                        <input
                          name="archived"
                          type="checkbox"
                          defaultChecked={project.archived}
                          style={{ width: "auto" }}
                        />{" "}
                        Archive project
                      </span>
                    </label>
                  )}
                </>
              )}
            </>
          )}
          {mutation.error && (
            <p role="alert" className={ui.error}>
              {mutation.error.message}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className={ui.primary} disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : kind === "invite"
                  ? "Create invitation"
                  : project || kind === "settings"
                    ? "Save changes"
                    : kind === "workspace"
                      ? "Create workspace"
                      : "Create project"}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
export function Members({
  workspace,
  project,
}: {
  workspace: Workspace;
  project?: Project;
}) {
  const [search, setSearch] = useState("");
  const client = useQueryClient();
  const members = useInfiniteQuery({
    queryKey: ["workspace", workspace.id, "members-page", search],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<Member[]>(
        `/api/w/${workspace.id}/members?q=${encodeURIComponent(search)}&cursor=${pageParam}`,
      ),
    getNextPageParam: (last) =>
      last.length === 50 ? last.at(-1)?.user_id : undefined,
  });
  const projectMembers = useQuery({
    queryKey: ["workspace", workspace.id, "project-members", project?.id],
    queryFn: () =>
      api<{ user_id: string }[]>(
        `/api/w/${workspace.id}/project-members/${project?.id}`,
      ),
    enabled: !!project,
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api(`/api/w/${workspace.id}/member`, "POST", data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workspace", workspace.id] }),
  });
  const projectMutation = useMutation({
    mutationFn: (memberIds: string[]) =>
      api(`/api/w/${workspace.id}/projects`, "POST", { ...project, memberIds }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workspace", workspace.id] }),
  });
  return (
    <div className={s.contentPanel}>
      <h2>{project ? "Project members" : "People"}</h2>
      <p className={s.muted}>
        Work moves forward together. Manage your team and their access.
      </p>
      <input
        aria-label="Search people"
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {(members.error || mutation.error || projectMutation.error) && (
        <div className={ui.error} role="alert">
          {(members.error ?? mutation.error ?? projectMutation.error)?.message}
        </div>
      )}
      {members.data?.pages.flat().map((member) => (
        <div className={s.memberRow} key={member.user_id}>
          <span className={s.avatar}>{member.name.slice(0, 2)}</span>
          <div>
            <strong>{member.name}</strong>
            <small>{member.email}</small>
          </div>
          {project ? (
            <label>
              <input
                type="checkbox"
                aria-label={`Add ${member.name} to project`}
                checked={
                  projectMembers.data?.some(
                    (m) => m.user_id === member.user_id,
                  ) ?? false
                }
                disabled={
                  !can(workspace.role, "manage") ||
                  projectMutation.isPending ||
                  !projectMembers.data
                }
                onChange={(e) => {
                  const ids = projectMembers.data?.map((m) => m.user_id) ?? [];
                  projectMutation.mutate(
                    e.target.checked
                      ? [...ids, member.user_id]
                      : ids.filter((id) => id !== member.user_id),
                  );
                }}
              />
              On project
            </label>
          ) : (
            <>
              <select
                aria-label={`Role for ${member.name}`}
                value={member.role}
                disabled={
                  !can(workspace.role, "manage") ||
                  member.role === "owner" ||
                  (workspace.role !== "owner" && member.role === "admin") ||
                  mutation.isPending
                }
                onChange={(e) =>
                  mutation.mutate({
                    userId: member.user_id,
                    role: e.target.value,
                  })
                }
              >
                {member.role === "owner" && <option>owner</option>}
                {workspace.role === "owner" && <option>admin</option>}
                <option>member</option>
                <option>viewer</option>
              </select>
              {can(workspace.role, "manage") && member.role !== "owner" && (
                <button
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${member.name} from this workspace?`,
                      )
                    )
                      mutation.mutate({ userId: member.user_id, remove: true });
                  }}
                >
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      ))}
      {members.hasNextPage && (
        <button onClick={() => members.fetchNextPage()}>
          Load more members
        </button>
      )}
    </div>
  );
}
export function Activity({
  workspace,
  project,
}: {
  workspace: string;
  project: string;
}) {
  const data = useInfiniteQuery({
    queryKey: ["workspace", workspace, "activity", project],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<
        {
          id: string;
          actor_name: string;
          action: string;
          data: {
            key?: string;
            title?: string;
            changes?: Record<string, { from: unknown; to: unknown }>;
          };
          created_at: string;
        }[]
      >(
        `/api/w/${workspace}/activity?cursor=${pageParam}${project ? `&project=${project}` : ""}`,
      ),
    getNextPageParam: (last) =>
      last.length === 50 ? last.at(-1)?.id : undefined,
  });
  return (
    <div className={s.contentPanel}>
      <h2>Activity</h2>
      <p className={s.muted}>A shared history of the work that matters.</p>
      {data.error && <p className={ui.error}>{data.error.message}</p>}
      {data.data?.pages.flat().map((a) => (
        <article key={a.id} className={s.activity}>
          <span className={s.avatar}>{a.actor_name?.slice(0, 2) ?? "S"}</span>
          <div>
            <strong>{a.actor_name}</strong> {a.action.replaceAll(".", " ")}{" "}
            <strong>{a.data.key ?? a.data.title}</strong>
            {a.data.changes &&
              Object.entries(a.data.changes).map(([field, v]) => (
                <p key={field}>
                  {field}: {String(v.from ?? "Unassigned")} →{" "}
                  {String(v.to ?? "Unassigned")}
                </p>
              ))}
            <small>{new Date(a.created_at).toLocaleString()}</small>
          </div>
        </article>
      ))}
      {data.hasNextPage && (
        <button onClick={() => data.fetchNextPage()}>Older activity</button>
      )}
      {!data.isPending && !data.data?.pages[0].length && (
        <p className={ui.empty}>Your team’s activity will appear here.</p>
      )}
    </div>
  );
}
export function Notifications({
  workspace,
  onSelect,
}: {
  workspace: string;
  onSelect: (id: string) => void;
}) {
  const client = useQueryClient();
  const data = useInfiniteQuery({
    queryKey: ["workspace", workspace, "notifications"],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<{
        items: {
          id: string;
          title: string;
          issue_id: string | null;
          read_at: string | null;
          created_at: string;
        }[];
        unread: number;
      }>(`/api/w/${workspace}/notifications?cursor=${pageParam}`),
    getNextPageParam: (last) =>
      last.items.length === 50 ? last.items.at(-1)?.id : undefined,
  });
  const mutation = useMutation({
    mutationFn: (id?: string) =>
      api(`/api/w/${workspace}/notifications`, "POST", { id }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["workspace", workspace, "notifications"],
      }),
  });
  return (
    <div className={s.contentPanel}>
      <div className={s.panelHeading}>
        <h2>
          Inbox <small>{data.data?.pages[0].unread ?? 0} unread</small>
        </h2>
        <button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          Mark all as read
        </button>
      </div>
      {(data.error ?? mutation.error) && (
        <p className={ui.error}>{(data.error ?? mutation.error)?.message}</p>
      )}
      {data.data?.pages
        .flatMap((p) => p.items)
        .map((n) => (
          <div
            key={n.id}
            className={`${s.notification} ${!n.read_at ? s.unread : ""}`}
          >
            <button
              onClick={() => {
                mutation.mutate(n.id);
                if (n.issue_id) onSelect(n.issue_id);
              }}
            >
              {n.title}
              <small>{new Date(n.created_at).toLocaleString()}</small>
            </button>
            {!n.read_at && (
              <button onClick={() => mutation.mutate(n.id)}>Mark read</button>
            )}
          </div>
        ))}
      {!data.isPending && !data.data?.pages[0].items.length && (
        <div className={ui.empty}>
          <h2>You’re all caught up.</h2>
          <p>Assignments, mentions, and team updates will appear here.</p>
        </div>
      )}
      {data.hasNextPage && (
        <button onClick={() => data.fetchNextPage()}>
          Older notifications
        </button>
      )}
    </div>
  );
}
