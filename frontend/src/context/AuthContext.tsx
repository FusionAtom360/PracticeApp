import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

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
        void supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });
        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
        return () => data.subscription.unsubscribe();
    }, []);

    const value = {
        session,
        loading,
        signIn: async (email: string, password: string) => {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        },
        signUp: async (email: string, password: string) => {
            const { error } = await supabase.auth.signUp({ email, password });
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
