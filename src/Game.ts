import { gameState } from './game-state';
import { Time }  from './static/Time';
import { Input } from './static/Input';
import { Draw }  from './static/Draw';
import { Move }  from './static/Move';
import { AI }    from './static/AI';
import { Levels } from './static/Levels';
import { Stats }  from './static/Stats';
import { GameObject } from './object/GameObject';

function pacmanOnTileChanged(x: number, y: number): void {
    const curTile = Levels.levelDynamic[y][x];

    // Small dot
    if (curTile === 3) {
        Levels.levelDynamic[y][x] = 5;
        Stats.addToScore(10);
        gameState.pacman.moveSpeed = 0.0;
        Time.addTimer(0.01666666667, () => { gameState.pacman.moveSpeed = 1.0; });
    }

    // Power pellet
    if (curTile === 4) {
        Levels.levelDynamic[y][x] = 5;
        Stats.addToScore(50);
        gameState.pacman.moveSpeed = 0.0;
        Time.addTimer(0.05, () => { gameState.pacman.moveSpeed = 1.0; });
    }
}

function pacmanOnTileCentered(_x: number, _y: number): void {}

function ghostOnTileChanged(_x: number, _y: number): void {}

function ghostOnTileCentered(_x: number, _y: number): void {
    console.log('turn!');
    AI.ghostTileCenter(gameState.blinky);
}

function initializeLevel(): void {
    Levels.levelSetup  = Levels.level1;
    Levels.levelDynamic = Levels.level1.map(row => [...row]);

    gameState.pacman = new GameObject('yellow',   13.5, 26, 0.667, Move.pacman, Draw.pacman, pacmanOnTileChanged, pacmanOnTileCentered);
    gameState.blinky = new GameObject('red',      13.5, 14, 0.667, Move.blinky, Draw.ghost,  ghostOnTileChanged,  ghostOnTileCentered);
    gameState.inky   = new GameObject('cyan',     12,   17, 0.667, Move.inky,   Draw.ghost,  ghostOnTileChanged,  ghostOnTileCentered);
    gameState.pinky  = new GameObject('hotpink',  13.5, 17, 0.667, Move.pinky,  Draw.ghost,  ghostOnTileChanged,  ghostOnTileCentered);
    gameState.sue    = new GameObject('orange',   15,   17, 0.667, Move.sue,    Draw.ghost,  ghostOnTileChanged,  ghostOnTileCentered);

    gameState.gameObjects = [gameState.pacman, gameState.blinky, gameState.inky, gameState.pinky, gameState.sue];
    gameState.ghosts      = [gameState.blinky, gameState.inky, gameState.pinky, gameState.sue];
}

function update(): void {
    Time.update();
    Input.update();
    Draw.level();

    for (const go of gameState.gameObjects) {
        go.update();
    }

    window.requestAnimationFrame(update);
}

function start(): void {
    console.log('start');
    Time.setup();
    initializeLevel();
    update();
}

function setupTouchControls(): void {
    let touchStartX = 0;
    let touchStartY = 0;
    let swipeFired = false;
    const minSwipeDistance = 40;

    function applySwipe(dx: number, dy: number): void {
        if (Math.abs(dx) > Math.abs(dy)) {
            Input.bufferedDir = dx < 0 ? 'left' : 'right';
        } else {
            Input.bufferedDir = dy < 0 ? 'up' : 'down';
        }
    }

    document.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        swipeFired = false;
    }, { passive: false });

    document.addEventListener('touchmove', (e: TouchEvent) => {
        e.preventDefault();
        if (swipeFired) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < minSwipeDistance && Math.abs(dy) < minSwipeDistance) return;
        swipeFired = true;
        applySwipe(dx, dy);
    }, { passive: false });

    document.addEventListener('touchend', (e: TouchEvent) => {
        e.preventDefault();
        if (swipeFired) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < minSwipeDistance && Math.abs(dy) < minSwipeDistance) return;
        applySwipe(dx, dy);
    }, { passive: false });
}

function resizeCanvas(): void {
    const canvas = gameState.canvas;
    const scale = Math.min(window.innerWidth / 560, window.innerHeight / 720);
    canvas.style.width  = `${560 * scale}px`;
    canvas.style.height = `${720 * scale}px`;
}

window.onload = function () {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    gameState.canvas = canvas;
    gameState.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    document.onkeydown = Input.checkKeyDown;
    document.onkeyup   = Input.checkKeyUp;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupTouchControls();

    start();
};
