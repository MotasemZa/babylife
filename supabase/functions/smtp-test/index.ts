import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TEST_TO_EMAIL = "mz@inbew.com";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const SMTP_DEFAULT_HOST = Deno.env.get("SMTP_DEFAULT_HOST") ?? "";
const SMTP_DEFAULT_PORT = Number(Deno.env.get("SMTP_DEFAULT_PORT") ?? "0");
const SMTP_DEFAULT_SECURE = (Deno.env.get("SMTP_DEFAULT_SECURE") ?? "true").toLowerCase() === "true";
const SMTP_DEFAULT_USERNAME = Deno.env.get("SMTP_DEFAULT_USERNAME") ?? "";
const SMTP_DEFAULT_PASSWORD = Deno.env.get("SMTP_DEFAULT_PASSWORD") ?? "";
const SMTP_DEFAULT_FROM_EMAIL = Deno.env.get("SMTP_DEFAULT_FROM_EMAIL") ?? "";
const SMTP_DEFAULT_FROM_NAME = Deno.env.get("SMTP_DEFAULT_FROM_NAME") ?? "";

function getConfigWarning(): string | null {
  // Note: direct SMTP connections are not supported in this backend runtime.
  // We still keep these vars as they may be used by other infrastructure, but
  // for sending email here we rely on RESEND_API_KEY (HTTP API).
  if (!RESEND_API_KEY) {
    return "Missing RESEND_API_KEY secret. This backend cannot send via raw SMTP; configure RESEND_API_KEY to test email sending.";
  }
  return null;
}

serve(async (req) => {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const configWarning = getConfigWarning();
    if (configWarning) {
      return new Response(JSON.stringify({ error: configWarning }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(RESEND_API_KEY);
    const fromEmail = SMTP_DEFAULT_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = SMTP_DEFAULT_FROM_NAME || "Platform";
    const from = `${fromName} <${fromEmail}>`;

    const emailResponse = await resend.emails.send({
      from,
      to: [TEST_TO_EMAIL],
      subject: "Email test — platform sender",
      text: "This is a test email sent by the platform sender configuration.",
      html: "<p><strong>Success.</strong> This is a test email sent by the platform sender configuration.</p>",
    });

    return new Response(
      JSON.stringify({
        success: true,
        to: TEST_TO_EMAIL,
        provider: "resend",
        emailResponse,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("smtp-test error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
