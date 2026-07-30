import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SMTP_ENCRYPTION_KEY = Deno.env.get("SMTP_ENCRYPTION_KEY") ?? "";

type SaveRequest = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string | null;
  from_email: string;
  from_name?: string | null;
  reply_to?: string | null;
  bcc_email?: string | null;
  email_footer_html?: string | null;
};

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function deriveAesKey(raw: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptPassword(plaintext: string): Promise<string> {
  if (!SMTP_ENCRYPTION_KEY) throw new Error("Missing SMTP_ENCRYPTION_KEY");
  const key = await deriveAesKey(SMTP_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `v1:${base64Encode(iv)}:${base64Encode(new Uint8Array(ct))}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as SaveRequest;
    if (!body?.host || !body?.port || !body?.username || !body?.from_email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = auth.user.id;

    // Keep existing encrypted password if not provided
    let passwordEncrypted: string | null = null;
    if (body.password && body.password.trim().length > 0) {
      passwordEncrypted = await encryptPassword(body.password);
    } else {
      const { data: existing } = await supabase
        .from("smtp_settings" as any)
        .select("password_encrypted")
        .eq("user_id", userId)
        .maybeSingle();
      passwordEncrypted = (existing?.password_encrypted as string | null) ?? null;
    }

    const payload = {
      user_id: userId,
      enabled: true,
      host: body.host,
      port: body.port,
      secure: body.secure,
      username: body.username,
      password_encrypted: passwordEncrypted,
      from_email: body.from_email,
      from_name: body.from_name ?? null,
      reply_to: body.reply_to ?? null,
      bcc_email: body.bcc_email ?? null,
      email_footer_html: body.email_footer_html ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("smtp_settings" as any)
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("smtp-user-save error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
