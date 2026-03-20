//////////////////////////////////////////////////////
///
///     Zack Newman
///     A Collection of Helpful JS scripts
///     Created on 3.12.20
/// 
/// 
//////////////////////////////////////////////////////

// Variables
var canvas;
var ctx;

// Game Objects
var gameObjects;
var ghosts;

var pacman;
var inky;
var blinky;
var pinky;
var sue;

// Game Variables
var score = 0;
var lives = 3;

// Initialization
window.onload = function () {
    // Initialize Canvas
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Initialize Input
    this.document.onkeydown = Input.checkKeyDown;
    this.document.onkeyup = Input.checkKeyUp;

    // Execute functions
    this.start();
}

function start() {
    console.log('start');
    Time.setup();
    initializeLevel();
    update();
}

function update() {
    Time.update();
    Input.update();

    Draw.level();

    gameObjects.forEach(go => {
        go.update();
    });

    window.requestAnimationFrame(() => this.update())
}

function initializeLevel() {
    Levels.levelSetup = Levels.level1;
    Levels.levelDynamic = Levels.level1.map(row => [...row]);

    pacman = new GameObject('yellow', 13.5, 26, 0.667, Move.pacman, Draw.pacman, pacmanOnTileChanged, pacmanOnTileCentered);
    blinky = new GameObject('red', 13.5, 14, 0.667, Move.blinky, Draw.ghost, ghostOnTileChanged, ghostOnTileCentered);
    inky = new GameObject('cyan', 12, 17, 0.667, Move.inky, Draw.ghost, ghostOnTileChanged, ghostOnTileCentered);
    pinky = new GameObject('hotpink', 13.5, 17, 0.667, Move.pinky, Draw.ghost, ghostOnTileChanged, ghostOnTileCentered);
    sue = new GameObject('orange', 15, 17, 0.667, Move.sue, Draw.ghost, ghostOnTileChanged, ghostOnTileCentered);

    gameObjects = [pacman, blinky, inky, pinky, sue];
    ghosts = [blinky, inky, pinky, sue];
}

function lerp(start, end, factor) {
    return start * (1 - factor) + end * factor;
}

function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function pacmanOnTileChanged(x, y) {
    // Check for Dots
    var curTile = Levels.levelDynamic[y][x];

    // Small Dots
    if (curTile === 3) {
        Levels.levelDynamic[y][x] = 5;
        Stats.addToScore(10);

        // Stop movement for 1 frame (1/60)
        pacman.moveSpeed = 0.0;
        Time.addTimer(0.01666666667, () => pacman.moveSpeed = 1.0);
    }

    // Big Dots
    if (curTile === 4) {
        Levels.levelDynamic[y][x] = 5;
        Stats.addToScore(50);

        // Stop movement for 3 frames (3/60)
        pacman.moveSpeed = 0.0;
        Time.addTimer(0.05, () => pacman.moveSpeed = 1.0);
    }
}

function pacmanOnTileCentered(x, y) { }

function ghostOnTileChanged(x, y) { }

function ghostOnTileCentered(x, y) {
    console.log('turn!');
    AI.ghostTileCenter(blinky);
}