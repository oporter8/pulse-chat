import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "Pulse Chat",
  description: "Realtime messaging with DMs, groups, reactions, attachments, and profiles.",
  applicationName: "Pulse Chat",
  icons: {
    icon: "/icons/pulse-192.png",
    apple: "/icons/pulse-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pulse",
  },
  formatDetection: {
    telephone: false,
  },
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
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
