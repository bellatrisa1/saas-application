import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.scss";
export const metadata: Metadata = {
  title: "Orbit · Project management",
  description: "A focused workspace for teams building what comes next.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
