"use client";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Layers,
  ChevronRight,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Users,
  Settings,
  Activity as ActivityIcon,
  Command,
  Orbit,
  PanelLeftClose,
} from "lucide-react";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { api, useUI } from "@/lib/client";
import { can, type Project, type Status } from "@/lib/domain";
import { useWorkspaces, useWorkspaceData } from "./useWorkspace";
import { IssueList, Board } from "./IssueViews";
import {
  ManagementDialog,
  Members,
  Activity,
  Notifications,
} from "./Management";
import s from "./workspace.module.scss";
import ui from "./ui.module.scss";
const IssueDialog = dynamic(() =>
  import("./IssueDialog").then((m) => m.IssueDialog),
);
const CommandPalette = dynamic(() =>
  import("./CommandPalette").then((m) => m.CommandPalette),
);
type User = { id: string; name: string; email: string };
export function WorkspaceApp({ user }: { user: User }) {
  return (
    <Suspense fallback={<p>Loading workspace…</p>}>
      <App user={user} />
    </Suspense>
  );
}
function App({ user }: { user: User }) {
  const router = useRouter();
  const params = useSearchParams();
  const workspaces = useWorkspaces();
  const workspace =
    workspaces.data?.find((w) => w.id === params.get("workspace")) ??
    workspaces.data?.[0];
  const wid = workspace?.id ?? "";
  const { projects, connection } = useWorkspaceData(wid);
  const project = params.get("project") ?? "";
  const selectedProject = projects.data?.find((p) => p.id === project);
  const view = params.get("view") ?? "board";
  const section = params.get("section") ?? "issues";
  const query = params.get("q") ?? "";
  const issue = params.get("issue") ?? "";
  const [draft, setDraft] = useState(query);
  const [create, setCreate] = useState<Status | null>(null);
  const [dialog, setDialog] = useState<
    "workspace" | "invite" | "project" | "settings" | null
  >(null);
  const [editProject, setEditProject] = useState<Project>();
  const [sidebar, setSidebar] = useState(true);
  const [filter, setFilter] = useState(false);
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const palette = useUI((v) => v.palette);
  const theme = useUI((v) => v.theme);
  const setPalette = useUI((v) => v.setPalette);
  const toggleTheme = useUI((v) => v.toggleTheme);
  const unread = useQuery({
    queryKey: ["workspace", wid, "notification-count"],
    queryFn: () => api<{ unread: number }>(`/api/w/${wid}/notifications`),
    enabled: !!wid,
  });
  const navigate = useCallback(
    (values: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value) p.set(key, value);
        else p.delete(key);
      }
      router.push(`/?${p}`, { scroll: false });
    },
    [params, router],
  );
  const closeIssue = useCallback(() => {
    setCreate(null);
    if (issue) navigate({ issue: null });
  }, [issue, navigate]);
  const closeDialog = useCallback(() => {
    setDialog(null);
    setEditProject(undefined);
  }, []);
  const closePalette = useCallback(() => setPalette(false), [setPalette]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPalette(!useUI.getState().palette);
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setPalette]);
  function newIssue(status: Status = "todo") {
    if (!workspace || !can(workspace.role, "issue")) {
      setNotice("Your role has read-only access.");
      return;
    }
    if (!projects.data?.some((p) => !p.archived)) {
      setNotice("Create an active project before adding issues.");
      return;
    }
    setCreate(status);
  }
  function command(command: string, id?: string) {
    if (command === "theme") toggleTheme();
    if (command === "create") newIssue();
    if (command === "search") searchRef.current?.focus();
    if (command === "project")
      navigate({ project: id ?? null, section: "issues", issue: null });
    if (command === "invite") {
      if (workspace && can(workspace.role, "manage")) setDialog("invite");
      else setNotice("Only workspace owners and admins can invite members.");
    }
    if (command === "status" || command === "assign") {
      if (!issue)
        setNotice(
          "Open an issue first, then use its Status or Assignee field.",
        );
      else {
        setTimeout(
          () =>
            document
              .querySelector<HTMLSelectElement>(
                command === "status"
                  ? '[aria-label="Issue status"]'
                  : '[aria-label="Assignee"]',
              )
              ?.focus(),
          50,
        );
      }
    }
  }
  if (workspaces.isPending)
    return <div className={ui.empty}>◉ Loading Orbit…</div>;
  if (workspaces.error)
    return (
      <div className={ui.empty}>
        <h2>Workspace unavailable</h2>
        <p>{workspaces.error.message}</p>
        <button onClick={() => workspaces.refetch()}>Retry</button>
        <a href="/login"> Sign in</a>
      </div>
    );
  return (
    <div className={`${s.app} ${theme === "light" ? s.light : ""}`}>
      <WorkspaceSidebar
        user={user}
        workspace={workspace}
        workspaces={workspaces.data ?? []}
        projects={projects.data ?? []}
        wid={wid}
        sidebar={sidebar}
        onClose={() => setSidebar(false)}
        section={section}
        project={project}
        unread={unread}
        navigate={navigate}
        setDialog={setDialog}
        setPalette={setPalette}
        newIssue={newIssue}
        setNotice={setNotice}
      />

      <main className={s.main}>
        <header className={s.topbar}>
          <button
            aria-label="Toggle sidebar"
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeftClose size={17} />
          </button>
          <span>{workspace?.name ?? "Your workspace"}</span>
          <ChevronRight size={13} />
          <strong>
            {selectedProject?.name ??
              (section === "issues"
                ? "All issues"
                : section[0].toUpperCase() + section.slice(1))}
          </strong>
          <div className={s.topRight}>
            <span className={s.live}>
              <i className={connection === "Live" ? s.online : ""} />
              {connection}
            </span>
            <button
              title="Command menu"
              aria-label="Open command menu"
              onClick={() => setPalette(true)}
            >
              <Command size={16} />
            </button>
          </div>
        </header>
        {!workspace ? (
          <div className={ui.empty}>
            <Orbit size={40} />
            <h1>Your next great project starts here.</h1>
            <p>Create a workspace to bring your team and ideas together.</p>
            <button
              className={ui.primary}
              onClick={() => setDialog("workspace")}
            >
              Create workspace
            </button>
          </div>
        ) : (
          <>
            <div className={s.pageHeading}>
              <div className={s.eyebrow}>
                WORKSPACE / {selectedProject ? "PROJECT" : "OVERVIEW"}
              </div>
              <div className={s.titleLine}>
                <div>
                  <h1>
                    {selectedProject?.name ??
                      (section === "issues"
                        ? "All issues"
                        : section === "inbox"
                          ? "Your inbox"
                          : section === "members"
                            ? "Your team"
                            : section === "activity"
                              ? "Activity"
                              : "Projects")}
                    <span className={s.badge}>
                      {selectedProject?.key ?? "Workspace"}
                    </span>
                  </h1>
                  <p>
                    {selectedProject?.description ||
                      "A clear view of what’s happening. A little closer to what’s next."}
                  </p>
                </div>
                {can(workspace.role, "issue") && (
                  <button className={ui.primary} onClick={() => newIssue()}>
                    <Plus size={16} /> Create issue
                  </button>
                )}
              </div>
              <div className={s.tabs}>
                <button
                  className={section === "issues" ? s.tabActive : ""}
                  onClick={() => navigate({ section: "issues" })}
                >
                  <Layers size={15} />
                  Issues
                </button>
                <button
                  className={section === "activity" ? s.tabActive : ""}
                  onClick={() => navigate({ section: "activity" })}
                >
                  <ActivityIcon size={15} />
                  Activity
                </button>
                {selectedProject && (
                  <>
                    <button onClick={() => navigate({ section: "members" })}>
                      <Users size={15} />
                      Members
                    </button>
                    {can(workspace.role, "manage") && (
                      <button
                        onClick={() => {
                          setEditProject(selectedProject);
                          setDialog("project");
                        }}
                      >
                        <Settings size={15} />
                        Settings
                      </button>
                    )}
                  </>
                )}
                <span className={s.tabsRight}>
                  Built for moving things forward <span>↗</span>
                </span>
              </div>
            </div>
            {notice && (
              <div className={s.notice} role="status">
                {notice}
                <button onClick={() => setNotice("")}>Dismiss</button>
              </div>
            )}
            {projects.error && (
              <div className={ui.error}>{projects.error.message}</div>
            )}
            {section === "issues" && (
              <>
                <div className={s.toolbar}>
                  <form
                    className={s.search}
                    onSubmit={(e) => {
                      e.preventDefault();
                      navigate({ q: searchRef.current?.value ?? draft });
                    }}
                  >
                    <Search size={15} />
                    <input
                      key={query}
                      ref={searchRef}
                      aria-label="Search issues"
                      placeholder="Search issues or add filters…"
                      defaultValue={query}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <kbd>↵</kbd>
                  </form>
                  <button
                    className={s.filterButton}
                    onClick={() => setFilter(!filter)}
                  >
                    <SlidersHorizontal size={14} />
                    Filters{query && <span className={s.filterDot} />}
                  </button>
                  <div className={s.viewToggle}>
                    <button
                      aria-label="List view"
                      className={view === "list" ? s.viewActive : ""}
                      onClick={() => navigate({ view: "list" })}
                    >
                      <List size={16} />
                    </button>
                    <button
                      aria-label="Board view"
                      className={view === "board" ? s.viewActive : ""}
                      onClick={() => navigate({ view: "board" })}
                    >
                      <LayoutGrid size={15} />
                    </button>
                  </div>
                </div>
                {filter && (
                  <div className={s.filters}>
                    <small>Filter syntax:</small>
                    {[
                      "status:in-progress",
                      "priority:high",
                      "assignee:anna",
                      "label:frontend",
                      "due:<2026-10-01",
                    ].map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setDraft(f);
                          navigate({ q: f });
                        }}
                      >
                        {f}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setDraft("");
                        navigate({ q: null });
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                {view === "list" ? (
                  <IssueList
                    workspace={wid}
                    project={project}
                    query={query}
                    onSelect={(id) => navigate({ issue: id })}
                    onCreate={newIssue}
                    editable={can(workspace.role, "issue")}
                  />
                ) : (
                  <Board
                    workspace={wid}
                    project={project}
                    query={query}
                    onSelect={(id) => navigate({ issue: id })}
                    onCreate={newIssue}
                    editable={can(workspace.role, "issue")}
                  />
                )}
              </>
            )}
            {section === "members" && (
              <Members workspace={workspace} project={selectedProject} />
            )}
            {section === "activity" && (
              <Activity workspace={wid} project={project} />
            )}
            {section === "inbox" && (
              <Notifications
                workspace={wid}
                onSelect={(id) => navigate({ issue: id })}
              />
            )}
            {section === "projects" && (
              <div className={s.contentPanel}>
                <div className={s.panelHeading}>
                  <h2>Projects</h2>
                  {can(workspace.role, "manage") && (
                    <button
                      className={ui.primary}
                      onClick={() => setDialog("project")}
                    >
                      Create project
                    </button>
                  )}
                </div>
                <div className={s.projectGrid}>
                  {projects.data?.map((p) => (
                    <article key={p.id}>
                      <div className={s.projectCardTop}>
                        <span>◈</span>
                        <small>
                          {p.key} {p.archived ? "· Archived" : "· Active"}
                        </small>
                      </div>
                      <button
                        onClick={() =>
                          navigate({ project: p.id, section: "issues" })
                        }
                      >
                        <h3>{p.name}</h3>
                      </button>
                      <p>
                        {p.description || "Give this project a little context."}
                      </p>
                      {can(workspace.role, "manage") && (
                        <button
                          onClick={() => {
                            setEditProject(p);
                            setDialog("project");
                          }}
                        >
                          Project settings ↗
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                {!projects.data?.length && (
                  <div className={ui.empty}>
                    <h2>A blank canvas for your team.</h2>
                    <p>Create your first project to get started.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <footer className={s.pageFooter}>
          <span>
            <Orbit size={12} /> orbit
          </span>
          <span>Make space for meaningful work.</span>
          <button onClick={() => setPalette(true)}>
            Keyboard shortcuts <kbd>⌘ K</kbd>
          </button>
        </footer>
      </main>
      {dialog && (
        <ManagementDialog
          kind={dialog}
          workspace={workspace}
          project={editProject}
          onClose={closeDialog}
          onCreated={(id) => {
            if (dialog === "workspace")
              navigate({ workspace: id, project: null });
            else navigate({ project: id, section: "issues" });
          }}
        />
      )}
      {(create || issue) && workspace && (
        <IssueDialog
          key={issue || "create"}
          workspace={wid}
          id={issue || undefined}
          projects={projects.data ?? []}
          initialStatus={create ?? "todo"}
          project={project || projects.data?.find((p) => !p.archived)?.id || ""}
          onClose={closeIssue}
          editable={can(workspace.role, "issue")}
        />
      )}
      {palette && (
        <CommandPalette
          projects={projects.data ?? []}
          onClose={closePalette}
          onCommand={command}
        />
      )}
    </div>
  );
}
