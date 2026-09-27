"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WritingSheet } from "@/components/home/writing-sheet";

/** The landing page's writing area. Signed-out visitors sign in first and come straight back to their note. */
export function LandingComposer({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <WritingSheet
      id="landing-brief"
      value={text}
      onChange={setText}
      onSubmit={(t) => {
        const to = `/new?prompt=${encodeURIComponent(t)}`;
        router.push(signedIn ? to : `/login?next=${encodeURIComponent(to)}`);
      }}
    />
  );
}
