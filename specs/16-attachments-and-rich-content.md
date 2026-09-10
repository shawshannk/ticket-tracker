# 16 — Attachments & Rich Text

Both were flagged out of scope in the README. They are grouped because the editor is where users
expect to paste an image, and an editor without upload is the more annoying half-feature.

## 1. Object storage

S3-compatible, via `@aws-sdk/client-s3`. Compose gains **MinIO** so local development needs no cloud
account; the only difference in production is the endpoint and credentials.

```ts
export const attachments = pgTable('attachments', {
  id: uuid(…).primaryKey().defaultRandom(),
  projectId: uuid(…).notNull(),            // for quota accounting and scope checks
  ticketId: uuid(…).references(() => tickets.id),
  commentId: uuid(…).references(() => comments.id),
  uploadedBy: uuid(…).notNull().references(() => users.id),
  filename: text(…).notNull(),             // the user's name, never used as a storage key
  storageKey: text(…).notNull().unique(),  // uuid-based; no user input in the path
  contentType: text(…).notNull(),
  sizeBytes: bigint(…).notNull(),
  checksumSha256: text(…).notNull(),
  scanStatus: text(…).notNull().default('pending'), // pending | clean | infected | skipped
  createdAt: timestamp(…).notNull().defaultNow(),
});
```

## 2. Upload flow

Presigned direct-to-storage, so file bytes never pass through the API (spec 11 §5 caps JSON bodies at
1 MB and that limit stays):

1. `POST /tickets/:id/attachments/presign` `{ filename, contentType, sizeBytes }` → validates
   permission, extension and size against `ATTACHMENT_MAX_BYTES` (default 25 MB), reserves a row in
   `pending` state, returns a presigned PUT valid for 5 minutes.
2. Client PUTs to storage.
3. `POST /tickets/:id/attachments/:attachmentId/complete` → the server HEADs the object to confirm it
   exists and matches the declared size, then marks it visible and writes an `attachment_added` event.

A row never completed is swept by a job after 24 hours, along with any orphan object.

**Security rules, all mandatory:**
- The declared `contentType` is not trusted — sniff magic bytes server-side on completion and store
  the sniffed type.
- Downloads are served through `GET /attachments/:id/download`, which checks project scope and then
  302s to a short-lived presigned GET. A permanent public URL is never issued; the bucket is private.
- Downloads always set `Content-Disposition: attachment` and a `Content-Security-Policy: sandbox`
  header. HTML and SVG are stored but never rendered inline — an SVG rendered inline is a stored XSS
  against the very CSP M21 put in place.
- A virus-scan job (ClamAV when `ATTACHMENT_SCAN=true`, otherwise `skipped`) gates first download;
  `infected` blocks download and notifies the uploader.
- Per-project quota `ATTACHMENT_PROJECT_QUOTA_BYTES`, checked at presign.

Thumbnails for images are generated in a job (sharp) and stored beside the original.

## 3. Rich text

`description` and comment `body` become **Markdown**, stored as source, rendered client-side.

- Editor: TipTap in markdown mode — headings, bold/italic, lists, task lists, links, code and fenced
  code blocks with highlighting, tables, block quotes, images (via §2), and the `@` mention plugin
  from spec 14 §4.
- Rendering is sanitised with a strict allowlist. Raw HTML in markdown is **not** rendered. The
  existing CSP stays; no inline styles, no `javascript:` hrefs, external images proxied or blocked by
  the CSP's `img-src`.
- Paste of an image uploads it and inserts the reference. Paste of rich HTML converts to markdown.
- Both API and web sanitise. The server sanitises on write for storage hygiene and because the email
  templates (spec 13) render the same content outside the browser's CSP.

### Migration

Existing plain text is valid markdown, with one exception: characters that markdown would interpret
(`*`, `_`, `#`, backticks) in existing rows. The migration escapes them so no existing description
renders differently after the change, and adds `descriptionFormat text default 'markdown'` for rows
written after the cutover.

## 4. Frontend

- Attachment strip on ticket detail: thumbnails, drag-and-drop zone, per-file progress, delete
  (uploader, or admin/manager).
- The dirty-state logic in spec 05 must treat the editor's content correctly — an editor that
  normalises whitespace on load can otherwise mark a pristine ticket dirty the moment it opens, which
  is exactly the false-positive spec 05 was written to avoid.

## Out of scope

Inline commenting on an attachment, image annotation, document preview for PDFs/Office files, and
versioned re-upload of the same file.

## Acceptance criteria

- Presign rejects an oversize file, a disallowed extension, and a non-member.
- An upload whose real magic bytes disagree with its declared content type is stored with the sniffed
  type and, if executable/HTML, is refused inline rendering.
- `GET /attachments/:id/download` is 403 for a non-member of the owning project.
- A never-completed upload row and its object are both gone after the sweep job.
- Every existing seeded description renders byte-identically after the markdown migration.
- A comment containing `<script>` and `<img onerror=…>` renders inert in the web app and in the
  email template.
