# Guest Guide Engine — Architecture Plan

**Phase:** 16C (design foundation complete) → 16D+ (production engine, future)  
**Scope of this document:** Architecture intent only. Nothing here is implemented. No routes, APIs, schema changes, or backend code exist for this feature yet.

---

## 1. Current stage — design foundation only

This folder contains a **static design prototype** — three standalone HTML files with no backend, no auth, and no dynamic content.

| File | Role |
|------|------|
| `oraya-guest-welcome-guide.html` | Digital guide — mobile-first journey rail, screen only |
| `oraya-guest-welcome-guide-print-byblos.html` | A4 print guide — Villa Byblos, 7 pages |
| `oraya-guest-welcome-guide-print-mechmech.html` | A4 print guide — Villa Mechmech, 7 pages |

**What the prototype establishes:**
- Visual design, content layout, and page structure for both digital and print modes
- WYSIWYG A4 print architecture: browser view = print preview, identical `mm`/`pt` units at base level
- Content inventory: all confirmed operational text, placeholder policy, image labeling system
- Review mechanism: browser File → Print → Save as PDF (prototype review only — not production delivery)

**What the prototype does not contain:**
- No real PINs, tokens, booking references, or guest data
- No API routes, database queries, or server logic
- No PDF generation tooling
- No auth or admin UI

---

## 2. Future guest workflow

The eventual guest experience, once the engine is built:

```
1. Booking confirmed (status: confirmed in admin)
         ↓
2. Oraya sends guest a link (WhatsApp or email)
   → URL: /booking/view/[token]/guide
   → Token: short-lived signed JWT, scoped to this booking only
         ↓
3. Guest opens link on phone
   → Page hydrates from booking row:
       • guest_name
       • villa (byblos | mechmech)
       • check_in_date, check_out_date
       • booking_ref
       • (PIN delivered separately via Phase 16D secure channel)
         ↓
4. Guest sees the digital guide (journey rail, mobile-first)
   → Can also download the PDF version of the in-villa print guide
         ↓
5. Guest arrives — physical print guide is inside the villa
   → Same content as the PDF, pre-printed and left by Oraya
```

**Key point:** The digital guide and the in-villa print guide are the same content in two formats. The digital guide is the guest's phone companion; the print guide is the villa's physical reference.

---

## 3. Future admin workflow

```
1. Admin opens booking → /admin/bookings/[id]
         ↓
2. Admin clicks "Guest Guide" tab or button
   → Route: /admin/bookings/[id]/guide
   → Shows preview of this guest's guide with their data filled in
         ↓
3. Admin actions available:
   → Preview (rendered in browser)
   → Download PDF (triggers server-side generation)
   → Send to guest (WhatsApp or email, with signed guide URL)
         ↓
4. PDF stored per booking
   → Supabase Storage or equivalent
   → Signed URL with expiry (never a permanent public path)
```

---

## 4. Future PDF strategy

### Browser print is NOT the production delivery mechanism

The browser File → Print → Save as PDF path is the **review fallback** used during prototype review. It is not appropriate for production because:
- It depends on the reviewer's browser and OS print settings
- It cannot inject personalized data (guest name, dates, booking ref)
- It cannot generate QR codes dynamically
- The output is not programmatically storable or sendable

### Recommended: server-side headless PDF generation

| Item | Approach |
|------|----------|
| **Engine** | Puppeteer (headless Chromium) or equivalent |
| **Source** | `oraya-guest-welcome-guide-print-byblos.html` / `...-mechmech.html` — the design source files in this folder, or their production-adapted equivalents |
| **Data injection** | Guest name, stay dates, booking reference, QR codes — injected at generation time via template variables or DOM manipulation |
| **Output** | A4 PDF, 7 pages, identical to what the design prototype shows on screen |
| **Storage** | Per-booking, signed URL, expires after stay checkout |
| **Trigger** | On-demand via admin action, or auto-triggered on booking confirmation |

### Print settings (for browser review fallback)
Paper: A4 · Scale: Default 100% · Margins: None · Background graphics: On · Headers/Footers: Off

---

## 5. Security boundaries

| Item | Rule |
|------|------|
| **Real PINs** | Never appear in the prototype or in any static file. Delivered to guest via Phase 16D secure channel only. |
| **Real tokens** | Not present in prototype. In production: short-lived JWT, server-generated, scoped to one booking. |
| **Guest route** | `/booking/view/[token]/guide` — token is verified server-side. No data served without valid token. |
| **Admin route** | `/admin/bookings/[id]/guide` — existing Oraya admin auth. Server-side only. |
| **PDF URL** | Signed URL with expiry. Never a permanent public path. |
| **Service role key** | Used server-side only in `lib/supabase-admin.ts` and API routes — never in client components. |
| **Phase 16D boundary** | PIN delivery logic is entirely outside this scope. This guide references only `[Gate PIN — provided before arrival]` as a placeholder. |

---

## 6. Future route candidates

**Document only. Do not implement any of these routes as part of Phase 16C.**

| Route | Purpose | Notes |
|-------|---------|-------|
| `/booking/view/[token]/guide` | Guest-facing digital guide | Signed token, server-side validation, hydrated from booking row. Guest-readable only — no write access. |
| `/admin/bookings/[id]/guide` | Admin preview of guest guide | Admin auth required. Shows preview with booking data filled. Actions: preview, download PDF, send to guest. |
| `/api/bookings/[id]/guest-guide/pdf` | Server-side PDF generation endpoint | POST → generates PDF for booking `[id]` → stores in Supabase Storage → returns signed URL. Admin auth only. |

---

## 7. Design source files for PDF generation

When server-side PDF generation is implemented, these files are the design source:

| Villa | Design source | Pages |
|-------|--------------|-------|
| Byblos | `oraya-guest-welcome-guide-print-byblos.html` + `oraya-print-a4.css` | 7 |
| Mechmech | `oraya-guest-welcome-guide-print-mechmech.html` + `oraya-print-a4.css` | 7 |

**Page structure (both villas):**
1. Welcome
2. Arrival & Access
3. Utilities
4. Using the Villa
5. House Expectations
6. Checkout
7. Emergency

The production version of these files would replace static placeholder strings with template variables. No structural or visual changes are expected — the design is frozen.

---

*Document created: 2026-06-07. Phase 16C design foundation complete.*  
*Next phase: 16D — PIN delivery + guest access. PDF engine: 16E or later.*
