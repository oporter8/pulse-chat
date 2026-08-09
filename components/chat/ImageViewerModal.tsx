"use client";

import { useEffect, useRef, useState } from "react";

type ViewerImage = { src: string; name: string };
type Props = { open: boolean; images: ViewerImage[]; initialIndex: number; onClose: () => void };

export function ImageViewerModal({ open, images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1))));
    setZoom(1);
  }, [images.length, initialIndex, open]);

  useEffect(() => {
    if (!open) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") { setIndex((value) => Math.max(0, value - 1)); setZoom(1); }
      if (event.key === "ArrowRight") { setIndex((value) => Math.min(images.length - 1, value + 1)); setZoom(1); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [images.length, onClose, open]);

  if (!open || images.length === 0) return null;
  const current = images[index] ?? images[0];

  function move(delta: number) {
    setIndex((value) => Math.max(0, Math.min(images.length - 1, value + delta)));
    setZoom(1);
  }

  return (
    <div className="image-viewer-backdrop-v8" role="dialog" aria-modal="true">
      <div className="image-viewer-toolbar-v8">
        <span><strong>{current.name}</strong>{images.length > 1 && <small>{index + 1} / {images.length}</small>}</span>
        <span>
          <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.25))} aria-label="Zoom in">＋</button>
          <a href={current.src} download={current.name}>Download</a>
          <button type="button" onClick={onClose} aria-label="Close image viewer">×</button>
        </span>
      </div>
      <div
        className="image-viewer-stage-v8"
        onDoubleClick={() => setZoom((value) => value === 1 ? 2 : 1)}
        onClick={(event) => event.target === event.currentTarget && onClose()}
        onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = touchX.current;
          const end = event.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null || zoom > 1) return;
          const delta = end - start;
          if (Math.abs(delta) < 55) return;
          move(delta > 0 ? -1 : 1);
        }}
      >
        {index > 0 && <button type="button" className="image-nav-v8 image-nav-prev-v8" onClick={() => move(-1)} aria-label="Previous image">‹</button>}
        <img src={current.src} alt={current.name} style={{ transform: `scale(${zoom})` }} draggable={false} />
        {index < images.length - 1 && <button type="button" className="image-nav-v8 image-nav-next-v8" onClick={() => move(1)} aria-label="Next image">›</button>}
      </div>
    </div>
  );
}
