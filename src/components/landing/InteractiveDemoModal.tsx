import { useState } from "react";
import { X, ArrowRight, ArrowLeft, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface InteractiveDemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const demoSteps = [
  {
    id: 1,
    title: "Order Received",
    description: "A new order just came in from your store.",
    visual: "order",
  },
  {
    id: 2,
    title: "Product Retrieved",
    description: "INBEW pulls an available item from your vault.",
    visual: "key",
  },
  {
    id: 3,
    title: "Delivered to Buyer",
    description: "The product is sent to the buyer via email instantly.",
    visual: "delivery",
  },
  {
    id: 4,
    title: "Invoice Sent",
    description: "A branded invoice PDF is generated and sent.",
    visual: "invoice",
  },
  {
    id: 5,
    title: "Logged for Audit",
    description: "Every action is recorded with timestamps.",
    visual: "log",
  },
];

export function InteractiveDemoModal({
  open,
  onOpenChange,
}: InteractiveDemoModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < demoSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
  };

  const isComplete = currentStep === demoSteps.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Interactive Demo
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {demoSteps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                index <= currentStep ? "bg-accent" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px] flex flex-col items-center justify-center text-center p-6">
          {/* Step visual */}
          <div
            className={cn(
              "mb-6 h-24 w-24 rounded-2xl flex items-center justify-center transition-all duration-500",
              currentStep === 0 && "bg-success/10",
              currentStep === 1 && "bg-accent/10",
              currentStep === 2 && "bg-primary/10",
              currentStep === 3 && "bg-warning/10",
              currentStep === 4 && "bg-muted"
            )}
          >
            {currentStep === 0 && (
              <svg
                className="h-12 w-12 text-success animate-bounce"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            {currentStep === 1 && (
              <svg
                className="h-12 w-12 text-accent animate-pulse"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            )}
            {currentStep === 2 && (
              <svg
                className="h-12 w-12 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            )}
            {currentStep === 3 && (
              <svg
                className="h-12 w-12 text-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
            {currentStep === 4 && (
              <svg
                className="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            )}
          </div>

          {/* Step number */}
          <div className="text-sm text-muted-foreground mb-2">
            Step {currentStep + 1} of {demoSteps.length}
          </div>

          {/* Step title */}
          <h3 className="text-2xl font-bold text-foreground mb-2">
            {demoSteps[currentStep].title}
          </h3>

          {/* Step description */}
          <p className="text-muted-foreground max-w-md">
            {demoSteps[currentStep].description}
          </p>

          {/* Completed state */}
          {isComplete && (
            <div className="mt-6 flex items-center gap-2 text-success">
              <Check className="h-5 w-5" />
              <span className="font-medium">Fulfillment complete!</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {isComplete ? (
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Restart demo
              </Button>
            ) : (
              <Button onClick={handleNext} className="gap-2">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
