import { Shield, Lock, FileSearch, Key } from "lucide-react";
import { Link } from "react-router-dom";
import { ScrollReveal } from "./ScrollReveal";

const securityFeatures = [
  { icon: Lock, title: "Encrypted storage + role-based access", description: "Your digital inventory is encrypted at rest. Control who can view or manage it." },
  { icon: FileSearch, title: "Delivery logs and exportable records", description: "Full audit trail for every delivery. Export anytime for compliance." },
  { icon: Key, title: "Unique delivery tracking", description: "Track which product was sent to which order. Never lose visibility." },
];

export function TrustSecuritySection() {
  return (
    <section className="py-20 bg-primary/5" id="security">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <ScrollReveal direction="left">
            <div>
              <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-3 py-1 rounded-full text-sm font-medium mb-4">
                <Shield className="h-4 w-4" />
                Enterprise-grade security
              </div>
              <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-6">
                Vault-grade control for digital inventory
              </h2>
              <div className="space-y-6">
                {securityFeatures.map((feature, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="#" className="inline-flex items-center gap-1 mt-6 text-sm font-medium text-accent hover:underline">
                Security details →
              </Link>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" delay={200}>
            <div className="relative">
              <div className="aspect-square max-w-md mx-auto relative">
                {/* Pulsing glow rings */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-accent/20 animate-spin-slow" style={{ animationDuration: "30s" }} />
                <div className="absolute inset-4 rounded-full border border-accent/10 animate-pulse" style={{ animationDuration: "3s" }} />
                <div className="absolute inset-8 rounded-full border-2 border-accent/30" />
                <div className="absolute inset-16 rounded-full bg-accent/10 flex items-center justify-center shadow-[0_0_60px_rgba(var(--accent),0.15)]">
                  <Shield className="h-16 w-16 text-accent" />
                </div>
                <div className="absolute top-4 right-8 bg-card rounded-lg border border-border p-2 shadow-sm">
                  <Lock className="h-5 w-5 text-accent" />
                </div>
                <div className="absolute bottom-8 left-4 bg-card rounded-lg border border-border p-2 shadow-sm">
                  <Key className="h-5 w-5 text-accent" />
                </div>
                <div className="absolute bottom-20 right-0 bg-card rounded-lg border border-border p-2 shadow-sm">
                  <FileSearch className="h-5 w-5 text-accent" />
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
