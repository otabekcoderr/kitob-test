# Kitobchi design contract

## Design Direction
Kitobchi oddiy SaaS ko‘rinishidan “O‘zbek raqamli kutubxonasi” ko‘rinishiga o‘tadi. Interfeys sokin, adabiy va tahririyat uslubida: iliq qog‘oz fonlari, chuqur siyoh-yashil matn, nazoratli oxra aksenti va kuchli tipografik ierarxiya. Ortiqcha gradient, glassmorphism, soyalar va emoji olib tashlanadi. Asosiy urg‘u kitob tanlash, bilimni tekshirish va natijani tushunishga beriladi.

## Reference Sources
- `vendor/open-design/adapter/STATIC_POLICY.md`
- `vendor/open-design/upstream/design-systems/Gestura-Quiet-Atelier/DESIGN.md`
- `vendor/open-design/upstream/design-systems/Gestura-Quiet-Atelier/tokens.css`
- `vendor/open-design/upstream/design-systems/Gestura-Quiet-Atelier/components.manifest.json`
- `vendor/open-design/upstream/craft/anti-ai-slop.md`
- `vendor/open-design/upstream/craft/typography-hierarchy-editorial.md`
- `vendor/open-design/upstream/craft/accessibility-baseline.md`

## Design Tokens
### Light
- Paper: `#F8F4EA`
- Surface: `#FFFDF8`
- Paper alternate: `#EFE8D9`
- Ink: `#17362D`
- Muted ink: `#65706B`
- Ochre: `#B76E16`
- Divider: `#D8D0C1`
- Success: `#2D6A4F`
- Error: `#A33B20`

### Dark
- Paper: `#111714`
- Surface: `#17201C`
- Paper alternate: `#202A25`
- Ink: `#F2EBDD`
- Muted ink: `#AAB4AE`
- Ochre: `#E1A64D`
- Divider: `#34413A`

### Typography
- Display: `Georgia, "Times New Roman", serif`
- Body: `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`
- Body copy measure: `65ch`
- H1: `clamp(2.4rem, 6vw, 5.2rem)`
- H2: `clamp(1.7rem, 3vw, 2.7rem)`
- Labels: `0.75rem`, uppercase, tracked

### Shape and spacing
- Buttons and cards: 2–10px restrained radius
- Page margins: `clamp(1rem, 5vw, 4rem)`
- Section gaps: `clamp(3rem, 8vw, 6rem)`
- Shadows used only for floating overlays; normal content uses dividers.

## Page Structure
1. Home: editorial hero, daily challenge, personal progress, continue/recent activity, featured books, compact leaderboard.
2. Books: search, meaningful filters (genre/difficulty), result count, editorial cover grid.
3. Book detail: cover, serif title, author/year/genre/difficulty, favorite control, question count, clear test CTA.
4. Quiz: distraction-free question surface, visible progress/timer, answer choices, immediate explanation panel.
5. Result: score, correct/incorrect counts, learning-oriented feedback, retry/next book, history.
6. Leaderboard: clean podium summary and divider-based table.
7. Profile: identity, progress, achievements preview, history, settings.
8. Admin: role-gated dense curation interface.

## Component Plan
- `data-component="nav-header"`: text-first sticky navigation and online/offline status.
- `data-component="daily-challenge"`: deterministic daily book challenge.
- `data-component="book-card"`: cover, author, title, difficulty and favorite control.
- `data-component="progress-bar"`: ink track and ochre fill.
- `data-component="quiz-option"`: bordered answer row.
- `data-component="explanation-panel"`: immediate explanation after answer.
- `data-component="offline-indicator"`: network/sync status.
- `data-component="achievement-preview"`: earned and upcoming milestones.

## Copy Tone
Professional, encouraging and culturally resonant. Short labels, clear verbs and no hype. Examples: “Bugungi sinov”, “Bilimingizni mustahkamlang”, “Javob izohi”, “Natija qurilmada saqlandi”. Generic English labels and excessive emoji are forbidden.

## Responsive Rules
- 360px+: one column, 16–20px gutters, full-width primary actions.
- 768px+: two-column book grid and compact toolbar.
- 1024px+: editorial split layouts with 60/40 proportions.
- Desktop maximum content width: 1180px.
- Tables become horizontally scrollable; no clipped controls.
- Reduced-motion users receive no transform animations.

## Implementation Notes
- Preserve existing hash routing and ES modules.
- Remove all Google Font imports and use system fonts.
- Favorites and recent activity are local-first using `localStorage`.
- Daily challenge is date-deterministic from the current book list.
- Online/offline status listens to browser network events and clearly labels locally saved results.
- Admin link and page render only when the trusted profile role is `admin`; database RLS remains the real authorization layer.
- Quiz displays each question’s explanation before advancing.
- Correct data encoding and factual quiz issues discovered in audit.
- Keep existing project images only; no new arbitrary external image URLs.

## Image Manifest
- Existing book cover URLs from project data/Supabase: dynamic book cover usage.
- CSS-generated typographic placeholders: books without reliable covers.
- Existing user avatar URLs: profile and leaderboard only.
- No new stock or AI-generated images.

## Risks / Open Questions
- Remote Supabase policies must be applied separately before cloud authorization can be considered production-ready.
- Some external cover URLs may fail or return unrelated images; the unified CSS placeholder prevents broken layouts.
- The full question bank requires editorial fact-checking over time; this pass corrects confirmed high-impact errors and structural duplicates.
