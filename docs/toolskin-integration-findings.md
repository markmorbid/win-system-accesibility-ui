# Toolskin integration findings

This widget uses a small, offline Toolskin adapter in `web/toolskin-enhance.js`. The original experimental `dist/web/ts-ui-kit.js` remains a reference; the app does not load it. The source of truth for this app is `web/`, and `build.ps1` copies it into `dist/web/`.

## Integration contract

- `ToolskinEnhance.init(root, {onDrag})` enhances `details.ts-ui-accordion`, `select.ts-ui-select`, and `[data-ts-ui-draggable]`. Calling it twice does not duplicate listeners. Added elements initialize through one observer scoped to additions. `destroy()` removes listeners and the observer.
- Native `<details>` provides keyboard and expanded state; `data-ts-accordion-group="modules"` makes the Display and Sound modules exclusive without replacing their markup.
- Native `<select>` remains the source of truth and focusable baseline. On activation, the adapter creates one floating option list under `document.body`, so clipping and stacking inside the scrollable widget cannot hide choices. Selection dispatches the native `change` event once; disabled state, Escape, arrow keys, and Enter work. If JavaScript fails, the native control remains usable. Styling lives in `app.css`, `scale.css`, and semantic tokens in `theme.css`.
- The drag callback sends bounded pointer deltas to the allowlisted native `drag` action. WinForms moves and clamps the actual window; HTML transforms alone cannot move the WebView window.
- Settings persist in `settings.ini`; presets only assign the existing token controls. `layout.json` controls known header and module IDs, not arbitrary handlers or markup.

## Sandbox and validation

`web/sandbox.html` loads the adapter without the Windows host. `--sandbox-test` runs it through the app's WebView2 virtual host and writes `dist/sandbox-test.json`. It checks repeated initialization, native select, exclusive accordion, dynamic content, and standalone drag. `--self-test` checks the integrated widget and writes ignored previews and metrics to `dist/`.

## Findings for a later Toolskin core refactor

- The supplied `ts-ui-kit.js` repeats its global `MutationObserver` definition and rescans the whole document after additions. A shared, scoped registry would avoid redundant work.
- Its public `init()` registers accordion behavior but does not register its select or draggable implementations, despite those functions existing in the same file.
- The accordion enhancement rewrites header content. For an existing native `<details>`, preserving the DOM and attaching behavior is simpler and retains browser keyboard semantics.
- Component contracts should expose `init(root)` and `destroy()` with idempotent binding, explicit selectors, and dynamic-node support. Keep the native control as the progressive baseline where possible.

The `toolskin-rebuild` repository was read as reference only. These findings are a handoff for its later refactor, not a change to that repository.
