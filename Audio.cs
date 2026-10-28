using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace SystemAccessibilityUi {
  internal static class Audio {
    internal sealed class Device { internal string Id; internal string Name, Status; public override string ToString() { return Name; } }
    private const uint Active=1, AllContexts=23;
    private static readonly Guid EnumeratorId=new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private static readonly PROPERTYKEY FriendlyName=new PROPERTYKEY { fmtid=new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), pid=14 };
    [StructLayout(LayoutKind.Sequential)] private struct PROPERTYKEY { public Guid fmtid; public uint pid; }
    [StructLayout(LayoutKind.Explicit)] private struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr value; }
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PROPVARIANT value);
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator {
      [PreserveSig] int EnumAudioEndpoints(int flow,uint state,out IMMDeviceCollection devices);
      [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);
      [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id,out IMMDevice device);
      [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
      [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
    }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection { [PreserveSig] int GetCount(out uint count); [PreserveSig] int Item(uint index,out IMMDevice device); }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice {
      [PreserveSig] int Activate(ref Guid iid,uint context,IntPtr activation,[MarshalAs(UnmanagedType.IUnknown)] out object value);
      [PreserveSig] int OpenPropertyStore(uint access,out IntPtr store);
      [PreserveSig] int GetId(out IntPtr id);
      [PreserveSig] int GetState(out uint state);
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore {
      [PreserveSig] int GetCount(out uint count);
      [PreserveSig] int GetAt(uint index,out PROPERTYKEY key);
      [PreserveSig] int GetValue(ref PROPERTYKEY key,out PROPVARIANT value);
      [PreserveSig] int SetValue(ref PROPERTYKEY key,ref PROPVARIANT value);
      [PreserveSig] int Commit();
    }
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume {
      [PreserveSig] int RegisterControlChangeNotify(IntPtr callback);
      [PreserveSig] int UnregisterControlChangeNotify(IntPtr callback);
      [PreserveSig] int GetChannelCount(out uint count);
      [PreserveSig] int SetMasterVolumeLevel(float level,IntPtr context);
      [PreserveSig] int SetMasterVolumeLevelScalar(float level,IntPtr context);
      [PreserveSig] int GetMasterVolumeLevel(out float level);
      [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
      [PreserveSig] int SetChannelVolumeLevel(uint channel,float level,IntPtr context);
      [PreserveSig] int SetChannelVolumeLevelScalar(uint channel,float level,IntPtr context);
      [PreserveSig] int GetChannelVolumeLevel(uint channel,out float level);
      [PreserveSig] int GetChannelVolumeLevelScalar(uint channel,out float level);
      [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute,IntPtr context);
      [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }
    // Windows 10 exposes default-device selection through this private COM contract.
    // Probe before enabling the UI and verify each role after a change.
    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    private class PolicyConfigClient { }
    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig {
      [PreserveSig] int GetMixFormat(IntPtr id,IntPtr format);
      [PreserveSig] int GetDeviceFormat(IntPtr id,int useDefault,IntPtr format);
      [PreserveSig] int ResetDeviceFormat(IntPtr id);
      [PreserveSig] int SetDeviceFormat(IntPtr id,IntPtr endpointFormat,IntPtr mixFormat);
      [PreserveSig] int GetProcessingPeriod(IntPtr id,int useDefault,IntPtr defaultPeriod,IntPtr minimumPeriod);
      [PreserveSig] int SetProcessingPeriod(IntPtr id,IntPtr period);
      [PreserveSig] int GetShareMode(IntPtr id,IntPtr mode);
      [PreserveSig] int SetShareMode(IntPtr id,IntPtr mode);
      [PreserveSig] int GetPropertyValue(IntPtr id,IntPtr key,IntPtr value);
      [PreserveSig] int SetPropertyValue(IntPtr id,IntPtr key,IntPtr value);
      [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id,int role);
      [PreserveSig] int SetEndpointVisibility(IntPtr id,int visible);
    }
    private static readonly Lazy<bool> PolicyAvailable=new Lazy<bool>(ProbePolicy);
    private static bool ProbePolicy() {
      try { IPolicyConfig policy=(IPolicyConfig)new PolicyConfigClient(); Marshal.ReleaseComObject(policy); return true; }
      catch (COMException) { return false; }
      catch (InvalidCastException) { return false; }
      catch (TypeLoadException) { return false; }
    }
    internal static bool CanSetDefaultDevice { get { return PolicyAvailable.Value; } }
    internal static void SetDefaultDevice(bool input,string id) {
      if (!CanSetDefaultDevice) throw new NotSupportedException("Direct audio device switching is unavailable on this Windows build.");
      List<Device> devices=Devices(input);
      if (!devices.Exists(d => d.Id==id)) throw new ArgumentException("The selected audio device is no longer active.");
      string[] before=new string[3];
      for (int role=0;role<3;role++) try { before[role]=DefaultId(input,role); } catch (COMException) { before[role]=null; }
      IPolicyConfig policy=(IPolicyConfig)new PolicyConfigClient();
      try {
        try {
          for (int role=0;role<3;role++) Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id,role));
          for (int role=0;role<3;role++) if (DefaultId(input,role)!=id) throw new InvalidOperationException("Windows did not confirm the selected audio device.");
        } catch {
          for (int role=0;role<3;role++) if (before[role]!=null) try { policy.SetDefaultEndpoint(before[role],role); } catch { }
          throw;
        }
      } finally { Marshal.ReleaseComObject(policy); }
    }
    private static IMMDeviceEnumerator Enumerator() { return (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(EnumeratorId)); }
    private static string Id(IMMDevice device) { IntPtr p; Marshal.ThrowExceptionForHR(device.GetId(out p)); try { return Marshal.PtrToStringUni(p); } finally { Marshal.FreeCoTaskMem(p); } }
    private static string Name(IMMDevice device) {
      IntPtr pointer; if (device.OpenPropertyStore(0,out pointer)!=0 || pointer==IntPtr.Zero) return "Audio device";
      IPropertyStore store=(IPropertyStore)Marshal.GetObjectForIUnknown(pointer); Marshal.Release(pointer);
      try { PROPVARIANT value; PROPERTYKEY key=FriendlyName;
        if (store.GetValue(ref key,out value)!=0) return "Audio device";
        try { return value.vt==31 ? Marshal.PtrToStringUni(value.value) : "Audio device"; }
        finally { PropVariantClear(ref value); }
      } finally { if (store!=null) Marshal.ReleaseComObject(store); }
    }
    internal static List<Device> Devices(bool input) { return Devices(input,Active); }
    internal static List<Device> AllDevices(bool input) { return Devices(input,15); }
    private static List<Device> Devices(bool input,uint states) {
      List<Device> result=new List<Device>(); IMMDeviceEnumerator e=Enumerator(); IMMDeviceCollection collection=null;
      try { Marshal.ThrowExceptionForHR(e.EnumAudioEndpoints(input?1:0,states,out collection)); uint count; Marshal.ThrowExceptionForHR(collection.GetCount(out count));
        for (uint i=0;i<count;i++) { IMMDevice item; if (collection.Item(i,out item)==0) { try { uint state; Marshal.ThrowExceptionForHR(item.GetState(out state)); result.Add(new Device { Id=Id(item), Name=Name(item), Status=state==1?"Active":state==2?"Disabled":state==4?"Not present":state==8?"Unplugged":"Unavailable" }); } finally { Marshal.ReleaseComObject(item); } } }
      } finally { if (collection!=null) Marshal.ReleaseComObject(collection); Marshal.ReleaseComObject(e); }
      return result;
    }
    internal static string DefaultId(bool input) { return DefaultId(input,1); }
    private static string DefaultId(bool input,int role) { IMMDeviceEnumerator e=Enumerator(); try { IMMDevice d; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(input?1:0,role,out d)); try { return Id(d); } finally { Marshal.ReleaseComObject(d); } } finally { Marshal.ReleaseComObject(e); } }
    private static IAudioEndpointVolume Volume() {
      IMMDeviceEnumerator e=Enumerator(); IMMDevice d;
      try { Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0,1,out d)); } finally { Marshal.ReleaseComObject(e); }
      try { Guid iid=typeof(IAudioEndpointVolume).GUID; object obj; Marshal.ThrowExceptionForHR(d.Activate(ref iid,AllContexts,IntPtr.Zero,out obj)); return (IAudioEndpointVolume)obj; }
      finally { Marshal.ReleaseComObject(d); }
    }
    internal static int GetVolume() { IAudioEndpointVolume v=Volume(); try { float n; Marshal.ThrowExceptionForHR(v.GetMasterVolumeLevelScalar(out n)); return (int)Math.Round(n*100); } finally { Marshal.ReleaseComObject(v); } }
    internal static void SetVolume(int percent) { IAudioEndpointVolume v=Volume(); try { Marshal.ThrowExceptionForHR(v.SetMasterVolumeLevelScalar(Math.Max(0,Math.Min(100,percent))/100f,IntPtr.Zero)); } finally { Marshal.ReleaseComObject(v); } }
    internal static bool GetMute() { IAudioEndpointVolume v=Volume(); try { bool mute; Marshal.ThrowExceptionForHR(v.GetMute(out mute)); return mute; } finally { Marshal.ReleaseComObject(v); } }
    internal static void SetMute(bool mute) { IAudioEndpointVolume v=Volume(); try { Marshal.ThrowExceptionForHR(v.SetMute(mute,IntPtr.Zero)); } finally { Marshal.ReleaseComObject(v); } }
  }
}
