import { useState, useEffect } from 'react';
import { Send, Download, Loader2, FileText, Mail, Edit2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Transaction {
  id: string;
  order_id: string;
  item_title: string;
  gross: number;
  fees: number;
  net: number;
  tax_collected: number;
  currency: string;
  date: string;
  buyer_country: string;
}

interface InvoiceDialogProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvoiceCreated?: () => void;
}

export function InvoiceDialog({ transaction, open, onOpenChange, onInvoiceCreated }: InvoiceDialogProps) {
  const [buyerEmail, setBuyerEmail] = useState('');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [buyerAddress, setBuyerAddress] = useState<any>(null);
  const [editingEmail, setEditingEmail] = useState(false);

  useEffect(() => {
    if (transaction && open) {
      loadBuyerAddress();
    }
  }, [transaction, open]);

  const loadBuyerAddress = async () => {
    if (!transaction) return;
    
    setIsLoadingAddress(true);
    try {
      const { data, error } = await supabase
        .from('buyer_addresses')
        .select('*')
        .eq('order_id', transaction.order_id)
        .single();

      if (data && !error) {
        setBuyerAddress(data);
        setBuyerEmail(data.buyer_email || '');
      }
    } catch (error) {
      console.error('Error loading buyer address:', error);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const generateInvoice = async (sendEmail: boolean) => {
    if (!transaction) return;

    const setLoading = sendEmail ? setIsSending : setIsGenerating;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            transactionId: transaction.id,
            buyerEmail: buyerEmail || undefined,
            sendEmail,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate invoice');
      }

      if (result.invoiceHTML) {
        // Open invoice in new window for download/print
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(result.invoiceHTML);
          printWindow.document.close();
        }
      }

      if (sendEmail) {
        if (result.emailSent) {
          toast({
            title: 'Invoice sent!',
            description: `Invoice ${result.invoice.invoice_number} sent to ${buyerEmail}`,
          });
        } else {
          toast({
            title: 'Invoice created',
            description: result.emailError || 'Email could not be sent. Invoice is available for download.',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Invoice generated',
          description: `Invoice ${result.invoice.invoice_number} is ready for download`,
        });
      }

      onInvoiceCreated?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Invoice error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate invoice',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);
  };

  if (!transaction) return null;

  const hasEbayTax = (transaction.tax_collected || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            Generate Invoice
          </DialogTitle>
          <DialogDescription>
            Create a VAT invoice for this transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Transaction Summary */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-medium mb-2 line-clamp-2">{transaction.item_title}</h4>
            <div className="text-sm text-muted-foreground mb-2">
              Order: {transaction.order_id}
            </div>
            <div className="flex items-center gap-2 mb-3">
              {hasEbayTax ? (
                <Badge variant="default" className="bg-success/10 text-success border-success/20">
                  eBay Collected Tax
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">
                  No eBay Tax Collection
                </Badge>
              )}
              <Badge variant="outline">{transaction.buyer_country}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Gross:</span>{' '}
                <span className="font-medium">{formatCurrency(transaction.gross, transaction.currency)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tax:</span>{' '}
                <span className="font-medium">{formatCurrency(transaction.tax_collected || 0, transaction.currency)}</span>
              </div>
            </div>
          </div>

          {/* Buyer Info */}
          {isLoadingAddress ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="flex items-center justify-between">
                  <span>Buyer Email</span>
                  {!editingEmail && buyerEmail && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setEditingEmail(true)}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </Label>
                {editingEmail || !buyerEmail ? (
                  <Input
                    type="email"
                    placeholder="buyer@example.com"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    className="mt-1.5"
                  />
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {buyerEmail}
                  </div>
                )}
                {buyerAddress && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {buyerAddress.full_name && `${buyerAddress.full_name} • `}
                    {buyerAddress.city && `${buyerAddress.city}, `}
                    {buyerAddress.country_code}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
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
              Download Only
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
              Send Invoice
            </Button>
          </div>

          {!buyerEmail && (
            <p className="text-xs text-muted-foreground text-center">
              Enter a buyer email to enable sending
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
