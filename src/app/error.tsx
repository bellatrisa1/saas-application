"use client";
import s from "@/components/ui.module.scss";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={s.empty}>
      <h1>We couldn’t load your workspace.</h1>
      <p>Check the database connection and try again.</p>
      <button onClick={reset}>Try again</button>
      <p>
        <a href="/login">Return to sign in</a>
      </p>
    </main>
  );
}
