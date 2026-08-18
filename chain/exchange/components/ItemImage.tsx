"use client";
import { useState } from "react";
import { ipfs } from "@/lib/format";
export function ItemImage({ src, alt, size = 40 }: { src: string | null; alt: string; size?: number }) {
  const [err, setErr] = useState(false);
  const url = ipfs(src);
  if (!url || err) {
    return (
      <div style={{ width: size, height: size }} className="grid place-items-center rounded bg-panel2 border border-line text-mute text-xs">
        {alt.slice(0, 2)}
      </div>
    );
  }
  return (
    <img src={url} alt={alt} width={size} height={size} onError={() => setErr(true)}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="rounded bg-panel2 border border-line object-contain" />
  );
}
