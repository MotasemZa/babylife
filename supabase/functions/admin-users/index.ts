import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action =
  | "list-users"
  | "get-user"
  | "set-block"
  | "adjust-credits"
  | "set-subscription"
  | "anonymize-deactivate";

type JsonRecord = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(message: string) {
  return json({ error: message }, 400);
}

function forbidden(message: string) {
  return json({ error: message }, 403);
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey) {
    // Misconfigured backend (admin APIs won't work)
    return { ok: false as const, error: forbidden("Admin service unavailable") };
  }

  const anon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { persistSession: false },
      global: {
        headers: token ? { Authorization: authHeader } : {},
      },
    },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
    { auth: { persistSession: false } },
  );
  if (!token) return { ok: false as const, error: forbidden("Missing auth token") };

  const { data: authData, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !authData.user) {
    return { ok: false as const, error: forbidden("Not authenticated") };
  }

  // Validate admin using the caller's JWT so this matches app-side expectations.
  const { data: roleRow, error: roleErr } = await anon
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr) {
    console.error("Role lookup failed", roleErr);
    return {
      ok: false as const,
      error: forbidden(`Role lookup failed: ${roleErr.message}`),
    };
  }
  if (!roleRow) {
    console.error("Admin role not found for", authData.user.id);
    return {
      ok: false as const,
      error: forbidden(`Admin role not found for ${authData.user.id}`),
    };
  }

  return { ok: true as const, admin, caller: authData.user };
}

// NOTE: Deno typechecking for supabase-js generics is stricter than needed here.
// We intentionally treat the client as `any` inside the edge runtime.
async function fetchSettingsAndState(admin: any, userIds: string[]) {
  if (userIds.length === 0) return { settingsByUserId: new Map(), stateByUserId: new Map(), subsByUserId: new Map(), shopifyByUserId: new Map() };

  const [settingsRes, stateRes, subsRes, shopifyRes] = await Promise.all([
    admin
      .from("user_settings_safe")
      .select("user_id, ai_credits, country, is_ebay_connected")
      .in("user_id", userIds),
    admin
      .from("admin_user_state")
      .select("user_id, blocked_at, blocked_reason, deleted_at, deleted_reason, updated_at")
      .in("user_id", userIds),
    admin
      .from("subscriptions")
      .select("user_id, status, trial_start, trial_end, current_period_start, current_period_end")
      .in("user_id", userIds),
    admin
      .from("user_shopify_credentials")
      .select("user_id")
      .in("user_id", userIds),
  ]);

  const settingsByUserId = new Map<string, any>((settingsRes.data ?? []).map((r: any) => [r.user_id, r]));
  const stateByUserId = new Map<string, any>((stateRes.data ?? []).map((r: any) => [r.user_id, r]));
  const subsByUserId = new Map<string, any>((subsRes.data ?? []).map((r: any) => [r.user_id, r]));
  const shopifyByUserId = new Map<string, boolean>();
  for (const row of shopifyRes.data ?? []) {
    shopifyByUserId.set((row as any).user_id, true);
  }
  return { settingsByUserId, stateByUserId, subsByUserId, shopifyByUserId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { ok, error, admin } = await requireAdmin(req);
  if (!ok) return error;

  let body: JsonRecord = {};
  try {
    body = (await req.json()) as JsonRecord;
  } catch {
    // no-op
  }

  const action = body.action as Action | undefined;
  if (!action) return badRequest("Missing action");

  try {
    switch (action) {
      case "list-users": {
        const page = Number(body.page ?? 1);
        const perPage = Math.min(200, Math.max(1, Number(body.perPage ?? 50)));

        const { data: listRes, error: listErr } = await admin.auth.admin.listUsers({
          page,
          perPage,
        });
        if (listErr) throw listErr;

        const users = listRes?.users ?? [];
        const userIds = users.map((u) => u.id);
        const { settingsByUserId, stateByUserId, subsByUserId, shopifyByUserId } = await fetchSettingsAndState(admin, userIds);

        const items = users.map((u) => {
          const s = settingsByUserId.get(u.id);
          const sub = subsByUserId.get(u.id);
          const st = stateByUserId.get(u.id);
          return {
            id: u.id,
            email: u.email ?? null,
            created_at: u.created_at,
            last_sign_in_at: (u as any).last_sign_in_at ?? null,
            settings: {
              ai_credits: s?.ai_credits ?? 0,
              country: s?.country ?? null,
              is_ebay_connected: !!s?.is_ebay_connected,
              is_shopify_connected: !!shopifyByUserId.get(u.id),
            },
            subscription: sub
              ? {
                  status: sub.status,
                  trial_start: sub.trial_start,
                  trial_end: sub.trial_end,
                  current_period_start: sub.current_period_start,
                  current_period_end: sub.current_period_end,
                }
              : null,
            state: st
              ? {
                  blocked_at: st.blocked_at,
                  blocked_reason: st.blocked_reason,
                  deleted_at: st.deleted_at,
                  deleted_reason: st.deleted_reason,
                  updated_at: st.updated_at,
                }
              : null,
          };
        });

        return json({ items, page, perPage, total: listRes?.total ?? null });
      }

      case "get-user": {
        const userId = String(body.userId ?? "");
        if (!userId) return badRequest("Missing userId");

        const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
        if (userErr) throw userErr;

        const { settingsByUserId, stateByUserId, subsByUserId, shopifyByUserId } = await fetchSettingsAndState(admin, [userId]);
        const s = settingsByUserId.get(userId);
        const sub = subsByUserId.get(userId);
        const st = stateByUserId.get(userId);

        const [ordersRes, transactionsRes, listingsRes, invoicesRes, creditsRes] = await Promise.all([
          admin.from("buyer_addresses").select("id", { count: "exact", head: true }).eq("user_id", userId),
          admin.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
          admin.from("listings").select("id", { count: "exact", head: true }).eq("user_id", userId),
          admin.from("invoices").select("id", { count: "exact", head: true }).eq("user_id", userId),
          admin
            .from("credit_transactions")
            .select("id, amount, type, description, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        return json({
          user: {
            id: userRes.user?.id ?? userId,
            email: userRes.user?.email ?? null,
            created_at: userRes.user?.created_at ?? null,
            last_sign_in_at: (userRes.user as any)?.last_sign_in_at ?? null,
            settings: {
              ai_credits: s?.ai_credits ?? 0,
              country: s?.country ?? null,
              is_ebay_connected: !!s?.is_ebay_connected,
              is_shopify_connected: !!shopifyByUserId.get(userId),
            },
            subscription: sub
              ? {
                  status: sub.status,
                  trial_start: sub.trial_start,
                  trial_end: sub.trial_end,
                  current_period_start: sub.current_period_start,
                  current_period_end: sub.current_period_end,
                }
              : null,
            state: st
              ? {
                  blocked_at: st.blocked_at,
                  blocked_reason: st.blocked_reason,
                  deleted_at: st.deleted_at,
                  deleted_reason: st.deleted_reason,
                  updated_at: st.updated_at,
                }
              : null,
            stats: {
              orders_count: ordersRes.count ?? 0,
              transactions_count: transactionsRes.count ?? 0,
              listings_count: listingsRes.count ?? 0,
              invoices_count: invoicesRes.count ?? 0,
            },
            credit_transactions: creditsRes.data ?? [],
          },
        });
      }

      case "set-block": {
        const userId = String(body.userId ?? "");
        const blocked = Boolean(body.blocked);
        const reason = (body.reason ? String(body.reason) : null) as string | null;
        if (!userId) return badRequest("Missing userId");

        // Upsert admin_user_state
        const patch: any = {
          user_id: userId,
          blocked_at: blocked ? new Date().toISOString() : null,
          blocked_reason: blocked ? reason : null,
          updated_at: new Date().toISOString(),
        };
        const { error: upsertErr } = await admin
          .from("admin_user_state")
          .upsert(patch, { onConflict: "user_id" });
        if (upsertErr) throw upsertErr;

        if (blocked) {
          // Disconnect integrations
          await Promise.all([
            admin.from("user_ebay_credentials").delete().eq("user_id", userId),
            admin.from("user_shopify_credentials").delete().eq("user_id", userId),
          ]);

          // Force-expire access at app level
          await admin
            .from("subscriptions")
            .update({
              status: "expired",
              current_period_start: null,
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }

        return json({ ok: true });
      }

      case "adjust-credits": {
        const userId = String(body.userId ?? "");
        const delta = Number(body.delta ?? 0);
        const note = (body.note ? String(body.note) : null) as string | null;
        if (!userId) return badRequest("Missing userId");
        if (!Number.isFinite(delta) || delta === 0) return badRequest("delta must be a non-zero number");

        // Ensure settings row exists
        await admin
          .from("user_settings")
          .upsert({ user_id: userId }, { onConflict: "user_id" });

        const { data: settings, error: settingsErr } = await admin
          .from("user_settings")
          .select("ai_credits")
          .eq("user_id", userId)
          .maybeSingle();
        if (settingsErr) throw settingsErr;

        const current = Number(settings?.ai_credits ?? 0);
        const next = Math.max(0, current + delta);

        const { error: updateErr } = await admin
          .from("user_settings")
          .update({ ai_credits: next, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (updateErr) throw updateErr;

        await admin.from("credit_transactions").insert({
          user_id: userId,
          amount: delta,
          type: delta > 0 ? "admin_grant" : "admin_deduct",
          description: note ?? "Admin adjustment",
        });

        return json({ ok: true, ai_credits: next });
      }

      case "set-subscription": {
        const userId = String(body.userId ?? "");
        const status = String(body.status ?? "");
        if (!userId) return badRequest("Missing userId");
        if (!status) return badRequest("Missing status");

        // Ensure subscription row exists
        await admin
          .from("subscriptions")
          .upsert({ user_id: userId, status: "trialing" }, { onConflict: "user_id" });

        const patch: any = {
          status,
          updated_at: new Date().toISOString(),
        };

        // If setting active manually, ensure period end exists
        if (status === "active") {
          const now = new Date();
          const end = new Date(now);
          end.setDate(end.getDate() + 30);
          patch.current_period_start = now.toISOString();
          patch.current_period_end = end.toISOString();
        }

        if (status === "canceled" || status === "expired") {
          patch.current_period_start = null;
          patch.current_period_end = null;
        }

        const { error: subErr } = await admin
          .from("subscriptions")
          .update(patch)
          .eq("user_id", userId);
        if (subErr) throw subErr;

        return json({ ok: true });
      }

      case "anonymize-deactivate": {
        const userId = String(body.userId ?? "");
        const reason = (body.reason ? String(body.reason) : null) as string | null;
        if (!userId) return badRequest("Missing userId");

        // Mark deleted in admin_user_state
        const { error: stateErr } = await admin
          .from("admin_user_state")
          .upsert(
            {
              user_id: userId,
              deleted_at: new Date().toISOString(),
              deleted_reason: reason,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        if (stateErr) throw stateErr;

        // Disconnect integrations + revoke access
        await Promise.all([
          admin.from("user_ebay_credentials").delete().eq("user_id", userId),
          admin.from("user_shopify_credentials").delete().eq("user_id", userId),
          admin
            .from("subscriptions")
            .update({
              status: "expired",
              current_period_start: null,
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId),
        ]);

        // Anonymize PII where possible while preserving the data model
        await Promise.all([
          admin
            .from("buyer_addresses")
            .update({
              buyer_email: null,
              buyer_username: null,
              full_name: null,
              street_address: null,
              city: null,
              state_province: null,
              postal_code: null,
              country_name: null,
              phone: null,
              raw_data: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId),
          admin
            .from("invoices")
            .update({
              buyer_name: null,
              buyer_email: null,
              buyer_address: null,
              buyer_vat_number: null,
              seller_email: null,
              seller_address: null,
              seller_name: null,
              seller_vat_number: null,
              sent_to_email: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId),
          admin
            .from("user_settings")
            .update({
              seller_business_name: null,
              seller_address: null,
              seller_email: null,
              seller_vat_number: null,
              invoice_logo_url: null,
              invoice_motto: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId),
        ]);

        // Optionally ban the auth account (prevents login). Keep record for audit.
        await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }); // ~100 years

        return json({ ok: true });
      }
    }
  } catch (e: any) {
    const message = e?.message || e?.error_description || "Unknown error";
    console.error("admin-users error:", e);
    return json({ error: message }, 400);
  }
});
