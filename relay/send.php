<?php
/**
 * Relay de correo seguro para Doy Fe.
 *
 * Recibe un POST con los datos del mail y lo envía usando SMTP local.
 * Solo acepta peticiones desde IPs autorizadas y con la clave correcta.
 *
 * Subir a DonWeb en: https://doyfegestion.com/relay/send.php
 * (o el subdirectorio que se prefiera).
 */

// ── Configuración ──────────────────────────────────────────────────
// Clave compartida entre Railway y este script. Cambiar por una propia.
// La clave se lee de config.php (no versionado) o de variable de entorno.
$__cfg = @include __DIR__ . '/config.php';
define('API_KEY', getenv('RELAY_API_KEY') ?: ($__cfg['api_key'] ?? ''));

// IPs autorizadas para enviar (Railway edge + localhost para pruebas).
define('ALLOWED_IPS', array_filter(array_map('trim', explode(',',
    getenv('RELAY_ALLOWED_IPS') ?: '69.46.46.117'
))));

// Remitente fijo — no se puede cambiar desde la petición.
define('FROM_EMAIL', 'no-reply@doyfegestion.com');
define('FROM_NAME',  'Doy Fe');

// Máximo de destinatarios por petición.
define('MAX_RECIPIENTS', 5);

// ── Helpers ────────────────────────────────────────────────────────
function json_response(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function get_client_ip(): string {
    // Detrás de un proxy, X-Forwarded-For puede traer la IP real.
    // DonWeb no suele poner proxy, pero por si acaso.
    foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = trim(explode(',', $_SERVER[$key])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function sanitize_email(string $v): string {
    $v = trim(strtolower($v));
    return filter_var($v, FILTER_VALIDATE_EMAIL) ? $v : '';
}

// ── Validaciones ───────────────────────────────────────────────────
// Solo POST.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

// Verificar que hay clave configurada.
if (API_KEY === '') {
    json_response(500, ['error' => 'Relay not configured']);
}

// Verificar IP.
$client_ip = get_client_ip();
if (!in_array($client_ip, ALLOWED_IPS, true)) {
    error_log("[relay] IP rechazada: {$client_ip}");
    json_response(403, ['error' => 'Forbidden']);
}

// Verificar clave.
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m) || !hash_equals(API_KEY, $m[1])) {
    error_log("[relay] Clave inválida desde {$client_ip}");
    json_response(401, ['error' => 'Unauthorized']);
}

// Leer body.
$raw = file_get_contents('php://input');
if (strlen($raw) > 65536) {
    json_response(413, ['error' => 'Payload too large']);
}
$body = json_decode($raw, true);
if (!is_array($body)) {
    json_response(400, ['error' => 'Invalid JSON']);
}

// Validar campos.
$to      = sanitize_email($body['to'] ?? '');
$subject = trim(mb_substr($body['subject'] ?? '', 0, 200));
$text    = trim(mb_substr($body['text'] ?? '', 0, 50000));
$html    = trim(mb_substr($body['html'] ?? '', 0, 100000));

if (!$to)      json_response(400, ['error' => 'Missing or invalid "to"']);
if (!$subject) json_response(400, ['error' => 'Missing "subject"']);
if (!$text && !$html) json_response(400, ['error' => 'Missing "text" or "html"']);

// ── Envío ──────────────────────────────────────────────────────────
$boundary = md5(uniqid(microtime(true)));

$headers  = "From: " . FROM_NAME . " <" . FROM_EMAIL . ">\r\n";
$headers .= "Reply-To: " . FROM_EMAIL . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";

if ($html && $text) {
    $headers .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
    $message  = "--{$boundary}\r\n";
    $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $message .= $text . "\r\n\r\n";
    $message .= "--{$boundary}\r\n";
    $message .= "Content-Type: text/html; charset=UTF-8\r\n";
    $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $message .= $html . "\r\n\r\n";
    $message .= "--{$boundary}--\r\n";
} elseif ($html) {
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $message  = $html;
} else {
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $message  = $text;
}

$ok = mail($to, $subject, $message, $headers, "-f" . FROM_EMAIL);

if ($ok) {
    json_response(200, ['sent' => true]);
} else {
    error_log("[relay] mail() falló para {$to}");
    json_response(502, ['error' => 'Mail delivery failed', 'sent' => false]);
}
