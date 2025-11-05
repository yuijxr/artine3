<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
header('Content-Type: application/json');
$count = 0;
if (is_logged_in()) {
    $uid = intval($_SESSION['user_id']);
    $stmt = $conn->prepare('SELECT SUM(quantity) AS cnt FROM cart WHERE user_id = ?');
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    $r = $stmt->get_result()->fetch_assoc();
    $count = intval($r['cnt'] ?? 0);
}

echo json_encode(['count'=>$count]);
