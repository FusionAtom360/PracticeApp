import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const MAX_SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

function tokenIssuedAt(accessToken: string): number | null {
    try {
        const payload = accessToken.split(".")[1];
        if (!payload) return null;
        const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        return typeof decoded.iat === "number" ? decoded.iat : null;
    } catch {
        return null;
    }
}

interface AuthContextValue {
    session: Session | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const acceptSession = async (nextSession: Session | null) => {
            const issuedAt = nextSession ? tokenIssuedAt(nextSession.access_token) : null;
            if (issuedAt !== null) {
                const age = Math.floor(Date.now() / 1000) - issuedAt;
                if (age >= MAX_SESSION_AGE_SECONDS) {
                    await supabase.auth.signOut();
                    setSession(null);
                    setLoading(false);
                    return;
                }
            }
            setSession(nextSession);
            setLoading(false);
        };

        void supabase.auth.getSession().then(({ data }) => acceptSession(data.session));
        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            void acceptSession(nextSession);
        });
        const expiryCheck = window.setInterval(() => {
            void supabase.auth.getSession().then(({ data: current }) => acceptSession(current.session));
        }, 60 * 60 * 1000);
        return () => {
            data.subscription.unsubscribe();
            window.clearInterval(expiryCheck);
        };
    }, []);

    const value = {
        session,
        loading,
        signIn: async (email: string, password: string) => {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        },
        signUp: async (email: string, password: string) => {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            });
            if (error) throw error;
        },
        signOut: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        },
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
}
