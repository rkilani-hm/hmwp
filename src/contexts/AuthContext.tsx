import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type RoleName = string;

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  company_id: string | null;
  company_logo: string | null;
  auth_preference: string | null;
  account_status: 'pending' | 'approved' | 'rejected';
  account_rejection_reason: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: RoleName[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    extras?: { phone?: string; companyName?: string },
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: RoleName) => boolean;
  isApprover: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleName[]>([]);
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
            fetchProfileAndRoles(session.user);
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
        fetchProfileAndRoles(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfileAndRoles = async (authUser: User) => {
    const userId = authUser.id;

    try {
      // Fetch profile (use maybeSingle to avoid hard failure when row doesn't exist yet)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      }

      if (profileData) {
        setProfile(profileData as Profile);
      } else {
        // Profile row missing: create it so updates actually persist
        const email = authUser.email;
        if (!email) {
          console.error('Cannot create profile: missing auth user email');
          setProfile(null);
        } else {
          const fullName =
            (typeof authUser.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name.trim())
              ? authUser.user_metadata.full_name.trim()
              : email;

          const { data: createdProfile, error: createError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: userId,
                email,
                full_name: fullName,
              },
              { onConflict: 'id' }
            )
            .select('*')
            .maybeSingle();

          if (createError) {
            console.error('Error creating missing profile:', createError);
            setProfile(null);
          } else {
            setProfile((createdProfile as Profile) ?? null);
          }
        }
      }

      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_id, roles:role_id(name)')
        .eq('user_id', userId);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      } else {
        setRoles(rolesData?.map(r => (r.roles as any)?.name as RoleName).filter(Boolean) || []);
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

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    extras?: { phone?: string; companyName?: string },
  ) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      // raw_user_meta_data keys are read by the handle_new_user
      // SQL trigger (migration 20260512090000…) which writes them
      // into the matching profiles columns at account creation time.
      const metadata: Record<string, string> = {
        full_name: fullName,
      };
      if (extras?.phone?.trim()) metadata.phone = extras.phone.trim();
      if (extras?.companyName?.trim()) metadata.company_name = extras.companyName.trim();

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: metadata,
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

  const hasRole = (role: RoleName) => roles.includes(role);

  const isApprover = () => {
    // Any non-tenant role is considered an approver in this system.
    // (Workflows are admin-configurable, so we must not hardcode role lists.)
    return roles.some(r => r !== 'tenant');
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfileAndRoles(user);
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
