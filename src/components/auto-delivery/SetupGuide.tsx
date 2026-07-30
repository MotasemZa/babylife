import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Link as LinkIcon,
  Package,
  Key,
  Mail,
  Power,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  ListChecks,
  PartyPopper,
  Bell,
} from "lucide-react";
import { useSetupProgress } from "@/hooks/useSetupProgress";

interface SetupGuideProps {
  onEnableAutoDelivery: () => void;
  autoDeliveryEnabled: boolean;
  isToggling: boolean;
  onOpenCreateDialog: () => void;
  onScrollToProducts: () => void;
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  isComplete: boolean;
  optional?: boolean;
  action?: React.ReactNode;
}

export function SetupGuide({
  onEnableAutoDelivery,
  autoDeliveryEnabled,
  isToggling,
  onOpenCreateDialog,
  onScrollToProducts,
}: SetupGuideProps) {
  const {
    platformConnected,
    listingsSynced,
    inventoryCreated,
    keysAdded,
    listingsLinked,
    smtpConfigured,
    telegramConfigured,
    completedCount: hookCompletedCount,
    totalSteps,
    isLoading,
  } = useSetupProgress();

  // Use the passed autoDeliveryEnabled for real-time UI updates
  const steps: SetupStep[] = [
    {
      id: "connect",
      title: "Connect a Platform",
      description: platformConnected
        ? "eBay or Shopify connected"
        : "Link your eBay or Shopify store",
      icon: LinkIcon,
      isComplete: platformConnected,
      action: !platformConnected && (
        <Button size="sm" asChild>
          <Link to="/app/imports">
            Connect <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      ),
    },
    {
      id: "sync",
      title: "Sync Listings",
      description: listingsSynced
        ? "Listings synced"
        : "Fetch your product listings from the connected platform",
      icon: RefreshCw,
      isComplete: listingsSynced,
      action: !listingsSynced && platformConnected && (
        <Button size="sm" asChild>
          <Link to="/app/listings">
            Sync Listings <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      ),
    },
    {
      id: "inventory",
      title: "Create Inventory Item",
      description: inventoryCreated
        ? "Products created"
        : "Add a product to your inventory",
      icon: Package,
      isComplete: inventoryCreated,
      action: !inventoryCreated && (
        <Button size="sm" onClick={onOpenCreateDialog}>
          Add Product <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
    {
      id: "keys",
      title: "Add Digital Keys",
      description: keysAdded
        ? "Keys available"
        : "Upload keys for your products",
      icon: Key,
      isComplete: keysAdded,
      action: !keysAdded && inventoryCreated && (
        <Button size="sm" onClick={onScrollToProducts}>
          Add Keys <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
    {
      id: "link",
      title: "Link Listings to Products",
      description: listingsLinked
        ? "Listings linked"
        : "Connect platform listings to inventory items",
      icon: ListChecks,
      isComplete: listingsLinked,
      action: !listingsLinked && inventoryCreated && listingsSynced && (
        <Button size="sm" onClick={onScrollToProducts}>
          Link Listings <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
    {
      id: "smtp",
      title: "Configure Email",
      description: smtpConfigured
        ? "SMTP verified"
        : "Set up SMTP for delivery emails",
      icon: Mail,
      isComplete: smtpConfigured,
      action: !smtpConfigured && (
        <Button size="sm" asChild>
          <Link to="/app/settings">
            Set up SMTP <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      ),
    },
    {
      id: "enable",
      title: "Enable Auto-Delivery",
      description: autoDeliveryEnabled
        ? "Auto-Delivery is active"
        : "Turn on the global auto-delivery toggle",
      icon: Power,
      isComplete: autoDeliveryEnabled,
      action: !autoDeliveryEnabled && (
        <Button size="sm" onClick={onEnableAutoDelivery} disabled={isToggling}>
          Enable <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
    {
      id: "telegram",
      title: "Set Up Notifications",
      description: telegramConfigured
        ? "Telegram connected"
        : "Get alerts for deliveries (optional)",
      icon: Bell,
      isComplete: telegramConfigured,
      optional: true,
      action: !telegramConfigured && (
        <Button size="sm" variant="outline" asChild>
          <Link to="/app/settings?tab=notifications">
            Configure <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  // Required steps only (exclude optional) for progress calculation
  const requiredSteps = steps.filter((s) => !s.optional);
  const completedCount = requiredSteps.filter((s) => s.isComplete).length;
  const progress = (completedCount / requiredSteps.length) * 100;
  const allComplete = requiredSteps.every((s) => s.isComplete);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-pulse">Loading setup status...</div>
        </CardContent>
      </Card>
    );
  }

  if (allComplete) {
    return (
      <Card className="border-success/50 bg-success/5">
        <CardContent className="py-8 text-center">
          <PartyPopper className="h-12 w-12 mx-auto text-success mb-4" />
          <h3 className="text-xl font-semibold mb-2">You're all set!</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your auto-delivery system is fully configured. When customers purchase your products, 
            they'll automatically receive their digital keys via email.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Setup Guide
            </CardTitle>
            <CardDescription>
              Complete these steps to start automating your digital product delivery
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-sm">
            {completedCount} of {requiredSteps.length} complete
          </Badge>
        </div>
        <Progress value={progress} className="h-2 mt-4" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const stepNumber = step.optional ? null : steps.filter((s, i) => !s.optional && i <= steps.indexOf(step)).length;
            
            return (
              <div
                key={step.id}
                className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
                  step.isComplete
                    ? "bg-success/5 border border-success/20"
                    : step.optional
                    ? "bg-muted/30 border border-dashed border-muted-foreground/20"
                    : "bg-muted/50 border border-transparent"
                }`}
              >
                {/* Step number / check */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    step.isComplete
                      ? "bg-success text-success-foreground"
                      : step.optional
                      ? "bg-muted-foreground/10 text-muted-foreground"
                      : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {step.isComplete ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : step.optional ? (
                    "+"
                  ) : (
                    stepNumber
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <step.icon className={`h-4 w-4 ${step.isComplete ? "text-success" : "text-muted-foreground"}`} />
                    <h4 className={`font-medium ${step.isComplete ? "text-success" : ""}`}>
                      {step.title}
                    </h4>
                    {step.optional && (
                      <Badge variant="outline" className="text-xs">
                        Optional
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {step.description}
                  </p>
                </div>

                {/* Action */}
                {step.action && <div className="shrink-0">{step.action}</div>}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
