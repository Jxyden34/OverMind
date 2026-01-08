/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, ThreeElements } from '@react-three/fiber';
import { MapControls, Environment, Float, Outlines, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { MathUtils } from 'three';
import { Grid, BuildingType, WeatherType, DisasterType, ActiveDisaster, EconomicEvent } from '../types';
import { GRID_SIZE, BUILDINGS } from '../constants';
import { DetailedBuilding } from './DetailedBuilding';

// Fix for TypeScript not recognizing R3F elements in JSX
// This augmentation ensures both the legacy JSX and modern React.JSX namespaces are covered.
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements { }
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements { }
    }
  }
}

// --- Constants & Helpers ---
const WORLD_OFFSET = GRID_SIZE / 2 - 0.5;
const gridToWorld = (x: number, y: number) => [x - WORLD_OFFSET, 0, y - WORLD_OFFSET] as [number, number, number];

// Deterministic random based on coordinates
const getHash = (x: number, y: number) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
const getRandomRange = (min: number, max: number) => Math.random() * (max - min) + min;

// --- Day/Night Cycle ---
const DayNightCycle = ({ day, neonMode, weather, activeDisaster }: { day: number, neonMode: boolean, weather: WeatherType, activeDisaster: ActiveDisaster | null }) => {
  const directionalLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime * 0.1;
    const sin = Math.sin(time);
    const cos = Math.cos(time);

    if (directionalLightRef.current) {
      if (neonMode) {
        // CYBERPUNK NIGHT
        directionalLightRef.current.position.set(10, 15, 10);
        directionalLightRef.current.intensity = 0.8;
        directionalLightRef.current.color.setHex(0xa855f7); // Purple light
      } else {
        directionalLightRef.current.position.set(15 * cos, 20 * sin, 10 * cos);

        const isNight = sin < 0;
        const isSunset = Math.abs(sin) < 0.2;

        let intensity = 2;
        if (weather === WeatherType.Rain || weather === WeatherType.AcidRain) intensity = 0.8;
        if (weather === WeatherType.Fog || weather === WeatherType.Snow) intensity = 1.2;

        if (isNight) {
          directionalLightRef.current.intensity = Math.max(0.1, 0.5 + sin);
          directionalLightRef.current.color.setHSL(0.6, 0.5, 0.5);
        } else if (isSunset) {
          directionalLightRef.current.intensity = 1.5;
          directionalLightRef.current.color.setHSL(0.05, 0.8, 0.6);
        } else {
          directionalLightRef.current.intensity = intensity;
          // De-saturate if raining/foggy
          if (weather !== WeatherType.Clear) {
            directionalLightRef.current.color.setHSL(0.6, 0.1, 0.8);
          } else {
            directionalLightRef.current.color.setHSL(0.1, 0.2, 1);
          }
        }
      }

      // Solar Flare Override
      if (activeDisaster?.type === DisasterType.SolarFlare) {
        directionalLightRef.current.intensity = 4 + Math.sin(time * 50) * 2; // Flickering intense light
        directionalLightRef.current.color.setHSL(0.05, 1, 0.6); // Orange/Red
        directionalLightRef.current.position.set(10 + Math.random(), 20, 10 + Math.random());
      }
    }

    if (ambientLightRef.current) {
      let ambIntensity = sin > 0 ? 0.6 : 0.2;
      if (weather === WeatherType.Rain || weather === WeatherType.Snow) ambIntensity -= 0.1;

      // Solar Flare Ambient
      if (activeDisaster?.type === DisasterType.SolarFlare) ambIntensity = 1.0;

      ambientLightRef.current.intensity = neonMode ? 0.3 : ambIntensity;
    }
  });

  return (
    <>
      <ambientLight ref={ambientLightRef} intensity={neonMode ? 0.3 : 0.5} color={neonMode ? "#2e1065" : "#cceeff"} />
      <directionalLight
        ref={directionalLightRef}
        castShadow
        position={[15, 20, 10]}
        intensity={2}
        color="#fffbeb"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-15} shadow-camera-right={15}
        shadow-camera-top={15} shadow-camera-bottom={-15}
        shadow-bias={-0.0005}
      />
      {(weather === WeatherType.Fog || weather === WeatherType.Rain) && <fog attach="fog" args={['#94a3b8', 5, 60]} />}
      {weather === WeatherType.Snow && <fog attach="fog" args={['#e2e8f0', 10, 80]} />}
    </>
  );
};

// Shared Geometries
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const coneGeo = new THREE.ConeGeometry(1, 1, 4);
const sphereGeo = new THREE.SphereGeometry(1, 8, 8);

// --- 1. Advanced Procedural Buildings ---

const WindowBlock = React.memo(({ position, scale }: { position: [number, number, number], scale: [number, number, number] }) => (
  <mesh geometry={boxGeo} position={position} scale={scale}>
    <meshStandardMaterial color="#bfdbfe" emissive="#bfdbfe" emissiveIntensity={0.2} roughness={0.1} metalness={0.8} />
  </mesh>
));

const SmokeStack = ({ position }: { position: [number, number, number] }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.children.forEach((child, i) => {
        const cloud = child as THREE.Mesh;
        cloud.position.y += 0.01 + i * 0.005;
        cloud.scale.addScalar(0.005);

        const material = cloud.material as THREE.MeshStandardMaterial;
        if (material) {
          material.opacity -= 0.005;
          if (cloud.position.y > 1.5) {
            cloud.position.y = 0;
            cloud.scale.setScalar(0.1 + Math.random() * 0.1);
            material.opacity = 0.6;
          }
        }
      });
    }
  });

  return (
    <group position={position}>
      <mesh geometry={cylinderGeo} castShadow receiveShadow position={[0, 0.5, 0]} scale={[0.2, 1, 0.2]}>
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <group ref={ref} position={[0, 1, 0]}>
        {[0, 1, 2].map(i => (
          <mesh key={i} geometry={sphereGeo} position={[Math.random() * 0.1, i * 0.4, Math.random() * 0.1]} scale={0.2}>
            <meshStandardMaterial color="#d1d5db" transparent opacity={0.6} flatShading />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// --- 2. Ground System (Instanced) ---
const GroundSystem = ({ grid, onTileClick, hoveredTile, neonMode }: {
  grid: Grid,
  onTileClick: (x: number, y: number) => void,
  hoveredTile: { x: number, y: number } | null,
  neonMode: boolean
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Update effect
  useEffect(() => {
    if (!meshRef.current) return;

    let i = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const tile = grid[y][x];
        const [wx, _, wz] = gridToWorld(x, y);

        // Position
        dummy.position.set(wx, -0.5, wz);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);

        // Color Logic
        let c = "#10b981"; // Default Grass
        if (tile.buildingType === BuildingType.Water) c = "#3b82f6";
        else if (tile.buildingType === BuildingType.Road) c = "#374151";
        else if (tile.buildingType !== BuildingType.None) c = "#059669"; // Foundation

        // Neon Mode Overrides
        if (neonMode) {
          if (tile.buildingType === BuildingType.None) c = (x + y) % 2 === 0 ? '#1e1b4b' : '#312e81';
          else if (tile.buildingType === BuildingType.Road) c = "#000000";
          else if (tile.buildingType === BuildingType.Water) c = "#06b6d4";
          else c = "#4c1d95";
        }

        // Hover Highlight
        const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;
        if (isHovered) c = "#67e8f9";

        // Pollution Tint (if not neon)
        if (!neonMode && tile.pollution && tile.pollution > 0) {
          const f = Math.min(1, tile.pollution / 50);
          const base = new THREE.Color(c);
          base.lerp(new THREE.Color("#4b5563"), f * 0.8);
          c = "#" + base.getHexString();
        }

        color.set(c);
        meshRef.current.setColorAt(i, color);

        i++;
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [grid, hoveredTile, neonMode]); // Re-run when grid changes (ticks) or hover changes

  // Handle Clicks via raycast logic if needed, OR we just use onPointerDown on the whole mesh
  // But we need to know WHICH instance was clicked.
  // R3F handles this: e.instanceId gives the index.

  const handleClick = (e: ThreeElements['mesh']['onPointerDown']) => {
    // @ts-ignore
    const instanceId = e.instanceId;
    if (instanceId !== undefined) {
      // Reverse map index to X,Y
      // i = y * width + x
      // x = i % width
      // y = floor(i / width)
      const width = grid[0].length;
      const x = instanceId % width;
      const y = Math.floor(instanceId / width);
      onTileClick(x, y);
    }
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, grid.length * grid[0].length]}
      onPointerDown={(e) => { e.stopPropagation(); handleClick(e); }}
      receiveShadow
    >
      <boxGeometry args={[1, 0.2, 1]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
};

// --- 3. Building System (Instanced) ---
const BuildingSystem = ({ grid, hoveredTile, neonMode, onTileClick }: {
  grid: Grid,
  hoveredTile: { x: number, y: number } | null,
  neonMode: boolean,
  onTileClick: (x: number, y: number) => void
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!meshRef.current) return;

    let i = 0;
    // We only instance "Standard" buildings. 3600 max.
    // We update the full list every time (inefficient for large maps but safer than mapped components)
    // Actually we need to match the index logic.
    // InstancedMesh count is total tiles. We hide empty/non-building ones by scaling to 0.

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const tile = grid[y][x];

        // Skip map tiles that are NOT buildings or are Roads/Water (handled by Ground)
        if (tile.buildingType === BuildingType.None || tile.buildingType === BuildingType.Road || tile.buildingType === BuildingType.Water) {
          // Hide instance
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i++, dummy.matrix);
          continue;
        }

        const [wx, _, wz] = gridToWorld(x, y);
        const config = BUILDINGS[tile.buildingType];

        // Scale/Shape Logic
        let sx = 0.8, sy = 0.8, sz = 0.8;
        let py = 0; // base y

        if (tile.buildingType === BuildingType.Commercial) { sy = 1.5; }
        if (tile.buildingType === BuildingType.Industrial) { sx = 0.9; sz = 0.9; sy = 0.6; }
        if (tile.buildingType === BuildingType.Apartment) { sy = 1.2; }
        if (tile.buildingType === BuildingType.MegaMall) { sx = 0.9; sz = 0.9; sy = 0.5; }
        if (tile.buildingType === BuildingType.SpacePort) { sy = 2.0; sx = 0.5; sz = 0.5; } // Rocket-ish

        dummy.position.set(wx, py + sy / 2 - 0.3, wz); // Adjust y so it sits on ground
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);

        // Color Logic
        let c = config ? config.color : '#ffffff';
        if (neonMode) c = '#333333'; // simplified neon

        // Hover Highlight
        const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;
        if (isHovered) c = "#ffffff";

        // Road Access warning (red blink)
        if (tile.hasRoadAccess === false && !isHovered) {
          // Just tint red
          c = "#ef4444";
        }

        color.set(c);
        meshRef.current.setColorAt(i, color);

        i++;
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [grid, hoveredTile, neonMode]);

  // Handle Clicks on Buildings (for Demolish or Upgrade info)
  const handleClick = (e: ThreeElements['mesh']['onPointerDown']) => {
    // @ts-ignore
    const instanceId = e.instanceId;
    if (instanceId !== undefined) {
      // Reverse map index to X,Y
      const width = grid[0].length;
      const x = instanceId % width;
      const y = Math.floor(instanceId / width);
      onTileClick(x, y);
    }
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, grid.length * grid[0].length]}
      onPointerDown={(e) => { e.stopPropagation(); handleClick(e); }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
};

// --- 4. Dynamic Systems ---

const carColors = ['#ef4444', '#3b82f6', '#eab308', '#ffffff', '#1f2937', '#f97316'];

const TrafficSystem = ({ grid, crimeRate }: { grid: Grid, crimeRate: number }) => {
  const roadTiles = useMemo(() => {
    const roads: { x: number, y: number }[] = [];
    grid.forEach(row => row.forEach(tile => {
      if (tile.buildingType === BuildingType.Road) roads.push({ x: tile.x, y: tile.y });
    }));
    return roads;
  }, [grid]);

  // More crime = More chaos/cars (Police + Robbers)
  const baseCarCount = Math.min(roadTiles.length, 30);
  const crimeExtras = Math.min(20, Math.floor(crimeRate / 2)); // Add up to 20 extra units for crime
  const carCount = baseCarCount + crimeExtras;

  const carsRef = useRef<THREE.InstancedMesh>(null);
  const carsState = useRef<Float32Array>(new Float32Array(0));
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (roadTiles.length < 2) return;
    carsState.current = new Float32Array(carCount * 7); // Increased state size for TYPE (idx 6)
    const newColors = new Float32Array(carCount * 3);

    for (let i = 0; i < carCount; i++) {
      const startNode = roadTiles[Math.floor(Math.random() * roadTiles.length)];
      carsState.current[i * 7 + 0] = startNode.x;
      carsState.current[i * 7 + 1] = startNode.y;
      carsState.current[i * 7 + 2] = startNode.x;
      carsState.current[i * 7 + 3] = startNode.y;
      carsState.current[i * 7 + 4] = 1;
      carsState.current[i * 7 + 5] = getRandomRange(0.01, 0.03);

      // Car Type Logic
      // 0 = Civ, 1 = Police, 2 = Robber
      let type = 0;
      let color = new THREE.Color(carColors[Math.floor(Math.random() * carColors.length)]);

      // If we are in the "extra" range, force crime units
      // Or just probability based on crime rate
      if (i >= baseCarCount) {
        if (Math.random() > 0.5) {
          type = 1; // Police
          color = new THREE.Color('#1e40af'); // Dark Blue
          carsState.current[i * 7 + 5] = 0.04; // FAST
        } else {
          type = 2; // Robber
          color = new THREE.Color('#000000'); // Black
          carsState.current[i * 7 + 5] = 0.045; // FASTER
        }
      } else if (Math.random() < (crimeRate / 200)) {
        // Random patrol even in normal pool
        type = 1;
        color = new THREE.Color('#3b82f6');
      }

      carsState.current[i * 7 + 6] = type;

      newColors[i * 3] = color.r; newColors[i * 3 + 1] = color.g; newColors[i * 3 + 2] = color.b;
    }

    if (carsRef.current) {
      carsRef.current.instanceColor = new THREE.InstancedBufferAttribute(newColors, 3);
    }
  }, [roadTiles, carCount, crimeRate]);

  useFrame((state) => {
    if (!carsRef.current || roadTiles.length < 2 || carsState.current.length === 0) return;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < carCount; i++) {
      const idx = i * 7;
      let curX = carsState.current[idx];
      let curY = carsState.current[idx + 1];
      let tarX = carsState.current[idx + 2];
      let tarY = carsState.current[idx + 3];
      let progress = carsState.current[idx + 4];
      const speed = carsState.current[idx + 5];
      const type = carsState.current[idx + 6];

      progress += speed;

      if (progress >= 1) {
        curX = tarX;
        curY = tarY;
        progress = 0;
        const neighbors = roadTiles.filter(t => (Math.abs(t.x - curX) === 1 && t.y === curY) || (Math.abs(t.y - curY) === 1 && t.x === curX));
        if (neighbors.length > 0) {
          const next = neighbors[Math.floor(Math.random() * neighbors.length)];
          tarX = next.x; tarY = next.y;
        } else {
          const rnd = roadTiles[Math.floor(Math.random() * roadTiles.length)];
          curX = rnd.x; curY = rnd.y; tarX = rnd.x; tarY = rnd.y;
        }
      }

      carsState.current[idx] = curX;
      carsState.current[idx + 1] = curY;
      carsState.current[idx + 2] = tarX;
      carsState.current[idx + 3] = tarY;
      carsState.current[idx + 4] = progress;

      const gx = MathUtils.lerp(curX, tarX, progress);
      const gy = MathUtils.lerp(curY, tarY, progress);
      const dx = tarX - curX;
      const dy = tarY - curY;
      const angle = Math.atan2(dy, dx);

      const offsetAmt = 0.15;
      // Robbers drive recklessly (less offset)
      const laneOffset = type === 2 ? 0.05 : offsetAmt;

      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const offX = (-dy / len) * laneOffset;
      const offY = (dx / len) * laneOffset;

      const [wx, _, wz] = gridToWorld(gx + offX, gy + offY);

      // Bouncing visuals
      const bounce = type === 0 ? 0 : Math.sin(time * 20) * 0.05; // Police/Robbers bounce
      dummy.position.set(wx, -0.3 + 0.075 + bounce, wz);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(0.5, 0.15, 0.3);
      dummy.updateMatrix();
      carsRef.current.setMatrixAt(i, dummy.matrix);

      // Update Color for Police Strobing
      if (type === 1) {
        const strobe = Math.floor(time * 10) % 2 === 0;
        const c = new THREE.Color(strobe ? '#ef4444' : '#3b82f6'); // Red/Blue strobe
        carsRef.current.setColorAt(i, c);
      }
    }
    carsRef.current.instanceMatrix.needsUpdate = true;
    if (carsRef.current.instanceColor) carsRef.current.instanceColor.needsUpdate = true;
  });

  if (roadTiles.length < 2) return null;

  return (
    <instancedMesh ref={carsRef} args={[boxGeo, undefined, carCount]} castShadow>
      <meshStandardMaterial roughness={0.5} metalness={0.3} />
    </instancedMesh>
  );
};

const clothesColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];

const PopulationSystem = ({ population, grid }: { population: number, grid: Grid }) => {
  const agentCount = Math.min(Math.floor(population / 2), 300);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const walkableTiles = useMemo(() => {
    const tiles: { x: number, y: number }[] = [];
    grid.forEach(row => row.forEach(tile => {
      if (tile.buildingType === BuildingType.Road || tile.buildingType === BuildingType.Park || tile.buildingType === BuildingType.None) {
        tiles.push({ x: tile.x, y: tile.y });
      }
    }));
    return tiles;
  }, [grid]);

  const agentsState = useRef<Float32Array>(new Float32Array(0));
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (agentCount === 0 || walkableTiles.length === 0) return;
    agentsState.current = new Float32Array(agentCount * 6);
    const newColors = new Float32Array(agentCount * 3);

    for (let i = 0; i < agentCount; i++) {
      const t = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
      const x = t.x + getRandomRange(-0.4, 0.4);
      const y = t.y + getRandomRange(-0.4, 0.4);
      agentsState.current[i * 6 + 0] = x;
      agentsState.current[i * 6 + 1] = y;
      const tt = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
      agentsState.current[i * 6 + 2] = tt.x + getRandomRange(-0.4, 0.4);
      agentsState.current[i * 6 + 3] = tt.y + getRandomRange(-0.4, 0.4);
      agentsState.current[i * 6 + 4] = getRandomRange(0.005, 0.015);
      agentsState.current[i * 6 + 5] = Math.random() * Math.PI * 2;

      const c = new THREE.Color(clothesColors[Math.floor(Math.random() * clothesColors.length)]);
      newColors[i * 3] = c.r; newColors[i * 3 + 1] = c.g; newColors[i * 3 + 2] = c.b;
    }

    if (meshRef.current) {
      meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(newColors, 3);
    }
  }, [agentCount, walkableTiles]);

  useFrame((state) => {
    if (!meshRef.current || agentCount === 0 || agentsState.current.length === 0) return;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < agentCount; i++) {
      const idx = i * 6;
      let x = agentsState.current[idx];
      let y = agentsState.current[idx + 1];
      let tx = agentsState.current[idx + 2];
      let ty = agentsState.current[idx + 3];
      const speed = agentsState.current[idx + 4];
      const animOffset = agentsState.current[idx + 5];

      const dx = tx - x;
      const dy = ty - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.1) {
        if (walkableTiles.length > 0) {
          const tt = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
          tx = tt.x + getRandomRange(-0.4, 0.4);
          ty = tt.y + getRandomRange(-0.4, 0.4);
          agentsState.current[idx + 2] = tx;
          agentsState.current[idx + 3] = ty;
        }
      } else {
        x += (dx / dist) * speed;
        y += (dy / dist) * speed;
        agentsState.current[idx] = x;
        agentsState.current[idx + 1] = y;
      }

      const [wx, _, wz] = gridToWorld(x, y);
      const bounce = Math.abs(Math.sin(time * 10 + animOffset)) * 0.03;
      dummy.position.set(wx, -0.35 + 0.1 + bounce, wz);
      dummy.rotation.set(0, -Math.atan2(dy, dx), 0);
      dummy.scale.set(0.08, 0.2, 0.08);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (agentCount === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[boxGeo, undefined, agentCount]} castShadow>
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  )
};

const Cloud = ({ position, scale, speed }: { position: [number, number, number], scale: number, speed: number }) => {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (group.current) {
      group.current.position.x += speed * delta;
      if (group.current.position.x > GRID_SIZE * 1.5) group.current.position.x = -GRID_SIZE * 1.5;
    }
  });

  const bubbles = useMemo(() => Array.from({ length: 5 + Math.random() * 5 }).map(() => ({
    pos: [getRandomRange(-1, 1), getRandomRange(-0.5, 0.5), getRandomRange(-1, 1)] as [number, number, number],
    scale: getRandomRange(0.5, 1.2)
  })), []);

  return (
    <group ref={group} position={position} scale={scale}>
      {bubbles.map((b, i) => (
        <mesh key={i} geometry={sphereGeo} position={b.pos} scale={b.scale} castShadow>
          <meshStandardMaterial color="white" flatShading opacity={0.9} transparent />
        </mesh>
      ))}
    </group>
  )
}

const Bird = ({ position, speed, offset }: { position: [number, number, number], speed: number, offset: number }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      const time = state.clock.elapsedTime + offset;
      ref.current.position.x = position[0] + Math.sin(time * speed) * GRID_SIZE;
      ref.current.position.z = position[1] + Math.cos(time * speed) * GRID_SIZE / 2;
      ref.current.rotation.y = -time * speed + Math.PI;
      ref.current.scale.y = 1 + Math.sin(time * 15) * 0.3;
    }
  });

  return (
    <group ref={ref} position={[position[0], position[2], position[1]]}>
      <mesh geometry={boxGeo} scale={[0.2, 0.05, 0.05]} position={[0.1, 0, 0]} rotation={[0, Math.PI / 4, 0]}><meshBasicMaterial color="#333" /></mesh>
      <mesh geometry={boxGeo} scale={[0.2, 0.05, 0.05]} position={[-0.1, 0, 0]} rotation={[0, -Math.PI / 4, 0]}><meshBasicMaterial color="#333" /></mesh>
    </group>
  )
}

const PollutionSystem = ({ grid, windDirection }: { grid: Grid, windDirection: { x: number, y: number } }) => {
  const pollutedTiles = useMemo(() => {
    const tiles: { x: number, y: number, amount: number }[] = [];
    grid.forEach(row => row.forEach(tile => {
      if ((tile.pollution || 0) > 5) {
        tiles.push({ x: tile.x, y: tile.y, amount: tile.pollution });
      }
    }));
    return tiles;
  }, [grid]);

  const count = pollutedTiles.length;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (!meshRef.current || count === 0) return;
    const time = state.clock.elapsedTime;

    // Animate clouds
    pollutedTiles.forEach((tile, i) => {
      const [wx, _, wz] = gridToWorld(tile.x, tile.y);

      // Visual drift offset (looping to look like flow)
      const driftX = (Math.sin(time * 0.5 + tile.y) * 0.1) + windDirection.x * 0.1 * Math.sin(time);
      const driftZ = (Math.cos(time * 0.5 + tile.x) * 0.1) + windDirection.y * 0.1 * Math.sin(time);

      // Height varies with amount
      const h = 0.5 + (tile.amount / 100) * 1.5;

      dummy.position.set(wx + driftX, h, wz + driftZ);

      // Scale pulse
      const scale = (0.5 + (tile.amount / 100)) * (0.8 + Math.sin(time * 2 + i) * 0.2);
      dummy.scale.set(scale, scale * 0.6, scale);

      // Rotation (tumbling smog)
      dummy.rotation.set(time * 0.2, time * 0.1, 0);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Color adjustment (darker for heavy pollution)
      const darken = 1 - Math.min(1, tile.amount / 150);
      const color = new THREE.Color().setHSL(0.15, 0.1, 0.4 * darken);
      meshRef.current.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[sphereGeo, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial
        color="#4b5563"
        transparent
        opacity={0.6}
        roughness={1}
        depthWrite={false}
      />
    </instancedMesh>
  );
};


const boatColors = ['#f8fafc', '#e2e8f0', '#94a3b8']; // White/Grey hulls

const BoatSystem = ({ grid }: { grid: Grid }) => {
  const waterTiles = useMemo(() => {
    const tiles: { x: number, y: number }[] = [];
    grid.forEach(row => row.forEach(tile => {
      // Bridges are also water-traversable usually, or at least under them
      if (tile.buildingType === BuildingType.Water || tile.buildingType === BuildingType.Bridge) {
        tiles.push({ x: tile.x, y: tile.y });
      }
    }));
    return tiles;
  }, [grid]);

  const boatCount = Math.min(waterTiles.length, 20); // Fewer boats than cars
  const boatsRef = useRef<THREE.InstancedMesh>(null);
  const boatsState = useRef<Float32Array>(new Float32Array(0));
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (waterTiles.length < 2) return;
    boatsState.current = new Float32Array(boatCount * 6);
    const newColors = new Float32Array(boatCount * 3);

    for (let i = 0; i < boatCount; i++) {
      const startNode = waterTiles[Math.floor(Math.random() * waterTiles.length)];
      boatsState.current[i * 6 + 0] = startNode.x;
      boatsState.current[i * 6 + 1] = startNode.y;
      boatsState.current[i * 6 + 2] = startNode.x;
      boatsState.current[i * 6 + 3] = startNode.y;
      boatsState.current[i * 6 + 4] = 1;
      // Slower than cars
      boatsState.current[i * 6 + 5] = getRandomRange(0.005, 0.015);

      const color = new THREE.Color(boatColors[Math.floor(Math.random() * boatColors.length)]);
      newColors[i * 3] = color.r; newColors[i * 3 + 1] = color.g; newColors[i * 3 + 2] = color.b;
    }

    if (boatsRef.current) {
      boatsRef.current.instanceColor = new THREE.InstancedBufferAttribute(newColors, 3);
    }
  }, [waterTiles, boatCount]);

  useFrame((state) => {
    if (!boatsRef.current || waterTiles.length < 2 || boatsState.current.length === 0) return;

    // Bobbing animation
    const time = state.clock.elapsedTime;

    for (let i = 0; i < boatCount; i++) {
      const idx = i * 6;
      let curX = boatsState.current[idx];
      let curY = boatsState.current[idx + 1];
      let tarX = boatsState.current[idx + 2];
      let tarY = boatsState.current[idx + 3];
      let progress = boatsState.current[idx + 4];
      const speed = boatsState.current[idx + 5];

      progress += speed;

      if (progress >= 1) {
        curX = tarX;
        curY = tarY;
        progress = 0;
        const neighbors = waterTiles.filter(t => (Math.abs(t.x - curX) === 1 && t.y === curY) || (Math.abs(t.y - curY) === 1 && t.x === curX));
        if (neighbors.length > 0) {
          const next = neighbors[Math.floor(Math.random() * neighbors.length)];
          tarX = next.x; tarY = next.y;
        } else {
          const rnd = waterTiles[Math.floor(Math.random() * waterTiles.length)];
          curX = rnd.x; curY = rnd.y; tarX = rnd.x; tarY = rnd.y;
        }
      }

      boatsState.current[idx] = curX;
      boatsState.current[idx + 1] = curY;
      boatsState.current[idx + 2] = tarX;
      boatsState.current[idx + 3] = tarY;
      boatsState.current[idx + 4] = progress;

      const gx = MathUtils.lerp(curX, tarX, progress);
      const gy = MathUtils.lerp(curY, tarY, progress);
      const dx = tarX - curX;
      const dy = tarY - curY;
      const angle = Math.atan2(dy, dx);

      // Offset logic same as cars but maybe wider
      const offsetAmt = 0.2;

      const [wx, _, wz] = gridToWorld(gx, gy);

      const bob = Math.sin(time * 2 + i) * 0.02;
      const roll = Math.sin(time * 1.5 + i) * 0.05;

      dummy.position.set(wx, -0.6 + 0.15 + bob, wz); // Water level is -0.6
      dummy.rotation.set(roll, -angle, 0);
      dummy.scale.set(0.6, 0.2, 0.3); // Boat shape
      dummy.updateMatrix();
      boatsRef.current.setMatrixAt(i, dummy.matrix);
    }
    boatsRef.current.instanceMatrix.needsUpdate = true;
  });

  if (waterTiles.length < 2) return null;

  return (
    <group>
      <instancedMesh ref={boatsRef} args={[boxGeo, undefined, boatCount]} castShadow>
        <meshStandardMaterial roughness={0.1} color="#cbd5e1" />
      </instancedMesh>
    </group>
  );
};

// --- FESTIVAL SYSTEM ---
const FestivalSystem = ({ activeEvent }: { activeEvent: EconomicEvent }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particleCount = 200;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Initialize random positions for confetti
  const particles = useMemo(() => {
    return new Array(particleCount).fill(0).map(() => ({
      x: Math.random() * GRID_SIZE - GRID_SIZE / 2,
      y: Math.random() * 20 + 5, // Start high
      z: Math.random() * GRID_SIZE - GRID_SIZE / 2,
      speed: Math.random() * 0.2 + 0.1,
      color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
      rotationSpeed: Math.random() * 0.1
    }));
  }, []);

  useFrame(() => {
    if (!meshRef.current || activeEvent !== EconomicEvent.Festival) return;

    particles.forEach((p, i) => {
      p.y -= p.speed;
      if (p.y < 0) p.y = 25; // Reset to top

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.x += p.rotationSpeed;
      dummy.rotation.y += p.rotationSpeed;
      dummy.scale.set(0.3, 0.3, 0.3);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, p.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  if (activeEvent !== EconomicEvent.Festival) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <planeGeometry args={[0.5, 0.5]} />
      <meshBasicMaterial side={THREE.DoubleSide} vertexColors />
    </instancedMesh>
  );
};



// --- Disaster Visuals ---
const MeteorVisual = ({ position, progress }: { position: { x: number, y: number }, progress: number }) => {
  // Progress 0 -> 1 (Falling), 1+ (Explosion)
  const [wx, _, wz] = gridToWorld(position.x, position.y);
  const height = 30 * (1 - progress);

  // Trail particles
  const trailRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (trailRef.current) {
      trailRef.current.rotation.z += 0.2;
      trailRef.current.rotation.y += 0.2;
    }
  });

  if (progress >= 1) return (
    <group position={[wx, 0.5, wz]}>
      <mesh>
        <sphereGeometry args={[3, 16, 16]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={1 - (progress - 1) * 2} />
      </mesh>
      <pointLight intensity={5} distance={10} color="#f97316" decay={2} />
    </group>
  );

  return (
    <group position={[wx, height, wz]}>
      <mesh castShadow>
        <dodecahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color="#7f1d1d" emissive="#f97316" emissiveIntensity={2} />
      </mesh>
      <group ref={trailRef}>
        {Array.from({ length: 5 }).map((_, i) => (
          <mesh key={i} position={[Math.random() - 0.5, i + 1, Math.random() - 0.5]} scale={1 - i * 0.2}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#f97316" />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const AlienVisual = () => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.position.y = 10 + Math.sin(t) * 2;
      groupRef.current.rotation.y = t * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      {[[-10, -10], [10, 10], [-10, 10], [10, -10], [0, 0]].map((pos, i) => (
        <group key={i} position={[pos[0], 0, pos[1]]}>
          {/* UFO Body */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[2, 4, 1, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[1.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} opacity={0.8} transparent />
          </mesh>
          {/* Beam */}
          <mesh position={[0, -10, 0]}>
            <cylinderGeometry args={[1, 3, 20, 16]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* Spinning Lights */}
          <group rotation={[0, 0, 0]}>
            {[0, 1, 2, 3].map(j => (
              <mesh key={j} position={[Math.cos(j * Math.PI / 2) * 3, -0.5, Math.sin(j * Math.PI / 2) * 3]}>
                <sphereGeometry args={[0.3]} />
                <meshBasicMaterial color="#a3e635" />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
};

const DisasterManager = ({ activeDisaster }: { activeDisaster: ActiveDisaster | null }) => {
  if (!activeDisaster) return null;

  // Calc progress for Meteor
  // Warning duration is 5000ms.
  const now = Date.now();
  const elapsed = now - activeDisaster.startTime;

  if (activeDisaster.type === DisasterType.Meteor && activeDisaster.position) {
    // 0 to 1 during 5000ms
    const progress = Math.min(elapsed / 5000, 1.5); // Go a bit past 1 to show explosion
    return <MeteorVisual position={activeDisaster.position} progress={progress} />;
  }

  if (activeDisaster.type === DisasterType.AlienInvasion) {
    return <AlienVisual />;
  }

  return null;
}



const WeatherEffects = ({ weather }: { weather: WeatherType }) => {
  if (weather === WeatherType.Clear) return null;

  const count = (weather === WeatherType.Rain || weather === WeatherType.AcidRain) ? 1000 : 500;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Initialize particles
  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        getRandomRange(-20, 20),
        getRandomRange(0, 20),
        getRandomRange(-20, 20)
      );
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [weather, count, dummy]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const speed = (weather === WeatherType.Snow) ? 2 : 15;

    for (let i = 0; i < count; i++) {
      meshRef.current.getMatrixAt(i, dummy.matrix);
      dummy.position.setFromMatrixPosition(dummy.matrix); // extract pos

      dummy.position.y -= speed * delta;
      if (weather === WeatherType.Snow) {
        dummy.position.x += Math.sin(state.clock.elapsedTime + i) * 0.02;
      }

      if (dummy.position.y < 0) {
        dummy.position.y = 20;
        dummy.position.x = getRandomRange(-20, 20);
        dummy.position.z = getRandomRange(-20, 20);
      }

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const color = weather === WeatherType.AcidRain ? '#a3e635' : (weather === WeatherType.Snow ? '#ffffff' : '#93c5fd');
  const size = weather === WeatherType.Snow ? 0.1 : 0.05;
  const height = weather === WeatherType.Snow ? 0.1 : 0.5;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[size, height, size]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </instancedMesh>
  );
}

const EnvironmentEffects = ({ weather }: { weather: WeatherType }) => {
  return (
    <group raycast={() => null}>
      <Cloud position={[-12, 8, 4]} scale={1.5} speed={0.3} />
      <Cloud position={[5, 9, -8]} scale={1.2} speed={0.5} />
      <Cloud position={[15, 7, 10]} scale={1.8} speed={0.2} />
      <group position={[0, 0, 0]} scale={0.8}>
        <Bird position={[0, 0, 10]} speed={0.6} offset={0} />
        <Bird position={[0, 0, 10]} speed={0.6} offset={1.2} />
        <Bird position={[0, 0, 10]} speed={0.6} offset={2.5} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[GRID_SIZE * 4, GRID_SIZE * 4]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.1} metalness={0.5} opacity={0.8} transparent />
      </mesh>
      <WeatherEffects weather={weather} />
    </group >
  )
};

// --- 3. Main Map Component ---

const RoadMarkings = React.memo(({ x, y, grid, yOffset }: { x: number; y: number; grid: Grid; yOffset: number }) => {
  const lineMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fbbf24' }), []);
  const lineGeo = useMemo(() => new THREE.PlaneGeometry(0.1, 0.5), []);
  const hasUp = y > 0 && grid[y - 1][x].buildingType === BuildingType.Road;
  const hasDown = y < GRID_SIZE - 1 && grid[y + 1][x].buildingType === BuildingType.Road;
  const hasLeft = x > 0 && grid[y][x - 1].buildingType === BuildingType.Road;
  const hasRight = x < GRID_SIZE - 1 && grid[y][x + 1].buildingType === BuildingType.Road;
  const connections = [hasUp, hasDown, hasLeft, hasRight].filter(Boolean).length;
  if (connections === 0) return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, yOffset, 0]} geometry={lineGeo} material={lineMaterial} />;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, yOffset, 0]}>
      {(hasUp || hasDown) && (hasLeft || hasRight) && (
        <mesh position={[0, 0, 0.005]} material={lineMaterial}>
          <planeGeometry args={[0.12, 0.12]} />
        </mesh>
      )}
      {hasUp && <mesh position={[0, 0.25, 0]} geometry={lineGeo} material={lineMaterial} />}
      {hasDown && <mesh position={[0, -0.25, 0]} geometry={lineGeo} material={lineMaterial} />}
      {hasLeft && <mesh position={[-0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]} geometry={lineGeo} material={lineMaterial} />}
      {hasRight && <mesh position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]} geometry={lineGeo} material={lineMaterial} />}
    </group>
  );
});

interface GroundTileProps {
  type: BuildingType;
  x: number;
  y: number;
  grid: Grid;
  onHover: (x: number, y: number) => void;
  onLeave: () => void;
  onClick: (x: number, y: number) => void;
  neonMode?: boolean;
}



const Cursor = ({ x, y, color }: { x: number, y: number, color: string }) => {
  const [wx, _, wz] = gridToWorld(x, y);
  return (
    <mesh position={[wx, -0.25, wz]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} depthTest={false} />
      <Outlines thickness={0.05} color="white" />
    </mesh>
  );
};

interface IsoMapProps {
  grid: Grid;
  onTileClick: (x: number, y: number) => void;
  hoveredTool: BuildingType;
  population: number;
  day: number;
  neonMode?: boolean;
  weather: WeatherType;
  activeDisaster: ActiveDisaster | null;
  crimeRate: number;
  pollutionLevel: number;
  windDirection?: { x: number, y: number };
  activeEvent?: EconomicEvent;
}

const IsoMap: React.FC<IsoMapProps> = ({ grid, onTileClick, hoveredTool, population, day = 1, neonMode = false, weather, activeDisaster, crimeRate, pollutionLevel, windDirection, activeEvent }) => {
  const [hoveredTile, setHoveredTile] = useState<{ x: number, y: number } | null>(null);
  const handleHover = useCallback((x: number, y: number) => { setHoveredTile({ x, y }); }, []);
  const handleLeave = useCallback(() => { setHoveredTile(null); }, []);
  const showPreview = hoveredTile && grid[hoveredTile.y][hoveredTile.x].buildingType === BuildingType.None && hoveredTool !== BuildingType.None;
  const previewColor = showPreview ? BUILDINGS[hoveredTool].color : 'white';
  const isBulldoze = hoveredTool === BuildingType.None;
  const previewPos = hoveredTile ? gridToWorld(hoveredTile.x, hoveredTile.y) : [0, 0, 0];

  return (
    <div className="absolute inset-0 bg-sky-900 touch-none">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
      >
        <OrthographicCamera makeDefault zoom={45} position={[20, 20, 20]} near={-100} far={200} />
        <MapControls
          makeDefault
          enableZoom={true} // Explicitly true
          enablePan={true}
          enableRotate={false} // Isometric view locked
          minZoom={10}
          maxZoom={100}
          dampingFactor={0.05}
        />
        <ambientLight intensity={0.8} color="#cceeff" />
        <directionalLight
          position={[15, 20, 10]}
          intensity={1.5}
          color="#fffbeb"
        // Shadows DISABLED for stability
        // castShadow
        // shadow-mapSize={[1024, 1024]}
        />
        {/* <Environment preset="city" /> - DISABLED */}
        {/* LIGHT SYSTEMS DISABLED */}
        {/* <DayNightCycle day={day} neonMode={neonMode} weather={weather} activeDisaster={activeDisaster} /> */}
        <group>
          <GroundSystem
            grid={grid}
            onTileClick={(x, y) => onTileClick(x, y)}
            hoveredTile={hoveredTile}
            neonMode={neonMode}
          />

          {/* Toggle for Quality vs Performance. Setting to TRUE (Quality) by default as requested. */}
          {/* Use Instanced BuildingSystem for Roads/Water/Empty? No, BuildingSystem only does Buildings. */}
          {/* DetailedBuilding loop for buildings. */}
          
          {true ? (
            // Quality Mode: Render individual detailed components
            grid.map((row) => row.map((tile) => {
               if (tile.buildingType === BuildingType.None || tile.buildingType === BuildingType.Road || tile.buildingType === BuildingType.Water) return null;
               const [wx, _, wz] = gridToWorld(tile.x, tile.y);
               const config = BUILDINGS[tile.buildingType];
               return (
                 <DetailedBuilding
                   key={tile.x + '-' + tile.y}
                   type={tile.buildingType}
                   baseColor={config.color}
                   heightVar={1.0}
                   rotation={0}
                   hasRoadAccess={tile.hasRoadAccess}
                   isHovered={hoveredTile?.x === tile.x && hoveredTile?.y === tile.y}
                   position={[wx, -0.5, wz]} // Align with GroundSystem
                   onClick={() => onTileClick(tile.x, tile.y)}
                 />
               );
            }))
          ) : (
             // Performance Mode: Instanced
             <BuildingSystem
                grid={grid}
                hoveredTile={hoveredTile}
                neonMode={neonMode}
                onTileClick={onTileClick}
             />
          )}

          {/* Buildings (Legacy Loop Removed) */}
          {/* {grid.map((row, y) => row.map((tile, x) => ... ))} */}

          {/* HEAVY SYSTEMS DISABLED TEMPORARILY */}
          {/* <EnvironmentEffects weather={weather} /> */}
          {/* <DisasterManager activeDisaster={activeDisaster} /> */}
          {/* <TrafficSystem grid={grid} crimeRate={crimeRate} /> */}
          {/* <BoatSystem grid={grid} /> */}
          {/* <PollutionSystem grid={grid} windDirection={windDirection || { x: 1, y: 0 }} /> */}
          {/* <FestivalSystem activeEvent={activeEvent || EconomicEvent.None} /> */}
          {/* <PopulationSystem population={population} grid={grid} /> */}

          {showPreview && hoveredTile && (
            <group position={[previewPos[0], 0, previewPos[2]]}>
              <Float speed={3} rotationIntensity={0} floatIntensity={0.1} floatingRange={[0, 0.1]}>
                {/* Simplified Preview Ghost */}
                <mesh>
                  <boxGeometry args={[0.8, 1, 0.8]} />
                  <meshBasicMaterial color={previewColor} transparent opacity={0.5} />
                </mesh>
              </Float>
            </group>
          )}
          {hoveredTile && (
            <Cursor x={hoveredTile.x} y={hoveredTile.y} color={isBulldoze ? '#ef4444' : (showPreview ? '#ffffff' : '#000000')} />
          )}
        </group>
      </Canvas>
    </div >
  );
};

export default IsoMap;
