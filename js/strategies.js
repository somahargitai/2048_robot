class GameStrategy {
  constructor(gameManager) {
    this.gameManager = gameManager;
  }

  getNextMove() {
    throw new Error("Strategy must implement getNextMove");
  }
}

class NaiveStrategy extends GameStrategy {
  getNextMove() {
    const directions = [0, 1, 2, 3]; // up, right, down, left
    let bestScore = -1;
    let bestMove = 0;

    for (let direction of directions) {
      const gridCopy = new Grid(this.gameManager.size);
      gridCopy.cells = this.gameManager.grid.serialize().cells;

      const moved = this.gameManager.tryMove(direction, gridCopy);
      if (moved) {
        const score = this.evaluatePosition(gridCopy);
        if (score > bestScore) {
          bestScore = score;
          bestMove = direction;
        }
      }
    }

    return bestMove;
  }

  evaluatePosition(grid) {
    let score = 0;
    grid.eachCell(function (x, y, tile) {
      if (tile) {
        score += tile.value;
      }
    });
    return score;
  }
}

class SmartStrategy extends GameStrategy {
  getNextMove() {
    const directions = [0, 1, 2, 3]; // up, right, down, left
    let bestScore = -Infinity;
    let bestMove = 0;

    for (let direction of directions) {
      const gridCopy = new Grid(this.gameManager.size);
      gridCopy.cells = this.gameManager.grid.serialize().cells;

      const moved = this.gameManager.tryMove(direction, gridCopy);
      if (moved) {
        const score = this.evaluatePosition(gridCopy);
        if (score > bestScore) {
          bestScore = score;
          bestMove = direction;
        }
      }
    }

    return bestMove;
  }

  evaluatePosition(grid) {
    let score = 0;

    // Factor 1: Sum of tiles
    let tileSum = 0;
    // Factor 2: Number of empty cells
    let emptyCells = 0;
    // Factor 3: Monotonicity (tiles should be ordered)
    let monotonicity = 0;
    // Factor 4: Smoothness (adjacent tiles should be similar)
    let smoothness = 0;

    // Calculate base scores
    grid.eachCell((x, y, tile) => {
      if (tile) {
        tileSum += tile.value;
      } else {
        emptyCells++;
      }
    });

    // Calculate monotonicity and smoothness
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const currentTile = grid.cellContent({ x, y });
        if (currentTile) {
          const currentValue = Math.log2(currentTile.value);

          // Check right neighbor
          if (x < 3) {
            const rightTile = grid.cellContent({ x: x + 1, y });
            if (rightTile) {
              const rightValue = Math.log2(rightTile.value);
              smoothness -= Math.abs(currentValue - rightValue);
              if (currentValue > rightValue) monotonicity++;
            }
          }

          // Check bottom neighbor
          if (y < 3) {
            const bottomTile = grid.cellContent({ x, y: y + 1 });
            if (bottomTile) {
              const bottomValue = Math.log2(bottomTile.value);
              smoothness -= Math.abs(currentValue - bottomValue);
              if (currentValue > bottomValue) monotonicity++;
            }
          }
        }
      }
    }

    // Check if highest value is in corner
    const corners = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
    ];
    let maxTile = 0;
    let maxTileInCorner = false;

    grid.eachCell((x, y, tile) => {
      if (tile && tile.value > maxTile) {
        maxTile = tile.value;
        maxTileInCorner = corners.some(
          (corner) => corner.x === x && corner.y === y
        );
      }
    });

    // Weight the different factors
    score += tileSum * 1;
    score += emptyCells * 10000;
    score += smoothness * 40;
    score += monotonicity * 50;
    score += maxTileInCorner ? 20000 : 0;

    return score;
  }
}

class AdvancedStrategy extends GameStrategy {
  constructor(gameManager) {
    super(gameManager);
    this.SEARCH_DEPTH = 5; // Look ahead 5 moves
    this.EMPTY_WEIGHT = 12000;
    this.MONOTONICITY_WEIGHT = 80;
    this.SMOOTHNESS_WEIGHT = 60;
    this.CORNER_WEIGHT = 25000;
    this.SNAKE_PATTERN_WEIGHT = 100;
  }

  expectimax(grid, depth, isMax) {
    if (depth === 0) {
      return this.evaluatePosition(grid);
    }

    if (isMax) {
      let bestScore = -Infinity;
      const directions = [0, 1, 2, 3];

      for (let direction of directions) {
        const gridCopy = new Grid(this.gameManager.size);
        // Properly copy the grid state
        const cells = grid.serialize().cells;
        gridCopy.cells = cells.map((row) =>
          row.map((cell) =>
            cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
          )
        );

        const moved = this.gameManager.tryMove(direction, gridCopy);
        if (moved) {
          bestScore = Math.max(
            bestScore,
            this.expectimax(gridCopy, depth - 1, false)
          );
        }
      }

      return bestScore === -Infinity ? this.evaluatePosition(grid) : bestScore;
    } else {
      let score = 0;
      let count = 0;
      const emptyCells = [];

      // First collect empty cells
      grid.eachCell((x, y, tile) => {
        if (!tile) {
          emptyCells.push({ x, y });
        }
      });

      if (emptyCells.length === 0) {
        return this.evaluatePosition(grid);
      }

      // Then process them
      emptyCells.forEach(({ x, y }) => {
        // Try placing a 2 tile (90% probability)
        const gridWith2 = new Grid(this.gameManager.size);
        const cells2 = grid.serialize().cells;
        gridWith2.cells = cells2.map((row) =>
          row.map((cell) =>
            cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
          )
        );
        gridWith2.insertTile(new Tile({ x, y }, 2));
        score += 0.9 * this.expectimax(gridWith2, depth - 1, true);

        // Try placing a 4 tile (10% probability)
        const gridWith4 = new Grid(this.gameManager.size);
        const cells4 = grid.serialize().cells;
        gridWith4.cells = cells4.map((row) =>
          row.map((cell) =>
            cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
          )
        );
        gridWith4.insertTile(new Tile({ x, y }, 4));
        score += 0.1 * this.expectimax(gridWith4, depth - 1, true);

        count++;
      });

      return score / count;
    }
  }

  getNextMove() {
    const directions = [0, 1, 2, 3];
    let bestScore = -Infinity;
    let bestMove = 0;

    for (let direction of directions) {
      const gridCopy = new Grid(this.gameManager.size);
      // Properly copy the grid state
      const cells = this.gameManager.grid.serialize().cells;
      gridCopy.cells = cells.map((row) =>
        row.map((cell) =>
          cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
        )
      );

      const moved = this.gameManager.tryMove(direction, gridCopy);
      if (moved) {
        const score = this.expectimax(gridCopy, this.SEARCH_DEPTH, false);
        if (score > bestScore) {
          bestScore = score;
          bestMove = direction;
        }
      }
    }

    return bestMove;
  }

  evaluatePosition(grid) {
    let score = 0;
    let emptyCells = 0;
    let monotonicity = 0;
    let smoothness = 0;
    let snakePatternScore = 0;
    let maxTile = 0;

    // Calculate empty cells and find max tile
    grid.eachCell((x, y, tile) => {
      if (tile) {
        maxTile = Math.max(maxTile, tile.value);
      } else {
        emptyCells++;
      }
    });

    // Snake pattern evaluation (zigzag from top-left)
    const snakePattern = [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      [
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      [
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
      [
        { x: 3, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
        { x: 0, y: 3 },
      ],
    ];

    let lastValue = Infinity;
    snakePattern.forEach((row) => {
      row.forEach((pos) => {
        const tile = grid.cellContent(pos);
        if (tile) {
          if (tile.value <= lastValue) {
            snakePatternScore += Math.log2(tile.value) * 1.5;
          }
          lastValue = tile.value;
        }
      });
    });

    // Calculate monotonicity and smoothness
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const currentTile = grid.cellContent({ x, y });
        if (currentTile) {
          const currentValue = Math.log2(currentTile.value);

          // Check right and bottom neighbors
          [
            [1, 0],
            [0, 1],
          ].forEach(([dx, dy]) => {
            if (x + dx < 4 && y + dy < 4) {
              const neighborTile = grid.cellContent({ x: x + dx, y: y + dy });
              if (neighborTile) {
                const neighborValue = Math.log2(neighborTile.value);
                smoothness -= Math.abs(currentValue - neighborValue);

                // Monotonicity in both directions
                if (currentValue > neighborValue) {
                  monotonicity += currentValue - neighborValue;
                }
              }
            }
          });
        }
      }
    }

    // Check if highest value is in corner
    const corners = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
    ];
    const maxTileInCorner = corners.some((corner) => {
      const tile = grid.cellContent(corner);
      return tile && tile.value === maxTile;
    });

    // Weight the different factors
    score += emptyCells * this.EMPTY_WEIGHT;
    score += smoothness * this.SMOOTHNESS_WEIGHT;
    score += monotonicity * this.MONOTONICITY_WEIGHT;
    score += maxTileInCorner ? this.CORNER_WEIGHT : 0;
    score += snakePatternScore * this.SNAKE_PATTERN_WEIGHT;

    // Penalty for having the max tile not in a corner
    if (!maxTileInCorner) {
      score -= Math.log2(maxTile) * 1000;
    }

    return score;
  }
}

class MasterStrategy extends GameStrategy {
  constructor(gameManager) {
    super(gameManager);
    this.SEARCH_DEPTH = 4;
    this.CORNER_WEIGHT = 30000;
    this.CHAIN_WEIGHT = 15000;
    this.EMPTY_WEIGHT = 10000;
    this.EDGE_WEIGHT = 2000;
    this.GRADIENT_WEIGHT = 5000;

    // Predefined weight matrices for different stages
    this.EARLY_GAME_WEIGHTS = [
      [2048, 1024, 512, 256],
      [128, 256, 384, 512],
      [64, 128, 256, 384],
      [32, 64, 128, 256],
    ];

    this.LATE_GAME_WEIGHTS = [
      [65536, 32768, 16384, 8192],
      [32768, 16384, 8192, 4096],
      [16384, 8192, 4096, 2048],
      [8192, 4096, 2048, 1024],
    ];
  }

  getNextMove() {
    const directions = [0, 1, 2, 3];
    let bestScore = -Infinity;
    let bestMove = 0;

    // Get current game stage
    const maxTile = this.getMaxTile(this.gameManager.grid);
    const isLateGame = maxTile >= 1024;

    // Alpha-beta pruning parameters
    const alpha = -Infinity;
    const beta = Infinity;

    for (let direction of directions) {
      const gridCopy = new Grid(this.gameManager.size);
      const cells = this.gameManager.grid.serialize().cells;
      gridCopy.cells = cells.map((row) =>
        row.map((cell) =>
          cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
        )
      );

      const moved = this.gameManager.tryMove(direction, gridCopy);
      if (moved) {
        // Use alpha-beta pruning for better performance
        const score = this.alphaBeta(
          gridCopy,
          this.SEARCH_DEPTH,
          alpha,
          beta,
          false,
          isLateGame
        );
        if (score > bestScore) {
          bestScore = score;
          bestMove = direction;
        }
      }
    }

    return bestMove;
  }

  alphaBeta(grid, depth, alpha, beta, isMax, isLateGame) {
    if (depth === 0) {
      return this.evaluatePosition(grid, isLateGame);
    }

    if (isMax) {
      let value = -Infinity;
      const directions = [0, 1, 2, 3];

      for (let direction of directions) {
        const gridCopy = new Grid(this.gameManager.size);
        const cells = grid.serialize().cells;
        gridCopy.cells = cells.map((row) =>
          row.map((cell) =>
            cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
          )
        );

        if (this.gameManager.tryMove(direction, gridCopy)) {
          value = Math.max(
            value,
            this.alphaBeta(gridCopy, depth - 1, alpha, beta, false, isLateGame)
          );
          alpha = Math.max(alpha, value);
          if (beta <= alpha) break; // Beta cut-off
        }
      }

      return value === -Infinity
        ? this.evaluatePosition(grid, isLateGame)
        : value;
    } else {
      let value = Infinity;
      const emptyCells = [];

      grid.eachCell((x, y, tile) => {
        if (!tile) emptyCells.push({ x, y });
      });

      if (emptyCells.length === 0) {
        return this.evaluatePosition(grid, isLateGame);
      }

      // Only evaluate a subset of possible spawn positions for better performance
      const sampleSize = Math.min(3, emptyCells.length);
      const sampledCells = this.sampleCells(emptyCells, sampleSize);

      for (const { x, y } of sampledCells) {
        // Try 2 (90% probability)
        const gridWith2 = new Grid(this.gameManager.size);
        const cells2 = grid.serialize().cells;
        gridWith2.cells = cells2.map((row) =>
          row.map((cell) =>
            cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
          )
        );
        gridWith2.insertTile(new Tile({ x, y }, 2));
        value = Math.min(
          value,
          0.9 *
            this.alphaBeta(gridWith2, depth - 1, alpha, beta, true, isLateGame)
        );

        // Try 4 (10% probability)
        const gridWith4 = new Grid(this.gameManager.size);
        const cells4 = grid.serialize().cells;
        gridWith4.cells = cells4.map((row) =>
          row.map((cell) =>
            cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
          )
        );
        gridWith4.insertTile(new Tile({ x, y }, 4));
        value = Math.min(
          value,
          0.1 *
            this.alphaBeta(gridWith4, depth - 1, alpha, beta, true, isLateGame)
        );

        beta = Math.min(beta, value);
        if (beta <= alpha) break; // Alpha cut-off
      }

      return value;
    }
  }

  evaluatePosition(grid, isLateGame) {
    let score = 0;
    const weights = isLateGame
      ? this.LATE_GAME_WEIGHTS
      : this.EARLY_GAME_WEIGHTS;

    // Count empty cells
    let emptyCells = 0;

    // Evaluate gradient and chain formation
    let gradientScore = 0;
    let chainScore = 0;
    let cornerScore = 0;
    let edgeScore = 0;

    // Track the highest tile and its position
    let maxTile = 0;
    let maxTilePos = null;

    // Main grid evaluation
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const tile = grid.cellContent({ x, y });

        if (!tile) {
          emptyCells++;
          continue;
        }

        // Update max tile info
        if (tile.value > maxTile) {
          maxTile = tile.value;
          maxTilePos = { x, y };
        }

        // Apply position weights
        score += tile.value * weights[x][y];

        // Check for chains (adjacent tiles with decreasing values)
        if (x < 3) {
          const rightTile = grid.cellContent({ x: x + 1, y });
          if (rightTile && this.isValidChain(tile.value, rightTile.value)) {
            chainScore += Math.log2(tile.value);
          }
        }
        if (y < 3) {
          const bottomTile = grid.cellContent({ x, y: y + 1 });
          if (bottomTile && this.isValidChain(tile.value, bottomTile.value)) {
            chainScore += Math.log2(tile.value);
          }
        }

        // Edge bonus for high values
        if (x === 0 || x === 3 || y === 0 || y === 3) {
          edgeScore += tile.value;
        }
      }
    }

    // Corner bonus
    if (
      maxTilePos &&
      ((maxTilePos.x === 0 && maxTilePos.y === 0) ||
        (maxTilePos.x === 0 && maxTilePos.y === 3) ||
        (maxTilePos.x === 3 && maxTilePos.y === 0) ||
        (maxTilePos.x === 3 && maxTilePos.y === 3))
    ) {
      cornerScore = maxTile * 2;
    }

    // Merge scores with weights
    score +=
      emptyCells * this.EMPTY_WEIGHT +
      chainScore * this.CHAIN_WEIGHT +
      cornerScore * this.CORNER_WEIGHT +
      edgeScore * this.EDGE_WEIGHT +
      gradientScore * this.GRADIENT_WEIGHT;

    // Penalty for not having max tile in corner during late game
    if (isLateGame && cornerScore === 0) {
      score -= maxTile * this.CORNER_WEIGHT;
    }

    return score;
  }

  isValidChain(value1, value2) {
    // Check if two values form a valid chain (one is double the other)
    return value1 === value2 * 2 || value2 === value1 * 2;
  }

  getMaxTile(grid) {
    let max = 0;
    grid.eachCell((x, y, tile) => {
      if (tile && tile.value > max) {
        max = tile.value;
      }
    });
    return max;
  }

  sampleCells(cells, count) {
    // Randomly sample cells for evaluation
    const shuffled = [...cells].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}

class Custom_1 extends GameStrategy {
  constructor(gameManager) {
    super(gameManager);
    this.DOWN_PENALTY = 10000; // Büntetés a le irányú mozgásért
    this.TOP_MERGE_BONUS = 5000; // Bónusz a felső sorban történő egyesítésért
  }

  getNextMove() {
    const directions = [0, 1, 2, 3]; // fel, jobb, le, bal
    let bestScore = -Infinity;
    let bestMove = 0;

    // Először vizsgáljuk meg a felső sort
    const topRowMerge = this.checkTopRowMerge();
    if (topRowMerge.possible) {
      // Ha van lehetőség felső sorban egyesítésre, próbáljuk azt
      const gridCopy = this.copyGrid(this.gameManager.grid);
      if (this.gameManager.tryMove(0, gridCopy)) {
        // Próbáljunk felfelé mozogni
        // Ellenőrizzük, hogy a mozgás után lehetséges-e horizontális mozgás
        if (this.isHorizontalMovePossible(gridCopy)) {
          return 0; // Fel mozgás
        }
      }
    }

    // Ha nem tudtunk vagy nem akartunk felfelé mozogni, értékeljük az összes lehetőséget
    for (let direction of directions) {
      const gridCopy = this.copyGrid(this.gameManager.grid);

      const moved = this.gameManager.tryMove(direction, gridCopy);
      if (moved) {
        let score = this.evaluatePosition(gridCopy, direction);

        // Ha ez egy le irány, jelentősen büntessük
        if (direction === 2) {
          score -= this.DOWN_PENALTY;
        }

        // Ha ez egy fel irány, ellenőrizzük a horizontális mozgás lehetőségét
        if (direction === 0 && !this.isHorizontalMovePossible(gridCopy)) {
          score -= this.DOWN_PENALTY; // Ugyanakkora büntetés, mint a le iránynak
        }

        if (score > bestScore) {
          bestScore = score;
          bestMove = direction;
        }
      }
    }

    return bestMove;
  }

  checkTopRowMerge() {
    const grid = this.gameManager.grid;
    let lowestValue = Infinity;
    let lowestValueCount = 0;

    // Vizsgáljuk a felső sort
    for (let x = 0; x < 4; x++) {
      const tile = grid.cellContent({ x, y: 0 });
      if (tile) {
        if (tile.value < lowestValue) {
          lowestValue = tile.value;
          lowestValueCount = 1;
        } else if (tile.value === lowestValue) {
          lowestValueCount++;
        }
      }
    }

    // Keressük a második sorban is ugyanezt az értéket
    let hasMatchInSecondRow = false;
    for (let x = 0; x < 4; x++) {
      const tile = grid.cellContent({ x, y: 1 });
      if (tile && tile.value === lowestValue) {
        hasMatchInSecondRow = true;
        break;
      }
    }

    return {
      possible: lowestValueCount > 1 || hasMatchInSecondRow,
      value: lowestValue,
    };
  }

  isHorizontalMovePossible(grid) {
    // Ellenőrizzük, hogy lehetséges-e jobbra vagy balra mozogni
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 3; x++) {
        const current = grid.cellContent({ x, y });
        const next = grid.cellContent({ x: x + 1, y });

        if (
          (!current && next) ||
          (current && next && current.value === next.value) ||
          (current && !next)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  evaluatePosition(grid, direction) {
    let score = 0;

    // Számoljuk az üres mezőket
    let emptyCells = 0;
    grid.eachCell((x, y, tile) => {
      if (!tile) {
        emptyCells++;
      }
    });
    score += emptyCells * 100;

    // Értékeljük a felső sort
    let topRowValue = 0;
    for (let x = 0; x < 4; x++) {
      const tile = grid.cellContent({ x, y: 0 });
      if (tile) {
        topRowValue += tile.value;
      }
    }
    score += topRowValue * 2;

    // Büntessük, ha túl sok elem van az alsó sorban
    let bottomRowCount = 0;
    for (let x = 0; x < 4; x++) {
      const tile = grid.cellContent({ x, y: 3 });
      if (tile) {
        bottomRowCount++;
      }
    }
    score -= bottomRowCount * 500;

    return score;
  }

  copyGrid(grid) {
    const gridCopy = new Grid(this.gameManager.size);
    const cells = grid.serialize().cells;
    gridCopy.cells = cells.map((row) =>
      row.map((cell) =>
        cell ? new Tile({ x: cell.x, y: cell.y }, cell.value) : null
      )
    );
    return gridCopy;
  }
}

class Custom_2 extends Custom_1 {
  constructor(grid) {
    super(grid);
    this.grid = grid;
  }

  getNextMove() {
    const emptyFields = this.countEmptyFields(this.grid);
    
    if (emptyFields <= 7) {
      // Switch to elimination strategy
      const move = this.eliminationStrategy();
      if (move) {
        return move;
      }
      // If no move found, fall back to Custom_1 strategy
      return super.getNextMove();
    } else {
      // Use original Custom_1 strategy
      return super.getNextMove();
    }
  }

  countEmptyFields(grid) {
    let count = 0;
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        if (grid[i][j] === 0) {
          count++;
        }
      }
    }
    return count;
  }

  eliminationStrategy() {
    for (let i = 0; i < this.grid.length; i++) {
      for (let j = 0; j < this.grid[i].length; j++) {
        if (this.grid[i][j] === 0) {
          // Try placing numbers 1-9 in empty field
          for (let num = 1; num <= 9; num++) {
            if (this.isValid(i, j, num)) {
              // Return move in the correct format with x, y coordinates
              return {
                x: j,  // column
                y: i,  // row
                value: num
              };
            }
          }
        }
      }
    }
    return null;
  }
}

class Custom_3 extends Custom_1 {
  constructor(grid) {
    super(grid);
    this.grid = grid;
  }

  findPotentialTargets() {
    const targets = [];
    
    // Look for cells that have multiple candidates including high values
    for (let i = 0; i < this.grid.length; i++) {
      for (let j = 0; j < this.grid[i].length; j++) {
        if (this.grid[i][j] === 0) {
          const candidates = this.findCandidates(i, j);
          // Focus on cells that are close to being solved (2-3 candidates)
          if (candidates.length >= 2 && candidates.length <= 3) {
            const maxValue = Math.max(...candidates);
            targets.push({
              row: i,
              col: j,
              value: maxValue,
              candidates: candidates
            });
          }
        }
      }
    }

    // Sort targets by value, highest first
    targets.sort((a, b) => b.value - a.value);
    return targets;
  }

  getNextMove() {
    const emptyFields = this.countEmptyFields(this.grid);
    let move = null;
    
    if (emptyFields <= 7) {
      // Look for highest value eliminations within 2 moves
      move = this.findHighValueElimination(2);
    } else {
      // Look for highest value eliminations within 3 moves
      move = this.findHighValueElimination(3);
    }

    return move || super.getNextMove();
  }

  findHighValueElimination(maxDepth) {
    const targets = this.findPotentialTargets();
    
    if (targets.length === 0) {
      return null;
    }

    // Try to find moves that lead to eliminating the highest value targets
    for (const target of targets) {
      const move = this.findMovesToEliminate(target, maxDepth);
      if (move) {
        return move;
      }
    }

    return null;
  }

  findMovesToEliminate(target, maxDepth) {
    const relatedCells = this.findRelatedCells(target.row, target.col);
    
    for (const cell of relatedCells) {
      for (let num = 1; num <= 9; num++) {
        if (this.isValid(cell.row, cell.col, num)) {
          // Try this move
          this.grid[cell.row][cell.col] = num;
          
          // Check if this move leads to target elimination
          if (this.canEliminateTarget(target)) {
            this.grid[cell.row][cell.col] = 0;
            return { x: cell.col, y: cell.row, value: num };
          }
          
          if (maxDepth > 1) {
            const nextMove = this.findMovesToEliminateRecursive(target, maxDepth - 1);
            if (nextMove) {
              this.grid[cell.row][cell.col] = 0;
              return { x: cell.col, y: cell.row, value: num };
            }
          }
          
          // Undo move
          this.grid[cell.row][cell.col] = 0;
        }
      }
    }
    return null;
  }

  findMovesToEliminateRecursive(target, depth) {
    if (depth <= 0) return null;
    
    const relatedCells = this.findRelatedCells(target.row, target.col);
    
    for (const cell of relatedCells) {
      for (let num = 1; num <= 9; num++) {
        if (this.isValid(cell.row, cell.col, num)) {
          this.grid[cell.row][cell.col] = num;
          
          if (this.canEliminateTarget(target)) {
            this.grid[cell.row][cell.col] = 0;
            return true;
          }
          
          if (depth > 1) {
            const nextMove = this.findMovesToEliminateRecursive(target, depth - 1);
            if (nextMove) {
              this.grid[cell.row][cell.col] = 0;
              return true;
            }
          }
          
          this.grid[cell.row][cell.col] = 0;
        }
      }
    }
    return false;
  }

  findCandidates(row, col) {
    const candidates = [];
    for (let num = 1; num <= 9; num++) {
      if (this.isValid(row, col, num)) {
        candidates.push(num);
      }
    }
    return candidates;
  }

  countEmptyFields(grid) {
    let count = 0;
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        if (grid[i][j] === 0) {
          count++;
        }
      }
    }
    return count;
  }
}

class Custom_4 extends Custom_1 {
    constructor(grid) {
        super(grid);
        this.grid = grid;
    }

    getNextMove() {
        const emptyFields = this.countEmptyFields(this.grid);
        
        if (emptyFields <= 9) {
            // Look for chains and try to complete them
            const chainMove = this.findChainCompletion();
            if (chainMove) {
                return chainMove;
            }
        }
        
        return super.getNextMove();
    }

    findChainCompletion() {
        // Find all chains of length 3 or more
        const chains = this.findAllChains();
        
        // Sort chains by length and highest value
        chains.sort((a, b) => {
            if (b.length === a.length) {
                return b[0].value - a[0].value;
            }
            return b.length - a.length;
        });

        // Try to complete the best chain
        for (const chain of chains) {
            if (chain.length >= 3) {
                const lowestValue = chain[chain.length - 1].value;
                const move = this.findMoveToCompleteChain(chain, lowestValue);
                if (move) {
                    return move;
                }
            }
        }

        return null;
    }

    findAllChains() {
        const chains = [];
        const visited = new Set();

        // Start from each cell
        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[i].length; j++) {
                if (this.grid[i][j] > 0 && !visited.has(`${i},${j}`)) {
                    const chain = this.exploreChain(i, j, visited);
                    if (chain.length >= 3) {
                        chains.push(chain);
                    }
                }
            }
        }

        return chains;
    }

    exploreChain(startRow, startCol, visited) {
        const chain = [];
        const queue = [{row: startRow, col: startCol, value: this.grid[startRow][startCol]}];
        
        while (queue.length > 0) {
            const current = queue.shift();
            const key = `${current.row},${current.col}`;
            
            if (visited.has(key)) continue;
            
            visited.add(key);
            chain.push(current);

            // Check adjacent cells (up, right, down, left)
            const directions = [[-1,0], [0,1], [1,0], [0,-1]];
            
            for (const [dx, dy] of directions) {
                const newRow = current.row + dx;
                const newCol = current.col + dy;
                
                if (this.isValidPosition(newRow, newCol)) {
                    const nextValue = this.grid[newRow][newCol];
                    if (this.isChainableValue(current.value, nextValue)) {
                        queue.push({
                            row: newRow,
                            col: newCol,
                            value: nextValue
                        });
                    }
                }
            }
        }

        // Sort chain by value (highest to lowest)
        chain.sort((a, b) => b.value - a.value);
        return chain;
    }

    isChainableValue(value1, value2) {
        return value2 > 0 && (value1 === value2 * 2 || value2 === value1 * 2);
    }

    findMoveToCompleteChain(chain, targetValue) {
        // Look for a move that would create a match for the lowest value in the chain
        const lowestCell = chain[chain.length - 1];
        
        // Check adjacent cells to the lowest value in chain
        const directions = [[-1,0], [0,1], [1,0], [0,-1]];
        
        for (const [dx, dy] of directions) {
            const newRow = lowestCell.row + dx;
            const newCol = lowestCell.col + dy;
            
            if (this.isValidPosition(newRow, newCol) && this.grid[newRow][newCol] === 0) {
                // Check if we can place matching value here
                if (this.isValid(newRow, newCol, targetValue)) {
                    return {
                        x: newCol,
                        y: newRow,
                        value: targetValue
                    };
                }
            }
        }

        return null;
    }

    isValidPosition(row, col) {
        return row >= 0 && row < this.grid.length && 
               col >= 0 && col < this.grid[0].length;
    }

    countEmptyFields(grid) {
        let count = 0;
        for (let i = 0; i < grid.length; i++) {
            for (let j = 0; j < grid[i].length; j++) {
                if (grid[i][j] === 0) {
                    count++;
                }
            }
        }
        return count;
    }
}