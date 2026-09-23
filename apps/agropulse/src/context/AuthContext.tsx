import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { MembershipRole } from "@agropulse/contracts";

export interface UserMembership {
  organization_id: string;
  role: MembershipRole;
  organization: {
    id: string;
    name: string;
  };
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: UserMembership[];
  activeOrg: { id: string; name: string } | null;
  activeRole: MembershipRole | null;
  setActiveOrgId: (orgId: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  const fetchMemberships = async (userId: string): Promise<UserMembership[]> => {
    try {
      const { data, error } = await supabase
        .from("memberships")
        .select("organization_id, role, organizations(id, name)")
        .eq("user_id", userId);

      if (error || !data) {
        console.warn("Error fetching memberships:", error?.message);
        return [];
      }

      const formatted: UserMembership[] = data.map((item: any) => ({
        organization_id: item.organization_id,
        role: item.role as MembershipRole,
        organization: Array.isArray(item.organizations)
          ? item.organizations[0]
          : item.organizations,
      }));

      setMemberships(formatted);

      // Default active org to first membership or keep selected if valid
      if (formatted.length > 0) {
        setActiveOrgIdState((prev) => {
          if (prev && formatted.some((m) => m.organization_id === prev)) {
            return prev;
          }
          return formatted[0]?.organization_id ?? null;
        });
      } else {
        setActiveOrgIdState(null);
      }

      return formatted;
    } catch (err) {
      console.warn("Exception in fetchMemberships:", err);
      return [];
    }
  };

  useEffect(() => {
    // Safety timeout: dismiss loading spinner after 3 seconds max so UI is never stuck
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    // Check active session on startup
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timer);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchMemberships(session.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        console.warn("getSession error:", err);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchMemberships(session.user.id);
      } else {
        setMemberships([]);
        setActiveOrgIdState(null);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) return { error };

      if (data.user) {
        await fetchMemberships(data.user.id);
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setMemberships([]);
    setActiveOrgIdState(null);
  };

  const currentMembership = memberships.find((m) => m.organization_id === activeOrgId);
  const activeOrg = currentMembership
    ? { id: currentMembership.organization_id, name: currentMembership.organization.name }
    : memberships[0]
      ? { id: memberships[0].organization_id, name: memberships[0].organization.name }
      : null;

  const activeRole = currentMembership?.role ?? memberships[0]?.role ?? null;

  const setActiveOrgId = (orgId: string) => {
    if (memberships.some((m) => m.organization_id === orgId)) {
      setActiveOrgIdState(orgId);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        memberships,
        activeOrg,
        activeRole,
        setActiveOrgId,
        signIn,
        signOut,
        refreshMemberships: async () => {
          if (user) await fetchMemberships(user.id);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
