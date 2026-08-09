"use client";

import { useEffect } from "react";

const blocked = (file: File) => file.type.startsWith("image/") || file.type.startsWith("video/");

export function NoImageGuard() {
  useEffect(() => {
    function change(event: Event) {
      const input = event.target as HTMLInputElement | null;
      if (!input || input.type !== "file") return;
      const files = Array.from(input.files ?? []);
      if (!files.some(blocked)) return;
      input.value = "";
      event.stopPropagation();
      window.alert("Tiger Chat is text/audio only. Images and videos cannot be uploaded.");
    }

    function drop(event: DragEvent) {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.some(blocked)) return;
      event.preventDefault();
      event.stopPropagation();
      window.alert("Images and videos are disabled on Tiger Chat.");
    }

    function paste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.some(blocked)) return;
      event.preventDefault();
      event.stopPropagation();
      window.alert("Image pasting is disabled on Tiger Chat.");
    }

    const observer = new MutationObserver(() => {
      document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
        if (input.accept.includes("image/") || input.accept.includes("video/")) {
          input.accept = "audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav,text/plain,text/csv,application/pdf,application/json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
        }
      });
    });

    document.addEventListener("change", change, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("paste", paste, true);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("change", change, true);
      document.removeEventListener("drop", drop, true);
      document.removeEventListener("paste", paste, true);
      observer.disconnect();
    };
  }, []);
  return null;
}
