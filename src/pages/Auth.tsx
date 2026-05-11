import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';
import { Loader2, Info } from 'lucide-react';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { motion } from 'framer-motion';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email');
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain a special character');

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  
  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInErrors, setSignInErrors] = useState<{ email?: string; password?: string }>({});
  
  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpPhone, setSignUpPhone] = useState('');
  const [signUpCompany, setSignUpCompany] = useState('');
  const [signUpErrors, setSignUpErrors] = useState<{ email?: string; password?: string; name?: string; phone?: string; company?: string }>({});

  const validateSignIn = () => {
    const errors: { email?: string; password?: string } = {};
    
    try {
      emailSchema.parse(signInEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(signInPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.password = e.errors[0].message;
      }
    }
    
    setSignInErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignUp = () => {
    const errors: { email?: string; password?: string; name?: string; phone?: string; company?: string } = {};

    if (!signUpName.trim()) {
      errors.name = 'Name is required';
    }
    if (!signUpPhone.trim()) {
      errors.phone = 'Phone number is required';
    }
    if (!signUpCompany.trim()) {
      errors.company = 'Company name is required';
    }
    
    try {
      emailSchema.parse(signUpEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(signUpPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.password = e.errors[0].message;
      }
    }
    
    setSignUpErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignIn()) return;
    
    setIsLoading(true);
    const { error } = await signIn(signInEmail, signInPassword);
    setIsLoading(false);
    
    if (!error) {
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignUp()) return;
    
    setIsLoading(true);
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, { phone: signUpPhone, companyName: signUpCompany });
    setIsLoading(false);
    
    if (!error) {
      setActiveTab('signin');
      setSignInEmail(signUpEmail);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-display font-bold">WorkPermit</h1>
          <p className="text-muted-foreground">Management System</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="font-display text-xl">Welcome</CardTitle>
            <CardDescription>Sign in to your account, or sign up as a new tenant</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Tenant Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      className={signInErrors.email ? 'border-destructive' : ''}
                    />
                    {signInErrors.email && (
                      <p className="text-sm text-destructive">{signInErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      className={signInErrors.password ? 'border-destructive' : ''}
                    />
                    {signInErrors.password && (
                      <p className="text-sm text-destructive">{signInErrors.password}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                {/* Helper banner: clarifies who should self-register here.
                    Internal Al Hamra staff (approvers, admins) get accounts
                    from the admin team — they shouldn't sign up here. */}
                <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 flex gap-3">
                  <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-sm text-foreground/80 leading-snug">
                    Sign up here if you're a <strong>tenant</strong> who needs to
                    submit work permits or gate-pass requests for your unit.
                    Al&nbsp;Hamra staff: please contact your administrator to be
                    issued an account — don't register here.
                  </p>
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      className={signUpErrors.name ? 'border-destructive' : ''}
                    />
                    {signUpErrors.name && (
                      <p className="text-sm text-destructive">{signUpErrors.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      className={signUpErrors.email ? 'border-destructive' : ''}
                    />
                    {signUpErrors.email && (
                      <p className="text-sm text-destructive">{signUpErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone / Mobile</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="+965 1234 5678"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      className={signUpErrors.phone ? 'border-destructive' : ''}
                    />
                    {signUpErrors.phone && (
                      <p className="text-sm text-destructive">{signUpErrors.phone}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-company">Company Name</Label>
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Acme Trading Co."
                      value={signUpCompany}
                      onChange={(e) => setSignUpCompany(e.target.value)}
                      className={signUpErrors.company ? 'border-destructive' : ''}
                    />
                    {signUpErrors.company && (
                      <p className="text-sm text-destructive">{signUpErrors.company}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      className={signUpErrors.password ? 'border-destructive' : ''}
                    />
                    <PasswordStrengthIndicator password={signUpPassword} />
                    {signUpErrors.password && (
                      <p className="text-sm text-destructive">{signUpErrors.password}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating tenant account...
                      </>
                    ) : (
                      'Create Tenant Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
