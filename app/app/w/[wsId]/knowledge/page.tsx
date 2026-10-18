"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Button, Card, Field, Input, Textarea, Select, PageHeader, Badge, EmptyState } from "@/components/ui";

interface Source { id: string; type: string; title: string; content: string; status: string; errorMessage: string | null; updatedAt: string }

export default function KnowledgePage({ params }: { params: Promise<{ wsId: string }> }) {
  const [wsId, setWsId] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [type, setType] = useState("faq");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { params.then(p => setWsId(p.wsId)); }, [params]);
  useEffect(() => { load(); }, [wsId]);

  function load() {
    if (wsId) api<{ sources: Source[] }>(`/api/workspaces/${wsId}/knowledge`).then(d => setSources(d.sources)).catch(() => {});
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api(`/api/workspaces/${wsId}/knowledge`, { method: "POST", body: JSON.stringify({ type, title, content }) });
      setTitle(""); setContent(""); load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this knowledge source?")) return;
    await api(`/api/workspaces/${wsId}/knowledge/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <PageHeader title="Knowledge base" subtitle="FAQs, pasted text, and documents ground the agent's answers. URL crawling is not implemented — paste text instead." />
      <Card className="mb-6">
        <form onSubmit={add} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select value={type} onChange={e => setType(e.target.value)}>
                <option value="faq">FAQ (question → answer)</option>
                <option value="text">Pasted text</option>
                <option value="document">Document (paste contents)</option>
                <option value="url">Website URL (not implemented)</option>
              </Select>
            </Field>
            <Field label={type === "faq" ? "Question" : "Title"}><Input required value={title} onChange={e => setTitle(e.target.value)} /></Field>
          </div>
          <Field label={type === "faq" ? "Answer" : type === "url" ? "URL" : "Content"}>
            {type === "url"
              ? <Input value={content} onChange={e => setContent(e.target.value)} placeholder="https://…" />
              : <Textarea rows={4} required={type !== "url"} value={content} onChange={e => setContent(e.target.value)} />}
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div><Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add to knowledge base"}</Button></div>
        </form>
      </Card>

      {sources.length === 0 ? (
        <EmptyState title="Knowledge base is empty" hint="Add FAQs or paste business info so the agent answers from approved content." />
      ) : (
        <div className="space-y-3">
          {sources.map(s => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{s.title}</p>
                    <Badge tone="blue">{s.type}</Badge>
                    <Badge tone={s.status === "ready" ? "green" : s.status === "not-implemented" ? "amber" : "red"}>{s.status}</Badge>
                  </div>
                  {s.errorMessage && <p className="mt-1 text-xs text-amber-700">{s.errorMessage}</p>}
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{s.content.slice(0, 200)}</p>
                </div>
                <Button variant="danger" onClick={() => remove(s.id)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
