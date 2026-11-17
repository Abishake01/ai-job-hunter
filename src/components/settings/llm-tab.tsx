"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/utils/fetcher";
import { Field, NativeSelect, SaveButton, TabSkeleton, ErrorBlock } from "./form-bits";

type Status = { configured: boolean; source: "saved" | "env" | null; provider: "openai" | "groq" | "anthropic" | "openai_compatible"; model: string; baseUrl: string | null };
const DEFAULT_MODEL = { openai: "gpt-4o-mini", groq: "llama-3.3-70b-versatile", anthropic: "claude-sonnet-4-5", openai_compatible: "" } as const;

const schema = z.object({
  provider: z.enum(["openai", "groq", "anthropic", "openai_compatible"]),
  model: z.string().trim().min(1, "Model is required").max(120),
  baseUrl: z.string().trim().refine((v) => v === "" || /^https?:\/\//.test(v), "Must be an http(s) URL"),
  apiKey: z.string().trim().refine((v) => v === "" || v.length >= 8, "Key looks too short"),
}).refine((v) => v.provider !== "openai_compatible" || v.baseUrl !== "", { message: "Base URL is required for OpenAI-compatible providers", path: ["baseUrl"] });
type Form = z.infer<typeof schema>;

const modelHint = (m: string) => (/model_not_found|does not exist or you do not have access/i.test(m) ? "That model isn't available to your key. Click “Load models”, pick one from the list, then Save and Test again." : m);

export function LlmTab() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { provider: "openai", model: "", baseUrl: "", apiKey: "" } });

  const load = React.useCallback(async () => {
    setError(null);
    try { const s = await api<Status>("/api/integrations/llm"); setStatus(s); reset({ provider: s.provider, model: s.model, baseUrl: s.baseUrl ?? "", apiKey: "" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
  }, [reset]);
  React.useEffect(() => { load(); }, [load]);

  const submit = handleSubmit(async (f) => {
    try {
      const s = await api<Status>("/api/integrations/llm", { method: "PUT", json: { provider: f.provider, model: f.model, baseUrl: f.baseUrl || null, ...(f.apiKey ? { apiKey: f.apiKey } : {}) } });
      setStatus(s); reset({ provider: s.provider, model: s.model, baseUrl: s.baseUrl ?? "", apiKey: "" });
      toast.success(f.apiKey ? "API key saved (encrypted)" : "AI settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  });

  const [models, setModels] = React.useState<string[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  async function loadModels() {
    setLoadingModels(true);
    try {
      const r = await api<{ models: string[] }>("/api/integrations/llm/models");
      setModels(r.models);
      toast.success(r.models.length ? `${r.models.length} models available — click the Model box to choose one` : "No chat models returned for this key");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not load models"); } finally { setLoadingModels(false); }
  }

  async function test() {
    setTesting(true);
    try {
      // If a new key is typed but not saved yet, save it first so the test uses what you see.
      if (watch("apiKey")) await submit();
      const r = await api<{ ok: boolean; model?: string; error?: string }>("/api/integrations/llm", { method: "POST" });
      r.ok ? toast.success(`Connection works (${r.model})`) : toast.error(modelHint(r.error ?? "Test failed"));
    } catch (e) { toast.error(modelHint(e instanceof Error ? e.message : "Test failed")); } finally { setTesting(false); }
  }
  async function removeKey() {
    try { setStatus(await api<Status>("/api/integrations/llm", { method: "DELETE" })); toast.success("Saved key removed"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove"); }
  }

  if (error) return <ErrorBlock message={error} onRetry={load} />;
  if (!status) return <TabSkeleton />;
  const provider = watch("provider");

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>AI provider</CardTitle>
            {status.configured
              ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" /> Configured ({status.source === "saved" ? "saved key" : "server environment key"})</Badge>
              : <Badge variant="outline">Not configured: using rules-based fallbacks</Badge>}
          </div>
          <CardDescription>Powers match explanations, resume analysis, email drafts and the assistant. Without a key every feature still works using clearly labelled deterministic fallbacks.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider" htmlFor="provider">
            <NativeSelect id="provider" {...register("provider", { onChange: (e) => { const p = e.target.value as keyof typeof DEFAULT_MODEL; if (DEFAULT_MODEL[p]) setValue("model", DEFAULT_MODEL[p], { shouldDirty: true }); } })}>
              <option value="openai">OpenAI</option><option value="groq">Groq (free tier)</option><option value="anthropic">Anthropic</option><option value="openai_compatible">OpenAI-compatible (custom base URL)</option>
            </NativeSelect>
          </Field>
          <Field label="Model" htmlFor="model" error={errors.model?.message} hint="Not sure which model your key can use? Save the key, then click Load models.">
            <div className="flex gap-2">
              <Input id="model" list="llm-models" autoComplete="off" {...register("model")} />
              <Button type="button" variant="outline" onClick={loadModels} disabled={loadingModels || status.source === null}>{loadingModels ? <Loader2 className="size-4 animate-spin" /> : null}Load models</Button>
            </div>
            <datalist id="llm-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          {(provider === "openai_compatible" || provider === "openai" || provider === "anthropic" || provider === "groq") && (
            <Field label={`Base URL${provider === "openai_compatible" ? "" : " (optional)"}`} htmlFor="baseUrl" className="sm:col-span-2" error={errors.baseUrl?.message} hint="Leave empty for the provider's default endpoint.">
              <Input id="baseUrl" placeholder="https://api.example.com/v1" {...register("baseUrl")} />
            </Field>
          )}
          <Field label="API key" htmlFor="apiKey" className="sm:col-span-2" error={errors.apiKey?.message}
            hint={provider === "groq" ? "Free key from console.groq.com/keys (starts with gsk_). Stored encrypted; never shown again." : status.source === "saved" ? "A key is saved. Enter a new one to replace it. Keys are encrypted at rest and never shown again." : "Stored encrypted (AES-256-GCM); never sent back to the browser."}>
            <div className="relative"><KeyRound className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input id="apiKey" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" className="pl-8" placeholder={status.source === "saved" ? "••••••••••••••••" : "sk-…"} {...register("apiKey")} /></div>
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SaveButton saving={isSubmitting} dirty={isDirty}>Save</SaveButton>
            <Button type="button" variant="outline" onClick={test} disabled={testing || !status.configured}>{testing ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Test connection</Button>
            {status.source === "saved" && <Button type="button" variant="ghost" onClick={removeKey}><Trash2 /> Remove saved key</Button>}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
