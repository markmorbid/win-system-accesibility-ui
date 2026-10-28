# Task coverage (Google Tasks PDF backup)

The one-page `dist/web/Google Calendar - Tasks.pdf` was checked against the current app. Source files under `web/` and the C# host are the implementation; `dist/web/ts-ui-kit.js` is a reference copy and is not loaded by the widget.

| Requested behavior | Implementation and check |
| --- | --- |
| Exclusive Display/Sound accordion | Native `details.ts-ui-accordion` with `data-ts-accordion-group` in `web/index.html`; `web/toolskin-enhance.js` closes siblings. Sandbox and panel tests cover expansion and height. |
| Toolskin select enhancement | Native selects keep their value and `change` contract. `web/toolskin-enhance.js` displays one body-level option menu above clipped panels, with pointer and keyboard use, idempotent initialization, dynamic nodes, refresh, and destroy. Sandbox and panel tests cover visibility and selection. |
| Avoid extra Windows scale confirmation | `Scale.cs` applies a supported value directly through DisplayConfig and reads it back. The app retains its own 15-second Keep/Revert confirmation to prevent an unusable display. |
| Toolskin tokens and design parameters | `web/theme.css` holds inherited color, spacing, font, and radius tokens. `web/scale.css` scopes component calculations without `:root *`. Settings preview/persist the common base values and accent swatches. |
| Clear settings navigation | The header gear has active/hover states; either it or Back returns to controls. `web/layout.json` controls header items and module order. |
| Reveal and move | `EdgeLauncher.cs` supplies configurable left/right dwell, monitor selection, and a narrow launcher; `web/toolskin-enhance.js` delegates header drag to the bounded native host. Edge and panel tests cover these paths. |
| Useful sound controls | `Audio.cs` supplies master volume, mute, active/default endpoints and inventory. The UI offers direct device selectors when the backend is available and a Sound settings action as fallback. Tests verify readback and failure handling. This machine currently has one active output and no active microphone, so switching between two real devices cannot be exercised here. |
| Toolskin core refactor | Deliberately deferred per the task brief: complete and validate this integration first. Findings are recorded in `docs/toolskin-integration-findings.md`; the separate `toolskin-rebuild` repository is untouched. |

Run `tests/run.ps1`, `dist/SystemAccessibilityUi.exe --sandbox-test`, `--self-test`, and `--edge-test` after building. The integrated self-test captures `dist/select-preview.png` and records menu stacking, viewport bounds, scale-row alignment, icon fill, and radii in `dist/selftest.json`. It does not choose a different Windows resolution or scale.
