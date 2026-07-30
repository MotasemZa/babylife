import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface EbayConnectionStatus {
  connected: boolean;
  tokenExpired: boolean | null;
  expiresAt: string | null;
}

export interface EbayFetchResult {
  success: boolean;
  rowsImported: number;
  errorCount: number;
  errors: Array<{ type: string; message: string }>;
}

type EbayFetchAction = 'orders' | 'finances' | 'payouts' | 'all';

export type EbaySyncProgress = {
  value: number; // 0-100
  label: string;
};

type EbayFetchCursor = {
  stage: 'orders' | 'finances' | 'payouts';
  offset: number;
};

type EbayFetchChunkResponse = {
  success: boolean;
  importId: string;
  done: boolean;
  nextCursor: EbayFetchCursor | null;
  progress?: {
    stage: 'orders' | 'finances' | 'payouts';
    message: string;
    overallPercent?: number;
  };
  rowsImported?: number;
  rowsImportedTotal?: number;
  errorCount?: number;
  errors?: Array<{ type: string; message: string }>;
};

export const ebayService = {
  /**
   * Get the eBay OAuth authorization URL
   */
  async getAuthUrl(): Promise<string> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ebay-auth?action=get-auth-url`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get auth URL');
    }

    const data = await response.json();
    return data.authUrl;
  },

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string, userId: string): Promise<{ success: boolean; expiresAt: string }> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ebay-auth?action=exchange-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to exchange code');
    }

    return response.json();
  },

  /**
   * Check eBay connection status
   */
  async checkConnectionStatus(): Promise<EbayConnectionStatus> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`${SUPABASE_URL}/functions/v1/ebay-auth?action=check-status`, {
      headers: {
        Authorization: session ? `Bearer ${session.access_token}` : '',
      },
    });

    if (!response.ok) {
      return { connected: false, tokenExpired: null, expiresAt: null };
    }

    return response.json();
  },

  /**
   * Refresh eBay token
   */
  async refreshToken(userId: string): Promise<{ success: boolean; expiresAt: string }> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ebay-auth?action=refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to refresh token');
    }

    return response.json();
  },

  /**
   * Fetch data from eBay (runs in small chunks to avoid timeouts).
   */
  async fetchData(
    action: EbayFetchAction,
    startDate?: string,
    endDate?: string,
    onProgress?: (progress: EbaySyncProgress) => void
  ): Promise<EbayFetchResult> {
    let cursor: EbayFetchCursor | null = null;
    let importId: string | undefined;

    let rowsImportedTotal = 0;
    let aggregatedErrors: Array<{ type: string; message: string }> = [];

    const maxIterations = 250; // safety to avoid infinite loops
    for (let i = 0; i < maxIterations; i++) {
      onProgress?.({ value: Math.min(99, rowsImportedTotal > 0 ? 5 : 1), label: 'Starting sync…' });

      const { data, error } = await supabase.functions.invoke('ebay-fetch-data', {
        body: { action, startDate, endDate, cursor, importId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch data');
      }

      const resp = data as EbayFetchChunkResponse;

      importId = resp.importId;
      cursor = resp.nextCursor;

      if (typeof resp.rowsImportedTotal === 'number') {
        rowsImportedTotal = resp.rowsImportedTotal;
      } else if (typeof resp.rowsImported === 'number') {
        rowsImportedTotal += resp.rowsImported;
      }

      if (Array.isArray(resp.errors) && resp.errors.length > 0) {
        aggregatedErrors = aggregatedErrors.concat(resp.errors);
      }

      const pct = Math.max(0, Math.min(100, resp.progress?.overallPercent ?? 0));
      const label = resp.progress?.message || 'Syncing…';
      onProgress?.({ value: pct, label });

      if (resp.done) {
        return {
          success: true,
          rowsImported: rowsImportedTotal,
          errorCount: aggregatedErrors.length,
          errors: aggregatedErrors.slice(0, 10),
        };
      }

      // tiny breather so the UI can paint between chunks
      await new Promise((r) => setTimeout(r, 150));
    }

    throw new Error('Sync is taking too long. Try a smaller date range.');
  },

  /**
   * Backfill eBay-collected tax amounts from already-synced order data.
   * (No eBay API call — uses existing raw order payloads.)
   */
  async backfillTaxCollected(): Promise<{ success: boolean; updated: number; scanned: number }> {
    const { data, error } = await supabase.functions.invoke('ebay-backfill-tax');

    if (error) {
      throw new Error(error.message || 'Failed to backfill tax data');
    }

    return data as { success: boolean; updated: number; scanned: number };
  },

  /**
   * Check if signing keys exist for the user
   */
  async checkSigningKeys(): Promise<{ hasSigningKeys: boolean; keyId: string | null }> {
    const { data, error } = await supabase.functions.invoke('ebay-signing-keys', {
      body: { action: 'check' },
    });

    if (error) {
      return { hasSigningKeys: false, keyId: null };
    }

    return data as { hasSigningKeys: boolean; keyId: string | null };
  },

  /**
   * Generate eBay Digital Signature keys (for EU/UK sellers)
   */
  async generateSigningKeys(): Promise<{ success: boolean; keyId: string; message: string }> {
    const { data, error } = await supabase.functions.invoke('ebay-signing-keys', {
      body: { action: 'generate' },
    });

    if (error) {
      throw new Error(error.message || 'Failed to generate signing keys');
    }

    return data as { success: boolean; keyId: string; message: string };
  },
};

