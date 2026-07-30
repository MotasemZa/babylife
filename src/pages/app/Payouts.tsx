import { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Link as LinkIcon,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/common/EmptyState';
import { useDemoData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';

export default function Payouts() {
  const { payouts, isLoading } = useDemoData();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPayouts = payouts.filter(
    (p) =>
      p.payoutId.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  // Calculate reconciliation stats
  const totalPayouts = payouts.length;
  const matchedPayouts = payouts.filter((p) => p.status === 'completed').length;
  const reconciliationRate = totalPayouts > 0 ? Math.round((matchedPayouts / totalPayouts) * 100) : 0;

  if (payouts.length === 0 && !isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Payouts & Reconciliation</h1>
          <p className="text-muted-foreground">Match your sales to eBay payouts</p>
        </div>
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title="No payouts to reconcile"
          description="Import your payout data to start matching transactions with your bank deposits."
          action={{
            label: 'Import Payouts',
            onClick: () => {},
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Payouts & Reconciliation</h1>
        <p className="text-muted-foreground">Match your sales to eBay payouts</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Payouts</CardDescription>
            <CardTitle className="text-3xl font-bold">{totalPayouts}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(payouts.reduce((sum, p) => sum + p.net, 0))} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reconciliation Rate</CardDescription>
            <CardTitle className="text-3xl font-bold">{reconciliationRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={reconciliationRate} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Payouts</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {payouts.filter((p) => p.status === 'pending').length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(
                payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.net, 0)
              )} pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by payout ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Payouts List */}
      <div className="space-y-3">
        {filteredPayouts.map((payout) => (
          <Card
            key={payout.id}
            className="overflow-hidden transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <CreditCard className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{payout.payoutId}</p>
                    <Badge
                      variant={payout.status === 'completed' ? 'default' : 'secondary'}
                      className="gap-1"
                    >
                      {getStatusIcon(payout.status)}
                      {payout.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(payout.payoutDate)} · {payout.transactionCount} transactions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Gross</p>
                  <p className="font-medium tabular-nums">{formatCurrency(payout.gross)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Fees</p>
                  <p className="font-medium tabular-nums text-destructive">
                    -{formatCurrency(payout.fees)}
                  </p>
                </div>
                {payout.adjustments !== 0 && (
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Adj.</p>
                    <p
                      className={cn(
                        'font-medium tabular-nums',
                        payout.adjustments < 0 ? 'text-destructive' : 'text-success'
                      )}
                    >
                      {payout.adjustments > 0 ? '+' : ''}
                      {formatCurrency(payout.adjustments)}
                    </p>
                  </div>
                )}
                <div className="text-right min-w-[100px]">
                  <p className="text-sm text-muted-foreground">Net Payout</p>
                  <p className="text-lg font-bold text-success tabular-nums">
                    {formatCurrency(payout.net)}
                  </p>
                </div>
                <Button variant="ghost" size="icon">
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Matched transactions indicator */}
            <div className="border-t border-border bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <LinkIcon className="h-4 w-4 text-accent" />
                <span className="text-muted-foreground">
                  {payout.transactionCount} transactions linked
                </span>
                <Button variant="link" size="sm" className="ml-auto h-auto p-0">
                  View matched transactions
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
