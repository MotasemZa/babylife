import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon: ReactNode;
  currency?: string;
}

export const KPICard = ({
  title,
  value,
  change,
  trend = 'neutral',
  icon,
  currency = 'EUR',
}: KPICardProps) => {
  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    }
    return val;
  };

  const trendColors = {
    up: 'text-success',
    down: 'text-destructive',
    neutral: 'text-muted-foreground',
  };

  const getTrendText = () => {
    if (change === undefined) return null;
    if (change === 0) return 'No change';
    
    const direction = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';
    return `${direction} ${Math.abs(change).toFixed(1)}% vs last period`;
  };

  return (
    <div className="group relative rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          {icon}
        </div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
      </div>
      
      <p className="font-heading text-2xl font-bold tracking-tight text-card-foreground">
        {formatValue(value)}
      </p>
      
      {change !== undefined && (
        <p className={cn('text-xs mt-2', trendColors[trend])}>
          {getTrendText()}
        </p>
      )}
    </div>
  );
};
