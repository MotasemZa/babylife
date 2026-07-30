import { AlertTriangle, Package, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Alert {
  type: 'out_of_stock' | 'pending_orders' | 'failed_fulfillment';
  count: number;
  label: string;
  link: string;
}

interface AlertsPanelProps {
  outOfStockCount: number;
  pendingOrdersCount: number;
  failedFulfillmentCount: number;
}

export const AlertsPanel = ({
  outOfStockCount,
  pendingOrdersCount,
  failedFulfillmentCount,
}: AlertsPanelProps) => {
  const alerts: Alert[] = ([
    {
      type: 'out_of_stock' as const,
      count: outOfStockCount,
      label: 'Out of stock listings',
      link: '/app/listings',
    },
    {
      type: 'pending_orders' as const,
      count: pendingOrdersCount,
      label: 'Pending unshipped orders',
      link: '/app/orders',
    },
    {
      type: 'failed_fulfillment' as const,
      count: failedFulfillmentCount,
      label: 'Failed fulfillments',
      link: '/app/orders',
    },
  ] as Alert[]).filter(alert => alert.count > 0);

  if (alerts.length === 0) {
    return null;
  }

  const getIcon = (type: Alert['type']) => {
    switch (type) {
      case 'out_of_stock':
        return Package;
      case 'pending_orders':
        return Clock;
      case 'failed_fulfillment':
        return AlertTriangle;
    }
  };

  const getColors = (type: Alert['type']) => {
    switch (type) {
      case 'out_of_stock':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'pending_orders':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'failed_fulfillment':
        return 'bg-destructive/10 text-destructive border-destructive/20';
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {alerts.map((alert) => {
        const Icon = getIcon(alert.type);
        const colors = getColors(alert.type);

        return (
          <Link
            key={alert.type}
            to={alert.link}
            className={cn(
              'group flex items-center justify-between rounded-lg border p-4 transition-all hover:shadow-md',
              colors
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5" />
              <div>
                <p className="text-2xl font-bold">{alert.count}</p>
                <p className="text-sm opacity-80">{alert.label}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 opacity-50 transition-transform group-hover:translate-x-1" />
          </Link>
        );
      })}
    </div>
  );
};
