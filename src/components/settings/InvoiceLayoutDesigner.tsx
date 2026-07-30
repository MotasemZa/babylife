import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";

export type InvoiceSectionId = "header" | "seller" | "buyer" | "items" | "totals" | "footer";

export type InvoiceLayout = {
  version: number;
  sections: Array<
    | { id: Exclude<InvoiceSectionId, "footer">; enabled: boolean }
    | { id: "footer"; enabled: boolean; showContact?: boolean }
  >;
};

const SECTION_LABELS: Record<InvoiceSectionId, string> = {
  header: "Header",
  seller: "Seller block",
  buyer: "Buyer block",
  items: "Line items",
  totals: "Totals",
  footer: "Footer",
};

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function InvoiceLayoutDesigner({
  value,
  onChange,
}: {
  value: InvoiceLayout | null;
  onChange: (next: InvoiceLayout) => void;
}) {
  const layout: InvoiceLayout =
    value ??
    ({
      version: 1,
      sections: [
        { id: "header", enabled: true },
        { id: "seller", enabled: true },
        { id: "buyer", enabled: true },
        { id: "items", enabled: true },
        { id: "totals", enabled: true },
        { id: "footer", enabled: true, showContact: true },
      ],
    } satisfies InvoiceLayout);

  const sections = layout.sections;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Invoice Designer</CardTitle>
        <CardDescription>
          Reorder and toggle sections. (Styling stays on Modern/Classic/Compact for now.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sections.map((s, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === sections.length - 1;

          return (
            <div
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium truncate">{SECTION_LABELS[s.id]}</div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isFirst}
                    onClick={() => onChange({ ...layout, sections: move(sections, idx, idx - 1) })}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isLast}
                    onClick={() => onChange({ ...layout, sections: move(sections, idx, idx + 1) })}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>

                  <Switch
                    checked={Boolean((s as any).enabled)}
                    onCheckedChange={(checked) => {
                      const nextSections = sections.map((x) =>
                        x.id === s.id ? ({ ...x, enabled: checked } as any) : x
                      );
                      onChange({ ...layout, sections: nextSections as any });
                    }}
                  />
                </div>
              </div>

              {s.id === "footer" && s.enabled && (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-sm">Show contact details at bottom</div>
                  <Switch
                    checked={Boolean((s as any).showContact ?? true)}
                    onCheckedChange={(checked) => {
                      const nextSections = sections.map((x) =>
                        x.id === "footer" ? ({ ...(x as any), showContact: checked } as any) : x
                      );
                      onChange({ ...layout, sections: nextSections as any });
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
