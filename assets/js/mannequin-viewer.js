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
    'Triangle Body',
    'Straight Body',
    'Curvy Body',
    'Body (to Fat)',
    'Thin'
];
const POSE_SHAPES = [
    "'T' Pose",
    "'A' Pose",
    "'Hi' Pose",
    "'Peace' Pose",
    'Sitting'
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
        window.mannequin.traverse(child => {
            if (child.isMesh && child.material && child.material.color) {
                child.material.color.set(color);
            }
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
    scene.background = new THREE.Color(0xf2f2f2);

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
        'mannequin10.glb',
        (gltf) => {
            mannequin = gltf.scene;
            window.mannequin = mannequin; // Make mannequin globally available for button logic
            scene.add(mannequin);

            // Center the model
            const box = new THREE.Box3().setFromObject(mannequin);
            const center = box.getCenter(new THREE.Vector3());
            mannequin.position.sub(center);

            // ✅ Apply clean skin tone
            mannequin.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: '#FFDFC4',   // light skin tone
                        roughness: 0.6,     // softer look
                        metalness: 0.0,     // not metallic
                    });
                }
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
            window.mannequinAPI.setMorphExclusive = function(morphName, categoryShapes) {
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
                morphMeshes.forEach(m => {
                    if (m.name === meshName) m.visible = !!show;
                });
            };

            // Helper: convert morph name to slider id (lowercase, spaces/specials to dashes)
            function morphNameToId(name) {
                return name.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
            }

            // Accurate min/max for each metric (real world)
            const metricRanges = {
                'shoulder-width': { cm: [40, 55], inch: [15.748, 21.6535] },
                'chest':         { cm: [80, 110], inch: [31.4961, 43.3071] },
                'waist':         { cm: [70, 100], inch: [27.5591, 39.3701] },
                'height':        { cm: [150, 200], inch: [59.0551, 78.7402] },
                'torso-length':  { cm: [50, 80], inch: [19.685, 31.4961] }
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
                    return parseFloat(val).toFixed(2);
                }

                // Get metric and min/max
                function getMetric() {
                    return metricSelect.value;
                }
                function getMinMax() {
                    const metric = getMetric();
                    const range = metricRanges[sliderId] || { cm: [slider.min, slider.max], inch: [slider.min, slider.max] };
                    return range[metric];
                }

                // Set morph target influence across all meshes that have this morph name
                function setMorph(val) {
                    const [min, max] = getMinMax();
                    const influence = (val - min) / (max - min);
                    window.mannequinAPI.setMorphByName(morphName, clamp(influence, 0, 1));
                }

                // Sync valueDisplay with slider (live update)
                slider.addEventListener('input', () => {
                    let val = format(slider.value);
                    valueDisplay.value = val;
                    setMorph(parseFloat(val));
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
                        valueDisplay.value = format(slider.min);
                        slider.value = format(slider.min);
                        setMorph(parseFloat(slider.min));
                    } else {
                        num = clamp(num, min, max);
                        valueDisplay.value = format(num);
                        slider.value = format(num);
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
                    const metric = getMetric();
                    const [min, max] = getMinMax();
                    slider.min = min;
                    slider.max = max;
                    slider.step = metric === 'cm' ? 0.5 : 0.01;
                    // Convert value
                    let val = parseFloat(slider.value);
                    if (metric === 'cm') {
                        // Convert inch to cm
                        val = Math.round(val * 2.54 * 100) / 100;
                    } else {
                        // Convert cm to inch
                        val = Math.round(val / 2.54 * 100) / 100;
                    }
                    // Clamp and update
                    val = clamp(val, min, max);
                    slider.value = format(val);
                    valueDisplay.value = format(val);
                    setMorph(val);
                });

                // Initialize valueDisplay and morph
                valueDisplay.value = format(slider.value);
                setMorph(parseFloat(slider.value));
            });

            // Wire up morph/skin buttons now mannequin is loaded
            if (window._wireMorphButtons) window._wireMorphButtons();

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
                if (morph) window.mannequinAPI.setMorphExclusive(morph, BODY_SHAPES);
            });
            window.addEventListener('mannequin.pose', (ev) => {
                const morph = ev && ev.detail && ev.detail.morph;
                if (morph) window.mannequinAPI.setPose(morph, POSE_SHAPES);
            });

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
