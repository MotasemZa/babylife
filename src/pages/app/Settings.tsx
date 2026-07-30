import { useState, useEffect } from 'react';
import {
  Globe,
  DollarSign,
  Calendar,
  Tag,
  Shield,
  Trash2,
  Save,
  Plus,
  X,
  Sparkles,
  Coins,
  FileText,
  CreditCard,
  User,
  Settings as SettingsIcon,
  Upload,
  Image,
  Bell,
  Send,
  MessageCircle,
  Mail,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { InvoiceLayoutDesigner, type InvoiceLayout } from '@/components/settings/InvoiceLayoutDesigner';
import { EmailFooterEditor } from '@/components/settings/EmailFooterEditor';
import { BRAND } from '@/config/brand';

const defaultCategories = [
  'Electronics',
  'Clothing',
  'Home & Garden',
  'Collectibles',
  'Sports',
  'Toys',
  'Automotive',
  'Other',
];

const AI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & Affordable)', cost: 1 },
  { value: 'gpt-4o', label: 'GPT-4o (Balanced)', cost: 2 },
  { value: 'gpt-4.1', label: 'GPT-4.1 (High Quality)', cost: 3 },
  { value: 'gpt-5', label: 'GPT-5 (Best Quality)', cost: 5 },
];

interface NotificationSettings {
  telegram_chat_id: string;
  telegram_enabled: boolean;
  notify_fulfillment_success: boolean;
  notify_fulfillment_failed: boolean;
  notify_out_of_stock: boolean;
  notify_daily_summary: boolean;
}

export default function Settings() {
  const { user } = useAuth();
  
  const [categories, setCategories] = useState(defaultCategories);
  const [newCategory, setNewCategory] = useState('');
  const [aiCredits, setAiCredits] = useState(10);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Invoice settings
  const [sellerBusinessName, setSellerBusinessName] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [sellerStreet, setSellerStreet] = useState('');
  const [sellerCity, setSellerCity] = useState('');
  const [sellerPostalCode, setSellerPostalCode] = useState('');
  const [sellerCountry, setSellerCountry] = useState('');
  const [sellerVatNumber, setSellerVatNumber] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [invoiceMotto, setInvoiceMotto] = useState('');
  const [invoiceTemplate, setInvoiceTemplate] = useState('modern');
  const [invoiceLogoUrl, setInvoiceLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // EN16931 / ZUGFeRD required seller contact fields
  const [sellerContactName, setSellerContactName] = useState('');
  const [sellerContactDepartment, setSellerContactDepartment] = useState('');
  const [sellerContactPhone, setSellerContactPhone] = useState('');
  const [sellerContactEmail, setSellerContactEmail] = useState('');

  // Invoice email template
  const [invoiceEmailSubject, setInvoiceEmailSubject] = useState('');
  const [invoiceEmailBodyHtml, setInvoiceEmailBodyHtml] = useState('');

  // Invoice designer (section ordering/toggles)
  const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayout | null>(null);

  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    telegram_chat_id: '',
    telegram_enabled: false,
    notify_fulfillment_success: true,
    notify_fulfillment_failed: true,
    notify_out_of_stock: true,
    notify_daily_summary: false,
  });
  const [savedChatId, setSavedChatId] = useState(''); // Track what's actually saved in DB
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  // Email / SMTP settings (platform sender + user preferences)
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [useCustomSmtp, setUseCustomSmtp] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpReplyTo, setSmtpReplyTo] = useState('');
  
  const [smtpBccEmail, setSmtpBccEmail] = useState('');
  const [smtpEmailFooterHtml, setSmtpEmailFooterHtml] = useState('');
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpVerifiedAt, setSmtpVerifiedAt] = useState<string | null>(null);
  const [smtpLastError, setSmtpLastError] = useState<string | null>(null);

  const applyInbewBusinessDefaults = (opts?: { overwrite?: boolean }) => {
    const overwrite = Boolean(opts?.overwrite);

    const setIfEmpty = (current: string, setter: (v: string) => void, value: string) => {
      if (overwrite || !current?.trim()) setter(value);
    };

    setIfEmpty(sellerBusinessName, setSellerBusinessName, BRAND.business.legalName);
    setIfEmpty(sellerStreet, setSellerStreet, BRAND.business.street);
    setIfEmpty(sellerPostalCode, setSellerPostalCode, BRAND.business.postalCode);
    setIfEmpty(sellerCity, setSellerCity, BRAND.business.city);
    setIfEmpty(sellerCountry, setSellerCountry, BRAND.business.country);
    setIfEmpty(sellerContactPhone, setSellerContactPhone, BRAND.business.phone);

    // Helpful defaults (safe to override only when blank)
    setIfEmpty(invoiceMotto, setInvoiceMotto, "Automated digital delivery & invoicing");
    if (overwrite || !invoicePrefix?.trim()) setInvoicePrefix("INB");
  };

  const formatSmtpError = async (err: any): Promise<string> => {
    // Supabase function errors often hide the real JSON body inside `context`
    try {
      const ctx = err?.context;
      if (ctx?.json) {
        const body = await ctx.json();
        const msg = body?.error || body?.message;
        const details = body?.details;
        return [msg, details].filter(Boolean).join(" — ");
      }
    } catch {
      // ignore
    }
    return err?.message || err?.details || 'Unknown error';
  };

  useEffect(() => {
    if (user) {
      loadSettings();
      loadNotificationSettings();
      loadSmtpSettings();
    }
  }, [user]);

  const loadSmtpSettings = async () => {
    if (!user) return;
    setSmtpLoading(true);
    try {
      const { data, error } = await (supabase
        .from('smtp_settings' as any)
        .select('enabled, host, port, secure, username, from_email, from_name, reply_to, bcc_email, email_footer_html, verified_at, last_error')
        .eq('user_id', user.id)
        .maybeSingle() as any);

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading SMTP settings:', error);
        return;
      }

      if (data) {
        setUseCustomSmtp(Boolean(data.enabled && data.host));
        setSmtpHost(data.host || '');
        setSmtpPort(String(data.port ?? '465'));
        setSmtpSecure(Boolean(data.secure ?? true));
        setSmtpUsername(data.username || '');
        // Never load password back into the UI
        setSmtpPassword('');
        setSmtpFromEmail(data.from_email || (user.email || ''));
        setSmtpFromName(data.from_name || '');
        setSmtpReplyTo(data.reply_to || '');
        setSmtpBccEmail(data.bcc_email || '');
        setSmtpEmailFooterHtml(data.email_footer_html || '');
        setSmtpVerifiedAt(data.verified_at || null);
        setSmtpLastError(data.last_error || null);
      } else {
        setUseCustomSmtp(true);
        setSmtpHost('');
        setSmtpPort('465');
        setSmtpSecure(true);
        setSmtpUsername('');
        setSmtpPassword('');
        setSmtpFromEmail(user.email || '');
        setSmtpFromName('');
        setSmtpReplyTo(user.email || '');
        setSmtpBccEmail('');
        setSmtpEmailFooterHtml('');
        setSmtpVerifiedAt(null);
        setSmtpLastError(null);
      }

      setSmtpTestTo(user.email || '');
    } catch (e) {
      console.error('Error loading SMTP settings:', e);
    } finally {
      setSmtpLoading(false);
    }
  };

  const saveSmtpSettings = async () => {
    if (!user) return;
    setSmtpSaving(true);
    try {
      if (!useCustomSmtp) {
        toast({
          title: 'Custom SMTP disabled',
          description: 'Enable “Use custom SMTP” to save SMTP credentials.',
          variant: 'destructive',
        });
        return;
      }

      if (!smtpHost.trim()) throw new Error('SMTP host is required');
      if (!smtpPort.trim() || Number.isNaN(Number(smtpPort))) throw new Error('SMTP port must be a number');
      if (!smtpUsername.trim()) throw new Error('SMTP username is required');
      if (!smtpFromEmail.trim()) throw new Error('From email is required');

      const { data, error } = await supabase.functions.invoke('smtp-user-save', {
        body: {
          enabled: true,
          host: smtpHost.trim(),
          port: Number(smtpPort),
          secure: smtpSecure,
          username: smtpUsername.trim(),
          password: smtpPassword || null, // optional; backend keeps existing if omitted
          from_email: smtpFromEmail.trim(),
          from_name: smtpFromName || null,
          reply_to: smtpReplyTo || null,
          bcc_email: smtpBccEmail || null,
          email_footer_html: smtpEmailFooterHtml || null,
        },
      });

      if (error) {
        const msg = await formatSmtpError(error);
        throw new Error(msg);
      }

      toast({
        title: 'Email settings saved',
        description: 'Your SMTP settings have been updated.',
      });

      // Clear password field after successful save
      setSmtpPassword('');

      // Refresh status fields (verified/error)
      if (typeof data === 'object' && data) {
        setSmtpVerifiedAt((data as any).verified_at ?? smtpVerifiedAt);
        setSmtpLastError((data as any).last_error ?? smtpLastError);
      } else {
        loadSmtpSettings();
      }
    } catch (e: any) {
      console.error('Error saving SMTP settings:', e);
      toast({
        title: 'Error',
        description: e?.message || 'Failed to save email settings',
        variant: 'destructive',
      });
    } finally {
      setSmtpSaving(false);
    }
  };

  const testSmtpEmail = async () => {
    if (!user) return;
    if (!useCustomSmtp) {
      toast({
        title: 'Custom SMTP is disabled',
        description: 'Enable “Use custom SMTP” first.',
        variant: 'destructive',
      });
      return;
    }

    const to = (smtpTestTo || user.email || '').trim();
    if (!to) {
      toast({
        title: 'Missing recipient',
        description: 'Enter a recipient email to send the test message to.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSmtpTesting(true);
      const { data, error } = await supabase.functions.invoke('smtp-user-test', {
        body: { to },
      });
      if (error) {
        const msg = await formatSmtpError(error);
        setSmtpVerifiedAt(null);
        setSmtpLastError(msg);
        throw new Error(msg);
      }

      toast({
        title: 'Test email sent',
        description: `Sent to ${to}.`,
      });

      // Update status from backend response when available
      if (typeof data === 'object' && data) {
        setSmtpVerifiedAt((data as any).verified_at ?? new Date().toISOString());
        setSmtpLastError((data as any).last_error ?? null);
      } else {
        setSmtpVerifiedAt(new Date().toISOString());
        setSmtpLastError(null);
      }

      // Helpful for debugging without spamming UI
      console.log('smtp-user-test response', data);
    } catch (e: any) {
      console.error('smtp-user-test failed', e);
      toast({
        title: 'Test failed',
        description: e?.message || 'Could not send test email',
        variant: 'destructive',
      });
    } finally {
      setSmtpTesting(false);
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('ai_credits, ai_model, seller_business_name, seller_address, seller_street, seller_city, seller_postal_code, seller_country, seller_vat_number, seller_email, invoice_prefix, invoice_motto, invoice_template, invoice_logo_url, seller_contact_name, seller_contact_department, seller_contact_phone, seller_contact_email, invoice_email_subject, invoice_email_body_html, invoice_layout')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error);
        return;
      }

      if (data) {
        setAiCredits(data.ai_credits ?? 10);
        setSelectedModel(data.ai_model ?? 'gpt-4o-mini');
        setSellerBusinessName(data.seller_business_name || '');
        setSellerAddress(data.seller_address || '');
        setSellerStreet((data as any).seller_street || '');
        setSellerCity((data as any).seller_city || '');
        setSellerPostalCode((data as any).seller_postal_code || '');
        setSellerCountry((data as any).seller_country || '');
        setSellerVatNumber(data.seller_vat_number || '');
        setSellerEmail(data.seller_email || '');
        setInvoicePrefix(data.invoice_prefix || 'INV');
        setInvoiceMotto(data.invoice_motto || '');
        setInvoiceTemplate(data.invoice_template || 'modern');
        setInvoiceLogoUrl(data.invoice_logo_url || '');

        setSellerContactName(data.seller_contact_name || '');
        setSellerContactDepartment(data.seller_contact_department || '');
        setSellerContactPhone(data.seller_contact_phone || '');
        setSellerContactEmail(data.seller_contact_email || '');

        setInvoiceEmailSubject(data.invoice_email_subject || 'Invoice {INVOICE_NUMBER} from {SELLER_NAME}');
        setInvoiceEmailBodyHtml(data.invoice_email_body_html || '<p>Hello {BUYER_NAME},</p><p>Please find your invoice attached.</p><p>Invoice: <b>{INVOICE_NUMBER}</b><br/>Total: <b>{TOTAL}</b></p><p>Regards,<br/>{SELLER_NAME}</p>');

        setInvoiceLayout(((data as any).invoice_layout ?? null) as InvoiceLayout | null);

        // If the user hasn't configured invoice business info yet, prefill with inbew defaults.
        const hasAnyBusinessValue = Boolean(
          (data.seller_business_name || '').trim() ||
            ((data as any).seller_street || '').trim() ||
            ((data as any).seller_city || '').trim() ||
            ((data as any).seller_postal_code || '').trim() ||
            ((data as any).seller_country || '').trim() ||
            (data.seller_contact_phone || '').trim()
        );

        if (!hasAnyBusinessValue) {
          // Defer to next tick so the state setters above don't get clobbered.
          queueMicrotask(() => applyInbewBusinessDefaults({ overwrite: false }));
        }
      } else {
        // New user: show defaults in the UI.
        applyInbewBusinessDefaults({ overwrite: false });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotificationSettings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading notification settings:', error);
        return;
      }

      if (data) {
        setNotificationSettings({
          telegram_chat_id: data.telegram_chat_id || '',
          telegram_enabled: data.telegram_enabled || false,
          notify_fulfillment_success: data.notify_fulfillment_success ?? true,
          notify_fulfillment_failed: data.notify_fulfillment_failed ?? true,
          notify_out_of_stock: data.notify_out_of_stock ?? true,
          notify_daily_summary: data.notify_daily_summary ?? false,
        });
        setSavedChatId(data.telegram_chat_id || ''); // Track saved value
      }
    } catch (err) {
      console.error('Error loading notification settings:', err);
    }
  };

  const saveNotificationSettings = async () => {
    if (!user) return;

    try {
      setSavingNotifications(true);

      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          user_id: user.id,
          telegram_chat_id: notificationSettings.telegram_chat_id || null,
          telegram_enabled: notificationSettings.telegram_enabled,
          notify_fulfillment_success: notificationSettings.notify_fulfillment_success,
          notify_fulfillment_failed: notificationSettings.notify_fulfillment_failed,
          notify_out_of_stock: notificationSettings.notify_out_of_stock,
          notify_daily_summary: notificationSettings.notify_daily_summary,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setSavedChatId(notificationSettings.telegram_chat_id); // Update saved value after successful save
      
      toast({
        title: 'Notification settings saved',
        description: 'Your preferences have been updated.',
      });
    } catch (err) {
      console.error('Error saving notification settings:', err);
      toast({
        title: 'Error',
        description: 'Failed to save notification settings',
        variant: 'destructive',
      });
    } finally {
      setSavingNotifications(false);
    }
  };

  const testTelegramNotification = async () => {
    if (!notificationSettings.telegram_chat_id) {
      toast({
        title: 'Missing Chat ID',
        description: 'Please enter your Telegram Chat ID first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setTestingNotification(true);

      const { error } = await supabase.functions.invoke('telegram-notify', {
        body: {
          user_id: user?.id,
          type: 'fulfillment_success',
          data: {
            order_id: 'TEST-12345',
            item_title: 'Test Notification',
            buyer_username: 'TestBuyer',
          },
        },
      });

      if (error) throw error;

      toast({
        title: 'Test sent!',
        description: 'Check your Telegram for the test message.',
      });
    } catch (err) {
      console.error('Error testing notification:', err);
      toast({
        title: 'Test failed',
        description: 'Could not send test message. Check your Chat ID.',
        variant: 'destructive',
      });
    } finally {
      setTestingNotification(false);
    }
  };

  const saveModelPreference = async (model: string) => {
    if (!user) return;

    setSelectedModel(model);
    
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          ai_model: model,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: 'Model updated',
        description: `AI model set to ${AI_MODELS.find(m => m.value === model)?.label}`,
      });
    } catch (error) {
      console.error('Error saving model:', error);
      toast({
        title: 'Error',
        description: 'Failed to save model preference',
        variant: 'destructive',
      });
    }
  };

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
      toast({
        title: 'Category added',
        description: `"${newCategory.trim()}" has been added to your categories.`,
      });
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
    toast({
      title: 'Category removed',
      description: `"${cat}" has been removed from your categories.`,
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          seller_business_name: sellerBusinessName,
          seller_address: sellerAddress,
          seller_street: sellerStreet || null,
          seller_city: sellerCity || null,
          seller_postal_code: sellerPostalCode || null,
          seller_country: sellerCountry || null,
          seller_vat_number: sellerVatNumber,
          seller_email: sellerEmail,
          seller_contact_name: sellerContactName,
          seller_contact_department: sellerContactDepartment,
          seller_contact_phone: sellerContactPhone,
          seller_contact_email: sellerContactEmail,
          invoice_prefix: invoicePrefix,
          invoice_motto: invoiceMotto,
          invoice_template: invoiceTemplate,
          invoice_logo_url: invoiceLogoUrl,
          invoice_email_subject: invoiceEmailSubject,
          invoice_email_body_html: invoiceEmailBodyHtml,
          invoice_layout: invoiceLayout,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: 'Settings saved',
        description: 'Your preferences have been updated successfully.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file (PNG, JPG, or SVG)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/invoice-logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('invoice-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('invoice-logos')
        .getPublicUrl(fileName);

      setInvoiceLogoUrl(publicUrl);
      toast({
        title: 'Logo uploaded',
        description: 'Your logo has been uploaded successfully.',
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload logo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setInvoiceLogoUrl('');
    toast({
      title: 'Logo removed',
      description: 'Your logo will be removed when you save settings.',
    });
  };

  const selectedModelInfo = AI_MODELS.find(m => m.value === selectedModel);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Configure your tax companion preferences</p>
      </div>

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="account" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Invoices</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Preferences</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          {/* User Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Account Info</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Email</Label>
                <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
              </div>
              <div>
                <Label>User ID</Label>
                <p className="text-sm text-muted-foreground mt-1 font-mono text-xs">{user?.id}</p>
              </div>
            </CardContent>
          </Card>

          {/* Privacy & Data */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Privacy & Data</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mask buyer names</Label>
                  <p className="text-sm text-muted-foreground">Show "J*** D***" instead of full names</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <h4 className="font-medium text-destructive mb-2">Danger Zone</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Permanently delete all your data. This action cannot be undone.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Delete All My Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all your transactions, payouts, imports, and
                        settings. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Yes, delete everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-accent" />
                  <CardTitle className="font-heading">Business Details</CardTitle>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyInbewBusinessDefaults({ overwrite: true })}
                >
                  Use inbew details
                </Button>
              </div>
              <CardDescription>Configure your business details for VAT invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="business-name">Business Name</Label>
                  <Input
                    id="business-name"
                    placeholder="Your Business Name"
                    value={sellerBusinessName}
                    onChange={(e) => setSellerBusinessName(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="vat-number">VAT Number</Label>
                  <Input
                    id="vat-number"
                    placeholder="DE123456789"
                    value={sellerVatNumber}
                    onChange={(e) => setSellerVatNumber(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="seller-email">Invoice Email</Label>
                  <Input
                    id="seller-email"
                    type="email"
                    placeholder="invoices@yourbusiness.com"
                    value={sellerEmail}
                    onChange={(e) => setSellerEmail(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="invoice-prefix">Invoice Prefix</Label>
                  <Input
                    id="invoice-prefix"
                    placeholder="INV"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="seller-address">Business Address</Label>
                  <div className="mt-1.5 grid gap-3 md:grid-cols-2">
                    <Input
                      placeholder="Street"
                      value={sellerStreet}
                      onChange={(e) => setSellerStreet(e.target.value)}
                    />
                    <Input
                      placeholder="City"
                      value={sellerCity}
                      onChange={(e) => setSellerCity(e.target.value)}
                    />
                    <Input
                      placeholder="Postal code"
                      value={sellerPostalCode}
                      onChange={(e) => setSellerPostalCode(e.target.value)}
                    />
                    <Input
                      placeholder="Country"
                      value={sellerCountry}
                      onChange={(e) => setSellerCountry(e.target.value)}
                    />
                  </div>
                  <div className="mt-3">
                    <Label htmlFor="seller-address" className="text-xs text-muted-foreground">
                      Address line 2 / extra lines (optional)
                    </Label>
                    <Input
                      id="seller-address"
                      placeholder="e.g., Building, Suite, VAT office, etc."
                      value={sellerAddress}
                      onChange={(e) => setSellerAddress(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-accent" />
                    <h4 className="font-medium">EN16931 (German e-invoice) Contact</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Required for strict EN16931/ZUGFeRD XML. If any field is empty, invoices still generate but you’ll get a Telegram warning.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="seller-contact-name">Contact Name</Label>
                    <Input
                      id="seller-contact-name"
                      placeholder="Jane Doe"
                      value={sellerContactName}
                      onChange={(e) => setSellerContactName(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="seller-contact-department">Department</Label>
                    <Input
                      id="seller-contact-department"
                      placeholder="Accounting"
                      value={sellerContactDepartment}
                      onChange={(e) => setSellerContactDepartment(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="seller-contact-phone">Phone</Label>
                    <Input
                      id="seller-contact-phone"
                      placeholder="+49 30 123456"
                      value={sellerContactPhone}
                      onChange={(e) => setSellerContactPhone(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="seller-contact-email">Contact Email</Label>
                    <Input
                      id="seller-contact-email"
                      type="email"
                      placeholder="accounting@yourbusiness.com"
                      value={sellerContactEmail}
                      onChange={(e) => setSellerContactEmail(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logo & Branding */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Image className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Logo & Branding</CardTitle>
              </div>
              <CardDescription>Add your logo and motto to invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="logo-upload">Company Logo</Label>
                <p className="text-xs text-muted-foreground mb-2">Recommended: 300×100px, PNG or SVG</p>
                <div className="flex items-center gap-4">
                  {invoiceLogoUrl ? (
                    <div className="relative">
                      <img 
                        src={invoiceLogoUrl} 
                        alt="Invoice logo" 
                        className="h-16 max-w-[200px] object-contain rounded border bg-white p-2"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={handleRemoveLogo}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-16 w-[200px] rounded border-2 border-dashed border-muted-foreground/30 bg-muted/50">
                      <span className="text-xs text-muted-foreground">No logo uploaded</span>
                    </div>
                  )}
                  <div>
                    <Input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      disabled={uploadingLogo}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      disabled={uploadingLogo}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="invoice-motto">Business Motto / Tagline</Label>
                <Input
                  id="invoice-motto"
                  placeholder="Quality products, exceptional service"
                  value={invoiceMotto}
                  onChange={(e) => setInvoiceMotto(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">Appears below your business name on invoices</p>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Layout Options */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Invoice Template</CardTitle>
              <CardDescription>Choose your preferred invoice design</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div 
                  className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${invoiceTemplate === 'modern' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
                  onClick={() => setInvoiceTemplate('modern')}
                >
                  {invoiceTemplate === 'modern' && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="default" className="text-xs">Selected</Badge>
                    </div>
                  )}
                  <div className="aspect-[3/4] bg-background rounded border mb-3 p-2">
                    <div className="space-y-1">
                      <div className="h-6 w-full bg-gradient-to-r from-primary/40 to-accent/30 rounded mb-2"></div>
                      <div className="h-2 w-full bg-muted rounded"></div>
                      <div className="h-2 w-3/4 bg-muted rounded"></div>
                      <div className="h-4 mt-2"></div>
                      <div className="h-2 w-full bg-muted rounded"></div>
                    </div>
                  </div>
                  <p className="font-medium text-sm">Modern</p>
                  <p className="text-xs text-muted-foreground">Sleek gradient header</p>
                </div>

                <div 
                  className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${invoiceTemplate === 'classic' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
                  onClick={() => setInvoiceTemplate('classic')}
                >
                  {invoiceTemplate === 'classic' && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="default" className="text-xs">Selected</Badge>
                    </div>
                  )}
                  <div className="aspect-[3/4] bg-background rounded border mb-3 p-2">
                    <div className="space-y-1">
                      <div className="h-3 w-16 bg-primary/30 rounded"></div>
                      <div className="h-2 w-12 bg-muted rounded"></div>
                      <div className="h-8 mt-2"></div>
                      <div className="h-2 w-full bg-muted rounded"></div>
                      <div className="h-2 w-3/4 bg-muted rounded"></div>
                      <div className="h-2 w-1/2 bg-muted rounded"></div>
                    </div>
                  </div>
                  <p className="font-medium text-sm">Classic</p>
                  <p className="text-xs text-muted-foreground">Clean and professional</p>
                </div>

                <div 
                  className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${invoiceTemplate === 'compact' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
                  onClick={() => setInvoiceTemplate('compact')}
                >
                  {invoiceTemplate === 'compact' && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="default" className="text-xs">Selected</Badge>
                    </div>
                  )}
                  <div className="aspect-[3/4] bg-background rounded border mb-3 p-2">
                    <div className="flex gap-1">
                      <div className="h-full w-1/3 space-y-1">
                        <div className="h-2 w-full bg-accent/30 rounded"></div>
                        <div className="h-2 w-3/4 bg-muted rounded"></div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-full bg-muted rounded"></div>
                        <div className="h-2 w-3/4 bg-muted rounded"></div>
                        <div className="h-2 w-1/2 bg-muted rounded"></div>
                      </div>
                    </div>
                  </div>
                  <p className="font-medium text-sm">Compact</p>
                  <p className="text-xs text-muted-foreground">Space-efficient layout</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <InvoiceLayoutDesigner value={invoiceLayout} onChange={setInvoiceLayout} />
        </TabsContent>

        {/* Email / SMTP Tab */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">Email / SMTP</CardTitle>
              </div>
              <CardDescription>
                Configure your own SMTP server for email delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                <div className="space-y-0.5">
                  <p className="font-medium">Connection status</p>
                  {smtpVerifiedAt ? (
                    <p className="text-sm text-muted-foreground">
                      Verified {format(new Date(smtpVerifiedAt), 'PPpp')}
                    </p>
                  ) : smtpLastError ? (
                    <p className="text-sm text-muted-foreground">Not verified</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not verified yet</p>
                  )}
                </div>
                {smtpVerifiedAt ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-accent" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span>Not connected</span>
                  </div>
                )}
              </div>

              {smtpLastError && (
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-accent" />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">Last error</p>
                      <p className="text-sm text-muted-foreground break-words">{smtpLastError}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                <div>
                  <p className="font-medium">Use custom SMTP</p>
                  <p className="text-sm text-muted-foreground">Send emails via your own provider</p>
                </div>
                <Switch checked={useCustomSmtp} onCheckedChange={setUseCustomSmtp} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input
                    id="smtp-host"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.yourdomain.com"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-port">SMTP port</Label>
                  <Input
                    id="smtp-port"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="465"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-card p-4 md:col-span-2">
                  <div>
                    <p className="font-medium">Use SSL/TLS</p>
                    <p className="text-sm text-muted-foreground">Usually enabled for port 465</p>
                  </div>
                  <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} disabled={!useCustomSmtp} />
                </div>

                <div>
                  <Label htmlFor="smtp-username">SMTP username</Label>
                  <Input
                    id="smtp-username"
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    placeholder="username@yourdomain.com"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-password">SMTP password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank to keep your existing password.
                  </p>
                </div>

                <div>
                  <Label htmlFor="smtp-from-email">From email</Label>
                  <Input
                    id="smtp-from-email"
                    type="email"
                    value={smtpFromEmail}
                    onChange={(e) => setSmtpFromEmail(e.target.value)}
                    placeholder="no-reply@yourdomain.com"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-from-name">From name</Label>
                  <Input
                    id="smtp-from-name"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    placeholder="Your Store"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="smtp-reply-to">Reply-to</Label>
                  <Input
                    id="smtp-reply-to"
                    value={smtpReplyTo}
                    onChange={(e) => setSmtpReplyTo(e.target.value)}
                    placeholder="support@yourdomain.com"
                    className="mt-1.5"
                    disabled={!useCustomSmtp}
                  />
                </div>
              </div>

              {/* Email Delivery Options */}
              <div className="border-t pt-6">
                <h4 className="font-medium mb-4">Email Delivery Options</h4>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="smtp-bcc">BCC Email</Label>
                    <Input
                      id="smtp-bcc"
                      type="email"
                      value={smtpBccEmail}
                      onChange={(e) => setSmtpBccEmail(e.target.value)}
                      placeholder="you@yourdomain.com"
                      className="mt-1.5"
                      disabled={!useCustomSmtp}
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Receive a blind copy of all delivery emails
                    </p>
                  </div>
                  <div>
                    <Label>Email Footer</Label>
                    <div className="mt-1.5">
                      <EmailFooterEditor
                        value={smtpEmailFooterHtml}
                        onChange={setSmtpEmailFooterHtml}
                        disabled={!useCustomSmtp}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <p className="font-medium mb-2">Send a test email</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="smtp-test-to">Send to</Label>
                      <Input
                        id="smtp-test-to"
                        type="email"
                        value={smtpTestTo}
                        onChange={(e) => setSmtpTestTo(e.target.value)}
                        placeholder={user?.email || 'you@domain.com'}
                        className="mt-1.5"
                        disabled={!useCustomSmtp}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={testSmtpEmail}
                      disabled={smtpTesting || smtpLoading || !useCustomSmtp}
                      className="gap-2"
                    >
                      {smtpTesting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send test email
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 md:items-center">
                <Button onClick={saveSmtpSettings} disabled={smtpSaving || smtpLoading}>
                  {smtpSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save SMTP Settings'
                  )}
                </Button>
                {smtpLoading && <span className="text-sm text-muted-foreground">Loading…</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Region & Currency */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-accent" />
                  <CardTitle className="font-heading">Region & Currency</CardTitle>
                </div>
                <CardDescription>Set your location and currency preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="country">Country/Region</Label>
                  <Select defaultValue="US">
                    <SelectTrigger id="country" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="CA">Canada</SelectItem>
                      <SelectItem value="UK">United Kingdom</SelectItem>
                      <SelectItem value="AU">Australia</SelectItem>
                      <SelectItem value="DE">Germany</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="currency">Display Currency</Label>
                  <Select defaultValue="USD">
                    <SelectTrigger id="currency" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="CAD">CAD ($)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="AUD">AUD ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Tax Year */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-accent" />
                  <CardTitle className="font-heading">Tax Year</CardTitle>
                </div>
                <CardDescription>Configure your tax year settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="taxyear">Current Tax Year</Label>
                  <Select defaultValue="2024">
                    <SelectTrigger id="taxyear" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2023">2023</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="yearstart">Tax Year Start</Label>
                  <Select defaultValue="jan">
                    <SelectTrigger id="yearstart" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jan">January 1</SelectItem>
                      <SelectItem value="apr">April 1 (UK)</SelectItem>
                      <SelectItem value="jul">July 1 (Australia)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Display Preferences */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-accent" />
                  <CardTitle className="font-heading">Display Preferences</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show cents in amounts</Label>
                    <p className="text-sm text-muted-foreground">Display $1,234.56 vs $1,235</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Use 24-hour time</Label>
                    <p className="text-sm text-muted-foreground">Display 14:30 vs 2:30 PM</p>
                  </div>
                  <Switch />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Compact number format</Label>
                    <p className="text-sm text-muted-foreground">Display $10.5K vs $10,500</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            {/* Categories */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-accent" />
                  <CardTitle className="font-heading">Categories</CardTitle>
                </div>
                <CardDescription>Manage categories for organizing your transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  {categories.map((cat) => (
                    <Badge key={cat} variant="secondary" className="gap-1 pr-1">
                      {cat}
                      <button
                        onClick={() => removeCategory(cat)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="New category name..."
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                    className="max-w-xs"
                  />
                  <Button variant="outline" onClick={addCategory}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Telegram Notifications
                </CardTitle>
                <CardDescription>
                  Get real-time alerts for auto-fulfillment events via Telegram
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">Setup Instructions:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>
                      Open Telegram and start a chat with{' '}
                      <a 
                        href="https://t.me/InbewBot" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        @InbewBot
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Send the /start command to the bot</li>
                    <li>
                      Get your Chat ID by messaging{' '}
                      <a 
                        href="https://t.me/userinfobot" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        @userinfobot
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Enter your Chat ID below and save</li>
                  </ol>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
                    <Input
                      id="telegram-chat-id"
                      placeholder="e.g., 123456789"
                      value={notificationSettings.telegram_chat_id}
                      onChange={(e) => setNotificationSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Telegram Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Turn on/off all Telegram notifications
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.telegram_enabled}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, telegram_enabled: checked }))}
                    />
                  </div>
                </div>

                {notificationSettings.telegram_enabled && (
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium">Notification Preferences</h4>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-accent" />
                          <span className="text-sm">Successful Fulfillments</span>
                        </div>
                        <Switch
                          checked={notificationSettings.notify_fulfillment_success}
                          onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, notify_fulfillment_success: checked }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-sm">Failed Fulfillments</span>
                        </div>
                        <Switch
                          checked={notificationSettings.notify_fulfillment_failed}
                          onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, notify_fulfillment_failed: checked }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          <span className="text-sm">Out of Stock Alerts</span>
                        </div>
                        <Switch
                          checked={notificationSettings.notify_out_of_stock}
                          onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, notify_out_of_stock: checked }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm">Daily Summary</span>
                        </div>
                        <Switch
                          checked={notificationSettings.notify_daily_summary}
                          onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, notify_daily_summary: checked }))}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={saveNotificationSettings}
                    disabled={savingNotifications}
                  >
                    {savingNotifications ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Settings'
                    )}
                  </Button>
                  {savedChatId && (
                    <Button
                      onClick={testTelegramNotification}
                      variant="outline"
                      disabled={testingNotification}
                    >
                      {testingNotification ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Test Notification
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Tab */}
        <TabsContent value="ai" className="space-y-6">
          <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <CardTitle className="font-heading">AI Listing Improver</CardTitle>
              </div>
              <CardDescription>Configure AI model and manage your credits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Credits Display */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="rounded-full bg-accent/10 p-2">
                      <Coins className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Available Credits</p>
                      <p className="text-3xl font-bold text-foreground">{aiCredits}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Each listing improvement costs {selectedModelInfo?.cost || 1} credit(s) with {selectedModelInfo?.label}
                  </p>
                  <Button variant="outline" className="w-full gap-2" disabled>
                    <Plus className="h-4 w-4" />
                    Buy Credits (Coming Soon)
                  </Button>
                </div>

                {/* Model Selection */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="ai-model">AI Model</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Higher quality models use more credits per request
                    </p>
                    <Select value={selectedModel} onValueChange={saveModelPreference}>
                      <SelectTrigger id="ai-model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            <div className="flex items-center justify-between gap-4">
                              <span>{model.label}</span>
                              <Badge variant="secondary" className="ml-2">
                                {model.cost} credit{model.cost > 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <p className="font-medium mb-1">Model Info:</p>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>• <strong>GPT-4o Mini:</strong> Fast, good for simple listings</li>
                      <li>• <strong>GPT-4o:</strong> Balanced quality and speed</li>
                      <li>• <strong>GPT-4.1:</strong> Higher quality suggestions</li>
                      <li>• <strong>GPT-5:</strong> Best quality, most detailed</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button variant="accent" onClick={handleSave} className="gap-2" disabled={isSaving}>
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
