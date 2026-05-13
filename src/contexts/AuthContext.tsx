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
  signUp: (email: string, password: string, fullName: string, extra?: { phone?: string; companyName?: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /**
   * Sends a password-reset email containing a magic recovery link.
   * When the user clicks the link they land on /reset-password with a
   * temporary "recovery" session that lets them call updatePassword().
   * Always resolves with { error: null } even if the email is unknown,
   * to avoid leaking which emails are registered.
   */
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  /**
   * Updates the currently-signed-in user's password. Called from the
   * reset-password page once the user has clicked the recovery link.
   */
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
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

      // Fetch effective roles from the effective_approvers view —
      // this transparently includes both direct user_roles
      // assignments AND any currently-active approval_delegations
      // pointing to this user. The rest of the app reads
      // AuthContext.roles and gets the union for free.
      //
      // Falls back to user_roles directly if the view query fails
      // (e.g. on an older deployment that hasn't run the migration
      // yet) — degraded but functional.
      try {
        const { data: effectiveData, error: effectiveError } = await supabase
          .from('effective_approvers' as any)
          .select('role_name')
          .eq('effective_user_id', userId);

        if (effectiveError) throw effectiveError;

        // De-dupe (a user can hold the same role both directly and
        // via delegation — view returns both rows; we only need
        // the role name once).
        const uniqueRoles = Array.from(
          new Set(
            (effectiveData || [])
              .map((r: any) => r.role_name as RoleName)
              .filter(Boolean),
          ),
        );
        setRoles(uniqueRoles);
      } catch (effectiveErr) {
        console.warn(
          'effective_approvers view unavailable, falling back to user_roles direct read:',
          effectiveErr,
        );
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('role_id, roles:role_id(name)')
          .eq('user_id', userId);

        if (rolesError) {
          console.error('Error fetching roles:', rolesError);
        } else {
          setRoles(
            rolesData
              ?.map((r) => (r.roles as any)?.name as RoleName)
              .filter(Boolean) || [],
          );
        }
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

  const signUp = async (email: string, password: string, fullName: string, extra?: { phone?: string; companyName?: string }) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            phone: extra?.phone ?? '',
            company_name: extra?.companyName ?? '',
          },
        },
      });
      if (error) {
        toast.error(error.message);
        return { error };
      }
      // Note: the new account is in 'pending' status until an admin
      // approves. The Auth page renders a dedicated confirmation
      // card (signupSuccess) that walks the user through the next
      // steps; we keep this toast minimal to avoid duplicating that
      // information.
      toast.success('Registration submitted for review');
      return { error: null };
    } catch (error) {
      const err = error as Error;
      toast.error(err.message);
      return { error: err };
    }
  };

  /**
   * Sends a password-reset email. Privacy-preserving: always reports
   * success to the caller, even when Supabase returns "user not
   * found" — otherwise an attacker could probe which emails are
   * registered tenants. Real errors (network, rate limit) are
   * surfaced.
   */
  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      // Email-not-found errors come back as "User not found" or
      // status 400. Swallow them so we don't reveal account presence.
      if (error) {
        const looksLikeUnknownEmail =
          error.status === 400 ||
          /user not found|not registered|invalid/i.test(error.message);
        if (looksLikeUnknownEmail) {
          return { error: null };
        }
        // Genuine errors (network, rate limit) bubble up
        toast.error(error.message);
        return { error };
      }
      return { error: null };
    } catch (error) {
      const err = error as Error;
      toast.error(err.message);
      return { error: err };
    }
  };

  /**
   * Updates the password for the currently-authenticated user.
   * Called from /reset-password after the magic-link drops the user
   * into a recovery session.
   */
  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
        return { error };
      }
      toast.success('Password updated successfully');
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
        resetPassword,
        updatePassword,
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
