"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import s from "./ui.module.scss";
export function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <main className={s.auth}>
      <section>
        <div className={s.brand}>◉ orbit</div>
        <h1>You’re invited.</h1>
        <p>Join your team’s workspace using the invited email address.</p>
        {error && (
          <div role="alert" className={s.error}>
            {error}
          </div>
        )}
        <button
          disabled={pending}
          className={s.primary}
          onClick={async () => {
            setPending(true);
            try {
              const result = await api<{ workspaceId: string }>(
                "/api/invitations",
                "POST",
                { token },
              );
              router.push(`/?workspace=${result.workspaceId}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          Accept invitation
        </button>
        <p>
          <a href="/login">Sign in</a> or{" "}
          <a href="/register">create an account</a>, then return to this
          invitation link.
        </p>
      </section>
    </main>
  );
}
