/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Grid, TileData, BuildingType, CityStats, AIGoal, NewsItem, AIAction, EconomicEvent } from './types';
import { GRID_SIZE, BUILDINGS, TICK_RATE_MS } from './constants';
import IsoMap from './components/IsoMap';
import UIOverlay from './components/UIOverlay';
import StartScreen from './components/StartScreen';
import { updateSimulation, INITIAL_STATS } from './utils/simulation';
import { generateGameAction, generateCityGoal, generateNewsEvent } from './services/localAiService';

// Initialize empty grid with island shape generation for 3D visual interest
// Initialize grid with random noise for terrain (Islands/Lakes)
const createInitialGrid = (): Grid => {
  const grid: Grid = [];
  const seed = Math.random() * 1000; // Random seed

  for (let y = 0; y < GRID_SIZE; y++) {
    const row: TileData[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      // Simple noise function using overlapping sine waves
      // Low frequency for main continents, high freq for noise
      const nx = x / 15;
      const ny = y / 15;
      const noise = Math.sin(nx + seed) * Math.cos(ny + seed) +
        0.5 * Math.sin(nx * 2 + seed) * Math.cos(ny * 2 + seed);

      // Threshold for water: if noise < -0.2 it's water
      const isWater = noise < -0.3;

      row.push({
        x,
        y,
        buildingType: isWater ? BuildingType.Water : BuildingType.None
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

  const [grid, setGrid] = useState<Grid>(createInitialGrid);
  const [stats, setStats] = useState<CityStats>(INITIAL_STATS);
  const [selectedTool, setSelectedTool] = useState<BuildingType>(BuildingType.Road);

  // --- AI State ---
  const [currentGoal, setCurrentGoal] = useState<AIGoal | null>(null);
  const [isGeneratingGoal, setIsGeneratingGoal] = useState(false);
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);

  // Local AI State
  const [lastAIAction, setLastAIAction] = useState<AIAction | null>(null);
  const [aiFailures, setAiFailures] = useState<string[]>([]);

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

  const fetchNews = useCallback(async () => {
    // chance to fetch news per tick
    if (!aiEnabledRef.current || Math.random() > 0.15) return;
    const news = await generateNewsEvent(statsRef.current, null);
    if (news) addNewsItem(news);
  }, [addNewsItem]);

  // Helper to execute actions (USER or AI)
  const performAction = useCallback((action: string, type: BuildingType | null, x: number, y: number) => {
    const currentGrid = gridRef.current;
    const currentStats = statsRef.current;

    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
    const currentTile = currentGrid[y][x];

    if (action === 'DEMOLISH') {
      // Logic: If bridge, turn to water. If building, turn to None (Land).
      if (currentTile.buildingType !== BuildingType.None && currentTile.buildingType !== BuildingType.Water) {
        const newGrid = currentGrid.map(row => [...row]);

        // Restore Water if demolishing a bridge
        const replacementType = currentTile.buildingType === BuildingType.Bridge ? BuildingType.Water : BuildingType.None;

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
          setStats(prev => ({ ...prev, money: prev.money - config.cost }));
          return true;
        }
      }
    }
    return false;
  }, []);

  // Disaster Helper
  const triggerDisaster = useCallback(() => {
    const currentGrid = gridRef.current;
    const occupiedTiles = currentGrid.flat().filter(t => t.buildingType !== BuildingType.None && t.buildingType !== BuildingType.Road);

    if (occupiedTiles.length === 0) return;

    const roll = Math.random();

    // Fire: Burns any random building
    if (roll < 0.3) {
      const victim = occupiedTiles[Math.floor(Math.random() * occupiedTiles.length)];
      const newGrid = currentGrid.map(row => [...row]);
      newGrid[victim.y][victim.x] = { ...victim, buildingType: BuildingType.None };
      setGrid(newGrid);
      addNewsItem({ id: Date.now().toString(), text: `🔥 FIRE! Building at ${victim.x},${victim.y} burned down due to lack of funding!`, type: 'negative' });
    } // Looting: Targets shops
    else if (roll < 0.6) {
      const shops = occupiedTiles.filter(t => t.buildingType === BuildingType.Commercial);
      if (shops.length > 0) {
        const victim = shops[Math.floor(Math.random() * shops.length)];
        const newGrid = currentGrid.map(row => [...row]);
        newGrid[victim.y][victim.x] = { ...victim, buildingType: BuildingType.None };
        setGrid(newGrid);
        addNewsItem({ id: Date.now().toString(), text: `🛑 LOOTING! Shop at ${victim.x},${victim.y} destroyed by rioters!`, type: 'negative' });
      } else {
        // Fallback to fire if no shops
        const victim = occupiedTiles[Math.floor(Math.random() * occupiedTiles.length)];
        const newGrid = currentGrid.map(row => [...row]);
        newGrid[victim.y][victim.x] = { ...victim, buildingType: BuildingType.None };
        setGrid(newGrid);
        addNewsItem({ id: Date.now().toString(), text: `🔥 ARSON! Building at ${victim.x},${victim.y} set ablaze!`, type: 'negative' });
      }
    }
  }, [addNewsItem]);


  // --- Initial Setup ---
  useEffect(() => {
    if (!gameStarted) return;

    addNewsItem({ id: Date.now().toString(), text: "Welcome to SkyMetropolis. Terrain generation complete.", type: 'positive' });

    if (aiEnabled) {
      fetchNewGoal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStarted]);


  // --- Game Loop (Simulation) ---
  useEffect(() => {
    if (!gameStarted) return;

    const intervalId = setInterval(() => {
      // Use advanced simulation logic
      setStats(prev => {
        const newStats = updateSimulation(prev, gridRef.current);

        // Check Goal Completion
        const goal = goalRef.current;
        if (aiEnabledRef.current && goal && !goal.completed) {
          // Count buildings
          const counts: Record<string, number> = {};
          gridRef.current.flat().forEach(t => counts[t.buildingType] = (counts[t.buildingType] || 0) + 1);

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

    }, TICK_RATE_MS);

    return () => clearInterval(intervalId);
  }, [fetchNews, gameStarted, addNewsItem, triggerDisaster]);

  // --- AI Agent Loop ---
  useEffect(() => {
    if (!gameStarted || !aiEnabled) return;

    const aiLoop = async () => {
      // Slow down AI thinking
      await new Promise(r => setTimeout(r, 4000));
      if (!aiEnabledRef.current) return;

      console.log("[AI AGENT] Thinking...");
      try {
        const action = await generateGameAction(statsRef.current, gridRef.current, lastActionRef.current, aiFailuresRef.current);

        if (action) {
          // Capture failures (from Safety Block or Execution)
          if (action.failedAttempt) {
            setAiFailures(prev => {
              const newState = [...prev, `${action.failedAttempt?.x},${action.failedAttempt?.y}`];
              return newState.slice(-20);
            });
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

  // --- Persistence (DISABLED TO FIX CORRUPTION) ---
  useEffect(() => {
    // Only save on unload/periodically? No, let's just ignore loading old data.
    // Force clean state.
    statsRef.current = INITIAL_STATS;

    /*
    const savedGridData = localStorage.getItem('sky_metro_grid');
    const savedStatsData = localStorage.getItem('sky_metro_stats');

    if (savedGridData) {
      try {
        const savedGrid = JSON.parse(savedGridData);
        if (savedGrid && savedGrid.length === GRID_SIZE) {
          setGrid(savedGrid);
        }
      } catch (e) { console.error("Grid load error", e); }
    }

    if (savedStatsData) {
      try {
        const savedStats = JSON.parse(savedStatsData);
        // Deep merge to ensure new fields (budget, housingCapacity) exist
        const mergedStats = { 
          ...INITIAL_STATS, 
          ...savedStats, 
          budget: { ...INITIAL_STATS.budget, ...savedStats.budget },
          demographics: { ...INITIAL_STATS.demographics, ...savedStats.demographics },
          jobs: { ...INITIAL_STATS.jobs, ...savedStats.jobs }
        };
        setStats(mergedStats);
        statsRef.current = mergedStats;
      } catch (e) { console.error("Stats load error", e); }
    }
    */
  }, []);


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
  }, [addNewsItem]);

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
      setGrid(createInitialGrid()); // Reset grid
      setStats(INITIAL_STATS);
      statsRef.current = INITIAL_STATS;
      setAiFailures([]);
      setNewsFeed([]);
      setAiEnabled(true);
      setCurrentGoal(null);
      // Clear storage
      localStorage.removeItem('sky_metro_grid');
      localStorage.removeItem('sky_metro_stats');
      window.location.reload();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden selection:bg-transparent selection:text-transparent bg-sky-900">
      {/* 3D Rendering Layer - Always visible now, providing background for start screen */}
      <IsoMap
        grid={grid}
        onTileClick={handleTileClick}
        hoveredTool={selectedTool}
        population={stats.population}
        day={stats.day}
      />

      {/* Start Screen Overlay */}
      {!gameStarted && (
        <StartScreen onStart={handleStart} />
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
        />
      )}

      {/* CSS for animations and utility */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        .animate-fade-in { animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
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