
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, ThreeElements } from '@react-three/fiber';
import { MapControls, Environment, Float, Outlines, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { MathUtils } from 'three';
import { Grid, BuildingType, WeatherType, DisasterType, ActiveDisaster } from '../types';
import { GRID_SIZE, BUILDINGS } from '../constants';

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

interface BuildingMeshProps {
  type: BuildingType;
  baseColor: string;
  x: number;
  y: number;
  opacity?: number;
  transparent?: boolean;
}

const ProceduralBuilding = React.memo(({ type, baseColor, x, y, opacity = 1, transparent = false }: BuildingMeshProps) => {
  const hash = getHash(x, y);
  const variant = Math.floor(hash * 100); // 0-99
  const rotation = Math.floor(hash * 4) * (Math.PI / 2);

  const color = useMemo(() => {
    const c = new THREE.Color(baseColor);
    c.offsetHSL(hash * 0.1 - 0.05, 0, hash * 0.2 - 0.1);
    return c;
  }, [baseColor, hash]);

  const mainMat = useMemo(() => new THREE.MeshStandardMaterial({ color, flatShading: true, opacity, transparent, roughness: 0.8 }), [color, opacity, transparent]);
  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), flatShading: true, opacity, transparent }), [color, opacity, transparent]);
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.5).offsetHSL(0, 0, -0.1), flatShading: true, opacity, transparent }), [color, opacity, transparent]);

  const commonProps = { castShadow: true, receiveShadow: true };
  const yOffset = -0.3;
  const [wx, _, wz] = gridToWorld(x, y);

  return (
    <group rotation={[0, rotation, 0]} position={[wx, yOffset, wz]}>
      {(() => {
        switch (type) {
          case BuildingType.Residential:
            if (variant < 33) {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.3, 0]} scale={[0.7, 0.6, 0.6]} />
                  <mesh {...commonProps} material={roofMat} geometry={coneGeo} position={[0, 0.75, 0]} scale={[0.6, 0.4, 0.6]} rotation={[0, Math.PI / 4, 0]} />
                  <WindowBlock position={[0.2, 0.3, 0.31]} scale={[0.15, 0.2, 0.05]} />
                  <WindowBlock position={[-0.2, 0.3, 0.31]} scale={[0.15, 0.2, 0.05]} />
                  <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0, 0.1, 0.32]} scale={[0.15, 0.2, 0.05]} />
                </>
              );
            } else if (variant < 66) {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[-0.1, 0.35, 0]} scale={[0.6, 0.7, 0.8]} />
                  <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0.25, 0.25, 0.1]} scale={[0.4, 0.5, 0.6]} />
                  <WindowBlock position={[-0.1, 0.5, 0.41]} scale={[0.4, 0.2, 0.05]} />
                </>
              );
            } else {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.5, 0]} scale={[0.5, 1, 0.6]} />
                  <mesh {...commonProps} material={roofMat} geometry={boxGeo} position={[0, 1.05, 0]} scale={[0.55, 0.1, 0.65]} />
                  <WindowBlock position={[0, 0.7, 0.31]} scale={[0.3, 0.2, 0.05]} />
                  <WindowBlock position={[0, 0.3, 0.31]} scale={[0.3, 0.2, 0.05]} />
                </>
              );
            }

          case BuildingType.Commercial:
            if (variant < 40) {
              const height = 1.5 + hash * 1.5;
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, height / 2, 0]} scale={[0.7, height, 0.7]} />
                  {Array.from({ length: Math.floor(height * 3) }).map((_, i) => (
                    <WindowBlock key={i} position={[0, 0.2 + i * 0.3, 0]} scale={[0.72, 0.15, 0.72]} />
                  ))}
                  <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0, height + 0.1, 0]} scale={[0.5, 0.2, 0.5]} />
                </>
              );
            } else if (variant < 70) {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.9, 0.8, 0.8]} />
                  <WindowBlock position={[0, 0.3, 0.41]} scale={[0.8, 0.4, 0.05]} />
                  <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: hash > 0.5 ? '#ef4444' : '#3b82f6' })} geometry={boxGeo} position={[0, 0.55, 0.5]} scale={[0.9, 0.1, 0.2]} rotation={[Math.PI / 6, 0, 0]} />
                </>
              );
            } else {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[-0.2, 0.5, -0.2]} scale={[0.5, 1, 0.5]} />
                  <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0.1, 0.3, 0.1]} scale={[0.7, 0.6, 0.7]} />
                  <WindowBlock position={[0.1, 0.3, 0.46]} scale={[0.6, 0.3, 0.05]} />
                  <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#9ca3af' })} geometry={boxGeo} position={[0.2, 0.65, 0.2]} scale={[0.2, 0.1, 0.2]} />
                </>
              )
            }

          case BuildingType.Industrial:
            if (variant < 50) {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.9, 0.8, 0.8]} />
                  <mesh {...commonProps} material={roofMat} geometry={boxGeo} position={[-0.2, 0.9, 0]} scale={[0.4, 0.2, 0.8]} rotation={[0, 0, Math.PI / 4]} />
                  <mesh {...commonProps} material={roofMat} geometry={boxGeo} position={[0.2, 0.9, 0]} scale={[0.4, 0.2, 0.8]} rotation={[0, 0, Math.PI / 4]} />
                  <SmokeStack position={[0.3, 0.4, 0.3]} />
                </>
              );
            } else {
              return (
                <>
                  <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[-0.2, 0.3, 0]} scale={[0.5, 0.6, 0.9]} />
                  <mesh {...commonProps} material={accentMat} geometry={cylinderGeo} position={[0.25, 0.4, -0.2]} scale={[0.2, 0.8, 0.2]} />
                  <mesh {...commonProps} material={accentMat} geometry={cylinderGeo} position={[0.25, 0.4, 0.25]} scale={[0.2, 0.8, 0.2]} />
                  <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#6b7280' })} geometry={boxGeo} position={[0.25, 0.7, 0]} scale={[0.05, 0.05, 0.5]} />
                </>
              );
            }

          case BuildingType.Park:
            const treeCount = 1 + Math.floor(hash * 3);
            const positions = [[-0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2]];

            return (
              <group position={[0, -yOffset - 0.29, 0]}>
                <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                  <planeGeometry args={[0.9, 0.9]} />
                  <meshStandardMaterial color="#86efac" />
                </mesh>

                {variant < 30 && (
                  <group position={[0, 0.05, 0]}>
                    <mesh material={new THREE.MeshStandardMaterial({ color: '#cbd5e1' })} geometry={cylinderGeo} scale={[0.4, 0.1, 0.4]} castShadow receiveShadow />
                    <mesh material={new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.1 })} geometry={cylinderGeo} position={[0, 0.06, 0]} scale={[0.3, 0.05, 0.3]} />
                  </group>
                )}

                {Array.from({ length: treeCount }).map((_, i) => {
                  const pos = positions[i % positions.length];
                  const scale = 0.5 + getHash(x + i, y - i) * 0.5;
                  const treeColor = new THREE.Color("#166534").offsetHSL(0, 0, getHash(x, y + i) * 0.2);
                  return (
                    <group key={i} position={[pos[0], 0, pos[1]]} scale={scale} rotation={[0, getHash(i, x) * Math.PI, 0]}>
                      <mesh castShadow receiveShadow material={new THREE.MeshStandardMaterial({ color: '#78350f' })} geometry={cylinderGeo} position={[0, 0.15, 0]} scale={[0.1, 0.3, 0.1]} />
                      <mesh castShadow receiveShadow material={new THREE.MeshStandardMaterial({ color: treeColor, flatShading: true })} geometry={coneGeo} position={[0, 0.4, 0]} scale={[0.4, 0.5, 0.4]} />
                      <mesh castShadow receiveShadow material={new THREE.MeshStandardMaterial({ color: treeColor, flatShading: true })} geometry={coneGeo} position={[0, 0.65, 0]} scale={[0.3, 0.4, 0.3]} />
                    </group>
                  )
                })}
              </group>
            );

          case BuildingType.School:
            return (
              <>
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.9, 0.6, 0.7]} />
                <mesh {...commonProps} material={roofMat} geometry={boxGeo} position={[0, 0.72, 0]} scale={[0.95, 0.1, 0.75]} />
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0.25, 0.8, 0.2]} scale={[0.25, 0.8, 0.25]} />
                <mesh {...commonProps} material={roofMat} geometry={coneGeo} position={[0.25, 1.3, 0.2]} scale={[0.3, 0.4, 0.3]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.5 })} geometry={sphereGeo} position={[0.25, 1.1, 0.33]} scale={0.08} />
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[-0.1, 0.2, 0.36]} scale={[0.3, 0.4, 0.1]} />
                <WindowBlock position={[-0.2, 0.4, 0.36]} scale={[0.2, 0.2, 0.05]} />
                <WindowBlock position={[-0.2, 0.4, -0.36]} scale={[0.2, 0.2, 0.05]} />
              </>
            );

          case BuildingType.Hospital:
            return (
              <>
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[-0.25, 0.6, 0]} scale={[0.3, 1.2, 0.8]} />
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0.25, 0.6, 0]} scale={[0.3, 1.2, 0.8]} />
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.6, 0]} scale={[0.3, 0.8, 0.4]} />
                <mesh {...commonProps} material={roofMat} geometry={cylinderGeo} position={[-0.25, 1.21, 0]} scale={[0.25, 0.05, 0.25]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#ef4444' })} geometry={boxGeo} position={[-0.25, 1.22, 0]} scale={[0.15, 0.05, 0.15]} />
                <WindowBlock position={[-0.25, 0.8, 0.41]} scale={[0.2, 0.4, 0.05]} />
                <WindowBlock position={[0.25, 0.8, 0.41]} scale={[0.2, 0.4, 0.05]} />
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0, 0.15, 0.25]} scale={[0.4, 0.3, 0.3]} />
              </>
            );

          case BuildingType.Casino:
            return (
              <>
                {/* Main Building */}
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.9, 0.8, 0.9]} />
                {/* Entrance Arch */}
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0, 0.6, 0.46]} scale={[0.6, 0.4, 0.05]} />
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[-0.2, 0.3, 0.46]} scale={[0.15, 0.2, 0.05]} />
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0.2, 0.3, 0.46]} scale={[0.15, 0.2, 0.05]} />
                {/* Sign */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 1 })} geometry={boxGeo} position={[0, 0.9, 0.46]} scale={[0.5, 0.1, 0.05]} />
                {/* Roof Details */}
                <mesh {...commonProps} material={roofMat} geometry={cylinderGeo} position={[0, 0.85, 0]} scale={[0.7, 0.1, 0.7]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.8 })} geometry={sphereGeo} position={[0.3, 0.95, 0.3]} scale={0.1} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 0.8 })} geometry={sphereGeo} position={[-0.3, 0.95, -0.3]} scale={0.1} />
              </>
            );

          case BuildingType.Police:
            return (
              <>
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.3, 0]} scale={[0.8, 0.6, 0.8]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#1e3a8a' })} geometry={boxGeo} position={[0.2, 0.7, -0.2]} scale={[0.3, 1.2, 0.3]} />
                <WindowBlock position={[0.2, 0.9, -0.04]} scale={[0.2, 0.4, 0.05]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 2 })} geometry={boxGeo} position={[-0.2, 0.65, 0.3]} scale={[0.1, 0.1, 0.1]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 2 })} geometry={boxGeo} position={[0, 0.65, 0.3]} scale={[0.1, 0.1, 0.1]} />
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[-0.2, 0.2, 0.41]} scale={[0.3, 0.4, 0.05]} />
              </>
            );

          case BuildingType.FireStation:
            return (
              <>
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.9, 0.8, 0.7]} />
                {/* Garage Doors */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#7f1d1d' })} geometry={boxGeo} position={[-0.2, 0.25, 0.36]} scale={[0.25, 0.4, 0.05]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#7f1d1d' })} geometry={boxGeo} position={[0.2, 0.25, 0.36]} scale={[0.25, 0.4, 0.05]} />
                {/* Tower */}
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0.3, 0.8, -0.2]} scale={[0.25, 0.6, 0.25]} />
                <mesh {...commonProps} material={roofMat} geometry={coneGeo} position={[0.3, 1.2, -0.2]} scale={[0.3, 0.3, 0.3]} />
                {/* Roof details */}
                <mesh {...commonProps} material={roofMat} geometry={boxGeo} position={[0, 0.82, 0]} scale={[0.95, 0.05, 0.75]} />
              </>
            );

          case BuildingType.GoldMine:
            return (
              <>
                {/* Rocky Base */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.9 })} geometry={cylinderGeo} position={[0, 0.2, 0]} scale={[0.9, 0.4, 0.9]} />
                {/* Mine Shaft Entrance */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#27272a' })} geometry={boxGeo} position={[0, 0.3, 0.2]} scale={[0.4, 0.4, 0.4]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#52525b' })} geometry={boxGeo} position={[0, 0.5, 0.2]} scale={[0.5, 0.1, 0.5]} />
                {/* Gold Veins */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.8 })} geometry={sphereGeo} position={[0.3, 0.2, -0.3]} scale={0.15} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.8 })} geometry={sphereGeo} position={[-0.3, 0.1, 0.1]} scale={0.12} />
                {/* Crane/Pulley */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#475569' })} geometry={cylinderGeo} position={[-0.2, 0.6, -0.2]} scale={[0.05, 0.8, 0.05]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#475569' })} geometry={boxGeo} position={[-0.1, 1.0, -0.2]} scale={[0.3, 0.05, 0.05]} />
              </>
            );

          case BuildingType.Apartment:
            return (
              <>
                {/* Compact Block */}
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.7, 0.8, 0.7]} />
                {/* Flat Roof */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#64748b' })} geometry={boxGeo} position={[0, 0.81, 0]} scale={[0.75, 0.05, 0.75]} />
                {/* Balconies */}
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0.36, 0.3, 0]} scale={[0.1, 0.05, 0.4]} />
                <mesh {...commonProps} material={accentMat} geometry={boxGeo} position={[0.36, 0.6, 0]} scale={[0.1, 0.05, 0.4]} />
                <WindowBlock position={[0.36, 0.45, 0]} scale={[0.05, 0.2, 0.3]} />
              </>
            );

          case BuildingType.Water:
            return (
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[0.95, 0.4, 0.95]} />
                <meshStandardMaterial color="#3b82f6" transparent opacity={0.8} roughness={0.1} />
              </mesh>
            );

          case BuildingType.Bridge:
            return (
              <group position={[0, 0.55, 0]}>
                {/* Deck */}
                <mesh position={[0, 0, 0]}>
                  <boxGeometry args={[0.95, 0.1, 0.95]} />
                  <meshStandardMaterial color="#78350f" />
                </mesh>
                {/* Leg 1 */}
                <mesh position={[-0.3, -0.35, -0.3]}>
                  <boxGeometry args={[0.2, 0.5, 0.2]} />
                  <meshStandardMaterial color="#555555" />
                </mesh>
                {/* Leg 2 */}
                <mesh position={[0.3, -0.35, 0.3]}>
                  <boxGeometry args={[0.2, 0.5, 0.2]} />
                  <meshStandardMaterial color="#555555" />
                </mesh>
              </group>
            );

          case BuildingType.Mansion:
            return (
              <>
                {/* Main Hall */}
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0, 0.4, 0]} scale={[0.6, 0.8, 0.6]} />
                {/* Wings */}
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[-0.3, 0.3, 0]} scale={[0.4, 0.6, 0.5]} />
                <mesh {...commonProps} material={mainMat} geometry={boxGeo} position={[0.3, 0.3, 0]} scale={[0.4, 0.6, 0.5]} />
                {/* Roofs */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#581c87' })} geometry={coneGeo} position={[0, 1.0, 0]} scale={[0.5, 0.4, 0.5]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#581c87' })} geometry={boxGeo} position={[-0.3, 0.65, 0]} scale={[0.45, 0.1, 0.55]} />
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#581c87' })} geometry={boxGeo} position={[0.3, 0.65, 0]} scale={[0.45, 0.1, 0.55]} />
                {/* Entrance Pillars */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#e2e8f0' })} geometry={cylinderGeo} position={[0, 0.2, 0.4]} scale={[0.05, 0.4, 0.05]} />
                {/* Pool */}
                <mesh {...commonProps} material={new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.1 })} geometry={boxGeo} position={[0, 0.05, -0.4]} scale={[0.4, 0.05, 0.3]} />
              </>
            );

          case BuildingType.Road:
            return null;
          default:
            return null;
        }
      })()}
    </group>
  );
});

// --- 2. Dynamic Systems ---

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
      // ... (Omitting inner loop details for brevity as I am just anchoring, but replace_file_content needs context)
      // Wait, I can't omit. I need to match EXACTLY.
      // I will use `insert after` logic? No, only replace.
      // I will try to find a safe insertion point. 
      // End of BoatSystem is easier?
    }
    // ...
  });
  // This is too hard to match exactly inside the function.
  // I will append AFTER BoatSystem.

  if (boatCount === 0) return null; // Wait, BoatSystem ends around line 830?
  // Let's look at the file end of BoatSystem
  // It ends with:
  //   return (
  //     <instancedMesh ref={boatsRef} args={[boxGeo, undefined, boatCount]} castShadow>
  //       <meshStandardMaterial roughness={0.1} />
  //     </instancedMesh>
  //   );
  // };

  // I will check line 838 or so.

  // Actually, I'll just look for the END of BoatSystem and insert PollutionSystem after it.

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

const GroundTile = React.memo(({ type, x, y, grid, onHover, onLeave, onClick, neonMode }: GroundTileProps) => {
  const [wx, _, wz] = gridToWorld(x, y);
  let color = '#10b981';
  let topY = -0.3;
  let thickness = 0.5;

  if (neonMode) {
    // CYBERPUNK TERRAIN
    if (type === BuildingType.None) {
      // Dark grid
      color = (x + y) % 2 === 0 ? '#1e1b4b' : '#312e81'; // Indigo-950/900
      topY = -0.3;
    } else if (type === BuildingType.Road) {
      color = '#000000';
      topY = -0.29;
    } else if (type === BuildingType.Water || type === BuildingType.Bridge) {
      color = '#06b6d4'; // Cyan-500 Glowing
      topY = -0.6;
    } else {
      color = '#4c1d95'; // Violet-900 (Under building)
      topY = -0.28;
    }
  } else {
    if (type === BuildingType.None) {
      const noise = getHash(x, y);
      color = noise > 0.7 ? '#059669' : noise > 0.3 ? '#10b981' : '#34d399';
      topY = -0.3 - noise * 0.1;
    } else if (type === BuildingType.Road) {
      color = '#4b5563'; // Gray-600
      topY = -0.29;
    } else if (type === BuildingType.Water || type === BuildingType.Bridge) {
      color = '#3b82f6'; // Blue-500
      topY = -0.6; // Deep seabed
    } else {
      // Softer Greens (Pastel/Emerald)
      const noise = getHash(x, y);
      color = noise > 0.7 ? '#6ee7b7' : noise > 0.3 ? '#86efac' : '#a7f3d0'; // Emerald-300 to Green-200
      topY = -0.28;
    }
  }
  const centerY = topY - thickness / 2;
  return (
    <mesh
      position={[wx, centerY, wz]}
      receiveShadow castShadow
      onPointerEnter={(e) => { e.stopPropagation(); onHover(x, y); }}
      onPointerOut={(e) => { e.stopPropagation(); onLeave(); }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button === 0) onClick(x, y);
      }}
    >
      <boxGeometry args={[1, thickness, 1]} />
      <meshStandardMaterial
        color={color}
        flatShading
        roughness={neonMode && type !== BuildingType.None ? 0.2 : 1}
        emissive={neonMode && type === BuildingType.Water ? "#06b6d4" : undefined}
        emissiveIntensity={neonMode && type === BuildingType.Water ? 0.5 : 0}
      />
      {type === BuildingType.Road && <RoadMarkings x={x} y={y} grid={grid} yOffset={thickness / 2 + 0.001} />}
    </mesh>
  );
});

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
}

const IsoMap: React.FC<IsoMapProps> = ({ grid, onTileClick, hoveredTool, population, day = 1, neonMode = false, weather, activeDisaster, crimeRate, pollutionLevel, windDirection }) => {
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
          enableRotate={true}
          enableZoom={true}
          minZoom={20}
          maxZoom={120}
          maxPolarAngle={Math.PI / 2.2}
          minPolarAngle={0.1}
          target={[0, -0.5, 0]}
        />
        <ambientLight intensity={0.5} color="#cceeff" />
        <directionalLight
          castShadow
          position={[15, 20, 10]}
          intensity={2}
          color="#fffbeb"
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-15} shadow-camera-right={15}
          shadow-camera-top={15} shadow-camera-bottom={-15}
          shadow-bias={-0.0005}
        />
        <Environment preset="city" />
        <DayNightCycle day={day} neonMode={neonMode} weather={weather} activeDisaster={activeDisaster} />
        <group>
          {grid.map((row, y) => row.map((tile, x) => {
            return (
              <React.Fragment key={`${x}-${y}`}>
                <GroundTile type={tile.buildingType} x={x} y={y} grid={grid} onHover={handleHover} onLeave={handleLeave} onClick={onTileClick} neonMode={neonMode} />
              </React.Fragment>
            )
          }))}

          {/* Buildings */}
          {grid.map(row => row.map(tile => {
            // Render everything except None, Road, and Water (Water is flat tile only for now, unless we want 3D water)
            if (tile.buildingType !== BuildingType.None && tile.buildingType !== BuildingType.Road && tile.buildingType !== BuildingType.Water) {
              const config = BUILDINGS[tile.buildingType];
              // Neon Logic: Switch to dark colors if mode on
              const startColor = neonMode ? '#1e293b' : (config ? config.color : '#888888'); // Fallback color
              return (
                <ProceduralBuilding
                  key={`b-${tile.x}-${tile.y}`}
                  type={tile.buildingType}
                  baseColor={startColor}
                  x={tile.x}
                  y={tile.y}
                />
              );
            }
            return null;
          }))}

          <EnvironmentEffects weather={weather} />
          <DisasterManager activeDisaster={activeDisaster} />
          <TrafficSystem grid={grid} crimeRate={crimeRate} />
          <BoatSystem grid={grid} />
          <PollutionSystem grid={grid} windDirection={windDirection || { x: 1, y: 0 }} />
          <PopulationSystem population={population} grid={grid} />
          {showPreview && hoveredTile && (
            <group position={[previewPos[0], 0, previewPos[2]]}>
              <Float speed={3} rotationIntensity={0} floatIntensity={0.1} floatingRange={[0, 0.1]}>
                <ProceduralBuilding type={hoveredTool} baseColor={previewColor} x={hoveredTile.x} y={hoveredTile.y} transparent opacity={0.7} />
              </Float>
            </group>
          )}
          {hoveredTile && (
            <Cursor x={hoveredTile.x} y={hoveredTile.y} color={isBulldoze ? '#ef4444' : (showPreview ? '#ffffff' : '#000000')} />
          )}
        </group>
      </Canvas>
    </div>
  );
};

export default IsoMap;
