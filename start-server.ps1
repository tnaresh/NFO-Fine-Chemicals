$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$dataPath = Join-Path $root "data\production-items.json"
$seedPath = Join-Path $root "data\production-items.example.json"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$legacyJsonSerializer = $null

if ($PSVersionTable.PSVersion.Major -lt 3) {
  try {
    Add-Type -AssemblyName System.Web.Extensions
    $legacyJsonSerializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $legacyJsonSerializer.MaxJsonLength = 10485760
  } catch {
    throw "Windows PowerShell 2 requires the .NET Framework System.Web.Extensions assembly to read and write JSON: $($_.Exception.Message)"
  }
}

function ConvertFrom-JsonText([string]$text) {
  if ($legacyJsonSerializer) {
    return ,$legacyJsonSerializer.DeserializeObject($text)
  }

  return ConvertFrom-Json -InputObject $text
}

function ConvertTo-JsonText($value) {
  if ($legacyJsonSerializer) {
    return $legacyJsonSerializer.Serialize($value)
  }

  return ConvertTo-Json -InputObject $value -Depth 10 -Compress
}

function Get-ProductionItems {
  $contents = [System.IO.File]::ReadAllText($dataPath)
  $parsed = ConvertFrom-JsonText $contents
  if ($parsed -isnot [System.Array]) {
    throw "The production data file must contain a JSON array."
  }

  foreach ($item in $parsed) {
    if ([string]::IsNullOrWhiteSpace([string]$item.id) -or
        [string]::IsNullOrWhiteSpace([string]$item.product)) {
      throw "Every production record must have an id and product name."
    }
  }

  return $parsed
}

function Save-ProductionItems([object[]]$items) {
  $json = ConvertTo-JsonText -value @($items)
  $temporaryPath = "$dataPath.$([Guid]::NewGuid().ToString('N')).tmp"
  [System.IO.File]::WriteAllText($temporaryPath, $json, $utf8)
  Move-Item -LiteralPath $temporaryPath -Destination $dataPath -Force
}

function Send-Json($context, [int]$statusCode, $value) {
  $body = ConvertTo-JsonText -value $value
  $bytes = $utf8.GetBytes($body)
  $context.Response.StatusCode = $statusCode
  $context.Response.ContentType = "application/json; charset=utf-8"
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Read-RequestJson($request) {
  $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
  try {
    return ConvertFrom-JsonText $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Get-ContentType([string]$extension) {
  switch ($extension.ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".jpeg" { return "image/jpeg" }
    ".jpg" { return "image/jpeg" }
    default { return "application/octet-stream" }
  }
}

if (-not (Test-Path -LiteralPath $dataPath -PathType Leaf)) {
  if (-not (Test-Path -LiteralPath $seedPath -PathType Leaf)) {
    throw "Missing JSON data and seed files: $dataPath"
  }
  Copy-Item -LiteralPath $seedPath -Destination $dataPath
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")

try {
  $listener.Start()
  Write-Host "Neo Fine Chemicals is running at http://localhost:8000/"
  Write-Host "Shared records are stored in data\production-items.json. Keep this window open while using the app."
  Write-Host "Press Ctrl+C to stop the server."
  $browserPaths = @()
  if ($env:ProgramFiles) {
    $browserPaths += Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
    $browserPaths += Join-Path $env:ProgramFiles "Mozilla Firefox\firefox.exe"
  }
  if (${env:ProgramFiles(x86)}) {
    $browserPaths += Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
    $browserPaths += Join-Path ${env:ProgramFiles(x86)} "Mozilla Firefox\firefox.exe"
  }
  if ($env:LOCALAPPDATA) {
    $browserPaths += Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"
    $browserPaths += Join-Path $env:LOCALAPPDATA "Mozilla Firefox\firefox.exe"
  }
  $browserPath = $browserPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if ($browserPath) {
    Start-Process -FilePath $browserPath -ArgumentList "http://localhost:8000/"
  } else {
    Write-Warning "Chrome or Firefox was not found. Internet Explorer is not supported. Open http://localhost:8000/ in an installed Chrome or Firefox browser."
  }

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimEnd("/")
      if ([string]::IsNullOrEmpty($path)) { $path = "/" }
      $method = $context.Request.HttpMethod

      if ($path -eq "/api/auth/status" -and $method -eq "GET") {
        Send-Json $context 200 @{ required = $false }
      } elseif ($path -eq "/api/items") {
        $items = @(Get-ProductionItems)
        if ($method -eq "GET") {
          Send-Json $context 200 $items
        } elseif ($method -eq "POST") {
          $record = Read-RequestJson $context.Request
          if ([string]::IsNullOrWhiteSpace([string]$record.product)) {
            Send-Json $context 400 @{ error = "Product name is required." }
          } else {
            $created = @{
              id = [Guid]::NewGuid().ToString()
              product = [string]$record.product
              cas = [string]$record.cas
              cat = [string]$record.cat
              batch = [string]$record.batch
              formula = [string]$record.formula
              weight = [string]$record.weight
              density = [string]$record.density
              pack = [string]$record.pack
              mfgDate = [string]$record.mfgDate
              retestDate = [string]$record.retestDate
            }
            Save-ProductionItems -items (@($created) + $items)
            Send-Json $context 201 $created
          }
        } else {
          Send-Json $context 405 @{ error = "Method not allowed." }
        }
      } elseif ($path.StartsWith("/api/items/")) {
        $id = $path.Substring("/api/items/".Length)
        $items = @(Get-ProductionItems)
        $index = -1
        for ($i = 0; $i -lt $items.Count; $i++) {
          if ([string]$items[$i].id -eq $id) { $index = $i; break }
        }

        if ($index -lt 0) {
          Send-Json $context 404 @{ error = "The production item could not be found." }
        } elseif ($method -eq "PUT") {
          $record = Read-RequestJson $context.Request
          if ([string]::IsNullOrWhiteSpace([string]$record.product)) {
            Send-Json $context 400 @{ error = "Product name is required." }
          } else {
            $updated = @{
              id = $id
              product = [string]$record.product
              cas = [string]$record.cas
              cat = [string]$record.cat
              batch = [string]$record.batch
              formula = [string]$record.formula
              weight = [string]$record.weight
              density = [string]$record.density
              pack = [string]$record.pack
              mfgDate = [string]$record.mfgDate
              retestDate = [string]$record.retestDate
            }
            $items[$index] = $updated
            Save-ProductionItems -items $items
            Send-Json $context 200 $updated
          }
        } elseif ($method -eq "DELETE") {
          $remaining = @()
          for ($i = 0; $i -lt $items.Count; $i++) {
            if ($i -ne $index) { $remaining += $items[$i] }
          }
          Save-ProductionItems -items $remaining
          Send-Json $context 200 @{ deleted = $true }
        } else {
          Send-Json $context 405 @{ error = "Method not allowed." }
        }
      } elseif ($method -ne "GET") {
        Send-Json $context 404 @{ error = "Not found." }
      } else {
        $relativePath = if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
        $rootPrefix = $root.TrimEnd("\") + "\"
        if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            $filePath -eq $dataPath -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
          Send-Json $context 404 @{ error = "Not found." }
        } else {
          $bytes = [System.IO.File]::ReadAllBytes($filePath)
          $context.Response.StatusCode = 200
          $context.Response.ContentType = Get-ContentType ([System.IO.Path]::GetExtension($filePath))
          $context.Response.ContentLength64 = $bytes.Length
          $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      }
    } catch {
      Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
      if (-not $context.Response.OutputStream.CanWrite) { continue }
      try {
        Send-Json $context 500 @{ error = "Server error: $($_.Exception.Message)" }
      } catch {
        $context.Response.Abort()
      }
    } finally {
      $context.Response.Close()
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
