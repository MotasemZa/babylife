import { Link } from "react-router-dom";
import { CheckCircle2, Copy } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";

type CopyBlock = {
  label: string;
  text: string;
};

function CopyButton({ label, text }: CopyBlock) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-2"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          toast({ title: "Copied", description: label });
        } catch {
          toast({
            title: "Copy failed",
            description: "Your browser blocked clipboard access.",
            variant: "destructive",
          });
        }
      }}
    >
      <Copy className="h-4 w-4" />
      Copy
    </Button>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" />
      <span className="text-sm text-foreground">{children}</span>
    </li>
  );
}

export function PlatformIntegrationChecklist() {
  const copyBlocks: CopyBlock[] = [
    {
      label: "Secret name template",
      text: [
        "<PLATFORM>_CLIENT_ID",
        "<PLATFORM>_CLIENT_SECRET",
        "<PLATFORM>_WEBHOOK_SECRET",
        "<PLATFORM>_REDIRECT_URI",
      ].join("\n"),
    },
    {
      label: "Backend function endpoints (pattern)",
      text: [
        "/functions/v1/<platform>-auth",
        "/functions/v1/<platform>-fetch-listings",
        "/functions/v1/<platform>-fetch-orders",
        "/functions/v1/<platform>-auto-fulfill",
        "/functions/v1/<platform>-webhook",
      ].join("\n"),
    },
    {
      label: "Key tables (current patterns)",
      text: [
        "user_<platform>_credentials",
        "platform_listings",
        "inventory_items",
        "digital_keys",
        "fulfillment_log",
        "transactions",
        "notification_settings",
      ].join("\n"),
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-heading">Platform Integration Checklist</CardTitle>
              <CardDescription>
                A single reference for everything that must be updated when adding a new platform (docs only).
              </CardDescription>
            </div>
            <Badge variant="secondary">Static reference</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {copyBlocks.map((b) => (
              <CopyButton key={b.label} label={b.label} text={b.text} />
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            Quick links:{" "}
            <Link className="text-accent hover:underline" to="/app/imports">
              Connections
            </Link>
            {" · "}
            <Link className="text-accent hover:underline" to="/app/listings">
              Listings
            </Link>
            {" · "}
            <Link className="text-accent hover:underline" to="/app/auto-delivery">
              Auto-Delivery
            </Link>
            {" · "}
            <Link className="text-accent hover:underline" to="/app/settings">
              Settings
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Checklist (expand sections)</CardTitle>
          <CardDescription>
            Follow top-to-bottom when wiring a new platform so you don’t miss hidden touchpoints.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="platform-definition">
              <AccordionTrigger>0) Platform definition (decisions first)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Choose a stable platform key (e.g. <code>etsy</code>, <code>amazon</code>) and keep it consistent across
                    DB rows, logs, and UI.
                  </ChecklistItem>
                  <ChecklistItem>
                    Define identifier mapping: order id format, listing/product id, variant id (if applicable), and SKU usage.
                  </ChecklistItem>
                  <ChecklistItem>
                    Decide trigger model: webhook vs scheduled polling vs manual “sweep”. Always define a fallback.
                  </ChecklistItem>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="auth-secrets">
              <AccordionTrigger>1) Auth & secrets (Connection)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Add required secrets: client id/secret, redirect URI(s), webhook secret/signing secret, plus any API base/region.
                  </ChecklistItem>
                  <ChecklistItem>
                    Create/extend a credentials table pattern (<code>user_&lt;platform&gt;_credentials</code>) to store tokens and shop/account identifiers.
                  </ChecklistItem>
                  <ChecklistItem>
                    Implement backend <code>&lt;platform&gt;-auth</code> actions: get-auth-url, callback, check-status, disconnect.
                  </ChecklistItem>
                  <ChecklistItem>
                    Update Connections hub UI (<code>/app/imports</code>) to show connected status, connect, disconnect, reconnect guidance.
                  </ChecklistItem>
                  <ChecklistItem>
                    Confirm token refresh logic exists (if tokens expire) and is used by every backend call.
                  </ChecklistItem>
                </ul>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Relevant files: <code>src/pages/app/Imports.tsx</code>, <code>src/services/*Service.ts</code>, <code>supabase/functions/&lt;platform&gt;-auth</code>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="listings">
              <AccordionTrigger>2) Listings fetching + inventory linking</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Implement <code>&lt;platform&gt;-fetch-listings</code> and normalize into <code>platform_listings</code> (title, image, price, currency, status, raw).
                  </ChecklistItem>
                  <ChecklistItem>
                    Ensure the UI lets you link a platform listing to an inventory item (set <code>inventory_item_id</code> on the listing).
                  </ChecklistItem>
                  <ChecklistItem>
                    Decide matching strategy: variant id mapping (preferred) → SKU fallback → manual selection.
                  </ChecklistItem>
                  <ChecklistItem>
                    Update Listings UI to include platform toggle + sync button + disconnected-but-browseable state.
                  </ChecklistItem>
                </ul>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Relevant files: <code>src/components/listings/ListingsTab.tsx</code>, <code>supabase/functions/*-fetch-listings</code>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="orders-sync">
              <AccordionTrigger>3) Orders sync (fetch + mapping)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Implement <code>&lt;platform&gt;-fetch-orders</code> to return paid/unfulfilled orders with line items, quantities, buyer email, and listing identifiers.
                  </ChecklistItem>
                  <ChecklistItem>
                    Confirm every order line item can be mapped to a listing and then to an <code>inventory_item_id</code>.
                  </ChecklistItem>
                  <ChecklistItem>
                    Decide what gets persisted: <code>transactions</code>, <code>fulfillment_log</code>, and whether you need a dedicated orders table.
                  </ChecklistItem>
                </ul>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Relevant files: <code>src/pages/app/AutoDelivery.tsx</code>, <code>supabase/functions/*-fetch-orders</code>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="auto-delivery">
              <AccordionTrigger>4) Auto-delivery (keys + email + fulfill)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Quantity handling: allocate <strong>N</strong> keys for quantity <strong>N</strong>; decide partial vs all-or-nothing behavior.
                  </ChecklistItem>
                  <ChecklistItem>
                    Idempotency: retries must never resend keys (guard by <code>message_sent</code> / delivered state).
                  </ChecklistItem>
                  <ChecklistItem>
                    Fulfillment step is separate from email: update platform “fulfilled” only after keys are sent and allocated.
                  </ChecklistItem>
                  <ChecklistItem>
                    Ensure key allocation is safe under concurrency (avoid double-claim of keys).
                  </ChecklistItem>
                  <ChecklistItem>
                    Make sure logs show what happened: <code>message_sent</code>, <code>marked_fulfilled</code>, <code>message_error</code>/<code>error_message</code>.
                  </ChecklistItem>
                </ul>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Relevant files: <code>supabase/functions/*-auto-fulfill</code>, <code>supabase/functions/email-send</code>, <code>fulfillment_log</code>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="webhooks">
              <AccordionTrigger>5) Webhooks / triggers</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Verify signatures on every webhook (HMAC/JWT/etc). Reject invalid requests.
                  </ChecklistItem>
                  <ChecklistItem>
                    Install/uninstall webhooks during connect/disconnect flows where possible.
                  </ChecklistItem>
                  <ChecklistItem>
                    Ensure webhook handler triggers fulfillment safely (idempotent + logs).
                  </ChecklistItem>
                  <ChecklistItem>
                    Decide fallback polling schedule for missed webhooks (backend), not UI-only.
                  </ChecklistItem>
                </ul>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Relevant files: <code>supabase/functions/*-webhook</code>, <code>supabase/functions/scheduled-sync</code>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="notifications">
              <AccordionTrigger>6) Notifications (Telegram + email)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Trigger Telegram notifications for success/failure/out-of-stock using existing notification preferences.
                  </ChecklistItem>
                  <ChecklistItem>
                    Confirm fulfillment email uses the configured SMTP path (user SMTP or platform sender) and correct buyer email field.
                  </ChecklistItem>
                  <ChecklistItem>
                    Ensure platform-specific errors are surfaced in logs so they can be triaged quickly.
                  </ChecklistItem>
                </ul>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Relevant files: <code>supabase/functions/telegram-notify</code>, <code>supabase/functions/email-send</code>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="admin-debug">
              <AccordionTrigger>7) Admin debugging (avoid back-and-forth)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  <ChecklistItem>
                    Always add a <code>check-status</code> action so you can tell “connected vs broken scopes vs expired token”.
                  </ChecklistItem>
                  <ChecklistItem>
                    Ensure the Auto-Delivery page can display pending orders for the platform (even if fulfillment fails).
                  </ChecklistItem>
                  <ChecklistItem>
                    Ensure failures write a clear <code>error_message</code> and preserve raw platform error text for debugging.
                  </ChecklistItem>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
