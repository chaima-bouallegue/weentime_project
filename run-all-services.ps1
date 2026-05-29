param(
    [int]$StartupTimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServicesRoot = Join-Path $Root "weentime-backend\services"

$Services = @(
    @{ Name = "config-server"; Port = 8988; Path = Join-Path $ServicesRoot "config-server" },
    @{ Name = "discovery-service"; Port = 8861; Path = Join-Path $ServicesRoot "discovery" },
    @{ Name = "auth-service"; Port = 8181; Path = Join-Path $ServicesRoot "auth-service" },
    @{ Name = "organisation-service"; Port = 8190; Path = Join-Path $ServicesRoot "organisation-service" },
    @{ Name = "rh-service"; Port = 8192; Path = Join-Path $ServicesRoot "rh-service" },
    @{ Name = "presence-service"; Port = 8193; Path = Join-Path $ServicesRoot "presence-service" },
    @{ Name = "communication-service"; Port = 8194; Path = Join-Path $ServicesRoot "communication-service" },
    @{ Name = "gateway"; Port = 8322; Path = Join-Path $ServicesRoot "gateway" }
)

function Test-PortListening {
    param([int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return $null -ne $connection
}

function Wait-Port {
    param(
        [string]$Name,
        [int]$Port,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            Write-Host "[$Name] listening on port $Port"
            return
        }
        Start-Sleep -Seconds 2
    }

    Write-Warning "[$Name] did not open port $Port within $TimeoutSeconds seconds. Check its startup logs."
}

foreach ($service in $Services) {
    $name = $service.Name
    $port = [int]$service.Port
    $path = $service.Path
    $outLog = Join-Path $path "startup.out.log"
    $errLog = Join-Path $path "startup.err.log"

    if (-not (Test-Path -LiteralPath $path)) {
        Write-Warning "[$name] path not found: $path"
        continue
    }

    if (Test-PortListening -Port $port) {
        Write-Host "[$name] already listening on port $port"
        continue
    }

    Write-Host "[$name] starting from $path"
    Write-Host "[$name] logs: $outLog / $errLog"

    Start-Process `
        -FilePath (Join-Path $path "mvnw.cmd") `
        -ArgumentList "spring-boot:run" `
        -WorkingDirectory $path `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden

    Wait-Port -Name $name -Port $port -TimeoutSeconds $StartupTimeoutSeconds
}

Write-Host "Startup sequence completed. Use netstat -ano to verify process ids when needed."
