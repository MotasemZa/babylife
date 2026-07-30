import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroAnimation } from "./HeroAnimation";
import { ScrollReveal } from "./ScrollReveal";

const bulletPoints = [
  "One order → one unique delivery (no duplicates, no oversell)",
  "Audit-friendly delivery logs for support & disputes",
  "Invoices sent automatically for every order",
];

export function HeroSection() {
  const scrollToHowItWorks = () => {
    document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[100dvh] flex items-center overflow-hidden">
      {/* Dark base */}
      <div className="absolute inset-0 bg-[hsl(222,47%,6%)]" />

      {/* Animated gradient blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-[hsl(173,58%,25%)] opacity-[0.12] blur-[120px] animate-blob-1" />
        <div className="absolute top-[30%] right-[-15%] h-[500px] w-[500px] rounded-full bg-[hsl(222,47%,25%)] opacity-[0.15] blur-[120px] animate-blob-2" />
        <div className="absolute bottom-[-10%] left-[30%] h-[400px] w-[400px] rounded-full bg-[hsl(173,58%,35%)] opacity-[0.08] blur-[100px] animate-blob-3" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container relative mx-auto px-4 lg:px-8 py-24 lg:py-0">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Left: copy */}
          <div className="max-w-xl">
            <ScrollReveal delay={0}>
              <h1 className="mb-4 lg:mb-6 font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl xl:text-6xl">
                Sell digital products.{" "}
                <span className="text-accent">Deliver in seconds.</span>{" "}
                Invoice automatically.
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <p className="mb-6 lg:mb-8 text-base lg:text-lg text-white/60 xl:text-xl">
                Connect your store → load your digital inventory → INBEW dispatches
                codes, licenses, or files per order, logs delivery, and sends invoices—hands-free.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <ul className="mb-8 space-y-3">
                {bulletPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-accent mt-0.5" />
                    <span className="text-white/80">{point}</span>
                  </li>
                ))}
              </ul>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button size="lg" asChild className="text-base px-8 bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth">Get Started</Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={scrollToHowItWorks}
                  className="text-base gap-2 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <ChevronDown className="h-4 w-4" />
                  See how it works
                </Button>
              </div>
              <p className="mt-4 text-sm text-white/40">
                Built for serious digital sellers.
              </p>
            </ScrollReveal>
          </div>

          {/* Right: animated demo — visible on all sizes */}
          <div className="order-first lg:order-last">
            <ScrollReveal delay={200} direction="right">
              <HeroAnimation />
            </ScrollReveal>
          </div>
        </div>
      </div>

      {/* Bottom fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
