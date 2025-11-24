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
const BODY_SHAPES = [
    'Triangle',
    'Slim',
    'Curvy'
];
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

// Expose a tiny API so other scripts can control the mannequin without peeking into internals
window.mannequinAPI = {
    setSkinTone(color) {
        if (!window.mannequin) return;
        // Only apply skin tone to body/skin meshes, not clothing meshes
        window.mannequin.traverse(child => {
            if (!child.isMesh || !child.material) return;
            const name = (child.name || '').toLowerCase();
            // skip common clothing keywords
            if (/shirt|jacket|coat|pants|skirt|jean|jeans|top|garment|cap|hat|shoe|sock|sneaker/i.test(name)) return;
            // apply color if material supports it
            try { if (child.material && child.material.color) child.material.color.set(color); } catch (e) { /* ignore */ }
        });
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

        // Body shape buttons
        BODY_SHAPES.forEach(shape => {
            const btn = document.querySelector(`.bodyshape-btn[data-morph="${shape}"]`);
            if (btn) {
                btn.onclick = () => window.mannequinAPI.setMorphExclusive(shape, BODY_SHAPES);
            }
        });

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

    // === Renderer ===
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding; // ✅ proper color brightness
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
    camera.position.set(0, 1.6, 4);

    // === Lights ===
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(3, 10, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

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
        'new4.glb',
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
            mannequin.traverse((child) => {
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

                // Reflect selection in the UI if body/face buttons exist, and
                // apply any named presets (e.g. Triangle/Curvy) so sliders update
                try {
                    if (BODY_SHAPES.indexOf(morphName) !== -1) {
                        document.querySelectorAll('.bodyshape-btn.active').forEach(b => b.classList.remove('active'));
                        const bbtn = document.querySelector(`.bodyshape-btn[data-morph="${morphName}"]`);
                        if (bbtn) bbtn.classList.add('active');
                        // apply preset adjustments only when explicitly requested
                        // (e.g. by a direct user click). applyPreset is truthy only
                        // when the click handler passes it.
                        if (applyPreset && (morphName === 'Triangle' || morphName === 'Curvy' || morphName === 'Slim')) {
                            try { applyBodyShapePreset(morphName); } catch (e) { /* ignore */ }
                        }
                    }
                    if (FACE_SHAPES.indexOf(morphName) !== -1) {
                        document.querySelectorAll('.face-btn.active').forEach(b => b.classList.remove('active'));
                        const fbtn = document.querySelector(`.face-btn[data-morph="${morphName}"]`);
                        if (fbtn) fbtn.classList.add('active');
                    }
                } catch (e) { /* ignore UI sync failures */ }
            };

            window.mannequinAPI.setPose = function(morphName, poseShapes) {
                // Apply pose shapes across all meshes that contain those morphs.
                morphMeshes.forEach(mesh => {
                    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
                    poseShapes.forEach(key => {
                        const idx = mesh.morphTargetDictionary[key];
                        if (idx !== undefined) {
                            try { mesh.morphTargetInfluences[idx] = (key === morphName) ? 1 : 0; } catch (e) { /* ignore */ }
                        }
                    });
                });
            };

            // Heuristic: clothing meshes are those with common clothing keywords in their name
            const clothingMeshes = morphMeshes.filter(m => /shirt|jacket|coat|pants|skirt|jeans|top|garment|clothe/i.test(m.name) && !/mannequin|body|torso|head/i.test(m.name));

            // Expose API to set morph by name (0..1 normalized influence)
            window.mannequinAPI.setMorphByName = function(name, influence) {
                if (!morphMap[name]) return;
                const v = Math.max(0, Math.min(1, influence));
                morphMap[name].forEach(entry => {
                    try {
                        entry.mesh.morphTargetInfluences[entry.index] = v;
                    } catch (e) { /* ignore individual failures */ }
                });
            };

            // Apply body-shape presets: when a body shape is selected, adjust measurement
            // sliders to reflect a blended combination of morph influences.
            function applyBodyShapePreset(shapeName) {
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
                    } catch (e) { console.warn('applyBodyShapePreset failed for', morphName, e); }
                });
            }

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
                return clothingMeshes.map(m => m.name || '(unnamed)');
            };

            window.mannequinAPI.showClothing = function(meshName, show) {
                // Toggle visibility for meshes matching the exact meshName
                morphMeshes.forEach(m => {
                    if (!m.name) return;
                    if (m.name === meshName) m.visible = !!show;
                });
            };

            // Toggle visibility for clothing meshes by keyword (case-insensitive substring)
            // e.g. keyword: 'shirt' | 'cap' | 'pants' | 'shoe'
            window.mannequinAPI.showClothingByKeyword = function(keyword, show) {
                if (!keyword) return;
                const k = String(keyword).toLowerCase();
                morphMeshes.forEach(m => {
                    if (!m.name) return;
                    const name = String(m.name).toLowerCase();
                    // Only apply to meshes that look like clothing (skip mannequin/body parts)
                    if (/mannequin|body|torso|head|skin|eye|teeth/i.test(name)) return;
                    if (name.indexOf(k) !== -1) {
                        try { m.visible = !!show; } catch (e) { /* ignore individual failures */ }
                    }
                });
            };

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
                metricSelect.addEventListener('change', () => {
                    const newMetric = getMetric();
                    const [min, max] = getMinMax();
                    // set slider min/max to measurement range
                    slider.min = min;
                    slider.max = max;
                    slider.step = newMetric === 'cm' ? 0.01 : 0.1;

                    // Read current measurement from internal slider value
                    const currentInternal = parseFloat(slider.value);
                    const currentMeasurement = sliderToMeasurement(currentInternal);

                    // Convert currentMeasurement to the newly selected metric
                    let converted = currentMeasurement;
                    if (newMetric === 'cm') {
                        // convert inches -> cm
                        converted = currentMeasurement * 2.54;
                        converted = Math.round(converted * 100) / 100;
                    } else {
                        // convert cm -> inches
                        converted = currentMeasurement / 2.54;
                        converted = Math.round(converted * 10) / 10;
                    }

                    // Clamp to new range
                    converted = clamp(converted, min, max);

                    // Update internal slider and displayed value without resetting to 0
                    slider.value = measurementToSlider(converted);
                    valueDisplay.value = format(converted);
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
            // Ensure body-shape buttons apply presets only when clicked by the user.
            // Replace their handlers so they pass an explicit "applyPreset" flag
            // to `setMorphExclusive` (third argument). This prevents programmatic
            // calls (saved shapes) from forcing preset slider changes.
            try {
                document.querySelectorAll('.bodyshape-btn').forEach(btn => {
                    const morph = btn.getAttribute && btn.getAttribute('data-morph');
                    if (!morph) return;
                    btn.onclick = () => {
                        if (window.mannequinAPI && typeof window.mannequinAPI.setMorphExclusive === 'function') {
                            window.mannequinAPI.setMorphExclusive(morph, BODY_SHAPES, true);
                        }
                    };
                });
            } catch (e) { /* ignore if DOM not present */ }

            // Listen for external control events (dispatched by account tab script)
            window.addEventListener('mannequin.skin', (ev) => {
                const color = ev && ev.detail && ev.detail.color;
                if (color) window.mannequinAPI.setSkinTone(color);
            });
            window.addEventListener('mannequin.face', (ev) => {
                const morph = ev && ev.detail && ev.detail.morph;
                if (morph) window.mannequinAPI.setMorphExclusive(morph, FACE_SHAPES);
            });
            window.addEventListener('mannequin.shape', (ev) => {
                const morph = ev && ev.detail && ev.detail.morph;
                if (!morph) return;
                // apply the morph across meshes
                // Do NOT auto-apply presets here. Saved/programmatic shape application
                // should set morphs only; presets (slider adjustments) are applied only
                // when the user explicitly clicks a body-shape button.
                window.mannequinAPI.setMorphExclusive(morph, BODY_SHAPES);
            });
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
                // NOTE: no default body shape is enforced here. Saved body shape (if any)
                // will be applied by calling code (e.g. product.js) which uses
                // `window.mannequinAPI.setMorphExclusive(saved.body_shape, [...])`.
            } catch (e) { /* ignore */ }

            console.log('✅ Mannequin loaded');
            try {
                window.dispatchEvent(new Event('mannequin.ready'));
            } catch (e) { /* ignore */ }
        },
        undefined,
        (err) => console.error('❌ Error loading mannequin:', err)
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
