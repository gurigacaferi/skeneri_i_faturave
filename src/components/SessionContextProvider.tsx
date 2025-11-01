import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

interface UserProfile {
  id: string;
  csv_export_columns: string[] | null;
  role: 'user' | 'admin';
  two_factor_enabled: boolean; // ADDED
  two_factor_secret: string | null; // ADDED
}

interface SessionContextType {
  session: Session | null;
  supabase: SupabaseClient;
  loading: boolean;
  profile: UserProfile | null;
  authEvent: string | null;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, csv_export_columns, role, two_factor_enabled, two_factor_secret') // UPDATED SELECT
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error.message);
      setProfile(null);
    } else if (data) {
      setProfile(data as UserProfile);
    } else {
      // If profile doesn't exist, create a default one (should be handled by trigger, but fallback)
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, csv_export_columns: null, role: 'user' })
        .select('id, csv_export_columns, role, two_factor_enabled, two_factor_secret') // UPDATED SELECT
        .single();
      
      if (insertError) {
        console.error('Error creating profile:', insertError.message);
      } else if (newProfile) {
        setProfile(newProfile as UserProfile);
      }
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  useEffect(() => {
    const handleSession = async (event: string, currentSession: Session | null) => {
      setAuthEvent(event);
      if (currentSession) {
        setSession(currentSession);
        await fetchProfile(currentSession.user.id);
      } else {
        setSession(null);
        setProfile(null);
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      handleSession(event, currentSession);
      if (event === 'SIGNED_IN') showSuccess('Logged in successfully!');
      if (event === 'SIGNED_OUT') showSuccess('Logged out successfully!');
      if (event === 'AUTH_ERROR') showError('Authentication error. Please try again.');
    });

    const checkInitialSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (loading) {
          handleSession('INITIAL_SESSION', initialSession);
        }
      } catch (error) {
        console.error("Error checking initial session:", error);
        showError("Failed to connect to authentication service.");
        setLoading(false); 
      }
    };

    checkInitialSession();

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, supabase, loading, profile, authEvent, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};