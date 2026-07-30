import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Receipt,
  RotateCcw,
  Truck,
  Calculator,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useDemoData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { KPICard } from '@/components/dashboard/KPICard';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { ActivityLog } from '@/components/dashboard/ActivityLog';
import { PeriodSelector, Period } from '@/components/dashboard/PeriodSelector';
import { DashboardSetupCard } from '@/components/dashboard/DashboardSetupCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { calculateKPIs } from '@/lib/demo-data';
import { ebayService } from '@/services/ebayService';
import { toast } from '@/hooks/use-toast';
import { format, startOfMonth, startOfYear, subMonths, subYears } from 'date-fns';

export default function Dashboard() {
  const { transactions, isLoading, refreshData } = useDemoData();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  
  // Alert counts
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [failedFulfillmentCount, setFailedFulfillmentCount] = useState(0);

  // Load alert data
  useEffect(() => {
    if (!user) return;

    const loadAlertData = async () => {
      // Out of stock listings
      const { count: outOfStock } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('quantity', 0)
        .eq('status', 'active');
      setOutOfStockCount(outOfStock || 0);

      // Failed fulfillments
      const { count: failed } = await supabase
        .from('fulfillment_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');
      setFailedFulfillmentCount(failed || 0);

      // Last sync date
      const { data: lastSync } = await supabase
        .from('import_history')
        .select('completed_at')
        .eq('status', 'completed')
        .eq('type', 'ebay_api')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();
      
      if (lastSync?.completed_at) {
        setLastSyncDate(new Date(lastSync.completed_at));
      }
    };

    loadAlertData();
  }, [user]);

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'month':
        startDate = startOfMonth(now);
        break;
      case 'year':
        startDate = startOfYear(now);
        break;
      case 'all':
      default:
        return transactions;
    }

    return transactions.filter(t => {
      const txnDate = new Date(t.date);
      return txnDate >= startDate && txnDate <= now;
    });
  }, [transactions, period]);

  // Get previous period transactions for comparison
  const previousPeriodTransactions = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'month':
        startDate = startOfMonth(subMonths(now, 1));
        endDate = startOfMonth(now);
        break;
      case 'year':
        startDate = startOfYear(subYears(now, 1));
        endDate = startOfYear(now);
        break;
      case 'all':
      default:
        return [];
    }

    return transactions.filter(t => {
      const txnDate = new Date(t.date);
      return txnDate >= startDate && txnDate < endDate;
    });
  }, [transactions, period]);

  // Calculate KPIs
  const currentKpis = useMemo(() => calculateKPIs(filteredTransactions), [filteredTransactions]);
  const previousKpis = useMemo(() => calculateKPIs(previousPeriodTransactions), [previousPeriodTransactions]);

  // Calculate percentage changes
  const calculateChange = (current: number, previous: number): { change: number; trend: 'up' | 'down' | 'neutral' } => {
    if (previous === 0) return { change: 0, trend: 'neutral' };
    const change = ((current - previous) / previous) * 100;
    return {
      change: Math.abs(change),
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
    };
  };

  const grossChange = calculateChange(currentKpis.grossSales, previousKpis.grossSales);
  const feesChange = calculateChange(currentKpis.totalFees, previousKpis.totalFees);
  const shippingChange = calculateChange(currentKpis.totalShipping, previousKpis.totalShipping);
  const refundsChange = calculateChange(currentKpis.totalRefunds, previousKpis.totalRefunds);
  const taxChange = calculateChange(currentKpis.taxCollected, previousKpis.taxCollected);

  const handleSync = async () => {
    setSyncing(true);
    try {
      // Suggest dates based on last sync
      const startDate = lastSyncDate 
        ? format(lastSyncDate, 'yyyy-MM-dd')
        : format(subMonths(new Date(), 3), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');

      await ebayService.fetchData('all', startDate, endDate);
      await refreshData();
      setLastSyncDate(new Date());
      
      toast({
        title: 'Sync Complete',
        description: 'Your eBay data has been updated.',
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Failed to sync data',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Your eBay business overview
            {lastSyncDate && (
              <span className="ml-2 text-xs">
                • Last sync: {format(lastSyncDate, 'MMM d, h:mm a')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync Now
          </Button>
        </div>
      </div>

      {/* Setup Progress Card */}
      <DashboardSetupCard />

      {/* Alerts Panel */}
      <AlertsPanel
        outOfStockCount={outOfStockCount}
        pendingOrdersCount={pendingOrdersCount}
        failedFulfillmentCount={failedFulfillmentCount}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KPICard
          title="Gross Sales"
          value={currentKpis.grossSales}
          change={period !== 'all' ? grossChange.change : undefined}
          trend={grossChange.trend}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Total Fees"
          value={currentKpis.totalFees}
          change={period !== 'all' ? feesChange.change : undefined}
          trend={feesChange.trend}
          icon={<Receipt className="h-4 w-4" />}
        />
        <KPICard
          title="Shipping Costs"
          value={currentKpis.totalShipping}
          change={period !== 'all' ? shippingChange.change : undefined}
          trend={shippingChange.trend}
          icon={<Truck className="h-4 w-4" />}
        />
        <KPICard
          title="Refunds"
          value={currentKpis.totalRefunds}
          change={period !== 'all' ? refundsChange.change : undefined}
          trend={refundsChange.trend}
          icon={<RotateCcw className="h-4 w-4" />}
        />
        <KPICard
          title="Tax Collected"
          value={currentKpis.taxCollected}
          change={period !== 'all' ? taxChange.change : undefined}
          trend={taxChange.trend}
          icon={<Calculator className="h-4 w-4" />}
        />
      </div>

      {/* Activity Log */}
      <ActivityLog />
    </div>
  );
}
