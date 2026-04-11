# Load environment variables from .env file
Get-Content .env | ForEach-Object {
    if ($_ -match "^([^=]+)='(.+)'$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim() -replace "^'|'$", ""
        Set-Item -Path "env:$name" -Value $value
    } elseif ($_ -match "^([^=]+)=(.+)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim() -replace "^'|'$", ""
        Set-Item -Path "env:$name" -Value $value
    }
}

# Override PORT to 5002
$env:PORT = "5002"
$env:NODE_ENV = "development"

Write-Host "Starting server on port $env:PORT..." -ForegroundColor Green
Write-Host "DATABASE_URL: $($env:DATABASE_URL.Substring(0,60))..." -ForegroundColor Cyan

# Start the server
npx tsx server/index.ts
