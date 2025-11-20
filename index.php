<?php
require_once 'includes/db_connect.php';
require_once 'includes/session.php';

// No server-side header-driven category filtering; the frontend controls handle filtering
$where = '';
$sql = "
    SELECT p.product_id, p.name AS product_name, p.description, p.price, p.image_url,
           c.name AS category_name
    FROM products p
    JOIN categories c ON p.category_id = c.category_id
    $where
    ORDER BY p.created_at DESC
";

$result = $conn->query($sql);

// Fetch counts per category and total for the filter dropdowns
$counts = [];
$totalCount = 0;
try {
    $qc = $conn->query("SELECT c.name AS category_name, COUNT(*) AS cnt FROM products p JOIN categories c ON p.category_id = c.category_id GROUP BY c.name");
    if ($qc) {
        while ($rr = $qc->fetch_assoc()) {
            $counts[$rr['category_name']] = intval($rr['cnt']);
            $totalCount += intval($rr['cnt']);
        }
    }
} catch (Throwable $_) {}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/products.css">
    <link rel="stylesheet" href="assets/css/components.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>FitCheck</title>
</head>
<body>
    <?php include 'includes/header.php'; ?>

    <main class="main-content">
        <h1 class="welcome">Welcome to ARTine Clothing</h1>

        <div class="products-controls">
            <div class="select-with-icon">
                <select id="categoryFilter" class="select-control native-hidden" aria-hidden="true">
                    <option value="all">All</option>
                    <option value="shirts">Shirts</option>
                    <option value="caps">Caps</option>
                    <option value="perfumes">Perfumes</option>
                </select>

                <div class="select-custom" data-target="categoryFilter" role="listbox" aria-haspopup="listbox" tabindex="0">
                    <div class="select-display">
                        <div class="left">
                            <i class="fa fa-list filter-icon" aria-hidden="true"></i>
                            <span class="select-label">All</span>
                        </div>
                        <div class="spacer"></div>
                        <div class="right">
                            <span id="categoryCount" class="select-count"><?php echo intval($totalCount); ?></span>
                            <i class="fa fa-chevron-down select-caret" aria-hidden="true"></i>
                        </div>
                    </div>
                    <div class="select-list" role="presentation">
                        <div class="select-option" data-value="all"><span class="opt-label">All</span> <span class="opt-count"><?php echo intval($totalCount); ?></span></div>
                        <div class="select-option" data-value="shirts"><span class="opt-label">Shirts</span> <span class="opt-count"><?php echo intval($counts['shirts'] ?? ($counts['Shirts'] ?? 0)); ?></span></div>
                        <div class="select-option" data-value="caps"><span class="opt-label">Caps</span> <span class="opt-count"><?php echo intval($counts['caps'] ?? ($counts['Caps'] ?? 0)); ?></span></div>
                        <div class="select-option" data-value="perfumes"><span class="opt-label">Perfumes</span> <span class="opt-count"><?php echo intval($counts['perfumes'] ?? ($counts['Perfumes'] ?? 0)); ?></span></div>
                    </div>
                </div>
            </div>

            <div class="select-with-icon">
                <select id="sortSelect" class="select-control native-hidden" aria-hidden="true">
                    <option value="default">Default</option>
                    <option value="az">A - Z</option>
                    <option value="za">Z - A</option>
                    <option value="price_asc">Lowest Price</option>
                    <option value="price_desc">Highest Price</option>
                    <option value="newest">Newest</option>
                    <option value="best">Best Sellers</option>
                </select>

                <div class="select-custom" data-target="sortSelect" role="listbox" aria-haspopup="listbox" tabindex="0">
                    <div class="select-display">
                        <div class="left">
                            <i class="fa fa-sort select-icon" aria-hidden="true"></i>
                            <span class="select-label">Default</span>
                        </div>
                        <div class="spacer"></div>
                        <i class="fa fa-chevron-down select-caret" aria-hidden="true"></i>
                    </div>
                    <div class="select-list" role="presentation">
                        <div class="select-option" data-value="default"><span class="opt-label">Default</span></div>
                        <div class="select-option" data-value="az"><span class="opt-label">A - Z</span></div>
                        <div class="select-option" data-value="za"><span class="opt-label">Z - A</span></div>
                        <div class="select-option" data-value="price_asc"><span class="opt-label">Lowest Price</span></div>
                        <div class="select-option" data-value="price_desc"><span class="opt-label">Highest Price</span></div>
                        <div class="select-option" data-value="newest"><span class="opt-label">Newest</span></div>
                        <div class="select-option" data-value="best"><span class="opt-label">Best Sellers</span></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="products-grid">
            <?php if ($result->num_rows > 0): ?>
                <?php 
                $count = 0;
                    require_once __DIR__ . '/includes/helpers.php';
                    while ($row = $result->fetch_assoc()): 
                    $count++
                ?>
                    <a href="product.php?id=<?php echo $row['product_id']; ?>" class="product-card" data-product-id="<?php echo $row['product_id']; ?>" data-category="<?php echo htmlspecialchars(strtolower($row['category_name'])); ?>">
                        <div class="product-image">
                                <?php
                                    // Resolve image path via helper to prefer uploads/product_img/... and map legacy paths
                                    $imgPath = resolve_image_path($row['image_url'] ?? '', $row['category_name'] ?? '');
                                    // If local path contains spaces, encode each segment
                                    $renderSrc = $imgPath;
                                    if (!preg_match('#^https?://#i', $imgPath)) {
                                        $parts = explode('/', $imgPath);
                                        $parts = array_map('rawurlencode', $parts);
                                        $renderSrc = implode('/', $parts);
                                    }
                                ?>
                                <img src="<?php echo htmlspecialchars($renderSrc); ?>" alt="<?php echo htmlspecialchars($row['product_name']); ?>">
                        </div>
                        <div class="product-info">
                            <h3 class="product-name"><?php echo htmlspecialchars($row['product_name']); ?></h3>
                            <p class="product-price">₱<?php echo number_format($row['price'], 2); ?></p>
                        </div>
                    </a>
                        <input type="hidden" class="product-meta" data-name="<?php echo htmlspecialchars($row['product_name']); ?>" data-price="<?php echo htmlspecialchars($row['price']); ?>" data-created="<?php echo intval(strtotime($row['created_at'] ?? 'now')); ?>" data-category="<?php echo htmlspecialchars(strtolower($row['category_name'])); ?>">
                <?php endwhile; ?>
            <?php else: ?>
                <p class="no-products">No products available yet.</p>
            <?php endif; ?>
        </div>
    </main>

    <?php include 'includes/footer.php'; ?>

    <script>
        // If user just logged in and has a localStorage cart, merge it into DB
        (function(){
            if (window.IS_LOGGED) {
                try{
                    const cart = JSON.parse(localStorage.getItem('cart')||'[]');
                    if (Array.isArray(cart) && cart.length>0) {
                        fetch('api/merge_cart.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cart)})
                            .then(r=>r.json()).then(j=>{ if(j.success){ localStorage.removeItem('cart'); window.dispatchEvent(new Event('cartUpdated')); } });
                    }
                }catch(e){}
            }
        })();
    </script>
    <script>
        // Client-side product filter + sort
        (function(){
            const grid = document.querySelector('.products-grid');
            if (!grid) return;
            const cards = Array.from(grid.querySelectorAll('.product-card'));

            function readMeta(card){
                const meta = card.nextElementSibling && card.nextElementSibling.classList && card.nextElementSibling.classList.contains('product-meta') ? card.nextElementSibling : null;
                const name = meta ? meta.getAttribute('data-name') : (card.querySelector('.product-name') ? card.querySelector('.product-name').textContent : '');
                const price = meta ? parseFloat(meta.getAttribute('data-price') || '0') : parseFloat((card.querySelector('.product-price')||{}).textContent.replace(/[₱,\s]/g,'')) || 0;
                const created = meta ? parseInt(meta.getAttribute('data-created') || Date.now()/1000) : parseInt(card.getAttribute('data-created') || Date.now()/1000);
                const category = meta ? (meta.getAttribute('data-category') || '').toLowerCase() : (card.getAttribute('data-category') || '').toLowerCase();
                return { card, name: (name||'').trim(), price, created, category };
            }

            const items = cards.map(readMeta);

            // Counts provided by server (normalized to lowercase keys)
            const categoryCountsRaw = <?php echo json_encode($counts); ?>;
            const totalCount = <?php echo intval($totalCount); ?>;
            const categoryCounts = {};
            Object.keys(categoryCountsRaw || {}).forEach(k => { categoryCounts[k.toLowerCase()] = categoryCountsRaw[k]; });

            // Native selects (hidden) and custom controls
            const catSel = document.getElementById('categoryFilter');
            const sortSel = document.getElementById('sortSelect');
            const categoryCountEl = document.getElementById('categoryCount');

            // helper: wire a custom select UI backed by native select
            function initCustomSelect(customEl){
                const targetId = customEl.getAttribute('data-target');
                const native = document.getElementById(targetId);
                if (!native) return;
                const display = customEl.querySelector('.select-display .select-label');
                const list = customEl.querySelector('.select-list');
                const options = Array.from(customEl.querySelectorAll('.select-option'));

                // set initial label from native value or URL param
                const initVal = native.value || (new URLSearchParams(window.location.search).get('category') || native.value);
                const initialOpt = options.find(o => o.getAttribute('data-value') === initVal) || options[0];
                if (initialOpt && display) {
                    const lbl = initialOpt.querySelector('.opt-label');
                    display.textContent = lbl ? lbl.textContent.trim() : initialOpt.textContent.trim();
                }

                // open/close behavior
                const closeAll = ()=> document.querySelectorAll('.select-custom.open').forEach(x=>x.classList.remove('open'));
                customEl.addEventListener('click', (ev)=>{
                    ev.stopPropagation();
                    const isOpen = customEl.classList.toggle('open');
                    // update caret via class
                });

                // option click
                options.forEach(opt => opt.addEventListener('click', (ev)=>{
                    ev.stopPropagation();
                    const val = opt.getAttribute('data-value');
                    const lblEl = opt.querySelector('.opt-label');
                    const label = lblEl ? lblEl.textContent.trim() : opt.textContent.trim();
                    // update native select
                    try { native.value = val; } catch(e) {}
                    if (display) display.textContent = label;
                    // close
                    customEl.classList.remove('open');
                    // trigger filters
                    applyFilters();
                    if (categoryCountEl && targetId === 'categoryFilter'){
                        const v = (val || 'all').toLowerCase();
                        const c = v === 'all' ? totalCount : (categoryCounts[v] || 0);
                        categoryCountEl.textContent = c;
                    }
                }));

                // close when clicking outside
                document.addEventListener('click', function(){ customEl.classList.remove('open'); });
            }

            // initialize custom selects
            document.querySelectorAll('.select-custom').forEach(initCustomSelect);

            function applyFilters(){
                const cat = catSel ? catSel.value : 'all';
                const sort = sortSel ? sortSel.value : 'default';

                let visible = items.filter(i => {
                    if (cat === 'all') return true;
                    return String(i.category || '').toLowerCase().indexOf(cat) !== -1;
                });

                // sorting
                switch(sort){
                    case 'az': visible.sort((a,b)=> a.name.localeCompare(b.name)); break;
                    case 'za': visible.sort((a,b)=> b.name.localeCompare(a.name)); break;
                    case 'price_asc': visible.sort((a,b)=> a.price - b.price); break;
                    case 'price_desc': visible.sort((a,b)=> b.price - a.price); break;
                    case 'newest': visible.sort((a,b)=> b.created - a.created); break;
                    case 'best': visible.sort((a,b)=> b.created - a.created); break; // proxy for now
                    default: break;
                }

                // clear grid and append visible in order
                grid.innerHTML = '';
                visible.forEach(it => grid.appendChild(it.card));
            }

            if (catSel) {
                catSel.addEventListener('change', function(){
                    applyFilters();
                    const v = (catSel.value || 'all').toLowerCase();
                    const c = v === 'all' ? totalCount : (categoryCounts[v] || 0);
                    if (categoryCountEl) categoryCountEl.textContent = c;
                });
                // initialize the visible select value to include current query param if present
                try{
                    const sp = new URLSearchParams(window.location.search || '');
                    const qp = sp.get('category');
                    if (qp && Array.from(catSel.options).some(o => o.value === qp)) catSel.value = qp;
                }catch(e){}
            }
            if (sortSel) sortSel.addEventListener('change', applyFilters);
        })();
    </script>
    <script src="assets/js/index.js"></script>
</body>
</html>

<?php $conn->close(); ?>
