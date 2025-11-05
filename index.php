<?php
require_once 'includes/db_connect.php';
require_once 'includes/session.php';

// Fetch products, optionally filtered by category query param
$where = '';
if (!empty($_GET['category'])){
    $cat = strtolower(trim($_GET['category']));
    // map allowed categories to a simple LIKE match
    if (in_array($cat, ['shirts','caps','perfumes'])){
        if ($cat === 'shirts') $where = "WHERE LOWER(c.name) LIKE '%shirt%'";
        elseif ($cat === 'caps') $where = "WHERE LOWER(c.name) LIKE '%cap%'";
        elseif ($cat === 'perfumes') $where = "WHERE LOWER(c.name) LIKE '%perfume%'";
    }
}

$sql = "
    SELECT p.product_id, p.name AS product_name, p.description, p.price, p.image_url,
           c.name AS category_name
    FROM products p
    JOIN categories c ON p.category_id = c.category_id
    $where
    ORDER BY p.created_at DESC
";

$result = $conn->query($sql);
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/products.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Dekko&family=Devonshire&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&display=swap" rel="stylesheet">
    <title>FitCheck</title>
</head>
<body>
    <?php include 'includes/header.php'; ?>

    <main class="main-content">
        <h1>Welcome to ARTine Clothing</h1>
        <div class="products-grid">
            <?php if ($result->num_rows > 0): ?>
                <?php 
                $count = 0;
                while ($row = $result->fetch_assoc()): 
                    $count++
                ?>
                    <a href="product.php?id=<?php echo $row['product_id']; ?>" class="product-card" data-product-id="<?php echo $row['product_id']; ?>" data-category="<?php echo htmlspecialchars(strtolower($row['category_name'])); ?>">
                        <div class="product-image">
                            <img src="assets/img/<?php 
                                $category = strtolower($row['category_name']);
                                if (strpos($category, 'shirt') !== false) {
                                    echo 'shirts/';
                                } elseif (strpos($category, 'cap') !== false) {
                                    echo 'caps/';
                                } elseif (strpos($category, 'perfume') !== false) {
                                    echo 'perfumes/';
                                }
                                echo htmlspecialchars($row['image_url'] ?: 'no-image.png'); 
                            ?>" alt="<?php echo htmlspecialchars($row['product_name']); ?>">
                        </div>
                        <div class="product-info">
                            <h3 class="product-name"><?php echo htmlspecialchars($row['product_name']); ?></h3>
                            <p class="product-price">₱<?php echo number_format($row['price'], 2); ?></p>
                        </div>
                    </a>
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
    <script src="assets/js/index.js"></script>
</body>
</html>

<?php $conn->close(); ?>
