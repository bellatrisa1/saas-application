"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import s from "./ui.module.scss";
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <main className={s.auth}>
      <section>
        <div className={s.brand}>◉ orbit</div>
        <h1>{register ? "Make room for great work." : "Welcome back."}</h1>
        <p>
          {register
            ? "A little less process. A lot more progress."
            : "Sign in to your team’s workspace."}
        </p>
        <form
          className={s.form}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setPending(true);
            const data = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await api(
                `/api/auth/${register ? "register" : "login"}`,
                "POST",
                data,
              );
              router.push("/");
              router.refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          {register && (
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                placeholder="Bella Samankieva"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="At least 12 characters"
            />
          </label>
          {error && (
            <div role="alert" className={s.error}>
              {error}
            </div>
          )}
          <button className={s.primary} disabled={pending}>
            {pending ? "Please wait…" : register ? "Create account" : "Sign in"}
          </button>
        </form>
        <footer>
          {register ? "Already have an account?" : "New to Orbit?"}{" "}
          <Link href={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </footer>
      </section>
    </main>
  );
}
