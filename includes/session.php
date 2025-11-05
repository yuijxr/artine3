<?php
// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * Return true if a user_id is set in session
 */
function is_logged_in()
{
    return !empty($_SESSION['user_id']);
}

/**
 * Require login and redirect to login page if not logged in
 */
function require_login()
{
    if (!is_logged_in()) {
        header('Location: /artine3/login.php');
        exit;
    }
}

/**
 * Fetch current user row from users table using mysqli connection
 *
 * @param mysqli $conn
 * @return array|null
 */
function current_user($conn)
{
    if (!is_logged_in()) {
        return null;
    }

    $user_id = intval($_SESSION['user_id']);
    $stmt = $conn->prepare('SELECT * FROM users WHERE user_id = ? LIMIT 1');
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    return $user ?: null;
}
