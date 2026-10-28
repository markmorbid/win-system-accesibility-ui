using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace SystemAccessibilityUi {
  internal static class Display {
    internal sealed class Mode {
      internal DEVMODE Data;
      public override string ToString() { return Data.dmPelsWidth + " × " + Data.dmPelsHeight + "  ·  " + Data.dmDisplayFrequency + " Hz"; }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct DEVMODE {
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
      public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
      public uint dmFields;
      public int dmPositionX, dmPositionY;
      public uint dmDisplayOrientation, dmDisplayFixedOutput;
      public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
      public ushort dmLogPixels;
      public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
      public uint dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool EnumDisplaySettings(string name, int mode, ref DEVMODE data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int ChangeDisplaySettingsEx(string name, ref DEVMODE data, IntPtr hwnd, uint flags, IntPtr parameters);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(POINT point, uint flags);
    [DllImport("shcore.dll")] private static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint x, out uint y);
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; public POINT(int x, int y) { X=x; Y=y; } }
    private static DEVMODE Blank() { DEVMODE d = new DEVMODE(); d.dmSize = (ushort)Marshal.SizeOf(typeof(DEVMODE)); return d; }
    internal static Mode Current(string device) {
      DEVMODE d=Blank();
      if (!EnumDisplaySettings(device, -1, ref d)) throw new InvalidOperationException("Windows could not read this display.");
      return new Mode { Data=d };
    }
    internal static List<Mode> Modes(string device) {
      List<Mode> result=new List<Mode>(); HashSet<string> seen=new HashSet<string>();
      for (int i=0; i<2048; i++) {
        DEVMODE d=Blank(); if (!EnumDisplaySettings(device, i, ref d)) break;
        if (d.dmPelsWidth<1024 || d.dmPelsHeight<768 || d.dmBitsPerPel<24) continue;
        string key=d.dmPelsWidth+":"+d.dmPelsHeight+":"+d.dmDisplayFrequency;
        if (seen.Add(key)) result.Add(new Mode { Data=d });
      }
      result.Sort(delegate(Mode a, Mode b) { int n=b.Data.dmPelsWidth.CompareTo(a.Data.dmPelsWidth); return n!=0?n:b.Data.dmPelsHeight.CompareTo(a.Data.dmPelsHeight); });
      return result;
    }
    internal static int Test(string device, Mode mode) { DEVMODE d=mode.Data; return ChangeDisplaySettingsEx(device,ref d,IntPtr.Zero,2,IntPtr.Zero); }
    internal static int Apply(string device, Mode mode, bool persist) { DEVMODE d=mode.Data; return ChangeDisplaySettingsEx(device,ref d,IntPtr.Zero,persist?1u:0u,IntPtr.Zero); }
    internal static int ScalePercent(Screen screen) {
      try { IntPtr h=MonitorFromPoint(new POINT(screen.Bounds.Left+1,screen.Bounds.Top+1),2); uint x,y; if (GetDpiForMonitor(h,0,out x,out y)==0) return (int)Math.Round(x*100.0/96.0); } catch (DllNotFoundException) {} catch (EntryPointNotFoundException) {}
      return 0;
    }
  }
}
