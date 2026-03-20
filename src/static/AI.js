class AI {

    constructor() {

    }

    // mode, 1, 2-4, 5+
    static modePatterns = [
        ['scatter', 7, 7, 5],
        ['chase', 20, 20, 20],
        ['scatter', 7, 7, 5],
        ['chase', 20, 20, 20],
        ['scatter', 5, 5, 5],
        ['chase', 20, 1033, 1037],
        ['scatter', 5, 1 / 60, 1 / 60],
        ['chase', -1, -1, -1]
    ];

    static ghostTileCenter(obj) {
        const myX = obj.roundedX();
        const myY = obj.roundedY();
        const pX = pacman.roundedX();
        const pY = pacman.roundedY();

        const l = getDistance(myX, myY, pX, pY);
        const u = getDistance(myX, myY, pX, pY);
        const r = getDistance(myX, myY, pX, pY);
        const d = getDistance(myX, myY, pX, pY);

        // Get available movement directions
        var turns = [];

        const canMoveLeft = obj.leftObject() > 2 && obj.moveDir != 'right';
        const canMoveRight = obj.rightObject() > 2 && obj.moveDir != 'left';
        const canMoveUp = obj.topObject() > 2 && obj.moveDir != 'down';
        const canMoveDown = obj.bottomObject() > 2 && obj.moveDir != 'up';

        // Preference is up, left, down, right
        if (canMoveUp) { turns.push({ dir: 'up', x: myX, y: myY - 1 }) };
        if (canMoveLeft) { turns.push({ dir: 'left', x: myX - 1, y: myY }) };
        if (canMoveDown) { turns.push({ dir: 'down', x: myX, y: myY + 1 }) };
        if (canMoveRight) { turns.push({ dir: 'right', x: myX + 1, y: myY }) };

        // If no available turns, do nothing
        if (turns.length === 0)
            return;

        // Of available options pick best direction
        var bestDir = '';
        var bestDist = 999999;
        turns.forEach(turn => {
            const dist = getDistance(turn.x, turn.y, pX, pY);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = turn.dir;
            }
        });

        if (bestDir === '') {
            bestDir = turns[0].dir;
        }

        obj.moveDir = bestDir;

        console.log(obj.moveDir);
    }
}