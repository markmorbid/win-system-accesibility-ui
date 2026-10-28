# System Accessibility UI — design proposal

Date: 2026-10-19
Status: approved 2026-10-20

## Intent

Create a small Windows 10 Pro 22H2 utility that removes repeated trips through Settings for common display and audio changes. It stays hidden during ordinary work and opens as a Toolskin-styled panel from a configurable screen edge. The primary user is the owner of the supplied Windows workstation; the design should still work for keyboard and assistive-technology users.

## Goals

- Read current system values and make common changes from one panel: display resolution, display scale where validated, Windows text size where validated, master output volume, and default input/output device selection. A clearly labeled direct Windows action is acceptable when a live change cannot be verified on this build.
- Make the launcher unobtrusive: edge hover exposes a narrow tab after a configurable delay; click opens the panel.
- Let the user choose the edge, monitor, hover delay, shortcut, visible modules, and startup behavior in a configuration view.
- Use Toolskin's existing tokens, fonts, controls, panel and accordion patterns, with a small app-specific stylesheet. The hospital Observatorio project demonstrates the intended base-plus-custom-layer integration.
- Keep all application UI resources local after installation. Do not depend on the Toolskin website at run time.
- Never silently leave the display in a hard-to-use state after a mode change.

## Non-goals and anti-goals

- No changes to the existing Toolskin, Observatorio, or other repositories.
- No account, cloud sync, telemetry, or remote control.
- No invented font-family setting for Windows as a whole. “Font settings” initially means Windows text size; the panel may separately expose its own font size and contrast for accessibility.
- Do not present a toggle as working if this Windows build cannot apply and verify its state.
- No broad copies of unrelated Toolskin pages, global selectors, or remote CDN dependencies solely for visual similarity.

## Main interaction

1. The configured monitor edge has a small, normally invisible activation region.
2. Pointer dwell for a configurable delay reveals a slim, labeled toggle tab. Leaving the edge hides it after a grace period.
3. Clicking the tab opens a side panel aligned to that edge. The panel stays open while the pointer moves into it. A close button, Escape, or a second shortcut closes it.
4. A global keyboard shortcut and tray-menu command also open the panel, so hover is never the only path.
5. The panel has a wrapper, a header with title and close/config buttons, then a scrollable content wrapper. Inside are grouped modules using rows for paired controls and blocks for full-width controls. Toolskin accordions may collapse each module.
6. The configuration view uses checkboxes for module visibility and app behavior, plus controls for edge, monitor, reveal delay, shortcut, launch at sign-in, and whether the panel stays above ordinary windows. OS-wide quick toggles are deferred from the first release.

## Panel map

```text
Hidden edge -> delayed labeled tab -> side panel

System controls                         Configure  Close
-------------------------------------------------------
Display [monitor selector]                         ▾
  Scale [available percentages]  Resolution [modes]
  Apply feedback / keep-or-revert countdown
Text                                                ▾
  Windows text size [slider or supported presets]
  Panel text size [local accessibility preference]
Sound                                               ▾
  Master volume [slider + numeric value + mute]
  Output [device dropdown]  Input [device dropdown]
-------------------------------------------------------
Status / error message                 Configure modules
```

The current values are fetched when the panel opens and refreshed after changes or device notifications. Unavailable devices are shown as unavailable, not retained as active selections. The panel must not steal focus on a passive hover; focus moves inside only when the user opens it.

## Visual direction

Use Toolskin's dark neutral surfaces, orange accent, Space Grotesk body/display type, JetBrains Mono for compact labels, radius and spacing tokens, outlined selectors, and compact but generous hit targets. Use actual Toolskin component class names and JavaScript enhancement where practical, then limit overrides to this app's root to avoid styling outside the panel. The app has a visible focus ring, logical tab order, text labels in addition to icons, scalable text, reduced-motion behavior, and contrast checks. Its edge tab has an accessible name and a keyboard equivalent.

## Windows integration and safety

- **Resolution:** Enumerate actual modes per monitor, test a candidate, apply it, then show a keep/revert countdown. Revert automatically if not confirmed. This is supported by the documented `ChangeDisplaySettingsEx` API.
- **Volume:** Use Core Audio's endpoint volume interface, with the displayed slider bound to the active default output endpoint. Handle device changes and stale endpoints.
- **Input/output selection:** Enumerate active Core Audio endpoints. Windows exposes endpoint discovery and notifications publicly; changing the system default is less clearly supported. Validate a compatible method on the supplied Windows build before treating the dropdown as live. If it cannot be made reliable, leave the current device visible and provide a direct OS picker action with a clear label.
- **Scale:** Windows documents reading DPI and reacting to scale changes, but not a public per-monitor setter. A small isolated compatibility probe may test the private display-configuration mechanism on this exact build. Only enable instant scale changes after read-back and rollback pass. Avoid direct registry edits. If the probe fails, show the current scale and a direct Display settings action rather than a nonfunctional selector.
- **Windows text size:** Probe the available Windows API on this build before exposing live adjustment. If unsupported, provide the current value where available plus a direct Accessibility text-size action. Panel-local text sizing always remains available.
- **Quick toggles:** The first release contains no OS-wide quick-toggle module. Configuration checkboxes cover module visibility and app behavior. OS-wide toggles can be added later only after their exact Windows API, current-state read, change, and reverse action are verified.

All risky display changes are explicit user actions. The app shows the old and new value, displays errors in plain language, and keeps the keyboard path usable if pointer placement changes. It does not start with elevation and asks for it only if a particular validated control truly requires it.

## Technical shape (builder's choice within these boundaries)

A native Windows host manages tray behavior, the edge activation region, hotkey, monitor placement, and Windows API calls. A local WebView2 panel renders Toolskin HTML/CSS/JS and communicates with the host through a small allowlisted message bridge. This allows use of Toolskin components while keeping OS access out of arbitrary page script. Package only the Toolskin styles, scripts, fonts, and icons the panel actually uses. The host should detect WebView2 Runtime availability and report a clear setup step if missing.

The first build is for the supplied Windows 10 Pro 22H2 x64 workstation. Multi-monitor and DPI awareness are part of the host from the outset. Configuration is a local user-profile file with schema versioning and safe defaults. No network access is needed for normal use.

## Acceptance

- The edge launcher stays hidden until dwell, reveals predictably, and never blocks ordinary clicks along the whole screen edge.
- The panel opens and closes by pointer, keyboard, and tray; all controls have names, focus states, and readable labels.
- Resolution can be changed from an enumerated safe mode and reverts when the countdown expires.
- Volume changes immediately; input/output lists reflect active devices; selection is only offered as live after successful validation.
- Scale and Windows text-size controls accurately indicate whether they can apply changes live on the target build. No setting claims success before read-back.
- Configuration checkboxes persist after restart; module visibility and chosen edge take effect without restarting when possible.
- The panel matches the Toolskin visual language and uses no runtime CDN resources.
- No files or commits are changed in other project repositories.

## Owner decisions captured

- A clearly labeled direct Windows action is acceptable for scale, Windows text size, or default audio selection if a live change cannot be verified on the target build.
- The first release focuses on the core controls; no OS-wide quick toggles are required yet.
- “Font settings” includes both Windows text size and the panel's own text size.

## Source notes

- Toolskin reference: `D:\Mis Documentos\Projects\Toolskin Framework\toolskin-rebuild\assets\css\toolskin.css` and `assets\js\toolskin.js`.
- Custom integration reference: `D:\Mis Documentos\Projects\Toolskin Framework\informe_interactivo_hospital_lvarez_auditado\observatorio-kit\src\css\observatorio.css`.
- Microsoft documentation: `ChangeDisplaySettingsEx`, Core Audio endpoint volume and device notifications, WebView2 support/distribution, and Windows DPI development guidance.

