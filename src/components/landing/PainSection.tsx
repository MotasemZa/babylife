import { AlertTriangle, Copy, HelpCircle } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const painPoints = [
  {
    icon: Copy,
    title: "Copy/paste mistakes",
    consequence: "refunds",
    description: "Manual delivery leads to typos, wrong codes, and costly refunds.",
  },
  {
    icon: AlertTriangle,
    title: "Duplicate deliveries",
    consequence: "chargebacks",
    description: "Sending the same product twice creates disputes and chargeback fees.",
  },
  {
    icon: HelpCircle,
    title: '"Where is my code?"',
    consequence: "support overload",
    description: "Slow delivery floods your inbox with angry customer messages.",
  },
];

export function PainSection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
              Manual delivery is killing your margin.
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid gap-6 md:grid-cols-3 mb-12">
          {painPoints.map((pain, index) => (
            <ScrollReveal key={index} delay={index * 120}>
              <div className="group relative bg-card rounded-xl border border-destructive/20 p-6 transition-all duration-300 hover:border-destructive/40 hover:shadow-lg hover:-translate-y-1 overflow-hidden">
                {/* Accent gradient top line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-destructive/60 via-destructive/30 to-transparent" />
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <pain.icon className="h-6 w-6" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                  {pain.title}{" "}
                  <span className="text-destructive">→ {pain.consequence}</span>
                </h3>
                <p className="text-sm text-muted-foreground">{pain.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={400}>
          <p className="text-center text-lg text-foreground font-medium">
            <span className="text-accent">INBEW</span> automates the entire post-purchase flow.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
