"use client";

import { Fragment, type ReactNode } from "react";

const TOKEN = /(\|\|[^|]+\|\||\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+|@[a-zA-Z0-9_]{3,20}|\*[^*]+\*)/g;

function inline(text: string): ReactNode[] {
  return text.split(TOKEN).filter((part) => part !== "").map((part, index) => {
    if (part.startsWith("||") && part.endsWith("||")) {
      return <span key={index} className="tiger-spoiler" tabIndex={0}>{part.slice(2, -2)}</span>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>;
    if (/^@[a-zA-Z0-9_]{3,20}$/.test(part)) return <span key={index} className="tiger-mention">{part}</span>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return <>{lines.map((line, index) => <Fragment key={index}>{inline(line)}{index < lines.length - 1 && <br />}</Fragment>)}</>;
}
