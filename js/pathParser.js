//https://code.google.com/p/canvg/source/browse/trunk/canvg.js

// path element
function Path(d) {
    var Point = function(x, y) {
        this.x = x;
        this.y = y;
    };

    Point.prototype.angleTo = function(p) {
        return Math.atan2(p.y - this.y, p.x - this.x);
    };

    Point.prototype.applyTransform = function(v) {
        var xp = this.x * v[0] + this.y * v[2] + v[4];
        var yp = this.x * v[1] + this.y * v[3] + v[5];
        this.x = xp;
        this.y = yp;
    };

    // trim
    function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

    // compress spaces
    function compressSpaces(s) { return s.replace(/[\s\r\t\n]+/gm,' '); }

    d = d.replace(/,/gm,' '); // get rid of all commas
    d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([MmZzLlHhVvCcSsQqTtAa])/gm,'$1 $2'); // separate commands from commands
    d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([MmZzLlHhVvCcSsQqTtAa])/gm,'$1 $2'); // separate commands from commands
    d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([^\s])/gm,'$1 $2'); // separate commands from points
    d = d.replace(/([^\s])([MmZzLlHhVvCcSsQqTtAa])/gm,'$1 $2'); // separate commands from points
    d = d.replace(/([0-9])([+\-])/gm,'$1 $2'); // separate digits when no comma
    d = d.replace(/(\.[0-9]*)(\.)/gm,'$1 $2'); // separate digits when no comma
    d = d.replace(/([Aa](\s+[0-9]+){3})\s+([01])\s*([01])/gm,'$1 $3 $4 '); // shorthand elliptical arc path syntax
    d = compressSpaces(d); // compress multiple spaces
    d = trim(d);

    var PathParser = new (function(d) {
        this.tokens = d.split(' ');

        this.reset = function() {
            this.i = -1;
            this.command = '';
            this.previousCommand = '';
            this.start = new Point(0, 0);
            this.control = new Point(0, 0);
            this.current = new Point(0, 0);
            this.points = [];
            this.angles = [];
        };

        this.isEnd = function() {
            return this.i >= this.tokens.length - 1;
        };

        this.isCommandOrEnd = function() {
            if (this.isEnd()) return true;
            return this.tokens[this.i + 1].match(/^[A-Za-z]$/) != null;
        };

        this.isRelativeCommand = function() {
            switch(this.command)
            {
                case 'm':
                case 'l':
                case 'h':
                case 'v':
                case 'c':
                case 's':
                case 'q':
                case 't':
                case 'a':
                case 'z':
                    return true;
                    break;
            }
            return false;
        };

        this.getToken = function() {
            this.i++;
            return this.tokens[this.i];
        };

        this.getScalar = function() {
            return parseFloat(this.getToken());
        };

        this.nextCommand = function() {
            this.previousCommand = this.command;
            this.command = this.getToken();
        };

        this.getPoint = function() {
            var p = new Point(this.getScalar(), this.getScalar());
            return this.makeAbsolute(p);
        };

        this.getAsControlPoint = function() {
            var p = this.getPoint();
            this.control = p;
            return p;
        };

        this.getAsCurrentPoint = function() {
            var p = this.getPoint();
            this.current = p;
            return p;
        };

        this.getReflectedControlPoint = function() {
            if (this.previousCommand.toLowerCase() != 'c' &&
                this.previousCommand.toLowerCase() != 's' &&
                this.previousCommand.toLowerCase() != 'q' &&
                this.previousCommand.toLowerCase() != 't' ){
                return this.current;
            }

            // reflect point
            return new Point(2 * this.current.x - this.control.x, 2 * this.current.y - this.control.y);
        };

        this.makeAbsolute = function(p) {
            if (this.isRelativeCommand()) {
                p.x += this.current.x;
                p.y += this.current.y;
            }
            return p;
        };

        this.addMarker = function(p, from, priorTo) {
            // if the last angle isn't filled in because we didn't have this point yet ...
            if (priorTo != null && this.angles.length > 0 && this.angles[this.angles.length-1] == null) {
                this.angles[this.angles.length-1] = this.points[this.points.length-1].angleTo(priorTo);
            }
            this.addMarkerAngle(p, from == null ? null : from.angleTo(p));
        };

        this.addMarkerAngle = function(p, a) {
            this.points.push(p);
            this.angles.push(a);
        };

        this.getMarkerPoints = function() { return this.points; };
        this.getMarkerAngles = function() {
            for (var i=0; i<this.angles.length; i++) {
                if (this.angles[i] == null) {
                    for (var j=i+1; j<this.angles.length; j++) {
                        if (this.angles[j] != null) {
                            this.angles[i] = this.angles[j];
                            break;
                        }
                    }
                }
            }
            return this.angles;
        };
    })(d);

    var draw = function(ctx, notBeginPath) {
        var p, newP, curr, p1, cntrl, cp;
        var pp = PathParser;
        pp.reset();

        !notBeginPath && ctx.beginPath();
        while (!pp.isEnd()) {
            pp.nextCommand();
            switch (pp.command) {
                case 'M':
                case 'm':
                    p = pp.getAsCurrentPoint();
                    pp.addMarker(p);
                    ctx.moveTo(p.x, p.y);
                    pp.start = pp.current;
                    while (!pp.isCommandOrEnd()) {
                        p = pp.getAsCurrentPoint();
                        pp.addMarker(p, pp.start);
                        ctx.lineTo(p.x, p.y);
                    }
                    break;
                case 'L':
                case 'l':
                    while (!pp.isCommandOrEnd()) {
                        var c = pp.current;
                        p = pp.getAsCurrentPoint();
                        pp.addMarker(p, c);
                        ctx.lineTo(p.x, p.y);
                    }
                    break;
                case 'H':
                case 'h':
                    while (!pp.isCommandOrEnd()) {
                        newP = new Point((pp.isRelativeCommand() ? pp.current.x : 0) + pp.getScalar(), pp.current.y);
                        pp.addMarker(newP, pp.current);
                        pp.current = newP;
                        ctx.lineTo(pp.current.x, pp.current.y);
                    }
                    break;
                case 'V':
                case 'v':
                    while (!pp.isCommandOrEnd()) {
                        newP = new Point(pp.current.x, (pp.isRelativeCommand() ? pp.current.y : 0) + pp.getScalar());
                        pp.addMarker(newP, pp.current);
                        pp.current = newP;
                        ctx.lineTo(pp.current.x, pp.current.y);
                    }
                    break;
                case 'C':
                case 'c':
                    while (!pp.isCommandOrEnd()) {
                        curr = pp.current;
                        p1 = pp.getPoint();
                        cntrl = pp.getAsControlPoint();
                        cp = pp.getAsCurrentPoint();
                        pp.addMarker(cp, cntrl, p1);
                        ctx.bezierCurveTo(p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
                    }
                    break;
                case 'S':
                case 's':
                    while (!pp.isCommandOrEnd()) {
                        curr = pp.current;
                        p1 = pp.getReflectedControlPoint();
                        cntrl = pp.getAsControlPoint();
                        cp = pp.getAsCurrentPoint();
                        pp.addMarker(cp, cntrl, p1);
                        ctx.bezierCurveTo(p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
                    }
                    break;
                case 'Q':
                case 'q':
                    while (!pp.isCommandOrEnd()) {
                        curr = pp.current;
                        cntrl = pp.getAsControlPoint();
                        cp = pp.getAsCurrentPoint();
                        pp.addMarker(cp, cntrl, cntrl);
                        ctx.quadraticCurveTo(cntrl.x, cntrl.y, cp.x, cp.y);
                    }
                    break;
                case 'T':
                case 't':
                    while (!pp.isCommandOrEnd()) {
                        curr = pp.current;
                        cntrl = pp.getReflectedControlPoint();
                        pp.control = cntrl;
                        cp = pp.getAsCurrentPoint();
                        pp.addMarker(cp, cntrl, cntrl);
                        ctx.quadraticCurveTo(cntrl.x, cntrl.y, cp.x, cp.y);
                    }
                    break;
                case 'A':
                case 'a':
                    while (!pp.isCommandOrEnd()) {
                        curr = pp.current;
                        var rx = pp.getScalar();
                        var ry = pp.getScalar();
                        var xAxisRotation = pp.getScalar() * (Math.PI / 180.0);
                        var largeArcFlag = pp.getScalar();
                        var sweepFlag = pp.getScalar();
                        cp = pp.getAsCurrentPoint();

                        // Conversion from endpoint to center parameterization
                        // http://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
                        // x1', y1'
                        var currp = new Point(
                                Math.cos(xAxisRotation) * (curr.x - cp.x) / 2.0 + Math.sin(xAxisRotation) * (curr.y - cp.y) / 2.0,
                                -Math.sin(xAxisRotation) * (curr.x - cp.x) / 2.0 + Math.cos(xAxisRotation) * (curr.y - cp.y) / 2.0
                        );
                        // adjust radii
                        var l = Math.pow(currp.x,2)/Math.pow(rx,2)+Math.pow(currp.y,2)/Math.pow(ry,2);
                        if (l > 1) {
                            rx *= Math.sqrt(l);
                            ry *= Math.sqrt(l);
                        }
                        // cx', cy'
                        var s = (largeArcFlag == sweepFlag ? -1 : 1) * Math.sqrt(
                                ((Math.pow(rx,2)*Math.pow(ry,2))-(Math.pow(rx,2)*Math.pow(currp.y,2))-(Math.pow(ry,2)*Math.pow(currp.x,2))) /
                                (Math.pow(rx,2)*Math.pow(currp.y,2)+Math.pow(ry,2)*Math.pow(currp.x,2))
                        );
                        if (isNaN(s)) s = 0;
                        var cpp = new Point(s * rx * currp.y / ry, s * -ry * currp.x / rx);
                        // cx, cy
                        var centp = new Point(
                                (curr.x + cp.x) / 2.0 + Math.cos(xAxisRotation) * cpp.x - Math.sin(xAxisRotation) * cpp.y,
                                (curr.y + cp.y) / 2.0 + Math.sin(xAxisRotation) * cpp.x + Math.cos(xAxisRotation) * cpp.y
                        );
                        // vector magnitude
                        var m = function(v) { return Math.sqrt(Math.pow(v[0],2) + Math.pow(v[1],2)); };
                        // ratio between two vectors
                        var r = function(u, v) { return (u[0]*v[0]+u[1]*v[1]) / (m(u)*m(v)) };
                        // angle between two vectors
                        var a = function(u, v) { return (u[0]*v[1] < u[1]*v[0] ? -1 : 1) * Math.acos(r(u,v)); };
                        // initial angle
                        var a1 = a([1,0], [(currp.x-cpp.x)/rx,(currp.y-cpp.y)/ry]);
                        // angle delta
                        var u = [(currp.x-cpp.x)/rx,(currp.y-cpp.y)/ry];
                        var v = [(-currp.x-cpp.x)/rx,(-currp.y-cpp.y)/ry];
                        var ad = a(u, v);
                        if (r(u,v) <= -1) ad = Math.PI;
                        if (r(u,v) >= 1) ad = 0;

                        // for markers
                        var dir = 1 - sweepFlag ? 1.0 : -1.0;
                        var ah = a1 + dir * (ad / 2.0);
                        var halfWay = new Point(
                                centp.x + rx * Math.cos(ah),
                                centp.y + ry * Math.sin(ah)
                        );
                        pp.addMarkerAngle(halfWay, ah - dir * Math.PI / 2);
                        pp.addMarkerAngle(cp, ah - dir * Math.PI);

                        if (ctx != null) {
                            r = rx > ry ? rx : ry;
                            var sx = rx > ry ? 1 : rx / ry;
                            var sy = rx > ry ? ry / rx : 1;

                            ctx.translate(centp.x, centp.y);
                            ctx.rotate(xAxisRotation);
                            ctx.scale(sx, sy);
                            ctx.arc(0, 0, r, a1, a1 + ad, 1 - sweepFlag);
                            ctx.scale(1/sx, 1/sy);
                            ctx.rotate(-xAxisRotation);
                            ctx.translate(-centp.x, -centp.y);
                        }
                    }
                    break;
                case 'Z':
                case 'z':
                    !notBeginPath && ctx.closePath();
                    pp.current = pp.start;
            }
        }
    };


    return {
        draw : draw,
        parser : PathParser
    };
}