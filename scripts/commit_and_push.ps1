param(
  [string]$branch = "dockerize",
  [string]$remote = ""
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "git not found. Install Git and re-run this script."
  exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not (Test-Path .git)) {
  git init
  git config user.email "you@example.com"
  git config user.name "Your Name"
}

git checkout -B $branch
git add .
git commit -m "chore: add Dockerfiles, docker-compose, CI, README and .gitignore; configure frontend API URL" -a || Write-Host "No changes to commit"

if ($remote -ne "") {
  if (-not (git remote)) {
    git remote add origin $remote
  }
  git push -u origin $branch
} else {
  Write-Host "No remote provided. To push, run: git remote add origin <url> ; git push -u origin $branch"
}
