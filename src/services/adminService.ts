import { supabase } from "@/integrations/supabase/client";

export type AdminListUsersResponse = {
  items: AdminUserSummary[];
  page: number;
  perPage: number;
  total: number | null;
};

export type AdminUserState = {
  blocked_at: string | null;
  blocked_reason: string | null;
  deleted_at: string | null;
  deleted_reason: string | null;
  updated_at: string;
};

export type AdminUserSubscription = {
  status: string;
  trial_start: string;
  trial_end: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

export type AdminUserSummary = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  settings: {
    ai_credits: number;
    country: string | null;
    is_ebay_connected: boolean;
    is_shopify_connected: boolean;
  };
  subscription: AdminUserSubscription | null;
  state: AdminUserState | null;
};

export type AdminUserDetail = AdminUserSummary & {
  stats: {
    orders_count: number;
    transactions_count: number;
    listings_count: number;
    invoices_count: number;
  };
  credit_transactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string | null;
    created_at: string;
  }>;
};

async function invoke<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw error;
  return data as T;
}

export const adminService = {
  listUsers: (params: { page: number; perPage: number }) =>
    invoke<AdminListUsersResponse>({ action: "list-users", ...params }),

  getUser: (userId: string) => invoke<{ user: AdminUserDetail }>({ action: "get-user", userId }),

  setBlock: (params: { userId: string; blocked: boolean; reason?: string }) =>
    invoke<{ ok: boolean }>({ action: "set-block", ...params }),

  adjustCredits: (params: { userId: string; delta: number; note?: string }) =>
    invoke<{ ok: boolean; ai_credits: number }>({ action: "adjust-credits", ...params }),

  setSubscription: (params: { userId: string; status: string }) =>
    invoke<{ ok: boolean }>({ action: "set-subscription", ...params }),

  anonymizeDeactivate: (params: { userId: string; reason?: string }) =>
    invoke<{ ok: boolean }>({ action: "anonymize-deactivate", ...params }),
};
