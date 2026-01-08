import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AppRole = 'contractor' | 'helpdesk' | 'pm' | 'pd' | 'bdcr' | 'mpr' | 'it' | 'fitout' | 'ecovert_supervisor' | 'pmd_coordinator' | 'admin';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  company_logo: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isApprover: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile/roles fetch with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchProfileAndRoles(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndRoles(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfileAndRoles = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      } else {
        setProfile(profileData);
      }

      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      } else {
        setRoles(rolesData?.map(r => r.role as AppRole) || []);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const logActivity = async (userId: string, userEmail: string, actionType: string, details?: string) => {
    try {
      await supabase.from('user_activity_logs').insert({
        user_id: userId,
        user_email: userEmail,
        action_type: actionType,
        details,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        // Log failed login attempt
        await supabase.from('user_activity_logs').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          user_email: email,
          action_type: 'login_failed',
          details: error.message,
          user_agent: navigator.userAgent,
        });
        toast.error(error.message);
        return { error };
      }
      // Log successful login
      if (data.user) {
        await logActivity(data.user.id, email, 'login');
      }
      toast.success('Signed in successfully');
      return { error: null };
    } catch (error) {
      const err = error as Error;
      toast.error(err.message);
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });
      if (error) {
        toast.error(error.message);
        return { error };
      }
      toast.success('Account created successfully! You can now sign in.');
      return { error: null };
    } catch (error) {
      const err = error as Error;
      toast.error(err.message);
      return { error: err };
    }
  };

  const signOut = async () => {
    // Log logout before signing out
    if (user) {
      await logActivity(user.id, user.email || '', 'logout');
    }
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    toast.success('Signed out successfully');
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  const isApprover = () => {
    const approverRoles: AppRole[] = ['helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'ecovert_supervisor', 'pmd_coordinator', 'admin'];
    return roles.some(r => approverRoles.includes(r));
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfileAndRoles(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
        isApprover,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
