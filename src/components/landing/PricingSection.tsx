import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./ScrollReveal";

const plans = [
  {
    name: "Starter",
    description: "For small sellers getting started",
    price: { monthly: 0, annual: 0 },
    features: ["100 orders/month", "1 integration", "1 invoice template", "Email support", "Basic audit logs"],
    cta: "Get started free",
    popular: false,
  },
  {
    name: "Pro",
    description: "For growing digital businesses",
    price: { monthly: 29, annual: 25 },
    features: ["1,000 orders/month", "3 integrations", "3 invoice templates", "Priority support", "Full audit logs", "Custom branding"],
    cta: "Start free trial",
    popular: true,
  },
  {
    name: "Scale",
    description: "For high-volume sellers",
    price: { monthly: 99, annual: 84 },
    features: ["Unlimited orders", "Unlimited integrations", "Custom invoice templates", "Dedicated support", "Advanced analytics", "API access", "Webhook events"],
    cta: "Start free trial",
    popular: false,
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section className="py-20 bg-muted/30" id="pricing">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              Start free, upgrade when you need more. No hidden fees.
            </p>
            <div className="inline-flex items-center gap-3 bg-card rounded-full p-1 border border-border">
              <button
                onClick={() => setIsAnnual(false)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  !isAnnual ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  isAnnual ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Annual
                <span className="ml-1.5 text-xs bg-success/10 text-success px-1.5 py-0.5 rounded-full">-15%</span>
              </button>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <ScrollReveal key={index} delay={index * 120}>
              <div
                className={cn(
                  "relative bg-card rounded-2xl border p-6 sm:p-8 shadow-sm transition-all duration-300 h-full",
                  plan.popular
                    ? "border-accent shadow-xl md:scale-[1.02] lg:scale-105 order-first md:order-none bg-gradient-to-b from-card to-accent/[0.03] backdrop-blur-sm"
                    : "border-border hover:border-accent/50 hover:shadow-md"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-accent text-accent-foreground text-xs font-semibold px-3 py-1 rounded-full shadow-lg shadow-accent/20 animate-pulse" style={{ animationDuration: "3s" }}>
                      Most Popular
                    </span>
                  </div>
                )}
                <h3 className="font-heading text-xl font-bold text-foreground mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">
                    ${isAnnual ? plan.price.annual : plan.price.monthly}
                  </span>
                  {plan.price.monthly > 0 && <span className="text-muted-foreground">/month</span>}
                  {isAnnual && plan.price.monthly > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Billed annually</p>
                  )}
                </div>
                <Button asChild className="w-full mb-6" variant={plan.popular ? "default" : "outline"}>
                  <Link to="/auth">{plan.cta}</Link>
                </Button>
                <ul className="space-y-3">
                  {plan.features.map((feature, fi) => (
                    <li key={fi} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
