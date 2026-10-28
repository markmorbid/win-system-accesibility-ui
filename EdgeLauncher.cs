using System;
using System.Drawing;

namespace SystemAccessibilityUi {
  internal static class EdgeLauncher {
    internal static bool InHotZone(Rectangle workingArea,Point cursor,string edge,int width) {
      if (cursor.Y<workingArea.Top || cursor.Y>=workingArea.Bottom) return false;
      if (edge=="Left") return cursor.X>=workingArea.Left && cursor.X<workingArea.Left+width;
      return cursor.X>=workingArea.Right-width && cursor.X<workingArea.Right;
    }
    internal static Rectangle TabBounds(Rectangle workingArea,Point cursor,string edge,Size size) {
      int x=edge=="Left"?workingArea.Left:workingArea.Right-size.Width;
      int y=Math.Max(workingArea.Top,Math.Min(workingArea.Bottom-size.Height,cursor.Y-size.Height/2));
      return new Rectangle(x,y,size.Width,size.Height);
    }
  }
}
