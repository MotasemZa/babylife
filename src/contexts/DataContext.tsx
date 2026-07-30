import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Transaction,
  Payout,
  MonthlyMetric,
  CategoryBreakdown,
  generateMonthlyMetrics,
  generateCategoryBreakdown,
  calculateKPIs,
} from '@/lib/demo-data';

interface DataContextType {
  transactions: Transaction[];
  payouts: Payout[];
  monthlyMetrics: MonthlyMetric[];
  categoryBreakdown: CategoryBreakdown[];
  kpis: ReturnType<typeof calculateKPIs>;
  isLoading: boolean;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Helper to extract YYYY-MM-DD from various date formats
const extractDateString = (dateValue: any): string => {
  if (!dateValue) return '';
  const str = String(dateValue);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

// Helper to convert database record to Transaction type
const mapDbToTransaction = (row: any): Transaction => ({
  id: row.id,
  date: extractDateString(row.date),
  type: row.type as Transaction['type'],
  orderId: row.order_id || '',
  itemTitle: row.item_title || 'Unknown Item',
  sku: row.sku || '',
  quantity: row.quantity || 1,
  gross: Number(row.gross) || 0,
  fees: Number(row.fees) || 0,
  shippingCharged: Number(row.shipping_charged) || 0,
  shippingCost: Number(row.shipping_cost) || 0,
  taxCollected: Number(row.tax_collected) || 0,
  refunds: Number(row.refunds) || 0,
  net: Number(row.net) || 0,
  currency: row.currency || 'USD',
  buyerCountry: row.buyer_country || 'US',
  category: row.category || 'Uncategorized',
  status: (row.status as Transaction['status']) || 'unmatched',
  notes: row.notes || '',
});

// Helper to convert database record to Payout type
const mapDbToPayout = (row: any): Payout => ({
  id: row.id,
  payoutDate: extractDateString(row.payout_date),
  payoutId: row.payout_id || row.external_id || '',
  gross: Number(row.gross) || 0,
  fees: Number(row.fees) || 0,
  adjustments: Number(row.adjustments) || 0,
  net: Number(row.net) || 0,
  status: (row.status as Payout['status']) || 'pending',
  transactionCount: row.transaction_count || 0,
});

const emptyKpis = {
  grossSales: 0,
  totalFees: 0,
  totalShipping: 0,
  totalRefunds: 0,
  netProfit: 0,
  taxCollected: 0,
  totalTransactions: 0,
  avgOrderValue: 0,
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyMetric[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [kpis, setKpis] = useState<ReturnType<typeof calculateKPIs>>(emptyKpis);

  const loadData = async () => {
    if (!user) {
      setTransactions([]);
      setPayouts([]);
      setMonthlyMetrics([]);
      setCategoryBreakdown([]);
      setKpis(emptyKpis);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Load all transactions - fetch in batches to overcome 1000 row limit
      const allTxns: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: txnData, error: txnError } = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (txnError) {
          console.error('Error loading transactions:', txnError);
          break;
        }

        if (!txnData || txnData.length === 0) break;
        
        allTxns.push(...txnData);
        
        if (txnData.length < batchSize) break;
        offset += batchSize;
      }

      const txns = allTxns.map(mapDbToTransaction);
      setTransactions(txns);

      // Load payouts
      const { data: payoutData, error: payoutError } = await supabase
        .from('payouts')
        .select('*')
        .order('payout_date', { ascending: false });

      if (payoutError) {
        console.error('Error loading payouts:', payoutError);
      } else {
        setPayouts((payoutData || []).map(mapDbToPayout));
      }

      // Calculate metrics from real data
      if (txns.length > 0) {
        setMonthlyMetrics(generateMonthlyMetrics(txns));
        setCategoryBreakdown(generateCategoryBreakdown(txns));
        setKpis(calculateKPIs(txns));
      } else {
        setMonthlyMetrics([]);
        setCategoryBreakdown([]);
        setKpis(emptyKpis);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = async () => {
    await loadData();
  };

  useEffect(() => {
    loadData();
  }, [user]);

  return (
    <DataContext.Provider
      value={{
        transactions,
        payouts,
        monthlyMetrics,
        categoryBreakdown,
        kpis,
        isLoading,
        refreshData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

// Backward compatible hook name
export const useDemoData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDemoData must be used within a DataProvider');
  }
  return context;
};

// New hook name
export const useData = useDemoData;
