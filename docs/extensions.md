# Extending System controls

The current widget also has a reusable DOM behavior adapter in `web/toolskin-enhance.js`; see [Toolskin integration findings](toolskin-integration-findings.md). Add the adapter class or attribute to an existing native element and call `ToolskinEnhance.init()` once. Keep OS actions in the explicit native host allowlist below.

## Current boundary

The widget does not yet have a runtime plugin loader. Its display and sound modules are declared in `web/index.html`, updated by `web/app.js`, dispatched by the allowlisted actions in `WebWidget.cs`, and implemented by `Core.cs` plus the Windows backends. `Settings.cs` stores user preferences. Design values are separate in `web/theme.css`.

To add a direct control today:

1. Add a capability and readback result to the relevant backend and `ControlSnapshot` in `Core.cs`.
2. Add a validated controller operation. A reversible display change needs a timed rollback, as scale and resolution already have.
3. Add one explicit action to `WebWidget.cs`; avoid accepting arbitrary class names, commands, or URIs from web messages.
4. Add the module markup in `web/index.html` and render/events in `web/app.js`. Use the existing `.module`, `.module-body`, field, button, and range classes. The panel height is measured automatically when a module is hidden or its accordion is collapsed.
5. Add a visibility preference only if people benefit from hiding the module. Test capability missing, success, failure, readback, and the panel layout.

## Practical JSON scaffold

A future manifest can describe layout and bind *known* handlers. It must not execute code or call arbitrary Windows APIs by itself. For example:

```json
{
  "schemaVersion": 1,
  "modules": [
    {
      "id": "microphone",
      "title": "Microphone",
      "group": "Sound",
      "visibleByDefault": true,
      "controls": [
        { "id": "micMute", "type": "toggle", "label": "Mute current input", "handler": "audio.inputMute", "capability": "audio.inputEndpoint" }
      ]
    },
    {
      "id": "nightLight",
      "title": "Night light",
      "group": "Display",
      "controls": [
        { "id": "nightLightSettings", "type": "settingsLink", "label": "Open Night light", "handler": "settings.nightLight" }
      ]
    }
  ]
}
```

Use a registry in the native host that maps each handler ID to a compiled implementation and capability probe. Validate the manifest schema and IDs at startup, then render only supported controls. `settingsLink` can use a fixed allowlist of documented `ms-settings:` destinations; direct controls require a native backend with readback. Keep styling in `web/theme.css` so manifests do not embed CSS.

## Good next candidates

| Feature | Direct control prospect | Constraint |
| --- | --- | --- |
| Current microphone volume and mute | Strong | Windows Core Audio exposes endpoint volume controls; detect an active input endpoint and confirm the result. |
| Brightness | Hardware dependent | Windows WMI brightness methods apply only where the monitor provider supports them; this desktop's external display may not. |
| Night light, Bluetooth, Wi-Fi, microphone privacy | Settings shortcuts first | Microsoft documents Settings destinations, but a shortcut is not a direct toggle. Add a direct handler only after a supported API and readback are verified. |
| Default input/output switching | Implemented with capability checks | `Audio.cs` changes defaults through the available Windows interface and reads them back. Keep the Windows Sound action when no switchable endpoint is present or the interface fails. |

References: [Windows Settings URI reference](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings), [Core Audio endpoint volume](https://learn.microsoft.com/en-us/windows/win32/api/endpointvolume/nf-endpointvolume-iaudioendpointvolume-setmastervolumelevelscalar), [WMI monitor brightness methods](https://learn.microsoft.com/en-us/windows/win32/wmicoreprov/wmimonitorbrightnessmethods).
