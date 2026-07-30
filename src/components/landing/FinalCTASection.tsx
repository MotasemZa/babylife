import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "./ScrollReveal";

export function FinalCTASection() {
  return (
    <section className="py-16 lg:py-20 bg-primary">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-primary-foreground lg:text-4xl mb-4">
              Start delivering in seconds, not hours.
            </h2>
            <p className="text-primary-foreground/80 text-lg mb-8">
              Join digital sellers who've automated their fulfillment with INBEW.
            </p>
            <Button
              size="lg"
              variant="secondary"
              asChild
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-base gap-2"
            >
              <Link to="/auth">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
