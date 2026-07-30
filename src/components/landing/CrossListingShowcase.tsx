import { ArrowRight, Link2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const benefits = [
  {
    icon: Zap,
    title: "One-click cross-list",
    description: "Push your eBay listing to Shopify with a single click",
  },
  {
    icon: Sparkles,
    title: "AI-powered content",
    description:
      "AI rewrites descriptions, generates tags, and optimizes for each platform",
  },
  {
    icon: RefreshCw,
    title: "Stock stays in sync",
    description:
      "Sell on one platform, stock updates everywhere automatically",
  },
];

export function CrossListingShowcase() {
  return (
    <section className="py-20 md:py-28 bg-primary relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-accent mb-3">
              Cross-listing
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Cross-list across platforms —{" "}
              <span className="gradient-text">AI does the heavy lifting</span>
            </h2>
            <p className="text-primary-foreground/60 max-w-xl mx-auto">
              List once, sell everywhere. Our AI adapts your listing for each
              platform automatically.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Animated demo */}
          <ScrollReveal direction="left">
            <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl max-w-md mx-auto lg:mx-0">
              {/* Step 1: eBay listing */}
              <div className="animate-crosslist-step-1">
                <div className="rounded-lg bg-white/10 border border-white/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent px-2 py-0.5 rounded">
                      eBay
                    </span>
                    <span className="text-[10px] text-white/40">Active</span>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Sony WH-1000XM5 Headphones
                  </p>
                  <p className="text-xs text-white/50 mt-1">€299.99 · 12 in stock</p>
                </div>
              </div>

              {/* Step 2: AI optimizing */}
              <div className="flex items-center justify-center my-4 animate-crosslist-step-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/15 border border-accent/20">
                  <Sparkles className="h-3.5 w-3.5 text-accent animate-pulse-soft" />
                  <span className="text-xs font-medium text-accent">
                    AI Optimizing…
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-accent" />
                </div>
              </div>

              {/* Step 3: Shopify listing */}
              <div className="animate-crosslist-step-3">
                <div className="rounded-lg bg-white/10 border border-white/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-success/20 text-success px-2 py-0.5 rounded">
                      Shopify
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-accent">
                      <Link2 className="h-2.5 w-2.5" /> Linked
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Sony WH-1000XM5 Wireless Noise-Cancelling
                  </p>
                  <p className="text-xs text-white/50 mt-1">€299.99 · 12 in stock</p>
                  <div className="flex gap-1.5 mt-2">
                    {["headphones", "sony", "wireless"].map((t) => (
                      <span
                        key={t}
                        className="text-[9px] bg-white/5 text-white/50 px-1.5 py-0.5 rounded"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-white/40">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
                </span>
                Synced · Multi-platform · AI-powered
              </div>
            </div>
          </ScrollReveal>

          {/* Right: Benefits */}
          <div className="space-y-8">
            {benefits.map((b, i) => (
              <ScrollReveal key={b.title} delay={i * 120} direction="right">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center">
                    <b.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-primary-foreground mb-1">
                      {b.title}
                    </h3>
                    <p className="text-sm text-primary-foreground/60">
                      {b.description}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
