import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ArrowDownRight, RotateCcw } from 'lucide-react';
import { Transaction } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export const RecentTransactions = ({ transactions }: RecentTransactionsProps) => {
  const recentTxns = transactions.slice(0, 5);

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
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return <ArrowUpRight className="h-4 w-4 text-success" />;
      case 'refund':
        return <RotateCcw className="h-4 w-4 text-destructive" />;
      default:
        return <ArrowDownRight className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      matched: 'default',
      partially_matched: 'secondary',
      unmatched: 'destructive',
    };
    const labels: Record<string, string> = {
      matched: 'Matched',
      partially_matched: 'Partial',
      unmatched: 'Unmatched',
    };
    return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border p-6">
        <div>
          <h3 className="font-heading text-lg font-semibold text-card-foreground">
            Recent Transactions
          </h3>
          <p className="text-sm text-muted-foreground">Latest sales and refunds</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/transactions" className="gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="divide-y divide-border">
        {recentTxns.map((txn) => (
          <div
            key={txn.id}
            className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                {getTypeIcon(txn.type)}
              </div>
              <div>
                <p className="font-medium text-card-foreground line-clamp-1 max-w-[200px]">
                  {txn.itemTitle}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(txn.date)} · {txn.orderId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {getStatusBadge(txn.status)}
              <span
                className={cn(
                  'font-medium tabular-nums',
                  txn.type === 'refund' ? 'text-destructive' : 'text-success'
                )}
              >
                {txn.type === 'refund' ? '-' : '+'}
                {formatCurrency(txn.type === 'refund' ? txn.refunds : txn.net)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
