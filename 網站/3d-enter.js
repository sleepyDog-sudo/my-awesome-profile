// --- 3d-enter.js (終極淨身版：純淨網格 + 完美軸心 + 穩定關節) ---
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

const EnterScreenRagdoll = {
    init() {
        this.container = document.getElementById('enter-screen');
        if (!this.container) return;

        const glitchText = this.container.querySelector('.glitch-wrapper');
        if (glitchText) glitchText.style.display = 'none'; 

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.pointerEvents = 'none'; 
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 3);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        this.camera.position.set(0, 1.5, -6); 
        this.camera.lookAt(0, 1.5, 0);

        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, 0, 0),
        });

        this.clock = new THREE.Clock();
        this.timeStep = 1 / 60;
        this.ragdollParts = []; 
        this.mainBody = null;

        const loader = new GLTFLoader();
        loader.load('assets/model.glb', (gltf) => {
            this.model = gltf.scene;
            const meshes = {};

            // 1. 抓取原本的部位
            this.model.traverse((child) => {
                if (child.isMesh) {
                    const name = child.name;
                    if (name.includes('Waist') || name.includes('Body')) meshes.waist = child;
                    if (name.includes('Head')) meshes.head = child;
                    if (name.includes('Left_Arm')) meshes.lArm = child;
                    if (name.includes('Right_Arm')) meshes.rArm = child;
                    if (name.includes('Left_Leg')) meshes.lLeg = child;
                    if (name.includes('Right_Leg')) meshes.rLeg = child;
                }
            });

            // 2. 🌟 終極殺手鐧：將 SkinnedMesh 轉化為最純淨的 Mesh
            if (meshes.waist) {
                const cleanMeshes = {};
                
                Object.keys(meshes).forEach(key => {
                    const originalMesh = meshes[key];
                    
                    // 複製幾何體與材質，拋棄所有骨架包袱
                    const cleanMesh = new THREE.Mesh(originalMesh.geometry.clone(), originalMesh.material);
                    
                    // 烘焙放大 3 倍
                    cleanMesh.geometry.scale(3, 3, 3);
                    
                    // 確保沒有任何繼承的縮放或位移干擾
                    cleanMesh.position.set(0, 0, 0);
                    cleanMesh.rotation.set(0, 0, 0);
                    cleanMesh.scale.set(1, 1, 1); 
                    
                    this.scene.add(cleanMesh);
                    cleanMeshes[key] = cleanMesh;
                });

                // 用乾淨無污染的積木去建立布娃娃
                this.buildRagdoll(cleanMeshes);
            } else {
                console.error("❌ 找不到模型身體部件，請檢查命名。");
            }
        });

        this.mouse = new THREE.Vector2();
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('resize', () => this.onWindowResize());
        
        this.animate();
    },

    buildRagdoll(meshes) {
        // 自動測量與建立物理剛體
        const autoCreateBody = (mass, mesh) => {
            if (!mesh) return null;

            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            mesh.geometry.translate(-center.x, -center.y, -center.z);

            const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
            const body = new CANNON.Body({
                mass: mass,
                position: new CANNON.Vec3(center.x, center.y, center.z),
                collisionFilterGroup: 1,
                collisionFilterMask: 0 
            });
            body.addShape(shape);
            body.linearDamping = 0.5;
            body.angularDamping = 0.5;
            this.world.addBody(body);

            this.ragdollParts.push({ mesh: mesh, body: body });
            return { body, size }; 
        };

        const waistData = autoCreateBody(2, meshes.waist);
        const headData  = autoCreateBody(1, meshes.head);
        const lArmData  = autoCreateBody(0.5, meshes.lArm);
        const rArmData  = autoCreateBody(0.5, meshes.rArm);
        const lLegData  = autoCreateBody(1, meshes.lLeg);
        const rLegData  = autoCreateBody(1, meshes.rLeg);

        this.mainBody = waistData ? waistData.body : null;

        // 在綁定關節前，先把積木拼到完美的預設位置
        if (waistData) {
            const baseY = 1.5; 
            waistData.body.position.set(0, baseY, 0);

            if (headData) {
                headData.body.position.set(0, baseY + waistData.size.y / 2 + headData.size.y / 2, 0);
            }
            if (lArmData) {
                lArmData.body.position.set(-waistData.size.x / 2 - lArmData.size.x / 2, baseY + waistData.size.y / 2 - lArmData.size.y / 2, 0);
            }
            if (rArmData) {
                rArmData.body.position.set(waistData.size.x / 2 + rArmData.size.x / 2, baseY + waistData.size.y / 2 - rArmData.size.y / 2, 0);
            }
            if (lLegData) {
                lLegData.body.position.set(-waistData.size.x / 4, baseY - waistData.size.y / 2 - lLegData.size.y / 2, 0);
            }
            if (rLegData) {
                rLegData.body.position.set(waistData.size.x / 4, baseY - waistData.size.y / 2 - rLegData.size.y / 2, 0);
            }
        }

        // 建立並綁定關節
        const connect = (dataA, dataB, pivotA, pivotB) => {
            if (!dataA || !dataB) return;
            const constraint = new CANNON.ConeTwistConstraint(dataA.body, dataB.body, {
                pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z),
                pivotB: new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z),
                axisA: CANNON.Vec3.UNIT_Y,
                axisB: CANNON.Vec3.UNIT_Y,
                angle: Math.PI / 4,
                twistAngle: Math.PI / 8,
                collideConnected: false
            });
            this.world.addConstraint(constraint);
        };

        if (waistData && headData) {
            connect(waistData, headData,
                { x: 0, y: waistData.size.y / 2, z: 0 },
                { x: 0, y: -headData.size.y / 2, z: 0 }
            );
        }
        if (waistData && lArmData) {
            connect(waistData, lArmData,
                { x: -waistData.size.x / 2, y: waistData.size.y / 2 - 0.1, z: 0 },
                { x: lArmData.size.x / 2, y: lArmData.size.y / 2 - 0.1, z: 0 }
            );
        }
        if (waistData && rArmData) {
            connect(waistData, rArmData,
                { x: waistData.size.x / 2, y: waistData.size.y / 2 - 0.1, z: 0 },
                { x: -rArmData.size.x / 2, y: rArmData.size.y / 2 - 0.1, z: 0 }
            );
        }
        if (waistData && lLegData) {
            connect(waistData, lLegData,
                { x: -waistData.size.x / 10, y: -waistData.size.y / 2, z: 0 },
                { x: 0, y: lLegData.size.y / 2, z: 0 }
            );
        }
        if (waistData && rLegData) {
            connect(waistData, rLegData,
                { x: waistData.size.x / 10, y: -waistData.size.y / 2, z: 0 },
                { x: 0, y: rLegData.size.y / 2, z: 0 }
            );
        }

        if(this.mainBody) {
            this.mainBody.velocity.set((Math.random()-0.5)*3, (Math.random()-0.5)*3, (Math.random()-0.5)*3);
            this.mainBody.angularVelocity.set(Math.random()*2, Math.random()*2, Math.random()*2);
        }
    },

    onMouseMove(event) {
        this.mouse.x = -((event.clientX / window.innerWidth) * 2 - 1);
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    },

    animate() {
        if (!document.getElementById('enter-screen')) return;

        // 這裡就是剛剛不小心消失的動畫迴圈心臟！
        requestAnimationFrame(() => this.animate());

        const dt = Math.min(this.clock.getDelta(), 0.1); 
        this.world.step(this.timeStep, dt);

        if (this.mainBody) {
            const torqueX = this.mouse.y * 30;
            const torqueY = this.mouse.x * 30;
            this.mainBody.applyTorque(new CANNON.Vec3(torqueX, torqueY, 0));

            const targetY = 1.5;
            const forceX = (0 - this.mainBody.position.x) * 5;
            const forceY = (targetY - this.mainBody.position.y) * 5;
            const forceZ = (0 - this.mainBody.position.z) * 5;
            this.mainBody.applyForce(new CANNON.Vec3(forceX, forceY, forceZ), this.mainBody.position);
        }

        // 將物理運算結果更新到畫面上
        for (const part of this.ragdollParts) {
            part.mesh.position.copy(part.body.position);
            part.mesh.quaternion.copy(part.body.quaternion);
        }

        this.renderer.render(this.scene, this.camera);
    },

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
};

EnterScreenRagdoll.init();