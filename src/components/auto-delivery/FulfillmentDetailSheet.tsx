import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  XCircle,
  MinusCircle,
  Copy,
  Mail,
  FileText,
  Package,
  User,
  Clock,
  AlertTriangle,
  Key,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface FulfillmentLog {
  id: string;
  order_id: string;
  item_title: string | null;
  platform: string | null;
  buyer_username: string | null;
  buyer_email: string | null;
  status: string;
  message_sent: boolean;
  message_body: string | null;
  message_error: string | null;
  invoice_sent: boolean;
  invoice_error: string | null;
  marked_fulfilled: boolean;
  error_message: string | null;
  digital_key_id: string | null;
  created_at: string;
}

interface FulfillmentDetailSheetProps {
  log: FulfillmentLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FulfillmentDetailSheet({ log, open, onOpenChange }: FulfillmentDetailSheetProps) {
  const [dispatchedKeys, setDispatchedKeys] = useState<{ digital_key: string; item_title: string | null }[]>([]);
  const [keyLoading, setKeyLoading] = useState(false);

  useEffect(() => {
    if (!log || !open) {
      setDispatchedKeys([]);
      return;
    }

    const fetchKeys = async () => {
      setKeyLoading(true);
      try {
        let query = supabase
          .from("digital_keys")
          .select("digital_key, item_title")
          .eq("status", "used")
          .eq("order_id", log.order_id)
          .order("used_at", { ascending: true });

        const { data } = await query;
        if (data && data.length > 0) {
          setDispatchedKeys(data);
        }
      } catch {
        // No keys found
      } finally {
        setKeyLoading(false);
      }
    };

    fetchKeys();
  }, [log, open]);

  if (!log) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const hasErrors = log.error_message || log.message_error || log.invoice_error;
  const isSuccess = log.status === "completed" || log.status === "success";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Fulfillment Details
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Order Info */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order Info</h3>
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Order ID</span>
                <span className="font-mono text-sm text-right max-w-[220px] break-all">{log.order_id}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Item</span>
                <span className="text-sm text-right max-w-[220px]">{log.item_title || "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Platform</span>
                <Badge variant="outline" className="capitalize">{log.platform || "ebay"}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Time</span>
                <span className="text-sm flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(log.created_at), "MMM dd, yyyy · HH:mm")}
                </span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Buyer */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Buyer</h3>
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Username
                </span>
                <span className="text-sm">{log.buyer_username || "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </span>
                <span className="text-sm">{log.buyer_email || "—"}</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Key Dispatched */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Key className="h-3.5 w-3.5" /> Key Dispatched
            </h3>
            <div className="rounded-lg border bg-card p-3 space-y-2">
              {keyLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : dispatchedKeys.length > 0 ? (
                <div className="space-y-2">
                  {dispatchedKeys.map((k, i) => (
                    <div key={i} className="space-y-1">
                      {k.item_title && dispatchedKeys.length > 1 && (
                        <span className="text-xs text-muted-foreground">#{i + 1} — {k.item_title}</span>
                      )}
                      {k.item_title && dispatchedKeys.length === 1 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Product</span>
                          <span className="text-sm">{k.item_title}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                          {k.digital_key}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => copyToClipboard(k.digital_key)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : log.status === "skipped" ? (
                <p className="text-sm text-muted-foreground">
                  This eBay listing is not currently linked to an inventory product. If you've just linked it, click <span className="font-medium text-foreground">Retry</span> in Pending Orders — otherwise link it in <span className="font-medium text-foreground">Auto-Delivery → Products</span> to enable fulfillment.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No key found for this order</p>
              )}
            </div>
          </section>

          <Separator />

          {/* Status Checklist */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Status</h3>
            <div className="rounded-lg border bg-card p-3 space-y-3">
              {/* Overall */}
              <div className="flex items-center gap-2">
                {isSuccess ? (
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                ) : log.status === "pending" ? (
                  <MinusCircle className="h-5 w-5 text-yellow-500 shrink-0" />
                ) : log.status === "skipped" ? (
                  <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                )}
                <span className="text-sm font-medium capitalize">{log.status}</span>
              </div>

              <Separator />

              {/* Email */}
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email Delivery
                </span>
                {log.message_sent ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" /> Sent
                  </Badge>
                ) : log.message_error ? (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" /> Failed
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Not attempted</span>
                )}
              </div>
              {log.message_error && (
                <p className="text-xs text-destructive ml-6">{log.message_error}</p>
              )}

              {/* Invoice */}
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Invoice
                </span>
              {log.invoice_sent ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" /> Sent
                  </Badge>
                ) : log.invoice_error === "disabled" ? (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    <MinusCircle className="h-3 w-3 mr-1" /> Disabled
                  </Badge>
                ) : log.invoice_error ? (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" /> Failed
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Not attempted</span>
                )}
              </div>
              {log.invoice_error && (
                <p className="text-xs text-destructive ml-6">{log.invoice_error}</p>
              )}

              {/* Marketplace */}
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Marketplace Fulfilled
                </span>
                {log.marked_fulfilled ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" /> Yes
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">No</span>
                )}
              </div>
            </div>
          </section>

          {/* Delivery Message */}
          {log.message_body && (
            <>
              <Separator />
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Delivery Message
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(log.message_body!)}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="rounded-lg border bg-muted p-3 text-sm whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                  {log.message_body}
                </pre>
              </section>
            </>
          )}

          {/* Errors */}
          {hasErrors && (
            <>
              <Separator />
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-destructive uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Errors
                </h3>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  {log.error_message && (
                    <p className="text-sm text-destructive">{log.error_message}</p>
                  )}
                  {log.message_error && log.message_error !== log.error_message && (
                    <p className="text-sm text-destructive">Email: {log.message_error}</p>
                  )}
                  {log.invoice_error && log.invoice_error !== log.error_message && (
                    <p className="text-sm text-destructive">Invoice: {log.invoice_error}</p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
