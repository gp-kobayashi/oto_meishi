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
      if (!savedUserId) {
        router.replace("/userid");
      }
    };

    checkUserId();
  }, [router]);

  return null;
}
