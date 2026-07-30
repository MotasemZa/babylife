import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CreditCard,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
import { format } from "date-fns";

import { adminService, type AdminUserDetail, type AdminUserSummary } from "@/services/adminService";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function statusBadge(status: string | null | undefined) {
  const s = status ?? "none";
  switch (s) {
    case "active":
      return <Badge className="bg-accent text-accent-foreground">Active</Badge>;
    case "trialing":
      return <Badge className="bg-primary text-primary-foreground">Trial</Badge>;
    case "canceled":
      return <Badge variant="secondary">Canceled</Badge>;
    case "expired":
      return <Badge variant="destructive">Expired</Badge>;
    default:
      return <Badge variant="outline">{s}</Badge>;
  }
}

function stateBadge(user: AdminUserSummary) {
  if (user.state?.deleted_at) return <Badge variant="destructive">Deactivated</Badge>;
  if (user.state?.blocked_at) return <Badge variant="secondary">Blocked</Badge>;
  return <Badge variant="outline">OK</Badge>;
}

export function AdminUsersSplitView() {
  const [page, setPage] = useState(1);
  const [perPage] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [creditsDelta, setCreditsDelta] = useState<string>("10");
  const [creditsNote, setCreditsNote] = useState<string>("");

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState<string>("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string>("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email ?? "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
  }, [users, search]);

  async function load() {
    setIsLoading(true);
    try {
      const res = await adminService.listUsers({ page, perPage });
      setUsers(res.items);
      setTotal(res.total);
      if (!selectedId && res.items.length) setSelectedId(res.items[0].id);
    } catch (e: any) {
      toast({
        title: "Failed to load users",
        description: e?.message || e?.details || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(userId: string) {
    setDetailLoading(true);
    try {
      const res = await adminService.getUser(userId);
      setDetail(res.user);
    } catch (e: any) {
      toast({
        title: "Failed to load user detail",
        description: e?.message || e?.details || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function refresh() {
    setIsRefreshing(true);
    await load();
    if (selectedId) await loadDetail(selectedId);
    setIsRefreshing(false);
  }

  const stats = useMemo(() => {
    const active = users.filter((u) => u.subscription?.status === "active").length;
    const trial = users.filter((u) => u.subscription?.status === "trialing").length;
    const blocked = users.filter((u) => !!u.state?.blocked_at).length;
    const deactivated = users.filter((u) => !!u.state?.deleted_at).length;
    return { active, trial, blocked, deactivated };
  }, [users]);

  const selected = useMemo(() => users.find((u) => u.id === selectedId) ?? null, [users, selectedId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">Moderate accounts, manage credits, and control access.</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={isRefreshing} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-semibold">{total ?? users.length}</div>
            <User className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-semibold text-accent">{stats.active}</div>
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-semibold">{stats.blocked}</div>
            <Ban className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deactivated</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-3xl font-semibold">{stats.deactivated}</div>
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email or user id" className="pl-9" />
            </div>
            <Separator />
            <div className="text-xs text-muted-foreground">Click a user to open details.</div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                {filtered.map((u) => {
                  const active = u.id === selectedId;
                  return (
                    <button
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className={cn(
                        "w-full border-b px-4 py-3 text-left transition-colors",
                        active ? "bg-muted/60" : "hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {u.email ?? <span className="text-muted-foreground">(no email)</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">{u.id.slice(0, 8)}…</span>
                            {stateBadge(u)}
                            {statusBadge(u.subscription?.status)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">{u.settings.ai_credits}</div>
                          <div className="text-[11px] text-muted-foreground">credits</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{u.settings.is_ebay_connected ? "eBay ✓" : "eBay —"}</span>
                        <span>{u.settings.is_shopify_connected ? "Shopify ✓" : "Shopify —"}</span>
                        <span>Joined {format(new Date(u.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate">{selected?.email ?? "User"}</CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selected && stateBadge(selected)}
                  {statusBadge(selected?.subscription?.status)}
                  {selected?.settings.is_ebay_connected && <Badge variant="secondary">eBay connected</Badge>}
                  {selected?.settings.is_shopify_connected && <Badge variant="secondary">Shopify connected</Badge>}
                </div>
                <div className="mt-2 font-mono text-xs text-muted-foreground">{selected?.id}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCreditsDialogOpen(true)}
                  disabled={!selectedId}
                  className="gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Credits
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBlockDialogOpen(true)}
                  disabled={!selectedId}
                  className="gap-2"
                >
                  <Ban className="h-4 w-4" />
                  {selected?.state?.blocked_at ? "Unblock" : "Block"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={!selectedId}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Deactivate
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {detailLoading ? (
              <div className="text-sm text-muted-foreground">Loading details…</div>
            ) : !detail ? (
              <div className="text-sm text-muted-foreground">Select a user to view details.</div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Orders</div>
                    <div className="text-2xl font-semibold">{detail.stats.orders_count}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Transactions</div>
                    <div className="text-2xl font-semibold">{detail.stats.transactions_count}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Listings</div>
                    <div className="text-2xl font-semibold">{detail.stats.listings_count}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Invoices</div>
                    <div className="text-2xl font-semibold">{detail.stats.invoices_count}</div>
                  </div>
                </div>

                <Tabs defaultValue="subscription" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="subscription">Subscription</TabsTrigger>
                    <TabsTrigger value="credits">Credit log</TabsTrigger>
                  </TabsList>
                  <TabsContent value="subscription" className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Status</div>
                        <div className="text-xs text-muted-foreground">Override access for support / moderation.</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(["trialing", "active", "canceled", "expired"] as const).map((s) => (
                          <Button
                            key={s}
                            variant={detail.subscription?.status === s ? "accent" : "outline"}
                            size="sm"
                            onClick={async () => {
                              try {
                                await adminService.setSubscription({ userId: detail.id, status: s });
                                toast({ title: "Subscription updated", description: `Set to ${s}.` });
                                await refresh();
                              } catch (e: any) {
                                toast({ title: "Failed", description: e?.message || e?.details || "Unknown error", variant: "destructive" });
                              }
                            }}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {detail.subscription && (
                      <div className="grid gap-2 rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Trial</span>
                          <span>
                            {format(new Date(detail.subscription.trial_start), "MMM d")}
                            {" – "}
                            {format(new Date(detail.subscription.trial_end), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Renews</span>
                          <span>
                            {detail.subscription.current_period_end
                              ? format(new Date(detail.subscription.current_period_end), "MMM d, yyyy")
                              : "—"}
                          </span>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="credits" className="mt-4 space-y-2">
                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-medium">Recent credit adjustments</div>
                      <div className="mt-3 space-y-2">
                        {detail.credit_transactions.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No credit changes recorded.</div>
                        ) : (
                          detail.credit_transactions.slice(0, 10).map((t) => (
                            <div key={t.id} className="flex items-start justify-between gap-3 rounded-md bg-muted/30 p-2">
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy · p")}</div>
                                <div className="truncate text-sm">{t.description ?? t.type}</div>
                              </div>
                              <div className={cn("shrink-0 text-sm font-semibold", t.amount >= 0 ? "text-accent" : "text-destructive")}>
                                {t.amount >= 0 ? "+" : ""}
                                {t.amount}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Credits dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust AI credits</DialogTitle>
            <DialogDescription>Positive adds credits; negative deducts. This is audit-logged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Delta</Label>
              <Input value={creditsDelta} onChange={(e) => setCreditsDelta(e.target.value)} placeholder="e.g. 10 or -5" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={creditsNote} onChange={(e) => setCreditsNote(e.target.value)} placeholder="Reason for the adjustment" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreditsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={async () => {
                  if (!selectedId) return;
                  const delta = Number(creditsDelta);
                  if (!Number.isFinite(delta) || delta === 0) {
                    toast({ title: "Invalid delta", description: "Enter a non-zero number.", variant: "destructive" });
                    return;
                  }
                  try {
                    await adminService.adjustCredits({ userId: selectedId, delta, note: creditsNote || undefined });
                    toast({ title: "Credits updated" });
                    setCreditsDialogOpen(false);
                    setCreditsNote("");
                    await refresh();
                  } catch (e: any) {
                    toast({ title: "Failed", description: e?.message || e?.details || "Unknown error", variant: "destructive" });
                  }
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.state?.blocked_at ? "Unblock user" : "Block user"}</DialogTitle>
            <DialogDescription>
              {selected?.state?.blocked_at
                ? "Unblocking restores login; integrations will remain disconnected."
                : "Blocking disconnects integrations and expires access."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!selected?.state?.blocked_at && (
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Why are you blocking this user?" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={selected?.state?.blocked_at ? "accent" : "destructive"}
                onClick={async () => {
                  if (!selectedId) return;
                  try {
                    const blocked = !selected?.state?.blocked_at;
                    await adminService.setBlock({ userId: selectedId, blocked, reason: blockReason || undefined });
                    toast({ title: blocked ? "User blocked" : "User unblocked" });
                    setBlockDialogOpen(false);
                    setBlockReason("");
                    await refresh();
                  } catch (e: any) {
                    toast({ title: "Failed", description: e?.message || e?.details || "Unknown error", variant: "destructive" });
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate + anonymize</DialogTitle>
            <DialogDescription>
              This will disconnect integrations, expire access, anonymize PII in app data, and ban login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Why are you deactivating?" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!selectedId) return;
                  try {
                    await adminService.anonymizeDeactivate({ userId: selectedId, reason: deleteReason || undefined });
                    toast({ title: "User deactivated" });
                    setDeleteDialogOpen(false);
                    setDeleteReason("");
                    await refresh();
                  } catch (e: any) {
                    toast({ title: "Failed", description: e?.message || e?.details || "Unknown error", variant: "destructive" });
                  }
                }}
              >
                Deactivate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
