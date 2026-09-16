"use client";
import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  useMutation,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { api } from "@/lib/client";
import {
  statuses,
  priorities,
  type Issue,
  type Project,
  type Member,
  type Status,
} from "@/lib/domain";
import { Modal } from "./Modal";
import { statusNames } from "./IssueViews";
import ui from "./ui.module.scss";
import s from "./workspace.module.scss";
export function MemberSelect({
  workspace,
  defaultValue = "",
  name = "assigneeId",
}: {
  workspace: string;
  defaultValue?: string;
  name?: string;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(defaultValue);
  const [selectedName, setSelectedName] = useState("Current assignee");
  const members = useQuery({
    queryKey: ["workspace", workspace, "members", search],
    queryFn: () =>
      api<Member[]>(
        `/api/w/${workspace}/members?q=${encodeURIComponent(search)}`,
      ),
  });
  return (
    <label>
      Assignee
      <input
        aria-label="Search members"
        placeholder="Search members…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        aria-label="Assignee"
        name={name}
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setSelectedName(
            e.target.selectedOptions[0]?.text ?? "Current assignee",
          );
        }}
      >
        <option value="">Unassigned</option>
        {selected && !members.data?.some((m) => m.user_id === selected) && (
          <option value={selected}>{selectedName}</option>
        )}
        {members.data?.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))}
      </select>
      {members.error && <span role="alert">{members.error.message}</span>}
    </label>
  );
}
export function IssueDialog({
  workspace,
  id,
  projects,
  onClose,
  editable,
  initialStatus = "todo",
  project,
}: {
  workspace: string;
  id?: string;
  projects: Project[];
  onClose: () => void;
  editable: boolean;
  initialStatus?: Status;
  project: string;
}) {
  const client = useQueryClient();
  const issue = useQuery({
    queryKey: ["workspace", workspace, "issue", id],
    queryFn: () => api<Issue>(`/api/w/${workspace}/issues/${id}`),
    enabled: !!id,
  });
  // Keep an editing snapshot: remote updates must not erase a user's draft.
  const [draftIssue, setDraftIssue] = useState<Issue | null>(null);
  if (issue.data && !draftIssue) setDraftIssue(issue.data);
  const initial = draftIssue ?? issue.data;
  const save = useMutation({
    mutationFn: (data: unknown) =>
      api<Issue>(
        `/api/w/${workspace}/issues${id ? `/${id}` : ""}`,
        id ? "PATCH" : "POST",
        data,
      ),
    onSuccess: async (saved) => {
      setDraftIssue(saved);
      await client.invalidateQueries({ queryKey: ["workspace", workspace] });
      if (!id) onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/w/${workspace}/issues/${id}`, "DELETE", {
        version: initial?.version,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["workspace", workspace] });
      onClose();
    },
  });
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal
      title={
        id
          ? `${issue.data?.project_key ?? "Issue"}-${issue.data?.number ?? "…"}`
          : "Create issue"
      }
      onClose={onClose}
    >
      {id && issue.isPending ? (
        <p>Loading issue…</p>
      ) : issue.error ? (
        <div className={ui.error}>{issue.error.message}</div>
      ) : (
        <>
          <form
            key={initial?.version ?? "new"}
            className={ui.form}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save.mutate({
                title: f.get("title"),
                description: f.get("description"),
                projectId: f.get("projectId"),
                status: f.get("status"),
                priority: f.get("priority"),
                assigneeId: f.get("assigneeId") || null,
                dueDate: f.get("dueDate") || null,
                labels: String(f.get("labels") ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                ...(id ? { version: initial?.version } : {}),
              });
            }}
          >
            <label>
              Title
              <input
                name="title"
                aria-label="Issue title"
                required
                maxLength={240}
                placeholder="What needs to be done?"
                defaultValue={initial?.title}
                readOnly={!editable}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                placeholder="Add details, context, or acceptance criteria…"
                defaultValue={initial?.description}
                readOnly={!editable}
              />
            </label>
            <div className={ui.row}>
              <label>
                Project
                <select
                  name="projectId"
                  defaultValue={
                    initial?.project_id ?? project ?? projects[0]?.id
                  }
                >
                  {projects
                    .filter((p) => !p.archived || p.id === initial?.project_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Status
                <select
                  name="status"
                  aria-label="Issue status"
                  defaultValue={initial?.status ?? initialStatus}
                >
                  {statuses.map((st) => (
                    <option value={st} key={st}>
                      {statusNames[st]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={ui.row}>
              <label>
                Priority
                <select
                  name="priority"
                  defaultValue={initial?.priority ?? "medium"}
                >
                  {priorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  name="dueDate"
                  type="date"
                  defaultValue={initial?.due_date?.slice(0, 10)}
                />
              </label>
            </div>
            <MemberSelect
              workspace={workspace}
              defaultValue={initial?.assignee_id ?? ""}
            />
            <label>
              Labels <small>Separate with commas</small>
              <input
                name="labels"
                placeholder="frontend, design"
                defaultValue={initial?.labels.join(", ")}
              />
            </label>
            {initial && <small>Reported by {initial.reporter_name}</small>}
            {save.error && (
              <p role="alert" className={ui.error}>
                {save.error.message}
              </p>
            )}
            {remove.error && (
              <p role="alert" className={ui.error}>
                {remove.error.message}
              </p>
            )}
            {editable && (
              <footer>
                {id && (
                  <button
                    type="button"
                    onClick={() =>
                      confirm ? remove.mutate() : setConfirm(true)
                    }
                    disabled={remove.isPending}
                  >
                    {confirm ? "Confirm deletion" : "Delete issue"}
                  </button>
                )}
                <button
                  className={ui.primary}
                  disabled={save.isPending || !projects.length}
                >
                  {save.isPending
                    ? "Saving…"
                    : id
                      ? "Save changes"
                      : "Create issue"}
                </button>
              </footer>
            )}
          </form>
          {id && (
            <IssueDiscussion
              workspace={workspace}
              id={id}
              editable={editable}
            />
          )}
        </>
      )}
    </Modal>
  );
}
function IssueDiscussion({
  workspace,
  id,
  editable,
}: {
  workspace: string;
  id: string;
  editable: boolean;
}) {
  const client = useQueryClient();
  const base = `/api/w/${workspace}/issues/${id}`;
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const comments = useInfiniteQuery({
    queryKey: ["workspace", workspace, "comments", id],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<
        { id: string; body: string; created_at: string; author_name: string }[]
      >(`${base}/comments?cursor=${encodeURIComponent(pageParam)}`),
    getNextPageParam: (last) =>
      last.length === 50
        ? `${last.at(-1)!.created_at}|${last.at(-1)!.id}`
        : undefined,
  });
  const attachments = useQuery({
    queryKey: ["workspace", workspace, "attachments", id],
    queryFn: () =>
      api<{ id: string; name: string; size: number }[]>(`${base}/attachments`),
  });
  const watcher = useQuery({
    queryKey: ["workspace", workspace, "watchers", id],
    queryFn: () => api<{ watching: boolean }>(`${base}/watchers`),
  });
  async function perform(fn: () => Promise<unknown>) {
    setError("");
    setPending(true);
    try {
      await fn();
      await client.invalidateQueries({ queryKey: ["workspace", workspace] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={s.discussion}>
      <header>
        <h3>Activity & comments</h3>
        <button
          disabled={pending}
          onClick={() =>
            perform(() =>
              api(`${base}/watchers`, "POST", {
                watching: !watcher.data?.watching,
              }),
            )
          }
        >
          {watcher.data?.watching ? "Unwatch" : "Watch issue"}
        </button>
      </header>
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      {comments.error && <p className={ui.error}>{comments.error.message}</p>}
      {editable && (
        <form
          className={ui.form}
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await api(`${base}/comments`, "POST", { body: text });
              setText("");
            });
          }}
        >
          <textarea
            aria-label="Comment"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Leave a comment. Mention @email@example.com"
            required
            maxLength={10000}
          />
          <button disabled={pending}>Post comment</button>
        </form>
      )}
      {comments.data?.pages.flat().map((c) => (
        <article className={s.comment} key={c.id}>
          <strong>{c.author_name}</strong>
          <small>{new Date(c.created_at).toLocaleString()}</small>
          <p>{c.body}</p>
        </article>
      ))}
      {comments.hasNextPage && (
        <button onClick={() => comments.fetchNextPage()}>Older comments</button>
      )}
      <h3>Attachments</h3>
      {attachments.error && (
        <p className={ui.error}>{attachments.error.message}</p>
      )}
      {attachments.data?.map((f) => (
        <a
          className={s.attachment}
          key={f.id}
          href={`/api/w/${workspace}/attachments?id=${f.id}`}
        >
          {f.name} <small>{Math.ceil(f.size / 1024)} KB ↗</small>
        </a>
      ))}
      {editable && (
        <label>
          Attach a file <small>5 MB maximum</small>
          <input
            type="file"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.set("issueId", id);
              data.set("file", file);
              void perform(() =>
                api(`/api/w/${workspace}/attachments`, "POST", data),
              );
            }}
          />
        </label>
      )}
    </section>
  );
}
