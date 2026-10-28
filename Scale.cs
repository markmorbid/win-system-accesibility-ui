using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace SystemAccessibilityUi {
  // Windows Settings uses private DisplayConfig request types -3/-4 for source DPI.
  // These are not part of Microsoft's public contract, so every packet and value is checked.
  internal static class Scale {
    private static readonly int[] Steps={100,125,150,175,200,225,250,300,350,400,450,500};
    [StructLayout(LayoutKind.Sequential)] internal struct Luid { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential)] private struct Header { public int Type; public uint Size; public Luid Adapter; public uint Id; }
    [StructLayout(LayoutKind.Sequential)] private struct Source { public Luid Adapter; public uint Id,Mode,Status; }
    [StructLayout(LayoutKind.Sequential)] private struct Target { public Luid Adapter; public uint Id,Mode,Technology,Rotation,Scaling,RefreshNumerator,RefreshDenominator,Scanline,Available,Status; }
    [StructLayout(LayoutKind.Sequential)] private struct Path { public Source Source; public Target Target; public uint Flags; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct SourceName { public Header Header; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string Name; }
    [StructLayout(LayoutKind.Sequential)] private struct GetPacket { public Header Header; public int Minimum,Current,Maximum; }
    [StructLayout(LayoutKind.Sequential)] private struct SetPacket { public Header Header; public int Relative; }
    [DllImport("user32.dll")] private static extern int GetDisplayConfigBufferSizes(uint flags,out uint paths,out uint modes);
    [DllImport("user32.dll")] private static extern int QueryDisplayConfig(uint flags,ref uint paths,IntPtr pathArray,ref uint modes,IntPtr modeArray,IntPtr topology);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int DisplayConfigGetDeviceInfo(ref SourceName packet);
    [DllImport("user32.dll")] private static extern int DisplayConfigGetDeviceInfo(ref GetPacket packet);
    [DllImport("user32.dll")] private static extern int DisplayConfigSetDeviceInfo(ref SetPacket packet);
    internal sealed class Info { internal int Current,Recommended; internal List<int> Choices=new List<int>(); internal Luid Adapter; internal uint SourceId; internal int RecommendedIndex; }
    private static bool SizesValid() { return Marshal.SizeOf(typeof(Header))==20 && Marshal.SizeOf(typeof(Path))==72 && Marshal.SizeOf(typeof(SourceName))==84 && Marshal.SizeOf(typeof(GetPacket))==32 && Marshal.SizeOf(typeof(SetPacket))==24; }
    private static bool FindSource(string device,out Luid adapter,out uint id) {
      adapter=new Luid(); id=0;
      if (!SizesValid()) return false;
      uint pathCount,modeCount;
      if (GetDisplayConfigBufferSizes(2,out pathCount,out modeCount)!=0 || pathCount==0 || pathCount>64 || modeCount==0 || modeCount>256) return false;
      IntPtr paths=Marshal.AllocHGlobal((int)pathCount*72),modes=Marshal.AllocHGlobal((int)modeCount*64);
      try {
        if (QueryDisplayConfig(2,ref pathCount,paths,ref modeCount,modes,IntPtr.Zero)!=0) return false;
        for (int i=0;i<pathCount;i++) {
          Path path=(Path)Marshal.PtrToStructure(IntPtr.Add(paths,i*72),typeof(Path));
          SourceName name=new SourceName(); name.Header.Type=1; name.Header.Size=84; name.Header.Adapter=path.Source.Adapter; name.Header.Id=path.Source.Id;
          if (DisplayConfigGetDeviceInfo(ref name)==0 && String.Equals(name.Name,device,StringComparison.OrdinalIgnoreCase)) { adapter=path.Source.Adapter; id=path.Source.Id; return true; }
        }
        return false;
      } finally { Marshal.FreeHGlobal(paths); Marshal.FreeHGlobal(modes); }
    }
    internal static Info Probe(string device) {
      try { return ProbeCore(device); }
      catch (DllNotFoundException) { return null; }
      catch (EntryPointNotFoundException) { return null; }
      catch (SEHException) { return null; }
    }
    private static Info ProbeCore(string device) {
      Luid adapter; uint sourceId;
      if (!FindSource(device,out adapter,out sourceId)) return null;
      GetPacket packet=new GetPacket(); packet.Header.Type=-3; packet.Header.Size=32; packet.Header.Adapter=adapter; packet.Header.Id=sourceId;
      if (DisplayConfigGetDeviceInfo(ref packet)!=0) return null;
      int recommended=-packet.Minimum;
      if (packet.Minimum>0 || packet.Maximum<0 || recommended<0 || recommended>=Steps.Length || recommended+packet.Maximum>=Steps.Length || packet.Current<packet.Minimum || packet.Current>packet.Maximum) return null;
      Info info=new Info(); info.Adapter=adapter; info.SourceId=sourceId; info.RecommendedIndex=recommended; info.Recommended=Steps[recommended]; info.Current=Steps[recommended+packet.Current];
      for (int relative=packet.Minimum;relative<=packet.Maximum;relative++) info.Choices.Add(Steps[recommended+relative]);
      return info;
    }
    internal static bool Apply(string device,int percent) {
      Info info=Probe(device); if (info==null || !info.Choices.Contains(percent)) return false;
      int index=Array.IndexOf(Steps,percent); if (index<0) return false;
      SetPacket packet=new SetPacket(); packet.Header.Type=-4; packet.Header.Size=24; packet.Header.Adapter=info.Adapter; packet.Header.Id=info.SourceId; packet.Relative=index-info.RecommendedIndex;
      return DisplayConfigSetDeviceInfo(ref packet)==0;
    }
  }
}
