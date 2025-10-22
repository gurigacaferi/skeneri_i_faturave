import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

interface UserProfile {
  id: string;
  csv_export_columns: string[] | null; // New field for export preferences
  // Add other profile fields here if necessary
}

interface SessionContextType {
  session: Session | null;
  supabase: SupabaseClient;
  loading: boolean;
  profile: UserProfile | null; // Expose profile data
  refreshProfile: () => Promise<void>; // Function to manually refresh profile
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, csv_export_columns')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error fetching profile:', error.message);
      setProfile(null);
    } else if (data) {
      setProfile(data as UserProfile);
    } else {
      // If no profile exists, create a minimal one (assuming RLS allows this)
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, csv_export_columns: null })
        .select('id, csv_export_columns')
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
    const handleSession = async (currentSession: Session | null) => {
      if (currentSession) {
        setSession(currentSession);
        await fetchProfile(currentSession.user.id);
      } else {
        setSession(null);
        setProfile(null);
      }
      setLoading(false);
    };

    // 1. Set up listener for real-time auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        handleSession(currentSession);
        if (event === 'SIGNED_IN') showSuccess('Logged in successfully!');
      } else if (event === 'SIGNED_OUT') {
        handleSession(null);
        showSuccess('Logged out successfully!');
      } else if (event === 'AUTH_ERROR') {
        showError('Authentication error. Please try again.');
        handleSession(null);
      }
    });

    // 2. Check initial session status immediately
    const checkInitialSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        // Only set initial state if the listener hasn't already done it
        if (loading) {
          handleSession(initialSession);
        }
      } catch (error) {
        console.error("Error checking initial session:", error);
        showError("Failed to connect to authentication service.");
        // Crucially, set loading to false even on failure to unblock the UI
        setLoading(false); 
      }
    };

    checkInitialSession();

    return () => subscription.unsubscribe();
  }, []); // Empty dependency array ensures this runs only once

  return (
    <SessionContext.Provider value={{ session, supabase, loading, profile, refreshProfile }}>
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