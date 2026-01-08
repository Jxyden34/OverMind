/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Grid, TileData, BuildingType, CityStats, AIGoal, NewsItem, AIAction, EconomicEvent, WeatherType, DisasterType, ActiveDisaster, HistoryLogEntry } from './types';
import { GRID_SIZE, BUILDINGS, TICK_RATE_MS } from './constants';
import IsoMap from './components/IsoMap';
import UIOverlay from './components/UIOverlay';
import StartScreen from './components/StartScreen';
import { updateSimulation, INITIAL_STATS, simulateEnvironment } from './utils/simulation';
import { generateGameAction, generateCityGoal, generateNewsEvent, generateWeirdEvent, decideEvent, AIEventResponse } from './services/localAiService';
import EventModal from './components/EventModal';

// Initialize empty grid with island shape generation for 3D visual interest
// Initialize grid with random noise for terrain
const createInitialGrid = (planet: 'Earth' | 'Mars' = 'Earth'): Grid => {
  const grid: Grid = [];
  const seed = Math.random() * 1000; // Random seed

  for (let y = 0; y < GRID_SIZE; y++) {
    const row: TileData[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      // Noise logic
      const nx = x / 15;
      const ny = y / 15;
      const noise = Math.sin(nx + seed) * Math.cos(ny + seed) +
        0.5 * Math.sin(nx * 2 + seed) * Math.cos(ny * 2 + seed);

      let buildingType = BuildingType.None;

      if (planet === 'Earth') {
        // Earth: Water thresholds
        if (noise < -0.3) buildingType = BuildingType.Water;
      } else {
        // Mars: No water, maybe craters? (Just distinct terrain logic if needed, else all Land)
        // For now, Mars is dry.
      }

      row.push({
        x,
        y,
        buildingType,
        pollution: 0
      });
    }
    grid.push(row);
  }
  return grid;
};

function App() {
  // --- Game State ---
  const [gameStarted, setGameStarted] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);

  // World State
  const [worlds, setWorlds] = useState<Record<string, Grid>>(() => ({
    Earth: createInitialGrid('Earth'),
    Mars: createInitialGrid('Mars')
  }));

  // Active Grid (initialized to Earth)
  const [grid, setGrid] = useState<Grid>(() => worlds['Earth']);

  const [stats, setStats] = useState<CityStats>(INITIAL_STATS);
  const [selectedTool, setSelectedTool] = useState<BuildingType>(BuildingType.Road);

  // --- AI State ---
  const [currentGoal, setCurrentGoal] = useState<AIGoal | null>(null);
  const [isGeneratingGoal, setIsGeneratingGoal] = useState(false);
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [weather, setWeather] = useState<WeatherType>(WeatherType.Clear);
  const [activeDisaster, setActiveDisaster] = useState<ActiveDisaster | null>(null);

  // Local AI State
  const [lastAIAction, setLastAIAction] = useState<AIAction | null>(null);
  const [aiFailures, setAiFailures] = useState<string[]>([]);

  // City History Log
  const [historyLog, setHistoryLog] = useState<HistoryLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false); // Lifed state

  const addToHistory = useCallback((text: string, type: 'major' | 'minor' | 'disaster' | 'milestone' = 'major') => {
    // Logging history event
    setHistoryLog(prev => [
      { id: Date.now().toString() + Math.random(), day: statsRef.current.day, text, type },
      ...prev
    ]);
  }, []);

  // --- Event Listeners for History ---
  // 1. Disaster Logging
  useEffect(() => {
    if (activeDisaster) {
      const typeName = activeDisaster.type === DisasterType.Meteor ? "Meteor Strike" :
        activeDisaster.type === DisasterType.AlienInvasion ? "Alien Invasion" :
          activeDisaster.type === DisasterType.SolarFlare ? "Solar Flare" : "Disaster";
      addToHistory(`${typeName} Detected!`, 'disaster');
    }
  }, [activeDisaster, addToHistory]);

  // 2. Economic Event Logging
  // We need to track the previous event to detect changes
  const prevEventRef = useRef<EconomicEvent>(EconomicEvent.None);
  useEffect(() => {
    if (stats.activeEvent !== prevEventRef.current) {
      if (stats.activeEvent !== EconomicEvent.None) {
        let msg = "";
        switch (stats.activeEvent) {
          case EconomicEvent.Boom: msg = "Economic Boom!"; break;
          case EconomicEvent.Recession: msg = "Market Recession"; break;
          case EconomicEvent.Strike: msg = "Labor Strike"; break;
          case EconomicEvent.Audit: msg = "Federal Audit"; break;
          case EconomicEvent.Festival: msg = "Grand Festival!"; break;
        }
        addToHistory(msg, 'major');
      } else {
        // Event ended
        // addToHistory("Economic conditions stabilized.", 'minor');
      }
      prevEventRef.current = stats.activeEvent;
    }
  }, [stats.activeEvent, addToHistory]);

  // 3. Milestone Logging (Population)
  const prevPopRef = useRef(0);
  useEffect(() => {
    const p = stats.population;
    const pp = prevPopRef.current;
    if (p >= 100 && pp < 100) addToHistory("Village Established (Pop 100)", 'milestone');
    if (p >= 500 && pp < 500) addToHistory("Township Status (Pop 500)", 'milestone');
    if (p >= 1000 && pp < 1000) addToHistory("City Charter Granted (Pop 1000)", 'milestone');
    if (p >= 5000 && pp < 5000) addToHistory("Metropolis Status (Pop 5000)", 'milestone');
    prevPopRef.current = p;
  }, [stats.population, addToHistory]);

  // Refs for accessing state inside intervals without dependencies
  const gridRef = useRef(grid);
  const statsRef = useRef(stats);
  const goalRef = useRef(currentGoal);
  const aiEnabledRef = useRef(aiEnabled);
  const lastActionRef = useRef(lastAIAction);
  const aiFailuresRef = useRef(aiFailures);

  // Sync refs
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { goalRef.current = currentGoal; }, [currentGoal]);
  useEffect(() => { aiEnabledRef.current = aiEnabled; }, [aiEnabled]);
  useEffect(() => { lastActionRef.current = lastAIAction; }, [lastAIAction]);
  useEffect(() => { aiFailuresRef.current = aiFailures; }, [aiFailures]);

  // --- AI Logic Wrappers ---

  const addNewsItem = useCallback((item: NewsItem) => {
    setNewsFeed(prev => [...prev.slice(-12), item]); // Keep last few
  }, []);

  const fetchNewGoal = useCallback(async () => {
    if (isGeneratingGoal || !aiEnabledRef.current) return;
    setIsGeneratingGoal(true);
    // Short delay for visual effect
    await new Promise(r => setTimeout(r, 500));

    // We pass null for grid if not strictly needed or pass current grid
    const newGoal = await generateCityGoal(statsRef.current, gridRef.current);
    if (newGoal) {
      setCurrentGoal(newGoal);
    } else {
      // Retry soon if failed, but only if AI still enabled
      if (aiEnabledRef.current) setTimeout(fetchNewGoal, 5000);
    }
    setIsGeneratingGoal(false);
  }, [isGeneratingGoal]);

  // Weird Event State
  const [openEvent, setOpenEvent] = useState<AIEventResponse | null>(null);
  const [isDecidingEvent, setIsDecidingEvent] = useState(false);

  // ... previous helpers ...

  const handleTriggerWeirdEvent = useCallback(async () => {
    if (openEvent || !aiEnabledRef.current) return;

    const event = await generateWeirdEvent(statsRef.current);
    if (event) {
      setOpenEvent(event);
      setIsDecidingEvent(true);

      // Auto-decide after delay
      setTimeout(async () => {
        const decision = await decideEvent(event, statsRef.current);

        // Apply (Visual only for now, or simple money logic)
        // Ideally we parse effect, but for now we just log/news it
        setIsDecidingEvent(false);
        setOpenEvent(null);

        let impactText = decision === 'YES' ? event.choices.yesEffect : event.choices.noEffect;
        addNewsItem({
          id: Date.now().toString(),
          text: `MAYOR RULING: "${event.title}" - ${decision}! Result: ${impactText}`,
          type: decision === 'YES' ? 'positive' : 'negative'
        });

      }, 5000); // 5 seconds suspense
    }
  }, [addNewsItem, openEvent]);

  const fetchNews = useCallback(async () => {
    // chance to fetch news per tick
    if (!aiEnabledRef.current || Math.random() > 0.15) return;

    // 5% chance to trigger WEIRD STUFF instead of news
    if (Math.random() < 0.05) {
      handleTriggerWeirdEvent();
      return;
    }

    const news = await generateNewsEvent(statsRef.current, null);
    if (news) addNewsItem(news);
  }, [addNewsItem, handleTriggerWeirdEvent]);

  // Research State
  const [isResearchOpen, setIsResearchOpen] = useState(false);

  // Helper to execute actions (USER or AI)
  const performAction = useCallback((action: string, type: BuildingType | null, x: number, y: number) => {
    const currentGrid = gridRef.current;
    const currentStats = statsRef.current;

    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;

    // Check Playable Bounds (Fog of War)
    const center = Math.floor(GRID_SIZE / 2); // 22
    const halfSize = Math.floor(currentStats.unlockedGridSize / 2);
    const minBounds = center - halfSize;
    const maxBounds = center + halfSize;

    const isOutOfBounds = x < minBounds || x > maxBounds || y < minBounds || y > maxBounds;

    // Allow DEMOLISH outside bounds? Maybe. But BUILD is restricted.
    if (action === 'BUILD' && isOutOfBounds) {
      // Visual feedback could be added here, currently just fails silently
      return false;
    }

    const currentTile = currentGrid[y][x];

    if (action === 'DEMOLISH') {
      // Logic: If bridge, turn to water. If building, turn to None (Land).
      if (currentTile.buildingType !== BuildingType.None && currentTile.buildingType !== BuildingType.Water) {
        const newGrid = currentGrid.map(row => [...row]);

        // Restore Water if demolishing a bridge
        const replacementType = currentTile.buildingType === BuildingType.Bridge ? BuildingType.Water : BuildingType.None;

        // If demolishing Research Centre, update stats
        if (currentTile.buildingType === BuildingType.ResearchCentre) {
          setStats(prev => ({ ...prev, research: { ...prev.research, isResearchCentreBuilt: false } }));
        }

        newGrid[y][x] = { ...currentTile, buildingType: replacementType };
        setGrid(newGrid);

        const demolishCost = 5;
        setStats(prev => ({ ...prev, money: prev.money - demolishCost }));
        return true;
      }
    } else if (action === 'BUILD' && type) {
      const config = BUILDINGS[type];

      // Building Rules
      const isWater = currentTile.buildingType === BuildingType.Water;
      const isBridge = type === BuildingType.Bridge;

      // 1. Cannot build normal buildings on Water
      if (isWater && !isBridge) return false;

      // 2. Can ONLY build Bridge on Water
      if (!isWater && isBridge) return false;

      // 3. Check emptiness (unless it's water, which is "empty" for bridges)
      const isEmpty = currentTile.buildingType === BuildingType.None || currentTile.buildingType === BuildingType.Water;

      if (isEmpty) {
        if (currentStats.money >= config.cost) {
          const newGrid = currentGrid.map(row => [...row]);
          newGrid[y][x] = { ...currentTile, buildingType: type };
          setGrid(newGrid);

          // Deduct Cost
          setStats(prev => {
            const newResearch = { ...prev.research };
            if (type === BuildingType.ResearchCentre) newResearch.isResearchCentreBuilt = true;
            return { ...prev, money: prev.money - config.cost, research: newResearch };
          });
          return true;
        }
      }
    }
    return false;
  }, []);

  // Research Logic
  const handleResearch = (type: 'LAND' | 'MARS' | 'NAUTICAL') => {
    const s = statsRef.current;

    if (type === 'LAND') {
      const cost = 5000 + (s.research.landExpansionLevel * 5000);
      if (s.money >= cost && s.unlockedGridSize < GRID_SIZE) {
        setStats(prev => ({
          ...prev,
          money: prev.money - cost,
          unlockedGridSize: Math.min(GRID_SIZE, prev.unlockedGridSize + 10),
          research: { ...prev.research, landExpansionLevel: prev.research.landExpansionLevel + 1 }
        }));
        addNewsItem({ id: Date.now().toString(), text: "Land Expanded! New territory available.", type: 'positive' });
      }
    }
    else if (type === 'MARS') {
      const cost = 20000;
      if (s.money >= cost && !s.research.isMarsDiscovered) {
        setStats(prev => ({
          ...prev,
          money: prev.money - cost,
          research: { ...prev.research, isMarsDiscovered: true }
        }));
        addNewsItem({ id: Date.now().toString(), text: "MARS DISCOVERED! Build a Space Port to travel there.", type: 'positive' });
      }
    }
    else if (type === 'NAUTICAL') {
      const cost = 10000;
      if (s.money >= cost && s.research.nauticalLevel === 0) {
        setStats(prev => ({
          ...prev,
          money: prev.money - cost,
          research: { ...prev.research, nauticalLevel: 1 }
        }));
        addNewsItem({ id: Date.now().toString(), text: "Nautical Logistics Unlocked! Trade efficiency +10%.", type: 'positive' });
        // Apply passive boost elsewhere if implemented, currently just status
      }
    }
  };

  // Planet Travel Logic
  const travelToPlanet = (target: 'Earth' | 'Mars') => {
    // 1. Save current grid to world storage
    const currentP = statsRef.current.activePlanet;
    const currentG = gridRef.current;

    setWorlds(prev => ({ ...prev, [currentP]: currentG }));

    // 2. Load target grid
    const targetG = worlds[target] || createInitialGrid(target);

    // 3. Switch
    setGrid(targetG);
    setStats(prev => ({ ...prev, activePlanet: target }));

    addNewsItem({ id: Date.now().toString(), text: `Arrival confirmed: ${target}.`, type: 'neutral' });
  };

  // Disaster Helper
  const triggerDisaster = useCallback((forcedType?: DisasterType) => {
    if (activeDisaster) return; // One at a time

    const currentGrid = gridRef.current;
    const occupiedTiles = currentGrid.flat().filter(t => t.buildingType !== BuildingType.None && t.buildingType !== BuildingType.Road);
    if (occupiedTiles.length === 0 && !forcedType) return;

    // Roll for type
    const roll = Math.random();
    let type = forcedType || DisasterType.None;

    if (!forcedType) {
      if (roll < 0.4) type = DisasterType.Meteor;
      else if (roll < 0.7) type = DisasterType.AlienInvasion;
      else type = DisasterType.SolarFlare;
    }

    if (type === DisasterType.Meteor) {
      // Find random target (weighted towards center but random)
      const targetX = Math.floor(Math.random() * GRID_SIZE);
      const targetY = Math.floor(Math.random() * GRID_SIZE);

      setActiveDisaster({
        type: DisasterType.Meteor,
        position: { x: targetX, y: targetY },
        startTime: Date.now(),
        duration: 5000, // 5s impact time
        stage: 'WARNING'
      });
      addNewsItem({ id: Date.now().toString(), text: "⚠️ METEOR DETECTED! Impact imminent at sector " + targetX + "," + targetY, type: 'negative' });

      // Schedule impact logic
      setTimeout(() => {
        setGrid(prevGrid => {
          const newGrid = prevGrid.map(row => [...row]);
          // Destroy 3x3 area
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ky = targetY + dy;
              const kx = targetX + dx;
              if (ky >= 0 && ky < GRID_SIZE && kx >= 0 && kx < GRID_SIZE) {
                newGrid[ky][kx] = { ...newGrid[ky][kx], buildingType: BuildingType.None };
              }
            }
          }
          return newGrid;
        });
        setActiveDisaster(prev => prev ? { ...prev, stage: 'ACTIVE' } : null);
        setTimeout(() => { setActiveDisaster(null); }, 3000); // Clear after explosion
      }, 3000);

    } else if (type === DisasterType.AlienInvasion) {
      setActiveDisaster({
        type: DisasterType.AlienInvasion,
        position: null,
        startTime: Date.now(),
        duration: 10000,
        stage: 'ACTIVE'
      });
      addNewsItem({ id: Date.now().toString(), text: "🛸 UFO SIGHTING! They are abducting citizens!", type: 'negative' });

      // Abduct 20% of pop
      setStats(prev => ({ ...prev, population: Math.floor(prev.population * 0.8) }));
      setTimeout(() => setActiveDisaster(null), 10000);

    } else if (type === DisasterType.SolarFlare) {
      setActiveDisaster({
        type: DisasterType.SolarFlare,
        position: null,
        startTime: Date.now(),
        duration: 8000,
        stage: 'ACTIVE'
      });
      addNewsItem({ id: Date.now().toString(), text: "☀️ SOLAR FLARE! Electronics malfunctioning.", type: 'neutral' });
      setNeonMode(true); // Force Neon Mode
      setTimeout(() => {
        setActiveDisaster(null);
        setNeonMode(false);
      }, 8000);
    }
  }, [addNewsItem, activeDisaster]);


  // --- Initial Setup ---
  useEffect(() => {
    if (!gameStarted) return;

    addNewsItem({ id: Date.now().toString(), text: "Welcome to Axiom City. Terrain generation complete.", type: 'positive' });

    if (aiEnabled) {
      fetchNewGoal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStarted]);


  // Day Cycle Tick Counter (Reverted to 1 tick per day as requested)
  const dayTickRef = useRef(0);
  const TICKS_PER_DAY = 1; // Revert to original speed (Every 3s is a day)

  // --- Game Loop (Simulation) ---
  useEffect(() => {
    if (!gameStarted) return;

    const intervalId = setInterval(() => {
      // Use advanced simulation logic
      // 1. Run Dynamic Environment (Wind/Pollution)
      const { newGrid, windUpdate } = simulateEnvironment(gridRef.current, statsRef.current);

      // Update Grid immediately (visuals)
      setGrid(newGrid);
      // Sync ref
      gridRef.current = newGrid;

      // Check if we should increment Day
      dayTickRef.current += 1;
      const isNewDay = dayTickRef.current >= TICKS_PER_DAY;
      if (isNewDay) dayTickRef.current = 0;

      setStats(prev => {
        // Apply wind/env stats first
        const intermediateStats = { ...prev, ...windUpdate };
        // 2. Run City Simulation (Economy/Happiness) using NEW grid
        // Start Day is triggered only when counter resets
        const newStats = updateSimulation(intermediateStats, newGrid, weather, isNewDay);

        // Check Goal Completion
        const goal = goalRef.current;
        if (aiEnabledRef.current && goal && !goal.completed) {
          // Count buildings
          const counts: Record<string, number> = {};
          newGrid.flat().forEach(t => counts[t.buildingType] = (counts[t.buildingType] || 0) + 1);

          let isMet = false;
          if (goal.targetType === 'money' && newStats.money >= goal.targetValue) isMet = true;
          if (goal.targetType === 'population' && newStats.population >= goal.targetValue) isMet = true;
          if (goal.targetType === 'building_count' && goal.buildingType) {
            if ((counts[goal.buildingType] || 0) >= goal.targetValue) isMet = true;
          }

          if (isMet) {
            setCurrentGoal({ ...goal, completed: true });
            addNewsItem({ id: Date.now().toString(), text: "GOAL COMPLETED! Mayor approval rating soaring.", type: 'positive' });
          }
        }

        return newStats;
      });

      // Disaster Check (Simulating simple probabilty per tick if money < 0)
      if (statsRef.current.money < 0) {
        // Higher chance if more debt? Fixed 15% chance per tick for now.
        if (Math.random() < 0.15) {
          triggerDisaster();
        }
      }

      // Economy Check
      triggerEconomyEvent();

      // Trigger news
      fetchNews();

      // Weather Cycle (Random change every ~30 ticks)
      if (Math.random() < 0.03) {
        const weathers = [WeatherType.Clear, WeatherType.Clear, WeatherType.Rain, WeatherType.Rain, WeatherType.Snow, WeatherType.Fog, WeatherType.AcidRain];
        const nextWeather = weathers[Math.floor(Math.random() * weathers.length)];
        setWeather(prev => {
          if (prev !== nextWeather && nextWeather !== WeatherType.Clear) {
            addNewsItem({ id: Date.now().toString(), text: `Weather Alert: ${nextWeather} incoming.`, type: 'neutral' });
          }
          return nextWeather;
        });
      }

    }, 3000); // 3 seconds per tick

    return () => clearInterval(intervalId);
  }, [gameStarted, weather]);

  // --- AI Agent Loop ---
  useEffect(() => {
    if (!gameStarted || !aiEnabled) return;

    const aiLoop = async () => {
      // Slow down AI thinking
      await new Promise(r => setTimeout(r, 4000));
      if (!aiEnabledRef.current) return;

      console.log("[AI AGENT] Thinking...");
      try {

        // Update: Pass grid to AI for vision
        const action = await generateGameAction(statsRef.current, gridRef.current, aiFailuresRef.current);

        if (action) {
          // 1. Check strict constraints
          if (action.action === 'BUILD') {
            // Additional safety check on Client side
            const tile = gridRef.current[action.y]?.[action.x];

            // BLOCK WATER (Exceptions: Bridges)
            if (tile?.buildingType === BuildingType.Water && action.buildingType !== BuildingType.Bridge) {
              console.warn("AI tried to build non-bridge on water. Blocking.");
              setAiFailures(prev => [...prev, { x: action.x, y: action.y }]);
              aiFailuresRef.current.push({ x: action.x, y: action.y });
              return;
            }

            // BLOCK OVERWRITING (AI must use empty tiles)
            // Exception: If tile is None, it's fine. If it's anything else, BLOCK.
            if (tile && tile.buildingType !== BuildingType.None) {
              console.warn(`AI tried to build ${action.buildingType} on top of ${tile.buildingType}. Blocking.`);
              setAiFailures(prev => [...prev, { x: action.x, y: action.y }]);
              aiFailuresRef.current.push({ x: action.x, y: action.y });
              return;
            }
          }

          if (action.action === 'WAIT') {
            console.log("[AI AGENT] Waiting...");
          } else if (action.action === 'BUILD' && action.buildingType && action.x !== undefined && action.y !== undefined) {
            const success = performAction('BUILD', action.buildingType, action.x, action.y);
            if (success) {
              addNewsItem({
                id: Date.now().toString(),
                text: action.reasoning || `AI Mayor constructed ${action.buildingType}`,
                type: 'neutral'
              });
            } else {
              // Redundant fallback if performAction fails but wasn't caught by Safety Block
              setAiFailures(prev => [...prev, `${action.x},${action.y}`].slice(-20));
            }
          } else if (action.action === 'DEMOLISH' && action.x !== undefined && action.y !== undefined) {
            const success = performAction('DEMOLISH', null, action.x, action.y);
            if (success) {
              addNewsItem({
                id: Date.now().toString(),
                text: action.reasoning || `AI Mayor demolished tile at ${action.x},${action.y}`,
                type: 'negative'
              });
            }
          }

          setLastAIAction(action);
        }
      } catch (e) {
        console.error("[AI AGENT] Loop Error:", e);
      }

      // Loop
      if (aiEnabledRef.current) aiLoop();
    };

    aiLoop();

    return () => {
      // Cleanup if needed
    }
  }, [gameStarted, aiEnabled, performAction, addNewsItem]);

  // --- Persistence Cleanup (FORCE RESET) ---
  // User demanded no saving and fresh random maps on reload.
  // --- Persistence Cleanup (Removed to allow saving) ---
  /*
  useEffect(() => {
    console.log("🧹 FORCE CLEARING LOCAL STORAGE");
    localStorage.clear();
  }, []);
  */


  // --- Interaction Logic ---

  const handleTileClick = useCallback((x: number, y: number) => {
    if (!gameStarted) return; // Prevent clicking through start screen

    const currentStats = statsRef.current;
    const tool = selectedTool; // Capture current tool

    // User manual action wrapper
    if (tool === BuildingType.None) {
      performAction('DEMOLISH', null, x, y);
    } else {
      performAction('BUILD', tool, x, y);
    }

    // Feedback for user actions if money low
    if (currentStats.money < 50) {
      addNewsItem({ id: Date.now().toString(), text: "Warning: Treasury running low!", type: 'negative' });
    }

  }, [selectedTool, addNewsItem, gameStarted, performAction]);

  const handleClaimReward = () => {
    if (currentGoal && currentGoal.completed) {
      setStats(prev => ({ ...prev, money: prev.money + currentGoal.reward }));
      addNewsItem({ id: Date.now().toString(), text: `Goal achieved! ${currentGoal.reward} deposited to treasury.`, type: 'positive' });
      setCurrentGoal(null);
      fetchNewGoal();
    }
  };

  const handleStart = (enabled: boolean) => {
    setAiEnabled(enabled);
    setGameStarted(true);
  };

  const cycleTax = () => {
    setStats(prev => {
      let nextRate = 0.1;
      if (prev.taxRate === 0.05) nextRate = 0.10;
      else if (prev.taxRate === 0.10) nextRate = 0.20;
      else if (prev.taxRate === 0.20) nextRate = 0.05;
      return { ...prev, taxRate: nextRate };
    });
  };

  // Economy Helpers
  const triggerEconomyEvent = useCallback(() => {
    const roll = Math.random();
    const currentStats = statsRef.current;

    // Don't overlap events too much
    if (currentStats.activeEvent !== EconomicEvent.None) return;

    if (roll < 0.05) {
      // 5% chance of BOOM
      setStats(prev => ({ ...prev, activeEvent: EconomicEvent.Boom, eventDuration: 20 }));
      addNewsItem({ id: Date.now().toString(), text: "📈 MARKET BOOM! Business is thriving. Tax revenue up!", type: 'positive' });
    } else if (roll < 0.10) {
      // 5% chance of RECESSION
      setStats(prev => ({ ...prev, activeEvent: EconomicEvent.Recession, eventDuration: 20 }));
      addNewsItem({ id: Date.now().toString(), text: "📉 RECESSION! Market crash. Revenue down.", type: 'negative' });
    } else if (currentStats.happiness < 40 && roll < 0.15) {
      // Strike risk if unhappy
      setStats(prev => ({ ...prev, activeEvent: EconomicEvent.Strike, eventDuration: 10 }));
      addNewsItem({ id: Date.now().toString(), text: "✊ GENERAL STRIKE! Workers demand better conditions. Production halted.", type: 'negative' });
    } else if (currentStats.money > 5000 && roll < 0.12) {
      // Audit risk if rich
      setStats(prev => ({ ...prev, activeEvent: EconomicEvent.Audit, eventDuration: 5 }));
      addNewsItem({ id: Date.now().toString(), text: "👮 TAX AUDIT! Accounts frozen for investigation.", type: 'neutral' });
    }

    // --- INDEPENDENT EXTREMELY RARE EXODUS CHECK ---
    // User requested 0.000000000000001% chance
    if (Math.random() < 0.000000000000001) {
      setStats(prev => ({ ...prev, activeEvent: EconomicEvent.Exodus, eventDuration: 30 }));
      const msg = currentStats.research.isMarsDiscovered
        ? "🚀 THE GREAT EXODUS! Thousands are fleeing Earth for the Mars colony."
        : "🚶 MASS DESERTION! Citizens are abandoning civilization in droves.";
      addNewsItem({ id: Date.now().toString(), text: msg, type: 'negative' });
      addToHistory("Mass Exodus Began", 'disaster');
    }
  }, [addNewsItem, addToHistory]);

  const handleBuyShares = () => {
    setStats(prev => {
      const cost = prev.sharePrice * 10; // Buy 10 shares
      if (prev.money >= cost) {
        // Weighted average cost update
        const totalVal = (prev.investmentShares * prev.investmentAverageCost) + cost;
        const newCount = prev.investmentShares + 10;
        return {
          ...prev,
          money: prev.money - cost,
          investmentShares: newCount,
          investmentAverageCost: totalVal / newCount
        };
      }
      return prev;
    });
  };

  const handleSellShares = () => {
    setStats(prev => {
      if (prev.investmentShares >= 10) {
        const revenue = prev.sharePrice * 10;
        return {
          ...prev,
          money: prev.money + revenue,
          investmentShares: prev.investmentShares - 10
        };
      }
      return prev;
    });
  };

  const handleTakeLoan = () => {
    setStats(prev => ({
      ...prev,
      money: prev.money + 5000,
      loanPrincipal: prev.loanPrincipal + 5000
    }));
    addNewsItem({ id: Date.now().toString(), text: "Loan approved. +$5,000 (Interest: 5% daily)", type: 'neutral' });
  };

  const handleRepayLoan = () => {
    setStats(prev => {
      const amountToRepay = Math.min(prev.money, prev.loanPrincipal, 5000);
      if (amountToRepay <= 0) return prev;

      return {
        ...prev,
        money: prev.money - amountToRepay,
        loanPrincipal: prev.loanPrincipal - amountToRepay
      };
    });
  };

  const handleResetCity = () => {
    if (window.confirm("Are you sure you want to WIPE the city and start over?")) {
      // Clear storage
      localStorage.removeItem('sky_metro_grid');
      localStorage.removeItem('sky_metro_stats');

      const newGrid = createInitialGrid(); // Generate once
      setGrid(newGrid);
      setStats(INITIAL_STATS);
      statsRef.current = INITIAL_STATS;
      gridRef.current = newGrid; // Sync ref

      addNewsItem({ id: Date.now().toString(), text: "City Reset. Welcome back, Mayor.", type: 'neutral' });
    }
  };

  const [neonMode, setNeonMode] = useState(false);

  return (
    <div className="relative w-screen h-screen overflow-hidden selection:bg-transparent selection:text-transparent bg-sky-900">
      {/* 3D Rendering Layer - Always visible now, providing background for start screen */}
      <IsoMap
        grid={grid}
        onTileClick={handleTileClick}
        hoveredTool={selectedTool}
        population={stats.population}
        day={stats.day}
        neonMode={neonMode}
        weather={weather}
        activeDisaster={activeDisaster}
        crimeRate={stats.crimeRate}
        pollutionLevel={stats.pollutionLevel}
        windDirection={stats.windDirection}
        activeEvent={stats.activeEvent}
        planet={stats.activePlanet}
      />

      {/* Start Screen Overlay */}
      {!gameStarted && (
        <StartScreen onStart={handleStart} />
      )}

      {/* Event Modal Overlay */}
      {openEvent && (
        <EventModal
          event={openEvent}
          aiDeciding={isDecidingEvent}
          onDecisionMade={() => { }}
        />
      )}

      {/* UI Layer */}
      {gameStarted && (
        <UIOverlay
          stats={stats}
          selectedTool={selectedTool}
          onSelectTool={setSelectedTool}
          currentGoal={currentGoal}
          newsFeed={newsFeed}
          onClaimReward={handleClaimReward}
          isGeneratingGoal={isGeneratingGoal}
          onCycleTax={cycleTax}
          onTakeLoan={handleTakeLoan}
          onRepayLoan={handleRepayLoan}
          onBuyShares={handleBuyShares}
          onSellShares={handleSellShares}
          onResetCity={handleResetCity}
          neonMode={neonMode}
          onToggleNeon={() => setNeonMode(!neonMode)}
          weather={weather}
          activeDisaster={activeDisaster}
          onTriggerDisaster={() => triggerDisaster()}
          grid={grid}
          aiEnabled={aiEnabled}
          onToggleAi={() => setAiEnabled(!aiEnabled)}
          historyLog={historyLog}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
        />
      )}

      {/* RESEARCH BUTTON */}
      {gameStarted && stats.research.isResearchCentreBuilt && (
        <button
          onClick={() => setIsResearchOpen(true)}
          className="absolute top-20 right-4 z-50 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-full shadow-lg border-2 border-sky-300 flex items-center gap-2 animate-pulse"
        >
          <span className="text-xl">🧪</span> RESEARCH
        </button>
      )}

      {/* TRAVEL BUTTON (Only Earth -> Mars or Mars -> Earth) */}
      {gameStarted && (
        (() => {
          const hasSpacePort = grid.flat().some(t => t.buildingType === BuildingType.SpacePort);
          const canTravel = (stats.activePlanet === 'Earth' && stats.research.isMarsDiscovered && hasSpacePort) ||
            (stats.activePlanet === 'Mars');

          if (!canTravel) return null;

          return (
            <button
              onClick={() => travelToPlanet(stats.activePlanet === 'Earth' ? 'Mars' : 'Earth')}
              className="absolute top-36 right-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-full shadow-lg border-2 border-indigo-300 flex items-center gap-2"
            >
              <span className="text-xl">🚀</span> {stats.activePlanet === 'Earth' ? 'LAUNCH TO MARS' : 'RETURN TO EARTH'}
            </button>
          );
        })()
      )}

      {/* RESEARCH MODAL */}
      {isResearchOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-sky-500 rounded-xl p-6 max-w-md w-full shadow-2xl relative animate-fade-in">
            <button onClick={() => setIsResearchOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl">✕</button>
            <h2 className="text-2xl font-bold text-sky-400 mb-6 flex items-center gap-2">
              <span className="text-3xl">🧪</span> RESEARCH LAB
            </h2>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {/* LAND EXPANSION */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-white text-lg">Land Grant (Lvl {stats.research.landExpansionLevel})</h3>
                    <p className="text-sm text-slate-400">Expand city boundaries.</p>
                  </div>
                  <div className="text-amber-400 font-mono font-bold">
                    ${5000 + (stats.research.landExpansionLevel * 5000)}
                  </div>
                </div>

                {stats.unlockedGridSize >= GRID_SIZE ? (
                  <button disabled className="w-full py-2 bg-green-600/30 text-green-400 rounded font-bold cursor-not-allowed border border-green-500/50">MAX EXPANSION REACHED</button>
                ) : (
                  <button
                    onClick={() => handleResearch('LAND')}
                    disabled={stats.money < (5000 + (stats.research.landExpansionLevel * 5000))}
                    className={`w-full py-2 rounded font-bold transition-colors ${stats.money >= (5000 + (stats.research.landExpansionLevel * 5000)) ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                  >
                    RESEARCH EXPANSION
                  </button>
                )}
              </div>

              {/* MARS DISCOVERY */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-white text-lg">Mars Survey</h3>
                    <p className="text-sm text-slate-400">Locate habitable zones on Mars.</p>
                  </div>
                  <div className="text-amber-400 font-mono font-bold">
                    $20,000
                  </div>
                </div>

                {stats.research.isMarsDiscovered ? (
                  <button disabled className="w-full py-2 bg-indigo-600/30 text-indigo-400 rounded font-bold cursor-not-allowed border border-indigo-500/50">MARS DISCOVERED</button>
                ) : (
                  <button
                    onClick={() => handleResearch('MARS')}
                    disabled={stats.money < 20000}
                    className={`w-full py-2 rounded font-bold transition-colors ${stats.money >= 20000 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                  >
                    COMMENCE SURVEY
                  </button>
                )}
              </div>

              {/* BOAT TRAVEL / NAUTICAL */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-white text-lg">Nautical Exports</h3>
                    <p className="text-sm text-slate-400">Boost trade revenue +10%.</p>
                  </div>
                  <div className="text-amber-400 font-mono font-bold">
                    $10,000
                  </div>
                </div>

                {stats.research.nauticalLevel > 0 ? (
                  <button disabled className="w-full py-2 bg-cyan-600/30 text-cyan-400 rounded font-bold cursor-not-allowed border border-cyan-500/50">NAUTICAL UNLOCKED</button>
                ) : (
                  <button
                    onClick={() => handleResearch('NAUTICAL')}
                    disabled={stats.money < 10000}
                    className={`w-full py-2 rounded font-bold transition-colors ${stats.money >= 10000 ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                  >
                    UPGRADE PORTS
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXODUS OVERLAY (Weather Event Style) */}
      {stats.activeEvent === EconomicEvent.Exodus && (
        <div className="absolute top-0 left-0 w-full z-[100] animate-exodus-slide">
          <div className="bg-red-600 shadow-[0_4px_30px_rgba(220,38,38,0.5)] border-b-2 border-red-400 p-2 text-center overflow-hidden">
            <div className="flex items-center justify-center gap-6 animate-exodus-pulse">
              <span className="text-xl">⚠️</span>
              <span className="text-white font-black tracking-[0.2em] uppercase text-lg">
                MASS EXODUS IN PROGRESS - CITIZENS FLEEING
              </span>
              <span className="text-xl">🚀</span>
            </div>
          </div>
        </div>
      )}

      {/* CSS for animations and utility */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        .animate-fade-in { animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        @keyframes exodus-slide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        .animate-exodus-slide { animation: exodus-slide 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        @keyframes exodus-pulse { 0% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.02); } 100% { opacity: 0.8; transform: scale(1); } }
        .animate-exodus-pulse { animation: exodus-pulse 1.5s ease-in-out infinite; }
        
        .mask-image-b { -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%); mask-image: linear-gradient(to bottom, transparent 0%, black 15%); }
        
        /* Vertical text for toolbar label */
        .writing-mode-vertical { writing-mode: vertical-rl; text-orientation: mixed; }
        
        /* Custom scrollbar for news */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}

export default App;