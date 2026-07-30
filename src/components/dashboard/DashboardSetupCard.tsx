import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSetupProgress } from "@/hooks/useSetupProgress";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSetupCard() {
  const {
    completedCount,
    totalSteps,
    progress,
    allComplete,
    nextIncompleteStep,
    isLoading,
  } = useSetupProgress();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (allComplete) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                <Sparkles className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-success">
                  Auto-Delivery is fully configured!
                </p>
                <p className="text-sm text-muted-foreground">
                  Orders will be fulfilled automatically
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/auto-delivery">
                View Dashboard <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium">Setup Progress</p>
              <span className="text-sm text-muted-foreground">
                {completedCount} of {totalSteps} complete
              </span>
            </div>
            <Progress value={progress} className="h-2 mb-2" />
            {nextIncompleteStep && (
              <p className="text-sm text-muted-foreground truncate">
                <span className="font-medium">Next:</span> {nextIncompleteStep}
              </p>
            )}
          </div>
          <Button size="sm" asChild>
            <Link to="/app/auto-delivery">
              Continue <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
