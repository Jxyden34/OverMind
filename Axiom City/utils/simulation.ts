import { CityStats, Grid, BuildingType, EconomicEvent } from '../types';
import { BUILDINGS } from '../constants';

export const INITIAL_STATS: CityStats = {
    money: 2000,
    population: 0,
    day: 1,
    taxRate: 0.1, // 10%
    happiness: 100,
    education: 0,
    safety: 100,
    housingCapacity: 0,
    demographics: {
        children: 0,
        adults: 0,
        seniors: 0
    },
    jobs: {
        commercial: 0,
        industrial: 0,
        total: 0,
        unemployment: 0
    },
    budget: {
        income: 0,
        expenses: 0,
        details: {
            tax: 0,
            business: 0,
            services: 0,
            welfare: 0
        }
    },
    shadowEconomy: 0,
    supplyLevel: 1,
    loanPrincipal: 0,
    loanInterestRate: 0.05, // 5% daily interest
    activeEvent: EconomicEvent.None,
    eventDuration: 0,
    sharePrice: 100, // Initial share price $100
    investmentShares: 0,
    investmentAverageCost: 0,
    crimeRate: 0,
    security: 100,
    pollutionLevel: 0,
    windDirection: { x: 1, y: 0 }, // Default East wind
    windSpeed: 0.5,
    currentGoal: null
};

export const updateSimulation = (currentStats: CityStats, grid: Grid): CityStats => {
    let newStats = { ...currentStats };
    newStats.day += 1;

    // 1. Calculate Buildings Count & Upkeep & New Stats
    let schools = 0;
    let hospitals = 0;
    let police = 0;
    let parks = 0;
    let universities = 0;
    let housingCapacity = 0;
    let serviceUpkeep = 0;

    let commJobs = 0;
    let indJobs = 0;

    // Accumulators for new stats
    let rawCrime = 0;
    let rawPollution = 0;

    grid.forEach(row => row.forEach(tile => {
        if (tile.buildingType === BuildingType.School) schools++;
        if (tile.buildingType === BuildingType.Hospital) hospitals++;
        if (tile.buildingType === BuildingType.Police) police++;
        if (tile.buildingType === BuildingType.Park) parks++;
        if (tile.buildingType === BuildingType.University) universities++;

        // Upkeep & Income
        if (tile.buildingType !== BuildingType.None) {
            // --- ROAD CONNECTIVITY CHECK ---
            // Check 4 neighbors for Road building type
            let connected = false;
            // Valid buildings that don't need roads: Road, Water, Bridge, Park (maybe?)
            // Let's say Park needs road for full effect too? For now, enforcing on all "structures".
            if (tile.buildingType === BuildingType.Road || tile.buildingType === BuildingType.Bridge || tile.buildingType === BuildingType.Water) {
                connected = true;
            } else {
                const neighbors = [
                    { x: tile.x + 1, y: tile.y },
                    { x: tile.x - 1, y: tile.y },
                    { x: tile.x, y: tile.y + 1 },
                    { x: tile.x, y: tile.y - 1 }
                ];
                for (const n of neighbors) {
                    if (n.y >= 0 && n.y < grid.length && n.x >= 0 && n.x < grid[0].length) {
                        if (grid[n.y][n.x].buildingType === BuildingType.Road || grid[n.y][n.x].buildingType === BuildingType.Bridge) {
                            connected = true;
                            break;
                        }
                    }
                }
            }
            // Store status in object for Renderer (mutating cloned grid tile is fine here as it's a fresh copy structure if done right, 
            // but updateSimulation is mutating 'grid' argument? No, it usually treats it as read-only or we should be careful. 
            // The simulation loop currently iterates 'grid'. We should probably output the status.
            // For now, let's mutate the tile property since we are in the simulation step and it will be persisted to state.
            tile.hasRoadAccess = connected;

            const config = BUILDINGS[tile.buildingType];
            if (config) {
                let income = config.incomeGen;

                // PENALTY
                if (!connected && tile.buildingType !== BuildingType.None) {
                    income = Math.floor(income * 0.5); // 50% Income
                    // Happiness penalty logic accumulated below
                }

                if (income !== 0) newStats.money += income;
                if (config.popGen > 0) housingCapacity += config.popGen;

                // Add Crime & Pollution
                if (config.crime) rawCrime += config.crime;
                if (config.pollution) rawPollution += config.pollution;
            }
        }

        if (tile.buildingType === BuildingType.Commercial) commJobs += 5;
        if (tile.buildingType === BuildingType.Industrial) indJobs += 8;
    }));

    newStats.housingCapacity = housingCapacity;

    // --- SPECIAL BUILDING EFFECTS ---
    // University Boost: Find all universities and apply boost to neighbors
    const UNI_RADIUS = 3;
    if (universities > 0) {
        grid.forEach(row => row.forEach(tile => {
            if (tile.buildingType === BuildingType.University) {
                // Apply boost to neighbors
                for (let dy = -UNI_RADIUS; dy <= UNI_RADIUS; dy++) {
                    for (let dx = -UNI_RADIUS; dx <= UNI_RADIUS; dx++) {
                        const ny = tile.y + dy;
                        const nx = tile.x + dx;
                        if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length) {
                            // Boost logic would ideally be on the tile, but for now we boost global stats slightly based on coverage
                            // Or better: We assume tech boost increases efficiency globally per university
                        }
                    }
                }
            }
        }));
        // Tech Boost: Education scales better
        newStats.education += universities * 10;
    }

    // Mega Mall & Space Port are handled via INCOME GEN in loop (already high)
    // Stadium is handled via Happiness (below)

    // --- CRIME & POLLUTION CALCULATION ---
    // Normalize logic:
    // Crime: Base is 0. Increases with density/buildings. Reduced by negative values (Police).
    // Minimum 0.
    newStats.crimeRate = Math.max(0, rawCrime);
    newStats.pollutionLevel = Math.max(0, rawPollution);

    // Security is just the negative impact of police, but let's track it properly visually if needed.
    // For now, rawCrime includes the negative offset from police.
    // If rawCrime < 0 (Excess security), we clamp to 0.

    // Security Score (0-100) for UI
    // Rough calc: (Police * 25) / (Population / 10 + 1) * 100
    // Actually simplicity is better: Security is inversely proportional to Crime Rate.
    newStats.security = Math.max(0, 100 - newStats.crimeRate);

    const totalJobs = commJobs + indJobs;

    // 2. Population Dynamics (Aging)

    // Growth factors
    const educationLevel = Math.min(100, schools * 15); // 0 base + 15 per school
    // Safety heavily impacted by Crime Rate now
    const safetyLevel = Math.max(0, 100 - newStats.crimeRate * 2);

    newStats.education = educationLevel;
    newStats.safety = safetyLevel;

    const happinessFactor = newStats.happiness / 100;
    const schoolFactor = 1 + (schools * 50) / (Math.max(1, newStats.demographics.children) + 1);

    // Birth Rate
    const totalPop =
        newStats.demographics.children +
        newStats.demographics.adults +
        newStats.demographics.seniors;

    // ------------------------------------
    // Births (slow, happiness-driven)
    // ------------------------------------
    if (totalPop < housingCapacity) {
        const birthChance = 0.02 * happinessFactor;
        const births = Math.floor(newStats.demographics.adults * birthChance);
        newStats.demographics.children += births;

        // Immigration
        if (totalPop < 50) {
            newStats.demographics.adults += 2;
        } else if (totalPop < housingCapacity * 0.5) {
            newStats.demographics.adults += 1;
        }
    }

    // Aging
    const ageUpChildChance = 0.05 * schoolFactor;
    const ageUpAdultChance = 0.02;
    const deathChance = 0.05 / (1 + hospitals);

    const agingChildren = Math.floor(newStats.demographics.children * ageUpChildChance);
    newStats.demographics.children -= agingChildren;
    newStats.demographics.adults += agingChildren;

    const agingAdults = Math.floor(newStats.demographics.adults * ageUpAdultChance);
    newStats.demographics.adults -= agingAdults;
    newStats.demographics.seniors += agingAdults;

    // Crime Deaths: If crime is high (>50), seniors die faster.
    const crimeDeathFactor = newStats.crimeRate > 50 ? 0.05 : 0;
    const deaths = Math.floor(newStats.demographics.seniors * (deathChance + crimeDeathFactor));
    newStats.demographics.seniors = Math.max(0, newStats.demographics.seniors - deaths);

    newStats.population = newStats.demographics.children + newStats.demographics.adults + newStats.demographics.seniors;

    // 3. Economy (Tax) - Moved to Volatile Economy section below
    // const taxRevenue = ...


    // 4. Jobs Stats
    const unemployment = Math.max(0, newStats.demographics.adults - totalJobs);

    // --- BENEFITS SYSTEM ---
    // Unemployed adults claim benefits.
    // Cost: $2 per unemployed person.
    const welfareCost = unemployment * 2;

    // Debt Spiral: If money < 0, maintenance costs increase (simulation)
    // --- 6. VOLATILE ECONOMY & RISK ---

    // Event Decay
    if (newStats.activeEvent !== EconomicEvent.None) {
        newStats.eventDuration -= 1;
        if (newStats.eventDuration <= 0) {
            newStats.activeEvent = EconomicEvent.None;
        }
    }

    // Share Price Random Walk (Volatility)
    const marketTrend = newStats.activeEvent === EconomicEvent.Boom ? 1.05 :
        newStats.activeEvent === EconomicEvent.Recession ? 0.95 : 1.0;
    const volatility = (Math.random() * 0.1) - 0.05; // -5% to +5% daily
    newStats.sharePrice = Math.max(1, Math.floor(newStats.sharePrice * (1 + volatility) * marketTrend));


    // Bureaucracy / Running Costs (Scales with pop)
    // The bigger the city, the more "leakage"
    const bureaucracyCost = Math.floor(Math.pow(newStats.population, 1.1) * 0.1);
    serviceUpkeep += bureaucracyCost;

    // Festival Cost (Party Budget)
    if (newStats.activeEvent === EconomicEvent.Festival) {
        serviceUpkeep += 100 + (newStats.population * 2);
    }

    // Taxes & Revenue (Variable!)
    // Supply Shortages reduce Commercial revenue.
    const supplyPenalty = 1 - (1 - newStats.supplyLevel); // 0.8 supply = 0.8 revenue factor

    // Shadow Economy reduces collected tax.
    const taxEfficiency = 1 - (newStats.shadowEconomy * 0.5); // 50% of shadow activity is lost revenue

    // Event Modifiers
    let revenueMultiplier = 1.0;
    if (newStats.activeEvent === EconomicEvent.Boom) revenueMultiplier = 1.5;
    if (newStats.activeEvent === EconomicEvent.Recession) revenueMultiplier = 0.7;
    if (newStats.activeEvent === EconomicEvent.Strike) revenueMultiplier = 0.2; // Strike cripples income
    if (newStats.activeEvent === EconomicEvent.Festival) revenueMultiplier = 1.2; // Tourism boost!

    const taxRevenue = Math.floor(newStats.demographics.adults * 5 * newStats.taxRate * taxEfficiency * revenueMultiplier);
    const businessRevenue = Math.floor(Math.min(totalJobs, newStats.demographics.adults) * 2 * newStats.taxRate * supplyPenalty * revenueMultiplier);

    const totalIncome = taxRevenue + businessRevenue;

    // THEFT (Crime Impact)
    // High crime steals directly from the treasury
    // If Crime Rate > 20, lose $10 per 10 points.
    let theftLoss = 0;
    if (newStats.crimeRate > 20) {
        theftLoss = Math.floor((newStats.crimeRate - 20) * 5);
    }

    const totalExpenses = serviceUpkeep + welfareCost + theftLoss;

    newStats.money += (totalIncome - totalExpenses);

    // Populate Budget Object for UI
    newStats.budget = {
        income: totalIncome,
        expenses: totalExpenses,
        details: {
            tax: taxRevenue,
            business: businessRevenue,
            services: serviceUpkeep,
            welfare: welfareCost
        },
        lastMonthProfit: totalIncome - totalExpenses // Track profit for UI
    };


    // Debt Spiral: If money < 0, maintenance costs increase (simulation of "tax on schools" / loans)
    const maintenanceMultiplier = newStats.money < 0 ? 1.5 : 1.0;

    // Apply extra maintenance cost if in debt
    if (newStats.money < 0) {
        const debtService = Math.abs(newStats.money) * 0.01; // 1% interest/penalty
        newStats.money -= Math.floor(debtService);
        newStats.budget.expenses += Math.floor(debtService); // Track debt service

        // Also reduce happiness significantly due to "economic crisis"
        newStats.happiness -= 5;
    }

    newStats.jobs = {
        commercial: commJobs,
        industrial: indJobs,
        total: totalJobs,
        unemployment: unemployment
    };

    // 5. Happiness Calculation
    let baseHappiness = 100;
    baseHappiness -= (newStats.taxRate * 200);
    // Parks help, but Pollution hurts
    baseHappiness += Math.min(20, parks * 2);

    // Stadium: Huge Happiness Boost
    let stadiums = 0;
    grid.flat().forEach(t => { if (t.buildingType === BuildingType.Stadium) stadiums++; });
    if (stadiums > 0) baseHappiness += 15;

    // Pollution Penalty (Local & Global)
    // 1. Global Smog Penalty
    if (newStats.pollutionLevel > 20) {
        baseHappiness -= (newStats.pollutionLevel - 20);
    }

    // 2. Local Residential Pollution Penalty
    // Calculate average pollution specifically on residential tiles
    let totalResPollution = 0;
    let resCount = 0;
    grid.forEach(row => row.forEach(tile => {
        if (tile.buildingType === BuildingType.Residential || tile.buildingType === BuildingType.Apartment || tile.buildingType === BuildingType.Mansion) {
            totalResPollution += (tile.pollution || 0);
            resCount++;
        }
    }));

    if (resCount > 0) {
        const avgResPollution = totalResPollution / resCount;
        // If people are breathing smog, they are VERY unhappy
        if (avgResPollution > 10) {
            baseHappiness -= avgResPollution * 2; // Heavy penalty
        }
    }

    // Unemployment penalty is mitigated by Shadow Economy (people survive)
    // "Hidden economy keeps people alive"
    const unempPenalty = (unemployment * 0.5) * (1 - newStats.shadowEconomy);
    baseHappiness -= unempPenalty;

    // Supply Shortages hurt happiness
    if (newStats.supplyLevel < 0.8) {
        baseHappiness -= (1 - newStats.supplyLevel) * 20; // Up to -20 happiness if 0 supply
    }

    // Road Connectivity Penalty
    let unconnectedCount = 0;
    grid.flat().forEach(t => {
        if (t.buildingType !== BuildingType.None && t.buildingType !== BuildingType.Road && t.buildingType !== BuildingType.Water &&
            t.hasRoadAccess === false) {
            unconnectedCount++;
        }
    });
    if (unconnectedCount > 0) {
        // -1 Happiness per disconnected building, capped at -20
        baseHappiness -= Math.min(20, unconnectedCount);
    }

    // Event Happiness
    if (newStats.activeEvent === EconomicEvent.Boom) baseHappiness += 10;
    if (newStats.activeEvent === EconomicEvent.Recession) baseHappiness -= 10;
    if (newStats.activeEvent === EconomicEvent.Strike) baseHappiness -= 20;
    if (newStats.activeEvent === EconomicEvent.Festival) baseHappiness += 20; // Massive party boost


    // Crime Penalty (Fear)
    baseHappiness -= (newStats.crimeRate * 0.5);

    newStats.happiness = Math.max(0, Math.min(100, Math.floor(baseHappiness)));

    return newStats;
};

// --- DYNAMIC POLLUTION SIMULATION ---

export const simulateEnvironment = (grid: Grid, stats: CityStats): { newGrid: Grid, windUpdate: Partial<CityStats> } => {
    // 1. Wind Simulation
    // Random walk for wind direction
    let wind = { ...stats.windDirection };
    let speed = stats.windSpeed;

    // 5% chance to change wind
    if (Math.random() < 0.05) {
        // Rotate vector slightly
        const angle = Math.atan2(wind.y, wind.x);
        const newAngle = angle + (Math.random() * 1.0 - 0.5); // +/- 0.5 radians
        wind.x = Math.cos(newAngle);
        wind.y = Math.sin(newAngle);

        // Vary speed
        speed = Math.min(1.0, Math.max(0.1, speed + (Math.random() * 0.2 - 0.1)));
    }

    // 2. Pollution Step
    // Deep copy grid structure to avoid mutating state directly
    const newGrid = grid.map(row => row.map(tile => ({ ...tile })));

    let totalPollution = 0;
    let pollutedTiles = 0;

    const GRID_H = grid.length;
    const GRID_W = grid[0].length;

    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            const tile = newGrid[y][x];
            const config = BUILDINGS[tile.buildingType];

            // A. Generation
            if (config && config.pollution) {
                // Add pollution Source
                tile.pollution = Math.min(100, (tile.pollution || 0) + config.pollution * 2);
            }

            // B. Decay (Natural dissipation)
            let decay = 0.90; // Retain 90% per tick (10% decay)
            if (tile.buildingType === BuildingType.Park) decay = 0.70; // Parks clean air
            if (tile.buildingType === BuildingType.Water) decay = 0.95; // Water traps it a bit

            tile.pollution = (tile.pollution || 0) * decay;

            // C. Advection (Movement)
            // Push some pollution to neighbor based on wind
            if (tile.pollution > 1) {
                const moveAmount = tile.pollution * 0.3 * speed; // Move 30% * speed

                const targetX = x + wind.x;
                const targetY = y + wind.y;

                // Simple nearest neighbor distribution
                const tx = Math.round(targetX);
                const ty = Math.round(targetY);

                if (tx >= 0 && tx < GRID_W && ty >= 0 && ty < GRID_H) {
                    newGrid[ty][tx].pollution = (newGrid[ty][tx].pollution || 0) + moveAmount;
                    tile.pollution -= moveAmount;
                } else {
                    // Blown off map
                    tile.pollution -= moveAmount;
                }
            }

            // Validation
            if (tile.pollution < 0.5) tile.pollution = 0;

            // Stats
            if (tile.pollution > 0) {
                totalPollution += tile.pollution;
                pollutedTiles++;
            }
        }
    }

    // Calc Average Pollution for Global Stats (0-100 scale)
    const avgPollution = pollutedTiles > 0 ? totalPollution / (GRID_W * GRID_H) : 0;

    return {
        newGrid,
        windUpdate: {
            windDirection: wind,
            windSpeed: speed,
            pollutionLevel: Math.min(100, Math.floor(avgPollution * 5))
        }
    };
};
