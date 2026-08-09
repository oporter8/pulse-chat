import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v11.css";
import "./v12.css";
import { PwaRegister } from "./pwa-register";
import { TigerNav } from "@/components/v11/TigerNav";
import { TigerThemeProvider } from "@/components/v11/TigerThemeProvider";
import { NoImageGuard } from "@/components/v11/NoImageGuard";
import { ScheduledMessageRunner } from "@/components/v11/ScheduledMessageRunner";

export const metadata: Metadata = {
  title: "Tiger Chat",
  description: "Text and audio messaging with DMs, groups, community tools, reactions, polls, events, and supporter perks.",
  applicationName: "Tiger Chat",
  icons: { icon: "/icons/pulse-192.png", apple: "/icons/pulse-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Tiger" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090b10" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    {children}
    <TigerThemeProvider />
    <NoImageGuard />
    <ScheduledMessageRunner />
    <TigerNav />
    <PwaRegister />
  </body></html>;
}
