"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Circle,
  CheckCircle2,
  Timer,
  Signal,
  MessageSquare,
  Plus,
  CalendarDays,
} from "lucide-react";
import { api } from "@/lib/client";
import { statuses, type Issue, type Status } from "@/lib/domain";
import { useIssueMutation, type IssuePage } from "./useWorkspace";
import s from "./workspace.module.scss";
import ui from "./ui.module.scss";
export const statusNames: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  "in-review": "In review",
  done: "Done",
};
export function StatusIcon({ status }: { status: Status }) {
  return status === "done" ? (
    <CheckCircle2 size={15} className={s.done} />
  ) : status === "in-progress" ? (
    <Timer size={15} className={s.progress} />
  ) : (
    <Circle size={15} className={status === "in-review" ? s.review : s.muted} />
  );
}
function useIssues(
  workspace: string,
  query: string,
  project: string,
  status?: Status,
) {
  return useInfiniteQuery({
    queryKey: [
      "workspace",
      workspace,
      "issues",
      query,
      project,
      status ?? "all",
    ],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ q: query });
      if (project) p.set("project", project);
      if (status) p.set("status", status);
      if (pageParam) p.set("cursor", pageParam);
      return api<IssuePage>(`/api/w/${workspace}/issues?${p}`);
    },
    getNextPageParam: (last) => last.next ?? undefined,
    maxPages: 5,
  });
}
type Props = {
  workspace: string;
  query: string;
  project: string;
  onSelect: (id: string) => void;
  onCreate: (status?: Status) => void;
  editable: boolean;
};
function Card({
  issue,
  onSelect,
  editable,
}: {
  issue: Issue;
  onSelect: (id: string) => void;
  editable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: issue.id, data: { issue }, disabled: !editable });
  return (
    <article
      ref={setNodeRef}
      className={`${s.card} ${isDragging ? s.dragging : ""}`}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px,${transform.y}px,0)`,
              zIndex: 20,
            }
          : undefined
      }
    >
      <div className={s.cardTop}>
        <span>
          {issue.project_key}-{issue.number}
        </span>
        <button
          {...listeners}
          {...attributes}
          className={s.dragHandle}
          aria-label={`Drag ${issue.title}`}
        >
          ⠿
        </button>
      </div>
      <button className={s.cardTitle} onClick={() => onSelect(issue.id)}>
        {issue.title}
      </button>
      <div className={s.tags}>
        {issue.labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <footer>
        <span
          className={`${s.priority} ${s[issue.priority]}`}
          title={`${issue.priority} priority`}
        >
          <Signal size={14} />
          {issue.priority === "urgent" ? "Urgent" : ""}
        </span>
        {issue.due_date && (
          <span title="Due date">
            <CalendarDays size={12} />
            {new Date(issue.due_date).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
        <span className={s.avatar} title={issue.assignee_name ?? "Unassigned"}>
          {issue.assignee_name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2) ?? "–"}
        </span>
      </footer>
    </article>
  );
}
function Lane({ status, ...props }: Props & { status: Status }) {
  const result = useIssues(props.workspace, props.query, props.project, status);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const items = result.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section
      ref={setNodeRef}
      className={`${s.lane} ${isOver ? s.dropOver : ""}`}
      aria-label={`${statusNames[status]} column`}
    >
      <header>
        <StatusIcon status={status} />
        <strong>{statusNames[status]}</strong>
        <span>
          {items.length}
          {result.hasNextPage ? "+" : ""}
        </span>
        {props.editable && (
          <button
            aria-label={`Add ${statusNames[status]} issue`}
            onClick={() => props.onCreate(status)}
          >
            <Plus size={15} />
          </button>
        )}
      </header>
      {result.isPending && <p className={s.loading}>Loading issues…</p>}
      {result.error && (
        <p className={ui.error}>
          {result.error.message}
          <button onClick={() => result.refetch()}>Retry</button>
        </p>
      )}
      {items.map((issue) => (
        <Card
          key={issue.id}
          issue={issue}
          onSelect={props.onSelect}
          editable={props.editable}
        />
      ))}
      {!result.isPending && !items.length && (
        <div className={s.laneEmpty}>No issues here</div>
      )}
      {result.hasNextPage && (
        <button
          onClick={() => result.fetchNextPage()}
          disabled={result.isFetchingNextPage}
        >
          Load more
        </button>
      )}
    </section>
  );
}
export function Board(props: Props) {
  const mutation = useIssueMutation(
    props.workspace,
    props.query,
    props.project,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  function drop(event: DragEndEvent) {
    if (!event.over) return;
    const status = event.over.id as Status;
    const issue = event.active.data.current?.issue as Issue | undefined;
    if (issue && statuses.includes(status) && status !== issue.status)
      mutation.mutate({ issue, patch: { status } });
  }
  return (
    <>
      {mutation.error && (
        <div className={ui.error} role="alert">
          {mutation.error.message}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={drop}>
        <div className={s.board}>
          {statuses.map((status) => (
            <Lane
              key={status}
              status={status}
              {...props}
              editable={props.editable && !mutation.isPending}
            />
          ))}
        </div>
      </DndContext>
    </>
  );
}
export function IssueList(props: Props) {
  const result = useIssues(props.workspace, props.query, props.project);
  const [group, setGroup] = useState(true);
  const items = result.data?.pages.flatMap((p) => p.items) ?? [];
  if (result.isPending) return <div className={ui.empty}>Loading issues…</div>;
  if (result.error)
    return (
      <div role="alert" className={ui.error}>
        {result.error.message}
        <button onClick={() => result.refetch()}>Retry</button>
      </div>
    );
  if (!items.length)
    return (
      <div className={ui.empty}>
        <MessageSquare size={30} />
        <h2>No issues found</h2>
        <p>Try a different filter or create your first issue.</p>
        {props.editable && (
          <button onClick={() => props.onCreate()} className={ui.primary}>
            Create issue
          </button>
        )}
      </div>
    );
  return (
    <div className={s.list}>
      <div className={s.listHeading}>
        <span>Issue</span>
        <button onClick={() => setGroup(!group)}>
          {group ? "Grouped by status" : "Ungrouped"}
        </button>
      </div>
      {(group ? statuses : (["all"] as const)).map((status) => {
        const rows = group ? items.filter((i) => i.status === status) : items;
        if (!rows.length) return null;
        return (
          <section key={status}>
            {status !== "all" && (
              <header className={s.groupHeader}>
                <StatusIcon status={status} />
                {statusNames[status]}
                <span>{rows.length}</span>
              </header>
            )}
            {rows.map((issue) => (
              <button
                className={s.issueRow}
                key={issue.id}
                onClick={() => props.onSelect(issue.id)}
              >
                <span className={`${s.priority} ${s[issue.priority]}`}>
                  <Signal size={15} />
                </span>
                <span className={s.issueKey}>
                  {issue.project_key}-{issue.number}
                </span>
                <StatusIcon status={issue.status} />
                <strong>{issue.title}</strong>
                <span className={s.tags}>
                  {issue.labels.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </span>
                <span className={s.rowProject}>{issue.project_name}</span>
                <span
                  className={s.avatar}
                  title={issue.assignee_name ?? "Unassigned"}
                >
                  {issue.assignee_name?.slice(0, 2) ?? "–"}
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {result.hasNextPage && (
        <button
          className={s.loadMore}
          onClick={() => result.fetchNextPage()}
          disabled={result.isFetchingNextPage}
        >
          {result.isFetchingNextPage ? "Loading…" : "Load next 50 issues"}
        </button>
      )}
    </div>
  );
}
