<?php
/**
 * Contact form endpoint for Hostinger (plain PHP, no WordPress).
 * Receives POST from /contact/ and /ar/contact/, emails the team,
 * then redirects back with ?sent=1 or ?error=1.
 */

$to = 'info@khattab.group';

$lang    = ($_POST['lang'] ?? 'en') === 'ar' ? 'ar' : 'en';
$back    = $lang === 'ar' ? '/ar/contact/' : '/contact/';
$name    = trim($_POST['name'] ?? '');
$email   = trim($_POST['email'] ?? '');
$message = trim($_POST['message'] ?? '');
$trap    = trim($_POST['company'] ?? ''); // honeypot — real visitors never fill this

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $trap !== '') {
    header('Location: ' . $back);
    exit;
}

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    header('Location: ' . $back . '?error=1');
    exit;
}

$subject = 'babylife.jo contact form — ' . mb_substr($name, 0, 80);
$body    = "Name: $name\nEmail: $email\nLanguage: $lang\n\n$message\n";
$headers = "From: Baby Life Website <no-reply@babylife.jo>\r\n"
         . "Reply-To: " . str_replace(["\r", "\n"], '', $email) . "\r\n"
         . "Content-Type: text/plain; charset=UTF-8\r\n";

$ok = @mail($to, $subject, $body, $headers);

header('Location: ' . $back . ($ok ? '?sent=1' : '?error=1'));
exit;
