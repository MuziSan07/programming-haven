"use client";

import Link from "next/link";
import { useState } from "react";
import { Library, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Button, Card, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";
import { BookCover } from "@/components/books/shared";

function BookTile({ book }) {
  const pct = book.progress?.percent || 0;
  return (
    <Link href={`/books/${book.id}`} className="group block">
      <div className="transition group-hover:-translate-y-0.5">
        <BookCover book={book} className="shadow-lg shadow-black/30 group-hover:border-brand/50" />
      </div>
      {pct > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 line-clamp-2 text-sm leading-snug font-medium group-hover:text-brand">{book.title}</p>
      <p className="mt-0.5 truncate text-[11px] text-faint">
        {book.author || "Unknown author"}{pct > 0 ? ` · ${Math.round(pct)}%` : ""}
      </p>
    </Link>
  );
}

export default function BooksPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const { data, error, loading, reload } = useApi("/api/books");

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const q = search.trim().toLowerCase();
  const filtering = Boolean(q || category);
  const books = data.books.filter((b) => (!category || b.category === category)
    && (!q || [b.title, b.author, b.description, ...b.tags].some((t) => t?.toLowerCase().includes(q))));
  const empty = !data.books.length;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Library" title="Books for the job hunt"
        description="Read interview, system design and language books right here. Your place is saved on every device you sign in on." />

      {empty ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Library className="size-10 text-faint" />
          <h2 className="font-semibold">The library is empty</h2>
          <p className="max-w-sm text-sm text-muted">Books will appear here as soon as they are added.</p>
          {user?.is_admin && <Button href="/admin" size="sm" variant="secondary">Upload books in the admin console</Button>}
        </Card>
      ) : (
        <>
          {data.continue.length > 0 && !filtering && (
            <section className="mb-10">
              <h2 className="mb-4 text-sm font-semibold text-muted">Continue reading</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {data.continue.map((b) => <BookTile key={b.id} book={b} />)}
              </div>
            </section>
          )}

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1 sm:max-w-xs">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, author or topic"
                className="h-10 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-sm outline-none focus:border-brand" />
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[{ name: "", count: null }, ...data.categories].map((c) => (
                <button key={c.name || "all"} onClick={() => setCategory(c.name)}
                  className={cx("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    category === c.name ? "border-brand bg-brand/15 text-text" : "border-line text-muted hover:text-text")}>
                  {c.name || "All"}{c.count !== null && <span className="ml-1 text-faint">{c.count}</span>}
                </button>
              ))}
            </div>
          </div>

          {books.length ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {books.map((b) => <BookTile key={b.id} book={b} />)}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-muted">No books match that search.</p>
          )}
        </>
      )}
    </div>
  );
}
