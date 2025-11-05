<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
header('Content-Type: application/json');
if (!is_logged_in()) {
    echo json_encode(['success' => false, 'message' => 'Not logged in']);
    exit;
}
$user_id = intval($_SESSION['user_id']);
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Unsupported method']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$order_id = intval($data['order_id'] ?? 0);
if ($order_id <= 0) {
    echo json_encode(['success' => false, 'message' => 'order_id required']);
    exit;
}

// Verify ownership
$stmt = $conn->prepare(
    'SELECT status, user_id FROM orders WHERE order_id = ?'
);
$stmt->bind_param('i', $order_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$row) {
    echo json_encode(['success' => false, 'message' => 'Order not found']);
    exit;
}
if (intval($row['user_id']) !== $user_id) {
    echo json_encode(['success' => false, 'message' => 'Not your order']);
    exit;
}
$current = strtolower($row['status'] ?? '');
// Only allow cancellation for pending or paid orders
if (!in_array($current, ['pending', 'paid'])) {
    echo json_encode(['success' => false, 'message' => 'Order cannot be cancelled']);
    exit;
}

// perform update
$up = $conn->prepare(
    'UPDATE orders SET status = ? WHERE order_id = ? AND user_id = ?'
);
$new = 'cancelled';
$up->bind_param('sii', $new, $order_id, $user_id);
if (!$up->execute()) {
    echo json_encode(['success' => false, 'message' => 'Failed to cancel: ' . $up->error]);
    exit;
}
$affected = $up->affected_rows;
$up->close();
if ($affected > 0) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'message' => 'No change made']);
}
