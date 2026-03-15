import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as CANNON from 'cannon-es';

const EnterScreenRagdoll = {
    init() {
        this.container = document.getElementById('bg-3d-canvas');
        if (!this.container) return;

        window.isSiteEntered = window.isSiteEntered || false;
        window.__dog3dReady = false;

        this.maxDogs = 80;
        this.pendingSpawns = 0;
        this.gravityApplied = false;
        this.throwBoost = 0.2;
        this.dragVelocity = new CANNON.Vec3(0, 0, 0);
        this.prevDragTarget = new THREE.Vector3();
        this.hasPrevDragTarget = false;
        this._mouseWorld = new THREE.Vector3();
        this.lastTime = performance.now();
        this.baseLinearDamping = 0.18;
        this.baseAngularDamping = 0.28;
        this.settleSpeedSq = 0.02;
        this.settleAngularSpeedSq = 0.02;
        this.settleTime = 0.35;
        this.maxAngularSpeed = 12;
        this.partNames = ['Waist', 'Left Leg', 'Right Leg'];
        this.partInfo = null;
        this.armSwingTime = 0;
        this.baseDogRotation = new THREE.Quaternion();
        this.baseDogRotationInv = new THREE.Quaternion();
        this.baseDogOffset = new THREE.Vector3();

        this.enterScreen = document.getElementById('enter-screen');
        if (this.enterScreen) {
            this.enterScreen.addEventListener('click', () => {
                window.isSiteEntered = true;
            });
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);
        
        this.container.style.pointerEvents = 'none';
        this.container.style.zIndex = '99998';

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        this.camera.position.set(0, 0, 10); 
        this.camera.lookAt(0, 0, 0);

        this.world = new CANNON.World();
        this.world.gravity.set(0, 0, 0); 
        this.world.allowSleep = true; 
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 30;
        this.world.solver.tolerance = 0.0001;

        this.dogs = []; 
        this.dogMaterial = new CANNON.Material('dog');
        this.floorMaterial = new CANNON.Material('floor');
        const dogContact = new CANNON.ContactMaterial(this.dogMaterial, this.floorMaterial, {
            friction: 0.25,
            restitution: 0.05,
            contactEquationStiffness: 5e6,
            contactEquationRelaxation: 4,
            frictionEquationStiffness: 1e6,
            frictionEquationRelaxation: 4
        });
        this.world.addContactMaterial(dogContact);

        // 🌟 建立用於「完美拖曳」的隱形動力學游標剛體
        this.kinematicBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
        this.world.addBody(this.kinematicBody);
        this.dragSpring = null;

        this.buildInvisibleWalls();

        const loader = new GLTFLoader();
        loader.load(
            'assets/model.glb',
            (gltf) => {
                const model = gltf.scene;
                model.rotation.y = Math.PI; 
                model.updateMatrixWorld(true);

                this.baseDogGroup = model;
                const usedNames = new Set();
                let autoIndex = 0;
                const makeUniqueName = (rawName) => {
                    const baseName = (rawName || 'Part').trim() || 'Part';
                    let unique = baseName;
                    let suffix = 1;
                    while (usedNames.has(unique)) {
                        unique = `${baseName}_${suffix}`;
                        suffix += 1;
                    }
                    usedNames.add(unique);
                    return unique;
                };
                this.baseDogGroup.traverse((node) => {
                    node.name = makeUniqueName(node.name || node.parent?.name || `Part_${autoIndex}`);
                    if (node.isMesh) {
                        node.frustumCulled = false;
                    }
                    autoIndex += 1;
                });

                const box = new THREE.Box3().setFromObject(this.baseDogGroup);
                this.dogSize = new THREE.Vector3();
                box.getSize(this.dogSize);
                
                const center = new THREE.Vector3();
                box.getCenter(center);
                
                this.baseDogGroup.position.sub(center);
                this.baseDogOffset.set(0, 0, 0);
                this.baseDogGroup.updateMatrixWorld(true);
                this.baseDogRotation.copy(this.baseDogGroup.quaternion);
                this.baseDogRotationInv.copy(this.baseDogRotation).invert();
                this.partInfo = this.extractPartInfo(this.baseDogGroup);

                this.spawnDog(true);
                window.__dog3dReady = true;
                window.spawnSolidDog = () => this.spawnDog(false);

                if (this.pendingSpawns > 0) {
                    for (let i = 0; i < this.pendingSpawns; i++) {
                        this.spawnDog(false);
                    }
                    this.pendingSpawns = 0;
                }
            },
            undefined,
            (err) => {
                console.warn('Failed to load assets/model.glb. Using fallback mesh.', err);
                this.buildFallbackDogTemplate();
                this.spawnDog(true);
                window.__dog3dReady = true;
                window.spawnSolidDog = () => this.spawnDog(false);
            }
        );

        window.spawnSolidDog = () => {
            this.pendingSpawns += 1;
        };

        this.raycaster = new THREE.Raycaster();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); 
        this.draggedBody = null;
        this.mouse = new THREE.Vector2();

        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => this.onMouseUp());
        window.addEventListener('resize', () => this.onWindowResize());

        this.animate();
    },

    buildFallbackDogTemplate() {
        if (this.baseDogGroup) return;
        const group = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({ color: 0xffc58a, roughness: 0.6, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.9), material);
        body.name = 'Body';
        const waist = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.3), material);
        waist.name = 'Waist';
        waist.position.set(0, -0.25, -0.3);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.75), material);
        head.name = 'Head';
        head.position.set(0, 0.25, 1.2);
        const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), material);
        leftArm.name = 'Left Arm';
        leftArm.position.set(-0.9, 0.1, 0.3);
        const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), material);
        rightArm.name = 'Right Arm';
        rightArm.position.set(0.9, 0.1, 0.3);
        const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), material);
        leftLeg.name = 'Left Leg';
        leftLeg.position.set(-0.45, -0.8, -0.6);
        const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), material);
        rightLeg.name = 'Right Leg';
        rightLeg.position.set(0.45, -0.8, -0.6);

        group.add(body);
        group.add(waist);
        group.add(head);
        group.add(leftArm);
        group.add(rightArm);
        group.add(leftLeg);
        group.add(rightLeg);
        this.baseDogGroup = group;
        const box = new THREE.Box3().setFromObject(this.baseDogGroup);
        this.dogSize = new THREE.Vector3();
        box.getSize(this.dogSize);
        const center = new THREE.Vector3();
        box.getCenter(center);
        this.baseDogGroup.children.forEach(mesh => {
            mesh.position.sub(center);
        });
        this.baseDogGroup.position.set(0, 0, 0);
        this.baseDogOffset.set(0, 0, 0);
        this.baseDogGroup.updateMatrixWorld(true);
        this.baseDogRotation.copy(this.baseDogGroup.quaternion);
        this.baseDogRotationInv.copy(this.baseDogRotation).invert();
        this.partInfo = this.extractPartInfo(this.baseDogGroup);
    },

    getDefaultPartSize(name) {
        switch (name) {
            case 'Head': return new THREE.Vector3(0.55, 0.55, 0.55);
            case 'Body': return new THREE.Vector3(0.9, 0.9, 0.9);
            case 'Waist': return new THREE.Vector3(1.2, 0.9, 1.2);
            case 'Left Arm':
            case 'Right Arm':
                return new THREE.Vector3(0.35, 0.75, 0.35);
            case 'Left Leg':
            case 'Right Leg':
                return new THREE.Vector3(0.4, 0.9, 0.4);
            default:
                return new THREE.Vector3(0.35, 0.35, 0.35);
        }
    },

    extractPartInfo(group) {
        const info = {};
        if (!group) return info;

        const rootQuat = group.quaternion.clone();
        const rootQuatInv = rootQuat.clone().invert();
        for (const name of this.partNames) {
            const node = group.getObjectByName(name);
            if (!node) continue;
            const box = new THREE.Box3().setFromObject(node);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            const nodeWorldPos = new THREE.Vector3();
            const nodeWorldScale = new THREE.Vector3();
            if (node.isSkinnedMesh) {
                size.copy(this.getDefaultPartSize(name));
                node.getWorldPosition(center);
            } else if (box.isEmpty()) {
                size.copy(this.getDefaultPartSize(name));
                node.getWorldPosition(center);
            } else {
                box.getSize(size);
                box.getCenter(center);
                if (size.lengthSq() < 1e-6) {
                    size.copy(this.getDefaultPartSize(name));
                    node.getWorldPosition(center);
                }
            }
            const worldQuat = new THREE.Quaternion();
            node.getWorldQuaternion(worldQuat);
            node.getWorldPosition(nodeWorldPos);
            node.getWorldScale(nodeWorldScale);
            const localCenter = center.clone().applyQuaternion(rootQuatInv);
            const localQuat = rootQuatInv.clone().multiply(worldQuat);
            const nodeCenterOffset = new THREE.Vector3();
            if (!node.isSkinnedMesh) {
                nodeCenterOffset.copy(center).sub(nodeWorldPos).applyQuaternion(worldQuat.clone().invert());
                if (nodeWorldScale.x !== 0) nodeCenterOffset.x /= nodeWorldScale.x;
                if (nodeWorldScale.y !== 0) nodeCenterOffset.y /= nodeWorldScale.y;
                if (nodeWorldScale.z !== 0) nodeCenterOffset.z /= nodeWorldScale.z;
            }
            info[name] = {
                size,
                localCenter,
                localQuat,
                nodeCenterOffset
            };
        }

        if (Object.keys(info).length < 3) {
            for (const key of Object.keys(info)) delete info[key];
            let autoIndex = 0;
            group.traverse((node) => {
                if (!node.isMesh) return;
                const box = new THREE.Box3().setFromObject(node);
                const size = new THREE.Vector3();
                const center = new THREE.Vector3();
                const nodeWorldPos = new THREE.Vector3();
                const nodeWorldScale = new THREE.Vector3();
                if (node.isSkinnedMesh) {
                    size.copy(this.getDefaultPartSize(node.name));
                    node.getWorldPosition(center);
                } else if (box.isEmpty()) {
                    size.copy(this.getDefaultPartSize(node.name));
                    node.getWorldPosition(center);
                } else {
                    box.getSize(size);
                    box.getCenter(center);
                    if (size.lengthSq() < 1e-6) {
                        size.copy(this.getDefaultPartSize(node.name));
                        node.getWorldPosition(center);
                    }
                }
                const worldQuat = new THREE.Quaternion();
                node.getWorldQuaternion(worldQuat);
                node.getWorldPosition(nodeWorldPos);
                node.getWorldScale(nodeWorldScale);
                const localCenter = center.clone().applyQuaternion(rootQuatInv);
                const localQuat = rootQuatInv.clone().multiply(worldQuat);
                const nodeCenterOffset = new THREE.Vector3();
                if (!node.isSkinnedMesh) {
                    nodeCenterOffset.copy(center).sub(nodeWorldPos).applyQuaternion(worldQuat.clone().invert());
                    if (nodeWorldScale.x !== 0) nodeCenterOffset.x /= nodeWorldScale.x;
                    if (nodeWorldScale.y !== 0) nodeCenterOffset.y /= nodeWorldScale.y;
                    if (nodeWorldScale.z !== 0) nodeCenterOffset.z /= nodeWorldScale.z;
                }
                let key = node.name || `Part_${autoIndex}`;
                while (info[key]) {
                    autoIndex += 1;
                    key = node.name ? `${node.name}_${autoIndex}` : `Part_${autoIndex}`;
                }
                node.name = key;
                info[key] = {
                    size,
                    localCenter,
                    localQuat,
                    nodeCenterOffset
                };
                autoIndex += 1;
            });
        }
        return info;
    },

    setBodyKinematic(body) {
        if (!body || body.type === CANNON.Body.KINEMATIC) return;
        body.type = CANNON.Body.KINEMATIC;
        body.mass = 0;
        body.updateMassProperties();
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    },

    setBodyDynamic(body, mass) {
        if (!body) return;
        if (body.type === CANNON.Body.DYNAMIC && body.mass > 0) {
            body.wakeUp();
            return;
        }
        body.type = CANNON.Body.DYNAMIC;
        const targetMass = (typeof mass === 'number') ? mass : (body._baseMass || 1);
        body.mass = targetMass;
        body.updateMassProperties();
        body.wakeUp();
    },

    setDogKinematic(dog) {
        if (!dog || !dog.bodies) return;
        for (const body of dog.bodies) this.setBodyKinematic(body);
    },

    setDogDynamic(dog) {
        if (!dog || !dog.bodies) return;
        for (const body of dog.bodies) this.setBodyDynamic(body);
    },

    setupDogArmRig(dogGroup) {
        if (!dogGroup) return null;
        const findBone = (aliases) => {
            const normalizedAliases = aliases.map(a => a.toLowerCase().replace(/[\s_]/g, ''));
            let hit = null;
            dogGroup.traverse((node) => {
                if (hit || !node.isBone) return;
                const nodeName = (node.name || '').toLowerCase().replace(/[\s_]/g, '');
                if (normalizedAliases.some(alias => nodeName === alias || nodeName.startsWith(`${alias}`))) {
                    hit = node;
                }
            });
            return hit;
        };
        const leftBone = findBone(['Left Arm', 'LeftArm', 'left_arm']);
        const rightBone = findBone(['Right Arm', 'RightArm', 'right_arm']);
        const headBone = findBone(['Head']);
        if (!leftBone && !rightBone && !headBone) return null;
        return {
            leftBone,
            rightBone,
            headBone,
            leftBaseQuat: leftBone ? leftBone.quaternion.clone() : null,
            rightBaseQuat: rightBone ? rightBone.quaternion.clone() : null,
            headBaseQuat: headBone ? headBone.quaternion.clone() : null,
            leftPitch: 0,
            rightPitch: 0,
            leftRoll: 0,
            rightRoll: 0,
            headPitch: 0,
            headYaw: 0,
            headRoll: 0
        };
    },

    updateDogArmRig(dog, deltaTime) {
        if (!dog || !dog.armRig) return;
        const rig = dog.armRig;
        const waistBody = (dog.parts && dog.parts.Waist && dog.parts.Waist.body) || dog.mainBody;
        const leftLegBody = dog.parts && dog.parts['Left Leg'] ? dog.parts['Left Leg'].body : null;
        const rightLegBody = dog.parts && dog.parts['Right Leg'] ? dog.parts['Right Leg'].body : null;
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        const dead = (v, eps) => (Math.abs(v) < eps ? 0 : v);
        const applyBone = (bone, baseQuat, ex, ey, ez, blend = 0.35) => {
            if (!bone || !baseQuat) return;
            const offsetQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(ex, ey, ez, 'XYZ')
            );
            const targetQuat = baseQuat.clone().multiply(offsetQuat);
            bone.quaternion.slerp(targetQuat, blend);
        };
        const blendToBase = Math.min(1, deltaTime * 10);
        const isDogDragged = !!(this.draggedBody && dog.bodies && dog.bodies.includes(this.draggedBody));

        let targetLeftPitch = 0;
        let targetRightPitch = 0;
        let targetLeftRoll = 0;
        let targetRightRoll = 0;
        let targetHeadPitch = 0;
        let targetHeadYaw = 0;
        let targetHeadRoll = 0;

        if (isDogDragged && waistBody) {
            const bodyQuat = new THREE.Quaternion(
                waistBody.quaternion.x,
                waistBody.quaternion.y,
                waistBody.quaternion.z,
                waistBody.quaternion.w
            );
            const bodyQuatInv = bodyQuat.clone().invert();

            const velLocal = new THREE.Vector3(
                waistBody.velocity.x,
                waistBody.velocity.y,
                waistBody.velocity.z
            ).applyQuaternion(bodyQuatInv);

            const dragLocal = new THREE.Vector3(
                this.dragVelocity.x || 0,
                this.dragVelocity.y || 0,
                this.dragVelocity.z || 0
            ).applyQuaternion(bodyQuatInv);

            const angLocal = new THREE.Vector3(
                waistBody.angularVelocity.x,
                waistBody.angularVelocity.y,
                waistBody.angularVelocity.z
            ).applyQuaternion(bodyQuatInv);

            const side = dead(velLocal.x * 0.8 + dragLocal.x * 1.2, 0.12);
            const up = dead(velLocal.y * 0.9 + dragLocal.y * 1.1, 0.12);
            const forward = dead(velLocal.z * 0.8 + dragLocal.z * 1.1, 0.12);
            const rollSpin = dead(angLocal.z, 0.1);
            const yawSpin = dead(angLocal.y, 0.1);
            const pitchSpin = dead(angLocal.x, 0.1);

            let legBias = 0;
            if (leftLegBody && rightLegBody) {
                legBias = clamp((leftLegBody.position.y - rightLegBody.position.y) * 0.28, -0.12, 0.12);
            }

            targetLeftPitch = clamp((-up * 0.03) + (forward * 0.015) + (pitchSpin * 0.04) + legBias, -0.55, 0.55);
            targetRightPitch = clamp((-up * 0.03) + (forward * 0.015) + (pitchSpin * 0.04) - legBias, -0.55, 0.55);

            const spread = clamp(Math.abs(side) * 0.018, 0, 0.24);
            targetLeftRoll = clamp((-side * 0.05) - (rollSpin * 0.08) - spread, -0.95, 0.95);
            targetRightRoll = clamp((-side * 0.05) + (rollSpin * 0.08) + spread, -0.95, 0.95);

            targetHeadPitch = clamp((-up * 0.014) + (pitchSpin * 0.05), -0.3, 0.3);
            targetHeadYaw = clamp((side * 0.018) + (yawSpin * 0.05), -0.24, 0.24);
            targetHeadRoll = clamp((rollSpin * 0.04), -0.2, 0.2);
        }

        rig.leftPitch += (targetLeftPitch - rig.leftPitch) * blendToBase;
        rig.rightPitch += (targetRightPitch - rig.rightPitch) * blendToBase;
        rig.leftRoll += (targetLeftRoll - rig.leftRoll) * blendToBase;
        rig.rightRoll += (targetRightRoll - rig.rightRoll) * blendToBase;
        rig.headPitch += (targetHeadPitch - rig.headPitch) * blendToBase;
        rig.headYaw += (targetHeadYaw - rig.headYaw) * blendToBase;
        rig.headRoll += (targetHeadRoll - rig.headRoll) * blendToBase;

        const settle = (v) => (Math.abs(v) < 1e-4 ? 0 : v);
        rig.leftPitch = settle(rig.leftPitch);
        rig.rightPitch = settle(rig.rightPitch);
        rig.leftRoll = settle(rig.leftRoll);
        rig.rightRoll = settle(rig.rightRoll);
        rig.headPitch = settle(rig.headPitch);
        rig.headYaw = settle(rig.headYaw);
        rig.headRoll = settle(rig.headRoll);

        applyBone(rig.leftBone, rig.leftBaseQuat, rig.leftPitch, 0, rig.leftRoll, 0.45);
        applyBone(rig.rightBone, rig.rightBaseQuat, rig.rightPitch, 0, rig.rightRoll, 0.45);
        applyBone(rig.headBone, rig.headBaseQuat, rig.headPitch, rig.headYaw, rig.headRoll, 0.35);

        if (!isDogDragged && rig.leftPitch === 0 && rig.rightPitch === 0 && rig.leftRoll === 0 && rig.rightRoll === 0 && rig.headPitch === 0 && rig.headYaw === 0 && rig.headRoll === 0) {
            if (rig.leftBone && rig.leftBaseQuat) rig.leftBone.quaternion.copy(rig.leftBaseQuat);
            if (rig.rightBone && rig.rightBaseQuat) rig.rightBone.quaternion.copy(rig.rightBaseQuat);
            if (rig.headBone && rig.headBaseQuat) rig.headBone.quaternion.copy(rig.headBaseQuat);
        }
    },

    createRagdollDog(dogGroup, startPos, scale, isFirst) {
        if (!this.partInfo || Object.keys(this.partInfo).length === 0) {
            this.partInfo = this.extractPartInfo(this.baseDogGroup);
        }

        const parts = {};
        const bodies = [];
        const constraints = [];
        const rootQuat = this.baseDogRotation.clone();
        const rootQuatInv = this.baseDogRotationInv.clone();
        const start = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
        const armRig = this.setupDogArmRig(dogGroup);

        const partEntries = Object.entries(this.partInfo || {});
        if (partEntries.length === 0) {
            const fallbackSize = (this.dogSize || new THREE.Vector3(1, 1, 1)).clone().multiplyScalar(scale);
            const shape = new CANNON.Box(new CANNON.Vec3(fallbackSize.x * 0.5, fallbackSize.y * 0.5, fallbackSize.z * 0.5));
            const body = new CANNON.Body({
                mass: 5,
                position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
                material: this.dogMaterial
            });
            body.addShape(shape);
            body.linearDamping = this.baseLinearDamping;
            body.angularDamping = this.baseAngularDamping;
            body.allowSleep = true;
            body.sleepSpeedLimit = 0.25;
            body.sleepTimeLimit = 0.6;
            body._restTime = 0;
            body._baseMass = 5;
            this.world.addBody(body);
            bodies.push(body);
            parts.Body = { node: dogGroup, body, size: fallbackSize, info: null };
            return {
                group: dogGroup,
                parts,
                bodies,
                constraints,
                scale,
                rootQuat,
                rootQuatInv,
                armRig,
                mainBody: body
            };
        }

        let totalVolume = 0;
        const volumes = new Map();
        for (const [name, info] of partEntries) {
            const size = info.size || new THREE.Vector3(1, 1, 1);
            const volume = Math.max(size.x * size.y * size.z, 0.001);
            volumes.set(name, volume);
            totalVolume += volume;
        }
        const totalMass = 6;

        for (const [name, info] of partEntries) {
            const node = dogGroup.getObjectByName(name);
            if (!node) continue;
            const size = info.size.clone().multiplyScalar(scale);
            const half = size.clone().multiplyScalar(0.5 * 0.9);
            const shape = new CANNON.Box(new CANNON.Vec3(
                Math.max(0.08, half.x),
                Math.max(0.08, half.y),
                Math.max(0.08, half.z)
            ));
            const mass = Math.max(0.3, totalMass * (volumes.get(name) / totalVolume));
            const body = new CANNON.Body({
                mass,
                material: this.dogMaterial
            });
            body.addShape(shape);

            const localCenter = info.localCenter.clone().multiplyScalar(scale);
            const worldCenter = localCenter.applyQuaternion(rootQuat).add(start);
            body.position.set(worldCenter.x, worldCenter.y, worldCenter.z);

            const partQuat = rootQuat.clone().multiply(info.localQuat);
            body.quaternion.set(partQuat.x, partQuat.y, partQuat.z, partQuat.w);

            body.linearDamping = this.baseLinearDamping;
            body.angularDamping = this.baseAngularDamping;
            body.allowSleep = true;
            body.sleepSpeedLimit = 0.25;
            body.sleepTimeLimit = 0.6;
            body._restTime = 0;
            body._baseMass = mass;

            if (!isFirst) {
                body.velocity.set((Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3);
                body.angularVelocity.set(Math.random() * 4, Math.random() * 4, Math.random() * 4);
            }

            this.world.addBody(body);
            parts[name] = { node, body, size, info };
            bodies.push(body);
        }

        if (bodies.length === 0) {
            const fallbackSize = (this.dogSize || new THREE.Vector3(1, 1, 1)).clone().multiplyScalar(scale);
            const shape = new CANNON.Box(new CANNON.Vec3(fallbackSize.x * 0.5, fallbackSize.y * 0.5, fallbackSize.z * 0.5));
            const body = new CANNON.Body({
                mass: 6,
                position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
                material: this.dogMaterial
            });
            body.addShape(shape);
            body.linearDamping = this.baseLinearDamping;
            body.angularDamping = this.baseAngularDamping;
            body.allowSleep = true;
            body.sleepSpeedLimit = 0.25;
            body.sleepTimeLimit = 0.6;
            body._restTime = 0;
            body._baseMass = 6;
            this.world.addBody(body);
            bodies.push(body);
            parts.Body = { node: dogGroup, body, size: fallbackSize, info: null };
        }

        const waistPart = parts.Waist;
        if (waistPart && waistPart.body) {
            const waistShape = waistPart.body.shapes && waistPart.body.shapes[0];
            const waistHalf = (waistShape && waistShape.halfExtents) ? waistShape.halfExtents : new CANNON.Vec3(0.45, 0.35, 0.45);
            const alignLegToHip = (legPart, sideSign) => {
                if (!legPart || !legPart.body) return;
                const legShape = legPart.body.shapes && legPart.body.shapes[0];
                const legHalf = (legShape && legShape.halfExtents) ? legShape.halfExtents : new CANNON.Vec3(0.2, 0.4, 0.2);
                legPart.body.position.set(
                    waistPart.body.position.x + sideSign * (waistHalf.x * 0.48),
                    waistPart.body.position.y - (waistHalf.y + legHalf.y * 0.6),
                    waistPart.body.position.z
                );
                legPart.body.quaternion.copy(waistPart.body.quaternion);
                legPart.body.velocity.set(0, 0, 0);
                legPart.body.angularVelocity.set(0, 0, 0);
            };
            alignLegToHip(parts['Left Leg'], -1);
            alignLegToHip(parts['Right Leg'], 1);
        }

        try {
            this.buildRagdollConstraints(parts, constraints);
        } catch (err) {
            console.warn('buildRagdollConstraints failed, continue without constraints.', err);
        }

        const mainBody = (parts.Body && parts.Body.body) || (parts.Waist && parts.Waist.body) || bodies[0];
        return {
            group: dogGroup,
            parts,
            bodies,
            constraints,
            scale,
            rootQuat,
            rootQuatInv,
            armRig,
            mainBody
        };
    },

    buildRagdollConstraints(parts, constraints) {
        const addP2P = (bodyA, bodyB, pivotA, pivotB) => {
            if (!bodyA || !bodyB) return;
            const c = new CANNON.PointToPointConstraint(bodyA, pivotA, bodyB, pivotB);
            c.collideConnected = false;
            this.world.addConstraint(c);
            constraints.push(c);
        };
        const addDistanceBodies = (bodyA, bodyB, multiplier = 1) => {
            if (!bodyA || !bodyB) return;
            const dx = bodyA.position.x - bodyB.position.x;
            const dy = bodyA.position.y - bodyB.position.y;
            const dz = bodyA.position.z - bodyB.position.z;
            const distance = Math.max(0.05, Math.sqrt(dx * dx + dy * dy + dz * dz) * multiplier);
            const c = new CANNON.DistanceConstraint(bodyA, bodyB, distance);
            c.collideConnected = false;
            this.world.addConstraint(c);
            constraints.push(c);
        };
        const addWeld = (partA, partB) => {
            if (!partA || !partB || !partA.body || !partB.body) return;
            const c = new CANNON.LockConstraint(partA.body, partB.body);
            c.collideConnected = false;
            this.world.addConstraint(c);
            constraints.push(c);
        };
        const getHalfExtents = (part, fallback) => {
            const shape = part && part.body && part.body.shapes ? part.body.shapes[0] : null;
            if (shape && shape.halfExtents) return shape.halfExtents;
            return fallback;
        };
        const addHipJoint = (legPart, waistPart, sideSign) => {
            if (!legPart || !waistPart || !legPart.body || !waistPart.body) return;
            const legHalf = getHalfExtents(legPart, new CANNON.Vec3(0.2, 0.35, 0.2));
            const waistHalf = getHalfExtents(waistPart, new CANNON.Vec3(0.4, 0.35, 0.4));
            const legPivot = new CANNON.Vec3(0, legHalf.y * 0.45, 0);
            const waistPivot = new CANNON.Vec3(sideSign * waistHalf.x * 0.22, -waistHalf.y * 0.38, 0);
            addP2P(legPart.body, waistPart.body, legPivot, waistPivot);
            addDistanceBodies(legPart.body, waistPart.body, 0.98);
        };

        const waistPart = parts.Waist;
        const leftLegPart = parts['Left Leg'];
        const rightLegPart = parts['Right Leg'];

        // 先焊接確保不分家，再加短距離保持穩定
        addWeld(leftLegPart, waistPart);
        addWeld(rightLegPart, waistPart);
        addHipJoint(leftLegPart, waistPart, -1);
        addHipJoint(rightLegPart, waistPart, 1);

        if (constraints.length === 0) {
            const entries = Object.values(parts).filter(p => p && p.body);
            if (entries.length > 1) {
                let root = entries[0];
                let rootVolume = root.size ? root.size.x * root.size.y * root.size.z : 0;
                for (const entry of entries) {
                    const vol = entry.size ? entry.size.x * entry.size.y * entry.size.z : 0;
                    if (vol > rootVolume) {
                        root = entry;
                        rootVolume = vol;
                    }
                }
                for (const entry of entries) {
                    if (entry === root) continue;
                    const rootPivot = root.body.pointToLocalFrame(entry.body.position);
                    addP2P(entry.body, root.body, new CANNON.Vec3(0, 0, 0), rootPivot);
                }
            }
        }
    },

    tagDogMeshesForPick(dog) {
        if (!dog || !dog.parts) return;
        for (const partName of Object.keys(dog.parts)) {
            const part = dog.parts[partName];
            if (!part || !part.node) continue;
            part.node.traverse((node) => {
                if (node.isMesh) {
                    node.userData.ragdoll = { dog, body: part.body };
                    node.frustumCulled = false;
                }
            });
        }
    },

    syncDogMeshes(dog) {
        if (!dog || !dog.parts) return;
        for (const partName of Object.keys(dog.parts)) {
            const part = dog.parts[partName];
            if (!part || !part.node || !part.body) continue;
            const body = part.body;
            if (part.node === dog.group) {
                part.node.position.set(body.position.x, body.position.y, body.position.z);
                part.node.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
                continue;
            }
            const bodyQuat = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
            const bodyPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
            const centerOffset = part.info && part.info.nodeCenterOffset ? part.info.nodeCenterOffset.clone() : new THREE.Vector3();
            const offsetWorld = centerOffset.multiply(part.node.scale.clone()).applyQuaternion(bodyQuat);
            const nodeWorldPos = bodyPos.clone().sub(offsetWorld);

            const parent = part.node.parent;
            if (!parent) {
                part.node.position.copy(nodeWorldPos);
                part.node.quaternion.copy(bodyQuat);
                continue;
            }

            parent.updateMatrixWorld(true);
            const parentPos = new THREE.Vector3();
            const parentQuat = new THREE.Quaternion();
            const parentScale = new THREE.Vector3();
            parent.matrixWorld.decompose(parentPos, parentQuat, parentScale);

            const parentQuatInv = parentQuat.clone().invert();
            const localPos = nodeWorldPos.sub(parentPos).applyQuaternion(parentQuatInv);
            if (parentScale.x !== 0) localPos.x /= parentScale.x;
            if (parentScale.y !== 0) localPos.y /= parentScale.y;
            if (parentScale.z !== 0) localPos.z /= parentScale.z;
            part.node.position.copy(localPos);

            const localQuat = parentQuatInv.multiply(bodyQuat);
            part.node.quaternion.copy(localQuat);
        }
    },

    buildInvisibleWalls() {
        const addWall = (posX, posY, posZ, rotX, rotY) => {
            const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
            body.position.set(posX, posY, posZ);
            body.quaternion.setFromEuler(rotX, rotY, 0);
            body.material = this.floorMaterial;
            this.world.addBody(body);
            return body;
        };
        
        const vFov = this.camera.fov * Math.PI / 180;
        const height = 2 * Math.tan(vFov / 2) * this.camera.position.z;
        const width = height * this.camera.aspect;

        this.floorBody = addWall(0, -height / 2, 0, -Math.PI/2, 0); 
        addWall(0, height / 2 + 10, 0, Math.PI/2, 0);  
        this.leftWallBody = addWall(-width / 2, 0, 0, 0, Math.PI/2); 
        this.rightWallBody = addWall(width / 2, 0, 0, 0, -Math.PI/2); 
        addWall(0, 0, 4, 0, Math.PI);     
        addWall(0, 0, -4, 0, 0);          
    },

    spawnDog(isFirst) {
        if (!this.baseDogGroup) this.buildFallbackDogTemplate();
        if (!this.partInfo || Object.keys(this.partInfo).length === 0) {
            this.partInfo = this.extractPartInfo(this.baseDogGroup);
        }
        if (this.dogs.length >= this.maxDogs) {
            let removeIndex = this.dogs.findIndex(d => d !== this.mainDog);
            if (removeIndex === -1) removeIndex = 0;
            const oldDog = this.dogs.splice(removeIndex, 1)[0];
            if (oldDog) {
                if (oldDog.constraints) {
                    for (const c of oldDog.constraints) this.world.removeConstraint(c);
                }
                if (oldDog.bodies) {
                    for (const b of oldDog.bodies) this.world.removeBody(b);
                }
                if (oldDog.group) this.scene.remove(oldDog.group);
            }
        }

        const scale = 2.0; 
        const startX = isFirst ? 0 : (Math.random() - 0.5) * 8;
        const startY = isFirst ? 0 : (6 + Math.random() * 2);
        const startPos = new CANNON.Vec3(startX, startY, 0);

        const dogGroup = SkeletonUtils.clone(this.baseDogGroup);
        dogGroup.scale.set(scale, scale, scale);
        dogGroup.position.set(startX, startY, 0).add(this.baseDogOffset);
        dogGroup.quaternion.copy(this.baseDogRotation);
        dogGroup.updateMatrixWorld(true);
        this.scene.add(dogGroup);

        const dog = this.createRagdollDog(dogGroup, startPos, scale, isFirst);
        this.tagDogMeshesForPick(dog);
        this.syncDogMeshes(dog);
        this.dogs.push(dog);

        if (isFirst) {
            this.mainDog = dog;
            this.mainBody = dog.mainBody;
            if (!window.isSiteEntered) this.setDogKinematic(this.mainDog);
        }
    },

    onMouseDownLegacy(e) {
        if (!window.isSiteEntered) return;
        if (e.target.closest('.jelly-widget') || e.target.closest('.linux-bar') || e.target.closest('.main-board')) return;

        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            // 精準抓取對應的狗狗
            const hitDog = this.dogs.find(d => {
                let parent = hitObject;
                while (parent) {
                    if (parent === d.mesh) return true;
                    parent = parent.parent;
                }
                return false;
            });

            if (hitDog) {
                this.draggedBody = hitDog.body;
                
                // 🌟 神級拖曳核心：建立與游標的物理彈力繩
                const hitPointWorld = intersects[0].point;
                this.kinematicBody.position.copy(hitPointWorld);
                
                const worldHit = new CANNON.Vec3(hitPointWorld.x, hitPointWorld.y, hitPointWorld.z);
                const localHitPoint = new CANNON.Vec3();
                // 計算你滑鼠點擊在狗狗身上的「絕對相對位置」
                this.draggedBody.quaternion.inverse().vmult(worldHit.vsub(this.draggedBody.position), localHitPoint);

                this.dragSpring = new CANNON.Spring(
                    this.kinematicBody,
                    this.draggedBody,
                    {
                        localAnchorA: new CANNON.Vec3(0, 0, 0),
                        localAnchorB: localHitPoint,
                        restLength: 0,
                        stiffness: 80,
                        damping: 18
                    }
                );
                this.draggedBody.wakeUp();
            }
        }
    },

    onMouseDown(e) {
        if (!window.isSiteEntered) return;
        if (e.target.closest('.jelly-widget') || e.target.closest('.linux-bar') || e.target.closest('.main-board')) return;

        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        if (intersects.length === 0) return;

        let hit = null;
        for (const intersect of intersects) {
            let obj = intersect.object;
            while (obj) {
                if (obj.userData && obj.userData.ragdoll) {
                    hit = { intersect, ragdoll: obj.userData.ragdoll };
                    break;
                }
                obj = obj.parent;
            }
            if (hit) break;
        }

        if (!hit || !hit.ragdoll || !hit.ragdoll.body) return;

        this.draggedBody = hit.ragdoll.body;

        const hitPointWorld = hit.intersect.point;
        this.kinematicBody.position.copy(hitPointWorld);

        const worldHit = new CANNON.Vec3(hitPointWorld.x, hitPointWorld.y, hitPointWorld.z);
        const localHitPoint = new CANNON.Vec3();
        this.draggedBody.quaternion.inverse().vmult(worldHit.vsub(this.draggedBody.position), localHitPoint);

        this.dragSpring = new CANNON.Spring(
            this.kinematicBody,
            this.draggedBody,
            {
                localAnchorA: new CANNON.Vec3(0, 0, 0),
                localAnchorB: localHitPoint,
                restLength: 0,
                stiffness: 80,
                damping: 18
            }
        );
        this.draggedBody.wakeUp();
    },

    onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },

    onMouseUp() {
        // 放開滑鼠，剪斷彈力繩，讓狗狗飛出去
        if (this.dragSpring) {
            this.dragSpring = null;
        }
        if (this.draggedBody && (this.dragVelocity.x || this.dragVelocity.y || this.dragVelocity.z)) {
            this.draggedBody.velocity.x += this.dragVelocity.x * this.throwBoost;
            this.draggedBody.velocity.y += this.dragVelocity.y * this.throwBoost;
            this.draggedBody.velocity.z += this.dragVelocity.z * this.throwBoost;
        }
        this.draggedBody = null;
        this.dragVelocity.set(0, 0, 0);
        this.hasPrevDragTarget = false;
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        const deltaTime = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        if (!window.isSiteEntered && this.enterScreen && this.enterScreen.classList.contains('hidden')) {
            window.isSiteEntered = true;
        }

        // 黑畫面的開場漂浮
        if (!window.isSiteEntered && this.mainDog && this.mainDog.mainBody) {
            this.setDogKinematic(this.mainDog);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this._mouseWorld)) {
                const mainBody = this.mainDog.mainBody;
                const lerp = 0.2;
                const nextX = mainBody.position.x + (this._mouseWorld.x - mainBody.position.x) * lerp;
                const nextY = mainBody.position.y + (this._mouseWorld.y - mainBody.position.y) * lerp;
                const nextZ = mainBody.position.z + (this._mouseWorld.z - mainBody.position.z) * lerp;
                const dx = nextX - mainBody.position.x;
                const dy = nextY - mainBody.position.y;
                const dz = nextZ - mainBody.position.z;

                for (const body of this.mainDog.bodies) {
                    body.position.x += dx;
                    body.position.y += dy;
                    body.position.z += dz;
                    body.velocity.set(0, 0, 0);
                    body.angularVelocity.set(0, 0, 0);
                }

                mainBody.angularVelocity.x = this.mouse.y * 1.2;
                mainBody.angularVelocity.y = this.mouse.x * 1.2;
            }
        }

        if (window.isSiteEntered && !this.gravityApplied) {
            this.world.gravity.set(0, -40, 0); 
            this.container.style.zIndex = '0'; 
            this.container.style.pointerEvents = 'auto'; 
            if (this.mainDog) this.setDogDynamic(this.mainDog);
            this.gravityApplied = true;
        }
        if (window.isSiteEntered) {
            if (this.world.gravity.y === 0) this.world.gravity.set(0, -40, 0);
            if (this.mainDog && this.mainDog.mainBody && this.mainDog.mainBody.type === CANNON.Body.KINEMATIC) {
                this.setDogDynamic(this.mainDog);
            }
        }

        // 🌟 更新隱形游標剛體的位置，彈力繩會自動把狗狗暴力扯過來
        if (this.dragSpring) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this._mouseWorld)) {
                this.kinematicBody.position.set(this._mouseWorld.x, this._mouseWorld.y, this._mouseWorld.z);
                if (this.hasPrevDragTarget && deltaTime > 0) {
                    const invDt = 1 / deltaTime;
                    this.dragVelocity.set(
                        (this._mouseWorld.x - this.prevDragTarget.x) * invDt,
                        (this._mouseWorld.y - this.prevDragTarget.y) * invDt,
                        (this._mouseWorld.z - this.prevDragTarget.z) * invDt
                    );
                }
                this.prevDragTarget.copy(this._mouseWorld);
                this.hasPrevDragTarget = true;
            }
            this.dragSpring.applyForce();
        }

        this.world.step(1/60, deltaTime, 6);

        for (const dog of this.dogs) {
            if (!dog || !dog.bodies) continue;
            for (const body of dog.bodies) {
                if (body.type === CANNON.Body.DYNAMIC) {
                    const isDragged = this.draggedBody === body;
                    if (!isDragged) {
                        const vx = body.velocity.x;
                        const vy = body.velocity.y;
                        const vz = body.velocity.z;
                        const wx = body.angularVelocity.x;
                        const wy = body.angularVelocity.y;
                        const wz = body.angularVelocity.z;
                        const v2 = vx * vx + vy * vy + vz * vz;
                        const w2 = wx * wx + wy * wy + wz * wz;
                        if (v2 < this.settleSpeedSq && w2 < this.settleAngularSpeedSq) {
                            body._restTime = (body._restTime || 0) + deltaTime;
                            if (body._restTime >= this.settleTime) {
                                body.velocity.set(0, 0, 0);
                                body.angularVelocity.set(0, 0, 0);
                                body.sleep();
                            }
                        } else {
                            body._restTime = 0;
                        }
                    } else {
                        body._restTime = 0;
                    }

                    const awx = body.angularVelocity.x;
                    const awy = body.angularVelocity.y;
                    const awz = body.angularVelocity.z;
                    const angSq = awx * awx + awy * awy + awz * awz;
                    const maxAngSq = this.maxAngularSpeed * this.maxAngularSpeed;
                    if (angSq > maxAngSq) {
                        const scale = this.maxAngularSpeed / Math.sqrt(angSq);
                        body.angularVelocity.x *= scale;
                        body.angularVelocity.y *= scale;
                        body.angularVelocity.z *= scale;
                    }
                }
            }
            this.syncDogMeshes(dog);
            this.updateDogArmRig(dog, deltaTime);
        }

        this.renderer.render(this.scene, this.camera);
    },

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        const vFov = this.camera.fov * Math.PI / 180;
        const height = 2 * Math.tan(vFov / 2) * Math.abs(this.camera.position.z);
        const width = height * this.camera.aspect;

        if (this.floorBody) this.floorBody.position.y = -height / 2;
        if (this.leftWallBody) this.leftWallBody.position.x = -width / 2;
        if (this.rightWallBody) this.rightWallBody.position.x = width / 2;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EnterScreenRagdoll.init());
} else {
    EnterScreenRagdoll.init();
}
