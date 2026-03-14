// 初始化 Three.js 場景、相機、渲染器
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('enter-screen').appendChild(renderer.domElement);

// 建立 3D 文字
const fontLoader = new THREE.FontLoader();
fontLoader.load('assets/fonts/your-font.json', (font) => {
    const textGeometry = new THREE.TextGeometry('[ CLICK TO ENTER ]', {
        font: font,
        size: 0.5,
        height: 0.2,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.02,
        bevelOffset: 0,
        bevelSegments: 5
    });
    
    // 建立材質 (這裡可以用普通的材質代替，之後再升級為毛玻璃 Shader)
    const textMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    
    // 將文字加入場景
    scene.add(textMesh);
});

// 監聽滑鼠移動事件
const mouse = new THREE.Vector2();
window.addEventListener('mousemove', (event) => {
    // 轉換為歸一化設備座標 (-1 到 1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// 渲染循環
const animate = () => {
    requestAnimationFrame(animate);
    
    // 在這裡實現平滑跟隨邏輯
    // textMesh.rotation.y += (mouse.x * 0.1 - textMesh.rotation.y) * 0.05;
    // textMesh.rotation.x += (-mouse.y * 0.1 - textMesh.rotation.x) * 0.05;
    
    renderer.render(scene, camera);
};

animate();