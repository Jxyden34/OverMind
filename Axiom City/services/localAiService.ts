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
        demographics: stats.demographics, // Added for smart service scaling
        currentGoal: stats.currentGoal, // Added so AI sees the active challenge
        crimeRate: stats.crimeRate,
        security: stats.security,
        pollution: stats.pollutionLevel,
        buildings: buildingCounts,
        forbiddenTiles: recentFailures.length > 0 ? recentFailures.map(f => `[${f.x},${f.y}]`).join(', ') : "None",
        waterLocations: waterTiles.length > 20 ? "MANY (Islands)" : waterTiles.join(', '),
        costs: Object.entries(BUILDINGS).map(([k, v]) => ({ type: k, cost: v.cost, income: v.incomeGen, pop: v.popGen }))
    };

    // 2. Prompt
    const affordableBuildings = Object.entries(BUILDINGS)
        .filter(([_, v]) => stats.money >= v.cost && v.type !== BuildingType.None)
        .map(([k, v]) => `- ${v.name} ($${v.cost}) -> BUILD ${k} <X> <Y>`);

    const lowMoneyWarning = stats.money < 2000 ? "CRITICAL: MONEY LOW (<2000). YOU MUST BUILD COMMERCIAL OR GOLD MINES TO SURVIVE. DO NOT BUILD RESIDENTIAL OR PARKS." : "";

    const prompt = `
You are partially playing a city builder game. You must make a MOVE.
Current Stats: ${JSON.stringify(context)}

Available Moves:
${affordableBuildings.length > 0 ? affordableBuildings.join('\n') : "- NONE (Insufficient Funds)"}
- WAIT (Save money)

${lowMoneyWarning}

Rules:
- You cannot spend more money than you have.
- You can ONLY build buildings listed in 'Available Moves'.
- **CRITICAL**: DO NOT BUILD ON OCCUPIED TILES. Only build on EMPTY land (None).
- **CRITICAL**: DO NOT DEMOLISH ANYTHING. You are not allowed to destroy buildings.
- FORBIDDEN: Do not build on WATER tiles. The map has water. avoiding ${waterTiles.length} water tiles is priority.
- FORBIDDEN: Do not try to build on tiles listed in 'forbiddenTiles' (recent failures).
- STRATEGY:
  1. **CHALLENGE**: If 'currentGoal' is active, PRIORITIZE it! (e.g. if Goal is 'Build 5 Parks', build Park).
  2. **CRIME**: If CrimeRate > Security, you MUST build **Police**. Law and order is essential.
  3. **POLLUTION**: If Pollution > 15, you MUST build a **Park** to clean the air and improve happiness.
  4. **HAPPINESS**: If Happiness < 70, you MUST build **Park** or **Commercial** (Entertainment). Unhappy citizens leave!
  3. **FIRE SAFETY**: If you have > 10 buildings, ensure there is at least 1 **FireStation**.
  4. **GREED**: If Safety > 90 and Money > $3000, build a **Casino**! It prints money (but lowers safety).
  5. **ZONING**: Do NOT build **Industrial** next to **Residential** (Pollution). Keep them separate!
  6. **PEOPLE FIRST**: If (Jobs > Population), build **Residential** or **Apartment**.
  7. **SOLVENCY**: 
     - If Money > $1500 and Trending Down: Build **GoldMine**.
     - If Money < $500: Build **Commercial** (Cheap income).
  8. **DEMOGRAPHICS**: 
     - Children > 2 -> **School**.
     - Seniors > 5 -> **Hospital**.
  9. **INFRASTRUCTURE**: Every 3 buildings, build a **Road** to connect them.

Respond with valid JSON ONLY. Do not explain anything outside the JSON.
Format:
{
  "action": "BUILD" | "DEMOLISH" | "WAIT",
  "buildingType": "Residential" | "Commercial" | "Industrial" | "Road" | "Park" | "School" | "Hospital" | "GoldMine" | "FireStation" | "Casino" | null,
  "x": number,
  "y": number,
  "reasoning": "A short news headline explaining this move (max 10 words). E.g. 'Mayor approves new housing project'"
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
