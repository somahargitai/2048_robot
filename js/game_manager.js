let delay = 200;

function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size = size; // Size of the grid
  this.inputManager = new InputManager();
  this.storageManager = new StorageManager();
  this.actuator = new Actuator();

  this.startTiles = 2;

  this.autoSolveInterval = null;
  this.strategy = new SmartStrategy(this); // Default to smart strategy

  this.inputManager.on("autoSolve", this.autoSolve.bind(this));
  this.inputManager.on("toggleStrategy", this.toggleStrategy.bind(this));
  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid = new Grid(previousState.grid.size, previousState.grid.cells); // Reload grid
    this.score = previousState.score;
    this.over = previousState.over;
    this.won = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score: this.score,
    over: this.over,
    won: this.won,
    bestScore: this.storageManager.getBestScore(),
    terminated: this.isGameTerminated(),
  });
};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid: this.grid.serialize(),
    score: this.score,
    over: this.over,
    won: this.won,
    keepPlaying: this.keepPlaying,
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0, y: -1 }, // Up
    1: { x: 1, y: 0 }, // Right
    2: { x: 0, y: 1 }, // Down
    3: { x: -1, y: 0 }, // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell, // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell = { x: x + vector.x, y: y + vector.y };

          var other = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

GameManager.prototype.getNextMove = function () {
  // Simple strategy: try all directions and pick the one that merges most tiles
  const directions = [0, 1, 2, 3]; // up, right, down, left
  let bestScore = -1;
  let bestMove = 0;

  for (let direction of directions) {
    // Create a deep copy of the current grid
    const gridCopy = new Grid(this.size);
    gridCopy.cells = this.grid.serialize().cells;

    // Try the move
    const moved = this.tryMove(direction, gridCopy);
    if (moved) {
      const score = this.evaluatePosition(gridCopy);
      if (score > bestScore) {
        bestScore = score;
        bestMove = direction;
      }
    }
  }

  return bestMove;
};

GameManager.prototype.evaluatePosition = function (grid) {
  let score = 0;
  grid.eachCell(function (x, y, tile) {
    if (tile) {
      score += tile.value;
    }
  });
  return score;
};

GameManager.prototype.tryMove = function (direction, grid) {
  // Build a list of positions and traversals
  var cell, tile;
  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;

  // Save the current tile positions and remove merger information
  var positions = this.prepareTiles(grid);

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(
    function (x) {
      traversals.y.forEach(
        function (y) {
          cell = { x: x, y: y };
          tile = grid.cellContent(cell);

          if (tile) {
            var positions = this.findFarthestPosition(cell, vector, grid);
            var next = grid.cellContent(positions.next);

            // Only one merger per row traversal?
            if (next && next.value === tile.value && !next.mergedFrom) {
              moved = true;
              return true;
            } else if (
              positions.farthest.x !== cell.x ||
              positions.farthest.y !== cell.y
            ) {
              moved = true;
              return true;
            }
          }
        }.bind(this)
      );
    }.bind(this)
  );

  return moved;
};

GameManager.prototype.toggleStrategy = function () {
  if (this.strategy instanceof MasterStrategy) {
    this.strategy = new NaiveStrategy(this);
    document.querySelector(".strategy-button").textContent = "🤖: Naive";
  } else if (this.strategy instanceof NaiveStrategy) {
    this.strategy = new SmartStrategy(this);
    document.querySelector(".strategy-button").textContent = "🤖: Smart";
    console.log("Naive -> Smart");
  } else if (this.strategy instanceof SmartStrategy) {
    this.strategy = new AdvancedStrategy(this);
    document.querySelector(".strategy-button").textContent = "🤖: Advanced";
    console.log("Smart -> Advanced");
  } else if (this.strategy instanceof AdvancedStrategy) {
    this.strategy = new Custom_1(this);
    document.querySelector(".strategy-button").textContent = "🤖: Custom_1";
    console.log("Advanced -> Custom_1");
  } else if (
    this.strategy instanceof Custom_1 &&
    !(this.strategy instanceof Custom_2) &&
    !(this.strategy instanceof Custom_3) &&
    !(this.strategy instanceof Custom_4)
  ) {
    this.strategy = new Custom_2(this);
    document.querySelector(".strategy-button").textContent = "🤖: Custom_2";
    console.log("Custom_1 -> Custom_2");
  } else if (this.strategy instanceof Custom_2) {
    this.strategy = new Custom_3(this);
    document.querySelector(".strategy-button").textContent = "🤖: Custom_3";
    console.log("Custom_2 -> Custom_3");
  } else if (this.strategy instanceof Custom_3) {
    this.strategy = new MasterStrategy(this);
    document.querySelector(".strategy-button").textContent = "🤖: Custom_4";
    console.log("Custom_3 -> Custom_4");
  } else if (this.strategy instanceof Custom_4) {
    this.strategy = new MasterStrategy(this);
    document.querySelector(".strategy-button").textContent = "🤖: Master";
    console.log("Custom_4 -> Master");
  } else {
    this.strategy = new MasterStrategy(this);
    document.querySelector(".strategy-button").textContent = "🤖: Master";
    console.log("Default -> Master");
  }
};

GameManager.prototype.autoSolve = function () {
  if (this.autoSolveInterval) {
    clearInterval(this.autoSolveInterval);
    this.autoSolveInterval = null;
    document.querySelector(".auto-solve-button").textContent = "Solve";
  } else {
    document.querySelector(".auto-solve-button").textContent = "Stop";
    this.autoSolveInterval = setInterval(() => {
      if (this.grid && !this.over) {
        const nextMove = this.strategy.getNextMove();
        this.move(nextMove);
      } else {
        clearInterval(this.autoSolveInterval);
        this.autoSolveInterval = null;
        document.querySelector(".auto-solve-button").textContent = "Solve";
      }
    }, delay);
  }
};
