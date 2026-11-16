"use client";
import * as React from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Field({ label, hint, error, className, children, htmlFor }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(function NativeSelect({ className, ...p }, ref) {
  return <select ref={ref} className={cn("h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>option]:bg-background", className)} {...p} />;
});

/** Chip/tag editor: Enter or comma adds; Backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const next = [...value];
    for (const i of items) if (!next.some((v) => v.toLowerCase() === i.toLowerCase())) next.push(i);
    onChange(next); setDraft("");
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input p-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1 pr-1">
          {t}
          <button type="button" aria-label={`Remove ${t}`} className="rounded-sm p-0.5 hover:bg-foreground/10" onClick={() => onChange(value.filter((v) => v !== t))}><X className="size-3" /></button>
        </Badge>
      ))}
      <input
        id={id} value={draft} placeholder={value.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(draft)}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function ToggleChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-muted")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SaveButton({ saving, dirty = true, children = "Save changes" }: { saving: boolean; dirty?: boolean; children?: React.ReactNode }) {
  return <Button type="submit" disabled={saving || !dirty}>{saving && <Loader2 className="animate-spin" />}{children}</Button>;
}

export function TabSkeleton() {
  return <div className="space-y-4"><Skeleton className="h-6 w-48" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1"><p className="font-medium">Something went wrong</p><p className="text-muted-foreground">{message}</p></div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export const WORK_MODE_OPTIONS = [{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "On-site" }] as const;
export const JOB_TYPE_OPTIONS = [{ value: "full_time", label: "Full-time" }, { value: "internship", label: "Internship" }, { value: "contract", label: "Contract" }, { value: "part_time", label: "Part-time" }] as const;
