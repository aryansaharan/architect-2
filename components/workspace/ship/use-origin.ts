"use client";
import { useSyncExternalStore } from "react";

/** This site's origin, so live links read and copy as full URLs. Empty during server rendering. */
const noSubscribe = () => () => {};
export function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}
