import * as THREE from 'three';

export class GameScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private ambientLight: THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private isInitialized: boolean = false;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.ground = this.createGround();
  }

  public initialize(container: HTMLElement): void {
    if (this.isInitialized) return;

    // Setup renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87CEEB); // Sky blue
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Setup camera
    this.camera.position.set(0, 10, 20);
    this.camera.lookAt(0, 0, 0);

    // Setup lighting
    this.directionalLight.position.set(10, 10, 5);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;

    // Add elements to scene
    this.scene.add(this.ambientLight);
    this.scene.add(this.directionalLight);
    this.scene.add(this.ground);

    // Add basic objects
    this.addBasicObjects();

    this.isInitialized = true;
  }

  private createGround(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshLambertMaterial({ color: 0x90EE90 }); // Light green
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  private addBasicObjects(): void {
    // Add some basic objects for hiding
    const objects = [
      { geometry: new THREE.BoxGeometry(2, 2, 2), position: { x: 5, y: 1, z: 5 }, color: 0x8B4513 },
      { geometry: new THREE.CylinderGeometry(1, 1, 3), position: { x: -5, y: 1.5, z: 5 }, color: 0x654321 },
      { geometry: new THREE.SphereGeometry(1.5), position: { x: 0, y: 1.5, z: -8 }, color: 0x696969 },
      { geometry: new THREE.BoxGeometry(1, 4, 1), position: { x: 8, y: 2, z: -3 }, color: 0x228B22 },
    ];

    objects.forEach(obj => {
      const material = new THREE.MeshLambertMaterial({ color: obj.color });
      const mesh = new THREE.Mesh(obj.geometry, material);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }

  public render(): void {
    if (!this.isInitialized) return;
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public dispose(): void {
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
    this.isInitialized = false;
  }
}