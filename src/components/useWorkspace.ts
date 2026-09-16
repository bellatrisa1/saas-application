"use client";
import { useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api } from "@/lib/client";
import type { Issue, Project, Workspace } from "@/lib/domain";
export type IssuePage = { items: Issue[]; next: string | null };
export function useWorkspaceData(workspace: string) {
  const client = useQueryClient();
  const [connection, setConnection] = useState("Connecting");
  const projects = useQuery({
    queryKey: ["workspace", workspace, "projects"],
    queryFn: () => api<Project[]>(`/api/w/${workspace}/projects`),
    enabled: !!workspace,
  });
  useEffect(() => {
    if (!workspace) return;
    const stream = new EventSource(`/api/w/${workspace}/events`);
    const refresh = () => {
      setConnection("Live");
      void client.invalidateQueries({ queryKey: ["workspace", workspace] });
      void client.invalidateQueries({ queryKey: ["workspaces"] });
    };
    stream.addEventListener("ready", refresh);
    let timer: ReturnType<typeof setTimeout>;
    stream.addEventListener("change", () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 100);
    });
    stream.addEventListener("revoked", () => {
      stream.close();
      client.removeQueries({ queryKey: ["workspace", workspace] });
      void client.invalidateQueries({ queryKey: ["workspaces"] });
      setConnection("Access expired");
    });
    stream.onerror = () => setConnection("Reconnecting");
    return () => {
      clearTimeout(timer);
      stream.close();
    };
  }, [workspace, client]);
  return { projects, connection };
}
export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<Workspace[]>("/api/workspaces"),
  });
}
export function useIssueMutation(workspace: string) {
  const client = useQueryClient();
  return useMutation({
    scope: { id: `issue-update-${workspace}` },
    mutationFn: ({ issue, patch }: { issue: Issue; patch: Partial<Issue> }) =>
      api<Issue>(`/api/w/${workspace}/issues/${issue.id}`, "PATCH", {
        ...patch,
        assigneeId: patch.assignee_id,
        version: issue.version,
      }),
    onMutate: async ({ issue, patch }) => {
      await client.cancelQueries({
        queryKey: ["workspace", workspace, "issues"],
      });
      const snapshots = client.getQueriesData<InfiniteData<IssuePage>>({
        queryKey: ["workspace", workspace, "issues"],
      });
      for (const [key, old] of snapshots) {
        if (!old) continue;
        const lane = key.at(-1);
        const updated = { ...issue, ...patch };
        client.setQueryData<InfiniteData<IssuePage>>(key, {
          ...old,
          pages: old.pages.map((page, index) => ({
            ...page,
            items:
              lane === "all"
                ? page.items.map((item) =>
                    item.id === issue.id ? updated : item,
                  )
                : [
                    ...(index === 0 && lane === updated.status
                      ? [updated]
                      : []),
                    ...page.items.filter((item) => item.id !== issue.id),
                  ],
          })),
        });
      }
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) =>
        client.setQueryData(key, data),
      );
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: ["workspace", workspace] }),
  });
}
