import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Public helper arrays (used by both UI wiring and event listeners) ---
const FACE_SHAPES = [
    'Oval Face Shape',
    'Square Face Shape',
    'Diamond Face Shape',
    'Rectangular Face Shape',
    'Heart Face Shape'
];
// Note: body-shape presets are no longer a stored preference. The
// measurement-preset helper (see `applyMeasurementPreset`) remains
// available to move sliders programmatically but UI buttons and
// server-side storage for body-shape have been removed.
const POSE_SHAPES = [
    "'T' Pose",
    "'A' Pose",
    "'W' Pose",
    "'U' Pose"
];

// Utility: find a mesh that contains a given morph name
function findMeshWithMorph(morphName) {
    if (!window.mannequin) return null;
    let found = null;
    window.mannequin.traverse(child => {
        if (child.isMesh && child.morphTargetDictionary &&
            child.morphTargetDictionary[morphName] !== undefined) {
            found = child;
        }
    });
    return found;
}

// Helpful name regexes for clothing/body detection used by multiple functions
const _CLOTHING_NAME_RX = /shirt|jacket|coat|pants|skirt|jeans|top|garment|clothe|cap|hat|beanie|shoe|sock|sneaker|boot|sole/i;
const _BODY_NAME_RX = /mannequin|body|torso|head|skin|eye|teeth/i;

function _isDescendantOfClothing(node){
    try{
        let p = node;
        while(p){
            if (p.name && _CLOTHING_NAME_RX.test(String(p.name))) return true;
            p = p.parent;
        }
    }catch(e){}
    return false;
}

// Expose a tiny API so other scripts can control the mannequin without peeking into internals
window.mannequinAPI = {
    setSkinTone(color) {
        if (!window.mannequin) return;
        // Only apply skin tone to body/skin meshes, not clothing meshes.
        // Some clothing is exported as child meshes with generic names (e.g. "Mesh.001").
        // To avoid recoloring those we check ancestor names for clothing keywords.
        // Handle both single materials and arrays of materials, and mark materials
        // as updated so the renderer shows the new color for any valid color string.
        try {
            window.mannequin.traverse(child => {
                if (!child.isMesh || !child.material) return;
                // skip nodes that are (or are inside) clothing groups
                if (_isDescendantOfClothing(child)) return;
                try {
                    const applyMat = (mat) => {
                        if (!mat) return;
                        try {
                            // Common case: material.color exists and supports set()
                            if (mat.color && typeof mat.color.set === 'function') {
                                mat.color.set(color);
                            } else if (mat.uniforms && mat.uniforms.diffuse && mat.uniforms.diffuse.value && typeof mat.uniforms.diffuse.value.set === 'function') {
                                // some custom materials expose a diffuse uniform
                                mat.uniforms.diffuse.value.set(color);
                            }
                            // Ensure material updates in renderer
                            try { mat.needsUpdate = true; } catch (e) { /* ignore */ }
                        } catch (e) { /* ignore individual material failures */ }
                    };

                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => applyMat(m));
                    } else {
                        applyMat(child.material);
                    }
                } catch (e) { /* ignore per-node failures */ }
            });
        } catch (e) { /* ignore traversal failures */ }
    },
    setMorphExclusive(morphName, categoryShapes) {
        const mesh = findMeshWithMorph(morphName);
        if (!mesh) return;
        categoryShapes.forEach(key => {
            const idx = mesh.morphTargetDictionary[key];
            if (idx !== undefined) {
                mesh.morphTargetInfluences[idx] = (key === morphName) ? 1 : 0;
            }
        });
    },
    setPose(morphName, poseShapes) {
        const mesh = findMeshWithMorph(morphName);
        if (!mesh) return;
        poseShapes.forEach(key => {
            const idx = mesh.morphTargetDictionary[key];
            if (idx !== undefined) {
                mesh.morphTargetInfluences[idx] = (key === morphName) ? 1 : 0;
            }
        });
    }
};

// === UI Tab and Morph/Color Button Logic ===
window.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const bodyTabBtn = document.getElementById('bodyTabBtn');
    const otherPrefBtn = document.getElementById('otherPrefBtn');
    const bodyTab = document.getElementById('bodyTab');
    const otherPrefTab = document.getElementById('otherPrefTab');
    if (bodyTabBtn && otherPrefBtn && bodyTab && otherPrefTab) {
        bodyTabBtn.addEventListener('click', function() {
            bodyTabBtn.classList.add('active');
            otherPrefBtn.classList.remove('active');
            bodyTab.style.display = 'block';
            otherPrefTab.style.display = 'none';
        });
        otherPrefBtn.addEventListener('click', function() {
            otherPrefBtn.classList.add('active');
            bodyTabBtn.classList.remove('active');
            bodyTab.style.display = 'none';
            otherPrefTab.style.display = 'block';
        });
    }

    // Button logic is now wired after mannequin is loaded
    window._wireMorphButtons = function() {
        // Skin tone buttons
        const skinTones = [
            { name: 'Light', color: '#FFDFC4' },
            { name: 'Medium', color: '#e0b899' },
            { name: 'Tan', color: '#c68642' },
            { name: 'Dark', color: '#a97c50' }
        ];
        skinTones.forEach(tone => {
            const btn = document.querySelector(`.skin-btn[data-skin="${tone.color}"]`);
            if (btn) {
                btn.onclick = () => window.mannequinAPI.setSkinTone(tone.color);
            }
        });

        // Face shape buttons
        FACE_SHAPES.forEach(shape => {
            const btn = document.querySelector(`.face-btn[data-morph="${shape}"]`);
            if (btn) {
                btn.onclick = () => window.mannequinAPI.setMorphExclusive(shape, FACE_SHAPES);
            }
        });

        // Body-shape UI removed by design; measurement presets are available
        // as a helper via `window.mannequinAPI.applyMeasurementPreset(name)`.

        // Pose buttons
        POSE_SHAPES.forEach(shape => {
            const btn = document.querySelector(`.pose-btn[data-morph="${shape}"]`);
            if (btn) {
                btn.onclick = () => window.mannequinAPI.setPose(shape, POSE_SHAPES);
            }
        });
    };
});

// Initialize viewer after DOM is ready (guard in case script is included early)
function initViewer() {
    const container = document.getElementById("mannequinViewer");
    if (!container) return console.warn('mannequinViewer container not found');
    container.style.width = "100%";
    container.style.height = "500px";
    
        // Create a loading overlay inside the container (hidden when model ready)
        const loaderOverlay = document.createElement('div');
        loaderOverlay.id = 'mannequinLoaderOverlay';
        loaderOverlay.style.position = 'absolute';
        loaderOverlay.style.left = '0';
        loaderOverlay.style.top = '0';
        loaderOverlay.style.width = '100%';
        loaderOverlay.style.height = '100%';
        loaderOverlay.style.display = 'flex';
        loaderOverlay.style.alignItems = 'center';
        loaderOverlay.style.justifyContent = 'center';
        loaderOverlay.style.background = 'rgba(255,255,255,0.9)';
        loaderOverlay.style.zIndex = '999';
        loaderOverlay.innerHTML = '<div style="text-align:center;"><div class="mannequin-loader-spinner" style="width:48px;height:48px;border-radius:50%;border:6px solid #e6e6e6;border-top-color:#1976d2;animation:mannequin-spin 1s linear infinite;margin:0 auto 8px"></div><div style="color:#333;font-size:14px">Loading mannequin...</div></div>';
        // add keyframes (only once)
        const styleId = 'mannequin-loader-style';
        if (!document.getElementById(styleId)){
            const s = document.createElement('style');
            s.id = styleId;
            s.innerHTML = '@keyframes mannequin-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
            document.head.appendChild(s);
        }
        // ensure container is positioned relatively so absolute overlay fits
        container.style.position = container.style.position || 'relative';
        container.appendChild(loaderOverlay);

    // === Renderer ===
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding; // ✅ proper color brightness
    // Use physically correct lights and filmic tone mapping for better color fidelity
    try {
        renderer.physicallyCorrectLights = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
    } catch (e) { /* ignore if not supported */ }
    // hide renderer until GLB fully loaded to avoid flashing incomplete model
    renderer.domElement.style.visibility = 'hidden';
    container.appendChild(renderer.domElement);

    // === Scene & Camera ===
    const scene = new THREE.Scene();
    // default background color while image loads
    scene.background = new THREE.Color(0xf2f2f2);
    // load a background image (overrides color on success)
    try {
        const textureLoader = new THREE.TextureLoader();
        const bgUrl = 'https://images.unsplash.com/photo-1503264116251-35a269479413?auto=format&fit=crop&w=1200&q=60';
        textureLoader.load(bgUrl, (tex) => {
            try { tex.encoding = THREE.sRGBEncoding; } catch (e) {}
            scene.background = tex;
        }, undefined, (err) => {
            console.warn('mannequin viewer: background image failed to load', err);
        });
    } catch (e) {
        console.warn('mannequin viewer: texture loader unavailable', e);
    }

    const camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 6);

    // === Lights ===
    // Hemisphere light provides neutral sky-ground fill
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);

    // Ambient fill for base illumination (keeps colors readable in shadows)
    const ambient = new THREE.AmbientLight(0xffffff, 0.0);
    scene.add(ambient);

    // Directional key light (sun) - neutral white with slightly higher intensity
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(5, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0005; // reduces shadow acne
    scene.add(sun);

    // Rim/back light to improve separation and material highlights
    const rim = new THREE.DirectionalLight(0xffffff, 0.2);
    rim.position.set(-5, 5, -5);
    scene.add(rim);


    // === Controls (free rotation + zoom) ===
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    controls.enableZoom = true;
    controls.minDistance = 2;
    controls.maxDistance = 3;

    controls.enablePan = false; // keep panning disabled for consistency
    // ❌ removed polar lock, so you can rotate freely (up/down/around)

    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;

    // Expose a refresh/resize helper so external code can tell the renderer to resize
    window.mannequinAPI.refresh = function() {
        try {
            if (!container || !renderer || !camera) return;
            const w = Math.max(1, container.clientWidth);
            const h = Math.max(1, container.clientHeight);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            // render one frame to ensure visible result
            renderer.render(scene, camera);
        } catch (e) {
            console.warn('mannequinAPI.refresh failed', e);
        }
    };

    // If container resizes (or becomes visible), automatically refresh renderer
    if (window.ResizeObserver) {
        try {
            const ro = new ResizeObserver(() => {
                if (window.mannequinAPI &&
                    typeof window.mannequinAPI.refresh === 'function') {
                    window.mannequinAPI.refresh();
                }
            });
            ro.observe(container);
        } catch (e) { /* ignore */ }
    }

    // If the container is hidden at init (width/height ~ 0) watch for visibility/class/style changes
    if ((container.clientWidth < 2 || container.clientHeight < 2) &&
        window.MutationObserver) {
        try {
            const parent = container.parentElement;
            const mo = new MutationObserver(() => {
                if (container.clientWidth > 2 && container.clientHeight > 2) {
                    if (window.mannequinAPI &&
                        typeof window.mannequinAPI.refresh === 'function') {
                        window.mannequinAPI.refresh();
                    }
                    mo.disconnect();
                }
            });
            mo.observe(container, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
            if (parent) {
                mo.observe(parent, {
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
            }
        } catch (e) { /* ignore */ }
    }

    // === Load Mannequin ===
    const loader = new GLTFLoader().setPath('./'); // same folder
    let mannequin;
    loader.load(
        'male.glb',
        (gltf) => {
            mannequin = gltf.scene;
            window.mannequin = mannequin; // Make mannequin globally available for button logic
            scene.add(mannequin);

            // Center the model
            const box = new THREE.Box3().setFromObject(mannequin);
            const center = box.getCenter(new THREE.Vector3());
            mannequin.position.sub(center);

            // ✅ Apply clean skin tone to body meshes only (do not recolor clothing)
            mannequin.traverse((child) => {
                if (!child.isMesh) return;
                const name = (child.name || '').toLowerCase();
                // skip clothing meshes so shirts/pants keep their own materials
                if (/shirt|jacket|coat|pants|skirt|jean|jeans|top|garment|cap|hat|shoe|sock|sneaker/i.test(name)) return;
                try {
                    child.material = new THREE.MeshStandardMaterial({
                        color: '#FFDFC4',   // light skin tone
                        roughness: 0.6,     // softer look
                        metalness: 0.0,     // not metallic
                    });
                } catch (e) { /* ignore */ }
            });

            // === Morph targets: sync by name across mannequin + clothing meshes ===
            const morphTargets = [
                'Shoulders', 'Arms', 'Chest', 'Waist', 'Torso'
            ];

            // Find all meshes with morph targets
            const morphMeshes = [];
            // Also collect all named nodes (meshes and groups) so toggles can
            // target group names exported from Blender (e.g., 'Caps','Pants','Shoe1').
            const allNodes = [];
            mannequin.traverse((child) => {
                if (child && child.name) allNodes.push(child);
                if (child.isMesh && child.morphTargetDictionary) {
                    morphMeshes.push(child);
                }
            });

            // Build a mapping: morphName -> [{ mesh, index }]
            const morphMap = {};
            morphMeshes.forEach(mesh => {
                const dict = mesh.morphTargetDictionary || {};
                for (const name in dict) {
                    if (!Object.prototype.hasOwnProperty.call(dict, name)) continue;
                    const idx = dict[name];
                    if (!morphMap[name]) morphMap[name] = [];
                    morphMap[name].push({ mesh, index: idx });
                }
            });

            // Override top-level APIs so buttons apply morphs across ALL meshes
            // (mannequin + clothing) when morph names match.
            window.mannequinAPI.setMorphExclusive = function(morphName, categoryShapes, applyPreset) {
                // For every mesh that has morph targets, set the category shapes
                // to be exclusive (selected morph = 1, others = 0).
                morphMeshes.forEach(mesh => {
                    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
                    categoryShapes.forEach(key => {
                        const idx = mesh.morphTargetDictionary[key];
                        if (idx !== undefined) {
                            try { mesh.morphTargetInfluences[idx] = (key === morphName) ? 1 : 0; } catch (e) { /* ignore */ }
                        }
                    });
                });

                // Reflect selection in the UI for face buttons only. Body-shape
                // UI and presets are removed from the active preferences; the
                // measurement-preset helper is available separately.
                try {
                    if (FACE_SHAPES.indexOf(morphName) !== -1) {
                        document.querySelectorAll('.face-btn.active').forEach(b => b.classList.remove('active'));
                        const fbtn = document.querySelector(`.face-btn[data-morph="${morphName}"]`);
                        if (fbtn) fbtn.classList.add('active');
                    }
                } catch (e) { /* ignore UI sync failures */ }
            };

            // track the currently-selected size token (normalized)
            let currentSelectedSizeNorm = '';

            // Helper: synchronize clothing pose variants to match the body's active pose
            function applyClothingPoseForActiveBodyPose(sizeNorm){
                try{
                    // determine body's active base pose
                    let bestPose = null, bestVal = 0;
                    POSE_SHAPES.forEach(poseName => { const v = getCurrentInfluenceFor(poseName); if (v>bestVal){bestVal=v;bestPose=poseName;} });
                    const activeBase = bestPose;
                    const activeInfluence = bestVal || 0;
                    if (!activeBase) return;

                    // For each pose base, set clothing size-pref variants accordingly
                    POSE_SHAPES.forEach(poseName => {
                        const pNorm = normalizeKey(poseName);
                        // derive single-letter token
                        const poseLetterMatch = (String(poseName).match(/[TAWU]/i) || []);
                        const poseLetter = (poseLetterMatch[0] || '').toLowerCase();

                        // build candidates similar to applySizeToModel's logic
                        const candidates = Object.keys(morphMap).filter(k => {
                            try{
                                const kl = String(k).toLowerCase();
                                if (kl.indexOf(String(poseName).toLowerCase()) !== -1) return true;
                                if (!poseLetter) return false;
                                const re = new RegExp('(^|[^a-z0-9])' + poseLetter + '([^a-z0-9]|pose|$)', 'i');
                                return re.test(kl);
                            }catch(e){ return false; }
                        });
                        if (candidates.length===0) return;

                        // special clothing: if base pose exists on special meshes, copy base
                        if (activeBase && normalizeKey(activeBase) === pNorm && morphMap[poseName]) {
                            morphMap[poseName].forEach(entry => {
                                try{ if (specialClothingMeshes.has(entry.mesh)) { entry.mesh.morphTargetInfluences[entry.index] = activeInfluence; } }catch(e){}
                            });
                        }

                        // choose best clothing candidate for the active pose
                        let chosen = null;
                        if (activeBase && normalizeKey(activeBase) === pNorm) {
                            chosen = candidates.find(c=> sizeNorm && normalizeKey(c).startsWith(sizeNorm) && (normalizeKey(c).includes(pNorm) || normalizeKey(c).includes(poseLetter)));
                            if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).startsWith(sizeNorm));
                            if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).includes(sizeNorm) && (normalizeKey(c).includes(pNorm) || normalizeKey(c).includes(poseLetter)));
                            if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).includes(sizeNorm));
                            if (!chosen) chosen = candidates.find(c=> normalizeKey(c)===pNorm) || candidates[0];
                        }

                        // apply: set chosen to activeInfluence, others to 0 (only on clothing meshes)
                        candidates.forEach(cand=>{
                            const entries = morphMap[cand]||[];
                            entries.forEach(entry=>{
                                try{
                                    if (!clothingMeshes || clothingMeshes.indexOf(entry.mesh) === -1) return;
                                    if (specialClothingMeshes.has(entry.mesh)) return;
                                    if (chosen && cand === chosen) entry.mesh.morphTargetInfluences[entry.index] = activeInfluence; else entry.mesh.morphTargetInfluences[entry.index] = 0;
                                }catch(e){}
                            });
                        });
                    });
                }catch(e){ /* ignore */ }
            }

            window.mannequinAPI.setPose = function(morphName, poseShapes) {
                // Apply pose shapes only to non-clothing (body) meshes so the
                // mannequin remains the authoritative pose source.
                morphMeshes.forEach(mesh => {
                    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
                    try{ if (clothingMeshes && clothingMeshes.indexOf(mesh) !== -1) return; }catch(e){}
                    poseShapes.forEach(key => {
                        const idx = mesh.morphTargetDictionary[key];
                        if (idx !== undefined) {
                            try { mesh.morphTargetInfluences[idx] = (key === morphName) ? 1 : 0; } catch (e) { /* ignore */ }
                        }
                    });
                });

                // After applying pose to the body, synchronize clothing pose variants
                try{ applyClothingPoseForActiveBodyPose(currentSelectedSizeNorm); }catch(e){}
                // and ensure special clothing meshes mirror body morphs
                try{ copyBodyToSpecialClothing(); }catch(e){}
            };

            // Heuristic: clothing meshes/nodes are those with common clothing keywords in their name
            // broaden the regex to include caps/hats/shoes/socks/boots so toggles affect them.
            const clothingRegex = /shirt|jacket|coat|pants|skirt|jeans|top|garment|clothe|cap|hat|beanie|shoe|sock|sneaker|boot|sole/i;
            const bodyRegex = /mannequin|body|torso|head|skin|eye|teeth/i;
            // Include meshes whose own name matches clothing keywords OR that are descendants
            // of nodes with clothing-like names. Some exports use generic mesh names
            // (e.g., "Mesh001") but group names contain 'Caps'/'Pants' etc.
            const clothingMeshes = morphMeshes.filter(m => {
                try{
                    if (m.name && clothingRegex.test(m.name) && !bodyRegex.test(m.name)) return true;
                    // if ancestor node contains clothing keyword, treat as clothing
                    return _isDescendantOfClothing(m);
                }catch(e){ return false; }
            });
            // nodes that look like clothing (may be groups/empties in Blender)
            const clothingNodes = allNodes.filter(n => {
                try{
                    if (!n.name) return false;
                    if (bodyRegex.test(n.name)) return false;
                    return clothingRegex.test(n.name) || (n.parent && _isDescendantOfClothing(n));
                }catch(e){ return false; }
            });

            // Identify clothing meshes that should simply follow the mannequin's
            // shape keys directly (no S-/M-/L- prefixed variants). Examples:
            // caps, hats, pants, shoes, socks, boots. We treat these meshes as
            // "follow-body-direct" so we copy the mannequin body morph values
            // to them when sizes/measurements change.
            const _SPECIAL_CLOTHING_RX = /cap|caps|hat|beanie|pants|trouser|pant|shoe|shoes|sock|socks|boot|boots/i;
            function _hasAncestorMatching(node, rx){
                try{
                    let p = node.parent;
                    while(p){ if (p.name && rx.test(String(p.name))) return true; p = p.parent; }
                }catch(e){}
                return false;
            }
            const specialClothingMeshes = new Set(clothingMeshes.filter(m => {
                try{
                    if (m.name && _SPECIAL_CLOTHING_RX.test(String(m.name))) return true;
                    if (_hasAncestorMatching(m, _SPECIAL_CLOTHING_RX)) return true;
                }catch(e){}
                return false;
            }));

            // Helper: copy body's base measurement and pose morph influences
            // onto special clothing meshes so caps/pants/shoes follow exactly
            function copyBodyToSpecialClothing(){
                try{
                    const measurementBases = ['Shoulders','Arms','Chest','Waist','Torso'];
                    measurementBases.forEach(base => {
                        const val = getCurrentInfluenceFor(base);
                        const entries = morphMap[base] || [];
                        entries.forEach(entry => {
                            try{
                                if (specialClothingMeshes.has(entry.mesh)) {
                                    entry.mesh.morphTargetInfluences[entry.index] = val;
                                }
                            }catch(e){}
                        });
                    });

                    // copy poses as well
                    POSE_SHAPES.forEach(pose => {
                        const val = getCurrentInfluenceFor(pose);
                        const entries = morphMap[pose] || [];
                        entries.forEach(entry => {
                            try{
                                if (specialClothingMeshes.has(entry.mesh)) {
                                    entry.mesh.morphTargetInfluences[entry.index] = val;
                                }
                            }catch(e){}
                        });
                    });
                }catch(e){/* ignore */}
            }

            // Debug helper: list meshes that contain a given morph name
            try{ window.mannequinAPI.debugMorphOwners = function(morphName){
                try{
                    const owners = (morphMap[morphName]||[]).map(e=>({mesh: e.mesh && e.mesh.name, isSpecial: specialClothingMeshes.has(e.mesh), isClothing: clothingMeshes.indexOf(e.mesh)!==-1}));
                    console.log('Owners for', morphName, owners);
                    return owners;
                }catch(e){ console.error('debugMorphOwners failed', e); return []; }
            }; }catch(e){}
            // By default, only show clothing on product pages (where the clothing
            // toggle exists). On account/profile pages we want a naked mannequin
            // so the clothes are hidden unless explicitly toggled from product.php.
            try {
                const showClothingByDefault = !!document.getElementById('mannequinClothingToggle') || (typeof window.location !== 'undefined' && window.location.pathname && window.location.pathname.indexOf('product.php') !== -1);
                clothingMeshes.forEach(m => { try { m.visible = !!showClothingByDefault; } catch (e) {} });
            } catch (e) { /* ignore */ }

            // Expose API to set morph by name (0..1 normalized influence)
            window.mannequinAPI.setMorphByName = function(name, influence) {
                if (!morphMap[name]) return;
                const v = Math.max(0, Math.min(1, influence));
                // Apply to known entries first
                morphMap[name].forEach(entry => {
                    try {
                        entry.mesh.morphTargetInfluences[entry.index] = v;
                    } catch (e) { /* ignore individual failures */ }
                });
                // Also defensively apply to any mesh that may not have been included
                // in morphMap (e.g., nested clothing groups) by traversing the scene.
                try{
                    mannequin.traverse(child => {
                        if (!child || !child.isMesh) return;
                        try{
                            const dict = child.morphTargetDictionary || {};
                            if (dict && dict[name] !== undefined) {
                                const idx = dict[name];
                                child.morphTargetInfluences[idx] = v;
                            }
                        }catch(e){}
                    });
                }catch(e){}
            };

            // Measurement preset helper: adjust measurement sliders to reflect
            // a blended combination of influences. This is retained as a
            // helper (not a stored preference) and can be invoked by other
            // scripts to move sliders programmatically.
            function applyMeasurementPreset(shapeName) {
                const presets = {
                    'Triangle': {
                        'Shoulders': 0.2,
                        'Chest': 0.2,
                        'Waist': 0.5,
                        'Arms': 0.5,
                        'Torso': 0.2
                    },
                    'Curvy': {
                        'Shoulders': 0.2,
                        'Chest': 0.3,
                        'Waist': 0.5,
                        'Arms': 0.5,
                        'Torso': 0.2
                    },
                    'Slim': {
                        'Shoulders': 0.1,
                        'Chest': 0.1,
                        'Waist': 0.1,
                        'Arms': 0.1,
                        'Torso': 0.1
                    }
                };
                const coeffs = presets[shapeName];
                if (!coeffs) return;

                // For each morph target that has a slider, set the displayed measurement
                morphTargets.forEach(morphName => {
                    const sliderId = morphNameToId(morphName);
                    const slider = document.getElementById(sliderId);
                    const metricSelect = slider && slider.parentElement.querySelector('.metric-select');
                    const valueDisplay = slider && slider.parentElement.querySelector('.value-display');
                    if (!slider || !metricSelect || !valueDisplay) return;

                    const metric = metricSelect.value;
                    const range = metricRanges[sliderId] || { cm: [parseFloat(slider.min), parseFloat(slider.max)], inch: [parseFloat(slider.min), parseFloat(slider.max)] };
                    const [min, max] = range[metric];

                    const influence = (typeof coeffs[morphName] === 'number') ? coeffs[morphName] : null;
                    if (influence === null) return;

                    // Compute measurement from influence. For waist we invert measurement direction.
                    let measurement;
                    if (sliderId === 'waist') {
                        measurement = max - influence * (max - min);
                    } else {
                        measurement = min + influence * (max - min);
                    }
                    // clamp
                    measurement = Math.max(min, Math.min(max, measurement));

                    // compute internal slider value (measurementToSlider logic)
                    let internal = measurement;
                    if (sliderId === 'waist') internal = (min + max) - measurement;

                    // apply to DOM and update morph influence directly
                    try {
                        slider.value = internal;
                        // format display based on metric precision
                        const disp = (metric === 'cm') ? measurement.toFixed(2) : measurement.toFixed(1);
                        valueDisplay.value = disp;
                        // apply morph influence (use setMorphByName directly)
                        if (window.mannequinAPI && typeof window.mannequinAPI.setMorphByName === 'function') {
                            window.mannequinAPI.setMorphByName(morphName, influence);
                        }
                    } catch (e) { console.warn('applyMeasurementPreset failed for', morphName, e); }
                });
            }

            // expose the helper under a neutral name so other scripts can invoke it
            try { window.mannequinAPI.applyMeasurementPreset = applyMeasurementPreset; } catch (e) { /* ignore */ }

            // Helper: set morph using real-world metric value and range (min/max)
            window.mannequinAPI.setMorphByMetric = function(name, value, min, max) {
                if (typeof value !== 'number' || typeof min !== 'number' || typeof max !== 'number') return;
                const influence = (value - min) / (max - min);
                window.mannequinAPI.setMorphByName(name, influence);
            };

            window.mannequinAPI.getAvailableMorphs = function() {
                return Object.keys(morphMap);
            };

            window.mannequinAPI.listClothing = function() {
                const s = new Set();
                clothingNodes.forEach(n => s.add(n.name || '(unnamed)'));
                clothingMeshes.forEach(m => s.add(m.name || '(unnamed)'));
                return Array.from(s);
            };

            window.mannequinAPI.showClothing = function(meshName, show) {
                if (!meshName) return;
                const target = String(meshName || '');
                const targetLower = target.toLowerCase();
                let matched = false;

                // First pass: exact match (case-sensitive and case-insensitive)
                allNodes.forEach(n => {
                    if (!n.name) return;
                    try{
                        const nm = String(n.name);
                        if (nm === target || nm.toLowerCase() === targetLower) {
                            try { n.visible = !!show; } catch (e) {}
                            matched = true;
                        }
                    }catch(e){}
                });

                // Do not short-circuit here; even if an exact match succeeded,
                // also run substring/plural matching so variations are covered.

                // Second pass: substring match (case-insensitive) to handle naming differences
                allNodes.forEach(n => {
                    if (!n.name) return;
                    const nm = String(n.name).toLowerCase();
                    // skip obvious body parts
                    if (bodyRegex.test(nm)) return;
                    if (nm.indexOf(targetLower) !== -1) {
                        try { n.visible = !!show; matched = true; } catch (e) { /* ignore */ }
                    }
                    // try simple plural/singular variants (e.g., 'cap' vs 'caps')
                    if (!matched) {
                        if (targetLower.endsWith('s') && nm.indexOf(targetLower.slice(0, -1)) !== -1) {
                            try { n.visible = !!show; matched = true; } catch (e) {}
                        } else if (nm.endsWith('s') && nm.indexOf(targetLower + 's') !== -1) {
                            try { n.visible = !!show; matched = true; } catch (e) {}
                        }
                    }
                });
            };

            // Toggle visibility for clothing meshes by keyword (case-insensitive substring)
            // e.g. keyword: 'shirt' | 'cap' | 'pants' | 'shoe'
            window.mannequinAPI.showClothingByKeyword = function(keyword, show) {
                if (!keyword) return;
                const k = String(keyword).toLowerCase();
                allNodes.forEach(n => {
                    if (!n.name) return;
                    const name = String(n.name).toLowerCase();
                    // Only apply to nodes that look like clothing (skip mannequin/body parts)
                    if (bodyRegex.test(name)) return;
                    if (name.indexOf(k) !== -1) {
                        try { n.visible = !!show; } catch (e) { /* ignore individual failures */ }
                    }
                });
            };
            
            // Add color controls and a small API to recolor clothing items.
            // Developer can set `data-dominant-color` and `data-product-category`
            // attributes on the `#mannequinViewer` container or set global
            // `window.productDominantColor` / `window.productCategory`.

            // API: set clothing color by keyword (e.g., 'cap'|'pants'|'shoe'|'shirt')
            window.mannequinAPI.setClothingColor = function(category, hex) {
                if (!category || !hex) return;
                const k = String(category).toLowerCase();
                // apply to any node whose name contains the keyword (excluding body parts)
                allNodes.forEach(n => {
                    if (!n.name) return;
                    const name = String(n.name).toLowerCase();
                    if (bodyRegex.test(name)) return;
                    if (name.indexOf(k) !== -1) {
                        // if node is a group, traverse its children; if mesh, color directly
                        try {
                            n.traverse && n.traverse(child => {
                                if (!child.isMesh || !child.material) return;
                                try {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(mat => { if (mat && mat.color) mat.color.set(hex); });
                                    } else if (child.material && child.material.color) {
                                        child.material.color.set(hex);
                                    }
                                } catch (e) { /* ignore material set failures */ }
                            });
                        } catch (e) { /* ignore traversal errors */ }
                    }
                });
            };

            // Create a compact color panel in the top-left of the viewer
            // Minimal UI: only circular color swatches (no labels/inputs). Tooltips on hover.
            (function createColorPanel(){
                try{
                    // Only show the color controls on product pages
                    const isProductPage = (typeof window.location !== 'undefined' && window.location.pathname && window.location.pathname.indexOf('product.php') !== -1);
                    if (!isProductPage) return;
                    const panel = document.createElement('div');
                    panel.id = 'mannequinColorPanel';
                    panel.style.position = 'absolute';
                    panel.style.left = '8px';
                    panel.style.top = '8px';
                    panel.style.zIndex = 999;
                    panel.style.display = 'flex';
                    panel.style.flexDirection = 'column';
                    panel.style.gap = '8px';
                    panel.style.background = 'transparent';
                    panel.style.padding = '4px';

                    function makeSwatch(key, title){
                        // Create a circular color input styled similar to skin-tone swatches
                        const wrapper = document.createElement('div');
                        const sw = document.createElement('input');
                        sw.type = 'color';
                        sw.dataset.key = key;
                        // match account skin wheel: inner color input smaller and circular
                        sw.style.width = '28px';
                        sw.style.height = '28px';
                        sw.style.border = 'none';
                        sw.style.borderRadius = '50%';
                        sw.style.padding = '0';
                        sw.style.background = 'transparent';
                        sw.style.cursor = 'pointer';
                        sw.style.boxShadow = 'inset 0 -2px 0 rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.12)';
                        sw.style.appearance = 'none';

                        // create immediate tooltip that appears on mouseenter
                        const tip = document.createElement('div');
                        tip.textContent = title;
                        tip.style.position = 'absolute';
                        tip.style.left = '50%';
                        tip.style.transform = 'translateX(-25%)';
                        tip.style.top = '44px';
                        tip.style.padding = '6px 8px';
                        tip.style.background = 'rgba(0,0,0,0.8)';
                        tip.style.color = '#fff';
                        tip.style.fontSize = '12px';
                        tip.style.borderRadius = '4px';
                        tip.style.whiteSpace = 'nowrap';
                        tip.style.pointerEvents = 'none';
                        tip.style.opacity = '0';
                        tip.style.transition = 'opacity 120ms ease';

                        wrapper.appendChild(sw);
                        wrapper.appendChild(tip);

                        // show tooltip immediately on enter, hide on leave
                        wrapper.addEventListener('mouseenter', ()=>{ tip.style.opacity = '1'; });
                        wrapper.addEventListener('mouseleave', ()=>{ tip.style.opacity = '0'; });

                        sw.addEventListener('input', ()=>{ window.mannequinAPI.setClothingColor(key, sw.value); });
                        // expose reference to tooltip for potential future use
                        sw._tooltip = tip;
                        sw._wrapper = wrapper;
                        return sw;
                    }

                    const shirtSw = makeSwatch('shirt', 'Shirt color');
                    const capSw = makeSwatch('cap', 'Caps color');
                    const pantsSw = makeSwatch('pants', 'Pants color');
                    const shoeSw = makeSwatch('shoe', 'Shoes color');

                    // generator button (bottom)
                    const genBtn = document.createElement('button');
                    genBtn.type = 'button';
                    genBtn.title = 'Suggest colors';
                    // use an inline SVG icon (magic wand) instead of an emoji
                    genBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2l-7 7"/><path d="M14 2l8 8"/><path d="M6 14l-4 4"/><path d="M2 14l4 4"/><path d="M9 11l6 6"/></svg>';
                    genBtn.style.width = '36px';
                    genBtn.style.height = '36px';
                    genBtn.style.borderRadius = '6px';
                    genBtn.style.border = 'none';
                    genBtn.style.cursor = 'pointer';
                    genBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
                    genBtn.style.fontSize = '16px';

                    // append wrappers if available so swatches use consistent button sizing
                    [shirtSw, capSw, pantsSw, shoeSw].forEach(s => {
                        try{
                            const node = (s && s._wrapper) ? s._wrapper : s;
                            // apply the same class used by other canvas buttons so size matches
                            if (node && node.classList) node.classList.add('mannequin-toggle-btn');
                            // ensure wrapper sizing consistent with toggle buttons; inner input remains circular
                            if (s && s.style) { s.style.width = '28px'; s.style.height = '28px'; }
                            panel.appendChild(node);
                        }catch(e){ try{ panel.appendChild(s); }catch(_){} }
                    });
                    // generator button also uses same sizing
                    genBtn.classList.add('mannequin-toggle-btn');
                    panel.appendChild(genBtn);

                    // AI button placed below the generator (placeholder for future AI features)
                    const aiBtn = document.createElement('button');
                    aiBtn.type = 'button';
                    aiBtn.title = 'AI assistant (placeholder)';
                    aiBtn.innerHTML = 'AI';
                    aiBtn.style.width = '36px';
                    aiBtn.style.height = '36px';
                    aiBtn.style.border = 'none';
                    aiBtn.style.borderRadius = '6px';
                    aiBtn.style.cursor = 'pointer';
                    aiBtn.classList.add('mannequin-toggle-btn');
                    aiBtn.id = 'mannequin-ai-btn';
                    // small click handler stub
                    aiBtn.addEventListener('click', ()=>{
                        try{ if (typeof showNotification === 'function') showNotification('AI feature coming soon', 'info'); else console.log('AI feature coming soon'); }catch(e){}
                    });
                    panel.appendChild(aiBtn);

                    // initialize colors from container dataset, per-product map, or global defaults
                    const dominant = (container && container.dataset && container.dataset.dominantColor) || window.productDominantColor || '#1976d2';
                    const category = (container && container.dataset && container.dataset.productCategory) || window.productCategory || '';
                    const productId = (container && container.dataset && container.dataset.productId) || window.productId || null;

                    // If there's a per-product mapping provided by developer, prefer it
                    // Example: window.productColorMap = { '123': { shirt:'#fff', cap:'#000', pants:'#333', shoe:'#666' } }
                    let perColors = null;
                    try { if (window.productColorMap && productId && window.productColorMap[productId]) perColors = window.productColorMap[productId]; } catch(e){ perColors = null; }

                    function setInitial(swatch, key){
                        const c = (perColors && perColors[key]) ? perColors[key] : dominant;
                        try{ swatch.value = c; window.mannequinAPI.setClothingColor(key, c); }catch(e){}
                    }

                    // Apply category-based visibility rules:
                    // - If product category is 'shirt', hide shirt swatch (product color fixed by developer).
                    // - If product category is 'caps', hide cap swatch (developer will set cap color).
                    const cat = String(category || '').toLowerCase();
                    if (cat && cat.indexOf('shirt') !== -1) shirtSw.style.display = 'none';
                    if (cat && cat.indexOf('cap') !== -1) capSw.style.display = 'none';

                    setInitial(shirtSw, 'shirt');
                    setInitial(capSw, 'cap');
                    setInitial(pantsSw, 'pants');
                    setInitial(shoeSw, 'shoe');

                    // Palette generator: slightly smarter generator that picks between
                    // complementary/analogous/triadic strategies and tweaks lightness for contrast
                    function hexToHsl(hex){
                        hex = hex.replace('#','');
                        if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
                        const r = parseInt(hex.substr(0,2),16)/255;
                        const g = parseInt(hex.substr(2,2),16)/255;
                        const b = parseInt(hex.substr(4,2),16)/255;
                        const max = Math.max(r,g,b), min = Math.min(r,g,b);
                        let h=0, s=0, l=(max+min)/2;
                        if (max!==min){
                            const d = max-min;
                            s = l>0.5? d/(2-max-min) : d/(max+min);
                            switch(max){
                                case r: h = (g-b)/d + (g<b?6:0); break;
                                case g: h = (b-r)/d + 2; break;
                                case b: h = (r-g)/d + 4; break;
                            }
                            h /= 6;
                        }
                        return { h: h*360, s: s*100, l: l*100 };
                    }
                    function hslToHex(h,s,l){
                        s /= 100; l /= 100;
                        const k = n => (n + h/30) % 12;
                        const a = s * Math.min(l, 1 - l);
                        const f = n => {
                            const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
                            return Math.round(255 * color).toString(16).padStart(2, '0');
                        };
                        return `#${f(0)}${f(8)}${f(4)}`;
                    }

                    function generatePalette(baseHex){
                        try{
                            const hsl = hexToHsl(baseHex || dominant);
                            const strategies = ['analogous','complementary','triadic'];
                            const strat = strategies[Math.floor(Math.random()*strategies.length)];
                            let offsets;
                            if (strat === 'analogous') offsets = [0, 20, -20, 40];
                            else if (strat === 'triadic') offsets = [0, 120, 240, 180];
                            else offsets = [0, 180, 30, -30]; // complementary fallback

                            // produce colors with varied lightness for contrast
                            const lVariants = [hsl.l, Math.max(20, hsl.l - 12), Math.min(80, hsl.l + 8), Math.max(18, 50 - Math.abs(hsl.l-50))];
                            return offsets.map((off, idx) => {
                                const hh = (hsl.h + off + 360) % 360;
                                const ss = Math.min(100, Math.max(28, hsl.s + (idx===0?0: (idx%2?8:-8))));
                                const ll = Math.min(85, Math.max(12, lVariants[idx]));
                                return hslToHex(hh, ss, ll);
                            });
                        }catch(e){ return [dominant,dominant,dominant,dominant]; }
                    }

                    genBtn.addEventListener('click', ()=>{
                        // base color: dominant or shirt swatch current
                        const base = (shirtSw && shirtSw.value) || dominant;
                        const palette = generatePalette(base);
                        // assign generated colors to visible swatches only
                        const swatches = [shirtSw, capSw, pantsSw, shoeSw];
                        swatches.forEach((swi, idx)=>{
                            if (!swi || swi.style.display === 'none') return;
                            const hex = palette[idx % palette.length];
                            try{ swi.value = hex; window.mannequinAPI.setClothingColor(swi.dataset.key, hex); }catch(e){}
                        });
                    });

                    // attach panel
                    container.appendChild(panel);

                    // Pose buttons column (bottom-right) — single-letter labels
                    try{
                        const poseContainer = document.createElement('div');
                        poseContainer.style.position = 'absolute';
                        poseContainer.style.right = '10px';
                        poseContainer.style.bottom = '10px';
                        poseContainer.style.display = 'flex';
                        poseContainer.style.flexDirection = 'column';
                        poseContainer.style.gap = '8px';
                        poseContainer.style.zIndex = '998';
                        poseContainer.classList.add('mannequin-pose-column');

                        const poseLetter = {
                            "'T' Pose": 'T',
                            "'A' Pose": 'A',
                            "'W' Pose": 'W',
                            "'U' Pose": 'U'
                        };

                        POSE_SHAPES.forEach(poseName => {
                            const b = document.createElement('button');
                            b.type = 'button';
                            b.classList.add('pose-btn','mannequin-toggle-btn');
                            b.setAttribute('data-morph', poseName);
                            b.setAttribute('title', poseName);
                            b.textContent = poseLetter[poseName] || (poseName[0] || '?');
                            b.style.width = '40px';
                            b.style.height = '40px';
                            b.style.display = 'inline-flex';
                            b.style.alignItems = 'center';
                            b.style.justifyContent = 'center';
                            b.style.fontWeight = '600';
                            b.addEventListener('click', ()=>{
                                try{
                                    if (window.mannequinAPI && typeof window.mannequinAPI.setPose === 'function') window.mannequinAPI.setPose(poseName, POSE_SHAPES);
                                }catch(e){}
                                // reflect active state
                                document.querySelectorAll('.pose-btn').forEach(x=>{ try{ x.classList.remove('active'); x.setAttribute('aria-pressed','false'); }catch(e){} });
                                try{ b.classList.add('active'); b.setAttribute('aria-pressed','true'); }catch(e){}
                            });
                            poseContainer.appendChild(b);
                        });

                        // Append pose column to the viewer container
                        container.appendChild(poseContainer);

                        // Make default pose active (A) if present
                        setTimeout(()=>{
                            try{
                                const pbtn = document.querySelector(`.pose-btn[data-morph="'A' Pose"]`);
                                if (pbtn) { pbtn.classList.add('active'); pbtn.setAttribute('aria-pressed','true'); }
                            }catch(e){}
                        }, 50);
                    }catch(e){}
                }catch(e){ /* ignore UI creation failures */ }
            })();

            // Helper: convert morph name to slider id (lowercase, spaces/specials to dashes)
            function morphNameToId(name) {
                return name.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
            }

            // Accurate min/max for each metric (real world)
            // Keys match morphNameToId outputs for morph names: Shoulders->'shoulders', Arms->'arms', Torso->'torso'
            const metricRanges = {
                'shoulders': { cm: [44.00, 55.00], inch: [17.32, 21.65] },
                'chest':     { cm: [86.00, 120.00], inch: [33.86, 47.24] },
                // waist is inverted: larger slider value -> smaller measurement
                'waist':     { cm: [66.00, 100.00], inch: [25.98, 39.37] },
                'arms':      { cm: [25.00, 35.00], inch: [9.84, 13.78] },
                'torso':     { cm: [55.00, 70.00], inch: [21.65, 27.56] }
            };

            // For each morph target, set up slider/value-display/metric sync
            morphTargets.forEach((morphName) => {
                const sliderId = morphNameToId(morphName);
                const slider = document.getElementById(sliderId);
                const valueDisplay = slider && slider.parentElement.querySelector('.value-display');
                const metricSelect = slider && slider.parentElement.querySelector('.metric-select');
                if (!slider || !valueDisplay || !metricSelect) return;

                // If this morph name isn't present in any mesh, skip
                if (!morphMap[morphName]) return;

                // Helper: clamp and format
                function clamp(val, min, max) {
                    return Math.max(min, Math.min(max, val));
                }
                function format(val) {
                    const metric = getMetric();
                    if (metric === 'cm') return parseFloat(val).toFixed(2);
                    return parseFloat(val).toFixed(1);
                }

                // Get metric and min/max
                function getMetric() { return metricSelect.value; }
                function getMinMax() {
                    const metric = getMetric();
                    const range = metricRanges[sliderId] || { cm: [parseFloat(slider.min), parseFloat(slider.max)], inch: [parseFloat(slider.min), parseFloat(slider.max)] };
                    return range[metric];
                }

                // Helpers to map between internal slider value and displayed measurement.
                // For waist we invert the mapping so slider increase -> measurement decrease.
                function sliderToMeasurement(internalVal) {
                    const [min, max] = getMinMax();
                    const v = parseFloat(internalVal);
                    if (sliderId === 'waist') return (min + max) - v;
                    return v;
                }
                function measurementToSlider(measurement) {
                    const [min, max] = getMinMax();
                    const v = parseFloat(measurement);
                    if (sliderId === 'waist') return (min + max) - v;
                    return v;
                }

                // Set morph target influence across all meshes that have this morph name
                function setMorph(measurement) {
                    const [min, max] = getMinMax();
                    const val = parseFloat(measurement);
                    let influence;
                    // special-case waist: inverted mapping (slider up -> measurement down)
                    if (sliderId === 'waist') {
                        influence = (max - val) / (max - min);
                    } else {
                        influence = (val - min) / (max - min);
                    }
                    window.mannequinAPI.setMorphByName(morphName, clamp(influence, 0, 1));
                }

                // Sync valueDisplay with slider (live update)
                slider.addEventListener('input', () => {
                    const internal = parseFloat(slider.value);
                    const measured = sliderToMeasurement(internal);
                    let disp = format(measured);
                    valueDisplay.value = disp;
                    setMorph(parseFloat(measured));
                });

                // Only allow numbers in valueDisplay, but don't update slider until blur
                valueDisplay.addEventListener('input', () => {
                    let val = valueDisplay.value.replace(/[^0-9.]/g, '');
                    valueDisplay.value = val;
                });

                // On blur or Enter, validate and update
                function validateAndUpdate() {
                    let val = valueDisplay.value;
                    let num = parseFloat(val);
                    const [min, max] = getMinMax();
                    if (isNaN(num) || num < min || num > max) {
                        alert('Please enter a valid number between ' + min + ' and ' + max + '.');
                        const fallback = parseFloat(slider.min);
                        const sliderInternal = measurementToSlider(fallback);
                        valueDisplay.value = format(fallback);
                        slider.value = sliderInternal;
                        setMorph(fallback);
                    } else {
                        num = clamp(num, min, max);
                        valueDisplay.value = format(num);
                        // set internal slider value (invert for waist)
                        slider.value = measurementToSlider(num);
                        setMorph(num);
                    }
                }
                valueDisplay.addEventListener('blur', validateAndUpdate);
                valueDisplay.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        valueDisplay.blur();
                    }
                });

                // Metric change: update min/max/value
                // Keep track of current metric so we can convert display without
                // changing the internal slider value on metric switch.
                let __currentMetric = metricSelect.value;
                metricSelect.addEventListener('change', () => {
                    const oldMetric = __currentMetric || 'cm';
                    const newMetric = getMetric();
                    __currentMetric = newMetric;

                    // compute current measurement using the OLD metric's range BEFORE changing slider bounds
                    const oldRange = metricRanges[sliderId] ? (metricRanges[sliderId][oldMetric] || [parseFloat(slider.min), parseFloat(slider.max)]) : [parseFloat(slider.min), parseFloat(slider.max)];
                    let currentInternal = parseFloat(slider.value);
                    let currentMeasurement;
                    if (sliderId === 'waist') {
                        currentMeasurement = (oldRange[0] + oldRange[1]) - currentInternal;
                    } else {
                        currentMeasurement = currentInternal;
                    }

                    // update slider min/max/step to new metric ranges (do this after computing oldRange)
                    const newRange = metricRanges[sliderId] ? (metricRanges[sliderId][newMetric] || [parseFloat(slider.min), parseFloat(slider.max)]) : [parseFloat(slider.min), parseFloat(slider.max)];
                    slider.min = newRange[0];
                    slider.max = newRange[1];
                    slider.step = newMetric === 'cm' ? 0.01 : 0.1;

                    // convert measurement between units
                    let converted = currentMeasurement;
                    if (oldMetric === 'inch' && newMetric === 'cm') {
                        converted = currentMeasurement * 2.54;
                        converted = Math.round(converted * 100) / 100;
                    } else if (oldMetric === 'cm' && newMetric === 'inch') {
                        converted = currentMeasurement / 2.54;
                        converted = Math.round(converted * 10) / 10;
                    }

                    // clamp to newRange
                    converted = clamp(converted, newRange[0], newRange[1]);

                    // Update displayed measurement only — do not change slider.value
                    valueDisplay.value = format(converted);

                    // Apply morph based on converted measurement (so model remains consistent)
                    setMorph(converted);
                });

                // Initialize valueDisplay and morph (respect waist inversion)
                const initialInternal = parseFloat(slider.value);
                const initialMeasurement = sliderToMeasurement(initialInternal);
                valueDisplay.value = format(initialMeasurement);
                setMorph(parseFloat(initialMeasurement));
            });

            // Wire up morph/skin buttons now mannequin is loaded
            if (window._wireMorphButtons) window._wireMorphButtons();
            // Body-shape UI and click handlers removed by design.

            // Listen for external control events (dispatched by account tab script)
            window.addEventListener('mannequin.skin', (ev) => {
                const color = ev && ev.detail && ev.detail.color;
                if (color) window.mannequinAPI.setSkinTone(color);
            });
            window.addEventListener('mannequin.face', (ev) => {
                const morph = ev && ev.detail && ev.detail.morph;
                if (morph) window.mannequinAPI.setMorphExclusive(morph, FACE_SHAPES);
            });
            // Body-shape events removed; presets are invoked via
            // `window.mannequinAPI.applyMeasurementPreset(name)` if needed.
            window.addEventListener('mannequin.pose', (ev) => {
                const morph = ev && ev.detail && ev.detail.morph;
                if (morph) window.mannequinAPI.setPose(morph, POSE_SHAPES);
            });

            // Make default pose and body shape active: 'A' pose and 'Thin' (slim)
            try {
                // default pose
                if (window.mannequinAPI && typeof window.mannequinAPI.setPose === 'function') {
                    window.mannequinAPI.setPose("'A' Pose", POSE_SHAPES);
                    // reflect UI active state if buttons exist
                    const pbtn = document.querySelector(`.pose-btn[data-morph="'A' Pose"]`);
                    if (pbtn) { document.querySelectorAll('.pose-btn.active').forEach(b=>b.classList.remove('active')); pbtn.classList.add('active'); }
                }
                // NOTE: no default body-shape preset is enforced here. Measurement
                // presets are not applied automatically by the viewer; they may be
                // invoked by other scripts via `window.mannequinAPI.applyMeasurementPreset(name)`.
            } catch (e) { /* ignore */ }

            console.log('✅ Mannequin loaded');
                        // hide the loader overlay and reveal renderer
                        try{ loaderOverlay.style.display = 'none'; renderer.domElement.style.visibility = ''; }catch(e){}
            // Apply any existing DOM slider values to the model so the
            // mannequin reflects measurements immediately when loaded.
            function applyDomSlidersToModel(){
                try{
                    if (!window.mannequinAPI || typeof window.mannequinAPI.setMorphByMetric !== 'function') return;
                    const mapping = {
                        'shoulders': { morph: 'Shoulders', min: 44.00, max: 55.00 },
                        'chest':     { morph: 'Chest', min: 86.00, max: 120.00 },
                        'waist':     { morph: 'Waist', min: 66.00, max: 100.00 },
                        'arms':      { morph: 'Arms', min: 25.00, max: 35.00 },
                        'torso':     { morph: 'Torso', min: 55.00, max: 70.00 }
                    };
                    function readMetricFromSliderId(id){
                        const slider = document.getElementById(id);
                        if (!slider) return null;
                        const parent = slider.parentElement;
                        const metricSelect = parent ? parent.querySelector('.metric-select') : null;
                        const metric = metricSelect ? metricSelect.value : 'cm';
                        let v = parseFloat(slider.value);
                        if (isNaN(v)) return null;
                        if (metric === 'inch') v = v * 2.54;
                        return Math.round(v * 100) / 100;
                    }
                    Object.keys(mapping).forEach(id => {
                        const cfg = mapping[id];
                        const val = readMetricFromSliderId(id);
                        if (val === null) return;
                        try{ window.mannequinAPI.setMorphByMetric(cfg.morph, Number(val), cfg.min, cfg.max); } catch(e){}
                    });
                }catch(e){ /* ignore */ }
            }

            // run once immediately to pick up DOM slider state
            try { applyDomSlidersToModel(); } catch(e){}

            // --- Size selection integration ---
            // When a size is selected on the product page we want to apply
            // corresponding clothing morphs (size-prefixed morph names)
            // while preserving the current body-measurement morph influences.
            function normalizeKey(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }

            function getCurrentInfluenceFor(morphName){
                const entries = morphMap[morphName];
                if (!entries || entries.length===0) return 0;
                // Prefer a non-clothing mesh (the actual mannequin body) when
                // reading the current influence so we don't pick up clothing
                // morph influences. Fall back to the first available entry.
                try {
                    for (const e of entries) {
                        if (!clothingMeshes || clothingMeshes.indexOf(e.mesh) === -1) {
                            return e.mesh.morphTargetInfluences[e.index] || 0;
                        }
                    }
                    return entries[0].mesh.morphTargetInfluences[entries[0].index] || 0;
                } catch (e) { return 0; }
            }

            function applySizeToModel(sizeName){
                if (!sizeName) return;
                // sizeName might be a string (e.g. 'M') or an object returned
                // by other components (e.g. {sizeName:'M', sizeNorm:'m', sizeToken:'m'})
                // Accept both forms and pick the most useful token.
                let sizeInput = sizeName;
                if (typeof sizeInput === 'object' && sizeInput !== null) {
                    sizeInput = sizeInput.sizeToken || sizeInput.sizeNorm || sizeInput.sizeName || sizeInput.name || '';
                }
                const sizeNorm = normalizeKey(sizeInput);
                // remember current selected size for pose syncing
                try{ currentSelectedSizeNorm = sizeNorm; }catch(e){}
                // helpful debug when shapes not found for selected size
                try{ console.debug('[size apply] input=', sizeName, 'token=', sizeInput, 'norm=', sizeNorm); }catch(e){}
                const keys = ['Shoulders','Arms','Chest','Waist','Torso'];

                // For each measurement morph, find all morph keys that correspond
                // (including prefixed variants) and set the clothing variant for
                // the chosen size to the body's current influence while zeroing
                // other size variants in the same group.
                keys.forEach(base => {
                    const baseNorm = normalizeKey(base);
                    // gather candidate morph keys from morphMap
                    const candidates = Object.keys(morphMap).filter(k => normalizeKey(k).includes(baseNorm));
                    if (candidates.length===0) return;


                    // current body influence (read from base morph if present)
                    const currentInfluence = getCurrentInfluenceFor(base);

                    // Per-mesh measurement fallback:
                    // If a clothing mesh exposes the plain base morph but does not
                    // expose any size-prefixed variants for the currently selected
                    // size, copy the body's current influence onto that mesh so it
                    // follows the mannequin even when no S-/M-/L- variants exist.
                    try{
                        // collect meshes that have any size-pref candidate for this size
                        const sizePrefMeshes = new Set();
                        if (sizeNorm && candidates && candidates.length) {
                            candidates.forEach(cand => {
                                try{
                                    if (!normalizeKey(cand).startsWith(sizeNorm)) return;
                                    const ents = morphMap[cand] || [];
                                    ents.forEach(en => { try{ sizePrefMeshes.add(en.mesh); }catch(e){} });
                                }catch(e){}
                            });
                        }

                        // apply fallback to base entries on clothing meshes that don't
                        // have a size-pref entry for the selected size
                        const baseEntries = morphMap[base] || [];
                        baseEntries.forEach(entry => {
                            try{
                                if (!clothingMeshes || clothingMeshes.indexOf(entry.mesh) === -1) return;
                                if (specialClothingMeshes && specialClothingMeshes.has(entry.mesh)) return; // already handled
                                if (!sizePrefMeshes.has(entry.mesh)) {
                                    // copy body's influence into this mesh's base morph
                                    entry.mesh.morphTargetInfluences[entry.index] = currentInfluence;
                                }
                            }catch(e){}
                        });
                    }catch(e){}

                    // For special clothing meshes (caps/pants/shoes) that only
                    // expose the base morph name (no size-prefixed variants),
                    // copy the body's current influence directly so they follow
                    // the mannequin instead of trying to find S-/M-/L- variants.
                    if (morphMap[base]) {
                        morphMap[base].forEach(entry => {
                            try{
                                if (specialClothingMeshes.has(entry.mesh)) {
                                    entry.mesh.morphTargetInfluences[entry.index] = currentInfluence;
                                }
                            }catch(e){}
                        });
                    }

                    // Determine which candidate is the size-specific key to set.
                    // Prefer candidates that start with the size token (e.g. 'sshoulders' for 'S-Shoulders')
                    let chosen = null;
                    for (const cand of candidates){
                        const n = normalizeKey(cand);
                        if (sizeNorm && n.startsWith(sizeNorm)) { chosen = cand; break; }
                    }
                    // fallback: if size looks like 'XS' we prefer the base (no-prefix)
                    if (!chosen){
                        // try exact base name
                        for (const cand of candidates){ if (normalizeKey(cand)===baseNorm){ chosen = cand; break; } }
                    }
                    // final fallback to first candidate
                    if (!chosen) chosen = candidates[0];

                    // apply influences: set chosen to currentInfluence, others to 0
                    // Only modify clothing meshes: do not change the mannequin's
                    // body morphs or pose here.
                    candidates.forEach(cand => {
                        const entries = morphMap[cand] || [];
                        entries.forEach(entry => {
                            try {
                                // only touch clothing meshes
                                if (!clothingMeshes || clothingMeshes.indexOf(entry.mesh) === -1) return;
                                // Skip meshes that are in the special set: they follow
                                // the body directly and were updated above.
                                if (specialClothingMeshes.has(entry.mesh)) return;
                                entry.mesh.morphTargetInfluences[entry.index] = (cand === chosen) ? currentInfluence : 0;
                            } catch (e) { /* ignore */ }
                        });
                    });
                });

                // Handle pose shapes: match the mannequin's active body pose and
                // apply the corresponding size-prefixed clothing pose variant.
                try{
                    // Determine which base pose is currently active on the body
                    function getActiveBodyPose(){
                        let bestPose = null;
                        let bestVal = 0;
                        POSE_SHAPES.forEach(poseName => {
                            // read influence from body (prefer non-clothing mesh)
                            const val = getCurrentInfluenceFor(poseName);
                            if (val > bestVal) { bestVal = val; bestPose = poseName; }
                        });
                        return { pose: bestPose, influence: bestVal };
                    }

                    const active = getActiveBodyPose();
                    const activeBase = active.pose; // may be null
                    const activeInfluence = active.influence || 0;

                    // For each base pose, we only need to set clothing to match the
                    // active base pose; other clothing pose variants should be zeroed.
                    POSE_SHAPES.forEach(poseName => {
                        const pNorm = normalizeKey(poseName);
                        // Derive a single-letter token for pose (T/A/W/U)
                        const poseLetterMatch = (String(poseName).match(/[TAWU]/i) || []);
                        const poseLetter = (poseLetterMatch[0] || '').toLowerCase();

                        // Build candidates more robustly: prefer keys that include
                        // the full pose name, but also accept variants like "M-W",
                        // "M-W Pose", "W-Pose" etc. Avoid matching unrelated words
                        // like 'waist' by requiring a non-alphanumeric boundary.
                        const candidates = Object.keys(morphMap).filter(k => {
                            try{
                                const kl = String(k).toLowerCase();
                                if (kl.indexOf(String(poseName).toLowerCase()) !== -1) return true;
                                if (!poseLetter) return false;
                                const re = new RegExp('(^|[^a-z0-9])' + poseLetter + '([^a-z0-9]|pose|$)', 'i');
                                return re.test(kl);
                            }catch(e){ return false; }
                        });
                        if (candidates.length===0) return;

                        // For special clothing meshes that expose the base pose
                        // morph directly (no size prefixes), copy the body's
                        // active pose influence so they follow the mannequin.
                        if (activeBase && normalizeKey(activeBase) === pNorm && morphMap[poseName]) {
                            morphMap[poseName].forEach(entry => {
                                try{
                                    if (specialClothingMeshes.has(entry.mesh)) {
                                        entry.mesh.morphTargetInfluences[entry.index] = activeInfluence;
                                    }
                                }catch(e){}
                            });
                        }

                        // choose the clothing morph to enable for this base pose
                        let chosen = null;
                        if (activeBase && normalizeKey(activeBase) === pNorm) {
                            // debug info about candidates
                            const candInfo = candidates.map(c=> ({raw:c, norm: normalizeKey(c)}));
                            try{ console.debug('[pose match] sizeNorm=%s pNorm=%s candidates=%o', sizeNorm, pNorm, candInfo); }catch(e){}

                            // prefer size-prefixed candidate that also includes the base pose
                            // prefer size-prefixed candidate that also contains the pose
                            chosen = candidates.find(c=> sizeNorm && normalizeKey(c).startsWith(sizeNorm) && (normalizeKey(c).includes(pNorm) || normalizeKey(c).includes(poseLetter)));
                            // fallback: any size-prefixed candidate
                            if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).startsWith(sizeNorm));
                            // broaden fallback: size token may be embedded, accept that
                            if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).includes(sizeNorm) && (normalizeKey(c).includes(pNorm) || normalizeKey(c).includes(poseLetter)));
                            if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).includes(sizeNorm));
                            // fallback to exact base candidate or first candidate
                            if (!chosen) chosen = candidates.find(c=> normalizeKey(c)===pNorm) || candidates[0];
                            try{ console.debug('[pose match result] chosen=%o', chosen); }catch(e){}
                        } else {
                            // not the active pose: ensure clothing variants for this
                            // base are zeroed (do not enable)
                            chosen = null;
                        }

                        // debug: show which candidate we will apply for this pose
                        try{ console.debug('[pose apply] %s Pose candidates=%o chosen=%o active=%s', poseName, candidates, chosen, activeBase && normalizeKey(activeBase)===pNorm); }catch(e){}

                        // apply: set chosen to activeInfluence (if chosen), others to 0
                        candidates.forEach(cand=>{
                            const entries = morphMap[cand]||[];
                            entries.forEach(entry=>{
                                try{
                                    if (!clothingMeshes || clothingMeshes.indexOf(entry.mesh) === -1) return;
                                    // Skip special meshes: they were already handled above
                                    if (specialClothingMeshes.has(entry.mesh)) return;
                                    if (chosen && cand === chosen) {
                                        entry.mesh.morphTargetInfluences[entry.index] = activeInfluence;
                                    } else {
                                        entry.mesh.morphTargetInfluences[entry.index] = 0;
                                    }
                                }catch(e){}
                            });
                        });
                    });
                }catch(e){ /* ignore pose mapping errors */ }

                // ensure clothing pose variants are synced to the body's active pose
                try{ applyClothingPoseForActiveBodyPose(sizeNorm); }catch(e){}
                // ensure special clothing meshes mirror body morphs (measurements + poses)
                try{ copyBodyToSpecialClothing(); }catch(e){}
            }

            // --- Debug console reporter ---
            // Prints a detailed report to the browser console about active
            // morph influences, chosen clothing candidates for the given size,
            // and a short explanation of any mismatches.
            function collectActiveMorphInfo(){
                const out = [];
                try{
                    Object.keys(morphMap).forEach(name => {
                        const entries = morphMap[name] || [];
                        let bodyMax = 0, clothMax = 0;
                        const meshes = [];
                        entries.forEach(en => {
                            try{
                                const v = (en.mesh && en.mesh.morphTargetInfluences) ? (en.mesh.morphTargetInfluences[en.index] || 0) : 0;
                                meshes.push({ meshName: en.mesh && en.mesh.name, v, isClothing: clothingMeshes && clothingMeshes.indexOf(en.mesh) !== -1 });
                                if (clothingMeshes && clothingMeshes.indexOf(en.mesh) !== -1) clothMax = Math.max(clothMax, v); else bodyMax = Math.max(bodyMax, v);
                            }catch(e){}
                        });
                        out.push({ name, body: bodyMax, cloth: clothMax, meshes });
                    });
                }catch(e){}
                out.sort((a,b) => Math.max(b.body,b.cloth) - Math.max(a.body,a.cloth));
                return out;
            }

            function debugConsoleReport(sizeName){
                try{
                    const sizeInput = (typeof sizeName === 'object' && sizeName !== null) ? (sizeName.sizeToken || sizeName.sizeNorm || sizeName.sizeName || sizeName.name || '') : String(sizeName || '');
                    const sizeNorm = normalizeKey(sizeInput);
                    console.groupCollapsed('Mannequin Debug Report — size="' + sizeInput + '"');

                    // Summary of active morphs
                    const info = collectActiveMorphInfo();
                    console.log('Active morphs (body / cloth):');
                    info.slice(0, 50).forEach(i => {
                        if ((i.body||0) < 0.0005 && (i.cloth||0) < 0.0005) return;
                        console.log('%c%s%c  body:%s  cloth:%s', 'color:#9cdcfe', i.name, 'color:inherit', (i.body||0).toFixed(3), (i.cloth||0).toFixed(3));
                    });

                    // For each measurement base, show candidate selection
                    const bases = ['Shoulders','Arms','Chest','Waist','Torso'];
                    console.log('');
                    console.log('Measurement candidate selection for size token:', sizeNorm || '(none)');
                    bases.forEach(base => {
                        const baseNorm = normalizeKey(base);
                        const candidates = Object.keys(morphMap).filter(k => normalizeKey(k).includes(baseNorm));
                        const currentBody = getCurrentInfluenceFor(base);
                        // choose candidate same logic as applySizeToModel
                        let chosen = null;
                        for (const cand of candidates){ if (sizeNorm && normalizeKey(cand).startsWith(sizeNorm)) { chosen = cand; break; } }
                        if (!chosen){ for (const cand of candidates){ if (normalizeKey(cand)===baseNorm){ chosen = cand; break; } } }
                        if (!chosen) chosen = candidates[0];

                        const candInfo = (chosen && morphMap[chosen]) ? morphMap[chosen].map(e=>({mesh: e.mesh && e.mesh.name, v: (e.mesh && e.mesh.morphTargetInfluences) ? (e.mesh.morphTargetInfluences[e.index]||0) : 0, isCloth: (clothingMeshes && clothingMeshes.indexOf(e.mesh)!==-1)})) : [];
                        console.groupCollapsed(base + ' — body:' + currentBody.toFixed(3) + ' chosen:' + (chosen||'(none)'));
                        console.log('Candidates:', candidates);
                        console.log('Chosen candidate entries:', candInfo);
                        // if chosen is clothing-only, flag it
                        if (chosen && candInfo.length && candInfo.every(ci=>ci.isCloth)){
                            console.warn('Chosen candidate appears to be clothing-only. That means clothing may be the only place that morph exists; body influence should be read from body morphs (unprefixed) instead.');
                        }
                        console.groupEnd();
                    });

                    // Pose mapping
                    console.log('');
                    console.log('Pose mapping:');
                    let bestPose = null, bestVal = 0;
                    POSE_SHAPES.forEach(poseName => { const v = getCurrentInfluenceFor(poseName); if (v>bestVal){bestVal=v;bestPose=poseName;} });
                    console.log('Active body pose (detected):', bestPose, 'val=', bestVal.toFixed(3));
                    if (bestPose){
                        const pNorm = normalizeKey(bestPose);
                        const poseLetterMatch = (String(bestPose).match(/[TAWU]/i) || []);
                        const poseLetter = (poseLetterMatch[0] || '').toLowerCase();
                        const candidates = Object.keys(morphMap).filter(k => {
                            try{
                                const kl = String(k).toLowerCase();
                                if (kl.indexOf(String(bestPose).toLowerCase()) !== -1) return true;
                                if (!poseLetter) return false;
                                const re = new RegExp('(^|[^a-z0-9])' + poseLetter + '([^a-z0-9]|pose|$)', 'i');
                                return re.test(kl);
                            }catch(e){ return false; }
                        });
                        let chosen = candidates.find(c=> sizeNorm && normalizeKey(c).startsWith(sizeNorm) && (normalizeKey(c).includes(pNorm) || normalizeKey(c).includes(poseLetter)));
                        if (!chosen) chosen = candidates.find(c=> sizeNorm && normalizeKey(c).startsWith(sizeNorm));
                        if (!chosen) chosen = candidates.find(c=> normalizeKey(c).includes(pNorm) || (poseLetter && normalizeKey(c).includes(poseLetter)));
                        if (!chosen) chosen = candidates[0];
                        console.log('Pose candidates for clothing:', candidates);
                        console.log('Chosen clothing pose candidate:', chosen);
                    }

                    // Explanation section
                    console.log('');
                    console.log('%cExplanation:', 'font-weight:700;color:#ffd580');
                    console.log('If a size-prefixed morph exists only on clothing meshes (not on body meshes), reading that morph as the "current" influence can make clothing appear to drive the model rather than follow the body.');
                    console.log('Best practice: the source of truth for body measurements/pose should be the non-clothing (body) meshes. If the body only exposes unprefixed morphs (e.g., "\'A\' Pose"), but clothing exposes prefixed variants (e.g., "M-A"), the viewer should read the body morph and then apply that value to the clothing prefixed morphs.');
                    console.log('In short: clothing-only sized morphs are not authoritative; the body morphs are. Use this report to find clothing-only candidates and adjust your GLB export or the mapping logic accordingly.');

                    console.groupEnd();
                }catch(e){ console.error('debugConsoleReport failed', e); }
            }

            // expose debug reporter to global API for convenience
            try{ window.mannequinAPI.debugConsoleReport = debugConsoleReport; }catch(e){}

            // Wire up page-level size input and clickable options (product page)
            function wireSizeListeners(){
                try{
                    const sizeInput = document.getElementById('size-select');
                    if (sizeInput){
                        sizeInput.addEventListener('change', ()=>{ applySizeToModel(sizeInput.value); try{ window.mannequinAPI.debugConsoleReport(sizeInput.value); }catch(e){} });
                        sizeInput.addEventListener('input', ()=>{ applySizeToModel(sizeInput.value); try{ window.mannequinAPI.debugConsoleReport(sizeInput.value); }catch(e){} });
                    }

                    document.querySelectorAll('.size-option').forEach(el=>{
                        el.addEventListener('click', ()=>{
                            const sz = el.getAttribute('data-size') || el.textContent.trim();
                            applySizeToModel(sz);
                            try{ window.mannequinAPI.debugConsoleReport(sz); }catch(e){}
                        });
                    });

                    // If SizeManager is present, wrap its select function so we get called
                    if (window.SizeManager && typeof window.SizeManager.selectSize === 'function'){
                        const orig = window.SizeManager.selectSize.bind(window.SizeManager);
                        window.SizeManager.selectSize = function(sz){ try{ const r = orig(sz); applySizeToModel(sz); return r;}catch(e){ return orig(sz);} };
                    }
                }catch(e){ /* ignore wiring failures */ }
            }

            // Apply any current page selection (if a size was chosen before viewer loaded)
            try{
                // prefer window.currentSize (size-manager) then hidden input
                const cur = window.currentSize || (window.SizeManager && typeof window.SizeManager.getCurrentSize === 'function' && window.SizeManager.getCurrentSize()) || null;
                if (cur) applySizeToModel(cur);
                const sizeInput = document.getElementById('size-select');
                if (!cur && sizeInput && sizeInput.value) applySizeToModel(sizeInput.value);
                // wire listeners for future changes
                wireSizeListeners();
            }catch(e){ /* ignore */ }

            try {
                window.dispatchEvent(new Event('mannequin.ready'));
            } catch (e) { /* ignore */ }
        },
        undefined,
        (err) => {
            console.error('❌ Error loading mannequin:', err);
            try{ loaderOverlay.style.display = 'none'; renderer.domElement.style.visibility = ''; }catch(e){}
        }
    );

    // === Animate ===
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // === Handle Resize ===
    window.addEventListener("resize", () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initViewer);
} else {
    initViewer();
}
