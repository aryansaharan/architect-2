"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";

export function OAuthButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      size="lg"
      className="h-11 gap-2.5 px-5 text-[14px]"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=/home` } });
        if (error) {
          setPending(false);
          router.push("/login?error=provider");
        }
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <GoogleMark />} Continue with Google
    </Button>
  );
}
