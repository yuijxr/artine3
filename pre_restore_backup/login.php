<?php
require_once 'includes/db_connect.php';
require_once 'includes/session.php';

$errors = [];
$registered_notice = '';

if (!empty($_GET['registered'])) {
    $registered_notice = 'Registration successful. Please log in with your new account.';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    if ($email === '' || $password === '') {
        $errors[] = 'Email and password are required.';
    } else {
        $stmt = $conn->prepare('SELECT user_id, password_hash, first_name FROM users WHERE email = ? LIMIT 1');
        if ($stmt === false) {
            $errors[] = 'Database error: ' . $conn->error;
        } else {
            $stmt->bind_param('s', $email);
            $stmt->execute();
            $result = $stmt->get_result();
            $user = $result->fetch_assoc();
            $stmt->close();

                if ($user && password_verify($password, $user['password_hash'])) {
                    $_SESSION['user_id'] = $user['user_id'];
                                                                                                                    $_SESSION['first_name'] = $user['first_name']; // For greeting later
                                                                                                                    // redirect with a flag so the landing page can show a toast
                                                                                                                    header('Location: index.php?logged_in=1');
                                                                                                                    exit;
                } else {
                $errors[] = 'Invalid email or password.';
            }
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/auth.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>FitCheck | Login</title>
</head>
<body>
    <?php include 'includes/header.php'; ?>

    <main class="auth-content">
        <h1>Login</h1>
        
        <div class="auth-container">
            <div class="auth-forms">

                <?php if ($registered_notice): ?>
                    <div class="auth-notice success"><?php echo htmlspecialchars($registered_notice); ?></div>
                <?php endif; ?>

                <?php if (!empty($errors)): ?>
                    <div class="auth-notice error">
                        <ul>
                            <?php foreach ($errors as $e): ?>
                                <li><?php echo htmlspecialchars($e); ?></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                <?php endif; ?>

                <!-- Login Form -->
                <form class="auth-form active" id="loginForm" method="post">
                    <div class="form-group">
                        <label for="loginEmail">Email</label>
                        <input 
                            type="email" 
                            id="loginEmail" 
                            name="email"
                            placeholder="Enter your email" 
                            value="<?php echo htmlspecialchars($_POST['email'] ?? ''); ?>" 
                            required
                        >
                    </div>
                    
                    <div class="form-group">
                        <label for="loginPassword">Password</label>
                        <input 
                            type="password" 
                            id="loginPassword" 
                            name="password"
                            placeholder="Enter your password" 
                            required
                        >
                    </div>
                    
                    <div class="forgot-password">
                        <a href="#" onclick="showForgotPassword()">Forgot Password?</a>
                    </div>
                    
                    <button type="submit" class="auth-button">Login</button>
                    
                    <div class="switch-form">
                        <button type="button"><a href="register.php">Create Account</a></button>
                    </div>
                </form>
            </div>
        </div>
    </main>
    
    <?php include 'includes/footer.php'; ?>

    <script src="assets/js/index.js"></script>
    <script>
        // Show server-side notices using the toast system if available
        document.addEventListener('DOMContentLoaded', ()=>{
            try{
                var registered = <?php echo json_encode($registered_notice ? $registered_notice : ''); ?>;
                var errors = <?php echo json_encode(!empty($errors) ? $errors : []); ?>;
                if (registered && registered.length) {
                    if (typeof showNotification === 'function') showNotification(registered, 'success');
                }
                if (errors && errors.length) {
                    // show first error as a toast and keep the HTML list for accessibility
                                                                                                                        if (typeof showNotification === 'function') showNotification(errors[0], 'error');
                }
            }catch(e){
                /* ignore */
            }
        });
    </script>
</body>
</html>
