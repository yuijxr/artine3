/* Shared client-side utilities
 * Exposes a single global object `AppUtils` with helpers used across scripts.
 */
(function(global){
    const AppUtils = global.AppUtils || {};

    AppUtils.formatCurrency = AppUtils.formatCurrency || function(v){ return Number(v||0).toFixed(2); };

    AppUtils.safeJson = AppUtils.safeJson || async function(response){
        try{ return await response.json(); }catch(e){ console.warn('safeJson parse failed', e); return null; }
    };

    AppUtils.resolveImagePath = AppUtils.resolveImagePath || function(image, category){
        if (!image) return 'assets/img/thumbnails/noimg.png';
        if (String(image).includes('assets/')) return image;
        const cat = (category || '').toLowerCase();
        let folder = '';
        if (cat.indexOf('shirt') !== -1) folder = 'shirts/';
        else if (cat.indexOf('cap') !== -1) folder = 'caps/';
        else if (cat.indexOf('perfume') !== -1) folder = 'perfumes/';
        if (!folder) folder = 'shirts/';
        return 'assets/img/' + folder + image;
    };

    AppUtils.escapeHtml = AppUtils.escapeHtml || function(s){ if(s===null||s===undefined) return ''; return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

    AppUtils.notify = AppUtils.notify || function(msg, type){ try{ if (typeof global.showNotification === 'function') global.showNotification(msg, type); else alert(msg); }catch(e){ try{ alert(msg); }catch(_){} } };

    global.AppUtils = AppUtils;
})(window);
