import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { writeAll } from "jsr:@std/io";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";

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

const SMTP_DEFAULT_HOST = Deno.env.get("SMTP_DEFAULT_HOST") ?? "";
const SMTP_DEFAULT_PORT = Number(Deno.env.get("SMTP_DEFAULT_PORT") ?? "0");
const SMTP_DEFAULT_SECURE = String(Deno.env.get("SMTP_DEFAULT_SECURE") ?? "true") === "true";
const SMTP_DEFAULT_USERNAME = Deno.env.get("SMTP_DEFAULT_USERNAME") ?? "";
const SMTP_DEFAULT_PASSWORD = Deno.env.get("SMTP_DEFAULT_PASSWORD") ?? "";
const SMTP_DEFAULT_FROM_EMAIL = Deno.env.get("SMTP_DEFAULT_FROM_EMAIL") ?? "";
const SMTP_DEFAULT_FROM_NAME = Deno.env.get("SMTP_DEFAULT_FROM_NAME") ?? "";
const SMTP_ENCRYPTION_KEY = Deno.env.get("SMTP_ENCRYPTION_KEY") ?? "";

interface InvoiceRequest {
  transactionId?: string;
  invoiceId?: string;
  regenerate?: boolean;
  buyerEmail?: string;
  sendEmail?: boolean;
  vatRate?: number;
  // When true, return a base64 PDF payload for the frontend to download/open.
  includePdf?: boolean;
  // Optional overrides (useful for Shopify where we have buyer details in the order payload)
  buyerName?: string;
  buyerAddressOverride?: string;
  // Internal-only: lets backend functions call this with service role auth.
  userId?: string;
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64EncodeBytes(bytes: Uint8Array): string {
  // Safe base64 encoder for Uint8Array without spreading into call stack
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function chunkString(str: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
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
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSellerAddressFromSettings(settings: any): string {
  const street = String(settings?.seller_street || "").trim();
  const city = String(settings?.seller_city || "").trim();
  const postal = String(settings?.seller_postal_code || "").trim();
  const country = String(settings?.seller_country || "").trim();
  const extra = String(settings?.seller_address || "").trim();

  const lineCity = [postal, city].filter(Boolean).join(" ").trim();
  const lines: string[] = [street, lineCity, country].filter(Boolean) as string[];
  if (extra) {
    lines.push(
      ...extra
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    );
  }
  return lines.join("\n").trim();
}

function shouldShowFooterContact(settings: any): boolean {
  const layout = settings?.invoice_layout;
  const footer = Array.isArray(layout?.sections) ? layout.sections.find((s: any) => s?.id === "footer") : null;
  if (!footer) return true;
  if (footer.enabled === false) return false;
  return footer.showContact !== false;
}

function detectPaymentMethod(rawData: any): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const candidates: Array<unknown> = [
    (rawData as any).payment_method,
    (rawData as any).paymentMethod,
    (rawData as any).payment_method_type,
    (rawData as any).paymentMethodType,
    (rawData as any).payment?.method,
    (rawData as any).payment?.type,
    (rawData as any).tender_type,
    (rawData as any).tenderType,
    (rawData as any).gateway,
  ];
  const found = candidates.find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
  return found ? found.trim() : null;
}

async function sendEmailViaSmtp(args: {
  supabaseAdmin: any;
  userId: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: smtpSettings } = await args.supabaseAdmin
      .from("smtp_settings" as any)
      .select("enabled, host, port, secure, username, password_encrypted, from_email, from_name")
      .eq("user_id", args.userId)
      .maybeSingle();

    const hasUserSmtp =
      smtpSettings?.enabled &&
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
    const fromName = String((hasUserSmtp ? smtpSettings.from_name : SMTP_DEFAULT_FROM_NAME) || SMTP_DEFAULT_FROM_NAME || "Invoices");

    if (!host || !port || !username || !password || !fromEmail) {
      return { success: false, error: "SMTP not configured" };
    }

    const client = new SmtpClient();
    try {
      if (secure) {
        await client.connectTLS({ hostname: host, port, username, password });
      } else {
        await client.connect({ hostname: host, port, username, password });
      }

      await client.send({
        from: `${fromName} <${fromEmail}>`,
        to: args.to,
        subject: args.subject,
        content: htmlToText(args.html),
        html: args.html,
      });
    } finally {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = String(template || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

function escapeXml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function splitName(fullName: string): { given: string; family: string } {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) return { given: parts[0] ?? "", family: "" };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

function computeMissingEn16931Fields(args: {
  settings: any;
  buyerName?: string;
  buyerAddress?: string;
  buyerEmail?: string;
}): string[] {
  const missing: string[] = [];
  const s = args.settings || {};

  // Seller (BT-27..)
  if (!s.seller_business_name) missing.push("seller_business_name");
  if (!s.seller_address) missing.push("seller_address");
  // EN16931 requires an electronic address for the seller in most cases; we use seller_email.
  if (!s.seller_email && !s.seller_contact_email) missing.push("seller_email");
  // Contact person block (we asked user to enter)
  if (!s.seller_contact_name) missing.push("seller_contact_name");
  if (!s.seller_contact_department) missing.push("seller_contact_department");
  if (!s.seller_contact_phone) missing.push("seller_contact_phone");
  if (!s.seller_contact_email) missing.push("seller_contact_email");

  // Buyer (BT-44..)
  if (!args.buyerName) missing.push("buyer_name");
  if (!args.buyerAddress) missing.push("buyer_address");
  if (!args.buyerEmail) missing.push("buyer_email");

  return missing;
}

function buildEn16931XmlBestEffort(args: {
  invoiceNumber: string;
  invoiceDateIso: string;
  currency: string;
  seller: {
    name: string;
    address: string;
    email: string;
    vatNumber?: string;
    contactName?: string;
    contactDepartment?: string;
    contactPhone?: string;
    contactEmail?: string;
  };
  buyer: {
    name: string;
    address: string;
    email: string;
  };
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}): string {
  // Note: This is a *best-effort* EN16931-compatible CrossIndustryInvoice XML.
  // Full strict compliance is complex; we still embed this XML as factur-x.xml.
  const issueDate = new Date(args.invoiceDateIso);
  const y = issueDate.getUTCFullYear();
  const m = String(issueDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(issueDate.getUTCDate()).padStart(2, "0");
  const date102 = `${y}${m}${d}`;

  const buyerAddressLines = String(args.buyer.address || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const sellerAddressLines = String(args.seller.address || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const buyerStreet = buyerAddressLines[0] ?? "";
  const sellerStreet = sellerAddressLines[0] ?? "";
  const buyerCity = buyerAddressLines[1] ?? "";
  const sellerCity = sellerAddressLines[1] ?? "";
  const buyerPostcode = buyerAddressLines.find((l) => /\d{4,}/.test(l)) ?? "";
  const sellerPostcode = sellerAddressLines.find((l) => /\d{4,}/.test(l)) ?? "";
  const buyerCountry = buyerAddressLines[buyerAddressLines.length - 1] ?? "";
  const sellerCountry = sellerAddressLines[sellerAddressLines.length - 1] ?? "";

  const { given: buyerGiven, family: buyerFamily } = splitName(args.buyer.name);

  const lineItemsXml = args.lineItems
    .map((li, idx) => {
      const lineId = String(idx + 1);
      return `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${escapeXml(lineId)}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${escapeXml(li.description || "Item")}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${Number(li.unitPrice || 0).toFixed(2)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="C62">${Number(li.quantity || 1)}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>S</ram:CategoryCode>
            <ram:RateApplicablePercent>${Number(args.taxRate || 0).toFixed(2)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${Number(li.total || 0).toFixed(2)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("\n");

  // We use ZUGFeRD 2.x / Factur-X style namespaces.
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <!-- EN16931 / ZUGFeRD profile identifier -->
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(args.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${date102}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lineItemsXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(args.seller.name || "Seller")}</ram:Name>
        ${args.seller.vatNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${escapeXml(args.seller.vatNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(sellerPostcode || "")}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(sellerStreet || args.seller.address || "")}</ram:LineOne>
          <ram:CityName>${escapeXml(sellerCity || "")}</ram:CityName>
          <ram:CountryID>${escapeXml(sellerCountry || "")}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:DefinedTradeContact>
          <ram:PersonName>${escapeXml(args.seller.contactName || "")}</ram:PersonName>
          <ram:DepartmentName>${escapeXml(args.seller.contactDepartment || "")}</ram:DepartmentName>
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${escapeXml(args.seller.contactPhone || "")}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${escapeXml(args.seller.contactEmail || args.seller.email || "")}</ram:URIID>
          </ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(args.seller.email || args.seller.contactEmail || "")}</ram:URIID>
        </ram:URIUniversalCommunication>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(args.buyer.name || "Buyer")}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(buyerPostcode || "")}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(buyerStreet || args.buyer.address || "")}</ram:LineOne>
          <ram:CityName>${escapeXml(buyerCity || "")}</ram:CityName>
          <ram:CountryID>${escapeXml(buyerCountry || "")}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(args.buyer.email || "")}</ram:URIID>
        </ram:URIUniversalCommunication>
        <ram:SpecifiedLegalOrganization>
          <ram:TradingBusinessName>${escapeXml(args.buyer.name || "Buyer")}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        <ram:DefinedTradeContact>
          <ram:PersonName>${escapeXml([buyerGiven, buyerFamily].filter(Boolean).join(" "))}</ram:PersonName>
        </ram:DefinedTradeContact>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery />
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(args.currency || "EUR")}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${Number(args.taxAmount || 0).toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${Number(args.subtotal || 0).toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${Number(args.taxRate || 0).toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${Number(args.subtotal || 0).toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${Number(args.subtotal || 0).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(args.currency || "EUR")}">${Number(args.taxAmount || 0).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${Number(args.total || 0).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${Number(args.total || 0).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

async function generateSimpleInvoicePdf(args: {
  invoiceNumber: string;
  invoiceDate: string;
  sellerName: string;
  sellerAddress: string;
  buyerName: string;
  buyerAddress: string;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  // Optional: embed ZUGFeRD/EN16931 XML into the PDF
  zugferdXml?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  let y = height - 60;
  const left = 50;

  page.drawText("INVOICE", { x: left, y, size: 22, font: bold });
  y -= 28;
  page.drawText(`Invoice: ${args.invoiceNumber}`, { x: left, y, size: 12, font });
  y -= 16;
  page.drawText(`Date: ${formatDate(new Date(args.invoiceDate))}`, { x: left, y, size: 12, font });

  y -= 28;
  page.drawText("From:", { x: left, y, size: 12, font: bold });
  y -= 16;
  for (const line of `${args.sellerName}\n${args.sellerAddress}`.split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 11, font });
    y -= 14;
  }

  y -= 14;
  page.drawText("Bill To:", { x: left, y, size: 12, font: bold });
  y -= 16;
  for (const line of `${args.buyerName}\n${args.buyerAddress}`.split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 11, font });
    y -= 14;
  }

  y -= 22;
  page.drawText("Items:", { x: left, y, size: 12, font: bold });
  y -= 18;
  const col1 = left;
  const col2 = width - 220;
  const col3 = width - 160;
  const col4 = width - 90;
  page.drawText("Description", { x: col1, y, size: 11, font: bold });
  page.drawText("Qty", { x: col2, y, size: 11, font: bold });
  page.drawText("Unit", { x: col3, y, size: 11, font: bold });
  page.drawText("Total", { x: col4, y, size: 11, font: bold });
  y -= 14;

  for (const li of args.lineItems) {
    const desc = String(li.description || "Item").slice(0, 60);
    page.drawText(desc, { x: col1, y, size: 10, font });
    page.drawText(String(li.quantity ?? 1), { x: col2, y, size: 10, font });
    page.drawText(formatCurrency(li.unitPrice, args.currency), { x: col3, y, size: 10, font });
    page.drawText(formatCurrency(li.total, args.currency), { x: col4, y, size: 10, font });
    y -= 12;
    if (y < 120) break;
  }

  y = Math.min(y - 10, 140);
  const totalsX = width - 220;
  page.drawText(`Subtotal: ${formatCurrency(args.subtotal, args.currency)}`, { x: totalsX, y, size: 11, font });
  y -= 14;
  page.drawText(`VAT (${args.taxRate}%): ${formatCurrency(args.taxAmount, args.currency)}`, { x: totalsX, y, size: 11, font });
  y -= 16;
  page.drawText(`Total: ${formatCurrency(args.total, args.currency)}`, { x: totalsX, y, size: 12, font: bold });

  if (args.zugferdXml) {
    const xmlBytes = new TextEncoder().encode(args.zugferdXml);
    try {
      // Factur-X expects the XML to be embedded as an attachment named `factur-x.xml`.
      // pdf-lib supports document-level attachments.
      await (pdf as any).attach(xmlBytes, "factur-x.xml", {
        mimeType: "text/xml",
        description: "ZUGFeRD / EN16931 invoice XML (Factur-X)",
        // Best-effort hint for AFRelationship if supported by the runtime build.
        afRelationship: "Data",
        creationDate: new Date(args.invoiceDate),
        modificationDate: new Date(),
      });
    } catch (e) {
      console.error("Failed to attach factur-x.xml to PDF:", e);
      // Best-effort: PDF still returns without embedded XML.
    }
  }

  return await pdf.save();
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "").trim();
  const full = cleaned.length === 3
    ? cleaned.split("").map((c) => c + c).join("")
    : cleaned;
  const num = Number.parseInt(full, 16);
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
}

async function generateInvoicePdfFromTemplate(args: {
  invoice: any;
  settings: any;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  zugferdXml?: string;
}): Promise<Uint8Array> {
  // NOTE: This produces a normal PDF with an embedded `factur-x.xml` attachment.
  // True PDF/A-3b conformance requires additional PDF/A metadata & output intent
  // that pdf-lib doesn't reliably generate in this edge runtime.

  const invoice = args.invoice;
  const settings = args.settings || {};
  const template = String(settings.invoice_template || "modern");
  const logoUrl = String(settings.invoice_logo_url || "");
  const motto = String(settings.invoice_motto || "");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  // Palette (kept deterministic; matches HTML “modern” feel)
  const ink = rgb(...hexToRgb("#0f172a"));
  const muted = rgb(...hexToRgb("#475569"));
  const border = rgb(...hexToRgb("#e2e8f0"));
  const headerA = rgb(...hexToRgb(template === "classic" ? "#111827" : "#1e3a5f"));
  const accent = rgb(...hexToRgb(template === "compact" ? "#2563eb" : "#16a085"));
  const bgSoft = rgb(...hexToRgb("#f1f5f9"));

  // Header band
  const headerH = template === "compact" ? 90 : 120;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: headerA });
  page.drawRectangle({ x: 0, y: height - headerH, width: 10, height: headerH, color: accent });

  // Logo (optional)
  let logoDims: { w: number; h: number } | null = null;
  if (logoUrl) {
    const logoBytes = await fetchBytes(logoUrl);
    if (logoBytes) {
      try {
        // Try PNG then JPG
        const img = logoUrl.toLowerCase().includes(".jpg") || logoUrl.toLowerCase().includes(".jpeg")
          ? await pdf.embedJpg(logoBytes)
          : await pdf.embedPng(logoBytes);
        const maxW = 150;
        const maxH = 48;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: 24, y: height - 24 - h, width: w, height: h });
        logoDims = { w, h };
      } catch {
        // ignore logo failures
      }
    }
  }

  // Header text
  const sellerName = String(invoice.seller_name || settings.seller_business_name || "Seller");
  const invoiceNumber = String(invoice.invoice_number || "");
  const invoiceDate = String(invoice.invoice_date || new Date().toISOString());

  const headerLeftX = logoDims ? 24 + logoDims.w + 10 : 24;
  page.drawText(sellerName, { x: headerLeftX, y: height - 46, size: 16, font: bold, color: rgb(1, 1, 1) });
  if (motto) {
    page.drawText(`“${motto.slice(0, 80)}”`, {
      x: headerLeftX,
      y: height - 66,
      size: 9,
      font,
      color: rgb(1, 1, 1),
      opacity: 0.85,
    });
  }

  page.drawText("INVOICE", { x: width - 24 - 140, y: height - 46, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(invoiceNumber, { x: width - 24 - 140, y: height - 68, size: 10, font, color: rgb(1, 1, 1), opacity: 0.9 });
  page.drawText(formatDate(new Date(invoiceDate)), { x: width - 24 - 140, y: height - 84, size: 9, font, color: rgb(1, 1, 1), opacity: 0.85 });

  // Body layout
  let y = height - headerH - 24;
  const left = 24;
  const right = width - 24;
  const colGap = 16;
  const colW = (right - left - colGap) / 2;

  const drawCard = (x: number, yTop: number, w: number, h: number) => {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: rgb(1, 1, 1) });
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: border, borderWidth: 1 });
  };

  // From / Bill To cards
  const cardH = template === "compact" ? 86 : 100;
  drawCard(left, y, colW, cardH);
  drawCard(left + colW + colGap, y, colW, cardH);

  const fromTitleY = y - 18;
  page.drawText("FROM", { x: left + 12, y: fromTitleY, size: 9, font: bold, color: accent });
  page.drawText("BILL TO", { x: left + colW + colGap + 12, y: fromTitleY, size: 9, font: bold, color: accent });

  const sellerAddr = String(invoice.seller_address || settings.seller_address || "");
  const sellerAddrComposed = buildSellerAddressFromSettings(settings) || sellerAddr;
  const buyerName = String(invoice.buyer_name || "Buyer");
  const buyerAddr = String(invoice.buyer_address || "");
  const buyerEmail = String(invoice.buyer_email || "");
  const sellerVat = String(invoice.seller_vat_number || settings.seller_vat_number || "");
  const paymentMethod = String((invoice as any).payment_method || "").trim();

  let ly = y - 34;
  page.drawText(sellerName, { x: left + 12, y: ly, size: 11, font: bold, color: ink });
  ly -= 14;
  for (const line of sellerAddrComposed.split("\n").map((l: string) => l.trim()).filter(Boolean).slice(0, 3)) {
    page.drawText(line, { x: left + 12, y: ly, size: 9, font, color: muted });
    ly -= 12;
  }
  if (sellerVat) {
    page.drawText(`VAT: ${sellerVat}`, { x: left + 12, y: ly, size: 9, font, color: muted });
  }

  let ry = y - 34;
  page.drawText(buyerName, { x: left + colW + colGap + 12, y: ry, size: 11, font: bold, color: ink });
  ry -= 14;
  for (const line of buyerAddr.split("\n").map((l: string) => l.trim()).filter(Boolean).slice(0, 3)) {
    page.drawText(line, { x: left + colW + colGap + 12, y: ry, size: 9, font, color: muted });
    ry -= 12;
  }
  if (buyerEmail) {
    page.drawText(buyerEmail, { x: left + colW + colGap + 12, y: ry, size: 9, font, color: muted });
  }

  y -= cardH + 18;

  // Items table
  const tableTop = y;
  const tableW = right - left;
  const headerRowH = 22;
  page.drawRectangle({ x: left, y: tableTop - headerRowH, width: tableW, height: headerRowH, color: bgSoft });
  page.drawRectangle({ x: left, y: tableTop - headerRowH, width: tableW, height: headerRowH, borderColor: border, borderWidth: 1 });

  const c1 = left + 12;
  const cQty = left + tableW - 210;
  const cUnit = left + tableW - 140;
  const cTotal = left + tableW - 70;
  page.drawText("Description", { x: c1, y: tableTop - 15, size: 9, font: bold, color: muted });
  page.drawText("Qty", { x: cQty, y: tableTop - 15, size: 9, font: bold, color: muted });
  page.drawText("Unit", { x: cUnit, y: tableTop - 15, size: 9, font: bold, color: muted });
  page.drawText("Total", { x: cTotal, y: tableTop - 15, size: 9, font: bold, color: muted });

  y = tableTop - headerRowH - 10;
  for (const li of args.lineItems.slice(0, template === "compact" ? 10 : 18)) {
    const desc = String(li.description || "Item").slice(0, 80);
    page.drawText(desc, { x: c1, y, size: 9.5, font, color: ink });
    page.drawText(String(li.quantity ?? 1), { x: cQty, y, size: 9.5, font, color: ink });
    page.drawText(formatCurrency(li.unitPrice, invoice.currency || "EUR"), { x: cUnit, y, size: 9.5, font, color: ink });
    page.drawText(formatCurrency(li.total, invoice.currency || "EUR"), { x: cTotal, y, size: 9.5, font: bold, color: ink });
    y -= 14;
    page.drawLine({ start: { x: left, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 1, color: border });
    y -= 6;
    if (y < 140) break;
  }

  // Totals box
  const totalsW = 220;
  const totalsX = right - totalsW;
  const totalsTop = Math.max(y - 14, 120);
  const totalsH = 78;
  drawCard(totalsX, totalsTop, totalsW, totalsH);
  const subtotal = Number(invoice.subtotal || 0);
  const taxRate = Number(invoice.tax_rate || 0);
  const taxAmount = Number(invoice.tax_amount || 0);
  const total = Number(invoice.total || 0);
  let ty = totalsTop - 20;
  page.drawText("Subtotal", { x: totalsX + 12, y: ty, size: 9, font, color: muted });
  page.drawText(formatCurrency(subtotal, invoice.currency || "EUR"), { x: totalsX + 120, y: ty, size: 9, font, color: ink });
  ty -= 14;
  page.drawText(`VAT (${taxRate}%)`, { x: totalsX + 12, y: ty, size: 9, font, color: muted });
  page.drawText(formatCurrency(taxAmount, invoice.currency || "EUR"), { x: totalsX + 120, y: ty, size: 9, font, color: ink });
  ty -= 18;
  page.drawText("Total", { x: totalsX + 12, y: ty, size: 11, font: bold, color: ink });
  page.drawText(formatCurrency(total, invoice.currency || "EUR"), { x: totalsX + 120, y: ty, size: 11, font: bold, color: ink });

  // Optional payment method (only show if detected)
  if (paymentMethod) {
    const pmY = totalsTop - totalsH - 10;
    if (pmY > 90) {
      page.drawText(`Payment: ${paymentMethod}`.slice(0, 60), {
        x: totalsX + 12,
        y: pmY,
        size: 8.5,
        font,
        color: muted,
      });
    }
  }

  // Optional footer contact block
  if (shouldShowFooterContact(settings)) {
    const contactName = String(settings?.seller_contact_name || "").trim();
    const contactEmail = String(settings?.seller_contact_email || "").trim();
    const contactPhone = String(settings?.seller_contact_phone || "").trim();
    const contactDepartment = String(settings?.seller_contact_department || "").trim();
    const footerLines = [
      contactName && contactDepartment ? `${contactName} • ${contactDepartment}` : contactName || contactDepartment,
      contactEmail,
      contactPhone,
    ].filter(Boolean);

    if (footerLines.length) {
      const lineY = 72;
      page.drawLine({ start: { x: left, y: lineY }, end: { x: right, y: lineY }, thickness: 1, color: border });
      let fy = lineY - 16;
      for (const line of footerLines.slice(0, 3)) {
        page.drawText(String(line).slice(0, 90), { x: left, y: fy, size: 8.5, font, color: muted });
        fy -= 11;
      }
    }
  }

  if (args.zugferdXml) {
    const xmlBytes = new TextEncoder().encode(args.zugferdXml);
    try {
      await (pdf as any).attach(xmlBytes, "factur-x.xml", {
        mimeType: "text/xml",
        description: "ZUGFeRD / EN16931 invoice XML (Factur-X)",
        afRelationship: "Data",
        creationDate: new Date(invoiceDate),
        modificationDate: new Date(),
      });
    } catch (e) {
      console.error("Failed to attach factur-x.xml to PDF:", e);
    }
  }

  return await pdf.save();
}

async function sendInvoiceEmailWithAttachment(args: {
  supabaseAdmin: any;
  userId: string;
  to: string;
  subject: string;
  html: string;
  pdfBytes: Uint8Array;
  pdfFilename: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: smtpSettings } = await args.supabaseAdmin
      .from("smtp_settings" as any)
      .select("enabled, host, port, secure, username, password_encrypted, from_email, from_name, verified_at")
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
    const fromName = String((hasUserSmtp ? smtpSettings.from_name : SMTP_DEFAULT_FROM_NAME) || SMTP_DEFAULT_FROM_NAME || "Invoices");

    if (!host || !port || !username || !password || !fromEmail) {
      return { success: false, error: "SMTP not configured" };
    }

    // Send with the same SMTP client used elsewhere in this project.
    // Nodemailer in edge runtimes can produce intermittent TLS/socket issues (e.g. “Unexpected socket close”).
    // We craft a minimal RFC 2046 multipart/mixed email manually.
    const client = new SmtpClient();
    const fromHeader = `${fromName} <${fromEmail}>`;
    const toHeader = args.to;

    const mixedBoundary = `MixedBoundary_${crypto.randomUUID()}`;
    const altBoundary = `AltBoundary_${crypto.randomUUID()}`;
    const textBody = htmlToText(args.html);
    const pdfB64 = base64EncodeBytes(args.pdfBytes);
    const pdfLines = chunkString(pdfB64, 76);

    const writeCmd = (client as any).writeCmd.bind(client as any) as (...a: string[]) => Promise<void>;
    const readCmd = (client as any).readCmd.bind(client as any) as () => Promise<{ code: number; args: string } | null>;

    const expect = async (code: number, msg: string) => {
      const cmd = await readCmd();
      if (!cmd) throw new Error(`${msg}: invalid cmd`);
      if (cmd.code !== code) throw new Error(`${msg}: ${cmd.code} ${cmd.args}`);
    };

    const parseAddress = (email: string) => {
      const m = String(email).match(/(.*)\s<(.*)>/);
      return m?.length === 3 ? { envelope: `<${m[2]}>`, header: email } : { envelope: `<${email}>`, header: `<${email}>` };
    };
    const fromParsed = parseAddress(fromHeader);
    const toParsed = parseAddress(toHeader);

    try {
      if (secure) {
        await client.connectTLS({ hostname: host, port, username, password });
      } else {
        await client.connect({ hostname: host, port, username, password });
      }

      await writeCmd("MAIL", "FROM:", fromParsed.envelope);
      await expect(250, "MAIL FROM failed");

      await writeCmd("RCPT", "TO:", toParsed.envelope);
      await expect(250, "RCPT TO failed");

      await writeCmd("DATA");
      await expect(354, "DATA failed");

      const safeLine = (line: string) => (line.startsWith(".") ? `.${line}` : line);
      const writeLine = async (line: string) => await writeCmd(safeLine(line));

      await writeLine(`Subject: ${args.subject}`);
      await writeLine(`From: ${fromParsed.header}`);
      await writeLine(`To: ${toParsed.header}`);
      await writeLine(`Date: ${new Date().toUTCString()}`);
      await writeLine(`MIME-Version: 1.0`);
      await writeLine(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
      await writeLine("");

      // Alternative part (text + html)
      await writeLine(`--${mixedBoundary}`);
      await writeLine(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      await writeLine("");

      await writeLine(`--${altBoundary}`);
      await writeLine(`Content-Type: text/plain; charset="utf-8"`);
      await writeLine(`Content-Transfer-Encoding: 7bit`);
      await writeLine("");
      for (const l of (textBody || "").split(/\r?\n/)) await writeLine(l);
      await writeLine("");

      await writeLine(`--${altBoundary}`);
      await writeLine(`Content-Type: text/html; charset="utf-8"`);
      await writeLine(`Content-Transfer-Encoding: 7bit`);
      await writeLine("");
      for (const l of String(args.html || "").split(/\r?\n/)) await writeLine(l);
      await writeLine("");

      await writeLine(`--${altBoundary}--`);
      await writeLine("");

      // PDF attachment part
      await writeLine(`--${mixedBoundary}`);
      await writeLine(`Content-Type: application/pdf; name="${args.pdfFilename}"`);
      await writeLine(`Content-Transfer-Encoding: base64`);
      await writeLine(`Content-Disposition: attachment; filename="${args.pdfFilename}"`);
      await writeLine("");
      for (const l of pdfLines) await writeLine(l);
      await writeLine("");
      await writeLine(`--${mixedBoundary}--`);
      await writeLine("");

      // End of DATA
      await writeCmd(".");
      await expect(250, "Email send failed");
    } finally {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

function formatCurrency(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function generateInvoiceHTML(invoice: any, settings: any = {}): string {
  const lineItems = invoice.line_items as LineItem[];
  const template = settings?.invoice_template || 'modern';
  const logoUrl = settings?.invoice_logo_url || '';
  const motto = settings?.invoice_motto || '';
  
  const lineItemsHTML = lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
        <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unitPrice, invoice.currency)}</td>
        <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500;">${formatCurrency(item.total, invoice.currency)}</td>
      </tr>
    `
    )
    .join("");

  const logoHTML = logoUrl 
    ? `<img src="${logoUrl}" alt="Logo" style="max-height: 60px; max-width: 180px; object-fit: contain;" />`
    : '';

  const mottoHTML = motto 
    ? `<div style="color: #6b7280; font-size: 13px; font-style: italic; margin-top: 4px;">"${motto}"</div>`
    : '';

  if (template === 'modern') {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
</head>
<body style="font-family: 'Segoe UI', -apple-system, sans-serif; margin: 0; padding: 0; background: #f8fafc; color: #1e293b;">
  <div style="max-width: 800px; margin: 0 auto; background: #fff;">
    <!-- Modern Gradient Header -->
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #16a085 100%); padding: 40px; color: white;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          ${logoHTML || `<div style="font-size: 28px; font-weight: 700;">${invoice.seller_name || 'Invoice'}</div>`}
          ${logoHTML ? `<div style="font-size: 20px; font-weight: 600; margin-top: 8px;">${invoice.seller_name || ''}</div>` : ''}
          ${mottoHTML.replace('color: #6b7280', 'color: rgba(255,255,255,0.8)')}
        </div>
        <div style="text-align: right;">
          <div style="font-size: 32px; font-weight: 700; letter-spacing: -1px;">INVOICE</div>
          <div style="font-size: 16px; margin-top: 8px; opacity: 0.9;">${invoice.invoice_number}</div>
          <div style="font-size: 14px; margin-top: 4px; opacity: 0.8;">${formatDate(new Date(invoice.invoice_date))}</div>
        </div>
      </div>
    </div>

    <div style="padding: 40px;">
      <!-- Addresses -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
        <div style="width: 45%;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #16a085; margin-bottom: 12px; letter-spacing: 1px;">From</div>
          <div style="font-size: 15px; line-height: 1.7;">
            <strong style="color: #1e3a5f;">${invoice.seller_name || "Seller"}</strong><br>
            ${invoice.seller_address ? invoice.seller_address.replace(/\n/g, "<br>") : ""}
            ${invoice.seller_vat_number ? `<br><span style="color: #64748b;">VAT: ${invoice.seller_vat_number}</span>` : ""}
          </div>
        </div>
        <div style="width: 45%;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #16a085; margin-bottom: 12px; letter-spacing: 1px;">Bill To</div>
          <div style="font-size: 15px; line-height: 1.7;">
            <strong style="color: #1e3a5f;">${invoice.buyer_name || "Buyer"}</strong><br>
            ${invoice.buyer_address ? invoice.buyer_address.replace(/\n/g, "<br>") : ""}
            ${invoice.buyer_email ? `<br><span style="color: #64748b;">${invoice.buyer_email}</span>` : ""}
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="padding: 14px 16px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Description</th>
            <th style="padding: 14px 16px; text-align: center; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Qty</th>
            <th style="padding: 14px 16px; text-align: right; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Unit Price</th>
            <th style="padding: 14px 16px; text-align: right; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHTML}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="margin-left: auto; width: 280px;">
        <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; color: #64748b;">
          <span>Subtotal</span>
          <span style="color: #1e293b;">${formatCurrency(invoice.subtotal, invoice.currency)}</span>
        </div>
        ${invoice.tax_amount > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; color: #64748b;">
          <span>VAT (${invoice.tax_rate || 0}%)</span>
          <span style="color: #1e293b;">${formatCurrency(invoice.tax_amount, invoice.currency)}</span>
        </div>
        ` : ""}
        <div style="display: flex; justify-content: space-between; padding: 16px 0; font-size: 20px; font-weight: 700; border-top: 2px solid #1e3a5f; margin-top: 8px; color: #1e3a5f;">
          <span>Total</span>
          <span>${formatCurrency(invoice.total, invoice.currency)}</span>
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px; background: #f8fafc; font-size: 12px; color: #94a3b8;">
      Thank you for your business! • Generated by eBay Tax Buddy
    </div>
  </div>
</body>
</html>
    `;
  }

  // Classic template (original)
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 40px; color: #1f2937;">
  <div style="max-width: 800px; margin: 0 auto; background: #fff;">
    <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
      <div>
        ${logoHTML}
        <div style="font-size: 32px; font-weight: 700; color: #111827; ${logoHTML ? 'margin-top: 12px;' : ''}">INVOICE</div>
        ${mottoHTML}
      </div>
      <div style="text-align: right;">
        <div style="font-size: 18px; font-weight: 600; color: #6b7280;">${invoice.invoice_number}</div>
        <div style="color: #6b7280; margin-top: 8px;">Date: ${formatDate(new Date(invoice.invoice_date))}</div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
      <div style="width: 45%;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">From</div>
        <div style="font-size: 14px; line-height: 1.6;">
          <strong>${invoice.seller_name || "Seller"}</strong><br>
          ${invoice.seller_address ? invoice.seller_address.replace(/\n/g, "<br>") : ""}<br>
          ${invoice.seller_vat_number ? `VAT: ${invoice.seller_vat_number}` : ""}
        </div>
      </div>
      <div style="width: 45%;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">Bill To</div>
        <div style="font-size: 14px; line-height: 1.6;">
          <strong>${invoice.buyer_name || "Buyer"}</strong><br>
          ${invoice.buyer_address ? invoice.buyer_address.replace(/\n/g, "<br>") : ""}<br>
          ${invoice.buyer_email ? `Email: ${invoice.buyer_email}` : ""}
        </div>
      </div>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr>
          <th style="background: #f9fafb; padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Description</th>
          <th style="background: #f9fafb; padding: 12px; text-align: center; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Qty</th>
          <th style="background: #f9fafb; padding: 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Unit Price</th>
          <th style="background: #f9fafb; padding: 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <div style="margin-left: auto; width: 300px;">
      <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px;">
        <span>Subtotal</span>
        <span>${formatCurrency(invoice.subtotal, invoice.currency)}</span>
      </div>
      ${invoice.tax_amount > 0 ? `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px;">
        <span>VAT (${invoice.tax_rate || 0}%)</span>
        <span>${formatCurrency(invoice.tax_amount, invoice.currency)}</span>
      </div>
      ` : ""}
      <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 700; border-top: 2px solid #111827; padding-top: 12px; margin-top: 8px;">
        <span>Total</span>
        <span>${formatCurrency(invoice.total, invoice.currency)}</span>
      </div>
    </div>

    <div style="margin-top: 60px; text-align: center; font-size: 12px; color: #9ca3af;">
      Generated by eBay Tax Buddy • ${formatDate(new Date())}
    </div>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
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
    const body: InvoiceRequest = await req.json();
    const { transactionId, invoiceId, regenerate, buyerEmail, sendEmail, vatRate, includePdf, buyerName, buyerAddressOverride } = body;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const isServiceRoleCall = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    const userId = authData?.user?.id ?? (isServiceRoleCall ? (body.userId ?? null) : null);

    if (authError && !isServiceRoleCall) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If regenerating an existing invoice, just return the HTML
    if (invoiceId && regenerate) {
      const { data: existingInvoice, error: invError } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .eq("user_id", userId)
        .single();

      if (invError || !existingInvoice) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const invoiceHTML = generateInvoiceHTML(existingInvoice);
      return new Response(
        JSON.stringify({
          success: true,
          invoice: existingInvoice,
          invoiceHTML,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!transactionId) {
      return new Response(JSON.stringify({ error: "Transaction ID required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

      const parsedVatRate = vatRate == null ? 0 : Number(vatRate);
      const vatRateValid = Number.isFinite(parsedVatRate) && parsedVatRate >= 0 && parsedVatRate <= 100;

    // Get transaction details
    const { data: transaction, error: txnError } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .eq("user_id", userId)
      .single();

    if (txnError || !transaction) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if invoice already exists for this ORDER (one invoice per order)
    const { data: existingInvoices, error: existingInvError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("order_id", transaction.order_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingInvError) {
      console.error("Existing invoice lookup error:", existingInvError);
    }

    const existingInvoice = existingInvoices?.[0] ?? null;

    // If invoice exists, return it (can only send again, not generate a new number)
    if (existingInvoice) {
      // Get seller settings for template
        const { data: settings } = await supabaseAdmin
        .from("user_settings")
          .select(
            "seller_business_name, seller_address, seller_street, seller_city, seller_postal_code, seller_country, seller_email, seller_vat_number, seller_contact_name, seller_contact_department, seller_contact_phone, seller_contact_email, invoice_template, invoice_logo_url, invoice_motto, invoice_email_subject, invoice_email_body_html, invoice_layout"
          )
        .eq("user_id", userId)
        .single();

      const invoiceHTML = generateInvoiceHTML(existingInvoice, settings);

      // If sendEmail is requested, we can resend
      if (sendEmail && (buyerEmail || existingInvoice.buyer_email)) {
        const targetEmail = buyerEmail || existingInvoice.buyer_email;

        const subject = applyTemplate(
          settings?.invoice_email_subject || `Invoice {INVOICE_NUMBER} from {SELLER_NAME}`,
          {
            INVOICE_NUMBER: existingInvoice.invoice_number,
            SELLER_NAME: settings?.seller_business_name || "Seller",
            BUYER_NAME: existingInvoice.buyer_name || "Buyer",
            TOTAL: formatCurrency(Number(existingInvoice.total || 0), existingInvoice.currency || "EUR"),
            INVOICE_HTML: invoiceHTML,
          }
        );
        const defaultBodyHtml = `
          <p>Hello {BUYER_NAME},</p>
          <p>Please find your invoice <strong>{INVOICE_NUMBER}</strong> attached as a PDF.</p>
          <p>Total: <strong>{TOTAL}</strong></p>
          <p>Best regards,<br/>{SELLER_NAME}</p>
        `.trim();
        const bodyHtml = applyTemplate(settings?.invoice_email_body_html || defaultBodyHtml, {
          INVOICE_NUMBER: existingInvoice.invoice_number,
          SELLER_NAME: settings?.seller_business_name || "Seller",
          BUYER_NAME: existingInvoice.buyer_name || "Buyer",
          TOTAL: formatCurrency(Number(existingInvoice.total || 0), existingInvoice.currency || "EUR"),
          INVOICE_HTML: invoiceHTML,
        });

        const en16931Xml = buildEn16931XmlBestEffort({
          invoiceNumber: existingInvoice.invoice_number,
          invoiceDateIso: existingInvoice.invoice_date,
          currency: existingInvoice.currency || "EUR",
          seller: {
            name: existingInvoice.seller_name || settings?.seller_business_name || "Seller",
            address: existingInvoice.seller_address || settings?.seller_address || "",
            email: existingInvoice.seller_email || settings?.seller_email || settings?.seller_contact_email || "",
            vatNumber: existingInvoice.seller_vat_number || settings?.seller_vat_number || undefined,
            contactName: settings?.seller_contact_name || "",
            contactDepartment: settings?.seller_contact_department || "",
            contactPhone: settings?.seller_contact_phone || "",
            contactEmail: settings?.seller_contact_email || "",
          },
          buyer: {
            name: existingInvoice.buyer_name || "Buyer",
            address: existingInvoice.buyer_address || "",
            email: targetEmail || existingInvoice.buyer_email || "",
          },
          lineItems: (existingInvoice.line_items || []) as any,
          subtotal: Number(existingInvoice.subtotal || 0),
          taxRate: Number(existingInvoice.tax_rate || 0),
          taxAmount: Number(existingInvoice.tax_amount || 0),
          total: Number(existingInvoice.total || 0),
        });

        // Best-effort payment method parsing for display (hide if unknown)
        let paymentMethod: string | null = null;
        if (existingInvoice.transaction_id) {
          const { data: tx } = await supabaseAdmin
            .from("transactions")
            .select("raw_data")
            .eq("id", existingInvoice.transaction_id)
            .eq("user_id", userId)
            .maybeSingle();
          paymentMethod = detectPaymentMethod((tx as any)?.raw_data);
        }

        const invoiceForPdf = { ...existingInvoice, payment_method: paymentMethod };
        const pdfBytes = await generateInvoicePdfFromTemplate({
          invoice: invoiceForPdf,
          settings,
          lineItems: (existingInvoice.line_items || []) as any,
          zugferdXml: en16931Xml,
        });

        const emailResult = await sendInvoiceEmailWithAttachment({
          supabaseAdmin,
          userId,
          to: targetEmail,
          subject,
          html: bodyHtml,
          pdfBytes,
          pdfFilename: `${existingInvoice.invoice_number}.pdf`,
        });

        if (emailResult.success) {
          await supabaseAdmin
            .from("invoices")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              sent_to_email: targetEmail,
              buyer_email: targetEmail,
            })
            .eq("id", existingInvoice.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            invoice: existingInvoice,
            invoiceHTML,
            emailSent: emailResult.success,
            emailError: emailResult.error,
            alreadyExists: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Just return existing invoice for view/download
      return new Response(
        JSON.stringify({
          success: true,
          invoice: existingInvoice,
          invoiceHTML,
          emailSent: false,
          alreadyExists: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get buyer address if available
    const { data: buyerAddress } = await supabaseAdmin
      .from("buyer_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("order_id", transaction.order_id)
      .single();

    // Get seller settings
    const { data: settings } = await supabaseAdmin
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Generate invoice number
    const invoicePrefix = settings?.invoice_prefix || "INV";
    const nextNumber = settings?.next_invoice_number || 1;
    const invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(6, "0")}`;

    // Build buyer address string
    let buyerAddressStr = "";
    if (buyerAddress) {
      const parts = [
        buyerAddress.street_address,
        buyerAddress.city,
        buyerAddress.state_province,
        buyerAddress.postal_code,
        buyerAddress.country_name || buyerAddress.country_code,
      ].filter(Boolean);
      buyerAddressStr = parts.join("\n");
    }

    // Allow overrides (e.g. Shopify billing/shipping address)
    const finalBuyerName = (buyerName || buyerAddress?.full_name || "Buyer").trim();
    const finalBuyerAddress = (buyerAddressOverride || buyerAddressStr || "").trim();

    // Create line items
    const lineItems: LineItem[] = [
      {
        description: transaction.item_title || "Item",
        quantity: transaction.quantity || 1,
        unitPrice: (transaction.gross || 0) / (transaction.quantity || 1),
        total: transaction.gross || 0,
      },
    ];

    // Calculate totals
    const subtotal = transaction.gross || 0;
    if (!vatRateValid) {
      return new Response(JSON.stringify({ error: "VAT rate is required and must be between 1 and 100" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rate = parsedVatRate as number;
    const taxAmount = Math.round(((subtotal * rate) / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    // ZUGFeRD / EN16931 (strict): generate XML even if some fields are missing.
    const missingFields = computeMissingEn16931Fields({
      settings,
      buyerName: finalBuyerName,
      buyerAddress: finalBuyerAddress,
      buyerEmail: (buyerEmail || buyerAddress?.buyer_email || "") ?? "",
    });

    if (missingFields.length > 0) {
      // Inform user via Telegram (using the existing invoice_failed notification toggle).
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            type: "invoice_failed",
            data: {
              order_id: transaction.order_id || "Unknown",
              invoice_number: "(draft)",
              error_message: `EN16931 data incomplete. Missing fields: ${missingFields.join(", ")}. PDF/XML generated anyway; please fill these in Settings for future invoices.`,
            },
          }),
        });
      } catch (e) {
        console.error("Failed to send Telegram missing-fields warning:", e);
      }
    }

    // Create invoice record
    const composedSellerAddress = buildSellerAddressFromSettings(settings);
    const paymentMethod = detectPaymentMethod((transaction as any).raw_data);
    const invoiceData = {
      user_id: userId,
      transaction_id: transactionId,
      order_id: transaction.order_id,
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString(),
      seller_name: settings?.seller_business_name || null,
      seller_address: composedSellerAddress || settings?.seller_address || null,
      seller_vat_number: settings?.seller_vat_number || null,
      seller_email: settings?.seller_email || null,
      buyer_name: finalBuyerName || "Buyer",
      buyer_address: finalBuyerAddress || null,
      buyer_email: buyerEmail || buyerAddress?.buyer_email || null,
      buyer_vat_number: null,
      line_items: lineItems,
      subtotal,
      tax_amount: taxAmount,
      tax_rate: rate,
      total,
      currency: transaction.currency || "EUR",
      status: "draft",
    };

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .insert(invoiceData)
      .select()
      .single();

    if (invoiceError) {
      // If an invoice already exists (unique index on user_id+order_id), fetch and return it.
      if (invoiceError.code === "23505") {
        const { data: existingInvoices } = await supabaseAdmin
          .from("invoices")
          .select("*")
          .eq("order_id", transaction.order_id)
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1);

        const existingInvoice = existingInvoices?.[0];
        if (existingInvoice) {
          const invoiceHTML = generateInvoiceHTML(existingInvoice, settings);
          return new Response(
            JSON.stringify({
              success: true,
              invoice: existingInvoice,
              invoiceHTML,
              emailSent: false,
              alreadyExists: true,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      console.error("Invoice creation error:", invoiceError);
      return new Response(JSON.stringify({ error: "Failed to create invoice" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update next invoice number
    await supabaseAdmin
      .from("user_settings")
      .upsert({
        user_id: userId,
        next_invoice_number: nextNumber + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    // Generate HTML for preview/download
    const invoiceForRender = { ...invoice, payment_method: paymentMethod };
    const invoiceHTML = generateInvoiceHTML(invoiceForRender, settings);

    // Prepare EN16931 XML (best-effort) for embedding in the PDF attachment.
    const en16931Xml = buildEn16931XmlBestEffort({
      invoiceNumber,
      invoiceDateIso: invoice.invoice_date,
      currency: invoice.currency || "EUR",
      seller: {
        name: invoice.seller_name || settings?.seller_business_name || "Seller",
        address: invoice.seller_address || settings?.seller_address || "",
        email: invoice.seller_email || settings?.seller_email || settings?.seller_contact_email || "",
        vatNumber: invoice.seller_vat_number || settings?.seller_vat_number || undefined,
        contactName: settings?.seller_contact_name || "",
        contactDepartment: settings?.seller_contact_department || "",
        contactPhone: settings?.seller_contact_phone || "",
        contactEmail: settings?.seller_contact_email || "",
      },
      buyer: {
        name: invoice.buyer_name || "Buyer",
        address: invoice.buyer_address || "",
        email: invoice.buyer_email || "",
      },
      lineItems,
      subtotal: Number(invoice.subtotal || 0),
      taxRate: Number(invoice.tax_rate || 0),
      taxAmount: Number(invoice.tax_amount || 0),
      total: Number(invoice.total || 0),
    });

    // Send email if requested
    if (sendEmail && invoice.buyer_email) {
      const subject = applyTemplate(
        settings?.invoice_email_subject || `Invoice {INVOICE_NUMBER} from {SELLER_NAME}`,
        {
          INVOICE_NUMBER: invoiceNumber,
          SELLER_NAME: settings?.seller_business_name || "Seller",
          BUYER_NAME: invoice.buyer_name || "Buyer",
          TOTAL: formatCurrency(Number(invoice.total || 0), invoice.currency || "EUR"),
          INVOICE_HTML: invoiceHTML,
        }
      );
      // IMPORTANT: Default behavior should send the *PDF attachment* as the invoice,
      // not the full HTML invoice content as the email body. Users can still opt-in
      // to embedding the HTML by customizing invoice_email_body_html to include {INVOICE_HTML}.
      const defaultBodyHtml = `
        <p>Hello {BUYER_NAME},</p>
        <p>Please find your invoice <strong>{INVOICE_NUMBER}</strong> attached as a PDF.</p>
        <p>Total: <strong>{TOTAL}</strong></p>
        <p>Best regards,<br/>{SELLER_NAME}</p>
      `.trim();

      const bodyHtml = applyTemplate(settings?.invoice_email_body_html || defaultBodyHtml, {
        INVOICE_NUMBER: invoiceNumber,
        SELLER_NAME: settings?.seller_business_name || "Seller",
        BUYER_NAME: invoice.buyer_name || "Buyer",
        TOTAL: formatCurrency(Number(invoice.total || 0), invoice.currency || "EUR"),
        INVOICE_HTML: invoiceHTML,
      });

       const pdfBytes = await generateInvoicePdfFromTemplate({
         invoice: invoiceForRender,
        settings,
        lineItems: (invoice.line_items || []) as any,
        zugferdXml: en16931Xml,
      });

      const emailResult = await sendInvoiceEmailWithAttachment({
        supabaseAdmin,
        userId,
        to: invoice.buyer_email,
        subject,
        html: bodyHtml,
        pdfBytes,
        pdfFilename: `${invoiceNumber}.pdf`,
      });

      if (emailResult.success) {
        await supabaseAdmin
          .from("invoices")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            sent_to_email: invoice.buyer_email,
          })
          .eq("id", invoice.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          invoice,
          invoiceHTML,
          emailSent: emailResult.success,
          emailError: emailResult.error,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If the frontend wants a real PDF for download/opening, return it as base64.
    if (includePdf) {
      const pdfBytes = await generateInvoicePdfFromTemplate({
        invoice: invoiceForRender,
        settings,
        lineItems: (invoice.line_items || []) as any,
        zugferdXml: en16931Xml,
      });
      return new Response(
        JSON.stringify({
          success: true,
          invoice,
          invoiceHTML,
          emailSent: false,
          pdfBase64: base64EncodeBytes(pdfBytes),
          pdfFilename: `${invoiceNumber}.pdf`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoice,
        invoiceHTML,
        emailSent: false,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Invoice generation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
