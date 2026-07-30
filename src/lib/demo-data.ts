// Demo data for the eBay Tax Companion

export interface Transaction {
  id: string;
  date: string;
  type: 'sale' | 'fee' | 'refund' | 'payout' | 'shipping';
  orderId: string;
  itemTitle: string;
  sku: string;
  quantity: number;
  gross: number;
  fees: number;
  shippingCharged: number;
  shippingCost: number;
  taxCollected: number;
  refunds: number;
  net: number;
  currency: string;
  buyerCountry: string;
  category: string;
  status: 'matched' | 'partially_matched' | 'unmatched';
  notes: string;
}

export interface Payout {
  id: string;
  payoutDate: string;
  payoutId: string;
  gross: number;
  fees: number;
  adjustments: number;
  net: number;
  status: 'completed' | 'pending' | 'failed';
  transactionCount: number;
}

export interface MonthlyMetric {
  month: string;
  grossSales: number;
  fees: number;
  shipping: number;
  refunds: number;
  netProfit: number;
  taxCollected: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

// Generate realistic demo transactions
export const generateDemoTransactions = (): Transaction[] => {
  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Collectibles', 'Sports', 'Toys'];
  const countries = ['US', 'CA', 'UK', 'AU', 'DE'];
  const items = [
    { title: 'Vintage Camera Lens 50mm f/1.4', sku: 'CAM-001', category: 'Electronics' },
    { title: 'Nike Air Max 90 Sneakers Size 10', sku: 'SNK-042', category: 'Clothing' },
    { title: 'Antique Brass Table Lamp', sku: 'HOM-118', category: 'Home & Garden' },
    { title: 'Pokemon Base Set Charizard PSA 8', sku: 'COL-999', category: 'Collectibles' },
    { title: 'Wilson Tennis Racket Pro Staff', sku: 'SPT-055', category: 'Sports' },
    { title: 'LEGO Star Wars Millennium Falcon', sku: 'TOY-777', category: 'Toys' },
    { title: 'Apple iPhone 12 Pro 128GB', sku: 'ELC-200', category: 'Electronics' },
    { title: 'Vintage Denim Jacket 1990s', sku: 'CLO-089', category: 'Clothing' },
    { title: 'Mid-Century Modern Chair', sku: 'HOM-234', category: 'Home & Garden' },
    { title: 'Baseball Card Collection Lot', sku: 'COL-456', category: 'Collectibles' },
  ];

  const transactions: Transaction[] = [];
  const now = new Date();
  
  for (let i = 0; i < 150; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    const item = items[Math.floor(Math.random() * items.length)];
    const quantity = Math.floor(Math.random() * 3) + 1;
    const basePrice = Math.floor(Math.random() * 500) + 20;
    const gross = basePrice * quantity;
    const feeRate = 0.1 + Math.random() * 0.05;
    const fees = Math.round(gross * feeRate * 100) / 100;
    const shippingCharged = Math.floor(Math.random() * 20) + 5;
    const shippingCost = Math.floor(shippingCharged * (0.6 + Math.random() * 0.3));
    const taxRate = Math.random() > 0.3 ? 0.08 : 0;
    const taxCollected = Math.round(gross * taxRate * 100) / 100;
    const hasRefund = Math.random() > 0.9;
    const refunds = hasRefund ? gross : 0;
    const net = gross - fees - shippingCost + shippingCharged - refunds;
    
    transactions.push({
      id: `TXN-${String(i + 1).padStart(6, '0')}`,
      date: date.toISOString().split('T')[0],
      type: hasRefund ? 'refund' : 'sale',
      orderId: `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      itemTitle: item.title,
      sku: item.sku,
      quantity,
      gross,
      fees,
      shippingCharged,
      shippingCost,
      taxCollected,
      refunds,
      net: Math.round(net * 100) / 100,
      currency: 'USD',
      buyerCountry: countries[Math.floor(Math.random() * countries.length)],
      category: item.category,
      status: Math.random() > 0.2 ? 'matched' : (Math.random() > 0.5 ? 'partially_matched' : 'unmatched'),
      notes: '',
    });
  }
  
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const generateDemoPayouts = (): Payout[] => {
  const payouts: Payout[] = [];
  const now = new Date();
  
  for (let i = 0; i < 24; i++) {
    const weeksAgo = i * 2;
    const date = new Date(now);
    date.setDate(date.getDate() - weeksAgo * 7);
    
    const gross = Math.floor(Math.random() * 5000) + 1000;
    const fees = Math.round(gross * 0.12 * 100) / 100;
    const adjustments = Math.random() > 0.7 ? -Math.floor(Math.random() * 50) : 0;
    const net = gross - fees + adjustments;
    
    payouts.push({
      id: `PAY-${String(i + 1).padStart(4, '0')}`,
      payoutDate: date.toISOString().split('T')[0],
      payoutId: `PO-${Math.random().toString(36).substr(2, 12).toUpperCase()}`,
      gross,
      fees,
      adjustments,
      net: Math.round(net * 100) / 100,
      status: i === 0 ? 'pending' : 'completed',
      transactionCount: Math.floor(Math.random() * 30) + 5,
    });
  }
  
  return payouts;
};

export const generateMonthlyMetrics = (transactions: Transaction[]): MonthlyMetric[] => {
  const monthlyData: Record<string, MonthlyMetric> = {};
  
  transactions.forEach(txn => {
    const month = txn.date.substring(0, 7);
    if (!monthlyData[month]) {
      monthlyData[month] = {
        month,
        grossSales: 0,
        fees: 0,
        shipping: 0,
        refunds: 0,
        netProfit: 0,
        taxCollected: 0,
      };
    }
    
    if (txn.type === 'sale') {
      monthlyData[month].grossSales += txn.gross;
      monthlyData[month].fees += txn.fees;
      monthlyData[month].shipping += txn.shippingCost;
      monthlyData[month].taxCollected += txn.taxCollected;
      monthlyData[month].netProfit += txn.net;
    } else if (txn.type === 'refund') {
      monthlyData[month].refunds += txn.refunds;
      monthlyData[month].netProfit -= txn.refunds;
    }
  });
  
  return Object.values(monthlyData)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
};

export const generateCategoryBreakdown = (transactions: Transaction[]): CategoryBreakdown[] => {
  const categoryTotals: Record<string, number> = {};
  const colors = ['#1e3a5f', '#2d5a87', '#3d7ab0', '#4d9ada', '#16a085', '#27ae60'];
  
  transactions.forEach(txn => {
    if (txn.type === 'sale') {
      categoryTotals[txn.category] = (categoryTotals[txn.category] || 0) + txn.gross;
    }
  });
  
  const total = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
  
  return Object.entries(categoryTotals)
    .map(([category, amount], index) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percentage: Math.round((amount / total) * 1000) / 10,
      color: colors[index % colors.length],
    }))
    .sort((a, b) => b.amount - a.amount);
};

export const calculateKPIs = (transactions: Transaction[]) => {
  const sales = transactions.filter(t => t.type === 'sale');
  const refunds = transactions.filter(t => t.type === 'refund');
  
  // Fix: Sum gross from refund transactions, not the refunds column
  const totalRefunds = refunds.reduce((sum, t) => sum + Math.abs(t.gross || 0), 0);
  
  return {
    grossSales: Math.round(sales.reduce((sum, t) => sum + t.gross, 0) * 100) / 100,
    totalFees: Math.round(sales.reduce((sum, t) => sum + t.fees, 0) * 100) / 100,
    totalShipping: Math.round(sales.reduce((sum, t) => sum + t.shippingCost, 0) * 100) / 100,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    netProfit: Math.round(sales.reduce((sum, t) => sum + t.net, 0) * 100) / 100,
    taxCollected: Math.round(sales.reduce((sum, t) => sum + t.taxCollected, 0) * 100) / 100,
    totalTransactions: transactions.length,
    avgOrderValue: sales.length > 0 
      ? Math.round((sales.reduce((sum, t) => sum + t.gross, 0) / sales.length) * 100) / 100 
      : 0,
  };
};
