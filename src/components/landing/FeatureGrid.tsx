import {
  Vault,
  Settings2,
  ShieldCheck,
  ClipboardList,
  FileText,
  Palette,
} from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const features = [
  { icon: Vault, title: "Digital Vault", description: "Import, tag, and organize your digital products—keys, codes, licenses, files." },
  { icon: Settings2, title: "Auto Dispatch Rules", description: "Set per-product or per-store rules for automatic delivery." },
  { icon: ShieldCheck, title: "Duplicate Prevention", description: "Mark items as used instantly—never resend the same product." },
  { icon: ClipboardList, title: "Audit Logs", description: "Full delivery records with timestamps for support & disputes." },
  { icon: FileText, title: "Invoice Automation", description: "Generate and send branded invoices automatically per order." },
  { icon: Palette, title: "Branding Templates", description: "Customize delivery messages and invoices with your brand." },
];

export function FeatureGrid() {
  return (
    <section className="py-20 bg-muted/30" id="features">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
              Everything you need for automated delivery
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A complete toolkit for digital sellers who want reliable, hands-free fulfillment.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <ScrollReveal key={index} delay={index * 80}>
              <div className="group bg-card rounded-xl border border-border p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:border-accent/50 hover:-translate-y-1.5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent transition-all duration-300 group-hover:bg-accent group-hover:text-accent-foreground group-hover:shadow-lg group-hover:shadow-accent/20">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
