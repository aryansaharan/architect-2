"use client";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning title={new Date(iso).toLocaleString()}>
      {timeAgo(iso, now)}
    </time>
  );
}
