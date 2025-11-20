<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/email_sender.php';

$errors = [];
$fieldErrors = []; // per-input error messages (field => message)
$notice = '';

// Decide view: 'forgot' shows email form, 'change' shows change-password for logged-in user
$view = $_GET['action'] ?? 'forgot';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'send_reset') {
        // Forgot password: send 6-digit reset code
        $email = trim($_POST['email'] ?? '');
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $fieldErrors['email'] = 'Please enter a valid email.';
        } else {
            $stmt = $conn->prepare('SELECT user_id, first_name FROM users WHERE email = ? LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('s', $email);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();
                if ($row) {
                    $uid = intval($row['user_id']);
                    $name = trim($row['first_name'] ?? '') ?: $email;
                    $ttl = intval(getenv('VERIFICATION_TTL_MIN') ?: 5);
                    $sendRes = create_and_send_verification_code($conn, $uid, $email, $name, 'password_reset', $ttl);
                    if (!empty($sendRes['success'])) {
                        if (session_status() === PHP_SESSION_NONE) session_start();
                        $_SESSION['pending_2fa_user_id'] = $uid;
                        $_SESSION['pending_2fa_token_id'] = $sendRes['id'];
                        $_SESSION['pending_verification_purpose'] = 'password_reset';
                        header('Location: /artine3/auth/verify.php');
                        exit;
                    } else {
                        $errors[] = 'Could not send verification code. Please try again later.';
                    }
                } else {
                    // Explicitly inform user the email isn't found (do not redirect)
                    $fieldErrors['email'] = 'This email address is not registered in our system. Please check and try again.';
                }
            } else {
                $errors[] = 'Database error.';
            }
        }
    } else if ($action === 'change') {
        // Change password (user must be logged in)
        require_login();
        $user = current_user($conn);
        if (!$user) {
            header('Location: /artine3/login.php'); exit;
        }
        $old = $_POST['old_password'] ?? '';
        $new = $_POST['new_password'] ?? '';
        $confirm = $_POST['new_password_confirm'] ?? '';
        // Password rules: 8+ chars, at least one number, at least one capital, no spaces
        if (!preg_match('/^(?=.*[A-Z])(?=.*\d)[^\s]{8,}$/', $new)) {
            $fieldErrors['new_password'] = 'New password must be at least 8 characters, include at least one number and one uppercase letter, and contain no spaces.';
        }
        if ($new !== $confirm) $fieldErrors['new_password_confirm'] = 'New passwords do not match.';
        if (!password_verify($old, $user['password_hash'])) $fieldErrors['old_password'] = 'Current password is incorrect.';

        // If there are validation errors, stay on this page and render them inline (do not redirect)
        if (!empty($fieldErrors)) {
            $view = 'change';
        } else {
            $hash = password_hash($new, PASSWORD_DEFAULT);
            $up = $conn->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?');
            if ($up) {
                $up->bind_param('si', $hash, $user['user_id']);
                if ($up->execute()) {
                    $up->close();
                    $notice = 'Password updated successfully.';
                    // clear any form values
                    $_POST = array();
                    $view = 'change';
                } else {
                    $errors[] = 'Unable to update password.';
                    $view = 'change';
                }
            } else {
                $errors[] = 'Unable to update password.';
                $view = 'change';
            }
        }
    } else if ($action === 'reset') {
        // Password reset after successful code verification. verify.php sets $_SESSION['password_reset_user_id']
        if (session_status() === PHP_SESSION_NONE) session_start();
        $resetUid = $_SESSION['password_reset_user_id'] ?? null;
        if (!$resetUid) {
            $errors[] = 'Password reset session not found or expired. Request a new code.';
        } else {
            $new = $_POST['new_password'] ?? '';
            $confirm = $_POST['new_password_confirm'] ?? '';
            if (strlen($new) < 8) $fieldErrors['new_password'] = 'New password must be at least 8 characters.';
            if ($new !== $confirm) $fieldErrors['new_password_confirm'] = 'New passwords do not match.';
            if (empty($fieldErrors)) {
                $hash = password_hash($new, PASSWORD_DEFAULT);
                $up = $conn->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?');
                if ($up) {
                    $up->bind_param('si', $hash, $resetUid);
                    if ($up->execute()) {
                        $up->close();
                        unset($_SESSION['password_reset_user_id']);
                        header('Location: /artine3/login.php?password_reset=1');
                        exit;
                    }
                }
                $errors[] = 'Unable to update password.';
            }
        }
    }
}

// Render simple combined UI
?><!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/artine3/assets/css/auth.css">
    <link rel="stylesheet" href="/artine3/assets/css/components.css">
    <link rel="stylesheet" href="/artine3/assets/css/style.css"><link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>Password</title>
    <style>
        .form-message{display:none}
        .form-message.field-error{display:block;}
        .form-message.show{display:block}
    </style>
</head>
<body>
    <?php include __DIR__ . '/../includes/simple_header.php'; ?>
    <main class="main-content">
        <?php if ($view === 'change'): ?>
            <h1>Change password</h1>
                <div class="auth-container">
                                <?php if (!empty($errors)): ?>
                                    <div class="error-box"><ul><?php foreach ($errors as $e) echo '<li>' . htmlspecialchars($e) . '</li>'; ?></ul></div>
                                <?php endif; ?>
                                <?php if (!empty($notice)): ?>
                                    <div class="notice"><?php echo htmlspecialchars($notice); ?></div>
                                <?php endif; ?>
                    <form method="post" class="auth-form">
                        <input type="hidden" name="action" value="change" />
                        <div class="form-group"><label>Current password</label><input class="input-form" type="password" name="old_password" required></div>
                                    <?php if (!empty($fieldErrors['old_password'])): ?>
                                        <div class="form-message field-error"><?php echo htmlspecialchars($fieldErrors['old_password']); ?></div>
                                    <?php endif; ?>
                        <div class="form-group"><label>New password</label><input id="change_new_password" class="input-form" type="password" name="new_password" required></div>
                                    <?php if (!empty($fieldErrors['new_password'])): ?>
                                        <div class="form-message field-error"><?php echo htmlspecialchars($fieldErrors['new_password']); ?></div>
                                    <?php endif; ?>
                        <div class="form-message" data-for="change_new_password">
                            <strong>Password must include:</strong>
                            <ul>
                                <li data-req="length">At least 8 characters</li>
                                <li data-req="upper">One uppercase letter</li>
                                <li data-req="number">One number</li>
                                <li data-req="spaces">No spaces</li>
                            </ul>
                        </div>
                        <div class="form-group"><label>Confirm new password</label><input class="input-form" type="password" name="new_password_confirm" required></div>
                        <?php if (!empty($fieldErrors['new_password_confirm'])): ?>
                            <div class="form-message field-error"><?php echo htmlspecialchars($fieldErrors['new_password_confirm']); ?></div>
                        <?php endif; ?>
                        <button class="big-btn btn primary wide" type="submit">Update password</button>
                    </form>
                </div>
        <?php elseif ($view === 'reset'): ?>
            <h1>Set a new password</h1>
            <div class="auth-container">
                <?php if (session_status() === PHP_SESSION_NONE) session_start();
                      $resetUid = $_SESSION['password_reset_user_id'] ?? null;
                ?>
                <?php if (!$resetUid): ?>
                    <div class="error-box"><p>Reset session not found or expired. Please request a new reset code.</p>
                    <p><a href="/artine3/auth/password.php">Request a new code</a></p></div>
                <?php else: ?>
                    <?php if (!empty($errors)): ?>
                        <div class="error-box"><ul><?php foreach ($errors as $e) echo '<li>' . htmlspecialchars($e) . '</li>'; ?></ul></div>
                    <?php endif; ?>
                    <form method="post" class="auth-form">
                        <input type="hidden" name="action" value="reset" />
                        <div class="form-group"><label>New password</label><input id="reset_new_password" class="input-form" type="password" name="new_password" required></div>
                            <?php if (!empty($fieldErrors['new_password'])): ?>
                                <div><?php echo htmlspecialchars($fieldErrors['new_password']); ?></div>
                            <?php endif; ?>
                        <div class="form-message" data-for="reset_new_password">
                            <strong>Password must include:</strong>
                            <ul>
                                <li data-req="length">At least 8 characters</li>
                                <li data-req="upper">One uppercase letter</li>
                                <li data-req="number">One number</li>
                                <li data-req="spaces">No spaces</li>
                            </ul>
                        </div>
                        <div class="form-group"><label>Confirm new password</label><input class="input-form" type="password" name="new_password_confirm" required></div>
                            <?php if (!empty($fieldErrors['new_password_confirm'])): ?>
                                <div><?php echo htmlspecialchars($fieldErrors['new_password_confirm']); ?></div>
                            <?php endif; ?>
                        <button class="big-btn btn primary wide" type="submit">Set new password</button>
                    </form>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <h1>Reset password</h1>
            <div class="auth-container">
                <?php if (!empty($errors)): ?>
                    <div class="error-box"><ul><?php foreach ($errors as $e) echo '<li>' . htmlspecialchars($e) . '</li>'; ?></ul></div>
                <?php endif; ?>
                <?php if ($notice): ?>
                    <div class="notice"><?php echo htmlspecialchars($notice); ?></div>
                <?php else: ?>
                    <form method="post" class="auth-form">
                        <input type="hidden" name="action" value="send_reset" />
                        <div class="form-group"><label>Email</label><input id="forgot_email" class="input-form" type="email" name="email" required></div>
                        <?php if (!empty($fieldErrors['email'])): ?>
                            <div class="form-message field-error"><?php echo htmlspecialchars($fieldErrors['email']); ?></div>
                        <?php endif; ?>
                        <button id="sendResetBtn" class="big-btn btn primary wide" type="submit">Send reset code</button>
                    </form>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </main>
    <script>
    (function(){
        function checkPasswordRules(val){
            return {
                length: val.length >= 8,
                upper: /[A-Z]/.test(val),
                number: /\d/.test(val),
                spaces: !/\s/.test(val)
            };
        }

        // Make the "Send reset code" button show immediate sending state
        try {
            const forgotForm = document.querySelector('form.auth-form input[name="action"][value="send_reset"]') ? document.querySelector('form.auth-form') : null;
            const sendBtn = document.getElementById('sendResetBtn');
            if (forgotForm && sendBtn) {
                forgotForm.addEventListener('submit', function(e){
                    try {
                        sendBtn.disabled = true;
                        sendBtn.textContent = 'Sending...';
                    } catch (err) {}
                    // allow form to submit normally
                });
            }
        } catch (err) {}
        // Wire each requirements box (data-for -> input id)
        document.querySelectorAll('.form-message[data-for]').forEach(msg => {
            const inputId = msg.getAttribute('data-for');
            const input = document.getElementById(inputId);
            if (!input) return;

            // store original HTML so we can restore later
            msg.dataset.origHtml = msg.innerHTML;
            msg.dataset.touched = '0';
            msg.dataset.shown = '0'; // whether requirements box was shown at least once

            function applyState(){
                const val = input.value || '';
                const res = checkPasswordRules(val);
                const lis = Array.from(msg.querySelectorAll('li[data-req]'));
                const all = Object.values(res).every(Boolean);

                // if input is empty and never touched, keep hidden
                if (val === '' && msg.dataset.touched === '0') {
                    msg.classList.remove('show','success');
                    return;
                }

                // mark touched on first non-empty input
                if (msg.dataset.touched === '0' && val !== '') msg.dataset.touched = '1';

                if (!all) {
                    // show unmet requirements
                    lis.forEach(li => {
                        const r = li.getAttribute('data-req');
                        li.style.display = (res[r] ? 'none' : 'list-item');
                    });
                    msg.classList.remove('success');
                    msg.classList.add('show');
                    msg.dataset.shown = '1';
                    // restore original HTML if it had success text
                    if (msg.innerHTML.indexOf('Great! Your password is strong.') !== -1) {
                        msg.innerHTML = msg.dataset.origHtml || msg.innerHTML;
                    }
                } else {
                    // all requirements satisfied
                    if (msg.dataset.shown === '1') {
                        // only show success message if the user saw the requirements first
                        msg.classList.remove('show');
                        msg.classList.add('show','success');
                        msg.innerHTML = '<p class="success">Great! Your password is strong.</p>';
                    } else {
                        // user typed a valid password from the start and never saw requirements: keep hidden
                        msg.classList.remove('show','success');
                    }
                }
            }

            // initial state: hidden
            msg.classList.remove('show','success');

            // listen for input events
            input.addEventListener('input', applyState);
        });
    })();
    </script>
</body>
</html>
