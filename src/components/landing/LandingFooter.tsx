import { Link } from "react-router-dom";
import inbewLogo from "@/assets/brand/inbew-logo.png";
import { BRAND } from "@/config/brand";

const footerLinks = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Contact", href: "mailto:support@inbew.com" },
];

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30 relative overflow-hidden">
      {/* Gradient separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="container mx-auto px-4 py-12 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4">
            <Link to="/" className="flex items-center gap-2">
              <img src={inbewLogo} alt="INBEW" className="h-8 w-auto" loading="lazy" />
            </Link>
            <div className="text-sm text-muted-foreground max-w-xs">
              <p>{BRAND.business.legalName}</p>
              <p>{BRAND.business.street}, {BRAND.business.postalCode} {BRAND.business.city}</p>
              <p>{BRAND.business.country}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 lg:gap-8">
            {footerLinks.map((link) => (
              <Link key={link.label} to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground text-center lg:text-left">
            © {currentYear} {BRAND.business.legalName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
