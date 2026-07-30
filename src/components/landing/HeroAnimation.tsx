import { CheckCircle2, Package, Mail, FileText } from "lucide-react";

export function HeroAnimation() {
  return (
    <div className="relative w-full max-w-sm mx-auto lg:max-w-md">
      {/* Glass card container */}
      <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-2xl">

        {/* Step 1: New Order */}
        <div className="animate-demo-step-1 mb-3">
          <div className="flex items-center gap-3 rounded-lg bg-success/15 border border-success/20 p-3">
            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">New Order Paid</p>
              <p className="text-xs text-white/50">#ORD-12847 · €49.99</p>
            </div>
          </div>
        </div>

        {/* Connector */}
        <div className="flex justify-center mb-3">
          <div className="animate-demo-connector-1 w-px bg-gradient-to-b from-success/40 to-accent/40" style={{ height: 16 }} />
        </div>

        {/* Step 2: Key Retrieved */}
        <div className="animate-demo-step-2 mb-3">
          <div className="flex items-center gap-3 rounded-lg bg-accent/10 border border-accent/20 p-3">
            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-accent/20 flex items-center justify-center">
              <Package className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Key Retrieved</p>
              <p className="text-xs text-accent/80 font-mono tracking-wide">XXXX-YYYY-ZZZZ-1234</p>
            </div>
          </div>
        </div>

        {/* Connector */}
        <div className="flex justify-center mb-3">
          <div className="animate-demo-connector-2 w-px bg-gradient-to-b from-accent/40 to-white/20" style={{ height: 16 }} />
        </div>

        {/* Step 3: Delivered + Invoiced */}
        <div className="animate-demo-step-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2.5">
              <Mail className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs font-medium text-white">Delivered</p>
                <p className="text-[10px] text-white/40">Sent ✓</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2.5">
              <FileText className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs font-medium text-white">Invoice</p>
                <p className="text-[10px] text-white/40">Sent ✓</p>
              </div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-white/40">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
          </span>
          Automated · Hands-free · 24/7
        </div>
      </div>
    </div>
  );
}
