import { useState, useEffect, useRef } from "react";
import { Calculator } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollReveal } from "./ScrollReveal";

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);

  useEffect(() => {
    const start = ref.current;
    const end = value;
    const duration = 400;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(animate);
      else ref.current = end;
    };
    requestAnimationFrame(animate);
  }, [value]);

  return <>{prefix}{display.toFixed(decimals)}{suffix}</>;
}

export function ROICalculator() {
  const [ordersPerMonth, setOrdersPerMonth] = useState(500);
  const [minutesSaved, setMinutesSaved] = useState(1);
  const [hourlyRate, setHourlyRate] = useState(25);

  const hoursSaved = (ordersPerMonth * minutesSaved) / 60;
  const valueSaved = hoursSaved * hourlyRate;

  return (
    <section className="py-16">
      <div className="container mx-auto px-4 lg:px-8">
        <ScrollReveal>
          <div className="max-w-2xl mx-auto">
            <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-xl font-bold text-foreground">ROI Calculator</h3>
                  <p className="text-sm text-muted-foreground">See how much time and money you could save</p>
                </div>
              </div>

              <div className="space-y-6 mb-8">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium text-foreground">Orders per month</Label>
                    <span className="text-sm font-semibold text-accent">{ordersPerMonth.toLocaleString()}</span>
                  </div>
                  <Slider value={[ordersPerMonth]} onValueChange={([v]) => setOrdersPerMonth(v)} min={10} max={10000} step={10} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>10</span><span>10,000</span></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium text-foreground">Minutes saved per order</Label>
                    <span className="text-sm font-semibold text-accent">{minutesSaved} min</span>
                  </div>
                  <Slider value={[minutesSaved]} onValueChange={([v]) => setMinutesSaved(v)} min={0.5} max={5} step={0.5} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>0.5 min</span><span>5 min</span></div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground mb-2 block">Your hourly rate (€)</Label>
                  <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Math.max(1, parseInt(e.target.value) || 1))} min={1} className="w-full" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-accent/5 rounded-xl p-3 sm:p-4 text-center border border-accent/20">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Hours saved/month</p>
                  <p className="text-2xl sm:text-3xl font-bold text-accent">
                    <AnimatedNumber value={hoursSaved} decimals={1} />
                  </p>
                </div>
                <div className="bg-success/5 rounded-xl p-3 sm:p-4 text-center border border-success/20">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Value saved/month</p>
                  <p className="text-2xl sm:text-3xl font-bold text-success">
                    <AnimatedNumber value={valueSaved} prefix="€" decimals={0} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
