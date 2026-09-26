"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
function byLocalHour() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Greets by the visitor's clock, not the server's (the server runs on UTC). */
export function Greeting({ name }: { name?: string }) {
  const greeting = useSyncExternalStore(noop, byLocalHour, () => "Welcome back");
  return (
    <>
      {greeting}
      {name ? `, ${name}` : ""}.
    </>
  );
}
