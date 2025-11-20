<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
header('Content-Type: application/json');
if (!is_logged_in()) { echo json_encode(['success' => false, 'message' => 'Not logged in']); exit; }
$uid = intval($_SESSION['user_id']);
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$method_id = intval($data['method_id'] ?? 0);
if ($method_id <= 0) { echo json_encode(['success' => false, 'message' => 'Invalid payment method']); exit; }

// ensure payment method exists
$res = $conn->prepare('SELECT method_id FROM payment_methods WHERE method_id = ? LIMIT 1');
$res->bind_param('i', $method_id);
$res->execute();
$r = $res->get_result()->fetch_assoc();
$res->close();
if (!$r) { echo json_encode(['success' => false, 'message' => 'Payment method not found']); exit; }

// Add column to users table if missing
$colCheck = $conn->query("SHOW COLUMNS FROM users LIKE 'default_payment_method_id'");
if ($colCheck && $colCheck->num_rows === 0) {
    $conn->query("ALTER TABLE users ADD COLUMN default_payment_method_id INT NULL AFTER phone");
}

$upd = $conn->prepare('UPDATE users SET default_payment_method_id = ? WHERE user_id = ?');
$upd->bind_param('ii', $method_id, $uid);
if ($upd->execute()) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to update']);
}
$upd->close();
