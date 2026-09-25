// Точка входа для js/vendor/three/three-viz.min.js — three.js 0.186.0 только с нужными вкладке «Визуализация» частями.
// Сборка: npm i three@0.186.0 esbuild && npx esbuild tools/three-viz-entry.js --bundle --minify --format=iife --global-name=LogiThree --target=es2019 --legal-comments=inline --outfile=js/vendor/three/three-viz.min.js
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, BoxGeometry, CylinderGeometry, PlaneGeometry, CircleGeometry,
  ExtrudeGeometry, ShapeGeometry, Shape, EdgesGeometry, LineSegments, LineBasicMaterial, MeshStandardMaterial, MeshBasicMaterial,
  HemisphereLight, DirectionalLight, Color, Object3D, Matrix4, Vector3, Vector2, Quaternion, Box3, Raycaster, Sprite, SpriteMaterial,
  CanvasTexture, SRGBColorSpace, DoubleSide, GridHelper, Fog, PMREMGenerator, PCFShadowMap, NeutralToneMapping
} from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
