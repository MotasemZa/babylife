import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, Zap, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import inbewIcon from '@/assets/brand/inbew-icon.png';
import { BRAND } from '@/config/brand';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/app`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          toast({
            title: 'Account exists',
            description: 'This email is already registered. Please sign in instead.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Account created!',
          description: 'You can now sign in to your account.',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      navigate('/app');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({
        title: 'Sign in failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary p-12 flex-col justify-between">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <img
              src={inbewIcon}
              alt="inbew"
              className="h-10 w-10 rounded-lg border border-primary-foreground/15 bg-primary-foreground/10 object-contain p-1"
              loading="eager"
              decoding="async"
            />
            <span className="font-heading text-2xl font-bold text-primary-foreground">
              {BRAND.appName}
            </span>
          </Link>
        </div>
        
        <div className="space-y-6">
          <h2 className="font-heading text-4xl font-bold text-primary-foreground">
            Automate delivery + invoices
          </h2>
          <p className="text-lg text-primary-foreground/80">
            Deliver digital goods instantly and email invoice PDFs automatically—built for reliability at scale.
          </p>
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-primary-foreground/80">
              <Zap className="h-4 w-4" />
              <span className="text-sm">Instant digital delivery (keys/files)</span>
            </div>
            <div className="flex items-center gap-2 text-primary-foreground/80">
              <FileText className="h-4 w-4" />
              <span className="text-sm">Automated invoice PDFs + email templates</span>
            </div>
            <div className="flex items-center gap-2 text-primary-foreground/80">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm">Logs, retries, and no double-sends</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-primary-foreground/60">
          © {new Date().getFullYear()} {BRAND.business.legalName}
        </p>
      </div>

      {/* Right side - auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2">
              <img
                src={inbewIcon}
                alt="inbew"
                className="h-10 w-10 rounded-lg border border-border bg-card object-contain p-1"
                loading="eager"
                decoding="async"
              />
              <span className="font-heading text-xl font-bold text-foreground">
                {BRAND.appName}
              </span>
            </Link>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-8">
              <div className="space-y-6">
                <div className="space-y-2 text-center">
                  <h1 className="font-heading text-2xl font-bold text-foreground">
                    Welcome back
                  </h1>
                  <p className="text-muted-foreground">
                    Sign in to your account to continue
                  </p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signin">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email-signin"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password-signin">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password-signin"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={async () => {
                          if (!email) {
                            toast({ title: 'Enter your email first', description: 'Type your email address above, then click Forgot password.', variant: 'destructive' });
                            return;
                          }
                          try {
                            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                              redirectTo: `${window.location.origin}/reset-password`,
                            });
                            if (error) throw error;
                            toast({ title: 'Reset link sent!', description: 'Check your email for a password reset link.' });
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : 'An error occurred';
                            toast({ title: 'Error', description: msg, variant: 'destructive' });
                          }
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Sign In <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </TabsContent>

            <TabsContent value="signup" className="mt-8">
              <div className="space-y-6">
                <div className="space-y-2 text-center">
                  <h1 className="font-heading text-2xl font-bold text-foreground">
                    Create an account
                  </h1>
                  <p className="text-muted-foreground">
                    Get started with {BRAND.appName}
                  </p>
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signup">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email-signup"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password-signup">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password-signup"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9"
                        minLength={6}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 6 characters
                    </p>
                  </div>

                  <Button type="submit" variant="accent" className="w-full" disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Create Account <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    By creating an account, you agree to our Terms of Service and Privacy Policy.
                  </p>
                </form>
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
