Add-Type -AssemblyName System.Security

# 1. Decrypt Master Key
$localState = Get-Content "C:\Users\NT\AppData\Local\Google\Chrome\User Data\Local State" -Raw | ConvertFrom-Json
$encKey = [System.Convert]::FromBase64String($localState.os_crypt.encrypted_key)
$keyBytes = $encKey[5..($encKey.Length - 1)]
$masterKey = [System.Security.Cryptography.ProtectedData]::Unprotect($keyBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)

# 2. Check SQLite Cookies in Profile 1 and Default
$profiles = @("Default", "Profile 1")
foreach ($p in $profiles) {
    $cookiePath = "C:\Users\NT\AppData\Local\Google\Chrome\User Data\$p\Network\Cookies"
    if (Test-Path $cookiePath) {
        Write-Host "Found Cookies database in: $p"
        $temp = "$env:TEMP\cookies_$p.db"
        Copy-Item $cookiePath $temp -Force
        
        # Test reading file length
        $info = Get-Item $temp
        Write-Host "Size: $($info.Length) bytes"
    }
}
