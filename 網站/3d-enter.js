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
        this.throwBoost = 0.22;
        this.maxThrowSpeed = 8.5;
        this.throwAngularBoost = 0.06;
        this.maxThrowAngularSpeed = 11;
        this.maxDragVelocity = 10;
        this.dragVelocity = new CANNON.Vec3(0, 0, 0);
        this.dragLocalHitPoint = new CANNON.Vec3(0, 0, 0);
        this.prevDragTarget = new THREE.Vector3();
        this.hasPrevDragTarget = false;
        this._mouseWorld = new THREE.Vector3();
        this.lastTime = performance.now();
        this.baseLinearDamping = 0.06;
        this.baseAngularDamping = 0.08;
        this.dragLinearDamping = 0.16;
        this.dragAngularDamping = 0.18;
        this.settleSpeedSq = 0.0025;
        this.settleAngularSpeedSq = 0.0025;
        this.settleTime = 1.2;
        this.maxAngularSpeed = 28;
        this.partNames = ['Body'];
        this.partNameAliases = {
            Body: ['Cube.001_4'],
            Head: ['Cube_0'],
            Hvost: ['Cube.006_13']
        };

        this.partInfo = null;
        this.armSwingTime = 0;
        this.baseDogRotation = new THREE.Quaternion();
        this.baseDogRotationInv = new THREE.Quaternion();
        this.baseDogOffset = new THREE.Vector3();
        this.bodyAnchorLocal = new THREE.Vector3();

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
        this.world.solver.iterations = 40;
        this.world.solver.tolerance = 0.0001;

        this.dogs = []; 
        this.dogMaterial = new CANNON.Material('dog');
        this.floorMaterial = new CANNON.Material('floor');
        const dogContact = new CANNON.ContactMaterial(this.dogMaterial, this.floorMaterial, {
            friction: 0.25,
            restitution: 0.05,
            contactEquationStiffness: 8e5,
            contactEquationRelaxation: 8,
            frictionEquationStiffness: 2e5,
            frictionEquationRelaxation: 6
        });
        this.world.addContactMaterial(dogContact);

        const dogDogContact = new CANNON.ContactMaterial(this.dogMaterial, this.dogMaterial, {
            friction: 0.68,
            restitution: 0.0,
            contactEquationStiffness: 1.8e6,
            contactEquationRelaxation: 5,
            frictionEquationStiffness: 5e5,
            frictionEquationRelaxation: 4
        });
        this.world.addContactMaterial(dogDogContact);

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
                model.traverse((node) => {
                    node.name = makeUniqueName(node.name || node.parent?.name || `Part_${autoIndex}`);
                    if (node.isMesh) node.frustumCulled = false;
                    autoIndex += 1;
                });

                this.normalizeFoxTemplate(model);

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
                console.warn('Failed to load assets/model.glb.', err);
            }
        );

        window.spawnSolidDog = () => {
            this.pendingSpawns += 1;
        };

        this.raycaster = new THREE.Raycaster();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); 
        this.draggedBody = null;
        this.draggedDog = null;
        this.mouse = new THREE.Vector2();

        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => this.onMouseUp());
        window.addEventListener('resize', () => this.onWindowResize());

        this.animate();
    },

    getDefaultPartSize(name) {
        return new THREE.Vector3(0.9, 0.9, 0.9);
    },

    findBodyAnchorNode(group) {
        if (!group) return null;
        const bodyAliases = ['bodyfox', 'body_fox', 'body', 'spine01', 'spine_01', 'spine'];
        let meshHit = null;
        group.traverse((node) => {
            if (meshHit || !node.isMesh) return;
            const nodeName = (node.name || '').toLowerCase().replace(/[\s_\.\-]/g, '');
            if (bodyAliases.some(alias => nodeName === alias || nodeName.startsWith(alias) || nodeName.includes(alias))) {
                meshHit = node;
            }
        });
        return meshHit;
    },

    normalizeFoxTemplate(model) {
        const wrapper = new THREE.Group();
        wrapper.name = 'FoxRoot';
        wrapper.add(model);
        wrapper.updateMatrixWorld(true);

        const bodyNode = this.findBodyAnchorNode(model) || model;
        const bodyBox = new THREE.Box3().setFromObject(bodyNode);
        const bodyCenter = new THREE.Vector3();
        const bodySize = new THREE.Vector3();
        bodyBox.getCenter(bodyCenter);
        bodyBox.getSize(bodySize);

        model.position.sub(bodyCenter);
        model.updateMatrixWorld(true);
        wrapper.updateMatrixWorld(true);

        const bodyLongest = Math.max(bodySize.x, bodySize.y, bodySize.z, 1e-4);
        const targetBodyLongest = 1.15;
        const normalizeScale = targetBodyLongest / bodyLongest;
        wrapper.scale.setScalar(normalizeScale);
        wrapper.updateMatrixWorld(true);

        const visualBox = new THREE.Box3().setFromObject(wrapper);
        const visualSize = new THREE.Vector3();
        visualBox.getSize(visualSize);

        this.baseDogGroup = wrapper;
        this.dogSize = visualSize;
        this.baseDogOffset.set(0, 0, 0);
        this.bodyAnchorLocal.set(0, 0, 0);
        this.baseDogRotation.copy(wrapper.quaternion);
        this.baseDogRotationInv.copy(this.baseDogRotation).invert();
        this.partInfo = this.extractPartInfo(wrapper);
    },

    findPartNode(group, partName) {
    if (!group || !partName) return null;

    const aliases = [partName, ...(this.partNameAliases?.[partName] || [])];

    // 先做精確名稱匹配
    for (const name of aliases) {
        const exact = group.getObjectByName(name);
        if (exact) return exact;
    }

    const normalize = (v) => (v || '')
        .toLowerCase()
        .replace(/[\s_.-]/g, '');

    const targets = aliases.map(normalize);

    let hit = null;
    group.traverse((node) => {
        if (hit) return;

        const nodeName = normalize(node.name);
        if (!nodeName) return;

        for (const target of targets) {
            if (
                nodeName === target ||
                nodeName.startsWith(target) ||
                nodeName.includes(target)
            ) {
                hit = node;
                return;
            }
        }
    });

    return hit;
},

    extractPartInfo(group) {
        const info = {};
        if (!group) return info;

        const rootQuat = group.quaternion.clone();
        const rootQuatInv = rootQuat.clone().invert();
        for (const name of this.partNames) {
            const node = this.findPartNode(group, name);
            if (!node) continue;
            const box = new THREE.Box3().setFromObject(node);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            const nodeWorldPos = new THREE.Vector3();
            const nodeWorldScale = new THREE.Vector3();
            
            box.getSize(size);
            box.getCenter(center);
            
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
            info[name] = { size, localCenter, localQuat, nodeCenterOffset };
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
        // 🌟 Patch 1: 留空！不要強制鎖定狀態，讓狐狸在無重力下自然保持動態
    },

    setDogDynamic(dog) {
        if (!dog || !dog.bodies) return;
        for (const body of dog.bodies) this.setBodyDynamic(body);
        this.setDogDragState(dog, false);
    },

    clampVec3Magnitude(vec, maxLen) {
        if (!vec || maxLen <= 0) return vec;
        const lenSq = vec.x * vec.x + vec.y * vec.y + vec.z * vec.z;
        if (lenSq <= maxLen * maxLen || lenSq === 0) return vec;
        const scale = maxLen / Math.sqrt(lenSq);
        vec.x *= scale;
        vec.y *= scale;
        vec.z *= scale;
        return vec;
    },

    setDogDragState(dog, isDragged) {
        if (!dog || !dog.bodies) return;
        const linear = isDragged ? this.dragLinearDamping : this.baseLinearDamping;
        const angular = isDragged ? this.dragAngularDamping : this.baseAngularDamping;
        for (const body of dog.bodies) {
            if (!body) continue;
            body.linearDamping = linear;
            body.angularDamping = angular;
            if (isDragged) body.wakeUp();
        }
        dog.isDragged = isDragged;
    },

    resolveDogByBody(body) {
        if (!body || !this.dogs) return null;
        for (const dog of this.dogs) {
            if (dog && dog.bodies && dog.bodies.includes(body)) return dog;
        }
        return null;
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
    const armRig = this.setupDogArmRig(dogGroup);

    const fullSize = (this.dogSize || new THREE.Vector3(1, 1, 1)).clone().multiplyScalar(scale);

    const body = new CANNON.Body({
        mass: 6.8,
        position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
        material: this.dogMaterial
    });

    const torsoSize = new THREE.Vector3(
    Math.max(0.62, fullSize.x * 0.68),
    Math.max(0.38, fullSize.y * 0.48),
    Math.max(0.62, fullSize.z * 0.44)
);

const chestSize = new THREE.Vector3(
    Math.max(0.48, fullSize.x * 0.50),
    Math.max(0.30, fullSize.y * 0.32),
    Math.max(0.38, fullSize.z * 0.26)
);

const hipSize = new THREE.Vector3(
    Math.max(0.48, fullSize.x * 0.50),
    Math.max(0.28, fullSize.y * 0.30),
    Math.max(0.38, fullSize.z * 0.26)
);

const bellySize = new THREE.Vector3(
    Math.max(0.40, fullSize.x * 0.44),
    Math.max(0.18, fullSize.y * 0.18),
    Math.max(0.62, fullSize.z * 0.46)
);

// 主身體
body.addShape(
    new CANNON.Box(new CANNON.Vec3(
        torsoSize.x * 0.5,
        torsoSize.y * 0.5,
        torsoSize.z * 0.5
    )),
    new CANNON.Vec3(0, fullSize.y * 0.02, 0)
);

// 前胸 / 頭根
body.addShape(
    new CANNON.Box(new CANNON.Vec3(
        chestSize.x * 0.5,
        chestSize.y * 0.5,
        chestSize.z * 0.5
    )),
    new CANNON.Vec3(0, fullSize.y * 0.08, fullSize.z * 0.26)
);

// 屁股 / 後半身
body.addShape(
    new CANNON.Box(new CANNON.Vec3(
        hipSize.x * 0.5,
        hipSize.y * 0.5,
        hipSize.z * 0.5
    )),
    new CANNON.Vec3(0, 0, -fullSize.z * 0.26)
);

// 下腹 / 腿根支撐
body.addShape(
    new CANNON.Box(new CANNON.Vec3(
        bellySize.x * 0.5,
        bellySize.y * 0.5,
        bellySize.z * 0.5
    )),
    new CANNON.Vec3(0, -fullSize.y * 0.20, 0)
);

const plushSize = torsoSize.clone();

    body.addShape(new CANNON.Box(new CANNON.Vec3(
        plushSize.x * 0.5,
        plushSize.y * 0.5,
        plushSize.z * 0.5
    )));

    body.quaternion.set(rootQuat.x, rootQuat.y, rootQuat.z, rootQuat.w);
    body.linearDamping = this.baseLinearDamping;
    body.angularDamping = this.baseAngularDamping;
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.25;
    body.sleepTimeLimit = 0.6;
    body._restTime = 0;
    body._baseMass = 6.8;

    if (!isFirst) {
        body.velocity.set((Math.random() - 0.5) * 2.0, -2.0, (Math.random() - 0.5) * 2.0);
        body.angularVelocity.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4);
    }

    this.world.addBody(body);
    bodies.push(body);

    parts.Body = {
        node: dogGroup,
        body,
        size: plushSize,
        info: null
    };

    return {
        group: dogGroup,
        parts,
        bodies,
        constraints,
        scale,
        rootQuat,
        rootQuatInv,
        mainBody: body,
        armRig
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

    const bodyPart = parts['Body'];
    if (!bodyPart || !bodyPart.body || !bodyPart.size) return;

    const body = bodyPart.body;
    const bodyHalf = new CANNON.Vec3(
        bodyPart.size.x * 0.5,
        bodyPart.size.y * 0.5,
        bodyPart.size.z * 0.5
    );

    const connect = (name, pivotOnPart, pivotOnBody) => {
        const part = parts[name];
        if (!part || !part.body) return;
        addP2P(part.body, body, pivotOnPart, pivotOnBody);
    };

    // 頭：從頭的下方接到身體前上方
    if (parts.Head?.size) {
        const s = parts.Head.size;
        connect(
            'Head',
            new CANNON.Vec3(0, -s.y * 0.35, 0),
            new CANNON.Vec3(0, bodyHalf.y * 0.28, bodyHalf.z * 0.42)
        );
    }

    // 尾巴：從尾巴前端接到身體後方
    if (parts.Hvost?.size) {
        const s = parts.Hvost.size;
        connect(
            'Hvost',
            new CANNON.Vec3(0, 0, s.z * 0.35),
            new CANNON.Vec3(0, 0, -bodyHalf.z * 0.48)
        );
    }

    // 前左腿
    if (parts.LegL1?.size) {
        const s = parts.LegL1.size;
        connect(
            'LegL1',
            new CANNON.Vec3(0, s.y * 0.42, 0),
            new CANNON.Vec3(bodyHalf.x * 0.34, -bodyHalf.y * 0.40, bodyHalf.z * 0.28)
        );
    }

    // 前右腿
    if (parts.LegR1?.size) {
        const s = parts.LegR1.size;
        connect(
            'LegR1',
            new CANNON.Vec3(0, s.y * 0.42, 0),
            new CANNON.Vec3(-bodyHalf.x * 0.34, -bodyHalf.y * 0.40, bodyHalf.z * 0.28)
        );
    }

    // 後左腿
    if (parts.LegL2?.size) {
        const s = parts.LegL2.size;
        connect(
            'LegL2',
            new CANNON.Vec3(0, s.y * 0.42, 0),
            new CANNON.Vec3(bodyHalf.x * 0.34, -bodyHalf.y * 0.40, -bodyHalf.z * 0.28)
        );
    }

    // 後右腿
    if (parts.LegR2?.size) {
        const s = parts.LegR2.size;
        connect(
            'LegR2',
            new CANNON.Vec3(0, s.y * 0.42, 0),
            new CANNON.Vec3(-bodyHalf.x * 0.34, -bodyHalf.y * 0.40, -bodyHalf.z * 0.28)
        );
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
    if (!dog || !dog.group || !dog.mainBody) return;

    dog.group.position.set(
        dog.mainBody.position.x,
        dog.mainBody.position.y,
        dog.mainBody.position.z
    );

    dog.group.quaternion.set(
        dog.mainBody.quaternion.x,
        dog.mainBody.quaternion.y,
        dog.mainBody.quaternion.z,
        dog.mainBody.quaternion.w
    );
},

setupDogArmRig(dogGroup) {
    const headBone = this.findPartNode(dogGroup, 'Head');
    const tailBone = this.findPartNode(dogGroup, 'Hvost');

    if (!headBone && !tailBone) return null;

    return {
        headBone,
        tailBone,
        headBaseQuat: headBone ? headBone.quaternion.clone() : null,
        tailBaseQuat: tailBone ? tailBone.quaternion.clone() : null,

        headPitch: 0, headPitchVel: 0,
        headYaw: 0, headYawVel: 0,
        headRoll: 0, headRollVel: 0,

        tailPitch: 0, tailPitchVel: 0,
        tailYaw: 0, tailYawVel: 0
    };
},

updateDogArmRig(dog, deltaTime) {
    if (!dog || !dog.armRig || !dog.mainBody) return;

    const rig = dog.armRig;
    const body = dog.mainBody;
    const dt = Math.max(1 / 240, Math.min(deltaTime || (1 / 60), 0.05));

    const bodyQuat = new THREE.Quaternion(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
    );
    const invBodyQuat = bodyQuat.clone().invert();

    const velLocal = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z)
        .applyQuaternion(invBodyQuat);
    const angLocal = new THREE.Vector3(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z)
        .applyQuaternion(invBodyQuat);

    const springStep = (value, velocity, target, frequency, damping, dt) => {
        const omega = Math.max(0.001, frequency) * Math.PI * 2;
        const accel = (target - value) * omega * omega - (2 * damping * omega * velocity);
        velocity += accel * dt;
        value += velocity * dt;
        return { value, velocity };
    };

    const integrate = (key, target, freq, damp) => {
        const velKey = `${key}Vel`;
        const next = springStep(rig[key] || 0, rig[velKey] || 0, target, freq, damp, dt);
        rig[key] = next.value;
        rig[velKey] = next.velocity;
    };

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    // 頭：比較輕微
    integrate('headPitch', clamp(-velLocal.y * 0.08 - angLocal.x * 0.10, -0.30, 0.30), 2.2, 0.82);
    integrate('headYaw',   clamp( velLocal.x * 0.05 + angLocal.y * 0.12, -0.35, 0.35), 2.3, 0.80);
    integrate('headRoll',  clamp(-velLocal.x * 0.03 - angLocal.z * 0.08, -0.18, 0.18), 2.0, 0.84);

    // 尾巴：比較明顯
    integrate('tailPitch', clamp(-velLocal.y * 0.10 + Math.abs(velLocal.z) * 0.03, -0.40, 0.40), 2.8, 0.74);
    integrate('tailYaw',   clamp(-velLocal.x * 0.10 - angLocal.y * 0.20, -0.70, 0.70), 3.0, 0.68);

    const applyBone = (bone, baseQuat, ex = 0, ey = 0, ez = 0, blend = 0.18) => {
        if (!bone || !baseQuat) return;
        const offsetQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(ex, ey, ez, 'XYZ')
        );
        const targetQuat = baseQuat.clone().multiply(offsetQuat);
        bone.quaternion.slerp(targetQuat, Math.min(1, dt * (blend * 60)));
    };

    applyBone(rig.headBone, rig.headBaseQuat, rig.headPitch, rig.headYaw, rig.headRoll, 0.16);
    applyBone(rig.tailBone, rig.tailBaseQuat, rig.tailPitch, rig.tailYaw, 0, 0.22);
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
        if (!this.baseDogGroup) return;
        if (this.dogs.length >= this.maxDogs) {
            let removeIndex = this.dogs.findIndex(d => d !== this.mainDog);
            if (removeIndex === -1) removeIndex = 0;
            const oldDog = this.dogs.splice(removeIndex, 1)[0];
            if (oldDog) {
                if (this.draggedDog === oldDog) {
                    this.dragSpring = null;
                    this.draggedBody = null;
                    this.draggedDog = null;
                    this.dragVelocity.set(0, 0, 0);
                    this.hasPrevDragTarget = false;
                }
                if (oldDog.bodies) {
                    for (const b of oldDog.bodies) this.world.removeBody(b);
                }
                if (oldDog.group) this.scene.remove(oldDog.group);
            }
        }

        const scale = 1.0; 
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

        if (this.draggedDog) this.setDogDragState(this.draggedDog, false);
        if (this.dragSpring) this.dragSpring = null;

        this.draggedBody = hit.ragdoll.body;
        this.draggedDog = hit.ragdoll.dog || this.resolveDogByBody(this.draggedBody);

        const hitPointWorld = hit.intersect.point;
        this.kinematicBody.position.copy(hitPointWorld);

        const worldHit = new CANNON.Vec3(hitPointWorld.x, hitPointWorld.y, hitPointWorld.z);
        const localHitPoint = new CANNON.Vec3();
        this.draggedBody.quaternion.inverse().vmult(worldHit.vsub(this.draggedBody.position), localHitPoint);
        this.dragLocalHitPoint.copy(localHitPoint);

        this.dragSpring = new CANNON.Spring(
            this.kinematicBody,
            this.draggedBody,
            {
                localAnchorA: new CANNON.Vec3(0, 0, 0),
                localAnchorB: localHitPoint,
                restLength: 0,
                stiffness: 16,
                damping: 4
            }
        );
        if (this.draggedDog) this.setDogDragState(this.draggedDog, true);
        this.draggedBody.wakeUp();
        this.dragVelocity.set(0, 0, 0);
        this.prevDragTarget.copy(hitPointWorld);
        this.hasPrevDragTarget = true;
    },

    onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },

    onMouseUp() {
        const releasedBody = this.draggedBody;
        const releasedDog = this.draggedDog || this.resolveDogByBody(releasedBody);

        if (this.dragSpring) this.dragSpring = null;
        if (releasedDog) this.setDogDragState(releasedDog, false);

        if (releasedBody && (this.dragVelocity.x || this.dragVelocity.y || this.dragVelocity.z)) {
            const throwVel = new CANNON.Vec3(
                this.dragVelocity.x * this.throwBoost,
                this.dragVelocity.y * this.throwBoost,
                this.dragVelocity.z * this.throwBoost
            );
            this.clampVec3Magnitude(throwVel, this.maxThrowSpeed);

            const targetBody = (releasedDog && releasedDog.mainBody) ? releasedDog.mainBody : releasedBody;
            targetBody.velocity.x += throwVel.x;
            targetBody.velocity.y += throwVel.y;
            targetBody.velocity.z += throwVel.z;
            targetBody.wakeUp();

            const leverWorld = new CANNON.Vec3();
            releasedBody.quaternion.vmult(this.dragLocalHitPoint, leverWorld);
            const spinImpulse = new CANNON.Vec3(
                (leverWorld.y * throwVel.z - leverWorld.z * throwVel.y) * this.throwAngularBoost,
                (leverWorld.z * throwVel.x - leverWorld.x * throwVel.z) * this.throwAngularBoost,
                (leverWorld.x * throwVel.y - leverWorld.y * throwVel.x) * this.throwAngularBoost
            );
            this.clampVec3Magnitude(spinImpulse, this.maxThrowAngularSpeed);
            releasedBody.angularVelocity.x += spinImpulse.x;
            releasedBody.angularVelocity.y += spinImpulse.y;
            releasedBody.angularVelocity.z += spinImpulse.z;
        }

        this.draggedBody = null;
        this.draggedDog = null;
        this.dragVelocity.set(0, 0, 0);
        this.dragLocalHitPoint.set(0, 0, 0);
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

    // 🌟 完美的零重力漂浮，不會造成物理引擎崩潰
        if (!window.isSiteEntered && this.mainDog && this.mainDog.mainBody) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this._mouseWorld)) {
                const mainBody = this.mainDog.mainBody;
                
                // 🌟 放棄手動改座標，直接給予速度！這樣物理的彈力繩才會自動把四肢溫柔地拉過去！
                mainBody.velocity.x = (this._mouseWorld.x - mainBody.position.x) * 5;
                mainBody.velocity.y = (this._mouseWorld.y - mainBody.position.y) * 5;
                mainBody.velocity.z = (this._mouseWorld.z - mainBody.position.z) * 5;
                this.clampVec3Magnitude(mainBody.velocity, 20);

                mainBody.angularVelocity.x = this.mouse.y * 1.5;
                mainBody.angularVelocity.y = this.mouse.x * 1.5;
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

        if (this.dragSpring) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this._mouseWorld)) {
                this.kinematicBody.position.set(this._mouseWorld.x, this._mouseWorld.y, this._mouseWorld.z);
                if (this.hasPrevDragTarget && deltaTime > 0) {
                    const invDt = 1 / deltaTime;
                    const rawVelocity = new CANNON.Vec3(
                        (this._mouseWorld.x - this.prevDragTarget.x) * invDt,
                        (this._mouseWorld.y - this.prevDragTarget.y) * invDt,
                        (this._mouseWorld.z - this.prevDragTarget.z) * invDt
                    );
                    this.clampVec3Magnitude(rawVelocity, this.maxDragVelocity);
                    const blend = Math.min(1, deltaTime * 18);
                    this.dragVelocity.x += (rawVelocity.x - this.dragVelocity.x) * blend;
                    this.dragVelocity.y += (rawVelocity.y - this.dragVelocity.y) * blend;
                    this.dragVelocity.z += (rawVelocity.z - this.dragVelocity.z) * blend;
                } else {
                    this.dragVelocity.set(0, 0, 0);
                }
                this.prevDragTarget.copy(this._mouseWorld);
                this.hasPrevDragTarget = true;
            } else {
                this.dragVelocity.set(0, 0, 0);
                this.hasPrevDragTarget = false;
            }
            this.dragSpring.applyForce();
        }

        this.world.step(1/60, deltaTime, 6);

        for (const dog of this.dogs) {
    if (!dog || !dog.bodies) continue;
    for (const body of dog.bodies) {
        if (body.type === CANNON.Body.DYNAMIC) {
            const isDragged = (this.draggedDog && this.draggedDog === dog) || this.draggedBody === body;
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