// account-tabs.js
// Minimal tab switching for existing profile layout. Uses existing CSS/classes (no visual changes).
document.addEventListener('DOMContentLoaded', ()=>{
    const tabs = Array.from(document.querySelectorAll('.profile-tabs .tab'));
    if (!tabs.length) return;

    // Panels
    const accountPanel = document.querySelector('.account-panel');
    const ordersPanel = document.querySelector('.orders-panel');
    const mannequinPanel = document.querySelector('.mannequin-content');
    const settingsPanel = document.querySelector('.settings-panel');

    function clearActiveTabs(){
        tabs.forEach(t=>t.classList.remove('active'));
    }
    function hideAllPanels(){
        if (accountPanel) accountPanel.style.display='none';
                                                if (ordersPanel) ordersPanel.style.display='none';
                                                if (mannequinPanel) mannequinPanel.style.display='none';
                                                if (settingsPanel) settingsPanel.style.display='none';
    }

    // Map tab text to handler
    tabs.forEach(tab=>{
        tab.addEventListener('click', (e)=>{
            e.preventDefault();
            // don't re-run if this tab is already active
            if (tab.classList.contains('active')) return;
            const text = (tab.textContent||'').trim().toLowerCase();
            clearActiveTabs(); tab.classList.add('active');
            // update URL hash so direct links work and refreshing preserves selection
            try{
                location.hash = '#' + encodeURIComponent(text);
            }catch(_){ }
            hideAllPanels();
            if (text === 'account'){
                if (accountPanel) accountPanel.style.display = '';
            } else if (text === 'orders'){
                if (ordersPanel) ordersPanel.style.display = '';
                loadOrders();
            } else if (text === 'mannequin'){
                if (mannequinPanel) {
                    mannequinPanel.style.display = '';
                    // ensure the mannequin inner tab defaults to Body Measurements
                    try{
                        if (bodyBtn && otherBtn && bodyTab && otherTab){
                            bodyBtn.classList.add('active'); otherBtn.classList.remove('active');
                                                                                                                                                                        bodyTab.style.display = 'block'; otherTab.style.display = 'none';
                        }
                    }catch(e){
                        /* ignore */
                    }
                    // If the viewer exists, refresh its size (fixes invisible canvas when container was hidden earlier)
                    try{
                        if (window.mannequinAPI && typeof window.mannequinAPI.refresh === 'function') {
                            requestAnimationFrame(()=> window.mannequinAPI.refresh());
                        } else {
                            // wait for the mannequin to be ready and refresh once
                            window.addEventListener('mannequin.ready', () => {
                                if (window.mannequinAPI && typeof window.mannequinAPI.refresh === 'function') window.mannequinAPI.refresh();
                            }, { once: true });
                        }
                    }catch(e){
                    }
                }
            } else if (text === 'settings'){
                // show the Settings panel if present, otherwise fallback to Account
                                                                                                if (settingsPanel) settingsPanel.style.display = '';
                                                                                                else if (accountPanel) accountPanel.style.display = '';
            }
        });
    });

    // NOTE: initial tab selection will be performed AFTER inner mannequin controls
    // to avoid a race where inner buttons (bodyTabBtn/otherPrefBtn) are not yet
    // defined when the initial tab click runs. See end of file for init.

    // Orders loader (uses existing API)
    async function loadOrders(){
        const list = document.getElementById('orders-list');
        if (!list) return;
        // If the server already rendered orders (data-hydrated) show them instantly and wire delegated actions
        const serverRendered = list.dataset.hydrated === 'true' || !!list.querySelector('.order-item');
        if (serverRendered) {
            // delegated click handler for cancel/return buttons (works for server-rendered buttons)
            list.addEventListener('click', async (ev) => {
                const btn = ev.target.closest('.cancel-order-btn, .return-product-btn');
                if (!btn) return;
                const isCancel = btn.classList.contains('cancel-order-btn');
                const orderId = btn.dataset.id || btn.getAttribute('data-id');
                if (!orderId) return;
                if (!confirm(isCancel ? 'Cancel this order?' : 'Return this order?')) return;
                btn.disabled = true; btn.textContent = isCancel ? 'Cancelling...' : 'Processing...';
                try{
                    const endpoint = isCancel ? 'api/cancel_order.php' : 'api/return_order.php';
                    const r2 = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ order_id: orderId }) });
                    const j = await r2.json();
                    if (j.success) {
                        const orderEl = btn.closest('.order-item'); if (!orderEl) return;
                        const header = orderEl.querySelector('.order-header'); const statusSpan = orderEl.querySelector('.order-status');
                        const arrEl = header ? header.querySelector('.order-arrival') : null; if (arrEl) arrEl.remove();
                        if (isCancel) {
                            statusSpan.textContent = 'cancelled'; statusSpan.className = 'order-status cancelled'; orderEl.dataset.status = 'cancelled';
                        }
                        else {
                            statusSpan.textContent = 'Returned'; statusSpan.className = 'order-status returned'; orderEl.dataset.status = 'returned';
                        }
                        btn.remove();
                        // update filter counts displayed
                        const fe = document.getElementById('orders-filter');
                        if (fe) {
                            const btns = Array.from(fe.querySelectorAll('.orders-filter-btn'));
                            const counts = { all:0, pending:0, completed:0, cancelled:0, returned:0 };
                            // count only actual order elements
                            Array.from(list.querySelectorAll('.order-item')).forEach(ch => {
                                const s = (ch.dataset.status||'').toLowerCase(); counts.all += 1;
                                if (s === 'pending') counts.pending += 1;
                                if (s === 'delivered' || s === 'completed') counts.completed += 1;
                                if (s === 'cancelled') counts.cancelled += 1;
                                if (s === 'returned') counts.returned += 1;
                            });
                            btns.forEach(b => {
                                const val = b.dataset.value; let label = val === 'all' ? 'All' : (val.charAt(0).toUpperCase() + val.slice(1));
                                const count = (val === 'all') ? counts.all : (counts[val] || 0);
                                b.textContent = `${label} (${count})`;
                            });
                            // apply the current filter to the updated order element
                            const active = fe.querySelector('.orders-filter-btn.active-filter');
                            const val = active ? active.dataset.value : 'all';
                            const s = (orderEl.dataset.status||'').toLowerCase();
                            if (val === 'all') orderEl.style.display = '';
                            else if (val === 'completed') orderEl.style.display = (s === 'delivered' || s === 'completed' ? '' : 'none');
                            else orderEl.style.display = (s === val ? '' : 'none');
                        }
                        try{
                            if (typeof showNotification === 'function') showNotification(j.message || (isCancel ? 'Order cancelled' : 'Order returned'), 'success'); else alert(j.message || (isCancel ? 'Order cancelled' : 'Order returned'));
                        }catch(e){}
                    } else {
                        alert(j.message || 'Failed to update order'); btn.disabled = false; btn.textContent = isCancel ? 'Cancel Order' : 'Return Order';
                    }
                }catch(err){
                    console.error(err); alert('Failed to update order'); btn.disabled = false; btn.textContent = isCancel ? 'Cancel Order' : 'Return Order';
                }
            });

            // ensure filter button counts reflect server-rendered list (they should already, but recompute defensively)
            try{
                const fe = document.getElementById('orders-filter');
                if (fe) {
                    const btns = Array.from(fe.querySelectorAll('.orders-filter-btn'));
                    const counts = { all:0, pending:0, completed:0, cancelled:0, returned:0 };
                    Array.from(list.querySelectorAll('.order-item')).forEach(ch => {
                        const s = (ch.dataset.status||'').toLowerCase(); counts.all += 1;
                        if (s === 'pending') counts.pending += 1;
                        if (s === 'delivered' || s === 'completed') counts.completed += 1;
                        if (s === 'cancelled') counts.cancelled += 1;
                        if (s === 'returned') counts.returned += 1;
                    });
                    btns.forEach(b => {
                        const val = b.dataset.value; let label = val === 'all' ? 'All' : (val.charAt(0).toUpperCase() + val.slice(1));
                        const count = (val === 'all') ? counts.all : (counts[val] || 0);
                        b.textContent = `${label} (${count})`;
                    });
                    // attach click handlers so filters work for server-rendered buttons
                    btns.forEach(btn => btn.addEventListener('click', ()=>{
                        btns.forEach(b=> b.classList.remove('active-filter'));
                        btn.classList.add('active-filter');
                        const val = btn.dataset.value;
                        Array.from(list.children).forEach(ch=>{
                            const s = (ch.dataset.status||'').toLowerCase();
                            if (val === 'all') ch.style.display = '';
                            else if (val === 'completed') ch.style.display = (s === 'delivered' || s === 'completed' ? '' : 'none');
                            else ch.style.display = (s === val ? '' : 'none');
                        });
                    }));
                    // set default to pending if none active
                    const hasActive = btns.some(b=> b.classList.contains('active-filter'));
                    const defaultBtn = fe.querySelector('.orders-filter-btn[data-value="pending"]');
                    if (!hasActive && defaultBtn) defaultBtn.click();
                }
            }catch(e){
            }
            return;
        }
        // render immediately; we will append order cards as soon as we have list data
        // Use the site's global showNotification if available, otherwise fall back to alert
        function notify(msg, type = 'info'){
            try{
                if (typeof showNotification === 'function') showNotification(msg, type);
                                                                                                else alert(msg);
            }catch(e){ try{ alert(msg); }catch(_){} }
        }

    // helper: apply current filter (active tab) to a specific order element
        function applyCurrentFilterToOrder(orderEl){
            try{
                const fe = document.getElementById('orders-filter');
                                                                                                if (!fe) return;
                                                                                                const active = fe.querySelector('.orders-filter-btn.active-filter');
                                                                                                const val = active ? active.dataset.value : 'all';
                                                                                                const s = (orderEl.dataset.status||'').toLowerCase();
                                                                                                if (val === 'all') orderEl.style.display = '';
                                                                                                else if (val === 'completed') orderEl.style.display = (s === 'delivered' || s === 'completed' ? '' : 'none');
                                                                                                else orderEl.style.display = (s === val ? '' : 'none');
            }catch(e){}
        }

        // helper: select a filter tab programmatically and apply it
        function selectFilterValue(val){
            try{
                const fe = document.getElementById('orders-filter'); if (!fe) return;
                const btns = Array.from(fe.querySelectorAll('.orders-filter-btn'));
                btns.forEach(b=> b.classList.remove('active-filter'));
                const target = fe.querySelector('.orders-filter-btn[data-value="' + val + '"]');
                if (target) target.classList.add('active-filter');
                // apply filtering same as click handler
                btns.forEach(b=> b.dispatchEvent(new Event('filter:applied')));
                // run our filter logic directly
                const active = fe.querySelector('.orders-filter-btn.active-filter');
                const filterVal = active ? active.dataset.value : 'all';
                const listChildren = Array.from(document.getElementById('orders-list').children);
                listChildren.forEach(ch=>{
                    const s = (ch.dataset.status||'').toLowerCase();
                                                                                                                        if (filterVal === 'all') ch.style.display = '';
                                                                                                                        else if (filterVal === 'completed') ch.style.display = (s === 'delivered' || s === 'completed' ? '' : 'none');
                                                                                                                        else ch.style.display = (s === filterVal ? '' : 'none');
                });
            }catch(e){
            }
        }
        try{
            const res = await fetch('api/orders.php', { cache: 'no-store' });
            const data = await res.json();
            // API may return either an array (legacy) or an object { orders: [...], counts: {...} }
            let orders = [];
            let apiCounts = null;
            if (Array.isArray(data)) orders = data;
            else if (data && Array.isArray(data.orders)) {
                orders = data.orders; apiCounts = data.counts || null;
            }
            if (!Array.isArray(orders) || orders.length === 0){
                list.textContent = 'No orders yet.'; return;
            }
            // If API provided counts, update the filter buttons immediately to avoid any flash of wrong/global totals
            try{
                if (apiCounts) {
                    const fe = document.getElementById('orders-filter');
                    if (fe){
                        const btns = Array.from(fe.querySelectorAll('.orders-filter-btn'));
                        btns.forEach(btn => {
                            const val = btn.dataset.value;
                            let label = val === 'all' ? 'All' : (val.charAt(0).toUpperCase() + val.slice(1));
                            const count = (val === 'all') ? apiCounts.all : (apiCounts[val] || 0);
                            btn.textContent = `${label} (${count})`;
                        });
                    }
                }
            }catch(e){
            }
            list.innerHTML = '';

            // Immediately render order cards (no waiting). Show placeholder for items and fill them as responses arrive.
            const orderEls = [];
            orders.forEach((o) => {
                // create placeholder order element and append immediately
                const orderEl = document.createElement('div');
                orderEl.className = 'order-item';
                orderEl.dataset.status = (o.status || '').toLowerCase();

                // Header: compute arrival but show only for pending; for cancelled/returned show the updated date
                const header = document.createElement('div');
                header.className = 'order-header';
                let arrivalText = 'Arrives in 3-5 days';
                try{
                    if (o.created_at) {
                        const d = new Date(o.created_at.replace(' ', 'T'));
                        if (!isNaN(d.getTime())){
                            const start = new Date(d); start.setDate(start.getDate() + 3);
                            const end = new Date(d); end.setDate(end.getDate() + 5);
                            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            const sMon = months[start.getMonth()];
                            const eMon = months[end.getMonth()];
                            if (sMon === eMon) arrivalText = `Arrives on ${
                                sMon
                            } ${start.getDate()}-${end.getDate()}`;
                            else arrivalText = `Arrives on ${
                                sMon
                            } ${start.getDate()} - ${eMon} ${end.getDate()}`;
                        }
                    }
                }catch(e){
                }
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const statusLower = ((o.status||'').toLowerCase());
                let dateInfoHtml = '';
                if (statusLower === 'pending') {
                    dateInfoHtml = `<p class="order-arrival">${arrivalText}</p>`;
                } else if (statusLower === 'cancelled' || statusLower === 'returned') {
                    // show the date when the status was last updated (updated_at) if available, otherwise fall back to created_at
                    const raw = o.updated_at || o.created_at || null;
                    if (raw) {
                        try{
                            const d2 = new Date(raw.replace(' ', 'T'));
                            if (!isNaN(d2.getTime())) {
                                dateInfoHtml = `<p class="order-arrival">${statusLower.charAt(0).toUpperCase()+statusLower.slice(1)} on ${months[d2.getMonth()]} ${d2.getDate()}, ${d2.getFullYear()}</p>`;
                            }
                        }catch(e){
                        }
                    }
                }
                header.innerHTML = `<div class="order-left"></div><div class="order-right">${dateInfoHtml}</div>`;
                const statusSpan = document.createElement('span');
                statusSpan.className = 'order-status ' + (o.status ? o.status.toLowerCase() : 'pending');
                statusSpan.textContent = o.status || '';
                const left = header.querySelector('.order-left'); if (left) left.appendChild(statusSpan);
                orderEl.appendChild(header);

                // content placeholder
                const content = document.createElement('div');
                content.className = 'order-content';
                content.innerHTML = '<div class="loading">Loading items...</div>';
                orderEl.appendChild(content);

                // Footer (total and actions) - actions will be updated after items/status are loaded
                const footer = document.createElement('div');
                footer.className = 'order-footer';
                const totalDiv = document.createElement('div');
                totalDiv.className = 'order-total';
                totalDiv.innerHTML = `<p class="order-total-label">Total</p><p class="order-total-amount">₱${
                    Number(o.total_amount || 0).toFixed(2)
                }</p>`;
                const actionsDiv = document.createElement('div'); actionsDiv.className = 'order-footer-actions';
                footer.appendChild(totalDiv); footer.appendChild(actionsDiv);
                orderEl.appendChild(footer);

                orderEl.style.marginBottom = '18px';
                orderEls.push({ order: o, el: orderEl, header, content, footer, actionsDiv, statusSpan });
                list.appendChild(orderEl);
            });

            // Fetch each order's items asynchronously and populate the corresponding card when ready
            orders.forEach(async (o, idx) => {
                try{
                    const r = await fetch('api/orders.php?order_id=' + encodeURIComponent(o.order_id), { cache: 'no-store' });
                    const items = await r.json();
                    const entry = orderEls.find(e => Number(e.order.order_id) === Number(o.order_id));
                    if (!entry) return;
                    const {
                        el: orderEl, content, actionsDiv, statusSpan, header
                    } = entry;
                    // filter out deleted/removed items
                    const visibleItems = Array.isArray(items) ? items.filter(it => (it.product_name && String(it.product_name).trim().length>0)) : [];
                    if (visibleItems.length === 0) { orderEl.remove(); try{
                        updateOrdersSummary();
                    }catch(e){}; return; }
                    // build items
                    content.innerHTML = '';
                    visibleItems.forEach(it => {
                        const p = document.createElement('div'); p.className = 'order-product';
                        p.innerHTML = `<div class="order-product-image"><img src="${it.thumbnail_path || it.thumbnail || 'assets/img/thumbnails/noimg.png'}" alt=""></div>
                                    <div class="order-product-details">
                                      <p class="order-product-name">${it.product_name}</p>
                                      <p class="order-product-variant">Size: ${it.size || '—'}</p>
                                      <p class="product-quantity">Quantity: ${it.quantity}</p>
                                    </div>
                                    <div class="order-product-price">₱${Number(it.product_price).toFixed(2)}</div>`;
                        content.appendChild(p);
                    });

                    // update actions area depending on status
                    actionsDiv.innerHTML = '';
                    const statusLower = (o.status||'').toLowerCase();
                    const cancellable = ['pending','paid'].includes(statusLower);
                    const completable = (statusLower === 'delivered' || statusLower === 'completed' || statusLower === 'complete');
                    if (cancellable) {
                        const cancelBtn = document.createElement('button');
                        cancelBtn.className = 'cancel-order-btn action-btn danger';
                        cancelBtn.textContent = 'Cancel Order';
                        cancelBtn.dataset.id = String(o.order_id);
                        cancelBtn.addEventListener('click', async ()=>{
                            if (!confirm('Cancel this order?')) return;
                            cancelBtn.disabled = true; cancelBtn.textContent = 'Cancelling...';
                            try{
                                const r2 = await fetch('api/cancel_order.php', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ order_id: o.order_id }) });
                                const j = await r2.json();
                                if (j.success) {
                                    // update UI immediately: remove arrival, mark cancelled, re-filter, and show toast
                                    const arrEl = header.querySelector('.order-arrival'); if (arrEl) arrEl.remove();
                                    statusSpan.textContent = 'Cancelled'; statusSpan.className = 'order-status cancelled';
                                    orderEl.dataset.status = 'cancelled';
                                    cancelBtn.remove();
                                    try{
                                        updateOrdersSummary();
                                    }catch(e){}
                                    applyCurrentFilterToOrder(orderEl);
                                        // switch to the Cancelled tab so the user sees the cancelled orders
                                        selectFilterValue('cancelled');
                                        notify(j.message || 'Order cancelled', 'success');
                                } else {
                                    alert(j.message || 'Failed to cancel');
                                                                                                                                                                                                                        cancelBtn.disabled = false; cancelBtn.textContent = 'Cancel Order';
                                }
                            }catch(err){
                                console.error(err); alert('Failed to cancel'); cancelBtn.disabled = false; cancelBtn.textContent = 'Cancel Order';
                            }
                        });
                        actionsDiv.appendChild(cancelBtn);
                    } else if (completable) {
                        const returnBtn = document.createElement('button');
                        returnBtn.className = 'return-product-btn action-btn';
                        returnBtn.textContent = 'Return Order';
                        returnBtn.dataset.id = String(o.order_id);
                        returnBtn.addEventListener('click', async ()=>{
                            if (!confirm('Return this order?')) return;
                            returnBtn.disabled = true; returnBtn.textContent = 'Processing...';
                            try{
                                const r2 = await fetch('api/return_order.php', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ order_id: o.order_id }) });
                                if (!r2.ok) {
                                    const txt = await r2.text(); throw new Error(txt || 'Server error');
                                }
                                const j = await r2.json();
                                if (j.success) {
                                    const arrEl = header.querySelector('.order-arrival'); if (arrEl) arrEl.remove();
                                    statusSpan.textContent = 'Returned'; statusSpan.className = 'order-status returned';
                                    orderEl.dataset.status = 'returned';
                                    returnBtn.remove();
                                    try{
                                        updateOrdersSummary();
                                    }catch(e){}
                                    applyCurrentFilterToOrder(orderEl);
                                    selectFilterValue('returned');
                                    notify(j.message || 'Order returned', 'success');
                                } else {
                                    alert(j.message || 'Failed to return');
                                                                                                                                                                                                                        returnBtn.disabled = false; returnBtn.textContent = 'Return Order';
                                }
                            }catch(err){
                                console.error(err); alert('Failed to return order. Server may not support returns yet.'); returnBtn.disabled = false; returnBtn.textContent = 'Return Order';
                            }
                        });
                        actionsDiv.appendChild(returnBtn);
                    }

                    try{
                        updateOrdersSummary();
                    }catch(e){}
                }catch(e){
                    console.warn('Failed fetching items for order', o.order_id, e);
                }
            });

            // order cards were appended immediately during creation above

            // Hook up filter UI (button tabs). Default to Pending.
            const filterEl = document.getElementById('orders-filter');
            let filterButtons = [];
            function updateOrdersSummary(){
                const counts = { all: 0, pending: 0, completed: 0, cancelled: 0, returned: 0 };
                Array.from(list.children).forEach(ch => {
                    const s = (ch.dataset.status||'').toLowerCase();
                    counts.all += 1;
                    if (s === 'pending') counts.pending += 1;
                    if (s === 'delivered' || s === 'completed') counts.completed += 1;
                    if (s === 'cancelled') counts.cancelled += 1;
                    if (s === 'returned') counts.returned += 1;
                });

                if (!filterEl) return;
                filterButtons = Array.from(filterEl.querySelectorAll('.orders-filter-btn'));
                filterButtons.forEach(btn => {
                    const val = btn.dataset.value;
                    let label = val === 'all' ? 'All' : (val.charAt(0).toUpperCase() + val.slice(1));
                    const count = (val === 'all') ? counts.all : (counts[val] || 0);
                    btn.textContent = `${label} (${count})`;
                });
            }

                if (filterEl){
                filterButtons = Array.from(filterEl.querySelectorAll('.orders-filter-btn'));
                filterButtons.forEach(btn => btn.addEventListener('click', ()=>{
                    filterButtons.forEach(b=> b.classList.remove('active-filter'));
                    btn.classList.add('active-filter');
                    const val = btn.dataset.value;
                    Array.from(list.children).forEach(ch=>{
                        const s = (ch.dataset.status||'').toLowerCase();
                        if (val === 'all') ch.style.display = '';
                        else if (val === 'completed') ch.style.display = (s === 'delivered' || s === 'completed' ? '' : 'none');
                        else ch.style.display = (s === val ? '' : 'none');
                    });
                }));

                // set default selected tab to 'pending' if none active
                const hasActive = filterButtons.some(b=> b.classList.contains('active-filter'));
                const defaultBtn = filterEl.querySelector('.orders-filter-btn[data-value="pending"]');
                if (!hasActive && defaultBtn) {
                    // trigger the click handler so filtering is applied to the already-rendered list
                                                                                                                        defaultBtn.click();
                }
            }

            // expose updateOrdersSummary so other actions (like cancel) can call it
            updateOrdersSummary();

            // remove reserved minHeight after render
            list.style.minHeight = '';
        }catch(err){
            console.error('Failed to load orders', err); list.textContent = 'Failed to load orders';
        }
    }

    // Account form actions: minimal; POST to api/update_profile.php if available
    const acctForm = document.getElementById('account-form') || document.getElementById('account-form');
    if (acctForm){
        acctForm.addEventListener('submit', async (e)=>{
            e.preventDefault();
            const name = document.getElementById('acct-name').value.trim();
            const pw = document.getElementById('acct-pw').value;
            try{
                const res = await fetch('api/update_profile.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,name,password:pw})});
                const j = await res.json();
                if (j.success) alert('Profile updated'); else alert(j.message||'Failed to update');
            }catch(err){
                alert('Failed to update'); console.error(err);
            }
        });
    }

    const delBtn = document.getElementById('acct-delete');
    if (delBtn) delBtn.addEventListener('click', async ()=>{
        if (!confirm('Delete your account? This is irreversible.')) return;
        try{
            const res = await fetch('api/delete_account.php',{method:'POST'});
            const j = await res.json();
            if (j.success) window.location.href = 'index.php'; else alert(j.message||'Failed to delete');
        }catch(err){
            alert('Failed to delete');
        }
    });

    // Inner mannequin tab switching (Body Measurements / Other Preferences)
    const bodyBtn = document.getElementById('bodyTabBtn');
    const otherBtn = document.getElementById('otherPrefBtn');
    const bodyTab = document.getElementById('bodyTab');
    const otherTab = document.getElementById('otherPrefTab');
    if (bodyBtn && otherBtn && bodyTab && otherTab){
        bodyBtn.addEventListener('click', ()=>{
            bodyBtn.classList.add('active'); otherBtn.classList.remove('active');
            bodyTab.style.display = 'block'; otherTab.style.display = 'none';
        });
        otherBtn.addEventListener('click', ()=>{
            otherBtn.classList.add('active'); bodyBtn.classList.remove('active');
            bodyTab.style.display = 'none'; otherTab.style.display = 'block';
        });
    }

    // Listen for preference buttons and emit custom events for the mannequin viewer
    // Prefer direct listeners for preference buttons (more reliable than delegation for some browsers)
    function wirePrefButtons(){
        // skin buttons: show a selected state via aria-pressed
        document.querySelectorAll('.skin-btn').forEach(b=> b.addEventListener('click', (ev)=>{
            const color=b.getAttribute('data-skin');
            // update aria-pressed on all skin buttons
            document.querySelectorAll('.skin-btn').forEach(x=> x.setAttribute('aria-pressed', 'false'));
            b.setAttribute('aria-pressed', 'true');
            window.dispatchEvent(new CustomEvent('mannequin.skin',{detail:{color}}));
        }));

        // face/body/pose: toggle active class among siblings in the same group
        document.querySelectorAll('.face-btn').forEach(b=> b.addEventListener('click', (ev)=>{
            const morph=b.getAttribute('data-morph');
            document.querySelectorAll('.face-btn').forEach(x=> x.classList.remove('active'));
            b.classList.add('active');
            window.dispatchEvent(new CustomEvent('mannequin.face',{detail:{morph}}));
        }));
        document.querySelectorAll('.bodyshape-btn').forEach(b=> b.addEventListener('click', (ev)=>{
            const morph=b.getAttribute('data-morph');
            document.querySelectorAll('.bodyshape-btn').forEach(x=> x.classList.remove('active'));
            b.classList.add('active');
            window.dispatchEvent(new CustomEvent('mannequin.shape',{detail:{morph}}));
        }));
        document.querySelectorAll('.pose-btn').forEach(b=> b.addEventListener('click', (ev)=>{
            const morph=b.getAttribute('data-morph');
            document.querySelectorAll('.pose-btn').forEach(x=> x.classList.remove('active'));
            b.classList.add('active');
            window.dispatchEvent(new CustomEvent('mannequin.pose',{detail:{morph}}));
        }));
    }
    // wire now and also after any dynamic loads
    wirePrefButtons();

    // Now that inner controls are wired, pick the initial tab (hash or active/default)
    (function pickInitialTab(){
        let desired = null;
        if (location.hash && location.hash.length>1) desired = decodeURIComponent(location.hash.slice(1)).toLowerCase();
        else {
            const sp = new URLSearchParams(location.search);
                                                                        if (sp.get('tab')) desired = sp.get('tab').toLowerCase();
        }
        let initTab = null;
        if (desired) initTab = tabs.find(t => (t.textContent||'').trim().toLowerCase() === desired);
        if (!initTab) initTab = tabs.find(t=>t.classList.contains('active')) || tabs[0];
        if (initTab) {
            // small defer to let the browser finish layout changes
                                                                        requestAnimationFrame(()=> initTab.click());
        }
    })();
});
