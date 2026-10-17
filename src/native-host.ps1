$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DoodleNative {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
$null = [DoodleNative]::SetProcessDPIAware()
$shortcuts = @{close_tab='^w';new_tab='^t';undo='^z';redo='^y';save='^s';copy='^c';paste='^v';select_all='^a';switch_window='%{TAB}'}
$sender = New-Object -ComObject WScript.Shell
while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
        $request = $line | ConvertFrom-Json
        $result = 'Done.'
        switch ($request.method) {
            'foreground' { $result = [DoodleNative]::GetForegroundWindow().ToInt64() }
            'focus' { $h = [IntPtr][long]$request.handle; if ([DoodleNative]::IsWindow($h)) { $null = [DoodleNative]::SetForegroundWindow($h) } }
            'click' {
                $null = [DoodleNative]::SetCursorPos([int]$request.x,[int]$request.y)
                $buttons = @{middle=@(0x20,0x40);left=@(0x02,0x04);right=@(0x08,0x10)}
                if (!$buttons.ContainsKey([string]$request.button)) { throw 'Unknown mouse button' }
                foreach($flag in $buttons[[string]$request.button]) { [DoodleNative]::mouse_event($flag,0,0,0,[UIntPtr]::Zero) }
            }
            'keys' {
                $key = [string]$request.value
                if ($shortcuts.ContainsKey($key)) { $sender.SendKeys($shortcuts[$key]) }
                elseif ($key -eq 'show_desktop') { (New-Object -ComObject Shell.Application).ToggleDesktop() }
                else {
                    $volume = @{volume_up=175;volume_down=174;mute=173}
                    if (!$volume.ContainsKey($key)) { throw 'Unknown shortcut' }
                    [DoodleNative]::keybd_event($volume[$key],0,0,[UIntPtr]::Zero)
                    [DoodleNative]::keybd_event($volume[$key],0,2,[UIntPtr]::Zero)
                }
            }
            default { throw 'Unknown native operation' }
        }
        [Console]::WriteLine((@{id=$request.id;result=$result} | ConvertTo-Json -Compress))
    } catch { [Console]::WriteLine((@{id=$request.id;error=$_.Exception.Message} | ConvertTo-Json -Compress)) }
}
