import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        setSession(currentSession);
        if (currentSession) {
          await fetchProfile(currentSession.user.id);
          if (location.pathname === '/login') {
            navigate('/');
            showSuccess('Logged in successfully!');
          }
        } else {
          setProfile(null);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        if (location.pathname !== '/login') {
          navigate('/login');
          showSuccess('Logged out successfully!');
        }
      } else if (event === 'AUTH_ERROR') {
        showError('Authentication error. Please try again.');
        setSession(null);
        setProfile(null);
        navigate('/login');
      }
      setLoading(false);
    });

    // Initial session check and profile fetch
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession) {
        fetchProfile(initialSession.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
        if (location.pathname !== '/login') {
          navigate('/login');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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