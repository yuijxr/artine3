<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/helpers.php';
header('Content-Type: application/json');
if (!is_logged_in()) {
    echo json_encode([]);
    exit;
}
$uid = intval($_SESSION['user_id']);
$sql = "SELECT c.cart_id, c.product_id, c.quantity, c.size, p.name, p.price, p.image_url, cat.name AS category_name 
         FROM cart c 
         JOIN products p ON p.product_id = c.product_id 
         JOIN categories cat ON p.category_id = cat.category_id 
         WHERE c.user_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param('i', $uid);
$stmt->execute();
$res = $stmt->get_result();
$items = [];
while ($r = $res->fetch_assoc()) {
    $items[] = [
        'cart_id' => $r['cart_id'],
        'id' => $r['product_id'],
        'name' => $r['name'],
        'price' => $r['price'],
        'quantity' => $r['quantity'],
        'size' => $r['size'],
        'image' => resolve_image_path($r['image_url'] ?: 'no-image.png', $r['category_name']),
        'category_name' => $r['category_name']
    ];
}

echo json_encode($items);
