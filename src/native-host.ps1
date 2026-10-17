$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DoodleNative {
 public struct POINT { public int X; public int Y; public POINT(int x,int y){X=x;Y=y;} }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint command);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
}
'@
$null = [DoodleNative]::SetProcessDPIAware()
$shortcuts = @{close_tab='^w';new_tab='^t';undo='^z';redo='^y';save='^s';copy='^c';paste='^v';select_all='^a';switch_window='%{TAB}'}
$sender = New-Object -ComObject WScript.Shell
function Get-DoodleTabs([IntPtr]$handle) {
    try {
        $root=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
        $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)
        return @($root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition))
    } catch { return @() }
}
function Get-DoodleProcess([IntPtr]$handle) {
    [uint32]$processId=0; $null=[DoodleNative]::GetWindowThreadProcessId($handle,[ref]$processId)
    try { return Get-Process -Id $processId -ErrorAction Stop } catch { return $null }
}
function Test-DoodleBrowser([IntPtr]$handle) {
    if($handle -eq [IntPtr]::Zero){return $false}
    $process=Get-DoodleProcess $handle
    return $null -ne $process -and $process.ProcessName -eq 'msedge'
}
function Focus-DoodleWindow([IntPtr]$handle) {
    if([DoodleNative]::IsIconic($handle)){$null=[DoodleNative]::ShowWindow($handle,9)}
    $null=[DoodleNative]::SetForegroundWindow($handle)
    for($i=0;$i -lt 5;$i++) {
        if([DoodleNative]::GetForegroundWindow() -eq $handle){return}
        $process=Get-DoodleProcess $handle
        if($process){$null=$sender.AppActivate($process.Id)}
        Start-Sleep -Milliseconds 60
    }
    if([DoodleNative]::GetForegroundWindow() -ne $handle){throw 'Could not focus the target window. Click it and try again.'}
}
function Close-DoodleTab($request) {
    $tab=$null; $handle=[IntPtr]::Zero
    if($null -ne $request.x -and $null -ne $request.y){
        $point=New-Object DoodleNative+POINT([int]$request.x,[int]$request.y)
        $handle=[DoodleNative]::GetAncestor([DoodleNative]::WindowFromPoint($point),2)
        if(!(Test-DoodleBrowser $handle)){throw 'Draw the X over a Microsoft Edge tab. Doodle Do cannot close itself.'}
        $element=[System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point([double]$request.x,[double]$request.y)))
        for($i=0;$i -lt 12 -and $null -ne $element;$i++){
            if($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem){$tab=$element;break}
            if($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window){break}
            $element=[System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($element)
        }
    }
    if($tab){
        $name=$tab.Current.Name; $runtime=$tab.GetRuntimeId() -join ','
        $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
        $close=@($tab.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)) | Where-Object { $_.Current.Name -match '^(Close|Close tab|Close .+ tab|Close tab .+|Close .+)$' } | Select-Object -First 1
        $invoke=$null
        if($close -and $close.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)) {
            $invoke.Invoke()
            for($i=0;$i -lt 20;$i++){
                Start-Sleep -Milliseconds 50
                $stillThere=$false
                foreach($item in @(Get-DoodleTabs $handle)){try{if(($item.GetRuntimeId() -join ',') -eq $runtime){$stillThere=$true;break}}catch{}}
                if(!$stillThere){return "Closed tab: $name"}
            }
            throw 'The browser did not confirm that the tab closed.'
        }
        $select=$null
        if($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$select)){$select.Select()}
        elseif(Test-DoodleBrowser $handle){
            $r=$tab.Current.BoundingRectangle;$null=[DoodleNative]::SetCursorPos([int]($r.X+$r.Width/2),[int]($r.Y+$r.Height/2));[DoodleNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[DoodleNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        }
    }
    if($request.strictTarget -and !$tab){throw 'No tab was found at the test drawing position.'}
    if(!(Test-DoodleBrowser $handle)){
        $handle=[IntPtr][long]$request.handle
        if(!(Test-DoodleBrowser $handle)){$handle=[DoodleNative]::GetForegroundWindow()}
        if(!(Test-DoodleBrowser $handle)){
            $handle=[DoodleNative]::GetTopWindow([IntPtr]::Zero)
            for($i=0;$i -lt 300 -and $handle -ne [IntPtr]::Zero;$i++){
                if([DoodleNative]::IsWindowVisible($handle) -and (Test-DoodleBrowser $handle)){break}
                $handle=[DoodleNative]::GetWindow($handle,2)
            }
        }
    }
    if(!(Test-DoodleBrowser $handle)){throw 'No Microsoft Edge window found. Open an Edge tab and try again.'}
    $before=@(Get-DoodleTabs $handle).Count
    Focus-DoodleWindow $handle
    $sender.SendKeys('^w')
    for($i=0;$i -lt 20;$i++){
        Start-Sleep -Milliseconds 50
        if(![DoodleNative]::IsWindow($handle)){return 'Closed the last browser tab.'}
        if($before -gt 0 -and @(Get-DoodleTabs $handle).Count -lt $before){return 'Closed browser tab.'}
    }
    if($before -eq 0){return 'Sent close-tab shortcut to your browser.'}
    throw 'The browser did not confirm that the tab closed.'
}
while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
        $request = $line | ConvertFrom-Json
        $result = 'Done.'
        switch ($request.method) {
            'foreground' { $result = [DoodleNative]::GetForegroundWindow().ToInt64() }
            'window-for-process' { $process=Get-Process -Id ([int]$request.processId);$process.Refresh();$result=$process.MainWindowHandle.ToInt64() }
            'close-tab' { $result=Close-DoodleTab $request }
            'tabs' {
                $handle=[IntPtr][long]$request.handle
                $result=@(Get-DoodleTabs $handle | ForEach-Object { $r=$_.Current.BoundingRectangle;[pscustomobject]@{name=$_.Current.Name;x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height} })
            }
            'focus' { $h = [IntPtr][long]$request.handle; if (![DoodleNative]::IsWindow($h)) { throw 'The target window is no longer open.' }; Focus-DoodleWindow $h }
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
