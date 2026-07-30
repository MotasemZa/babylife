import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertCircle, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface FulfillmentLogEntry {
  id: string;
  order_id: string;
  item_title: string | null;
  status: string;
  message_sent: boolean | null;
  invoice_sent: boolean | null;
  error_message: string | null;
  created_at: string;
}

export const ActivityLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<FulfillmentLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadLogs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('fulfillment_log')
          .select('id, order_id, item_title, status, message_sent, invoice_sent, error_message, created_at')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        setLogs(data || []);
      } catch (error) {
        console.error('Error loading activity log:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLogs();
  }, [user]);

  const getStatusInfo = (log: FulfillmentLogEntry) => {
    if (log.status === 'success' || log.status === 'fulfilled' || log.status === 'completed') {
      return {
        icon: CheckCircle2,
        color: 'text-success',
        bgColor: 'bg-success/10',
        label: 'Fulfilled',
      };
    }
    if (log.status === 'failed' || log.error_message) {
      return {
        icon: XCircle,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        label: 'Failed',
      };
    }
    return {
      icon: AlertCircle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      label: 'Pending',
    };
  };

  const getActionDescription = (log: FulfillmentLogEntry) => {
    const parts: string[] = [];
    
    if (log.status === 'success' || log.status === 'fulfilled' || log.status === 'completed') {
      if (log.message_sent) parts.push('Message sent to buyer');
      if (log.invoice_sent) parts.push('Invoice sent');
      if (parts.length === 0) parts.push('Order fulfilled');
    } else if (log.error_message) {
      return log.error_message;
    } else {
      parts.push('Awaiting fulfillment');
    }
    
    return parts.join(' • ');
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-semibold text-card-foreground">
            Activity Log
          </h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          No automated actions recorded yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg font-semibold text-card-foreground">
          Activity Log
        </h3>
        <Link
          to="/app/orders"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        {logs.map((log) => {
          const statusInfo = getStatusInfo(log);
          const StatusIcon = statusInfo.icon;

          return (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-3"
            >
              <div className={cn('rounded-full p-1.5', statusInfo.bgColor)}>
                <StatusIcon className={cn('h-4 w-4', statusInfo.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground truncate">
                    Order #{log.order_id?.split('-').pop() || log.order_id}
                  </span>
                  <span className={cn('text-xs font-medium', statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {log.item_title || 'Unknown item'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getActionDescription(log)} • {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
