# Скрипт створює .env у корені проєкту. Заповніть значення з Supabase Dashboard (Settings -> API).
# Запуск: powershell -ExecutionPolicy Bypass -File create-env.ps1
$envContent = @"
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
"@
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot
$envContent | Out-File -FilePath ".env" -Encoding utf8
Write-Host "Файл .env створено в $projectRoot"
Write-Host "Відкрийте .env і підставте реальні значення з Supabase Dashboard."
