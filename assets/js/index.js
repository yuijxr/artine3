// index.js - shared bootstrapping and cart count initialization (no mini-cart)
function formatCurrency(v){ return Number(v||0).toFixed(2); }

function updateCartCount(count, skipAnimation = false){
    const el = document.getElementById('cart-count');
    if (el) {
        const isInitialUpdate = el.textContent === count.toString();
        
        // Update text and show/hide based on count
        el.textContent = count;
        el.style.display = count > 0 ? 'flex' : 'none';
        
        // Only animate if not initial and animation not skipped
        if (!isInitialUpdate && !skipAnimation) {
            el.classList.remove('pop');
            void el.offsetWidth; // Force reflow
            el.classList.add('pop');
            setTimeout(() => el.classList.remove('pop'), 300);
        }
    }
}

// If server provided an initial count, set it immediately to avoid a 0 flash
try{
    if (typeof window !== 'undefined' && typeof window.INIT_CART_COUNT !== 'undefined'){
        updateCartCount(window.INIT_CART_COUNT, true); // Skip animation for initial count
    }
}catch(e){}

function getGuestCart(){ try{return JSON.parse(localStorage.getItem('cart')||'[]')}catch(e){return []} }
function setGuestCart(arr){ localStorage.setItem('cart', JSON.stringify(arr)); updateCartCount(arr.reduce((s,i)=>s+Number(i.quantity||0),0)); }

function refreshCartState(){
    if (window.IS_LOGGED) {
        console.debug('index.js: logged-in, fetching server cart count');
        fetch('api/get_cart_count.php').then(r=>r.json()).then(j=>{ console.debug('index.js: server count response', j); updateCartCount(j.count||0); }).catch((err)=>{ console.debug('index.js: failed to fetch server count', err); const arr = getGuestCart(); updateCartCount(arr.reduce((s,i)=>s+Number(i.quantity||0),0)); });
    } else {
        console.debug('index.js: guest, using localStorage count');
        const arr = getGuestCart(); updateCartCount(arr.reduce((s,i)=>s+Number(i.quantity||0),0));
    }
}

// Show styled notifications
function showNotification(message, type = 'info') {
    try {
        // Create the stack container if it does not exist
        let stack = document.getElementById('notification-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'notification-stack';
            stack.style.cssText = `
                position: fixed;
                top: 100px;
                right: 40px;
                display: flex;
                flex-direction: column;
                align-items: flex-end; 
                gap: 10px;
                z-index: 10000;
                pointer-events: none;
            `;
            document.body.appendChild(stack);
        }

        // Create notification toast
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            pointer-events: auto;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            color: white;
            background: ${type === 'error' ? '#e11d48' : type === 'success' ? '#10b981' : '#0095FF'};
            transform: translateX(100%);
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            width: auto;  // Explicitly set to auto for clarity (though not strictly needed)
        `;

        notification.textContent = message;
        stack.appendChild(notification);
        notification.offsetHeight; 
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';

        const timeout = setTimeout(() => dismiss(), 5000);

        notification.addEventListener('click', () => {
            clearTimeout(timeout);
            dismiss();
        });

        function dismiss() {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                try { notification.remove(); } catch (e) {}
            }, 300);
        }

    } catch (e) {
        alert(message);
    }
}


// Show forgot-password flow: navigate to password reset request page (or open in new tab)
function showForgotPassword() {
    try {
        // If user is on a SPA/modal-capable page we could open a modal; for now navigate to the request page
        window.location.href = '/artine3/auth/password.php?action=request';
    } catch (e) {
        console.error('Failed to open password reset page', e);
    }
    return false;
}

document.addEventListener('DOMContentLoaded', ()=>{
    // wire product tiles click (keeps behavior)
    document.querySelectorAll('.product[data-product-id]').forEach(el=>{
        el.addEventListener('click', ()=>{
            const id = el.getAttribute('data-product-id');
            window.location.href = 'product.php?id=' + encodeURIComponent(id);
        });
    });

    // initialize cart count and sync listeners
    refreshCartState();
    window.addEventListener('storage', (e)=>{ if (e.key === 'cart') refreshCartState(); });
    window.addEventListener('cartUpdated', ()=> refreshCartState());

    // Live search: filter product cards on the current page by name or category
    try {
        const searchInput = document.querySelector('.header-search input[name="q"]');
        const productsGrid = document.querySelector('.products-grid');
        if (searchInput && productsGrid) {
            let debounceTimer = null;
            const doFilter = () => {
                const q = (searchInput.value || '').trim().toLowerCase();
                const cards = productsGrid.querySelectorAll('.product-card');
                if (!q) {
                    cards.forEach(c => c.style.display = '');
                    return;
                }
                cards.forEach(c => {
                    const nameEl = c.querySelector('.product-name');
                    const name = nameEl ? (nameEl.textContent || '').toLowerCase() : '';
                    const cat = (c.dataset.category || '').toLowerCase();
                    const matches = name.indexOf(q) !== -1 || cat.indexOf(q) !== -1;
                    c.style.display = matches ? '' : 'none';
                });
            };

            searchInput.addEventListener('input', ()=>{
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(doFilter, 180);
            });
        }
    } catch(e) { console.error('live search init failed', e); }
    // legacy header hash/category filtering removed
    // Show notifications based on URL flags (login/logout) then remove them from URL
    try{
        const params = new URLSearchParams(window.location.search);
        let changed = false;
        if (params.get('logged_in')){
            if (typeof showNotification === 'function') showNotification('Logged in successfully', 'success');
            params.delete('logged_in'); changed = true;
        }
        if (params.get('logged_out')){
            if (typeof showNotification === 'function') showNotification('Logged out', 'info');
            params.delete('logged_out'); changed = true;
        }
        if (params.get('logged_out_all')){
            if (typeof showNotification === 'function') showNotification('Logged out from all devices', 'info');
            params.delete('logged_out_all'); changed = true;
        }
        // Payment related notifications (redirects from payment handlers)
        if (params.get('order_placed')){
            if (typeof showNotification === 'function') showNotification('Order placed', 'success');
            params.delete('order_placed'); changed = true;
        }
        if (params.get('payment_success')){
            if (typeof showNotification === 'function') showNotification('Payment successful', 'success');
            params.delete('payment_success'); changed = true;
        }
        if (params.get('payment_failed')){
            if (typeof showNotification === 'function') showNotification('Payment cancelled', 'error');
            params.delete('payment_failed'); changed = true;
        }
        // If we removed flags, replace the URL without reloading the page
        if (changed){
            const newSearch = params.toString();
            // Preserve the current hash (e.g. #orders) when replacing URL so fragments from redirects remain.
            const newUrl = window.location.pathname + (newSearch ? ('?' + newSearch) : '') + (window.location.hash || '');
            history.replaceState({}, document.title, newUrl);
        }
    }catch(e){console.warn('notify-by-url failed', e)}
});

// If the page was opened with a `?q=` param, prefill and focus the header search input
(function(){
    try{
        const params = new URLSearchParams(window.location.search || '');
        const q = params.get('q');
        if (!q) return;
        const searchInput = document.querySelector('.header-search input[name="q"]');
        if (!searchInput) return;
        searchInput.value = q;
        try { searchInput.focus({ preventScroll: true }); } catch(e){ searchInput.focus(); }
        // trigger any input listeners (live search)
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }catch(e){/* ignore */}
})();
