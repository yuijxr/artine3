<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
header('Content-Type: application/json');
$data = json_decode(file_get_contents('php://input'), true);
if (!is_logged_in()) {
    echo json_encode(['success'=>false,'message'=>'Not logged in']); exit;
}
$uid = intval($_SESSION['user_id']);
$product_id = intval($data['product_id'] ?? 0);
$size = $data['size'] ?? '';
if ($product_id<=0) {
    echo json_encode(['success'=>false]); exit;
}
$stmt = $conn->prepare('DELETE FROM cart WHERE user_id = ? AND product_id = ? AND size = ?');
$stmt->bind_param('iis', $uid, $product_id, $size);
$stmt->execute();

echo json_encode(['success'=>true]);
