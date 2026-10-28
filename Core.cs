using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Forms;

namespace SystemAccessibilityUi {
  internal sealed class ModeChoice {
    internal string Id; internal int Width, Height, Hertz; internal Display.Mode Native;
    internal ModeChoice(string id,int width,int height,int hertz) { Id=id; Width=width; Height=height; Hertz=hertz; }
    public override string ToString() { return Width+" × "+Height+" · "+Hertz+" Hz"; }
  }
  internal sealed class AudioChoice {
    internal string Id, Name, Status;
    internal AudioChoice(string id,string name,string status="Active") { Id=id; Name=name; Status=status; }
  }
  internal sealed class ControlResult {
    internal bool Success; internal string Message;
    internal ControlResult(bool success,string message) { Success=success; Message=message; }
  }
  internal sealed class ControlSnapshot {
    internal List<ModeChoice> Modes=new List<ModeChoice>(); internal ModeChoice CurrentMode;
    internal int Scale, Volume; internal List<int> ScaleChoices=new List<int>(); internal bool Muted, AudioAvailable;
    internal List<AudioChoice> Outputs=new List<AudioChoice>(), Inputs=new List<AudioChoice>(), AllOutputs=new List<AudioChoice>(), AllInputs=new List<AudioChoice>();
    internal string DefaultOutput, DefaultInput, InputStatus="";
  }
  internal interface IPlatformControls {
    ModeChoice CurrentMode(string display);
    List<ModeChoice> Modes(string display);
    int TestMode(string display,ModeChoice mode);
    int ApplyMode(string display,ModeChoice mode,bool persist);
    int ScalePercent(string display);
    List<int> ScaleChoices(string display);
    bool SetScalePercent(string display,int percent);
    List<AudioChoice> Devices(bool input);
    List<AudioChoice> AllDevices(bool input);
    string DefaultDeviceId(bool input);
    bool CanSetDefaultDevice { get; }
    void SetDefaultDevice(bool input,string id);
    int GetVolume(); void SetVolume(int value);
    bool GetMute(); void SetMute(bool value);
  }
  internal sealed class SystemController : IDisposable {
    private readonly IPlatformControls backend; private readonly TimeSpan timeout; private readonly object gate=new object();
    private System.Threading.Timer timer; private string pendingDisplay; private ModeChoice original, proposed;
    private System.Threading.Timer scaleTimer; private string scaleDisplay; private int originalScale,proposedScale;
    internal SystemController(IPlatformControls backend,TimeSpan timeout) { this.backend=backend; this.timeout=timeout; }
    internal bool CanSetDefaultDevice { get { return backend.CanSetDefaultDevice; } }
    internal ControlResult SelectDevice(bool input,string id) {
      if (!backend.CanSetDefaultDevice) return new ControlResult(false,"Choose the default device in Windows Sound settings.");
      try {
        bool found=false; foreach (AudioChoice device in backend.Devices(input)) if (device.Id==id) { found=true; break; }
        if (!found) return new ControlResult(false,"This audio device is no longer available. Refresh the list.");
        backend.SetDefaultDevice(input,id);
        string actual=backend.DefaultDeviceId(input);
        return actual==id?new ControlResult(true,(input?"Input":"Output")+" device changed."):new ControlResult(false,"Windows did not confirm the selected audio device.");
      } catch (Exception ex) { return new ControlResult(false,"Audio device could not be changed: "+ex.Message); }
    }
    internal bool HasPendingResolution { get { lock(gate) return proposed!=null; } }
    internal bool HasPendingScale { get { lock(gate) return proposedScale!=0; } }
    internal ControlSnapshot Read(string display) {
      ControlSnapshot s=new ControlSnapshot();
      s.CurrentMode=backend.CurrentMode(display); s.Modes=backend.Modes(display); s.Scale=backend.ScalePercent(display); s.ScaleChoices=backend.ScaleChoices(display);
      s.AllOutputs=backend.AllDevices(false); s.AllInputs=backend.AllDevices(true);
      foreach (AudioChoice device in s.AllOutputs) if (device.Status=="Active") s.Outputs.Add(device);
      foreach (AudioChoice device in s.AllInputs) if (device.Status=="Active") s.Inputs.Add(device);
      try { s.DefaultOutput=backend.DefaultDeviceId(false); } catch (Exception ex) { s.DefaultOutput=""; if (s.Outputs.Count>0) throw new InvalidOperationException("Cannot read the default output device.",ex); }
      try { s.DefaultInput=backend.DefaultDeviceId(true); } catch { s.DefaultInput=""; }
      if (s.Inputs.Count==0) s.InputStatus="No active input device detected.";
      else if (s.DefaultInput.Length==0) s.InputStatus="Windows did not report a default input device.";
      try { s.Volume=backend.GetVolume(); s.Muted=backend.GetMute(); s.AudioAvailable=true; } catch { s.AudioAvailable=false; }
      return s;
    }
    internal ControlResult SetVolume(int value) {
      if (value<0 || value>100) return new ControlResult(false,"Volume must be between 0 and 100.");
      try { backend.SetVolume(value); int actual=backend.GetVolume(); return Math.Abs(actual-value)<=1?new ControlResult(true,"Volume set to "+actual+"%."):new ControlResult(false,"Windows did not confirm the requested volume; actual value is "+actual+"%."); }
      catch (Exception ex) { return new ControlResult(false,"Volume could not be changed: "+ex.Message); }
    }
    internal ControlResult SetMute(bool value) {
      try { backend.SetMute(value); bool actual=backend.GetMute(); return actual==value?new ControlResult(true,value?"Output muted.":"Output unmuted."):new ControlResult(false,"Windows did not confirm the mute change."); }
      catch (Exception ex) { return new ControlResult(false,"Mute could not be changed: "+ex.Message); }
    }
    internal ControlResult BeginScale(string display,int percent) {
      lock(gate) {
        if (proposedScale!=0 || proposed!=null) return new ControlResult(false,"Keep or revert the current display change first.");
        int before=0; bool changed=false;
        try {
          if (!backend.ScaleChoices(display).Contains(percent)) return new ControlResult(false,"This scale is not available on this display. Refresh the list.");
          before=backend.ScalePercent(display);
          if (before==percent) return new ControlResult(false,"This scale is already active.");
          if (!backend.SetScalePercent(display,percent)) { if (backend.ScalePercent(display)!=before) backend.SetScalePercent(display,before); return new ControlResult(false,"Windows rejected this scale change."); }
          changed=true;
          if (backend.ScalePercent(display)!=percent) { backend.SetScalePercent(display,before); return new ControlResult(false,"Windows did not confirm the scale change. Previous scale requested."); }
          scaleDisplay=display; originalScale=before; proposedScale=percent;
          scaleTimer=new System.Threading.Timer(delegate { RevertScale(); },null,timeout,Timeout.InfiniteTimeSpan);
          return new ControlResult(true,"Scale changed temporarily. Keep it within "+(int)Math.Ceiling(timeout.TotalSeconds)+" seconds or it will revert.");
        } catch (Exception ex) { if (changed) { try { backend.SetScalePercent(display,before); } catch {} } return new ControlResult(false,"Scale could not be changed: "+ex.Message); }
      }
    }
    internal ControlResult KeepScale() {
      lock(gate) {
        if (proposedScale==0) return new ControlResult(false,"No scale change is pending.");
        try {
          if (backend.ScalePercent(scaleDisplay)!=proposedScale) { RevertScale(); return new ControlResult(false,"Windows did not confirm the new scale. Previous scale requested."); }
          ClearScale(); return new ControlResult(true,"Scale saved.");
        } catch (Exception ex) { RevertScale(); return new ControlResult(false,"Scale could not be confirmed: "+ex.Message); }
      }
    }
    internal ControlResult RevertScale() {
      lock(gate) {
        if (proposedScale==0) return new ControlResult(true,"No scale change is pending.");
        try {
          if (!backend.SetScalePercent(scaleDisplay,originalScale) || backend.ScalePercent(scaleDisplay)!=originalScale) return new ControlResult(false,"Windows could not confirm the previous scale. Open Display settings to restore it.");
          ClearScale(); return new ControlResult(true,"Previous scale restored.");
        } catch (Exception ex) { return new ControlResult(false,"Previous scale could not be restored: "+ex.Message); }
      }
    }
    private void ClearScale() { if (scaleTimer!=null) { scaleTimer.Dispose(); scaleTimer=null; } proposedScale=0; originalScale=0; scaleDisplay=null; }
    internal ControlResult BeginResolution(string display,string id) {
      lock(gate) {
        if (proposed!=null || proposedScale!=0) return new ControlResult(false,"Keep or revert the current display change first.");
        try {
          ModeChoice choice=null; foreach (ModeChoice m in backend.Modes(display)) if (m.Id==id) { choice=m; break; }
          if (choice==null) return new ControlResult(false,"This resolution is no longer available. Refresh the list.");
          ModeChoice before=backend.CurrentMode(display);
          if (before.Id==choice.Id) return new ControlResult(false,"This resolution is already active.");
          int test=backend.TestMode(display,choice); if (test!=0) return new ControlResult(false,"Windows rejected this resolution (code "+test+").");
          int applied=backend.ApplyMode(display,choice,false); if (applied!=0) return new ControlResult(false,"Windows could not apply this resolution (code "+applied+").");
          pendingDisplay=display; original=before; proposed=choice;
          timer=new System.Threading.Timer(delegate { RevertResolution(); },null,timeout,Timeout.InfiniteTimeSpan);
          return new ControlResult(true,"Resolution changed temporarily. Keep it within "+(int)Math.Ceiling(timeout.TotalSeconds)+" seconds or it will revert.");
        } catch (Exception ex) { return new ControlResult(false,"Resolution could not be changed: "+ex.Message); }
      }
    }
    internal ControlResult KeepResolution() {
      lock(gate) {
        if (proposed==null) return new ControlResult(false,"No resolution change is pending.");
        try { int code=backend.ApplyMode(pendingDisplay,proposed,true); if (code!=0) { RevertResolution(); return new ControlResult(false,"Windows could not save the resolution (code "+code+"). Previous resolution restored."); }
          ModeChoice readback=backend.CurrentMode(pendingDisplay); if (readback.Id!=proposed.Id) { RevertResolution(); return new ControlResult(false,"Windows did not confirm the new resolution. Previous resolution restored."); }
          ClearPending(); return new ControlResult(true,"Resolution saved.");
        } catch (Exception ex) { RevertResolution(); return new ControlResult(false,"Resolution could not be saved: "+ex.Message); }
      }
    }
    internal ControlResult RevertResolution() {
      lock(gate) {
        if (proposed==null) return new ControlResult(true,"No resolution change is pending.");
        try { int code=backend.ApplyMode(pendingDisplay,original,true); if (code!=0) return new ControlResult(false,"Windows could not restore the previous resolution (code "+code+").");
          ModeChoice readback=backend.CurrentMode(pendingDisplay); if (readback.Id!=original.Id) return new ControlResult(false,"Windows did not confirm that the previous resolution was restored.");
          ClearPending(); return new ControlResult(true,"Previous resolution restored.");
        } catch (Exception ex) { return new ControlResult(false,"Previous resolution could not be restored: "+ex.Message); }
      }
    }
    private void ClearPending() { if (timer!=null) { timer.Dispose(); timer=null; } proposed=null; original=null; pendingDisplay=null; }
    public void Dispose() { RevertResolution(); RevertScale(); if (timer!=null) timer.Dispose(); if (scaleTimer!=null) scaleTimer.Dispose(); }
  }
  internal sealed class WindowsPlatformControls : IPlatformControls {
    public bool CanSetDefaultDevice { get { return Audio.CanSetDefaultDevice; } }
    public void SetDefaultDevice(bool input,string id) { Audio.SetDefaultDevice(input,id); }
    private static ModeChoice Convert(Display.Mode mode) { ModeChoice m=new ModeChoice(mode.Data.dmPelsWidth+":"+mode.Data.dmPelsHeight+":"+mode.Data.dmDisplayFrequency,(int)mode.Data.dmPelsWidth,(int)mode.Data.dmPelsHeight,(int)mode.Data.dmDisplayFrequency); m.Native=mode; return m; }
    public ModeChoice CurrentMode(string display) { return Convert(Display.Current(display)); }
    public List<ModeChoice> Modes(string display) { List<ModeChoice> list=new List<ModeChoice>(); foreach (Display.Mode m in Display.Modes(display)) list.Add(Convert(m)); return list; }
    public int TestMode(string display,ModeChoice mode) { return Display.Test(display,mode.Native); }
    public int ApplyMode(string display,ModeChoice mode,bool persist) { return Display.Apply(display,mode.Native,persist); }
    public int ScalePercent(string display) { Scale.Info info=Scale.Probe(display); if (info!=null) return info.Current; foreach (Screen s in Screen.AllScreens) if (s.DeviceName==display) return Display.ScalePercent(s); return 0; }
    public List<int> ScaleChoices(string display) { Scale.Info info=Scale.Probe(display); return info==null?new List<int>():info.Choices; }
    public bool SetScalePercent(string display,int percent) { return Scale.Apply(display,percent); }
    public List<AudioChoice> Devices(bool input) { List<AudioChoice> list=new List<AudioChoice>(); foreach (Audio.Device d in Audio.Devices(input)) list.Add(new AudioChoice(d.Id,d.Name)); return list; }
    public List<AudioChoice> AllDevices(bool input) { List<AudioChoice> list=new List<AudioChoice>(); foreach (Audio.Device d in Audio.AllDevices(input)) list.Add(new AudioChoice(d.Id,d.Name,d.Status)); return list; }
    public string DefaultDeviceId(bool input) { return Audio.DefaultId(input); }
    public int GetVolume() { return Audio.GetVolume(); }
    public void SetVolume(int value) { Audio.SetVolume(value); }
    public bool GetMute() { return Audio.GetMute(); }
    public void SetMute(bool value) { Audio.SetMute(value); }
  }
}
