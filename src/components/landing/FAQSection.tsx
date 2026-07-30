import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollReveal } from "./ScrollReveal";

const faqs = [
  { question: "How does duplicate prevention work?", answer: "Each item in your vault is tracked with a unique status. When a product is dispatched, it's immediately marked as 'used' and can never be sent again. If an order comes in and no available stock exists, the fulfillment is paused and you're notified—no accidental double-sends." },
  { question: "What if a buyer claims they didn't receive the product?", answer: "Every delivery is logged with a timestamp, the exact product sent, and the order details. You can pull up the audit log instantly to prove delivery. This protects you in disputes and chargebacks." },
  { question: "How fast is delivery?", answer: "Delivery happens within seconds of payment confirmation. For most platforms, buyers receive their digital product in under 30 seconds. You can also configure delivery timing if needed." },
  { question: "Can I brand the delivery message and invoice?", answer: "Yes! You can fully customize the email templates for delivery messages and invoices. Add your logo, adjust colors, and use variables like buyer name, order ID, and product details." },
  { question: "Do you support invoices automatically?", answer: "Absolutely. When auto-invoice is enabled, INBEW generates a PDF invoice for every order and sends it to the buyer automatically. You can customize the template, tax settings, and include your business details." },
  { question: "Can I test with a sandbox before going live?", answer: "Yes, you can use our sandbox mode to test the full flow without affecting real inventory. Create test products, simulate orders, and verify everything works before connecting your live store." },
];

export function FAQSection() {
  return (
    <section className="py-20" id="faq">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
              Frequently asked questions
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to know about INBEW.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left text-foreground hover:text-accent">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
