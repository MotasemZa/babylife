import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { writeAll } from "jsr:@std/io";

// Compatibility shim: some SMTP libs expect the legacy `Deno.writeAll` API.
// Edge runtime doesn't provide it, so we shim it from std.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Deno as any).writeAll = writeAll;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMTP_ENCRYPTION_KEY = Deno.env.get("SMTP_ENCRYPTION_KEY") ?? "";

function replaceFooterVariables(html: string, vars: { sellerName: string; sellerEmail: string; sellerPhone: string }): string {
  return html
    .replace(/\{SELLER_NAME\}/g, vars.sellerName)
    .replace(/\{SELLER_EMAIL\}/g, vars.sellerEmail)
    .replace(/\{SELLER_PHONE\}/g, vars.sellerPhone);
}

type TestRequest = {
  to?: string;
};

function normalizeHost(raw: string): string {
  return (raw || "").trim().toLowerCase();
}

function validateSmtpEndpoint(host: string, port: number, secure: boolean): string | null {
  const h = normalizeHost(host);
  if (!h) return "Missing SMTP host";

  // Common misconfiguration: users paste IMAP/POP hostnames.
  if (/(^|\.)imap(\.|$)/.test(h) || /(^|\.)pop(\.|$)/.test(h)) {
    return "You entered an IMAP/POP host. Please use your provider's SMTP host (often starts with smtp.).";
  }
  if (port === 993 || port === 995) {
    return "You entered an IMAP/POP port. Please use an SMTP port like 465 (SSL) or 587 (STARTTLS).";
  }

  // This function supports implicit TLS (port 465) when secure=true.
  // Port 587 typically requires STARTTLS upgrade, which this SMTP client does not perform.
  if (secure && port === 587) {
    return "Port 587 usually requires STARTTLS (not supported here). Use port 465 with SSL/TLS enabled, or disable SSL/TLS if your server supports plain auth on 587.";
  }
  return null;
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(raw: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decryptPassword(enc: string): Promise<string> {
  if (!SMTP_ENCRYPTION_KEY) throw new Error("Missing SMTP_ENCRYPTION_KEY");
  const parts = enc.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Invalid encrypted password format");
  const ivRaw = base64Decode(parts[1]);
  // Ensure IV is backed by a plain ArrayBuffer (not ArrayBufferLike) for typecheck compatibility
  const iv = new Uint8Array(new ArrayBuffer(ivRaw.length));
  iv.set(ivRaw);
  const ctBytes = base64Decode(parts[2]);
  const ct = ctBytes.buffer.slice(ctBytes.byteOffset, ctBytes.byteOffset + ctBytes.byteLength) as ArrayBuffer;
  const key = await deriveAesKey(SMTP_ENCRYPTION_KEY);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    const body = (await req.json().catch(() => ({}))) as TestRequest;
    const to = (body.to || auth.user.email || "").trim();
    if (!to || !isValidEmail(to)) {
      return new Response(JSON.stringify({ error: "Invalid recipient email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("smtp_settings" as any)
      .select("enabled, host, port, secure, username, password_encrypted, from_email, from_name, reply_to, email_footer_html")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings?.enabled || !settings?.host || !settings?.port || !settings?.username) {
      return new Response(JSON.stringify({ error: "SMTP is not configured for this user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!settings.password_encrypted) {
      return new Response(JSON.stringify({ error: "Missing SMTP password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const password = await decryptPassword(settings.password_encrypted as string);
    const fromEmail = (settings.from_email as string) || (auth.user.email as string);
    const fromName = (settings.from_name as string) || "Test";

    // Fetch seller info for footer variable replacement
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userSettings } = await supabaseAdmin
      .from("user_settings")
      .select("seller_business_name, seller_email, seller_contact_phone, seller_contact_name")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const footerVars = {
      sellerName: String(userSettings?.seller_business_name || userSettings?.seller_contact_name || fromName || ""),
      sellerEmail: String(userSettings?.seller_email || fromEmail || ""),
      sellerPhone: String(userSettings?.seller_contact_phone || ""),
    };

    const client = new SmtpClient();
    const host = settings.host as string;
    const port = Number(settings.port);
    const secure = Boolean(settings.secure);

    const endpointError = validateSmtpEndpoint(host, port, secure);
    if (endpointError) {
      await supabase
        .from("smtp_settings" as any)
        .update({
          last_error: endpointError,
          verified_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", auth.user.id);

      return new Response(JSON.stringify({ error: endpointError, hint: "Check SMTP host/port" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NOTE: this performs a real SMTP send using the user's SMTP server.
    try {
      if (secure) {
        await client.connectTLS({ hostname: host, port, username: settings.username as string, password });
      } else {
        await client.connect({ hostname: host, port, username: settings.username as string, password });
      }

      const subject = "SMTP test — success";
      const textContent = `This is a test email sent using your SMTP settings.\n\nTime: ${new Date().toISOString()}`;
      let footerHtml = (settings.email_footer_html as string) || "";
      if (footerHtml.trim()) {
        footerHtml = replaceFooterVariables(footerHtml, footerVars);
      }
      const footerBlock = footerHtml.trim()
        ? `<div style="margin-top:24px;border-top:1px solid #eee;padding-top:16px">${footerHtml}</div>`
        : "";
      const htmlContent = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">
        <p>This is a test email sent using your SMTP settings.</p>
        <p style="color:#888">Time: ${new Date().toISOString()}</p>
      </div>${footerBlock}`;

      await client.send({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        content: textContent,
        html: htmlContent,
      });
    } catch (smtpErr: any) {
      // Persist a human-readable error for the UI
      await supabase
        .from("smtp_settings" as any)
        .update({
          last_error: smtpErr?.message ?? String(smtpErr),
          verified_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", auth.user.id);
      throw smtpErr;
    } finally {
      try {
        await client.close();
      } catch {
        // ignore close failures
      }
    }

    // Mark verified
    const verifiedAt = new Date().toISOString();
    await supabase
      .from("smtp_settings" as any)
      .update({ last_error: null, verified_at: verifiedAt, updated_at: verifiedAt })
      .eq("user_id", auth.user.id);

    return new Response(JSON.stringify({ success: true, to, verified_at: verifiedAt, last_error: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("smtp-user-test error:", error);
    return new Response(
      JSON.stringify({
        error: error?.message ?? "Unknown error",
        details: typeof error === "object" ? JSON.stringify(error) : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
