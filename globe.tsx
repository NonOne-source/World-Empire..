import { useEffect, useRef, useState } from "react";
// @ts-ignore - avoids type-declaration resolution issues for this three.js version in CI
import * as THREE from "three";
// @ts-ignore - three ships no bundled types for the examples/jsm/* import paths
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// @ts-ignore - topojson-client ships no bundled TypeScript declarations
import { feature } from "topojson-client";
// world-atlas ships pre-simplified (110m resolution) TopoJSON country borders —
// small enough to bundle, detailed enough to be recognizable as a real world map.
// This is the real geographic data source the Phase 1 README said Phase 2 would add.
// @ts-ignore - no type declarations shipped for this JSON import
import worldTopology from "world-atlas/countries-110m.json";
import type { GameState } from "./main";
import { CITIES } from "./cities";

const GLOBE_RADIUS = 2;
const MARKER_RADIUS = GLOBE_RADIUS * 1.01;
const BORDER_RADIUS = GLOBE_RADIUS * 1.002;

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

interface GlobeProps {
  game: GameState;
  activeCityId: string;
}

export function Globe({ game, activeCityId }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
  const [pinnedCityId, setPinnedCityId] = useState<string | null>(null);

  // Refs so the render loop (which is set up once) always sees fresh game/activeCityId
  // without re-creating the whole Three.js scene on every state update.
  const gameRef = useRef(game);
  gameRef.current = game;
  const activeCityRef = useRef(activeCityId);
  activeCityRef.current = activeCityId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3.2;
    controls.maxDistance = 8;
    controls.rotateSpeed = 0.5;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // --- Base sphere (ocean) ---
    const sphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const sphereMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color("#101a33"),
      emissive: new THREE.Color("#0a1226"),
      shininess: 6,
    });
    scene.add(new THREE.Mesh(sphereGeo, sphereMat));

    // --- Soft atmosphere glow shell ---
    const glowGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 48, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#3e8e7e"),
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(glowGeo, glowMat));

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 3, 5);
    scene.add(sun);

    // --- Country borders from real GeoJSON (converted from TopoJSON at runtime) ---
    const countries = feature(worldTopology as any, (worldTopology as any).objects.countries) as any;
    const borderPositions: number[] = [];
    for (const geom of countries.features) {
      const polygons: number[][][][] =
        geom.geometry.type === "Polygon" ? [geom.geometry.coordinates] : geom.geometry.coordinates;
      for (const polygon of polygons) {
        for (const ring of polygon) {
          for (let i = 0; i < ring.length - 1; i++) {
            const [lon1, lat1] = ring[i];
            const [lon2, lat2] = ring[i + 1];
            const p1 = latLonToVector3(lat1, lon1, BORDER_RADIUS);
            const p2 = latLonToVector3(lat2, lon2, BORDER_RADIUS);
            borderPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          }
        }
      }
    }
    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute("position", new THREE.Float32BufferAttribute(borderPositions, 3));
    const borderMat = new THREE.LineBasicMaterial({ color: new THREE.Color("#8b96b8"), transparent: true, opacity: 0.55 });
    scene.add(new THREE.LineSegments(borderGeo, borderMat));

    // --- City markers ---
    const markerGroup = new THREE.Group();
    const markerMeshes: THREE.Mesh[] = [];
    const goldColor = new THREE.Color("#c9a227");
    for (const city of Object.values(CITIES)) {
      const pos = latLonToVector3(city.lat, city.lon, MARKER_RADIUS);
      const geo = new THREE.SphereGeometry(0.03, 12, 12);
      const owner = gameRef.current.players.find((p) => p.id === gameRef.current.cities[city.id]?.ownerId);
      const mat = new THREE.MeshBasicMaterial({ color: owner ? new THREE.Color(owner.color) : goldColor });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData.cityId = city.id;
      markerGroup.add(mesh);
      markerMeshes.push(mesh);
    }
    scene.add(markerGroup);

    // Pulsing ring highlighting whichever city the current player just landed on.
    const activeRingGeo = new THREE.RingGeometry(0.05, 0.07, 32);
    const activeRingMat = new THREE.MeshBasicMaterial({ color: goldColor, transparent: true, side: THREE.DoubleSide });
    const activeRing = new THREE.Mesh(activeRingGeo, activeRingMat);
    scene.add(activeRing);

    // --- Raycasting for tap/click selection ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pickCity(clientX: number, clientY: number): string | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerMeshes);
      return hits.length > 0 ? (hits[0].object.userData.cityId as string) : null;
    }

    function handleClick(e: PointerEvent) {
      const cityId = pickCity(e.clientX, e.clientY);
      if (cityId) setPinnedCityId(cityId);
    }
    function handleMove(e: PointerEvent) {
      if (e.pointerType === "touch") return; // avoid flicker on touch drag
      setHoveredCityId(pickCity(e.clientX, e.clientY));
    }
    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("pointermove", handleMove);

    // --- Camera fly-to a city (used when a new city becomes "active") ---
    let flyFrom: THREE.Vector3 | null = null;
    let flyTo: THREE.Vector3 | null = null;
    let flyStart = 0;
    const FLY_MS = 900;

    function flyToCity(cityId: string) {
      const city = CITIES[cityId];
      if (!city) return;
      const dir = latLonToVector3(city.lat, city.lon, 1);
      const targetDistance = camera.position.length();
      flyFrom = camera.position.clone().normalize();
      flyTo = dir.clone();
      flyStart = performance.now();
      controls.enabled = false;
      (flyToCity as any)._targetDistance = targetDistance;
    }

    let lastActiveCity = "";

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
    function animate(now: number) {
      raf = requestAnimationFrame(animate);

      if (gameRef.current && activeCityRef.current !== lastActiveCity) {
        lastActiveCity = activeCityRef.current;
        flyToCity(lastActiveCity);
      }

      if (flyFrom && flyTo) {
        const t = Math.min(1, (now - flyStart) / FLY_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        const dir = flyFrom.clone().lerp(flyTo, eased).normalize();
        const distance = (flyToCity as any)._targetDistance ?? camera.position.length();
        camera.position.copy(dir.multiplyScalar(distance));
        camera.lookAt(0, 0, 0);
        if (t >= 1) {
          flyFrom = null;
          flyTo = null;
          controls.enabled = true;
        }
      }

      // Update active-city ring position + pulse
      const cityId = activeCityRef.current;
      const cityDef = CITIES[cityId];
      if (cityDef) {
        const pos = latLonToVector3(cityDef.lat, cityDef.lon, MARKER_RADIUS + 0.001);
        activeRing.position.copy(pos);
        activeRing.lookAt(pos.clone().multiplyScalar(2));
        const pulse = 0.7 + 0.3 * Math.sin(now / 250);
        activeRing.scale.setScalar(pulse);
        activeRingMat.opacity = 0.5 + 0.4 * Math.sin(now / 250);
      }

      // Refresh marker colors (ownership can change turn to turn)
      for (const mesh of markerMeshes) {
        const cid = mesh.userData.cityId as string;
        const owner = gameRef.current.players.find((p) => p.id === gameRef.current.cities[cid]?.ownerId);
        (mesh.material as THREE.MeshBasicMaterial).color.set(owner ? owner.color : "#c9a227");
      }

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

  const shownCityId = hoveredCityId ?? pinnedCityId;
  const shownCity = shownCityId ? CITIES[shownCityId] : null;

  return (
    <div className="globe-panel card">
      <div ref={containerRef} className="globe-canvas" />
      <div className="globe-hint">📍 {CITIES[activeCityId]?.name}, {CITIES[activeCityId]?.country}</div>
      {shownCity && (
        <div className="globe-tooltip">
          <strong>{shownCity.name}</strong>
          <span>{shownCity.country}</span>
          <span className="mono">€{shownCity.price.toLocaleString("de-DE")}</span>
        </div>
      )}
    </div>
  );
}
