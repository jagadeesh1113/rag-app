"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Define what data we want to share
interface AuthContextType {
  user: User | null; // User info (name, email, etc.)
  session: Session | null; // Session info (access token, etc.)
  loading: boolean; // Is the app still checking if the user is logged in?
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null); // Store user info
  const [session, setSession] = useState<Session | null>(null); // Store session info
  const [loading, setLoading] = useState(true); // Track loading state
  // Check if the user is already logged in when the app starts
  useEffect(() => {
    const supabase = createClient();
    const initSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };
    initSession();
    // Listen for changes in the user's login state
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });
    // Cleanup when the component unmounts
    return () => subscription?.unsubscribe();
  }, []);

  // Share the data with the rest of the app
  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
