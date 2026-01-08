import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BuildingType } from '../types';
import { Float } from '@react-three/drei';

// Reusable Geometries
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const sphereGeo = new THREE.SphereGeometry(1, 8, 8);

// Materials
const concreteMat = new THREE.MeshStandardMaterial({ color: '#8899a6', roughness: 0.8 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#60a5fa', roughness: 0.1, metalness: 0.9, opacity: 0.8, transparent: true });
const metalMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.3, metalness: 0.8 });
const emissiveCyan = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 2 });
const emissivePink = new THREE.MeshStandardMaterial({ color: '#e879f9', emissive: '#e879f9', emissiveIntensity: 2 });

interface DetailedBuildingProps {
    type: BuildingType;
    baseColor: string;
    heightVar: number;
    rotation: number;
    hasRoadAccess?: boolean;
    isHovered?: boolean;
    position: [number, number, number];
    onClick?: () => void;
}

export const DetailedBuilding = React.memo(({ type, baseColor, heightVar, rotation, hasRoadAccess, isHovered, position, onClick }: DetailedBuildingProps) => {

    const seed = useMemo(() => Math.random(), []); // Random seed for variation
    const buildingHeight = useMemo(() => Math.max(0.6, heightVar), [heightVar]);

    const content = useMemo(() => {
        const common = { castShadow: true, receiveShadow: true };

        switch (type) {
            case BuildingType.Residential:
                // Sci-Fi Condo: Stacked offset boxes
                return (
                    <group>
                        {/* Base */}
                        <mesh {...common} geometry={boxGeo} material={concreteMat} position={[0, 0.3, 0]} scale={[0.8, 0.6, 0.8]} />
                        {/* Living Unit 1 */}
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: baseColor })} position={[0.1, 0.7, 0.1]} scale={[0.6, 0.5, 0.6]} />
                        {/* Living Unit 2 (Rotated/Offset) */}
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: '#e2e8f0' })} position={[-0.1, 1.1, -0.1]} scale={[0.5, 0.5, 0.5]} />
                        {/* Window/Glow */}
                        <mesh geometry={boxGeo} material={emissiveCyan} position={[0.1, 0.7, 0.41]} scale={[0.2, 0.2, 0.05]} />
                    </group>
                );
            case BuildingType.Apartment:
                // High-rise Capsule Tower
                return (
                    <group>
                        <mesh {...common} geometry={boxGeo} material={metalMat} position={[0, buildingHeight * 0.8, 0]} scale={[0.6, buildingHeight * 1.6, 0.6]} />
                        {/* Capsules sticking out */}
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: baseColor })} position={[0.2, buildingHeight * 0.5, 0]} scale={[0.5, 0.3, 0.7]} />
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: baseColor })} position={[-0.2, buildingHeight * 1.0, 0]} scale={[0.5, 0.3, 0.7]} />
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: baseColor })} position={[0, buildingHeight * 1.4, 0.2]} scale={[0.7, 0.3, 0.4]} />
                        {/* Roof Element */}
                        <mesh geometry={cylinderGeo} material={emissiveCyan} position={[0, buildingHeight * 1.6 + 0.1, 0]} scale={[0.1, 0.4, 0.1]} />
                    </group>
                );
            case BuildingType.Commercial:
                // Cyberpunk Shop: Glass front + Neon
                return (
                    <group>
                        {/* Main Structure */}
                        <mesh {...common} geometry={boxGeo} material={metalMat} position={[0, 0.5 * buildingHeight, 0]} scale={[0.9, buildingHeight, 0.9]} />
                        {/* Glass Front */}
                        <mesh geometry={boxGeo} material={glassMat} position={[0, 0.5 * buildingHeight, 0.46]} scale={[0.85, buildingHeight * 0.9, 0.1]} />
                        {/* Neon Sign Header */}
                        <mesh geometry={boxGeo} material={emissivePink} position={[0, buildingHeight, 0.5]} scale={[0.9, 0.2, 0.1]} />
                        {/* Side Vents */}
                        <mesh geometry={boxGeo} material={concreteMat} position={[0.5, 0.2, 0]} scale={[0.1, 0.8, 0.8]} />
                    </group>
                );
            case BuildingType.Industrial:
                // Factory: Pipes and Tanks
                return (
                    <group>
                        {/* Main Hall */}
                        <mesh {...common} geometry={boxGeo} material={metalMat} position={[0, 0.4, 0]} scale={[0.95, 0.8, 0.95]} />
                        {/* Smokestacks */}
                        <mesh {...common} geometry={cylinderGeo} material={new THREE.MeshStandardMaterial({ color: '#333' })} position={[0.25, 0.9, 0.25]} scale={[0.15, 0.6, 0.15]} />
                        <mesh {...common} geometry={cylinderGeo} material={new THREE.MeshStandardMaterial({ color: '#333' })} position={[-0.25, 0.8, -0.25]} scale={[0.12, 0.8, 0.12]} />
                        {/* Glowing Core */}
                        <mesh geometry={sphereGeo} material={emissiveCyan} position={[0, 0.4, 0]} scale={[0.3, 0.3, 0.3]} />
                    </group>
                );
            case BuildingType.MegaMall:
                return (
                    <group>
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: '#ec4899' })} position={[0, 0.6, 0]} scale={[1, 1.2, 1]} />
                        <mesh geometry={boxGeo} material={glassMat} position={[0, 0.6, 0.51]} scale={[0.9, 1, 0.05]} />
                        <mesh geometry={boxGeo} material={emissivePink} position={[0, 1.3, 0]} scale={[1.1, 0.1, 1.1]} />
                        {/* Huge holograms? */}
                    </group>
                )
            case BuildingType.Hospital:
                return (
                    <group>
                        <mesh {...common} geometry={boxGeo} material={new THREE.MeshStandardMaterial({ color: '#f8fafc' })} position={[0, 0.6, 0]} scale={[0.9, 1.2, 0.9]} />
                        {/* Cross Sign */}
                        <group position={[0, 1.0, 0.46]} scale={[0.4, 0.4, 0.1]}>
                            <mesh geometry={boxGeo} material={new THREE.MeshBasicMaterial({ color: 'red' })} scale={[0.3, 1, 1]} />
                            <mesh geometry={boxGeo} material={new THREE.MeshBasicMaterial({ color: 'red' })} scale={[1, 0.3, 1]} />
                        </group>
                        <mesh geometry={cylinderGeo} material={glassMat} position={[0, 1.25, 0]} scale={[0.6, 0.1, 0.6]} />
                    </group>
                );
            default:
                // Default Tech Box
                return (
                    <group>
                        <mesh {...common} geometry={boxGeo} material={metalMat} position={[0, 0.4 * buildingHeight, 0]} scale={[0.7, 0.8 * buildingHeight, 0.7]} />
                        <mesh geometry={boxGeo} material={emissiveCyan} position={[0, 0.7 * buildingHeight, 0]} scale={[0.75, 0.05, 0.75]} />
                    </group>
                );
        }
    }, [type, baseColor, buildingHeight, seed]);

    // Warning Indicator Component
    const WarningIndicator = () => (
        <group position={[0, 1.8, 0]}>
            {/* Floating holographic look */}
            <Float speed={5} rotationIntensity={0} floatIntensity={0.5}>
                <mesh>
                    <sphereGeometry args={[0.15]} />
                    <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
                </mesh>
                <mesh position={[0, 0, 0]}>
                    <ringGeometry args={[0.2, 0.25, 32]} />
                    <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} transparent opacity={0.5} />
                </mesh>
            </Float>
            {/* Line to ground */}
            <mesh position={[0, -0.6, 0]}>
                <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={0.4} />
            </mesh>
        </group>
    );

    return (
        <group
            position={position}
            rotation={[0, rotation, 0]}
            scale={isHovered ? 1.05 : 1}
            onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        >
            {content}
            {hasRoadAccess === false && <WarningIndicator />}
        </group>
    );
});
