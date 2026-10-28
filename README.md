# System controls

A compact Windows 10 display and sound widget. Hover at the configured screen edge to reveal its tab, click to open, or press `Ctrl+Alt+Space`. The tray icon can also open the panel or exit.

The tray app prepares the WebView2 panel once in the background and keeps it available while running. This uses some memory in exchange for fast repeated openings. The reveal delay itself is configurable in Widget settings (150–1500 ms).

## Build and run

From this folder, run `powershell -ExecutionPolicy Bypass -File .\build.ps1`, then launch `dist\SystemAccessibilityUi.exe`. The build uses the Windows .NET Framework compiler and downloads a pinned WebView2 SDK package on the first build. The machine also needs the WebView2 Runtime. Building does not launch the widget or change system settings.

## Controls

- **Display:** See the active monitor, choose a supported scale or resolution, and apply it directly. A change reverts automatically after 15 seconds unless kept. If the Windows scale interface is unavailable, the panel offers a direct Display settings link.
- **Sound:** Change master output volume and mute. Select an active output or input device when the Windows switching interface is available. The app checks Windows readback and restores prior defaults on failure. Expand **Detected audio devices** to see active, unplugged, disabled, and absent endpoints. Windows Sound remains available as a fallback.
- **Settings:** Choose the launcher edge and monitor, hover delay, widget scale (60–130%), base text and spacing, panel, button, inner, and select radius, accent color, presets, visible modules, always-on-top mode, and Windows startup. These are saved in `%APPDATA%\SystemAccessibilityUi\settings.ini`.

Windows text size was removed because this widget cannot change it directly. Widget scale adjusts this panel only, including text, spacing, controls, and width.

## Customize the design

Use **Widget settings** for live preview of common values. For manual design work, edit [`web/theme.css`](web/theme.css), then rebuild and reopen the widget. It is loaded after the local Toolskin token subset and widget styles. No Toolskin preloader or full framework is needed. Saved settings override the corresponding base token values in `theme.css`.

| Value | What it changes | Current value |
| --- | --- | --- |
| `--widget-panel-radius-base` | Outer widget corners before widget scaling | `14px` |
| `--widget-button-radius-base` | Buttons, including the header icons, before widget scaling | `8px` |
| `--widget-inner-radius-base` | Cards, device rows, checkboxes, and menu options before widget scaling | `4px` |
| `--widget-select-radius-base` | Select controls and their option menus before widget scaling | `6px` |
| `--widget-panel-border` | Outer widget outline | `var(--ts-border-2)` |
| `--ts-bg-body`, `--ts-bg-0` to `--ts-bg-4` | Surfaces from darkest to lightest | Dark grays |
| `--ts-border-1` to `--ts-border-3` | Divider and control border colors | Dark grays |
| `--ts-accent-h`, `--ts-accent-s`, `--ts-accent-l` | Orange accent, as HSL components | `18`, `100%`, `52%` |
| `--ts-fs-base` | Base widget font size before scaling | `15px` |
| `--ts-sp-base` | Base spacing unit before scaling | `4px` |
| `--ts-font-scale` | Font multiplier; follows widget scale by default | `var(--ui-scale)` |
| `--ts-sp-density` | Spacing multiplier; follows widget scale by default | `var(--ui-scale)` |

All four radii use base tokens multiplied by `--ui-scale`; adjust them in Widget settings or `web/theme.css`. Edit `web/app.css` only when changing layout or individual component rules. The header settings icon is a gear in `web/index.html`; the Windows tray icon comes from `assets/system-controls.ico` and can be regenerated with `powershell -ExecutionPolicy Bypass -File .\tools\make-icon.ps1`.

The scale engine is in [`web/scale.css`](web/scale.css). `:root` defines inherited parent tokens (`--ts-sp-unit`, `--ts-sp-1` through `--ts-sp-6`, and font sizes). Component selectors such as `:where(.app-shell) .app-header` define local `--ts-this-*` values from those parents. There is no `:root *` token initialization. `:where(:root):is(button)` would match no button, because an element cannot be both the root and a button. Use `:root` for inherited values and `:where(.app-shell) :is(button, select)` only for actual component rules. To make spacing denser without shrinking text, set `--ts-sp-density` in `theme.css` to a smaller number than `--ts-font-scale`.

For header content and order, edit [`web/layout.json`](web/layout.json): change `header.title` and `header.subtitle`; reorder or omit `brand`, `heading`, and `actions` in `header.items`; reorder or omit `settings` and `close` in `header.actions`. `modules` changes the order of Display and Sound; the in-app settings still control whether each module is visible. `showRefresh` and `showShortcut` hide those small controls. Keep the names exactly as shown in the file. This configuration is loaded when the panel opens; close and reopen the panel to preview changes. New working controls still need markup, a trusted native handler, and event wiring.

To apply a source change, exit the running app from its tray menu, run the build command above, and launch `dist\SystemAccessibilityUi.exe`. For a quick visual preview, edit `dist\web\theme.css` or `dist\web\layout.json` and close/reopen the panel; copy the final values back to the source files before rebuilding.

## Adding controls

The current display and sound controls are wired through `web/index.html`, `web/app.js`, `WebWidget.cs`, and the core backends. They are modular in structure but are not loaded from JSON at runtime. `web/toolskin-enhance.js` adds reusable behavior to native controls by class or attribute, with an isolated `web/sandbox.html` test page. See [`docs/extensions.md`](docs/extensions.md) and [`docs/toolskin-integration-findings.md`](docs/toolskin-integration-findings.md) for extension conventions and later Toolskin core work.

## Architecture

`Core.cs` owns the control contracts, validation, display rollback, and readback. `Audio.cs`, `Display.cs`, and `Scale.cs` call Windows APIs. Direct scale uses private Windows 10 DisplayConfig request types, so it is capability checked at runtime and can stop working after an OS update. `WebWidget.cs` hosts the local WebView2 panel and maps its typed messages to the core. `web/` contains the UI: small Toolskin token subset, widget-specific CSS, and behavior. The full Toolskin CSS/JS bundle and its preloader are not included. The panel loads only local files and blocks remote navigation.

Only `box-sizing` is applied with a universal `*` selector; Toolskin tokens are defined on `:root` and inherited. The volume slider updates its appearance immediately and limits native writes while dragging. `--self-test` records panel initialization, snapshot, same-value volume write, and style-read timing in `dist\selftest.json` for diagnosing delays on this machine.

Run `powershell -ExecutionPolicy Bypass -File .\tests\run.ps1` for core checks. Run `dist\SystemAccessibilityUi.exe --self-test` for the panel DOM and interaction smoke test; its result is `dist\selftest.json` or `dist\selftest-error.txt`. The smoke test writes back the current volume and mute state, without changing their values. It reads supported scale values but does not apply a different scale or resolution.

Run `dist\SystemAccessibilityUi.exe --sandbox-test` to check the Toolskin behavior layer independently, then `dist\SystemAccessibilityUi.exe --edge-test` to exercise launcher reveal and hide on both sides with an injected test pointer. Neither test moves the real pointer or applies a system setting. The private Windows audio switching interface is only exercised when a person selects another device; the automated checks do not alter audio defaults.
