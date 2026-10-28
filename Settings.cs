using System;
using System.IO;
using Microsoft.Win32;

namespace SystemAccessibilityUi {
  internal sealed class Settings {
    internal string Edge="Right";
    internal string Monitor="Any";
    internal int HoverDelay=450;
    internal int UiScale=100;
    internal int FontBase=15,SpacingBase=4,PanelRadius=14,ButtonRadius=8,InnerRadius=4,SelectRadius=6;
    internal string Accent="orange";
    internal bool Display=true, Sound=true, TopMost=true, StartWithWindows=false;
    private static string Folder { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"SystemAccessibilityUi"); } }
    private static string PathName { get { return Path.Combine(Folder,"settings.ini"); } }
    internal static Settings Load() { return LoadFromFile(PathName); }
    internal static Settings LoadFromFile(string path) {
      Settings s=new Settings(); string[] lines;
      try { if (!File.Exists(path)) return s; lines=File.ReadAllLines(path); }
      catch { return s; }
      bool hasUiScale=false;
      foreach (string line in lines) {
        int at=line.IndexOf('='); if (at<1) continue; string key=line.Substring(0,at), value=line.Substring(at+1); int number;
        if (key=="Edge" && (value=="Left" || value=="Right")) s.Edge=value;
        if (key=="Monitor" && value.Length<128) s.Monitor=value;
        if (key=="HoverDelay" && int.TryParse(value,out number)) s.HoverDelay=Math.Max(150,Math.Min(1500,number));
        if (key=="UiScale" && int.TryParse(value,out number)) { s.UiScale=Math.Max(60,Math.Min(130,number)); hasUiScale=true; }
        if (key=="FontBase" && int.TryParse(value,out number)) s.FontBase=Math.Max(12,Math.Min(18,number));
        if (key=="SpacingBase" && int.TryParse(value,out number)) s.SpacingBase=Math.Max(2,Math.Min(6,number));
        if (key=="PanelRadius" && int.TryParse(value,out number)) s.PanelRadius=Math.Max(0,Math.Min(30,number));
        if (key=="ButtonRadius" && int.TryParse(value,out number)) s.ButtonRadius=Math.Max(0,Math.Min(18,number));
        if (key=="InnerRadius" && int.TryParse(value,out number)) s.InnerRadius=Math.Max(0,Math.Min(18,number));
        if (key=="SelectRadius" && int.TryParse(value,out number)) s.SelectRadius=Math.Max(0,Math.Min(18,number));
        if (key=="Accent" && (value=="orange" || value=="cyan" || value=="green" || value=="violet")) s.Accent=value;
        if (key=="TextSize" && !hasUiScale && int.TryParse(value,out number)) s.UiScale=Math.Max(60,Math.Min(130,number*10));
        if (key=="Display") s.Display=value=="True";
        if (key=="Sound") s.Sound=value=="True";
        if (key=="TopMost") s.TopMost=value=="True";
        if (key=="StartWithWindows") s.StartWithWindows=value=="True";
      }
      return s;
    }
    internal void Save() {
      SaveToFile(PathName);
      using (RegistryKey key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run",true)) {
        if (key!=null) { if (StartWithWindows) key.SetValue("SystemAccessibilityUi","\""+System.Windows.Forms.Application.ExecutablePath+"\""); else key.DeleteValue("SystemAccessibilityUi",false); }
      }
    }
    internal void SaveToFile(string path) {
      string directory=Path.GetDirectoryName(path); if (!String.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
      File.WriteAllLines(path,new string[] { "Edge="+Edge,"Monitor="+Monitor,"HoverDelay="+HoverDelay,"UiScale="+UiScale,"FontBase="+FontBase,"SpacingBase="+SpacingBase,"PanelRadius="+PanelRadius,"ButtonRadius="+ButtonRadius,"InnerRadius="+InnerRadius,"SelectRadius="+SelectRadius,"Accent="+Accent,"Display="+Display,"Sound="+Sound,"TopMost="+TopMost,"StartWithWindows="+StartWithWindows });
    }
  }
}
