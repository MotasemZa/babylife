import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  TrendingUp,
  DollarSign,
  Receipt,
  Truck,
  RotateCcw,
  Download,
  Eye,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InvoiceEditDialog } from '@/components/invoices/InvoiceEditDialog';
import { useDemoData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ImportError {
  type: string;
  message: string;
}

interface ImportHistoryItem {
  id: string;
  type: string;
  file_name: string | null;
  created_at: string;
  status: string | null;
  row_count: number | null;
  error_count: number | null;
  errors: unknown;
}

// Helper to parse errors from JSON column
const parseImportErrors = (errors: unknown): ImportError[] => {
  if (!errors) return [];
  if (Array.isArray(errors)) {
    return errors.filter(
      (e): e is ImportError =>
        typeof e === 'object' && e !== null && 'type' in e && 'message' in e
    );
  }
  return [];
};

const MAX_VISIBLE_ERRORS = 3;

function ErrorList({ errors }: { errors: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => parseImportErrors(errors), [errors]);

  if (parsed.length === 0) return null;

  const visible = expanded ? parsed : parsed.slice(0, MAX_VISIBLE_ERRORS);
  const hiddenCount = parsed.length - MAX_VISIBLE_ERRORS;

  return (
    <div className="mt-3 ml-14 space-y-2">
      {visible.map((err, idx) => (
        <div
          key={idx}
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <span className="font-medium text-destructive capitalize">{err.type}:</span>{' '}
          <span className="text-muted-foreground">{err.message}</span>
        </div>
      ))}
      {hiddenCount > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Show {hiddenCount} more error{hiddenCount > 1 ? 's' : ''}
        </button>
      )}
      {expanded && parsed.length > MAX_VISIBLE_ERRORS && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Show less
        </button>
      )}
    </div>
  );
}

export default function Reports() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { kpis, monthlyMetrics, categoryBreakdown } = useDemoData();
  const [period, setPeriod] = useState('year');
  const [year, setYear] = useState('2024');

  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteInvoice, setDeleteInvoice] = useState<any>(null);

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch sync history (import history)
  const { data: syncHistory, isLoading: syncHistoryLoading } = useQuery({
    queryKey: ['import_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_history')
        .select('id, type, file_name, created_at, status, row_count, error_count, errors')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ImportHistoryItem[];
    },
    enabled: !!user,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCurrencyWithDecimals = (value: number | null, currency: string = 'EUR') => {
    if (value === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);
  };

  const viewInvoice = async (invoiceId: string) => {
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
            invoiceId,
            regenerate: true,
          }),
        }
      );

      const result = await response.json();

      if (result.invoiceHTML) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(result.invoiceHTML);
          printWindow.document.close();
        }
      }
    } catch (error: any) {
      toast.error('Failed to load invoice');
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-success/10 text-success border-success/20">Sent</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'paid':
        return <Badge className="bg-accent/10 text-accent border-accent/20">Paid</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  const taxSummary = [
    { label: 'Gross Sales', value: kpis.grossSales, icon: DollarSign, type: 'income' },
    { label: 'Marketplace Fees', value: kpis.totalFees, icon: Receipt, type: 'expense' },
    { label: 'Shipping Expenses', value: kpis.totalShipping, icon: Truck, type: 'expense' },
    { label: 'Refunds & Returns', value: kpis.totalRefunds, icon: RotateCcw, type: 'expense' },
    { label: 'Sales Tax Collected', value: kpis.taxCollected, icon: FileText, type: 'info' },
    { label: 'Net Profit', value: kpis.netProfit, icon: TrendingUp, type: 'profit' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">
            Financial summaries and invoice history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList>
          <TabsTrigger value="summary">Tax Summary</TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoices
            {invoices && invoices.length > 0 && (
              <Badge variant="secondary" className="ml-1">{invoices.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sync-history" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          {/* Tax Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {taxSummary.map((item) => (
              <Card key={item.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">{item.label}</CardDescription>
                  <item.icon
                    className={cn(
                      'h-4 w-4',
                      item.type === 'income' && 'text-success',
                      item.type === 'expense' && 'text-destructive',
                      item.type === 'profit' && 'text-accent',
                      item.type === 'info' && 'text-muted-foreground'
                    )}
                  />
                </CardHeader>
                <CardContent>
                  <p
                    className={cn(
                      'text-2xl font-bold tabular-nums',
                      item.type === 'expense' && 'text-destructive',
                      item.type === 'profit' && 'text-success'
                    )}
                  >
                    {item.type === 'expense' ? '-' : ''}
                    {formatCurrency(item.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Monthly Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Monthly Breakdown</CardTitle>
              <CardDescription>Totals by month for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-3 text-left text-xs font-medium text-muted-foreground">Month</th>
                      <th className="py-3 text-right text-xs font-medium text-muted-foreground">
                        Gross Sales
                      </th>
                      <th className="py-3 text-right text-xs font-medium text-muted-foreground">Fees</th>
                      <th className="py-3 text-right text-xs font-medium text-muted-foreground">
                        Shipping
                      </th>
                      <th className="py-3 text-right text-xs font-medium text-muted-foreground">
                        Refunds
                      </th>
                      <th className="py-3 text-right text-xs font-medium text-muted-foreground">
                        Net Profit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {monthlyMetrics.map((metric) => (
                      <tr key={metric.month} className="hover:bg-muted/50">
                        <td className="py-3 font-medium text-foreground">
                          {new Date(metric.month + '-01').toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 text-right tabular-nums">
                          {formatCurrency(metric.grossSales)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-destructive">
                          -{formatCurrency(metric.fees)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-destructive">
                          -{formatCurrency(metric.shipping)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-destructive">
                          -{formatCurrency(metric.refunds)}
                        </td>
                        <td
                          className={cn(
                            'py-3 text-right font-medium tabular-nums',
                            metric.netProfit >= 0 ? 'text-success' : 'text-destructive'
                          )}
                        >
                          {formatCurrency(metric.netProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/50 font-medium">
                      <td className="py-3 font-semibold text-foreground">Total</td>
                      <td className="py-3 text-right tabular-nums">
                        {formatCurrency(monthlyMetrics.reduce((sum, m) => sum + m.grossSales, 0))}
                      </td>
                      <td className="py-3 text-right tabular-nums text-destructive">
                        -{formatCurrency(monthlyMetrics.reduce((sum, m) => sum + m.fees, 0))}
                      </td>
                      <td className="py-3 text-right tabular-nums text-destructive">
                        -{formatCurrency(monthlyMetrics.reduce((sum, m) => sum + m.shipping, 0))}
                      </td>
                      <td className="py-3 text-right tabular-nums text-destructive">
                        -{formatCurrency(monthlyMetrics.reduce((sum, m) => sum + m.refunds, 0))}
                      </td>
                      <td className="py-3 text-right tabular-nums text-success font-bold">
                        {formatCurrency(monthlyMetrics.reduce((sum, m) => sum + m.netProfit, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Sales by Category</CardTitle>
              <CardDescription>Breakdown of gross sales by product category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categoryBreakdown.map((cat, index) => (
                  <div key={cat.category} className="flex items-center gap-4">
                    <div className="w-32 font-medium text-foreground">{cat.category}</div>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-500"
                          style={{
                            width: `${cat.percentage}%`,
                            opacity: 1 - index * 0.15,
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right font-medium tabular-nums">
                      {formatCurrency(cat.amount)}
                    </div>
                    <div className="w-16 text-right text-sm text-muted-foreground">
                      {cat.percentage}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline">Export to CSV</Button>
            <Button variant="accent">Download PDF Report</Button>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Invoice History</CardTitle>
              <CardDescription>All invoices you've generated and sent</CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !invoices || invoices.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No invoices yet</h3>
                  <p className="text-muted-foreground">
                    Invoices will appear here after you generate them from orders.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono font-medium">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell>
                          {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium truncate max-w-[150px]">
                              {invoice.buyer_name || 'Unknown'}
                            </p>
                            {invoice.buyer_email && (
                              <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                                {invoice.buyer_email}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {invoice.order_id?.substring(0, 12)}...
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrencyWithDecimals(invoice.total, invoice.currency || 'EUR')}
                        </TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => viewInvoice(invoice.id)}
                              aria-label="View invoice"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => viewInvoice(invoice.id)}
                              aria-label="Download invoice"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingInvoice(invoice);
                                setEditOpen(true);
                              }}
                              aria-label="Edit invoice"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setDeleteInvoice(invoice)}
                              aria-label="Delete invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <InvoiceEditDialog
            invoice={editingInvoice}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['invoices'] })}
          />

          <AlertDialog open={!!deleteInvoice} onOpenChange={(o) => !o && setDeleteInvoice(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete invoice {deleteInvoice?.invoice_number}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteInvoice(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (!deleteInvoice) return;
                    const { error } = await supabase.from('invoices').delete().eq('id', deleteInvoice.id);
                    if (error) {
                      toast.error(error.message || 'Failed to delete invoice');
                      return;
                    }
                    toast.success('Invoice deleted');
                    setDeleteInvoice(null);
                    queryClient.invalidateQueries({ queryKey: ['invoices'] });
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="sync-history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Sync History</CardTitle>
              <CardDescription>View all data syncs from connected platforms</CardDescription>
            </CardHeader>
            <CardContent>
              {syncHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !syncHistory || syncHistory.length === 0 ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No sync history yet</h3>
                  <p className="text-muted-foreground">
                    Sync history will appear here after you connect and sync with a platform.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {syncHistory.map((item) => (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            {item.type === 'ebay' || item.type === 'ebay_api' ? (
                              <LinkIcon className="h-5 w-5 text-accent" />
                            ) : (
                              <RefreshCw className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {item.file_name || (item.type === 'ebay_api' ? 'eBay API Sync' : 'Data Import')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')} · {(item.row_count || 0).toLocaleString()} rows
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {(item.error_count || 0) > 0 && (
                            <Badge variant="outline" className="gap-1 text-warning border-warning/50">
                              <AlertCircle className="h-3 w-3" />
                              {item.error_count} errors
                            </Badge>
                          )}
                          <Badge
                            variant={item.status === 'completed' ? 'default' : 'secondary'}
                            className="gap-1"
                          >
                            {item.status === 'completed' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                            {item.status || 'pending'}
                          </Badge>
                        </div>
                      </div>
                      <ErrorList errors={item.errors} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
