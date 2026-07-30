import { X, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DemoVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoVideoModal({ open, onOpenChange }: DemoVideoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-lg font-semibold">
            INBEW Demo - 60 seconds
          </DialogTitle>
        </DialogHeader>

        {/* Video placeholder */}
        <div className="relative aspect-video bg-muted m-4 mt-2 rounded-lg overflow-hidden">
          {/* Placeholder content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center mb-4 hover:bg-accent/20 transition-colors cursor-pointer">
              <Play className="h-10 w-10 text-accent ml-1" />
            </div>
            <p className="text-muted-foreground text-sm">
              Video placeholder - Replace with actual demo video
            </p>
          </div>

          {/* Captions overlay placeholder */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-background/90 backdrop-blur-sm rounded-lg p-3 text-center">
              <p className="text-sm text-foreground">
                [Captions will appear here]
              </p>
            </div>
          </div>
        </div>

        {/* Close hint */}
        <div className="p-4 pt-0 text-center">
          <p className="text-xs text-muted-foreground">
            Press ESC or click outside to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
