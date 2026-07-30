import { Quote } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const testimonials = [
  {
    quote: "Cut support tickets by 60% after switching to INBEW.",
    author: "Alex M.",
    role: "Digital Seller",
    metric: "-60% tickets",
  },
  {
    quote: "No more duplicate deliveries—refunds dropped immediately.",
    author: "Sarah K.",
    role: "Game Code Reseller",
    metric: "Zero duplicates",
  },
  {
    quote: "Invoices + delivery in one flow saved us hours weekly.",
    author: "Michael R.",
    role: "Software License Seller",
    metric: "5+ hrs/week saved",
  },
];

export function SocialProofStrip() {
  return (
    <section className="py-12 lg:py-16 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <p className="text-center text-sm lg:text-base text-muted-foreground mb-8 lg:mb-10">
            Built for digital sellers shipping{" "}
            <span className="font-semibold text-foreground">10 to 10,000</span>{" "}
            orders/month.
          </p>
        </ScrollReveal>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <ScrollReveal key={index} delay={index * 120}>
              <div className="group relative bg-card rounded-xl border border-border p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-accent/30 hover:-translate-y-1">
                <Quote className="h-8 w-8 text-accent/20 mb-4" />
                <blockquote className="text-foreground font-medium mb-4">
                  "{testimonial.quote}"
                </blockquote>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{testimonial.author}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                  </div>
                  <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                    {testimonial.metric}
                  </span>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
