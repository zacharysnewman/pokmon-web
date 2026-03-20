class GameObject {

    constructor(color, x, y, scale, moveFunction, drawFunction, onTileChangedFunction, onTileCenteredFunction) {
        this.color = color;
        this.x = x * unit + (unit / 2);
        this.y = y * unit + (unit / 2);
        this.scale = scale;
        this.drawFunction = drawFunction;
        this.moveFunction = moveFunction;
        this.onTileChangedFunction = onTileChangedFunction;
        this.onTileCenteredFunction = onTileCenteredFunction;

        this.lastTileX = this.roundedX();
        this.lastTileY = this.roundedY();
        this.lastPosX = this.gridX();
        this.lastPosY = this.gridY();
        this.checkingForCenter = false;

        this.moveSpeed = 1.0;
        this.moveDir = 'left';
    }

    update() {
        this.checkTileUpdates();
        this.move();
        this.draw();
    }

    move() {
        this.moveFunction();
    }

    draw() {
        this.drawFunction(this.color, this.x, this.y, this.scale);
    }

    checkTileUpdates() {
        // Check if the tile has changed since the last frame
        if (this.lastTileX != this.roundedX() || this.lastTileY != this.roundedY()) {
            this.checkingForCenter = true;
            this.onTileChanged();
        }

        var distX = Math.abs(this.roundedX() - this.gridX());
        var distY = Math.abs(this.roundedY() - this.gridY());

        if (this.checkingForCenter && distX < 0.1 && distY < 0.1) {
            this.checkingForCenter = false;
            this.onTileCentered();
        }

        // Update previous values
        this.lastTileX = this.roundedX();
        this.lastTileY = this.roundedY();
        this.lastPosX = this.gridX();
        this.lastPosY = this.gridY();
    }

    // Event called when current tile is changed
    onTileChanged() {
        this.onTileChangedFunction(this.roundedX(), this.roundedY());
    }

    // Event called when current tile is centered
    onTileCentered() {
        this.onTileCenteredFunction(this.roundedX(), this.roundedY());
    }

    // Nearby Objects

    leftObject() {
        return Levels.levelSetup[this.roundedY()][this.roundedX() - 1];
    }

    rightObject() {
        return Levels.levelSetup[this.roundedY()][this.roundedX() + 1];
    }

    topObject() {
        var row = Levels.levelSetup[this.roundedY() - 1];
        return row !== undefined ? row[this.roundedX()] : undefined;
    }

    bottomObject() {
        var row = Levels.levelSetup[this.roundedY() + 1];
        return row !== undefined ? row[this.roundedX()] : undefined;
    }

    // Values

    // returns a tile position integer
    roundedX() {
        return Math.round(this.gridX());
    }

    roundedY() {
        return Math.round(this.gridY());
    }

    // returns a normalized position on the grid
    gridX() {
        return this.x / unit - 0.5;
    }

    gridY() {
        return this.y / unit - 0.5;
    }

    roundedAbsoluteX() {
        return this.roundedX() * unit + (unit / 2);
    }

    roundedAbsoluteY() {
        return this.roundedY() * unit + unit / 2;
    }
}