"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Inbox,
  Layers,
  ChevronDown,
  Users,
  Settings,
  Activity as ActivityIcon,
  ArrowUpRight,
  LogOut,
  Orbit,
  FolderKanban,
} from "lucide-react";
import { api } from "@/lib/client";
import { can, type Workspace, type Project, type Status } from "@/lib/domain";
import s from "./workspace.module.scss";
type Props = {
  user: { name: string };
  workspace?: Workspace;
  workspaces: Workspace[];
  projects: Project[];
  wid: string;
  sidebar: boolean;
  section: string;
  project: string;
  unread: { data?: { unread: number } };
  navigate: (values: Record<string, string | null>) => void;
  setDialog: (value: "workspace" | "invite" | "project" | "settings") => void;
  setPalette: (open: boolean) => void;
  newIssue: (status?: Status) => void;
  setNotice: (text: string) => void;
};
export function WorkspaceSidebar({
  user,
  workspace,
  workspaces,
  projects,
  wid,
  sidebar,
  section,
  project,
  unread,
  navigate,
  setDialog,
  setPalette,
  newIssue,
  setNotice,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <aside className={`${s.sidebar} ${!sidebar ? s.collapsed : ""}`}>
      <div className={s.workspaceSwitcher}>
        <span className={s.workspaceLogo}>O</span>
        <select
          aria-label="Switch workspace"
          value={wid}
          onChange={(e) =>
            navigate({
              workspace: e.target.value,
              project: null,
              issue: null,
              q: null,
            })
          }
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button
          title="Create workspace"
          aria-label="Create workspace"
          onClick={() => setDialog("workspace")}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className={s.quickActions}>
        <button onClick={() => setPalette(true)}>
          <Search size={15} /> Search <kbd>⌘ K</kbd>
        </button>
        <button aria-label="New issue" onClick={() => newIssue()}>
          <Plus size={17} />
        </button>
      </div>
      <nav>
        <button
          className={section === "inbox" ? s.navActive : ""}
          onClick={() => navigate({ section: "inbox", issue: null })}
        >
          <Inbox size={17} />
          Inbox
          {unread.data?.unread ? (
            <span className={s.count}>{unread.data.unread}</span>
          ) : null}
        </button>
        <button
          className={section === "issues" && !project ? s.navActive : ""}
          onClick={() =>
            navigate({ section: "issues", project: null, issue: null })
          }
        >
          <Layers size={17} />
          All issues
        </button>
        <button
          className={section === "activity" ? s.navActive : ""}
          onClick={() => navigate({ section: "activity", issue: null })}
        >
          <ActivityIcon size={17} />
          Activity
        </button>
      </nav>
      <div className={s.navLabel}>
        Workspace
        <ChevronDown size={13} />
      </div>
      <nav>
        <button
          className={section === "projects" ? s.navActive : ""}
          onClick={() => navigate({ section: "projects", project: null })}
        >
          <FolderKanban size={17} />
          Projects
        </button>
        <button
          className={section === "members" ? s.navActive : ""}
          onClick={() => navigate({ section: "members" })}
        >
          <Users size={17} />
          People
        </button>
        {workspace && can(workspace.role, "manage") && (
          <button onClick={() => setDialog("settings")}>
            <Settings size={17} />
            Settings
          </button>
        )}
      </nav>
      <div className={s.navLabel}>
        Your projects
        {workspace && can(workspace.role, "manage") && (
          <button
            aria-label="Create project"
            onClick={() => setDialog("project")}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <nav>
        {projects
          ?.filter((p) => !p.archived)
          .map((p, i) => (
            <button
              key={p.id}
              className={project === p.id ? s.navActive : ""}
              onClick={() =>
                navigate({ project: p.id, section: "issues", issue: null })
              }
            >
              <span
                className={s.projectIcon}
                style={{
                  color: ["#bba2f4", "#78bfb1", "#d6ab7f", "#82a9e5"][i % 4],
                }}
              >
                ◈
              </span>
              {p.name}
            </button>
          ))}
      </nav>
      <div className={s.sidebarBottom}>
        <div className={s.tip}>
          <Orbit size={22} />
          <strong>A little less busywork.</strong>
          <p>A lot more building.</p>
          <button onClick={() => setPalette(true)}>
            Find your flow <ArrowUpRight size={13} />
          </button>
        </div>
        <button
          className={s.profile}
          onClick={async () => {
            try {
              await api("/api/auth/logout", "POST", {});
              queryClient.clear();
              router.push("/login");
              router.refresh();
            } catch (e) {
              setNotice((e as Error).message);
            }
          }}
        >
          <span className={s.avatar}>{user.name.slice(0, 2)}</span>
          <span>
            {user.name}
            <small>{workspace?.role ?? "Personal account"}</small>
          </span>
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
