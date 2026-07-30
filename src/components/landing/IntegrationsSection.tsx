import { Code2, Store, ShoppingBag, ShoppingCart } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const integrations = [
  { name: "eBay", icon: Store, description: "Sync orders and auto-fulfill digital keys.", status: "Available" },
  { name: "Shopify", icon: ShoppingBag, description: "Connect your Shopify store for instant delivery.", status: "Available" },
  { name: "WooCommerce", icon: ShoppingCart, description: "WordPress integration for digital products.", status: "Coming soon" },
  { name: "API / Webhooks", icon: Code2, description: "Build custom integrations with our REST API.", status: "Available" },
];

export function IntegrationsSection() {
  return (
    <section className="py-20" id="integrations">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
              Connect your selling platforms
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Integrate with the marketplaces and platforms where you sell.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration, index) => (
            <ScrollReveal key={index} delay={index * 100}>
              <div className="group bg-card rounded-xl border border-border p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-accent/50 hover:-translate-y-1">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-300 group-hover:bg-accent/10 group-hover:text-accent group-hover:-translate-y-1">
                  <integration.icon className="h-7 w-7" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-1">{integration.name}</h3>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-3 ${
                  integration.status === "Available" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}>
                  {integration.status}
                </span>
                <p className="text-sm text-muted-foreground">{integration.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={500}>
          <p className="text-center text-muted-foreground mt-8">
            More integrations coming—<a href="mailto:support@inbew.com" className="text-accent hover:underline">request yours</a>.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
