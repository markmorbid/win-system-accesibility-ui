# System Accessibility UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Toolskin-styled Windows 10 utility that opens from a configurable screen edge and makes verified display, text, and sound changes from one accessible panel.

**Architecture:** A WPF host owns tray, hotkey, edge dwell, display placement, settings, and Windows APIs. A local WebView2 view renders only the Toolskin resources needed for the panel and communicates through a validated message bridge. Pure coordination and configuration logic live in a separate library for deterministic tests; native adapters report capabilities and verify state after changes.

**Tech Stack:** C# / .NET Framework 4.8.1, WPF, Microsoft.Web.WebView2 1.0.4258.31, local HTML/CSS/JavaScript, MSTest 4.5.1, Microsoft.NET.Test.Sdk 18.11.0. Build with an official .NET SDK installed locally for development; the user machine already has the 4.8.1 runtime and WebView2 Runtime.

**Spec:** `docs/superpowers/specs/2026-10-19-system-accessibility-ui-design.md`

## Global Constraints

- Target Windows 10 Pro 22H2 x64 and the supplied workstation first.
- Leave the existing Toolskin, Observatorio, and every other project repository untouched.
- Package Toolskin UI resources locally; normal use needs no network.
- Never report success for a setting until the Windows value is read back.
- Live scale, Windows text size, and default audio selection may fall back to a clearly labeled direct Windows action if target-build validation fails.
- No OS-wide quick-toggle module in the first release; both Windows and panel text size remain in scope.
- No elevation at startup; only a validated feature may request it.
- No external URL, script, or arbitrary bridge command may gain Windows API access.

## File structure

| Path | Responsibility |
| --- | --- |
| `src/SystemAccessibilityUi.Core/` | Settings model, edge reveal state machine, bridge contract, display rollback coordinator, capability models |
| `src/SystemAccessibilityUi.App/App.xaml*` | WPF process startup, single instance, service wiring, graceful shutdown |
| `src/SystemAccessibilityUi.App/Host/` | Tray and hotkey, monitor tracking, edge tab and panel windows, WebView2 origin and message host |
| `src/SystemAccessibilityUi.App/Settings/` | Versioned user-profile JSON persistence and startup registration |
| `src/SystemAccessibilityUi.App/Display/` | Win32 mode enumeration, test/apply/restore, DPI read/probe |
| `src/SystemAccessibilityUi.App/Audio/` | Core Audio endpoint inventory, volume and mute, default-device capability probe |
| `src/SystemAccessibilityUi.App/Text/` | Windows text-scale read/probe/fallback |
| `src/SystemAccessibilityUi.App/Ui/` | Panel markup, app-scoped stylesheet and script, curated local Toolskin assets/fonts |
| `tests/SystemAccessibilityUi.Tests/` | Pure contract, timing, rollback, settings, capability, and bridge tests with fakes |
| `tools/` | Reproducible SDK bootstrap and release packaging scripts |

## Review Focus

1. A monitor disconnects or its bounds change while the panel is open: move the launcher and panel to the primary monitor without losing keyboard access. Test in Task 2.
2. A resolution change makes the panel invisible or the process exits: restore the previous mode after timeout or startup recovery. Test in Task 3.
3. An audio endpoint disappears between enumeration and selection: show an unavailable state and refresh the list without claiming success. Test in Task 4.
4. A WebView2 message contains an unknown command, malformed values, or a foreign origin: reject it without invoking any native adapter. Test in Task 1.
5. A system capability is unavailable or read-back disagrees with the requested value: show the direct Windows action and an error/status explanation. Test in Task 5.

---

### Task 1: Buildable foundation and secure Toolskin panel

**Files:** Create `SystemAccessibilityUi.sln`, `src/SystemAccessibilityUi.Core/SystemAccessibilityUi.Core.csproj`, `src/SystemAccessibilityUi.App/SystemAccessibilityUi.App.csproj`, `src/SystemAccessibilityUi.App/App.xaml`, `src/SystemAccessibilityUi.App/App.xaml.cs`, `src/SystemAccessibilityUi.App/Host/PanelBridgeHost.cs`, `src/SystemAccessibilityUi.Core/Bridge/PanelCommand.cs`, `src/SystemAccessibilityUi.Core/Bridge/CommandParser.cs`, `src/SystemAccessibilityUi.Core/Bridge/BridgeGate.cs`, `src/SystemAccessibilityUi.Core/Capabilities/CapabilityResult.cs`, `src/SystemAccessibilityUi.App/Ui/index.html`, `src/SystemAccessibilityUi.App/Ui/panel.css`, `src/SystemAccessibilityUi.App/Ui/panel.js`, `src/SystemAccessibilityUi.App/Ui/vendor/toolskin/tokens.css`, `src/SystemAccessibilityUi.App/Ui/vendor/toolskin/components.css`, `src/SystemAccessibilityUi.App/Ui/vendor/toolskin/accordion.js`, `src/SystemAccessibilityUi.App/Ui/vendor/toolskin/SpaceGrotesk.ttf`, `src/SystemAccessibilityUi.App/Ui/vendor/toolskin/JetBrainsMono.ttf`, `tests/SystemAccessibilityUi.Tests/BridgeTests.cs`, `tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj`, `tools/bootstrap-sdk.ps1`, `tools/dotnet.ps1`, `global.json`, `.gitignore`.

**Interfaces:** `CommandParser.Parse(string json) -> PanelCommand` accepts only `getSnapshot`, `setVolume`, `setMute`, `beginResolution`, `keepResolution`, `revertResolution`, `setDefaultDevice`, `setScale`, `setWindowsTextSize`, `saveSettings`, and `openWindowsSettings`; it rejects unknown names and out-of-range values. `BridgeGate.Accept(string sourceOrigin, string json) -> PanelCommand` rejects every origin except the app's mapped local origin before parsing. `PanelBridgeHost` delegates to the gate and serializes `{requestId, ok, data, error}` responses. The HTML exposes semantic sections and accordion buttons with `aria-expanded`.

- [ ] **Step 1: Bootstrap an official local .NET SDK and create the solution, project files, and empty test fixture.** `tools/bootstrap-sdk.ps1` installs under `.tools/dotnet`; `tools/dotnet.ps1` invokes that executable for later steps. Ignore `.tools/dotnet` in Git and pin the discovered SDK in `global.json`.
- [ ] **Step 2: Write failing bridge tests.** Assert malformed JSON, unknown commands, foreign origin, and volume outside `0..100` invoke no native handler; assert a valid `getSnapshot` keeps its request ID.
- [ ] **Step 3: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter BridgeTests`.** Expected: tests fail because the parser/host do not exist.
- [ ] **Step 4: Implement the parser, WPF/WebView2 host, local origin mapping, and curated Toolskin token/component/font files.** Pin NuGet versions above, block external navigation and new windows, and scope CSS under the app root.
- [ ] **Step 5: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter BridgeTests` and `.\tools\dotnet.ps1 build SystemAccessibilityUi.sln`.** Expected: tests pass and build succeeds; manual launch shows local panel with header and three accordion modules.
- [ ] **Step 6: Commit** as `feat: establish secure Toolskin desktop shell`.

### Task 2: Configurable edge launcher and persistence

**Files:** Create `src/SystemAccessibilityUi.Core/Settings/AppSettings.cs`, `src/SystemAccessibilityUi.Core/Edge/EdgeRevealMachine.cs`, `src/SystemAccessibilityUi.App/Settings/SettingsStore.cs`, `src/SystemAccessibilityUi.App/Host/MonitorEdgeTracker.cs`, `src/SystemAccessibilityUi.App/Host/TrayHotkeyHost.cs`, `src/SystemAccessibilityUi.App/Host/EdgeTabWindow.xaml*`, `src/SystemAccessibilityUi.App/Host/PanelWindow.xaml*`, `tests/SystemAccessibilityUi.Tests/EdgeSettingsTests.cs`.

**Interfaces:** `AppSettings` schema v1 defaults: primary monitor, right edge, 400 ms reveal dwell, 700 ms hide grace, Ctrl+Alt+Space, all three modules visible, launch at sign-in false, panel text size 100%. `EdgeRevealMachine.Advance(now, pointerAtEdge, pointerOnTabOrPanel, panelOpen) -> EdgeUiState`. `SettingsStore.Load() -> AppSettings` tolerates missing/invalid files; `Save(AppSettings)` replaces the file atomically. `MonitorEdgeTracker` falls back to the primary monitor when the configured one disappears.

- [ ] **Step 1: Write failing tests** for dwell/grace timing, keyboard-open state, invalid settings recovery, and monitor disconnect fallback.
- [ ] **Step 2: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter EdgeSettingsTests`.** Expected: fail before the state machine/store exist.
- [ ] **Step 3: Implement settings, tray, `RegisterHotKey`, 50 ms cursor polling with `GetCursorPos`, and per-monitor-DPI-aware WPF windows.** Only the visible tab/panel receives pointer input; passive edge observation does not cover ordinary clicks.
- [ ] **Step 4: Run the filtered tests and manually check left/right edges, Escape, tray, hotkey, focus, and monitor disconnect.** Expected: tests pass; the panel remains reachable by keyboard after display changes.
- [ ] **Step 5: Commit** as `feat: add configurable edge launcher`.

### Task 3: Resolution change with automatic rollback

**Files:** Create `src/SystemAccessibilityUi.Core/Display/DisplayChangeCoordinator.cs`, `src/SystemAccessibilityUi.App/Display/Win32DisplayService.cs`, `tests/SystemAccessibilityUi.Tests/DisplayChangeTests.cs`; modify `Ui/panel.js` and `Host/PanelBridgeHost.cs`.

**Interfaces:** `IDisplayModeService.GetDisplays()/GetModes(displayId)/GetCurrentMode(displayId)/TestMode(displayId, mode)/ApplyMode(displayId, mode)/RestoreMode(displayId, mode)`. `DisplayChangeCoordinator.Begin(displayId, mode, now) -> PendingDisplayChange` refuses unsupported modes and stores the old mode before applying. `Keep(requestId)` persists only a confirmed change; `Tick(now)` restores after 15 seconds. Persist a pending-change recovery record before applying and clear it only after keep/revert.

- [ ] **Step 1: Write failing tests** for unsupported mode rejection, read-back mismatch, timeout restore, explicit keep, crash-recovery record, and monitor disconnect during countdown.
- [ ] **Step 2: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter DisplayChangeTests`.** Expected: fail before coordinator implementation.
- [ ] **Step 3: Implement `EnumDisplayDevices`/`EnumDisplaySettings` and `ChangeDisplaySettingsEx` with `CDS_TEST`, then bind the selector and keep/revert countdown to the bridge.** Do not offer unsafe display modes.
- [ ] **Step 4: Run tests and manually apply a secondary supported mode, let it time out, then repeat and keep.** Expected: original mode returns on timeout, and confirmed mode remains.
- [ ] **Step 5: Commit** as `feat: add safe resolution changes`.

### Task 4: Core Audio volume and device controls

**Files:** Create `src/SystemAccessibilityUi.Core/Audio/AudioModels.cs`, `src/SystemAccessibilityUi.App/Audio/CoreAudioService.cs`, `src/SystemAccessibilityUi.App/Audio/DefaultDeviceProbe.cs`, `tests/SystemAccessibilityUi.Tests/AudioTests.cs`; modify panel and bridge.

**Interfaces:** `IAudioService.Snapshot() -> AudioSnapshot`, `SetMasterVolume(percent)`, `SetMute(bool)`, `TrySetDefaultEndpoint(flow, endpointId) -> CapabilityResult`. Snapshot contains active render/capture endpoints and current defaults. The setter is enabled only after target-build probe plus read-back for the requested role; otherwise the UI offers a direct Sound settings action.

- [ ] **Step 1: Write failing tests** for percent clamping, unplugged endpoint, changed default notification, read-back mismatch, and unsupported-setter fallback.
- [ ] **Step 2: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter AudioTests`.** Expected: fail before models/service exist.
- [ ] **Step 3: Implement Core Audio endpoint enumeration, notifications, endpoint-volume control, and an isolated default-device compatibility probe.** Never claim a device switch until the new default is observed.
- [ ] **Step 4: Run tests; manually adjust volume/mute and disconnect/reconnect an endpoint.** Expected: UI refreshes and no stale selection is shown; document whether live default switching passed on this machine.
- [ ] **Step 5: Commit** as `feat: add verified sound controls`.

### Task 5: Scale and text-size capability paths

**Files:** Create `src/SystemAccessibilityUi.App/Display/ScaleService.cs`, `src/SystemAccessibilityUi.App/Text/TextSizeService.cs`, `tests/SystemAccessibilityUi.Tests/CapabilityTests.cs`; modify panel, bridge, and settings.

**Interfaces:** `ScaleService.GetForDisplay(displayId)/TrySet(displayId, percent) -> CapabilityResult`; `TextSizeService.Get()/TrySet(percent) -> CapabilityResult`. Each result is `Applied`, `Unsupported`, or `Failed` with observed value and user-facing reason. Unsupported results expose direct Display or Ease of Access text-size actions. `AppSettings.PanelTextSizePercent` applies locally in the WebView independently of Windows capability.

- [ ] **Step 1: Write failing tests** for unsupported capability, read-back disagreement, rollback on failed scale probe, and panel text-size persistence without Windows mutation.
- [ ] **Step 2: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter CapabilityTests`.** Expected: fail before services/results exist.
- [ ] **Step 3: Implement documented DPI reads and an isolated, opt-in target-build scale compatibility probe; never edit scaling registry keys.** Treat Windows text-size setting as unsupported unless a non-IoT compatible setter is verified; keep the direct action and local text size working.
- [ ] **Step 4: Run tests and manually inspect actual values at 150% scale and 1920×1080.** Expected: capability labels match read-back; a failed probe leaves the old scale intact and a usable direct action.
- [ ] **Step 5: Commit** as `feat: add honest scale and text-size controls`.

### Task 6: Integrated accessibility, packaging, and target-machine verification

**Files:** Create `tools/package.ps1`, `docs/user-guide.md`, `tests/SystemAccessibilityUi.Tests/IntegrationContractTests.cs`; modify WPF manifest, panel CSS/JS, solution, and `.gitignore`.

**Interfaces:** Release output contains the app, local Toolskin assets, versioned configuration example, and a README with install/run, shortcut, tray, fallback, and recovery instructions. The app uses `PerMonitorV2` DPI awareness, has a visible keyboard focus path and reduced-motion behavior, and never navigates WebView2 to an external origin.

- [ ] **Step 1: Write failing integration-contract tests** for app asset availability, bridge action/error contract, settings round-trip, and no remote URL in shipped UI files.
- [ ] **Step 2: Run `.\tools\dotnet.ps1 test tests/SystemAccessibilityUi.Tests/SystemAccessibilityUi.Tests.csproj --filter IntegrationContractTests`.** Expected: fail before packaging and final wiring.
- [ ] **Step 3: Wire all snapshots and errors, complete accessible labels/focus/reduced motion, create package script and user guide.** Include a one-command start and a recovery path if a display change interrupts the UI.
- [ ] **Step 4: Run `.\tools\dotnet.ps1 test SystemAccessibilityUi.sln`, `.\tools\dotnet.ps1 build SystemAccessibilityUi.sln -c Release`, and `tools/package.ps1`; then perform keyboard, mouse, DPI, monitor, audio, and resolution checks on the target PC.** Expected: all tests pass, package runs offline, display rollback works, and only verified live controls are enabled.
- [ ] **Step 5: Commit** as `feat: package accessible system controls`.

## Self-review record

- Spec coverage: launcher, settings, Toolskin, display, text, audio, fallbacks, accessibility, offline packaging, and repository isolation each map to a task.
- The five review-focus cases have explicit tests in Tasks 1–5.
- Core interfaces are defined by their owning tasks; later tasks consume those names.
- The plan keeps implementation bodies out of the document while fixing the decisions needed for execution.

