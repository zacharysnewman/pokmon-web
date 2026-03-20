// Draw Unit
const gridW = 28;
const gridH = 36;

const baseUnit = 20;
const unit = 20;

class Draw {
    constructor() { }

    static normalizedUnit() {
        return unit / baseUnit;
    }

    static rect(color, x, y, w, h) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    static background() {
        Draw.rect('black', 0, 0, canvas.width, canvas.height);
    }

    static walls() {
        ctx.beginPath();
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 3;

        for (var y = 0; y < gridH; y++)
            for (var x = 0; x < gridW; x++) {
                if (Levels.level1[y][x] === 0) {
                    var drawWall = Draw.getWallType(x, y);
                    drawWall(x * unit, y * unit);
                }
            }

        ctx.stroke();
    }


    //////////////////////////////
    // Pacman drawing logic
    //////////////////////////////

    static pacmanAnim = 0;

    static pacman(color, x, y, scale) {
        var frames = [0.0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1];
        var frameChangePerSecond = 30;
        var size = scale * unit;

        var dirMultiplier = 1;
        switch (pacman.moveDir) {
            case 'left':
                dirMultiplier = 1;
                break;
            case 'right':
                dirMultiplier = 0;
                break;
            case 'up':
                dirMultiplier = 1.5;
                break;
            case 'down':
                dirMultiplier = 0.5;
        }


        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, frames[Draw.pacmanAnim] * Math.PI + (Math.PI * dirMultiplier), (1.0 + frames[Draw.pacmanAnim]) * Math.PI + (Math.PI * dirMultiplier), false);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, size, (1 - frames[Draw.pacmanAnim]) * Math.PI + (Math.PI * dirMultiplier), (1 + (1 - frames[Draw.pacmanAnim])) * Math.PI + (Math.PI * dirMultiplier), false);
        ctx.fill();

        var event = Time.frameCount % Math.round(60 / frameChangePerSecond); // 60 = old fps

        if (event === 0)
            Draw.pacmanAnim++;
        if (Draw.pacmanAnim >= frames.length)
            Draw.pacmanAnim = 0;
    }


    //////////////////////////////
    // Ghost drawing logic
    //////////////////////////////

    static ghost(color, x, y, scale) {
        Draw.drawGhostBody(color, x, y, scale);
        Draw.drawGhostEyes(color, x, y, scale);
    }

    static drawGhostBody(color, x, y, scale) {
        var ghostSize = scale * unit;
        var curX = x;
        var curY = y;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(curX, curY);

        // Draw head top
        ctx.arc(curX, curY, ghostSize, Math.PI, 0, false);

        // Draw right vert line
        curX += unit - ghostSize / 2;
        curY += ghostSize / 2 + ghostSize / 3;
        ctx.lineTo(curX, curY);

        // // Draw bumped bottom
        var ghostBump = ghostSize / 3;
        for (var i = 0; i < 3; i++) {
            curX -= ghostBump;
            ctx.lineTo(curX, curY);
            ctx.arc(curX, curY, ghostBump, Math.PI * 2, Math.PI, false);
            curX -= ghostBump;
        }

        ctx.lineTo(curX, curY);

        // Draw left vert line
        curY -= ghostSize / 2 + ghostSize / 3;
        ctx.lineTo(curX, curY);

        ctx.fill();
    }

    static drawGhostEyes(color, x, y, scale) {

    }


    //////////////////////////////
    // Dot drawing logic
    //////////////////////////////

    static dots() {
        for (var y = 0; y < gridH; y++)
            for (var x = 0; x < gridW; x++) {
                if (Levels.levelDynamic[y][x] === 3) {
                    Draw.dot(unit / 8, x, y);
                }

                if (Levels.levelDynamic[y][x] === 4) {
                    Draw.dot(unit / 3, x, y);
                }
            }
    }

    static dot(circle, x, y) {
        ctx.fillStyle = 'lightgoldenrodyellow';
        ctx.beginPath();
        ctx.arc(x * unit + (unit / 2), y * unit + (unit / 2), circle, 0, Math.PI * 2, true);
        ctx.fill();
    }


    //////////////////////////////
    // Wall drawing logic
    //////////////////////////////

    static getWallType(x, y) {
        // Setup left
        var left = false;
        if (x - 1 > 0)
            left = Levels.level1[y][x - 1] > 0;

        // Setup top
        var top = false;
        if (y - 1 > 0)
            top = Levels.level1[y - 1][x] > 0;

        // Setup right
        var right = false;
        if (x + 1 < gridW)
            right = Levels.level1[y][x + 1] > 0;

        // Setup bottom
        var bottom = false;
        if (y + 1 < gridH)
            bottom = Levels.level1[y + 1][x] > 0;

        // Setup Top Left
        var topLeft = false;
        if (y - 1 > 0 && x - 1 > 0)
            topLeft = Levels.level1[y - 1][x - 1] > 0;

        // Setup Top Right
        var topRight = false;
        if (y - 1 > 0 && x + 1 < gridW)
            topRight = Levels.level1[y - 1][x + 1] > 0;

        // Setup Bottom Right
        var bottomRight = false;
        if (y + 1 < gridH && x + 1 < gridW)
            bottomRight = Levels.level1[y + 1][x + 1] > 0;

        // Setup Bottom Left
        var bottomLeft = false;
        if (y + 1 < gridH && x - 1 > 0)
            bottomLeft = Levels.level1[y + 1][x - 1] > 0;

        //  left or right and not (top or bottom)
        //      vertical wall
        if ((left || right) && !(top || bottom))
            return Draw.wallVertical;

        //  top or bottom and not (left or right)
        //      horizontal wall
        if ((top || bottom) && !(left || right))
            return Draw.wallHorizontal;

        //  left and top and not (right or bottom)
        //      top-left corner
        if (left && top && !(right || bottom))
            return Draw.wallTLC;

        //  top and right and not (bottom or left)
        //      top-right corner
        if (top && right && !(bottom || left))
            return Draw.wallTRC;

        //  right and bottom and not (left or top) 
        //      bottom-right corner
        if (right && bottom && !(left || top))
            return Draw.wallBRC;

        //  bottom and left and not (top or right)
        //      bottom-left corner
        if (bottom && left && !(top || right))
            return Draw.wallBLC;

        if (topLeft && !(top || right || bottom || left))
            return Draw.wallBRC;

        if (topRight && !(top || right || bottom || left))
            return Draw.wallTRC;

        if (bottomRight && !(top || right || bottom || left))
            return Draw.wallTLC;

        if (bottomLeft && !(top || right || bottom || left))
            return Draw.wallBLC;

        return Draw.nothing;
    }

    static nothing(x, y) { }

    static wallVertical(x, y) {
        var curX = x + (unit / 2);
        var curY = y;

        ctx.moveTo(curX, curY);

        curY += unit;

        ctx.lineTo(curX, curY);
    }

    static wallHorizontal(x, y) {
        var curX = x;
        var curY = y + (unit / 2);

        ctx.moveTo(curX, curY);

        curX += unit;

        ctx.lineTo(curX, curY);
    }

    static wallTLC(x, y) {
        var curX = x + unit / 2;
        var curY = y + unit;

        ctx.moveTo(curX, curY);

        var angleVal = 1;

        curX += unit / 2;

        ctx.arc(curX, curY, unit / 2, angleVal * Math.PI, (angleVal + 0.5) * Math.PI, false);
    }

    static wallTRC(x, y) {
        var curX = x;
        var curY = y + unit / 2;

        ctx.moveTo(curX, curY);

        var angleVal = 1.5;

        curY += unit / 2;

        ctx.arc(curX, curY, unit / 2, angleVal * Math.PI, (angleVal + 0.5) * Math.PI, false);
    }

    static wallBRC(x, y) {
        var curX = x + unit / 2;
        var curY = y;

        ctx.moveTo(curX, curY);

        var angleVal = 2;

        curX -= unit / 2;

        ctx.arc(curX, curY, unit / 2, angleVal * Math.PI, (angleVal + 0.5) * Math.PI, false);
    }

    static wallBLC(x, y) {
        var curX = x + unit;
        var curY = y + unit / 2;

        ctx.moveTo(curX, curY);

        var angleVal = 2.5;

        curY -= unit / 2;

        ctx.arc(curX, curY, unit / 2, angleVal * Math.PI, (angleVal + 0.5) * Math.PI, false);
    }

    static cageGate() {
        var x = 11 * unit;
        var y = 16.5 * unit;

        ctx.beginPath();
        ctx.strokeStyle = 'lightpink';
        ctx.moveTo(x + 1 * unit + unit / 2, y - unit / 2);
        ctx.lineTo(x + 4 * unit + unit / 2, y - unit / 2);
        ctx.stroke();
    }

    static level() {
        Draw.background();

        Draw.walls();

        Draw.cageGate();

        Draw.dots();
    }
}



// function debugDrawLevel() {
//     for (var y = 0; y < gridH; y++)
//         for (var x = 0; x < gridW; x++) {
//             var c = '';
//             var s = 15

//             var unit = 20;
//             var unit = 20;

//             switch (Levels.level1[y][x]) {
//                 case 0:
//                     c = 'blue';
//                     s = 15;
//                     break;
//                 case 1:
//                     c = 'gray';
//                     s = 3;
//                     break;
//                 case 2:
//                     c = 'white';
//                     s = 5;
//                     break;
//                 case 3:
//                     c = 'black';
//                     break;
//                 case 4:
//                     c = 'yellow';
//                     s = 10
//                     break;
//             }
//             ctx.beginPath();
//             ctx.strokeStyle = c;
//             // ctx.fillStyle = c;
//             ctx.rect(x * unit + (unit - s) / 2, y * unit + (unit - s) / 2, s, s);
//             // ctx.fillRect(x * 20, y * 20, 20, 20);
//             ctx.stroke();
//         }
// }