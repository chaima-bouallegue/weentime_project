# FE-AI-06 — Chatbot panel positioning fix report

## 1. MCP tools used

- **filesystem**: read `chat-widget.component.{ts,html,scss}`,
  `shell.component.ts`, `shell-footer.component.ts`, and `auth.guard.ts`
  to map how the chat widget is mounted, where the footer sits, and how
  authentication gates the shell routes.
- **playwright**: launched a real Chromium session against the running
  `ng serve` on `http://localhost:4200`, logged in with the seeded admin
  credentials (`admin@weentime.com` / `Admin123@`), opened/closed the chat
  widget on the Admin dashboard, ran `getBoundingClientRect()` /
  `getComputedStyle()` assertions through `browser_evaluate`, and resized
  the viewport between 1366×768, 1024×768, and 390×844 to verify the
  panel never clipped the footer or the floating toggle.
- **context7**: not needed — the fix is plain CSS layout and did not
  require external Angular/CDK API documentation.

## 2. Root cause

The host element (`app-chat-widget`) was set to `width: 0; height: 0`,
the inner `.chat-widget` was also `width: 0; height: 0`, and the panel
shell was `position: absolute` inside that zero-sized container with
`bottom: 86px`. Three knock-on problems:

- The panel was anchored to a zero-sized container that was itself
  pinned to `inset: auto 24px 24px auto`, so the panel rendered at
  bottom-right of the viewport with **86 px** of clearance — too small
  to clear both the 68 px floating toggle (24 px from the bottom) and
  the 52 px shell footer. The bottom edge of the panel overlapped the
  toggle and the "Tous les services actifs" status badge in the footer.
- The floating toggle stayed at bottom-right when the panel was open,
  visually competing with the close button rendered inside the panel
  header.
- Because the host was `position: fixed` with `pointer-events: none` but
  also `0 × 0`, it occasionally created a tiny invisible interaction
  trap depending on the page behind it.

## 3. Files changed

| File | Change |
|---|---|
| `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.scss` | Rewrote host/widget/shell/panel/toggle positioning, added clearance variables, hid the floating toggle while the panel is open, replaced the mobile media query with full-width responsive sizing. |
| `weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.html` | Bound the new `chat-toggle--hidden` class on the floating button when `isOpen()` is true, made it `aria-hidden`/non-tabbable in that state, and froze its icon to `message-square` (the close action lives in the panel header now). |

No TypeScript, no business logic, no AI-service, and no role behaviour
were touched.

## 4. CSS positioning fix

Key new variables on `:host` so each piece reuses the same clearance:

```scss
--chat-bottom-safe: calc(52px + 24px + env(safe-area-inset-bottom, 0px));
--chat-toggle-offset: 24px;
--chat-toggle-size: 68px;
--chat-panel-bottom: calc(var(--chat-bottom-safe) + var(--chat-toggle-size) + 12px);
--chat-panel-side-offset: 24px;
```

Layout:

- `:host` is `display: contents` — no layout box, just a token holder
  that cascades the role-specific colours and clearance variables to
  every descendant. This avoids creating a stacking context that could
  trap the fixed children.
- `.chat-widget` is `position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none;` — the viewport-sized layer that lets the
  page behind stay clickable everywhere except on the toggle and the
  open panel.
- `.chat-panel-shell` is now `position: fixed; right: 24px;
  bottom: var(--chat-panel-bottom);` (≈ 156 px on desktop), anchored
  directly to the viewport instead of an empty parent. Width is
  `min(420px, calc(100vw - 2 * --chat-panel-side-offset))`.
- `.chat-panel` is `display: flex; flex-direction: column; height:
  min(720px, calc(100vh - --chat-panel-bottom - 24px));` and its
  `.chat-panel__messages` child is `flex: 1 1 auto; min-height: 0;
  overflow-y: auto;` so the message list scrolls inside the panel and
  the composer never gets pushed out of the viewport.
- `.chat-toggle` is `position: fixed; right: 24px;
  bottom: var(--chat-bottom-safe);` (76 px) and gets the new
  `chat-toggle--hidden` modifier (opacity 0, visibility hidden,
  pointer-events none) while the panel is open, so the close affordance
  in the panel header is the only one visible.

## 5. Responsive behaviour

`@media (max-width: 720px)` overrides the variables only:

```scss
--chat-toggle-offset: 16px;
--chat-toggle-size: 60px;
--chat-panel-side-offset: 12px;
--chat-bottom-safe: calc(52px + 16px + env(safe-area-inset-bottom, 0px));
--chat-panel-bottom: calc(var(--chat-bottom-safe) + var(--chat-toggle-size) + 8px);
```

The shell takes the available width with 12 px left/right safe margins
(`width: calc(100vw - 24px)`) and the panel height is
`calc(100vh - --chat-panel-bottom - 16px)`, so the composer always sits
inside the panel above the footer regardless of the OS soft-keyboard
inset.

## 6. Overlay pointer-events behaviour

- `.chat-widget` is the viewport-sized layer; it stays
  `pointer-events: none` so clicks pass through the empty area to the
  page behind.
- `.chat-toggle` and `.chat-panel` opt back in with
  `pointer-events: auto`, plus an extra rule on
  `.chat-panel-shell--open` so the drag handle around the panel is
  reachable too.
- When the panel is open, `.chat-toggle--hidden` re-disables
  pointer-events on the floating button so it never intercepts clicks
  meant for the panel content sitting just above it.

Verified in the browser: when the panel is closed, `elementFromPoint(200, 300)`
returns the dashboard's `<a class="bento-nav-item">` link, not the chat
widget — so the page behind is fully clickable.

## 7. Playwright validation summary

Live measurements pulled with `getBoundingClientRect()` on the running
admin dashboard:

| Viewport | Panel rect (top, right, bottom, left) | Panel size | Toggle (when open) | Footer top | Gap panel-bottom → footer-top |
|---|---|---|---|---|---|
| 1366×768 | (24, 1342, 612, 922) | 420×588 | hidden (opacity 0, visibility hidden) | 716 | 104 px |
| 1024×768 | (24, 1000, 612, 580) | 420×588 | hidden | 716 | 104 px |
| 390×844 | (16, 378, 708, 12) | 366×692 | hidden | 792 | 84 px |

Other checks:

- Close action: `app-chat-widget .chat-panel__icon[aria-label="Fermer le chat"]` is reachable from inside the panel header (`panel.contains(closeBtn) === true`). After clicking, `.chat-panel--open` is removed and the floating toggle returns to (1274, 624) with `visibility: visible` / `opacity: 1`.
- Internal scroll: `.chat-panel__messages` has positive height and is not collapsed; `.chat-panel__composer` is laid out below it inside the panel (composer `bottom` always equals panel `bottom` minus padding).
- Role parity: cycling `data-role` between `admin`, `rh`, `manager`, `employee` keeps the panel rect identical (366×692 at the mobile viewport in this run); only the gradient/border colours change. The same component covers all four AI agents.
- Click-through: `elementFromPoint(200, 300)` returns the dashboard navigation link when the widget is closed, confirming the viewport-sized overlay does not block the rest of the UI.

Screenshots were captured to `weentime-frontend/angular-weentime/.playwright-mcp/`
during the session (e.g. `fe-ai-06-admin-open-1366.png`); the directory is git-ignored
(per the existing `test-results/` exclusion pattern in `.gitignore`).

## 8. Build / typecheck results

```text
$ npx tsc --noEmit -p tsconfig.app.json
(clean — no output)

$ npm run build
... Output location: .../dist/angular-weentime
(only the existing CommonJS-bailout warnings about sockjs-client; no
errors and no new warnings)
```

## 9. Remaining limitations

- The shell footer height is hard-coded as 52 px in the
  `--chat-bottom-safe` calculation. If `app-shell-footer` ever changes
  height the variable must follow; a future refactor could expose the
  footer height as a CSS custom property on `app-shell` itself and let
  the chat widget inherit it.
- The panel still uses `cdkDrag` so a user can drag it to a custom
  position; if they drag it down, no clamping logic is in place to
  prevent them from re-introducing the overlap with the footer. Dragging
  is opt-in (only enabled when the panel is open) and the default
  position is correct.
- Mobile breakpoint stays at 720 px, which matches the original. Smaller
  desktop windows (< 720 px tall) are uncommon but will compress the
  panel via the `min(720px, calc(100vh - …))` cap.
- Visual screenshots were captured to the Playwright MCP session
  workspace, which is git-ignored on this repo, so the report records
  geometric assertions as evidence rather than image artefacts.

## 10. Files staged

```text
M weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.html
M weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.scss
A FE_AI_06_CHATBOT_POSITION_FIX_REPORT.md
```

## 11. Commit hash

To be filled in after the commit is created (see git log below).
