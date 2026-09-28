import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";

const REASONS = [
  { value: "misleading", label: "Misleading listing or description" },
  { value: "prohibited", label: "Prohibited product (stolen accounts, malware, etc.)" },
  { value: "fraud", label: "Suspected fraud or scam" },
  { value: "ip", label: "Copyright / intellectual property violation" },
  { value: "other", label: "Something else" },
];

/**
 * Report flow for products and sellers — part of the trust & safety layer.
 * In production this posts to a moderated reports queue.
 */
export function ReportDialog({
  what,
  children,
}: {
  what: string;
  children: React.ReactNode;
}) {
  const [reason, setReason] = useState<string>();
  const [details, setDetails] = useState("");
  const [open, setOpen] = useState(false);

  const submit = () => {
    setOpen(false);
    toast.success("Report submitted", {
      description: "Our trust & safety team will review it shortly.",
    });
    setReason(undefined);
    setDetails("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl text-muted-foreground"
        >
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent className="clay border-border/70 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report {what}</DialogTitle>
          <DialogDescription>
            Reports are reviewed by our trust &amp; safety team, usually within
            24 hours. Your report is confidential.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={setReason} className="gap-2.5">
          {REASONS.map((r) => (
            <Label
              key={r.value}
              htmlFor={`reason-${r.value}`}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/60 p-3.5 text-sm font-normal transition-colors hover:bg-accent/40 has-[button[data-state=checked]]:border-primary/60 has-[button[data-state=checked]]:bg-primary/10"
            >
              <RadioGroupItem id={`reason-${r.value}`} value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>

        <div className="grid gap-2">
          <Label htmlFor="report-details" className="text-xs text-muted-foreground">
            Additional details (optional)
          </Label>
          <Textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Share anything that helps our review…"
            className="clay-inset min-h-20 rounded-2xl border-border/60"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="clay"
            className="rounded-xl"
            disabled={!reason}
            onClick={submit}
          >
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
