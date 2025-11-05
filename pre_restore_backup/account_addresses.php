<?php
require_once 'includes/db_connect.php';
require_once 'includes/session.php';
require_login();
$currentUser = current_user($conn);
?>
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Manage Addresses - artine3</title>
    <link rel="stylesheet" href="assets/css/style.css">
    <style>
        /* remove focus outline for readonly inputs */
        input[readonly]:focus {
            outline: none; box-shadow: none;
        }
        /* nicer buttons */
        #addresses button { margin-left:8px }
    </style>
</head>
<body>
    <?php include 'includes/header.php'; ?>
    <main style="padding:20px;max-width:900px;margin:0 auto;">
        <h1>Your Addresses</h1>
        <div id="addresses"></div>
        <button id="show-add">Add Address</button>

        <!-- form hidden by default; shown when Add or Edit clicked -->
        <div id="addr-form-wrap" style="display:none;margin-top:16px;">
            <h3 id="form-title">Add / Edit Address</h3>
            <form id="addr-form">
                <input type="hidden" id="address_id">
                <label>Full name <input id="full_name" readonly></label><br>
                <label>Phone <input id="phone" readonly></label><br>
                <label>Street <input id="street"></label><br>
                <label>City <input id="city"></label><br>
                <label>Province <input id="province"></label><br>
                <label>Postal Code <input id="postal_code"></label><br>
                <label>Country <input id="country" value="Philippines" readonly></label><br>
                <!-- removed default checkbox from form per request -->
                <button id="save-addr">Save</button>
                <button id="cancel-addr" type="button">Cancel</button>
            </form>
        </div>

    <script src="assets/js/index.js"></script>
    <script>
    async function setDefaultAddress(address_id){
        // call API to set this address as default
        const r = await fetch('api/addresses.php',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({address_id:address_id, set_default:1})});
        return await r.json();
    }

    async function loadAddrs(){
        const res = await fetch('api/addresses.php');
        const a = await res.json();
        const container = document.getElementById('addresses'); container.innerHTML='';
        a.forEach(ad=>{
            const displayCountry = (!ad.country || ad.country === '0') ? 'Philippines' : ad.country;
            const div=document.createElement('div');
            div.className = 'addr-block';
            div.style.border = '1px solid #ddd';
            div.style.padding = '12px';
            div.style.marginBottom = '8px';
            div.style.position = 'relative';
            div.innerHTML = `
                <div style="max-width:85%">
                    <strong>${ad.full_name}</strong> (${ad.phone})<br>
                    ${ad.street}<br>
                    ${ad.city}, ${ad.province}<br>
                    ${ad.postal_code}, ${displayCountry}
                </div>
                <div style="position:absolute;right:12px;top:12px;text-align:right">
                    <label style="display:block"><input type="radio" name="default_addr" data-id="${ad.address_id}" ${ad.is_default ? 'checked' : ''}> Default</label>
                    <button data-id="${ad.address_id}" class="edit">Edit</button>
                    <button data-id="${ad.address_id}" class="del">Delete</button>
                </div>
            `;
            container.appendChild(div);
        });

        // wire up edit/delete and radio change
        container.querySelectorAll('.edit').forEach(b=> b.addEventListener('click', async (ev)=>{
            const id = b.getAttribute('data-id');
            const list = await (await fetch('api/addresses.php')).json();
            const one = list.find(x=>x.address_id==id);
            if(one){
                document.getElementById('address_id').value = one.address_id;
                                                                                                document.getElementById('full_name').value = one.full_name;
                                                                                                document.getElementById('phone').value = one.phone;
                                                                                                document.getElementById('street').value = one.street;
                                                                                                document.getElementById('city').value = one.city;
                                                                                                document.getElementById('province').value = one.province;
                                                                                                document.getElementById('postal_code').value = one.postal_code;
                                                                                                const c = (!one.country || one.country === '0') ? 'Philippines' : one.country;
                                                                                                document.getElementById('country').value = c;
                                                                                                document.getElementById('form-title').innerText = 'Edit Address';
                                                                                                document.getElementById('addr-form-wrap').style.display = '';
            }
        }));

        container.querySelectorAll('.del').forEach(b=> b.addEventListener('click', async ()=>{
            if(!confirm('Delete?')) return;
            const id=b.getAttribute('data-id');
            try{
                const r = await fetch('api/addresses.php',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({address_id:id})});
                const j = await r.json();
                if (j && j.success) {
                    loadAddrs();
                }
                else {
                    if (typeof showNotification === 'function') showNotification('Delete failed: ' + (j && j.message ? j.message : 'unknown'), 'error'); else alert('Delete failed: ' + (j && j.message ? j.message : 'unknown'));
                }
            }catch(err){
                if (typeof showNotification === 'function') showNotification('Delete failed: ' + err.message, 'error'); else alert('Delete failed: ' + err.message);
            }
        }));

        container.querySelectorAll('input[name="default_addr"]').forEach(r=> r.addEventListener('change', async ()=>{
            const id = r.getAttribute('data-id');
            try{
                const j = await setDefaultAddress(id);
                if (j && j.success) {
                    loadAddrs();
                }
                else {
                    if (typeof showNotification === 'function') showNotification('Could not set default', 'error'); else alert('Could not set default');
                }
            }catch(err){
                if (typeof showNotification === 'function') showNotification('Could not set default: ' + err.message, 'error'); else alert('Could not set default: ' + err.message);
            }
        }));
    }

    document.addEventListener('DOMContentLoaded', ()=>{
        // prefill name/phone/country from server
        const serverName = <?php echo json_encode(trim(($currentUser['first_name'] ?? '') . ' ' . ($currentUser['last_name'] ?? ''))); ?>;
        const serverPhone = <?php echo json_encode($currentUser['phone'] ?? ''); ?>;
        if (!document.getElementById('full_name').value) document.getElementById('full_name').value = serverName;
        if (!document.getElementById('phone').value) document.getElementById('phone').value = serverPhone;
        if (!document.getElementById('country').value) document.getElementById('country').value = 'Philippines';
        loadAddrs();

        document.getElementById('show-add').addEventListener('click', ()=>{
            document.getElementById('address_id').value = '';
                                                                        document.getElementById('street').value = '';
                                                                        document.getElementById('city').value = '';
                                                                        document.getElementById('province').value = '';
                                                                        document.getElementById('postal_code').value = '';
                                                                        document.getElementById('form-title').innerText = 'Add Address';
                                                                        document.getElementById('addr-form-wrap').style.display = '';
        });

        document.getElementById('cancel-addr').addEventListener('click', ()=>{
            document.getElementById('addr-form-wrap').style.display = 'none';
        });

        document.getElementById('save-addr').addEventListener('click', async (e)=>{ 
            e.preventDefault(); 
            const id = document.getElementById('address_id').value; 
            const payload = { full_name:document.getElementById('full_name').value, phone:document.getElementById('phone').value, street:document.getElementById('street').value, city:document.getElementById('city').value, province:document.getElementById('province').value, postal_code:document.getElementById('postal_code').value, country:document.getElementById('country').value };
            if (id) { payload.address_id = id; const r = await fetch('api/addresses.php',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const j = await r.json(); if (j.success) {
                document.getElementById('addr-form-wrap').style.display='none'; loadAddrs();
            } else { if (typeof showNotification === 'function') showNotification('Save failed', 'error'); else alert('Save failed'); } }
            else { const r = await fetch('api/addresses.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const j = await r.json(); if (j.success) {
                document.getElementById('addr-form-wrap').style.display='none'; loadAddrs();
            } else { if (typeof showNotification === 'function') showNotification('Save failed', 'error'); else alert('Save failed'); } }
        }); });
    </script>
</body>
</html>
