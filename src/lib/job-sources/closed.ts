import { htmlToText } from "./normalize";

export type Availability = "available" | "expired" | "unknown";

export const CLOSED_PHRASES = /(no longer (?:available|accepting|open)|(?:job|position|posting|role|vacancy) (?:has been|is|was) (?:filled|closed|removed|expired)|this (?:job|position|posting|listing) (?:has )?expired|job (?:is )?(?:no longer|not) (?:active|available)|applications? (?:are|is) (?:now )?closed|we are no longer hiring|page not found|couldn'?t find (?:that|this) (?:job|position))/i;

/** Pure classification of a fetched page. */
export function classifyPage(status: number, body: string): { status: Availability; reason: string } {
  if (status === 404 || status === 410) return { status: "expired", reason: `Page returned HTTP ${status}` };
  if (status >= 200 && status < 300) {
    const m = CLOSED_PHRASES.exec(htmlToText(body).slice(0, 20000));
    if (m) return { status: "expired", reason: `Page says: "${m[0]}"` };
    return { status: "available", reason: "Page loads and shows no closed-listing notice" };
  }
  return { status: "unknown", reason: `Site answered HTTP ${status}; cannot tell` };
}

