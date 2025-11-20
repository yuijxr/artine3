<?php
require_once __DIR__ . '/session.php';

// Ensure DB connection for cart count
if (!isset($conn)) {
	require_once __DIR__ . '/db_connect.php';
}

$initialCartCount = 0;
if (is_logged_in()) {
	$uid = intval($_SESSION['user_id'] ?? 0);
	if ($uid > 0) {
		$stmt = $conn->prepare('SELECT SUM(quantity) AS cnt FROM cart WHERE user_id = ?');
		if ($stmt) {
			$stmt->bind_param('i', $uid);
			$stmt->execute();
			$r = $stmt->get_result()->fetch_assoc();
			$initialCartCount = intval($r['cnt'] ?? 0);
			$stmt->close();
		}
	}
}
?>

<header class="header-fixed">
	<div class="header-container">
		<!-- LEFT SIDE (logo only) -->
		<div class="header-left">
			<a href="/artine3/index.php" class="logo">
				<img src="assets/img/logo.png" alt="artine3 Logo">
			</a>
		</div>

		<!-- RIGHT SIDE -->
		<div class="header-right">
			<form class="header-search" action="#" method="get" autocomplete="off" onsubmit="return false;">
                <input type="text" placeholder="Search" name="q" />
                <i class="fa fa-search"></i>
            </form>
			<?php if (is_logged_in()):
				$user = current_user($GLOBALS['conn'] ?? null);
				$name = trim($user['first_name'] ?? '') ?: 'User';
				// mark user link active when on the account page
				$curScript = basename($_SERVER['PHP_SELF'] ?? '');
			?>
				<a href="account.php#account" class="user-link <?= ($curScript === 'account.php' ? 'active' : '') ?>" title="View account">
					<i class="fa fa-user"></i>
					<span class="welcome-user">Hi, <?= htmlspecialchars($name) ?></span>
				</a>
			<?php else: ?>
				<a href="login.php" class="auth-link">Login</a>
				<a href="register.php" class="auth-link">Sign Up</a>
			<?php endif; ?>
			<a href="cart.php" class="cart-link cart-icon" aria-label="Shopping Cart">
				<i class="fa fa-shopping-cart"></i>
				<span id="cart-count" class="cart-badge" style="display: <?= $initialCartCount > 0 ? 'flex' : 'none' ?>"><?= $initialCartCount ?></span>
			</a>
		</div>
	</div>
</header>

	<script src="assets/js/lib/utils.js"></script>

	<script>
		// initial values available synchronously to JS to avoid flash of 0
		window.INIT_CART_COUNT = <?= intval($initialCartCount) ?>;
		window.IS_LOGGED = <?= is_logged_in() ? 'true' : 'false' ?>;
		window.IS_VERIFIED = <?= (is_logged_in() && (!empty($user['email_verified']))) ? 'true' : 'false' ?>;
	</script>

	<script>
	// Redirect header search focus/input to catalog so users can continue searching on index.php
	(function(){
		try{
			var searchEl = document.querySelector('.header-search input[name="q"]');
			if (!searchEl) return;
			var logoLink = document.querySelector('.header-left .logo');
			var targetHref = logoLink ? logoLink.getAttribute('href') : '/index.php';

			function redirectToIndexWithQuery(val){
				try{
					var current = (window.location.pathname || '').split('/').pop() || '';
					var targetPage = (targetHref || '').split('/').pop() || 'index.php';
					if (current === targetPage) return; // already on index
					var q = encodeURIComponent(val || '');
					var url = targetHref + (q ? ('?q=' + q) : '');
					window.location.href = url;
				}catch(e){}
			}

			// on focus, redirect immediately
			searchEl.addEventListener('focus', function(){ redirectToIndexWithQuery(searchEl.value || ''); });

			// on input, debounce then redirect so typing on other pages continues on index
			var _deb = null;
			searchEl.addEventListener('input', function(){
				try{
					if (_deb) clearTimeout(_deb);
					_deb = setTimeout(function(){ redirectToIndexWithQuery(searchEl.value || ''); }, 300);
				}catch(e){}
			});
		}catch(e){}
	})();
	</script>
