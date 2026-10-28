using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SystemAccessibilityUi {
  internal static class WebProgram {
    [STAThread] private static void Main(string[] args) { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); string mode=args.Length>0?args[0]:""; Application.Run(new WebWidget(mode=="--show" || mode=="--self-test",mode=="--self-test",mode=="--edge-test",mode=="--sandbox-test")); }
  }
  internal sealed class WebWidget : ApplicationContext {
    private Settings settings=Settings.Load();
    private readonly SystemController core=new SystemController(new WindowsPlatformControls(),TimeSpan.FromSeconds(15));
    private readonly JavaScriptSerializer json=new JavaScriptSerializer();
    private NotifyIcon tray; private Icon appIcon; private WebHotkey hotkey; private System.Windows.Forms.Timer hover;
    private Form tab, panel, confirmation; private WebView2 view; private Screen screen;
    private DateTime edgeSince=DateTime.MinValue,tabLeaveSince=DateTime.MinValue; private bool opening, ready, selfTest,sandboxTest,showSettingsOnReady,warmOpen,warmShowRequested,shuttingDown;
    private int desiredHeight=760,panelRadius=0,hoverTicks=0,previewUiScale; private long openDurationMs; private Stopwatch openClock; private Point? testCursor,draggedLocation,dragStart; private int? queuedVolume; private bool volumeBusy;
    internal WebWidget(bool show,bool selfTest,bool edgeTest,bool sandboxTest) {
      this.selfTest=selfTest; this.sandboxTest=sandboxTest;
      if (sandboxTest) {
        System.Windows.Forms.Timer limit=new System.Windows.Forms.Timer(); limit.Interval=12000;
        limit.Tick+=delegate { limit.Stop(); limit.Dispose(); File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"sandbox-test-error.txt"),"Sandbox test timed out."); Environment.ExitCode=1; ExitThread(); };
        limit.Start();
      }
      previewUiScale=settings.UiScale;
      try { appIcon=Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { appIcon=SystemIcons.Application; }
      tray=new NotifyIcon(); tray.Icon=appIcon; tray.Text="System controls"; tray.Visible=true;
      ContextMenuStrip menu=new ContextMenuStrip(); menu.Items.Add("Open controls",null,delegate { OpenPanel(); }); menu.Items.Add("Settings",null,delegate { OpenSettingsPanel(); }); menu.Items.Add("Exit",null,delegate { ExitThread(); }); tray.ContextMenuStrip=menu; tray.DoubleClick+=delegate { OpenPanel(); };
      hotkey=new WebHotkey(delegate { if (panel!=null && panel.Visible) ClosePanel(); else OpenPanel(); });
      hover=new System.Windows.Forms.Timer(); hover.Interval=80; hover.Tick+=HoverTick; hover.Start(); if (show) OpenPanel(); else if (!edgeTest) OpenPanel(true);
      if (edgeTest) { System.Windows.Forms.Timer start=new System.Windows.Forms.Timer(); start.Interval=50; start.Tick+=delegate { start.Stop(); start.Dispose(); RunEdgeSelfTest(); }; start.Start(); }
    }
    private Screen ChosenScreen() { if (settings.Monitor!="Any") foreach (Screen s in Screen.AllScreens) if (s.DeviceName==settings.Monitor) return s; return Screen.FromPoint(Cursor.Position); }
    private static string ScreenLabel(Screen target) { int n=1; foreach (Screen s in Screen.AllScreens) { if (s.DeviceName==target.DeviceName) return "Display "+n+(s.Primary?" · Primary":""); n++; } return target.DeviceName; }
    private void HoverTick(object sender,EventArgs e) {
      hoverTicks++;
      if (panel!=null && panel.Visible) { HideTab(); return; }
      Point p=testCursor.HasValue?testCursor.Value:Cursor.Position; Screen s=Screen.FromPoint(p);
      if (settings.Monitor!="Any" && s.DeviceName!=settings.Monitor) { HideTab(); return; }
      bool atEdge=EdgeLauncher.InHotZone(s.WorkingArea,p,settings.Edge,5);
      if (tab!=null && tab.Visible) {
        if (tab.Bounds.Contains(p)) { tabLeaveSince=DateTime.MinValue; return; }
        if (atEdge) { tabLeaveSince=DateTime.MinValue; PositionTab(s,p); return; }
        if (tabLeaveSince==DateTime.MinValue) tabLeaveSince=DateTime.Now;
        if ((DateTime.Now-tabLeaveSince).TotalMilliseconds>=700) HideTab();
        return;
      }
      if (atEdge) { if (edgeSince==DateTime.MinValue || screen==null || screen.DeviceName!=s.DeviceName) { edgeSince=DateTime.Now; screen=s; } if ((DateTime.Now-edgeSince).TotalMilliseconds>=settings.HoverDelay) ShowTab(s,p); }
      else edgeSince=DateTime.MinValue;
    }
    private void HideTab() { edgeSince=DateTime.MinValue; tabLeaveSince=DateTime.MinValue; if (tab!=null) tab.Hide(); }
    private void PositionTab(Screen s,Point p) { tab.Bounds=EdgeLauncher.TabBounds(s.WorkingArea,p,settings.Edge,tab.Size); }
    private void ShowTab(Screen s,Point p) {
      if (tab==null) { tab=new Form(); tab.FormBorderStyle=FormBorderStyle.None; tab.ShowInTaskbar=false; tab.TopMost=true; tab.BackColor=Color.FromArgb(255,84,10); tab.StartPosition=FormStartPosition.Manual;
        Button button=new Button(); button.Dock=DockStyle.Fill; button.FlatStyle=FlatStyle.Flat; button.FlatAppearance.BorderSize=0; button.BackColor=tab.BackColor; button.ForeColor=Color.FromArgb(12,13,15); button.Font=new Font("Segoe UI",24,FontStyle.Bold); button.AccessibleName="Open system controls"; button.Click+=delegate { OpenPanel(); }; tab.Controls.Add(button); }
      int dpi=Display.ScalePercent(s); double scale=dpi>0?dpi/100.0:1.0; tab.Size=new Size((int)Math.Round(16*scale),(int)Math.Round(48*scale));
      tab.Controls[0].Text=settings.Edge=="Left"?"›":"‹"; PositionTab(s,p); if (!tab.Visible) tab.Show();
    }
    private async void RunEdgeSelfTest() {
      string originalEdge=settings.Edge,originalMonitor=settings.Monitor; int originalDelay=settings.HoverDelay;
      string root=AppDomain.CurrentDomain.BaseDirectory, error=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"edge-test-error.txt");
      try {
        if (File.Exists(error)) File.Delete(error);
        settings.Monitor="Any"; settings.HoverDelay=150;
        List<string> results=new List<string>();
        foreach (string side in new [] { "Left","Right" }) {
          HideTab(); settings.Edge=side; Screen s=Screen.PrimaryScreen; Rectangle area=s.WorkingArea;
          Point hot=new Point(side=="Left"?area.Left+2:area.Right-3,area.Top+area.Height/2);
          testCursor=hot; await Task.Delay(450);
          if (tab==null || !tab.Visible || !tab.Bounds.Contains(hot)) throw new Exception(side+" edge did not reveal a reachable tab. ticks="+hoverTicks+" target="+hot+" work="+area+" tab="+(tab==null?"null":tab.Bounds.ToString())+" visible="+(tab!=null && tab.Visible));
          testCursor=new Point(area.Left+area.Width/2,area.Top+area.Height/2); await Task.Delay(950);
          if (tab.Visible) throw new Exception(side+" edge tab did not hide after leaving.");
          results.Add(side+": revealed and hid");
        }
        File.WriteAllText(Path.Combine(root,"edge-test.json"),json.Serialize(results));
      } catch (Exception ex) { File.WriteAllText(error,ex.ToString()); Environment.ExitCode=1; }
      finally { testCursor=null; settings.Edge=originalEdge; settings.Monitor=originalMonitor; settings.HoverDelay=originalDelay; HideTab(); ExitThread(); }
    }
    private void PositionPanel() {
      if (panel==null || panel.IsDisposed) return;
      Screen target=ChosenScreen();
      if (settings.Monitor=="Any" && panel.Visible && screen!=null) foreach (Screen item in Screen.AllScreens) if (item.DeviceName==screen.DeviceName) { target=item; break; }
      screen=target; int dpi=Display.ScalePercent(screen); double scale=dpi>0?dpi/100.0:1.0;
      int availableWidth=Math.Max(1,screen.WorkingArea.Width-12), availableHeight=Math.Max(1,screen.WorkingArea.Height-12);
      int width=Math.Min(availableWidth,Math.Max((int)Math.Round(280*scale),(int)Math.Round(492*scale*previewUiScale/100.0)));
      int height=Math.Min(availableHeight,Math.Max((int)Math.Round(120*scale),(int)Math.Round(desiredHeight*scale)));
      panel.Size=new Size(width,height); panel.Location=draggedLocation.HasValue?ClampPanel(draggedLocation.Value,screen.WorkingArea):new Point(settings.Edge=="Left"?screen.WorkingArea.Left:screen.WorkingArea.Right-panel.Width,screen.WorkingArea.Top+(screen.WorkingArea.Height-panel.Height)/2);
      ApplyPanelRegion(scale);
    }
    private Point ClampPanel(Point location,Rectangle area) { return new Point(Math.Max(area.Left,Math.Min(area.Right-panel.Width,location.X)),Math.Max(area.Top,Math.Min(area.Bottom-panel.Height,location.Y))); }
    private void ApplyPanelRegion(double scale) {
      if (panel==null || panel.IsDisposed) return;
      int radius=Math.Min(Math.Min(panel.Width,panel.Height)/2,Math.Max(0,(int)Math.Round(panelRadius*scale)));
      Region old=panel.Region;
      if (radius==0) panel.Region=null;
      else {
        int d=radius*2,w=panel.Width,h=panel.Height;
        using (GraphicsPath path=new GraphicsPath()) {
          path.AddArc(0,0,d,d,180,90); path.AddArc(w-d-1,0,d,d,270,90);
          path.AddArc(w-d-1,h-d-1,d,d,0,90); path.AddArc(0,h-d-1,d,d,90,90); path.CloseFigure();
          panel.Region=new Region(path);
        }
      }
      if (old!=null) old.Dispose();
    }
    private async void OpenPanel(bool warm=false) {
      if (opening) { if (!warm) warmShowRequested=true; return; }
      if (panel!=null && !panel.IsDisposed) { if (warmOpen) warmShowRequested=true; PositionPanel(); panel.Opacity=1; panel.ShowInTaskbar=true; panel.Show(); panel.Activate(); if (ready) SendState(""); return; }
      opening=true; ready=false; warmOpen=warm; openClock=Stopwatch.StartNew();
      try {
        HideTab(); panel=new Form(); panel.Text="System controls"; panel.Icon=appIcon; panel.FormBorderStyle=FormBorderStyle.None; panel.ShowInTaskbar=!warm; panel.Opacity=warm?0:1; panel.StartPosition=FormStartPosition.Manual; panel.BackColor=Color.FromArgb(12,13,15); panel.TopMost=settings.TopMost; panel.KeyPreview=true;
        panel.KeyDown+=delegate(object sender,KeyEventArgs e) { if (e.KeyCode==Keys.Escape) ClosePanel(); };
        panel.FormClosing+=delegate(object sender,FormClosingEventArgs e) { if (!shuttingDown) { e.Cancel=true; ClosePanel(); } else { core.RevertResolution(); core.RevertScale(); if (confirmation!=null && !confirmation.IsDisposed) confirmation.Close(); } };
        panel.FormClosed+=delegate { ready=false; if (view!=null) { view.Dispose(); view=null; } panel=null; };
        PositionPanel(); view=new WebView2(); view.Dock=DockStyle.Fill; panel.Controls.Add(view); panel.Show();
        string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SystemAccessibilityUi",sandboxTest?"WebView2SandboxTest":"WebView2");
        CoreWebView2Environment environment=await CoreWebView2Environment.CreateAsync(null,folder); await view.EnsureCoreWebView2Async(environment);
        view.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false; view.CoreWebView2.Settings.AreDevToolsEnabled=false; view.CoreWebView2.Settings.IsWebMessageEnabled=true;
        view.CoreWebView2.SetVirtualHostNameToFolderMapping("system-controls.local",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.DenyCors);
        view.CoreWebView2.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e) { if (!e.Uri.StartsWith("https://system-controls.local/",StringComparison.OrdinalIgnoreCase)) e.Cancel=true; };
        view.CoreWebView2.WebMessageReceived+=OnMessage;
        if (sandboxTest) view.CoreWebView2.NavigationCompleted+=async delegate {
          try {
            await Task.Delay(250);
            string result=await view.ExecuteScriptAsync("({pass:document.getElementById('sandbox-result').dataset.pass,text:document.getElementById('sandbox-result').textContent})");
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"sandbox-test.json"),result);
            if (Convert.ToString(json.Deserialize<Dictionary<string,object>>(result)["pass"])!="true") Environment.ExitCode=1;
          } catch (Exception ex) { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"sandbox-test-error.txt"),ex.ToString()); Environment.ExitCode=1; }
          finally { ExitThread(); }
        };
        view.Source=new Uri("https://system-controls.local/"+(sandboxTest?"sandbox.html":"index.html"));
      } catch (Exception ex) { if (sandboxTest) { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"sandbox-test-error.txt"),ex.ToString()); Environment.ExitCode=1; ExitThread(); } else { MessageBox.Show("The local panel could not open. Check that WebView2 Runtime is installed.\n\n"+ex.Message,"System controls",MessageBoxButtons.OK,MessageBoxIcon.Error); ClosePanel(); } }
      finally { opening=false; }
    }
    private void OpenSettingsPanel() { showSettingsOnReady=true; OpenPanel(); if (ready) { showSettingsOnReady=false; Send(new { type="navigate",view="settings" }); } }
    private async void OnMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e) {
      try { Dictionary<string,object> m=json.Deserialize<Dictionary<string,object>>(e.WebMessageAsJson); string action=Convert.ToString(m["action"]);
        if (action=="ready" || action=="refresh") { ready=true; if (action=="ready" && openClock!=null) { openClock.Stop(); openDurationMs=openClock.ElapsedMilliseconds; openClock=null; } SendState(""); if (showSettingsOnReady) { showSettingsOnReady=false; Send(new { type="navigate",view="settings" }); } if (warmOpen) { warmOpen=false; panel.Opacity=1; if (warmShowRequested) { warmShowRequested=false; panel.ShowInTaskbar=true; panel.Show(); panel.Activate(); } else panel.Hide(); } if (selfTest && action=="ready") RunSelfTest(); return; }
        if (action=="close") { ClosePanel(); return; }
        if (action=="fit") { desiredHeight=Math.Max(120,Math.Min(1600,Convert.ToInt32(m["height"]))); panelRadius=Math.Max(0,Math.Min(48,Convert.ToInt32(m["radius"]))); previewUiScale=Math.Max(60,Math.Min(130,Convert.ToInt32(m["uiScale"]))); PositionPanel(); return; }
        if (action=="drag") { if (panel==null || !panel.Visible) return; string phase=Convert.ToString(m["phase"]); if (phase=="start") { dragStart=panel.Location; return; } if (dragStart.HasValue && (phase=="move" || phase=="end")) { Point next=ClampPanel(new Point(dragStart.Value.X+Math.Max(-4000,Math.Min(4000,Convert.ToInt32(m["dx"]))),dragStart.Value.Y+Math.Max(-4000,Math.Min(4000,Convert.ToInt32(m["dy"])))),screen.WorkingArea); panel.Location=next; draggedLocation=next; if (phase=="end") dragStart=null; } return; }
        if (action=="openDisplay") { OpenWindows("ms-settings:display"); return; }
        if (action=="applyScale") { ControlResult r=core.BeginScale(screen.DeviceName,Convert.ToInt32(m["value"])); Result(r); if (r.Success) { PositionPanel(); SendState(""); ShowScaleConfirmation(); } return; }
        if (action=="openSound") { OpenWindows("ms-settings:sound"); return; }
        if (action=="setVolume") { QueueVolume(Convert.ToInt32(m["value"])); return; }
        if (action=="setMute") { Result(await Task.Run(() => core.SetMute(Convert.ToBoolean(m["value"])))); return; }
        if (action=="selectDevice") { bool input=Convert.ToBoolean(m["input"]); string id=Convert.ToString(m["id"]); ControlResult result=await Task.Run(() => core.SelectDevice(input,id)); SendState(result.Message); return; }
        if (action=="applyResolution") { ControlResult r=core.BeginResolution(screen.DeviceName,Convert.ToString(m["mode"])); Result(r); if (r.Success) ShowResolutionConfirmation(); return; }
        if (action=="saveSettings") { SaveSettings(m); return; }
      } catch (Exception ex) { SendStatus("Action failed: "+ex.Message); }
    }
    private async void QueueVolume(int value) {
      queuedVolume=value;
      if (volumeBusy) return;
      volumeBusy=true;
      try {
        while (queuedVolume.HasValue) {
          int next=queuedVolume.Value; queuedVolume=null;
          ControlResult result=await Task.Run(() => core.SetVolume(next));
          Result(result);
        }
      } catch (Exception ex) { SendStatus("Volume could not be changed: "+ex.Message); }
      finally { volumeBusy=false; }
    }
    private async void RunSelfTest() {
      string root=AppDomain.CurrentDomain.BaseDirectory;
      string errorFile=Path.Combine(root,"selftest-error.txt");
      try {
        if (File.Exists(errorFile)) File.Delete(errorFile);
        await Task.Delay(600);
        using (FileStream capture=File.Create(Path.Combine(root,"controls-preview.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,capture);
        string selectOverlay=await view.ExecuteScriptAsync("(function(){var d=document,s=d.getElementById('resolution');s.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));var menu=d.querySelector('.ts-ui-select__popover');var r=menu&&menu.getBoundingClientRect();var row=d.querySelector('.scale-row'),label=row.querySelector('.field-label'),value=d.getElementById('scale-value');return {portal:!!menu&&menu.parentElement===d.body,options:menu?menu.querySelectorAll('[role=option]').length:0,inside:!!r&&r.top>=0&&r.bottom<=innerHeight+1,aboveModule:!!menu&&getComputedStyle(menu).zIndex==='10000',sameRow:Math.abs(label.getBoundingClientRect().top-value.getBoundingClientRect().top)<18,innerRadius:getComputedStyle(d.querySelector('.module')).borderTopLeftRadius,gearFill:getComputedStyle(d.querySelector('#settings-open svg')).fill}})()");
        Dictionary<string,object> selectData=json.Deserialize<Dictionary<string,object>>(selectOverlay);
        if (!Convert.ToBoolean(selectData["portal"]) || !Convert.ToBoolean(selectData["inside"]) || !Convert.ToBoolean(selectData["aboveModule"]) || Convert.ToInt32(selectData["options"])<2 || !Convert.ToBoolean(selectData["sameRow"]) || Convert.ToString(selectData["innerRadius"])=="0px" || Convert.ToString(selectData["gearFill"])=="none") throw new Exception("Select overlay, scale row, radius, or gear icon failed: "+selectOverlay);
        using (FileStream capture=File.Create(Path.Combine(root,"select-preview.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,capture);
        await view.ExecuteScriptAsync("document.querySelector('.ts-ui-select__popover [role=option]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
        await view.ExecuteScriptAsync("document.getElementById('sound-section').open=true;document.querySelector('.device-inventory').open=true");
        await Task.Delay(120);
        using (FileStream capture=File.Create(Path.Combine(root,"sound-preview.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,capture);
        await view.ExecuteScriptAsync("document.querySelector('.device-inventory').open=false;document.getElementById('display-section').open=true");
        await Task.Delay(120);
        Stopwatch readClock=Stopwatch.StartNew(); ControlSnapshot timingSnapshot=core.Read(screen.DeviceName); readClock.Stop();
        Stopwatch volumeClock=Stopwatch.StartNew(); core.SetVolume(timingSnapshot.Volume); volumeClock.Stop();
        string styleTime=await view.ExecuteScriptAsync("(function(){const target=document.getElementById('resolution');const t=performance.now();for(let i=0;i<500;i++)getComputedStyle(target).borderTopLeftRadius;return Math.round((performance.now()-t)*100)/100})()");
        string scaleMetrics=await view.ExecuteScriptAsync("(function(){const root=document.documentElement;const previous=root.style.getPropertyValue('--ui-scale');const sample=value=>{root.style.setProperty('--ui-scale',value);const h=getComputedStyle(document.querySelector('.app-header'));const title=getComputedStyle(document.querySelector('.heading h1'));const select=getComputedStyle(document.getElementById('resolution'));return {headerPad:parseFloat(h.paddingTop),titleSize:parseFloat(title.fontSize),selectHeight:parseFloat(select.height)}};const normal=sample('1');const compact=sample('.6');root.style.setProperty('--ui-scale',previous);return {normal,compact}})()");
        Dictionary<string,object> metrics=json.Deserialize<Dictionary<string,object>>(scaleMetrics);
        Dictionary<string,object> normal=json.Deserialize<Dictionary<string,object>>(json.Serialize(metrics["normal"]));
        Dictionary<string,object> compact=json.Deserialize<Dictionary<string,object>>(json.Serialize(metrics["compact"]));
        foreach (string key in new [] { "headerPad","titleSize","selectHeight" }) if (Convert.ToDouble(compact[key])>=Convert.ToDouble(normal[key])*.75) throw new Exception("Widget scale did not reduce "+key+".");
        int savedPreviewScale=previewUiScale;
        await view.ExecuteScriptAsync("(r=>{r.dataset.testScale=r.style.getPropertyValue('--ui-scale');r.style.setProperty('--ui-scale','.6')})(document.documentElement)");
        previewUiScale=60; PositionPanel(); int compactWidth=panel.Width; await Task.Delay(120);
        string compactLayout=await view.ExecuteScriptAsync("({bodyWidth:document.body.scrollWidth,viewportWidth:document.documentElement.clientWidth,selectWidth:document.getElementById('resolution').getBoundingClientRect().width})");
        Dictionary<string,object> compactData=json.Deserialize<Dictionary<string,object>>(compactLayout);
        if (Convert.ToDouble(compactData["bodyWidth"])>Convert.ToDouble(compactData["viewportWidth"]) || Convert.ToDouble(compactData["selectWidth"])<80) throw new Exception("Compact widget layout overflows or hides the selector.");
        await view.ExecuteScriptAsync("(r=>{r.style.setProperty('--ui-scale',r.dataset.testScale);delete r.dataset.testScale})(document.documentElement)");
        previewUiScale=100; PositionPanel(); int normalWidth=panel.Width; previewUiScale=savedPreviewScale; PositionPanel();
        if (compactWidth>=normalWidth) throw new Exception("Widget scale did not reduce panel width.");
        int expandedHeight=panel.Height;
        await view.ExecuteScriptAsync("document.getElementById('display-section').open=false;document.getElementById('sound-section').open=false");
        await Task.Delay(300); int collapsedHeight=panel.Height;
        await view.ExecuteScriptAsync("document.getElementById('display-section').open=true;document.getElementById('sound-section').open=true");
        await Task.Delay(300); int restoredHeight=panel.Height;
        if (collapsedHeight>=expandedHeight-80 || restoredHeight<=collapsedHeight+80) throw new Exception("Panel height did not follow accordion state: "+expandedHeight+"/"+collapsedHeight+"/"+restoredHeight);
        await view.ExecuteScriptAsync("document.getElementById('display-section').hidden=true");
        await Task.Delay(300); int hiddenHeight=panel.Height;
        await view.ExecuteScriptAsync("document.getElementById('display-section').hidden=false");
        await Task.Delay(300); if (hiddenHeight>=restoredHeight-80) throw new Exception("Panel height did not follow a hidden module.");
        string controls=await view.ExecuteScriptAsync("(function(){var d=document;var section=d.getElementById('display-section');section.hidden=true;var hiddenDisplay=getComputedStyle(section).display;section.hidden=false;var mute=d.getElementById('mute');var volume=d.getElementById('volume');var selector=getComputedStyle(d.getElementById('resolution'));return {title:d.title,headerTitle:d.querySelector('.heading h1').textContent,selectCursor:selector.cursor,selectRadius:selector.borderTopLeftRadius,displayVisible:!section.hidden,soundVisible:!d.getElementById('sound-section').hidden,hiddenDisplay:hiddenDisplay,monitor:d.getElementById('monitor-name').textContent,scale:d.getElementById('scale-value').textContent,scaleChoices:d.getElementById('scale-select').options.length,scaleControlVisible:!d.getElementById('scale-control').hidden,scaleFallbackHidden:d.getElementById('open-display').hidden,modeCount:d.getElementById('resolution').options.length,output:d.getElementById('output-current').textContent,outputSelectorHidden:d.getElementById('output').hidden,input:d.getElementById('input-current').textContent,inputDisabled:d.getElementById('input').disabled,volume:d.getElementById('volume-value').textContent,volumeFill:volume.style.getPropertyValue('--ts-range-percent'),volumeTrack:getComputedStyle(volume).backgroundImage,muteBorder:getComputedStyle(mute).borderTopWidth,bodyWidth:d.body.scrollWidth,viewportWidth:d.documentElement.clientWidth};})()");
        await view.ExecuteScriptAsync("(function(){var d=document;d.getElementById('volume').dispatchEvent(new Event('input',{bubbles:true}));d.getElementById('mute').dispatchEvent(new Event('change',{bubbles:true}));})()");
        await Task.Delay(600);
        string audioActions=await view.ExecuteScriptAsync("document.getElementById('status').textContent");
        string settingsView=await view.ExecuteScriptAsync("(function(){document.getElementById('settings-open').click();var d=document;return {visible:!d.getElementById('settings-view').hidden,edge:d.getElementById('edge').value,monitorCount:d.getElementById('monitor').options.length,uiScale:d.getElementById('ui-scale').value,delayFill:d.getElementById('delay').style.getPropertyValue('--ts-range-percent'),checkboxCount:d.querySelectorAll('#settings-view input[type=checkbox]').length};})()");
        using (FileStream capture=File.Create(Path.Combine(root,"settings-preview.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,capture);
        string designPreview=await view.ExecuteScriptAsync("(function(){var d=document,p=d.getElementById('design-preset');p.value='compact';p.dispatchEvent(new Event('change',{bubbles:true}));var style=d.documentElement.style;var preview={font:parseFloat(style.getPropertyValue('--ts-fs-base')),spacing:parseFloat(style.getPropertyValue('--ts-sp-base')),inner:parseFloat(style.getPropertyValue('--widget-inner-radius-base')),select:parseFloat(style.getPropertyValue('--widget-select-radius-base'))};d.getElementById('settings-open').click();preview.closed=d.getElementById('settings-view').hidden;preview.pressed=d.getElementById('settings-open').getAttribute('aria-pressed');d.getElementById('settings-open').click();preview.restored=d.getElementById('font-base').value;preview.innerRestored=d.getElementById('inner-radius').value;preview.selectRestored=d.getElementById('select-radius').value;d.querySelector('.settings-scroll').scrollTop=10000;return preview})()");
        await Task.Delay(80);
        using (FileStream capture=File.Create(Path.Combine(root,"settings-bottom-preview.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,capture);
        Dictionary<string,object> designData=json.Deserialize<Dictionary<string,object>>(designPreview);
        if (Convert.ToDouble(designData["font"])!=13 || Convert.ToDouble(designData["spacing"])!=3 || Convert.ToDouble(designData["inner"])!=2 || Convert.ToDouble(designData["select"])!=4 || !Convert.ToBoolean(designData["closed"]) || Convert.ToString(designData["pressed"])!="false" || Convert.ToString(designData["restored"])!=Convert.ToString(settings.FontBase) || Convert.ToString(designData["innerRestored"])!=Convert.ToString(settings.InnerRadius) || Convert.ToString(designData["selectRestored"])!=Convert.ToString(settings.SelectRadius)) throw new Exception("Design preview or settings toggle failed.");
        await view.ExecuteScriptAsync("document.getElementById('save-settings').click()"); await Task.Delay(250);
        string saveStatus=await view.ExecuteScriptAsync("document.getElementById('status').textContent");
        string back=await view.ExecuteScriptAsync("(function(){document.getElementById('settings-open').click();document.getElementById('settings-back').click();var d=document;var h=d.querySelector('.app-header').getBoundingClientRect();var c=d.getElementById('mute');return {visible:!d.getElementById('controls-view').hidden,headerTop:h.top,headerBottom:h.bottom,bodyScroll:d.body.scrollTop,docScroll:d.documentElement.scrollTop,muteWidth:c.getBoundingClientRect().width,muteHeight:c.getBoundingClientRect().height};})()");
        string result="{\"controls\":"+controls+",\"selectOverlay\":"+selectOverlay+",\"scaleMetrics\":"+scaleMetrics+",\"compactLayout\":"+compactLayout+",\"scaleWidths\":{\"normal\":"+normalWidth+",\"compact\":"+compactWidth+"},\"performance\":{\"openToReadyMs\":"+openDurationMs+",\"snapshotMs\":"+readClock.ElapsedMilliseconds+",\"volumeSameValueMs\":"+volumeClock.ElapsedMilliseconds+",\"styleReads500Ms\":"+styleTime+"},\"heights\":{\"expanded\":"+expandedHeight+",\"collapsed\":"+collapsedHeight+",\"restored\":"+restoredHeight+",\"hidden\":"+hiddenHeight+"},\"audioActions\":"+audioActions+",\"settings\":"+settingsView+",\"saveStatus\":"+saveStatus+",\"back\":"+back+"}";
        Dictionary<string,object> controlData=json.Deserialize<Dictionary<string,object>>(controls);
        if (Convert.ToString(controlData["hiddenDisplay"])!="none" || Convert.ToBoolean(controlData["outputSelectorHidden"])==core.CanSetDefaultDevice) throw new Exception("Capability-gated controls do not match the audio backend.");
        if (Convert.ToString(controlData["muteBorder"])=="0px" || Convert.ToInt32(controlData["modeCount"])<1) throw new Exception("A required control is not visible.");
        if (Convert.ToInt32(controlData["bodyWidth"])>Convert.ToInt32(controlData["viewportWidth"])) throw new Exception("Panel overflows horizontally.");
        if (String.IsNullOrWhiteSpace(Convert.ToString(controlData["output"]))) throw new Exception("Output device name is blank.");
        if (Convert.ToInt32(controlData["scaleChoices"])<2 || !Convert.ToBoolean(controlData["scaleControlVisible"]) || !Convert.ToBoolean(controlData["scaleFallbackHidden"])) throw new Exception("Direct scale choices did not initialize.");
        if (!Convert.ToString(controlData["volumeFill"]).EndsWith("%") || !Convert.ToString(controlData["volumeTrack"]).Contains("gradient")) throw new Exception("Volume range styling did not initialize.");
        if (Convert.ToString(controlData["selectCursor"])!="pointer" || Convert.ToString(controlData["selectRadius"])=="0px") throw new Exception("Select affordance did not initialize.");
        if (!Convert.ToBoolean(json.Deserialize<Dictionary<string,object>>(settingsView)["visible"])) throw new Exception("Settings did not open.");
        if (!Convert.ToString(json.Deserialize<Dictionary<string,object>>(settingsView)["delayFill"]).EndsWith("%")) throw new Exception("Reveal delay range did not initialize.");
        if (!Convert.ToString(json.Deserialize<string>(saveStatus)).Contains("Settings saved")) throw new Exception("Settings did not save.");
        if (!Convert.ToBoolean(json.Deserialize<Dictionary<string,object>>(back)["visible"])) throw new Exception("Settings did not return to controls.");
        Point beforeDrag=panel.Location;
        await view.ExecuteScriptAsync("window.chrome.webview.postMessage({action:'drag',phase:'start',dx:0,dy:0});window.chrome.webview.postMessage({action:'drag',phase:'move',dx:0,dy:40});window.chrome.webview.postMessage({action:'drag',phase:'end',dx:0,dy:40})");
        await Task.Delay(120);
        if (panel.Location.Y!=Math.Min(screen.WorkingArea.Bottom-panel.Height,beforeDrag.Y+40)) throw new Exception("Native panel drag did not move within the monitor.");
        draggedLocation=null; PositionPanel();
        ClosePanel(); Stopwatch reopenClock=Stopwatch.StartNew(); OpenPanel(); reopenClock.Stop();
        if (panel==null || !panel.Visible) throw new Exception("Warm panel did not reopen.");
        result=result.Substring(0,result.Length-1)+",\"warmReopenMs\":"+reopenClock.ElapsedMilliseconds+"}";
        File.WriteAllText(Path.Combine(root,"selftest.json"),result);
      } catch (Exception ex) { File.WriteAllText(errorFile,ex.ToString()); Environment.ExitCode=1; }
      finally { ExitThread(); }
    }
    private void Result(ControlResult result) { SendStatus(result.Message); if (!result.Success) SendState(result.Message); }
    private void Send(object data) { if (ready && view!=null && view.CoreWebView2!=null) view.CoreWebView2.PostWebMessageAsJson(json.Serialize(data)); }
    private void SendStatus(string message) { Send(new { type="status",message=message }); }
    private void SendState(string message) {
      try { ControlSnapshot s=core.Read(screen.DeviceName); List<object> modes=new List<object>(),outputs=new List<object>(),inputs=new List<object>(),allOutputs=new List<object>(),allInputs=new List<object>(),monitors=new List<object>();
        foreach (ModeChoice mode in s.Modes) modes.Add(new { id=mode.Id,name=mode.ToString() });
        foreach (AudioChoice d in s.Outputs) outputs.Add(new { id=d.Id,name=d.Name }); foreach (AudioChoice d in s.Inputs) inputs.Add(new { id=d.Id,name=d.Name });
        foreach (AudioChoice d in s.AllOutputs) allOutputs.Add(new { name=d.Name,status=d.Status }); foreach (AudioChoice d in s.AllInputs) allInputs.Add(new { name=d.Name,status=d.Status });
        monitors.Add(new { id="Any",name="Follow pointer" }); foreach (Screen item in Screen.AllScreens) monitors.Add(new { id=item.DeviceName,name=ScreenLabel(item) });
        Send(new { type="state",monitorName=ScreenLabel(screen),scale=s.Scale,scaleChoices=s.ScaleChoices,modes=modes,currentMode=s.CurrentMode.Id,volume=s.Volume,muted=s.Muted,audioAvailable=s.AudioAvailable,outputs=outputs,inputs=inputs,allOutputs=allOutputs,allInputs=allInputs,defaultOutput=s.DefaultOutput,defaultInput=s.DefaultInput,inputStatus=s.InputStatus,edge=settings.Edge,monitors=monitors,selectedMonitor=settings.Monitor,hoverDelay=settings.HoverDelay,uiScale=settings.UiScale,fontBase=settings.FontBase,spacingBase=settings.SpacingBase,panelRadius=settings.PanelRadius,buttonRadius=settings.ButtonRadius,innerRadius=settings.InnerRadius,selectRadius=settings.SelectRadius,accent=settings.Accent,showDisplay=settings.Display,showSound=settings.Sound,topmost=settings.TopMost,startup=settings.StartWithWindows,canSetDefaultDevice=core.CanSetDefaultDevice,message=message });
      } catch (Exception ex) { SendStatus("Could not read system controls: "+ex.Message); }
    }
    private void SaveSettings(Dictionary<string,object> data) {
      string edge=Convert.ToString(data["edge"]), monitor=Convert.ToString(data["monitor"]); if (edge!="Left" && edge!="Right") throw new ArgumentException("Invalid edge.");
      bool valid=monitor=="Any"; foreach (Screen item in Screen.AllScreens) if (item.DeviceName==monitor) valid=true; if (!valid) throw new ArgumentException("The selected monitor is no longer connected.");
      string accent=Convert.ToString(data["accent"]); if (accent!="orange" && accent!="cyan" && accent!="green" && accent!="violet") throw new ArgumentException("Invalid accent color.");
      if (settings.Edge!=edge || settings.Monitor!=monitor) draggedLocation=null;
      settings.Edge=edge; settings.Monitor=monitor; settings.HoverDelay=Math.Max(150,Math.Min(1500,Convert.ToInt32(data["hoverDelay"])));
      settings.UiScale=Math.Max(60,Math.Min(130,Convert.ToInt32(data["uiScale"]))); previewUiScale=settings.UiScale; settings.Display=Convert.ToBoolean(data["showDisplay"]); settings.Sound=Convert.ToBoolean(data["showSound"]);
      settings.FontBase=Math.Max(12,Math.Min(18,Convert.ToInt32(data["fontBase"]))); settings.SpacingBase=Math.Max(2,Math.Min(6,Convert.ToInt32(data["spacingBase"])));
      settings.PanelRadius=Math.Max(0,Math.Min(30,Convert.ToInt32(data["panelRadius"]))); settings.ButtonRadius=Math.Max(0,Math.Min(18,Convert.ToInt32(data["buttonRadius"])));
      settings.InnerRadius=Math.Max(0,Math.Min(18,Convert.ToInt32(data["innerRadius"]))); settings.SelectRadius=Math.Max(0,Math.Min(18,Convert.ToInt32(data["selectRadius"])));
      settings.Accent=accent;
      settings.TopMost=Convert.ToBoolean(data["topmost"]); settings.StartWithWindows=Convert.ToBoolean(data["startup"]); settings.Save(); panel.TopMost=settings.TopMost; PositionPanel(); SendState("Settings saved.");
    }
    private void ShowResolutionConfirmation() {
      confirmation=new Form(); confirmation.Text="Keep this resolution?"; confirmation.Size=new Size(360,170); confirmation.StartPosition=FormStartPosition.CenterScreen; confirmation.TopMost=true; confirmation.FormBorderStyle=FormBorderStyle.FixedDialog; confirmation.MaximizeBox=false; confirmation.MinimizeBox=false;
      Label label=new Label(); label.Text="Keep this resolution? Reverting in 15 seconds."; label.SetBounds(18,18,320,44); confirmation.Controls.Add(label);
      Button keep=new Button(); keep.Text="Keep"; keep.SetBounds(35,78,125,36); confirmation.Controls.Add(keep); Button revert=new Button(); revert.Text="Revert"; revert.SetBounds(190,78,125,36); confirmation.Controls.Add(revert);
      int seconds=15; System.Windows.Forms.Timer tick=new System.Windows.Forms.Timer(); tick.Interval=1000;
      tick.Tick+=delegate { seconds--; label.Text="Keep this resolution? Reverting in "+seconds+" seconds."; if (seconds<=0 || !core.HasPendingResolution) confirmation.Close(); };
      keep.Click+=delegate { Result(core.KeepResolution()); SendState(""); confirmation.Close(); };
      revert.Click+=delegate { Result(core.RevertResolution()); SendState(""); confirmation.Close(); };
      confirmation.FormClosed+=delegate { tick.Stop(); tick.Dispose(); if (core.HasPendingResolution) core.RevertResolution(); confirmation=null; SendState(""); };
      confirmation.Show(panel); tick.Start();
    }
    private void ShowScaleConfirmation() {
      confirmation=new Form(); confirmation.Text="Keep this scale?"; confirmation.Size=new Size(360,170); confirmation.StartPosition=FormStartPosition.CenterScreen; confirmation.TopMost=true; confirmation.FormBorderStyle=FormBorderStyle.FixedDialog; confirmation.MaximizeBox=false; confirmation.MinimizeBox=false;
      Label label=new Label(); label.Text="Keep this scale? Reverting in 15 seconds."; label.SetBounds(18,18,320,44); confirmation.Controls.Add(label);
      Button keep=new Button(); keep.Text="Keep"; keep.SetBounds(35,78,125,36); confirmation.Controls.Add(keep); Button revert=new Button(); revert.Text="Revert"; revert.SetBounds(190,78,125,36); confirmation.Controls.Add(revert);
      int seconds=15; System.Windows.Forms.Timer tick=new System.Windows.Forms.Timer(); tick.Interval=1000;
      tick.Tick+=delegate { seconds--; label.Text="Keep this scale? Reverting in "+seconds+" seconds."; if (seconds<=0 || !core.HasPendingScale) confirmation.Close(); };
      keep.Click+=delegate { Result(core.KeepScale()); SendState(""); confirmation.Close(); };
      revert.Click+=delegate { Result(core.RevertScale()); SendState(""); confirmation.Close(); };
      confirmation.FormClosed+=delegate { tick.Stop(); tick.Dispose(); if (core.HasPendingScale) core.RevertScale(); confirmation=null; PositionPanel(); SendState(""); };
      confirmation.Show(panel); tick.Start();
    }
    private void OpenWindows(string uri) { try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute=true }); } catch (Exception ex) { SendStatus("Could not open Windows Settings: "+ex.Message); } }
    private void ClosePanel() { if (panel==null || panel.IsDisposed) return; core.RevertResolution(); core.RevertScale(); if (confirmation!=null && !confirmation.IsDisposed) confirmation.Close(); previewUiScale=settings.UiScale; panel.Hide(); }
    protected override void ExitThreadCore() { shuttingDown=true; hover.Stop(); if (hotkey!=null) hotkey.Dispose(); if (confirmation!=null && !confirmation.IsDisposed) confirmation.Close(); if (panel!=null && !panel.IsDisposed) panel.Close(); if (tab!=null) tab.Dispose(); core.Dispose(); tray.Visible=false; tray.Dispose(); base.ExitThreadCore(); }
  }
  internal sealed class WebHotkey : NativeWindow, IDisposable {
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hwnd,int id,uint modifiers,uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hwnd,int id);
    private readonly Action action; private bool registered;
    internal WebHotkey(Action action) { this.action=action; CreateHandle(new CreateParams()); registered=RegisterHotKey(Handle,1,3,(uint)Keys.Space); }
    protected override void WndProc(ref Message m) { if (m.Msg==0x312 && m.WParam.ToInt32()==1) action(); base.WndProc(ref m); }
    public void Dispose() { if (registered) UnregisterHotKey(Handle,1); DestroyHandle(); }
  }
}
