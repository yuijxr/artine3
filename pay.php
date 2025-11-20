<?php
// pay.php
// Simple PayMongo GCash checkout example using curl (test keys)
// Replace $PAYMONGO_SECRET_KEY with your PayMongo test secret key (starts with "test_")
// Note: PayMongo server endpoints require the secret key. If you only have a public key,
// you'll need a different client-side flow — here we assume a server-side test key.

// ---------------------------
// Configuration
// ---------------------------
$PAYMONGO_SECRET_KEY = 'sk_test_Q2ZBCVycjwFxcbh6gLoEPbVv'; // <<-- REPLACE with your test secret key

// Default hardcoded amount (in centavos). 10000 = ₱100.00
$amount = 10000;

// A return URL PayMongo will redirect to after payment attempt.
// For local testing you can point to this same script and handle the status query param.
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'];
$base = $protocol . '://' . $host . rtrim(dirname($_SERVER['PHP_SELF']), '/\\');
$return_url = $base . '/pay.php?status=return';
$success_url = $base . '/pay.php?status=success';
$failed_url = $base . '/pay.php?status=failed';

// ---------------------------
// Handle form submission (create source)
// ---------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // If you want to use a dynamic price from your checkout page, replace this with your value:
    // Example: $price = floatval($_POST['price']); // price in PHP pesos
    // $amount = intval($price * 100); // convert pesos to centavos

    // Dynamic amount: if a `price` (in PHP pesos) is POSTed, use it
    if (!empty($_POST['price'])) {
        $price_raw = str_replace(',', '', trim($_POST['price']));
        $price = floatval($price_raw);
        if ($price > 0) {
            $amount = intval(round($price * 100));
        }
    }

    // Example of adding customer name + email from your checkout form
    $customer_name = isset($_POST['name']) ? trim($_POST['name']) : '';
    $customer_email = isset($_POST['email']) ? trim($_POST['email']) : '';

    // Build payload for PayMongo Sources API to create a GCash source
    // Sanitize metadata: PayMongo requires flat (non-nested) string values for metadata keys.
    $metadata = [];
    if (!empty($customer_name)) {
        if (is_array($customer_name)) $customer_name = implode(', ', $customer_name);
        $metadata['customer_name'] = (string)$customer_name;
    }
    if (!empty($customer_email)) {
        if (is_array($customer_email)) $customer_email = implode(', ', $customer_email);
        $metadata['customer_email'] = (string)$customer_email;
    }
    if (!empty($_POST['order_id'])) {
        $order_id = intval($_POST['order_id']);
        if ($order_id > 0) {
            $metadata['order_id'] = (string)$order_id;
        }
    }

    // Generate a short client token to correlate the payment record with the redirect
    try {
        $client_token = bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        $client_token = uniqid('pay_', true);
    }
    $metadata['token'] = (string)$client_token;

    // Build redirect URLs, include order_id / token / address_id / payment_method_id if available
    $success_redirect = $success_url;
    $failed_redirect = $failed_url;
    if (!empty($metadata['order_id'])) {
        $success_redirect .= '&order_id=' . urlencode($metadata['order_id']);
        $failed_redirect .= '&order_id=' . urlencode($metadata['order_id']);
    }
    // include address_id/payment_method_id if posted so the server can create the order after redirect
    if (!empty($_POST['address_id'])) {
        $addr_post = intval($_POST['address_id']);
        $success_redirect .= '&address_id=' . $addr_post;
        $failed_redirect .= '&address_id=' . $addr_post;
    }
    if (!empty($_POST['payment_method_id'])) {
        $pm_post = intval($_POST['payment_method_id']);
        $success_redirect .= '&payment_method_id=' . $pm_post;
        $failed_redirect .= '&payment_method_id=' . $pm_post;
    }
    // include our correlation token
    $success_redirect .= '&token=' . urlencode($client_token);
    $failed_redirect .= '&token=' . urlencode($client_token);

    $payload = [
        'data' => [
            'attributes' => [
                'amount' => (int)$amount,
                'currency' => 'PHP',
                'type' => 'gcash',
                'redirect' => [
                    // PayMongo expects both `success` and `failed` redirect URLs for e-wallet flows
                    'success' => $success_redirect,
                    'failed' => $failed_redirect
                ],
                // Optional metadata for your records — must be flat key => string pairs
                'metadata' => $metadata
            ]
        ]
    ];

    $json = json_encode($payload);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://api.paymongo.com/v1/sources');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    // Authorization: Basic {secret_key:}
    $auth = base64_encode($PAYMONGO_SECRET_KEY . ':');
    $headers = [
        'Authorization: Basic ' . $auth,
        'Content-Type: application/json',
        'Content-Length: ' . strlen($json)
    ];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    $http_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err) {
        http_response_code(500);
        echo "cURL Error: " . htmlspecialchars($err);
        exit;
    }

    $resp = json_decode($response, true);

    // Try common locations for checkout URL returned by PayMongo
    $checkout_url = null;
    if (!empty($resp['data']['attributes']['checkout_url'])) {
        $checkout_url = $resp['data']['attributes']['checkout_url'];
    } elseif (!empty($resp['data']['attributes']['redirect']['checkout_url'])) {
        $checkout_url = $resp['data']['attributes']['redirect']['checkout_url'];
    }

    if ($checkout_url) {
        // Persist a local payment record linking order_id (if provided) to the PayMongo source id.
        // Create payments table if it doesn't exist, then insert a record.
        try {
            // include DB connection if available
            if (file_exists(__DIR__ . '/includes/db_connect.php')) {
                require_once __DIR__ . '/includes/db_connect.php';
                // payments table is expected to already exist in the project's schema
                // We only insert a payment record here; do not attempt to create the table.

                $source_id = $resp['data']['id'] ?? null;
                $amount_decimal = number_format($amount / 100, 2, '.', '');
                $provider = 'paymongo';
                $order_id = isset($order_id) ? intval($order_id) : null;
                $ins = $conn->prepare('INSERT INTO payments (order_id,provider,provider_source_id,token,amount,status) VALUES (?,?,?,?,?,?)');
                if ($ins) {
                    $st = 'pending';
                    $ins->bind_param('isssds', $order_id, $provider, $source_id, $client_token, $amount_decimal, $st);
                    $ins->execute();
                    $ins->close();
                }
            }
        } catch (Exception $e) {
            // non-fatal — we still redirect the user
        }

        // Redirect the user to the GCash PayMongo checkout URL
        header('Location: ' . $checkout_url);
        exit;
    }

    // If there was no checkout URL, show diagnostic info
    http_response_code(500);
    echo "Unexpected response from PayMongo (status: " . intval($http_status) . "):\n<pre>" . htmlspecialchars($response) . "</pre>";
    exit;
}

// If user is redirected back after payment attempt, show a simple status page
if (isset($_GET['status'])) {
    $s = $_GET['status'];
    $order_id = isset($_GET['order_id']) ? intval($_GET['order_id']) : null;
    $token = isset($_GET['token']) ? trim($_GET['token']) : null;
    $address_id = isset($_GET['address_id']) ? intval($_GET['address_id']) : null;
    $payment_method_id = isset($_GET['payment_method_id']) ? intval($_GET['payment_method_id']) : null;

    // If we have DB access and a token/order data, try to reconcile payment state and update order/payment.
    if (($order_id || $token) && file_exists(__DIR__ . '/includes/db_connect.php')) {
        require_once __DIR__ . '/includes/db_connect.php';
        // on success: if token present and no order_id, create order server-side (using current session/cart)
        if ($s === 'success') {
            try {
                // If token provided, find corresponding payment
                $payment_row = null;
                if ($token) {
                    $sel = $conn->prepare('SELECT payment_id, provider_source_id, amount, order_id FROM payments WHERE token = ? AND provider = ? LIMIT 1');
                    if ($sel) {
                        $prov = 'paymongo';
                        $sel->bind_param('ss', $token, $prov);
                        $sel->execute();
                        $res = $sel->get_result();
                        $payment_row = $res->fetch_assoc();
                        $sel->close();
                    }
                }

                // If there is no existing order and we have address + payment method + session, attempt to create order now
                if (empty($order_id) && !empty($address_id) && !empty($payment_method_id)) {
                    // ensure session and current user
                    if (file_exists(__DIR__ . '/includes/session.php')) require_once __DIR__ . '/includes/session.php';
                    if (!empty($_SESSION['user_id'])) {
                        $user_id = intval($_SESSION['user_id']);
                        // fetch cart items
                        $stmt = $conn->prepare('SELECT c.product_id, c.quantity, c.size, p.price, p.name FROM cart c JOIN products p ON c.product_id = p.product_id WHERE c.user_id = ?');
                        if ($stmt) {
                            $stmt->bind_param('i', $user_id);
                            $stmt->execute();
                            $res = $stmt->get_result();
                            $items = $res->fetch_all(MYSQLI_ASSOC);
                            $stmt->close();
                        }
                        if (!empty($items)) {
                            $subtotal = 0.0;
                            foreach ($items as $it) { $subtotal += floatval($it['price']) * intval($it['quantity']); }
                            $shipping = 49.00;
                            $total = round($subtotal + $shipping, 2);

                            // create order transaction and mark it as paid (payment already completed)
                            $conn->begin_transaction();
                            $ins = $conn->prepare('INSERT INTO orders (user_id,address_id,payment_method_id,total_amount,status,created_at) VALUES (?,?,?,?,?,NOW())');
                            $status = 'paid';
                            $ins->bind_param('iiids', $user_id, $address_id, $payment_method_id, $total, $status);
                            if (!$ins->execute()) { throw new Exception('Failed to insert order: ' . $conn->error); }
                            $new_order_id = $conn->insert_id;
                            $ins->close();

                            $itemStmt = $conn->prepare('INSERT INTO order_items (order_id,product_id,product_name,product_price,quantity,size,subtotal) VALUES (?,?,?,?,?,?,?)');
                            if (!$itemStmt) { throw new Exception('Prepare order_items failed: ' . $conn->error); }
                            foreach ($items as $it) {
                                $pid = intval($it['product_id']);
                                $pname = $it['name'];
                                $pprice = round(floatval($it['price']), 2);
                                $pqty = intval($it['quantity']);
                                $psize = $it['size'] ?? '';
                                $sub = round($pprice * $pqty, 2);
                                if (!$itemStmt->bind_param('iisdisd', $new_order_id, $pid, $pname, $pprice, $pqty, $psize, $sub)) {
                                    throw new Exception('Bind failed for order_items: ' . $itemStmt->error);
                                }
                                if (!$itemStmt->execute()) { throw new Exception('Insert order_item failed: ' . $itemStmt->error); }
                            }
                            $itemStmt->close();

                            // clear cart
                            $del = $conn->prepare('DELETE FROM cart WHERE user_id = ?');
                            $del->bind_param('i', $user_id);
                            $del->execute();
                            $del->close();

                            $conn->commit();
                            $order_id = $new_order_id;
                        }
                    }
                }

                // If we have a payment row and an order id, update payment -> link and mark paid
                if (!empty($payment_row) && !empty($order_id)) {
                    $upd = $conn->prepare('UPDATE payments SET order_id = ?, status = ? WHERE payment_id = ?');
                    if ($upd) { $paid = 'paid'; $upd->bind_param('isi', $order_id, $paid, $payment_row['payment_id']); $upd->execute(); $upd->close(); }
                    // ensure order status is paid
                    $updO = $conn->prepare('UPDATE orders SET status = ? WHERE order_id = ?');
                    if ($updO) { $paid = 'paid'; $updO->bind_param('si', $paid, $order_id); $updO->execute(); $updO->close(); }
                }
            } catch (Exception $e) {
                // non-fatal
            }
            // Redirect back to account orders with flags so the UI can show notifications
            header('Location: ' . $base . '/account.php?order_placed=1&payment_success=1#orders');
            exit;
        } elseif ($s === 'failed') {
            try {
                // mark payment failed by token so no order is created and cart remains intact
                if ($token) {
                    $updP = $conn->prepare('UPDATE payments SET status = ? WHERE token = ? AND provider = ?');
                    $failed = 'failed'; $provider = 'paymongo';
                    $updP->bind_param('sss', $failed, $token, $provider);
                    $updP->execute(); $updP->close();
                }
            } catch (Exception $e) {}
            // Return user to checkout so cart remains intact
            header('Location: ' . $base . '/checkout.php?payment_failed=1');
            exit;
        }
    }
    // Fallback: show a small status page
    if ($s === 'success') {
        echo "<!doctype html><html><head><meta charset=\"utf-8\"><title>Payment Success</title></head><body><h1>Payment completed</h1><p>Your payment attempt completed. This page is a simple confirmation — verify the payment status in the admin/orders page or via webhooks.</p><p><a href=\"/account.php#orders\">View your orders</a></p></body></html>";
        exit;
    } elseif ($s === 'failed') {
        echo "<!doctype html><html><head><meta charset=\"utf-8\"><title>Payment Failed</title></head><body><h1>Payment failed or cancelled</h1><p>The payment was not completed. You may try again from your orders page.</p><p><a href=\"/account.php#orders\">View your orders</a></p></body></html>";
        exit;
    } else {
        echo "<!doctype html><html><head><meta charset=\"utf-8\"><title>Payment</title></head><body><h1>Payment page</h1><p>Status: " . htmlspecialchars($s) . "</p></body></html>";
        exit;
    }
}

// ---------------------------
// Render a simple HTML page with a Pay with GCash button
// ---------------------------
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Pay with GCash (PayMongo) - Test</title>
    <style>
        body{font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:40px auto;padding:0 20px}
        .btn{display:inline-block;padding:12px 20px;background:#0096ff;color:#fff;border-radius:6px;text-decoration:none}
        .muted{color:#666;font-size:0.9rem}
        form{margin-top:20px}
        input[type=text], input[type=email], input[type=number]{padding:8px;width:100%;margin:6px 0}
    </style>
</head>
<body>
    <h1>Pay with GCash (PayMongo) — Test</h1>
    <p class="muted">Amount: ₱<?php echo number_format($amount / 100, 2); ?> (hardcoded)</p>

    <!-- Example checkout form. On submit this page will create the GCash source and redirect user -->
    <form method="post" action="pay.php">
        <!-- Optional: collect a dynamic price (in PHP) — uncomment to use -->
        <!--
        <label>Price (PHP):
            <input type="number" name="price" step="0.01" placeholder="100.00">
        </label>
        -->

        <label>Name (optional):
            <input type="text" name="name" placeholder="Customer name">
        </label>
        <label>Email (optional):
            <input type="email" name="email" placeholder="customer@example.com">
        </label>

        <button class="btn" type="submit">Pay with GCash</button>
    </form>

    <hr>
    <h3>Notes</h3>
    <ul>
        <li class="muted">Replace the `$PAYMONGO_SECRET_KEY` variable at the top of this file with your PayMongo <strong>test secret</strong> key.</li>
        <li class="muted">To use a dynamic price: uncomment the price field in the form and set the PHP handling above:
            <code>$price = floatval($_POST['price']); $amount = intval($price * 100);</code>
        </li>
        <li class="muted">You can pass customer name/email via the `name` and `email` inputs; they are added to the `metadata` field in the source creation payload.</li>
        <li class="muted">This example uses the PayMongo Sources API which returns a checkout URL for e-wallet payments like GCash.</li>
        <li class="muted">No webhook or order persistence is included — implement those when you're ready.</li>
    </ul>
</body>
</html>
