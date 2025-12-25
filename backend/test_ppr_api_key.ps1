# auth-prod.ps1 — Авторизация на боевом сервере
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiUrl = "https://api.opti-24.ru"
$ApiKey = "GPN.84d349025d85da2c82b4df9bc67e0e19a18583b0.6c6a5295b9d2ec46037d48ccc1bf3488cb26830c"

# === ЗАМЕНИТЕ ЭТИ ЗНАЧЕНИЯ НА ВАШИ РЕАЛЬНЫЕ УЧЁТНЫЕ ДАННЫЕ ===
$Login = "SSSafronov@starwayp.com"          # ← ОБЯЗАТЕЛЬНО замените!
$PasswordPlain = "ZAQ!2wsx"  # ← ОБЯЗАТЕЛЬНО замените!

# Вычисляем SHA-512 хеш пароля (требование API)
$sha512 = [System.Security.Cryptography.SHA512]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($PasswordPlain)
$hashBytes = $sha512.ComputeHash($bytes)
$PasswordHash = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

# Текущая дата и время (можно фиксированное, но лучше актуальное)
$dateTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Подготавливаем тело запроса
$body = "login=$([System.Web.HttpUtility]::UrlEncode($Login))&password=$([System.Web.HttpUtility]::UrlEncode($PasswordHash))"

$headers = @{
    "api_key"      = $ApiKey
    "date_time"    = $dateTime
    "Content-Type" = "application/x-www-form-urlencoded"
    "User-Agent"   = "PowerShell/5.1 (GPN Production Client)"
}

try {
    Write-Host "🔐 Отправка запроса авторизации на $ApiUrl..."
    $response = Invoke-RestMethod -Uri "$ApiUrl/vip/v1/authUser" -Method Post -Headers $headers -Body $body

    if ($response.status.code -eq 200) {
        $sessionId = $response.data.session_id
        $contractId = $response.data.contracts[0].id

        Write-Host "✅ Авторизация успешна!"
        Write-Host "Session ID: $($sessionId.Substring(0,30))..."
        Write-Host "Contract ID: $contractId"

        # Сохраняем для последующих скриптов
        $sessionId | Out-File -FilePath ".\session_id.txt" -Encoding utf8
        $contractId | Out-File -FilePath ".\contract_id.txt" -Encoding utf8
        Write-Host "Данные сохранены в session_id.txt и contract_id.txt"
    } else {
        Write-Error "❌ Ошибка авторизации: $($response.status.code)"
        Write-Error ($response.status.errors | ConvertTo-Json -Compress)
    }
} catch {
    Write-Error "💥 Исключение при авторизации:"
    Write-Error $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $errorBody = $reader.ReadToEnd()
        Write-Error "Тело ошибки: $errorBody"
    }
}