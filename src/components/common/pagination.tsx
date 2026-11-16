"use client";
import { Button } from "@/components/ui/button";
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>{total === 0 ? "No results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="self-center">Page {page} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
