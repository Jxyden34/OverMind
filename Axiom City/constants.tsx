/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { BuildingConfig, BuildingType } from './types';

// Map Settings
export const GRID_SIZE = 45;

// Game Settings
export const TICK_RATE_MS = 2000; // Game loop updates every 2 seconds
export const INITIAL_MONEY = 1000;

export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  [BuildingType.None]: {
    type: BuildingType.None,
    cost: 0,
    name: 'Bulldoze',
    description: 'Clear a tile',
    color: '#ef4444', // Used for UI
    popGen: 0,
    incomeGen: 0,
  },
  [BuildingType.Road]: {
    type: BuildingType.Road,
    cost: 10,
    name: 'Road',
    description: 'Connects buildings.',
    color: '#374151', // gray-700
    popGen: 0,
    incomeGen: 0,
  },
  [BuildingType.Residential]: {
    type: BuildingType.Residential,
    cost: 200,
    name: 'House',
    description: 'Medium Density (Cap: 10)',
    color: '#22c55e', // green-500
    popGen: 10,
    incomeGen: 0,
  },
  [BuildingType.Commercial]: {
    type: BuildingType.Commercial,
    cost: 200,
    name: 'Shop',
    description: '+$15/day',
    color: '#60a5fa', // blue-400
    popGen: 0,
    incomeGen: 15,
  },
  [BuildingType.Industrial]: {
    type: BuildingType.Industrial,
    cost: 400,
    name: 'Factory',
    description: '+$40/day. Pollutes.',
    color: '#facc15', // yellow-400
    popGen: 0,
    incomeGen: 40,
    pollution: 15, // Heavy polluter
    crime: 5,
  },
  [BuildingType.Park]: {
    type: BuildingType.Park,
    cost: 50,
    name: 'Park',
    description: 'Cleans air.',
    color: '#4ade80', // green-400
    popGen: 1,
    incomeGen: 0,
    pollution: -10, // Scrubs pollution
  },
  [BuildingType.School]: {
    type: BuildingType.School,
    cost: 500,
    name: 'School',
    description: 'Boosts Growth',
    color: '#fbbf24', // amber-400
    popGen: 0,
    incomeGen: -10, // Upkeep
    crime: -2, // Education helps?
  },
  [BuildingType.Hospital]: {
    type: BuildingType.Hospital,
    cost: 1000,
    name: 'Hospital',
    description: 'Reduces Deaths',
    color: '#f472b6', // pink-400
    popGen: 0,
    incomeGen: -20, // Upkeep
  },
  [BuildingType.Police]: {
    type: BuildingType.Police,
    cost: 400,
    name: 'Police',
    description: 'Safety first!',
    color: '#1e40af', // blue-800
    popGen: 0,
    incomeGen: -10, // Upkeep
    crime: -25, // MAJOR security boost (represented as negative crime in config, or handle as separate prop?) 
    // Wait, let's use 'crime' field as 'crime impact'. Negative means security.
  },
  [BuildingType.FireStation]: {
    type: BuildingType.FireStation,
    cost: 450,
    name: 'Fire Stn',
    description: 'Reduces Fire Risk',
    color: '#dc2626', // red-600
    popGen: 0,
    incomeGen: -15, // Upkeep
    crime: -5, // Minor security
  },
  [BuildingType.GoldMine]: {
    type: BuildingType.GoldMine,
    cost: 1500,
    name: 'Gold Mine',
    description: '+$200/day. High Crime.',
    color: '#fbbf24', // amber-400
    popGen: 0,
    incomeGen: 600,
    crime: 0,
    pollution: 10,
  },
  [BuildingType.Apartment]: {
    type: BuildingType.Apartment,
    cost: 100,
    name: 'Flat',
    description: 'Starter Home (Cap: 4)',
    color: '#94a3b8', // slate-400
    popGen: 2,
    incomeGen: 0,
    crime: 2,
  },
  [BuildingType.Mansion]: {
    type: BuildingType.Mansion,
    cost: 1000,
    name: 'Mansion',
    description: 'Luxury Estate (Cap: 25)',
    color: '#a855f7', // purple-500
    popGen: 25,
    incomeGen: 0,
    crime: -5, // Private security
  },
  [BuildingType.Water]: {
    type: BuildingType.Water,
    cost: 0,
    name: 'Water',
    description: 'Structure Required',
    color: '#3b82f6', // blue-500
    popGen: 0,
    incomeGen: 0,
  },
  [BuildingType.Bridge]: {
    type: BuildingType.Bridge,
    cost: 150,
    name: "Bridge",
    description: "Crosses water.",
    color: "#94a3b8",
    popGen: 0,
    incomeGen: 0,
  },
  [BuildingType.Casino]: {
    type: BuildingType.Casino,
    cost: 3000,
    name: "Neon Casino",
    description: "Huge $$$, Huge Crime.",
    color: "#db2777", // Pink-700
    popGen: 0,
    incomeGen: 300,
    crime: 30, // MAJOR CRIME SOURCE
  },
  [BuildingType.MegaMall]: {
    type: BuildingType.MegaMall,
    cost: 12000,
    name: "Mega Mall",
    description: "Retail Empire. High Traffic.",
    color: "#ec4899", // Pink-500
    popGen: 0,
    incomeGen: 400, // Massive income
    crime: 10,
    pollution: 5,
    maxAllowed: 1
  },
  [BuildingType.SpacePort]: {
    type: BuildingType.SpacePort,
    cost: 250000,
    name: "Space Port",
    description: "Gateway to the stars. Tourism ++",
    color: "#6366f1", // Indigo-500
    popGen: 0,
    incomeGen: 5000,
    crime: 5,
    maxAllowed: 1
  },
  [BuildingType.University]: {
    type: BuildingType.University,
    cost: 8000,
    name: "University",
    description: "Boosts nearby tech.",
    color: "#3b82f6", // Blue-500
    popGen: 0,
    incomeGen: -100, // Expensive upkeep
    crime: -10,
    maxAllowed: 1
  },
  [BuildingType.Stadium]: {
    type: BuildingType.Stadium,
    cost: 14000,
    name: "Stadium",
    description: "Massive Entertainment.",
    color: "#f59e0b", // Amber-500
    popGen: 0,
    incomeGen: 100,
    crime: 15, // Hooligans
    maxAllowed: 1
  },
  [BuildingType.ResearchCentre]: {
    type: BuildingType.ResearchCentre,
    cost: 10000,
    name: "Research Lab",
    description: "Unlocks Land Expansion.",
    color: "#0ea5e9", // Sky-500
    popGen: 0,
    incomeGen: -5, // Upkeep
    maxAllowed: 1
  }
};