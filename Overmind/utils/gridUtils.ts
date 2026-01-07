import { Grid, BuildingType } from "../types";

export const generateAsciiMap = (grid: Grid, forbiddenTiles: string[] = []): string => {
    const mapRows: string[] = [];
    const forbiddenSet = new Set(forbiddenTiles);

    grid.forEach((row, y) => {
        let rowStr = "";
        row.forEach((t, x) => {
            if (forbiddenSet.has(`${x},${y}`)) {
                rowStr += "X"; // Visual Exclusion for failed moves
            }
            else if (t.buildingType === BuildingType.None) rowStr += ".";
            else if (t.buildingType === BuildingType.Road) rowStr += "#";
            else if (t.buildingType === BuildingType.Residential) rowStr += "R";
            else if (t.buildingType === BuildingType.Commercial) rowStr += "C";
            else if (t.buildingType === BuildingType.Industrial) rowStr += "I";
            else if (t.buildingType === BuildingType.Park) rowStr += "P";
            else rowStr += "?";
        });
        mapRows.push(rowStr);
    });

    // Add coordinate numbers to help the AI
    // Header for X coords (single digit modulo 10)
    const header = "   " + Array.from({ length: grid[0].length }, (_, i) => i % 10).join("");

    // Map with Y coords
    const mapWithCoords = [header, ...mapRows.map((r, i) => `${i.toString().padStart(2, ' ')} ${r}`)].join('\n');

    return mapWithCoords;
};
