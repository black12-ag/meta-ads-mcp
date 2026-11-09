import { useEffect, useState } from "react";
import { auth, onAuthStateChanged } from "@/lib/auth/firebase-client";

export type SessionUser = { uid: string; email: string | null; displayName: string | null };

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth(), (u) => {
      setUser(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, loading };
}
