import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRow, createSignedStorageUrl, DataRow, listRows, updateRow, uploadStorageFile } from "./lib/supabase-data";

const categories = ["General", "Policy", "Finance", "Human Resources", "Compliance", "Training", "Reference"];

const emptyValues = { title: "", author: "", reference: "", category: "General", description: "", content_mode: "text" as "text" | "file", content_text: "", status: "draft" };

export function BookLibraryPage({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [books, setBooks] = useState<DataRow[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<DataRow | null | undefined>(undefined);

  const load = useCallback(async () => {
    setError("");
    try {
      const rows = await listRows(accessToken, "library_books", "*", 500);
      setBooks(rows);
      const withCovers = rows.filter((row) => row.cover_path);
      const entries = await Promise.all(withCovers.map(async (row) => {
        try { return [String(row.id), await createSignedStorageUrl(accessToken, "library-books", String(row.cover_path))] as const; }
        catch { return [String(row.id), ""] as const; }
      }));
      setCovers(Object.fromEntries(entries.filter(([, url]) => url)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The book library could not be loaded.");
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => books.filter((row) =>
    (status === "all" || String(row.status) === status) &&
    (!query || [row.title, row.author, row.reference, row.category].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))
  ), [books, query, status]);

  async function setBookStatus(row: DataRow, next: string) {
    setBusy(String(row.id));
    setError(""); setNotice("");
    try {
      await updateRow(accessToken, "library_books", String(row.id), { status: next });
      await load();
      setNotice(`"${String(row.title)}" ${next === "archived" ? "archived" : next === "published" ? "published" : "moved to draft"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The book could not be updated.");
    } finally {
      setBusy("");
    }
  }

  async function openContent(row: DataRow) {
    setError("");
    if (row.content_path) {
      try {
        window.open(await createSignedStorageUrl(accessToken, "library-books", String(row.content_path), 600), "_blank");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The book content could not be opened.");
      }
      return;
    }
    const popup = window.open("", "_blank", "width=760,height=880");
    popup?.document.write(`<!doctype html><html><head><title>${escapeHtml(String(row.title))}</title><style>body{font:15px Arial;color:#0b1426;padding:40px;line-height:1.7;white-space:pre-wrap}h1{font-size:24px;margin:0 0 6px}p.byline{color:#64748b;margin:0 0 28px}</style></head><body><h1>${escapeHtml(String(row.title))}</h1><p class="byline">${escapeHtml(String(row.author ?? ""))}${row.reference ? ` · ${escapeHtml(String(row.reference))}` : ""}</p>${escapeHtml(String(row.content_text ?? "No content has been added yet."))}</body></html>`);
    popup?.document.close();
  }

  return <section>
    <header className="page-header">
      <div><span className="eyebrow">Organization administration</span><h1>Book Library</h1><p className="muted">Archive policy manuals, finance handbooks, training guides and reference material — catalogued with a title, author, reference and cover, just like a bookshop.</p></div>
      <button type="button" className="primary" onClick={() => setEditing(null)}>Add book</button>
    </header>

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <article className="card data-panel">
      <div className="filter-toolbar">
        <input id="library-search" name="library_search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, author, reference or category..." />
        <select id="library-status" name="library_status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </div>

      {visible.length ? <div className="template-grid book-grid">{visible.map((row) => <article key={String(row.id)}>
        <div className="book-cover">{covers[String(row.id)] ? <img src={covers[String(row.id)]} alt="" /> : <span>{String(row.title).slice(0, 1).toUpperCase()}</span>}</div>
        <span>{String(row.category)}</span>
        <h3>{String(row.title)}</h3>
        <p>{[row.author, row.reference].filter(Boolean).join(" · ") || "No author or reference on file"}</p>
        <span className={`status-pill ${String(row.status)}`}>{String(row.status)}</span>
        <div className="row-actions">
          <button type="button" onClick={() => void openContent(row)}>Read</button>
          <button type="button" onClick={() => setEditing(row)}>Edit</button>
          {row.status === "archived"
            ? <button type="button" disabled={busy === String(row.id)} onClick={() => void setBookStatus(row, "draft")}>Restore</button>
            : <button type="button" className="danger" disabled={busy === String(row.id)} onClick={() => void setBookStatus(row, "archived")}>Archive</button>}
        </div>
      </article>)}</div> : <div className="empty-state"><h3>No books yet</h3><p>Add the first title to start the library.</p></div>}
    </article>

    {editing !== undefined && <BookDialog
      book={editing}
      accessToken={accessToken}
      organisationId={organisationId}
      onClose={() => setEditing(undefined)}
      onSaved={async () => { setEditing(undefined); await load(); setNotice("Book saved to the library."); }}
    />}
  </section>;
}

function BookDialog({ book, accessToken, organisationId, onClose, onSaved }: {
  book: DataRow | null;
  accessToken: string;
  organisationId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState(() => book ? {
    title: String(book.title ?? ""), author: String(book.author ?? ""), reference: String(book.reference ?? ""),
    category: String(book.category ?? "General"), description: String(book.description ?? ""),
    content_mode: (book.content_path ? "file" : "text") as "text" | "file",
    content_text: String(book.content_text ?? ""), status: String(book.status ?? "draft"),
  } : emptyValues);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const stamp = Date.now();
      const payload: DataRow = {
        organisation_id: organisationId,
        title: values.title,
        author: values.author || null,
        reference: values.reference || null,
        category: values.category,
        description: values.description || null,
        status: values.status,
      };

      if (coverFile) {
        const path = `${organisationId}/covers/${stamp}-${coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        await uploadStorageFile(accessToken, "library-books", path, coverFile);
        payload.cover_path = path;
      }

      if (values.content_mode === "file") {
        if (contentFile) {
          const path = `${organisationId}/content/${stamp}-${contentFile.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
          await uploadStorageFile(accessToken, "library-books", path, contentFile);
          payload.content_path = path;
          payload.content_mime = contentFile.type || null;
          payload.content_text = null;
        }
      } else {
        payload.content_text = values.content_text || null;
        payload.content_path = null;
        payload.content_mime = null;
      }

      if (book?.id) await updateRow(accessToken, "library_books", String(book.id), payload);
      else await createRow(accessToken, "library_books", payload);

      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The book could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="book-dialog-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
      <span className="eyebrow">Book Library</span>
      <h2 id="book-dialog-title">{book ? "Edit book" : "Add book"}</h2>
      <form className="record-form" onSubmit={submit}>
        <label>Title *<input required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label>
        <label>Author<input value={values.author} onChange={(event) => setValues({ ...values, author: event.target.value })} placeholder="Author or issuing department" /></label>
        <label>Reference<input value={values.reference} onChange={(event) => setValues({ ...values, reference: event.target.value })} placeholder="ISBN, citation or source" /></label>
        <label>Category *<select required value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })}>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label className="wide">Description<textarea value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="Short summary shown in the catalog" /></label>

        <label className="wide">Content
          <div className="segmented" role="tablist" aria-label="Content type">
            <button type="button" className={values.content_mode === "text" ? "active" : ""} onClick={() => setValues({ ...values, content_mode: "text" })}>Pasted text</button>
            <button type="button" className={values.content_mode === "file" ? "active" : ""} onClick={() => setValues({ ...values, content_mode: "file" })}>Upload file</button>
          </div>
        </label>
        {values.content_mode === "text"
          ? <label className="wide">Book text<textarea className="template-editor" value={values.content_text} onChange={(event) => setValues({ ...values, content_text: event.target.value })} placeholder="Paste or write the full content here" /></label>
          : <label className="wide">Content file (Word, PDF or image){book?.content_path && !contentFile && <small className="table-subline">A file is already on record; choose a new one to replace it.</small>}<input type="file" accept=".doc,.docx,.pdf,.txt,image/jpeg,image/png,image/webp" onChange={(event) => setContentFile(event.target.files?.[0] ?? null)} /></label>}

        <label className="wide">Cover image{book?.cover_path && !coverFile && <small className="table-subline">A cover is already on record; choose a new one to replace it.</small>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></label>

        <label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save book"}</button></div>
      </form>
    </section>
  </div>;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character)); }
