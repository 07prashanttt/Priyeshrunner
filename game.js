
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c9ed);
scene.fog = new THREE.Fog(0x86c9ed, 35, 120);

const camera = new THREE.PerspectiveCamera(
  65, innerWidth / innerHeight, 0.1, 200
);
camera.position.set(0, 8, 15);
camera.lookAt(0, 1, -10);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x526078, 2));

const sunlight = new THREE.DirectionalLight(0xffffff, 2);
sunlight.position.set(-5, 15, 8);
sunlight.castShadow = true;
scene.add(sunlight);

const mat = (color, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.65 });

const groundMat = mat(0x343c4b);
const railMat = mat(0x9da8b8, 0.7);
const goldMat = new THREE.MeshStandardMaterial({
  color: 0xffcc00, metalness: 0.65, roughness: 0.2
});

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 220), groundMat
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -90;
ground.receiveShadow = true;
scene.add(ground);

// Tracks and railway lines
for (let lane = -1; lane <= 1; lane++) {
  const x = lane * 3;

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.15, 220), railMat
    );
    rail.position.set(x + side * 0.85, 0.12, -90);
    scene.add(rail);
  }

  for (let z = -105; z < 20; z += 5) {
    const sleeper = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.12, 0.3),
      mat(0x604d40)
    );
    sleeper.position.set(x, 0.05, z);
    scene.add(sleeper);
  }
}

// Buildings
for (let i = 0; i < 30; i++) {
  for (const side of [-1, 1]) {
    const h = 5 + Math.random() * 15;
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(4, h, 5),
      mat([0x657d99, 0x52677e, 0x8796a5][i % 3])
    );
    building.position.set(
      side * (11 + Math.random() * 4),
      h / 2,
      -i * 5
    );
    scene.add(building);
  }
}

// Player character
const player = new THREE.Group();
scene.add(player);
player.position.set(0, 0, 5);

const blue = mat(0x087cff);
const skin = mat(0xffc18b);
const black = mat(0x172238);
const white = mat(0xffffff);

function part(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

const torso = part(
  player, new THREE.BoxGeometry(0.8, 1.1, 0.45),
  blue, 0, 1.5, 0
);

const head = part(
  player, new THREE.SphereGeometry(0.32, 16, 16),
  skin, 0, 2.3, 0
);

part(player, new THREE.BoxGeometry(0.68, 0.13, 0.5),
  black, 0, 2.57, 0);

const leftArm = part(
  player, new THREE.BoxGeometry(0.22, 0.8, 0.25),
  blue, -0.55, 1.5, 0
);
const rightArm = part(
  player, new THREE.BoxGeometry(0.22, 0.8, 0.25),
  blue, 0.55, 1.5, 0
);

const leftLeg = part(
  player, new THREE.BoxGeometry(0.3, 0.75, 0.35),
  black, -0.22, 0.45, 0
);
const rightLeg = part(
  player, new THREE.BoxGeometry(0.3, 0.75, 0.35),
  black, 0.22, 0.45, 0
);

const lanes = [-3, 0, 3];
let lane = 1;
let jumping = false;
let sliding = false;
let velocityY = 0;
let slideTimer = 0;
let running = false;
let dead = false;
let score = 0;
let coins = 0;
let speed = 22;
let spawnTimer = 0;
let coinTimer = 0;

const obstacles = [];
const coinObjects = [];

const scoreText = document.getElementById('score');
const coinText = document.getElementById('coins');

function makeObstacle(x, z, type) {
  const group = new THREE.Group();

  if (type === 0) {
    // Barrier
    part(group, new THREE.BoxGeometry(1.8, 1.2, 0.8),
      mat(0xff4a35), 0, 0.6, 0);
    part(group, new THREE.BoxGeometry(2, 0.13, 0.9),
      mat(0xffd500), 0, 1.1, 0);
  } else if (type === 1) {
    // Overhead obstacle - slide underneath
    part(group, new THREE.BoxGeometry(2, 0.35, 0.9),
      mat(0xff8c00), 0, 1.15, 0);
    part(group, new THREE.BoxGeometry(0.15, 1.2, 0.8),
      mat(0x444444), -0.85, 0.6, 0);
    part(group, new THREE.BoxGeometry(0.15, 1.2, 0.8),
      mat(0x444444), 0.85, 0.6, 0);
  } else {
    // Train
    part(group, new THREE.BoxGeometry(2.2, 3.2, 9),
      mat(0x1472b9), 0, 1.6, 0);
    part(group, new THREE.BoxGeometry(1.6, 0.8, 0.1),
      white, 0, 2.1, 4.56);
    part(group, new THREE.BoxGeometry(1.5, 0.15, 0.1),
      mat(0xffe600), 0, 0.5, 4.56);
  }

  group.position.set(x, 0, z);
  scene.add(group);
  obstacles.push({ group, type, x, active: true });
}

function makeCoinRow(x, z) {
  for (let i = 0; i < 5; i++) {
    const coin = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.12, 8, 20),
      goldMat
    );
    coin.position.set(x, 1.2, z - i * 1.7);
    scene.add(coin);
    coinObjects.push(coin);
  }
}

function spawn() {
  const x = lanes[Math.floor(Math.random() * 3)];
  makeObstacle(x, -85, Math.floor(Math.random() * 3));
}

function moveLeft() {
  if (running && !dead) lane = Math.max(0, lane - 1);
}

function moveRight() {
  if (running && !dead) lane = Math.min(2, lane + 1);
}

function jump() {
  if (running && !dead && !jumping && !sliding) {
    jumping = true;
    velocityY = 10;
  }
}

function slide() {
  if (running && !dead && !jumping && !sliding) {
    sliding = true;
    slideTimer = 0.8;
    player.scale.y = 0.5;
  }
}

document.getElementById('leftBtn').onclick = moveLeft;
document.getElementById('rightBtn').onclick = moveRight;
document.getElementById('jumpBtn').onclick = jump;
document.getElementById('slideBtn').onclick = slide;

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft();
  if (e.key === 'ArrowRight' || e.key === 'd') moveRight();
  if (e.key === 'ArrowUp' || e.key === ' ') jump();
  if (e.key === 'ArrowDown' || e.key === 's') slide();
});

// Mobile swipe controls
let touchX = 0, touchY = 0;

renderer.domElement.addEventListener('touchstart', e => {
  touchX = e.changedTouches[0].clientX;
  touchY = e.changedTouches[0].clientY;
}, { passive: true });

renderer.domElement.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 30) moveRight();
    if (dx < -30) moveLeft();
  } else {
    if (dy < -30) jump();
    if (dy > 30) slide();
  }
}, { passive: true });

function gameOver() {
  dead = true;
  running = false;
  document.getElementById('finalScore').textContent =
    Math.floor(score);
  document.getElementById('finalCoins').textContent = coins;
  document.getElementById('gameOver').classList.remove('hidden');
}

function resetGame() {
  obstacles.forEach(o => scene.remove(o.group));
  coinObjects.forEach(c => scene.remove(c));
  obstacles.length = 0;
  coinObjects.length = 0;

  lane = 1;
  player.position.set(0, 0, 5);
  player.scale.y = 1;
  jumping = false;
  sliding = false;
  velocityY = 0;
  score = 0;
  coins = 0;
  speed = 22;
  spawnTimer = 0;
  coinTimer = 0;
  dead = false;
  running = true;

  scoreText.textContent = '0';
  coinText.textContent = '0';

  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOver').classList.add('hidden');
}

document.getElementById('startBtn').onclick = resetGame;
document.getElementById('restartBtn').onclick = resetGame;

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.04);

  if (running && !dead) {
    score += dt * speed;
    speed = Math.min(38, 22 + score / 300);
    spawnTimer += dt;
    coinTimer += dt;

    if (spawnTimer > Math.max(0.65, 1.5 - score / 1500)) {
      spawn();
      spawnTimer = 0;
    }

    if (coinTimer > 2) {
      makeCoinRow(lanes[Math.floor(Math.random() * 3)], -85);
      coinTimer = 0;
    }

    // Smooth lane movement
    player.position.x +=
      (lanes[lane] - player.position.x) * Math.min(1, dt * 12);

    // Jump physics
    if (jumping) {
      player.position.y += velocityY * dt;
      velocityY -= 25 * dt;

      if (player.position.y <= 0) {
        player.position.y = 0;
        jumping = false;
        velocityY = 0;
      }
    }

    // Slide
    if (sliding) {
      slideTimer -= dt;
      if (slideTimer <= 0) {
        sliding = false;
        player.scale.y = 1;
      }
    }

    // Running animation
    if (!jumping && !sliding) {
      const t = performance.now() * 0.012;
      leftLeg.rotation.x = Math.sin(t) * 0.65;
      rightLeg.rotation.x = -Math.sin(t) * 0.65;
      leftArm.rotation.x = -Math.sin(t) * 0.6;
      rightArm.rotation.x = Math.sin(t) * 0.6;
    }

    // Move obstacles and check collisions
    for (const o of obstacles) {
      o.group.position.z += speed * dt;

      if (o.active &&
          Math.abs(o.group.position.z - player.position.z) < 1.1 &&
          Math.abs(o.x - player.position.x) < 1.2) {

        const hit = o.type === 0
          ? player.position.y < 1.15
          : o.type === 1
            ? !sliding
            : true;

        if (hit) gameOver();
        o.active = false;
      }
    }

    // Move and collect coins
    for (const c of coinObjects) {
      c.position.z += speed * dt;
      c.rotation.y += dt * 5;

      if (c.visible &&
          Math.abs(c.position.z - player.position.z) < 1.3 &&
          Math.abs(c.position.x - player.position.x) < 1.3) {
        c.visible = false;
        coins++;
        coinText.textContent = coins;
      }
    }

    // Clean up passed objects
    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (obstacles[i].group.position.z > 20) {
        scene.remove(obstacles[i].group);
        obstacles.splice(i, 1);
      }
    }

    for (let i = coinObjects.length - 1; i >= 0; i--) {
      if (coinObjects[i].position.z > 20 ||
          !coinObjects[i].visible) {
        scene.remove(coinObjects[i]);
        coinObjects.splice(i, 1);
      }
    }

    scoreText.textContent = Math.floor(score);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
});

animate();
