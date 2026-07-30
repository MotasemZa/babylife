import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Receipt,
  AlertCircle,
  CheckCircle2,
  Info,
  Calendar,
  Database,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ebayService } from '@/services/ebayService';
import { useDemoData } from '@/contexts/DataContext';
import { format } from 'date-fns';

type PeriodType = 'monthly' | 'quarterly' | 'yearly';

interface PeriodData {
  key: string;
  label: string;
  taxCollected: number;
  taxNotCollected: number;
  taxCollectedCount: number;
  taxNotCollectedCount: number;
}

interface CountryBreakdown {
  country: string;
  sales: number;
  gross: number;
  taxCollected: number;
  taxNotCollected: number;
  isEU: boolean;
}

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const QUARTERS = [
  { value: 'Q1', label: 'Q1 (Jan-Mar)', months: ['01', '02', '03'] },
  { value: 'Q2', label: 'Q2 (Apr-Jun)', months: ['04', '05', '06'] },
  { value: 'Q3', label: 'Q3 (Jul-Sep)', months: ['07', '08', '09'] },
  { value: 'Q4', label: 'Q4 (Oct-Dec)', months: ['10', '11', '12'] },
];

const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus',
  CZ: 'Czech Republic', DK: 'Denmark', EE: 'Estonia', FI: 'Finland', FR: 'France',
  DE: 'Germany', GR: 'Greece', HU: 'Hungary', IE: 'Ireland', IT: 'Italy',
  LV: 'Latvia', LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands',
  PL: 'Poland', PT: 'Portugal', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia',
  ES: 'Spain', SE: 'Sweden', GB: 'United Kingdom', US: 'United States',
  CA: 'Canada', AU: 'Australia', CH: 'Switzerland', NO: 'Norway'
};

export default function Taxes() {
  const { transactions, isLoading, refreshData } = useDemoData();
  const currentDate = new Date();
  const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
  const currentQuarter = `Q${Math.ceil((currentDate.getMonth() + 1) / 3)}`;
  
  const [year, setYear] = useState(currentDate.getFullYear().toString());
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showCountryBreakdown, setShowCountryBreakdown] = useState(true);

  const hasAnyEbayCollectedTax = useMemo(() => {
    return transactions.some((t) => t.type === 'sale' && (t.taxCollected ?? 0) > 0);
  }, [transactions]);

  const backfillAttemptedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const saleCount = transactions.filter((t) => t.type === 'sale').length;
    if (saleCount === 0) return;

    if (hasAnyEbayCollectedTax) return;
    if (backfillAttemptedRef.current) return;

    backfillAttemptedRef.current = true;

    (async () => {
      try {
        toast({
          title: 'Fixing eBay tax data…',
          description: 'Reading tax amounts from your already-synced orders.',
        });

        const result = await ebayService.backfillTaxCollected();
        await refreshData();

        toast({
          title: 'Tax data updated',
          description:
            result.updated > 0
              ? `Updated ${result.updated} sales with eBay-collected tax.`
              : 'No eBay-collected tax amounts were found in the synced orders.',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        toast({
          title: 'Tax fix failed',
          description: message,
        });
      }
    })();
  }, [hasAnyEbayCollectedTax, isLoading, refreshData, transactions]);

  // Calculate synced data range
  const dataRange = useMemo(() => {
    const salesTransactions = transactions.filter(t => t.type === 'sale');
    if (salesTransactions.length === 0) return null;
    
    const dates = salesTransactions.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
    if (dates.length === 0) return null;
    
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    
    return {
      from: earliest,
      to: latest,
      count: salesTransactions.length,
    };
  }, [transactions]);

  // Use EUR as the account currency for German/EU accounts - eBay handles currency conversion
  const displayCurrency = useMemo(() => {
    // For German accounts, always use EUR regardless of individual transaction currencies
    return 'EUR';
  }, [transactions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: displayCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getQuarter = (month: number): string => {
    if (month >= 1 && month <= 3) return 'Q1';
    if (month >= 4 && month <= 6) return 'Q2';
    if (month >= 7 && month <= 9) return 'Q3';
    return 'Q4';
  };

  // Get filtered transactions for the selected period
  const filteredTransactions = useMemo(() => {
    let filtered = transactions.filter(t => {
      const txnYear = t.date.substring(0, 4);
      return txnYear === year && t.type === 'sale';
    });

    if (periodType === 'quarterly') {
      const quarterMonths = QUARTERS.find(q => q.value === selectedQuarter)?.months || [];
      filtered = filtered.filter(t => {
        const month = t.date.substring(5, 7);
        return quarterMonths.includes(month);
      });
    } else if (periodType === 'monthly') {
      filtered = filtered.filter(t => {
        const month = t.date.substring(5, 7);
        return month === selectedMonth;
      });
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, year, periodType, selectedQuarter, selectedMonth]);

  // Country breakdown
  const countryBreakdown = useMemo(() => {
    const breakdown: Record<string, CountryBreakdown> = {};

    filteredTransactions.forEach(t => {
      const country = t.buyerCountry || 'Unknown';
      
      if (!breakdown[country]) {
        breakdown[country] = {
          country,
          sales: 0,
          gross: 0,
          taxCollected: 0,
          taxNotCollected: 0,
          isEU: EU_COUNTRIES.includes(country),
        };
      }

      breakdown[country].sales++;
      breakdown[country].gross += t.gross;
      
      if ((t.taxCollected ?? 0) > 0) {
        breakdown[country].taxCollected += t.gross;
      } else {
        breakdown[country].taxNotCollected += t.gross;
      }
    });

    return Object.values(breakdown).sort((a, b) => b.gross - a.gross);
  }, [filteredTransactions]);

  // EU totals
  const euTotals = useMemo(() => {
    const euData = countryBreakdown.filter(c => c.isEU);
    const nonEuData = countryBreakdown.filter(c => !c.isEU);
    
    return {
      eu: {
        sales: euData.reduce((sum, c) => sum + c.sales, 0),
        gross: euData.reduce((sum, c) => sum + c.gross, 0),
        taxCollected: euData.reduce((sum, c) => sum + c.taxCollected, 0),
        taxNotCollected: euData.reduce((sum, c) => sum + c.taxNotCollected, 0),
      },
      nonEu: {
        sales: nonEuData.reduce((sum, c) => sum + c.sales, 0),
        gross: nonEuData.reduce((sum, c) => sum + c.gross, 0),
        taxCollected: nonEuData.reduce((sum, c) => sum + c.taxCollected, 0),
        taxNotCollected: nonEuData.reduce((sum, c) => sum + c.taxNotCollected, 0),
      },
    };
  }, [countryBreakdown]);

  const taxMetrics = useMemo(() => {
    const periodData: Record<string, PeriodData> = {};

    filteredTransactions.forEach(t => {
      const month = parseInt(t.date.substring(5, 7), 10);
      let periodKey: string;
      let periodLabel: string;

      if (periodType === 'monthly') {
        periodKey = t.date.substring(0, 7);
        periodLabel = new Date(periodKey + '-01').toLocaleDateString('de-DE', {
          month: 'long',
          year: 'numeric',
        });
      } else if (periodType === 'quarterly') {
        periodKey = getQuarter(month);
        periodLabel = QUARTERS.find(q => q.value === periodKey)?.label || periodKey;
      } else {
        periodKey = year;
        periodLabel = year;
      }

      if (!periodData[periodKey]) {
        periodData[periodKey] = {
          key: periodKey,
          label: periodLabel,
          taxCollected: 0,
          taxNotCollected: 0,
          taxCollectedCount: 0,
          taxNotCollectedCount: 0,
        };
      }

      const taxAmount = t.taxCollected ?? 0;
      if (taxAmount > 0) {
        periodData[periodKey].taxCollected += t.gross;
        periodData[periodKey].taxCollectedCount++;
      } else {
        periodData[periodKey].taxNotCollected += t.gross;
        periodData[periodKey].taxNotCollectedCount++;
      }
    });

    const periods = Object.values(periodData).sort((a, b) => a.key.localeCompare(b.key));

    const totalTaxCollected = filteredTransactions
      .filter(t => (t.taxCollected ?? 0) > 0)
      .reduce((sum, t) => sum + t.gross, 0);
    const totalTaxNotCollected = filteredTransactions
      .filter(t => (t.taxCollected ?? 0) === 0)
      .reduce((sum, t) => sum + t.gross, 0);
    const taxCollectedCount = filteredTransactions.filter(t => (t.taxCollected ?? 0) > 0).length;
    const taxNotCollectedCount = filteredTransactions.filter(t => (t.taxCollected ?? 0) === 0).length;

    return {
      periods,
      totalTaxCollected,
      totalTaxNotCollected,
      taxCollectedCount,
      taxNotCollectedCount,
      totalTransactions: filteredTransactions.length,
    };
  }, [filteredTransactions, year, periodType]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    transactions.forEach(t => {
      const txnYear = t.date.substring(0, 4);
      if (txnYear && txnYear.length === 4) years.add(txnYear);
    });
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [transactions]);

  const getPeriodLabel = () => {
    if (periodType === 'yearly') return year;
    if (periodType === 'quarterly') return `${QUARTERS.find(q => q.value === selectedQuarter)?.label} ${year}`;
    return `${MONTHS.find(m => m.value === selectedMonth)?.label} ${year}`;
  };

  const getCountryName = (code: string) => {
    return COUNTRY_NAMES[code] || code;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Data Range Banner */}
      {dataRange && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-center gap-3 py-3">
            <Database className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Synced data: <span className="font-medium text-foreground">{format(dataRange.from, 'MMM d, yyyy')}</span> to <span className="font-medium text-foreground">{format(dataRange.to, 'MMM d, yyyy')}</span> · {dataRange.count.toLocaleString()} sales
            </p>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Tax Overview</h1>
          <p className="text-muted-foreground">
            {getPeriodLabel()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>

          {periodType === 'quarterly' && (
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUARTERS.map((q) => (
                  <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {periodType === 'monthly' && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">Sales with eBay Tax Collection</CardDescription>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-success">
              {formatCurrency(taxMetrics.totalTaxCollected)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {taxMetrics.taxCollectedCount} sales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">Sales without eBay Tax Collection</CardDescription>
            <AlertCircle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-warning">
              {formatCurrency(taxMetrics.totalTaxNotCollected)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {taxMetrics.taxNotCollectedCount} sales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* EU vs Non-EU Summary */}
      {countryBreakdown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="text-sm font-medium">EU Sales</CardDescription>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                🇪🇺 EU
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {formatCurrency(euTotals.eu.gross)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {euTotals.eu.sales} sales · {countryBreakdown.filter(c => c.isEU).length} countries
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="text-sm font-medium">Non-EU Sales</CardDescription>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {formatCurrency(euTotals.nonEu.gross)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {euTotals.nonEu.sales} sales · {countryBreakdown.filter(c => !c.isEU).length} countries
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info Banner */}
      <Card className="border-info/50 bg-info/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">How this is calculated</p>
            <p className="text-sm text-muted-foreground">
              We mark a sale as "eBay collected tax" when the synced transaction has a non-zero "tax collected by eBay" amount.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Country Breakdown */}
      {countryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading">Sales by Country</CardTitle>
                <CardDescription>{countryBreakdown.length} countries</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCountryBreakdown(!showCountryBreakdown)}
              >
                {showCountryBreakdown ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          {showCountryBreakdown && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Tax Collected</TableHead>
                    <TableHead className="text-right">No Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countryBreakdown.map((row) => (
                    <TableRow key={row.country}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{getCountryName(row.country)}</span>
                          {row.isEU && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                              EU
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.sales}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {row.taxCollected > 0 ? formatCurrency(row.taxCollected) : '–'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-warning">
                        {row.taxNotCollected > 0 ? formatCurrency(row.taxNotCollected) : '–'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* EU Total Row */}
                  <TableRow className="bg-blue-500/5 font-medium">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>Total EU</span>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                          🇪🇺
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{euTotals.eu.sales}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(euTotals.eu.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {euTotals.eu.taxCollected > 0 ? formatCurrency(euTotals.eu.taxCollected) : '–'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {euTotals.eu.taxNotCollected > 0 ? formatCurrency(euTotals.eu.taxNotCollected) : '–'}
                    </TableCell>
                  </TableRow>
                  {/* Non-EU Total Row */}
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell>Total Non-EU</TableCell>
                    <TableCell className="text-right tabular-nums">{euTotals.nonEu.sales}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(euTotals.nonEu.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {euTotals.nonEu.taxCollected > 0 ? formatCurrency(euTotals.nonEu.taxCollected) : '–'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {euTotals.nonEu.taxNotCollected > 0 ? formatCurrency(euTotals.nonEu.taxNotCollected) : '–'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* Period Breakdown */}
      {taxMetrics.totalTransactions > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Summary for {getPeriodLabel()}</CardTitle>
            <CardDescription>{taxMetrics.totalTransactions} total sales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                <p className="text-sm text-muted-foreground mb-1">eBay Collected Tax</p>
                <p className="text-xl font-bold tabular-nums text-success">
                  {formatCurrency(taxMetrics.totalTaxCollected)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {taxMetrics.taxCollectedCount} sales
                </p>
              </div>
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-sm text-muted-foreground mb-1">eBay Did Not Collect Tax</p>
                <p className="text-xl font-bold tabular-nums text-warning">
                  {formatCurrency(taxMetrics.totalTaxNotCollected)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {taxMetrics.taxNotCollectedCount} sales
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            No sales data for {getPeriodLabel()}
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      {filteredTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading">Transactions</CardTitle>
                <CardDescription>{filteredTransactions.length} sales in {getPeriodLabel()}</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTransactions(!showTransactions)}
              >
                {showTransactions ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Show
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {showTransactions && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Tax Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(t.date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={t.itemTitle || '–'}>
                          {t.itemTitle || '–'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span>{getCountryName(t.buyerCountry || 'Unknown')}</span>
                            {EU_COUNTRIES.includes(t.buyerCountry || '') && (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                                EU
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(t.gross)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(t.taxCollected ?? 0) > 0 ? (
                            <Badge className="bg-success/10 text-success border-success/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Collected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Not Collected
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Tax Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Receipt className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Keep Records</p>
              <p className="text-sm text-muted-foreground">
                Maintain records of all sales and taxes collected for tax filing purposes.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Consult a Professional</p>
              <p className="text-sm text-muted-foreground">
                Tax obligations vary by location. Consult a tax professional for advice specific to your situation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
