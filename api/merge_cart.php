<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
header('Content-Type: application/json');
if (!is_logged_in()) { echo json_encode(['success'=>false,'message'=>'Not logged in']); exit; }
$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) { echo json_encode(['success'=>false,'message'=>'Invalid payload']); exit; }
$uid = intval($_SESSION['user_id']);

foreach ($data as $item) {
    $product_id = intval($item['id'] ?? 0);
    $size = $item['size'] ?? '';
    $qty = max(1, intval($item['quantity'] ?? 1));
    if ($product_id<=0) continue;

    // merge logic: if exists, sum quantities; else insert
    $stmt = $conn->prepare('SELECT cart_id,quantity FROM cart WHERE user_id = ? AND product_id = ? AND size = ? LIMIT 1');
    $stmt->bind_param('iis', $uid, $product_id, $size);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $newq = $row['quantity'] + $qty;
        $u = $conn->prepare('UPDATE cart SET quantity = ? WHERE cart_id = ?');
        $u->bind_param('ii', $newq, $row['cart_id']);
        $u->execute();
        $u->close();
    } else {
        $i = $conn->prepare('INSERT INTO cart (user_id,product_id,quantity,size,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())');
        $i->bind_param('iiis', $uid, $product_id, $qty, $size);
        $i->execute();
        $i->close();
    }
    $stmt->close();
}

echo json_encode(['success'=>true]);
