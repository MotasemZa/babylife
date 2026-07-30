import { useEffect, useMemo, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string | null;
  currency: string | null;
  order_id: string;
  seller_name: string | null;
  seller_email: string | null;
  seller_address: string | null;
  seller_vat_number: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_address: string | null;
  buyer_vat_number: string | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total: number | null;
  line_items: any;
};

interface InvoiceEditDialogProps {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function toDateInputValue(iso: string) {
  // ISO -> YYYY-MM-DD
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function InvoiceEditDialog({ invoice, open, onOpenChange, onSaved }: InvoiceEditDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const initialLineItems = useMemo(() => {
    if (!invoice) return '[]';
    try {
      return JSON.stringify(invoice.line_items ?? [], null, 2);
    } catch {
      return '[]';
    }
  }, [invoice]);

  const [form, setForm] = useState({
    invoice_number: '',
    invoice_date: '',
    status: 'draft',
    currency: 'EUR',
    seller_name: '',
    seller_email: '',
    seller_address: '',
    seller_vat_number: '',
    buyer_name: '',
    buyer_email: '',
    buyer_address: '',
    buyer_vat_number: '',
    subtotal: '',
    tax_rate: '',
    tax_amount: '',
    total: '',
    line_items_json: '[]',
  });

  useEffect(() => {
    if (!invoice) return;
    setForm({
      invoice_number: invoice.invoice_number ?? '',
      invoice_date: invoice.invoice_date ? toDateInputValue(invoice.invoice_date) : '',
      status: invoice.status ?? 'draft',
      currency: invoice.currency ?? 'EUR',
      seller_name: invoice.seller_name ?? '',
      seller_email: invoice.seller_email ?? '',
      seller_address: invoice.seller_address ?? '',
      seller_vat_number: invoice.seller_vat_number ?? '',
      buyer_name: invoice.buyer_name ?? '',
      buyer_email: invoice.buyer_email ?? '',
      buyer_address: invoice.buyer_address ?? '',
      buyer_vat_number: invoice.buyer_vat_number ?? '',
      subtotal: invoice.subtotal != null ? String(invoice.subtotal) : '',
      tax_rate: invoice.tax_rate != null ? String(invoice.tax_rate) : '',
      tax_amount: invoice.tax_amount != null ? String(invoice.tax_amount) : '',
      total: invoice.total != null ? String(invoice.total) : '',
      line_items_json: initialLineItems,
    });
  }, [invoice, initialLineItems]);

  const onChange = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, [key]: e.target.value }));
  };

  const handleSave = async () => {
    if (!invoice) return;

    let parsedLineItems: any;
    try {
      parsedLineItems = JSON.parse(form.line_items_json || '[]');
    } catch {
      toast.error('Line items must be valid JSON');
      return;
    }

    const toNumOrNull = (v: string) => {
      if (!v.trim()) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    setIsSaving(true);
    try {
      const payload = {
        invoice_number: form.invoice_number || null,
        invoice_date: form.invoice_date ? new Date(form.invoice_date).toISOString() : null,
        status: form.status || null,
        currency: form.currency || null,
        seller_name: form.seller_name || null,
        seller_email: form.seller_email || null,
        seller_address: form.seller_address || null,
        seller_vat_number: form.seller_vat_number || null,
        buyer_name: form.buyer_name || null,
        buyer_email: form.buyer_email || null,
        buyer_address: form.buyer_address || null,
        buyer_vat_number: form.buyer_vat_number || null,
        subtotal: toNumOrNull(form.subtotal),
        tax_rate: toNumOrNull(form.tax_rate),
        tax_amount: toNumOrNull(form.tax_amount),
        total: toNumOrNull(form.total),
        line_items: parsedLineItems,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('invoices')
        .update(payload)
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success('Invoice saved');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save invoice');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Edit Invoice</DialogTitle>
          <DialogDescription>
            Update invoice fields, then save. Order: {invoice?.order_id}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input id="invoice_number" value={form.invoice_number} onChange={onChange('invoice_number')} className="mt-1.5" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="invoice_date">Invoice Date</Label>
                <Input id="invoice_date" type="date" value={form.invoice_date} onChange={onChange('invoice_date')} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Input id="status" value={form.status} onChange={onChange('status')} className="mt-1.5" placeholder="draft / sent / paid" />
              </div>
            </div>

            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value={form.currency} onChange={onChange('currency')} className="mt-1.5" placeholder="EUR" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="subtotal">Subtotal</Label>
                <Input id="subtotal" inputMode="decimal" value={form.subtotal} onChange={onChange('subtotal')} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="total">Total</Label>
                <Input id="total" inputMode="decimal" value={form.total} onChange={onChange('total')} className="mt-1.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tax_rate">Tax Rate (%)</Label>
                <Input id="tax_rate" inputMode="decimal" value={form.tax_rate} onChange={onChange('tax_rate')} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="tax_amount">Tax Amount</Label>
                <Input id="tax_amount" inputMode="decimal" value={form.tax_amount} onChange={onChange('tax_amount')} className="mt-1.5" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="seller_name">Seller Name</Label>
              <Input id="seller_name" value={form.seller_name} onChange={onChange('seller_name')} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="seller_email">Seller Email</Label>
              <Input id="seller_email" type="email" value={form.seller_email} onChange={onChange('seller_email')} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="seller_vat_number">Seller VAT Number</Label>
              <Input id="seller_vat_number" value={form.seller_vat_number} onChange={onChange('seller_vat_number')} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="seller_address">Seller Address</Label>
              <Textarea id="seller_address" value={form.seller_address} onChange={onChange('seller_address')} className="mt-1.5 min-h-24" />
            </div>

            <div className="pt-2">
              <Label htmlFor="buyer_name">Buyer Name</Label>
              <Input id="buyer_name" value={form.buyer_name} onChange={onChange('buyer_name')} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="buyer_email">Buyer Email</Label>
              <Input id="buyer_email" type="email" value={form.buyer_email} onChange={onChange('buyer_email')} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="buyer_vat_number">Buyer VAT Number</Label>
              <Input id="buyer_vat_number" value={form.buyer_vat_number} onChange={onChange('buyer_vat_number')} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="buyer_address">Buyer Address</Label>
              <Textarea id="buyer_address" value={form.buyer_address} onChange={onChange('buyer_address')} className="mt-1.5 min-h-24" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="line_items">Line Items (JSON)</Label>
          <Textarea
            id="line_items"
            value={form.line_items_json}
            onChange={onChange('line_items_json')}
            className="min-h-48 font-mono text-xs"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="accent" onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
