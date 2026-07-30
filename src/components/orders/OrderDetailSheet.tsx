import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  X, 
  Package, 
  User, 
  MapPin, 
  Calendar, 
  DollarSign, 
  FileText, 
  Send,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Transaction } from '@/lib/demo-data';

interface OrderDetailSheetProps {
  order: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailSheet({ order, open, onOpenChange }: OrderDetailSheetProps) {
  const [buyerAddress, setBuyerAddress] = useState<any>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [vatRate, setVatRate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [existingInvoice, setExistingInvoice] = useState<any>(null);

  useEffect(() => {
    if (order && open) {
      loadBuyerAddress();
      checkExistingInvoice();
    }
  }, [order, open]);

  useEffect(() => {
    if (!open) return;
    // Reset per-open inputs; keep email prefill behavior from loadBuyerAddress.
    setVatRate('');
  }, [open, order?.orderId]);

  const loadBuyerAddress = async () => {
    if (!order?.orderId) return;
    
    setIsLoadingAddress(true);
    try {
      const { data, error } = await supabase
        .from('buyer_addresses')
        .select('*')
        .eq('order_id', order.orderId)
        .single();

      if (data && !error) {
        setBuyerAddress(data);
        // Pre-fill buyer email from eBay data
        setBuyerEmail(data.buyer_email || '');
      } else {
        setBuyerAddress(null);
        setBuyerEmail('');
      }
    } catch (error) {
      console.error('Error loading buyer address:', error);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const checkExistingInvoice = async () => {
    if (!order?.orderId) return;

    try {
      // One invoice per order
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('order_id', order.orderId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking existing invoice:', error);
        setExistingInvoice(null);
        return;
      }

      setExistingInvoice(invoice || null);
    } catch (error) {
      console.error('Error checking existing invoice:', error);
    }
  };

  const generateInvoice = async (sendEmail: boolean) => {
    if (!order) return;

     const parsedVatRate = Number(vatRate);
     const vatRateValid = Number.isFinite(parsedVatRate) && parsedVatRate > 0 && parsedVatRate <= 100;
     if (!existingInvoice && !vatRateValid) {
       toast.error('Please enter a valid VAT rate (1–100)');
       return;
     }

    const setLoading = sendEmail ? setIsSending : setIsGenerating;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Get transaction ID from database
      const { data: txData } = await supabase
        .from('transactions')
        .select('id')
        .eq('order_id', order.orderId)
        .single();

      if (!txData) {
        throw new Error('Transaction not found');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            transactionId: txData.id,
            buyerEmail: buyerEmail || undefined,
            vatRate: existingInvoice ? undefined : parsedVatRate,
            sendEmail,
            includePdf: !sendEmail,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate invoice');
      }

      if (!sendEmail && result.pdfBase64) {
        const byteChars = atob(result.pdfBase64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Best-effort cleanup
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else if (!sendEmail && result.invoiceHTML) {
        // Fallback (older invoices): show HTML preview
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(result.invoiceHTML);
          printWindow.document.close();
        }
      }

      // Update existing invoice state
      if (result.invoice) {
        setExistingInvoice(result.invoice);
      }

      if (sendEmail) {
        if (result.emailSent) {
          toast.success(`Invoice ${result.alreadyExists ? 'resent' : 'sent'} to ${buyerEmail}`);
        } else {
          toast.error(result.emailError || 'Email could not be sent');
        }
      } else {
        if (result.alreadyExists) {
          toast.success('Invoice opened');
        } else {
          toast.success('Invoice generated');
        }
      }
    } catch (error: any) {
      console.error('Invoice error:', error);
      toast.error(error.message || 'Failed to generate invoice');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (!order) return null;

  const hasEbayTax = (order.taxCollected || 0) > 0;
  const parsedVatRate = Number(vatRate);
  const vatRateValid = Number.isFinite(parsedVatRate) && parsedVatRate > 0 && parsedVatRate <= 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            Order Details
          </SheetTitle>
          <SheetDescription>
            {order.orderId}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Item Info */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Item</h3>
            <p className="font-medium">{order.itemTitle}</p>
            {order.sku && (
              <p className="text-sm text-muted-foreground">SKU: {order.sku}</p>
            )}
          </div>

          <Separator />

          {/* Order Summary */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financial Summary
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{format(new Date(order.date), 'MMM dd, yyyy HH:mm')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span>{order.quantity || 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross</span>
                <span className="font-medium">{formatCurrency(order.gross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fees</span>
                <span className="text-destructive">{formatCurrency(-Math.abs(order.fees || 0))}</span>
              </div>
              {order.shippingCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping Cost</span>
                  <span className="text-destructive">{formatCurrency(-order.shippingCost)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Net Profit</span>
                <span className="text-success">{formatCurrency(order.net)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tax Status */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Tax Information
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax Collected</span>
                <span>{formatCurrency(order.taxCollected || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                {hasEbayTax ? (
                  <Badge className="bg-success/10 text-success border-success/20">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    eBay Collected Tax
                  </Badge>
                ) : (
                  <Badge className="bg-warning/10 text-warning border-warning/20">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    No eBay Tax Collection
                  </Badge>
                )}
                {order.buyerCountry && (
                  <Badge variant="outline">{order.buyerCountry}</Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Buyer Info */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Buyer Information
            </h3>
            {isLoadingAddress ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : buyerAddress ? (
              <div className="space-y-2 text-sm">
                {buyerAddress.full_name && (
                  <p className="font-medium">{buyerAddress.full_name}</p>
                )}
                {buyerAddress.buyer_username && (
                  <p className="text-muted-foreground">@{buyerAddress.buyer_username}</p>
                )}
                {buyerAddress.street_address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p>{buyerAddress.street_address}</p>
                      <p>{buyerAddress.city}{buyerAddress.postal_code && `, ${buyerAddress.postal_code}`}</p>
                      <p>{buyerAddress.state_province && `${buyerAddress.state_province}, `}{buyerAddress.country_name || buyerAddress.country_code}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No buyer address available</p>
            )}
          </div>

          {/* Invoice Section - only show if eBay didn't collect tax */}
          {!hasEbayTax && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {existingInvoice ? 'Invoice' : 'Generate Invoice'}
                </h3>
                
                {existingInvoice ? (
                  // Invoice already exists - show info and allow resend
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span className="font-medium">{existingInvoice.invoice_number}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Created on {format(new Date(existingInvoice.invoice_date), 'MMM dd, yyyy')}
                        {existingInvoice.sent_at && (
                          <> • Sent to {existingInvoice.sent_to_email}</>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="buyer-email">Resend to Email</Label>
                      <Input
                        id="buyer-email"
                        type="email"
                        placeholder="buyer@example.com"
                        value={buyerEmail}
                        onChange={(e) => setBuyerEmail(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => generateInvoice(false)}
                        disabled={isGenerating || isSending}
                      >
                        {isGenerating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        View/Download
                      </Button>
                      <Button
                        variant="accent"
                        className="flex-1 gap-2"
                        onClick={() => generateInvoice(true)}
                        disabled={isGenerating || isSending || !buyerEmail}
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Resend
                      </Button>
                    </div>
                  </div>
                ) : (
                  // No invoice yet - allow creation
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      eBay did not collect tax for this order. You may need to send an invoice.
                    </p>
                    <div>
                      <Label htmlFor="buyer-email">Buyer Email</Label>
                      <Input
                        id="buyer-email"
                        type="email"
                        placeholder="buyer@example.com"
                        value={buyerEmail}
                        onChange={(e) => setBuyerEmail(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="vat-rate">VAT rate (%)</Label>
                      <Input
                        id="vat-rate"
                        inputMode="decimal"
                        placeholder="e.g. 21"
                        value={vatRate}
                        onChange={(e) => setVatRate(e.target.value)}
                        className="mt-1.5"
                      />
                      {!vatRateValid && vatRate.trim() !== '' && (
                        <p className="mt-1 text-xs text-muted-foreground">Enter a number between 1 and 100.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => generateInvoice(false)}
                        disabled={isGenerating || isSending || !vatRateValid}
                      >
                        {isGenerating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Download
                      </Button>
                      <Button
                        variant="accent"
                        className="flex-1 gap-2"
                        onClick={() => generateInvoice(true)}
                        disabled={isGenerating || isSending || !buyerEmail || !vatRateValid}
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Invoice
                      </Button>
                    </div>
                    {!vatRateValid && (
                      <p className="text-xs text-muted-foreground text-center">VAT rate is required to generate the invoice.</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
