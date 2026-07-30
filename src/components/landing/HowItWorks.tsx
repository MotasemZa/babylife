import { useState } from "react";
import { Link2, Upload, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./ScrollReveal";

const steps = [
  {
    number: 1,
    icon: Link2,
    title: "Connect",
    description: "Connect Shopify/marketplace and map products to your vault.",
    details: "Link your selling platforms in minutes. INBEW automatically syncs orders and triggers fulfillment.",
  },
  {
    number: 2,
    icon: Upload,
    title: "Load your vault",
    description: "Upload your digital inventory, set rules, prevent duplicates.",
    details: "Import codes, licenses, or files from CSV or paste them directly. Set stock alerts and duplicate prevention rules.",
  },
  {
    number: 3,
    icon: Zap,
    title: "Dispatch + invoice",
    description: "Auto-deliver → log → invoice sent.",
    details: "When an order comes in, INBEW pulls a product from your vault, delivers it, logs the action, and sends an invoice—automatically.",
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section className="py-20" id="how-it-works">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
              How it works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Three simple steps to automate your digital delivery workflow.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
              {steps.map((step, index) => (
                <button
                  key={step.number}
                  onClick={() => setActiveStep(index)}
                  className={cn(
                    "flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-full transition-all duration-300 min-h-[44px]",
                    activeStep === index
                      ? "bg-accent text-accent-foreground shadow-md scale-105"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <span className="font-semibold">{step.number}</span>
                  <span className="hidden sm:inline font-medium">{step.title}</span>
                </button>
              ))}
            </div>

            <div className="relative">
              {steps.map((step, index) => (
                <div
                  key={step.number}
                  className={cn(
                    "transition-all duration-500",
                    activeStep === index
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 absolute inset-0 translate-y-4 pointer-events-none"
                  )}
                >
                  <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
                    <div className="flex flex-col items-center text-center lg:flex-row lg:text-left lg:items-start gap-6">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent flex-shrink-0">
                        <step.icon className="h-8 w-8" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-heading text-2xl font-bold text-foreground mb-2">
                          Step {step.number}: {step.title}
                        </h3>
                        <p className="text-lg text-foreground mb-2">{step.description}</p>
                        <p className="text-muted-foreground">{step.details}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
