import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { SIZE } from './hi3d-rules.mjs';

const COLORS = ['#439e7c', '#4d98bf', '#9668bc', '#ce779a', '#d9a83e', '#d98b62'];
const STEP = .86;
const GEM_HEIGHT = .39;

function roundedShape(width, height, radius) {
  const shape = new THREE.Shape();
  const left = -width / 2;
  const bottom = -height / 2;
  shape.moveTo(left + radius, bottom);
  shape.lineTo(left + width - radius, bottom);
  shape.quadraticCurveTo(left + width, bottom, left + width, bottom + radius);
  shape.lineTo(left + width, bottom + height - radius);
  shape.quadraticCurveTo(left + width, bottom + height, left + width - radius, bottom + height);
  shape.lineTo(left + radius, bottom + height);
  shape.quadraticCurveTo(left, bottom + height, left, bottom + height - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return shape;
}

function extrude(shape, depth, bevel = .03) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 12 });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function cutGem(sides, width, table, top, bottom, angle = 0) {
  const points = [];
  const upper = [];
  const middle = [];
  for (let side = 0; side < sides; side++) {
    const theta = side / sides * Math.PI * 2 + angle;
    upper.push([Math.cos(theta) * table, Math.sin(theta) * table, top]);
    middle.push([Math.cos(theta) * width, Math.sin(theta) * width, 0]);
  }
  const triangle = (first, second, third) => points.push(...first, ...second, ...third);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    triangle([0, 0, top], upper[side], upper[next]);
    triangle(upper[side], middle[side], middle[next]);
    triangle(upper[side], middle[next], upper[next]);
    triangle(middle[side], [0, 0, bottom], middle[next]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function heartGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.31);
  shape.bezierCurveTo(-.08, -.21, -.36, -.04, -.36, .15);
  shape.bezierCurveTo(-.36, .36, -.12, .43, 0, .23);
  shape.bezierCurveTo(.12, .43, .36, .36, .36, .15);
  shape.bezierCurveTo(.36, -.04, .08, -.21, 0, -.31);
  return extrude(shape, .22, .035);
}

export class GemScene {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.camera = new THREE.OrthographicCamera(-4.5, 4.5, 4.5, -4.5, .1, 100);
    this.camera.position.set(0, -4.4, 24);
    this.camera.lookAt(0, 0, 0);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.gems = new Map();
    this.rings = [];
    this.particles = [];
    this.tweens = [];
    this.time = 0;
    this.lastFrame = performance.now();
    this.disposed = false;
    this.selected = -1;
    this.hovered = -1;
    this.hinted = [];
    this.board = [];
    this.environment = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = this.environment.fromScene(room, .04);
    this.scene.environment = this.environmentTarget.texture;
    room.dispose();
    this.scene.add(new THREE.HemisphereLight(0xfffcf3, 0xb5bb9d, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-4, 5, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.normalBias = .03;
    key.shadow.bias = -.0001;
    key.shadow.radius = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xeee3ff, 1.8);
    rim.position.set(6, -3, 5);
    this.scene.add(rim);
    this.gemMaterials = COLORS.map(color => new THREE.MeshPhysicalMaterial({ color, metalness: .12, roughness: .17, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.4, flatShading: true }));
    this.prismMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9d9f5, metalness: .18, roughness: .12, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [100, 600], envMapIntensity: 1.8 });
    this.geometries = [
      cutGem(6, .34, .17, .21, -.24, Math.PI / 6),
      cutGem(8, .35, .24, .16, -.23, Math.PI / 8),
      cutGem(4, .40, .10, .28, -.22, 0),
      heartGeometry(),
      new THREE.IcosahedronGeometry(.34, 1),
      extrude(roundedShape(.49, .49, .12), .28, .055),
    ];
    this.prismGeometry = new THREE.OctahedronGeometry(.40, 0);
    this.markerMaterial = new THREE.MeshStandardMaterial({ color: 0xfff9ec, roughness: .32, metalness: .22, emissive: 0xe7e4da, emissiveIntensity: .2 });
    this.stripeGeometry = new THREE.CylinderGeometry(.019, .019, .50, 6);
    this.markerSphereGeometry = new THREE.SphereGeometry(.07, 10, 8);
    this.particleGeometry = new THREE.OctahedronGeometry(.047);
    this.particleMaterials = COLORS.map(color => new THREE.MeshBasicMaterial({ color, transparent: true }));
    this.prismParticleMaterial = new THREE.MeshBasicMaterial({ color: 0xcfabdf, transparent: true });
    this.buildBoard();
    this.buildFrost();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  buildBoard() {
    const base = new THREE.Mesh(extrude(roundedShape(7.72, 7.72, .33), .21, .045), new THREE.MeshStandardMaterial({ color: 0xcdd6bf, roughness: .64 }));
    base.position.z = -.16;
    base.receiveShadow = true;
    this.scene.add(base);
    const surface = new THREE.Mesh(extrude(roundedShape(7.62, 7.62, .30), .09, .02), new THREE.MeshStandardMaterial({ color: 0xe9e8da, roughness: .74 }));
    surface.position.z = -.018;
    surface.receiveShadow = true;
    this.scene.add(surface);
    const tileGeometry = extrude(roundedShape(.786, .786, .13), .035, .012);
    const tileMaterials = [new THREE.MeshStandardMaterial({ color: 0xf2f0e5, roughness: .65 }), new THREE.MeshStandardMaterial({ color: 0xecebdc, roughness: .65 })];
    const ringGeometry = new THREE.TorusGeometry(.365, .015, 6, 44);
    for (let index = 0; index < SIZE * SIZE; index++) {
      const position = this.position(index);
      const tile = new THREE.Mesh(tileGeometry, tileMaterials[(index + Math.floor(index / SIZE)) % 2]);
      tile.position.set(position.x, position.y, .061);
      tile.receiveShadow = true;
      this.scene.add(tile);
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xa695bd, transparent: true, opacity: .85, depthWrite: false }));
      ring.position.set(position.x, position.y, .12);
      ring.visible = false;
      this.scene.add(ring);
      this.rings.push(ring);
    }
    const dotMaterial = new THREE.MeshStandardMaterial({ color: 0xadb998, roughness: .45, metalness: .4 });
    const dotGeometry = new THREE.SphereGeometry(.027, 8, 6);
    for (const cornerX of [-3.62, 3.62]) {
      for (const cornerY of [-3.62, 3.62]) {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.set(cornerX, cornerY, .07);
        this.scene.add(dot);
      }
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.ShadowMaterial({ opacity: .11 }));
    ground.position.z = -.37;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  position(index) {
    return { x: (index % SIZE - (SIZE - 1) / 2) * STEP, y: ((SIZE - 1) / 2 - Math.floor(index / SIZE)) * STEP, z: GEM_HEIGHT };
  }

  buildFrost() {
    this.frost = Array(64).fill(0);
    this.frostGroups = [];
    const geometry = extrude(roundedShape(.72, .72, .1), .055, .014);
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 45);
    const crystalGeometry = new THREE.CylinderGeometry(.009, .009, .14, 5);
    const crystalMaterial = new THREE.MeshBasicMaterial({ color: 0x9ac6e4, transparent: true, opacity: .75 });
    for (let index = 0; index < 64; index++) {
      const group = new THREE.Group();
      const position = this.position(index);
      group.position.set(position.x, position.y, .17);
      const material = new THREE.MeshPhysicalMaterial({ color: 0xa2d7ef, roughness: .24, metalness: .1, transparent: true, opacity: .23, depthWrite: false });
      group.add(new THREE.Mesh(geometry, material));
      group.add(new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x82bfdf, transparent: true, opacity: .72 })));
      for (const corner of [-1, 1]) {
        for (let ray = 0; ray < 3; ray++) {
          const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
          crystal.rotation.z = ray * Math.PI / 3;
          crystal.position.set(corner * .265, .265, .055);
          group.add(crystal);
        }
      }
      group.visible = false;
      this.scene.add(group);
      this.frostGroups.push(group);
    }
  }

  setFrost(frost) {
    this.frost = frost.slice();
    this.frostGroups.forEach((group, index) => {
      group.visible = frost[index] > 0;
      group.children[0].material.opacity = frost[index] > 1 ? .44 : .23;
      group.children[1].material.color.set(frost[index] > 1 ? 0x4c98ca : 0x82bfdf);
    });
  }

  createGem(gem) {
    const group = new THREE.Group();
    group.userData.gemId = gem.id;
    group.userData.type = gem.type;
    group.userData.special = gem.special;
    group.userData.baseZ = GEM_HEIGHT;
    const mesh = new THREE.Mesh(gem.special === 'prism' ? this.prismGeometry : this.geometries[gem.type], gem.special === 'prism' ? this.prismMaterial : this.gemMaterials[gem.type]);
    if (gem.type === 4) mesh.rotation.set(.3, .1, .18);
    if (gem.type === 2) mesh.scale.y = 1.09;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    group.add(mesh);
    if (gem.special === 'row' || gem.special === 'col') {
      for (const offset of [-.07, .07]) {
        const stripe = new THREE.Mesh(this.stripeGeometry, this.markerMaterial);
        if (gem.special === 'row') { stripe.rotation.z = Math.PI / 2; stripe.position.y = offset; }
        else stripe.position.x = offset;
        stripe.position.z = .27;
        group.add(stripe);
      }
    }
    if (gem.special === 'burst') {
      const center = new THREE.Mesh(this.markerSphereGeometry, this.markerMaterial);
      center.position.z = .30;
      group.add(center);
      for (let offset = 0; offset < 4; offset++) {
        const ray = new THREE.Mesh(this.stripeGeometry, this.markerMaterial);
        ray.scale.y = .44;
        ray.rotation.z = offset * Math.PI / 4;
        ray.position.z = .27;
        group.add(ray);
      }
    }
    if (gem.special === 'prism') {
      const orbitGeometry = new THREE.TorusGeometry(.33, .011, 6, 30);
      const orbit = new THREE.Mesh(orbitGeometry, this.markerMaterial);
      orbit.rotation.x = .45;
      orbit.rotation.y = .35;
      orbit.position.z = .12;
      group.add(orbit);
      group.userData.orbitGeometry = orbitGeometry;
    }
    this.scene.add(group);
    this.gems.set(gem.id, group);
    return group;
  }

  removeGem(id) {
    const group = this.gems.get(id);
    if (!group) return;
    this.scene.remove(group);
    group.userData.orbitGeometry?.dispose();
    this.gems.delete(id);
  }

  setBoard(board) {
    const ids = new Set(board.filter(Boolean).map(gem => gem.id));
    for (const id of this.gems.keys()) if (!ids.has(id)) this.removeGem(id);
    board.forEach((gem, index) => {
      if (!gem) return;
      let group = this.gems.get(gem.id);
      if (group && (group.userData.type !== gem.type || group.userData.special !== gem.special)) {
        this.removeGem(gem.id);
        group = null;
      }
      if (!group) group = this.createGem(gem);
      const position = this.position(index);
      group.position.set(position.x, position.y, position.z);
      group.userData.baseZ = position.z;
      group.scale.setScalar(1);
      group.userData.moving = false;
    });
    this.board = board;
    this.selected = -1;
    this.hinted = [];
  }

  async tween(duration, update) {
    if (this.options.reducedMotion()) duration = Math.min(duration, .075);
    return new Promise(resolve => this.tweens.push({ duration, elapsed: 0, update, resolve }));
  }

  async swap(board, first, second) {
    const firstGroup = this.gems.get(board[first].id);
    const secondGroup = this.gems.get(board[second].id);
    const startFirst = firstGroup.position.clone();
    const startSecond = secondGroup.position.clone();
    firstGroup.userData.moving = secondGroup.userData.moving = true;
    this.selected = -1;
    this.hinted = [];
    await this.tween(.23, fraction => {
      const eased = fraction < .5 ? 2 * fraction * fraction : 1 - Math.pow(-2 * fraction + 2, 2) / 2;
      firstGroup.position.lerpVectors(startFirst, startSecond, eased);
      secondGroup.position.lerpVectors(startSecond, startFirst, eased);
      firstGroup.position.z = GEM_HEIGHT + Math.sin(fraction * Math.PI) * .18;
      secondGroup.position.z = GEM_HEIGHT + Math.sin(fraction * Math.PI) * .07;
      firstGroup.scale.setScalar(1);
      secondGroup.scale.setScalar(1);
    });
    firstGroup.userData.moving = secondGroup.userData.moving = false;
  }

  async clear(board, plan) {
    const groups = [...plan.removed].map(index => ({ index, group: this.gems.get(board[index]?.id) })).filter(item => item.group);
    for (const { index, group } of groups) {
      group.userData.moving = true;
      this.spawnParticles(group.position, board[index].type, plan.activated.has(index) ? 17 : 7);
    }
    await this.tween(.23, fraction => {
      const scale = fraction < .2 ? 1 + fraction * .5 : Math.max(.001, (1 - fraction) * 1.32);
      for (const { group } of groups) {
        group.scale.setScalar(scale);
        group.rotation.z += .018;
      }
    });
    for (const { index } of groups) this.removeGem(board[index].id);
  }

  async drop(board, movements) {
    const transitions = [];
    for (const movement of movements) {
      const group = this.gems.get(movement.gem.id) || this.createGem(movement.gem);
      const start = this.position(movement.from);
      const finish = this.position(movement.to);
      group.position.set(start.x, start.y, start.z);
      group.scale.setScalar(movement.fresh ? .55 : 1);
      group.userData.moving = true;
      transitions.push({ group, start, finish, fresh: movement.fresh, delay: Math.max(0, 7 - Math.floor(movement.to / SIZE)) * .012 });
    }
    this.board = board;
    await this.tween(.43, fraction => {
      for (const { group, start, finish, fresh, delay } of transitions) {
        const progress = Math.max(0, Math.min(1, (fraction - delay) / (1 - delay)));
        const eased = 1 - Math.pow(1 - progress, 3);
        group.position.set(start.x + (finish.x - start.x) * eased, start.y + (finish.y - start.y) * eased, GEM_HEIGHT + Math.sin(progress * Math.PI) * .055);
        group.scale.setScalar(fresh ? .55 + eased * .45 : 1);
      }
    });
    for (const { group, finish } of transitions) {
      group.position.set(finish.x, finish.y, finish.z);
      group.scale.setScalar(1);
      group.userData.moving = false;
    }
  }

  async shuffle(board) {
    const previous = new Map([...this.gems].map(([id, group]) => [id, group.position.clone()]));
    this.setBoard(board);
    const transitions = board.map((gem, index) => {
      const group = this.gems.get(gem.id);
      const finish = this.position(index);
      const start = previous.get(gem.id) || new THREE.Vector3(finish.x, finish.y + 3, finish.z);
      group.userData.moving = true;
      group.position.copy(start);
      return { group, start, finish };
    });
    await this.tween(.48, fraction => {
      const eased = 1 - Math.pow(1 - fraction, 3);
      for (const { group, start, finish } of transitions) {
        group.position.set(start.x + (finish.x - start.x) * eased, start.y + (finish.y - start.y) * eased, GEM_HEIGHT + Math.sin(fraction * Math.PI) * .3);
        group.scale.setScalar(.9 + Math.abs(fraction - .5) * .2);
      }
    });
    transitions.forEach(({ group, finish }) => { group.position.set(finish.x, finish.y, finish.z); group.userData.moving = false; group.scale.setScalar(1); });
  }

  spawnParticles(position, type, count) {
    if (this.options.reducedMotion()) return;
    for (let index = 0; index < count; index++) {
      const material = (type >= 0 ? this.particleMaterials[type] : this.prismParticleMaterial).clone();
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const angle = Math.random() * Math.PI * 2;
      const speed = .9 + Math.random() * 1.6;
      this.particles.push({ mesh, velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, .8 + Math.random() * 1.6), life: .6 + Math.random() * .3, elapsed: 0 });
    }
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.gems.values()], true)[0];
    if (!hit) return -1;
    let object = hit.object;
    while (object && !object.userData.gemId) object = object.parent;
    return object ? this.board.findIndex(gem => gem?.id === object.userData.gemId) : -1;
  }

  screenPosition(index) {
    const position = this.position(index);
    const vector = new THREE.Vector3(position.x, position.y, .55).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: (vector.x + 1) / 2 * rect.width, y: (1 - vector.y) / 2 * rect.height };
  }

  resize() {
    const width = this.canvas.parentElement.clientWidth;
    const height = this.canvas.parentElement.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const view = this.options.compact?.() ? 4.00 : 4.38;
    this.canvas.dataset.viewHalfSize = view;
    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.camera.updateProjectionMatrix();
  }

  animate(now) {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);
    const delta = Math.min(.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.options.visible && !this.options.visible()) return;
    const activeDelta = this.options.paused() ? 0 : delta;
    this.time += activeDelta;
    for (const tween of [...this.tweens]) {
      tween.elapsed += activeDelta;
      const fraction = Math.min(1, tween.elapsed / tween.duration);
      tween.update(fraction);
      if (fraction >= 1) { this.tweens.splice(this.tweens.indexOf(tween), 1); tween.resolve(); }
    }
    this.board.forEach((gem, index) => {
      const group = gem && this.gems.get(gem.id);
      if (!group || group.userData.moving) return;
      const selected = index === this.selected;
      const hinted = this.hinted.includes(index);
      const base = group.userData.baseZ;
      const motion = this.options.reducedMotion() ? 0 : Math.sin(this.time * 1.6 + gem.id * 1.1) * .017;
      group.position.z += ((base + motion + (selected ? .13 : 0)) - group.position.z) * .16;
      const scale = selected ? 1.14 : hinted ? 1.05 + Math.sin(this.time * 6) * .035 : index === this.hovered ? 1.045 : 1;
      group.scale.lerp(new THREE.Vector3(scale, scale, scale), .18);
      if (gem.special === 'prism' && !this.options.reducedMotion()) group.rotation.z = this.time * .18;
    });
    this.rings.forEach((ring, index) => {
      const hinted = this.hinted.includes(index);
      ring.visible = index === this.selected || hinted;
      ring.material.color.set(hinted ? 0xd0b164 : 0xa08ab7);
      ring.material.opacity = hinted ? .65 + Math.sin(this.time * 5) * .3 : .85;
      ring.scale.setScalar(hinted ? 1.06 + Math.sin(this.time * 5) * .06 : 1.08);
    });
    for (const particle of [...this.particles]) {
      particle.elapsed += activeDelta;
      particle.mesh.position.addScaledVector(particle.velocity, activeDelta);
      particle.velocity.z -= activeDelta * 3;
      particle.mesh.rotation.x += activeDelta * 3;
      particle.mesh.rotation.z += activeDelta * 2;
      particle.mesh.material.opacity = Math.max(0, 1 - particle.elapsed / particle.life);
      if (particle.elapsed >= particle.life) { this.scene.remove(particle.mesh); particle.mesh.material.dispose(); this.particles.splice(this.particles.indexOf(particle), 1); }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.environmentTarget.dispose();
    this.environment.dispose();
    this.scene.traverse(object => { object.geometry?.dispose(); if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
    this.renderer.dispose();
  }
}
