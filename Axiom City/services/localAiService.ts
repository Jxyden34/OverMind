import { CityStats, Grid, BuildingType, AIAction, AIGoal, NewsItem } from "../types";
import { BUILDINGS } from "../constants";
// import { generateAsciiMap } from "../utils/gridUtils";

const API_KEY = import.meta.env.VITE_OPENWEBUI_API_KEY;
const API_URL = import.meta.env.VITE_OPENWEBUI_API_URL || '/api';

const logToFile = (message: string) => {
    fetch('/log-usage', { method: 'POST', body: message }).catch(() => { });
};

// --- Mock Fallbacks (Offline Mode) ---
const mockCityGoal = (stats: CityStats): AIGoal => {
    const goals: AIGoal[] = [
        { description: "Expand the residential district to house more workers.", targetType: 'population', targetValue: stats.population + 50, reward: 500, completed: false },
        { description: "Increase tax revenue by developing the commercial sector.", targetType: 'money', targetValue: stats.money + 1000, reward: 1000, completed: false },
        { description: "Build 5 new parks to improve city aesthetics.", targetType: 'building_count', targetValue: 5, buildingType: BuildingType.Park, reward: 300, completed: false }
    ];
    return goals[Math.floor(Math.random() * goals.length)];
};

const mockNewsEvent = (): NewsItem => {
    const news = [
        { text: "Local cat elected as honorary council member.", type: 'positive' as const },
        { text: "Mysterious hum heard coming from the sewers.", type: 'neutral' as const },
        { text: "Traffic jam causes minor delays in sector 7.", type: 'negative' as const },
        { text: "Scientists predict a sunny day tomorrow.", type: 'positive' as const }
    ];
    const item = news[Math.floor(Math.random() * news.length)];
    return { id: Date.now().toString(), ...item };
};

const mockGameAction = (stats: CityStats): AIAction => {
    // Simple random building logic
    return {
        action: 'WAIT',
        buildingType: null,
        x: 0,
        y: 0,
        reasoning: "AI is offline (Mock Mode). Holding position."
    };
};

// --- Helper for Local API ---
const callLocalAI = async (prompt: string, systemPrompt: string = "You are a helpful AI assistant."): Promise<string | null> => {
    const MAX_RETRIES = 1;

    for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
            logToFile(`Sending request to: ${API_URL}/chat/completions (Attempt ${i + 1})`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout

            const response = await fetch(`${API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "gemma3:27b", // Default to local model
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                const msg = `[AI SERVICE] API Error: ${response.status} ${response.statusText} - ${errorText}`;
                console.error(msg);
                logToFile(msg);
                if (response.status >= 500 && i < MAX_RETRIES) continue; // Retry on server error
                return null;
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (e) {
            const msg = `[AI SERVICE] Exception: ${e}`;
            console.error(msg);
            logToFile(msg);
            if (i < MAX_RETRIES) continue; // Retry on network error
            return null;
        }
    }
    return null;
};

// Log config on load
logToFile(`AI Service Initialized. URL: ${API_URL}, Key Present: ${!!API_KEY}`);

// --- Goal Generation ---

export const generateCityGoal = async (stats: CityStats, grid: Grid): Promise<AIGoal | null> => {
    const counts: Record<string, number> = {};
    grid.flat().forEach(tile => {
        counts[tile.buildingType] = (counts[tile.buildingType] || 0) + 1;
    });

    const context = `
     Current City Stats:
     Day: ${stats.day}
     Money: $${stats.money}
     Population: ${stats.population}
     Buildings: ${JSON.stringify(counts)}
     Building Costs/Stats: ${JSON.stringify(
        Object.values(BUILDINGS).filter(b => b.type !== BuildingType.None).map(b => ({ type: b.type, cost: b.cost, pop: b.popGen, income: b.incomeGen }))
    )}
   `;

    const prompt = `You are the AI City Advisor for a simulation game. Based on the current city stats, generate a challenging but achievable short-term goal for the player to help the city grow. 
   
   Respond with VALID JSON ONLY. Format:
   {
    "description": "Short creative description",
    "targetType": "population" | "money" | "building_count",
    "targetValue": number,
    "buildingType": "Residential" | "Commercial" | "Industrial" | "Park" | "Road" | "School" | "Hospital" | "Police" (Required if targetType is building_count),
    "reward": number
   }`;

    const responseText = await callLocalAI(`${context}\n${prompt}`, "You are a JSON-only API. Output pure JSON with no markdown.");

    if (responseText) {
        try {
            // Robust JSON Extraction
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];

            const goalData = JSON.parse(jsonStr) as Omit<AIGoal, 'completed'>;
            return { ...goalData, completed: false };
        } catch (e) {
            console.error("Error parsing goal JSON:", e);
        }
    }

    // Fallback
    console.warn("[AI SERVICE] Using Fallback Goal");
    return mockCityGoal(stats);
};

// --- News Feed Generation ---

export const generateNewsEvent = async (stats: CityStats, recentAction: string | null): Promise<NewsItem | null> => {
    const context = `City Stats - Pop: ${stats.population}, Money: ${stats.money}, Day: ${stats.day}. ${recentAction ? `Recent Action: ${recentAction}` : ''}`;
    const prompt = `Generate a BIZARRE, SCI-FI, LOVECRAFTIAN, or FUNNY decision event for the City Mayor. 
    It must be strange. Examples: "A portal opens," "Cats start speaking," "A time traveler demands a tax refund," "The moon is hatching," "A mysterious fleet of immigrant boats arrives from the fog."

    Respond with VALID JSON ONLY. Format:
    {
       "text": "Headline here",
       "type": "positive" | "negative" | "neutral"
    }`;

    const responseText = await callLocalAI(`${context}\n${prompt}`, "You are a JSON-only API. Output pure JSON with no markdown.");

    if (responseText) {
        try {
            // Robust JSON Extraction
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];

            const data = JSON.parse(jsonStr);
            return {
                id: Date.now().toString() + Math.random(),
                text: data.text,
                type: data.type,
            };
        } catch (e) {
            console.error("Error parsing news JSON:", e);
        }
    }

    // Fallback
    return mockNewsEvent();
};

// --- Action Generation ---

// --- Helper: Generate Valid Moves ---
const getAvailableMoves = (grid: Grid, stats: CityStats, forbidden: { x: number, y: number }[]): string[] => {
    const validTiles: { x: number, y: number }[] = [];
    const forbiddenSet = new Set(forbidden.map(f => `${f.x},${f.y}`));

    // 1. Scan for valid EMPTY LAND
    grid.forEach(row => row.forEach(tile => {
        if (tile.buildingType === BuildingType.None && !forbiddenSet.has(`${tile.x},${tile.y}`)) {
            validTiles.push({ x: tile.x, y: tile.y });
        }
    }));

    // 2. Pick a random subset of tiles (e.g. 5) to keep prompt size manageable
    // We shuffle a copy of the array
    const selectedTiles = [...validTiles].sort(() => 0.5 - Math.random()).slice(0, 5);

    const moves: string[] = [];

    // 3. For each tile, offer affordable buildings (excluding Water/Bridge for simplicity)
    const affordableBuildings = Object.values(BUILDINGS).filter(b =>
        b.type !== BuildingType.None &&
        b.type !== BuildingType.Water &&
        b.type !== BuildingType.Bridge &&
        b.cost <= stats.money
    );

    if (affordableBuildings.length === 0) return [];

    selectedTiles.forEach(tile => {
        affordableBuildings.forEach(b => {
            // Strings like "BUILD Residential 12 5"
            moves.push(`BUILD ${b.type} ${tile.x} ${tile.y}`);
        });
    });

    return moves;
};

export const generateGameAction = async (stats: CityStats, grid: Grid, recentFailures: { x: number, y: number }[]): Promise<AIAction | null> => {
    // 1. Context
    const buildingCounts: Record<string, number> = {};
    const waterTiles: string[] = [];

    // Analyze Grid
    grid.flat().forEach(tile => {
        buildingCounts[tile.buildingType] = (buildingCounts[tile.buildingType] || 0) + 1;
        if (tile.buildingType === BuildingType.Water) {
            waterTiles.push(`${tile.x},${tile.y}`);
        }
    });

    const context = {
        day: stats.day,
        money: stats.money,
        population: stats.population,
        demographics: stats.demographics,
        currentGoal: stats.currentGoal,
        crimeRate: stats.crimeRate,
        security: stats.security,
        pollution: stats.pollutionLevel,
        buildings: buildingCounts,
        costs: Object.values(BUILDINGS).filter(b => b.type !== BuildingType.None).map(b => ({ type: b.type, cost: b.cost }))
    };

    // 2. Generate Valid Moves
    const validMoves = getAvailableMoves(grid, stats, recentFailures);
    // If no moves (e.g. no money or no space), fallback to WAIT
    const movesList = validMoves.length > 0 ? validMoves.join('\n') : "WAIT (No valid moves or funds)";

    const lowMoneyWarning = stats.money < 1500 ? "CRITICAL: MONEY LOW (<1500). YOU MUST BUILD COMMERCIAL OR GOLD MINES TO SURVIVE." : "";

    const prompt = `
You are playing a city builder game. 
Current Stats: ${JSON.stringify(context)}

**AVAILABLE MOVES**:
${movesList}
- WAIT (Save money)

${lowMoneyWarning}

**CRITICAL INSTRUCTIONS**:
1. You can **ONLY** choose from the 'AVAILABLE MOVES' list above.
2. **DO NOT** invent coordinates. **DO NOT** invent buildings.
3. If you want to build, you must output the exact string from the list (e.g. "BUILD Residential 12 5").
4. If you decide to WAIT, output "WAIT".

**STRATEGY GUIDE**:
  1. **CHALLENGE**: If 'currentGoal' is active, PRIORITIZE it above all other actions.
  2. **CRIME**: If CrimeRate > Security, BUILD **Police** (if available) to stabilise the city.
  3. **POLLUTION**: If Pollution > 15, BUILD **Park** or **University** (green technology & education).
  4. **HAPPINESS**: If Happiness < 70, BUILD **Park** (preferred) or **Commercial** for leisure and jobs.
  5. **GROWTH**: If the city is stable and you have money, BUILD **Residential** or **Industrial** to expand.
  6. **SOLVENCY**:
     - If Money < 1500, BUILD **Commercial**.
     - If Money > 10000, BUILD **GoldMine** to store surplus wealth.
  7. **SPECIAL**: You may build unique wonders (Limit 1 per city, only if Money > $15000):
     - **MegaMall**: Massive income ($400), but high traffic.
     - **SpacePort**: Huge tourism income ($5000).
     - **University**: Boosts education and technology.
     - **Stadium**: Massive happiness boost (+15).
     *Warning*: These are expensive and should only be built when the city is stable.


Respond with VALID JSON ONLY. Format:
{
  "action": "BUILD" | "WAIT",
  "buildingType": string | null,
  "x": number,
  "y": number,
  "reasoning": "Short explanation"
}
`;

    // console.log(`[AI SERVICE] Generating Move. Day: ${stats.day}. Money: ${stats.money}`);
    logToFile(`Generating Move. Day: ${stats.day}. Money: ${stats.money}`);

    const content = await callLocalAI(prompt, "You are a JSON-only API for a game AI. Output pure JSON. If you previously failed a move or was fined, express frustration in the 'reasoning' field.");

    if (!content) {
        console.warn("[AI SERVICE] AI Failed/Offline. Returning Mock Action.");
        return mockGameAction(stats);
    }

    try {
        logToFile(`API RESPONSE: ${content}`);

        let jsonStr = content;
        // Robust JSON Extraction
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        } else {
            console.error("[AI SERVICE] No JSON found in response");
            logToFile(`PARSE ERROR: No JSON found in response: ${content}`);
            return mockGameAction(stats);
        }

        const action = JSON.parse(jsonStr);
        console.log(`[AI SERVICE] Parsed Action:`, action);
        logToFile(`PARSED ACTION: ${JSON.stringify(action)}`);

        // --- ENFORCEMENT LAYER ---
        // Validate coordinates and overlap
        if (action.action === 'BUILD') {
            const { x, y } = action;
            if (typeof x === 'number' && typeof y === 'number' && x >= 0 && x < grid[0].length && y >= 0 && y < grid.length) {
                const targetTile = grid[y][x];
                if (targetTile.buildingType !== BuildingType.None) {
                    const msg = `BLOCKED: AI tried to build ${action.buildingType} on occupied tile (${x},${y}) which has ${targetTile.buildingType}. Forcing WAIT.`;
                    console.warn(`[AI SAFETY] ${msg}`);
                    logToFile(`SAFETY BLOCK: ${msg}`);

                    return {
                        action: 'WAIT',
                        buildingType: null,
                        x: 0,
                        y: 0,
                        reasoning: "Surveyors found site occupied. Conserving funds.",
                        failedAttempt: { x, y } // Signal failure to App
                    } as AIAction;
                }
            }
        }

        return action as AIAction;

    } catch (e) {
        console.error("[AI SERVICE] Exception:", e);
        logToFile(`EXCEPTION: ${e}`);
        return mockGameAction(stats);
    }
};

// --- Weird Event Generation ---

export interface AIEventResponse {
    title: string;
    description: string;
    choices: {
        yesLabel: string;
        noLabel: string;
        yesEffect: string;
        noEffect: string;
    }
}

export const generateWeirdEvent = async (stats: CityStats): Promise<AIEventResponse | null> => {
    const context = `Year 2xxx. City Stats: Pop ${stats.population}, Money ${stats.money}.`;
    const prompt = `Generate a BIZARRE, SCI-FI, LOVECRAFTIAN, or FUNNY decision event for the City Mayor. 
    It must be strange. Examples: "A portal opens," "Cats start speaking," "A time traveler demands a tax refund," "The moon is hatching," "A mysterious fleet of immigrant boats arrives from the fog."

    Respond with VALID JSON ONLY. Format:
    {
        "title": "Short catchy title",
        "description": "One sentence describing the weird situation.",
        "choices": {
            "yesLabel": "Action A (Creative)",
            "noLabel": "Action B (Boring/Refuse)",
            "yesEffect": "What happens if Yes (e.g. +Money, -Pop)",
            "noEffect": "What happens if No"
        }
    }`;

    const content = await callLocalAI(`${context}\n${prompt}`, "You are a creative Sci-Fi writer engine. JSON only.");
    if (!content) {
        // Fallback
        return {
            title: "Static Noise",
            description: "The emergency radio is picking up strange static noise from the void.",
            choices: {
                yesLabel: "Listen Closely",
                noLabel: "Turn it off",
                yesEffect: "Insight Gained (+Science)",
                noEffect: "Nothing happens"
            }
        };
    }

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("Event parse error", e);
    }
    return null;
};

export const decideEvent = async (event: AIEventResponse, stats: CityStats): Promise<'YES' | 'NO'> => {
    const prompt = `You are the AI Mayor. Validating decision: "${event.title}".
    Situation: ${event.description}
    Choice A: ${event.choices.yesLabel} -> ${event.choices.yesEffect}
    Choice B: ${event.choices.noLabel} -> ${event.choices.noEffect}

    **CRITICAL INSTRUCTION**: Act as a Responsible Mayor. 
    - Analyze the effects. 
    - If Choice A is dangerous, too expensive, or hurts the population, choose NO (Choice B).
    - If Choice A is purely beneficial, choose YES.
    - Do NOT choose YES just to be "fun". Prioritize the survival and happiness of the town.

    Respond with VALID JSON ONLY: { "decision": "YES" | "NO", "reasoning": "short text" }`;

    const content = await callLocalAI(prompt, "You are a Responsible AI Mayor. JSON only.");
    if (!content) return 'NO';

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const res = JSON.parse(jsonMatch[0]);
            return res.decision;
        }
    } catch (e) { }
    return 'NO';
};
