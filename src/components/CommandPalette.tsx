"use client";
import { useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import type { Project } from "@/lib/domain";
import { Modal } from "./Modal";
import s from "./workspace.module.scss";
export function CommandPalette({
  projects,
  onClose,
  onCommand,
}: {
  projects: Project[];
  onClose: () => void;
  onCommand: (command: string, id?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [index, setIndex] = useState(0);
  const commands = [
    { id: "create", label: "Create issue", hint: "C" },
    { id: "search", label: "Search issues", hint: "/" },
    { id: "status", label: "Change selected issue status", hint: "↵" },
    { id: "assign", label: "Assign selected issue", hint: "↵" },
    { id: "theme", label: "Toggle theme", hint: "◐" },
    { id: "invite", label: "Invite member", hint: "+" },
    ...projects.map((p) => ({
      id: `project:${p.id}`,
      label: `Go to ${p.name}`,
      hint: "↗",
    })),
  ].filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
  function run(id: string) {
    const [command, value] = id.split(":");
    onCommand(command, value);
    onClose();
  }
  return (
    <Modal title="Command menu" onClose={onClose}>
      <div
        className={s.palette}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => (i + 1) % Math.max(1, commands.length));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex(
              (i) => (i - 1 + commands.length) % Math.max(1, commands.length),
            );
          }
          if (e.key === "Enter" && commands[index]) {
            e.preventDefault();
            run(commands[index].id);
          }
        }}
      >
        <label className={s.commandSearch}>
          <Search size={18} />
          <input
            autoFocus
            aria-label="Search commands"
            placeholder="What would you like to do?"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIndex(0);
            }}
          />
        </label>
        <small>WORKSPACE COMMANDS</small>
        <div role="listbox" aria-label="Commands">
          {commands.map((c, i) => (
            <button
              role="option"
              aria-selected={i === index}
              key={c.id}
              className={i === index ? s.selected : ""}
              onClick={() => run(c.id)}
            >
              <ArrowUpRight size={15} />
              {c.label}
              <kbd>{c.hint}</kbd>
            </button>
          ))}
        </div>
        {!commands.length && <p>No matching commands</p>}
        <footer>
          <span>↑ ↓ to navigate</span>
          <span>↵ to select</span>
          <span>esc to close</span>
        </footer>
      </div>
    </Modal>
  );
}
