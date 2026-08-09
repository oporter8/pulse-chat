import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse Chat",
    short_name: "Pulse",
    description: "Realtime private messaging with DMs, groups, reactions, attachments, and profiles.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#7c5cff",
    orientation: "any",
    icons: [
      {
        src: "/icons/pulse-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pulse-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pulse-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
