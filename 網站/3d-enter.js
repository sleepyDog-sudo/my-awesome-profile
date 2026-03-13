// --- 3d-enter.js ---
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const ThreeEnterScreen = {
// ... 下面的程式碼通通不用動！ ...
    init() {
        this.container = document.getElementById('enter-screen');
        if (!this.container) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 打光調整，讓玻璃邊緣更亮
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
        
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 3);
        dirLight1.position.set(5, 5, 5);
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xaaaaaa, 2);
        dirLight2.position.set(-5, -5, -5);
        this.scene.add(dirLight2);

        const loader = new FontLoader();
        
        // 加入錯誤處理的載入方式
        loader.load(
            'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
            (font) => {
                console.log("字體載入成功！"); // 除錯用
                
                const textGeometry = new TextGeometry('ENTER', {
                    font: font,
                    size: 0.8,
                    height: 0.2, // 稍微加厚
                    curveSegments: 12,
                    bevelEnabled: true,
                    bevelThickness: 0.05,
                    bevelSize: 0.03,
                    bevelSegments: 5
                });

                textGeometry.computeBoundingBox();
                const centerOffset = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
                textGeometry.translate(centerOffset, -0.4, 0); // 調整 Y 軸位置，避免擋住原本的字

                // 毛玻璃材質調整
                const glassMaterial = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,
                    metalness: 0.1,
                    roughness: 0.1,      // 稍微光滑一點，折射更明顯
                    transmission: 1.0,   // 完全透光
                    ior: 1.5,            // 折射率
                    thickness: 1.0,      // 增加厚度感
                    transparent: true,
                    opacity: 1
                });

                this.textMesh = new THREE.Mesh(textGeometry, glassMaterial);
                this.scene.add(this.textMesh);
            },
            // onProgress callback
            undefined,
            // onError callback
            (err) => {
                console.error("字體載入失敗，請檢查網路或 CORS 問題:", err);
            }
        );

        this.camera.position.z = 5; // 攝影機稍微往後拉

        this.mouse = { x: 0, y: 0 };
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.animate();
    },

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.textMesh) {
            this.textMesh.rotation.x += (-this.mouse.y * 0.5 - this.textMesh.rotation.x) * 0.05;
            this.textMesh.rotation.y += (this.mouse.x * 0.5 - this.textMesh.rotation.y) * 0.05;
        }

        this.renderer.render(this.scene, this.camera);
    }
};

ThreeEnterScreen.init();