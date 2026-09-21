import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "IronClaw Fleet Dashboard",
  description: "Sovereign agent fleet console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <Providers>
          <Topbar />
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: "auto", background: "var(--bg-base)" }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}