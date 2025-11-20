<?php
// Consolidated verification handler (code entry + deprecated link handling)
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/email_sender.php';

// Public resend flow: accept ?email=... (from login page) and send a verification code if account exists and is unverified.
if (!empty($_GET['email'])) {
    $email = trim($_GET['email']);
    // Do not reveal account existence; if account exists and is unverified, create+send code and set session pending vars.
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        try {
            $stmt = $conn->prepare('SELECT user_id, first_name, email_verified FROM users WHERE email = ? LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('s', $email);
                $stmt->execute();
                $u = $stmt->get_result()->fetch_assoc();
                $stmt->close();
            } else { $u = null; }
        } catch (Exception $_) { $u = null; }

        if ($u && intval($u['email_verified']) === 0) {
            // send code and set session pending values
            $ttl = intval(getenv('VERIFICATION_TTL_MIN') ?: 5);
            $res = create_and_send_verification_code($conn, intval($u['user_id']), $email, trim($u['first_name'] ?? '') ?: 'User', 'email_verify', $ttl);
            if (!empty($res['success'])) {
                // set session pending state and redirect to self (show code entry)
                if (session_status() === PHP_SESSION_NONE) session_start();
                $_SESSION['pending_2fa_user_id'] = intval($u['user_id']);
                $_SESSION['pending_2fa_token_id'] = $res['id'] ?? null;
                $_SESSION['pending_verification_purpose'] = 'email_verify';
                // create a DB-based short resend cooldown so the reload shows the resend countdown
                try {
                    $resendPurpose = 'email_verify_resend';
                    $locked_until = date('Y-m-d H:i:s', time() + 60);
                    $ins = $conn->prepare('INSERT INTO verification_attempts (user_id,purpose,attempts,last_attempt,locked_until) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), last_attempt = VALUES(last_attempt)');
                    if ($ins) { $attemptsZero = 0; $now = date('Y-m-d H:i:s'); $ins->bind_param('isiss', $_SESSION['pending_2fa_user_id'], $resendPurpose, $attemptsZero, $now, $locked_until); $ins->execute(); $ins->close(); }
                } catch (Throwable $_) {}
                header('Location: /artine3/auth/verify.php');
                exit;
            } else {
                // fallthrough to show page with generic error
                $errors[] = 'Failed to send verification email. Please try again later.';
            }
        } else {
            // Generic notice for privacy
            $info = 'If an account exists for that email and needs verification, a message was sent. Check your inbox.';
        }
    } else {
        $errors[] = 'Please provide a valid email address.';
    }
}

// If a legacy link token is provided (GET token), inform user to use code flow or attempt to handle legacy token.
if (!empty($_GET['token'])) {
    // Legacy link-based verification is deprecated. Provide guidance and a Resend action.
    $message = 'This application prefers 6-digit code verification. Please request a new code from your account page (Resend verification), or use the code sent to your email.';
    ?><!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/artine3/assets/css/auth.css">
        <title>Email Verification</title>
    </head>
    <body>
        <?php include __DIR__ . '/../includes/simple_header.php'; ?>
        <main class="auth-content">
            <h1>Email Verification</h1>
            <div class="auth-container"><p><?php echo htmlspecialchars($message); ?></p>
            <p><a href="/artine3/login.php">Go to login</a> — or <a href="/artine3/account.php">Resend verification</a></p></div>
        </main>
    </body>
    </html>
    <?php
    exit;
}

// Otherwise reuse the existing code-entry verification logic (copied from verify_code.php)
$pendingUser = $_SESSION['pending_2fa_user_id'] ?? null;
$pendingToken = $_SESSION['pending_2fa_token_id'] ?? null;
$purpose = $_SESSION['pending_verification_purpose'] ?? 'login_2fa';

if (!$pendingUser) {
    header('Location: /artine3/login.php'); exit;
}

$errors = [];
$info = '';

// verification_attempts table assumed to exist in schema

$verify_lock_remaining = 0;
try {
    $va = $conn->prepare('SELECT attempts, locked_until, lock_count_24h, last_lock FROM verification_attempts WHERE user_id = ? AND purpose = ? LIMIT 1');
    if ($va) { $va->bind_param('is', $pendingUser, $purpose); $va->execute(); $r = $va->get_result()->fetch_assoc(); $va->close();
        if ($r && !empty($r['locked_until'])) { $lu = strtotime($r['locked_until']); if ($lu > time()) $verify_lock_remaining = $lu - time(); }
    }
} catch (Exception $_) {}
// Read any resend cooldown stored in DB (separate purpose: "$purpose_resend")
$resend_lock_remaining = 0;
try {
    $resendPurpose = $purpose . '_resend';
    $vr = $conn->prepare('SELECT locked_until FROM verification_attempts WHERE user_id = ? AND purpose = ? LIMIT 1');
    if ($vr) { $vr->bind_param('is', $pendingUser, $resendPurpose); $vr->execute(); $rr = $vr->get_result()->fetch_assoc(); $vr->close();
        if ($rr && !empty($rr['locked_until'])) { $rlu = strtotime($rr['locked_until']); if ($rlu > time()) $resend_lock_remaining = $rlu - time(); }
    }
} catch (Exception $_) { }

// Helper: format verify lock for initial display (no seconds shown when hours present)
function format_duration_display($secs) {
    $s = max(0, intval($secs));
    if ($s >= 3600) {
        $h = intdiv($s, 3600);
        $m = intdiv($s % 3600, 60);
        $r = $s % 60;
        return "{$h}h {$m}m {$r}s";
    } elseif ($s >= 60) {
        $m = intdiv($s, 60);
        $r = $s % 60;
        return "{$m}m {$r}s";
    } else {
        return "{$s}s";
    }
}

$verify_lock_display = format_duration_display($verify_lock_remaining);

// verification_codes table assumed to exist in schema

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? 'verify';
    if ($action === 'resend') {
        try {
            $conn->begin_transaction();
            if ($pendingToken) { $u = $conn->prepare('UPDATE verification_codes SET used = 1 WHERE id = ?'); if ($u) { $u->bind_param('i', $pendingToken); $u->execute(); $u->close(); } }
            $conn->commit();
            $urow = $conn->query('SELECT email, first_name FROM users WHERE user_id = ' . intval($pendingUser))->fetch_assoc();
            $to = $urow['email'] ?? ''; $name = trim(($urow['first_name'] ?? '')) ?: 'User';
            $res = create_and_send_verification_code($conn, intval($pendingUser), $to, $name, $purpose, 10);
            if (!empty($res['success'])) {
                // Store a DB-based short resend cooldown (purpose_resend) so reload shows the resend countdown
                try {
                    $resendPurpose = $purpose . '_resend';
                    $locked_until = date('Y-m-d H:i:s', time() + 60);
                    $ins = $conn->prepare('INSERT INTO verification_attempts (user_id,purpose,attempts,last_attempt,locked_until) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), last_attempt = VALUES(last_attempt)');
                    if ($ins) { $attemptsZero = 0; $now = date('Y-m-d H:i:s'); $ins->bind_param('isiss', $pendingUser, $resendPurpose, $attemptsZero, $now, $locked_until); $ins->execute(); $ins->close(); }
                } catch (Throwable $_) {}
                $_SESSION['pending_2fa_token_id'] = $res['id'];
                $pendingToken = $res['id'];
                $info = 'A new code was sent to your email.';
                try { $r = $conn->prepare('DELETE FROM verification_attempts WHERE user_id = ? AND purpose = ?'); if ($r) { $r->bind_param('is', $pendingUser, $purpose); $r->execute(); $r->close(); } } catch (Exception $_) {}
            } else { $errors[] = 'Failed to resend code.'; }
        } catch (Throwable $e) { if (!empty($conn)) $conn->rollback(); $errors[] = 'Failed to resend code.'; }
    } else {
        $code = preg_replace('/\D/', '', ($_POST['code'] ?? ''));
        if (strlen($code) !== 6) { $errors[] = 'Please enter the 6-digit code.'; }
        else {
            try {
                $stmt = $conn->prepare('SELECT id, user_id, code_hash, expires_at, used FROM verification_codes WHERE id = ? AND user_id = ? AND purpose = ? LIMIT 1');
                if ($stmt) { $idCheck = $pendingToken ? intval($pendingToken) : 0; $stmt->bind_param('iis', $idCheck, $pendingUser, $purpose); $stmt->execute(); $res = $stmt->get_result(); $row = $res ? $res->fetch_assoc() : null; $stmt->close(); } else { $row = null; }

                if (!$row) {
                    $errors[] = 'Verification token not found. Please request a new code.';
                } else if (intval($row['used']) === 1) {
                    $errors[] = 'This code has already been used. Request a new one.';
                } else if (strtotime($row['expires_at']) < time()) {
                    $errors[] = 'This code has expired. Request a new one.';
                } else if (!password_verify($code, $row['code_hash'])) {
                    // Invalid code -> increment verification_attempts and apply lock logic similar to login
                    try {
                        $attempt_window_min = 30; // window for decay
                        $max_attempts = 10;
                        // Insert or update with decay: reset attempts if last_attempt > window
                        $ins = $conn->prepare('INSERT INTO verification_attempts (user_id, purpose, attempts, last_attempt) VALUES (?, ?, 1, NOW()) ON DUPLICATE KEY UPDATE attempts = IF(last_attempt >= NOW() - INTERVAL ? MINUTE, attempts + 1, 1), last_attempt = NOW()');
                        if ($ins) { $ins->bind_param('isi', $pendingUser, $purpose, $attempt_window_min); $ins->execute(); $ins->close(); }

                        // Check current attempts and existing lock_count
                        $chk = $conn->prepare('SELECT attempts, locked_until, lock_count_24h FROM verification_attempts WHERE user_id = ? AND purpose = ? LIMIT 1');
                        $recentAttempts = 0; $lockCount24h = 0;
                        if ($chk) {
                            $chk->bind_param('is', $pendingUser, $purpose);
                            $chk->execute();
                            $r = $chk->get_result()->fetch_assoc();
                            $chk->close();
                            $recentAttempts = intval($r['attempts'] ?? 0);
                            $lockCount24h = intval($r['lock_count_24h'] ?? 0);
                        }

                        if ($recentAttempts >= $max_attempts) {
                            // Determine lock duration: if this is 3rd lock (lockCount24h >= 2), lock 12 hours, otherwise 10 minutes
                            $durationMin = ($lockCount24h >= 2) ? (12 * 60) : 10;
                            $locked_until = date('Y-m-d H:i:s', time() + ($durationMin * 60));
                            $newLockCount = ($lockCount24h > 0) ? ($lockCount24h + 1) : 1;

                            $lu = $conn->prepare('UPDATE verification_attempts SET locked_until = ?, attempts = 0, last_lock = NOW(), lock_count_24h = ? WHERE user_id = ? AND purpose = ?');
                            if ($lu) { $lu->bind_param('siis', $locked_until, $newLockCount, $pendingUser, $purpose); $lu->execute(); $lu->close(); }

                            if ($durationMin >= 60) {
                                $hours = intval($durationMin / 60);
                                $mins = $durationMin % 60;
                                $errors[] = "Too many verification attempts. Please wait {$hours}h {$mins}m before trying again.";
                            } else {
                                $errors[] = "Too many verification attempts. Please wait {$durationMin} minutes before trying again.";
                            }
                            // set verify_lock_remaining so UI will show countdown
                            $verify_lock_remaining = max(0, strtotime($locked_until) - time());
                        } else {
                            $attempts_left = max(0, $max_attempts - $recentAttempts);
                            $msg = 'Invalid code. Please try again.';
                            if ($attempts_left > 0) {
                                $msg .= " You have {$attempts_left} attempt" . ($attempts_left>1 ? 's' : '') . ' left.';
                                if ($attempts_left === 1 && $lockCount24h >= 2) {
                                    $msg .= ' Next failed attempt will lock your account for 12 hours.';
                                } elseif ($attempts_left === 1) {
                                    $msg .= ' Next failed attempt will lock your account for 10 minutes.';
                                }
                            }
                            $errors[] = $msg;
                        }
                    } catch (Throwable $_) { $errors[] = 'Invalid code. Please try again.'; }
                } else {
                    $conn->begin_transaction();
                    $u1 = $conn->prepare('UPDATE verification_codes SET used = 1 WHERE id = ?'); if ($u1) { $u1->bind_param('i', $row['id']); $u1->execute(); $u1->close(); }
                    // purpose handling (same as previous file)
                    if ($purpose === 'login_2fa') {
                        $_SESSION['user_id'] = $pendingUser;
                        $urow = $conn->query('SELECT first_name FROM users WHERE user_id = ' . intval($pendingUser))->fetch_assoc();
                        $_SESSION['first_name'] = $urow['first_name'] ?? '';
                        try { $sid = session_id(); $ip = $_SERVER['REMOTE_ADDR'] ?? null; $ua = $_SERVER['HTTP_USER_AGENT'] ?? null; if ($sid) { $ins = $conn->prepare('REPLACE INTO sessions (session_id,user_id,ip,user_agent,last_seen,`status`,logout_time) VALUES (?,?,?,?,NOW(),?,NULL)'); if ($ins) { $statusVal = 'active'; $ins->bind_param('sisss', $sid, $pendingUser, $ip, $ua, $statusVal); $ins->execute(); $ins->close(); } } } catch (Exception $e) {}
                        try { $ul = $conn->prepare('UPDATE users SET last_login = NOW() WHERE user_id = ?'); if ($ul) { $ul->bind_param('i', $pendingUser); $ul->execute(); $ul->close(); } } catch (Exception $_) {}
                        $conn->commit(); unset($_SESSION['pending_2fa_user_id']); unset($_SESSION['pending_2fa_token_id']); unset($_SESSION['pending_verification_purpose']); header('Location: /artine3/index.php?logged_in=1'); exit;
                    } else if ($purpose === 'email_verify') {
                        $u = $conn->prepare('UPDATE users SET email_verified = 1 WHERE user_id = ?'); if ($u) { $u->bind_param('i', $pendingUser); $u->execute(); $u->close(); }
                        $conn->commit(); unset($_SESSION['pending_2fa_user_id']); unset($_SESSION['pending_2fa_token_id']); unset($_SESSION['pending_verification_purpose']); if (function_exists('is_logged_in') && is_logged_in()) { header('Location: /artine3/account.php?verified=1'); } else { header('Location: /artine3/login.php?verified=1'); } exit;
                    } else if ($purpose === 'enable_2fa') {
                        $u = $conn->prepare('UPDATE users SET email_2fa_enabled = 1 WHERE user_id = ?'); if ($u) { $u->bind_param('i', $pendingUser); $u->execute(); $u->close(); }
                        $conn->commit(); unset($_SESSION['pending_2fa_user_id']); unset($_SESSION['pending_2fa_token_id']); unset($_SESSION['pending_verification_purpose']); header('Location: /artine3/account.php?2fa_enabled=1'); exit;
                    } else if ($purpose === 'password_reset') {
                        // Mark which user may reset their password and redirect to the password reset view
                        $_SESSION['password_reset_user_id'] = $pendingUser;
                        $conn->commit();
                        unset($_SESSION['pending_2fa_user_id']);
                        unset($_SESSION['pending_2fa_token_id']);
                        unset($_SESSION['pending_verification_purpose']);
                        header('Location: /artine3/auth/password.php?action=reset');
                        exit;
                    } else { $conn->commit(); unset($_SESSION['pending_2fa_user_id']); unset($_SESSION['pending_2fa_token_id']); unset($_SESSION['pending_verification_purpose']); $info = 'Verification succeeded.'; }
                }
            } catch (Throwable $e) { $errors[] = 'Verification failed. Please try again.'; }
        }
    }
}

?>
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/artine3/assets/css/auth.css">
    <link rel="stylesheet" href="/artine3/assets/css/components.css">
    <link rel="stylesheet" href="/artine3/assets/css/style.css">
    <link rel="stylesheet" href="/artine3/assets/css/style.css"><link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>Enter verification code</title>
    <style>
        .code-inputs { display:flex; gap:5px; justify-content:center; margin:20px 0; }
        .code-inputs input { font-size:24px; text-align:center; }
        .verify-card { max-width:540px; margin:40px auto; padding:20px; border:1px solid #eee; border-radius:8px; }
        .small { font-size:14px; color:#666; text-align: center; }
    </style>
</head>
<body>
    <?php include __DIR__ . '/../includes/simple_header.php'; ?>
    <main class="main-content">
        <h1>Enter verification code</h1>
        <div class="auth-container">
            <div class="auth-forms">
                <?php if (!empty($info)): ?><div class="form-message success"><?php echo htmlspecialchars($info); ?></div><?php endif; ?>

                <?php if (!empty($verify_lock_remaining) && intval($verify_lock_remaining) > 0): ?>
                    <div id="verifyLockNotice" class="form-message field-error">Too many verification attempts. Please wait <span id="verifyTimer"><?php echo htmlspecialchars($verify_lock_display); ?></span> before trying again.</div>
                <?php endif; ?>

                <form method="post" id="verifyForm" class="auth-form">
                    <p class="small">We sent a 6-digit code to your email. Enter it below to complete the action.</p>
                    <div class="form-group code-inputs" role="group" aria-label="6 digit code">
                        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" class="digit input-form" />
                        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" class="digit input-form" />
                        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" class="digit input-form" />
                        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" class="digit input-form" />
                        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" class="digit input-form" />
                        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" class="digit input-form" />
                    </div>
                    
                    <?php if (!empty($errors)): ?>
                        <div class="form-message field-error" role="alert">
                            <ul>
                            <?php foreach ($errors as $er) echo '<li>' . htmlspecialchars($er) . '</li>'; ?>
                            </ul>
                        </div>
                    <?php endif; ?>
                    <input type="hidden" name="code" id="codeField" />
                    <div class="form-group" style="display:flex;gap:12px;justify-content:center;">
                        <button type="submit" class="big-btn btn primary">Verify</button>
                        <button type="button" id="resendBtn" class="big-btn btn">Resend code</button>
                    </div>
                    
                    <input type="hidden" name="action" id="actionField" value="verify" />
                </form>
            </div>
        </div>
    </main>

    <script>
        (function(){
            const inputs = Array.from(document.querySelectorAll('.digit'));
            inputs.forEach((inp, idx) => {
                inp.addEventListener('input', (e) => {
                    const v = e.target.value.replace(/\D/g,'').slice(0,1);
                    e.target.value = v;
                    if (v && idx < inputs.length - 1) inputs[idx+1].focus();
                });
                inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !e.target.value && idx > 0) { inputs[idx-1].focus(); } });
                inp.addEventListener('paste', (e) => { e.preventDefault(); const txt = (e.clipboardData || window.clipboardData).getData('text'); const digits = txt.replace(/\D/g,'').slice(0,6).split(''); for (let i=0;i<digits.length && i<inputs.length;i++) { inputs[i].value = digits[i]; } });
            });
            document.getElementById('verifyForm').addEventListener('submit', function(e){ const code = inputs.map(i=>i.value || '').join(''); if (code.length !== 6) { e.preventDefault(); alert('Please enter the 6-digit code'); return false; } document.getElementById('codeField').value = code; return true; });
            document.getElementById('resendBtn').addEventListener('click', async function(){
                const btn = this;
                if (!confirm('Resend verification code to your email?')) return;
                // Show immediate sending state; do not start local countdown — server will provide authoritative lock on reload.
                btn.disabled = true;
                const prevText = btn.textContent;
                btn.textContent = 'Sending...';

                const form = document.getElementById('verifyForm'); document.getElementById('actionField').value = 'resend'; const data = new FormData(form);
                try {
                    const res = await fetch('', { method: 'POST', body: data });
                    if (res.ok) {
                        // Reload so server-side lock/time is authoritative and countdown begins on the next page load
                        location.reload();
                    } else {
                        btn.disabled = false;
                        btn.textContent = prevText;
                        alert('Failed to resend code');
                    }
                } catch (e) {
                    btn.disabled = false;
                    btn.textContent = prevText;
                    alert('Failed to resend code');
                }
            });
            inputs[0].focus();
        })();
        (function(){
            var dbSecs = <?php echo json_encode(intval($verify_lock_remaining ?? 0)); ?>;
            var resendSecs = <?php echo json_encode(intval($resend_lock_remaining ?? 0)); ?>;
            var timerEl = document.getElementById('verifyTimer');
            var resendBtn = document.getElementById('resendBtn');
            var verifySubmit = document.querySelector('#verifyForm button[type="submit"]');

            function formatDurationSeconds(t){
                t = Math.max(0, parseInt(t, 10) || 0);
                if (t >= 3600) {
                    var h = Math.floor(t / 3600);
                    var m = Math.floor((t % 3600) / 60);
                    var s = t % 60;
                    return h + 'h ' + m + 'm ' + s + 's';
                } else if (t >= 60) {
                    var m = Math.floor(t / 60);
                    var s = t % 60;
                    return m + 'm ' + s + 's';
                }
                return t + 's';
            }

                // DB lock (too many verification attempts) -> disable inputs & verify submit, but keep resend button enabled
                if (dbSecs > 0) {
                // disable input fields and verify submit
                Array.from(document.querySelectorAll('#verifyForm input[type="text"], #verifyForm input[type="number"], #verifyForm input[type="password"], #verifyForm input[type="tel"], #verifyForm .digit')).forEach(function(el){ el.disabled = true; });
                if (verifySubmit) { verifySubmit.disabled = true; verifySubmit.style.opacity = '0.6'; verifySubmit.style.pointerEvents = 'none'; }
                    if (timerEl) timerEl.textContent = formatDurationSeconds(dbSecs);
                    var dbIv = setInterval(function(){ dbSecs--; if (dbSecs <= 0) { clearInterval(dbIv); Array.from(document.querySelectorAll('#verifyForm input, #verifyForm button')).forEach(function(el){ el.disabled = false; el.style.pointerEvents = ''; el.style.opacity = ''; }); if (timerEl) timerEl.textContent = '0s'; var lockNotice = document.getElementById('verifyLockNotice'); if (lockNotice) lockNotice.style.display = 'none'; return; } if (timerEl) timerEl.textContent = formatDurationSeconds(dbSecs); }, 1000);
            }

            // Resend cooldown -> disable only the resend button and show 60s countdown on it
            if (resendSecs > 0) {
                if (resendBtn) { resendBtn.disabled = true; resendBtn.style.pointerEvents = 'none'; resendBtn.style.opacity = '0.6'; resendBtn.textContent = 'Resend (' + resendSecs + 's)'; }
                var rIv = setInterval(function(){ resendSecs--; if (resendSecs <= 0) { clearInterval(rIv); if (resendBtn) { resendBtn.disabled = false; resendBtn.style.pointerEvents = ''; resendBtn.style.opacity = ''; resendBtn.textContent = 'Resend code'; } return; } if (resendBtn) resendBtn.textContent = 'Resend (' + resendSecs + 's)'; }, 1000);
            }
        })();
    </script>
</body>
</html>