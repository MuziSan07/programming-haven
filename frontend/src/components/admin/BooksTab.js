"use client";

import { useRef, useState } from "react";
import { BookOpen, Eye, EyeOff, ImagePlus, Pencil, Trash, Upload, X } from "lucide-react";
import { API_URL, api, getToken } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageLoader, cx } from "@/components/ui";
import { BookCover, formatSize } from "@/components/books/shared";

const field = "mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand";
const ACCEPT = ".pdf,.epub,application/pdf,application/epub+zip";

/** multipart POST with upload progress (fetch can't report it). */
function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((100 * e.loaded) / e.total)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data?.detail === "string" ? data.detail : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Can't reach the Programming Haven server. Is the backend running?"));
    xhr.send(form);
  });
}

function UploadCard({ maxMb, categories, onUploaded }) {
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  const [form, setForm] = useState({ title: "", author: "", category: "", tags: "", description: "", published: true });
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  function pick(f) {
    setError("");
    if (!f) return;
    if (!/\.(pdf|epub)$/i.test(f.name)) { setError("Choose a .pdf or .epub file"); return; }
    if (f.size > maxMb * 1024 * 1024) { setError(`The file is larger than ${maxMb} MB`); return; }
    setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    Object.entries(form).forEach(([k, v]) => data.append(k, String(v)));
    if (cover) data.append("cover", cover);
    setError("");
    setProgress(0);
    try {
      const book = await upload("/api/admin/books", data, setProgress);
      onUploaded(book);
      setFile(null);
      setCover(null);
      setForm({ title: "", author: "", category: form.category, tags: "", description: "", published: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Upload a book</h2>
      <p className="mt-1 text-xs text-muted">PDF or EPUB, up to {maxMb} MB. Title, author, description and the EPUB cover are read from the file; anything you type here overrides them.</p>
      <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => fileInput.current?.click()}
          className={cx("flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition",
            dragging ? "border-brand bg-brand/[0.06]" : "border-line hover:border-brand/50")}>
          <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <>
              <BookOpen className="size-7 text-brand" />
              <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted">{formatSize(file.size)} · click to change</p>
            </>
          ) : (
            <>
              <Upload className="size-7 text-faint" />
              <p className="text-sm font-medium">Drop a PDF or EPUB here</p>
              <p className="text-xs text-muted">or click to choose a file</p>
            </>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Title <span className="text-faint">(optional)</span>
            <input value={form.title} onChange={set("title")} maxLength={300} className={field} placeholder="Read from the file" />
          </label>
          <label className="text-xs text-muted">Author <span className="text-faint">(optional)</span>
            <input value={form.author} onChange={set("author")} maxLength={200} className={field} placeholder="Read from the file" />
          </label>
          <label className="text-xs text-muted">Category
            <input value={form.category} onChange={set("category")} maxLength={60} list="book-categories" className={field} placeholder="General" />
            <datalist id="book-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="text-xs text-muted">Tags <span className="text-faint">(comma separated)</span>
            <input value={form.tags} onChange={set("tags")} className={field} placeholder="python, interviews" />
          </label>
          <label className="text-xs text-muted sm:col-span-2">Description <span className="text-faint">(optional)</span>
            <textarea value={form.description} onChange={set("description")} rows={3} maxLength={5000} className={field} />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <ImagePlus className="size-4" />
              {cover ? <span className="max-w-48 truncate text-text">{cover.name}</span> : "Custom cover image (optional)"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                onChange={(e) => setCover(e.target.files?.[0] || null)} />
            </label>
            {cover && <button type="button" onClick={() => setCover(null)} className="text-faint hover:text-text"><X className="size-3.5" /></button>}
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={form.published} onChange={set("published")} className="accent-[var(--color-brand)]" />
              Publish to the library now
            </label>
          </div>
          {progress !== null && (
            <div className="sm:col-span-2">
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted">{progress < 100 ? `Uploading ${progress}%` : "Reading the file…"}</p>
            </div>
          )}
          {error && <p className="text-xs text-bad sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!file} loading={progress !== null}><Upload className="size-4" /> Upload book</Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function EditRow({ book, onSaved, onCancel }) {
  const [form, setForm] = useState({ title: book.title, author: book.author, category: book.category,
    tags: book.tags.join(", "), description: book.description });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
      onSaved(await api(`/api/admin/books/${book.id}`, { method: "PUT", body }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function replaceCover(f) {
    if (!f) return;
    const data = new FormData();
    data.append("cover", f);
    setBusy(true);
    setError("");
    try {
      onSaved(await api(`/api/admin/books/${book.id}/cover`, { form: data }), true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 border-t border-line bg-surface-2/40 p-4 sm:grid-cols-2">
      <label className="text-xs text-muted">Title<input value={form.title} onChange={set("title")} className={field} /></label>
      <label className="text-xs text-muted">Author<input value={form.author} onChange={set("author")} className={field} /></label>
      <label className="text-xs text-muted">Category<input value={form.category} onChange={set("category")} className={field} /></label>
      <label className="text-xs text-muted">Tags<input value={form.tags} onChange={set("tags")} className={field} /></label>
      <label className="text-xs text-muted sm:col-span-2">Description
        <textarea value={form.description} onChange={set("description")} rows={3} className={field} />
      </label>
      {error && <p className="text-xs text-bad sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button size="sm" onClick={save} loading={busy}>Save changes</Button>
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-xs font-medium hover:bg-surface-3">
          <ImagePlus className="size-3.5" /> Replace cover
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
            onChange={(e) => replaceCover(e.target.files?.[0])} />
        </label>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function BooksTab() {
  const { data, error, loading, reload, setData } = useApi("/api/admin/books");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [rowError, setRowError] = useState("");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const categories = [...new Set(data.books.map((b) => b.category))].sort();
  const replace = (book) => setData((d) => ({ ...d, books: d.books.map((b) => (b.id === book.id ? book : b)) }));

  async function togglePublish(book) {
    setRowError("");
    try {
      replace(await api(`/api/admin/books/${book.id}`, { method: "PUT", body: { published: !book.published } }));
    } catch (err) {
      setRowError(err.message);
    }
  }

  async function remove(book) {
    setRowError("");
    try {
      await api(`/api/admin/books/${book.id}`, { method: "DELETE" });
      setData((d) => ({ ...d, books: d.books.filter((b) => b.id !== book.id), total_bytes: d.total_bytes - book.size_bytes }));
      setConfirm(null);
    } catch (err) {
      setRowError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <UploadCard maxMb={data.max_mb} categories={categories}
        onUploaded={(book) => setData((d) => ({ ...d, books: [book, ...d.books], total_bytes: d.total_bytes + book.size_bytes }))} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="font-semibold">Library</h2>
          <p className="text-xs text-muted">{data.books.length} book{data.books.length === 1 ? "" : "s"} · {formatSize(data.total_bytes)} stored</p>
        </div>
        {rowError && <p className="border-b border-line px-5 py-3 text-xs text-bad">{rowError}</p>}
        {data.books.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No books yet. Upload the first one above.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.books.map((b) => (
              <li key={b.id}>
                <div className="flex items-center gap-4 px-5 py-3">
                  <BookCover book={b} className="!w-11 shrink-0 !rounded-md !p-1.5 [&_p]:!text-[6px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <p className="truncate text-[11px] text-faint">
                      {b.author || "Unknown author"} · {b.category} · {b.format.toUpperCase()} · {formatSize(b.size_bytes)}
                      {b.pages ? ` · ${b.pages} pages` : ""} · {b.readers} reader{b.readers === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge tone={b.published ? "ok" : "neutral"} className="hidden sm:inline-flex">{b.published ? "Published" : "Hidden"}</Badge>
                  {confirm === b.id ? (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="danger" onClick={() => remove(b)}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button title={b.published ? "Hide from the library" : "Publish"} onClick={() => togglePublish(b)}
                        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text">
                        {b.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                      <button title="Edit details" onClick={() => setEditing(editing === b.id ? null : b.id)}
                        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text"><Pencil className="size-4" /></button>
                      <button title="Delete" onClick={() => setConfirm(b.id)}
                        className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad"><Trash className="size-4" /></button>
                    </div>
                  )}
                </div>
                {editing === b.id && (
                  <EditRow book={b} onCancel={() => setEditing(null)}
                    onSaved={(book, keepOpen) => { replace(book); if (!keepOpen) setEditing(null); }} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
