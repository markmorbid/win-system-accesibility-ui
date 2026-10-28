using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Forms;
using System.IO;
using System.Drawing;
using SystemAccessibilityUi;

internal static class CoreTests {
  private static int passed, failed;
  private static void Test(string name, Action body) { try { body(); Console.WriteLine("PASS " + name); passed++; } catch (Exception ex) { Console.WriteLine("FAIL " + name + ": " + ex.Message); failed++; } }
  private static void Check(bool value,string message) { if (!value) throw new Exception(message); }
  private sealed class Fake : IPlatformControls {
    internal int ApplyCalls, TestCalls, Volume=35, Scale=150, ScaleWrites; internal bool Mute, IgnoreScaleWrite;
    internal bool IgnoreVolumeWrite, EnableDeviceSwitch, IgnoreDeviceWrite; internal int DeviceWrites; internal string CurrentOutput="speaker";
    internal ModeChoice Current=new ModeChoice("1920:1080:60",1920,1080,60);
    public ModeChoice CurrentMode(string display) { return Current; }
    public List<ModeChoice> Modes(string display) { return new List<ModeChoice> { Current, new ModeChoice("1280:720:60",1280,720,60) }; }
    public int TestMode(string display,ModeChoice mode) { TestCalls++; return 0; }
    public int ApplyMode(string display,ModeChoice mode,bool persist) { ApplyCalls++; Current=mode; return 0; }
    public int ScalePercent(string display) { return Scale; }
    public List<int> ScaleChoices(string display) { return new List<int> { 100,125,150,175 }; }
    public bool SetScalePercent(string display,int percent) { ScaleWrites++; if (!IgnoreScaleWrite) Scale=percent; return true; }
    public List<AudioChoice> Devices(bool input) { return input?new List<AudioChoice>():new List<AudioChoice> { new AudioChoice("speaker","Speakers"), new AudioChoice("headphones","Headphones") }; }
    public List<AudioChoice> AllDevices(bool input) { return input?new List<AudioChoice> { new AudioChoice("mic","Microphone","Unplugged") }:new List<AudioChoice> { new AudioChoice("speaker","Speakers"),new AudioChoice("headphones","Headphones") }; }
    public string DefaultDeviceId(bool input) { if (input) throw new InvalidOperationException("No input"); return CurrentOutput; }
    public bool CanSetDefaultDevice { get { return EnableDeviceSwitch; } }
    public void SetDefaultDevice(bool input,string id) { DeviceWrites++; if (!IgnoreDeviceWrite) CurrentOutput=id; }
    public int GetVolume() { return Volume; }
    public void SetVolume(int value) { if (!IgnoreVolumeWrite) Volume=value; }
    public bool GetMute() { return Mute; }
    public void SetMute(bool value) { Mute=value; }
  }
  private static int Main() {
    Test("edge launcher uses working area and follows cursor",delegate { Rectangle area=new Rectangle(0,0,1200,700); Check(EdgeLauncher.InHotZone(area,new Point(1190,350),"Right",18),"right edge missed"); Check(EdgeLauncher.InHotZone(area,new Point(8,350),"Left",18),"left edge missed"); Check(!EdgeLauncher.InHotZone(area,new Point(1210,350),"Right",18),"taskbar side accepted"); Rectangle tab=EdgeLauncher.TabBounds(area,new Point(1190,680),"Right",new Size(42,90)); Check(tab.Contains(new Point(1190,680)),"launcher is not reachable at the hover point"); Check(tab.Bottom<=area.Bottom,"launcher extends beyond work area"); });
    Test("snapshot treats missing microphone as an empty state",delegate { using (SystemController c=new SystemController(new Fake(),TimeSpan.FromSeconds(1))) { ControlSnapshot s=c.Read("DISPLAY1"); Check(s.Inputs.Count==0,"input list should be empty"); Check(s.AllInputs.Count==1 && s.AllInputs[0].Status=="Unplugged","inactive microphone should remain visible in inventory"); Check(s.Outputs.Count>=1,"speaker missing"); Check(s.InputStatus.Length>0,"missing input status"); } });
    Test("unknown resolution never reaches Windows",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { ControlResult r=c.BeginResolution("DISPLAY1","unknown"); Check(!r.Success,"unknown mode accepted"); Check(f.TestCalls==0 && f.ApplyCalls==0,"display was touched"); } });
    Test("resolution reverts after timeout",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromMilliseconds(80))) { ControlResult r=c.BeginResolution("DISPLAY1","1280:720:60"); Check(r.Success,"safe mode rejected"); Thread.Sleep(180); Check(f.Current.Id=="1920:1080:60","mode not restored"); Check(!c.HasPendingResolution,"pending flag not cleared"); } });
    Test("unknown scale never reaches Windows",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { Check(!c.BeginScale("DISPLAY1",300).Success,"unknown scale accepted"); Check(f.ScaleWrites==0,"scale backend was called"); } });
    Test("scale requires readback and reverts after timeout",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromMilliseconds(80))) { f.IgnoreScaleWrite=true; Check(!c.BeginScale("DISPLAY1",125).Success,"unverified scale accepted"); f.IgnoreScaleWrite=false; Check(c.BeginScale("DISPLAY1",125).Success,"valid scale rejected"); Check(c.HasPendingScale,"scale not pending"); Check(!c.BeginResolution("DISPLAY1","1280:720:60").Success,"concurrent display change accepted"); Thread.Sleep(180); Check(f.Scale==150,"scale not restored"); Check(!c.HasPendingScale,"pending scale not cleared"); } });
    Test("kept scale cancels rollback",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromMilliseconds(80))) { Check(c.BeginScale("DISPLAY1",125).Success,"valid scale rejected"); Check(c.KeepScale().Success,"scale not kept"); Thread.Sleep(180); Check(f.Scale==125 && !c.HasPendingScale,"kept scale reverted"); } });
    Test("volume write requires readback",delegate { Fake f=new Fake(); f.IgnoreVolumeWrite=true; using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { ControlResult r=c.SetVolume(80); Check(!r.Success,"unverified volume reported success"); } });
    Test("volume rejects out of range",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { Check(!c.SetVolume(101).Success,"invalid volume accepted"); Check(f.Volume==35,"volume changed"); } });
    Test("default device capability is explicit",delegate { using (SystemController c=new SystemController(new Fake(),TimeSpan.FromSeconds(1))) { Check(!c.CanSetDefaultDevice,"unsupported selector advertised"); } });
    Test("unsupported device switch never reaches backend",delegate { Fake f=new Fake(); using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { Check(!c.SelectDevice(false,"headphones").Success,"unsupported switch accepted"); Check(f.DeviceWrites==0,"backend was called"); } });
    Test("device switch validates option and readback",delegate { Fake f=new Fake(); f.EnableDeviceSwitch=true; using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { Check(!c.SelectDevice(false,"unknown").Success,"unknown device accepted"); Check(f.DeviceWrites==0,"unknown device reached backend"); Check(c.SelectDevice(false,"headphones").Success,"valid switch failed"); Check(f.CurrentOutput=="headphones","default was not changed"); } });
    Test("device switch reports failed readback",delegate { Fake f=new Fake(); f.EnableDeviceSwitch=true; f.IgnoreDeviceWrite=true; using (SystemController c=new SystemController(f,TimeSpan.FromSeconds(1))) { Check(!c.SelectDevice(false,"headphones").Success,"unverified switch reported success"); } });
    Test("real output devices have readable names",delegate { List<Audio.Device> items=Audio.Devices(false); Check(items.Count>0,"no active output"); Console.WriteLine("  Active outputs: "+items.Count+", direct switch interface: "+Audio.CanSetDefaultDevice); foreach (Audio.Device d in items) Check(!String.IsNullOrWhiteSpace(d.Name),"blank device name"); });
    Test("real volume write at same value reads back",delegate { int original=Audio.GetVolume(); Audio.SetVolume(original); Check(Math.Abs(Audio.GetVolume()-original)<=1,"volume readback differs"); });
    Test("real monitor modes and audio snapshot are readable",delegate { string display=Screen.PrimaryScreen.DeviceName; WindowsPlatformControls backend=new WindowsPlatformControls(); using (SystemController c=new SystemController(backend,TimeSpan.FromSeconds(15))) { ControlSnapshot s=c.Read(display); Check(s.CurrentMode!=null,"current mode missing"); Check(s.Modes.Count>0,"mode choices missing"); Check(s.Outputs.Count>0,"output devices missing"); Check(s.AudioAvailable,"volume endpoint unavailable"); Check(backend.TestMode(display,s.CurrentMode)==0,"Windows rejected current mode test"); } });
    Test("live scale capability probe is read-only",delegate { Scale.Info info=Scale.Probe(Screen.PrimaryScreen.DeviceName); Check(info!=null,"private DPI query unavailable"); Check(info.Choices.Contains(info.Current),"current scale missing from options"); Console.WriteLine("  Scale: "+info.Current+"%, choices: "+String.Join(", ",info.Choices)); });
    Test("real scale write at current value reads back",delegate { string display=Screen.PrimaryScreen.DeviceName; Scale.Info before=Scale.Probe(display); Check(before!=null,"direct scale unavailable"); Check(Scale.Apply(display,before.Current),"Windows rejected its current scale"); Scale.Info after=Scale.Probe(display); Check(after!=null && after.Current==before.Current,"scale readback changed"); });
    Test("settings selectors round-trip without registry writes",delegate { string path=Path.GetTempFileName(); try { Settings s=new Settings(); s.Edge="Left"; s.Monitor="\\\\.\\DISPLAY1"; s.HoverDelay=650; s.UiScale=65; s.FontBase=13; s.SpacingBase=3; s.PanelRadius=20; s.ButtonRadius=6; s.InnerRadius=5; s.SelectRadius=7; s.Accent="cyan"; s.Sound=false; s.StartWithWindows=true; s.SaveToFile(path); Settings r=Settings.LoadFromFile(path); Check(r.Edge=="Left" && r.Monitor==s.Monitor,"edge or monitor lost"); Check(r.HoverDelay==650 && r.UiScale==65,"range values lost"); Check(r.FontBase==13 && r.SpacingBase==3 && r.PanelRadius==20 && r.ButtonRadius==6 && r.InnerRadius==5 && r.SelectRadius==7 && r.Accent=="cyan","design values lost"); Check(!r.Sound && r.StartWithWindows,"checkbox values lost"); File.WriteAllText(path,"TextSize=9"); Check(Settings.LoadFromFile(path).UiScale==90,"old text size was not migrated"); } finally { File.Delete(path); } });
    Console.WriteLine("Results: " + passed + " passed, " + failed + " failed"); return failed==0?0:1;
  }
}
