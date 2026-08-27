import { useEffect, useRef, useState } from "react";
// @ts-ignore - avoids type-declaration resolution issues for this three.js version in CI
import * as THREE from "three";
// @ts-ignore - three ships no bundled types for the examples/jsm/* import paths
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// @ts-ignore - topojson-client ships no bundled TypeScript declarations
import { feature } from "topojson-client";
// @ts-ignore - no type declarations shipped for this JSON import
import worldTopology from "world-atlas/countries-110m.json";
// @ts-ignore - earcut ships no bundled TypeScript declarations
import earcut from "earcut";
import { REGION_DEFS, matchRegions } from "./conquest-regions";
import type { ConquestGameState } from "./conquest";

const GLOBE_RADIUS = 2;
const FILL_RADIUS = GLOBE_RADIUS * 1.004;
const BORDER_RADIUS = GLOBE_RADIUS * 1.008;
const LABEL_RADIUS = GLOBE_RADIUS * 1.035;

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

interface ConquestGlobeProps {
  game: ConquestGameState;
  selectedRegion: string | null;
  onSelectRegion: (regionId: string) => void;
}

export function ConquestGlobe({ game, selectedRegion, onSelectRegion }: ConquestGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const selectedRef = useRef(selectedRegion);
  selectedRef.current = selectedRegion;
  const refreshVisualsRef = useRef<() => void>(() => {});
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const hoveredRegionDef = REGION_DEFS.find((d) => d.id === hoveredRegion);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3.2;
    controls.maxDistance = 9;
    controls.rotateSpeed = 0.5;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    const sphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const sphereMat = new THREE.MeshPhongMaterial({ color: new THREE.Color("#0b1220"), shininess: 4 });
    scene.add(new THREE.Mesh(sphereGeo, sphereMat));

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(4, 3, 5);
    scene.add(sun);

    const topology = worldTopology as any;
    const regionMatch = matchRegions(topology);
    const geoCollection = feature(topology, topology.objects.countries) as any;

    const meshesByRegion: Record<string, THREE.Mesh[]> = {};
    const spritesByRegion: Record<string, THREE.Sprite> = {};
    const raycastTargets: THREE.Mesh[] = [];
    const borderPositions: number[] = [];

    for (const def of REGION_DEFS) {
      const geomIndex = regionMatch.regionToGeomIndex[def.id];
      if (geomIndex === undefined) continue;
      const geomFeature = geoCollection.features[geomIndex];
      const polygons: number[][][][] =
        geomFeature.geometry.type === "Polygon" ? [geomFeature.geometry.coordinates] : geomFeature.geometry.coordinates;

      const regionMeshes: THREE.Mesh[] = [];

      for (const polygon of polygons) {
        const outerRing = polygon[0];
        if (!outerRing || outerRing.length < 3) continue;

        let lonMin = Infinity;
        let lonMax = -Infinity;
        for (const [lon] of outerRing) {
          if (lon < lonMin) lonMin = lon;
          if (lon > lonMax) lonMax = lon;
        }
        const crossesAntimeridian = lonMax - lonMin > 180;

        // earcut triangulates in flat 2D — shift longitudes for antimeridian-crossing rings
        // (Russia) so the flat span is continuous, then place the ACTUAL 3D vertices using the
        // original, unshifted lon/lat so they land correctly on the sphere.
        const flat: number[] = [];
        const positions: number[] = [];
        for (const [lon, lat] of outerRing) {
          const shiftedLon = crossesAntimeridian && lon < 0 ? lon + 360 : lon;
          flat.push(shiftedLon, lat);
          const v = latLonToVector3(lat, lon, FILL_RADIUS);
          positions.push(v.x, v.y, v.z);
        }

        let indices: number[] = [];
        try {
          indices = earcut(flat, undefined, 2);
        } catch {
          continue;
        }
        if (!indices || indices.length === 0) continue;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({ color: 0x33415f, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
        const mesh = new THREE.Mesh(geo, material);
        mesh.userData.regionId = def.id;
        scene.add(mesh);
        regionMeshes.push(mesh);
        raycastTargets.push(mesh);

        for (const ring of polygon) {
          for (let i = 0; i < ring.length - 1; i++) {
            const p1 = latLonToVector3(ring[i][1], ring[i][0], BORDER_RADIUS);
            const p2 = latLonToVector3(ring[i + 1][1], ring[i + 1][0], BORDER_RADIUS);
            borderPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          }
        }
      }
      meshesByRegion[def.id] = regionMeshes;

      // Troop-count badge as a billboard sprite above the region's largest polygon centroid.
      const centroidRing = polygons[0][0];
      let cLon = 0;
      let cLat = 0;
      for (const [lon, lat] of centroidRing) {
        cLon += lon;
        cLat += lat;
      }
      cLon /= centroidRing.length;
      cLat /= centroidRing.length;

      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 72;
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(latLonToVector3(cLat, cLon, LABEL_RADIUS));
      sprite.scale.set(0.42, 0.24, 1);
      sprite.renderOrder = 10;
      sprite.visible = false;
      scene.add(sprite);
      spritesByRegion[def.id] = sprite;
    }

    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute("position", new THREE.Float32BufferAttribute(borderPositions, 3));
    const borderMat = new THREE.LineBasicMaterial({ color: 0x090d1a, transparent: true, opacity: 0.9 });
    scene.add(new THREE.LineSegments(borderGeo, borderMat));

    function drawTroopBadge(sprite: THREE.Sprite, count: number, highlight: boolean) {
      const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
      const canvas = tex.image as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = highlight ? "#c9a227" : "rgba(9,13,26,0.82)";
      ctx.fillRect(canvas.width / 2 - 30, canvas.height / 2 - 22, 60, 44);
      ctx.fillStyle = highlight ? "#0e1425" : "#ede6d6";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(count), canvas.width / 2, canvas.height / 2 + 3);
      tex.needsUpdate = true;
    }

    function refreshVisuals() {
      const g = gameRef.current;
      const sel = selectedRef.current;
      const showTroops = g.phase !== "lobby";
      for (const def of REGION_DEFS) {
        const region = g.regions[def.id];
        const meshes = meshesByRegion[def.id];
        const sprite = spritesByRegion[def.id];
        if (!meshes || !region) continue;
        const owner = g.players.find((p) => p.id === region.ownerId);
        const isSelected = def.id === sel;
        const baseColor = owner ? owner.color : "#33415f";
        for (const mesh of meshes) {
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.color.set(isSelected ? "#f2d774" : baseColor);
          mat.opacity = isSelected ? 1 : 0.85;
        }
        if (sprite) {
          sprite.visible = showTroops;
          if (showTroops) drawTroopBadge(sprite, region.troops, isSelected);
        }
      }
    }
    refreshVisuals();
    refreshVisualsRef.current = refreshVisuals;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pickRegion(clientX: number, clientY: number): string | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(raycastTargets);
      return hits.length > 0 ? (hits[0].object.userData.regionId as string) : null;
    }

    function handleClick(e: PointerEvent) {
      const regionId = pickRegion(e.clientX, e.clientY);
      if (regionId) onSelectRegion(regionId);
    }
    function handleMove(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      setHoveredRegion(pickRegion(e.clientX, e.clientY));
    }
    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("pointermove", handleMove);

    function resize() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      camera.aspect = w / h || 1;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let raf = 0;
    function animate() {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("pointermove", handleMove);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshVisualsRef.current();
  }, [game, selectedRegion]);

  return (
    <div className="globe-panel card">
      <div ref={containerRef} className="globe-canvas" />
      {hoveredRegionDef && (
        <div className="globe-tooltip">
          <strong>{hoveredRegionDef.name}</strong>
          <span>{hoveredRegionDef.continent}</span>
        </div>
      )}
    </div>
  );
}
