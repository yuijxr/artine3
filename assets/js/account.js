document.addEventListener('DOMContentLoaded', () => {
    const addrContainer = document.getElementById('account-addresses');
    const openMgrBtn = document.getElementById('open-address-manager');

    const modal = document.getElementById('address-modal');
    const managerListWrap = document.getElementById('modal_list');
    const managerList = document.getElementById('modal_addresses_list');
    const btnAddNew = document.getElementById('modal_add_new');
    const modalCloseIcon = document.getElementById('modal_close_icon');
    const form = document.getElementById('addr-modal-form');
    const btnBack = document.getElementById('modal_back');

    const fld = {
        id: document.getElementById('modal_address_id'),
        full_name: document.getElementById('modal_full_name'),
        phone: document.getElementById('modal_phone'),
        street: document.getElementById('modal_street'),
        city: document.getElementById('modal_city'),
        province: document.getElementById('modal_province'),
        postal_code: document.getElementById('modal_postal_code'),
        country: document.getElementById('modal_country')
    };

    let addressesCache = [];
    let pendingSelectedAddressId = null; // selection inside modal before saving

    function notify(msg, type = 'info') {
        try {
            if (typeof showNotification === 'function') {
                showNotification(msg, type);
            } else {
                alert(msg);
            }
        } catch (e) {
            try {
                alert(msg);
            } catch (_) {}
        }
    }

    async function fetchAllAddresses() {
        try {
            const res = await fetch('api/addresses.php', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch');
            const list = await res.json();
            addressesCache = Array.isArray(list) ? list : [];
            return addressesCache;
        } catch (err) {
            console.error(err);
            addressesCache = [];
            return [];
        }
    }

    async function loadAddresses() {
        const list = await fetchAllAddresses();
        renderPreview(list);
    }

    function renderPreview(list) {
        // guard: this script may be included on pages that don't have the account preview container (eg. checkout)
        if (!addrContainer) return;
        addrContainer.innerHTML = '';
        if (!Array.isArray(list) || list.length === 0) {
            addrContainer.innerHTML = '<div style="color:#666">No saved addresses</div>';
            return;
        }
        // build preview up to 2 addresses: default first, then next
        const preview = [];
        const def = list.find(a => Number(a.is_default) === 1 || a.is_default === '1');
        if (def) preview.push(def);
        for (const a of list) {
            if (preview.length >= 2) break;
            if (def && a.address_id == def.address_id) continue;
            preview.push(a);
        }
        // if no default and list has at least 2, take first two
        if (preview.length === 0) preview.push(list[0]);

        preview.forEach(a => {
            const card = document.createElement('div');
            card.className = 'address-card';
            const main = document.createElement('div');
            main.className = 'addr-main';
            const country = (!a.country || a.country === '0') ? 'Philippines' : a.country;
            main.innerHTML = `<strong>${escapeHtml(a.full_name)}</strong> ` +
                `<span style="color:#666">(${escapeHtml(a.phone)})</span>` +
                `<div style="margin-top:6px;color:#333">${escapeHtml(a.street)}</div>` +
                `<div style="margin-top:4px;color:#666;font-size:13px">` +
                `${escapeHtml(a.city)}, ${escapeHtml(a.province)} ` +
                `${escapeHtml(a.postal_code || '')} ${escapeHtml(country)}</div>`;
            const actions = document.createElement('div');
            actions.className = 'addr-actions';
            if (Number(a.is_default) === 1 || a.is_default === '1') {
                actions.innerHTML = '<span class="default-badge">Default</span>';
            }
            // clicking preview card sets it as default (quick select)
            card.appendChild(main);
            card.appendChild(actions);
            main.addEventListener('click', async () => {
                try {
                    const r = await fetch('api/addresses.php', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address_id: a.address_id, set_default: 1 })
                    });
                    const j = await r.json();
                    if (j && j.success) {
                        notify('Default updated', 'success');
                        const list2 = await fetchAllAddresses();
                        renderPreview(list2);
                    } else {
                        notify('Could not set default', 'error');
                    }
                } catch (err) {
                    notify('Failed', 'error');
                }
            });
            addrContainer.appendChild(card);
        });
    }

    // show manager list in modal
    async function showManager() {
        const list = await fetchAllAddresses();
        // initialize pending selection to current default so user sees existing choice
        const def = list.find(a => Number(a.is_default) === 1 || a.is_default === '1');
        pendingSelectedAddressId = def ? def.address_id : null;
        renderManagerList(list);
        // show list view, hide form
        managerListWrap.style.display = '';
        form.style.display = 'none';
        modal.style.display = '';
    }

    function renderManagerList(list) {
        if (!managerList) return;
        managerList.innerHTML = '';
        if (!Array.isArray(list) || list.length === 0) {
            managerList.innerHTML = '<div style="color:#666">No saved addresses</div>';
            return;
        }
        list.forEach(a => {
            const el = document.createElement('div');
            el.className = 'address-card';
            const main = document.createElement('div');
            main.className = 'addr-main';
            const country = (!a.country || a.country === '0') ? 'Philippines' : a.country;
            main.innerHTML = `<strong>${escapeHtml(a.full_name)}</strong> ` +
                `${Number(a.is_default) === 1 ? '<span class="default-badge">Default</span>' : ''}` +
                `<div style="margin-top:6px;color:#333">${escapeHtml(a.street)}</div>` +
                `<div style="margin-top:4px;color:#666;font-size:13px">` +
                `${escapeHtml(a.city)}, ${escapeHtml(a.province)} ` +
                `${escapeHtml(a.postal_code || '')} ${escapeHtml(country)}</div>`;
            const actions = document.createElement('div');
            actions.className = 'addr-actions';
            // Edit icon button
            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn';
            editBtn.title = 'Edit';
            editBtn.innerHTML = '<i class="fa fa-pen"></i>';
            editBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openFormForAddress(a);
            });
            // Delete icon button
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn danger';
            delBtn.title = 'Delete';
            delBtn.innerHTML = '<i class="fa fa-trash"></i>';
            delBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (!confirm('Delete this address?')) return;
                try {
                    const r = await fetch('api/addresses.php', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address_id: a.address_id })
                    });
                    const j = await r.json();
                    if (j && j.success) {
                        notify('Deleted', 'success');
                        const list2 = await fetchAllAddresses();
                        // adjust pending selection if needed
                        const defAfter = list2.find(x => Number(x.is_default) === 1 || x.is_default === '1');
                        pendingSelectedAddressId = defAfter ? defAfter.address_id : null;
                        renderManagerList(list2);
                        renderPreview(list2);
                    } else {
                        notify('Delete failed: ' + (j && j.message ? j.message : ''), 'error');
                    }
                } catch (err) {
                    notify('Delete failed', 'error');
                }
            });

            const wrapActions = document.createElement('div');
            wrapActions.style.display = 'flex';
            wrapActions.style.gap = '8px';
            wrapActions.appendChild(editBtn);
            wrapActions.appendChild(delBtn);
            actions.appendChild(wrapActions);
            // clicking the card selects it locally; Save will commit the change
            el.addEventListener('click', () => {
                pendingSelectedAddressId = a.address_id;
                // update visual selection
                Array.from(managerList.children).forEach(ch => {
                    ch.classList.remove('selected');
                    ch.style.borderColor = '';
                    ch.style.boxShadow = '';
                });
                el.classList.add('selected');
                el.style.borderColor = '#1976d2';
                el.style.boxShadow = '0 0 0 3px rgba(25,118,210,0.06)';
            });
            el.appendChild(main);
            el.appendChild(actions);
            managerList.appendChild(el);
        });
        // ensure the currently pending selection is visually marked
        if (pendingSelectedAddressId) {
            Array.from(managerList.children).forEach((ch, idx) => {
                const addr = list[idx];
                if (addr && String(addr.address_id) === String(pendingSelectedAddressId)) {
                    ch.classList.add('selected');
                    ch.style.borderColor = '#1976d2';
                    ch.style.boxShadow = '0 0 0 3px rgba(25,118,210,0.06)';
                }
            });
        }
    }

    function openFormForAddress(address) {
        if (address) {
            fld.id.value = address.address_id || '';
            fld.full_name.value = address.full_name || '';
            fld.phone.value = address.phone || '';
            fld.street.value = address.street || '';
            fld.city.value = address.city || '';
            fld.province.value = address.province || '';
            fld.postal_code.value = address.postal_code || '';
            fld.country.value = (!address.country || address.country === '0') ? 'Philippines' : address.country;
        } else {
            fld.id.value = '';
            fld.full_name.value = '';
            fld.phone.value = '';
            fld.street.value = '';
            fld.city.value = '';
            fld.province.value = '';
            fld.postal_code.value = '';
            fld.country.value = 'Philippines';
        }
        managerListWrap.style.display = 'none';
        form.style.display = '';
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    async function saveAddress(ev) {
        ev.preventDefault();
        const payload = {
            full_name: fld.full_name.value.trim(),
            phone: fld.phone.value.trim(),
            street: fld.street.value.trim(),
            city: fld.city.value.trim(),
            province: fld.province.value.trim(),
            postal_code: fld.postal_code.value.trim(),
            country: fld.country.value.trim()
        };
        const id = fld.id.value;
        try {
            if (id) {
                payload.address_id = id;
                const r = await fetch('api/addresses.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const j = await r.json();
                if (j && j.success) {
                    notify('Address updated', 'success');
                    const list2 = await fetchAllAddresses();
                    renderManagerList(list2);
                    renderPreview(list2);
                    managerListWrap.style.display = '';
                    form.style.display = 'none';
                } else {
                    notify('Save failed', 'error');
                }
            } else {
                const r = await fetch('api/addresses.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const j = await r.json();
                if (j && j.success) {
                    notify('Address saved', 'success');
                    const list2 = await fetchAllAddresses();
                    renderManagerList(list2);
                    renderPreview(list2);
                    managerListWrap.style.display = '';
                    form.style.display = 'none';
                } else {
                    notify('Save failed', 'error');
                }
            }
        } catch (err) {
            console.error(err);
            notify('Save failed', 'error');
        }
    }

    // small helper
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>\"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // events
    openMgrBtn && openMgrBtn.addEventListener('click', showManager);
    btnAddNew && btnAddNew.addEventListener('click', () => openFormForAddress(null));
    modalCloseIcon && modalCloseIcon.addEventListener('click', () => closeModal());
    btnBack && btnBack.addEventListener('click', (e) => {
        e.preventDefault();
        form.style.display = 'none';
        managerListWrap.style.display = '';
    });
    form && form.addEventListener('submit', saveAddress);
    // Save/Cancel inside manager list (commit selection on Save)
    const modalSaveBtn = document.getElementById('modal_save_changes');
    const modalCancelBtn = document.getElementById('modal_cancel_changes');
    modalCancelBtn && modalCancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // discard selection and close
        e.stopPropagation();
        pendingSelectedAddressId = null;
        closeModal();
    });
    modalSaveBtn && modalSaveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // close modal immediately as requested by UX
        closeModal();
        // if nothing selected, nothing to do
        if (!pendingSelectedAddressId) return;
        const currentDefault = addressesCache.find(a => Number(a.is_default) === 1 || a.is_default === '1');
        if (currentDefault && String(currentDefault.address_id) === String(pendingSelectedAddressId)) {
            // nothing changed
            return;
        }
        // perform the API call and show a single toast depending on outcome
        try {
            const r = await fetch('api/addresses.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address_id: pendingSelectedAddressId, set_default: 1 })
            });
            const j = await r.json();
            if (j && j.success) {
                // refresh cache and UI
                const list2 = await fetchAllAddresses();
                const def2 = list2.find(a => Number(a.is_default) === 1 || a.is_default === '1');
                pendingSelectedAddressId = def2 ? def2.address_id : null;
                // update account preview if present
                try {
                    renderPreview(list2);
                } catch (e) {}
                // update manager list if modal is open (it was closed) — but keep cache consistent
                try {
                    renderManagerList(list2);
                } catch (e) {}
                // update checkout card if present
                try {
                    const checkoutCard = document.querySelector('.checkout-address-card');
                    if (checkoutCard) {
                        const addr = list2.find(x => String(x.address_id) === String(pendingSelectedAddressId));
                        if (addr) {
                            checkoutCard.setAttribute('data-address-id', addr.address_id);
                            checkoutCard.innerHTML = `\
                                <div class="address-name">${escapeHtml(addr.full_name)} ` +
                                `<span class="address-phone">(${escapeHtml(addr.phone)})</span></div>\
                                <div class="address-details">${escapeHtml(addr.street)}, ` +
                                `${escapeHtml(addr.city)}, ${escapeHtml(addr.province)}</div>\
                                <div class="address-details">${escapeHtml(addr.postal_code)}, ` +
                                `${escapeHtml(addr.country)}</div>\
                                <div class="address-ship"><i class="fa-solid fa-location-dot"></i> ` +
                                `Shipping to this address</div>\
                            `;
                            // ensure it's marked active
                            document.querySelectorAll('.checkout-address-card').forEach(c => c.classList.remove('active'));
                            checkoutCard.classList.add('active');
                        }
                    }
                } catch (e) {}
                notify('Default updated', 'success');
            } else {
                notify('Could not set default', 'error');
            }
        } catch (err) {
            console.error(err);
            notify('Could not set default', 'error');
        }
    });
    // no delete button inside the edit form; deletes are done via the trash icon in the list
    // close modal on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // initial load
    loadAddresses();
    // expose a global helper so other pages (checkout) can open the address manager modal
    try {
        window.openAddressManager = showManager;
    } catch (e) {
        /* ignore */
    }
});
