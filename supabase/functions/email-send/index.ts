import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { writeAll } from "jsr:@std/io";

// Compatibility shim: some SMTP libs expect the legacy `Deno.writeAll` API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Deno as any).writeAll = writeAll;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SMTP_DEFAULT_HOST = Deno.env.get("SMTP_DEFAULT_HOST") ?? "";
const SMTP_DEFAULT_PORT = Number(Deno.env.get("SMTP_DEFAULT_PORT") ?? "0");
const SMTP_DEFAULT_SECURE = String(Deno.env.get("SMTP_DEFAULT_SECURE") ?? "true") === "true";
const SMTP_DEFAULT_USERNAME = Deno.env.get("SMTP_DEFAULT_USERNAME") ?? "";
const SMTP_DEFAULT_PASSWORD = Deno.env.get("SMTP_DEFAULT_PASSWORD") ?? "";
const SMTP_DEFAULT_FROM_EMAIL = Deno.env.get("SMTP_DEFAULT_FROM_EMAIL") ?? "";
const SMTP_DEFAULT_FROM_NAME = Deno.env.get("SMTP_DEFAULT_FROM_NAME") ?? "";
const SMTP_ENCRYPTION_KEY = Deno.env.get("SMTP_ENCRYPTION_KEY") ?? "";

type EmailSendRequest = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  // Internal-only when called with service role key
  userId?: string;
  // Optional explicit BCC (overrides user settings if provided)
  bcc?: string;
};

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
  const iv = new Uint8Array(new ArrayBuffer(ivRaw.length));
  iv.set(ivRaw);
  const ctBytes = base64Decode(parts[2]);
  const ct = ctBytes.buffer.slice(ctBytes.byteOffset, ctBytes.byteOffset + ctBytes.byteLength) as ArrayBuffer;
  const key = await deriveAesKey(SMTP_ENCRYPTION_KEY);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function htmlToText(html: string): string {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replaceFooterVariables(html: string, vars: { sellerName: string; sellerEmail: string; sellerPhone: string }): string {
  return html
    .replace(/\{SELLER_NAME\}/g, vars.sellerName)
    .replace(/\{SELLER_EMAIL\}/g, vars.sellerEmail)
    .replace(/\{SELLER_PHONE\}/g, vars.sellerPhone);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function quoteDisplayNameIfNeeded(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";

  // RFC 5322 display-name: allow simple atoms without quoting.
  // If it contains special characters (e.g. '@', ','), wrap in quotes.
  const safeAtom = /^[A-Za-z0-9 _.-]+$/.test(trimmed);
  if (safeAtom) return trimmed;
  const escaped = trimmed.replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
  return `"${escaped}"`;
}

function formatFromHeader(fromName: string, fromEmail: string): string {
  const email = String(fromEmail || "").trim();
  const name = quoteDisplayNameIfNeeded(fromName);
  return name ? `${name} <${email}>` : email;
}

function parseEmailList(input?: string): string[] {
  if (!input) return [];
  return String(input)
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendEmailViaSmtp(args: {
  supabaseAdmin: any;
  userId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  bcc?: string;
}): Promise<{ success: boolean; error?: string; used_user_smtp?: boolean }> {
  const { data: smtpSettings } = await args.supabaseAdmin
    .from("smtp_settings" as any)
    .select("enabled, verified_at, host, port, secure, username, password_encrypted, from_email, from_name, bcc_email, email_footer_html")
    .eq("user_id", args.userId)
    .maybeSingle();

  const hasUserSmtp =
    smtpSettings?.enabled &&
    smtpSettings?.verified_at &&
    smtpSettings?.host &&
    smtpSettings?.port &&
    smtpSettings?.username &&
    smtpSettings?.password_encrypted;

  const host = String(hasUserSmtp ? smtpSettings.host : SMTP_DEFAULT_HOST);
  const port = Number(hasUserSmtp ? smtpSettings.port : SMTP_DEFAULT_PORT);
  const secure = Boolean(hasUserSmtp ? smtpSettings.secure : SMTP_DEFAULT_SECURE);
  const username = String(hasUserSmtp ? smtpSettings.username : SMTP_DEFAULT_USERNAME);
  const password = hasUserSmtp
    ? await decryptPassword(String(smtpSettings.password_encrypted))
    : SMTP_DEFAULT_PASSWORD;
  const fromEmail = String((hasUserSmtp ? smtpSettings.from_email : SMTP_DEFAULT_FROM_EMAIL) || SMTP_DEFAULT_FROM_EMAIL);
  const fromName = String((hasUserSmtp ? smtpSettings.from_name : SMTP_DEFAULT_FROM_NAME) || SMTP_DEFAULT_FROM_NAME || "Support");
  const fromHeader = formatFromHeader(fromName, fromEmail);

  // Get BCC from smtp_settings first (new location), fallback to args.bcc
  const smtpBcc = smtpSettings?.bcc_email;
  const effectiveBcc = smtpBcc || args.bcc;

  // Get email footer HTML from smtp_settings
  let emailFooterHtml = smtpSettings?.email_footer_html || "";

  if (!host || !port || !username || !password || !fromEmail) {
    return { success: false, error: "SMTP not configured" };
  }

  // Fetch seller info for footer variable replacement
  const { data: userSettings } = await args.supabaseAdmin
    .from("user_settings")
    .select("seller_business_name, seller_email, seller_contact_phone, seller_contact_name")
    .eq("user_id", args.userId)
    .maybeSingle();

  const footerVars = {
    sellerName: String(userSettings?.seller_business_name || userSettings?.seller_contact_name || fromName || ""),
    sellerEmail: String(userSettings?.seller_email || fromEmail || ""),
    sellerPhone: String(userSettings?.seller_contact_phone || ""),
  };

  // Replace footer variables before appending
  if (emailFooterHtml.trim()) {
    emailFooterHtml = replaceFooterVariables(emailFooterHtml, footerVars);
  }

  // Append footer to HTML if configured
  let finalHtml = args.html;
  if (emailFooterHtml.trim()) {
    finalHtml = `${args.html}<div style="margin-top:24px;border-top:1px solid #eee;padding-top:16px">${emailFooterHtml}</div>`;
  }

  const client = new SmtpClient();
  try {
    if (secure) {
      await client.connectTLS({ hostname: host, port, username, password });
    } else {
      await client.connect({ hostname: host, port, username, password });
    }

    // Send to primary recipient
    await client.send({
      from: fromHeader,
      to: args.to,
      subject: args.subject,
      content: args.text,
      html: finalHtml,
    });

    // Send BCC as a separate email (true blind copy - recipient never sees it)
    const bccRecipients = parseEmailList(effectiveBcc);
    if (bccRecipients.length > 0) {
      const toNorm = args.to.trim().toLowerCase();
      for (const bcc of bccRecipients) {
        const bccNorm = bcc.toLowerCase();
        if (!isValidEmail(bcc)) {
          console.warn("Skipping invalid BCC email:", bcc);
          continue;
        }
        if (bccNorm === toNorm) continue;

        try {
          await client.send({
            from: fromHeader,
            to: bcc,
            subject: args.subject,
            content: args.text,
            html: finalHtml,
          });
          console.info("BCC email sent to:", bcc);
        } catch (bccErr: any) {
          console.warn("BCC email failed:", bccErr?.message);
          // Don't fail the whole operation if BCC fails
        }
      }
    }

    return { success: true, used_user_smtp: Boolean(hasUserSmtp) };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json().catch(() => ({}))) as Partial<EmailSendRequest>;
    const to = String(body.to || "").trim();
    const subject = String(body.subject || "").trim();
    const html = String(body.html || "").trim();
    const text = String(body.text || (html ? htmlToText(html) : "")).trim();
    const explicitBcc = body.bcc ? String(body.bcc).trim() : undefined;

    const isServiceRoleCall = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? (isServiceRoleCall ? (body.userId ?? null) : null);

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!to || !isValidEmail(to)) {
      return new Response(JSON.stringify({ error: "Invalid recipient email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ error: "Missing subject" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!text && !html) {
      return new Response(JSON.stringify({ error: "Missing email body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // BCC is now fetched from smtp_settings in sendEmailViaSmtp
    // Pass explicit BCC only if provided in the request
    const emailResult = await sendEmailViaSmtp({
      supabaseAdmin,
      userId,
      to,
      subject,
      html: html || `<pre style="white-space:pre-wrap">${text}</pre>`,
      text,
      bcc: explicitBcc,
    });

    if (!emailResult.success) {
      return new Response(JSON.stringify({ success: false, error: emailResult.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, used_user_smtp: emailResult.used_user_smtp }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("email-send error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
