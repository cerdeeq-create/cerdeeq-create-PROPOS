if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and -not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
  Write-Error "Docker or docker-compose not found. Install Docker Desktop and re-run this script."
  exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

# Build and bring up services
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker-compose build
  docker-compose up
} else {
  docker-compose build
  docker-compose up
}
