<?php
require_once 'includes/db_connect.php';
require_once 'includes/session.php';

$id = intval($_GET['id'] ?? 0);
if ($id <= 0) {
    die('Invalid product id');
}

$stmt = $conn->prepare(
    'SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON p.category_id = c.category_id WHERE product_id = ? LIMIT 1'
);
$stmt->bind_param('i', $id);
$stmt->execute();
$result = $stmt->get_result();
$product = $result->fetch_assoc();
$stmt->close();

if (!$product) {
    die('Product not found');
}

$sizes = ['S', 'M', 'L', 'XL'];
?>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/products.css">
    <link rel="stylesheet" href="assets/css/cart.css">
    <link rel="stylesheet" href="assets/css/components.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>FitCheck</title>
</head>
<body>
    <?php include 'includes/header.php'; ?>
    <main class="main-content">
        <div class="product-detail-container">
            <div class="product-gallery">
                <div class="product-thumbnails">
                    <?php
                        // Resolve image path using helper (it prefers admin uploads under uploads/product_img/)
                        require_once __DIR__ . '/includes/helpers.php';
                        $imgPath = resolve_image_path($product['image_url'] ?? '', $product['category_name'] ?? '');

                        // Read thumbnails from DB (thumbnail_images JSON) only.
                        // If DB doesn't have valid entries, fall back to using the product main image.
        
                        $thumbs = [];
                        if (!empty($product['thumbnail_images'])) {
                            $decoded = json_decode($product['thumbnail_images'], true);
                            if (is_array($decoded) && count($decoded) > 0) {
                                foreach ($decoded as $t) {
                                    $t = trim((string)$t);
                                    if ($t === '') continue;
                                    // remote URL
                                    if (preg_match('#^https?://#i', $t)) { $thumbs[] = $t; continue; }
                                    // if already an uploads path or category/filename, prefer uploads/thumbnail_img
                                    $resolvedThumb = null;
                                    // try helper
                                    if (function_exists('resolve_thumbnail_path')) {
                                        $resolvedThumb = resolve_thumbnail_path($t, $product['category_name'] ?? '');
                                    }
                                    if ($resolvedThumb && $resolvedThumb !== '') {
                                        $thumbs[] = $resolvedThumb;
                                        continue;
                                    }
                                }
                            }
                        }
                        // If no DB thumbnails found, use the main product image as a single thumbnail
                        if (empty($thumbs)) {
                            $thumbs[] = $imgPath;
                        }
                        // Ensure the main product image is always included in the thumbnails
                        // so the main image remains available/clickable when other thumbs are used.
                        $hasMain = false;
                        foreach ($thumbs as $t) {
                            if ($t === $imgPath || basename($t) === basename($imgPath)) {
                                $hasMain = true;
                                break;
                            }
                        }
                        if (!$hasMain) {
                            // put main image at the front so it's the active/default thumbnail
                            array_unshift($thumbs, $imgPath);
                        }

                        foreach ($thumbs as $index => $thumb):
                            $isActive = ($index === 0) ? 'active' : '';
                            // Prepare a safe src for the image: encode path segments if local and they contain spaces
                            $renderThumb = $thumb;
                            if (!preg_match('#^https?://#i', $thumb)) {
                                // encode each path segment to preserve slashes
                                $parts = explode('/', $thumb);
                                $parts = array_map('rawurlencode', $parts);
                                $renderThumb = implode('/', $parts);
                            }
                    ?>
                        <div class="thumbnail <?php echo $isActive; ?>" data-image="<?php echo htmlspecialchars($thumb); ?>">
                            <img src="<?php echo htmlspecialchars($renderThumb); ?>" alt="<?php echo htmlspecialchars($product['name']); ?>">
                        </div>
                    <?php endforeach; ?>
                </div>
                <div class="product-main-image">
                    <img src="<?php echo htmlspecialchars($imgPath); ?>" alt="<?php echo htmlspecialchars($product['name']); ?>" id="mainProductImage">
                    <!-- Mannequin clothing toggle buttons (positioned top-right of the canvas) -->
                    <div class="mannequin-clothing-toggle" id="mannequinClothingToggle" aria-hidden="true">
                        <button class="mannequin-toggle-btn active" data-key="cap" title="Caps" data-visible="1"><i class="fa fa-hat-cowboy icon" aria-hidden="true"></i></button>
                        <button class="mannequin-toggle-btn active" data-key="shirt" title="Shirts" data-visible="1"><i class="fa fa-tshirt icon" aria-hidden="true"></i></button>
                        <button class="mannequin-toggle-btn active" data-key="pants" title="Pants" data-visible="1"><i class="fa fa-socks icon" aria-hidden="true"></i></button>
                        <button class="mannequin-toggle-btn active" data-key="shoe" title="Shoes" data-visible="1"><i class="fa fa-shoe-prints icon" aria-hidden="true"></i></button>
                    </div>
                </div>
            </div>

            <div class="product-info-container">
                <div class="product-category"><?php echo htmlspecialchars($product['category_name']); ?></div>
                <h2 class="product-title"><?php echo htmlspecialchars($product['name']); ?></h2>
                <div class="product-price product-price-title">₱<?php echo number_format($product['price'], 2); ?></div>
                <input type="hidden" class="product-id" value="<?php echo $product['product_id']; ?>">

                <div class="product-options">
                    <div class="size-selection">
                        <div class="option-label">Size</div>
                        <div class="size-options" id="sizeOptions">
                            <?php
                                $cat = strtolower(trim($product['category_name'] ?? ''));
                                $isPerfume = (strpos($cat, 'perfume') !== false);
                                $isCaps = (strpos($cat, 'cap') !== false);
                                $isShirt = (strpos($cat, 'shirt') !== false);
                                if ($isPerfume):
                                    $singleSize = '100ml';
                            ?>
                                    <div class="size-option selected" data-size="<?php echo htmlspecialchars($singleSize); ?>"><?php echo htmlspecialchars(strtoupper($singleSize)); ?></div>
                                    <input type="hidden" id="size-select" value="<?php echo htmlspecialchars($singleSize); ?>">
                            <?php elseif ($isCaps):
                                    $singleSize = 'one size'; ?>
                                    <div class="size-option selected" data-size="<?php echo htmlspecialchars($singleSize); ?>"><?php echo htmlspecialchars(strtoupper($singleSize)); ?></div>
                                    <input type="hidden" id="size-select" value="<?php echo htmlspecialchars($singleSize); ?>">
                            <?php elseif ($isShirt):
                                    $shirtSizes = ['XS', 'S', 'M', 'L', 'XL'];
                                    foreach ($shirtSizes as $i => $ss): ?>
                                        <div class="size-option <?php echo $i === 0 ? 'selected' : ''; ?>" data-size="<?php echo $ss; ?>"><?php echo $ss; ?></div>
                                    <?php endforeach; ?>
                                    <input type="hidden" id="size-select" value="<?php echo $shirtSizes[0]; ?>">
                            <?php else: ?>
                                    <select id="size-select">
                                        <?php foreach ($sizes as $s): ?>
                                            <option value="<?php echo $s; ?>"><?php echo $s; ?></option>
                                        <?php endforeach; ?>
                                    </select>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- Recommended size placeholder (populated from saved measurements) -->
                    <div style="margin-top:12px; margin-bottom:8px; font-size:14px;">Recommended size: <strong><span id="sizeRecommendation">—</span></strong></div>

                    <div class="product-quantity" style="display:flex;align-items:center;gap:12px;">
                            <div class="cart-item-quantity">
                            <button class="quantity-btn qty-decrease" type="button">-</button>
                            <input type="number" id="qty" value="1" min="1" max="<?php echo intval($product['stock']); ?>" class="quantity-input" />
                            <button class="quantity-btn qty-increase" type="button">+</button>
                        </div>
                        <div class="product-stock-inline">In stock: <strong><?php echo intval($product['stock']); ?></strong></div>
                    </div>
                    <div class="product-actions">
                        <?php if (intval($product['stock']) <= 0): ?>
                            <button class="big-btn btn primary wide" style="flex: 2;" id="add-to-cart" disabled>Out of stock</button>
                        <?php else: ?>
                            <button class="big-btn btn primary wide" style="flex: 2;" id="add-to-cart">Add to cart</button>
                        <?php endif; ?>
                        <button class="big-btn btn" style="flex: 1;" id="try-mannequin">Try on Wardrobe</button>
                    </div>
                </div>

                <div class="product-accordion">
                    <div class="accordion-item">
                        <div class="accordion-header">
                            <span>Description</span>
                            <i class="fa fa-plus"></i>
                        </div>
                        <div class="accordion-content" id="productDescription"><?php echo nl2br(htmlspecialchars($product['description'])); ?></div>
                    </div>
                    <div class="accordion-item">
                        <div class="accordion-header">
                            <span>Size Guide</span>
                            <i class="fa fa-plus"></i>
                        </div>
                        <div class="accordion-content" id="sizeGuideContent">
                            <p><strong>Example size guide (test content)</strong></p>
                            <p>Chest (cm): S 88-92 • M 96-100 • L 104-108 • XL 112-116</p>
                            <p>Use this section to provide measurements, fit notes, or a printable guide. This is placeholder content to demonstrate the accordion animation.</p>
                        </div>
                    </div>
                    <div class="accordion-item">
                        <div class="accordion-header">
                            <span>Reviews</span>
                            <i class="fa fa-plus"></i>
                        </div>
                        <div class="accordion-content">
                            <p>No reviews yet. Be the first to review this product!</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="related-products">
            <h2>You might also like</h2>
            <div class="related-products-grid" id="also-like"></div>
        </div>
    </main>
    
    <?php include 'includes/footer.php'; ?>

    <script>const PRODUCT = <?php echo json_encode($product); ?>;</script>
    <script src="assets/js/index.js"></script>
    <script src="assets/js/product.js"></script>
    <!-- SizeManager integration: load script and initialize on product page -->
    <script src="assets/js/size-manager.js"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function(){
        if (!window.SizeManager) return;
        // initialize size manager and then fetch saved measurements (server API) to recommend a size
        SizeManager.init({ url: 'assets/js/sizes.json' }).then(function(){
            // If user is logged in, fetch saved mannequin measurements from API
            try{
                if (typeof IS_LOGGED !== 'undefined' && IS_LOGGED) {
                    fetch('api/get_mannequin.php', { cache: 'no-store' })
                    .then(function(resp){ if (!resp.ok) return null; return resp.json(); })
                    .then(function(saved){
                        if (!saved) return;
                        // map saved keys (server) to size-manager expected keys (cm)
                        const user = {
                            shoulders: (saved.shoulder_width || saved.shoulders || 0),
                            chest:     (saved.chest_bust || saved.chest || 0),
                            waist:     (saved.waist || 0),
                            arms:      (saved.arm_length || saved.arms || 0),
                            torso:     (saved.torso_length || saved.torso || 0)
                        };
                        try{
                            const rec = SizeManager.recommendSize(user);
                            var out = document.getElementById('sizeRecommendation');
                            if (out) out.textContent = (rec && rec.size) ? rec.size : '—';
                            if (rec && rec.size) SizeManager.selectSize(rec.size);
                        }catch(e){ console.warn('SizeManager recommend error', e); }
                    }).catch(function(e){ console.warn('Failed to fetch saved mannequin', e); });
                } else {
                    // not logged in: leave recommendation blank or use other logic later
                }
            }catch(e){ console.warn('SizeManager init flow error', e); }
        }).catch(function(e){ console.warn('SizeManager failed to init', e); });
    });
    </script>
    <!-- Module shims & import map for three.js used by mannequin viewer -->
    <script async src="https://unpkg.com/es-module-shims@1.6.3/dist/es-module-shims.js"></script>
    <script type="importmap"> {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.min.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/"
        }
    } </script>
    <script>
    (function(){
        // Wire the floating clothing toggles to the mannequin API (graceful if viewer not yet loaded)
        const container = document.getElementById('mannequinClothingToggle');
        if (!container) return;

        const mapping = {
            cap: ['cap', 'hat', 'beanie'],
            shirt: ['shirt', 'jacket', 'coat', 'top', 'tshirt'],
            pants: ['pant', 'jean', 'trouser', 'leggings', 'shorts'],
            shoe: ['shoe', 'sneaker', 'foot', 'sole', 'boot']
        };

        function applyVisibility(key, visible){
            // call the viewer API if available, otherwise queue until ready
            const kws = mapping[key] || [key];
            function doApply(){
                try{
                    // Special-case certain keys to map to exact mesh names
                    if (window.mannequinAPI && typeof window.mannequinAPI.showClothing === 'function'){
                            if (key === 'shoe'){
                                // shoes have two meshes: "Shoes1" and "Shoe2"
                                try{ window.mannequinAPI.showClothing('Shoes1', visible); }catch(e){}
                                try{ window.mannequinAPI.showClothing('Shoe2', visible); }catch(e){}
                            }
                            if (key === 'pants'){
                                try{ window.mannequinAPI.showClothing('Pants', visible); }catch(e){}
                            }
                            if (key === 'cap'){
                                try{ window.mannequinAPI.showClothing('Caps', visible); }catch(e){}
                            }
                    }

                    if (window.mannequinAPI && typeof window.mannequinAPI.showClothingByKeyword === 'function'){
                        kws.forEach(k => window.mannequinAPI.showClothingByKeyword(k, visible));
                    } else if (window.mannequinAPI && typeof window.mannequinAPI.listClothing === 'function'){
                        // Fallback: try toggling by exact mesh names that include the keyword
                        const list = (window.mannequinAPI.listClothing && window.mannequinAPI.listClothing()) || [];
                        list.forEach(name => {
                            const nm = (name||'').toLowerCase();
                            kws.forEach(k => { if (nm.indexOf(k) !== -1){ try{ window.mannequinAPI.showClothing(name, visible); }catch(e){} } });
                        });
                    }
                }catch(e){ console.warn('applyVisibility error', e); }
            }

            if (window.mannequin && window.mannequinAPI) doApply();
            else {
                window.addEventListener('mannequin.ready', function once(){ doApply(); window.removeEventListener('mannequin.ready', once); });
            }
        }

        container.querySelectorAll('.mannequin-toggle-btn').forEach(btn => {
            btn.addEventListener('click', ()=>{
                const key = btn.getAttribute('data-key');
                const vis = btn.getAttribute('data-visible') === '1';
                const newVis = !vis;
                btn.setAttribute('data-visible', newVis ? '1' : '0');
                btn.classList.toggle('active', newVis);
                // reflect active state for accessibility
                try{ btn.setAttribute('aria-pressed', newVis ? 'true' : 'false'); }catch(e){}
                applyVisibility(key, newVis);
            });
        });
    })();
    </script>
</body>
</html>
