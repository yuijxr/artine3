<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';

header('Content-Type: application/json');
$data = json_decode(file_get_contents('php://input'), true);
if (!is_logged_in()) {
    echo json_encode(['success'=>false,'message'=>'Not logged in']);
                        exit;
}

$user_id = intval($_SESSION['user_id']);
$product_id = intval($data['id'] ?? $data['product_id'] ?? 0);
$size = $data['size'] ?? '';
$qty = max(1, intval($data['quantity'] ?? $data['qty'] ?? 1));

if ($product_id<=0) {
    echo json_encode(['success'=>false,'message'=>'Invalid product']); exit;
}

// If update flag present, update quantity
if (!empty($data['update'])) {
    $stmt = $conn->prepare('UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ? AND size = ?');
                        $stmt->bind_param('iiis', $qty, $user_id, $product_id, $size);
                        $stmt->execute();
                        $stmt->close();
                        echo json_encode(['success'=>true]);
                        exit;
}

// insert or update existing
$stmt = $conn->prepare('SELECT cart_id,quantity FROM cart WHERE user_id = ? AND product_id = ? AND size = ? LIMIT 1');
$stmt->bind_param('iis', $user_id, $product_id, $size);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $newq = $row['quantity'] + $qty;
                        $stmt2 = $conn->prepare('UPDATE cart SET quantity = ? WHERE cart_id = ?');
                        $stmt2->bind_param('ii', $newq, $row['cart_id']);
                        $stmt2->execute();
                        $stmt2->close();
} else {
    $stmt2 = $conn->prepare('INSERT INTO cart (user_id,product_id,quantity,size,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())');
    $stmt2->bind_param('iiis', $user_id, $product_id, $qty, $size);
    $stmt2->execute();
    $stmt2->close();
}
$stmt->close();

// return new count
$stmt = $conn->prepare('SELECT SUM(quantity) as cnt FROM cart WHERE user_id = ?');
$stmt->bind_param('i', $user_id);
$stmt->execute();
$r = $stmt->get_result()->fetch_assoc();
$count = intval($r['cnt'] ?? 0);
echo json_encode(['success'=>true,'count'=>$count,'message'=>'Added to cart']);
