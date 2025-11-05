<?php
require_once __DIR__ . '/../includes/db_connect.php';
header('Content-Type: application/json');
$res = $conn->query('SELECT method_id, name FROM payment_methods');
$out = [];
while($r = $res->fetch_assoc()) $out[] = $r;
echo json_encode($out);
