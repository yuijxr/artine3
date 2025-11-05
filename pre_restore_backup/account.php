<?php
require_once 'includes/session.php';
require_once 'includes/db_connect.php';

if (!is_logged_in()) {
    header('Location: login.php');
                        exit;
}

$user = current_user($conn);
$name = trim($user['first_name'] ?? '') ?: 'User';
$email = htmlspecialchars($user['email'] ?? '');
?>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/profile.css">
  <style>
  /* Minimal visual fixes for mannequin preference buttons (small, non-invasive) */
  .skin-btn {
      width:34px; height:34px; padding:0; border-radius:50%; border:1px solid #ccc; display:inline-flex; align-items:center; justify-content:center; margin:6px; background:transparent; cursor:pointer;
  }
  .skin-btn .swatch { width:26px; height:26px; border-radius:50%; display:block; }
  .skin-btn[aria-pressed="true"] { outline:3px solid rgba(25,118,210,0.25); }
  .face-btn, .bodyshape-btn, .pose-btn { padding:6px 10px; border-radius:6px; margin:6px 6px 6px 0; cursor:pointer; border:1px solid #ddd; background:#fff; }
  .face-btn.active, .bodyshape-btn.active, .pose-btn.active { border-color:#1976d2; box-shadow:0 0 0 3px rgba(25,118,210,0.06); }
  </style>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>FitCheck</title>
</head>
<body>
    <?php include 'includes/header.php'; ?>
    <main class="profile-content">
    <div class="profile-header">
      <div class="profile-avatar">
        <img src="assets/default-avatar.svg" alt="Profile Picture">
      </div>
      <div class="profile-info">
        <h1 id="user-fullname">Loading...</h1>
        <p class="member-since" id="member-since">ARTine member</p>
      </div>
    </div>

    <div class="profile-tabs">
      <a href="#" class="tab">Account</a>
      <a href="#" class="tab">Orders</a>
      <a href="#" class="tab">Mannequin</a>
      <a href="#" class="tab">Settings</a>
    </div>

    <div class="profile-section">
      <!-- Panels for tabs: Account, Orders, Mannequin (existing), Settings -->
      <div class="tab-panel account-panel" style="display:none;">
        <div class="section-content" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;">
          <!-- Personal information (left) -->
          <div>
            <h2 style="margin-bottom: 10px;">Personal information</h2>
            <form id="account-form">
              <div class="form-row">
                <label style="width:120px">Email</label>
                <input type="email" id="acct-email" value="<?php echo $email; ?>" readonly>
              </div>
              <div class="form-row">
                <label style="width:120px">Full name</label>
                <input type="text" id="acct-name" value="<?php echo htmlspecialchars($user['first_name'] . ' ' . $user['last_name']); ?>">
              </div>
              <div class="form-row">
                <label style="width:120px">Phone</label>
                <input type="text" id="acct-phone" value="<?php echo htmlspecialchars($user['phone'] ?? ''); ?>">
              </div>
              <div class="form-row">
                <label style="width:120px">New password</label>
                <input type="password" id="acct-pw" placeholder="Leave blank to keep current">
              </div>
              <div style="display:flex; justify-content:flex-end;">
                <button id="acct-save" class="btn primary">Save</button>
              </div>
            </form>
          </div>

          <!-- Address management (right) -->
          <aside>
            <div class="address-container" style="align-items:flex-start;">
              <h3>Addresses</h3>
              <button id="open-address-manager" class="add-address-btn">Manage</button>
            </div>
            <div id="account-addresses" class="addresses-grid">
              <!-- populated by JS: shows up to 3 addresses as preview cards, click Manage to open full manager -->
            </div>
            <p style="margin-top:8px;color:#666;font-size:13px">Click Manage to add, edit, delete, or choose your default shipping address.</p>
          </aside>
        </div>
      </div>

  <div class="tab-panel orders-panel" style="display:none;">
        <div class="section-content">
        <div class="orders-controls" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
    <?php
          // Server-render the user's orders and per-user counts so the Orders tab appears instantly
          $uid = intval($user['user_id'] ?? $_SESSION['user_id'] ?? 0);
          $counts = ['all'=>0,'pending'=>0,'completed'=>0,'cancelled'=>0,'returned'=>0];
          $orders_html = '';
          if ($uid > 0) {
            $stmt = $conn->prepare(
              'SELECT o.order_id,o.total_amount,o.status,o.created_at,o.updated_at,
                (SELECT COALESCE(p.image_url, NULL) FROM order_items oi JOIN products p ON oi.product_id = p.product_id WHERE oi.order_id = o.order_id LIMIT 1) AS thumbnail,
                (SELECT c.name FROM order_items oi JOIN products p ON oi.product_id = p.product_id JOIN categories c ON p.category_id = c.category_id WHERE oi.order_id = o.order_id LIMIT 1) AS category_name
               FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC'
            );
            $stmt->bind_param('i', $uid);
            $stmt->execute();
            $orders = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            foreach ($orders as $ord) {
              $s = strtolower($ord['status'] ?? '');
              $counts['all'] += 1;
              if ($s === 'pending') $counts['pending'] += 1;
              if ($s === 'delivered' || $s === 'completed') $counts['completed'] += 1;
              if ($s === 'cancelled') $counts['cancelled'] += 1;
              if ($s === 'returned') $counts['returned'] += 1;

              // fetch items for this order
              $itstmt = $conn->prepare('SELECT oi.*, p.image_url, p.thumbnail_images, c.name AS category_name FROM order_items oi LEFT JOIN products p ON oi.product_id = p.product_id LEFT JOIN categories c ON p.category_id = c.category_id WHERE oi.order_id = ?');
              $itstmt->bind_param('i', $ord['order_id']);
              $itstmt->execute();
              $items = $itstmt->get_result()->fetch_all(MYSQLI_ASSOC);
              $itstmt->close();

              // compute thumbnail path
              $thumb = $ord['thumbnail'] ?? null;
              $cat = strtolower($ord['category_name'] ?? '');
              $folder = '';
              if (strpos($cat, 'shirt') !== false) $folder = 'shirts/';
              elseif (strpos($cat, 'cap') !== false) $folder = 'caps/';
              elseif (strpos($cat, 'perfume') !== false) $folder = 'perfumes/';
              $thumb_path = $thumb ? 'assets/img/' . $folder . $thumb : 'assets/img/thumbnails/noimg.png';

              // header arrival info
              $dateInfoHtml = '';
              $statusLower = $s;
              if ($statusLower === 'pending') {
                $arrivalText = 'Arrives in 3-5 days';
                if (!empty($ord['created_at'])) {
                  $d = date_create_from_format('Y-m-d H:i:s', $ord['created_at']);
                  if ($d) {
                      $start = clone $d; date_modify($start, '+3 days');
                                                                                                                                  $end = clone $d; date_modify($end, '+5 days');
                                                                                                                                  $dateInfoHtml = '<p class="order-arrival">Arrives on ' . date_format($start,'M j') . '-' . date_format($end,'j') . '</p>';
                  }
                }
              } elseif ($statusLower === 'cancelled' || $statusLower === 'returned') {
                $raw = $ord['updated_at'] ?? $ord['created_at'] ?? null;
                if ($raw) {
                    $d2 = date_create_from_format('Y-m-d H:i:s', $raw);
                                                                                                                      if ($d2) $dateInfoHtml = '<p class="order-arrival">' . ucfirst($statusLower) . ' on ' . date_format($d2,'M j, Y') . '</p>';
                }
              }

              // build items HTML
              $items_html = '';
              foreach ($items as $it) {
                $itthumb = null;
                if (!empty($it['thumbnail_images'])) {
                    $tmp = json_decode($it['thumbnail_images'], true);
                                                                                                                      if (is_array($tmp) && count($tmp) > 0) $itthumb = $tmp[0];
                }
                if (!$itthumb && !empty($it['image_url'])) $itthumb = $it['image_url'];
                $icat = strtolower($it['category_name'] ?? '');
                $ifolder = '';
                if (strpos($icat, 'shirt') !== false) $ifolder = 'shirts/';
                elseif (strpos($icat, 'cap') !== false) $ifolder = 'caps/';
                elseif (strpos($icat, 'perfume') !== false) $ifolder = 'perfumes/';
                $itthumb_path = $itthumb ? 'assets/img/' . $ifolder . $itthumb : 'assets/img/thumbnails/noimg.png';
                $items_html .= '<div class="order-product">';
                $items_html .= '<div class="order-product-image"><img src="' . htmlspecialchars($itthumb_path) . '" alt=""></div>';
                $items_html .= '<div class="order-product-details"><p class="order-product-name">' . htmlspecialchars($it['product_name'] ?? '') . '</p>';
                $items_html .= '<p class="order-product-variant">Size: ' . htmlspecialchars($it['size'] ?? '—') . '</p>';
                $items_html .= '<p class="product-quantity">Quantity: ' . intval($it['quantity'] ?? 0) . '</p></div>';
                $items_html .= '<div class="order-product-price">₱' . number_format(floatval($it['product_price'] ?? 0), 2) . '</div>';
                $items_html .= '</div>';
              }

              // actions
              $actions_html = '';
              if (in_array($statusLower, ['pending','paid'])) {
                  $actions_html .= '<button class="cancel-order-btn action-btn danger" data-id="' . intval($ord['order_id']) . '">Cancel Order</button>';
              } elseif (in_array($statusLower, ['delivered','completed','complete'])) {
                $actions_html .= '<button class="return-product-btn action-btn" data-id="' . intval($ord['order_id']) . '">Return Order</button>';
              }

              $orders_html .= '<div class="order-item" data-status="' . htmlspecialchars($statusLower) . '" style="margin-bottom:18px;">';
              $orders_html .= '<div class="order-header"><div class="order-left"><span class="order-status ' . htmlspecialchars($statusLower) . '">' . htmlspecialchars($ord['status']) . '</span></div><div class="order-right">' . $dateInfoHtml . '</div></div>';
              $orders_html .= '<div class="order-content">' . $items_html . '</div>';
              $orders_html .= '<div class="order-footer"><div class="order-total"><p class="order-total-label">Total</p><p class="order-total-amount">₱' . number_format(floatval($ord['total_amount'] ?? 0), 2) . '</p></div><div class="order-footer-actions">' . $actions_html . '</div></div>';
              $orders_html .= '</div>';
            }
            $stmt->close();
          }
          // render filter buttons with counts filled in
    ?>
            <div id="orders-filter" class="orders-filter-tabs" role="tablist" aria-label="Order filters">
            <button class="orders-filter-btn" data-value="all" role="tab">All (<?php echo intval($counts['all']); ?>)</button>
            <button class="orders-filter-btn" data-value="pending" role="tab">Pending (<?php echo intval($counts['pending']); ?>)</button>
            <button class="orders-filter-btn" data-value="completed" role="tab">Completed (<?php echo intval($counts['completed']); ?>)</button>
            <button class="orders-filter-btn" data-value="cancelled" role="tab">Cancelled (<?php echo intval($counts['cancelled']); ?>)</button>
            <button class="orders-filter-btn" data-value="returned" role="tab">Returned (<?php echo intval($counts['returned']); ?>)</button>
            </div>
          </div>
          </div>
          <div id="orders-list" class="orders-list" data-hydrated="true"><?php echo $orders_html ?: '<div>No orders yet.</div>'; ?></div>
          <div id="order-details" class="order-details"></div>
        </div>
      </div>

      <div class="tab-panel settings-panel" style="display:none;">
        <div class="section-content">
          <p>Manage account settings and sign out.</p>
          <div style="margin-top:12px;display:flex;gap:12px;">
            <a href="logout.php" class="btn">Logout</a>
            <button id="acct-delete" type="button" class="action-btn danger">Delete account</button>
          </div>
        </div>
      </div>

  <div class="mannequin-content" style="display:none;">
        <div class="mannequin-controls">
      <div class="tab tabs">
        <button class="body-measurement tab active" id="bodyTabBtn">Body Measurements</button>
        <button class="other-pref tab" id="otherPrefBtn">Skin, Face, Body Shape</button>
      </div>
  <div id="bodyTab" style="display:none;">
        <form class="measurements">
          <div class="slider-row">
            <label for="shoulders" class="label">Shoulder width</label>
            <div class="slider-group">
              <input type="range" id="shoulders" min="40" max="55" value="48" step="0.5" class="slider">
              <input type="text" class="value-display" value="48">
              <select class="metric-select">
                <option value="cm" selected>cm</option>
                <option value="inch">inch</option>
              </select>
            </div>
          </div>
          <div class="slider-row">
            <label for="chest" class="label">Chest/Bust</label>
            <div class="slider-group">
              <input type="range" id="chest" min="80" max="110" value="94" step="0.5" class="slider">
              <input type="text" class="value-display" value="94">
              <select class="metric-select">
                <option value="cm" selected>cm</option>
                <option value="inch">inch</option>
              </select>
            </div>
          </div>
          <div class="slider-row">
            <label for="waist" class="label">Waist</label>
            <div class="slider-group">
              <input type="range" id="waist" min="70" max="100" value="84" step="0.5" class="slider">
              <input type="text" class="value-display" value="84">
              <select class="metric-select">
                <option value="cm" selected>cm</option>
                <option value="inch">inch</option>
              </select>
            </div>
          </div>
          <div class="slider-row">
            <label for="arms" class="label">Arms</label>
            <div class="slider-group">
              <input type="range" id="arms" min="150" max="200" value="175" step="0.5" class="slider">
              <input type="text" class="value-display" value="175">
              <select class="metric-select">
                <option value="cm" selected>cm</option>
                <option value="inch">inch</option>
              </select>
            </div>
          </div>
          <div class="slider-row">
            <label for="torso" class="label">Torso length</label>
            <div class="slider-group">
              <input type="range" id="torso" min="50" max="80" value="64" step="0.5" class="slider">
              <input type="text" class="value-display" value="64">
              <select class="metric-select">
                <option value="cm" selected>cm</option>
                <option value="inch">inch</option>
              </select>
            </div>
          </div>
          <div class="btn-row">
            <button id="save-measurements" class="btn primary">Save</button>
            <button id="edit-measurements" class="btn">Edit</button>
          </div>
        </form>
      </div>
      <div id="otherPrefTab" style="display:none;">
        <div class="other-pref-group">
          <div class="other-pref-section">
            <div class="other-pref-label">Skin Tone</div>
            <button type="button" class="skin-btn" data-skin="#FFDFC4" aria-label="Light skin tone"><span class="swatch" style="background:#FFDFC4"></span></button>
            <button type="button" class="skin-btn" data-skin="#e0b899" aria-label="Medium skin tone"><span class="swatch" style="background:#e0b899"></span></button>
            <button type="button" class="skin-btn" data-skin="#c68642" aria-label="Tan skin tone"><span class="swatch" style="background:#c68642"></span></button>
            <button type="button" class="skin-btn" data-skin="#a97c50" aria-label="Dark skin tone"><span class="swatch" style="background:#a97c50"></span></button>
          </div>
          <div class="other-pref-section">
            <div class="other-pref-label">Face Shape</div>
            <button type="button" class="face-btn" data-morph="Oval Face Shape">Oval</button>
            <button type="button" class="face-btn" data-morph="Square Face Shape">Square</button>
            <button type="button" class="face-btn" data-morph="Diamond Face Shape">Diamond</button>
            <button type="button" class="face-btn" data-morph="Rectangular Face Shape">Rectangular</button>
            <button type="button" class="face-btn" data-morph="Heart Face Shape">Heart</button>
          </div>
          <div class="other-pref-section">
            <div class="other-pref-label">Body Shape</div>
            <button type="button" class="bodyshape-btn" data-morph="Triangle Body">Triangle</button>
            <button type="button" class="bodyshape-btn" data-morph="Straight Body">Straight</button>
            <button type="button" class="bodyshape-btn" data-morph="Curvy Body">Curvy</button>
            <button type="button" class="bodyshape-btn" data-morph="Body (to Fat)">To Fat</button>
            <button type="button" class="bodyshape-btn" data-morph="Thin">Thin</button>
            <button type="button" class="bodyshape-btn" data-morph="Sitting">Sitting</button>
          </div>
          <div class="other-pref-section">
            <div class="other-pref-label">Pose</div>
            <button type="button" class="pose-btn" data-morph="'T' Pose">T Pose</button>
            <button type="button" class="pose-btn" data-morph="'A' Pose">A Pose</button>
            <button type="button" class="pose-btn" data-morph="'Hi' Pose">Hi Pose</button>
            <button type="button" class="pose-btn" data-morph="'Peace' Pose">Peace Pose</button>
          </div>
        </div>
      </div>
    </div>

        <!-- ✅ Viewer -->
        <div class="mannequin-viewer-container" id="mannequinViewer"></div>
      </div>
    </div>
  </main>
    <!-- Address manager modal (hidden) -->
    <div id="address-modal" class="modal-overlay" style="display:none;">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="addr-modal-title">
        <button id="modal_close_icon" class="modal-close" aria-label="Close"><i class="fa fa-times"></i></button>
        <h3 id="addr-modal-title">Manage Addresses</h3>

        <!-- Manager list view -->
        <div id="modal_list">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <strong>Your saved addresses</strong>
          </div>
          <div id="modal_addresses_list" style="display:grid;gap:8px;max-height:420px;overflow:auto;"></div>
          <p class="modal-instruction" style="margin-top:10px;color:#666;font-size:13px;text-align:center">Click an address to select it as default, then click Save changes</p>
          <div style="margin-top:12px;display:flex;justify-content:center;gap:8px;">
            <button id="modal_save_changes" class="btn primary">Save changes</button>
            <button id="modal_cancel_changes" class="btn">Cancel</button>
          </div>
          <div style="margin-top:12px;display:flex;justify-content:center;">
            <button id="modal_add_new" class="btn">+ Add address</button>
          </div>
        </div>

        <!-- Edit/Add form (hidden by default) -->
  <form id="addr-modal-form" style="display:none;">
          <input type="hidden" id="modal_address_id">
          <div class="form-row"><label style="width:120px">Full name</label><input id="modal_full_name" required></div>
          <div class="form-row"><label style="width:120px">Phone</label><input id="modal_phone" required></div>
          <div class="form-row"><label style="width:120px">Street</label><input id="modal_street" required></div>
          <div class="form-row"><label style="width:120px">City</label><input id="modal_city" required></div>
          <div class="form-row"><label style="width:120px">Province</label><input id="modal_province" required></div>
          <div class="form-row"><label style="width:120px">Postal code</label><input id="modal_postal_code"></div>
          <div class="form-row"><label style="width:120px">Country</label><input id="modal_country" value="Philippines"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
            <button type="button" id="modal_back" class="btn">Back to list</button>
            <button type="submit" id="modal-save" class="btn primary">Save</button>
          </div>
        </form>
      </div>
    </div>

    <?php include 'includes/footer.php'; ?>

  <script src="assets/js/account-tabs.js"></script>
  <script src="assets/js/account.js"></script>
  <script type="module" src="assets/js/mannequin-viewer.js"></script>
    <script async src="https://unpkg.com/es-module-shims@1.6.3/dist/es-module-shims.js"></script>
    <script type="importmap">
        {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.min.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/"
        }
        }
    </script>
</body>
</html>
