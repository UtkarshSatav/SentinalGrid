import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "SentinelGrid · SOC Console",
  description: "National Cyber Defense Platform — operator console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </body>
    </html>
  );
}
