import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import inbewLogo from "@/assets/brand/inbew-logo.png";
import { Hero3DScene } from "@/components/landing/Hero3DScene";
import {
  LandingHeader,
  SocialProofStrip,
  PainSection,
  FeatureGrid,
  HowItWorks,
  CrossListingShowcase,
  TrustSecuritySection,
  IntegrationsSection,
  FAQSection,
  FinalCTASection,
  LandingFooter,
} from "@/components/landing";

export default function Landing() {
  return (
    <div className="min-h-screen w-full">
      <LandingHeader />

      {/* Hero with Spline 3D background */}
      <section className="relative h-screen w-full overflow-hidden">
        <Hero3DScene />
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center pt-16">
          <img
            src={inbewLogo}
            alt="INBEW"
            className="h-12 lg:h-16 w-auto brightness-0 invert mb-8"
            loading="eager"
          />
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white tracking-tight mb-6 max-w-4xl drop-shadow-lg">
            Sell digital products.{" "}
            <span className="text-accent">Deliver instantly.</span>
          </h1>
          <p className="text-white/60 text-lg lg:text-xl max-w-2xl mb-10 drop-shadow">
            Connect your store, load your digital inventory, and let INBEW handle
            delivery, logs, and invoices — completely free.
          </p>
          <Button
            size="lg"
            asChild
            className="text-base px-10 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          >
            <Link to="/auth">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </section>

      {/* All sections */}
      <SocialProofStrip />
      <PainSection />
      <FeatureGrid />
      <HowItWorks />
      <CrossListingShowcase />
      <TrustSecuritySection />
      <IntegrationsSection />
      <FAQSection />
      <FinalCTASection />
      <LandingFooter />
    </div>
  );
}
