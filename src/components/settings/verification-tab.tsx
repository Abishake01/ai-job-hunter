"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/utils/fetcher";
import { Field, NativeSelect, SaveButton, TabSkeleton, ErrorBlock } from "./form-bits";

type Status = { provider: "none" | "hunter" | "zerobounce"; hunter: { configured: boolean }; zerobounce: { configured: boolean } };
const schema = z.object({ provider: z.enum(["none", "hunter", "zerobounce"]), apiKey: z.string().trim().refine((v) => v === "" || v.length >= 6, "Key looks too short") });
type Form = z.infer<typeof schema>;

export function VerificationTab() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, watch, formState: { errors, isDirty, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { provider: "none", apiKey: "" } });
  const load = React.useCallback(async () => {
    setError(null);
    try { const s = await api<Status>("/api/integrations/email-verification"); setStatus(s); reset({ provider: s.provider, apiKey: "" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
  }, [reset]);
  React.useEffect(() => { load(); }, [load]);

  const submit = handleSubmit(async (f) => {
    try {
      const s = await api<Status>("/api/integrations/email-verification", { method: "PUT", json: { provider: f.provider, ...(f.apiKey ? { apiKey: f.apiKey } : {}) } });
      setStatus(s); reset({ provider: s.provider, apiKey: "" }); toast.success("Email verification settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  });
  async function remove(p: "hunter" | "zerobounce") {
    try { setStatus(await api<Status>(`/api/integrations/email-verification?provider=${p}`, { method: "DELETE" })); toast.success("Key removed"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove"); }
  }

  if (error) return <ErrorBlock message={error} onRetry={load} />;
  if (!status) return <TabSkeleton />;
  const provider = watch("provider");
  const hasKey = provider !== "none" && status[provider].configured;

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader><CardTitle>Email verification</CardTitle>
          <CardDescription>A contact email is marked <strong>verified</strong> only when Hunter or ZeroBounce reports it deliverable. Without a provider, emails stay Public (found on a page), Inferred (a labelled pattern guess) or Unknown.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider" htmlFor="provider"><NativeSelect id="provider" {...register("provider")}><option value="none">None</option><option value="hunter">Hunter</option><option value="zerobounce">ZeroBounce</option></NativeSelect></Field>
          <div className="flex items-end gap-2 pb-1">
            <Badge variant={status.hunter.configured ? "secondary" : "outline"}>Hunter key: {status.hunter.configured ? "saved" : "none"}</Badge>
            <Badge variant={status.zerobounce.configured ? "secondary" : "outline"}>ZeroBounce key: {status.zerobounce.configured ? "saved" : "none"}</Badge>
          </div>
          {provider !== "none" && (
            <Field label="API key" htmlFor="apiKey" className="sm:col-span-2" error={errors.apiKey?.message} hint={hasKey ? "A key is saved; enter a new one to replace it." : "Stored encrypted; never shown again."}>
              <Input id="apiKey" type="password" autoComplete="off" placeholder={hasKey ? "••••••••••••" : "Paste API key"} {...register("apiKey")} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SaveButton saving={isSubmitting} dirty={isDirty} />
            {provider !== "none" && hasKey && <Button type="button" variant="ghost" onClick={() => remove(provider)}><Trash2 /> Remove {provider} key</Button>}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
