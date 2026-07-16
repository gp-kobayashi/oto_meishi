"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";

export default function UserIdRedirect() {
  const router = useRouter();

  useEffect(() => {
    const checkUserId = async () => {
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return;
      }

      const savedUserId = window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY);
      if (savedUserId) {
        return;
      }

      const response = await fetch("/api/profile?mine=true", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const profile = (await response.json()) as { userId?: string };
        if (profile.userId) {
          window.localStorage.setItem(OTO_MEISHI_USER_ID_KEY, profile.userId);
          window.location.reload();
        }
        return;
      }

      if (response.status === 404) {
        router.replace("/useridInput");
      }
    };

    checkUserId();
  }, [router]);

  return null;
}
