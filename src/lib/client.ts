"use client";
import { create } from "zustand";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      data instanceof FormData
        ? undefined
        : data !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      data instanceof FormData
        ? data
        : data !== undefined
          ? JSON.stringify(data)
          : undefined,
  });
  if (!response.ok) {
    const value = await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status})` }));
    const fields = value.details?.fieldErrors as
      Record<string, string[]> | undefined;
    const fieldMessage = fields
      ? Object.entries(fields)
          .map(([field, errors]) => `${field}: ${errors.join(", ")}`)
          .join("; ")
      : "";
    throw new ApiError(
      response.status,
      fieldMessage || value.error || "Request failed",
    );
  }
  return response.json() as Promise<T>;
}
export const useUI = create<{
  palette: boolean;
  theme: "dark" | "light";
  setPalette: (open: boolean) => void;
  toggleTheme: () => void;
}>((set) => ({
  palette: false,
  theme: "dark",
  setPalette: (palette) => set({ palette }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
}));
