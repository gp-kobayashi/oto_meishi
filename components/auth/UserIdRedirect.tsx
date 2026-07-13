"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

      const savedUserId = window.localStorage.getItem("oto_meishi_userId");
      if (!savedUserId) {
        router.replace("/userid");
      }
    };

    checkUserId();
  }, [router]);

  return null;
}
