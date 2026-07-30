import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  CreditCard,
  Search,
  ChevronDown,
  ChevronUp,
  Shield,
  Calendar,
  Package,
  MoreVertical,
  RefreshCw,
  Bell,
  Mail,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { AdminUsersSplitView } from '@/components/admin/AdminUsersSplitView';
import { PlatformIntegrationChecklist } from '@/components/admin/PlatformIntegrationChecklist';

interface UserData {
  id: string;
  email: string;
  created_at: string;
  subscription?: {
    status: string;
    trial_start: string;
    trial_end: string;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  };
  settings?: {
    ebay_access_token: string | null;
    ai_credits: number;
    country: string | null;
  };
  stats?: {
    orders_count: number;
    transactions_count: number;
    listings_count: number;
    invoices_count: number;
  };
  role?: string;
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Platform default SMTP (stored as backend secrets; UI here is for setup)
  const [defaultSmtpHost, setDefaultSmtpHost] = useState('');
  const [defaultSmtpPort, setDefaultSmtpPort] = useState('');
  const [defaultSmtpSecure, setDefaultSmtpSecure] = useState(true);
  const [defaultSmtpUsername, setDefaultSmtpUsername] = useState('');
  const [defaultSmtpPassword, setDefaultSmtpPassword] = useState('');
  const [defaultSmtpFromName, setDefaultSmtpFromName] = useState('');
  const [defaultSmtpFromEmail, setDefaultSmtpFromEmail] = useState('');
  const [isTestingDefaultSmtp, setIsTestingDefaultSmtp] = useState(false);
  
  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user) {
      navigate('/app');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (error || !data) {
        toast({
          title: 'Access Denied',
          description: 'You do not have admin privileges.',
          variant: 'destructive',
        });
        navigate('/app');
        return;
      }

      setIsAdmin(true);
      loadUsers();
    } catch (error) {
      console.error('Error checking admin access:', error);
      navigate('/app');
    }
  };

  const loadUsers = async () => {
    // kept only to preserve existing admin-gate behavior; the Users tab now loads via backend function
    setIsLoading(false);
  };

  const getSubscriptionBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-accent text-accent-foreground">Active</Badge>;
      case 'trialing':
        return <Badge className="bg-primary text-primary-foreground">Trial</Badge>;
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Users are now loaded inside <AdminUsersSplitView />

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Checking admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground">Manage users, notifications, and system settings</p>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="platform-checklist" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Checklist</span>
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <AdminUsersSplitView />
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Telegram Bot Configuration</CardTitle>
              </div>
              <CardDescription>
                Platform-wide Telegram notification system status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-lg border bg-accent/5 border-accent/20">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-accent/20">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Telegram Bot Active</p>
                  <p className="text-sm text-muted-foreground">
                    The notification system is configured and ready for users
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">Bot Details</h4>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Bot Link:</span>
                  <a 
                    href="https://t.me/InbewBot" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-accent hover:underline font-medium inline-flex items-center gap-1"
                  >
                    @InbewBot
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  Individual users can configure their own Telegram notifications in{' '}
                  <span className="font-medium text-foreground">Settings → Notifications</span>.
                  Each user enters their own Chat ID and chooses which alerts they want to receive.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Default SMTP (Platform Sender)</CardTitle>
              </div>
              <CardDescription>
                Configure the platform-wide email sender. Values are stored as backend secrets (not in the database).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">How this is used</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Users can choose “Use platform sender” in Settings.</li>
                  <li>Their <span className="font-medium text-foreground">From email</span> will be their login email; you provide the SMTP delivery infrastructure.</li>
                  <li>To apply these values, set the matching backend secrets (recommended for security).</li>
                </ul>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Host</label>
                  <Input value={defaultSmtpHost} onChange={(e) => setDefaultSmtpHost(e.target.value)} placeholder="smtp.yourdomain.com" className="mt-1.5" />
                </div>
                <div>
                  <label className="text-sm font-medium">Port</label>
                  <Input value={defaultSmtpPort} onChange={(e) => setDefaultSmtpPort(e.target.value)} placeholder="587" className="mt-1.5" />
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-card p-3 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Secure (TLS)</p>
                    <p className="text-xs text-muted-foreground">Typically enabled for 465/587</p>
                  </div>
                  <Switch checked={defaultSmtpSecure} onCheckedChange={setDefaultSmtpSecure} />
                </div>
                <div>
                  <label className="text-sm font-medium">Username</label>
                  <Input value={defaultSmtpUsername} onChange={(e) => setDefaultSmtpUsername(e.target.value)} placeholder="smtp-user" className="mt-1.5" />
                </div>
                <div>
                  <label className="text-sm font-medium">Password</label>
                  <Input value={defaultSmtpPassword} onChange={(e) => setDefaultSmtpPassword(e.target.value)} placeholder="••••••••" type="password" className="mt-1.5" />
                </div>
                <div>
                  <label className="text-sm font-medium">Default From Name</label>
                  <Input value={defaultSmtpFromName} onChange={(e) => setDefaultSmtpFromName(e.target.value)} placeholder="Your App" className="mt-1.5" />
                </div>
                <div>
                  <label className="text-sm font-medium">Default From Email</label>
                  <Input value={defaultSmtpFromEmail} onChange={(e) => setDefaultSmtpFromEmail(e.target.value)} placeholder="no-reply@yourdomain.com" className="mt-1.5" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  onClick={() => {
                    toast({
                      title: 'Not saved in-app (by design)',
                      description: 'Default SMTP is stored as backend secrets. Use this form as a checklist for what to set.',
                    });
                  }}
                >
                  Save (Checklist)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      [
                        'SMTP_DEFAULT_HOST',
                        'SMTP_DEFAULT_PORT',
                        'SMTP_DEFAULT_SECURE',
                        'SMTP_DEFAULT_USERNAME',
                        'SMTP_DEFAULT_PASSWORD',
                        'SMTP_DEFAULT_FROM_EMAIL',
                        'SMTP_DEFAULT_FROM_NAME',
                      ].join('\n')
                    );
                    toast({
                      title: 'Copied secret names',
                      description: 'Paste these into your backend secrets to configure the platform sender.',
                    });
                  }}
                >
                  Copy secret names
                </Button>

                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={isTestingDefaultSmtp}
                  onClick={async () => {
                    setIsTestingDefaultSmtp(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const { data, error } = await supabase.functions.invoke('smtp-test', {
                        headers: {
                          Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
                        },
                        body: {},
                      });

                      if (error) throw error;

                      toast({
                        title: 'Test email sent',
                        description: `Sent to ${data?.to || 'mz@inbew.com'}.`,
                      });
                    } catch (e: any) {
                      toast({
                        title: 'SMTP test failed',
                        description: e?.message || e?.details || 'Failed to send test email.',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsTestingDefaultSmtp(false);
                    }
                  }}
                >
                  {isTestingDefaultSmtp ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Send test email
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Platform Checklist Tab */}
        <TabsContent value="platform-checklist" className="space-y-6">
          <PlatformIntegrationChecklist />
        </TabsContent>
      </Tabs>

    </div>
  );
}
