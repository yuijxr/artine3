<?php
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/helpers.php';
header('Content-Type: application/json');

$cat = intval($_GET['category_id'] ?? 0);
$exclude_id = intval($_GET['exclude_id'] ?? 0);

$sql = 'SELECT p.product_id, p.name, p.price, p.image_url, c.name AS category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.category_id';

$conditions = [];
if ($cat) $conditions[] = 'p.category_id = ' . $cat;
if ($exclude_id) $conditions[] = 'p.product_id != ' . $exclude_id;

if (!empty($conditions)) {
    $sql .= ' WHERE ' . implode(' AND ', $conditions);
}

$sql .= ' ORDER BY RAND() LIMIT 4';

$res = $conn->query($sql);
$out = [];

while ($r = $res->fetch_assoc()) {
    $r['image_url'] = resolve_image_path($r['image_url'] ?: 'no-image.png', $r['category_name']);
    $out[] = $r;
}

echo json_encode($out);
