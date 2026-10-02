<?php
/**
 * Relay de correo para Doy Fe.
 * Recibe un POST JSON y envía por SMTP autenticado (DonWeb).
 */

$__cfg = @include __DIR__ . '/config.php';
define('API_KEY', getenv('RELAY_API_KEY') ?: ($__cfg['api_key'] ?? ''));

define('SMTP_HOST', $__cfg['smtp_host'] ?? 'sd-1249677-l.dattaweb.com');
define('SMTP_PORT', $__cfg['smtp_port'] ?? 587);
define('SMTP_USER', $__cfg['smtp_user'] ?? '');
define('SMTP_PASS', $__cfg['smtp_pass'] ?? '');
define('FROM_EMAIL', $__cfg['from_email'] ?? 'no-reply@doyfegestion.com');
define('FROM_NAME',  $__cfg['from_name']  ?? 'Doy Fe');

// ── Helpers ───────────────────────────────────────────────────────
function json_response(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize_email(string $v): string {
    $v = trim(strtolower($v));
    return filter_var($v, FILTER_VALIDATE_EMAIL) ? $v : '';
}

function smtp_send(string $to, string $subject, string $text, string $html): array {
    $sock = @fsockopen(SMTP_HOST, SMTP_PORT, $errno, $errstr, 10);
    if (!$sock) return ['ok' => false, 'error' => "connect: $errstr ($errno)"];

    $read = function() use ($sock) {
        $r = '';
        while ($line = fgets($sock, 512)) {
            $r .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $r;
    };

    $cmd = function(string $c) use ($sock, $read) {
        fwrite($sock, $c . "\r\n");
        return $read();
    };

    $greeting = $read();
    if (substr($greeting, 0, 3) !== '220') {
        fclose($sock);
        return ['ok' => false, 'error' => "greeting: $greeting"];
    }

    $ehlo = $cmd('EHLO relay.doyfegestion.com');

    // STARTTLS
    if (stripos($ehlo, 'STARTTLS') !== false) {
        $r = $cmd('STARTTLS');
        if (substr($r, 0, 3) !== '220') {
            fclose($sock);
            return ['ok' => false, 'error' => "starttls: $r"];
        }
        $crypto = stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
        if (!$crypto) {
            fclose($sock);
            return ['ok' => false, 'error' => 'TLS handshake failed'];
        }
        $cmd('EHLO relay.doyfegestion.com');
    }

    // AUTH LOGIN
    $r = $cmd('AUTH LOGIN');
    if (substr($r, 0, 3) !== '334') {
        fclose($sock);
        return ['ok' => false, 'error' => "auth: $r"];
    }
    $cmd(base64_encode(SMTP_USER));
    $r = $cmd(base64_encode(SMTP_PASS));
    if (substr($r, 0, 3) !== '235') {
        fclose($sock);
        return ['ok' => false, 'error' => "auth failed: $r"];
    }

    // Envelope
    $r = $cmd('MAIL FROM:<' . FROM_EMAIL . '>');
    if (substr($r, 0, 3) !== '250') { fclose($sock); return ['ok' => false, 'error' => "from: $r"]; }

    $r = $cmd('RCPT TO:<' . $to . '>');
    if (substr($r, 0, 3) !== '250') { fclose($sock); return ['ok' => false, 'error' => "rcpt: $r"]; }

    $r = $cmd('DATA');
    if (substr($r, 0, 3) !== '354') { fclose($sock); return ['ok' => false, 'error' => "data: $r"]; }

    // Headers + body
    $boundary = md5(uniqid(microtime(true)));
    $msg  = "From: " . FROM_NAME . " <" . FROM_EMAIL . ">\r\n";
    $msg .= "To: $to\r\n";
    $msg .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Date: " . date('r') . "\r\n";

    if ($html && $text) {
        $msg .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n\r\n";
        $msg .= "--$boundary\r\n";
        $msg .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
        $msg .= $text . "\r\n\r\n";
        $msg .= "--$boundary\r\n";
        $msg .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
        $msg .= $html . "\r\n\r\n";
        $msg .= "--$boundary--\r\n";
    } elseif ($html) {
        $msg .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
        $msg .= $html . "\r\n";
    } else {
        $msg .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
        $msg .= $text . "\r\n";
    }

    // Escape lines starting with a dot
    $msg = str_replace("\r\n.", "\r\n..", $msg);

    fwrite($sock, $msg . "\r\n.\r\n");
    $r = $read();
    $cmd('QUIT');
    fclose($sock);

    if (substr($r, 0, 3) === '250') {
        return ['ok' => true];
    }
    return ['ok' => false, 'error' => "send: $r"];
}

// ── Validaciones ──────────────────────────────────────────────────
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

if (API_KEY === '') {
    json_response(500, ['error' => 'Relay not configured']);
}

// Verificar clave
$auth = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';
if (!$auth && function_exists('apache_request_headers')) {
    $hdrs = apache_request_headers();
    $auth = $hdrs['Authorization'] ?? $hdrs['authorization'] ?? '';
}
if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m) || !hash_equals(API_KEY, $m[1])) {
    json_response(401, ['error' => 'Unauthorized']);
}

// Leer body
$raw = file_get_contents('php://input');
if (strlen($raw) > 65536) {
    json_response(413, ['error' => 'Payload too large']);
}
$body = json_decode($raw, true);
if (!is_array($body)) {
    json_response(400, ['error' => 'Invalid JSON']);
}

$to      = sanitize_email($body['to'] ?? '');
$subject = trim(mb_substr($body['subject'] ?? '', 0, 200));
$text    = trim(mb_substr($body['text'] ?? '', 0, 50000));
$html    = trim(mb_substr($body['html'] ?? '', 0, 100000));

if (!$to)      json_response(400, ['error' => 'Missing or invalid "to"']);
if (!$subject) json_response(400, ['error' => 'Missing "subject"']);
if (!$text && !$html) json_response(400, ['error' => 'Missing "text" or "html"']);

// ── Envío por SMTP autenticado ────────────────────────────────────
if (!SMTP_USER || !SMTP_PASS) {
    json_response(500, ['error' => 'SMTP credentials not configured']);
}

$result = smtp_send($to, $subject, $text, $html);

if ($result['ok']) {
    json_response(200, ['sent' => true]);
} else {
    error_log("[relay] SMTP falló: " . $result['error']);
    json_response(502, ['error' => 'Mail delivery failed: ' . $result['error'], 'sent' => false]);
}
