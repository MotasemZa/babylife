import { useState } from 'react';
import {
  Search,
  Filter,
  Download,
  MoreHorizontal,
  ArrowUpDown,
  Eye,
  Tag,
  ChevronLeft,
  ChevronRight,
  Receipt,
  FileText,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EmptyState } from '@/components/common/EmptyState';
import { InvoiceDialog } from '@/components/invoices/InvoiceDialog';
import { useDemoData } from '@/contexts/DataContext';
import { Transaction } from '@/lib/demo-data';
import { cn } from '@/lib/utils';

export default function Transactions() {
  const { transactions, isLoading } = useDemoData();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [invoiceTransaction, setInvoiceTransaction] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch =
      txn.itemTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || txn.category === categoryFilter;
    const matchesType = typeFilter === 'all' || txn.type === typeFilter;
    return matchesSearch && matchesCategory && matchesType;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const categories = [...new Set(transactions.map((t) => t.category))];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      matched: { variant: 'default', label: 'Matched' },
      partially_matched: { variant: 'secondary', label: 'Partial' },
      unmatched: { variant: 'destructive', label: 'Unmatched' },
    };
    const { variant, label } = config[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, { className: string; label: string }> = {
      sale: { className: 'bg-success/10 text-success border-success/20', label: 'Sale' },
      refund: { className: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Refund' },
      fee: { className: 'bg-warning/10 text-warning border-warning/20', label: 'Fee' },
    };
    const { className, label } = config[type] || { className: '', label: type };
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  if (transactions.length === 0 && !isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground">View and manage all your eBay transactions</p>
        </div>
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No transactions yet"
          description="Import your eBay data to see all your transactions here. You can connect your eBay account or upload CSV files."
          action={{
            label: 'Import Data',
            onClick: () => {},
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground">
            {filteredTransactions.length.toLocaleString()} transactions
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title, order ID, or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="refund">Refunds</SelectItem>
              <SelectItem value="fee">Fees</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-foreground">
                    Date <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Item
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Gross
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Fees
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Net
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedTransactions.map((txn) => (
                <tr
                  key={txn.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(txn.date)}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground line-clamp-1 max-w-[200px]">
                        {txn.itemTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">{txn.orderId}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">{getTypeBadge(txn.type)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{txn.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">
                    {formatCurrency(txn.gross)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">
                    -{formatCurrency(txn.fees)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right text-sm font-medium tabular-nums',
                      txn.net >= 0 ? 'text-success' : 'text-destructive'
                    )}
                  >
                    {formatCurrency(txn.net)}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(txn.status)}</td>
                  <td className="px-4 py-3 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedTransaction(txn)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Tag className="mr-2 h-4 w-4" />
                          Change Category
                        </DropdownMenuItem>
                        {txn.type === 'sale' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setInvoiceTransaction(txn)}
                              className={!txn.taxCollected || txn.taxCollected === 0 ? 'text-warning' : ''}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              {!txn.taxCollected || txn.taxCollected === 0 ? 'Send Invoice (No Tax)' : 'Generate Invoice'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of{' '}
            {filteredTransactions.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Transaction Detail Sheet */}
      <Sheet open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedTransaction && (
            <>
              <SheetHeader>
                <SheetTitle className="font-heading">Transaction Details</SheetTitle>
                <SheetDescription>{selectedTransaction.orderId}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Item</h4>
                  <p className="font-medium text-foreground">{selectedTransaction.itemTitle}</p>
                  <p className="text-sm text-muted-foreground">SKU: {selectedTransaction.sku}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">Date</h4>
                    <p className="text-foreground">{formatDate(selectedTransaction.date)}</p>
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">Quantity</h4>
                    <p className="text-foreground">{selectedTransaction.quantity}</p>
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">Category</h4>
                    <p className="text-foreground">{selectedTransaction.category}</p>
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">Buyer Country</h4>
                    <p className="text-foreground">{selectedTransaction.buyerCountry}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">Financials</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Gross Sale</span>
                      <span className="font-medium">{formatCurrency(selectedTransaction.gross)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Marketplace Fees</span>
                      <span className="text-destructive">-{formatCurrency(selectedTransaction.fees)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Shipping Charged</span>
                      <span>{formatCurrency(selectedTransaction.shippingCharged)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Shipping Cost</span>
                      <span className="text-destructive">-{formatCurrency(selectedTransaction.shippingCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Tax Collected</span>
                      <span className={cn(
                        selectedTransaction.taxCollected > 0 ? '' : 'text-warning'
                      )}>
                        {formatCurrency(selectedTransaction.taxCollected)}
                        {selectedTransaction.taxCollected === 0 && (
                          <Badge variant="outline" className="ml-2 text-[10px] bg-warning/10 text-warning border-warning/20">
                            No eBay Tax
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div className="border-t border-border pt-2">
                      <div className="flex justify-between">
                        <span className="font-medium text-foreground">Net Profit</span>
                        <span className={cn('font-bold', selectedTransaction.net >= 0 ? 'text-success' : 'text-destructive')}>
                          {formatCurrency(selectedTransaction.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <Tag className="mr-2 h-4 w-4" />
                    Edit Category
                  </Button>
                  {selectedTransaction.type === 'sale' && (
                    <Button 
                      variant={selectedTransaction.taxCollected === 0 ? 'accent' : 'outline'} 
                      className="flex-1"
                      onClick={() => {
                        setInvoiceTransaction(selectedTransaction);
                        setSelectedTransaction(null);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {selectedTransaction.taxCollected === 0 ? 'Send Invoice' : 'Invoice'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Invoice Dialog */}
      <InvoiceDialog
        transaction={invoiceTransaction ? {
          id: invoiceTransaction.id,
          order_id: invoiceTransaction.orderId,
          item_title: invoiceTransaction.itemTitle,
          gross: invoiceTransaction.gross,
          fees: invoiceTransaction.fees,
          net: invoiceTransaction.net,
          tax_collected: invoiceTransaction.taxCollected,
          currency: 'USD',
          date: invoiceTransaction.date,
          buyer_country: invoiceTransaction.buyerCountry,
        } : null}
        open={!!invoiceTransaction}
        onOpenChange={(open) => !open && setInvoiceTransaction(null)}
      />
    </div>
  );
}
